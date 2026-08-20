// Shared Qwen request plumbing for vision/image skills. Business modules keep
// string-returning wrappers while tests receive a small injectable fetch seam.

export type QwenFetch = typeof fetch;

export interface QwenJsonRequest {
  endpoint: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  fetcher?: QwenFetch;
}

export interface QwenJsonResult {
  ok: boolean;
  status?: number;
  data?: unknown;
  error?: string;
  retryAfterMs?: number;
}

export function normalizeQwenPrompt(prompt: string | undefined): string | undefined {
  const text = (prompt || '').trim();
  return text || undefined;
}

export function normalizeQwenImageSource(source: string): string {
  return (source || '').trim();
}

export function isLikelyQwenImageSource(source: string): boolean {
  const normalized = normalizeQwenImageSource(source);
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(normalized) || /^https?:\/\//i.test(normalized);
}

export function readStringField(data: unknown, key: string): string {
  if (!data || typeof data !== 'object') return '';
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export function readQwenError(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const error = (data as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    return readStringField(error, 'message') || readStringField(error, 'code') || readStringField(error, 'type');
  }
  return readStringField(data, 'message');
}

export function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number | undefined {
  const raw = (value || '').trim();
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const dateMs = Date.parse(raw);
  if (!Number.isFinite(dateMs)) return undefined;
  return Math.max(0, dateMs - nowMs);
}

function timeoutController(timeoutMs: number): { signal?: AbortSignal; clear: () => void } {
  if (!timeoutMs || timeoutMs <= 0 || typeof AbortController === 'undefined') return { clear: () => {} };
  const controller = new AbortController();
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function readJsonSafely(response: Response): Promise<{ data?: unknown; error?: string }> {
  try {
    return { data: await response.json() };
  } catch {
    return { error: 'bad_json' };
  }
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError') return 'timeout';
  return 'network_error';
}

export async function postQwenJson(input: QwenJsonRequest): Promise<QwenJsonResult> {
  const fetcher = input.fetcher || (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher) return { ok: false, error: 'no_fetch' };

  const timeout = timeoutController(input.timeoutMs);
  try {
    const response = await fetcher(input.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    const parsed = await readJsonSafely(response);
    const bodyError = readQwenError(parsed.data) || parsed.error;
    if (!response.ok) {
      return { ok: false, status: response.status, data: parsed.data, error: readQwenError(parsed.data) || `http_${response.status}`, retryAfterMs };
    }
    if (parsed.error) return { ok: false, status: response.status, error: parsed.error, retryAfterMs };
    return { ok: true, status: response.status, data: parsed.data, error: bodyError, retryAfterMs };
  } catch (error) {
    return { ok: false, error: errorCode(error) };
  } finally {
    timeout.clear();
  }
}
