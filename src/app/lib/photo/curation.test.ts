import { describe, expect, it } from 'vitest';
import { buildCuratedPhotoAssets, canonicalPhotoId, curatedPhotoRecord } from './curation';
import type { PhotoLibraryAsset } from './libraryTypes';
import type { PhotoRadarAnalysis } from './radarTypes';

const asset = (key: string, curated = false, contentHash?: string): PhotoLibraryAsset => ({
  key, assetId: key, source: 'web-picker', access: 'selected', mediaType: 'image', mimeType: 'image/jpeg', fileName: key,
  width: 10, height: 10, indexedAt: 1, lastSeenAt: 1, analysisState: 'analyzed', sourceState: 'available', thumbnailUrl: 'blob:test', curated, contentHash,
});
const analysis = (key: string, contentHash: string, included: boolean, duplicateOf?: string): PhotoRadarAnalysis => ({
  key, assetId: key, contentHash, photoType: 'life', technicalQuality: 80, preferenceConfidence: 0, confidence: 0.9,
  verdict: 'keep', pinnable: false, needPlace: false, chronicleIncluded: included, duplicateOf, tags: [], reasons: [], visionBackend: 'qwen-cloud', analyzedAt: 1,
  curation: { recommendation: 'keep', qualityScore: 80, storyScore: 80, summary: '值得保留', reasons: ['构图完整'], model: 'qwen', reviewedAt: 1 },
});

describe('photo curation gate', () => {
  it('only exposes human-confirmed representatives plus confirmed Feishu records', () => {
    const assets = [asset('a'), asset('b'), asset('c'), asset('feishu:x', true, 'hash-a')];
    const result = buildCuratedPhotoAssets(assets, [analysis('a', 'hash-a', true), analysis('b', 'hash-b', false), analysis('c', 'hash-c', true, 'a')]);
    expect(result.map((item) => item.key)).toEqual(['a']);
  });

  it('does not expose an old local confirmation that has no Qwen review evidence', () => {
    const old = analysis('a', 'hash-a', true);
    delete old.curation;
    expect(buildCuratedPhotoAssets([asset('a')], [old])).toEqual([]);
  });

  it('builds a stable Pocket ID from the canonical dHash', () => {
    expect(canonicalPhotoId({ contentHash: 'dh', perceptualHash: 'ph' })).toBe('photo:dh');
  });

  it('uses a human-confirmed AI location candidate when EXIF GPS is absent', async () => {
    const item = analysis('a', 'hash-a', true);
    item.curation!.location = { placeName: '杭州西湖', city: '杭州', country: '中国', latitude: 30.25, longitude: 120.15, confidence: 0.91, evidence: '文件名与画面地标一致' };
    await expect(curatedPhotoRecord(asset('a'), item)).resolves.toMatchObject({ city: '杭州', place: '杭州西湖', lat: 30.25, lng: 120.15 });
  });
});
