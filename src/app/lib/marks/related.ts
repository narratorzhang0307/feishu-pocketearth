// 相关记忆 · 纯逻辑打分（零模型、零网络、零下载）
// 设想：每段记忆有三套坐标——地理(lat/lng)、时间(createdAt)、语义。前两套是每条笔记天然自带的
// "免费坐标"，加上各 agent 落点时写入的结构化标签(朝代/流派/导演/作者/国别/器类/材质)，
// 已足够让"打开一条记忆 → 看到几条讲得通的相关记忆"跑起来；
// 第三套语义坐标(端侧小模型 embedding)按需增强：当用户手动关联、但下面四路信号全零分的
// "语义缺口"累积可见时，再下 ~24MB 端侧嵌入模型补上，向量只进 IndexedDB、原文不出设备。
// UI 纪律：不显示相似度数字，只给人话理由；零命中整节不渲染。
import { getUserMarks } from '../../data/userMarks';
import { getMoodStickers } from '../../data/geoStickers';
import { MAP_MARKERS, KIND_COLOR, type MarkerKind } from '../../data/mapMarkers';

export type RelatedKind = MarkerKind | 'mood';

export interface RelatedTag { k: string; v: string }

/** 当前打开的这条记忆（查询方）：字段都可选，缺哪路信号就跳过哪路 */
export interface RelatedQuery {
  selfId?: string;
  kind?: string;
  lat?: number; lng?: number;
  createdAt?: string;
  tags?: RelatedTag[];
  text?: string;          // label + 短评，做字符 bigram（中文无需分词）
}

/** 候选记忆（被检索方）——由 gatherCandidates 从三个数据层聚合，或测试时直接构造 */
export interface RelatedCandidate {
  id: string; kind: RelatedKind; label: string;
  lat: number; lng: number;
  origin: 'visited' | 'seen';   // visited=你主动记的；seen=资料层(看过读过)——措辞必须区分，防虚假记忆
  createdAt?: string;
  tags?: RelatedTag[];
  text?: string;
  color?: string;
}

export interface RelatedItem extends RelatedCandidate {
  color: string;
  score: number;
  km?: number;
  reasons: string[];      // 人话理由（「同城」「都是宋」「同一周记的」…），不出现百分比
}

// —— 基础工具 ——

// 粗略球面距离（km）；经度差先归一化，跨国际日期线不误判（与 nearby.ts 同源）
export function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  let dLngDeg = lng1 - lng2;
  if (dLngDeg > 180) dLngDeg -= 360; else if (dLngDeg < -180) dLngDeg += 360;
  const dLat = (lat1 - lat2) * 111;
  const dLng = dLngDeg * 111 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// 字符 2-gram 集合：去空白与标点后取相邻双字。中文不需要分词器——「博物馆」→「博物/物馆」天然重叠匹配
