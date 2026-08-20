import type { PhotoAssetIndex } from './libraryTypes';
import type { PhotoRadarAnalysis } from './radarTypes';

export interface SearchablePhoto {
  asset: PhotoAssetIndex;
  analysis: PhotoRadarAnalysis;
}

export type PhotoSearchMatchKind = 'time' | 'gps' | 'tag' | 'ocr' | 'semantic';
export interface PhotoSearchMatchReason { kind: PhotoSearchMatchKind; label: string }

const SEARCH_HISTORY_KEY = 'pe.photoSearchHistory.v1';
const SEARCH_HISTORY_LIMIT = 8;

const SYNONYMS: Array<[RegExp, string[]]> = [
  [/猫|cat|kitten/i, ['猫', 'cat', 'kitten', '宠物']],
  [/狗|dog|puppy/i, ['狗', 'dog', 'puppy', '宠物']],
  [/票据|发票|小票|receipt/i, ['票据', '发票', '小票', 'receipt', 'document']],
  [/登机牌|boarding/i, ['登机牌', 'boarding-pass']],
  [/二维码|qr/i, ['二维码', 'qr-code']],
  [/朋友|人物|人像|people|friend/i, ['朋友', '人物', '人像', 'people', 'person']],
  [/停车|parking/i, ['停车', 'parking']],
  [/截图|screenshot/i, ['截图', 'screenshot']],
];

function normalizedText(item: SearchablePhoto): string {
  const { asset, analysis } = item;
  return [asset.fileName, analysis.photoType, ...analysis.tags, ...analysis.reasons,
    analysis.document?.kind, analysis.document?.text, analysis.document?.merchant,
    ...(analysis.document?.identifiers || [])].filter(Boolean).join(' ').toLowerCase();
}

function queryYearRange(query: string, now: Date): { from?: number; to?: number } {
  if (/去年/.test(query)) {
    const year = now.getFullYear() - 1;
    return { from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime() - 1 };
  }
  const match = query.match(/(?:19|20)\d{2}/);
  if (!match) return {};
  const year = Number(match[0]);
  return { from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime() - 1 };
}

export function explainPhotoSearchMatch(
  item: SearchablePhoto,
  query: string,
  semanticScore?: number,
  now = new Date(),
): PhotoSearchMatchReason[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const reasons: PhotoSearchMatchReason[] = [];
  const { from } = queryYearRange(q, now);
  if (from != null && item.asset.creationTime) {
    const year = new Date(item.asset.creationTime).getFullYear();
    reasons.push({ kind: 'time', label: `时间 ${year}` });
  }
  const requireNoGps = /没有\s*gps|无\s*gps|no\s*gps/i.test(q);
  const requireGps = !requireNoGps && /带\s*gps|有\s*gps|定位/i.test(q);
  if (requireNoGps) reasons.push({ kind: 'gps', label: '无 GPS' });
  else if (requireGps) reasons.push({ kind: 'gps', label: '有 GPS' });

  const tagText = [item.analysis.photoType, ...item.analysis.tags, ...item.analysis.reasons].filter(Boolean).join(' ').toLowerCase();
  const ocrText = [item.analysis.document?.kind, item.analysis.document?.text, item.analysis.document?.merchant,
    ...(item.analysis.document?.identifiers || [])].filter(Boolean).join(' ').toLowerCase();
  const groups = SYNONYMS.filter(([pattern]) => pattern.test(q));
  const tagHits = groups.flatMap(([, terms]) => terms).filter((term) => tagText.includes(term.toLowerCase()));
  const ocrHits = groups.flatMap(([, terms]) => terms).filter((term) => ocrText.includes(term.toLowerCase()));
  if (tagHits.length) reasons.push({ kind: 'tag', label: `标签 ${[...new Set(tagHits)].slice(0, 2).join(' / ')}` });
  if (ocrHits.length) reasons.push({ kind: 'ocr', label: `OCR ${[...new Set(ocrHits)].slice(0, 2).join(' / ')}` });
  if (semanticScore != null) reasons.push({ kind: 'semantic', label: `语义 ${Math.round(semanticScore * 100)}` });
  return reasons;
}

type PhotoSearchStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function defaultStorage(): PhotoSearchStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

export function getPhotoSearchHistory(storage = defaultStorage()): string[] {
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem(SEARCH_HISTORY_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 1).slice(0, SEARCH_HISTORY_LIMIT) : [];
  } catch { return []; }
}

