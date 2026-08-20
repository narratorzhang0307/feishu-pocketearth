// 心情回望 · 纯逻辑层（读 geoStickers，零副作用、单次 O(n)）。
// 把「记一笔·心情贴」从一次性贴纸做成会累积、会回望、并联动长期记忆的东西。
// 解耦：只 import geoStickers、绝不碰 MyMapTab / ProfileDomain（心情是独立通道，不走 recordSignals）。
// UI（MoodReview 回望视图，挂在 JOT「心情」页）与记忆注入（memoryRouter.assembleMemory）都调这里的纯函数。
import { getMoodStickers, MOOD_TONES, type MoodSticker, type MoodTone } from '../../data/geoStickers';

// 私有：取「有 tone 的真心情贴」（跳过白色 LOC_SYNC 种子卡 variant:'card'），按 createdAt 倒序。
function moodOf(stickers: MoodSticker[] = getMoodStickers()): MoodSticker[] {
  return stickers
    .filter((s) => s.tone && MOOD_TONES[s.tone])
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

// —— 本地零点 / 本周一零点（绝对 ms，周一为周起点）——
function startOfTodayMs(): number { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function mondayStartMs(): number { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - ((d.getDay() + 6) % 7) * 86400000; }

// 本地日历日键 YYYY-MM-DD（统一日期口径：分组/天数/贴纸显示都用它，避免 UTC 切片与本地分组打架）。
// createdAt 是 UTC ISO；用本地日期才符合用户直觉「今天/昨天」。解析失败回退原 UTC 切片，不抛错。
export function dayKey(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return (createdAt || '').slice(0, 10) || '未知';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface TimelineGroup {
  key: 'today' | 'week' | string;   // 'today' | 'week' | 'YYYY-MM-DD'（更早每日一组）
  label: string;                    // 「今天」「本周」「2025-12-31」（跨年也用全 YYYY-MM-DD，零歧义）
  stickers: MoodSticker[];          // 组内倒序
}

/** 心情贴按时间线分组：今天 → 本周 → 更早（每日一组，按日期倒序）。空组不输出。 */
export function groupMoodsByTimeline(stickers?: MoodSticker[]): TimelineGroup[] {
  const m = moodOf(stickers);
  const todayMs = startOfTodayMs();
  const weekMs = mondayStartMs();
  const today: MoodSticker[] = [];
  const week: MoodSticker[] = [];
  const earlier = new Map<string, MoodSticker[]>();   // YYYY-MM-DD → stickers
  for (const s of m) {
    const t = Date.parse(s.createdAt);
    if (!Number.isNaN(t) && t >= todayMs) today.push(s);
    else if (!Number.isNaN(t) && t >= weekMs) week.push(s);
    else { const key = dayKey(s.createdAt); const arr = earlier.get(key) || []; arr.push(s); earlier.set(key, arr); }
  }
  const groups: TimelineGroup[] = [];
  if (today.length) groups.push({ key: 'today', label: '今天', stickers: today });
  if (week.length) groups.push({ key: 'week', label: '本周', stickers: week });
  [...earlier.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)).forEach((k) => groups.push({ key: k, label: k, stickers: earlier.get(k)! }));
  return groups;
}

export interface ToneBar { tone: MoodTone; label: string; color: string; count: number }

/** 六种情绪的计数分布，固定按 MOOD_TONES 键序返回（同时解决 UI 渲染顺序 + 并列计数排序歧义）。 */
export function toneDistribution(stickers?: MoodSticker[]): ToneBar[] {
  const m = moodOf(stickers);
  const keys = Object.keys(MOOD_TONES) as MoodTone[];
  const counts = {} as Record<MoodTone, number>;
  keys.forEach((t) => (counts[t] = 0));
  for (const s of m) if (s.tone) counts[s.tone] = (counts[s.tone] || 0) + 1;
  return keys.map((t) => ({ tone: t, label: MOOD_TONES[t].label, color: MOOD_TONES[t].color, count: counts[t] }));
}

export interface MoodSummary { count: number; cities: number; days: number; domTone?: MoodTone }

/** 回望概览：总条数 / 落点城市数 / 不同日历天数 / 主导情绪（全 0 时 undefined）。 */
export function moodSummary(stickers?: MoodSticker[]): MoodSummary {
  const m = moodOf(stickers);
  const cities = new Set(m.filter((s) => s.place && s.place !== '此处' && !s.place.includes('随机落点')).map((s) => s.place)).size;   // 与 getMoodTrace 同口径：排除「此处/随机落点」脏地名，免落点城市数虚高
  const days = new Set(m.map((s) => dayKey(s.createdAt))).size;   // 不同本地日历天数，比首尾差更诚实
  let domTone: MoodTone | undefined; let max = 0;
  for (const b of toneDistribution(stickers)) if (b.count > max) { max = b.count; domTone = b.tone; }
  return { count: m.length, cities, days, domTone };
}

/** 一句话「情绪足迹」，供 memoryRouter.assembleMemory 注入（独立 mood 通道，不走 ProfileDomain）。
 *  记忆即空气：只陈述事实、不复述统计过程；样本太少静默；排除「此处 / 随机落点」脏地名，避免污染记忆。 */
export function getMoodTrace(opts?: { minSamples?: number; topPlaces?: number }, stickers?: MoodSticker[]): string {
  const minSamples = opts?.minSamples ?? 3;
  const topN = opts?.topPlaces ?? 3;
  const m = moodOf(stickers);
  if (m.length < minSamples) return '';
  const sum = moodSummary(m);
  if (!sum.domTone) return '';
  const placeCount = new Map<string, number>();
  for (const s of m) {
    const p = s.place || '';
    if (!p || p === '此处' || p.includes('随机落点')) continue;   // 兜底/随机落点不进记忆
    placeCount.set(p, (placeCount.get(p) || 0) + 1);
  }
  const places = [...placeCount.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const toneLabel = MOOD_TONES[sum.domTone].label;
  // 全是「此处 / 随机落点」脏地名时 places 为空：不造「散落各处」假地点污染记忆，只保留有效的情绪基调。
  let line = places.length ? `近期心情多落在${places[0]}·底色偏${toneLabel}` : `近期心情底色偏${toneLabel}`;
  const others = places.slice(1, topN);
  if (places.length >= 2 && others.length) line += `，也在${others.join('、')}留过心情`;   // >=2 即可：恰好 2 个有效地点时也带上第二处，否则静默丢失
  return `# 你的情绪足迹\n${line}`;
  // TODO（远景）：贴量上千时给 getMoodTrace/分布加 fingerprint 缓存；现单次 O(n) 足够。
}
