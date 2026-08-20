// 跨标记地理联动 · 纯逻辑：给一个坐标，聚合「这一带」你在各 agent 留下的所有标记
// （书/影/乐/行程/照片/议事/自建 + 心情），让记一笔从孤立的点变成会互相看见的记忆网。
// 解耦：只读 userMarks / geoStickers / mapMarkers 三个数据层；不碰 MyMapTab / MarkerDetail 热区。
import { getUserMarks } from '../../data/userMarks';
import { getMoodStickers } from '../../data/geoStickers';
import { MAP_MARKERS, KIND_COLOR, type MarkerKind } from '../../data/mapMarkers';

export type NearbyKind = MarkerKind | 'mood';
// origin 区分语义：visited=你主动留下的(心情/各 agent 运行时落点)；seen=按你豆瓣史/资料库铺的(看过读过的电影书、音乐照片城市)，
// 你与该地未必有物理关联——避免把「看过/读过」说成「到过」造成虚假记忆。
export interface NearbyMark { id: string; kind: NearbyKind; label: string; color: string; km: number; origin: 'visited' | 'seen' }

const MOOD_COLOR = '#ffd23b';

// 粗略球面距离（km），城市级足够：纬度 1°≈111km，经度按纬度缩放。
// 经度差先归一化到 [-180,180]，否则跨国际日期线(如 179.9 与 -179.9，实距 ~22km)会被算成 ~4 万 km 而漏连。
function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  let dLngDeg = lng1 - lng2;
  if (dLngDeg > 180) dLngDeg -= 360; else if (dLngDeg < -180) dLngDeg += 360;
  const dLat = (lat1 - lat2) * 111;
  const dLng = dLngDeg * 111 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

const clip = (s: string, n: number) => (s || '').slice(0, n);

/** 「这一带」你留下的其它标记：按距离升序、去重、每类限量、排除自身。默认半径 80km（同城级）。 */
export function nearbyMarks(lat: number, lng: number, opts?: { km?: number; limit?: number; perKind?: number; excludeId?: string }): NearbyMark[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const km = opts?.km ?? 80;
  const limit = opts?.limit ?? 6;
  const perKindCap = opts?.perKind ?? 3;
  const excludeId = opts?.excludeId;
  const out: NearbyMark[] = [];

  // 1. 各 agent 运行时落点 userMarks（书/影/乐/行程/议事/自建/照片）——你主动留下 → visited
  for (const m of getUserMarks()) {
    if (m.id === excludeId || !Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
    const d = distKm(lat, lng, m.lat, m.lng);
    if (d <= km) out.push({ id: m.id, kind: m.kind, label: clip(m.label || '', 18) || m.kind, color: KIND_COLOR[m.kind] || '#888', km: d, origin: 'visited' });
  }
  // 2. 心情贴（排除自身 + 无 tone 种子卡 + 没真地名的「此处 / 随机落点」）——你主动留下 → visited
  for (const s of getMoodStickers()) {
    if (s.id === excludeId || !s.tone) continue;
    if (s.place === '此处' || (s.place || '').includes('随机落点')) continue;
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const d = distKm(lat, lng, s.lat, s.lng);
    if (d <= km) out.push({ id: s.id, kind: 'mood', label: clip(s.text || '', 14), color: s.color || MOOD_COLOR, km: d, origin: 'visited' });
  }
  // 3. 静态资料库 MAP_MARKERS（豆瓣书影 + 音乐/照片城市）——你看过/读过/系统铺的 → seen（非到访）
  for (const m of MAP_MARKERS) {
    if (m.id === excludeId) continue;
    const d = distKm(lat, lng, m.lat, m.lng);
    if (d <= km) out.push({ id: m.id, kind: m.kind, label: clip(m.label || '', 18) || m.kind, color: KIND_COLOR[m.kind] || '#888', km: d, origin: 'seen' });
  }

  // 距离升序 → 去重(kind+label) → 每类限量(保证多样、不被某一类刷屏) → 截断
  out.sort((a, b) => a.km - b.km);
  const seen = new Set<string>();
  const perKind: Record<string, number> = {};
  const result: NearbyMark[] = [];
  for (const x of out) {
    const k = x.kind + '|' + x.label;
    if (!x.label || seen.has(k)) continue;
    seen.add(k);
    perKind[x.kind] = (perKind[x.kind] || 0) + 1;
    if (perKind[x.kind] > perKindCap) continue;
    result.push(x);
    if (result.length >= limit) break;
  }
  return result;
}
