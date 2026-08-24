import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataPackDomain, InstalledDataPack } from './types';

const db = vi.hoisted(() => new Map<string, InstalledDataPack>());

vi.mock('./idb', () => ({
  getInstalledPack: vi.fn(async (key: string) => db.get(key) || null),
  putInstalledPack: vi.fn(async (pack: InstalledDataPack) => { db.set(pack.packKey, pack); }),
  deleteInstalledPack: vi.fn(async (key: string) => { db.delete(key); }),
  listInstalledPacks: vi.fn(async (domain?: DataPackDomain) => [...db.values()].filter((pack) => !domain || pack.domain === domain)),
}));

const adapter = {
  books: { schema: 'pocket.books/v1', skill: 'pocket.books' },
  movies: { schema: 'pocket.movies/v1', skill: 'pocket.movies' },
  music: { schema: 'pocket.music/v1', skill: 'pocket.music' },
  mapping: { schema: 'pocket.mapping/v1', skill: 'pocket.mapping' },
} as const;

const bundle = (domain: DataPackDomain) => ({
  protocol: 'pocket-data/v1',
  identity: { id: `earth.pocket.test.${domain}`, name: `${domain} demo`, version: '1.0.0', author: 'Pocket Earth', description: '' },
  schema: { name: adapter[domain].schema, version: '1.0.0', record_count: 0 },
  compatibility: { skills: [adapter[domain].skill], runtime_min: '1.0.0' },
  privacy: 'public',
  provenance: { source: 'unit test', license: 'test-only', generated_at: '2026-08-10T00:00:00.000Z' },
  distribution: { mode: 'inline' },
  records: [],
});

describe('Data Pack demo restore', () => {
  beforeEach(() => {
    vi.resetModules();
    db.clear();
    vi.stubGlobal('location', { href: 'https://feishu-pocketearth.test/feishu' });
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
      clear: () => storage.clear(),
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const domain: DataPackDomain = url.includes('pocket-earth-books') ? 'books' : url.includes('pocket-earth-movies') ? 'movies' : 'music';
      return new Response(JSON.stringify(bundle(domain)), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
  });

  it('unloads one library, then restores all three active libraries and map layers in one action', async () => {
    const registry = await import('./registry');
    const mapLayer = await import('./mapLayer');

    const initial = await registry.restoreDemoDataPacks();
    expect(Object.keys(initial)).toEqual(['books', 'movies', 'music']);
    expect(mapLayer.isDataPackMapLayerEnabled('books')).toBe(true);

    await registry.removeDataPack(initial.books.packKey);
    expect(registry.getDataPackState('books').active).toBeNull();
    expect(mapLayer.isDataPackMapLayerEnabled('books')).toBe(false);

    await registry.restoreDemoDataPacks();
    for (const domain of ['books', 'movies', 'music'] as const) {
      expect(registry.getDataPackState(domain).active?.domain).toBe(domain);
      expect(mapLayer.isDataPackMapLayerEnabled(domain)).toBe(true);
    }
  });

  it('replaces a cached legacy demo pack with the lightweight Feishu default without touching custom packs', async () => {
    const legacyPack = {
      packKey: 'earth.pocket.demo.books@1.0.0',
      domain: 'books',
      manifest: {
        ...bundle('books'),
        identity: { ...bundle('books').identity, id: 'earth.pocket.demo.books' },
      },
      records: [],
      installedAt: '2026-08-10T00:00:00.000Z',
      source: '/data-packs/pocket-earth-books/1.0.0/manifest.json',
    } as InstalledDataPack;
    db.set(legacyPack.packKey, legacyPack);
    localStorage.setItem('pe.dataPacks.active.v1', JSON.stringify({ books: legacyPack.packKey }));

    const registry = await import('./registry');
    const active = await registry.ensureActiveDataPack('books');

    expect(active?.manifest.identity.id).toBe('earth.pocket.test.books');
    expect(active?.source).toContain('/data-packs/feishu-pocket-earth-books/1.0.0/manifest.json');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/data-packs/feishu-pocket-earth-books/1.0.0/manifest.json'), expect.anything());
  });
});
