import { keyedStore } from '../skills/keyedStore';
import { decode } from '../skills/browserVision';
import { resolveThumbnailUrl } from './libraryBridge';
import type { PhotoAssetIndex, PhotoLibraryAsset } from './libraryTypes';

export const PHOTO_EMBEDDING_MODEL_ID = 'Xenova/clip-vit-base-patch32';
export const PHOTO_EMBEDDING_VERSION = 'clip-vit-b32-q8-int8-v1';
export const PHOTO_EMBEDDING_DIMENSION = 512;

export interface PhotoSemanticEmbedding {
  key: string;
  modelId: string;
  version: string;
  dimension: number;
  quantization: 'symmetric-int8';
  vector: Int8Array | number[];
  sourceModifiedAt: number;
  generatedAt: number;
}

export interface PhotoSemanticMatch {
  key: string;
  score: number;
}

export interface PhotoSemanticIndexResult {
  indexed: number;
  reused: number;
  failed: number;
  cancelled: boolean;
  durationMs: number;
  modelId: string;
  version: string;
  backend: 'webgpu-fp16' | 'wasm-q8';
  pauseReason?: string;
}

export interface PhotoSemanticReconciliationResult {
  indexed: number;
  availableAssets: number;
  orphaned: number;
  orphanRatio: number;
  removed: number;
  retainedForSafety: boolean;
}

type Progress = (done: number, total: number, phase: string) => void;
type TransformersModule = typeof import('@huggingface/transformers');

const store = keyedStore<PhotoSemanticEmbedding>('pe-photo-semantic-v1', 'key');
const ORT_WASM_MODULE_URL = new URL('../../../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs', import.meta.url).href;
const ORT_WASM_BINARY_URL = new URL('../../../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm', import.meta.url).href;
let transformersPromise: Promise<TransformersModule> | null = null;
let visionRuntime: Promise<{ processor: any; model: any; RawImage: TransformersModule['RawImage']; backend: PhotoSemanticIndexResult['backend'] }> | null = null;
let textRuntime: Promise<{ tokenizer: any; model: any; backend: PhotoSemanticIndexResult['backend'] }> | null = null;

/** Small session-only LRU. Query vectors never leave memory and never contain photo pixels. */
export class PhotoSemanticQueryCache {
  private readonly values = new Map<string, Int8Array>();
  constructor(readonly limit = 20) {}

  get(query: string): Int8Array | null {
    const key = normalizePhotoSemanticQuery(query);
    const value = this.values.get(key);
    if (!value) return null;
    this.values.delete(key); this.values.set(key, value);
    return value.slice();
  }

  put(query: string, vector: Int8Array): void {
    const key = normalizePhotoSemanticQuery(query);
    if (!key || !vector.length) return;
    this.values.delete(key); this.values.set(key, vector.slice());
    while (this.values.size > Math.max(1, this.limit)) this.values.delete(this.values.keys().next().value as string);
  }

  clear(): void { this.values.clear(); }
  get size(): number { return this.values.size; }
}

/** Serializes a non-reentrant runtime and skips stale work that has not started yet. */
export class LatestPhotoSemanticQueue {
  private sequence = 0;
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>, staleValue: () => T): Promise<T> {
    const request = ++this.sequence;
    const execute = async (): Promise<T> => {
      if (request !== this.sequence) return staleValue();
      const result = await task();
      return request === this.sequence ? result : staleValue();
    };
    const result = this.tail.then(execute, execute);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  invalidate(): void { this.sequence++; }
}

const queryVectorCache = new PhotoSemanticQueryCache(20);
const semanticSearchQueue = new LatestPhotoSemanticQueue();

const currentBackend = (): PhotoSemanticIndexResult['backend'] =>
  typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu-fp16' : 'wasm-q8';

async function transformers(): Promise<TransformersModule> {
  if (!transformersPromise) transformersPromise = import('@huggingface/transformers').then((module) => {
    module.env.useBrowserCache = true;
    // `local_files_only` still checks Cache Storage first, but Transformers.js
    // requires local-model access to be enabled before allowing that mode.
    module.env.allowLocalModels = true;
    // Transformers.js otherwise points ORT at jsDelivr. Bundle both runtime files
    // with the app so cached model queries have no hidden CDN dependency.
    if (module.env.backends.onnx.wasm) {
      module.env.backends.onnx.wasm.wasmPaths = { mjs: ORT_WASM_MODULE_URL, wasm: ORT_WASM_BINARY_URL };
    }
    return module;
  });
  return transformersPromise;
}

