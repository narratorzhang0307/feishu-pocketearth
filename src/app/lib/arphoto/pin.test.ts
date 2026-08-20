import { describe, it, expect, beforeEach } from 'vitest';
// node 环境下 userMarks 的 localStorage 读写走 try/catch 静默降级 → 纯内存模式，可直接真测（photo/backup.test 同款思路）
import { getUserMarksByKind, removeUserMark } from '../../data/userMarks';
import { pinAnchorToEarth, unpinAnchor, isArPinned, arMarkId, arCityText, AR_PIN_PREFIX } from './pin';
import type { ArAnchor } from './types';

const anchor = (over: Partial<ArAnchor> = {}): ArAnchor => ({
  id: 'ar-t-' + Math.random().toString(36).slice(2, 8),
  createdAt: '2026-07-05T12:00:00.000Z',
  label: '西湖边的下午',
  layout: 'cloud',
  mode: 'webxr',
  photos: [{ id: 'p1', thumb: 'data:image/jpeg;base64,tt', image: 'data:image/jpeg;base64,ii' }],
  geo: { lat: 30.246, lng: 120.14 },
  city: '杭州',
  pose: null,
  ...over,
});

describe('arphoto/pin 落球（近场↔远场闭环）', () => {
  beforeEach(() => {
    // 清掉本域残留（只删 uarp- 前缀，不碰同 kind 的照片 agent 钉）
    getUserMarksByKind('photo')
      .filter((m) => m.id.startsWith(AR_PIN_PREFIX))
      .forEach((m) => removeUserMark(m.id));
  });

  it('精确坐标直落：不抖散、meta 契约齐全', () => {
    const a = anchor();
    const r = pinAnchorToEarth(a);
    expect(r.pinned).toBe(true);
    expect(r.markId).toBe(arMarkId(a.id));
    const mark = getUserMarksByKind('photo').find((m) => m.id === r.markId)!;
    expect(mark.lat).toBe(30.246);              // 精确坐标原样（无 spreadCoord）
    expect(mark.lng).toBe(120.14);
    expect(mark.meta).toEqual(expect.objectContaining({
      thumb: 'data:image/jpeg;base64,tt',
      full: 'data:image/jpeg;base64,tt',        // 灯箱兜底同 thumb（photo 域同约定）
      city: '杭州 · AR 锚点',
      source: 'user',
    }));
    const ar = (mark.meta as { ar: { anchorId: string; mode: string } }).ar;
    expect(ar.anchorId).toBe(a.id);
    expect(ar.mode).toBe('webxr');
  });

  it('无坐标 → needPlace 不钉', () => {
    const r = pinAnchorToEarth(anchor({ geo: null }));
    expect(r).toEqual({ pinned: false, reason: 'needPlace' });
  });

  it('幂等：重复钉 → exists 不重复落点', () => {
    const a = anchor();
    pinAnchorToEarth(a);
    const again = pinAnchorToEarth(a);
    expect(again.reason).toBe('exists');
    expect(getUserMarksByKind('photo').filter((m) => m.id === arMarkId(a.id))).toHaveLength(1);
  });

  it('isArPinned / unpinAnchor 闭环', () => {
    const a = anchor();
    expect(isArPinned(a.id)).toBe(false);
    pinAnchorToEarth(a);
    expect(isArPinned(a.id)).toBe(true);
    unpinAnchor(a.id);
    expect(isArPinned(a.id)).toBe(false);
  });

  it('不冒充照片 agent：meta 无 fromPhotoAgent 判别位', () => {
    const a = anchor();
    pinAnchorToEarth(a);
    const mark = getUserMarksByKind('photo').find((m) => m.id === arMarkId(a.id))!;
    expect((mark.meta as Record<string, unknown>).fromPhotoAgent).toBeUndefined();
  });

  it('arCityText：有城市 / 无城市', () => {
    expect(arCityText('杭州')).toBe('杭州 · AR 锚点');
    expect(arCityText('')).toBe('AR 锚点');
    expect(arCityText('  ')).toBe('AR 锚点');
  });

  it('前缀契约：uarp- 不与仓库现有 id 前缀冲突（撞了会互相误删/误认领）', () => {
    const TAKEN = ['umv-', 'ubk-', 'uca-', 'uex-', 'umu-', 'utr-', 'upt-', 'photo-', 'mood-', 'm-', 'p-', 'mu-', 'mv-', 'bk-'];
    expect(TAKEN).not.toContain(AR_PIN_PREFIX);
    // 互为前缀也不行（photo- 开头的 id 会被照片 agent 的 PREFIX 剥离逻辑误处理）
    for (const t of TAKEN) {
      expect(AR_PIN_PREFIX.startsWith(t)).toBe(false);
      expect(t.startsWith(AR_PIN_PREFIX)).toBe(false);
    }
  });

  it('arCityText 的判别后缀与 MarkerDetail 深链检测保持一致（"AR 锚点"字样）', () => {
    // MarkerDetail photo 分支靠 city.includes('AR 锚点') 显示「AR 重访」入口——改文案两处要一起改
    expect(arCityText('杭州')).toContain('AR 锚点');
    expect(arCityText('')).toContain('AR 锚点');
  });
});
