// 端侧模型层 · 统一接口
// 端侧（手机 / 本机）跑小模型做「挑和找」：选歌 / 选图 / 选书 / 意图分类 / 嵌入 / 视觉打标。
// 对齐 v2.0「端侧 Selector + 云 Brain」双速架构：端侧管选择，云管生成。
// 可插拔后端：
//   - ollama   本机 demo：ollama 跑 Qwen3-0.6B（文本）/ Qwen-VL（视觉），HTTP 直连
//   - mnn      手机 / PC 生产：MNN-LLM 跑 MNN 格式的 Qwen3 / Qwen3-VL（见 README）
//   - stub     无模型时的规则兜底（返回空 / 均匀分），调用方自动降级
// 前端通过 /api/edge 调用，密钥 / 模型只在服务端（与 frost-llm 同思路）。

export interface EdgeChatOpts {
  system?: string;
  json?: boolean;
  /** MNN language LoRA identifier. Adapter requests bypass WebLLM and stay on the allowlisted sidecar. */
  adapter?: string;
  /** Bound local decode length so malformed structured output cannot run indefinitely. */
  maxTokens?: number;
}

export interface EdgeVisionOpts {
  /** MNN 视觉 LoRA 标识；未安装或补丁未启用时必须返回空，不得用基座冒充。 */
  adapter?: string;
  /** OCR 细节模式会提高视觉输入分辨率，速度更慢。 */
  detail?: 'fast' | 'high' | 'ocr';
  /** 限制端侧生成长度，避免视觉模型在异常样本上长时间复读。 */
  maxTokens?: number;
}

export type EdgeAssetId = 'qwen3-vl-2b-mnn' | 'guji-vision-lora' | 'rubbing-vision-lora' | 'general-ocr-vision-lora' | 'travel-planner-lora' | 'heritage-restorer' | 'exhibit-matting';

export interface EdgeAssetStatus {
  id: EdgeAssetId;
  kind: 'base' | 'adapter' | 'restorer' | 'specialist';
  name: string;
  state: 'missing' | 'downloading' | 'installed' | 'failed' | 'cancelled';
  installed: boolean;
  downloaded: number;
  total: number;
  repo?: string;
  revision?: string;
  runtime?: string;
  target?: string;
  acceleration?: string[];
  /** Immutable Qwen base release activated by the native installer. */
  releaseId?: string;
  /** SHA-256 of the signed/pinned bundle manifest recorded in both base markers. */
  manifestSha256?: string;
  /** Native activation proof: manifest marker + every expected file at its exact verified size. */
  filesVerified?: boolean;
  verification?: string;
  layout?: string;
  /** App 安装包中已带经过 SHA-256 固定的权重，可一键复制到模型目录。 */
  bundled?: boolean;
  error?: string;
}

/** Immutable release descriptor. Native installers must verify both fields before activation. */
export interface EdgeAssetInstallSource {
  url: string;
  sha256: string;
  bytes: number;
}

/** 端侧模型统一能力。文本任务用 Qwen3 文本模型，视觉任务用 Qwen3-VL。 */
export interface EdgeModel {
  /** 后端是否就绪（非 stub）。 */
  available(): Promise<boolean>;
  /** 自由对话 / 生成（小模型，端侧）。 */
  chat(prompt: string, opts?: EdgeChatOpts): Promise<string>;
  /** 从候选标签里选一个（意图分类等）。 */
  classify(text: string, labels: string[]): Promise<string>;
  /** 给候选打相关度分（0-1，与 candidates 等长），用于选歌 / 选图 / 选书排序。 */
  rank(query: string, candidates: string[]): Promise<number[]>;
  /** 文本向量（语义检索 / 个人记忆）。 */
  embed(texts: string[]): Promise<number[][]>;
  /** 视觉感知：给一张图（url 或 base64）+ 提示，返回结构化结果（Qwen3-VL）。 */
  vision(image: string, prompt: string, opts?: EdgeVisionOpts): Promise<string>;
}

