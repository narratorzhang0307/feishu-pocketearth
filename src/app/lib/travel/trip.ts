// 聚合查询层（A/B 线共用）：按 meta.tripId 把同一趟行程的 travel 落点聚合起来——
// 给「连线渲染」(buildTripLines) 和「整程卡」(getTrip) 用。纯读 userMarks，不写。
import { getUserMarksByKind } from '../../data/userMarks';

export interface TripStop { id: string; label: string; city: string; role: string; date: string; seq: number; lng: number; lat: number }
export interface TripView { tripId: string; title: string; cities: string[]; dateStart: string; dateEnd: string; stops: TripStop[] }

function toStop(m: ReturnType<typeof getUserMarksByKind>[number]): TripStop {
  const meta = (m.meta || {}) as Record<string, unknown>;
  return { id: m.id, label: m.label || '', city: String(meta.city || ''), role: String(meta.role || ''), date: String(meta.date || ''), seq: Number(meta.seq) || 0, lng: m.lng, lat: m.lat };
}

// 连线：把每个 tripId（≥2 点）的落点按 seq→date 连成 LineString。返回 GeoJSON FeatureCollection。
export function buildTripLines(): { type: 'FeatureCollection'; features: unknown[] } {
  const byTrip = new Map<string, TripStop[]>();
  for (const m of getUserMarksByKind('travel')) {
    const tripId = String((m.meta || {}).tripId || '');
    if (!tripId) continue;
    let arr = byTrip.get(tripId);
    if (!arr) { arr = []; byTrip.set(tripId, arr); }
    arr.push(toStop(m));
  }
  const features: unknown[] = [];
  for (const [tripId, stops] of byTrip) {
    if (stops.length < 2) continue;   // 单点不连线
    stops.sort((a, b) => a.seq - b.seq || a.date.localeCompare(b.date));
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: stops.map((s) => [s.lng, s.lat]) },
      properties: { tripId },
    });
  }
  return { type: 'FeatureCollection', features };
}

// 整程卡：单个 tripId → 聚合详情（标题 / 途经城市 / 日期范围 / 停留点列表，按 seq 排序）。
export function getTrip(tripId: string): TripView | null {
  if (!tripId) return null;
  const stops = getUserMarksByKind('travel')
    .filter((m) => String((m.meta || {}).tripId || '') === tripId)
    .map(toStop)
    .sort((a, b) => a.seq - b.seq || a.date.localeCompare(b.date));
  if (!stops.length) return null;
  const cities = [...new Set(stops.map((s) => s.city).filter(Boolean))];
  const padDate = (d: string) => d.replace(/\b(\d)\b/g, '0$1');   // 补零再比，容错云脑返回的 '2026-6-9' 非零填充日期（裸字典序会把它排错→整程卡日期范围反/错）
  const dates = stops.map((s) => s.date).filter(Boolean).sort((a, b) => padDate(a).localeCompare(padDate(b)));
  const title = cities.length > 1 ? `${cities[0]}—${cities[cities.length - 1]} 之旅` : `${cities[0] || '我的'}之旅`;
  return { tripId, title, cities, dateStart: dates[0] || '', dateEnd: dates[dates.length - 1] || '', stops };
}

// 整程移除：删掉某 tripId 下的全部落点（整程卡「移除整趟」用）。返回删除数。
export function removeTripMarks(tripId: string, removeOne: (id: string) => void): number {
  const ids = getUserMarksByKind('travel').filter((m) => String((m.meta || {}).tripId || '') === tripId).map((m) => m.id);
  ids.forEach(removeOne);
  return ids.length;
}
