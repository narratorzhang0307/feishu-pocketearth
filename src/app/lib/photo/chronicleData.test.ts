import { describe, expect, it } from 'vitest';
import { buildPhotoChronicleData } from './chronicleData';
import type { PhotoLibraryAsset } from './libraryTypes';

const asset = (key: string, date: string, extra: Partial<PhotoLibraryAsset> = {}): PhotoLibraryAsset => ({
  key,
  assetId: key,
  source: 'native-library',
  access: 'full',
  mediaType: 'image',
  mimeType: 'image/jpeg',
  fileName: `${key}.jpg`,
  width: 100,
  height: 100,
  creationTime: new Date(`${date}T12:00:00`).getTime(),
  thumbnailRef: `content://thumb/${key}`,
  indexedAt: 1,
  lastSeenAt: 1,
  analysisState: 'pending',
  sourceState: 'available',
  ...extra,
});

describe('photo chronicle data', () => {
  it('builds all views from the same assets', () => {
    const result = buildPhotoChronicleData([
      asset('newer', '2025-12-21'),
      asset('same-day', '2025-12-21'),
      asset('older', '2021-05-14'),
    ]);
    expect(result.timelineGroups.map((group) => group.title)).toEqual(['2025.12', '2021.05']);
    expect(result.calendarMonths[0].days[21].count).toBe(2);
    expect(result.magazineYears.map((issue) => issue.year)).toEqual([2025, 2021]);
    expect(result.magazineYears.flatMap((issue) => issue.photos.map((photo) => photo.assetKey))).toEqual(['newer', 'same-day', 'older']);
  });

  it('excludes unavailable assets and needs no original URL', () => {
    const result = buildPhotoChronicleData([
      asset('available', '2025-01-01'),
      asset('missing', '2025-01-02', { sourceState: 'missing' }),
      asset('no-thumb', '2025-01-03', { thumbnailRef: undefined }),
    ]);
    expect(result.magazineYears[0].photos.map((photo) => photo.assetKey)).toEqual(['available']);
    expect(result.magazineYears[0].photos[0].full).toBe('content://thumb/available');
  });
});
