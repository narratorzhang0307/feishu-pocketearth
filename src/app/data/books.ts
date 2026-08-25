// 书籍 Skill 的运行时数据视图。
// 全量记录不再静态 import；用户安装 pocket.books/v1 Data Pack 后，记录从 IndexedDB 注入本模块。

import {
  ensureActiveDataPack,
  getDataPackState,
  subscribeDataPacks,
  type BookPackRecord,
} from '../lib/dataPack';

export interface BookRecord extends BookPackRecord {}
export interface BookPoint extends BookRecord { lng: number; lat: number }

export let bookRecords: BookRecord[] = [];
export let bookTotal = 0;
export let bookPoints: BookPoint[] = [];
export let bookMappedTotal = 0;
export let bookDataVersion = 0;

const listeners = new Set<() => void>();
let lastRecords: unknown = null;

// Temporary Feishu end-to-end verification rows must not be resurrected by an older
// embedded WebView or IndexedDB snapshot after the source rows have been deleted.
const REMOVED_DEMO_BOOK_TITLES = ['酒吧长谈', '城市与狗', '百年孤独'];
export const isRemovedDemoBook = (record: Pick<BookRecord, 'title'>): boolean => {
  const title = String(record?.title || '').replace(/\s+/g, '');
  return REMOVED_DEMO_BOOK_TITLES.some((removed) => title.includes(removed));
};

// Skill 级地理兜底：仅用于用户新记一本但尚无明确地点时；默认 Data Pack 自身已经携带 locations。
const COUNTRY_COORDS: Record<string, [number, number]> = {
  中国大陆: [116.40, 39.90], 中国: [116.40, 39.90], 中国台湾: [121.56, 25.03], 中国香港: [114.17, 22.32],
  美国: [-73.97, 40.78], 日本: [139.69, 35.68], 英国: [-0.12, 51.51], 法国: [2.35, 48.85],
  德国: [13.40, 52.52], 意大利: [12.49, 41.90], 爱尔兰: [-6.26, 53.35], 瑞士: [8.54, 47.37],
  智利: [-70.65, -33.46], 哥伦比亚: [-74.07, 4.71], 俄国: [37.62, 55.75], 俄罗斯: [37.62, 55.75], 苏联: [37.62, 55.75],
  阿根廷: [-58.38, -34.60], 波兰: [21.01, 52.23], 加拿大: [-79.38, 43.65], 马来西亚: [101.69, 3.14],
  韩国: [126.97, 37.56], 捷克: [14.42, 50.09], 墨西哥: [-99.13, 19.43], 荷兰: [4.90, 52.37],
  葡萄牙: [-9.14, 38.72], 西班牙: [-3.70, 40.42], 瑞典: [18.07, 59.33], 塞尔维亚: [20.46, 44.79],
  澳大利亚: [151.21, -33.87], 挪威: [10.75, 59.91], 古希腊: [23.73, 37.98], 希腊: [23.73, 37.98],
  斯洛文尼亚: [14.51, 46.06], 印度: [72.88, 19.08], 奥地利: [16.37, 48.21], 芬兰: [24.94, 60.17],
  南非: [18.42, -33.92], 罗马尼亚: [26.10, 44.43], 越南: [105.83, 21.03], 波斯: [51.39, 35.69], 伊朗: [51.39, 35.69],
  丹麦: [12.57, 55.68], 土耳其: [28.98, 41.01],
};
export const bookCountry = (country: string): [number, number] | undefined => COUNTRY_COORDS[country];

export function hasBookMapPoint(record: BookRecord): boolean {
  return !!record.locations?.some((location) => Number.isFinite(location.lng) && Number.isFinite(location.lat))
    || !!bookCountry(record.country);
}

function hashStr(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function spread(id: string, lng: number, lat: number): [number, number] {
  const hash = hashStr(`bk-${id}`);
  return [lng + ((hash & 0xffff) / 0xffff - 0.5) * 2.5, lat + (((hash >>> 16) & 0xffff) / 0xffff - 0.5) * 2.5];
}

export function bookMapPoint(record: BookRecord): BookPoint | null {
  const explicit = record.locations?.find((location) => Number.isFinite(location.lng) && Number.isFinite(location.lat));
  const base = explicit ? [explicit.lng, explicit.lat] as [number, number] : bookCountry(record.country);
  if (!base) return null;
  const [lng, lat] = spread(record.id, base[0], base[1]);
  return { ...record, lng, lat };
}

export function recentBookRecords(records: BookRecord[], limit = 60): BookRecord[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => (b.record.date || '').localeCompare(a.record.date || '') || b.index - a.index)
    .slice(0, limit)
    .map(({ record }) => record);
}

function applyActivePack() {
  const records = getDataPackState('books').active?.records || [];
  if (records === lastRecords) return;
  lastRecords = records;
  bookRecords = (records as BookRecord[]).filter((record) => !isRemovedDemoBook(record));
  bookTotal = bookRecords.length;
  bookPoints = bookRecords.map(bookMapPoint).filter((record): record is BookPoint => !!record);
  bookMappedTotal = bookPoints.length;
  bookDataVersion += 1;
  listeners.forEach((listener) => listener());
}

subscribeDataPacks(applyActivePack);

export async function ensureBookData(): Promise<void> {
  await ensureActiveDataPack('books');
  applyActivePack();
}

export const subscribeBookData = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export interface BookSeed { id: string; title: string; author: string; place: string; lng: number; lat: number; year?: number; note?: string }
export const SEED_BOOKS: BookSeed[] = [
  { id: 'b03', title: '老人与海', author: '海明威', place: '哈瓦那 · 古巴', lng: -82.38, lat: 23.13, year: 1952, note: '人可以被毁灭，但不能被打败。' },
  { id: 'b06', title: '挪威的森林', author: '村上春树', place: '东京', lng: 139.70, lat: 35.69, year: 1987, note: '每个人都有属于自己的一片森林。' },
  { id: 'b14', title: '1984', author: '乔治·奥威尔', place: '伦敦', lng: -0.12, lat: 51.51, year: 1949, note: '老大哥在看着你。' },
];

export const BOOK_PLACES: { name: string; lng: number; lat: number }[] = [
  { name: '北京', lng: 116.40, lat: 39.90 }, { name: '上海', lng: 121.47, lat: 31.23 },
  { name: '杭州', lng: 120.15, lat: 30.27 }, { name: '湘西凤凰', lng: 109.60, lat: 27.95 },
  { name: '东京', lng: 139.70, lat: 35.69 }, { name: '大阪', lng: 135.50, lat: 34.69 },
  { name: '京都', lng: 135.77, lat: 35.01 }, { name: '首尔', lng: 126.97, lat: 37.56 },
  { name: '巴黎', lng: 2.35, lat: 48.85 }, { name: '伦敦', lng: -0.12, lat: 51.51 },
  { name: '都柏林', lng: -6.26, lat: 53.35 }, { name: '布拉格', lng: 14.42, lat: 50.09 },
  { name: '圣彼得堡', lng: 30.34, lat: 59.93 }, { name: '莫斯科', lng: 37.62, lat: 55.75 },
  { name: '纽约', lng: -73.97, lat: 40.78 }, { name: '哈瓦那', lng: -82.38, lat: 23.13 },
  { name: '波哥大', lng: -74.07, lat: 4.71 }, { name: '布宜诺斯艾利斯', lng: -58.38, lat: -34.60 },
  { name: '伊斯坦布尔', lng: 28.98, lat: 41.01 }, { name: '柏林', lng: 13.40, lat: 52.52 },
];
export const bookPlace = (name: string) => BOOK_PLACES.find((place) => place.name === name);
