import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PhotoLibraryAsset } from './libraryTypes';

export type PhotoLocationAuthorization = 'authorized' | 'denied' | 'notRequired' | 'unsupported';

interface PocketPhotoLocationPlugin {
  checkPermission(): Promise<{ state: Exclude<PhotoLocationAuthorization, 'unsupported'> }>;
  requestPermission(): Promise<{ state: Exclude<PhotoLocationAuthorization, 'unsupported'> }>;
  getLocations(options: { ids: string[] }): Promise<{ locations: Array<{ id: string; latitude: number; longitude: number }> }>;
}

const PocketPhotoLocation = registerPlugin<PocketPhotoLocationPlugin>('PocketPhotoLocation');

export async function checkPhotoLocationAuthorization(): Promise<PhotoLocationAuthorization> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return 'unsupported';
  try { return (await PocketPhotoLocation.checkPermission()).state; } catch { return 'unsupported'; }
}

export async function requestPhotoLocationAuthorization(): Promise<PhotoLocationAuthorization> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return 'unsupported';
  try { return (await PocketPhotoLocation.requestPermission()).state; } catch { return 'denied'; }
}

export async function attachPhotoLocations(assets: PhotoLibraryAsset[]): Promise<PhotoLibraryAsset[]> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return assets;
  const locations = new Map<string, { latitude: number; longitude: number }>();
  const ids = assets.filter((asset) => asset.source === 'native-library' && asset.mediaType === 'image').map((asset) => asset.assetId);
  for (let offset = 0; offset < ids.length; offset += 200) {
    const result = await PocketPhotoLocation.getLocations({ ids: ids.slice(offset, offset + 200) });
    for (const location of result.locations) locations.set(location.id, location);
  }
  return assets.map((asset) => {
    const location = locations.get(asset.assetId);
    return location ? { ...asset, latitude: location.latitude, longitude: location.longitude } : asset;
  });
}