function modelOptions(onProgress?: (phase: string) => void, localFilesOnly = false): Record<string, unknown> {
  const backend = currentBackend();
  return {
    device: backend === 'webgpu-fp16' ? 'webgpu' : 'wasm',
    dtype: backend === 'webgpu-fp16' ? 'fp16' : 'q8',
    local_files_only: localFilesOnly,
    progress_callback: (event: { status?: string; file?: string; progress?: number }) => {
      const percent = Number.isFinite(event.progress) ? ` ${Math.round(event.progress || 0)}%` : '';
      onProgress?.(`${event.status || '模型准备'}${event.file ? ` · ${event.file.split('/').pop()}` : ''}${percent}`);
    },
  };
}

async function ensureVisionRuntime(onProgress?: (phase: string) => void) {
  if (!visionRuntime) visionRuntime = (async () => {
    const module = await transformers();
    const options = modelOptions(onProgress);
    const [processor, model] = await Promise.all([
      module.AutoProcessor.from_pretrained(PHOTO_EMBEDDING_MODEL_ID),
      module.CLIPVisionModelWithProjection.from_pretrained(PHOTO_EMBEDDING_MODEL_ID, options),
    ]);
    return { processor, model, RawImage: module.RawImage, backend: currentBackend() };
  })().catch((error) => { visionRuntime = null; throw error; });
  return visionRuntime;
}

async function ensureTextRuntime(onProgress?: (phase: string) => void, localFilesOnly = false) {
  if (!textRuntime) textRuntime = (async () => {
    const module = await transformers();
    const options = modelOptions(onProgress, localFilesOnly);
    const [tokenizer, model] = await Promise.all([
      module.AutoTokenizer.from_pretrained(PHOTO_EMBEDDING_MODEL_ID),
      module.CLIPTextModelWithProjection.from_pretrained(PHOTO_EMBEDDING_MODEL_ID, options),
    ]);
    return { tokenizer, model, backend: currentBackend() };
  })().catch((error) => { textRuntime = null; throw error; });
  return textRuntime;
}

function normalized(values: number[]): number[] {
  const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / length);
}

export function quantizePhotoEmbedding(values: number[]): Int8Array {
  return Int8Array.from(normalized(values), (value) => Math.max(-127, Math.min(127, Math.round(value * 127))));
}

function int8Vector(value: Int8Array | number[]): Int8Array {
  return value instanceof Int8Array ? value : Int8Array.from(value);
}

export function photoEmbeddingSimilarity(left: Int8Array | number[], right: Int8Array | number[]): number {
  const a = int8Vector(left); const b = int8Vector(right);
  if (!a.length || a.length !== b.length) return -1;
  let dot = 0; let aa = 0; let bb = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index]; aa += a[index] * a[index]; bb += b[index] * b[index];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : -1;
}

