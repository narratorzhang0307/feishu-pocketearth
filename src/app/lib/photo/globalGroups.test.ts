import { describe, expect, it } from 'vitest';
import { reconcileRadarGroups } from './globalGroups';
import type { PhotoAssetIndex } from './libraryTypes';
import type { PhotoRadarAnalysis } from './radarTypes';

function asset(key: string, time: number, latitude = 30, longitude = 120): PhotoAssetIndex {
  return { key, assetId: key, source: 'native-library', access: 'full', mediaType: 'image', mimeType: 'image/jpeg', fileName: key, width: 10, height: 10, creationTime: time, latitude, longitude, indexedAt: 1, lastSeenAt: 1, analysisState: 'analyzed' };
}

function analysis(key: string, hash: string, quality: number): PhotoRadarAnalysis {
  return { key, assetId: key, contentHash: hash, photoType: 'life', technicalQuality: quality, preferenceConfidence: 0, confidence: 0.8, verdict: 'keep', pinnable: true, needPlace: false, tags: [], reasons: [], visionBackend: 'local-features', analyzedAt: 1 };
}

describe('global photo grouping', () => {
  it('groups similar photos across former batch boundaries and keeps a stable asset-key representative', () => {
    const time = new Date('2026-08-10T10:00:00Z').getTime();
    const output = reconcileRadarGroups(
      [asset('batch-a:item-1', time), asset('batch-b:item-2', time + 1000)],
      [analysis('batch-a:item-1', '0000000000000000', 82), analysis('batch-b:item-2', '0000000000000001', 65)],
    );
    const best = output.find((item) => item.key === 'batch-a:item-1')!;
    const other = output.find((item) => item.key === 'batch-b:item-2')!;
    expect(best.clusterId).toBe('event:batch-a:item-1');
    expect(other.clusterId).toBe(best.clusterId);
    expect(other.duplicateOf).toBe('batch-a:item-1');
    expect(other.verdict).toBe('review');
    expect(other.pinnable).toBe(false);
  });

  it('does not merge visually similar photos taken far apart', () => {
    const time = Date.now();
    const output = reconcileRadarGroups(
      [asset('hangzhou', time, 30.27, 120.15), asset('tokyo', time + 1000, 35.68, 139.76)],
      [analysis('hangzhou', '0000000000000000', 80), analysis('tokyo', '0000000000000000', 70)],
    );
    expect(output.every((item) => !item.duplicateOf && !item.clusterId)).toBe(true);
  });

  it('never routes consecutive screenshots through the ordinary photo duplicate cleaner', () => {
    const time = Date.now();
    const first = { ...analysis('shot-1', '0000000000000000', 80), photoType: 'screenshot' as const, verdict: 'review' as const, pinnable: false };
    const second = { ...analysis('shot-2', '0000000000000000', 70), photoType: 'screenshot' as const, verdict: 'review' as const, pinnable: false };
    const output = reconcileRadarGroups([asset('shot-1', time), asset('shot-2', time + 1000)], [first, second]);
    expect(output.every((item) => !item.duplicateOf && item.verdict === 'review')).toBe(true);
  });

  it('uses pHash as an additional candidate signal while preserving time and GPS guards', () => {
    const time = Date.now();
    const first = { ...analysis('one', '0000000000000000', 80), perceptualHash: 'aaaaaaaaaaaaaaaa' };
    const second = { ...analysis('two', 'ffffffffffffffff', 70), perceptualHash: 'aaaaaaaaaaaaaaab' };
    const output = reconcileRadarGroups([asset('one', time), asset('two', time + 1000)], [first, second]);
    expect(output.find((item) => item.key === 'two')?.duplicateOf).toBe('one');
  });

  it('breaks equal technical-quality ties with resolution rather than personal preference', () => {
    const time = Date.now();
    const low = { ...asset('low', time), width: 800, height: 600 };
    const high = { ...asset('high', time + 1000), width: 4000, height: 3000 };
    const lowAnalysis = { ...analysis('low', '0000000000000000', 80), personalAffinity: 99 };
    const highAnalysis = { ...analysis('high', '0000000000000001', 80), personalAffinity: 1 };
    const output = reconcileRadarGroups([low, high], [lowAnalysis, highAnalysis]);
    expect(output.find((item) => item.key === 'low')?.duplicateOf).toBe('high');
  });

  it('connects a real event across a 10-minute bucket boundary', () => {
    const boundary = Math.floor(Date.now() / (10 * 60 * 1000)) * (10 * 60 * 1000);
    const output = reconcileRadarGroups(
      [asset('before', boundary - 1_000), asset('after', boundary + 1_000)],
      [analysis('before', '0000000000000000', 80), analysis('after', 'ffffffffffffffff', 70)],
    );
    expect(output[0].clusterId).toBeTruthy();
    expect(output[1].clusterId).toBe(output[0].clusterId);
  });

  it('keeps a 5000-asset minute-spaced library within the desktop regression budget', () => {
    const startedAt = performance.now();
    const time = new Date('2026-01-01T00:00:00Z').getTime();
    const assets = Array.from({ length: 5_000 }, (_, index) => ({
      ...asset(`asset-${index}`, time + index * 60_000),
      latitude: -60 + (index % 120), longitude: 0,
    }));
    const analyses = assets.map((value, index) => analysis(value.key, index.toString(16).padStart(16, '0'), index % 100));
    const output = reconcileRadarGroups(assets, analyses);
    expect(output).toHaveLength(5_000);
    expect(performance.now() - startedAt).toBeLessThan(2_500);
  });
});
