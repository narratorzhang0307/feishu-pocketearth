// 记忆·知识层：把本地豆瓣观影库当 RAG 知识底座（确定性、可离线）。
// 归一片名模糊匹配走 matchCatalog skill → 命中即拿到 导演/国家/年份/豆瓣分/简介 这些确定锚点，省一次云脑调用。
import { movieDataVersion, movieRecords, doubanRating, type MovieRecord } from '../../data/movies';
import { buildCatalogIndex, matchCatalog } from '../skills/matchCatalog';

// 预建归一索引（一次性）：电影用 片名 + 原名 两个键
let index: Map<string, MovieRecord> | null = null;
let indexedVersion = -1;
const getIndex = (): Map<string, MovieRecord> => {
  if (!index || indexedVersion !== movieDataVersion) {
    index = buildCatalogIndex(movieRecords, (record) => [record.title, record.original]);
    indexedVersion = movieDataVersion;
  }
  return index;
};

export interface CatalogHit { record: MovieRecord; douban?: number; exact: boolean }

// 片名 → 本地库记录（精确→模糊由 skill 处理）；命中再附豆瓣分（电影领域专属）。
export function matchInCatalog(title: string): CatalogHit | null {
  const hit = matchCatalog(title, getIndex());
  if (!hit) return null;
  return { record: hit.record, douban: doubanRating(hit.record.id), exact: hit.exact };
}

// 库里是否已看过该片（用于「这部你 2019 看过」的提示，纯本地）
export function seenBefore(title: string): MovieRecord | null {
  const h = matchInCatalog(title);
  return h?.record || null;
}
