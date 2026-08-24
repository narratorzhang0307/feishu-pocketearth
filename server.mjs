// Pocket Earth · 生产服务（线上 demo）
// 单文件、零依赖（只用 Node 内置）：静态托管 dist/ + 把 dev 三中间件 1:1 搬到生产。
//   /api/frost-llm  Qwen 云脑代理，密钥只在服务端
//   /api/qwen-image Qwen Image 明信片图像生成
//   /api/edge       Qwen/MNN 端侧推理代理：文本、视觉、LoRA、展品抠图与资产管理
//   /api/unsplash   星球 agent 抓图代理，access key 服务端读
// 反代在前（nginx 443→本端口），本服务只监听内网端口。运行：node server.mjs（或 pm2）。
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import dns from 'node:dns'
import { getTravelPlaceSources } from './knowledge/travel-place-sources.mjs'
import { buildQwenChatBody, buildQwenImageBody, createQwenProvider, qwenModelForTask, readQwenImageUrl } from './server/qwen-provider.mjs'
import { applySecurityHeaders, boundedText, clientAddress, createSlidingWindowLimiter, isSafeDataImage, isSafeInlineImage } from './server/security.mjs'
import { createFeishuRouter } from './server/feishu/router.mjs'

// 阿里云盒子 IPv6 路由不通：node fetch 默认 v6 优先会 ETIMEDOUT（curl 正常的经典差异）→ 强制 v4 优先
dns.setDefaultResultOrder('ipv4first')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')

// —— 极简 .env 加载（不覆盖已有 process.env，便于 pm2/系统环境优先） ——
;(function loadEnv() {
  const f = path.join(__dirname, '.env')
  if (!existsSync(f)) return
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const k = m[1]
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
})()

const PORT = Number(process.env.API_PORT || process.env.PORT || 3009)
const MNN_URL = String(process.env.MNN_URL || '').replace(/\/$/, '')
const MNN_EDGE_ENABLED = String(process.env.EDGE_BACKEND || 'stub').toLowerCase() === 'mnn'
const QWEN = createQwenProvider(process.env)
const DASHSCOPE_KEY = QWEN.key
const DASHSCOPE_BASE = QWEN.url.replace(/\/chat\/completions$/, '')
const QWEN_SEARCH_MODEL = QWEN.searchModel
const QWEN_PLACE_MODEL = process.env.QWEN_PLACE_MODEL || QWEN.model
const QWEN_EXHIBITION_MODEL = process.env.QWEN_EXHIBITION_MODEL || QWEN.model
const QWEN_VISION_MODEL = QWEN.visionModel
// KIRI Engine 3DGS 云重建（绕拍视频/多图 → 高斯泼溅 .ply）。SSRF：base 硬编码，只放行 api.kiriengine.app。
// BYOK：key 不再从服务端 env 读，改由每个请求的 x-kiri-key 头带用户自带 key（公开部署不共享额度，见 handleKiri）。
const KIRI_BASE = 'https://api.kiriengine.app/api/v1/open'
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || ''
const TRUST_PROXY = /^(1|true|yes)$/i.test(String(process.env.TRUST_PROXY || ''))
const CLOUD_RATE_LIMIT = Math.max(1, Number(process.env.CLOUD_RATE_LIMIT_PER_MINUTE || 24))
const cloudLimiter = createSlidingWindowLimiter({ limit: CLOUD_RATE_LIMIT, windowMs: 60_000 })
const COSTLY_PATHS = new Set(['/api/frost-llm', '/api/frost-llm-stream', '/api/qwen-image', '/api/qwen-vision', '/api/travel-place-brief', '/api/travel-place-sources'])

// ——————————————————— 工具 ———————————————————
function sendJSON(res, obj, code = 200) {
  if (res.headersSent) return   // 流式响应已提交后别再写 header（防 ERR_HTTP_HEADERS_SENT 二次抛出致进程崩溃）
  applySecurityHeaders(res)
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(body)
}
function readBody(req, maxBytes = 26 * 1024 * 1024) {   // 26MB 上限（略高于 nginx client_max_body_size 25m）：代码层兜底，防大 base64 图撑爆内存
  return new Promise((resolve, reject) => {
    const chunks = []; let total = 0
    req.on('data', (c) => {
      const b = Buffer.isBuffer(c) ? c : Buffer.from(c)
      total += b.length
      if (total > maxBytes) { req.destroy(); reject(new Error('body_too_large')); return }
      chunks.push(b)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))   // 整体解码，防多字节 UTF-8 在 chunk 边界被切碎（中文损坏）
    req.on('error', reject)   // socket 出错别让 Promise 永挂
  })
}

// 飞书比赛版的新增服务边界。原 Pocket Earth 的 Qwen/MNN/Android 链路保持不变；
// 飞书免登、任务状态机、OCR→Qwen→人工确认→飞书写回均封装在独立模块中。
const FEISHU = await createFeishuRouter({
  env: process.env,
  rootDir: __dirname,
  qwenProvider: QWEN,
  readBody,
  sendJSON,
})

// ——————————————————— /api/edge（Qwen3/Qwen3-VL + 可插拔 MNN Skills） ———————————————————
// 与“上街去”的开发中间件保持同一契约：文字、视觉、Travel LoRA、铭文 LoRA 与展品抠图
// 都只经过本机 MNN sidecar；sidecar 未连接时如实返回 stub，不拿云模型冒充端侧 Skill。
async function readMnnHealth() {
  if (!MNN_EDGE_ENABLED || !MNN_URL) return null
  try {
    const response = await fetch(`${MNN_URL}/health`, { signal: AbortSignal.timeout(5000) })
    return response.ok ? await response.json() : null
  } catch { return null }
}

