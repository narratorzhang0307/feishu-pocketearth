import { describe, it, expect } from 'vitest';
import {
  cloudLayout, singleLayout, layoutFor, hashSeed,
  CLOUD_RADIUS_MIN, CLOUD_RADIUS_MAX, CLOUD_Y_MIN, CLOUD_Y_MAX,
} from './layout';

describe('arphoto/layout 布局引擎', () => {
  it('singleLayout：一张、视线高度、无旋转', () => {
    const items = singleLayout();
    expect(items).toHaveLength(1);
    expect(items[0].position[1]).toBeCloseTo(1.4);
    expect(items[0].rotationY).toBe(0);
    expect(items[0].scale).toBe(1);
  });

  it('cloudLayout：数量正确 + 0/1 张退化', () => {
    expect(cloudLayout(0, 's')).toHaveLength(0);
    expect(cloudLayout(1, 's')).toHaveLength(1);   // 单张退化成 singleLayout
    expect(cloudLayout(8, 's')).toHaveLength(8);
    expect(cloudLayout(24, 's')).toHaveLength(24);
  });

  it('确定性：同 seed 同布局，异 seed 异布局', () => {
    const a = cloudLayout(10, 'anchor-1');
    const b = cloudLayout(10, 'anchor-1');
    const c = cloudLayout(10, 'anchor-2');
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('包络：半径/高度/缩放/俯仰全部在界内', () => {
    for (const seed of ['x', 'y', 'ar-photo-12345']) {
      for (const it2 of cloudLayout(16, seed)) {
        const [x, y, z] = it2.position;
        const r = Math.hypot(x, z);
        expect(r).toBeGreaterThanOrEqual(CLOUD_RADIUS_MIN - 1e-9);
        expect(r).toBeLessThanOrEqual(CLOUD_RADIUS_MAX + 1e-9);
        expect(y).toBeGreaterThanOrEqual(CLOUD_Y_MIN - 0.06 - 1e-9);
        expect(y).toBeLessThanOrEqual(CLOUD_Y_MAX + 0.06 + 1e-9);
        expect(it2.scale).toBeGreaterThanOrEqual(0.85);
        expect(it2.scale).toBeLessThanOrEqual(1.15);
        expect(Math.abs(it2.tilt)).toBeLessThanOrEqual(0.12 + 1e-9);
      }
    }
  });

  it('朝向中心：rotationY 指回中轴（相框法线对准观者）', () => {
    for (const it2 of cloudLayout(12, 'face')) {
      const [x, , z] = it2.position;
      const angleToCenter = Math.atan2(-x, -z);          // 从相框位置指向原点的方位
      const facing = Math.atan2(Math.sin(it2.rotationY), Math.cos(it2.rotationY));
      // rotationY = angle + PI，而 angle = atan2(x, z) ⇒ facing 应与 angleToCenter 同向
      const diff = Math.abs(Math.atan2(Math.sin(facing - angleToCenter), Math.cos(facing - angleToCenter)));
      expect(diff).toBeLessThan(1e-6);
    }
  });

  it('铺开：相邻两张的 3D 间距不塌成一团', () => {
    const items = cloudLayout(12, 'spread');
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1].position, b = items[i].position;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      expect(d).toBeGreaterThan(0.2);
    }
  });

  it('layoutFor 分发 + hashSeed 稳定', () => {
    expect(layoutFor('single', 5, 's')).toHaveLength(1);
    expect(layoutFor('cloud', 5, 's')).toHaveLength(5);
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });
});
