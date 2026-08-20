import type { NormalizedRequest, ProviderAdapter } from './index';

const DEFAULT_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const QWEN_MODEL = /^qwen[\w.-]*$/i;

export const dashscopeAdapter: ProviderAdapter = {
  name: 'dashscope-qwen',
  matches: (provider) => provider === 'dashscope' || provider === 'alibaba-model-studio' || provider === 'qwen-cloud',
  apply(req: NormalizedRequest, key: string) {
    const model = req.model || 'qwen-plus';
    if (!QWEN_MODEL.test(model)) throw new Error(`dashscope-qwen-only: rejected model "${model}"`);
    return {
      url: `${DEFAULT_BASE}/chat/completions`,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: {
        model,
        messages: req.messages,
        temperature: req.temperature ?? (req.json ? 0 : 0.65),
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      },
    };
  },
};