const TRAVEL_SOURCE_CACHE = new Map()
async function handleTravelPlaceSources(req, res, url) {
  if (req.method !== 'GET') { res.statusCode = 405; res.end(); return }
  const place = String(url.searchParams.get('place') || '').trim()
  const city = String(url.searchParams.get('city') || '').trim()
  const key = `v6\u0000${city}\u0000${place}`
  const hit = TRAVEL_SOURCE_CACHE.get(key)
  if (hit && hit.expires > Date.now()) return sendJSON(res, hit.value)
  const sources = await getTravelPlaceSources(place, city, {
    qwenKey: DASHSCOPE_KEY, qwenBase: DASHSCOPE_BASE, qwenSearchModel: QWEN_SEARCH_MODEL,
  })
  const value = { sources, retrievedAt: new Date().toISOString() }
  if (sources.length) TRAVEL_SOURCE_CACHE.set(key, { expires: Date.now() + 6 * 60 * 60 * 1000, value })
  return sendJSON(res, value, sources.length ? 200 : 404)
}

async function handleTravelPlaceBrief(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
  try {
    if (!DASHSCOPE_KEY) return sendJSON(res, { backend: 'stub', text: '', error: 'no_dashscope_key' })
    const body = JSON.parse(await readBody(req, 64 * 1024) || '{}')
    const prompt = boundedText(body.prompt, 24000)
    const system = boundedText(body.system, 5000)
    if (!prompt) return sendJSON(res, { backend: 'stub', text: '', error: 'invalid_prompt' }, 400)
    const upstream = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${DASHSCOPE_KEY}` },
      body: JSON.stringify({
        model: QWEN_PLACE_MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        temperature: 0.15,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(45000),
    })
    const data = await upstream.json()
    return upstream.ok
      ? sendJSON(res, { backend: 'qwen-cloud', text: data?.choices?.[0]?.message?.content || '', model: QWEN_PLACE_MODEL })
      : sendJSON(res, { backend: 'stub', text: '', error: data?.error || `qwen_${upstream.status}` })
  } catch (error) {
    return sendJSON(res, { backend: 'stub', text: '', error: String(error) })
  }
}

async function handleEdge(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
  try {
    const body = JSON.parse(await readBody(req) || '{}')
    const health = await readMnnHealth()
    if (!health) return sendJSON(res, { backend: 'stub', text: '', assets: [], error: 'mnn_runtime_unavailable' })

    if (body.task === 'asset_status' || body.task === 'asset_install' || body.task === 'asset_cancel' || body.task === 'asset_uninstall') {
      const endpoint = body.task === 'asset_status' ? '/v1/assets'
        : body.task === 'asset_install' ? '/v1/assets/install'
          : body.task === 'asset_uninstall' ? '/v1/assets/uninstall' : '/v1/assets/cancel'
      const upstream = await fetch(`${MNN_URL}${endpoint}`, body.task === 'asset_status' ? {
        signal: AbortSignal.timeout(2500),
      } : {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ asset: body.asset, url: body.url, sha256: body.sha256, bytes: body.bytes }), signal: AbortSignal.timeout(body.task === 'asset_install' || body.task === 'asset_uninstall' ? 180000 : 5000),
      })
      const data = await upstream.json()
      return sendJSON(res, { backend: upstream.ok ? 'mnn' : 'stub', assets: data?.assets || [], error: data?.error })
    }
    if (body.task === 'runtime_status') {
      return sendJSON(res, {
        backend: 'mnn',
        runtime: {
          engine: 'mnn', textReady: !!health?.models?.text, visionReady: !!health?.models?.vision,
          adapters: health?.adapters || {}, restorer: health?.restorer || { installed: false },
          exhibitMatting: health?.exhibitMatting || { installed: false },
          acceleration: health?.acceleration || [],
          visualLoraRuntime: health?.visualLoraRuntime || { ready: false },
        },
      })
    }
    if (body.task === 'ping') return sendJSON(res, { backend: 'mnn' })
    if (body.task === 'runtime_probe') {
      const startedAt = Date.now()
      const upstream = await fetch(`${MNN_URL}/v1/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ system: '只回答 POCKET_OK', prompt: 'runtime probe', model: 'text', max_new_tokens: 8 }),
        signal: AbortSignal.timeout(45000),
      })
      const data = await upstream.json()
      const output = typeof data?.text === 'string' ? data.text.trim().slice(0, 80) : ''
      return sendJSON(res, {
        backend: upstream.ok && output ? 'mnn' : 'stub',
        runtime: { engine: upstream.ok && output ? 'mnn' : 'stub', probe: { ok: upstream.ok && !!output, elapsedMs: Date.now() - startedAt, output } },
        error: upstream.ok && output ? undefined : data?.error || `mnn_${upstream.status}`,
      })
    }

    if (body.task === 'exhibit_matting' || body.task === 'heritage_restore') {
      const endpoint = body.task === 'exhibit_matting' ? '/v1/exhibit-matting' : '/v1/restoration'
      const payload = body.task === 'exhibit_matting'
        ? { image: body.image }
        : { image: body.image, mask: body.mask }
      const upstream = await fetch(`${MNN_URL}${endpoint}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(120000),
      })
      const data = await upstream.json()
      return sendJSON(res, {
        backend: upstream.ok ? 'mnn' : 'stub', image: data?.image, alpha: data?.alpha,
        stats: data?.stats, error: data?.error,
      })
    }

    if (body.task === 'embed') {
      return sendJSON(res, { backend: 'mnn', vectors: (body.texts || []).map(() => []) })
    }

    let prompt = boundedText(body.prompt, 24000)
    let system = boundedText(body.system, 5000).trim()
    let json = !!body.json
    if (body.task === 'classify') {
      system = '你是分类器。只输出给定选项中的一个，不要任何多余文字。'
      prompt = `文本：${boundedText(body.text, 12000)}\n选项：${(Array.isArray(body.labels) ? body.labels : []).slice(0, 100).map((item) => boundedText(item, 200)).join(' / ')}\n答：`
    } else if (body.task === 'rank') {
      system = '给每个候选打 0-100 的相关度分。只返回一个 JSON 数组（仅数字，长度与候选一致）。'
      prompt = `查询：${boundedText(body.query, 4000)}\n候选：\n${(Array.isArray(body.candidates) ? body.candidates : []).slice(0, 200).map((item, index) => `${index}. ${boundedText(item, 500)}`).join('\n')}\nJSON：`
      json = true
    }
    if (json) system = `${system}\n只输出纯 JSON，不要 Markdown 代码块、不要 \`\`\` 包裹。`.trim()

    const images = []
    if (body.task === 'vision' && typeof body.image === 'string') {
      if (!isSafeInlineImage(body.image)) return sendJSON(res, { backend: 'stub', text: '', error: 'vision_requires_bounded_inline_image' }, 400)
      images.push(body.image.startsWith('data:') ? body.image.split(',')[1] || '' : body.image)
    }
    if (!['chat', 'classify', 'rank', 'vision'].includes(body.task)) {
      return sendJSON(res, { backend: 'stub', text: '', error: 'unsupported_edge_task' })
    }
    const upstream = await fetch(`${MNN_URL}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system, prompt, images: images.length ? images : undefined, json,
        model: images.length ? 'vision' : 'text',
        adapter: body.adapter || undefined, detail: body.detail || undefined,
        max_new_tokens: Math.min(1024, Number(body.maxTokens) || (images.length ? 512 : 384)),
      }),
      signal: AbortSignal.timeout(images.length ? 125000 : 70000),
    })
    const data = await upstream.json()
    if (!upstream.ok) return sendJSON(res, { backend: 'stub', text: '', error: data?.error || `mnn_${upstream.status}` })
    const text = typeof data?.text === 'string' ? data.text : ''
    if (body.task === 'classify') {
      const label = (body.labels || []).find((item) => text.includes(item)) || (body.labels || [])[0] || ''
      return sendJSON(res, { backend: 'mnn', text: label })
    }
    if (body.task === 'rank') {
      let scores
      try {
        const parsed = JSON.parse(text); const list = Array.isArray(parsed) ? parsed : parsed?.scores || []
        scores = (body.candidates || []).map((_, index) => (Number(list[index]) || 0) / 100)
      } catch { scores = (body.candidates || []).map(() => 0.5) }
      return sendJSON(res, { backend: 'mnn', scores })
    }
    return sendJSON(res, { backend: 'mnn', text })
  } catch (error) {
    return sendJSON(res, { backend: 'stub', text: '', error: String(error) })
  }
}

async function handleEdgeAssetImport(req, res) {
  if (req.method !== 'POST' || !MNN_EDGE_ENABLED || !MNN_URL) {
    return sendJSON(res, { error: !MNN_URL ? 'mnn_runtime_not_configured' : 'method_not_allowed' }, !MNN_URL ? 503 : 405)
  }
  const asset = String(req.headers['x-pocket-asset'] || '')
  const allowlist = ['guji-vision-lora', 'rubbing-vision-lora', 'general-ocr-vision-lora', 'travel-planner-lora', 'heritage-restorer', 'exhibit-matting']
  if (!allowlist.includes(asset)) return sendJSON(res, { error: 'asset_not_allowlisted' }, 400)
  try {
    const headers = { 'content-type': 'application/octet-stream' }
    if (req.headers['content-length']) headers['content-length'] = String(req.headers['content-length'])
    const upstream = await fetch(`${MNN_URL}/v1/assets/import/${asset}`, { method: 'POST', headers, body: req, duplex: 'half' })
    return sendJSON(res, await upstream.json(), upstream.status)
  } catch (error) {
    return sendJSON(res, { error: String(error) }, 502)
  }
}

// 看展搭子云视觉兜底：公开展签且用户明确点云按钮时，才送百炼 Qwen3-VL。
async function handleQwenVision(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
  try {
    if (!DASHSCOPE_KEY) return sendJSON(res, { text: '', error: 'no_qwen_key' })
    const body = JSON.parse(await readBody(req) || '{}')
    if (!isSafeDataImage(body.image)) return sendJSON(res, { text: '', error: 'vision_requires_bounded_data_image' }, 400)
    const upstream = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${DASHSCOPE_KEY}` },
      body: JSON.stringify({
        model: QWEN_VISION_MODEL, temperature: 0, max_tokens: 900,
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: body.image } },
          { type: 'text', text: boundedText(body.prompt, 8000) || '提取图中所有文字，含中英文，原样输出，不要总结。' },
        ] }],
      }),
      signal: AbortSignal.timeout(45000),
    })
    const data = await upstream.json()
    return upstream.ok
      ? sendJSON(res, { text: data?.choices?.[0]?.message?.content || '', model: QWEN_VISION_MODEL, provider: 'Alibaba Cloud Model Studio', modelOwner: 'Qwen' })
      : sendJSON(res, { text: '', error: data?.error || `qwen_${upstream.status}` }, upstream.status)
  } catch (error) {
    return sendJSON(res, { text: '', error: String(error) })
  }
}

