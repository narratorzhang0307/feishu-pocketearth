import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestFeishuAuthCode } from './bridge';

describe('Feishu web app bridge', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests an auth code with the Feishu appId contract', async () => {
    const requestAuthCode = vi.fn((options: {
      appId: string;
      success: (result: { code: string }) => void;
    }) => options.success({ code: 'temporary-code' }));

    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      h5sdk: { ready: (callback: () => void) => callback() },
      tt: { requestAuthCode },
    });

    await expect(requestFeishuAuthCode('cli_test')).resolves.toBe('temporary-code');
    expect(requestAuthCode).toHaveBeenCalledWith(expect.objectContaining({ appId: 'cli_test' }));
    expect(requestAuthCode.mock.calls[0]?.[0]).not.toHaveProperty('appID');
    expect(requestAuthCode.mock.calls[0]?.[0]).not.toHaveProperty('scopeList');
  });

  it('fails clearly when the auth-code API is unavailable', async () => {
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      h5sdk: { ready: (callback: () => void) => callback() },
      tt: {},
    });

    await expect(requestFeishuAuthCode('cli_test')).rejects.toThrow('feishu_request_auth_code_unavailable');
  });
});
