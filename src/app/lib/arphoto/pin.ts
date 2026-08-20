// 落球层（近场 ↔ 远场闭环）：AR 锚点确认后钉回地球。
// 走 photo/travel 域先例：持有精确坐标 → 直写 addUserMark（不走 markPlace——它强制 spreadCoord
// 抖散，是给城市级模糊坐标用的；markPlace.ts:3 注释明确 photo 除外），幂等自管（uarp- 前缀查重）。
// 复用 kind:'photo'：mapMarkers/MyMapTab/MarkerDetail 零改动，拍立得贴/灯箱/拖动校正自动获得；
// meta.ar 是本域判别位（photo 域 fromPhotoAgent 同款模式），照片 agent 的清理函数不会认领这些钉。
import { addUserMark, getUserMarksByKind, removeUserMark } from '../../data/userMarks';
import type { ArAnchor } from './types';

export const AR_PIN_PREFIX = 'uarp-';

export interface ArPinMeta {
  thumb: string;
  full: string;
  city: string;
  source: 'user';
  ar: { anchorId: string; layout: ArAnchor['layout']; mode: ArAnchor['mode']; placedAt: string };
  [key: string]: unknown;
}

export interface ArPinResult { pinned: boolean; reason?: 'needPlace' | 'exists'; markId?: string }

export function arMarkId(anchorId: string): string { return AR_PIN_PREFIX + anchorId; }

export function isArPinned(anchorId: string): boolean {
  const id = arMarkId(anchorId);
  return getUserMarksByKind('photo').some((m) => m.id === id);
}

/** 详情卡里显示的地点语义："杭州 · AR 锚点"（resolveDetail photo 分支透传 city，零改动拿到放置语义） */
export function arCityText(city: string): string {
  const c = (city || '').trim();
  return c ? `${c} · AR 锚点` : 'AR 锚点';
}

/** 钉回地球：无坐标 → needPlace（不钉，诚实提示）；已钉 → exists；精确坐标直落（不抖散）。 */
export function pinAnchorToEarth(anchor: ArAnchor): ArPinResult {
  if (!anchor.geo) return { pinned: false, reason: 'needPlace' };
  const id = arMarkId(anchor.id);
  if (isArPinned(anchor.id)) return { pinned: true, reason: 'exists', markId: id };
  const thumb = anchor.photos[0]?.thumb || '';
  const meta: ArPinMeta = {
    thumb,
    full: thumb,
    city: arCityText(anchor.city),
    source: 'user',
    ar: { anchorId: anchor.id, layout: anchor.layout, mode: anchor.mode, placedAt: anchor.createdAt },
  };
  addUserMark({
    id,
    kind: 'photo',
    lat: anchor.geo.lat,
    lng: anchor.geo.lng,
    label: anchor.label || arCityText(anchor.city),
    meta: meta as unknown as Record<string, unknown>,
  });
  return { pinned: true, markId: id };
}

export function unpinAnchor(anchorId: string): void {
  removeUserMark(arMarkId(anchorId));
}