/** /api/edge 的请求体（判别联合）。 */
export type EdgeRequest =
  | { task: 'ping' }
  | { task: 'chat'; prompt: string; system?: string; json?: boolean; adapter?: string; maxTokens?: number }
  | { task: 'classify'; text: string; labels: string[] }
  | { task: 'rank'; query: string; candidates: string[] }
  | { task: 'embed'; texts: string[] }
  | { task: 'vision'; image: string; prompt: string; adapter?: string; detail?: 'fast' | 'high' | 'ocr'; maxTokens?: number }
  | { task: 'heritage_restore'; image: string; mask: string }
  | { task: 'exhibit_matting'; image: string }
  | { task: 'runtime_status' }
  | { task: 'runtime_probe' }
  | { task: 'runtime_configure'; mnnEnabled: boolean; sme2Enabled: boolean }
  | { task: 'runtime_evidence_artifacts' }
  | { task: 'runtime_apk_evidence' }
  | { task: 'asset_status' }
  | ({ task: 'asset_install'; asset: EdgeAssetId } & Partial<EdgeAssetInstallSource>)
  | { task: 'asset_cancel'; asset: EdgeAssetId }
  | { task: 'asset_uninstall'; asset: EdgeAssetId };

/** /api/edge 的响应体。backend 标明真实走了哪条后端（stub 表示无模型、调用方应走规则兜底）。 */
export interface EdgeResponse {
  backend: 'ollama' | 'mnn' | 'stub';
  model?: string;
  text?: string;        // chat / vision / classify 结果
  image?: string;       // 端侧修复结果 data URL
  alpha?: string;       // 展品抠图 alpha data URL
  stats?: {
    maskCoverage?: number; tileCount?: number; unmaskedMaxDelta?: number;
    accepted?: boolean; reason?: string; foregroundRatio?: number; elapsedMs?: number;
    runtime?: string; model?: string; acceleration?: string[];
    promptTokens?: number; generatedTokens?: number; modelLoadMs?: number; ttfaMs?: number;
    prefillMs?: number; decodeMs?: number; sampleMs?: number;
    prefillTokensPerSecond?: number; decodeTokensPerSecond?: number;
    currentRssMb?: number; peakRssMb?: number; appPssMb?: number;
    hardwareSme2?: boolean; sme2Requested?: boolean; sme2Effective?: boolean;
    mnnEnabled?: boolean; cpuTarget?: number; thermalStatus?: number;
    batteryTemperatureC?: number; batteryPercent?: number;
    deviceAvailableMemoryMb?: number; deviceLowMemory?: boolean;
  };
  scores?: number[];    // rank
  vectors?: number[][]; // embed
  error?: string;
  assets?: EdgeAssetStatus[];
  runtime?: {
    engine: 'mnn' | 'ollama' | 'stub';
    textReady?: boolean;
    visionReady?: boolean;
    adapters?: Record<string, { installed: boolean; file?: string }>;
    restorer?: { installed: boolean; file?: string };
    exhibitMatting?: { installed: boolean; file?: string };
    acceleration?: string[];
    compiledAcceleration?: string[];
    mnnEnabled?: boolean;
    sme2Requested?: boolean;
    sme2Effective?: boolean;
    cpuTarget?: number;
    hardware?: { sme2?: boolean; sve2?: boolean; i8mm?: boolean };
    configurationTrace?: {
      generation?: number;
      changed?: boolean;
      sessionReleaseMs?: number;
      dispatchInitMs?: number;
      nativeTotalMs?: number;
    };
    device?: {
      manufacturer?: string; model?: string; device?: string; android?: string; sdk?: number; abi?: string;
      appVersionName?: string; appVersionCode?: number;
    };
    /** True only when the Capacitor Android bridge answered this request. */
    nativeBridge?: boolean;
    version?: string;
    modelRoot?: string;
    /** Changes only when the Android app process is recreated; used by the restart acceptance check. */
    processInstanceId?: string;
    visualLoraRuntime?: { ready: boolean; patchId?: string };
    probe?: { ok: boolean; elapsedMs: number; output: string };
  };
  configuration?: {
    mnnEnabled?: boolean; sme2Requested?: boolean; sme2Effective?: boolean; cpuTarget?: number;
    hardware?: { sme2?: boolean; sve2?: boolean; i8mm?: boolean };
  };
  status?: string;
  evidenceArtifacts?: {
    capturedAt?: string;
    logcat?: { available?: boolean; source?: string; reason?: string; text?: string };
    perfetto?: {
      compatible?: boolean;
      systemTraceCaptured?: boolean;
      reason?: string;
      trace?: { traceEvents?: unknown[]; displayTimeUnit?: string; metadata?: unknown };
    };
  };
  apkEvidence?: {
    sha256?: string;
    bytes?: number;
    packageName?: string;
    versionName?: string;
    versionCode?: number;
    lastUpdateTime?: number;
    source?: string;
  };
}

// v2.0 的 Selector：端侧「挑和找」三件套，是 EdgeModel 的子集。
export interface Selector {
  rank(query: string, candidates: string[]): Promise<number[]>;
  classify(text: string, labels: string[]): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
}
