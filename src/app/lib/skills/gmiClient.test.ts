import { describe, expect, it } from 'vitest';
import { isLikelyGmiImageSource, parseRetryAfterMs, readGmiError, type GmiFetch } from './gmiClient';
import { imageEmptyError, parseGmiImagePayload, requestGmiImage } from './gmiImage';
import { parseGmiVisionPayload, requestGmiVision } from './gmiVision';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GMI client helpers', () => {
  it('documents the supported image source shapes', () => {
    expect(isLikelyGmiImageSource('data:image/png;base64,abc')).toBe(true);
    expect(isLikelyGmiImageSource('https://example.com/label.jpg')).toBe(true);
    expect(isLikelyGmiImageSource('plain-base64-without-data-url')).toBe(false);
  });

  it('parses Retry-After headers for rate-limit diagnostics', () => {
    const now = Date.parse('2026-07-03T00:00:00Z');
    expect(parseRetryAfterMs('2.5', now)).toBe(2500);
    expect(parseRetryAfterMs('Fri, 03 Jul 2026 00:00:03 GMT', now)).toBe(3000);
    expect(parseRetryAfterMs('bad-value', now)).toBeUndefined();
  });

  it('parses GMI vision server payloads', () => {
    expect(parseGmiVisionPayload({ text: '展签文字', model: 'google/gemini-3.5-flash' })).toEqual({
      text: '展签文字',
      error: undefined,
      model: 'google/gemini-3.5-flash',
    });
    expect(parseGmiVisionPayload({ output_text: '兼容 output_text 展签文字' }).text)
      .toBe('兼容 output_text 展签文字');
    expect(parseGmiVisionPayload({ choices: [{ message: { content: '兼容响应文字' } }] }).text)
      .toBe('兼容响应文字');
    expect(parseGmiVisionPayload({ choices: [{ message: { content: [{ text: '第一行' }, { text: '第二行' }] } }] }).text)
      .toBe('第一行\n第二行');
    expect(parseGmiVisionPayload({ text: '', error: 'no_gmi_key' }).error).toBe('no_gmi_key');
    expect(parseGmiVisionPayload({ error: { message: 'vision model unavailable' } }).error)
      .toBe('vision model unavailable');
  });

  it('posts vision requests through an injectable fetch boundary', async () => {
    let sentBody: unknown = null;
    const fetcher: GmiFetch = async (input, init) => {
      expect(input).toBe('/mock-vision');
      sentBody = JSON.parse(String(init?.body));
      return jsonResponse({ text: '云端识别文本', model: 'vision-model' });
    };

    const result = await requestGmiVision(' data:image/png;base64,abc ', {
      prompt: '  读出文字  ',
      endpoint: '/mock-vision',
      timeoutMs: 0,
      fetcher,
    });

    expect(sentBody).toEqual({ image: 'data:image/png;base64,abc', prompt: '读出文字' });
    expect(result).toMatchObject({ ok: true, text: '云端识别文本', model: 'vision-model' });
  });

  it('keeps empty vision input local and returns no_image', async () => {
    let calls = 0;
    const fetcher: GmiFetch = async () => {
      calls += 1;
      return jsonResponse({});
    };

    const result = await requestGmiVision('   ', { fetcher });

    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: false, text: '', error: 'no_image' });
  });

  it('maps upstream HTTP failures and bad JSON to explicit errors', async () => {
    const upstreamFail: GmiFetch = async () => jsonResponse({ error: 'upstream_503' }, { status: 503 });
    await expect(requestGmiVision('data:image/png;base64,abc', { fetcher: upstreamFail, timeoutMs: 0 }))
      .resolves.toMatchObject({ ok: false, text: '', error: 'upstream_503', status: 503 });

    const badJson: GmiFetch = async () => new Response('not-json', { status: 200 });
    await expect(requestGmiVision('data:image/png;base64,abc', { fetcher: badJson, timeoutMs: 0 }))
      .resolves.toMatchObject({ ok: false, text: '', error: 'bad_json', status: 200 });

    const badGatewayHtml: GmiFetch = async () => new Response('<html>bad gateway</html>', { status: 502 });
    await expect(requestGmiVision('data:image/png;base64,abc', { fetcher: badGatewayHtml, timeoutMs: 0 }))
      .resolves.toMatchObject({ ok: false, text: '', error: 'http_502', status: 502 });

    const rateLimited: GmiFetch = async () => new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '3' },
    });
    await expect(requestGmiVision('data:image/png;base64,abc', { fetcher: rateLimited, timeoutMs: 0 }))
      .resolves.toMatchObject({ ok: false, text: '', error: 'rate_limited', status: 429, retryAfterMs: 3000 });
  });

  it('reads nested GMI/OpenAI-compatible error bodies', async () => {
    expect(readGmiError({ error: { message: 'model not found', code: 'bad_model' } })).toBe('model not found');
    expect(readGmiError({ message: 'plain message' })).toBe('plain message');

    const fetcher: GmiFetch = async () => jsonResponse({ error: { message: 'model not found' } }, { status: 404 });

    await expect(requestGmiVision('data:image/png;base64,abc', { fetcher, timeoutMs: 0 }))
      .resolves.toMatchObject({ ok: false, text: '', error: 'model not found', status: 404 });
  });

  it('labels empty successful vision payloads as empty_text', async () => {
    const fetcher: GmiFetch = async () => jsonResponse({ text: '', model: 'vision-model' });

    await expect(requestGmiVision('data:image/png;base64,abc', { fetcher, timeoutMs: 0 }))
      .resolves.toMatchObject({ ok: false, text: '', error: 'empty_text', model: 'vision-model' });

    const whitespaceText: GmiFetch = async () => jsonResponse({ text: '   \n  ', model: 'vision-model' });
    await expect(requestGmiVision('data:image/png;base64,abc', { fetcher: whitespaceText, timeoutMs: 0 }))
      .resolves.toMatchObject({ ok: false, text: '', error: 'empty_text', model: 'vision-model' });
  });

  it('parses image URLs from server and console queue payloads', () => {
    expect(parseGmiImagePayload({ url: 'https://cdn.example/postcard.png', model: 'gemini-image' }).url)
      .toBe('https://cdn.example/postcard.png');
    expect(parseGmiImagePayload({ data: [{ url: 'https://cdn.example/openai-style.png' }] }).url)
      .toBe('https://cdn.example/openai-style.png');
    expect(parseGmiImagePayload({ outcome: { media_urls: [{ url: 'https://cdn.example/from-console.png' }] } }).url)
      .toBe('https://cdn.example/from-console.png');
    expect(parseGmiImagePayload({ outcome: { thumbnail_image_url: 'https://cdn.example/thumb.png' } }).url)
      .toBe('https://cdn.example/thumb.png');
    expect(parseGmiImagePayload({ request_id: 'req_123' }).requestId).toBe('req_123');
    expect(parseGmiImagePayload({ error: { message: 'image model unavailable' } }).error)
      .toBe('image model unavailable');
  });

  it('posts image generation requests without touching the network in tests', async () => {
    let sentBody: unknown = null;
    const fetcher: GmiFetch = async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      return jsonResponse({ url: 'https://cdn.example/postcard.png', model: 'gemini-image', status: 'completed' });
    };

    const result = await requestGmiImage('  原创明信片  ', {
      model: 'gemini-image',
      endpoint: '/mock-image',
      timeoutMs: 0,
      fetcher,
    });

    expect(sentBody).toEqual({ prompt: '原创明信片', model: 'gemini-image' });
    expect(result).toMatchObject({ ok: true, url: 'https://cdn.example/postcard.png', model: 'gemini-image', queueStatus: 'completed' });

    const paddedUrl: GmiFetch = async () => jsonResponse({ url: '  https://cdn.example/padded.png  ' });
    await expect(requestGmiImage('原创明信片', { fetcher: paddedUrl, timeoutMs: 0 }))
      .resolves.toMatchObject({ ok: true, url: 'https://cdn.example/padded.png' });
  });

  it('does not send blank image prompts', async () => {
    let calls = 0;
    const fetcher: GmiFetch = async () => {
      calls += 1;
      return jsonResponse({});
    };

    const result = await requestGmiImage('  ', { fetcher });

    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: false, url: '', error: 'no_prompt' });
  });

  it('labels empty successful image payloads as empty_url', async () => {
    const fetcher: GmiFetch = async () => jsonResponse({ url: '', model: 'gemini-image', status: 'completed' });

    await expect(requestGmiImage('原创明信片', { fetcher, timeoutMs: 0 }))
      .resolves.toMatchObject({ ok: false, url: '', error: 'empty_url', model: 'gemini-image', queueStatus: 'completed' });
  });

  it('labels queued image payloads as image_pending', async () => {
    expect(imageEmptyError('queued')).toBe('image_pending');
    expect(imageEmptyError('running')).toBe('image_pending');
    expect(imageEmptyError('failed')).toBe('image_failed');
    expect(imageEmptyError('canceled')).toBe('image_failed');
    expect(imageEmptyError(' FAILED ')).toBe('image_failed');
    expect(imageEmptyError('completed')).toBe('empty_url');

    const fetcher: GmiFetch = async () => jsonResponse({ model: 'gemini-image', status: 'queued', request_id: 'req_queued' });

    await expect(requestGmiImage('原创明信片', { fetcher, timeoutMs: 0 }))
      .resolves.toMatchObject({ ok: false, url: '', error: 'image_pending', model: 'gemini-image', queueStatus: 'queued', requestId: 'req_queued' });
  });

  it('turns request aborts into timeout errors', async () => {
    const fetcher: GmiFetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });

    const result = await requestGmiImage('原创明信片', {
      endpoint: '/slow-image',
      timeoutMs: 1,
      fetcher,
    });

    expect(result).toMatchObject({ ok: false, url: '', error: 'timeout' });
  });
});