export function rankPhotoEmbeddings(
  query: Int8Array | number[],
  records: PhotoSemanticEmbedding[],
  limit = 60,
): PhotoSemanticMatch[] {
  return records.filter((record) => record.version === PHOTO_EMBEDDING_VERSION && record.dimension === query.length)
    .map((record) => ({ key: record.key, score: photoEmbeddingSimilarity(query, record.vector) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, Math.max(1, limit));
}

const QUERY_TRANSLATIONS: Array<[RegExp, string]> = [
  [/猫/g, ' cat '], [/狗/g, ' dog '], [/宠物/g, ' pet '], [/人物|朋友|人像/g, ' people portrait '],
  [/票据|发票|小票/g, ' receipt document '], [/登机牌/g, ' boarding pass '], [/停车/g, ' parking '],
  [/二维码/g, ' QR code '], [/截图/g, ' screenshot '], [/西湖/g, ' West Lake '], [/杭州/g, ' Hangzhou '],
  [/东京/g, ' Tokyo '], [/旅行|旅游/g, ' travel '], [/食物|美食/g, ' food '], [/夜景/g, ' night scene '],
];

/** OpenAI CLIP's text tower is English-first; retain the original and add local expansions for common Chinese photo intents. */
export function normalizePhotoSemanticQuery(query: string): string {
  let expanded = query.trim();
  for (const [pattern, translation] of QUERY_TRANSLATIONS) expanded = expanded.replace(pattern, translation);
  return expanded.replace(/去年|今年|所有|照片|拍的|中的|带|没有|无|但像|和|与|我|的/g, ' ').replace(/\s+/g, ' ').trim();
}

async function imageVector(asset: PhotoLibraryAsset, runtime: Awaited<ReturnType<typeof ensureVisionRuntime>>): Promise<number[] | null> {
  try {
    const url = await resolveThumbnailUrl(asset);
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const file = new File([blob], asset.key, { type: blob.type || asset.mimeType, lastModified: asset.modificationTime || 0 });
    const decoded = await decode(file, 224);
    if (!decoded) return null;
    const context = decoded.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    const pixels = context.getImageData(0, 0, decoded.canvas.width, decoded.canvas.height).data;
    const image = new runtime.RawImage(pixels, decoded.canvas.width, decoded.canvas.height, 4);
    const inputs = await runtime.processor(image);
    const output = await runtime.model(inputs);
    const values = output.image_embeds.normalize().tolist()[0] as number[];
    return values.length ? values : null;
  } catch { return null; }
}

export async function buildPhotoSemanticIndex(
  assets: PhotoLibraryAsset[],
  options: { onProgress?: Progress; shouldCancel?: () => boolean; shouldPause?: () => Promise<string | null>; onModelProgress?: (phase: string) => void } = {},
): Promise<PhotoSemanticIndexResult> {
  const startedAt = performance.now();
  const candidates = assets.filter((asset) => asset.mediaType === 'image' && asset.sourceState !== 'missing' && asset.sourceState !== 'permission-revoked');
  let runtime: Awaited<ReturnType<typeof ensureVisionRuntime>> | null = null;
  try {
    options.onProgress?.(0, candidates.length, '安装/校验文本与视觉塔');
    // Warm the text tower now so a model installed online remains queryable in flight mode.
    const warmedText = await ensureTextRuntime(options.onModelProgress);
    try { await warmedText.model.dispose?.(); } finally { textRuntime = null; }
    options.onProgress?.(0, candidates.length, '准备端侧 CLIP 视觉塔');
    runtime = await ensureVisionRuntime(options.onModelProgress);
    const existing = new Map((await store.all()).map((record) => [record.key, record]));
    let indexed = 0; let reused = 0; let failed = 0; let done = 0; let pauseReason: string | undefined;
    for (const asset of candidates) {
      if (options.shouldCancel?.()) break;
      if (done % 12 === 0 && options.shouldPause) {
        pauseReason = await options.shouldPause() || undefined;
        if (pauseReason) break;
      }
      const prior = existing.get(asset.key);
      if (prior?.version === PHOTO_EMBEDDING_VERSION && prior.sourceModifiedAt === (asset.modificationTime || 0)) {
        reused++; done++; options.onProgress?.(done, candidates.length, '复用本地语义向量'); continue;
      }
      options.onProgress?.(done, candidates.length, '生成 224px 语义向量');
      const vector = await imageVector(asset, runtime);
      if (!vector) failed++;
      else {
        const record: PhotoSemanticEmbedding = {
          key: asset.key, modelId: PHOTO_EMBEDDING_MODEL_ID, version: PHOTO_EMBEDDING_VERSION,
          dimension: vector.length, quantization: 'symmetric-int8', vector: quantizePhotoEmbedding(vector),
          sourceModifiedAt: asset.modificationTime || 0, generatedAt: Date.now(),
        };
        await store.put(record); indexed++;
      }
      done++; options.onProgress?.(done, candidates.length, '保存本地 int8 向量');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return {
      indexed, reused, failed, cancelled: done < candidates.length,
      durationMs: Math.round(performance.now() - startedAt), modelId: PHOTO_EMBEDDING_MODEL_ID,
      version: PHOTO_EMBEDDING_VERSION, backend: runtime.backend, pauseReason,
    };
  } finally {
    try { await runtime?.model.dispose?.(); } finally { visionRuntime = null; }
  }
}

async function performPhotoSemanticSearch(query: string, limit = 60, onModelProgress?: (phase: string) => void): Promise<PhotoSemanticMatch[]> {
  const records = (await store.all()).filter((record) => record.version === PHOTO_EMBEDDING_VERSION);
  if (!records.length || !query.trim()) return [];
  const cached = queryVectorCache.get(query);
  if (cached) {
    onModelProgress?.('复用本机会话文本向量');
    return rankPhotoEmbeddings(cached, records, limit);
  }
  // Search is deliberately cache-only. If installation is incomplete we fail closed
  // and the UI falls back to tags/time/GPS/OCR without making a network request.
  const runtime = await ensureTextRuntime(onModelProgress, true);
  try {
    const inputs = runtime.tokenizer([normalizePhotoSemanticQuery(query)], { padding: true, truncation: true });
    const output = await runtime.model(inputs);
    const values = output.text_embeds.normalize().tolist()[0] as number[];
    const vector = quantizePhotoEmbedding(values);
    queryVectorCache.put(query, vector);
    return rankPhotoEmbeddings(vector, records, limit);
  } finally {
    try { await runtime.model.dispose?.(); } finally { textRuntime = null; }
  }
}

/**
 * Serialize text inference because the shared ONNX session cannot be disposed safely by concurrent searches.
 * Requests still waiting in the queue are coalesced: only the newest query reaches the model.
 */
export function searchPhotoSemantic(query: string, limit = 60, onModelProgress?: (phase: string) => void): Promise<PhotoSemanticMatch[]> {
  return semanticSearchQueue.run(
    () => performPhotoSemanticSearch(query, limit, onModelProgress),
    () => [],
  );
}

export async function getPhotoSemanticIndexStatus(): Promise<{ count: number; stale: number; modelId: string; version: string }> {
  const all = await store.all();
  return {
    count: all.filter((record) => record.version === PHOTO_EMBEDDING_VERSION).length,
    stale: all.filter((record) => record.version !== PHOTO_EMBEDDING_VERSION).length,
    modelId: PHOTO_EMBEDDING_MODEL_ID,
    version: PHOTO_EMBEDDING_VERSION,
  };
}

export async function removePhotoSemanticEmbedding(key: string): Promise<void> { await store.del(key); }

/**
 * Reconcile only derived vectors. A limited/partial library snapshot must never be treated as deletion evidence.
 * Even after full authorization, a sudden >20% orphan ratio is retained for explicit review instead of mass-pruned.
 */
export async function reconcilePhotoSemanticIndex(
  assets: PhotoAssetIndex[],
  options: { pruneOrphans?: boolean; maxAutomaticPruneRatio?: number } = {},
): Promise<PhotoSemanticReconciliationResult> {
  const records = await store.all();
  const available = new Set(assets
    .filter((asset) => asset.sourceState !== 'missing' && asset.sourceState !== 'permission-revoked')
    .map((asset) => asset.key));
  const orphaned = records.filter((record) => !available.has(record.key));
  const orphanRatio = records.length ? orphaned.length / records.length : 0;
  const maxRatio = options.maxAutomaticPruneRatio ?? 0.2;
  const safeToPrune = orphanRatio <= maxRatio;
  let removed = 0;
  if (options.pruneOrphans && safeToPrune) {
    await store.delMany(orphaned.map((record) => record.key));
    removed = orphaned.length;
  }
  return {
    indexed: records.length,
    availableAssets: available.size,
    orphaned: orphaned.length,
    orphanRatio,
    removed,
    retainedForSafety: Boolean(options.pruneOrphans && orphaned.length && !safeToPrune),
  };
}

export async function clearPhotoSemanticIndex(): Promise<void> {
  semanticSearchQueue.invalidate();
  await store.delMany((await store.all()).map((record) => record.key));
  queryVectorCache.clear();
}

export function filterSemanticMatchesToAvailableAssets(matches: PhotoSemanticMatch[], assets: PhotoAssetIndex[]): PhotoSemanticMatch[] {
  const available = new Set(assets.filter((asset) => asset.sourceState !== 'missing' && asset.sourceState !== 'permission-revoked').map((asset) => asset.key));
  return matches.filter((match) => available.has(match.key));
}
