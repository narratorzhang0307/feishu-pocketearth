import { describe, expect, it } from 'vitest';
import { buildProviderRequest } from './index';

const messages = [{ role: 'user', content: '你好' }];

describe('Qwen-first provider adapters', () => {
  it('uses Alibaba Model Studio with Qwen model ids', () => {
    const request = buildProviderRequest('dashscope', { messages, model: 'qwen-plus' }, 'key');
    expect(request.url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    expect(request.body.model).toBe('qwen-plus');
  });

  it('rejects non-Qwen models', () => {
    expect(() => buildProviderRequest('dashscope', { messages, model: 'other-model' }, 'key'))
      .toThrow(/dashscope-qwen-only/);
  });

  it('does not register removed Google or GMI routes', () => {
    expect(() => buildProviderRequest('google-gemini-api', { messages }, 'key')).toThrow(/无适配器/);
    expect(() => buildProviderRequest('gmi-google', { messages }, 'key')).toThrow(/无适配器/);
  });
});
