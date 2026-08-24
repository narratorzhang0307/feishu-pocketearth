import { createCipheriv, createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { createFeishuRouter, domainsMentionedByEvent, parseFeishuDocumentToken } from './router.mjs';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { eventSignature } from './security.mjs';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { BITABLE_LIBRARY_FIELDS, BITABLE_LIBRARY_STATUS, fieldsFromLibraryRecord } from './bitable-library.mjs';

function encryptEvent(body: object, keyText: string) {
  const key = createHash('sha256').update(keyText).digest();
  const iv = Buffer.from('0123456789abcdef');
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(JSON.stringify(body), 'utf8'), cipher.final()]).toString('base64');
}

describe('Feishu event callback route', () => {
  it('refreshes every configured domain when Feishu sends a base-level record change', () => {
    const config = {
      bitableAppToken: 'base-token',
      bitableLibraryTables: { books: 'tbl-books', movies: 'tbl-movies', music: 'tbl-music', photos: '' },
    };
    expect(domainsMentionedByEvent({ event: { file_token: 'base-token' } }, config)).toEqual(['books', 'movies', 'music']);
    expect(domainsMentionedByEvent({ event: { table_id: 'tbl-movies' } }, config)).toEqual(['movies']);
  });

  it('accepts only Feishu docx links or document tokens', () => {
    expect(parseFeishuDocumentToken('https://example.feishu.cn/docx/FdVzdxnSpoWp8GxiKlscJAqonvh?from=space')).toBe('FdVzdxnSpoWp8GxiKlscJAqonvh');
    expect(parseFeishuDocumentToken('FdVzdxnSpoWp8GxiKlscJAqonvh')).toBe('FdVzdxnSpoWp8GxiKlscJAqonvh');
    expect(() => parseFeishuDocumentToken('https://example.com/docx/FdVzdxnSpoWp8GxiKlscJAqonvh')).toThrow('feishu_document_url_invalid');
    expect(() => parseFeishuDocumentToken('https://example.feishu.cn/wiki/FdVzdxnSpoWp8GxiKlscJAqonvh')).toThrow('feishu_document_url_invalid');
  });

  it('keeps the Bitable success card clickable even before public config reaches the client', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-library-open-'));
    const response: { status?: number; headers?: Record<string, string>; ended?: boolean } = {};
    const router = await createFeishuRouter({
      env: {
        FEISHU_DATA_DIR: path.join(rootDir, 'data'),
        FEISHU_BITABLE_APP_TOKEN: 'base-token',
        FEISHU_BITABLE_BOOKS_TABLE_ID: 'tbl-books',
      },
      rootDir,
      qwenProvider: { key: '' },
      readBody: async () => '',
      sendJSON: () => {},
    });
    const res = {
      writeHead: (status: number, headers: Record<string, string>) => { response.status = status; response.headers = headers; },
      end: () => { response.ended = true; },
    };

    await router.handle({ method: 'GET', headers: {} }, res, new URL('http://localhost/api/feishu/library/open'));

    expect(response).toEqual({
      status: 302,
      headers: { Location: 'https://feishu.cn/base/base-token', 'Cache-Control': 'no-store' },
      ended: true,
    });
  });

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

  it('serves a session-protected library and accepts an authenticated automation refresh', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-library-'));
    let rawBody = '';
    let response: { body?: any; status?: number } = {};
    const book = { id: 'book-1', title: '夜航', author: '圣埃克苏佩里', country: '法国', type: '小说', year: 1931, rating: 5, date: '2026-08-23', synopsis: '', locations: [] };
    const fetchImpl = async (url: string) => {
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return Response.json({ code: 0, tenant_access_token: 'tenant', expire: 7200 });
      if (url.includes('/records?')) return Response.json({ code: 0, data: { items: [{ record_id: 'rec-1', fields: fieldsFromLibraryRecord('books', book) }], has_more: false } });
      return Response.json({ code: 0 });
    };
    const router = await createFeishuRouter({
      env: {
        FEISHU_DATA_DIR: path.join(rootDir, 'data'), FEISHU_APP_ID: 'app-id', FEISHU_APP_SECRET: 'secret', FEISHU_DEV_BYPASS_AUTH: 'true',
        FEISHU_BITABLE_APP_TOKEN: 'base-token', FEISHU_BITABLE_BOOKS_TABLE_ID: 'tbl-books', FEISHU_BITABLE_REFRESH_TOKEN: 'refresh-secret',
      },
      rootDir, fetchImpl, qwenProvider: { key: '' },
      readBody: async () => rawBody,
      sendJSON: (_res: unknown, body: unknown, status = 200) => { response = { body, status }; },
    });
    rawBody = JSON.stringify({ devBypass: true });
    await router.handle({ method: 'POST', headers: {} }, {}, new URL('http://localhost/api/feishu/auth'));
    const sessionToken = response.body.sessionToken;
    response = {};
    await router.handle({ method: 'GET', headers: { authorization: `Bearer ${sessionToken}` } }, {}, new URL('http://localhost/api/feishu/library'));
    expect(response).toMatchObject({ status: 200, body: { domains: { books: { records: [book], rejected: [] } }, configuredDomains: ['books'] } });

    rawBody = JSON.stringify({ token: 'refresh-secret', domain: 'books' });
    response = {};
    await router.handle({ method: 'POST', headers: {} }, {}, new URL('http://localhost/api/feishu/library/refresh'));
    expect(response).toMatchObject({ status: 200, body: { ok: true, domains: { books: { count: 1, rejected: 0 } } } });
  });

  it('processes a pending Bitable book through Qwen before the user confirms it', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-inbox-'));
    let rawBody = '';
    let response: { body?: any; status?: number } = {};
    const updateBodies: any[] = [];
    const pending = {
      record_id: 'rec-pending', fields: {
        [BITABLE_LIBRARY_FIELDS.title]: '夜航',
        [BITABLE_LIBRARY_FIELDS.author]: '圣埃克苏佩里',
        [BITABLE_LIBRARY_FIELDS.country]: '法国',
        [BITABLE_LIBRARY_FIELDS.status]: BITABLE_LIBRARY_STATUS.pending,
      },
    };
    const fetchImpl = async (url: string, init: RequestInit = {}) => {
      if (url === 'https://qwen.test') return Response.json({ choices: [{ message: { content: JSON.stringify({ locations: [{ nameAsWritten: '法国', modernName: '法国', description: '作品的作者国家', page: 1, evidence: '法国', latitude: 46.23, longitude: 2.21, confidence: 0.9 }] }) } }] });
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return Response.json({ code: 0, tenant_access_token: 'tenant', expire: 7200 });
      if (url.includes('/records?')) return Response.json({ code: 0, data: { items: [pending], has_more: false } });
      if (url.includes('/records/batch_update')) {
        updateBodies.push(JSON.parse(String(init.body || '{}')));
        return Response.json({ code: 0, data: { records: [] } });
      }
      return Response.json({ code: 0 });
    };
    const router = await createFeishuRouter({
      env: {
        FEISHU_DATA_DIR: path.join(rootDir, 'data'), FEISHU_APP_ID: 'app-id', FEISHU_APP_SECRET: 'secret', FEISHU_DEV_BYPASS_AUTH: 'true',
        FEISHU_BITABLE_APP_TOKEN: 'base-token', FEISHU_BITABLE_BOOKS_TABLE_ID: 'tbl-books',
      },
      rootDir, fetchImpl, qwenProvider: { key: 'qwen-key', url: 'https://qwen.test', model: 'qwen-test' },
      readBody: async () => rawBody,
      sendJSON: (_res: unknown, body: unknown, status = 200) => { response = { body, status }; },
    });
    rawBody = JSON.stringify({ devBypass: true });
    await router.handle({ method: 'POST', headers: {} }, {}, new URL('http://localhost/api/feishu/auth'));
    const sessionToken = response.body.sessionToken;

    rawBody = JSON.stringify({ domains: ['books'] }); response = {};
    await router.handle({ method: 'POST', headers: { authorization: `Bearer ${sessionToken}` } }, {}, new URL('http://localhost/api/feishu/library/sync'));

    expect(response).toMatchObject({ status: 200, body: { ok: true, processing: [{ domain: 'books', processed: 1, failed: 0 }] } });
    expect(updateBodies[0].records[0]).toMatchObject({ record_id: 'rec-pending', fields: { 审核状态: '分析中' } });
    expect(updateBodies[1].records[0]).toMatchObject({ record_id: 'rec-pending', fields: { 审核状态: '待确认', 'Pocket ID': 'book:feishu:rec-pending' } });
  });
});
