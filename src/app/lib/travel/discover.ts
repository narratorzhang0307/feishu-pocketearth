// 发现层：catalog 没有的城市 → Nominatim 定位 → Overpass 拉【真实】景点/餐厅 → 组装成 Destination。
// 这是「30 城写死字典」到「任意城市真数据」的升级位；中国境内 OSM POI 覆盖参差（东密西疏），
// 拉不满 3 个点就如实返回 null，让 UI 明说「这个地方 OSM 数据太少」，绝不拿模板凑数。
import { geocodeViaOSM, poiViaOSM } from './mcp';
import type { Destination, POI, Pref } from './types';

// OSM kind → 本项目偏好 tag（纯映射，node 可测）
export function tagOfOsmKind(kind: string): Pref {
  if (/museum|gallery|artwork/.test(kind)) return '艺术';
  if (/viewpoint/.test(kind)) return '自然';
  if (/restaurant|cafe/.test(kind)) return '美食';
  if (/attraction/.test(kind)) return '历史';
  return '小众';
}

const KIND_NOTE: Record<string, string> = {
  museum: '博物馆', gallery: '美术馆', artwork: '公共艺术', viewpoint: '观景点',
  attraction: '景点', restaurant: '餐厅', cafe: '咖啡',
};

export function noteOfOsmKind(kind: string): string {
  return `OpenStreetMap 实景 · ${KIND_NOTE[kind] || '地点'}`;
}

export async function discoverDestination(name: string): Promise<Destination | null> {
  const geo = await geocodeViaOSM(name);
  if (!geo) return null;
  const [sights, food] = await Promise.all([
    poiViaOSM(geo.lat, geo.lng, 'tourism', 4000),
    poiViaOSM(geo.lat, geo.lng, 'restaurant', 2500),
  ]);
  const seen = new Set<string>();
  const pois: POI[] = [...sights, ...food.slice(0, 4)]
    .filter((p) => p.name && !seen.has(p.name) && seen.add(p.name))
    .slice(0, 12)
    .map((p) => ({ name: p.name, tag: tagOfOsmKind(p.kind), note: noteOfOsmKind(p.kind), lng: p.lng, lat: p.lat }));
  if (pois.length < 3) return null;
  return { name: geo.name || name.trim(), lng: geo.lng, lat: geo.lat, pois };
}
