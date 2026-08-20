import { hamming } from '../skills/browserVision';
import type { PhotoAssetIndex } from './libraryTypes';
import type { PhotoRadarAnalysis } from './radarTypes';

const TEN_MINUTES = 10 * 60 * 1000;
const EARTH_RADIUS_METERS = 6_371_000;

function distanceMeters(a: PhotoAssetIndex, b: PhotoAssetIndex): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const toRadians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toRadians;
  const dLng = (b.longitude - a.longitude) * toRadians;
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(a.latitude * toRadians) * Math.cos(b.latitude * toRadians) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(value)));
}

const isRealPhoto = (analysis: PhotoRadarAnalysis): boolean =>
  analysis.photoType === 'place' || analysis.photoType === 'life' || analysis.photoType === 'place_nogps';

function timeBucket(asset: PhotoAssetIndex): number | null {
  return asset.creationTime ? Math.floor(asset.creationTime / TEN_MINUTES) : null;
}

function hashDistance(left: PhotoRadarAnalysis, right: PhotoRadarAnalysis): { dHash: number; pHash: number } {
  return {
    dHash: hamming(left.contentHash, right.contentHash),
    pHash: left.perceptualHash && right.perceptualHash
      ? hamming(left.perceptualHash, right.perceptualHash)
      : Number.POSITIVE_INFINITY,
  };
}

function objectiveRepresentativeOrder(
  left: PhotoRadarAnalysis,
  right: PhotoRadarAnalysis,
  assetMap: Map<string, PhotoAssetIndex>,
): number {
  const quality = right.technicalQuality - left.technicalQuality;
  if (quality) return quality;
  const leftAsset = assetMap.get(left.key); const rightAsset = assetMap.get(right.key);
  const pixels = (rightAsset?.width || 0) * (rightAsset?.height || 0) - (leftAsset?.width || 0) * (leftAsset?.height || 0);
  if (pixels) return pixels;
  const bytes = (rightAsset?.byteSize || 0) - (leftAsset?.byteSize || 0);
  if (bytes) return bytes;
  const metadata = Number(rightAsset?.creationTime != null) + Number(rightAsset?.latitude != null)
    - Number(leftAsset?.creationTime != null) - Number(leftAsset?.latitude != null);
  return metadata || left.key.localeCompare(right.key);
}

/**
 * Rebuild duplicate and burst/event groups across all persisted batches.
 * Group references use stable asset keys, not content hashes or batch-local counters.
 */
