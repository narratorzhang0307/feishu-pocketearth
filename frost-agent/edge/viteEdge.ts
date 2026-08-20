import type { Plugin } from 'vite'
import { ollamaChatBody } from '../provider-compat/qwen'
import { mnnChatBody } from '../provider-compat/mnn'

// 端侧推理中间件：/api/edge → 选后端(MNN sidecar / ollama / stub) → 路由到 Qwen 文本/视觉。
// 后端选择：EDGE_BACKEND=auto|mnn|ollama|stub；auto 时优先 MNN(配了 MNN_URL 且可达)，否则 ollama，否则 stub。
// 切到 MNN 不改前端：classify/rank/vision 的提示整形对所有后端共用，只换"发给谁"。
// 生产手机端用 MNN（见 deploy/edge-runtime/）；本机 demo 也可用 ollama。地址/模型只在服务端从 .env 读。
export function frostEdge(env: Record<string, string>): Plugin {
  const OLLAMA = env.OLLAMA_URL || 'http://localhost:11434'
  const MODEL = env.EDGE_MODEL || 'qwen3:0.6b'
  const VMODEL = env.EDGE_VISION_MODEL || 'qwen2.5vl:3b'
  const MNN_URL = env.MNN_URL || ''                       // 端侧 MNN sidecar，如 http://127.0.0.1:8000
  const WANT = (env.EDGE_BACKEND || 'auto').toLowerCase() // auto | mnn | ollama | stub

  type Msg = { role: string; content: string; images?: string[] }

  // —— 探测(各带 10s 缓存) ——
  const cache = { ollama: null as boolean | null, ollamaAt: 0, mnn: null as boolean | null, mnnAt: 0 }
  async function probeOllama(): Promise<boolean> {
    const now = Date.now()
    if (cache.ollama !== null && now - cache.ollamaAt < 10000) return cache.ollama
    try { cache.ollama = (await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(1500) })).ok } catch { cache.ollama = false }
    cache.ollamaAt = now; return !!cache.ollama
  }
  async function probeMnn(): Promise<boolean> {
    if (!MNN_URL) return false
    const now = Date.now()
    if (cache.mnn !== null && now - cache.mnnAt < 10000) return cache.mnn
    // 首次加载 Qwen/MNN 时 health 需要读取模型与资产清单；在手机与本机冷启动上
    // 1.5 秒过于激进，会把真实可用的 MNN 错判成 stub。
    try { cache.mnn = (await fetch(MNN_URL + '/health', { signal: AbortSignal.timeout(5000) })).ok } catch { cache.mnn = false }
    cache.mnnAt = now; return !!cache.mnn
  }

  // —— ollama 后端 ——
  async function ollamaChat(messages: Msg[], opts?: { json?: boolean; think?: boolean; model?: string }): Promise<string> {
    const r = await fetch(OLLAMA + '/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ollamaChatBody({ model: opts?.model || MODEL, messages, json: opts?.json, think: opts?.think })),
    })
    return (await r.json())?.message?.content || ''
  }
  async function ollamaEmbed(texts: string[]): Promise<number[][]> {
    const out: number[][] = []
    for (const t of texts) {
      try {
        const r = await fetch(OLLAMA + '/api/embeddings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, prompt: t }) })
        const d = await r.json(); out.push(Array.isArray(d?.embedding) ? d.embedding : [])
      } catch { out.push([]) }
    }
    return out
  }

  // —— MNN sidecar 后端 ——
  async function mnnChat(messages: Msg[], opts?: { json?: boolean; model?: string; adapter?: string; detail?: 'fast' | 'high' | 'ocr'; maxTokens?: number }): Promise<string> {
    const system = messages.find((m) => m.role === 'system')?.content
    const prompt = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n')
    const images = messages.flatMap((m) => m.images || [])
    const r = await fetch(MNN_URL + '/v1/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mnnChatBody({ system, prompt, images, json: opts?.json, adapter: opts?.adapter, detail: opts?.detail, maxTokens: opts?.maxTokens })),
    })
    const d = await r.json()
    return typeof d?.text === 'string' ? d.text : ''
  }
  // MNN-LLM 主线给 chat；无专用嵌入头时返回空向量，调用方按空降级(契约不抛错)。
  async function mnnEmbed(texts: string[]): Promise<number[][]> { return texts.map(() => []) }

  type Backend = { name: 'mnn' | 'ollama'; chat: (m: Msg[], o?: { json?: boolean; think?: boolean; model?: string; adapter?: string; detail?: 'fast' | 'high' | 'ocr'; maxTokens?: number }) => Promise<string>; embed: (t: string[]) => Promise<number[][]> }
  const mnnBE: Backend = { name: 'mnn', chat: mnnChat, embed: mnnEmbed }
  const ollamaBE: Backend = { name: 'ollama', chat: ollamaChat, embed: ollamaEmbed }

  async function pickBackend(): Promise<Backend | null> {
    if (WANT === 'stub') return null
    if (WANT === 'mnn') return (await probeMnn()) ? mnnBE : null
    if (WANT === 'ollama') return (await probeOllama()) ? ollamaBE : null
    // auto：MNN 优先(配了且可达)，否则 ollama，否则 stub
    if (await probeMnn()) return mnnBE
    if (await probeOllama()) return ollamaBE
    return null
  }

  async function toBase64(image: string): Promise<string> {
    if (image.startsWith('data:')) return image.split(',')[1] || ''
    if (image.startsWith('http')) return Buffer.from(await (await fetch(image)).arrayBuffer()).toString('base64')
    return image
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handle(raw: string): Promise<any> {
    const b = JSON.parse(raw || '{}')
    if (b.task === 'asset_status' || b.task === 'asset_install' || b.task === 'asset_cancel' || b.task === 'asset_uninstall') {
      if (!MNN_URL) return { backend: 'stub', assets: [], error: 'mnn_runtime_not_configured' }
      try {
        const endpoint = b.task === 'asset_status' ? '/v1/assets'
          : b.task === 'asset_install' ? '/v1/assets/install'
            : b.task === 'asset_uninstall' ? '/v1/assets/uninstall' : '/v1/assets/cancel'
        const response = await fetch(MNN_URL + endpoint, b.task === 'asset_status' ? {
          signal: AbortSignal.timeout(2500),
        } : {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ asset: b.asset, url: b.url, sha256: b.sha256, bytes: b.bytes }), signal: AbortSignal.timeout(b.task === 'asset_install' || b.task === 'asset_uninstall' ? 180000 : 5000),
        })
        const data = await response.json()
        return { backend: response.ok ? 'mnn' : 'stub', assets: data?.assets || [], error: data?.error }
      } catch (error) {
        return { backend: 'stub', assets: [], error: String(error) }
      }
    }
    const be = await pickBackend()
    if (!be) return stub(b)
    switch (b.task) {
      case 'ping':
        return { backend: be.name }
      case 'chat': {
        const msgs: Msg[] = []
        if (b.system) msgs.push({ role: 'system', content: b.system })
        msgs.push({ role: 'user', content: b.prompt })
        if (b.adapter && be.name !== 'mnn') return { backend: 'stub', text: '', error: `adapter ${b.adapter} requires mnn` }
        return { backend: be.name, text: await be.chat(msgs, { json: b.json, adapter: b.adapter, maxTokens: b.maxTokens }) }
      }
      case 'classify': {
        const t = await be.chat(
          [
            { role: 'system', content: '你是分类器。只输出给定选项中的一个，不要任何多余文字。' },
            { role: 'user', content: `文本：${b.text}\n选项：${(b.labels || []).join(' / ')}\n答：` },
          ],
          { think: false }
        )
        const pick = (b.labels || []).find((l: string) => t.includes(l)) || (b.labels || [])[0] || ''
        return { backend: be.name, text: pick }
      }
      case 'rank': {
        const t = await be.chat(
          [
            { role: 'system', content: '给每个候选打 0-100 的相关度分。只返回一个 JSON 数组（仅数字，长度与候选一致）。' },
            { role: 'user', content: `查询：${b.query}\n候选：\n${(b.candidates || []).map((c: string, i: number) => `${i}. ${c}`).join('\n')}\nJSON：` },
          ],
          { json: true, think: false }
        )
        let scores: number[]
        try {
          const arr = JSON.parse(t)
          const list = Array.isArray(arr) ? arr : arr.scores || []
          scores = (b.candidates || []).map((_: string, i: number) => (Number(list[i]) || 0) / 100)
        } catch {
          scores = (b.candidates || []).map(() => 0.5)
        }
        return { backend: be.name, scores }
      }
      case 'embed':
        return { backend: be.name, vectors: await be.embed(b.texts || []) }
      case 'runtime_status': {
        if (be.name !== 'mnn') {
          return { backend: be.name, runtime: { engine: be.name, textReady: true, visionReady: true, adapters: {}, restorer: { installed: false }, exhibitMatting: { installed: false }, acceleration: [] } }
        }
        try {
          const health = await (await fetch(MNN_URL + '/health', { signal: AbortSignal.timeout(5000) })).json()
          return { backend: 'mnn', runtime: { engine: 'mnn', textReady: !!health?.models?.text, visionReady: !!health?.models?.vision, adapters: health?.adapters || {}, restorer: health?.restorer || { installed: false }, exhibitMatting: health?.exhibitMatting || { installed: false }, acceleration: health?.acceleration || [], visualLoraRuntime: health?.visualLoraRuntime || { ready: false } } }
        } catch {
          return { backend: 'stub', runtime: { engine: 'stub', textReady: false, visionReady: false, adapters: {}, restorer: { installed: false }, exhibitMatting: { installed: false }, acceleration: [] } }
        }
      }
      case 'runtime_probe': {
        if (be.name !== 'mnn') return { backend: 'stub', runtime: { engine: 'stub', probe: { ok: false, elapsedMs: 0, output: '' } }, error: 'mnn_runtime_unavailable' }
        const startedAt = Date.now()
        try {
          const output = (await be.chat([
            { role: 'system', content: '只回答 POCKET_OK' },
            { role: 'user', content: 'runtime probe' },
          ], { model: MODEL, think: false, maxTokens: 8 })).trim().slice(0, 80)
          return { backend: output ? 'mnn' : 'stub', runtime: { engine: output ? 'mnn' : 'stub', probe: { ok: !!output, elapsedMs: Date.now() - startedAt, output } } }
        } catch (error) {
          return { backend: 'stub', runtime: { engine: 'stub', probe: { ok: false, elapsedMs: Date.now() - startedAt, output: '' } }, error: String(error) }
        }
      }
      case 'vision': {
        // 指定了 LoRA 就只允许 MNN 真正加载该 adapter；不能悄悄拿 ollama/base 冒充。
        if (b.adapter && be.name !== 'mnn') return { backend: 'stub', text: '', error: `adapter ${b.adapter} requires mnn` }
        const b64 = await toBase64(b.image)
        const text = await be.chat([{ role: 'user', content: b.prompt, images: [b64] }], { model: VMODEL, think: false, adapter: b.adapter, detail: b.detail, maxTokens: b.maxTokens })
        return { backend: be.name, text }
      }
      case 'heritage_restore': {
        if (be.name !== 'mnn') return { backend: 'stub', error: 'heritage restorer requires mnn' }
        const response = await fetch(MNN_URL + '/v1/restoration', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image: b.image, mask: b.mask }), signal: AbortSignal.timeout(120000),
        })
        const data = await response.json()
        return { backend: response.ok ? 'mnn' : 'stub', image: data?.image, stats: data?.stats, error: data?.error }
      }
      case 'exhibit_matting': {
        if (be.name !== 'mnn') return { backend: 'stub', error: 'exhibit matting requires mnn' }
        const response = await fetch(MNN_URL + '/v1/exhibit-matting', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image: b.image }), signal: AbortSignal.timeout(120000),
        })
        const data = await response.json()
        return { backend: response.ok ? 'mnn' : 'stub', image: data?.image, alpha: data?.alpha, stats: data?.stats, error: data?.error }
      }
      default:
        return stub(b)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function stub(b: any): any {
    switch (b?.task) {
      case 'rank': {
        const n = (b.candidates || []).length
        return { backend: 'stub', scores: (b.candidates || []).map((_: string, i: number) => (n > 1 ? 1 - i / (n - 1) : 1)) }
      }
      case 'embed':
        return { backend: 'stub', vectors: (b.texts || []).map(() => []) }
      case 'classify':
        return { backend: 'stub', text: (b.labels || [])[0] || '' }
      default:
        return { backend: 'stub', text: '' }
    }
  }

  return {
    name: 'frost-edge',
    configureServer(server) {
      server.middlewares.use('/api/edge-assets', (req, res) => {
        if (req.method !== 'POST' || !MNN_URL) { res.statusCode = !MNN_URL ? 503 : 405; res.end(); return }
        const asset = String(req.headers['x-pocket-asset'] || '')
        if (!['guji-vision-lora', 'rubbing-vision-lora', 'general-ocr-vision-lora', 'travel-planner-lora', 'heritage-restorer', 'exhibit-matting'].includes(asset)) {
          res.statusCode = 400; res.end(JSON.stringify({ error: 'asset_not_allowlisted' })); return
        }
        void (async () => {
          try {
            const headers: Record<string, string> = { 'content-type': 'application/octet-stream' }
            if (req.headers['content-length']) headers['content-length'] = String(req.headers['content-length'])
            const upstream = await fetch(`${MNN_URL}/v1/assets/import/${asset}`, {
              method: 'POST', headers, body: req as unknown as BodyInit, duplex: 'half',
            } as RequestInit & { duplex: 'half' })
            res.statusCode = upstream.status; res.setHeader('content-type', 'application/json')
            res.end(await upstream.text())
          } catch (error) {
            res.statusCode = 502; res.end(JSON.stringify({ error: String(error) }))
          }
        })()
      })
      server.middlewares.use('/api/edge', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        const chunks: Buffer[] = []
        let settled = false
        const fail = (code: number) => { if (settled) return; settled = true; try { res.statusCode = code; res.end(JSON.stringify({ backend: 'stub' })) } catch { /* ignore */ } }
        req.on('error', () => fail(400))
        req.on('aborted', () => { settled = true })   // 客户端断开：标记已结，别再回写
        req.on('data', (c: Buffer) => { chunks.push(Buffer.from(c)) })   // 收 Buffer、end 时整体解码——防多字节 UTF-8 在 chunk 边界被切碎（中文损坏）
        req.on('end', async () => {
          if (settled) return
          settled = true
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          try { res.end(JSON.stringify(await handle(Buffer.concat(chunks).toString('utf8')))) } catch (e) { try { res.end(JSON.stringify({ backend: 'stub', error: String(e) })) } catch { /* ignore */ } }
        })
      })
    },
  }
}
