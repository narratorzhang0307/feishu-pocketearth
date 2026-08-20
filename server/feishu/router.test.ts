import { createCipheriv, createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { createFeishuRouter } from './router.mjs';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { eventSignature } from './security.mjs';

function encryptEvent(body: object, keyText: string) {
  const key = createHash('sha256').update(keyText).digest();
  const iv = Buffer.from('0123456789abcdef');
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(JSON.stringify(body), 'utf8'), cipher.final()]).toString('base64');
}

describe('Feishu event callback route', () => {
  it('returns an encrypted URL verification challenge after signature, decrypt and token checks', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-router-'));
    const encryptKey = 'event-encrypt-key';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = 'nonce';
    const rawBody = JSON.stringify({ encrypt: encryptEvent({ challenge: 'verified-challenge', token: 'verification-token' }, encryptKey) });
    const response: { body?: unknown; status?: number } = {};
    const router = await createFeishuRouter({
      env: {
        FEISHU_DATA_DIR: path.join(rootDir, 'data'),
        FEISHU_ENCRYPT_KEY: encryptKey,
        FEISHU_VERIFICATION_TOKEN: 'verification-token',
      },
      rootDir,
      qwenProvider: { key: '' },
      readBody: async () => rawBody,
      sendJSON: (_res: unknown, body: unknown, status = 200) => { response.body = body; response.status = status; },
    });
    const req = {
      method: 'POST',
      headers: {
        'x-lark-request-timestamp': timestamp,
        'x-lark-request-nonce': nonce,
        'x-lark-signature': eventSignature({ timestamp, nonce, encryptKey, rawBody }),
      },
    };

    await router.handle(req, {}, new URL('http://localhost/api/feishu/events'));
    expect(response).toEqual({ body: { challenge: 'verified-challenge' }, status: 200 });
  });
});