// ——————————————————— /api/frost-llm（统一 Qwen 云脑） ———————————————————
async function handleFrostLlm(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
  const raw = await readBody(req)
  try {
    const { prompt, system, json, task } = JSON.parse(raw || '{}')
    const safePrompt = boundedText(prompt, 24000)
    const safeSystem = boundedText(system, 5000)
    if (!safePrompt) return sendJSON(res, { text: '', error: 'invalid_prompt' }, 400)
    if (!QWEN.key) return sendJSON(res, { text: '', error: 'no_qwen_key' })
    const taskName = String(task || 'default')
    const model = qwenModelForTask(QWEN, taskName)
    const r = await fetch(QWEN.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${QWEN.key}` },
      body: JSON.stringify(buildQwenChatBody(QWEN, {
        prompt: safePrompt, system: safeSystem, task: taskName, json: !!json,
        search: taskName.startsWith('research-'),
        temperature: json ? 0 : (taskName.startsWith('exhibition-') || taskName.startsWith('mapping-') ? 0.35 : 0.65),
      })),
      signal: AbortSignal.timeout(taskName.startsWith('research-') ? 60000 : 30000),
    })
    if (!r.ok) return sendJSON(res, { text: '', error: 'upstream_' + r.status }, r.status)   // 透传上游 429/5xx：客户端 enrichJSON 的 withRetry 才能据 r.ok 重试瞬时故障（否则恒 200+空串、重试形同虚设）
    const data = await r.json()
    sendJSON(res, {
      text: data?.choices?.[0]?.message?.content || '',
      model,
      provider: QWEN.provider,
      modelOwner: QWEN.owner,
      transport: QWEN.transport,
    })
  } catch (e) {
    sendJSON(res, { text: '', error: String(e) })
  }
}

// ——————————————————— /api/frost-llm-stream（云脑 · 真 SSE token 流，additive 不改上面的非流式路由）———————————————————
// DashScope OpenAI-compatible SSE；逐 token 透传给前端，收尾 data:{done:true}。
async function handleFrostLlmStream(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
  const raw = await readBody(req)
  applySecurityHeaders(res)
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' })
  const sse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
  try {
    if (!QWEN.key) { sse({ done: true, error: 'no_qwen_key' }); res.end(); return }
    const { prompt, system, task } = JSON.parse(raw || '{}')
    const safePrompt = boundedText(prompt, 24000)
    const safeSystem = boundedText(system, 5000)
    if (!safePrompt) { sse({ done: true, error: 'invalid_prompt' }); res.end(); return }
    const taskName = String(task || 'default')
    const r = await fetch(QWEN.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${QWEN.key}` },
      body: JSON.stringify(buildQwenChatBody(QWEN, { prompt: safePrompt, system: safeSystem, task: taskName, stream: true, temperature: 0.65 })),
      signal: AbortSignal.timeout(120000),   // 逐 token 流：只兜「上游挂死永不吐」，给足最长叙事时间；30s 会从中间砍断正常长回答
    })
    if (!r.ok || !r.body) { sse({ done: true, error: 'http_' + r.status }); res.end(); return }
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''   // 末行可能不完整，留到下一块
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const payload = t.slice(5).trim()
        if (payload === '[DONE]') { sse({ done: true }); res.end(); return }
        try { const tok = JSON.parse(payload)?.choices?.[0]?.delta?.content; if (tok) sse({ token: tok }) } catch { /* 跳过非 JSON 行 */ }
      }
    }
    sse({ done: true }); res.end()
  } catch (e) {
    try { sse({ done: true, error: String(e) }); res.end() } catch { /* 连接已断 */ }
  }
}

