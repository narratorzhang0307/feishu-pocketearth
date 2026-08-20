const safeText = (value, max = 4000) => String(value ?? '').trim().slice(0, max)

export class FeishuApiError extends Error {
  constructor(operation, response, data) {
    const detail = data?.msg || data?.message || response.statusText || `HTTP ${response.status}`
    super(`${operation}: ${detail}`)
    this.name = 'FeishuApiError'
    this.operation = operation
    this.status = response.status
    this.code = data?.code
  }
}

export function createFeishuClient(config, fetchImpl = fetch) {
  let appTokenCache = null
  let tenantTokenCache = null

  async function request(path, { method = 'GET', token = '', body, timeoutMs = 15000, operation = path } = {}) {
    const response = await fetchImpl(`${config.apiBase}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json; charset=utf-8' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    let data = null
    try { data = await response.json() } catch { data = null }
    if (!response.ok || (typeof data?.code === 'number' && data.code !== 0)) {
      throw new FeishuApiError(operation, response, data)
    }
    return data
  }

  async function cachedToken(cacheName) {
    const cache = cacheName === 'app' ? appTokenCache : tenantTokenCache
    if (cache && cache.expiresAt > Date.now() + 60_000) return cache.value
    if (!config.appId || !config.appSecret) throw new Error('feishu_app_credentials_not_configured')
    const endpoint = cacheName === 'app'
      ? '/auth/v3/app_access_token/internal'
      : '/auth/v3/tenant_access_token/internal'
    const key = cacheName === 'app' ? 'app_access_token' : 'tenant_access_token'
    const data = await request(endpoint, {
      method: 'POST',
      body: { app_id: config.appId, app_secret: config.appSecret },
      operation: `get_${key}`,
    })
    const value = data?.[key]
    if (!value) throw new Error(`${key}_missing`)
    const next = { value, expiresAt: Date.now() + Math.max(60, Number(data.expire || 7200)) * 1000 }
    if (cacheName === 'app') appTokenCache = next
    else tenantTokenCache = next
    return value
  }

  async function exchangeAuthCode(code) {
    const appAccessToken = await cachedToken('app')
    const data = await request('/authen/v1/access_token', {
      method: 'POST', token: appAccessToken,
      body: { grant_type: 'authorization_code', code: safeText(code, 2048) },
      operation: 'exchange_feishu_auth_code',
    })
    const accessToken = data?.data?.access_token
    if (!accessToken) throw new Error('feishu_user_access_token_missing')
    return { accessToken, expiresIn: Number(data?.data?.expires_in || 7200) }
  }

  async function getUserInfo(userAccessToken) {
    const data = await request('/authen/v1/user_info', {
      token: userAccessToken,
      operation: 'get_feishu_user_info',
    })
    const user = data?.data || {}
    return {
      openId: safeText(user.open_id, 128),
      unionId: safeText(user.union_id, 128),
      tenantKey: safeText(user.tenant_key, 128) || 'current-tenant',
      name: safeText(user.name, 200) || '飞书用户',
      avatarUrl: safeText(user.avatar_url, 2048),
    }
  }

  async function createDocument(title, userAccessToken = '') {
    const token = userAccessToken || await cachedToken('tenant')
    const data = await request('/docx/v1/documents', {
      method: 'POST', token,
      body: {
        title: safeText(title, 400),
        ...(config.documentFolderToken ? { folder_token: config.documentFolderToken } : {}),
      },
      operation: 'create_feishu_document',
    })
    const documentId = data?.data?.document?.document_id
    if (!documentId) throw new Error('feishu_document_id_missing')
    return { documentId, url: `https://feishu.cn/docx/${documentId}` }
  }

  async function appendDocumentBlocks(documentId, children, userAccessToken = '') {
    const token = userAccessToken || await cachedToken('tenant')
    return request(`/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(documentId)}/children`, {
      method: 'POST', token,
      body: { children, index: -1 },
      timeoutMs: 30000,
      operation: 'append_feishu_document_blocks',
    })
  }

  async function createBitableRecords(records) {
    if (!config.bitableAppToken || !config.bitableTableId) return { skipped: true, reason: 'bitable_not_configured' }
    const token = await cachedToken('tenant')
    const data = await request(`/bitable/v1/apps/${encodeURIComponent(config.bitableAppToken)}/tables/${encodeURIComponent(config.bitableTableId)}/records/batch_create`, {
      method: 'POST', token,
      body: { records: records.map((fields) => ({ fields })) },
      timeoutMs: 30000,
      operation: 'create_feishu_bitable_records',
    })
    return { skipped: false, records: data?.data?.records || [] }
  }

  async function sendInteractiveCard(openId, card) {
    if (!openId) return { skipped: true, reason: 'open_id_missing' }
    const token = await cachedToken('tenant')
    const data = await request('/im/v1/messages?receive_id_type=open_id', {
      method: 'POST', token,
      body: { receive_id: openId, msg_type: 'interactive', content: JSON.stringify(card) },
      operation: 'send_feishu_interactive_card',
    })
    return { skipped: false, messageId: data?.data?.message_id || '' }
  }

  return {
    exchangeAuthCode,
    getUserInfo,
    createDocument,
    appendDocumentBlocks,
    createBitableRecords,
    sendInteractiveCard,
    getTenantAccessToken: () => cachedToken('tenant'),
  }
}

export function textBlock(content, blockType = 2) {
  return {
    block_type: blockType,
    text: { elements: [{ text_run: { content: safeText(content, 5000) } }] },
  }
}
