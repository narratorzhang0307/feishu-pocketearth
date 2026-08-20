import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { createFeishuClient, textBlock } from './client.mjs';

describe('Feishu OpenAPI client contracts', () => {
  it('keeps secrets server-side and uses the official auth, doc, bitable and message routes', async () => {
    const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
    const fetchImpl = async (url: string, init: RequestInit = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      calls.push({ url, init, body });
      let data: Record<string, unknown> = { code: 0 };
      if (url.endsWith('/auth/v3/app_access_token/internal')) data = { code: 0, app_access_token: 'app-token', expire: 7200 };
      else if (url.endsWith('/authen/v1/access_token')) data = { code: 0, data: { access_token: 'user-token', expires_in: 7200 } };
      else if (url.endsWith('/authen/v1/user_info')) data = { code: 0, data: { open_id: 'open-1', tenant_key: 'tenant-1', name: '用户' } };
      else if (url.endsWith('/auth/v3/tenant_access_token/internal')) data = { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      else if (url.endsWith('/docx/v1/documents')) data = { code: 0, data: { document: { document_id: 'doc-1' } } };
      else if (url.includes('/records/batch_create')) data = { code: 0, data: { records: [{ record_id: 'rec-1' }] } };
      else if (url.includes('/im/v1/messages')) data = { code: 0, data: { message_id: 'msg-1' } };
      return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const client = createFeishuClient({
      apiBase: 'https://open.feishu.cn/open-apis', appId: 'app-id', appSecret: 'server-secret',
      documentFolderToken: '', bitableAppToken: 'base-token', bitableTableId: 'table-id',
    }, fetchImpl);

    const exchanged = await client.exchangeAuthCode('one-time-code');
    expect(await client.getUserInfo(exchanged.accessToken)).toMatchObject({ openId: 'open-1', tenantKey: 'tenant-1' });
    const document = await client.createDocument('测试报告', exchanged.accessToken);
    await client.appendDocumentBlocks(document.documentId, [textBlock('原文证据')], exchanged.accessToken);
    await client.createBitableRecords([{ '任务 ID': 'task-1' }]);
    await client.sendInteractiveCard('open-1', { elements: [] });

    expect(calls.map((call) => call.url)).toEqual([
      'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
      'https://open.feishu.cn/open-apis/authen/v1/access_token',
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      'https://open.feishu.cn/open-apis/docx/v1/documents',
      'https://open.feishu.cn/open-apis/docx/v1/documents/doc-1/blocks/doc-1/children',
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      'https://open.feishu.cn/open-apis/bitable/v1/apps/base-token/tables/table-id/records/batch_create',
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
    ]);
    expect(calls[0].body).toEqual({ app_id: 'app-id', app_secret: 'server-secret' });
    expect(calls.filter((call) => !call.url.includes('/auth/v3/')).some((call) => JSON.stringify(call.body).includes('server-secret'))).toBe(false);
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer app-token');
    expect((calls[3].init.headers as Record<string, string>).authorization).toBe('Bearer user-token');
    expect((calls[6].init.headers as Record<string, string>).authorization).toBe('Bearer tenant-token');
  });
});
