import { createHash, timingSafeEqual } from 'node:crypto'

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

export function verifyEventCallback({ headers = {}, rawBody = '', body = {}, config, now = Date.now() }) {
  if (!config.verificationToken && !config.encryptKey) {
    return { ok: false, error: 'feishu_event_security_not_configured' }
  }

  if (config.encryptKey) {
    const timestamp = String(headers['x-lark-request-timestamp'] || '')
    const nonce = String(headers['x-lark-request-nonce'] || '')
    const signature = String(headers['x-lark-signature'] || '')
    if (!timestamp || !nonce || !signature) return { ok: false, error: 'feishu_event_signature_missing' }
    const timestampMs = Number(timestamp) * 1000
    if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 10 * 60 * 1000) {
      return { ok: false, error: 'feishu_event_timestamp_expired' }
    }
    const expected = eventSignature({ timestamp, nonce, encryptKey: config.encryptKey, rawBody })
    if (!equalText(signature, expected)) return { ok: false, error: 'feishu_event_signature_invalid' }
  }

  if (config.verificationToken && !body?.encrypt) {
    const token = body?.token || body?.header?.token || body?.event?.token || ''
    if (!equalText(token, config.verificationToken)) return { ok: false, error: 'feishu_verification_token_invalid' }
  }

  return { ok: true }
}
