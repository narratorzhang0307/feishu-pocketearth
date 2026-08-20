// 重访邻近判定（纯函数，node 可测）：站回照片附近才让"重新贴合"。
// Web 上没有跨会话厘米级锚点（Cloud Anchors 无 Web 通道），v1 语义 = GPS 到附近 + 举起手机重贴合。
// 同思路先例：nearestCity(geoStickers.ts) / nearestVenue(exhibition/venues.ts)。

/** 球面距离（米）。haversine，与 photo/reasoning.ts 的 dist 同公式。 */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** "到附近了"的阈值：150m ≈ 民用 GPS 误差 + 一个街角的容差 */
export const NEARBY_THRESHOLD_M = 150;

export function isNearby(distanceM: number, thresholdM = NEARBY_THRESHOLD_M): boolean {
  return Number.isFinite(distanceM) && distanceM >= 0 && distanceM <= thresholdM;
}

/** 距离显示：<1km 米、<100km 一位小数公里、更远整公里 */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '未知距离';
  if (m < 1000) return `${Math.round(m)} 米`;
  if (m < 100000) return `${(m / 1000).toFixed(1)} 公里`;
  return `${Math.round(m / 1000)} 公里`;
}

/** 重访提示文案（诚实降级：无定位/无锚点坐标都说清楚） */
export function revisitHint(distanceM: number | null): { near: boolean; text: string } {
  if (distanceM == null || !Number.isFinite(distanceM)) {
    return { near: false, text: '拿不到当前定位 · 也可以直接打开重看' };
  }
  if (isNearby(distanceM)) {
    return { near: true, text: `你在照片附近（${formatDistance(distanceM)}）· 举起手机重新贴合` };
  }
  return { near: false, text: `距现场 ${formatDistance(distanceM)} · 到附近后可重新贴合` };
}
