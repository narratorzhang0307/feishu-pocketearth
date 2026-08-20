export type PhotoLibrarySource = 'native-library' | 'native-picker' | 'web-picker';
export type PhotoLibraryAccess = 'full' | 'limited' | 'selected';
export type PhotoLibraryAuthorization = 'authorized' | 'limited' | 'denied' | 'notDetermined' | 'web';

/**
 * Stable, persistable description of one system photo asset.
 * It deliberately has no original image bytes or original-file URL.
 */
export interface PhotoAssetIndex {
  schemaVersion?: 1;
  key: string;
  assetId: string;
  source: PhotoLibrarySource;
  access: PhotoLibraryAccess;
  mediaType: 'image' | 'video';
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
  /** Original asset byte count from MediaStore/PhotoKit metadata; original bytes are not retained. */
  byteSize?: number;
  duration?: number;
  creationTime?: number;
  modificationTime?: number;
  latitude?: number;
  longitude?: number;
  /** Native cache reference only. No thumbnail bytes are written into IndexedDB. */
  thumbnailRef?: string;
  indexedAt: number;
  lastSeenAt: number;
  analysisState: 'pending' | 'analyzed' | 'failed';
  sourceState?: 'available' | 'missing' | 'permission-revoked';
}

export interface PhotoIndexCheckpoint {
  version: 1;
  source: 'native-library';
  authorization: Exclude<PhotoLibraryAuthorization, 'web' | 'notDetermined'>;
  offset: number;
  totalCount: number;
  startedAt: number;
  updatedAt: number;
  complete: boolean;
}

/** Session-only fields are never persisted. */
export interface PhotoLibraryAsset extends PhotoAssetIndex {
  thumbnailUrl?: string;
  localFile?: File;
}

export interface PhotoLibraryPage {
  assets: PhotoLibraryAsset[];
  totalCount: number;
  hasMore: boolean;
  authorization: PhotoLibraryAuthorization;
}

export interface PhotoLibraryCapabilities {
  native: boolean;
  canEnumerateLibrary: boolean;
  canUseSystemPicker: boolean;
  fallback: 'system-library' | 'file-picker';
}
