import { randomBytes } from 'node:crypto'

export class SessionStore {
  constructor({ ttlMs = 90 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs
    this.sessions = new Map()
  }

  create(identity, privateData = {}, ttlMs = this.ttlMs) {
    if (this.sessions.size > 1000) {
      const now = Date.now()
      for (const [existingToken, session] of this.sessions) {
        if (session.expiresAt <= now) this.sessions.delete(existingToken)
      }
    }
    const token = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + Math.max(60_000, ttlMs)
    this.sessions.set(token, { identity, privateData, expiresAt })
    return { token, expiresAt }
  }

  get(token) {
    const session = this.sessions.get(String(token || ''))
    if (!session) return null
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(String(token || ''))
      return null
    }
    return session
  }
}
