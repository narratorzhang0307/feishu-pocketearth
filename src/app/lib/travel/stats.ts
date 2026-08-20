// 聚合层（P2 旅行档案统计 + 跨 agent 联动）：纯读 userMarks，不写。
// 跨 agent：把「足迹城市」与照片/电影/书/音乐的落点按地理邻近(<60km)关联——
// 「你在京都既走过路，也拍过照、看过取景于此的电影」，让各 agent 在地球上交汇。
import { getUserMarks, getUserMarksByKind } from '../../data/userMarks';
import { seasonOf } from './types';

export interface TravelStats {
  cities: number; spots: number; trips: number;
  topTags: { tag: string; n: number }[];
  seasons: { season: string; n: number }[];
  overlaps: { city: string; kinds: string[] }[];   // 足迹城市 ↔ 附近其他 agent 落点
}

const KIND_LABEL: Record<string, string> = { photo: '照片', movie: '电影', book: '书', music: '音乐' };

// haversine 距离（km）
function dist(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function getTravelStats(): TravelStats {
  const travel = getUserMarksByKind('travel');
  const others = getUserMarks().filter((m) => m.kind !== 'travel' && KIND_LABEL[m.kind]);

  const cityNames = new Set<string>();
  const tripIds = new Set<string>();
  const tagCount = new Map<string, number>();
  const seasonCount = new Map<string, number>();
  for (const t of travel) {
    const meta = (t.meta || {}) as Record<string, unknown>;
    const city = String(meta.city || t.label || '').trim();
    if (city) cityNames.add(city);
    const tripId = String(meta.tripId || '');
    if (tripId) tripIds.add(tripId);
    const tag = String(meta.tag || '');
    if (tag) tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    const s = seasonOf(String(meta.date || ''));
    if (s) seasonCount.set(s, (seasonCount.get(s) || 0) + 1);
  }

  // 跨 agent：每个足迹城市（按代表点）附近 60km 内有哪些其他 agent 的落点
  const overlaps: { city: string; kinds: string[] }[] = [];
  const seenCity = new Set<string>();
  for (const t of travel) {
    const city = String((t.meta || {}).city || t.label || '').trim();
    if (!city || seenCity.has(city)) continue;
    seenCity.add(city);
    const kinds = new Set<string>();
    for (const o of others) {
      if (dist(t.lat, t.lng, o.lat, o.lng) < 60) kinds.add(KIND_LABEL[o.kind]);
    }
    if (kinds.size) overlaps.push({ city, kinds: [...kinds] });
  }

  return {
    cities: cityNames.size,
    spots: travel.length,
    trips: tripIds.size,
    topTags: [...tagCount.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n).slice(0, 5),
    seasons: ['春', '夏', '秋', '冬'].map((season) => ({ season, n: seasonCount.get(season) || 0 })).filter((s) => s.n > 0),
    overlaps,
  };
}
