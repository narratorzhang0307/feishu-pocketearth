// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· 反思层护栏 —— 通用草稿校正 + 用户历史纠错 + 命中本地索引
// ────────────────────────────────────────────────────────────────────────────
// movie/critic.ts 与 book/critic.ts 此前是镜像（mergeKnown 字节级相同、applyUserFix 只差 geo.kind、
// applyCritic 内核相同）。这里把"挑错强于一次判对"的确定性护栏收口成领域无关的几个函数；
// 各 agent 只补自己那一两条领域护栏（电影钳豆瓣分/演员，书钳作者长度）。
//
// 用结构化接口（MovieDraft/BookDraft 都结构兼容），不引入对各 agent types 的依赖（避免反向耦合）。
// ════════════════════════════════════════════════════════════════════════════
import type { Corrections } from './keyedStore';

export interface CriticGeo { kind: string; place: string; lng: number; lat: number; confidence: number }
/** 各 agent 的 Draft 的共有形状（结构兼容即可传入）。 */
export interface CriticDraftLike {
  id: string;
  year: number | null;
  country: string;
  geo: CriticGeo | null;
  needPlace: boolean;
  reason: string;
  source: string;
  tags: { userRating: number; plot?: string };
}
/** 本地索引里已存的条目的共有形状。 */
export interface KnownLike {
  tags: { userRating?: number };
  geo: CriticGeo | null;
  year: number | null;
  country: string;
  enriched: boolean;
}

/** 通用护栏：评分钳 0-5、坐标合法性、简介截断、刷新 needPlace。领域专属护栏由 caller 自己补。 */
export function clampDraft(d: CriticDraftLike, opts?: { plotMax?: number }): void {
  d.tags.userRating = Math.max(0, Math.min(5, Math.round(Number(d.tags.userRating) || 0)));
  if (d.geo && (Math.abs(d.geo.lat) > 90 || Math.abs(d.geo.lng) > 180)) { d.geo = null; d.reason += '；Critic：坐标非法→丢弃'; }
  d.needPlace = !d.geo;
  const plotMax = opts?.plotMax ?? 60;
  if (d.tags.plot && d.tags.plot.length > plotMax) d.tags.plot = d.tags.plot.slice(0, plotMax);
}

/** 年份合理性：越界视为无效→清空（min/max 由领域给，如电影 1888、书 -800）。 */
export function clampYear(d: CriticDraftLike, min: number, max: number): void {
  if (d.year != null && (d.year < min || d.year > max)) { d.year = null; d.reason += '；Critic：年份越界→清空'; }
}

/** 应用用户历史纠错（同一对象之前被改过落点/评分→沿用）。kind=落点修正时写入的 geo.kind。 */
export function applyUserFix(d: CriticDraftLike, corr: Corrections, kind: string): void {
  const pf = corr.placeFix[d.id];
  if (pf) { d.geo = { kind, place: pf.place, lng: pf.lng, lat: pf.lat, confidence: 1 }; d.needPlace = false; d.reason += '；应用你定的落点:' + pf.place; }
  const rf = corr.ratingFix[d.id];
  if (typeof rf === 'number') { d.tags.userRating = rf; d.reason += '；应用你定的评分'; }
}

/** 命中本地索引（之前已补全/已钉）→ 沿用以省云脑、保持一致；返回 known.enriched。 */
export function mergeKnown(d: CriticDraftLike, known: KnownLike | null): boolean {
  if (!known) return false;
  d.tags = { ...known.tags, userRating: d.tags.userRating || known.tags.userRating || 0 };
  if (!d.geo && known.geo) d.geo = known.geo;
  if (d.year == null) d.year = known.year;
  if (!d.country) d.country = known.country;
  d.needPlace = !d.geo;
  d.reason += '；命中本地索引（已补全过）';
  d.source = 'mixed';
  return known.enriched;
}