// ——————————————————— /api/qwen-image（Qwen Image 原生同步接口）———————————————————
async function handleQwenImage(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
  const raw = await readBody(req)
  try {
    if (!QWEN.key) return sendJSON(res, { url: '', error: 'no_qwen_key' })
    const { prompt } = JSON.parse(raw || '{}')
    const safePrompt = boundedText(prompt, 4000)
    if (!safePrompt) return sendJSON(res, { url: '', error: 'no_prompt' }, 400)
    const r = await fetch(QWEN.nativeImageUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${QWEN.key}` },
      body: JSON.stringify(buildQwenImageBody(QWEN, safePrompt)),
      signal: AbortSignal.timeout(120000),
    })
    if (!r.ok) return sendJSON(res, { url: '', error: 'upstream_' + r.status }, r.status)
    const data = await r.json()
    const url = readQwenImageUrl(data)
    sendJSON(res, {
      url,
      model: QWEN.imageModel,
      status: url ? 'completed' : 'empty',
      provider: QWEN.provider,
      modelOwner: QWEN.owner,
      transport: 'dashscope-native',
    })
  } catch (e) {
    sendJSON(res, { url: '', error: String(e) })
  }
}

// ——————————————————— /api/kiri（KIRI Engine 3DGS 云重建代理 · 绕拍视频/多图 → splat）———————————————————
// SSRF：KIRI_BASE 硬编码只放行 api.kiriengine.app；op=upload 流式透传前端 multipart(不缓冲整个视频进内存，防 OOM)；
// getStatus 状态反直觉(1=失败/2=成功/3=排队/-1上传中/0处理中)；op=zip 只回 60 分钟有效直链，让前端自取省带宽。
async function handleKiri(req, res, url) {
  const op = url.searchParams.get('op') || ''
  // BYOK：只用用户本机自带的 KIRI key（x-kiri-key 头）；不读服务端 env、不共享额度，杜绝陌生人消耗他人 KIRI credit。
  const KIRI_KEY = String(req.headers['x-kiri-key'] || '').trim()
  if (!KIRI_KEY) return sendJSON(res, { error: 'need_kiri_key' }, 400)
  const H = { authorization: `Bearer ${KIRI_KEY}` }
  try {
    if (op === 'status') {
      const s = url.searchParams.get('serialize') || ''
      const r = await fetch(`${KIRI_BASE}/model/getStatus?serialize=${encodeURIComponent(s)}`, { headers: H })
      return sendJSON(res, await r.json(), r.ok ? 200 : r.status)
    }
    if (op === 'zip') {
      const s = url.searchParams.get('serialize') || ''
      const r = await fetch(`${KIRI_BASE}/model/getModelZip?serialize=${encodeURIComponent(s)}`, { headers: H })
      const d = await r.json()
      return sendJSON(res, { modelUrl: d?.data?.modelUrl || '', raw: d }, r.ok ? 200 : r.status)   // zip 直链仅 60 分钟有效，前端拿到即取
    }
    if (op === 'fetchzip') {
      // 服务端代拉 zip(绕过 zip 直链的跨域 CORS)：先 getModelZip 拿 60 分钟直链，再流式透传 bytes 给前端解 .ply。
      // SSRF：modelUrl 源自 KIRI 自家响应(非用户可控)，KIRI_BASE 已硬编码，链路可信。
      const s = url.searchParams.get('serialize') || ''
      const zr = await fetch(`${KIRI_BASE}/model/getModelZip?serialize=${encodeURIComponent(s)}`, { headers: H })
      const zd = await zr.json()
      const modelUrl = zd?.data?.modelUrl || ''
      if (!modelUrl) return sendJSON(res, { error: 'no_model_url', raw: zd }, zr.ok ? 502 : zr.status)
      const fr = await fetch(modelUrl)
      if (!fr.ok || !fr.body) return sendJSON(res, { error: 'zip_fetch_' + fr.status }, 502)
      res.statusCode = 200
      res.setHeader('content-type', 'application/zip')
      const cl = fr.headers.get('content-length'); if (cl) res.setHeader('content-length', cl)
      // pipeline 处理背压 + 错误传播 + 自动 end；上游断流/客户端中断时销毁 socket（不再落到外层 catch 的 sendJSON 二次写 header）
      try { await pipeline(Readable.fromWeb(fr.body), res) } catch { if (!res.writableEnded) res.destroy() }
      return
    }
    if (op === 'balance') {
      const r = await fetch(`${KIRI_BASE}/balance`, { headers: H })
      return sendJSON(res, await r.json(), r.ok ? 200 : r.status)
    }
    if (op === 'upload') {
      // 流式透传前端 multipart(videoFile / imagesFiles[])到 KIRI，req 直接作 fetch body，不 Buffer.concat(防大视频 OOM)
      const kind = url.searchParams.get('kind') === 'image' ? '3dgs/image' : '3dgs/video'
      const r = await fetch(`${KIRI_BASE}/${kind}`, {
        method: 'POST',
        headers: { ...H, 'content-type': req.headers['content-type'] || 'application/octet-stream' },
        body: req,
        duplex: 'half',
      })
      const d = await r.json()
      return sendJSON(res, { serialize: d?.data?.serialize || '', raw: d }, r.ok ? 200 : r.status)
    }
    return sendJSON(res, { error: 'bad_op' }, 400)
  } catch (e) {
    sendJSON(res, { error: String(e) })
  }
}

// ——————————————————— /api/unsplash（星球 agent 抓图） ———————————————————
async function handleUnsplash(req, res, url) {
  try {
    if (!UNSPLASH_KEY) return sendJSON(res, { photos: [], error: 'no_key' })
    const track = url.searchParams.get('track')
    if (track) {
      try { const t = new URL(track); if (t.protocol === 'https:' && t.hostname === 'api.unsplash.com') { t.searchParams.set('client_id', UNSPLASH_KEY); await fetch(t.toString()) } } catch { /* 合规埋点静默 */ }   // 安全：只允许向 api.unsplash.com(https) 回执下载——否则任意 track URL 会被 SSRF + 把 UNSPLASH_KEY 拼进出站请求泄漏给攻击者站点
      return sendJSON(res, { ok: true })
    }
    const query = (url.searchParams.get('query') || '').trim()
    const count = Math.min(30, Math.max(1, Number(url.searchParams.get('count') || 24)))
    if (!query) return sendJSON(res, { photos: [], error: 'no_query' })
    const api = new URL('https://api.unsplash.com/search/photos')
    api.searchParams.set('query', query)
    api.searchParams.set('per_page', String(count))
    api.searchParams.set('orientation', 'landscape')
    api.searchParams.set('content_filter', 'high')
    const r = await fetch(api.toString(), { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}`, 'Accept-Version': 'v1' } })
    if (!r.ok) return sendJSON(res, { photos: [], error: `unsplash_${r.status}` })
    const data = await r.json()
    const photos = (data?.results || []).map((p) => {
      const urls = p.urls || {}, user = p.user || {}, links = p.links || {}, userLinks = user.links || {}
      return {
        id: String(p.id || ''), thumb: urls.small || urls.thumb || '', full: urls.regular || urls.full || urls.small || '',
        alt: String(p.alt_description || p.description || ''), author: String(user.name || ''), authorUrl: userLinks.html || '',
        link: links.html || '', color: String(p.color || '#888'), downloadLocation: links.download_location || '',
      }
    }).filter((p) => p.thumb)
    sendJSON(res, { photos, total: data?.total || photos.length })
  } catch (e) {
    sendJSON(res, { photos: [], error: String(e) })
  }
}

