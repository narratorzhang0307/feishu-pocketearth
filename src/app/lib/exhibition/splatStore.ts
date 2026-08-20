// 3D splat 端侧存储（手动导入的真展品高斯泼溅文件）。
// splat 文件 20–200MB，绝不进 localStorage/dataURL/meta —— 只存 IndexedDB blob，meta 里只留 splatId 指针。
// 复用 [keyedStore] skill；命名 'pe-splats' 前缀 pe-。只有显式 ?reset 才会清库，普通 PWA 重开会保留 3D。
import { keyedStore } from '../skills/keyedStore';

interface StoredSplat { id: string; blob: Blob; format: string; bytes: number; ts: number }
const store = keyedStore<StoredSplat>('pe-splats', 'id');

// objectURL 缓存：同一 splatId 只 createObjectURL 一次，避免重复解码与 URL 泄漏。
const urlCache = new Map<string, string>();
const MAX_URLS = 8;   // objectURL 上限（每个 blob 20–200MB）：超限淘汰最早的，防长会话/多次导入内存单调增长
// spz = Niantic 压缩 3DGS 格式（比 PLY 小约 10 倍——手机端首选）；
// 渲染器 @mkkellogg/gaussian-splats-3d 0.4.7 原生支持（SceneFormat.Spz），ExhibitViewer 已分发。
export const SUPPORTED_SPLAT_FORMATS = ['ply', 'splat', 'ksplat', 'spz', 'glb', 'gltf'] as const;
export const UNSUPPORTED_3D_EXPORT_FORMATS = ['obj', 'mtl', 'fbx', 'stl', 'usdz', 'xyz', 'zip', 'rar', '7z', 'tar', 'tar.gz', 'gz', 'dae', '3mf', 'las', 'laz', 'e57', 'pcd', 'pts', 'drc'] as const;
const ARCHIVE_3D_EXPORT_FORMATS = ['zip', 'rar', '7z', 'tar', 'tar.gz', 'gz'] as const;
const DISPLAY_SPLAT_FORMATS = ['glb', 'gltf', 'ply', 'splat', 'ksplat', 'spz'] as const;
export const SUPPORTED_SPLAT_FORMAT_HELP = DISPLAY_SPLAT_FORMATS.map((format) => `.${format}`).join('/');
const MIME_SPLAT_FORMATS: Record<string, string> = {
  'model/gltf-binary': 'glb',
  'model/gltf+json': 'gltf',
  'model/gltf-json': 'gltf',
  'model/ply': 'ply',
  'application/x-ply': 'ply',
  'application/x-splat': 'splat',
  'application/vnd.ksplat': 'ksplat',
  'application/x-spz': 'spz',
};
const MIME_UNSUPPORTED_3D_FORMATS: Record<string, string> = {
  'model/obj': 'obj',
  'model/mtl': 'mtl',
  'model/stl': 'stl',
  'model/vnd.usdz+zip': 'usdz',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/vnd.rar': 'rar',
  'application/x-rar-compressed': 'rar',
  'application/x-7z-compressed': '7z',
  'application/x-tar': 'tar',
  'application/gzip': 'gz',
  'application/x-gzip': 'gz',
  'model/vnd.collada+xml': 'dae',
  'model/vnd.dae': 'dae',
  'model/vnd.draco': 'drc',
  'application/vnd.ms-3mfdocument': '3mf',
};

