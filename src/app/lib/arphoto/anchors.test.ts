import { describe, it, expect } from 'vitest';
import { sanitizeAnchor, makeAnchorId, MAX_ANCHOR_PHOTOS } from './anchors';
import type { ArAnchor } from './types';

const base: ArAnchor = {
  id: 'ar-test-1',
  createdAt: '2026-07-05T12:00:00.000Z',
  label: '西湖边的下午',
  layout: 'cloud',
  mode: 'webxr',
  photos: [{ id: 'p1', thumb: 'data:image/jpeg;base64,aaa', image: 'data:image/jpeg;base64,bbb' }],
  geo: { lat: 30.246, lng: 120.14 },
  city: '杭州',
  pose: { position: [0, 1.4, -1], quaternion: [0, 0, 0, 1] },
};

describe('arphoto/anchors 锚点清洗护栏', () => {
  it('合法锚点原样通过（幂等）', () => {
    const s = sanitizeAnchor(base);
    expect(s).toEqual(base);
    expect(sanitizeAnchor(s)).toEqual(s);
  });

  it('非法坐标置空：NaN / 越界 / (0,0) 噪声', () => {
    expect(sanitizeAnchor({ ...base, geo: { lat: NaN, lng: 120 } }).geo).toBeNull();
    expect(sanitizeAnchor({ ...base, geo: { lat: 91, lng: 120 } }).geo).toBeNull();
    expect(sanitizeAnchor({ ...base, geo: { lat: 30, lng: 181 } }).geo).toBeNull();
    expect(sanitizeAnchor({ ...base, geo: { lat: 0, lng: 0 } }).geo).toBeNull();
    expect(sanitizeAnchor({ ...base, geo: null }).geo).toBeNull();
  });

  it('非法 pose 置空（含 Infinity）', () => {
    const bad = { position: [0, Infinity, 0], quaternion: [0, 0, 0, 1] } as ArAnchor['pose'];
    expect(sanitizeAnchor({ ...base, pose: bad }).pose).toBeNull();
    expect(sanitizeAnchor({ ...base, pose: null }).pose).toBeNull();
  });

  it('文本限长与兜底：label 空 → "AR 现场"，超长截断', () => {
    expect(sanitizeAnchor({ ...base, label: '   ' }).label).toBe('AR 现场');
    expect(sanitizeAnchor({ ...base, label: 'x'.repeat(200) }).label).toHaveLength(80);
    expect(sanitizeAnchor({ ...base, city: 'c'.repeat(100) }).city).toHaveLength(40);
  });

  it('照片封顶 + 超大 dataURL 降级', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: 'p' + i, thumb: 't', image: 'i' }));
    expect(sanitizeAnchor({ ...base, photos: many }).photos).toHaveLength(MAX_ANCHOR_PHOTOS);
    const huge = [{ id: 'p1', thumb: 't', image: 'x'.repeat(700_000) }];
    const s = sanitizeAnchor({ ...base, photos: huge });
    expect(s.photos[0].image).toBe('');       // 超限丢 image
    expect(s.photos[0].thumb).toBe('t');      // 保 thumb
  });

  it('枚举字段钳制到合法值', () => {
    const junk = { ...base, layout: 'weird', mode: 'vr' } as unknown as ArAnchor;
    const s = sanitizeAnchor(junk);
    expect(s.layout).toBe('single');
    expect(s.mode).toBe('preview');
  });

  it('makeAnchorId：ar- 前缀 + 时间可排序 + 唯一性', () => {
    const a = makeAnchorId(1751700000000);
    expect(a.startsWith('ar-')).toBe(true);
    const ids = new Set(Array.from({ length: 50 }, () => makeAnchorId()));
    expect(ids.size).toBe(50);
  });
});