// ——————————————————— /api/travel-mcp（只读旅行数据：OSM 地理编码/POI + Open-Meteo 天气） ———————————————————
// 红线：只挂【只读查询】工具（geocode / poi / weather），无 book/pay/任何下单端点。
// 经本服务代理（守 OSM/Open-Meteo 使用政策的 User-Agent + 超时），前端绝不直连。任何失败让前端走本地兜底。
const UA_TRAVEL = { 'User-Agent': 'PocketEarth/1.0 (personal travel agent)' }
// TTL 缓存：Nominatim 使用政策【要求】结果必须缓存；顺带把 Overpass/Open-Meteo/12306/Amadeus/OSRM 压到限额零头。
const travelCache = new Map()
const TRAVEL_TTL = { geocode: 24 * 3600e3, poi: 6 * 3600e3, weather: 30 * 60e3, trains: 3 * 60e3, flights: 30 * 60e3, route: 6 * 3600e3 }

// ── 12306 余票（只读查询，尽力而为层：借鉴 12306-mcp 系开源实现；境外 IP 可能被限 → 失败即降级深链） ──
const RAIL_UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' }
let railStations = null      // Map<中文站名, 电报码>，进程内缓存（表几乎不变）
let railCookie = ''          // 会话 Cookie（init 页种的）
let railQueryPath = 'leftTicket/query'   // 12306 会换查询后缀（c_url 提示新地址）
async function railStationCode(name) {
  if (!railStations) {
    const r = await fetch('https://kyfw.12306.cn/otn/resources/js/framework/station_name.js', { headers: RAIL_UA, signal: AbortSignal.timeout(8000) })
    const txt = await r.text()
    railStations = new Map()
    for (const seg of txt.split('@')) {
      const f = seg.split('|')
      if (f[1] && f[2]) railStations.set(f[1], f[2])
    }
  }
  return railStations.get(String(name || '').trim()) || null
}
async function railEnsureSession() {
  if (railCookie) return
  const r = await fetch('https://kyfw.12306.cn/otn/leftTicket/init', { headers: RAIL_UA, signal: AbortSignal.timeout(8000) })
  const set = r.headers.getSetCookie ? r.headers.getSetCookie() : []
  railCookie = set.map((c) => c.split(';')[0]).join('; ')
}
// 余票行解析（leftTicket 固定管道位序，业内通用索引）：只取展示要用的字段
function railParseRow(row, nameByCode) {
  const f = String(row).split('|')
  const seat = (v) => (v && v !== '--' ? v : '')
  return {
    code: f[3] || '',
    from: nameByCode[f[6]] || f[6] || '',
    to: nameByCode[f[7]] || f[7] || '',
    dep: f[8] || '', arr: f[9] || '', dur: f[10] || '',
    canBuy: f[11] === 'Y',
    seats: {
      商务: seat(f[32]), 一等: seat(f[31]), 二等: seat(f[30]),
      软卧: seat(f[23]), 硬卧: seat(f[28]), 硬座: seat(f[29]), 无座: seat(f[26]),
    },
  }
}
async function railQuery(from, to, date) {
  const [fc, tc] = await Promise.all([railStationCode(from), railStationCode(to)])
  if (!fc || !tc) return { error: 'unknown_station' }
  await railEnsureSession()
  const q = `leftTicketDTO.train_date=${date}&leftTicketDTO.from_station=${fc}&leftTicketDTO.to_station=${tc}&purpose_codes=ADULT`
  const call = async (path) => {
    const r = await fetch(`https://kyfw.12306.cn/otn/${path}?${q}`, {
      headers: { ...RAIL_UA, Cookie: railCookie, Referer: 'https://kyfw.12306.cn/otn/leftTicket/init' },
      signal: AbortSignal.timeout(8000),
    })
    return r.json()
  }
  let d = await call(railQueryPath).catch(() => null)
  if (d && typeof d.c_url === 'string' && d.c_url && !d?.data?.result) {   // 12306 换了查询地址 → 按提示重试一次
    railQueryPath = d.c_url
    d = await call(railQueryPath).catch(() => null)
  }
  const result = d?.data?.result
  if (!Array.isArray(result)) return { error: 'rail_unavailable' }
  const nameByCode = d?.data?.map || {}
  const rows = result.map((r) => railParseRow(r, nameByCode)).filter((r) => r.code && r.dep).slice(0, 15)
  return { rows }
}

