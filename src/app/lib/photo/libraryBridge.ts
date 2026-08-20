import { Capacitor, registerPlugin } from '@capacitor/core';
import { PhotoLibrary, type PhotoLibraryAsset as NativePhotoAsset } from '@capgo/capacitor-photo-library';
import type {
  PhotoAssetIndex,
  PhotoLibraryAccess,
  PhotoLibraryAsset,
  PhotoLibraryAuthorization,
  PhotoLibraryCapabilities,
  PhotoLibraryPage,
  PhotoLibrarySource,
} from './libraryTypes';

const DEFAULT_PAGE_SIZE = 120;
const THUMB_SIZE = 320;

interface PocketPhotoAssetRouterPlugin {
  openInSystemGallery(options: { id: string }): Promise<{ opened: boolean }>;
  clearAppPhotoCache(): Promise<{ removed: number }>;
}

const PocketPhotoAssetRouter = registerPlugin<PocketPhotoAssetRouterPlugin>('PocketPhotoAssetRouter');

export type PhotoAuthorizationTransition = 'stable' | 'restart' | 'revoked';

export function photoAuthorizationTransition(
  initial: Extract<PhotoLibraryAuthorization, 'authorized' | 'limited'>,
  current: PhotoLibraryAuthorization,
): PhotoAuthorizationTransition {
  if (initial === current) return 'stable';
  return current === 'authorized' || current === 'limited' ? 'restart' : 'revoked';
}

