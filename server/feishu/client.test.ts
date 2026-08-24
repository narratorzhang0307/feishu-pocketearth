import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { createFeishuClient, textBlock } from './client.mjs';

describe('Feishu OpenAPI client contracts', () => {
  it('serializes paragraph and heading blocks with the field required by each block type', () => {
    expect(textBlock('正文')).toEqual({
      block_type: 2,
      text: { elements: [{ text_run: { content: '正文' } }] },
    });
    expect(textBlock('一级标题', 3)).toEqual({
      block_type: 3,
      heading1: { elements: [{ text_run: { content: '一级标题' } }] },
    });
    expect(textBlock('二级标题', 4)).toEqual({
      block_type: 4,
      heading2: { elements: [{ text_run: { content: '二级标题' } }] },
    });
  });

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
      else if (url.endsWith('/docx/v1/documents/doc-source/raw_content')) data = { code: 0, data: { content: '杭州西湖' } };
      else if (url.includes('/records/batch_create')) data = { code: 0, data: { records: [{ record_id: 'rec-1' }] } };
      else if (url.includes('/records/batch_delete')) data = { code: 0, data: {} };
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
    expect(await client.getDocumentRawContent('doc-source', exchanged.accessToken)).toBe('杭州西湖');
    await client.appendDocumentBlocks(document.documentId, [textBlock('原文证据')], exchanged.accessToken);
    await client.createBitableRecords([{ '任务 ID': 'task-1' }]);
    await client.deleteBitableRecords(['rec-old']);
    await client.sendInteractiveCard('open-1', { elements: [] });

    expect(calls.map((call) => call.url)).toEqual([
      'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
      'https://open.feishu.cn/open-apis/authen/v1/access_token',
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      'https://open.feishu.cn/open-apis/docx/v1/documents',
      'https://open.feishu.cn/open-apis/docx/v1/documents/doc-source/raw_content',
      'https://open.feishu.cn/open-apis/docx/v1/documents/doc-1/blocks/doc-1/children',
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      'https://open.feishu.cn/open-apis/bitable/v1/apps/base-token/tables/table-id/records/batch_create',
      'https://open.feishu.cn/open-apis/bitable/v1/apps/base-token/tables/table-id/records/batch_delete',
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
    ]);
    expect(calls[0].body).toEqual({ app_id: 'app-id', app_secret: 'server-secret' });
    expect(calls.filter((call) => !call.url.includes('/auth/v3/')).some((call) => JSON.stringify(call.body).includes('server-secret'))).toBe(false);
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer app-token');
    expect((calls[3].init.headers as Record<string, string>).authorization).toBe('Bearer user-token');
    expect((calls[7].init.headers as Record<string, string>).authorization).toBe('Bearer tenant-token');
    expect(calls[8].body).toEqual({ records: ['rec-old'] });
  });

  it('paginates Bitable records and uses batch_update for existing Pocket IDs', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string, init: RequestInit = {}) => {
      calls.push(url);
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return Response.json({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 });
      if (url.includes('/records?') && url.includes('page_token=next')) return Response.json({ code: 0, data: { items: [{ record_id: 'rec-2' }], has_more: false } });
      if (url.includes('/records?')) return Response.json({ code: 0, data: { items: [{ record_id: 'rec-1' }], has_more: true, page_token: 'next' } });
      if (url.endsWith('/records/batch_update')) {
        expect(JSON.parse(String(init.body))).toEqual({ records: [{ record_id: 'rec-1', fields: { 标题: '夜航' } }] });
        return Response.json({ code: 0, data: { records: [{ record_id: 'rec-1' }] } });
      }
      return Response.json({ code: 0 });
    };
    const client = createFeishuClient({
      apiBase: 'https://open.feishu.cn/open-apis', appId: 'app-id', appSecret: 'secret', bitableAppToken: 'base-token', bitableTableId: '',
    }, fetchImpl);
    expect(await client.listBitableRecords('tbl-books')).toEqual([{ record_id: 'rec-1' }, { record_id: 'rec-2' }]);
    await client.updateBitableRecords([{ record_id: 'rec-1', fields: { 标题: '夜航' } }], 'tbl-books');
    expect(calls.some((url) => url.endsWith('/tables/tbl-books/records/batch_update'))).toBe(true);
  });
});
