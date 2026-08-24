import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto'

function equalText(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

export function eventSignature({ timestamp, nonce, encryptKey, rawBody }) {
  return createHash('sha256')
    .update(`${timestamp || ''}${nonce || ''}${encryptKey || ''}${rawBody || ''}`)
    .digest('hex')
}

export function decryptEventText(encrypt, encryptKey) {
  const encoded = String(encrypt || '')
  if (!encryptKey) throw new Error('feishu_event_encrypt_key_missing')
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('feishu_event_decrypt_failed')
  }
  try {
    const payload = Buffer.from(encoded, 'base64')
    if (payload.length <= 16 || (payload.length - 16) % 16 !== 0) throw new Error('invalid_ciphertext_length')
    const key = createHash('sha256').update(String(encryptKey)).digest()
    const decipher = createDecipheriv('aes-256-cbc', key, payload.subarray(0, 16))
    return Buffer.concat([decipher.update(payload.subarray(16)), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('feishu_event_decrypt_failed')
  }
}

export function decryptEventPayload(encrypt, encryptKey) {
  try {
    const body = JSON.parse(decryptEventText(encrypt, encryptKey))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_event_body')
    return body
  } catch (error) {
    if (error?.message === 'feishu_event_encrypt_key_missing') throw error
    throw new Error('feishu_event_decrypt_failed')
  }
}

export function verifyEventToken(body, config) {
  if (!config.verificationToken) return { ok: true }
  const token = body?.token || body?.header?.token || body?.event?.token || ''
  return equalText(token, config.verificationToken)
    ? { ok: true }
    : { ok: false, error: 'feishu_verification_token_invalid' }
}

export function createEventDeduplicator({ ttlMs = 24 * 60 * 60 * 1000, maxEntries = 5000, now = Date.now } = {}) {
  const seen = new Map()
  return {
    accept(eventId) {
      const id = String(eventId || '')
      if (!id) return true
      const current = now()
      const existing = seen.get(id)
      if (existing && existing > current) return false
      if (seen.size >= maxEntries) {
        for (const [key, expiresAt] of seen) if (expiresAt <= current) seen.delete(key)
        if (seen.size >= maxEntries) seen.delete(seen.keys().next().value)
      }
      seen.set(id, current + ttlMs)
      return true
    },
  }
}

export function verifyEventCallback({ headers = {}, rawBody = '', body = {}, config, now = Date.now() }) {
  if (!config.verificationToken && !config.encryptKey) {
    return { ok: false, error: 'feishu_event_security_not_configured' }
  }

  // 飞书在开发者后台首次保存请求地址时，会发送不带签名头的明文
  // url_verification。此时仍用 Verification Token 校验来源；正常事件继续
  // 强制走 Encrypt Key 签名，不能把这个兼容分支扩大到普通回调。
  if (body?.challenge && !body?.encrypt) return verifyEventToken(body, config)

  if (config.encryptKey) {
    const timestamp = String(headers['x-lark-request-timestamp'] || '')
    const nonce = String(headers['x-lark-request-nonce'] || '')
    const signature = String(headers['x-lark-signature'] || '')
    // 飞书后台保存请求地址时，也可能把 URL verification 加密，但不附带
    // 签名头。这里只允许进入“先解密再确认 challenge”的受限分支；普通
    // 事件仍由 router 在解密后拒绝，不能借此绕过签名。
    if (!timestamp || !nonce || !signature) {
      return body?.encrypt
        ? { ok: true, unsignedEncryptedVerification: true }
        : { ok: false, error: 'feishu_event_signature_missing' }
    }
    const timestampMs = Number(timestamp) * 1000
    if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 10 * 60 * 1000) {
      return { ok: false, error: 'feishu_event_timestamp_expired' }
    }
    const expected = eventSignature({ timestamp, nonce, encryptKey: config.encryptKey, rawBody })
    if (!equalText(signature, expected)) return { ok: false, error: 'feishu_event_signature_invalid' }
  }

  if (!body?.encrypt) return verifyEventToken(body, config)

  return { ok: true }
}
