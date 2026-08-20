// 记忆层：端侧持久化电影索引（IndexedDB `pe-movies`，归一片名为主键，幂等）+ localStorage 纠错偏好。
// IDB 读写与 placeFix/ratingFix 收口到 [keyedStore] skill；这里只声明实体类型 + 绑库名（薄壳）。
import type { GeoTarget, MovieTags } from './types';
import { keyedStore, correctionsStore, type Corrections } from '../skills/keyedStore';

export interface StoredMovie {
  key: string;                 // movieKey
  title: string;
  country: string;
  year: number | null;
  tags: MovieTags;
  geo: GeoTarget | null;
  pinned: boolean;
  enriched: boolean;           // 是否已云脑补全过（补过的重跑不再调）
  ts: number;
}

const store = keyedStore<StoredMovie>('pe-movies');
export const getKnownMovie = (key: string): Promise<StoredMovie | null> => store.get(key);
export const putMovie = (m: StoredMovie): Promise<void> => store.put(m);

// 用户纠错偏好（地点/评分修正），供 critic 读取
export type MoviePrefs = Corrections;
const prefs = correctionsStore('pe.moviePrefs.v1');
export const getMoviePrefs = (): MoviePrefs => prefs.get();
export const recordPlaceFix = (key: string, fix: { lng: number; lat: number; place: string }): void => prefs.recordPlaceFix(key, fix);
export const recordRatingFix = (key: string, stars: number): void => prefs.recordRatingFix(key, stars);
