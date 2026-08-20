// 端侧大脑 · 浏览器内 WebGPU 跑 Qwen（B 路线 · 纯 PWA，iOS/安卓通吃）
// 用 @mlc-ai/web-llm 把一个小 Qwen（默认 Qwen3-0.6B）整个跑在浏览器里：
//   - 不经服务器、不出端：真·端侧推理，满足「核心交互逻辑本地运行」。
//   - 实现现有 EdgeModel 契约的文本三件套（chat/classify/rank），调用点零改动。
//   - web-llm 走【动态 import】：不进主 bundle，用户点「启用」时才下载 ~400MB 权重 + 引擎。
//   - 需要 WebGPU（Safari 26/iOS 26、Chrome、Edge 默认开启）；不支持时 available()=false，自动回退 /api/edge。
// embed / vision 留空（文本小模型不做）→ 由 contract 的路由继续走 httpEdge / 云。
import type { EdgeModel } from './types';

// web-llm 的最小类型（避免静态 import 整个包）。
interface InitProgressReport { progress: number; text: string }
interface MLCEngine {
  chat: { completions: { create: (req: Record<string, unknown>) => Promise<{ choices: { message: { content: string } }[] }> } };
  unload?: () => Promise<void>;
}

// 默认端侧模型：Qwen3-0.6B（q4f16，~400MB），轻量的 Qwen3 小模型。
// 想更强可换 'Qwen3-1.7B-q4f16_1-MLC'（~1.1GB）。
export const DEFAULT_WEBLLM_MODEL = 'Qwen3-0.6B-q4f16_1-MLC';

export type WebllmPhase = 'idle' | 'loading' | 'ready' | 'error';
export interface WebllmState {
  phase: WebllmPhase;
  progress: number;     // 0–1，加载进度
  text: string;         // 当前进度文案 / 错误信息
  modelId: string;
}

let state: WebllmState = { phase: 'idle', progress: 0, text: '', modelId: DEFAULT_WEBLLM_MODEL };
let engine: MLCEngine | null = null;
let loadPromise: Promise<void> | null = null;
const subs = new Set<() => void>();

function set(patch: Partial<WebllmState>) { state = { ...state, ...patch }; subs.forEach((fn) => fn()); }

export function getWebllmState(): WebllmState { return state; }
export function isWebllmReady(): boolean { return state.phase === 'ready' && !!engine; }
export function subscribeWebllm(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

/** WebGPU 是否可用（端侧大脑的硬前提）。浏览器无 navigator.gpu 直接判否。 */
export async function webllmSupported(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return !!adapter;
  } catch { return false; }
}

/** 加载端侧 Qwen（幂等：重复调用复用同一个加载 Promise）。onProgress 也可订阅 state。 */
export async function loadWebllm(modelId: string = DEFAULT_WEBLLM_MODEL): Promise<void> {
  if (isWebllmReady() && state.modelId === modelId) return;
  if (loadPromise && state.phase === 'loading') return loadPromise;
  loadPromise = (async () => {
    set({ phase: 'loading', progress: 0, text: '检查 WebGPU…', modelId });
    if (!(await webllmSupported())) {
      set({ phase: 'error', text: '此浏览器不支持 WebGPU（需 Safari 26/iOS 26 或 Chrome/Edge），已回退云/服务端端侧。' });
      throw new Error('webgpu_unsupported');
    }
    try {
      const webllm = await import('@mlc-ai/web-llm');   // 动态加载，不进主 bundle
      engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (r: InitProgressReport) => set({ progress: r.progress || 0, text: r.text || '加载中…' }),
      }) as unknown as MLCEngine;
      set({ phase: 'ready', progress: 1, text: '端侧 Qwen 就绪' });
    } catch (e) {
      engine = null;
      set({ phase: 'error', text: '端侧模型加载失败：' + String(e) });
      throw e;
    }
  })();
  try { await loadPromise; } finally { loadPromise = null; }
}

/** 卸载端侧模型（释放显存）。 */
export async function unloadWebllm(): Promise<void> {
  try { await engine?.unload?.(); } catch { /* ignore */ }
  engine = null;
  set({ phase: 'idle', progress: 0, text: '' });
}

async function complete(messages: { role: string; content: string }[], opts?: { json?: boolean; temperature?: number }): Promise<string> {
  if (!engine) return '';
  const res = await engine.chat.completions.create({
    messages,
    temperature: opts?.temperature ?? (opts?.json ? 0 : 0.7),
    extra_body: { enable_thinking: false },   // 关 Qwen3 思考模式（与 ollama/MNN 的 think:false 对齐）：否则浏览器端 Qwen 回复前缀 <think>…</think>，破坏 rank 的 JSON.parse / classify 的 includes，并把推理过程漏给「端侧试一句」
    ...(opts?.json ? { response_format: { type: 'json_object' } } : {}),
  });
  return res?.choices?.[0]?.message?.content || '';
}

/** 浏览器内 Qwen 实现的 EdgeModel（文本三件套；embed/vision 不做、返回空让路由回退）。 */
export const webllmEdge: EdgeModel = {
  async available() { return isWebllmReady(); },
  async chat(prompt, o) {
    const messages = [] as { role: string; content: string }[];
    if (o?.system) messages.push({ role: 'system', content: o.system });
    messages.push({ role: 'user', content: prompt });
    return complete(messages, { json: o?.json });
  },
  async classify(text, labels) {
    const t = await complete([
      { role: 'system', content: '你是分类器。只输出给定选项中的一个，不要任何多余文字。' },
      { role: 'user', content: `文本：${text}\n选项：${labels.join(' / ')}\n答：` },
    ], { temperature: 0 });
    return labels.find((l) => t.includes(l)) || '';
  },
  async rank(query, candidates) {
    const t = await complete([
      { role: 'system', content: '给每个候选打 0-100 的相关度分。只返回一个 JSON 数组（仅数字，长度与候选一致）。' },
      { role: 'user', content: `查询：${query}\n候选：\n${candidates.map((c, i) => `${i}. ${c}`).join('\n')}\nJSON：` },
    ], { json: true });
    try {
      const arr = JSON.parse(t);
      const list = Array.isArray(arr) ? arr : (arr.scores || []);
      return candidates.map((_, i) => (Number(list[i]) || 0) / 100);
    } catch { return []; }
  },
  async embed() { return []; },           // 文本小模型不做嵌入 → 路由回退 httpEdge
  async vision() { return ''; },          // 文本模型不做视觉 → 路由回退 httpEdge/云
};
