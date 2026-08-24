import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateBookRecord } from '../lib/dataPack';
import { compactFeishuRuntimeRecords, enableFeishuBuiltinMapLayersOnce, libraryRecordFromUserMark, photoAssetFromFeishuRecord, setFeishuLibraryDomainEnabled } from './librarySync';

describe('Feishu photo library projection', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
  });

  it('projects approved HTTPS metadata without retaining local original bytes', () => {
    const asset = photoAssetFromFeishuRecord({
      id: 'photo-1', city: '杭州', date: '2026-08-23', lat: 30.27, lng: 120.15,
      thumb: 'https://example.com/thumb.jpg', full: 'data:image/jpeg;base64,private',
    }, 123);
    expect(asset).toMatchObject({
      key: 'feishu:photo-1', source: 'web-picker', access: 'selected', thumbnailUrl: 'https://example.com/thumb.jpg',
      latitude: 30.27, longitude: 120.15, indexedAt: 123, curated: true,
    });
    expect(JSON.stringify(asset)).not.toContain('private');
  });

  it('uses the same stable photo id for Earth pins and curated Bitable upserts', () => {
    const mapped = libraryRecordFromUserMark({
      id: 'photo-pin-instance', kind: 'photo', label: '西湖', lat: 30.27, lng: 120.15, createdAt: '2026-08-23T00:00:00.000Z',
      meta: { contentHash: 'abc123', assetKey: 'web:1' },
    });
    expect(mapped).toMatchObject({ domain: 'photos', record: { id: 'photo:abc123', contentHash: 'abc123' } });
  });

  it('maps a confirmed book mark back into the original Data Pack shape', () => {
    const mapped = libraryRecordFromUserMark({
      id: 'ubk-night-flight', kind: 'book', label: '夜航', lat: 48.85, lng: 2.35, createdAt: '2026-08-23T00:00:00.000Z',
      meta: { author: '圣埃克苏佩里', country: '法国', genre: '小说', year: 1931, rating: 5, place: '巴黎' },
    });
    expect(mapped).toMatchObject({ domain: 'books', record: { id: 'ubk-night-flight', title: '夜航', author: '圣埃克苏佩里', locations: [{ kind: 'story', place: '巴黎' }] } });
  });

  it('places enabled built-in libraries on Earth once without overriding a personal slot', () => {
    localStorage.setItem('pocket-earth.feishu.library-sources.v1:anonymous', JSON.stringify({ books: 'personal' }));
    enableFeishuBuiltinMapLayersOnce();
    expect(JSON.parse(localStorage.getItem('pe.dataPacks.mapLayers.v1') || '{}')).toEqual({ movies: true, music: true });
    expect(localStorage.getItem('pocket-earth.feishu.default-map-layers.v1:anonymous')).toBe('1');
  });

  it('keeps a Feishu music row as one lightweight runtime item without mutating the source row', () => {
    const source = [{ id: 'music-city:test', tracks: [{ id: 'a' }, { id: 'b' }], podcast: [{ id: 'p' }], aiInstruction: '整理杭州音乐', note: '飞书协作备注' }];
    const compact = compactFeishuRuntimeRecords('music', source) as Array<{ tracks: unknown[]; podcast: unknown[]; aiInstruction?: string; note?: string }>;
    expect(compact[0].tracks).toEqual([{ id: 'a' }]);
    expect(compact[0].podcast).toEqual([]);
    expect(compact[0].aiInstruction).toBeUndefined();
    expect(compact[0].note).toBeUndefined();
    expect(source[0].tracks).toHaveLength(2);
    expect(source[0].podcast).toHaveLength(1);
  });

  it('removes Feishu collaboration-only fields before strict book Data Pack validation', () => {
    const [book] = compactFeishuRuntimeRecords('books', [{
      id: 'book:city-and-dogs', title: '城市与狗', author: '马里奥·巴尔加斯·略萨', country: '秘鲁',
      type: '小说', year: 1963, rating: null, date: '2026-08-24', synopsis: '利马的军校故事', locations: [],
      aiInstruction: '用 AI 记录《城市与狗》', note: '我很喜欢',
    }]) as Array<Record<string, unknown>>;
    expect(book).not.toHaveProperty('aiInstruction');
    expect(book).not.toHaveProperty('note');
    expect(book).toMatchObject({ title: '城市与狗', author: '马里奥·巴尔加斯·略萨', country: '秘鲁' });
    expect(() => validateBookRecord(book)).not.toThrow();
  });

  it('can switch a sample slot back to its Feishu table source before syncing confirmed rows', async () => {
    localStorage.setItem('pocket-earth.feishu.library-sources.v1:anonymous', JSON.stringify({ books: 'personal' }));
    await setFeishuLibraryDomainEnabled('books', true);
    expect(JSON.parse(localStorage.getItem('pocket-earth.feishu.library-sources.v1:anonymous') || '{}')).toEqual({ books: 'feishu' });
  });
});
