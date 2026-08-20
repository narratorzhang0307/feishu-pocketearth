import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { evaluateFeishuDeployment } from './preflight.mjs';

const completeEnv = {
  FEISHU_APP_ID: 'cli_test',
  FEISHU_APP_SECRET: 'secret',
  FEISHU_ENCRYPT_KEY: 'encrypt-key',
  FEISHU_VERIFICATION_TOKEN: 'verification-token',
  FEISHU_WEB_BASE_URL: 'https://pocket-earth.test',
  FEISHU_BITABLE_APP_TOKEN: 'base-token',
  FEISHU_BITABLE_TABLE_ID: 'table-id',
  PADDLE_OCR_URL: 'http://paddle-ocr:8010/v1/ocr',
  PADDLE_OCR_API_KEY: 'ocr-key',
  DASHSCOPE_API_KEY: 'qwen-key',
  FEISHU_DEV_BYPASS_AUTH: 'false',
  FEISHU_ALLOW_PREEXTRACTED_OCR: 'false',
  FEISHU_MAX_UPLOAD_BYTES: String(18 * 1024 * 1024),
  OCR_MAX_BYTES: String(18 * 1024 * 1024),
  VITE_MAPBOX_TOKEN: 'public-map-token',
};

describe('Feishu deployment preflight', () => {
  it('passes a complete production configuration without exposing values', () => {
    const result = evaluateFeishuDeployment(completeEnv, '/tmp/pocket-earth');
    expect(result).toMatchObject({ ok: true, summary: { fail: 0, warn: 0 } });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('qwen-key');
  });

  it('fails closed for placeholders, dangerous switches and incompatible upload limits', () => {
    const result = evaluateFeishuDeployment({
      ...completeEnv,
      FEISHU_WEB_BASE_URL: 'https://your-pocket-earth.example.com',
      FEISHU_DEV_BYPASS_AUTH: 'true',
      FEISHU_ALLOW_PREEXTRACTED_OCR: 'true',
      FEISHU_MAX_UPLOAD_BYTES: '20000000',
      OCR_MAX_BYTES: '10000000',
      FEISHU_BITABLE_TABLE_ID: '',
    }, '/tmp/pocket-earth');
    expect(result.ok).toBe(false);
    expect(result.checks.filter((check: { status: string }) => check.status === 'fail').map((check: { id: string }) => check.id))
      .toEqual(expect.arrayContaining(['public_https', 'production_auth', 'real_ocr_only', 'upload_limit', 'bitable']));
  });
});
