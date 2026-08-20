// 锚点记忆层：一次"放进现实"的记录存 IndexedDB pe-ar-anchors（keyedStore skill 收口）。
// 大字段（≤640px 照片 dataURL）只进 IDB；userMarks(localStorage) 那边只放 160px thumb。
// 写前清洗（sanitizeAnchor）：坐标校验/文本限长/照片数量与体积封顶——诗歌树 pin 加固版同款护栏习惯。
import { keyedStore } from '../skills/keyedStore';
import type { ArAnchor, ArPose } from './types';

const store = keyedStore<ArAnchor>('pe-ar-anchors', 'id');

export const MAX_ANCHOR_PHOTOS = 12;
const MAX_LABEL = 80;
const MAX_CITY = 40;
const MAX_IMAGE_CHARS = 600_000;   // ≈440KB 二进制；超限丢 image 保 thumb（防单条记录撑爆移动端 IDB 写入）
const MAX_THUMB_CHARS = 80_000;

export function makeAnchorId(now = Date.now()): string {
  return 'ar-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function validGeo(geo: ArAnchor['geo']): ArAnchor['geo'] {
  if (!geo) return null;
  const { lat, lng } = geo;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;   // EXIF (0,0) 噪声惯例（photo/features.ts 同规则）
  return { lat, lng };
}

function validPose(pose: ArPose | null): ArPose | null {
  if (!pose) return null;
  const nums = [...pose.position, ...pose.quaternion];
  if (nums.length !== 7 || nums.some((n) => !Number.isFinite(n))) return null;
  return { position: [...pose.position], quaternion: [...pose.quaternion] };
}

/** 写前清洗（纯函数，可测）：非法坐标置空、文本限长、照片封顶、超大 image 降级为 thumb-only */
export function sanitizeAnchor(a: ArAnchor): ArAnchor {
  const photos = (a.photos || []).slice(0, MAX_ANCHOR_PHOTOS).map((p) => ({
    id: String(p.id || '').slice(0, 64),
    thumb: typeof p.thumb === 'string' && p.thumb.length <= MAX_THUMB_CHARS ? p.thumb : '',
    image: typeof p.image === 'string' && p.image.length <= MAX_IMAGE_CHARS ? p.image : '',
  }));
  return {
    id: a.id,
    createdAt: a.createdAt || new Date().toISOString(),
    label: (a.label || '').trim().slice(0, MAX_LABEL) || 'AR 现场',
    layout: a.layout === 'cloud' ? 'cloud' : 'single',
    mode: a.mode === 'webxr' || a.mode === 'pseudo' ? a.mode : 'preview',
    photos,
    geo: validGeo(a.geo),
    city: (a.city || '').trim().slice(0, MAX_CITY),
    pose: validPose(a.pose),
    ...(a.pinnedMarkId ? { pinnedMarkId: a.pinnedMarkId } : {}),
  };
}

export async function saveAnchor(a: ArAnchor): Promise<ArAnchor> {
  const clean = sanitizeAnchor(a);
  await store.put(clean);
  return clean;
}

export async function getAnchor(id: string): Promise<ArAnchor | null> {
  return store.get(id);
}

/** 全部锚点，新的在前 */
export async function allAnchors(): Promise<ArAnchor[]> {
  const list = await store.all();
  return list.sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
}

export async function deleteAnchor(id: string): Promise<void> {
  await store.del(id);
}