// ── Amadeus 机票参考价（免费 Self-Service test 环境；未配 key → no_key，前端不显示参考价，深链照常） ──
const AMADEUS_KEY = process.env.AMADEUS_KEY || ''
const AMADEUS_SECRET = process.env.AMADEUS_SECRET || ''
let amadeusToken = { v: '', exp: 0 }
async function amadeusAuth() {
  if (amadeusToken.v && Date.now() < amadeusToken.exp) return amadeusToken.v
  const r = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${AMADEUS_KEY}&client_secret=${AMADEUS_SECRET}`,
    signal: AbortSignal.timeout(8000),
  })
  const d = await r.json()
  if (!d?.access_token) throw new Error('amadeus_auth_failed')
  amadeusToken = { v: d.access_token, exp: Date.now() + (Number(d.expires_in || 1799) - 60) * 1000 }
  return amadeusToken.v
}
async function amadeusFlights(from, to, date) {
  if (!AMADEUS_KEY || !AMADEUS_SECRET) return { error: 'no_key' }
  const token = await amadeusAuth()
  const api = new URL('https://test.api.amadeus.com/v2/shopping/flight-offers')
  api.searchParams.set('originLocationCode', from.toUpperCase()); api.searchParams.set('destinationLocationCode', to.toUpperCase())
  api.searchParams.set('departureDate', date); api.searchParams.set('adults', '1')
  api.searchParams.set('currencyCode', 'CNY'); api.searchParams.set('max', '5')
  const r = await fetch(api.toString(), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(9000) })
  const d = await r.json()
  const offers = Array.isArray(d?.data) ? d.data : []
  if (!offers.length) return { error: 'no_offers' }
  const prices = offers.map((o) => Number(o?.price?.grandTotal)).filter((n) => isFinite(n) && n > 0)
  if (!prices.length) return { error: 'no_offers' }
  return { min: Math.min(...prices), currency: offers[0]?.price?.currency || 'CNY', count: offers.length, carrier: offers[0]?.validatingAirlineCodes?.[0] || '' }
}
async function handleTravelMcp(req, res, url) {
  const tool = url.searchParams.get('tool') || ''
  const cacheKey = url.search
  const hit0 = travelCache.get(cacheKey)
  if (hit0 && Date.now() - hit0.t < hit0.ttl) return sendJSON(res, hit0.v)
  if (hit0) travelCache.delete(cacheKey)
  const ok = (obj) => {   // 只缓存成功结果
    if (obj && !obj.error && TRAVEL_TTL[tool]) {
      if (travelCache.size >= 500) travelCache.delete(travelCache.keys().next().value)
      travelCache.set(cacheKey, { t: Date.now(), ttl: TRAVEL_TTL[tool], v: obj })
    }
    return sendJSON(res, obj)
  }
  try {
    if (tool === 'geocode') {
      const q = (url.searchParams.get('q') || '').trim()
      if (!q) return sendJSON(res, { error: 'no_query' })
      const api = new URL('https://nominatim.openstreetmap.org/search')
      api.searchParams.set('q', q); api.searchParams.set('format', 'json'); api.searchParams.set('limit', '1'); api.searchParams.set('accept-language', 'zh')
      const r = await fetch(api.toString(), { headers: UA_TRAVEL, signal: AbortSignal.timeout(6000) })
      const d = await r.json()
      const hit = Array.isArray(d) && d[0]
      return ok(hit ? { lng: Number(hit.lon), lat: Number(hit.lat), name: String(hit.display_name || q).split(',')[0] } : { error: 'not_found' })
    }
    if (tool === 'poi') {
      const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'))
      const radius = Math.min(5000, Math.max(200, Number(url.searchParams.get('radius') || 1500)))
      const kind = url.searchParams.get('kind') || 'tourism'
      if (!isFinite(lat) || !isFinite(lng)) return sendJSON(res, { error: 'no_coord' })
      const filter = kind === 'restaurant' ? 'node["amenity"="restaurant"]'
        : kind === 'cafe' ? 'node["amenity"="cafe"]'
        : 'node["tourism"~"attraction|museum|viewpoint|artwork|gallery"]'
      const ql = `[out:json][timeout:8];(${filter}(around:${radius},${lat},${lng}););out body 20;`
      const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { ...UA_TRAVEL, 'content-type': 'text/plain' }, body: ql, signal: AbortSignal.timeout(9000) })
      const d = await r.json()
      const pois = (d?.elements || []).filter((e) => e.tags && e.tags.name).slice(0, 12).map((e) => ({ name: e.tags.name, lat: e.lat, lng: e.lon, kind: e.tags.tourism || e.tags.amenity || '' }))
      return ok({ pois })
    }
    if (tool === 'weather') {
      const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'))
      if (!isFinite(lat) || !isFinite(lng)) return sendJSON(res, { error: 'no_coord' })
      const api = new URL('https://api.open-meteo.com/v1/forecast')
      api.searchParams.set('latitude', String(lat)); api.searchParams.set('longitude', String(lng))
      api.searchParams.set('timezone', 'auto')
      // 带 date 参数 → 出行日期起的逐日预报（Open-Meteo 最多 16 天）；不带 → 维持原「当前天气」契约
      const date = (url.searchParams.get('date') || '').trim()
      if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJSON(res, { error: 'bad_date' })
        const days = Math.min(7, Math.max(1, Number(url.searchParams.get('days') || 1)))
        const endDate = new Date(+new Date(`${date}T00:00:00Z`) + (days - 1) * 86400e3).toISOString().slice(0, 10)
        api.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max')
        api.searchParams.set('start_date', date); api.searchParams.set('end_date', endDate)
        const r = await fetch(api.toString(), { signal: AbortSignal.timeout(6000) })
        const d = await r.json()
        const t = d?.daily?.time
        if (!Array.isArray(t) || !t.length) return sendJSON(res, { error: 'out_of_range' })   // 超出 16 天预报窗
        const daily = t.map((dt, i) => ({
          date: dt,
          code: d.daily.weather_code?.[i],
          tmax: d.daily.temperature_2m_max?.[i],
          tmin: d.daily.temperature_2m_min?.[i],
          rain: d.daily.precipitation_probability_max?.[i],
        }))
        return ok({ daily })
      }
      api.searchParams.set('current', 'temperature_2m,weather_code')
      const r = await fetch(api.toString(), { signal: AbortSignal.timeout(6000) })
      const d = await r.json()
      const c = d?.current || {}
      return ok({ temp: c.temperature_2m, code: c.weather_code })
    }
    if (tool === 'trains') {   // 12306 余票（尽力而为：境外 IP 可能被限 → 前端拿 error 就只留深链）
      const from = (url.searchParams.get('from') || '').trim(), to = (url.searchParams.get('to') || '').trim()
      const date = (url.searchParams.get('date') || '').trim()
      if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJSON(res, { error: 'bad_params' })
      return ok(await railQuery(from, to, date))
    }
    if (tool === 'flights') {   // Amadeus 参考价（test 环境缓存数据，明示「参考」；无 key → no_key）
      const from = (url.searchParams.get('from') || '').trim(), to = (url.searchParams.get('to') || '').trim()
      const date = (url.searchParams.get('date') || '').trim()
      if (!/^[a-zA-Z]{3}$/.test(from) || !/^[a-zA-Z]{3}$/.test(to) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJSON(res, { error: 'bad_params' })
      return ok(await amadeusFlights(from, to, date))
    }
    if (tool === 'route') {   // OSRM demo 驾车路线（≤1rps 非商用；2~5 个途经点一次算完各段）
      const pts = (url.searchParams.get('coords') || '').split(';').map((p) => p.split(',').map(Number))
      if (pts.length < 2 || pts.length > 5 || pts.some((p) => p.length !== 2 || p.some((n) => !isFinite(n)))) return sendJSON(res, { error: 'bad_coords' })
      const path = pts.map((p) => `${p[0]},${p[1]}`).join(';')
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${path}?overview=false&steps=false`, { headers: UA_TRAVEL, signal: AbortSignal.timeout(8000) })
      const d = await r.json()
      const legs = d?.routes?.[0]?.legs
      if (!Array.isArray(legs)) return sendJSON(res, { error: 'no_route' })
      return ok({ legs: legs.map((l) => ({ km: Math.round((l.distance / 1000) * 10) / 10, min: Math.max(1, Math.round(l.duration / 60)) })) })
    }
    return sendJSON(res, { error: 'unknown_tool' })
  } catch (e) {
    return sendJSON(res, { error: String(e) })
  }
}