const numericTime = (value?: string): number | undefined => {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const displayableUrl = (file?: { path: string; webPath: string }): string | undefined => {
  if (!file) return undefined;
  return file.webPath || (file.path ? Capacitor.convertFileSrc(file.path) : undefined);
};

export function photoAssetKey(source: PhotoLibrarySource, assetId: string): string {
  return `${source}:${assetId}`;
}

export function mapNativeAsset(
  asset: NativePhotoAsset,
  source: Extract<PhotoLibrarySource, 'native-library' | 'native-picker'>,
  access: PhotoLibraryAccess,
  now = Date.now(),
): PhotoLibraryAsset {
  const thumbnailUrl = displayableUrl(asset.thumbnail);
  return {
    schemaVersion: 1,
    key: photoAssetKey(source, asset.id),
    assetId: asset.id,
    source,
    access,
    mediaType: asset.type,
    mimeType: asset.mimeType || (asset.type === 'video' ? 'video/*' : 'image/*'),
    fileName: asset.fileName || `photo-${asset.id}`,
    width: Math.max(0, asset.width || 0),
    height: Math.max(0, asset.height || 0),
    byteSize: Math.max(0, asset.size || 0) || undefined,
    duration: asset.duration,
    creationTime: numericTime(asset.creationDate),
    modificationTime: numericTime(asset.modificationDate),
    latitude: asset.latitude,
    longitude: asset.longitude,
    thumbnailRef: thumbnailUrl,
    thumbnailUrl,
    indexedAt: now,
    lastSeenAt: now,
    analysisState: 'pending',
    sourceState: 'available',
  };
}

function webAssetId(file: File): string {
  const raw = `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16)}-${file.size}-${file.lastModified}`;
}

export function mapWebFile(file: File, now = Date.now()): PhotoLibraryAsset {
  const assetId = webAssetId(file);
  return {
    schemaVersion: 1,
    key: photoAssetKey('web-picker', assetId),
    assetId,
    source: 'web-picker',
    access: 'selected',
    mediaType: file.type.startsWith('video/') ? 'video' : 'image',
    mimeType: file.type || 'image/*',
    fileName: file.name,
    width: 0,
    height: 0,
    byteSize: file.size,
    creationTime: file.lastModified || undefined,
    modificationTime: file.lastModified || undefined,
    indexedAt: now,
    lastSeenAt: now,
    analysisState: 'pending',
    sourceState: 'available',
    thumbnailUrl: URL.createObjectURL(file),
    localFile: file,
  };
}

export function toPersistedAsset(asset: PhotoLibraryAsset): PhotoAssetIndex {
  const thumbnailRef = asset.source !== 'web-picker' && asset.thumbnailRef
    && !asset.thumbnailRef.startsWith('blob:') && !asset.thumbnailRef.startsWith('data:')
    ? asset.thumbnailRef
    : undefined;
  return {
    schemaVersion: 1,
    key: asset.key,
    assetId: asset.assetId,
    source: asset.source,
    access: asset.access,
    mediaType: asset.mediaType,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    width: asset.width,
    height: asset.height,
    byteSize: asset.byteSize,
    duration: asset.duration,
    creationTime: asset.creationTime,
    modificationTime: asset.modificationTime,
    latitude: asset.latitude,
    longitude: asset.longitude,
    thumbnailRef,
    indexedAt: asset.indexedAt,
    lastSeenAt: asset.lastSeenAt,
    analysisState: asset.analysisState,
    sourceState: asset.sourceState,
  };
}

export function getPhotoLibraryCapabilities(): PhotoLibraryCapabilities {
  const native = Capacitor.isNativePlatform();
  return {
    native,
    canEnumerateLibrary: native,
    canUseSystemPicker: native,
    fallback: native ? 'system-library' : 'file-picker',
  };
}

export async function checkPhotoAuthorization(): Promise<PhotoLibraryAuthorization> {
  if (!Capacitor.isNativePlatform()) return 'web';
  const { state } = await PhotoLibrary.checkAuthorization();
  return state;
}

export async function requestPhotoAuthorization(): Promise<PhotoLibraryAuthorization> {
  if (!Capacitor.isNativePlatform()) return 'web';
  const { state } = await PhotoLibrary.requestAuthorization();
  return state;
}

export async function listPhotoLibrary(options: { offset?: number; limit?: number } = {}): Promise<PhotoLibraryPage> {
  if (!Capacitor.isNativePlatform()) {
    return { assets: [], totalCount: 0, hasMore: false, authorization: 'web' };
  }
  const authorization = await checkPhotoAuthorization();
  if (authorization !== 'authorized' && authorization !== 'limited') {
    return { assets: [], totalCount: 0, hasMore: false, authorization };
  }
  const result = await PhotoLibrary.getLibrary({
    offset: options.offset || 0,
    limit: options.limit || DEFAULT_PAGE_SIZE,
    includeImages: true,
    includeVideos: false,
    includeAlbumData: false,
    includeCloudData: true,
    includeFullResolutionData: false,
    thumbnailWidth: THUMB_SIZE,
    thumbnailHeight: THUMB_SIZE,
    thumbnailQuality: 0.66,
  });
  const access: PhotoLibraryAccess = authorization === 'limited' ? 'limited' : 'full';
  return {
    assets: result.assets.map((asset) => mapNativeAsset(asset, 'native-library', access)),
    totalCount: result.totalCount,
    hasMore: result.hasMore,
    authorization,
  };
}

export function importWebPhotos(files: FileList | File[]): PhotoLibraryAsset[] {
  return Array.from(files).filter((file) => file.type.startsWith('image/')).map((file) => mapWebFile(file));
}

/** Resolve the original only for an explicit user action. The URL is never stored in the photo index. */
export async function resolveOriginalPhotoUrl(asset: PhotoLibraryAsset): Promise<string> {
  if (asset.source === 'web-picker') {
    if (!asset.localFile) throw new Error('网页会话已结束，请重新选择这张照片。');
    return URL.createObjectURL(asset.localFile);
  }
  if (!Capacitor.isNativePlatform()) throw new Error('系统相册原片只能在手机应用中按需读取。');
  const file = await PhotoLibrary.getPhotoUrl({ id: asset.assetId });
  return displayableUrl(file) || '';
}

export type PhotoOriginalOpenMode = 'system-gallery' | 'session-url';

export function photoOriginalOpenMode(asset: PhotoLibraryAsset, platform = Capacitor.getPlatform()): PhotoOriginalOpenMode {
  return asset.source === 'native-library' && platform === 'android' ? 'system-gallery' : 'session-url';
}

/** Android MediaStore assets stay in the system library; Pocket Earth only routes to the OS viewer. */
export async function openPhotoOriginal(asset: PhotoLibraryAsset): Promise<{ mode: PhotoOriginalOpenMode; url?: string }> {
  const mode = photoOriginalOpenMode(asset);
  if (mode === 'system-gallery') {
    await PocketPhotoAssetRouter.openInSystemGallery({ id: asset.assetId });
    return { mode };
  }
  return { mode, url: await resolveOriginalPhotoUrl(asset) };
}

/** Clears app-private thumbnails/transient picker files only. It never calls MediaStore delete. */
export async function clearPhotoDerivedCache(): Promise<number> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return 0;
  try { return (await PocketPhotoAssetRouter.clearAppPhotoCache()).removed; } catch { return 0; }
}

export async function resolveThumbnailUrl(asset: PhotoLibraryAsset): Promise<string> {
  if (asset.thumbnailUrl) return asset.thumbnailUrl;
  if (asset.source === 'web-picker') return '';
  if (!Capacitor.isNativePlatform()) return asset.thumbnailRef || '';
  const file = await PhotoLibrary.getThumbnailUrl({ id: asset.assetId, width: THUMB_SIZE, height: THUMB_SIZE, quality: 0.66 });
  return displayableUrl(file) || '';
}

export function releaseSessionAsset(asset: PhotoLibraryAsset): void {
  if (asset.thumbnailUrl?.startsWith('blob:')) URL.revokeObjectURL(asset.thumbnailUrl);
}
