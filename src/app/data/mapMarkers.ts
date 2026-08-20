// 地图标记图层 · 统一数据模块（解耦、可扩展）
// 把不同来源的点（音乐城市 / 照片地点 / 将来更多）统一成 MapMarker，按 kind 区分颜色。
// 新增一类内容只要再 push 一组 marker + 在 MARKER_KINDS 里加一行即可，地图层与图例自动支持。

import { mapPhotoPoints } from './photos';
import { MUSEUM_SEEDS, type MuseumSeed } from '../lib/exhibition/catalog';
// 只引类型（编译期擦除）；真正的数据在 ensureHeavyMarkers() 中按需安装当前 Data Pack 后注入。
import type { MoviePoint } from './movies';
import type { BookPoint } from './books';
import { isDataPackMapLayerEnabled, subscribeDataPackMapLayers } from '../lib/dataPack/mapLayer';
import { ensureActiveDataPack, getDataPackState, subscribeDataPacks, type MappingPackLocation, type MappingPackRecord } from '../lib/dataPack';

// 'custom' = 用户用「造物主」meta-agent 自建的 agent 的落点（咖啡馆/球鞋/鸟类…全归这一类，
// 地球只认这一个通用类、不学习具体自定义 agent；各 agent 的身份/颜色在 meta 里，详见 lib/agent/）。
// 'museum' = 地球博物馆图层：内建全球场馆种子（静态点）+ 用户自定义场馆（userMarks，前缀 umu-）。
export type MarkerKind = 'music' | 'photo' | 'movie' | 'book' | 'mapping' | 'travel' | 'council' | 'exhibition' | 'museum' | 'custom';

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  lat: number;
  lng: number;
  label?: string;   // 地球档显示的名字（如城市名）
  thumb?: string;
  full?: string;
  author?: string; authorLink?: string; photoLink?: string;  // Unsplash 署名（世界照片）
}

export interface MarkerBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

// Mapbox 在跨越 180° 经线时会返回 west > east。这里显式处理，避免太平洋两侧
// 的点被错误过滤；纬度也做容错归一化，便于纯函数测试与服务端复用。
export function markerInBounds(marker: Pick<MapMarker, 'lat' | 'lng'>, bounds: MarkerBounds): boolean {
  const south = Math.min(bounds.south, bounds.north);
  const north = Math.max(bounds.south, bounds.north);
  if (marker.lat < south || marker.lat > north) return false;
  return bounds.west <= bounds.east
    ? marker.lng >= bounds.west && marker.lng <= bounds.east
    : marker.lng >= bounds.west || marker.lng <= bounds.east;
}

// 图例 / 开关用的类型配置：标签 + 颜色（绿=音乐，青=照片，琥珀=电影，紫=书，玫红=行程，金=议事，橙=自建）
export const MARKER_KINDS: { kind: MarkerKind; label: string; color: string }[] = [
  { kind: 'music', label: '音乐', color: '#00ff88' },
  { kind: 'photo', label: '照片', color: '#00e5ff' },
  { kind: 'movie', label: '电影', color: '#ffb000' },
  { kind: 'book', label: '书', color: '#b388ff' },
  { kind: 'mapping', label: '内容', color: '#8f63d4' },
  { kind: 'travel', label: '行程', color: '#ff3b6b' },
  { kind: 'council', label: '议事', color: '#caa64a' },
  { kind: 'exhibition', label: '看展', color: '#5A8F7B' },
  { kind: 'museum', label: '博物馆', color: '#2F6FED' },
  { kind: 'custom', label: '自建', color: '#ff8a3d' },
];
export const KIND_COLOR: Record<MarkerKind, string> = { music: '#00ff88', photo: '#00e5ff', movie: '#ffb000', book: '#b388ff', mapping: '#8f63d4', travel: '#ff3b6b', council: '#caa64a', exhibition: '#5A8F7B', museum: '#2F6FED', custom: '#ff8a3d' };

// 确定性微偏移：同城 / 重合的点在城市附近散开（约 ±0.03°≈3km），放大后能看出分布在不同位置；
// 缩小时这点偏移看不出来，由地图层的聚合再把重合的只显示一个。
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function jitter(id: string, lat: number, lng: number): [number, number] {
  const h = hashStr(id);
  const dlat = ((h & 0xffff) / 0xffff - 0.5) * 0.06;
  const dlng = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 0.06;
  return [lat + dlat, lng + dlng];
}

const photoMarkers: MapMarker[] = mapPhotoPoints.map((p) => {
  const [lat, lng] = jitter('p-' + p.id, p.lat, p.lng);
  return { id: 'p-' + p.id, kind: 'photo', lat, lng, label: (p.city || '').split(',')[0], thumb: p.thumb, full: p.full,
    author: p.author, authorLink: p.authorLink, photoLink: p.photoLink };
});

// 地球博物馆图层：内建全球场馆种子直接上地球（真实坐标不 jitter——场馆是精确地点，抖散反而错）。
// 数据小（60+ 条纯文本），随首屏。用户自定义场馆走 userMarks(kind:'museum')，地图层合并渲染。
const museumMarkers: MapMarker[] = MUSEUM_SEEDS.map((s) => (
  { id: 'mu-' + s.id, kind: 'museum' as MarkerKind, lat: s.lat, lng: s.lng, label: s.name }
));

