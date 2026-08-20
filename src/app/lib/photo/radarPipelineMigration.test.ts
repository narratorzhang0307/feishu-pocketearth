import { describe, expect, it } from 'vitest';
import { needsPhotoRadarAnalysis, PHOTO_RADAR_ALGORITHM_VERSION } from './radarPipeline';
import type { PhotoLibraryAsset } from './libraryTypes';
import type { PhotoRadarAnalysis } from './radarTypes';

const asset: PhotoLibraryAsset = {
  key: 'native-library:image:1', assetId: 'image:1', source: 'native-library', access: 'full', mediaType: 'image',
  mimeType: 'image/jpeg', fileName: 'one.jpg', width: 100, height: 100, indexedAt: 1, lastSeenAt: 1, analysisState: 'analyzed',
};
const analysis = (algorithmVersion: PhotoRadarAnalysis['algorithmVersion']): PhotoRadarAnalysis => ({
  key: asset.key, assetId: asset.assetId, contentHash: '0'.repeat(16), photoType: 'life', technicalQuality: 80,
  preferenceConfidence: 0, confidence: 0.8, verdict: 'keep', pinnable: false, needPlace: true, tags: [], reasons: [],
  visionBackend: 'local-features', algorithmVersion, analyzedAt: 1,
});

describe('photo radar derived-index migration', () => {
  it('reanalyzes v2 and missing analyses exactly once for pHash v3', () => {
    expect(needsPhotoRadarAnalysis(asset)).toBe(true);
    expect(needsPhotoRadarAnalysis(asset, analysis('photo-radar-dhash-v2'))).toBe(true);
    expect(needsPhotoRadarAnalysis(asset, analysis(PHOTO_RADAR_ALGORITHM_VERSION))).toBe(false);
  });

  it('never sends video assets through the still-photo pHash pipeline', () => {
    expect(needsPhotoRadarAnalysis({ ...asset, mediaType: 'video', mimeType: 'video/mp4' })).toBe(false);
  });
});
