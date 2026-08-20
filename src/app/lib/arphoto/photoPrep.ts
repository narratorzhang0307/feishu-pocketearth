// 照片预处理（DOM 层，不进 vitest）：File → EXIF GPS + 双档 dataURL（AR 贴图 640px / 地球钉 160px）。
// 全端侧：解码走 browserVision.decode（方向归一 + HEIC 兜底 + OOM 安全），像素一个字节不上云。
import { decode, dHash } from '../skills/browserVision';
import { readExif } from '../photo/features';
import { nearestCity } from '../../data/geoStickers';
import type { ArPhotoSource } from './types';

export const AR_IMAGE_MAX = 640;    // AR 贴图边长（CanvasTexture 清晰度和 IDB 体积的折中）
export const AR_THUMB_MAX = 160;    // 地球钉缩略（photo 域同规格）

function toJpeg(canvas: HTMLCanvasElement, quality: number): string {
  try { return canvas.toDataURL('image/jpeg', quality); } catch { return ''; }
}

function shrink(canvas: HTMLCanvasElement, max: number): HTMLCanvasElement {
  const s = Math.min(1, max / Math.max(canvas.width, canvas.height));
  if (s >= 1) return canvas;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * s));
  c.height = Math.max(1, Math.round(canvas.height * s));
  c.getContext('2d')?.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

/**
 * 一张相册文件 → AR 照片素材。解码失败返回 null（舱壁：坏图跳过不炸批次）。
 * suspectExif（越界坐标/1995 前时间/截图软件）时弃坐标——photo/critic 同规则。
 */
export async function prepPhoto(file: File): Promise<ArPhotoSource | null> {
  const decoded = await decode(file, AR_IMAGE_MAX);
  if (!decoded) return null;
  const image = toJpeg(decoded.canvas, 0.75);
  if (!image) return null;
  const thumb = toJpeg(shrink(decoded.canvas, AR_THUMB_MAX), 0.62) || image;
  const id = dHash(decoded.canvas) || 'f-' + Math.random().toString(36).slice(2, 10);
  const src: ArPhotoSource = { id, image, thumb, name: file.name };
  try {
    const exif = await readExif(file);
    if (exif.hasGPS && !exif.suspectExif && exif.lat != null && exif.lng != null) {
      src.lat = exif.lat;
      src.lng = exif.lng;
      src.city = nearestCity(exif.lat, exif.lng)?.place || '';
    }
  } catch { /* EXIF 读不出 → 无坐标素材照常可用（进 AR 不受影响，只是钉球走 needPlace） */ }
  return src;
}

/** 批量：坏图静默跳过、同 dHash 去重（连拍/相册副本撞号会造成重复 React key 与锚点重复条目），保持输入顺序 */
export async function prepPhotos(files: File[], onProgress?: (done: number, total: number) => void): Promise<ArPhotoSource[]> {
  const out: ArPhotoSource[] = [];
  const seen = new Set<string>();
  let done = 0;
  for (const f of files) {
    const p = await prepPhoto(f).catch(() => null);
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
    done += 1;
    onProgress?.(done, files.length);
  }
  return out;
}
