import { readFeishuConfig, publicFeishuConfig } from './config.mjs'
import { createFeishuClient } from './client.mjs'
import { BITABLE_LIBRARY_DOMAINS, BITABLE_LIBRARY_STATUS, createBitableLibrary, hydrateBitableLibraryConfig } from './bitable-library.mjs'
import { createEventDeduplicator, decryptEventPayload, verifyEventCallback, verifyEventToken } from './security.mjs'
import { SessionStore } from './session-store.mjs'
import { FeishuTaskStore } from './task-store.mjs'
import { createOcrProvider } from './ocr-provider.mjs'
import { createQwenLocationExtractor } from './qwen-extractor.mjs'
import { createQwenPhotoCurator } from './photo-curation.mjs'
import { createFeishuWriteback } from './writeback.mjs'
import { createFeishuWorkflow } from './workflow.mjs'
import { listFeishuSkillAdapters, planFeishuSkillTask } from './frost-skill-router.mjs'
import { createSlidingWindowLimiter } from '../security.mjs'

const ACCEPTED_SOURCE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
const FEISHU_DOCUMENT_MIME = 'application/x-feishu-document'

export function parseFeishuDocumentToken(input) {
  const value = String(input || '').trim()
  if (/^[A-Za-z0-9_-]{8,128}$/.test(value)) return value
  let url
  try { url = new URL(value) } catch { throw new Error('feishu_document_url_invalid') }
  const hostname = url.hostname.toLowerCase()
  if (!(hostname === 'feishu.cn' || hostname.endsWith('.feishu.cn') || hostname === 'larksuite.com' || hostname.endsWith('.larksuite.com'))) {
    throw new Error('feishu_document_url_invalid')
  }
  const match = url.pathname.match(/^\/docx\/([A-Za-z0-9_-]{8,128})(?:\/|$)/)
  if (!match) throw new Error('feishu_document_url_invalid')
  return match[1]
}

function bearer(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1] || ''
}

function json(raw) {
  try { return JSON.parse(raw || '{}') } catch { throw new Error('invalid_json') }
}

export function domainsMentionedByEvent(eventBody, config) {
  const raw = JSON.stringify(eventBody || {})
  const configured = BITABLE_LIBRARY_DOMAINS.filter((domain) => Boolean(config.bitableLibraryTables?.[domain]))
  if (config.bitableAppToken && raw.includes(config.bitableAppToken)) return configured
  return configured.filter((domain) => {
    const tableId = config.bitableLibraryTables?.[domain]
    return tableId && raw.includes(tableId)
  })
}

function httpError(error) {
  const message = String(error?.message || error || 'unknown_error')
  if (message === 'unauthorized') return { code: 401, message }
  if (message.includes('too_large')) return { code: 413, message }
  if (message.includes('not_found')) return { code: 404, message }
  if (message.includes('not_awaiting') || message.includes('not_failed')) return { code: 409, message }
  if (message.includes('invalid') || message.includes('missing') || message.includes('unsupported') || message.includes('incomplete') || message.includes('required')) return { code: 400, message }
  return { code: 500, message }
}

