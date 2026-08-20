import type { Plugin } from 'vite';
// @ts-expect-error Shared production module intentionally stays zero-dependency ESM.
import { getTravelPlaceSources } from '../../knowledge/travel-place-sources.mjs';

const cache = new Map<string, { expires: number; body: string }>();

function readBody(request: NodeJS.ReadableStream, maxBytes = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on('data', (chunk: Buffer) => {
      const value = Buffer.from(chunk);
      total += value.length;
      if (total > maxBytes) { reject(new Error('body_too_large')); return; }
      chunks.push(value);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export function travelPlaceSources(env: Record<string, string>): Plugin {
  const qwenKey = env.DASHSCOPE_API_KEY || env.QWEN_API_KEY || '';
  const qwenBase = (env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
  const qwenSearchModel = env.QWEN_SEARCH_MODEL || 'qwen3.5-plus';
  const qwenWriterModel = env.QWEN_PLACE_MODEL || env.QWEN_MODEL || 'qwen-plus';
  return {
    name: 'travel-place-sources',
    configureServer(server) {
      server.middlewares.use('/api/travel-place-sources', (request, response) => {
        if (request.method !== 'GET') { response.statusCode = 405; response.end(); return; }
        const url = new URL(request.url || '/', 'http://localhost');
        const place = (url.searchParams.get('place') || '').trim();
        const city = (url.searchParams.get('city') || '').trim();
        const key = `v6\u0000${city}\u0000${place}`;
        const hit = cache.get(key);
        if (hit && hit.expires > Date.now()) {
          response.setHeader('content-type', 'application/json; charset=utf-8');
          response.end(hit.body);
          return;
        }
        void getTravelPlaceSources(place, city, { qwenKey, qwenBase, qwenSearchModel }).then((sources: unknown[]) => {
          const body = JSON.stringify({ sources, retrievedAt: new Date().toISOString() });
          if (sources.length) cache.set(key, { expires: Date.now() + 6 * 60 * 60 * 1000, body });
          response.statusCode = sources.length ? 200 : 404;
          response.setHeader('content-type', 'application/json; charset=utf-8');
          response.setHeader('cache-control', 'private, max-age=300');
          response.end(body);
        }).catch((error: unknown) => {
          response.statusCode = 502;
          response.setHeader('content-type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ sources: [], error: String(error) }));
        });
      });
      server.middlewares.use('/api/travel-place-brief', (request, response) => {
        if (request.method !== 'POST') { response.statusCode = 405; response.end(); return; }
        void readBody(request).then(async (raw) => {
          if (!qwenKey) return { backend: 'stub', text: '', error: 'no_dashscope_key' };
          const body = JSON.parse(raw || '{}') as { prompt?: unknown; system?: unknown };
          const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 24000) : '';
          const system = typeof body.system === 'string' ? body.system.slice(0, 5000) : '';
          if (!prompt) return { backend: 'stub', text: '', error: 'invalid_prompt' };
          const upstream = await fetch(`${qwenBase}/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${qwenKey}` },
            body: JSON.stringify({
              model: qwenWriterModel,
              messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
              temperature: 0.15,
              max_tokens: 900,
            }),
            signal: AbortSignal.timeout(45000),
          });
          const data = await upstream.json() as { choices?: Array<{ message?: { content?: unknown } }>; error?: unknown };
          return upstream.ok
            ? { backend: 'qwen-cloud', text: typeof data.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content : '', model: qwenWriterModel }
            : { backend: 'stub', text: '', error: String(data.error || `qwen_${upstream.status}`) };
        }).then((result) => {
          response.statusCode = 200;
          response.setHeader('content-type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(result));
        }).catch((error: unknown) => {
          response.statusCode = 200;
          response.setHeader('content-type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ backend: 'stub', text: '', error: String(error) }));
        });
      });
    },
  };
}
