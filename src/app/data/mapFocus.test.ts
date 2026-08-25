import { afterEach, describe, expect, it, vi } from 'vitest';

const loadFresh = async () => {
  vi.resetModules();
  return import('./mapFocus');
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('map focus bridge', () => {
  it('notifies subscribers and preserves record metadata outside the browser', async () => {
    vi.stubGlobal('window', undefined);
    const focus = await loadFresh();
    const received: unknown[] = [];
    const unsubscribe = focus.subscribeMapFocus((request) => received.push(request));

    focus.requestMapFocus(120.15, 30.27, 7.8, {
      domain: 'books',
      recordId: 'book:1',
      label: '测试藏书票',
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ lng: 120.15, lat: 30.27, zoom: 7.8, domain: 'books', recordId: 'book:1' });
    expect(focus.consumePendingMapFocus()).toMatchObject({ label: '测试藏书票' });
    expect(focus.consumePendingMapFocus()).toBeNull();
    unsubscribe();
  });

  it('stores the request until the lazily mounted map consumes it', async () => {
    const storage = new Map<string, string>();
    const fakeWindow = new EventTarget() as EventTarget & { sessionStorage: Storage };
    fakeWindow.sessionStorage = {
      get length() { return storage.size; },
      clear: () => storage.clear(),
      getItem: (key) => storage.get(key) ?? null,
      key: (index) => [...storage.keys()][index] ?? null,
      removeItem: (key) => { storage.delete(key); },
      setItem: (key, value) => { storage.set(key, value); },
    };
    vi.stubGlobal('window', fakeWindow);
    const focus = await loadFresh();
    const received: unknown[] = [];
    focus.subscribeMapFocus((request) => received.push(request));

    focus.requestMapFocus(-74.19, 10.59, 7.8, { domain: 'books', recordId: 'book:macondo' });
    expect(received).toHaveLength(1);

    // 模拟切换 tab 后地图 chunk 才挂载：清空模块并从 sessionStorage 恢复未消费请求。
    const remounted = await loadFresh();
    expect(remounted.consumePendingMapFocus()).toMatchObject({ lng: -74.19, lat: 10.59, recordId: 'book:macondo' });
    expect(remounted.consumePendingMapFocus()).toBeNull();
  });
});
