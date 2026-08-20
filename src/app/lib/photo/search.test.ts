import { describe, expect, it } from 'vitest';
import {
  clearPhotoSearchHistory, explainPhotoSearchMatch, getPhotoSearchHistory,
  matchesPhotoSearchConstraints, mergePhotoSearchResults, rememberPhotoSearch, searchPhotoRadar, type SearchablePhoto,
} from './search';

function item(key: string, tags: string[], creationTime: number, gps = false, documentText = ''): SearchablePhoto {
  return {
    asset: {
      key, assetId: key, source: 'native-library', access: 'full', mediaType: 'image', mimeType: 'image/jpeg',
      fileName: `${key}.jpg`, width: 100, height: 100, creationTime,
      ...(gps ? { latitude: 30, longitude: 120 } : {}),
      indexedAt: 1, lastSeenAt: 1, analysisState: 'analyzed',
    },
    analysis: {
      key, assetId: key, contentHash: key, photoType: documentText ? 'document' : 'life', technicalQuality: 70,
      preferenceConfidence: 0, confidence: 0.8, verdict: 'keep', pinnable: gps, needPlace: !gps,
      tags, reasons: [], visionBackend: 'local-features', analyzedAt: 1,
      ...(documentText ? { document: { kind: 'receipt', text: documentText, identifiers: [], confidence: 0.8, route: 'base', qualityScore: 0.8, qualityGate: 'base-accepted' } } : {}),
    },
  };
}

describe('photo radar search', () => {
  const now = new Date('2026-08-11T00:00:00+08:00');
  const data = [
    item('cat-hangzhou', ['猫', '杭州'], new Date('2025-05-01').getTime(), true),
    item('cat-no-gps', ['猫', '西湖'], new Date('2025-06-01').getTime()),
    item('parking-receipt', ['票据', '停车'], new Date('2026-07-01').getTime(), false, '停车费 20 元'),
  ];

  it('combines time, place and object terms', () => {
    expect(searchPhotoRadar(data, '去年杭州拍的猫', now).map((x) => x.asset.key)).toEqual(['cat-hangzhou']);
  });

  it('supports document and GPS absence filters', () => {
    expect(searchPhotoRadar(data, '所有停车票据', now).map((x) => x.asset.key)).toEqual(['parking-receipt']);
    expect(searchPhotoRadar(data, '没有 GPS 但像西湖的照片', now).map((x) => x.asset.key)).toEqual(['cat-no-gps']);
  });

  it('preserves Chinese place names containing 中/里 and combines adjacent local tags', () => {
    const extended = [
      ...data,
      item('zhongshan-cat', ['中山公园', '猫'], new Date('2026-05-01').getTime()),
      item('paris-dog', ['巴黎', '旅行', '狗'], new Date('2026-05-02').getTime()),
      item('tokyo-friend', ['东京', '旅行', '朋友'], new Date('2026-05-03').getTime()),
      item('shanghai-friend', ['上海', '旅行', '朋友'], new Date('2026-05-04').getTime()),
    ];
    expect(searchPhotoRadar(extended, '中山公园的猫', now).map((x) => x.asset.key)).toEqual(['zhongshan-cat']);
    expect(searchPhotoRadar(extended, '巴黎旅行的狗', now).map((x) => x.asset.key)).toEqual(['paris-dog']);
    expect(searchPhotoRadar(extended, '东京旅行中有朋友的照片', now).map((x) => x.asset.key)).toEqual(['tokyo-friend']);
  });

  it('keeps time and GPS constraints available to semantic ranking', () => {
    expect(data.filter((entry) => matchesPhotoSearchConstraints(entry, '去年带 GPS 的照片', now)).map((entry) => entry.asset.key)).toEqual(['cat-hangzhou']);
  });

  it('explains deterministic and semantic match sources without exposing OCR text', () => {
    const reasons = explainPhotoSearchMatch(data[2], '所有停车票据', 0.23, now);
    expect(reasons.map((reason) => reason.kind)).toEqual(['tag', 'ocr', 'semantic']);
    expect(reasons.map((reason) => reason.label).join(' ')).not.toContain('20 元');
  });

  it('keeps a bounded, local and clearable search history', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    rememberPhotoSearch('  去年杭州拍的猫  ', storage);
    rememberPhotoSearch('停车票据', storage);
    rememberPhotoSearch('去年杭州拍的猫', storage);
    expect(getPhotoSearchHistory(storage)).toEqual(['去年杭州拍的猫', '停车票据']);
    clearPhotoSearchHistory(storage);
    expect(getPhotoSearchHistory(storage)).toEqual([]);
  });

  it('merges a 5000-item literal set with semantic candidates without changing hard GPS constraints', () => {
    const large = Array.from({ length: 5_000 }, (_, index) => item(
      `photo-${index}`, index % 10 === 0 ? ['猫'] : ['风景'], new Date(2025, 0, 1 + index).getTime(), index % 2 === 0,
    ));
    const query = '去年带 GPS 的照片';
    const literal = searchPhotoRadar(large, query, now);
    const semantic = large.slice(0, 60).map((entry, index) => ({ key: entry.asset.key, score: 0.9 - index / 100 }));
    const merged = mergePhotoSearchResults(large, literal, semantic, query);
    expect(merged.length).toBeGreaterThan(0);
    expect(merged.every((entry) => entry.asset.latitude != null && new Date(entry.asset.creationTime!).getFullYear() === 2025)).toBe(true);
  });
});
