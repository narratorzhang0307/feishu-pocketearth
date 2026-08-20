import { describe, expect, it, vi } from 'vitest';
import { mapNativeAsset, mapWebFile, photoAssetKey, photoAuthorizationTransition, photoOriginalOpenMode, toPersistedAsset } from './libraryBridge';

describe('photo library bridge', () => {
  it('maps native metadata without persisting an original file URL', () => {
    const mapped = mapNativeAsset({
      id: '42', fileName: 'IMG_0042.HEIC', type: 'image', width: 4032, height: 3024,
      creationDate: '2026-08-10T08:00:00.000Z', modificationDate: '2026-08-10T09:00:00.000Z',
      latitude: 30.2741, longitude: 120.1551, mimeType: 'image/heic',
      thumbnail: { path: '/cache/thumb.jpg', webPath: 'capacitor://localhost/_capacitor_file_/thumb.jpg', mimeType: 'image/jpeg', size: 1234 },
      file: { path: '/cache/original.heic', webPath: 'capacitor://localhost/_capacitor_file_/original.heic', mimeType: 'image/heic', size: 9000000 },
    }, 'native-library', 'full', 100);

    expect(mapped.key).toBe('native-library:42');
    expect(mapped.thumbnailUrl).toContain('thumb.jpg');
    expect(mapped).not.toHaveProperty('originalUrl');
    expect(toPersistedAsset(mapped)).not.toHaveProperty('localFile');
  });

  it('keeps web-picked Files session-only and strips blob references before persistence', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo-session');
    const file = new File(['photo'], 'cat.jpg', { type: 'image/jpeg', lastModified: 123 });
    const mapped = mapWebFile(file, 200);
    const persisted = toPersistedAsset(mapped);

    expect(mapped.localFile).toBe(file);
    expect(mapped.thumbnailUrl).toBe('blob:photo-session');
    expect(persisted).not.toHaveProperty('localFile');
    expect(persisted).not.toHaveProperty('thumbnailUrl');
    expect(persisted.thumbnailRef).toBeUndefined();
    createObjectURL.mockRestore();
  });

  it('namespaces system and picker assets independently', () => {
    expect(photoAssetKey('native-library', '7')).toBe('native-library:7');
    expect(photoAssetKey('native-picker', '7')).toBe('native-picker:7');
  });

  it('routes Android MediaStore originals to the system gallery', () => {
    const mapped = mapNativeAsset({
      id: 'image:42', fileName: 'IMG_0042.jpg', type: 'image', width: 100, height: 100,
      mimeType: 'image/jpeg',
    }, 'native-library', 'full');
    expect(photoOriginalOpenMode(mapped, 'android')).toBe('system-gallery');
    expect(photoOriginalOpenMode(mapped, 'ios')).toBe('session-url');
    expect(photoOriginalOpenMode({ ...mapped, source: 'native-picker' }, 'android')).toBe('session-url');
  });

  it('persists only the photo-index allowlist', () => {
    const mapped = mapNativeAsset({
      id: 'image:9', fileName: 'IMG_0009.jpg', type: 'image', width: 100, height: 100,
      mimeType: 'image/jpeg', thumbnail: { path: '/cache/t.jpg', webPath: 'data:image/jpeg;base64,abc', mimeType: 'image/jpeg', size: 3 },
    }, 'native-library', 'full') as ReturnType<typeof mapNativeAsset> & { originalUrl?: string; file?: unknown };
    mapped.originalUrl = 'file:///private/original.jpg';
    mapped.file = { bytes: 'original' };
    const persisted = toPersistedAsset(mapped);
    expect(persisted.thumbnailRef).toBeUndefined();
    expect(persisted).not.toHaveProperty('thumbnailUrl');
    expect(persisted).not.toHaveProperty('localFile');
    expect(persisted).not.toHaveProperty('originalUrl');
    expect(persisted).not.toHaveProperty('file');
  });

  it('fails closed when authorization changes during a paginated scan', () => {
    expect(photoAuthorizationTransition('authorized', 'authorized')).toBe('stable');
    expect(photoAuthorizationTransition('limited', 'limited')).toBe('stable');
    expect(photoAuthorizationTransition('authorized', 'limited')).toBe('restart');
    expect(photoAuthorizationTransition('limited', 'authorized')).toBe('restart');
    expect(photoAuthorizationTransition('authorized', 'denied')).toBe('revoked');
    expect(photoAuthorizationTransition('limited', 'notDetermined')).toBe('revoked');
  });
});
