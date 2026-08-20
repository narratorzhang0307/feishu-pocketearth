import { recordHealth } from '../harness/health';
import type { EdgeChatOpts } from './types';

export type TravelRuntimePhase = 'checking' | 'ready' | 'unavailable';

export interface TravelPlannerRuntimeStatus {
  phase: TravelRuntimePhase;
  engine: 'mnn' | 'stub';
  baseReady: boolean;
  adapterReady: boolean;
  baseModel: 'Qwen3-VL-2B-Instruct';
  adapter: 'travel-planner';
  runtime: 'MNN 3.6.1';
  error?: string;
}

interface EdgeResponse {
  backend?: 'mnn' | 'stub';
  text?: string;
  error?: string;
  runtime?: {
    engine?: 'mnn' | 'stub';
    textReady?: boolean;
    adapters?: Record<string, { installed?: boolean; file?: string }>;
  };
}

async function callEdge(body: Record<string, unknown>, timeoutMs: number): Promise<EdgeResponse> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/edge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return { backend: 'stub', error: `http_${response.status}` };
    return await response.json() as EdgeResponse;
  } catch (error) {
    return { backend: 'stub', error: String(error) };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function getTravelPlannerRuntimeStatus(): Promise<TravelPlannerRuntimeStatus> {
  const response = await callEdge({ task: 'runtime_status' }, 6500);
  const runtime = response.runtime;
  const baseReady = response.backend === 'mnn' && runtime?.textReady === true;
  const adapterReady = runtime?.adapters?.['travel-planner']?.installed === true;
  const ready = baseReady && adapterReady;
  recordHealth('edge.travel-planner.status', ready, response.error);
  return {
    phase: ready ? 'ready' : 'unavailable',
    engine: ready ? 'mnn' : 'stub',
    baseReady,
    adapterReady,
    baseModel: 'Qwen3-VL-2B-Instruct',
    adapter: 'travel-planner',
    runtime: 'MNN 3.6.1',
    error: response.error,
  };
}

export async function runQwenAdapter(
  prompt: string,
  options: EdgeChatOpts & { adapter: 'travel-planner' },
): Promise<{ text: string; backend: 'mnn' | 'stub'; error?: string }> {
  const response = await callEdge({
    task: 'chat',
    prompt,
    system: options.system,
    json: options.json,
    adapter: options.adapter,
    maxTokens: options.maxTokens,
  }, 75000);
  const ok = response.backend === 'mnn' && typeof response.text === 'string' && response.text.trim().length > 0;
  recordHealth('edge.travel-planner.inference', ok, response.error);
  return { text: ok ? response.text!.trim() : '', backend: ok ? 'mnn' : 'stub', error: response.error };
}

/** Qwen base is exposed only for a source-grounded travel-place brief. */
export async function runQwenGroundedPlaceBrief(
  prompt: string,
  system: string,
): Promise<{ text: string; backend: 'mnn' | 'stub'; error?: string }> {
  const response = await callEdge({
    task: 'chat',
    purpose: 'travel-place-brief',
    prompt,
    system,
    maxTokens: 768,
  }, 75000);
  const ok = response.backend === 'mnn' && typeof response.text === 'string' && response.text.trim().length > 0;
  recordHealth('edge.travel-place-brief.inference', ok, response.error);
  return { text: ok ? response.text!.trim() : '', backend: ok ? 'mnn' : 'stub', error: response.error };
}
