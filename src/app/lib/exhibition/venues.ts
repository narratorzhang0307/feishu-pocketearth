// 看展域 · 场馆层（「地球博物馆」的数据底座）
// 统一视图 = 内建种子（catalog.MUSEUM_SEEDS，全球 60+ 家）+ 用户自定义场馆。
// 自定义场馆直接活在 userMarks 总线上（kind:'museum'，id 前缀 'umu-'）：localStorage 持久化、
// 发布订阅、地球实时渲染三件套免费获得，不另开 IndexedDB 表；本模块只提供领域视角的读写与匹配。
// 博物馆/美术馆不拆两个图层（普通用户不该被逼着先分类）——type 只是信息卡上的一枚徽章。

import { MUSEUM_SEEDS, matchMuseum, type MuseumSeed, type VenueType } from './catalog';
import { markPlace, unmarkPlace } from '../skills/markPlace';
import { getUserMarksByKind, subscribeUserMarks, type UserMark } from '../../data/userMarks';

export const VENUE_PREFIX = 'umu-';

export interface Venue {
  id: string;                 // 内建=种子 id；自定义='c' + hash
  name: string;
  aliases: string[];
  city: string;
  country: string;
  type: VenueType;
  lng: number;
  lat: number;
  blurb?: string;
  url?: string;
  custom?: boolean;           // 用户自建场馆
}

export const VENUE_TYPE_LABEL: Record<VenueType, string> = { museum: '博物馆', gallery: '美术馆' };

function fromSeed(s: MuseumSeed): Venue {
  return { id: s.id, name: s.name, aliases: s.aliases, city: s.city, country: s.country, type: s.type, lng: s.lng, lat: s.lat, blurb: s.blurb, url: s.url };
}

function fromMark(m: UserMark): Venue | null {
  if (!m.id.startsWith(VENUE_PREFIX)) return null;
  const meta = (m.meta || {}) as Record<string, unknown>;
  const type: VenueType = meta.type === 'gallery' ? 'gallery' : 'museum';
  return {
    id: m.id.slice(VENUE_PREFIX.length),
    name: (meta.name as string) || m.label || '未命名场馆',
    aliases: Array.isArray(meta.aliases) ? (meta.aliases as string[]) : [],
    city: (meta.city as string) || '',
    country: (meta.country as string) || '',
    type,
    lng: m.lng, lat: m.lat,
    blurb: (meta.blurb as string) || undefined,
    custom: true,
  };
}

export function builtinVenues(): Venue[] { return MUSEUM_SEEDS.map(fromSeed); }

export function customVenues(): Venue[] {
  return getUserMarksByKind('museum').map(fromMark).filter((v): v is Venue => !!v);
}

/** 内建 + 自定义合并视图（自定义在前：用户自己加的馆优先出现在选择列表顶部）。 */
export function allVenues(): Venue[] { return [...customVenues(), ...builtinVenues()]; }

export function venueById(id: string): Venue | null {
  return allVenues().find((v) => v.id === id) || null;
}

/** 场馆名（含别名/模糊）→ 场馆。内建沿用 matchMuseum 语义（英文别名词边界、长名优先、CJK 子串），
 *  未命中再查用户自定义场馆（名称/别名子串，双向、≥2 字防泛匹配）。 */
export function matchVenue(name: string): Venue | null {
  const seed = matchMuseum(name);
  if (seed) return fromSeed(seed);
  const q = (name || '').replace(/\s/g, '');
  if (q.length < 2) return null;
  for (const v of customVenues()) {
    const names = [v.name, ...v.aliases].filter(Boolean);
    for (const n of names) {
      const t = n.replace(/\s/g, '');
      if (t.length < 2) continue;
      if (q.includes(t) || t.includes(q)) return v;
    }
  }
  return null;
}

/** 大圆距离（km）。 */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** GPS → 最近场馆（批量照片按拍摄坐标归馆用）。maxKm 默认 2km：城市里两馆间距通常 >2km，
 *  展馆本体+庭院半径通常 <1km，2km 足够宽容 iPhone 的定位漂移又不至于跨馆误归。 */
export function nearestVenue(lat: number, lng: number, maxKm = 2): { venue: Venue; km: number } | null {
  let best: { venue: Venue; km: number } | null = null;
  for (const v of allVenues()) {
    const km = distanceKm(lat, lng, v.lat, v.lng);
    if (km <= maxKm && (!best || km < best.km)) best = { venue: v, km };
  }
  return best;
}

/** 新增自定义场馆：确定性 id（同名同坐标幂等），经 markPlace 钉上地球（amp=0 不抖散——场馆是真实地点）。 */
export function addCustomVenue(input: { name: string; city?: string; country?: string; type?: VenueType; lng: number; lat: number; blurb?: string; aliases?: string[] }): { venue: Venue; pinned: boolean } {
  const id = 'c' + hashStr(`${input.name}@${input.lng.toFixed(4)},${input.lat.toFixed(4)}`).toString(36);
  const venue: Venue = {
    id, name: input.name.trim(), aliases: input.aliases || [], city: input.city || '', country: input.country || '',
    type: input.type || 'museum', lng: input.lng, lat: input.lat, blurb: input.blurb, custom: true,
  };
  const r = markPlace({
    kind: 'museum', prefix: VENUE_PREFIX, key: id, label: venue.name,
    geo: { lat: venue.lat, lng: venue.lng }, amp: 0,
    meta: { name: venue.name, aliases: venue.aliases, city: venue.city, country: venue.country, type: venue.type, blurb: venue.blurb, custom: true },
  });
  return { venue, pinned: r.pinned };
}

export function removeCustomVenue(id: string): void { unmarkPlace('museum', VENUE_PREFIX, id); }

export function subscribeVenues(fn: () => void): () => void { return subscribeUserMarks(fn); }

// ── 场馆 × 我的观展（信息卡「我在此馆看过 N 件」/观展史聚合都从这里读）──
export interface VenueVisitStats { count: number; lastVisit: string | null; items: { id: string; name: string; visitDate: string }[] }

/** 按场馆名聚合我钉过的展品（展品 meta.museum 存的是规范化馆名）。 */
export function venueVisitStats(venueName: string): VenueVisitStats {
  const items = getUserMarksByKind('exhibition')
    .map((m) => {
      const meta = (m.meta || {}) as Record<string, unknown>;
      if ((meta.museum as string) !== venueName) return null;
      return { id: m.id, name: (meta.nameZh as string) || m.label || '展品', visitDate: (meta.visitDate as string) || '' };
    })
    .filter((x): x is { id: string; name: string; visitDate: string } => !!x)
    .sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''));
  return { count: items.length, lastVisit: items.find((i) => i.visitDate)?.visitDate || null, items };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
