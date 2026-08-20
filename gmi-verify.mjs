// GMI 备用传输中的 Google Gemini 链路自检工具。
// 用法：把 API Key 填进 .env 的 GMI_API_KEY 后，运行：node gmi-verify.mjs
//   1) GET /v1/models       —— 只列出本账号可调的 Google Gemini model id
//   2) POST /chat/completions —— 用 GMI_MODEL 验证 key、Google 模型与备用传输
// 可选多模态段（与 server.mjs 的 /api/gmi-vision、/api/gmi-image 同款出站调用）：
//   node gmi-verify.mjs --vision <图片路径>   —— 视觉 OCR（image_url 多模态，GMI_VISION_MODEL）
//   node gmi-verify.mjs --image              —— 图像生成（console 队列端点，GMI_IMAGE_MODEL）
// 零依赖，只用 Node 内置。
import { existsSync, readFileSync } from 'node:fs'

// —— 极简 .env 加载（同 server.mjs，不覆盖已有 env）——
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
}

const KEY = process.env.GMI_API_KEY || ''
const BASE = process.env.GMI_BASE_URL || 'https://api.gmi-serving.com/v1'
const MODEL = process.env.GMI_MODEL || 'google/gemini-3.5-flash'

if (!KEY) {
  console.error('✗ 未找到 GMI_API_KEY。请先在 .env 里把 GMI_API_KEY= 后面粘上你的 key。')
  process.exit(1)
}
const H = { 'content-type': 'application/json', authorization: `Bearer ${KEY}` }

// —— 1) 列模型 ——
console.log('→ GET', `${BASE}/models`)
try {
  const r = await fetch(`${BASE}/models`, { headers: H })
  console.log('  HTTP', r.status)
  if (r.ok) {
    const d = await r.json()
    const ids = (d.data || d.models || []).map((m) => m.id || m.name).filter(Boolean)
    const googleModels = ids.filter((id) => /(^|\/)gemini[-/]/i.test(id) || /^gemini[-/]/i.test(id))
    console.log(`  ✓ 目录共 ${ids.length} 个模型；Google Gemini ${googleModels.length} 个：`)
    console.log(`    ${googleModels.slice(0, 24).join(', ')}${googleModels.length > 24 ? ' …(+' + (googleModels.length - 24) + ')' : ''}`)
  } else {
    console.log('  ✗ body:', (await r.text()).slice(0, 400))
  }
} catch (e) {
  console.error('  ✗ 网络错误:', String(e))
}

// —— 2) 发一个 chat ——
console.log('\n→ POST', `${BASE}/chat/completions`, ' model =', MODEL)
try {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: '用一句话介绍口袋地球（Pocket Earth）。' }], temperature: 0.7 }),
  })
  console.log('  HTTP', r.status)
  const d = await r.json().catch(() => null)
  if (r.ok) {
    console.log('  ✓ 回复:', d?.choices?.[0]?.message?.content?.slice(0, 160))
    console.log('  usage:', JSON.stringify(d?.usage || {}))
    console.log('\n✅ 链路通。若上面 chat 成功，说明 key + GMI_MODEL + 计费都 OK。')
  } else {
    console.log('  ✗ body:', JSON.stringify(d).slice(0, 400))
    console.log('  → 多半是 GMI_MODEL 写法不对。用上面 /v1/models 列出的确切 id 改 .env 的 GMI_MODEL 再跑一次。')
  }
} catch (e) {
  console.error('  ✗ 网络错误:', String(e))
}

// —— 3) 可选：视觉 OCR（--vision <图片路径>，同 server.mjs /api/gmi-vision 出站结构）——
const visionIdx = process.argv.indexOf('--vision')
if (visionIdx !== -1) {
  const imgPath = process.argv[visionIdx + 1]
  const VISION_MODEL = process.env.GMI_VISION_MODEL || 'google/gemini-3.5-flash'
  if (!imgPath || !existsSync(imgPath)) {
    console.error('\n✗ --vision 需要一个存在的图片路径')
  } else {
    const ext = imgPath.split('.').pop().toLowerCase()
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
    const dataUrl = `data:${mime};base64,${readFileSync(imgPath).toString('base64')}`
    console.log('\n→ POST', `${BASE}/chat/completions`, ' model =', VISION_MODEL, ' (多模态 image_url)')
    try {
      const r = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({
          model: VISION_MODEL,
          messages: [{ role: 'user', content: [
            { type: 'text', text: '提取图中所有文字，含中英文，原样输出，不要总结。' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ] }],
          temperature: 0, max_tokens: 900,
        }),
      })
      console.log('  HTTP', r.status)
      const d = await r.json().catch(() => null)
      if (r.ok) {
        console.log('  ✓ 识别文字:', (d?.choices?.[0]?.message?.content || '').slice(0, 240).replace(/\n/g, ' ⏎ '))
        console.log('  usage:', JSON.stringify(d?.usage || {}))
      } else {
        console.log('  ✗ body:', JSON.stringify(d).slice(0, 400))
      }
    } catch (e) {
      console.error('  ✗ 网络错误:', String(e))
    }
  }
}

// —— 4) 可选：图像生成（--image，同 server.mjs /api/gmi-image 的 console 队列端点）——
if (process.argv.includes('--image')) {
  const IMAGE_MODEL = process.env.GMI_IMAGE_MODEL || 'gemini-3.1-flash-lite-image'
  const CONSOLE_BASE = process.env.GMI_CONSOLE_BASE || 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey'
  console.log('\n→ POST', `${CONSOLE_BASE}/requests`, ' model =', IMAGE_MODEL)
  try {
    const r = await fetch(`${CONSOLE_BASE}/requests`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ model: IMAGE_MODEL, payload: { prompt: 'A pixel-art style postcard of a small blue planet with glowing memory pins, retro game aesthetic' } }),
    })
    console.log('  HTTP', r.status)
    const d = await r.json().catch(() => null)
    if (r.ok) {
      const url = d?.outcome?.media_urls?.[0]?.url || d?.outcome?.thumbnail_image_url || ''
      console.log('  ✓ status:', d?.status || '', ' 图片直链:', url ? url.slice(0, 120) + '…' : '(异步排队中)')
    } else {
      console.log('  ✗ body:', JSON.stringify(d).slice(0, 400))
    }
  } catch (e) {
    console.error('  ✗ 网络错误:', String(e))
  }
}
