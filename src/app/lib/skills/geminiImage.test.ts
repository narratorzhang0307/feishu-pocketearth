import { describe, expect, it } from 'vitest';
import { GEMINI_IMAGE_ENDPOINT, parseGeminiImagePayload, requestGeminiImage } from './geminiImage';
import type { GmiFetch } from './gmiClient';

describe('Qwen Image client compatibility surface', () => {
  it('uses the Qwen endpoint by default', async () => {
    let endpoint = '';
    const fetcher: GmiFetch = async (input) => {
      endpoint = String(input);
      return new Response(JSON.stringify({
        url: 'data:image/png;base64,abc',
        model: 'qwen-image-2.0',
        status: 'completed',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const result = await requestGeminiImage('原创展品明信片', { fetcher, timeoutMs: 0 });

    expect(endpoint).toBe(GEMINI_IMAGE_ENDPOINT);
    expect(result).toMatchObject({ ok: true, model: 'qwen-image-2.0' });
    expect(result.url).toBe('data:image/png;base64,abc');
  });

  it('keeps provider metadata-compatible payloads parseable', () => {
    expect(parseGeminiImagePayload({
      url: 'https://example.com/postcard.png',
      model: 'qwen-image-2.0',
      provider: 'Alibaba Cloud Model Studio',
      transport: 'dashscope-native',
    })).toMatchObject({
      url: 'https://example.com/postcard.png',
      model: 'qwen-image-2.0',
    });
  });
});
