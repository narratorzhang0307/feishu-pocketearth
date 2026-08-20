// Provider 适配器 · Qwen / ollama（端侧 Selector 的本机后端）
// 集中 qwen 在 ollama 上的 quirk：enable_thinking（ollama 的 think 参数，端侧小模型默认关思考更快）
// 以及 json 输出格式。viteEdge 构造 /api/chat 请求体时统一过这里。
// 删除条件：换掉端侧 ollama/Qwen 后端时，删本文件并改 viteEdge 的引用。

export interface OllamaChatInput {
  model: string;
  messages: { role: string; content: string; images?: string[] }[];
  json?: boolean;
  think?: boolean;   // enable_thinking：默认 false（端侧关思考，省时延）
}

/** 拼 ollama /api/chat 的请求体，集中 enable_thinking(think) 与 json format 两个 quirk。 */
export function ollamaChatBody(input: OllamaChatInput): Record<string, unknown> {
  return {
    model: input.model,
    messages: input.messages,
    stream: false,
    think: input.think ?? false,                  // qwen enable_thinking quirk（默认关）
    ...(input.json ? { format: 'json' } : {}),
  };
}
