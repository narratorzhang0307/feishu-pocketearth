// 行动层：B 线完成行程→多点钉地球+回流；A 线手动/截图提炼→多点钉地球。对齐 photo/movie 的钉点+回流。
// 同一趟行程的点共享 meta.tripId（给连线/整程卡聚合用），meta.seq 给连线排序。
import { addUserMark, getUserMarksByKind, spreadCoord } from '../../data/userMarks';
import { geocodeCity } from '../../data/geoStickers';
import { geocodeViaOSM } from './mcp';
import { recordSignals } from '../../../../frost-agent/harness/profile';
import { slug, seasonOf, type Destination, type DayPlan, type Pref, type ManualStop, type TripArchive } from './types';

// 城市 → 坐标：先本地字典（确定性、不上网），miss 再 OSM 地理编码兜底（让字典外的任意城市也能钉）。
async function resolveCityGeo(city: string): Promise<{ lng: number; lat: number } | null> {
  const c = (city || '').trim(); if (!c) return null;
  const local = geocodeCity(c);
  if (local) return { lng: local.lng, lat: local.lat };
  const osm = await geocodeViaOSM(c);
  return osm ? { lng: osm.lng, lat: osm.lat } : null;
}

// B 线：完成行程 → 每个停留点钉点（同 tripId + seq）+ 回流（cities/prefs/seasons）。
export function confirmTrip(dest: Destination, days: DayPlan[], prefs: Pref[], date?: string): { added: number } {
  const d = date || new Date().toISOString().slice(0, 10);
  const tripId = `btr-${slug(dest.name)}-${slug(d)}`;   // 同次规划一个行程 id → 可连线/整程卡
  const existing = new Set(getUserMarksByKind('travel').map((m) => m.id));
  let added = 0;
  days.forEach((day) => day.stops.forEach((s, i) => {
    const id = `utr-${slug(dest.name)}-${slug(s.name)}`;   // 城市+站名 → 稳定可去重可撤销
    if (existing.has(id)) return;
    const [lng, lat] = spreadCoord(id, s.lng, s.lat, 0.04);
    addUserMark({ id, kind: 'travel', lng, lat, label: s.name, meta: { tripId, seq: day.day * 100 + i, city: dest.name, tag: s.tag, note: s.note, date: d, status: 'done' } });
    existing.add(id); added++;
  }));
  const season = seasonOf(d);
  recordSignals('travel', { cities: [dest.name], prefs: [...prefs], seasons: season ? [season] : [] });
  return { added };
}

// A 线 P0（手动录入，无 OCR）：手填 城市+日期+交通 → 钉一个点。本地字典 miss → OSM 兜底。
export async function pinManualStop(stop: ManualStop): Promise<{ ok: boolean; reason?: string }> {
  const city = (stop.city || '').trim();
  if (!city) return { ok: false, reason: 'needCity' };
  // 上游已带坐标（如 JOT 记一笔已 resolvePlace 命中）→ 直接用，跳过二次地理编码：
  // 否则会把 Mapbox 返回的繁体/长尾城市名喂回本地表+OSM，常查不到 → 定位到了却钉不上（圣地亚哥即此坑）。
  const geo = (Number.isFinite(stop.lng) && Number.isFinite(stop.lat))
    ? { lng: stop.lng as number, lat: stop.lat as number }
    : await resolveCityGeo(city);
  if (!geo) return { ok: false, reason: 'noGeo' };   // 本地字典 + OSM 都查不到 → 让用户换写法
  const date = stop.date || new Date().toISOString().slice(0, 10);
  const id = `utr-manual-${slug(city)}-${slug(date)}-${stop.mode || 'x'}`;
  if (getUserMarksByKind('travel').some((m) => m.id === id)) return { ok: true };   // 幂等
  const [lng, lat] = spreadCoord(id, geo.lng, geo.lat, 0.04);
  addUserMark({ id, kind: 'travel', lng, lat, label: city, meta: { city, date, mode: stop.mode, note: stop.note || '', status: 'done', manual: true } });
  const season = seasonOf(date);
  recordSignals('travel', { cities: [city], seasons: season ? [season] : [] });
  return { ok: true };
}

// A 线（截图提炼）：TripArchive → 多点钉地球（segment/stay/spot/兜底城市点），本地字典 miss → OSM 兜底。
// 同 tripId + seq 聚合；原图早弃、只钉脱敏字段。回流 cities/seasons。
export async function confirmArchive(arc: TripArchive): Promise<{ added: number; cities: string[] }> {
  const existing = new Set(getUserMarksByKind('travel').map((m) => m.id));
  const pinnedCities = new Set<string>();
  const newlyPinnedCities = new Set<string>();   // 只记本次真正新钉的城市，回流用：重确认同一 archive 时 0 新钉 → 0 回流，幂等（不再把已钉城市重复计进长期画像）
  let added = 0; let seq = 0;
  const pinPoint = async (city: string | undefined, label: string, role: string, date?: string, extra?: Record<string, unknown>) => {
    const c = (city || '').trim(); if (!c) return;
    const geo = await resolveCityGeo(c); if (!geo) return;
    pinnedCities.add(c);   // 城市已覆盖（无论是否新钉）→ 防 cities 兜底重复钉、保证再次调用幂等
    const id = `utr-${slug(arc.id)}-${slug(role)}-${slug(label || c)}`;
    if (existing.has(id) || getUserMarksByKind('travel').some((m) => m.id === id)) return;   // 实时复查：并发确认各基于旧快照会重复钉（addUserMark 不查重，同 photo geoPin）
    const [lng, lat] = spreadCoord(id, geo.lng, geo.lat, 0.04);
    addUserMark({ id, kind: 'travel', lng, lat, label: label || c, meta: { tripId: arc.id, seq: seq++, role, city: c, date, status: 'done', ...extra } });
    existing.add(id); added++; newlyPinnedCities.add(c);
  };
  for (const [i, s] of arc.segments.entries()) await pinPoint(s.toCity || s.fromCity, s.toCity || s.fromCity || '', `seg${i}`, s.date, { mode: s.mode, code: s.code });
  for (const [i, s] of arc.stays.entries()) await pinPoint(s.city, s.hotel || s.city || '', `stay${i}`, s.checkIn, { hotel: s.hotel });
  for (const [i, s] of arc.spots.entries()) await pinPoint(s.city, s.name || '', `spot${i}`, s.date);
  for (const [i, c] of arc.cities.entries()) { if (!pinnedCities.has((c || '').trim())) await pinPoint(c, c, `city${i}`); }
  const season = seasonOf(arc.dateStart);
  recordSignals('travel', { cities: [...newlyPinnedCities], seasons: season ? [season] : [] });   // 只回流本次新钉城市，重确认幂等
  return { added, cities: [...pinnedCities] };
}
