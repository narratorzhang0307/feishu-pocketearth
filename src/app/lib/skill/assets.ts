import { cancelEdgeAsset, getEdgeAssets, installEdgeAsset, uninstallEdgeAsset } from '../../../../frost-agent/edge/httpEdge';
import type { EdgeAssetId } from '../../../../frost-agent/edge/types';
import { isNativeMnnPlatform, subscribeNativeAssetProgress } from '../../../../frost-agent/edge/capacitorMnnEdge';
import { sha256Hex } from './protocol';
import { equipSkill, getInstalledSkill, listInstalledSkills, markSkillAssetsVerified, markSkillStatus, uninstallSkill } from './registry';
import type { SkillAsset } from './types';

const CACHE_NAME = 'pocket-skill-assets-v1';
const MAX_BROWSER_BYTES = 64 * 1024 * 1024;
const EDGE_ASSET_IDS = new Set<EdgeAssetId>([
  'qwen3-vl-2b-mnn', 'guji-vision-lora', 'rubbing-vision-lora',
  'general-ocr-vision-lora', 'travel-planner-lora', 'heritage-restorer', 'exhibit-matting',
]);

export interface SkillAssetProgress {
  assetId: string;
  downloaded: number;
  total: number;
  phase: 'downloading' | 'verifying' | 'done';
}

const edgeAssetId = (asset: SkillAsset): EdgeAssetId | null => EDGE_ASSET_IDS.has(asset.id as EdgeAssetId) ? asset.id as EdgeAssetId : null;
const cacheKey = (asset: SkillAsset): string => `https://pocket-earth.local/skill-assets/${asset.sha256}`;

async function downloadBrowserAsset(asset: SkillAsset, signal?: AbortSignal, onProgress?: (progress: SkillAssetProgress) => void): Promise<void> {
  if (!asset.url) throw new Error(`${asset.id} 没有可下载地址`);
  if (asset.bytes > MAX_BROWSER_BYTES) throw new Error(`${asset.id} 超过浏览器 64MB 校验上限，请在 Android/MNN 资产管理器安装`);
  const response = await fetch(asset.url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`${asset.id} 下载失败：${response.status}`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared && declared !== asset.bytes) throw new Error(`${asset.id} Content-Length 与 Manifest 不一致`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${asset.id} 响应不可流式读取`);
  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value); downloaded += next.value.byteLength;
    if (downloaded > asset.bytes) throw new Error(`${asset.id} 实际大小超过 Manifest`);
    onProgress?.({ assetId: asset.id, downloaded, total: asset.bytes, phase: 'downloading' });
  }
  if (downloaded !== asset.bytes) throw new Error(`${asset.id} 实际大小与 Manifest 不一致`);
  const bytes = new Uint8Array(downloaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  onProgress?.({ assetId: asset.id, downloaded, total: asset.bytes, phase: 'verifying' });
  if (await sha256Hex(bytes.buffer) !== asset.sha256) throw new Error(`${asset.id} SHA256 校验失败`);
  if (!('caches' in globalThis)) throw new Error('当前环境不支持 CacheStorage');
  const cache = await caches.open(CACHE_NAME);
  await cache.put(cacheKey(asset), new Response(bytes, { headers: { 'content-type': asset.media_type, 'content-length': String(asset.bytes), 'x-content-sha256': asset.sha256 } }));
  onProgress?.({ assetId: asset.id, downloaded, total: asset.bytes, phase: 'done' });
}

async function ensureEdgeAsset(asset: SkillAsset, onProgress?: (progress: SkillAssetProgress) => void): Promise<void> {
  const id = edgeAssetId(asset);
  if (!id) throw new Error(`${asset.id} 不是受支持的 MNN 资产`);
  onProgress?.({ assetId: asset.id, downloaded: 0, total: asset.bytes, phase: 'downloading' });
  const unsubscribe = isNativeMnnPlatform()
    ? await subscribeNativeAssetProgress((event) => {
        if (event.assetId === id) onProgress?.({ assetId: event.assetId, downloaded: event.downloaded, total: event.total, phase: event.phase });
      })
    : async () => {};
  try {
    const assets = await installEdgeAsset(id, { url: asset.url, sha256: asset.sha256, bytes: asset.bytes });
    const installed = assets.find((item) => item.id === id);
    if (!installed?.installed) throw new Error(installed?.error || `${asset.id} 未能在 MNN 运行时安装`);
    onProgress?.({ assetId: asset.id, downloaded: installed.downloaded || asset.bytes, total: installed.total || asset.bytes, phase: 'verifying' });
    onProgress?.({ assetId: asset.id, downloaded: installed.downloaded || asset.bytes, total: installed.total || asset.bytes, phase: 'done' });
  } finally {
    await unsubscribe();
  }
}

export async function prepareAndEquipSkill(key: string, options: { signal?: AbortSignal; onProgress?: (progress: SkillAssetProgress) => void } = {}) {
  const skill = getInstalledSkill(key);
  if (!skill) throw new Error('Skill 尚未安装');
  markSkillStatus(key, 'downloading');
  try {
    for (const asset of skill.manifest.assets.filter((item) => !item.optional)) {
      if (options.signal?.aborted) throw new DOMException('已取消', 'AbortError');
      if (edgeAssetId(asset)) await ensureEdgeAsset(asset, options.onProgress);
      else await downloadBrowserAsset(asset, options.signal, options.onProgress);
    }
    markSkillStatus(key, 'verifying');
    markSkillAssetsVerified(key);
    return equipSkill(key);
  } catch (error) {
    markSkillStatus(key, 'failed', error);
    throw error;
  }
}

export async function cancelSkillPreparation(key: string): Promise<void> {
  const skill = getInstalledSkill(key);
  if (!skill) return;
  await Promise.all(skill.manifest.assets.map(async (asset) => {
    const id = edgeAssetId(asset);
    if (id) await cancelEdgeAsset(id);
  }));
  markSkillStatus(key, 'installed');
}

export async function uninstallSkillWithAssets(key: string): Promise<void> {
  const skill = getInstalledSkill(key);
  if (!skill) return;
  const otherAssetIds = new Set(listInstalledSkills()
    .filter((item) => item.key !== key)
    .flatMap((item) => item.manifest.assets.map((asset) => asset.id)));
  if ('caches' in globalThis) {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(skill.manifest.assets
      .filter((asset) => !otherAssetIds.has(asset.id))
      .map((asset) => cache.delete(cacheKey(asset))));
  }
  await Promise.all(skill.manifest.assets.map(async (asset) => {
    const id = edgeAssetId(asset);
    if (id && id !== 'qwen3-vl-2b-mnn' && !otherAssetIds.has(asset.id)) await uninstallEdgeAsset(id);
  }));
  uninstallSkill(key);
}

export async function verifiedEdgeAssets(): Promise<EdgeAssetId[]> {
  return (await getEdgeAssets()).filter((asset) => asset.installed).map((asset) => asset.id);
}
