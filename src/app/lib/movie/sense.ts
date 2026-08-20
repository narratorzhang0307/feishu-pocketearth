// 感知层：把三种输入归一成「候选片名 + 可选用户评分」。
// 截图认片解耦进 [visionExtract] skill（原图只进端侧 VL→脱敏→结构化）；一句话用确定性正则抽取，不耗云端。
import { visionExtract } from '../skills/visionExtract';
import { parseRating as parseRatingText, parseTitle as parseTitleText } from '../skills/parseInput';

// 从一句话抽用户评分（→ 0-5 星）。解耦进 [parseInput] skill（确定性·不费云）。
export const parseRating = (text: string): number | undefined => parseRatingText(text);

// 从一句话抽片名：《》优先；否则去评分尾巴 + 通用标记词 + 电影噪声词（解耦进 [parseInput]）。
// 保留去噪后整段，不取「最长空格段」——否则含空格的多词片名会被截断（海王2 失落的王国→失落的王国）。
export function parseTitle(text: string): string {
  return parseTitleText(text, {
    verbs: /我?(刚|今天|昨天|周末|最近)?(看完了?|看了|刷了|重温了?|二刷了?|追完了?)/g,
    nouns: /这[部张]?(电影|片子?|纪录片)?|的?这部|想看|推荐/g,
  });
}

// 截图认片：解耦进 [visionExtract]（原图只进端侧 Gemma→脱敏→按 schema 结构化）。端侧未就绪→''（手填兜底）。
export async function ocrTitle(imageDataUrl: string): Promise<string> {
  const r = await visionExtract({ imageDataUrl, domain: '电影', fields: [{ key: 'title', label: '片名', hint: '电影的中文名' }] });
  return (r.fields.title || '').replace(/《|》/g, '').slice(0, 40).trim();
}

// 统一感知入口：返回候选片名与（可选）评分
export interface Sensed { title: string; rating?: number; from: 'quote' | 'ocr' | 'manual' }
export async function sense(input: { kind: 'text' | 'image' | 'manual'; text?: string; imageDataUrl?: string; manualTitle?: string; manualRating?: number }): Promise<Sensed> {
  if (input.kind === 'image' && input.imageDataUrl) {
    return { title: await ocrTitle(input.imageDataUrl), from: 'ocr' };
  }
  if (input.kind === 'manual') {
    return { title: (input.manualTitle || '').trim(), rating: input.manualRating, from: 'manual' };
  }
  const text = input.text || '';
  return { title: parseTitle(text), rating: parseRating(text), from: 'quote' };
}
