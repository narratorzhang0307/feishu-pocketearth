import { keyedStore } from '../skills/keyedStore';
import type { PhotoAssetIndex, PhotoIndexCheckpoint, PhotoLibraryAsset } from './libraryTypes';
import { toPersistedAsset } from './libraryBridge';

const store = keyedStore<PhotoAssetIndex>('pe-photo-library-v1', 'key');
const CHECKPOINT_KEY = 'pe.photoIndexCheckpoint.v1';

export const getIndexedAsset = (key: string): Promise<PhotoAssetIndex | null> => store.get(key);
export const getIndexedAssets = (): Promise<PhotoAssetIndex[]> => store.all();
export const removeIndexedAsset = (key: string): Promise<void> => store.del(key);

export async function upsertIndexedAssets(assets: PhotoLibraryAsset[]): Promise<void> {
  if (!assets.length) return;
  const existing = new Map((await store.getMany(assets.map((asset) => asset.key))).map((asset) => [asset.key, asset]));
  await store.putMany(assets.map((asset) => {
    const current = existing.get(asset.key);
    const next = toPersistedAsset(asset);
    return {
      ...current,
      ...next,
      indexedAt: current?.indexedAt || next.indexedAt,
      analysisState: current?.analysisState || next.analysisState,
      schemaVersion: 1,
      sourceState: 'available',
    };
  }));
}

export function getPhotoIndexCheckpoint(): PhotoIndexCheckpoint | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as PhotoIndexCheckpoint;
    return value?.version === 1 && value.source === 'native-library' ? value : null;
  } catch { return null; }
}

export function savePhotoIndexCheckpoint(checkpoint: PhotoIndexCheckpoint): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint)); } catch { /* private mode */ }
}

export function clearPhotoIndexCheckpoint(): void {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(CHECKPOINT_KEY); } catch { /* private mode */ }
}

/** Only a completed full-library scan may mark unseen native assets missing. Limited access is not evidence of deletion. */
export async function reconcileFullLibrarySnapshot(
  seenKeys: Set<string>,
  authorization: 'authorized' | 'limited',
  completedAt = Date.now(),
): Promise<number> {
  if (authorization !== 'authorized') return 0;
  const all = await store.all();
  let missing = 0;
  const updates: PhotoAssetIndex[] = [];
  for (const asset of all) {
    if (asset.source !== 'native-library' || seenKeys.has(asset.key)) continue;
    updates.push({ ...asset, schemaVersion: 1, sourceState: 'missing', lastSeenAt: Math.min(asset.lastSeenAt, completedAt) });
    missing++;
  }
  await store.putMany(updates);
  return missing;
}

export async function markNativeLibraryUnavailable(): Promise<void> {
  const all = await store.all();
  await store.putMany(all.filter((asset) => asset.source === 'native-library')
    .map((asset) => ({ ...asset, schemaVersion: 1, sourceState: 'permission-revoked' })));
}

export async function estimatePhotoIndexStorage(): Promise<{ usage?: number; quota?: number }> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return {};
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage, quota: estimate.quota };
  } catch { return {}; }
}

export async function patchIndexedAsset(key: string, patch: Partial<PhotoAssetIndex>): Promise<PhotoAssetIndex | null> {
  const current = await store.get(key);
  if (!current) return null;
  const next = { ...current, ...patch, key: current.key, assetId: current.assetId };
  await store.put(next);
  return next;
}

export async function patchIndexedAssets(patches: Array<{ key: string; patch: Partial<PhotoAssetIndex> }>): Promise<number> {
  if (!patches.length) return 0;
  const current = new Map((await store.getMany(patches.map((entry) => entry.key))).map((asset) => [asset.key, asset]));
  const updates: PhotoAssetIndex[] = [];
  for (const entry of patches) {
    const asset = current.get(entry.key); if (!asset) continue;
    updates.push({ ...asset, ...entry.patch, key: asset.key, assetId: asset.assetId });
  }
  await store.putMany(updates);
  return updates.length;
}

export async function clearPhotoLibraryIndex(): Promise<void> {
  const all = await store.all();
  await store.delMany(all.map((asset) => asset.key));
  clearPhotoIndexCheckpoint();
}
