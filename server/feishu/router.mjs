import { readFeishuConfig, publicFeishuConfig } from './config.mjs'
import { createFeishuClient } from './client.mjs'
import { verifyEventCallback } from './security.mjs'
import { SessionStore } from './session-store.mjs'
import { FeishuTaskStore } from './task-store.mjs'
import { createOcrProvider } from './ocr-provider.mjs'
import { createQwenLocationExtractor } from './qwen-extractor.mjs'
import { createFeishuWriteback } from './writeback.mjs'
import { createFeishuWorkflow } from './workflow.mjs'
import { createSlidingWindowLimiter } from '../security.mjs'

const ACCEPTED_SOURCE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])

function bearer(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1] || ''
}

function json(raw) {
  try { return JSON.parse(raw || '{}') } catch { throw new Error('invalid_json') }
}

function httpError(error) {
  const message = String(error?.message || error || 'unknown_error')
  if (message === 'unauthorized') return { code: 401, message }
  if (message.includes('not_found')) return { code: 404, message }
  if (message.includes('not_awaiting') || message.includes('not_failed')) return { code: 409, message }
  if (message.includes('invalid') || message.includes('missing') || message.includes('unsupported') || message.includes('incomplete')) return { code: 400, message }
  return { code: 500, message }
}

export async function createFeishuRouter({ env = process.env, rootDir, fetchImpl = fetch, qwenProvider, readBody, sendJSON }) {
  const config = readFeishuConfig(env, rootDir)
  const client = createFeishuClient(config, fetchImpl)
  const sessions = new SessionStore()
  const taskLimiter = createSlidingWindowLimiter({ limit: config.taskRateLimitPerMinute, windowMs: 60_000 })
  const store = new FeishuTaskStore({ dataDir: config.dataDir, workflowVersion: config.workflowVersion })
  await store.init()
  const workflow = createFeishuWorkflow({
    store,
    ocr: createOcrProvider(config, fetchImpl),
    extractor: createQwenLocationExtractor(qwenProvider, fetchImpl),
    writeback: createFeishuWriteback({ client, config }),
  })

  const requireSession = (req) => {
    const session = sessions.get(bearer(req))
    if (!session) throw new Error('unauthorized')
    return session
  }

  async function handle(req, res, url) {
    const path = url.pathname
    if (!path.startsWith('/api/feishu/')) return false
    try {
      if (path === '/api/feishu/config' && req.method === 'GET') {
        sendJSON(res, publicFeishuConfig(config)); return true
      }

      if (path === '/api/feishu/auth' && req.method === 'GET') {
        sendJSON(res, publicFeishuConfig(config)); return true
      }

      if (path === '/api/feishu/auth' && req.method === 'POST') {
        const body = json(await readBody(req, 32 * 1024))
        let identity
        let userAccessToken = ''
        let ttlMs
        if (config.devBypassAuth && body.devBypass === true) {
          identity = { openId: 'dev-open-id', unionId: 'dev-union-id', tenantKey: 'dev-tenant', name: '本地验收用户', avatarUrl: '' }
          ttlMs = 12 * 60 * 60 * 1000
        } else {
          if (!body.code) throw new Error('feishu_auth_code_missing')
          const exchanged = await client.exchangeAuthCode(body.code)
          userAccessToken = exchanged.accessToken
          ttlMs = exchanged.expiresIn * 1000
          identity = await client.getUserInfo(userAccessToken)
        }
        const session = sessions.create(identity, { userAccessToken }, ttlMs)
        sendJSON(res, { sessionToken: session.token, expiresAt: session.expiresAt, user: identity }); return true
      }

      if (path === '/api/feishu/events' && req.method === 'POST') {
        const raw = await readBody(req, 2 * 1024 * 1024)
        const body = json(raw)
        const verified = verifyEventCallback({ headers: req.headers, rawBody: raw, body, config })
        if (!verified.ok) { sendJSON(res, { error: verified.error }, 401); return true }
        if (body.challenge) { sendJSON(res, { challenge: body.challenge }); return true }
        sendJSON(res, { code: 0 })
        queueMicrotask(() => { void store.audit('feishu_event_received', null, { eventType: body?.header?.event_type || body?.type || 'encrypted' }) })
        return true
      }

      if (path === '/api/feishu/tasks' && req.method === 'POST') {
        const session = requireSession(req)
        const rate = taskLimiter.consume(`${session.identity.tenantKey}:${session.identity.openId}`)
        res.setHeader('x-ratelimit-limit', String(config.taskRateLimitPerMinute))
        res.setHeader('x-ratelimit-remaining', String(rate.remaining))
        if (!rate.allowed) {
          res.setHeader('retry-after', String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))))
          sendJSON(res, { error: 'rate_limited', retryAfterMs: rate.retryAfterMs }, 429); return true
        }
        const body = json(await readBody(req, Math.ceil(config.maxUploadBytes * 1.45) + 128 * 1024))
        const sourceBase64 = String(body.sourceBase64 || '')
        const approxBytes = Math.floor(sourceBase64.length * 0.75)
        if (!body.fileName || !body.mimeType) throw new Error('source_metadata_missing')
        if (!ACCEPTED_SOURCE_TYPES.has(body.mimeType)) throw new Error('unsupported_source_type')
        if (!sourceBase64 && !Array.isArray(body.pages)) throw new Error('source_file_missing')
        if (approxBytes > config.maxUploadBytes) throw new Error('source_file_too_large')
        const created = await workflow.createTask({
          identity: session.identity,
          userAccessToken: session.privateData.userAccessToken,
          source: { fileName: body.fileName, mimeType: body.mimeType, sourceBase64, pages: body.pages },
        })
        sendJSON(res, created, created.reused ? 200 : 202); return true
      }

      const taskMatch = path.match(/^\/api\/feishu\/tasks\/([^/]+)$/)
      if (taskMatch && req.method === 'GET') {
        const session = requireSession(req)
        const task = store.getOwned(decodeURIComponent(taskMatch[1]), session.identity)
        if (!task) throw new Error('task_not_found')
        sendJSON(res, { task }); return true
      }

      const retryMatch = path.match(/^\/api\/feishu\/tasks\/([^/]+)\/retry$/)
      if (retryMatch && req.method === 'POST') {
        const session = requireSession(req)
        const id = decodeURIComponent(retryMatch[1])
        if (!store.getOwned(id, session.identity)) throw new Error('task_not_found')
        sendJSON(res, { task: await workflow.retry(id) }, 202); return true
      }

      if (path === '/api/feishu/writeback' && req.method === 'POST') {
        const session = requireSession(req)
        const body = json(await readBody(req, 512 * 1024))
        if (!store.getOwned(body.taskId, session.identity)) throw new Error('task_not_found')
        sendJSON(res, { task: await workflow.confirmAndWrite(body.taskId, body.locations) }); return true
      }

      sendJSON(res, { error: 'feishu_route_not_found' }, 404); return true
    } catch (error) {
      const failure = httpError(error)
      sendJSON(res, { error: failure.message }, failure.code)
      return true
    }
  }

  return {
    handle,
    health: () => ({
      configured: Boolean(config.appId && config.appSecret),
      ocr: Boolean(config.paddleOcrUrl),
      qwen: Boolean(qwenProvider.key),
      bitable: Boolean(config.bitableAppToken && config.bitableTableId),
      workflowVersion: config.workflowVersion,
    }),
  }
}