// 首屏地图只先渲染照片 + 博物馆标记。音乐 / 电影 / 书在地图就绪后按需加载当前 Data Pack，
// 数据分块不进入首屏 JavaScript，也不会在未安装时下载。
export const MAP_MARKERS: MapMarker[] = [...photoMarkers, ...museumMarkers];
const LIGHT_MARKER_COUNT = MAP_MARKERS.length;

// 点击查详情用的查找表（按带前缀的 marker id）：geojson 里只放 id，详情走这里查，保持要素轻量。
// 电影 / 书表初始为空，懒加载完成后填充（同一 Map 对象就地填充，外部持有的引用仍有效）。
export const photoById = new Map(mapPhotoPoints.map((p) => ['p-' + p.id, p]));
export const museumById = new Map<string, MuseumSeed>(MUSEUM_SEEDS.map((s) => ['mu-' + s.id, s]));
export const movieById = new Map<string, MoviePoint>();
export const bookById = new Map<string, BookPoint>();
export interface MappingPoint { record: MappingPackRecord; location: MappingPackLocation; packName: string }
export const mappingById = new Map<string, MappingPoint>();

let heavyLoaded = false;
let heavyPromise: Promise<void> | null = null;
let heavySubscriptionsReady = false;
// 懒加载音乐 / 电影 / 书标记 + 详情查找表；切换 Data Pack 时就地重建，Skill 代码无需改变。
export function ensureHeavyMarkers(): Promise<void> {
  if (heavyLoaded) return Promise.resolve();
  if (heavyPromise) return heavyPromise;
  heavyPromise = Promise.all([import('./movies'), import('./books'), import('../../../frost-agent/data/radio')]).then(async ([mv, bk, radio]) => {
    const rebuild = () => {
      MAP_MARKERS.splice(LIGHT_MARKER_COUNT);
      movieById.clear();
      bookById.clear();
      mappingById.clear();
      if (isDataPackMapLayerEnabled('music')) {
        for (const city of radio.RADIO_CITIES) {
          if (!Number.isFinite(city.lat) || !Number.isFinite(city.lng)) continue;
          const [lat, lng] = jitter('m-' + city.slug, city.lat as number, city.lng as number);
          MAP_MARKERS.push({ id: 'm-' + city.slug, kind: 'music', lat, lng, label: city.cityNameZh });
        }
      }
      if (isDataPackMapLayerEnabled('movies')) {
        for (const m of mv.moviePoints) {
          MAP_MARKERS.push({ id: 'mv-' + m.id, kind: 'movie', lat: m.lat, lng: m.lng, label: m.title });
          movieById.set('mv-' + m.id, m);
        }
      }
      if (isDataPackMapLayerEnabled('books')) {
        for (const b of bk.bookPoints) {
          MAP_MARKERS.push({ id: 'bk-' + b.id, kind: 'book', lat: b.lat, lng: b.lng, label: b.title });
          bookById.set('bk-' + b.id, b);
        }
      }
      if (isDataPackMapLayerEnabled('mapping')) {
        const pack = getDataPackState('mapping').active;
        for (const record of (pack?.records || []) as MappingPackRecord[]) {
          for (const location of record.locations) {
            if (!location.confirmed || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) continue;
            const id = `mp-${record.id}-${location.id}`;
            MAP_MARKERS.push({ id, kind: 'mapping', lat: location.lat, lng: location.lng, label: location.name });
            mappingById.set(id, { record, location, packName: pack?.manifest.identity.name || record.title });
          }
        }
      }
    };
    await Promise.all([mv.ensureMovieData(), bk.ensureBookData(), radio.ensureMusicData(), ensureActiveDataPack('mapping')]);
    rebuild();
    if (!heavySubscriptionsReady) {
      mv.subscribeMovieData(rebuild);
      bk.subscribeBookData(rebuild);
      radio.subscribeMusicData(rebuild);
      subscribeDataPackMapLayers(rebuild);
      subscribeDataPacks(rebuild);
      heavySubscriptionsReady = true;
    }
    heavyLoaded = true;
  }).catch((e) => { heavyPromise = null; throw e; });   // 失败清缓存→下次切回地球 tab 重新 import；保持 reject 让上层 .catch 照常吞（否则一次瞬时 chunk 404/离线后电影·书标记整会话消失、不自愈）
  return heavyPromise;
}

// 转 GeoJSON，交给 mapbox symbol 图层原生渲染（贴地 / 背面遮挡 / 重叠碰撞都由 mapbox 处理）
export function toGeoJSON(bounds?: MarkerBounds) {
  const markers = bounds ? MAP_MARKERS.filter((marker) => markerInBounds(marker, bounds)) : MAP_MARKERS;
  return {
    type: 'FeatureCollection' as const,
    features: markers.map((m) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
      properties: { kind: m.kind, label: m.label || '', id: m.id },
    })),
  };
}