export function normalizeSplatFormat(input?: string): string {
  const raw = (input || '').trim().toLowerCase();
  const cleanMime = raw.split(';', 1)[0].trim();
  const byMime = MIME_SPLAT_FORMATS[cleanMime];
  if (byMime) return byMime;
  const cleanPath = raw.split(/[?#]/, 1)[0];
  const ext = (cleanPath.includes('.') ? cleanPath.split('.').pop() : cleanPath)?.replace(/^\./, '') || '';
  return (SUPPORTED_SPLAT_FORMATS as readonly string[]).includes(ext) ? ext : '';
}

export function detectUnsupported3DFormat(input?: string): string {
  const raw = (input || '').trim().toLowerCase();
  const cleanMime = raw.split(';', 1)[0].trim();
  const byMime = MIME_UNSUPPORTED_3D_FORMATS[cleanMime];
  if (byMime) return byMime;
  const cleanPath = raw.split(/[?#]/, 1)[0];
  if (/\.(?:tar\.gz|tgz)$/.test(cleanPath)) return 'tar.gz';
  const ext = (cleanPath.includes('.') ? cleanPath.split('.').pop() : cleanPath)?.replace(/^\./, '') || '';
  return (UNSUPPORTED_3D_EXPORT_FORMATS as readonly string[]).includes(ext) ? ext : '';
}

export function splatImportFormatErrorMessage(fileName?: string, mimeType?: string): string {
  const knownUnsupported = detectUnsupported3DFormat(fileName) || detectUnsupported3DFormat(mimeType);
  if ((ARCHIVE_3D_EXPORT_FORMATS as readonly string[]).includes(knownUnsupported)) return `${knownUnsupported.toUpperCase()} 压缩包暂不能直接预览 · 请先解压并选择 ${SUPPORTED_SPLAT_FORMAT_HELP}`;
  if (knownUnsupported) return `${knownUnsupported.toUpperCase()} 暂不能网页预览 · 请导出 ${SUPPORTED_SPLAT_FORMAT_HELP}`;
  return `格式不支持 · 请选择 ${SUPPORTED_SPLAT_FORMAT_HELP}`;
}

const createSplatObjectUrl = (blob: Blob): string => {
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
    return URL.createObjectURL(blob);
  } catch {
    return '';
  }
};

const revokeSplatObjectUrl = (url: string): void => {
  try {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  } catch { /* objectURL 释放失败时保持无声兜底 */ }
};

/** 存一个导入的 splat blob，返回其 id。 */
export async function putSplat(blob: Blob, format: string): Promise<string> {
  const cleanFormat = normalizeSplatFormat(format);
  if (!cleanFormat) throw new Error('unsupported splat format');
  if (!blob.size) throw new Error('empty splat blob');
  const id = 'splat-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  await store.put({ id, blob, format: cleanFormat, bytes: blob.size, ts: Date.now() });
  return id;
}

/** 从 IDB 读 blob → objectURL（缓存）。找不到返回空串（调用方回落照片）。 */
export async function getSplatObjectUrl(id: string): Promise<string> {
  if (!id) return '';
  const cached = urlCache.get(id);
  if (cached) return cached;
  const rec = await store.get(id);
  if (!rec || !rec.blob) return '';
  const url = createSplatObjectUrl(rec.blob);
  if (!url) return '';
  if (urlCache.size >= MAX_URLS) { const oldest = urlCache.keys().next().value; if (oldest && oldest !== id) releaseSplatUrl(oldest); }   // LRU 兜底：淘汰最早的（非当前）URL 并 revoke
  urlCache.set(id, url);
  return url;
}

/** 释放某 splat 的 objectURL（revoke + 出缓存）。移除展品后调，回收 blob 内存（不删 IDB 记录）。 */
export function releaseSplatUrl(id: string): void {
  const u = urlCache.get(id);
  if (u) { revokeSplatObjectUrl(u); urlCache.delete(id); }
}

/** 彻底删除某 splat：revoke objectURL + 删 IndexedDB blob。移除展品 / 丢弃孤儿重建结果时调，杜绝 20–200MB blob 泄漏。 */
export async function deleteSplat(id: string): Promise<void> {
  if (!id) return;
  releaseSplatUrl(id);
  await store.del(id);
}

export async function splatBytes(id: string): Promise<number> {
  const rec = await store.get(id);
  return rec?.bytes || 0;
}
