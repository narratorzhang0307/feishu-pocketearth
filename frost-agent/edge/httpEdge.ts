// 端侧模型 · 前端客户端
// 把请求 POST 给 /api/edge（dev 中间件 / 生产服务），由服务端路由到 ollama / MNN / stub。
// 任何一步失败都安全降级：available 返回 false、其余返回空值，调用方走规则兜底。
import type { EdgeAssetId, EdgeAssetInstallSource, EdgeAssetStatus, EdgeModel, EdgeRequest, EdgeResponse } from './types';
import { callNativeMnn, isNativeMnnPlatform } from './capacitorMnnEdge';

async function call(body: EdgeRequest): Promise<EdgeResponse> {
  if (isNativeMnnPlatform()) return callNativeMnn(body);
  // /api/edge 的 fetch 无原生超时：服务端 VL / LLM 推理挂起时 await 会永久 pending（曾致记一笔截图认片卡死 176s）。
  // 按 task 分档超时（vision 走端侧 3B VL 最重、冷加载/大图给足余量；chat 次之；其余文本小模型短超时），超时 abort → 落 catch → stub 兜底（等价端侧不可用，上层走规则/手填）。
  const timeoutMs = body.task === 'asset_install' || body.task === 'asset_uninstall' ? 180000
    : body.task === 'runtime_apk_evidence' ? 60000
    : body.task === 'heritage_restore' || body.task === 'exhibit_matting' ? 120000
    : body.task === 'vision' ? (body.detail === 'ocr' ? 125000 : 70000)
      : body.task === 'chat' ? (body.adapter ? 70000 : 20000) : 15000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('/api/edge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) return { backend: 'stub' };
    return (await r.json()) as EdgeResponse;
  } catch {
    return { backend: 'stub' };
  } finally {
    clearTimeout(timer);
  }
}

export const httpEdge: EdgeModel = {
  async available() {
    const r = await call({ task: 'ping' });
    return r.backend !== 'stub';
  },
  async chat(prompt, opts) {
    const r = await call({
      task: 'chat', prompt, system: opts?.system, json: opts?.json,
      adapter: opts?.adapter, maxTokens: opts?.maxTokens,
    });
    return typeof r.text === 'string' ? r.text : '';
  },
  async classify(text, labels) {
    const r = await call({ task: 'classify', text, labels });
    return typeof r.text === 'string' && r.text ? r.text : '';
  },
  async rank(query, candidates) {
    const r = await call({ task: 'rank', query, candidates });
    return Array.isArray(r.scores) && r.scores.length === candidates.length ? r.scores : [];
  },
  async embed(texts) {
    const r = await call({ task: 'embed', texts });
    return Array.isArray(r.vectors) ? r.vectors : [];
  },
  async vision(image, prompt, opts) {
    const r = await call({ task: 'vision', image, prompt, adapter: opts?.adapter, detail: opts?.detail, maxTokens: opts?.maxTokens });
    return typeof r.text === 'string' ? r.text : '';
  },
};

export async function matteExhibitPhoto(image: string): Promise<EdgeResponse> {
  return call({ task: 'exhibit_matting', image });
}

export async function restoreHeritageImage(image: string, mask: string): Promise<EdgeResponse> {
  return call({ task: 'heritage_restore', image, mask });
}

export async function getEdgeRuntimeStatus(): Promise<EdgeResponse> {
  return call({ task: 'runtime_status' });
}

export async function probeEdgeRuntime(): Promise<EdgeResponse> {
  return call({ task: 'runtime_probe' });
}

/** Full response is intentionally exposed for the acceptance ledger (metrics, backend and hashes). */
export async function runEdgeChatEvidence(prompt: string, opts?: { system?: string; json?: boolean; adapter?: string; maxTokens?: number }): Promise<EdgeResponse> {
  return call({ task: 'chat', prompt, system: opts?.system, json: opts?.json, adapter: opts?.adapter, maxTokens: opts?.maxTokens });
}

/** Full VL response for the bundled, fixed offline fixture used by the MNN acceptance ledger. */
export async function runEdgeVisionEvidence(image: string, prompt: string, opts?: { adapter?: string; detail?: 'fast' | 'high' | 'ocr'; maxTokens?: number }): Promise<EdgeResponse> {
  return call({ task: 'vision', image, prompt, adapter: opts?.adapter, detail: opts?.detail, maxTokens: opts?.maxTokens });
}

export async function configureEdgeRuntime(mnnEnabled: boolean, sme2Enabled: boolean): Promise<EdgeResponse> {
  return call({ task: 'runtime_configure', mnnEnabled, sme2Enabled });
}

export async function getEdgeEvidenceArtifacts(): Promise<EdgeResponse['evidenceArtifacts']> {
  const response = await call({ task: 'runtime_evidence_artifacts' });
  return response.evidenceArtifacts;
}

/** Explicit and potentially expensive; only called by the acceptance ledger/export. */
export async function getEdgeApkEvidence(): Promise<EdgeResponse['apkEvidence']> {
  const response = await call({ task: 'runtime_apk_evidence' });
  return response.apkEvidence;
}

export async function getEdgeAssets(): Promise<EdgeAssetStatus[]> {
  const response = await call({ task: 'asset_status' });
  return Array.isArray(response.assets) ? response.assets : [];
}

export async function installEdgeAsset(asset: EdgeAssetId, source?: EdgeAssetInstallSource): Promise<EdgeAssetStatus[]> {
  const response = await call({ task: 'asset_install', asset, ...source });
  if (response.error) throw new Error(response.error);
  return Array.isArray(response.assets) ? response.assets : [];
}

export async function cancelEdgeAsset(asset: EdgeAssetId): Promise<EdgeAssetStatus[]> {
  const response = await call({ task: 'asset_cancel', asset });
  return Array.isArray(response.assets) ? response.assets : [];
}

export async function uninstallEdgeAsset(asset: EdgeAssetId): Promise<EdgeAssetStatus[]> {
  const response = await call({ task: 'asset_uninstall', asset });
  if (response.error) throw new Error(response.error);
  return Array.isArray(response.assets) ? response.assets : [];
}
