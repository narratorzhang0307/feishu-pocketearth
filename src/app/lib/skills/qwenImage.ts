// 旧文件名兼容层：实际图像生成统一走阿里云百炼 Qwen Image。
// suggest-then-confirm：只在用户点“生成明信片”时调用，不自动消耗额度；失败返回空串。
// 版权红线：prompt 只做风格化原创，不指名 IP、不复刻真实海报。
import {
  normalizeQwenPrompt,
  postQwenJson,
  readQwenError,
  readStringField,
  type QwenFetch,
} from './qwenClient';

export const QWEN_IMAGE_ENDPOINT = '/api/qwen-image';
export const QWEN_IMAGE_TIMEOUT_MS = 30000;

export interface QwenImageRequestOptions {
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetcher?: QwenFetch;
}

export interface QwenImageResult {
  ok: boolean;
  url: string;
  error?: string;
  status?: number;
  model?: string;
  queueStatus?: string;
  retryAfterMs?: number;
  requestId?: string;
}

function readCompatibleImageUrl(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const images = (data as { data?: unknown }).data;
  if (Array.isArray(images)) {
    const url = images.map((item) => readStringField(item, 'url')).find(Boolean);
    if (url) return url;
  }
  const outcome = (data as { outcome?: unknown }).outcome;
  if (!outcome || typeof outcome !== 'object') return '';
  const firstMedia = (outcome as { media_urls?: unknown }).media_urls;
  if (Array.isArray(firstMedia)) {
    const url = firstMedia.map((item) => readStringField(item, 'url')).find(Boolean);
    if (url) return url;
  }
  return readStringField(outcome, 'thumbnail_image_url');
}

function readImageRequestId(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  return readStringField(data, 'requestId') || readStringField(data, 'request_id') || readStringField(data, 'id');
}

export function parseQwenImagePayload(data: unknown): Pick<QwenImageResult, 'url' | 'error' | 'model' | 'queueStatus' | 'requestId'> {
  return {
    url: readStringField(data, 'url') || readCompatibleImageUrl(data),
    error: readQwenError(data) || undefined,
    model: readStringField(data, 'model') || undefined,
    queueStatus: readStringField(data, 'status') || undefined,
    requestId: readImageRequestId(data) || undefined,
  };
}

export function imageEmptyError(queueStatus?: string): 'image_pending' | 'image_failed' | 'empty_url' {
  const status = (queueStatus || '').trim().toLowerCase();
  if (['failed', 'fail', 'error', 'errored', 'canceled', 'cancelled', 'timeout'].includes(status)) return 'image_failed';
  return status && !['completed', 'complete', 'succeeded', 'success', 'done'].includes(status) ? 'image_pending' : 'empty_url';
}

export async function requestQwenImage(prompt: string, options: QwenImageRequestOptions = {}): Promise<QwenImageResult> {
  const cleanPrompt = normalizeQwenPrompt(prompt);
  if (!cleanPrompt) return { ok: false, url: '', error: 'no_prompt' };

  const result = await postQwenJson({
    endpoint: options.endpoint || QWEN_IMAGE_ENDPOINT,
    timeoutMs: options.timeoutMs ?? QWEN_IMAGE_TIMEOUT_MS,
    fetcher: options.fetcher,
    body: { prompt: cleanPrompt, model: normalizeQwenPrompt(options.model) },
  });
  const payload = parseQwenImagePayload(result.data);
  const url = payload.url.trim();
  const ok = result.ok && !!url && !payload.error;
  const error = result.error || payload.error || (result.ok && !url ? imageEmptyError(payload.queueStatus) : undefined);
  return {
    ok,
    url: ok ? url : '',
    error,
    status: result.status,
    model: payload.model,
    queueStatus: payload.queueStatus,
    retryAfterMs: result.retryAfterMs,
    requestId: payload.requestId,
  };
}

export async function qwenImage(prompt: string, model?: string): Promise<string> {
  const result = await requestQwenImage(prompt, { model });
  return result.url;
}
