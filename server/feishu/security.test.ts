import { createCipheriv, createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { createEventDeduplicator, decryptEventPayload, decryptEventText, eventSignature, verifyEventCallback, verifyEventToken } from './security.mjs';

function encryptEvent(body: object, keyText = 'encrypt-key') {
  const key = createHash('sha256').update(keyText).digest();
  const iv = Buffer.from('0123456789abcdef');
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(JSON.stringify(body), 'utf8'), cipher.final()]).toString('base64');
}

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

  it('decrypts an encrypted event before checking its verification token', () => {
    const body = { challenge: 'challenge-value', token: 'verification-token' };
    expect(decryptEventText('P37w+VZImNgPEO1RBhJ6RtKl7n6zymIbEG1pReEzghk=', 'test key')).toBe('hello world');
    expect(decryptEventPayload(encryptEvent(body), 'encrypt-key')).toEqual(body);
    expect(verifyEventToken(body, { verificationToken: 'verification-token' })).toEqual({ ok: true });
    expect(() => decryptEventPayload('not-base64', 'encrypt-key')).toThrow('feishu_event_decrypt_failed');
  });

  it('deduplicates event ids only inside the replay window', () => {
    let now = 1000;
    const events = createEventDeduplicator({ ttlMs: 100, maxEntries: 2, now: () => now });
    expect(events.accept('event-1')).toBe(true);
    expect(events.accept('event-1')).toBe(false);
    now += 101;
    expect(events.accept('event-1')).toBe(true);
  });
});
