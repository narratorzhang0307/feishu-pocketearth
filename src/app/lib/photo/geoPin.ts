// 行动层：suggest-then-confirm。照片钉点不另起图层，而是写进全局共享的「用户落点」总线
// （userMarks，kind:'photo'）——地球层已订阅它做渲染 / 点击详情 / 拖动校正 / 持久化，照片 agent 只当生产者。
// 持久化只存一张小缩略图 dataURL（≈160px JPEG），原图一步不出端；objectURL 易失效，故钉时即转 dataURL。
// proposal 清单：建议钉/可清理/归档/待确认地点，纯建议、绝不直接执行 / 删原图。
// 隐私：分享/截图地球时对精确坐标抽稀（coarsenForShare）。
import type { PhotoResult } from './types';
import { addUserMark, getUserMarksByKind, removeUserMark, subscribeUserMarks } from '../../data/userMarks';
import { nearestCity } from '../../data/geoStickers';
import { recordSignals } from '../../../../frost-agent/harness/profile';

export interface PhotoPin {
  id: string;            // stable asset key + content hash identity
  assetKey?: string;
  contentHash?: string;
  lat: number; lng: number;
  thumb: string;         // 钉之前是 objectURL（仅本地）；入库时转成持久 dataURL
  name: string;
  city?: string;
  source: 'exif' | 'user' | 'borrowed';
  ts: number;
}

const PREFIX = 'photo-';   // userMarks 里照片钉的 id 前缀，便于回收/识别

// objectURL → 小缩略图 dataURL（持久、可跨刷新、可进拍立得预览；原图不外传）
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function makeThumb(src: string): Promise<string> {
  try {
    const img = await loadImg(src);
    const max = 160;
    const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
    const w = Math.max(1, Math.round((img.width || 1) * scale));
    const h = Math.max(1, Math.round((img.height || 1) * scale));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); if (!ctx) return '';
    ctx.drawImage(img, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', 0.62);
  } catch { return ''; }
}

interface PhotoMarkMeta { thumb: string; full: string; city: string; source: PhotoPin['source']; assetKey?: string; contentHash?: string; fromPhotoAgent: true }
const isPhotoAgentMark = (m: { meta?: Record<string, unknown> }) => !!(m.meta as PhotoMarkMeta | undefined)?.fromPhotoAgent;

export function photoPinIdentity(assetKey: string, contentHash: string): string {
  return `${assetKey}|${contentHash}`;
}

export function getPhotoPins(): PhotoPin[] {
  return getUserMarksByKind('photo').filter(isPhotoAgentMark).map((m) => {
    const meta = (m.meta || {}) as Partial<PhotoMarkMeta>;
    return { id: m.id.replace(PREFIX, ''), assetKey: meta.assetKey, contentHash: meta.contentHash, lat: m.lat, lng: m.lng, thumb: meta.thumb || '', name: m.label || '', city: meta.city || '', source: meta.source || 'exif', ts: Date.parse(m.createdAt) || 0 };
  });
}
export function subscribePhotoPins(fn: () => void): () => void { return subscribeUserMarks(fn); }

// 一键确认钉地球：逐张转持久缩略图 → 写进共享落点总线（幂等：同 dHash 已钉则跳过）
export async function addPhotoPins(items: PhotoPin[]): Promise<void> {
  const existing = new Set(getUserMarksByKind('photo').map((m) => m.id));
  const cities: string[] = [];
  for (const it of items) {
    const id = PREFIX + it.id;
    if (existing.has(id) || getUserMarksByKind('photo').some((m) => m.id === id)) continue;   // 实时复查：并发调用各基于旧快照会重复钉（addUserMark 不查重），实时查 + 调用点重入守卫双保险
    const thumb = it.thumb ? await makeThumb(it.thumb) : '';
    const meta: PhotoMarkMeta = { thumb, full: thumb, city: it.city || '', source: it.source, assetKey: it.assetKey, contentHash: it.contentHash, fromPhotoAgent: true };
    addUserMark({ id, kind: 'photo', lat: it.lat, lng: it.lng, label: it.city || it.name || '我的照片', meta: meta as unknown as Record<string, unknown> });
    existing.add(id);
    if (it.city) cities.push(it.city);
  }
  // 接回流：整理照片也喂长期画像，关掉「heartbeat 建议整理相册→整理完画像纹丝不动」的单向死循环。
  // city 来自坐标反查（toPins），可能为空——只回流非空，避免写 noise。
  if (cities.length) recordSignals('photos', { cities });
}
export function removePhotoPin(id: string): void { removeUserMark(PREFIX + id); }
export function clearPhotoPins(): void { getUserMarksByKind('photo').filter(isPhotoAgentMark).forEach((m) => removeUserMark(m.id)); }

// 分享/截图地球时把精确坐标抽稀到 ~街区/城市级（高敏轨迹保护）
export function coarsenForShare(lat: number, lng: number, level: 'block' | 'city' = 'block'): { lat: number; lng: number } {
  const q = level === 'city' ? 0.1 : 0.01;   // ~11km / ~1.1km
  return { lat: Math.round(lat / q) * q, lng: Math.round(lng / q) * q };
}

// ── 整理结果 → proposal 清单（纯建议，等用户在 UI 一键确认才落地）──
export interface Proposal {
  pins: PhotoResult[];       // 建议钉地球（pinnable 簇代表）
  cleanable: PhotoResult[];  // 建议可清理（仅标记，绝不删原图）
  archive: PhotoResult[];    // 资料·归档（可检索，去地图主线）
  needPlace: PhotoResult[];  // 实拍无坐标·待你确认地点
  keep: PhotoResult[];       // 留
}
export function buildProposal(results: PhotoResult[]): Proposal {
  const p: Proposal = { pins: [], cleanable: [], archive: [], needPlace: [], keep: [] };
  for (const r of results) {
    if (r.pinnable) p.pins.push(r);
    if (r.verdict === 'clean') p.cleanable.push(r);
    else if (r.photoType === 'screenshot' || r.photoType === 'document') p.archive.push(r);
    else if (r.needPlace) p.needPlace.push(r);
    else if (r.verdict === 'keep') p.keep.push(r);
  }
  return p;
}

// 把 pinnable 结果转成 PhotoPin（UI 确认后调 addPhotoPins）
export function toPins(results: PhotoResult[]): PhotoPin[] {
  const ts = Date.now();
  return results.filter((r) => r.pinnable && r.lat != null && r.lng != null).map((r) => ({
    id: r.id, lat: r.lat!, lng: r.lng!, thumb: r.url, name: r.name,
    city: nearestCity(r.lat!, r.lng!)?.place || '',   // 坐标反查最近已知城市：钉点带城市名 + 可回流画像
    source: r.pinSource || 'exif', ts,
  }));
}