// ——————————————————— 静态托管（dist/ + SPA 回退） ———————————————————
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.splat': 'application/octet-stream', '.ply': 'application/octet-stream', '.ksplat': 'application/octet-stream', '.spz': 'application/octet-stream',  // 3D 高斯泼溅产物
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
}
// —— 文本类资源按需压缩（br 优先，否则 gzip）；压缩结果按 路径+编码+mtime 缓存，避免每次重压 ——
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.map', '.txt'])
const compCache = new Map()
function compressFor(accept, buf, abs, mtimeMs) {
  let enc = ''
  if (/\bbr\b/.test(accept)) enc = 'br'
  else if (/\bgzip\b/.test(accept)) enc = 'gzip'
  if (!enc || buf.length < 1024) return { enc: '', body: buf } // 小文件不值得压
  const key = `${abs}:${enc}:${mtimeMs}`
  let body = compCache.get(key)
  if (!body) {
    body = enc === 'br'
      ? brotliCompressSync(buf, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } })
      : gzipSync(buf, { level: 6 })
    compCache.set(key, body)
  }
  return { enc, body }
}

async function serveStatic(req, res, pathname) {
  applySecurityHeaders(res, { allowFeishuEmbed: pathname === '/feishu' || pathname.startsWith('/feishu/') })
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '')
  if (rel === '') rel = 'index.html'
  let abs = path.join(DIST, rel)
  if (!abs.startsWith(DIST)) { res.writeHead(403); res.end('forbidden'); return } // 防目录穿越
  let st = null
  try { st = await stat(abs); if (!st.isFile()) st = null } catch { st = null }
  if (!st) {
    // 带后缀的静态资源不能回退到 index.html。否则旧 PWA 壳引用已删除 chunk 时，
    // 浏览器会把 HTML 当 JS/CSS 加载，直接白屏。
    if (rel.startsWith('assets/') || path.extname(rel)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' })
      res.end('not found')
      return
    }
    abs = path.join(DIST, 'index.html'); rel = 'index.html'; try { st = await stat(abs) } catch { /* noop */ } // SPA 回退
  }
  try {
    const buf = await readFile(abs)
    const ext = path.extname(abs).toLowerCase()
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream' }
    // 带哈希的资源长缓存；index.html / sw.js / manifest 不缓存（始终拿最新，PWA 更新即时生效）
    if (rel === 'index.html' || rel === 'sw.js' || rel === 'manifest.webmanifest') headers['cache-control'] = 'no-cache'
    else if (rel.startsWith('assets/')) headers['cache-control'] = 'public, max-age=31536000, immutable'
    else if (rel.startsWith('icons/') || rel.startsWith('splash/') || rel === 'favicon.ico') headers['cache-control'] = 'public, max-age=604800'
    // 文本资源按需压缩（js/css/json/html… 体积大头），图片字体已是压缩格式不重复压
    if (COMPRESSIBLE.has(ext)) {
      headers['vary'] = 'Accept-Encoding'
      const { enc, body } = compressFor(req.headers['accept-encoding'] || '', buf, abs, st ? st.mtimeMs : 0)
      if (enc) { headers['content-encoding'] = enc; res.writeHead(200, headers); res.end(body); return }
    }
    res.writeHead(200, headers)
    res.end(buf)
  } catch {
    res.writeHead(404); res.end('not found')
  }
}

