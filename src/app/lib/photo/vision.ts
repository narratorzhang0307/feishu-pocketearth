// 感知层·精筛：浏览器内 CLIP 零样本（仅对不确定/钉候选跑）。端侧视觉原语收口到 [browserVision]
// （纯浏览器 transformers.js WASM/WebGPU，原图不出端、绝不走 edgeSafe.vision）；这里只留 photo 的标签与判定逻辑。
import { ensureZeroShotImage, classifyImage } from '../skills/browserVision';

// 两段式标签：① 实拍 ↔ 资料（纠偏 isUtility）② 实拍再判子类
const STAGE1 = [
  'a real photo taken by a camera',
  'a screenshot of a phone or computer screen',
  'a poster, illustration, comic or artwork',
  'a document, receipt, menu or text',
];
const STAGE2 = [
  'a scenery or landscape photo',
  'a city street or building photo',
  'a photo of a person or people',
  'a photo of food',
  'a photo of an animal or pet',
];
const TAG: Record<string, string> = {
  'a scenery or landscape photo': '风景', 'a city street or building photo': '街景',
  'a photo of a person or people': '人物', 'a photo of food': '美食', 'a photo of an animal or pet': '宠物',
};

// 加载端侧模型（透传状态）。screen.ts 仍按本名 import。
export const ensureVision = (onStatus?: (s: string) => void): Promise<boolean> => ensureZeroShotImage(onStatus);

export interface VisionResult { isReal: boolean; realProb: number; utilityKind?: 'screenshot' | 'document'; subTag?: string; subKind?: 'place' | 'life' }

export async function classifyVision(canvas: HTMLCanvasElement): Promise<VisionResult | null> {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  const s1 = await classifyImage(dataUrl, STAGE1);
  if (!s1) return null;   // 未加载/失败 → 交回 caller 用快速分析兜底
  const get = (l: string) => s1.find((o) => o.label === l)?.score ?? 0;
  const realProb = get('a real photo taken by a camera');
  const screenshot = get('a screenshot of a phone or computer screen') + get('a poster, illustration, comic or artwork');
  const document = get('a document, receipt, menu or text');
  const isReal = realProb > Math.max(screenshot, document);
  if (!isReal) {
    return { isReal: false, realProb, utilityKind: document > screenshot ? 'document' : 'screenshot' };
  }
  // 实拍再判子类（STAGE2 瞬时失败也别丢已确认的 isReal——只是没有子类标签）
  const s2 = await classifyImage(dataUrl, STAGE2);
  if (!s2) return { isReal: true, realProb };
  const top = s2.slice().sort((a, b) => b.score - a.score)[0];
  const subTag = top && top.score > 0.3 ? TAG[top.label] : undefined;
  const subKind: 'place' | 'life' = (top?.label === 'a scenery or landscape photo' || top?.label === 'a city street or building photo') ? 'place' : 'life';
  return { isReal: true, realProb, subTag, subKind };
}
