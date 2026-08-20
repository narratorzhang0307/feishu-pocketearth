// 底图 provider 开关：mapbox（默认）| amap（高德）。
// 切换：在 .env 设 VITE_MAP_PROVIDER=amap；删掉该行或设回 mapbox 即回退，零代码改动。
export type MapProvider = 'mapbox' | 'amap';

export const MAP_PROVIDER: MapProvider =
  ((import.meta.env.VITE_MAP_PROVIDER as string) || 'mapbox').toLowerCase() === 'amap' ? 'amap' : 'mapbox';
