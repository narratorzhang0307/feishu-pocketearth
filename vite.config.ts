import { defineConfig, loadEnv, type Plugin } from 'vite'
import path from 'path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { unsplashProxy } from './frost-agent/planet/viteUnsplash'
import { travelPlaceSources } from './frost-agent/planet/viteTravelPlaceSources'
import { frostEdge } from './frost-agent/edge/viteEdge'
// @ts-expect-error Plain ESM is shared with production Node server.
import { buildQwenChatBody, buildQwenImageBody, createQwenProvider, qwenModelForTask, readQwenImageUrl } from './server/qwen-provider.mjs'
// @ts-expect-error Plain ESM Feishu router is shared by Vite and the production Node server.
import { createFeishuRouter } from './server/feishu/router.mjs'
// Production 由 server.mjs 提供完整 travel-mcp；开发态至少保留同源地理编码。
// 否则 Vite 会把 /api/travel-mcp 回退成 index.html，Mapping 候选永远拿不到坐标。
function travelGeocodeDev(): Plugin {
  const cache = new Map<string, { at: number; value: unknown }>()
  return {
    name: 'travel-geocode-dev',
    configureServer(server) {
      server.middlewares.use('/api/travel-mcp', (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        if (url.searchParams.get('tool') !== 'geocode') { next(); return }
        const query = (url.searchParams.get('q') || '').trim()
        const send = (value: unknown) => { res.statusCode = 200; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)) }
        if (!query) { send({ error: 'no_query' }); return }
        const hit = cache.get(query)
        if (hit && Date.now() - hit.at < 24 * 3600e3) { send(hit.value); return }
        const endpoint = new URL('https://nominatim.openstreetmap.org/search')
        endpoint.searchParams.set('q', query)
        endpoint.searchParams.set('format', 'json')
        endpoint.searchParams.set('limit', '1')
        endpoint.searchParams.set('accept-language', 'zh')
        void fetch(endpoint, {
          headers: { 'user-agent': 'PocketEarth/1.0 (local development; contact: local@pocket-earth.invalid)' },
          signal: AbortSignal.timeout(7000),
        }).then((response) => response.json()).then((data) => {
          const first = Array.isArray(data) ? data[0] : null
          const value = first ? { lng: Number(first.lon), lat: Number(first.lat), name: String(first.display_name || query).split(',')[0] } : { error: 'not_found' }
          if (!('error' in value)) cache.set(query, { at: Date.now(), value })
          send(value)
        }).catch((error) => send({ error: 'geocode_unavailable', detail: String(error) }))
      })
    },
  }
}

// dev 读 body：Buffer 收集后整体解码（与 prod server.mjs 的 readBody 对齐，防多字节 UTF-8 在 chunk 边界切碎中文）
function readDevBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

// 飞书工作流开发态与生产态共用同一个 router，避免 Demo 在 Vite 可用、部署后契约漂移。
function feishuDev(env: Record<string, string>): Plugin {
  return {
    name: 'pocket-earth-feishu',
    async configureServer(server) {
      const qwenProvider = createQwenProvider(env)
      const sendJSON = (res: any, value: unknown, code = 200) => {
        res.statusCode = code
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(JSON.stringify(value))
      }
      const router = await createFeishuRouter({
        env,
        rootDir: process.cwd(),
        qwenProvider,
        readBody: readDevBody,
        sendJSON,
      })
      server.middlewares.use((req, res, next) => {
        if (!String(req.url || '').startsWith('/api/feishu/')) { next(); return }
        const url = new URL(req.url || '/', 'http://localhost')
        void router.handle(req, res, url)
      })
    },
  }
}

