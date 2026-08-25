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

  it('never redirects an unauthenticated user to the deployment owner Bitable', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-library-open-'));
    const response: { body?: unknown; status?: number } = {};
    const router = await createFeishuRouter({
      env: {
        FEISHU_DATA_DIR: path.join(rootDir, 'data'),
        FEISHU_BITABLE_APP_TOKEN: 'base-token',
        FEISHU_BITABLE_BOOKS_TABLE_ID: 'tbl-books',
      },
      rootDir,
      qwenProvider: { key: '' },
      readBody: async () => '',
      sendJSON: (_res: unknown, body: unknown, status = 200) => { response.body = body; response.status = status; },
    });
    await router.handle({ method: 'GET', headers: {} }, {}, new URL('http://localhost/api/feishu/library/open'));

    expect(response).toEqual({ status: 400, body: { error: 'personal_bitable_url_required' } });
  });

  it('ignores a browser-cached workspace owned by a different Feishu account', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-account-isolation-'));
    let rawBody = JSON.stringify({
      devBypass: true,
      workspaceOwner: 'another-open-id',
      workspace: { appToken: 'base-another-user', tables: { books: 'tbl-another-books' } },
    });
    let response: { body?: any; status?: number } = {};
    const router = await createFeishuRouter({
      env: { FEISHU_DATA_DIR: path.join(rootDir, 'data'), FEISHU_DEV_BYPASS_AUTH: 'true' },
      rootDir, qwenProvider: { key: '' }, readBody: async () => rawBody,
      sendJSON: (_res: unknown, body: unknown, status = 200) => { response = { body, status }; },
    });

    await router.handle({ method: 'POST', headers: {} }, {}, new URL('http://localhost/api/feishu/auth'));

    expect(response).toMatchObject({ status: 200, body: { user: { openId: 'dev-open-id' }, workspace: { appToken: '', tables: {}, domainUrls: {} } } });
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
    rawBody = JSON.stringify({ devBypass: true, workspaceOwner: 'dev-open-id', workspace: { appToken: 'base-token', tables: { books: 'tbl-books' } } });
    await router.handle({ method: 'POST', headers: {} }, {}, new URL('http://localhost/api/feishu/auth'));
    const sessionToken = response.body.sessionToken;
    response = {};
    await router.handle({ method: 'GET', headers: { authorization: `Bearer ${sessionToken}` } }, {}, new URL('http://localhost/api/feishu/library'));
    expect(response).toMatchObject({ status: 200, body: { domains: { books: { records: [book], rejected: [] } }, configuredDomains: ['books'] } });

    rawBody = JSON.stringify({ token: 'refresh-secret', domain: 'books' });
    response = {};
    await router.handle({ method: 'POST', headers: {} }, {}, new URL('http://localhost/api/feishu/library/refresh'));
    expect(response).toEqual({ status: 410, body: { error: 'personal_bitable_session_required' } });
  });

  it('writes a movie only to the signed-in user movie table, never the deployment owner book table', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-personal-movie-'));
    let rawBody = '';
    let response: { body?: any; status?: number } = {};
    const calls: Array<{ url: string; authorization: string }> = [];
    const movieRows: any[] = [];
    const fetchImpl = async (url: string, init: RequestInit = {}) => {
      const authorization = String((init.headers as Record<string, string> | undefined)?.authorization || '');
      calls.push({ url, authorization });
      if (url.endsWith('/auth/v3/app_access_token/internal')) return Response.json({ code: 0, app_access_token: 'app-token', expire: 7200 });
      if (url.endsWith('/authen/v1/access_token')) return Response.json({ code: 0, data: { access_token: 'user-token', expires_in: 7200 } });
      if (url.endsWith('/authen/v1/user_info')) return Response.json({ code: 0, data: { open_id: 'user-open-id', tenant_key: 'user-tenant', name: '电影用户' } });
      if (url.includes('/records?')) return Response.json({ code: 0, data: { items: [...movieRows], has_more: false } });
      if (url.endsWith('/records/batch_create')) {
        const body = JSON.parse(String(init.body || '{}'));
        movieRows.push({ record_id: 'rec-movie', fields: body.records[0].fields });
        return Response.json({ code: 0, data: { records: [{ record_id: 'rec-movie' }] } });
      }
      if (url.endsWith('/records/batch_delete')) {
        const body = JSON.parse(String(init.body || '{}'));
        movieRows.splice(0, movieRows.length, ...movieRows.filter((row) => !body.records.includes(row.record_id)));
        return Response.json({ code: 0 });
      }
      return Response.json({ code: 0 });
    };
    const router = await createFeishuRouter({
      env: {
        FEISHU_DATA_DIR: path.join(rootDir, 'data'), FEISHU_APP_ID: 'app-id', FEISHU_APP_SECRET: 'secret',
        FEISHU_BITABLE_APP_TOKEN: 'base-owner', FEISHU_BITABLE_BOOKS_TABLE_ID: 'tbl-owner-books',
      },
      rootDir, fetchImpl, qwenProvider: { key: '' },
      readBody: async () => rawBody,
      sendJSON: (_res: unknown, body: unknown, status = 200) => { response = { body, status }; },
    });

    rawBody = JSON.stringify({ code: 'oauth-code', workspaceOwner: 'user-open-id', workspace: { appToken: 'base-user', tables: { movies: 'tbl-user-movies' } } });
    await router.handle({ method: 'POST', headers: {} }, {}, new URL('http://localhost/api/feishu/auth'));
    const sessionToken = response.body.sessionToken;
    rawBody = JSON.stringify({ duplicatePolicy: 'warn', records: [{
      id: 'movie:frost:bar-talk', title: '酒吧长谈', original: '', type: '电影', director: '', country: '', year: null,
      rating: null, date: '2026-08-25', synopsis: '我很喜欢', locations: [],
    }] });
    response = {};
    await router.handle(
      { method: 'POST', headers: { authorization: `Bearer ${sessionToken}` } }, {},
      new URL('http://localhost/api/feishu/library/movies/records'),
    );

    expect(response).toMatchObject({ status: 200, body: {
      created: 1, updated: 0, alreadyExists: [], domain: 'movies', schema: 'pocket.movies/v1',
      tableUrl: 'https://feishu.cn/base/base-user?table=tbl-user-movies',
    } });

    rawBody = JSON.stringify({ pocketIds: ['movie:frost:bar-talk'] });
    response = {};
    await router.handle(
      { method: 'DELETE', headers: { authorization: `Bearer ${sessionToken}` } }, {},
      new URL('http://localhost/api/feishu/library/movies/records'),
    );
    expect(response).toMatchObject({ status: 200, body: { deleted: 1, domain: 'movies', tableUrl: 'https://feishu.cn/base/base-user?table=tbl-user-movies' } });
    expect(movieRows).toEqual([]);

    const bitableCalls = calls.filter((call) => call.url.includes('/bitable/v1/apps/'));
    expect(bitableCalls.map((call) => call.url)).toEqual([
      'https://open.feishu.cn/open-apis/bitable/v1/apps/base-user/tables/tbl-user-movies/records?page_size=500',
      'https://open.feishu.cn/open-apis/bitable/v1/apps/base-user/tables/tbl-user-movies/records/batch_create',
      'https://open.feishu.cn/open-apis/bitable/v1/apps/base-user/tables/tbl-user-movies/records?page_size=500',
      'https://open.feishu.cn/open-apis/bitable/v1/apps/base-user/tables/tbl-user-movies/records/batch_delete',
    ]);
    expect(bitableCalls.every((call) => call.authorization === 'Bearer user-token')).toBe(true);
    expect(calls.some((call) => call.url.includes('base-owner') || call.url.includes('tbl-owner-books'))).toBe(false);
  });

  it('keeps manual sync fast by leaving pending AI work to the inbox worker', async () => {
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
    rawBody = JSON.stringify({ devBypass: true, workspaceOwner: 'dev-open-id', workspace: { appToken: 'base-token', tables: { books: 'tbl-books' } } });
    await router.handle({ method: 'POST', headers: {} }, {}, new URL('http://localhost/api/feishu/auth'));
    const sessionToken = response.body.sessionToken;

    rawBody = JSON.stringify({ domains: ['books'] }); response = {};
    await router.handle({ method: 'POST', headers: { authorization: `Bearer ${sessionToken}` } }, {}, new URL('http://localhost/api/feishu/library/sync'));

    expect(response).toMatchObject({ status: 200, body: { ok: true, processing: [], snapshot: { domains: { books: { records: [], pending: [{ recordId: 'rec-pending', status: '待分析' }] } } } } });
    expect(updateBodies).toEqual([]);
  });
});