export function rememberPhotoSearch(query: string, storage = defaultStorage()): string[] {
  const normalized = query.trim().replace(/\s+/g, ' ');
  if (!storage || normalized.length < 2) return getPhotoSearchHistory(storage);
  const next = [normalized, ...getPhotoSearchHistory(storage).filter((item) => item !== normalized)].slice(0, SEARCH_HISTORY_LIMIT);
  try { storage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

export function clearPhotoSearchHistory(storage = defaultStorage()): void {
  try { storage?.removeItem(SEARCH_HISTORY_KEY); } catch { /* private mode */ }
}

export function matchesPhotoSearchConstraints(item: SearchablePhoto, query: string, now = new Date()): boolean {
  const q = query.trim().toLowerCase();
  const requireNoGps = /没有\s*gps|无\s*gps|no\s*gps/i.test(q);
  const requireGps = !requireNoGps && /带\s*gps|有\s*gps|定位/i.test(q);
  const hasGps = item.asset.latitude != null && item.asset.longitude != null;
  if (requireNoGps && hasGps) return false;
  if (requireGps && !hasGps) return false;
  const { from, to } = queryYearRange(q, now);
  const time = item.asset.creationTime;
  return from == null || !!time && time >= from && time <= (to || Number.MAX_SAFE_INTEGER);
}

export function searchPhotoRadar(items: SearchablePhoto[], query: string, now = new Date()): SearchablePhoto[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice().sort((a, b) => (b.asset.creationTime || 0) - (a.asset.creationTime || 0));
  const requireNoGps = /没有\s*gps|无\s*gps|no\s*gps/i.test(q);
  const requireGps = !requireNoGps && /带\s*gps|有\s*gps|定位/i.test(q);
  const { from } = queryYearRange(q, now);
  const groups = SYNONYMS.filter(([pattern]) => pattern.test(q)).map(([, terms]) => terms);
  const control = /(?:19|20)\d{2}|去年|今年|没有\s*gps|无\s*gps|带\s*gps|有\s*gps|gps|照片|所有|拍的|中的|中有|里有|里面|适合|但像|像|找/gi;
  let freeText = q.replace(control, ' ');
  for (const [pattern] of SYNONYMS) freeText = freeText.replace(pattern, ' ');
  freeText = freeText.replace(/(^|\s)的/g, '$1').replace(/[的带有](?=\s|$)/g, ' ');
  const freeTokens = freeText.split(/[\s,，。/]+/).filter((token) => token.length >= 2);

  return items.map((item) => {
    const text = normalizedText(item);
    const compactText = text.replace(/\s+/g, '');
    if (!matchesPhotoSearchConstraints(item, q, now)) return { item, score: -1 };
    let score = (requireNoGps || requireGps ? 1 : 0) + (from != null ? 1 : 0);
    for (const terms of groups) {
      const hits = terms.filter((term) => text.includes(term.toLowerCase())).length;
      if (!hits) return { item, score: -1 };
      score += 4 + hits;
    }
    for (const token of freeTokens) {
      if (!text.includes(token) && !compactText.includes(token)) return { item, score: -1 };
      score += 2;
    }
    if (!groups.length && freeTokens.length && score === 0) return { item, score: -1 };
    score += (item.analysis.confidence || 0) * 0.1;
    return { item, score };
  }).filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || (b.item.asset.creationTime || 0) - (a.item.asset.creationTime || 0))
    .map((entry) => entry.item);
}

/** Merge deterministic and semantic candidates with O(n) lookups before the final sort. */
export function mergePhotoSearchResults(
  searchable: SearchablePhoto[],
  literal: SearchablePhoto[],
  semantic: Array<{ key: string; score: number }>,
  query: string,
  minimumSemanticScore = 0.14,
): SearchablePhoto[] {
  if (!query.trim()) return literal;
  const searchableByKey = new Map(searchable.map((item) => [item.asset.key, item]));
  const literalKeys = new Set(literal.map((item) => item.asset.key));
  const semanticScores = new Map(semantic.map((match) => [match.key, match.score]));
  const merged = new Map(literal.map((item) => [item.asset.key, item]));
  for (const match of semantic) {
    if (match.score < minimumSemanticScore) continue;
    const item = searchableByKey.get(match.key);
    if (item && matchesPhotoSearchConstraints(item, query)) merged.set(item.asset.key, item);
  }
  return [...merged.values()].sort((left, right) => {
    const literalOrder = Number(literalKeys.has(right.asset.key)) - Number(literalKeys.has(left.asset.key));
    if (literalOrder) return literalOrder;
    const semanticOrder = (semanticScores.get(right.asset.key) || 0) - (semanticScores.get(left.asset.key) || 0);
    return semanticOrder || (right.asset.creationTime || 0) - (left.asset.creationTime || 0) || left.asset.key.localeCompare(right.asset.key);
  });
}
