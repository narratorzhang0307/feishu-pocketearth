import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { publicFeishuConfig } from './config.mjs';

describe('public Feishu config', () => {
  it('exposes the Bitable page URL without exposing credentials', () => {
    const result = publicFeishuConfig({
      appId: 'cli-test', appSecret: 'secret', bitableAppToken: 'base-token',
      bitableTableId: '', bitableLibraryTables: { books: 'tbl-books' },
      devBypassAuth: false, maxUploadBytes: 1024, paddleOcrUrl: '', qwenConfigured: true,
    });
    expect(result.bitableAppUrl).toBe('https://feishu.cn/base/base-token');
    expect(result).not.toHaveProperty('appSecret');
  });
});