// LLM 代理：dev 中间件，把 /api/frost-llm 转给云脑。
// 开发与生产共用 server/qwen-provider.mjs，避免出现两套模型路由。
function frostLlm(env: Record<string, string>): Plugin {
  const QWEN = createQwenProvider(env)
  const QWEN_BASE = QWEN.url.replace(/\/chat\/completions$/, '')
  return {
    name: 'frost-llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/frost-llm-stream', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        readDevBody(req).then(async (body) => {
          res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' })
          const sse = (value: unknown) => res.write(`data: ${JSON.stringify(value)}\n\n`)
          try {
            if (!QWEN.key) { sse({ done: true, error: 'no_qwen_key' }); res.end(); return }
            const { prompt, system, task } = JSON.parse(body || '{}')
            const upstream = await fetch(QWEN.url, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${QWEN.key}` },
              body: JSON.stringify(buildQwenChatBody(QWEN, { prompt, system, task: String(task || 'default'), stream: true })),
              signal: AbortSignal.timeout(120000),
            })
            if (!upstream.ok || !upstream.body) { sse({ done: true, error: `http_${upstream.status}` }); res.end(); return }
            const reader = upstream.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            for (;;) {
              const next = await reader.read()
              if (next.done) break
              buffer += decoder.decode(next.value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''
              for (const line of lines) {
                const payload = line.trim().replace(/^data:\s*/, '')
                if (!line.trim().startsWith('data:')) continue
                if (payload === '[DONE]') { sse({ done: true }); res.end(); return }
                try {
                  const token = JSON.parse(payload)?.choices?.[0]?.delta?.content
                  if (token) sse({ token })
                } catch { /* ignore non-JSON upstream events */ }
              }
            }
            sse({ done: true }); res.end()
          } catch (error) {
            if (!res.writableEnded) { sse({ done: true, error: String(error) }); res.end() }
          }
        })
      })
      server.middlewares.use('/api/frost-llm', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        readDevBody(req).then(async (body) => {
          const send = (obj: unknown) => {
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(obj))
          }
          try {
            const { prompt, system, json, task } = JSON.parse(body || '{}')
            if (!QWEN.key) return send({ text: '', error: 'no_qwen_key' })
            const taskName = String(task || 'default')
            const model = qwenModelForTask(QWEN, taskName)
            const r = await fetch(QWEN.url, {
              method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${QWEN.key}` },
              body: JSON.stringify(buildQwenChatBody(QWEN, {
                prompt, system, task: taskName, json: !!json, search: taskName.startsWith('research-'),
                temperature: json ? 0 : (taskName.startsWith('exhibition-') || taskName.startsWith('mapping-') ? 0.35 : 0.65),
              })),
              signal: AbortSignal.timeout(taskName.startsWith('research-') ? 60000 : 30000),
            })
            if (!r.ok) { res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ text: '', error: 'upstream_' + r.status })); return }   // 透传上游 429/5xx（send 写死 200，故直接写状态码）：客户端 withRetry 才能据 r.ok 重试
            const data = await r.json()
            send({ text: data?.choices?.[0]?.message?.content || '', model, provider: QWEN.provider, modelOwner: QWEN.owner, transport: QWEN.transport })
          } catch (e) {
            send({ text: '', error: String(e) })
          }
        })
      })
      // 旧视觉路径明确下线；调用点必须迁到 /api/qwen-vision。
      server.middlewares.use('/api/gemini-vision', (_req, res) => {
        res.statusCode = 410; res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ text: '', error: 'legacy_provider_removed_use_/api/qwen-vision' }))
      })
      // 看展搭子云视觉兜底：用户明确同意后，公开展签才会送阿里云百炼 Qwen3-VL；默认端侧 Qwen/MNN 优先。
      server.middlewares.use('/api/qwen-vision', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        readDevBody(req).then(async (vbody) => {
          const send = (obj: unknown, code = 200) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)) }
          try {
            if (!QWEN.key) return send({ text: '', error: 'no_qwen_key' })
            const { image, prompt } = JSON.parse(vbody || '{}')
            if (!image) return send({ text: '', error: 'no_image' })
            const upstream = await fetch(`${QWEN_BASE}/chat/completions`, {
              method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${QWEN.key}` },
              body: JSON.stringify({
                model: QWEN.visionModel, temperature: 0, max_tokens: 900,
                messages: [{ role: 'user', content: [
                  { type: 'image_url', image_url: { url: image } },
                  { type: 'text', text: prompt || '提取图中所有文字，含中英文，原样输出，不要总结。' },
                ] }],
              }),
              signal: AbortSignal.timeout(45000),
            })
            const data = await upstream.json()
            return upstream.ok
              ? send({ text: data?.choices?.[0]?.message?.content || '', model: QWEN.visionModel, provider: QWEN.provider, modelOwner: QWEN.owner })
              : send({ text: '', error: data?.error || `qwen_${upstream.status}` }, upstream.status)
          } catch (error) { send({ text: '', error: String(error) }) }
        })
      })
      // Qwen Image 原生同步接口；旧 URL 只保留为客户端兼容别名。
      const qwenImageMiddleware = (req: any, res: any) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        readDevBody(req).then(async (ibody) => {
          const isend = (obj: unknown) => { res.statusCode = 200; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)) }
          try {
            if (!QWEN.key) return isend({ url: '', error: 'no_qwen_key' })
            const { prompt } = JSON.parse(ibody || '{}')
            if (!prompt) return isend({ url: '', error: 'no_prompt' })
            const r = await fetch(QWEN.nativeImageUrl, {
              method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${QWEN.key}` },
              body: JSON.stringify(buildQwenImageBody(QWEN, prompt)),
              signal: AbortSignal.timeout(120000),
            })
            if (!r.ok) { res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ url: '', error: 'upstream_' + r.status })); return }
            const data = await r.json()
            const url = readQwenImageUrl(data)
            isend({ url, model: QWEN.imageModel, status: url ? 'completed' : 'empty', provider: QWEN.provider, modelOwner: QWEN.owner, transport: 'dashscope-native' })
          } catch (e) { isend({ url: '', error: String(e) }) }
        })
      }
      server.middlewares.use('/api/qwen-image', qwenImageMiddleware)
      const legacyImageRemoved = (_req: unknown, res: any) => {
        res.statusCode = 410
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ url: '', error: 'legacy_provider_removed_use_/api/qwen-image' }))
      }
      server.middlewares.use('/api/gemini-image', legacyImageRemoved)
      server.middlewares.use('/api/gmi-image', legacyImageRemoved)
      // KIRI 3DGS 云重建（dev）：绕拍视频/多图 → splat。SSRF 只放行 api.kiriengine.app；upload 流式透传防 OOM
      server.middlewares.use('/api/kiri', (req, res) => {
        const KIRI_BASE = 'https://api.kiriengine.app/api/v1/open'
        const u = new URL(req.url || '/', 'http://localhost')
        const op = u.searchParams.get('op') || ''
        const ksend = (obj: unknown, code = 200) => { if (res.headersSent) return; res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)) }
        // BYOK：只用用户自带 key（x-kiri-key 头），不读服务端 env、不共享额度
        const KIRI_KEY = String(req.headers['x-kiri-key'] || '').trim()
        if (!KIRI_KEY) return ksend({ error: 'need_kiri_key' }, 400)
        const H = { authorization: `Bearer ${KIRI_KEY}` }
        ;(async () => {
          try {
            if (op === 'status') { const s = u.searchParams.get('serialize') || ''; const r = await fetch(`${KIRI_BASE}/model/getStatus?serialize=${encodeURIComponent(s)}`, { headers: H }); return ksend(await r.json(), r.ok ? 200 : r.status) }
            if (op === 'zip') { const s = u.searchParams.get('serialize') || ''; const r = await fetch(`${KIRI_BASE}/model/getModelZip?serialize=${encodeURIComponent(s)}`, { headers: H }); const d = await r.json(); return ksend({ modelUrl: d?.data?.modelUrl || '', raw: d }, r.ok ? 200 : r.status) }
            if (op === 'fetchzip') { const s = u.searchParams.get('serialize') || ''; const zr = await fetch(`${KIRI_BASE}/model/getModelZip?serialize=${encodeURIComponent(s)}`, { headers: H }); const zd = await zr.json(); const mu = zd?.data?.modelUrl || ''; if (!mu) return ksend({ error: 'no_model_url' }, 502); const fr = await fetch(mu); if (!fr.ok || !fr.body) return ksend({ error: 'zip_fetch_' + fr.status }, 502); res.statusCode = 200; res.setHeader('content-type', 'application/zip'); try { await pipeline(Readable.fromWeb(fr.body as import('node:stream/web').ReadableStream<Uint8Array>), res) } catch { if (!res.writableEnded) res.destroy() } return }
            if (op === 'balance') { const r = await fetch(`${KIRI_BASE}/balance`, { headers: H }); return ksend(await r.json(), r.ok ? 200 : r.status) }
            if (op === 'upload') { const kind = u.searchParams.get('kind') === 'image' ? '3dgs/image' : '3dgs/video'; const r = await fetch(`${KIRI_BASE}/${kind}`, { method: 'POST', headers: { ...H, 'content-type': req.headers['content-type'] || 'application/octet-stream' }, body: req as unknown as BodyInit, duplex: 'half' } as RequestInit); const d = await r.json(); return ksend({ serialize: d?.data?.serialize || '', raw: d }, r.ok ? 200 : r.status) }
            return ksend({ error: 'bad_op' }, 400)
          } catch (e) { ksend({ error: String(e) }) }
        })()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          // 把大依赖拆成独立 chunk：mapbox 只随地球 tab 加载、可独立缓存；
          // react/motion 各自成块；其余三方进 vendor。配合 tab 懒加载，首屏 JS 大幅瘦身。
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return
            // Photos 的 CLIP/ONNX 只能在用户点击“建立语义索引”后加载；独立异步块避免并入通用 vendor/首屏。
            if (id.includes('@huggingface/transformers') || id.includes('onnxruntime')) return 'photo-semantic-runtime'
            // 3D 高斯泼溅（three + gaussian-splats-3d）：单独异步块，只在点开展品 3D 时懒加载，不压首屏。
            if (id.includes('@mkkellogg/gaussian-splats-3d') || id.includes('node_modules/three')) return 'splat3d'
            if (id.includes('mapbox-gl')) return 'mapbox'
            if (id.includes('/react') || id.includes('react-dom') || id.includes('scheduler')) return 'react'
            if (id.includes('motion') || id.includes('framer')) return 'motion'
            // 飞书 WebView 对弱网首屏有超时保护。以下能力都只在用户进入相应流程后才需要，
            // 不能和首页共用一个 vendor 包，否则 PDF/压缩/EXIF 会让空白页持续几十秒。
            if (id.includes('pdfjs-dist')) return 'pdfjs'
            if (id.includes('jszip')) return 'jszip'
            if (id.includes('fflate')) return 'fflate'
            if (id.includes('exifr')) return 'exifr'
            if (id.includes('@capacitor') || id.includes('@capgo')) return 'capacitor'
            if (id.includes('lucide-react')) return 'icons'
            return 'vendor'
          },
        },
      },
    },
    plugins: [react(), tailwindcss(), feishuDev(env), frostEdge(env), travelGeocodeDev(), travelPlaceSources(env), frostLlm(env), unsplashProxy(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'frost-agent': path.resolve(__dirname, './frost-agent'),
      },
    },
  }
})
