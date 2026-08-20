// 感知层：三种输入归一成「候选书名 + 可选评分」。书封截图只走端侧 vision（原图不出端）。
import { visionExtract } from '../skills/visionExtract';
import { parseRating as parseRatingText, parseTitle as parseTitleText } from '../skills/parseInput';

// 从一句话抽用户评分（→ 0-5 星）。解耦进 [parseInput] skill（确定性·不费云）。
export const parseRating = (text: string): number | undefined => parseRatingText(text, /满分|神作|封神|此生最爱/);

// 抽书名：《》优先；否则去评分尾巴 + 通用标记词 + 书噪声词（解耦进 [parseInput]）。
// 保留去噪后整段，不取最长段——否则含空格的多词书名被截断。
export function parseTitle(text: string): string {
  return parseTitleText(text, {
    verbs: /我?(刚|今天|昨天|最近)?(读完了?|读了|看完了?|看了|在读|刷完了?|啃完了?|读过)/g,
    nouns: /这本(书|小说)?|的?这本|想读|推荐/g,
  });
}

// 截图认书：解耦进 [visionExtract]（原图只进端侧 VL→脱敏→按 schema 结构化）。端侧未就绪→''（手填兜底）。
export async function ocrTitle(imageDataUrl: string): Promise<string> {
  const r = await visionExtract({ imageDataUrl, domain: '书', fields: [{ key: 'title', label: '书名' }] });
  return (r.fields.title || '').replace(/《|》/g, '').slice(0, 40).trim();
}

export interface Sensed { title: string; rating?: number; from: 'quote' | 'ocr' | 'manual' }
export async function sense(input: { kind: 'text' | 'image' | 'manual'; text?: string; imageDataUrl?: string; manualTitle?: string; manualRating?: number }): Promise<Sensed> {
  if (input.kind === 'image' && input.imageDataUrl) return { title: await ocrTitle(input.imageDataUrl), from: 'ocr' };
  if (input.kind === 'manual') return { title: (input.manualTitle || '').trim(), rating: input.manualRating, from: 'manual' };
  const text = input.text || '';
  return { title: parseTitle(text), rating: parseRating(text), from: 'quote' };
}
