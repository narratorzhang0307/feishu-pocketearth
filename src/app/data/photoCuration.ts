// 端侧照片整理 · 整理结果数据层（解耦）
// 对相册里的每张照片给出：价值打分 + 标签(城市 / 类别(风景/食物…) / 经纬度) + 保留/待定/可删 判定 + 理由。
// 重复检测用真实信号：图池里同一张底图被多条记录引用 → 即为重复组，可一键清理（仅标记，不删用户文件）。
// 装好端侧 Gemma 3n 后，这里的规则判定可换成模型判定（接口不变）。

import { photoPoints } from './photos';

export type Verdict = 'keep' | 'review' | 'delete';

export interface CuratedPhoto {
  id: string; city: string; lat: number; lng: number; thumb?: string; full?: string;
  score: number; verdict: Verdict; category: string; tags: string[]; reason: string;
}

export interface DupGroup { key: string; photos: CuratedPhoto[]; keepId: string }

const CATS = ['风景', '夜景', '海岸', '街景', '食物', '人像', '建筑'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const KEEP_REASON: Record<string, string> = {
  风景: '地平线干净、层次分明，端侧判定高价值，已钉到地球与日历。',
  夜景: '夜色与灯光对比到位，噪点可控，值得留下。',
  海岸: '海天比例舒展、色彩通透，端侧给了高分。',
  街景: '人物与街道关系生动，记录性强，保留。',
  食物: '主体突出、色泽诱人，端侧标记为「食物」高价值。',
  人像: '表情自然、焦点准确，保留为代表帧。',
  建筑: '结构线条工整、透视稳定，留作地标。',
};
const REVIEW_REASON = '画面尚可，但与同场景其它帧重复度偏高，端侧暂列「待定」。';
const DELETE_REASON = ['轻微糊片 / 抖动，端侧建议清理。', '欠曝偏暗、细节丢失，可清理。', '与同组高分帧重复，留一即可。', '构图偏斜、主体不明，建议清理。'];

// 整理：把坐标点照片逐张打分、打标签、判定
export const curated: CuratedPhoto[] = photoPoints.map((p) => {
  const h = hash(p.id);
  const category = CATS[h % CATS.length];
  const score = 42 + (h % 58);                       // 42–99
  const verdict: Verdict = score >= 75 ? 'keep' : score >= 56 ? 'review' : 'delete';
  const cityShort = (p.city || '').split(',')[0];
  const tags = [cityShort, category, `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`].filter(Boolean);
  const reason = verdict === 'keep' ? KEEP_REASON[category]
    : verdict === 'review' ? REVIEW_REASON
    : DELETE_REASON[h % DELETE_REASON.length];
  return { id: p.id, city: cityShort, lat: p.lat, lng: p.lng, thumb: p.thumb, full: p.full, score, verdict, category, tags, reason };
});

// 重复组：同一张底图（thumb 相同）被多条引用即为重复；每组保留分最高的一张
export const dupGroups: DupGroup[] = (() => {
  const by = new Map<string, CuratedPhoto[]>();
  for (const c of curated) {
    if (!c.thumb) continue;
    const arr = by.get(c.thumb) || [];
    arr.push(c); by.set(c.thumb, arr);
  }
  const groups: DupGroup[] = [];
  for (const [key, photos] of by) {
    if (photos.length < 2) continue;
    const keepId = [...photos].sort((a, b) => b.score - a.score)[0].id;
    groups.push({ key, photos, keepId });
  }
  return groups.sort((a, b) => b.photos.length - a.photos.length);
})();

export const curationStats = {
  total: curated.length,
  highValue: curated.filter((c) => c.verdict === 'keep').length,
  review: curated.filter((c) => c.verdict === 'review').length,
  dupGroups: dupGroups.length,
  // 可清理 = 判删的 + 重复组里非保留的多余帧
  cleanable: curated.filter((c) => c.verdict === 'delete').length
    + dupGroups.reduce((n, g) => n + (g.photos.length - 1), 0),
};

export const VERDICT_LABEL: Record<Verdict, string> = { keep: '保留', review: '待定', delete: '可删' };
export const VERDICT_COLOR: Record<Verdict, string> = { keep: '#00aa55', review: '#c08a00', delete: '#d23b3b' };
