import { describe, it, expect } from 'vitest';
import { haversineMeters, isNearby, formatDistance, revisitHint, NEARBY_THRESHOLD_M } from './nearby';

describe('arphoto/nearby 邻近判定', () => {
  it('haversine：零距离 / 对称 / 已知城市距离', () => {
    expect(haversineMeters(30.246, 120.14, 30.246, 120.14)).toBe(0);
    const ab = haversineMeters(30.246, 120.14, 39.9, 116.4);   // 杭州西湖 → 北京
    const ba = haversineMeters(39.9, 116.4, 30.246, 120.14);
    expect(ab).toBeCloseTo(ba, 6);
    expect(ab).toBeGreaterThan(1_100_000);
    expect(ab).toBeLessThan(1_300_000);
  });

  it('haversine：百米级精度（西湖边挪 ~0.001° 纬度 ≈ 111m）', () => {
    const d = haversineMeters(30.246, 120.14, 30.247, 120.14);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });

  it('isNearby：阈值边界', () => {
    expect(isNearby(0)).toBe(true);
    expect(isNearby(NEARBY_THRESHOLD_M)).toBe(true);
    expect(isNearby(NEARBY_THRESHOLD_M + 1)).toBe(false);
    expect(isNearby(NaN)).toBe(false);
    expect(isNearby(-1)).toBe(false);
    expect(isNearby(300, 500)).toBe(true);   // 自定义阈值
  });

  it('formatDistance：米 / 小数公里 / 整公里 / 非法', () => {
    expect(formatDistance(85)).toBe('85 米');
    expect(formatDistance(999)).toBe('999 米');
    expect(formatDistance(1234)).toBe('1.2 公里');
    expect(formatDistance(23_456)).toBe('23.5 公里');
    expect(formatDistance(230_000)).toBe('230 公里');
    expect(formatDistance(NaN)).toBe('未知距离');
    expect(formatDistance(-5)).toBe('未知距离');
  });

  it('revisitHint：近 / 远 / 无定位三态', () => {
    expect(revisitHint(80).near).toBe(true);
    expect(revisitHint(80).text).toContain('举起手机');
    expect(revisitHint(5000).near).toBe(false);
    expect(revisitHint(5000).text).toContain('5.0 公里');
    expect(revisitHint(null).near).toBe(false);
    expect(revisitHint(null).text).toContain('定位');
  });
});
