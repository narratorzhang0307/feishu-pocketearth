import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime provider is intentionally plain ESM shared by Node and Vite.
import { buildQwenChatBody, buildQwenImageBody, createQwenProvider, qwenModelForTask, readQwenImageUrl } from './qwen-provider.mjs';

describe('unified Qwen provider', () => {
  const provider = createQwenProvider({
    DASHSCOPE_API_KEY: 'secret',
    QWEN_MODEL_COUNCIL: 'qwen-council-test',
    QWEN_MODEL_NARRATIVE: 'qwen-narrative-test',
    QWEN_MODEL_MULTILINGUAL: 'qwen-multilingual-test',
    QWEN_MODEL_ROUTE: 'qwen-route-test',
    QWEN_SEARCH_MODEL: 'qwen-search-test',
  });

  it('routes every task to a Qwen model and one DashScope endpoint', () => {
    expect(provider.url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    expect(qwenModelForTask(provider, 'council')).toBe('qwen-council-test');
    expect(qwenModelForTask(provider, 'exhibition-narrative')).toBe('qwen-narrative-test');
    expect(qwenModelForTask(provider, 'exhibition-multilingual')).toBe('qwen-multilingual-test');
    expect(qwenModelForTask(provider, 'mapping-place-resolve')).toBe('qwen-route-test');
    expect(qwenModelForTask(provider, 'frost-plan')).toBe('qwen-route-test');
    expect(qwenModelForTask(provider, 'research-place')).toBe('qwen-search-test');
    expect(qwenModelForTask(provider, 'unknown')).toBe('qwen-plus');
    expect(provider.owner).toBe('Qwen');
  });

  it('builds deterministic JSON and explicit search requests', () => {
    expect(buildQwenChatBody(provider, { prompt: 'x', json: true })).toMatchObject({ temperature: 0, response_format: { type: 'json_object' } });
    expect(buildQwenChatBody(provider, { prompt: 'x', search: true })).toMatchObject({ enable_search: true, search_options: { forced_search: true, search_strategy: 'max' } });
  });

  it('uses the native Qwen Image contract', () => {
    expect(buildQwenImageBody(provider, '画一颗星球')).toMatchObject({ model: 'qwen-image-2.0', parameters: { size: '1328*1328' } });
    expect(readQwenImageUrl({ output: { choices: [{ message: { content: [{ image: 'https://oss.example/a.png' }] } }] } })).toBe('https://oss.example/a.png');
  });
});
