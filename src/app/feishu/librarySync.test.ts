import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateBookRecord, validatePhotoRecord } from '../lib/dataPack';
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
    expect(mapped).toMatchObject({ domain: 'photos', record: { id: 'photo:abc123', contentHash: 'abc123', thumbnailUrl: '', summary: '' } });
    expect(mapped?.record).not.toHaveProperty('assetKey');
  });

  it('projects Feishu photos into the strict pocket.photos/v1 Data Pack shape', () => {
    const [photo] = compactFeishuRuntimeRecords('photos', [{
      id: 'photo:abc123', title: '西湖雨夜', city: '杭州', date: '2026-08-25', lat: 30.25, lng: 120.15,
      thumb: 'https://example.com/west-lake.jpg', contentHash: 'abc123', qwen: { summary: '低照度叙事' },
      assetKey: 'device-private-token', aiInstruction: '整理这张照片', note: '私人备注',
    }]) as Array<Record<string, unknown>>;

    expect(photo).toEqual({
      id: 'photo:abc123', title: '西湖雨夜', city: '杭州', date: '2026-08-25', lat: 30.25, lng: 120.15,
      thumbnailUrl: 'https://example.com/west-lake.jpg', contentHash: 'abc123', summary: '低照度叙事',
    });
    expect(() => validatePhotoRecord(photo)).not.toThrow();
    expect(JSON.stringify(photo)).not.toContain('device-private-token');
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
      id: 'book:old-man-and-sea', title: '老人与海', author: '海明威', country: '美国',
      type: '小说', year: 1952, rating: null, date: '2026-08-24', synopsis: '古巴近海的故事', locations: [],
      aiInstruction: '用 AI 记录《老人与海》', note: '我很喜欢',
    }]) as Array<Record<string, unknown>>;
    expect(book).not.toHaveProperty('aiInstruction');
    expect(book).not.toHaveProperty('note');
    expect(book).toMatchObject({ title: '老人与海', author: '海明威', country: '美国' });
    expect(() => validateBookRecord(book)).not.toThrow();
  });

  it('keeps newly confirmed books even when an older demo used the same title', () => {
    const compact = compactFeishuRuntimeRecords('books', [
      { id: 'book:feishu-ai:new', title: '酒吧长谈', author: '马里奥·巴尔加斯·略萨', country: '秘鲁', type: '小说', year: 1969, rating: null, date: '2026-08-25', synopsis: '新确认记录', locations: [] },
    ]) as Array<Record<string, unknown>>;
    expect(compact.map((record) => record.title)).toEqual(['酒吧长谈']);
    expect(() => validateBookRecord(compact[0])).not.toThrow();
  });

  it('can switch a sample slot back to its Feishu table source before syncing confirmed rows', async () => {
    localStorage.setItem('pocket-earth.feishu.library-sources.v1:anonymous', JSON.stringify({ books: 'personal' }));
    await setFeishuLibraryDomainEnabled('books', true);
    expect(JSON.parse(localStorage.getItem('pocket-earth.feishu.library-sources.v1:anonymous') || '{}')).toEqual({ books: 'feishu' });
  });
});
