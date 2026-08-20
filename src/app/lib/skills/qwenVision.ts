// 兼容文件名：看展搭子的云视觉已改为阿里云百炼 Qwen3-VL。
// 仅在端侧 Qwen/MNN 读不出、用户明确同意上传公开说明牌后调用。
import {
  normalizeQwenImageSource,
  normalizeQwenPrompt,
  postQwenJson,
  readQwenError,
  readStringField,
  type QwenFetch,
} from './qwenClient';

export const QWEN_VISION_ENDPOINT = '/api/qwen-vision';
export const QWEN_VISION_TIMEOUT_MS = 30000;

export interface QwenVisionRequestOptions {
  prompt?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetcher?: QwenFetch;
}

export interface QwenVisionResult {
  ok: boolean;
  text: string;
  error?: string;
  status?: number;
  model?: string;
  retryAfterMs?: number;
}

function readChoiceText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return '';
  const first = choices[0];
  if (!first || typeof first !== 'object') return '';
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return '';
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => readStringField(part, 'text')).filter(Boolean).join('\n');
  return '';
}

export function parseQwenVisionPayload(data: unknown): Pick<QwenVisionResult, 'text' | 'error' | 'model'> {
  return {
    text: readStringField(data, 'text') || readStringField(data, 'output_text') || readStringField(data, 'outputText') || readChoiceText(data),
    error: readQwenError(data) || undefined,
    model: readStringField(data, 'model') || undefined,
  };
}

export async function requestQwenVision(imageDataUrl: string, options: QwenVisionRequestOptions = {}): Promise<QwenVisionResult> {
  const image = normalizeQwenImageSource(imageDataUrl);
  if (!image) return { ok: false, text: '', error: 'no_image' };

  const result = await postQwenJson({
    endpoint: options.endpoint || QWEN_VISION_ENDPOINT,
    timeoutMs: options.timeoutMs ?? QWEN_VISION_TIMEOUT_MS,
    fetcher: options.fetcher,
    body: { image, prompt: normalizeQwenPrompt(options.prompt) },
  });
  const payload = parseQwenVisionPayload(result.data);
  const hasText = !!payload.text.trim();
  const ok = result.ok && hasText && !payload.error;
  const error = result.error || payload.error || (result.ok && !hasText ? 'empty_text' : undefined);
  return {
    ok,
    text: ok ? payload.text : '',
    error,
    status: result.status,
    model: payload.model,
    retryAfterMs: result.retryAfterMs,
  };
}

export async function qwenVision(imageDataUrl: string, prompt?: string): Promise<string> {
  const result = await requestQwenVision(imageDataUrl, { prompt });
  return result.text;
}
