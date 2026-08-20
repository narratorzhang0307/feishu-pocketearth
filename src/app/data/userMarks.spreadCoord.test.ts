import { describe, expect, it } from 'vitest';
import { spreadCoord } from './userMarks';

describe('spreadCoord 抖散后坐标始终合规', () => {
  it('普通点位：抖散幅度在 amp 范围内、坐标合法', () => {
    const [lng, lat] = spreadCoord('seed-1', 121.47, 31.23);
    expect(lng).toBeGreaterThanOrEqual(-180);
    expect(lng).toBeLessThanOrEqual(180);
    expect(lat).toBeGreaterThanOrEqual(-90);
    expect(lat).toBeLessThanOrEqual(90);
    // 应在原点 ±(amp/2) 邻域内
    expect(Math.abs(lng - 121.47)).toBeLessThanOrEqual(0.7 + 1e-9);
    expect(Math.abs(lat - 31.23)).toBeLessThanOrEqual(0.7 + 1e-9);
  });

  it('确定性：同 seed 同输入必得同结果', () => {
    expect(spreadCoord('same', 10, 20)).toEqual(spreadCoord('same', 10, 20));
  });

  it('近东日界线：抖散溢出 +180 时按地球回绕，不产生非法经度', () => {
    // 大量 seed 覆盖抖散的正负两侧，确保没有一个溢出 [-180,180]
    for (let i = 0; i < 200; i++) {
      const [lng] = spreadCoord(`dateline-e-${i}`, 179.9, 0);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }
  });

  it('近西日界线：抖散溢出 -180 时同样回绕', () => {
    for (let i = 0; i < 200; i++) {
      const [lng] = spreadCoord(`dateline-w-${i}`, -179.9, 0);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }
  });

  it('近极点：纬度抖散溢出 ±90 时被 clamp', () => {
    for (let i = 0; i < 200; i++) {
      const [, latN] = spreadCoord(`pole-n-${i}`, 0, 89.8);
      const [, latS] = spreadCoord(`pole-s-${i}`, 0, -89.8);
      expect(latN).toBeLessThanOrEqual(90);
      expect(latS).toBeGreaterThanOrEqual(-90);
    }
  });
});
