import type { Plugin } from 'vite';
import { mnnChatBody } from '../provider-compat/mnn';

type RuntimeHealth = {
  models?: { text?: boolean };
  adapters?: Record<string, { installed?: boolean; file?: string }>;
};

const ALLOWED_ADAPTER = 'travel-planner';
const ALLOWED_BASE_PURPOSE = 'travel-place-brief';

export function qwenMnnEdge(env: Record<string, string>): Plugin {
  const mnnUrl = (env.MNN_URL || '').replace(/\/$/, '');
  const enabled = (env.EDGE_BACKEND || 'stub').toLowerCase() === 'mnn';

  async function health(): Promise<RuntimeHealth | null> {
    if (!enabled || !mnnUrl) return null;
    try {
      const response = await fetch(`${mnnUrl}/health`, { signal: AbortSignal.timeout(5000) });
      return response.ok ? await response.json() as RuntimeHealth : null;
    } catch {
      return null;
    }
  }

  async function handle(raw: string): Promise<Record<string, unknown>> {
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    const current = await health();
    if (!current) return { backend: 'stub', text: '', error: 'mnn_runtime_unavailable' };

    if (body.task === 'runtime_status') {
      return {
        backend: 'mnn',
        runtime: { engine: 'mnn', textReady: Boolean(current.models?.text), adapters: current.adapters || {} },
      };
    }
    if (body.task === 'ping') return { backend: 'mnn' };
    if (body.task !== 'chat') return { backend: 'stub', text: '', error: 'unsupported_edge_task' };
    const useTravelAdapter = body.adapter === ALLOWED_ADAPTER;
    const useGroundedBase = !body.adapter && body.purpose === ALLOWED_BASE_PURPOSE;
    if (!useTravelAdapter && !useGroundedBase) return { backend: 'stub', text: '', error: 'edge_purpose_not_allowlisted' };
    if (useTravelAdapter && current.adapters?.[ALLOWED_ADAPTER]?.installed !== true) {
      return { backend: 'stub', text: '', error: 'travel_planner_adapter_not_installed' };
    }

    const response = await fetch(`${mnnUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mnnChatBody({
        prompt: String(body.prompt || ''),
        system: typeof body.system === 'string' ? body.system : undefined,
        json: body.json === true,
        adapter: useTravelAdapter ? ALLOWED_ADAPTER : undefined,
        maxTokens: typeof body.maxTokens === 'number' ? Math.min(useGroundedBase ? 768 : 1024, body.maxTokens) : 384,
      })),
      signal: AbortSignal.timeout(70000),
    });
    const data = await response.json() as { text?: unknown; error?: unknown };
    return response.ok
      ? { backend: 'mnn', text: typeof data.text === 'string' ? data.text : '' }
      : { backend: 'stub', text: '', error: String(data.error || `mnn_${response.status}`) };
  }

  return {
    name: 'qwen-mnn-travel-edge',
    configureServer(server) {
      server.middlewares.use('/api/edge', (request, response) => {
        if (request.method !== 'POST') { response.statusCode = 405; response.end(); return; }
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        request.on('end', () => {
          void handle(Buffer.concat(chunks).toString('utf8')).then((result) => {
            response.statusCode = 200;
            response.setHeader('content-type', 'application/json; charset=utf-8');
            response.end(JSON.stringify(result));
          }).catch((error) => {
            response.statusCode = 200;
            response.setHeader('content-type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ backend: 'stub', text: '', error: String(error) }));
          });
        });
      });
    },
  };
}
