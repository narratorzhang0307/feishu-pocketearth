// 记忆·知识层：本地豆瓣读书库当 RAG 知识底座（确定性、可离线）。归一书名模糊匹配走 matchCatalog skill → 作者/国家/年份/评分/简介。
import { bookDataVersion, bookRecords, type BookRecord } from '../../data/books';
import { buildCatalogIndex, matchCatalog } from '../skills/matchCatalog';

// 预建归一索引（一次性）：书只用书名
let index: Map<string, BookRecord> | null = null;
let indexedVersion = -1;
const getIndex = (): Map<string, BookRecord> => {
  if (!index || indexedVersion !== bookDataVersion) {
    index = buildCatalogIndex(bookRecords, (record) => [record.title]);
    indexedVersion = bookDataVersion;
  }
  return index;
};

export interface CatalogHit { record: BookRecord; exact: boolean }

export function matchInCatalog(title: string): CatalogHit | null {
  return matchCatalog(title, getIndex());
}

// 这本书用户读过吗（命中本地豆瓣读书全集 = 已读）。用于推荐时把已读的剔除/标注。
export function seenBefore(title: string): BookRecord | null {
  const h = matchInCatalog(title);
  return h ? h.record : null;
}
