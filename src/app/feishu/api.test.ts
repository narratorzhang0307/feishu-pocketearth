import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestFeishuAuthCode = vi.fn().mockResolvedValue('fresh-auth-code');
vi.mock('./bridge', () => ({ requestFeishuAuthCode }));

describe('Feishu API session recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    requestFeishuAuthCode.mockClear();
    const storage = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      dispatchEvent: vi.fn(),
    });
  });

  it('reauthenticates and retries a Bitable write once after a child WebView loses its session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ appId: 'cli_test', devBypassAuth: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionToken: 'renewed-session', user: { id: 'u1', name: '测试用户' }, expiresAt: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: 1, updated: 0, previousVersion: 'v1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { upsertFeishuLibraryRecords } = await import('./api');

    await expect(upsertFeishuLibraryRecords('books', [{ id: 'book:1' }])).resolves.toMatchObject({ created: 1 });
    expect(requestFeishuAuthCode).toHaveBeenCalledWith('cli_test');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]?.[1]?.headers).toMatchObject({ authorization: 'Bearer renewed-session' });
  });
});
