// 可复用 Skill（app 层）· KIRI Engine 3DGS 云重建（绕拍视频/多图 → 高斯泼溅 .ply）。
// 走服务端 /api/kiri 代理。三步：upload 拿 serialize → 轮询 status → 取 zip 直链(60 分钟)。
// getStatus 状态反直觉：-1 上传中 / 0 处理中 / 1 失败 / 2 成功 / 3 排队 / 4 过期。
// BYOK（自带 key）：每个请求带用户本机 KIRI key 的 x-kiri-key 头，服务端只用它、不共享额度
//   （kiriengine.app 注册开发者，新号 10 免费 credit，1 scan≈$1）。无 key → 服务端回 need_kiri_key。

import { unzipSync } from 'fflate';
import { kiriKeyHeader } from './kiriKey';

export const KIRI_STATUS = { UPLOADING: -1, PROCESSING: 0, FAILED: 1, SUCCESS: 2, QUEUED: 3, EXPIRED: 4 } as const;

/** 上传绕拍视频(或多图)→ 返回 serialize(任务 id)；失败返回空串。 */
export async function kiriUpload(files: File | File[], kind: 'video' | 'image' = 'video'): Promise<string> {
  const fd = new FormData();
  const arr = Array.isArray(files) ? files : [files];
  if (kind === 'image') { for (const f of arr) fd.append('imagesFiles', f); }   // 多图重建：KIRI 要求 20–300 张
  else { fd.append('videoFile', arr[0]); }
  try {
    const r = await fetch(`/api/kiri?op=upload&kind=${kind}`, { method: 'POST', body: fd, headers: kiriKeyHeader() });
    if (!r.ok) return '';
    const d = await r.json();
    return typeof d?.serialize === 'string' ? d.serialize : '';
  } catch { return ''; }
}

/** 查询重建状态（见 KIRI_STATUS）。无法查到返回 -99。 */
export async function kiriStatus(serialize: string): Promise<number> {
  try {
    const r = await fetch(`/api/kiri?op=status&serialize=${encodeURIComponent(serialize)}`, { headers: kiriKeyHeader() });
    if (!r.ok) return -99;
    const d = await r.json();
    const s = d?.data?.status ?? d?.status;
    return typeof s === 'number' ? s : -99;
  } catch { return -99; }
}

/** 成功后取模型 zip 直链（含原生 3DGS .ply，仅 60 分钟有效，须尽快取）。 */
export async function kiriModelUrl(serialize: string): Promise<string> {
  try {
    const r = await fetch(`/api/kiri?op=zip&serialize=${encodeURIComponent(serialize)}`, { headers: kiriKeyHeader() });
    if (!r.ok) return '';
    const d = await r.json();
    return typeof d?.modelUrl === 'string' ? d.modelUrl : '';
  } catch { return ''; }
}

/** 端到端：上传 → 轮询到成功/失败 → 返回 zip 直链。onPhase 供 UI 显示进度。超时(默认 10 分钟)返回空。 */
export async function kiriReconstruct(file: File, kind: 'video' | 'image', onPhase?: (s: number) => void, timeoutMs = 600000): Promise<string> {
  const serialize = await kiriUpload(file, kind);
  if (!serialize) return '';
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await kiriStatus(serialize);
    onPhase?.(s);
    if (s === KIRI_STATUS.SUCCESS) return kiriModelUrl(serialize);
    if (s === KIRI_STATUS.FAILED || s === KIRI_STATUS.EXPIRED) return '';
    await new Promise((r) => setTimeout(r, 8000));   // KIRI 重建数分钟，8s 轮询间隔
  }
  return '';
}

/** 从 zip bytes 里挑出 .ply（原生 3DGS），退而求其次 .splat/.ksplat。挑不到返回 null。 */
function pickPlyFromZip(buf: Uint8Array): Blob | null {
  const files = unzipSync(buf);
  const name = Object.keys(files).find((n) => n.toLowerCase().endsWith('.ply')) || Object.keys(files).find((n) => /\.(splat|ksplat)$/i.test(n));
  if (!name) return null;
  return new Blob([files[name]], { type: 'application/octet-stream' });
}

/** 直连版：从 zip 直链取 .ply。直链多为 S3/CDN、跨域大概率被 CORS 挡；主路径请用 fetchPlyViaProxy。 */
export async function fetchPlyFromKiriZip(modelUrl: string): Promise<Blob | null> {
  if (!modelUrl) return null;
  try { return pickPlyFromZip(new Uint8Array(await (await fetch(modelUrl)).arrayBuffer())); } catch { return null; }
}

/** 主路径：走服务端 /api/kiri?op=fetchzip 代拉 zip bytes（绕过直链 CORS）→ 解出 .ply。 */
export async function fetchPlyViaProxy(serialize: string): Promise<Blob | null> {
  if (!serialize) return null;
  try {
    const r = await fetch(`/api/kiri?op=fetchzip&serialize=${encodeURIComponent(serialize)}`, { headers: kiriKeyHeader() });
    if (!r.ok) return null;
    return pickPlyFromZip(new Uint8Array(await r.arrayBuffer()));
  } catch { return null; }
}

/** 端到端：视频/多图 → KIRI 云端重建(轮询到成功)→ 服务端代理取 zip → 解出 .ply blob（喂 splatStore.putSplat）。失败/超时返回 null。 */
export async function kiriReconstructToPly(files: File | File[], kind: 'video' | 'image', onPhase?: (s: number) => void, timeoutMs = 600000): Promise<Blob | null> {
  const serialize = await kiriUpload(files, kind);
  if (!serialize) return null;
  const start = Date.now();
  let ok = false;
  while (Date.now() - start < timeoutMs) {
    const s = await kiriStatus(serialize);
    onPhase?.(s);
    if (s === KIRI_STATUS.SUCCESS) { ok = true; break; }
    if (s === KIRI_STATUS.FAILED || s === KIRI_STATUS.EXPIRED) return null;
    await new Promise((r) => setTimeout(r, 8000));   // KIRI 重建数分钟，8s 轮询间隔
  }
  return ok ? fetchPlyViaProxy(serialize) : null;
}
