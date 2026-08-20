// 记忆层：端侧持久化展品索引（IndexedDB `pe-exhibitions`，归一展品名为主键，幂等）+ localStorage 纠错偏好。
// IDB 读写与 placeFix/ratingFix 收口到 [keyedStore] skill；这里只声明实体类型 + 绑库名（薄壳，仿 movie/store.ts）。
import type { ArtifactTags, ExhibitRepresentations, GeoTarget, Label, Splat3D } from './types';
import { keyedStore, correctionsStore, type Corrections } from '../skills/keyedStore';

export interface StoredArtifact {
  key: string;                 // artifactKey
  nameZh: string;
  museum: string;
  eraStart: number | null;
  eraEnd: number | null;
  tags: ArtifactTags;
  labels: Label[];
  splat: Splat3D | null;
  representations?: ExhibitRepresentations;
  photos: string[];
  geo: GeoTarget | null;
  pinned: boolean;
  enriched: boolean;           // 是否已云脑补全过（补过的重跑不再调）
  visitDate: string;
  ts: number;
}

const store = keyedStore<StoredArtifact>('pe-exhibitions');
export const getKnownArtifact = (key: string): Promise<StoredArtifact | null> => store.get(key);
export const putArtifact = (a: StoredArtifact): Promise<void> => store.put(a);
export const allArtifacts = (): Promise<StoredArtifact[]> => store.all();

// 用户纠错偏好（地点/评分修正），供 critic 读取
export type ExhibitionPrefs = Corrections;
const prefs = correctionsStore('pe.exhibitionPrefs.v1');
const clampRating = (stars: number): number => {
  const n = Number(stars);
  return Math.max(0, Math.min(5, Math.round(Number.isFinite(n) ? n : 0)));
};
export const getExhibitionPrefs = (): ExhibitionPrefs => prefs.get();
export const recordPlaceFix = (key: string, fix: { lng: number; lat: number; place: string }): void => prefs.recordPlaceFix(key, fix);
export const recordRatingFix = (key: string, stars: number): void => prefs.recordRatingFix(key, clampRating(stars));
