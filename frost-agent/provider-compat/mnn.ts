// Provider 适配器 · MNN sidecar（端侧 MNN-LLM 的本地 HTTP 端点）
// 集中 MNN 这条后端的请求体 quirk：做结构化输出(classify/rank/vision)时强制纯 JSON、
// 禁 Markdown 代码围栏 —— 规避预编译 libMNN 在 step decode 遇到 ``` 触发假结束符、输出被提前截断的坑。
// 删除条件：换掉端侧 MNN sidecar 时，删本文件并改 viteEdge 的引用。

export interface MnnChatInput {
  system?: string;
  prompt: string;
  images?: string[];                 // base64，视觉任务用
  json?: boolean;                    // 需要结构化输出
  model?: 'text' | 'vision';
  adapter?: string;                  // allowlist 中的 MNN 分离式 LoRA 标识（视觉或语言）
  detail?: 'fast' | 'high' | 'ocr';  // ocr 档保留普通文档小字；fast/high 行为不变
  maxTokens?: number;                // 端侧 decode 硬上限，防异常复读拖死请求
}

/** 拼 MNN sidecar /v1/chat 的请求体，集中"纯 JSON / 禁代码围栏"的防截断 quirk。 */
export function mnnChatBody(input: MnnChatInput): Record<string, unknown> {
  let system = (input.system || '').trim();
  if (input.json) {
    system = (system + '\n只输出纯 JSON，不要 Markdown 代码块、不要 ``` 包裹。').trim();
  }
  return {
    system,
    prompt: input.prompt,
    images: input.images && input.images.length ? input.images : undefined,
    json: !!input.json,
    model: input.model || (input.images && input.images.length ? 'vision' : 'text'),
    adapter: input.adapter || undefined,
    detail: input.detail || undefined,
    max_new_tokens: input.maxTokens || undefined,
  };
}
