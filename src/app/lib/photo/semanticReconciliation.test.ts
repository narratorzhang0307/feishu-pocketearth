import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoAssetIndex } from './libraryTypes';
import type { PhotoSemanticEmbedding } from './semantic';

const asset = (key: string, sourceState: PhotoAssetIndex['sourceState'] = 'available'): PhotoAssetIndex => ({
  key, assetId: key, source: 'native-library', access: 'full', mediaType: 'image', mimeType: 'image/jpeg',
  fileName: `${key}.jpg`, width: 10, height: 10, indexedAt: 1, lastSeenAt: 1, analysisState: 'analyzed', sourceState,
});

const embedding = (key: string): PhotoSemanticEmbedding => ({
  key, modelId: 'model', version: 'version', dimension: 2, quantization: 'symmetric-int8',
  vector: [1, 0], sourceModifiedAt: 1, generatedAt: 1,
});

afterEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.doUnmock('../skills/keyedStore'); });

describe('photo semantic reconciliation safety', () => {
  it('prunes a small number of derived orphan vectors after a trustworthy full snapshot', async () => {
    const del = vi.fn(); const delMany = vi.fn();
    const records = [embedding('a'), embedding('b'), embedding('c'), embedding('d'), embedding('gone')];
    vi.doMock('../skills/keyedStore', () => ({ keyedStore: () => ({ get: vi.fn(), put: vi.fn(), all: vi.fn().mockResolvedValue(records), del, delMany }) }));
    const { reconcilePhotoSemanticIndex } = await import('./semantic');
    const result = await reconcilePhotoSemanticIndex([asset('a'), asset('b'), asset('c'), asset('d')], { pruneOrphans: true });
    expect(result).toMatchObject({ orphaned: 1, removed: 1, retainedForSafety: false });
    expect(del).not.toHaveBeenCalled(); expect(delMany).toHaveBeenCalledWith(['gone']);
  });

  it('retains vectors when a sudden permission/snapshot change would remove more than 20%', async () => {
    const del = vi.fn(); const delMany = vi.fn();
    const records = [embedding('a'), embedding('b'), embedding('c'), embedding('d')];
    vi.doMock('../skills/keyedStore', () => ({ keyedStore: () => ({ get: vi.fn(), put: vi.fn(), all: vi.fn().mockResolvedValue(records), del, delMany }) }));
    const { reconcilePhotoSemanticIndex } = await import('./semantic');
    const result = await reconcilePhotoSemanticIndex([asset('a'), asset('b', 'permission-revoked')], { pruneOrphans: true });
    expect(result).toMatchObject({ orphaned: 3, removed: 0, retainedForSafety: true });
    expect(del).not.toHaveBeenCalled(); expect(delMany).not.toHaveBeenCalled();
  });
});