export async function createFeishuRouter({ env = process.env, rootDir, fetchImpl = fetch, qwenProvider, readBody, sendJSON }) {
  const config = readFeishuConfig(env, rootDir)
  await hydrateBitableLibraryConfig(config)
  const client = createFeishuClient(config, fetchImpl)
  const library = createBitableLibrary({ client, config })
  const sessions = new SessionStore()
  const taskLimiter = createSlidingWindowLimiter({ limit: config.taskRateLimitPerMinute, windowMs: 60_000 })
  const eventDeduplicator = createEventDeduplicator()
  const store = new FeishuTaskStore({ dataDir: config.dataDir, workflowVersion: config.workflowVersion })
  await store.init()
  const extractor = createQwenLocationExtractor(qwenProvider, fetchImpl)
  const photoCurator = createQwenPhotoCurator(qwenProvider, fetchImpl)
  const photoCurationLimiter = createSlidingWindowLimiter({ limit: 8, windowMs: 60_000 })
  const workflow = createFeishuWorkflow({
    store,
    ocr: createOcrProvider(config, fetchImpl),
    extractor,
    writeback: createFeishuWriteback({ client, config }),
  })
  const publicConfig = () => ({ ...publicFeishuConfig(config), skills: listFeishuSkillAdapters() })
  const analyzeLibraryDraft = ({ domain, sourceText }) => extractor.extract(
    [{ page: 1, text: sourceText, confidence: 1 }],
    domain === 'books' ? { skillId: 'pocket.book-to-earth' } : null,
  )
  const processLibraryInbox = async (domains, options) => Promise.all(
    domains.filter((domain) => ['books', 'movies'].includes(domain))
      .map((domain) => library.processPending(domain, analyzeLibraryDraft, options)),
  )

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
        sendJSON(res, publicConfig()); return true
      }

      if (path === '/api/feishu/auth' && req.method === 'GET') {
        sendJSON(res, publicConfig()); return true
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

      if (path === '/api/feishu/session' && req.method === 'GET') {
        const session = requireSession(req)
        sendJSON(res, { user: session.identity, expiresAt: session.expiresAt }); return true
      }

      if (path === '/api/feishu/photos/review' && req.method === 'POST') {
        const session = requireSession(req)
        const rate = photoCurationLimiter.consume(`${session.identity.tenantKey}:${session.identity.openId}`)
        res.setHeader('x-ratelimit-limit', '8')
        res.setHeader('x-ratelimit-remaining', String(rate.remaining))
        if (!rate.allowed) {
          res.setHeader('retry-after', String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))))
          sendJSON(res, { error: 'rate_limited', retryAfterMs: rate.retryAfterMs }, 429); return true
        }
        const body = json(await readBody(req, 12 * 1024 * 1024))
        const result = await photoCurator.review(body.photos)
        await store.audit('photo_curation_reviewed', null, {
          user: session.identity.openId,
          count: result.reviews.length,
          model: result.model,
          photoIds: result.reviews.map((review) => review.id),
        })
        sendJSON(res, result); return true
      }

      if (path === '/api/feishu/library/refresh' && req.method === 'POST') {
        if (!config.bitableRefreshToken) { sendJSON(res, { error: 'bitable_refresh_not_configured' }, 503); return true }
        const body = json(await readBody(req, 16 * 1024))
        if (String(body.token || '') !== config.bitableRefreshToken) { sendJSON(res, { error: 'unauthorized' }, 401); return true }
        const domains = body.domain
          ? [String(body.domain)]
          : library.configuredDomains()
        if (domains.some((domain) => !BITABLE_LIBRARY_DOMAINS.includes(domain))) throw new Error('bitable_library_domain_invalid')
        domains.forEach((domain) => library.invalidate(domain))
        await processLibraryInbox(domains, { limit: 3 })
        const versions = await Promise.all(domains.map(async (domain) => {
          const data = await library.readDomain(domain, { force: true })
          return [domain, { version: data.version, count: data.records.length, rejected: data.rejected.length }]
        }))
        await store.audit('bitable_library_refreshed', null, { domains, trigger: 'bitable_automation' })
        sendJSON(res, { ok: true, domains: Object.fromEntries(versions) }); return true
      }

      if (path === '/api/feishu/library/sync' && req.method === 'POST') {
        requireSession(req)
        const body = json(await readBody(req, 16 * 1024))
        const domains = Array.isArray(body.domains) && body.domains.length
          ? body.domains.map(String)
          : library.configuredDomains()
        if (domains.some((domain) => !BITABLE_LIBRARY_DOMAINS.includes(domain))) throw new Error('bitable_library_domain_invalid')
        const processing = await processLibraryInbox(domains, { limit: 10 })
        domains.forEach((domain) => library.invalidate(domain))
        const snapshot = await library.readAll({ force: true })
        await store.audit('bitable_library_synced', null, { domains, trigger: 'user', processing })
        sendJSON(res, { ok: true, processing, snapshot }); return true
      }

      if (path === '/api/feishu/library/bootstrap' && req.method === 'POST') {
        const session = requireSession(req)
        const result = await library.ensureSchema()
        await store.audit('bitable_library_schema_ready', null, {
          user: session.identity.openId,
          createdTables: result.createdTables,
          createdFields: result.createdFields.length,
        })
        sendJSON(res, { ok: true, ...result }); return true
      }

      if (path === '/api/feishu/library/versions' && req.method === 'GET') {
        requireSession(req)
        void processLibraryInbox(library.configuredDomains(), { limit: 3 }).catch(() => {})
        const data = await library.readAll()
        sendJSON(res, {
          domains: Object.fromEntries(Object.entries(data.domains).map(([domain, value]) => [domain, {
            version: value.version, count: value.records.length, rejected: value.rejected.length, pending: value.pending.length, syncedAt: value.syncedAt,
          }])),
          configuredDomains: data.configuredDomains,
        }); return true
      }

      if (path === '/api/feishu/library' && req.method === 'GET') {
        requireSession(req)
        void processLibraryInbox(library.configuredDomains(), { limit: 3 }).catch(() => {})
        sendJSON(res, await library.readAll()); return true
      }

      const libraryDomainMatch = path.match(/^\/api\/feishu\/library\/(books|movies|music|photos)$/)
      if (libraryDomainMatch && req.method === 'GET') {
        requireSession(req)
        sendJSON(res, await library.readDomain(libraryDomainMatch[1])); return true
      }

      const libraryRecordsMatch = path.match(/^\/api\/feishu\/library\/(books|movies|music|photos)\/records$/)
      if (libraryRecordsMatch && req.method === 'POST') {
        requireSession(req)
        const body = json(await readBody(req, 4 * 1024 * 1024))
        const records = Array.isArray(body.records) ? body.records : body.record ? [body.record] : []
        if (!records.length) throw new Error('bitable_library_records_missing')
        const allowedStatuses = new Set(Object.values(BITABLE_LIBRARY_STATUS))
        const status = body.status === undefined ? BITABLE_LIBRARY_STATUS.confirmed : String(body.status)
        if (!allowedStatuses.has(status)) throw new Error('bitable_library_status_invalid')
        const source = String(body.source || 'Pocket Earth').slice(0, 200)
        sendJSON(res, await library.upsert(libraryRecordsMatch[1], records, { status, source })); return true
      }

      if (path === '/api/feishu/events' && req.method === 'POST') {
        const raw = await readBody(req, 2 * 1024 * 1024)
        const body = json(raw)
        const verified = verifyEventCallback({ headers: req.headers, rawBody: raw, body, config })
        if (!verified.ok) {
          console.warn('[pocket-earth-feishu] event verification rejected:', verified.error)
          sendJSON(res, { error: verified.error }, 401); return true
        }
        let eventBody = body
        if (body.encrypt) {
          try { eventBody = decryptEventPayload(body.encrypt, config.encryptKey) }
          catch (error) {
            console.warn('[pocket-earth-feishu] event decrypt rejected:', String(error?.message || error))
            sendJSON(res, { error: String(error?.message || error) }, 401); return true
          }
          const tokenVerified = verifyEventToken(eventBody, config)
          if (!tokenVerified.ok) {
            console.warn('[pocket-earth-feishu] event token rejected:', tokenVerified.error)
            sendJSON(res, { error: tokenVerified.error }, 401); return true
          }
          if (verified.unsignedEncryptedVerification && !eventBody.challenge) {
            console.warn('[pocket-earth-feishu] unsigned encrypted event rejected: challenge missing')
            sendJSON(res, { error: 'feishu_event_signature_missing' }, 401); return true
          }
        }
        if (eventBody.challenge) { sendJSON(res, { challenge: eventBody.challenge }); return true }
        sendJSON(res, { code: 0 })
        const eventId = eventBody?.header?.event_id || eventBody?.uuid || ''
        if (eventDeduplicator.accept(eventId)) {
          const changedDomains = domainsMentionedByEvent(eventBody, config)
          changedDomains.forEach((domain) => library.invalidate(domain))
          queueMicrotask(() => {
            void store.audit('feishu_event_received', null, { eventId, eventType: eventBody?.header?.event_type || eventBody?.type || 'unknown', changedDomains })
            changedDomains.forEach((domain) => {
              void library.processPending(domain, analyzeLibraryDraft, { limit: 10 })
                .then(() => library.readDomain(domain, { force: true }))
                .catch(() => {})
            })
          })
        }
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

      if (path === '/api/feishu/tasks/from-document' && req.method === 'POST') {
        const session = requireSession(req)
        const rate = taskLimiter.consume(`${session.identity.tenantKey}:${session.identity.openId}`)
        res.setHeader('x-ratelimit-limit', String(config.taskRateLimitPerMinute))
        res.setHeader('x-ratelimit-remaining', String(rate.remaining))
        if (!rate.allowed) {
          res.setHeader('retry-after', String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))))
          sendJSON(res, { error: 'rate_limited', retryAfterMs: rate.retryAfterMs }, 429); return true
        }
        const body = json(await readBody(req, 16 * 1024))
        const documentId = parseFeishuDocumentToken(body.documentUrl || body.documentToken)
        const content = await client.getDocumentRawContent(documentId, session.privateData.userAccessToken)
        const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '飞书文档'
        const sourceUrl = String(body.documentUrl || '').startsWith('http')
          ? String(body.documentUrl).trim().slice(0, 2048)
          : `https://feishu.cn/docx/${documentId}`
        const orchestration = planFeishuSkillTask({
          requestedSkillId: body.skillId,
          objective: `从飞书文档《${firstLine.slice(0, 120)}》提取有原文证据的地点并生成知识地球`,
        })
        const created = await workflow.createTask({
          identity: session.identity,
          userAccessToken: session.privateData.userAccessToken,
          orchestration,
          source: {
            fileName: firstLine.slice(0, 120),
            mimeType: FEISHU_DOCUMENT_MIME,
            documentId,
            sourceUrl,
            pages: [{ page: 1, text: content, confidence: 1 }],
          },
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
        sendJSON(res, { task: await workflow.confirmAndWrite(
          body.taskId,
          body.locations,
          session.privateData.userAccessToken,
        ) }); return true
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
      bitableLibrary: library.configuredDomains(),
      workflowVersion: config.workflowVersion,
    }),
  }
}
