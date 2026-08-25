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
    const local = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => local.set(key, value),
      removeItem: (key: string) => local.delete(key),
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

  it('opens only the signed-in user domain table from the local workspace cache', async () => {
    sessionStorage.setItem('pocket-earth.feishu.session-user.v1', 'ou-current-user');
    localStorage.setItem('pocket-earth.feishu.workspace.v1', JSON.stringify({
      ownerOpenId: 'ou-current-user',
      appToken: 'base-personal',
      tables: {
        books: 'tbl-books', movies: 'tbl-movies', music: 'tbl-music', photos: 'tbl-photos',
      },
    }));
    const { cachedFeishuDomainUrl } = await import('./api');

    expect(cachedFeishuDomainUrl('books')).toBe('https://feishu.cn/base/base-personal?table=tbl-books');
    expect(cachedFeishuDomainUrl('movies')).toBe('https://feishu.cn/base/base-personal?table=tbl-movies');
    expect(cachedFeishuDomainUrl('music')).toBe('https://feishu.cn/base/base-personal?table=tbl-music');
    expect(cachedFeishuDomainUrl('photos')).toBe('https://feishu.cn/base/base-personal?table=tbl-photos');
  });

  it('never opens a cached workspace owned by another Feishu account', async () => {
    sessionStorage.setItem('pocket-earth.feishu.session-user.v1', 'ou-current-user');
    localStorage.setItem('pocket-earth.feishu.workspace.v1', JSON.stringify({
      ownerOpenId: 'ou-previous-user', appToken: 'base-previous',
      tables: { books: 'tbl-previous-books' },
    }));
    const { cachedFeishuDomainUrl } = await import('./api');

    expect(cachedFeishuDomainUrl('books')).toBe('');
  });
});