// ——————————————————— 主服务 ———————————————————
const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res)
  const forwardedHttps = TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https'
  if (forwardedHttps || req.socket.encrypted === true) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains')
  const url = new URL(req.url || '/', 'http://localhost')
  const p = url.pathname
  try {
    if (COSTLY_PATHS.has(p)) {
      const result = cloudLimiter.consume(clientAddress(req, TRUST_PROXY))
      res.setHeader('x-ratelimit-limit', String(CLOUD_RATE_LIMIT))
      res.setHeader('x-ratelimit-remaining', String(result.remaining))
      if (!result.allowed) {
        res.setHeader('retry-after', String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))))
        return sendJSON(res, { error: 'rate_limited', retryAfterMs: result.retryAfterMs }, 429)
      }
    }
    if (p === '/api/frost-llm') return await handleFrostLlm(req, res)
    if (p === '/api/qwen-vision') return await handleQwenVision(req, res)
    if (p === '/api/frost-llm-stream') return await handleFrostLlmStream(req, res)
    if (p === '/api/qwen-image') return await handleQwenImage(req, res)
    if (p === '/api/gemini-image' || p === '/api/gmi-image') return sendJSON(res, { url: '', error: 'legacy_provider_removed_use_/api/qwen-image' }, 410)
    if (p === '/api/gemini-vision' || p === '/api/gmi-vision') return sendJSON(res, { text: '', error: 'legacy_provider_removed_use_/api/qwen-vision' }, 410)
    if (p === '/api/kiri') return await handleKiri(req, res, url)
    if (p === '/api/unsplash') return await handleUnsplash(req, res, url)
    if (p === '/api/travel-mcp') return await handleTravelMcp(req, res, url)
    if (p === '/api/travel-place-sources') return await handleTravelPlaceSources(req, res, url)
    if (p === '/api/travel-place-brief') return await handleTravelPlaceBrief(req, res)
    if (p === '/api/edge') return await handleEdge(req, res)
    if (p === '/api/edge-assets') return await handleEdgeAssetImport(req, res)
    if (p.startsWith('/api/feishu/')) return await FEISHU.handle(req, res, url)
    if (p === '/healthz') return sendJSON(res, { ok: true, edge: MNN_EDGE_ENABLED ? 'qwen-mnn' : 'stub', edgeModelInstalled: false, llm: QWEN.key ? QWEN.name : 'off', model: QWEN.key ? QWEN.model : '', memory: 'private-local', travelMcp: 'osm+openmeteo', feishu: FEISHU.health() })
    return await serveStatic(req, res, p)
  } catch (e) {
    if (!res.headersSent) { res.writeHead(500); res.end('server error') } else { try { res.destroy() } catch { /* socket 已断 */ } }
  }
})
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[pocket-earth-feishu] 监听 :${PORT}  llm=${QWEN.key ? QWEN.name + '/' + QWEN.model : 'off'}  edge=${MNN_EDGE_ENABLED ? 'qwen-mnn' : 'stub'}  feishu=${FEISHU.health().configured ? 'on' : 'setup-required'}  unsplash=${UNSPLASH_KEY ? 'on' : 'off'}`)
})