export function reconcileRadarGroups(assets: PhotoAssetIndex[], analyses: PhotoRadarAnalysis[]): PhotoRadarAnalysis[] {
  const assetMap = new Map(assets.map((asset) => [asset.key, asset]));
  const next: PhotoRadarAnalysis[] = analyses.map((analysis) => ({
    ...analysis,
    duplicateOf: undefined,
    clusterId: undefined,
    similarRepresentative: undefined,
  }));
  // Duplicate candidates are compared only inside neighboring 10-minute buckets.
  const candidates = next.filter((analysis) => isRealPhoto(analysis)).sort((a, b) => objectiveRepresentativeOrder(a, b, assetMap));
  const representativeRank = new Map<string, number>();
  const representativesByBucket = new Map<number, PhotoRadarAnalysis[]>();
  const representativesByHash = new Map<string, PhotoRadarAnalysis[]>();
  const untimedRepresentativesByHash = new Map<string, PhotoRadarAnalysis[]>();
  const addRepresentative = (analysis: PhotoRadarAnalysis, asset: PhotoAssetIndex, rank: number) => {
    representativeRank.set(analysis.key, rank);
    const bucket = timeBucket(asset);
    if (bucket != null) {
      const values = representativesByBucket.get(bucket) || [];
      values.push(analysis); representativesByBucket.set(bucket, values);
    }
    const matchingHash = representativesByHash.get(analysis.contentHash) || [];
    matchingHash.push(analysis); representativesByHash.set(analysis.contentHash, matchingHash);
    if (bucket == null) {
      const untimed = untimedRepresentativesByHash.get(analysis.contentHash) || [];
      untimed.push(analysis); untimedRepresentativesByHash.set(analysis.contentHash, untimed);
    }
  };
  for (let rank = 0; rank < candidates.length; rank++) {
    const analysis = candidates[rank];
    const asset = assetMap.get(analysis.key); if (!asset) continue;
    const bucket = timeBucket(asset);
    const possible = bucket == null
      ? [...(representativesByHash.get(analysis.contentHash) || [])]
      : [bucket - 1, bucket, bucket + 1].flatMap((value) => representativesByBucket.get(value) || [])
        .concat(untimedRepresentativesByHash.get(analysis.contentHash) || []);
    possible.sort((left, right) => (representativeRank.get(left.key) || 0) - (representativeRank.get(right.key) || 0));
    const near = possible.find((kept) => {
      const keptAsset = assetMap.get(kept.key); if (!keptAsset) return false;
      const aTime = asset.creationTime; const bTime = keptAsset.creationTime;
      if (aTime && bTime && Math.abs(aTime - bTime) > TEN_MINUTES) return false;
      if ((!aTime || !bTime) && analysis.contentHash !== kept.contentHash) return false;
      const distance = distanceMeters(asset, keptAsset);
      if (distance != null && distance > 300) return false;
      const distanceHash = hashDistance(analysis, kept);
      return analysis.contentHash === kept.contentHash || distanceHash.dHash <= 6 || distanceHash.pHash <= 6;
    });
    if (!near) { addRepresentative(analysis, asset, rank); continue; }
    analysis.duplicateOf = near.key;
    analysis.verdict = 'review';
    analysis.pinnable = false;
    analysis.similarRepresentative = false;
    near.similarRepresentative = true;
    if (!analysis.tags.includes('疑似重复')) analysis.tags = [...analysis.tags, '疑似重复'];
    if (!analysis.reasons.some((reason) => reason.includes('疑似重复'))) analysis.reasons = [...analysis.reasons, '全局 dHash/pHash 与时空信号相似：仅建议比较，不自动删除'];
  }

  // Build connected event components across exact and neighboring bucket boundaries.
  const eventCandidates = next.filter((analysis) => {
    const asset = assetMap.get(analysis.key);
    return !!asset && isRealPhoto(analysis) && timeBucket(asset) != null;
  });
  const eventIndex = new Map(eventCandidates.map((analysis, index) => [analysis.key, index]));
  const parent = eventCandidates.map((_, index) => index);
  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) { const nextValue = parent[value]; parent[value] = root; value = nextValue; }
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left); const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  const compareForEvent = (left: PhotoRadarAnalysis, right: PhotoRadarAnalysis) => {
    const leftAsset = assetMap.get(left.key); const rightAsset = assetMap.get(right.key);
    if (!leftAsset?.creationTime || !rightAsset?.creationTime || Math.abs(leftAsset.creationTime - rightAsset.creationTime) > TEN_MINUTES) return;
    const distance = distanceMeters(leftAsset, rightAsset);
    const distanceHash = hashDistance(left, right);
    const visuallyNear = distanceHash.dHash <= 14 || distanceHash.pHash <= 14;
    if ((distance != null && distance <= 300) || (distance == null && visuallyNear)) union(eventIndex.get(left.key)!, eventIndex.get(right.key)!);
  };
  const realBuckets = new Map<number, PhotoRadarAnalysis[]>();
  for (const analysis of eventCandidates) {
    const bucket = timeBucket(assetMap.get(analysis.key)!);
    if (bucket == null) continue;
    const values = realBuckets.get(bucket) || [];
    values.push(analysis); realBuckets.set(bucket, values);
  }
  for (const [bucket, group] of realBuckets) {
    for (let left = 0; left < group.length; left++) {
      for (let right = left + 1; right < group.length; right++) compareForEvent(group[left], group[right]);
      for (const candidate of realBuckets.get(bucket + 1) || []) compareForEvent(group[left], candidate);
    }
  }
  const events = new Map<number, PhotoRadarAnalysis[]>();
  for (let index = 0; index < eventCandidates.length; index++) {
    const root = find(index); const values = events.get(root) || [];
    values.push(eventCandidates[index]); events.set(root, values);
  }
  for (const event of events.values()) {
    if (event.length < 2) continue;
    event.sort((a, b) => objectiveRepresentativeOrder(a, b, assetMap));
    const clusterId = `event:${event[0].key}`;
    event.forEach((analysis, index) => {
      analysis.clusterId = clusterId;
      analysis.similarRepresentative = index === 0;
      if (index > 0) analysis.pinnable = false;
    });
  }
  return next;
}
