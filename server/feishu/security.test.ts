import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { eventSignature, verifyEventCallback } from './security.mjs';

describe('Feishu callback security', () => {
  it('matches the documented timestamp + nonce + encrypt key + body signature', () => {
    const rawBody = '{"header":{"event_type":"im.message.receive_v1"}}';
    const expected = createHash('sha256').update(`1700000000nonceencrypt-key${rawBody}`).digest('hex');
    expect(eventSignature({ timestamp: '1700000000', nonce: 'nonce', encryptKey: 'encrypt-key', rawBody })).toBe(expected);
  });

  it('rejects stale or tampered callbacks and accepts a valid callback', () => {
    const now = 1_700_000_000_000;
    const rawBody = '{"token":"verification-token"}';
    const signature = eventSignature({ timestamp: '1700000000', nonce: 'nonce', encryptKey: 'encrypt-key', rawBody });
    const base = {
      rawBody,
      body: { token: 'verification-token' },
      config: { verificationToken: 'verification-token', encryptKey: 'encrypt-key' },
      now,
    };
    expect(verifyEventCallback({ ...base, headers: { 'x-lark-request-timestamp': '1700000000', 'x-lark-request-nonce': 'nonce', 'x-lark-signature': signature } })).toEqual({ ok: true });
    expect(verifyEventCallback({ ...base, headers: { 'x-lark-request-timestamp': '1700000000', 'x-lark-request-nonce': 'nonce', 'x-lark-signature': 'bad' } }).ok).toBe(false);
    expect(verifyEventCallback({ ...base, now: now + 700_000, headers: { 'x-lark-request-timestamp': '1700000000', 'x-lark-request-nonce': 'nonce', 'x-lark-signature': signature } }).ok).toBe(false);
  });
});
