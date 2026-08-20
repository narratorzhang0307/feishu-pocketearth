import { describe, expect, it } from 'vitest';
import {
  normalizePhotoSemanticQuery, PHOTO_EMBEDDING_MODEL_ID, PHOTO_EMBEDDING_VERSION,
  filterSemanticMatchesToAvailableAssets, photoEmbeddingSimilarity, PhotoSemanticQueryCache, quantizePhotoEmbedding, rankPhotoEmbeddings,
  LatestPhotoSemanticQueue,
  type PhotoSemanticEmbedding,
} from './semantic';

const record = (key: string, vector: number[], version = PHOTO_EMBEDDING_VERSION): PhotoSemanticEmbedding => ({
  key, modelId: PHOTO_EMBEDDING_MODEL_ID, version, dimension: vector.length, quantization: 'symmetric-int8',
  vector: quantizePhotoEmbedding(vector), sourceModifiedAt: 1, generatedAt: 1,
});

describe('photo semantic index', () => {
  it('preserves cosine ordering after int8 quantization', () => {
    const query = quantizePhotoEmbedding([1, 0, 0]);
    const results = rankPhotoEmbeddings(query, [record('far', [0, 1, 0]), record('near', [0.9, 0.1, 0])]);
    expect(results.map((item) => item.key)).toEqual(['near', 'far']);
    expect(photoEmbeddingSimilarity(query, results[0].key === 'near' ? record('near', [0.9, 0.1, 0]).vector : [])).toBeGreaterThan(0.9);
  });

  it('ignores stale model versions without deleting user data', () => {
    const results = rankPhotoEmbeddings(quantizePhotoEmbedding([1, 0]), [record('current', [1, 0]), record('old', [1, 0], 'old-v0')]);
    expect(results.map((item) => item.key)).toEqual(['current']);
  });

  it('expands common Chinese photo intents locally', () => {
    expect(normalizePhotoSemanticQuery('去年杭州拍的猫和停车票据')).toContain('Hangzhou');
    expect(normalizePhotoSemanticQuery('去年杭州拍的猫和停车票据')).toContain('cat');
    expect(normalizePhotoSemanticQuery('去年杭州拍的猫和停车票据')).toContain('receipt');
  });

  it('keeps only the most recent local query vectors and refreshes LRU order', () => {
    const cache = new PhotoSemanticQueryCache(2);
    cache.put('杭州的猫', Int8Array.from([1, 2]));
    cache.put('停车票据', Int8Array.from([3, 4]));
    expect(cache.get('杭州的猫')).toEqual(Int8Array.from([1, 2]));
    cache.put('东京朋友', Int8Array.from([5, 6]));
    expect(cache.get('停车票据')).toBeNull();
    expect(cache.size).toBe(2);
  });

  it('never surfaces matches whose source is missing or permission-revoked', () => {
    const base = { assetId: '', source: 'native-library' as const, access: 'full' as const, mediaType: 'image' as const, mimeType: 'image/jpeg', fileName: '', width: 1, height: 1, indexedAt: 1, lastSeenAt: 1, analysisState: 'analyzed' as const };
    const matches = [{ key: 'available', score: 1 }, { key: 'missing', score: 0.9 }, { key: 'revoked', score: 0.8 }];
    expect(filterSemanticMatchesToAvailableAssets(matches, [
      { ...base, key: 'available', sourceState: 'available' },
      { ...base, key: 'missing', sourceState: 'missing' },
      { ...base, key: 'revoked', sourceState: 'permission-revoked' },
    ])).toEqual([{ key: 'available', score: 1 }]);
  });

  it('serializes text inference and coalesces queued searches to the latest query', async () => {
    const queue = new LatestPhotoSemanticQueue();
    let releaseFirst!: () => void;
    const started: string[] = [];
    const first = queue.run(async () => { started.push('first'); await new Promise<void>((resolve) => { releaseFirst = resolve; }); return 'first'; }, () => 'stale');
    await Promise.resolve();
    const second = queue.run(async () => { started.push('second'); return 'second'; }, () => 'stale');
    const third = queue.run(async () => { started.push('third'); return 'third'; }, () => 'stale');
    releaseFirst();
    expect(await first).toBe('stale');
    expect(await second).toBe('stale');
    expect(await third).toBe('third');
    expect(started).toEqual(['first', 'third']);
  });
});
