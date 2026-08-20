import net from 'node:net'

const DEFAULT_WINDOW_MS = 60_000

export const SECURITY_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), geolocation=(self), microphone=()',
  'cross-origin-opener-policy': 'same-origin',
})

export function applySecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!res.hasHeader(name)) res.setHeader(name, value)
  }
}

export function clientAddress(req, trustProxy = false) {
  if (trustProxy) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
    if (net.isIP(forwarded)) return forwarded
    const real = String(req.headers?.['x-real-ip'] || '').trim()
    if (net.isIP(real)) return real
  }
  return String(req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '')
}

export function createSlidingWindowLimiter({ limit = 30, windowMs = DEFAULT_WINDOW_MS, maxEntries = 10_000 } = {}) {
  const buckets = new Map()
  return {
    consume(key, now = Date.now()) {
      const cutoff = now - windowMs
      const previous = buckets.get(key) || []
      const active = previous.filter((value) => value > cutoff)
      if (active.length >= limit) {
        buckets.set(key, active)
        return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, active[0] + windowMs - now) }
      }
      active.push(now)
      buckets.set(key, active)
      if (buckets.size > maxEntries) {
        for (const [entryKey, values] of buckets) {
          if (!values.length || values[values.length - 1] <= cutoff) buckets.delete(entryKey)
          if (buckets.size <= maxEntries) break
        }
      }
      return { allowed: true, remaining: Math.max(0, limit - active.length), retryAfterMs: 0 }
    },
    clear() { buckets.clear() },
  }
}

export function isSafeDataImage(value, maxChars = 24 * 1024 * 1024) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxChars) return false
  const match = value.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/)
  if (!match) return false
  const payload = match[2].replace(/\s/g, '')
  return payload.length >= 16 && payload.length % 4 === 0
}

export function isSafeInlineImage(value, maxChars = 24 * 1024 * 1024) {
  if (isSafeDataImage(value, maxChars)) return true
  if (typeof value !== 'string' || value.length < 16 || value.length > maxChars) return false
  return /^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.replace(/\s/g, '').length % 4 === 0
}

export function boundedText(value, maxChars) {
  if (typeof value !== 'string') return ''
  return value.slice(0, maxChars)
}
