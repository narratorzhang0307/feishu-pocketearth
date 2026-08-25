// 电影 Skill 的运行时数据视图。
// 全量记录来自当前启用的 pocket.movies/v1 Data Pack，不再静态打进应用代码包。

import {
  ensureActiveDataPack,
  getDataPackState,
  subscribeDataPacks,
  uniqueDataPackRecords,
  type MoviePackRecord,
} from '../lib/dataPack';

export interface MovieRecord extends MoviePackRecord {}
export interface MoviePoint extends MovieRecord { lng: number; lat: number }

export let movieRecords: MovieRecord[] = [];
export let movieTotal = 0;
export let moviePoints: MoviePoint[] = [];
export let movieMappedTotal = 0;
export let movieDataVersion = 0;

const listeners = new Set<() => void>();
let lastRecords: unknown = null;
let publicRatings = new Map<string, number>();

const COUNTRY_COORDS: Record<string, [number, number]> = {
  中国大陆: [116.40, 39.90], 美国: [-118.24, 34.05], 日本: [139.69, 35.68], 中国香港: [114.17, 22.32],
  法国: [2.35, 48.85], 英国: [-0.12, 51.50], 中国台湾: [121.56, 25.03], 韩国: [126.97, 37.56],
  意大利: [12.49, 41.90], 德国: [13.40, 52.52], 瑞典: [18.07, 59.33], 西班牙: [-3.70, 40.42],
  波兰: [21.01, 52.23], 芬兰: [24.94, 60.17], 加拿大: [-79.38, 43.65], 泰国: [100.50, 13.76],
  丹麦: [12.57, 55.68], 澳大利亚: [151.21, -33.87], 伊朗: [51.39, 35.69], 苏联: [37.62, 55.75],
  希腊: [23.73, 37.98], 墨西哥: [-99.13, 19.43], 印度: [72.88, 19.08], 南斯拉夫: [20.46, 44.79],
  智利: [-70.65, -33.46], 巴西: [-43.20, -22.91], 新西兰: [174.78, -41.29], 挪威: [10.75, 59.91],
  奥地利: [16.37, 48.21], 俄罗斯: [37.62, 55.75], 土耳其: [28.98, 41.01], 捷克斯洛伐克: [14.42, 50.09],
  匈牙利: [19.04, 47.50], 阿根廷: [-58.38, -34.60], 比利时: [4.35, 50.85], 爱尔兰: [-6.26, 53.35],
  塞尔维亚: [20.46, 44.79], 新加坡: [103.82, 1.35], 马来西亚: [101.69, 3.14], 哥伦比亚: [-74.07, 4.71],
  捷克: [14.42, 50.09], 南非: [18.42, -33.92], 荷兰: [4.90, 52.37], 葡萄牙: [-9.14, 38.72],
  瑞士: [8.54, 47.37], 黎巴嫩: [35.50, 33.89], 以色列: [34.78, 32.08], 哈萨克斯坦: [76.89, 43.24],
};
export const movieCountry = (country: string): [number, number] | undefined => COUNTRY_COORDS[country];
export const movieCountries = Object.keys(COUNTRY_COORDS);

function hashStr(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function spread(id: string, lng: number, lat: number): [number, number] {
  const hash = hashStr(`mv-${id}`);
  return [lng + ((hash & 0xffff) / 0xffff - 0.5) * 1.8, lat + (((hash >>> 16) & 0xffff) / 0xffff - 0.5) * 1.8];
}

function pointFor(record: MovieRecord): MoviePoint | null {
  const explicit = record.locations?.find((location) => Number.isFinite(location.lng) && Number.isFinite(location.lat));
  const base = explicit ? [explicit.lng, explicit.lat] as [number, number] : movieCountry(record.country);
  if (!base) return null;
  const [lng, lat] = spread(record.id, base[0], base[1]);
  return { ...record, lng, lat };
}

function applyActivePack() {
  const records = uniqueDataPackRecords('movies', getDataPackState('movies').active?.records || []);
  if (records === lastRecords) return;
  lastRecords = records;
  movieRecords = records as MovieRecord[];
  movieTotal = movieRecords.length;
  moviePoints = movieRecords.map(pointFor).filter((record): record is MoviePoint => !!record);
  movieMappedTotal = moviePoints.length;
  publicRatings = new Map(movieRecords.flatMap((record) => typeof record.publicRating === 'number' ? [[record.id, record.publicRating] as const] : []));
  movieDataVersion += 1;
  listeners.forEach((listener) => listener());
}

subscribeDataPacks(applyActivePack);

export async function ensureMovieData(): Promise<void> {
  await ensureActiveDataPack('movies');
  applyActivePack();
}

export const subscribeMovieData = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const doubanRating = (id: string): number | undefined => publicRatings.get(id);
