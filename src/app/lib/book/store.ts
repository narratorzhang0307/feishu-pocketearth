// 记忆层：端侧持久化读书索引（IndexedDB `pe-books`，归一书名为主键，幂等）+ localStorage 纠错偏好。
// IDB 读写与 placeFix/ratingFix 收口到 [keyedStore] skill；这里只声明实体类型 + 绑库名（薄壳）。
import type { GeoTarget, BookTags } from './types';
import { keyedStore, correctionsStore, type Corrections } from '../skills/keyedStore';

export interface StoredBook {
  key: string;
  title: string;
  country: string;
  year: number | null;
  tags: BookTags;
  geo: GeoTarget | null;
  pinned: boolean;
  enriched: boolean;
  ts: number;
}

const store = keyedStore<StoredBook>('pe-books');
export const getKnownBook = (key: string): Promise<StoredBook | null> => store.get(key);
export const putBook = (b: StoredBook): Promise<void> => store.put(b);

export type BookPrefs = Corrections;
const prefs = correctionsStore('pe.bookPrefs.v1');
export const getBookPrefs = (): BookPrefs => prefs.get();
export const recordPlaceFix = (key: string, fix: { lng: number; lat: number; place: string }): void => prefs.recordPlaceFix(key, fix);
export const recordRatingFix = (key: string, stars: number): void => prefs.recordRatingFix(key, stars);
