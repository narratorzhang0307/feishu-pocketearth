import { recordHealth } from '../harness/health';
import { callNativeMnn, isNativeMnnPlatform } from './capacitorMnnEdge';
import type { EdgeRequest, EdgeResponse } from './types';

export interface PhotoRuntimeStatus {
  phase: 'checking' | 'ready' | 'unavailable';
  engine: 'mnn' | 'stub';
  baseReady: boolean;
  ocrAdapterReady: boolean;
  baseModel: 'Qwen3-VL-2B-Instruct';
  ocrAdapter: 'general-ocr-vision';
  runtime: 'MNN 3.6.1';
  acceleration: string[];
  sme2Verified: boolean;
  error?: string;
}

function callNativePhotoEdge(body: EdgeRequest, timeoutMs: number, externalSignal?: AbortSignal): Promise<EdgeResponse> {
  if (externalSignal?.aborted) return Promise.resolve({ backend: 'stub', error: 'aborted' });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (response: EdgeResponse) => {
      if (settled) return;
      settled = true; globalThis.clearTimeout(timer); externalSignal?.removeEventListener('abort', abort);
      resolve(response);
    };
    const abort = () => finish({ backend: 'stub', error: 'aborted' });
    const timer = globalThis.setTimeout(() => finish({ backend: 'stub', error: 'native_timeout' }), timeoutMs);
    externalSignal?.addEventListener('abort', abort, { once: true });
    void callNativeMnn(body).then(finish, (error) => finish({ backend: 'stub', error: `native_bridge_failed:${String(error)}` }));
  });
}

async function callPhotoEdge(body: EdgeRequest, timeoutMs: number, externalSignal?: AbortSignal): Promise<EdgeResponse> {
  // Packaged Android has no /api/edge server. Its authoritative path is the Capacitor → Java → JNI MNN bridge.
  if (isNativeMnnPlatform()) return callNativePhotoEdge(body, timeoutMs, externalSignal);
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  try {
    const response = await fetch('/api/edge', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
    });
    if (!response.ok) return { backend: 'stub', error: `http_${response.status}` };
    return await response.json() as EdgeResponse;
  } catch (error) {
    return { backend: 'stub', error: String(error) };
  } finally {
    globalThis.clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function getPhotoRuntimeStatus(): Promise<PhotoRuntimeStatus> {
  const response = await callPhotoEdge({ task: 'runtime_status' }, 6500);
  const runtime = response.runtime;
  const baseReady = response.backend === 'mnn' && runtime?.visionReady === true;
  const ocrAdapterReady = runtime?.adapters?.['general-ocr-vision']?.installed === true;
  const acceleration = runtime?.acceleration || [];
  // A label in a manifest is not enough. Only an explicit runtime health flag may prove SME2.
  const sme2Verified = acceleration.some((item) => /^sme2[-_:]?active$/i.test(item));
  recordHealth('edge.photos.status', baseReady, response.error);
  return {
    phase: baseReady ? 'ready' : 'unavailable',
    engine: baseReady ? 'mnn' : 'stub',
    baseReady,
    ocrAdapterReady,
    baseModel: 'Qwen3-VL-2B-Instruct',
    ocrAdapter: 'general-ocr-vision',
    runtime: 'MNN 3.6.1',
    acceleration,
    sme2Verified,
    error: response.error,
  };
}

export async function runPhotoVision(
  image: string,
  prompt: string,
  options: { adapter?: 'general-ocr-vision'; detail?: 'fast' | 'high' | 'ocr'; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<{ text: string; backend: 'mnn' | 'stub'; error?: string }> {
  const requestedBudget = options.maxTokens;
  const budgets = requestedBudget
    ? [...new Set([requestedBudget, requestedBudget - 1, requestedBudget - 2, requestedBudget - 4].filter((value) => value > 0))]
    : [undefined];
  let response: EdgeResponse = { backend: 'stub', error: 'empty_response' };
  for (const maxTokens of budgets) {
    response = await callPhotoEdge({
      task: 'vision', image, prompt, adapter: options.adapter, detail: options.detail, maxTokens,
    }, options.detail === 'ocr' ? 125000 : 75000, options.signal);
    const ok = response.backend === 'mnn' && typeof response.text === 'string' && response.text.trim().length > 0;
    if (ok) {
      recordHealth(`edge.photos.${options.adapter || 'base'}`, true);
      return { text: response.text!.trim(), backend: 'mnn' };
    }
    if (!/utf-8|decode/i.test(response.error || '')) break;
  }
  recordHealth(`edge.photos.${options.adapter || 'base'}`, false, response.error);
  return { text: '', backend: 'stub', error: response.error };
}
