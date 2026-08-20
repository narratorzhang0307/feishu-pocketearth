import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoAssetIndex } from './libraryTypes';

const existing: PhotoAssetIndex = {
  schemaVersion: 1, key: 'native-library:image:1', assetId: 'image:1', source: 'native-library', access: 'full',
  mediaType: 'image', mimeType: 'image/jpeg', fileName: 'one.jpg', width: 100, height: 100,
  indexedAt: 1, lastSeenAt: 2, analysisState: 'analyzed', sourceState: 'available',
};

afterEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.doUnmock('../skills/keyedStore'); });

describe('photo library snapshot reconciliation', () => {
  it('never treats a limited authorization snapshot as deletion evidence', async () => {
    const put = vi.fn(); const putMany = vi.fn(); const all = vi.fn().mockResolvedValue([existing]);
    vi.doMock('../skills/keyedStore', () => ({ keyedStore: () => ({ get: vi.fn(), getMany: vi.fn(), put, putMany, all, del: vi.fn(), delMany: vi.fn() }) }));
    const { reconcileFullLibrarySnapshot } = await import('./libraryStore');
    expect(await reconcileFullLibrarySnapshot(new Set(), 'limited', 10)).toBe(0);
    expect(all).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled(); expect(putMany).not.toHaveBeenCalled();
  });

  it('marks unseen assets missing only after a completed full-library snapshot', async () => {
    const putMany = vi.fn();
    vi.doMock('../skills/keyedStore', () => ({ keyedStore: () => ({ get: vi.fn(), getMany: vi.fn(), put: vi.fn(), putMany, all: vi.fn().mockResolvedValue([existing]), del: vi.fn(), delMany: vi.fn() }) }));
    const { reconcileFullLibrarySnapshot } = await import('./libraryStore');
    expect(await reconcileFullLibrarySnapshot(new Set(), 'authorized', 10)).toBe(1);
    expect(putMany).toHaveBeenCalledWith([expect.objectContaining({ key: existing.key, sourceState: 'missing' })]);
  });

  it('upserts a 5000-asset snapshot with one read and one bulk write', async () => {
    const all = vi.fn(); const get = vi.fn(); const getMany = vi.fn().mockResolvedValue([]); const put = vi.fn(); const putMany = vi.fn();
    vi.doMock('../skills/keyedStore', () => ({ keyedStore: () => ({ get, getMany, put, putMany, all, del: vi.fn(), delMany: vi.fn() }) }));
    const { upsertIndexedAssets } = await import('./libraryStore');
    const assets = Array.from({ length: 5_000 }, (_, index) => ({
      ...existing, key: `native:${index}`, assetId: String(index), fileName: `${index}.jpg`, sourceState: 'available' as const,
    }));
    await upsertIndexedAssets(assets);
    expect(getMany).toHaveBeenCalledTimes(1); expect(getMany.mock.calls[0][0]).toHaveLength(5_000);
    expect(all).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
    expect(putMany).toHaveBeenCalledTimes(1); expect(putMany.mock.calls[0][0]).toHaveLength(5_000);
  });
});