function bigrams(s: string): Set<string> {
  const t = (s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  const out = new Set<string>();
  if (t.length < 2) { for (const ch of t) out.add(ch); return out; }
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** Dice 系数（0~1）：2·|A∩B| / (|A|+|B|)。只作辅助信号，权重低于结构化字段 */
export function diceSim(a?: string, b?: string): number {
  const A = bigrams(a || ''), B = bigrams(b || '');
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return (2 * hit) / (A.size + B.size);
}

const DAY = 24 * 3600 * 1000;
const fmtKm = (d: number) => (d < 10 ? d.toFixed(1) : String(Math.round(d)));
// 标签理由的措辞：人名类「同为」、地域类「都在」、其余「都是」
const tagReason = (t: RelatedTag) =>
  (t.k === '导演' || t.k === '作者' || t.k === '歌手') ? `同为${t.v}`
    : t.k === '国别' ? `都在${t.v}`
    : `都是「${t.v}」`;

/** 单候选打分：四路信号(地理/时间/标签/文字) + 跨域微加分(意外关联) − 资料层微降权 */
export function scoreCandidate(q: RelatedQuery, c: RelatedCandidate): { score: number; reasons: string[]; km?: number } {
  let score = 0;
  const reasons: string[] = [];
  let km: number | undefined;

  // 1) 地理：同处 > 同城 > 同区域
  if (Number.isFinite(q.lat) && Number.isFinite(q.lng) && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
    km = distKm(q.lat!, q.lng!, c.lat, c.lng);
    if (km <= 1.5) { score += 3; reasons.push('就在同一处'); }
    else if (km <= 80) { score += 2; reasons.push(`同城 · 相距${fmtKm(km)}km`); }
    else if (km <= 300) { score += 1; reasons.push('同一片区域'); }
  }
  // 2) 时间：同周 > 同月（都取"记下"的时刻）
  if (q.createdAt && c.createdAt) {
    const dt = Math.abs(Date.parse(q.createdAt) - Date.parse(c.createdAt));
    if (Number.isFinite(dt)) {
      if (dt <= 7 * DAY) { score += 2; reasons.push('同一周记的'); }
      else if (dt <= 31 * DAY) { score += 1; reasons.push('同一个月记的'); }
    }
  }
  // 3) 结构化标签共现：每个共同标签 +2，最多计 2 个（朝代/流派/导演/器类…是本产品最强的信号）
  if (q.tags?.length && c.tags?.length) {
    const mine = new Set(q.tags.map((t) => t.k + '' + t.v));
    let hits = 0;
    for (const t of c.tags) {
      if (hits >= 2) break;
      if (t.v && mine.has(t.k + '' + t.v)) { score += 2; reasons.push(tagReason(t)); hits++; }
    }
  }
  // 4) 文字相近（bigram Dice）：辅助信号
  const dice = diceSim(q.text, c.text);
  if (dice >= 0.25) { score += 2; reasons.push('文字相近'); }
  else if (dice >= 0.12) { score += 1; reasons.push('文字相近'); }

  // 意外关联倾向：已经相关(≥2)且跨域的，比同域再多半分——书↔展↔影的回声比同类更有意思
  if (q.kind && c.kind !== q.kind && score >= 2) score += 0.5;
  // 资料层(看过读过)相对你主动记的略降权
  if (c.origin === 'seen') score -= 0.5;

  return { score, reasons, km };
}

/** 纯函数排序：打分 → 阈值过滤 → 去重 → 每类限量 → 截断。测试直接喂 candidates，不碰存储 */
export function rankRelated(q: RelatedQuery, candidates: RelatedCandidate[], opts?: { limit?: number; perKind?: number; minScore?: number }): RelatedItem[] {
  const limit = opts?.limit ?? 4;
  const perKindCap = opts?.perKind ?? 2;
  const minScore = opts?.minScore ?? 2;
  const scored: RelatedItem[] = [];
  for (const c of candidates) {
    if (!c.label || (q.selfId && c.id === q.selfId)) continue;
    const { score, reasons, km } = scoreCandidate(q, c);
    if (score < minScore || !reasons.length) continue;
    scored.push({ ...c, color: c.color || KIND_COLOR[c.kind as MarkerKind] || '#888', score, km, reasons });
  }
  scored.sort((a, b) => b.score - a.score || (a.km ?? 1e9) - (b.km ?? 1e9));
  const seen = new Set<string>();
  const perKind: Record<string, number> = {};
  const out: RelatedItem[] = [];
  for (const x of scored) {
    const key = x.kind + '|' + x.label;
    if (seen.has(key)) continue;
    seen.add(key);
    perKind[x.kind] = (perKind[x.kind] || 0) + 1;
    if (perKind[x.kind] > perKindCap) continue;
    out.push(x);
    if (out.length >= limit) break;
  }
  return out;
}

// —— 数据聚合（读三个已有数据层；与 nearby.ts 同样只读、不碰热区）——

const META_TAG_KEYS: [string, string][] = [
  ['director', '导演'], ['author', '作者'], ['genre', '类型'], ['movement', '流派'],
  ['country', '国别'], ['culture', '文明'], ['category', '器类'], ['dynastyLabel', '朝代'], ['tag', '标签'],
];

/** 从 userMark.meta 抽结构化标签（各 agent pin 时写入的字段） */
export function metaTags(meta: Record<string, unknown> | undefined): RelatedTag[] {
  if (!meta) return [];
  const out: RelatedTag[] = [];
  for (const [key, k] of META_TAG_KEYS) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) out.push({ k, v: v.trim() });
  }
  if (Array.isArray(meta.material)) for (const m of meta.material) {
    if (typeof m === 'string' && m.trim()) out.push({ k: '材质', v: m.trim() });
  }
  return out;
}

function gatherCandidates(): RelatedCandidate[] {
  const out: RelatedCandidate[] = [];
  // 1. 各 agent 运行时落点（你主动记的 → visited）：标签最全，是关联的主力
  for (const m of getUserMarks()) {
    if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
    const meta = (m.meta || {}) as Record<string, unknown>;
    const extra = [meta.note, meta.synopsis, meta.labelZh, meta.museum, meta.place].find((s) => typeof s === 'string' && s) as string | undefined;
    out.push({
      id: m.id, kind: m.kind, label: (m.label || '').slice(0, 18) || m.kind,
      lat: m.lat, lng: m.lng, origin: 'visited', createdAt: m.createdAt,
      tags: metaTags(meta), text: [m.label || '', (extra || '').slice(0, 120)].join(' '),
    });
  }
  // 2. 心情贴（有情绪基调 + 真地名的才算）→ visited
  for (const s of getMoodStickers()) {
    if (!s.tone || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    if (s.place === '此处' || (s.place || '').includes('随机落点')) continue;
    out.push({
      id: s.id, kind: 'mood', label: (s.text || '').slice(0, 14),
      lat: s.lat, lng: s.lng, origin: 'visited', createdAt: s.createdAt,
      text: s.text, color: s.color || '#ffd23b',
    });
  }
  // 3. 静态资料层（豆瓣书影/音乐/照片城市）→ seen：只有名字和坐标，也只该按"看过/读过"措辞出现
  for (const m of MAP_MARKERS) {
    out.push({ id: m.id, kind: m.kind, label: (m.label || '').slice(0, 18) || m.kind, lat: m.lat, lng: m.lng, origin: 'seen', text: m.label || '' });
  }
  return out;
}

/** 给详情弹层用：当前记忆 → 相关记忆列表（≤4 条，零命中返回空数组、UI 整节不渲染） */
export function relatedForDetail(q: RelatedQuery): RelatedItem[] {
  try { return rankRelated(q, gatherCandidates()); } catch { return []; }
}
