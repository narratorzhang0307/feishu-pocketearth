import { decode } from '../skills/browserVision';
import { resolveThumbnailUrl } from './libraryBridge';
import type { PhotoLibraryAsset } from './libraryTypes';
import type { PhotoRadarAnalysis } from './radarTypes';

export const canonicalPhotoId = (analysis: Pick<PhotoRadarAnalysis, 'contentHash' | 'perceptualHash'>): string =>
  `photo:${analysis.contentHash}`;

/** Magazine and calendar are two views over one confirmed, deduplicated collection. */
export function buildCuratedPhotoAssets(assets: PhotoLibraryAsset[], analyses: PhotoRadarAnalysis[]): PhotoLibraryAsset[] {
  const byKey = new Map(assets.map((asset) => [asset.key, asset]));
  const seen = new Set<string>();
  const output: PhotoLibraryAsset[] = [];
  for (const analysis of analyses) {
    if (!analysis.chronicleIncluded || !analysis.curation || analysis.duplicateOf) continue;
    const asset = byKey.get(analysis.key);
    if (!asset) continue;
    const identity = analysis.contentHash || asset.key;
    if (seen.has(identity)) continue;
    seen.add(identity); output.push(asset);
  }
  for (const asset of assets) {
    if (!asset.curated) continue;
    const identity = asset.contentHash || asset.key;
    if (seen.has(identity)) continue;
    seen.add(identity); output.push(asset);
  }
  return output;
}

async function assetFile(asset: PhotoLibraryAsset): Promise<File | null> {
  if (asset.localFile) return asset.localFile;
  const url = await resolveThumbnailUrl(asset);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], asset.assetId || 'photo', { type: blob.type || 'image/jpeg' });
  } catch { return null; }
}

export async function photoDataUrl(asset: PhotoLibraryAsset, maxSide: number, quality: number): Promise<string> {
  const file = await assetFile(asset);
  if (!file) return '';
  const decoded = await decode(file, maxSide);
  if (!decoded) return '';
  try { return decoded.canvas.toDataURL('image/jpeg', quality); } catch { return ''; }
}

export async function photoCurationInput(asset: PhotoLibraryAsset, analysis: PhotoRadarAnalysis) {
  const image = await photoDataUrl(asset, 448, 0.72);
  if (!image) throw new Error('照片缩略图读取失败，请重新选择。');
  return {
    id: analysis.contentHash,
    image,
    technicalQuality: analysis.technicalQuality,
    tags: analysis.tags,
    fileName: asset.fileName,
  };
}

const dateText = (time?: number) => new Date(time || Date.now()).toISOString().slice(0, 10);
const shareablePhotoUrl = (value?: string) => /^https:\/\//i.test(String(value || '').trim()) ? String(value).trim() : '';

export async function curatedPhotoRecord(asset: PhotoLibraryAsset, analysis: PhotoRadarAnalysis) {
  // 飞书照片表只保存用户确认后的元数据与公开 HTTPS 缩略图。
  // blob:/data: 指向本机选择结果或内存副本，不能作为协作数据写出设备。
  const thumb = shareablePhotoUrl(asset.thumbnailUrl) || shareablePhotoUrl(asset.thumbnailRef);
  const suggested = analysis.curation?.location;
  const useSuggestion = asset.latitude == null && asset.longitude == null && suggested && suggested.confidence >= 0.6;
  return {
    id: canonicalPhotoId(analysis),
    title: asset.fileName || '精选照片',
    city: useSuggestion ? suggested.city || suggested.placeName : '',
    country: useSuggestion ? suggested.country : '',
    place: useSuggestion ? suggested.placeName : '',
    date: dateText(asset.creationTime || asset.modificationTime || asset.indexedAt),
    lat: asset.latitude ?? (useSuggestion ? suggested.latitude : null),
    lng: asset.longitude ?? (useSuggestion ? suggested.longitude : null),
    thumb,
    assetKey: asset.key,
    contentHash: analysis.contentHash,
    perceptualHash: analysis.perceptualHash || '',
    technicalQuality: analysis.technicalQuality,
    qwen: analysis.curation || null,
    curatedAt: new Date().toISOString(),
  };
}
