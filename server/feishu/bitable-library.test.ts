import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { BITABLE_LIBRARY_FIELDS, BITABLE_LIBRARY_STATUS, createBitableLibrary, draftFromBitableItem, fieldsFromLibraryRecord, recordFromBitableItem } from './bitable-library.mjs';

const book = {
  id: 'book-1', title: '小王子', author: '圣埃克苏佩里', country: '法国', type: '小说',
  year: 1943, rating: 9.1, date: '2026-08-23', synopsis: '一颗小行星上的旅行。', locations: [],
};

describe('Feishu Bitable library adapter', () => {
  it('keeps the full Data Pack record in JSON while collaborative columns override it', () => {
    const fields = fieldsFromLibraryRecord('books', book);
    const parsed = recordFromBitableItem('books', {
      record_id: 'rec-1', fields: { ...fields, [BITABLE_LIBRARY_FIELDS.rating]: 9.8, [BITABLE_LIBRARY_FIELDS.title]: '小王子（共读版）' },
    });
    expect(JSON.parse(String(fields[BITABLE_LIBRARY_FIELDS.payload]))).toEqual(book);
    expect(fields[BITABLE_LIBRARY_FIELDS.date]).toBe(Date.parse('2026-08-23T00:00:00Z'));
    expect(parsed).toMatchObject({ recordId: 'rec-1', record: { id: 'book-1', title: '小王子（共读版）', rating: 9.8, locations: [] } });
    expect(parsed.record.date).toBe('2026-08-23');
  });

  it('isolates invalid rows and exposes a deterministic version for valid records', async () => {
    const client = {
      listBitableRecords: async () => [
        { record_id: 'rec-1', fields: fieldsFromLibraryRecord('books', book) },
        { record_id: 'rec-bad', fields: { [BITABLE_LIBRARY_FIELDS.id]: 'bad', [BITABLE_LIBRARY_FIELDS.status]: BITABLE_LIBRARY_STATUS.confirmed, [BITABLE_LIBRARY_FIELDS.payload]: '{broken' } },
      ],
      createBitableRecords: async () => ({}), updateBitableRecords: async () => ({}),
    };
    const library = createBitableLibrary({ client, config: { bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books' } } });
    const first = await library.readDomain('books');
    const second = await library.readDomain('books');
    expect(first.records).toEqual([book]);
    expect(first.rejected).toEqual([{ recordId: 'rec-bad', error: 'bitable_payload_json_invalid' }]);
    expect(second.version).toBe(first.version);
  });

  it('restores a persisted snapshot immediately after a server restart', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-bitable-cache-'));
    let calls = 0;
    const config = { dataDir, bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books' } };
    const writer = createBitableLibrary({
      client: {
        listBitableRecords: async () => { calls += 1; return [{ record_id: 'rec-1', fields: fieldsFromLibraryRecord('books', book) }]; },
        createBitableRecords: async () => ({}), updateBitableRecords: async () => ({}),
      },
      config,
    });
    expect((await writer.readDomain('books')).records).toEqual([book]);

    const restarted = createBitableLibrary({
      client: {
        listBitableRecords: async () => { calls += 1; throw new Error('remote_should_not_block_warm_start'); },
        createBitableRecords: async () => ({}), updateBitableRecords: async () => ({}),
      },
      config,
    });
    expect((await restarted.readDomain('books')).records).toEqual([book]);
    expect(calls).toBe(1);
  });

  it('upserts by Pocket ID instead of creating duplicates', async () => {
    const calls: Array<{ kind: string; records: unknown[]; table: string }> = [];
    const client = {
      listBitableRecords: async () => [{ record_id: 'rec-1', fields: fieldsFromLibraryRecord('books', book) }],
      createBitableRecords: async (records: unknown[], table: string) => { calls.push({ kind: 'create', records, table }); },
      updateBitableRecords: async (records: unknown[], table: string) => { calls.push({ kind: 'update', records, table }); },
    };
    const library = createBitableLibrary({ client, config: { bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books' } } });
    await library.upsert('books', [{ ...book, rating: 9.9 }, { ...book, id: 'book-2', title: '夜航' }]);
    expect(calls.map(({ kind, table }) => ({ kind, table }))).toEqual([
      { kind: 'create', table: 'tbl-books' }, { kind: 'update', table: 'tbl-books' },
    ]);
    expect(calls[1].records[0]).toMatchObject({ record_id: 'rec-1', fields: { 评分: 9.9 } });
  });

  it('never writes local photo bytes or blob URLs into Feishu Bitable payloads', () => {
    const fields = fieldsFromLibraryRecord('photos', {
      id: 'photo:hash-1', title: '西湖留影', city: '杭州', date: '2026-08-23', lat: 30.27, lng: 120.15,
      thumb: 'data:image/jpeg;base64,private-bytes', full: 'blob:local-photo', image: 'data:image/png;base64,private-image',
      qwen: { summary: '值得保留', preview: 'file:///private/photo.jpg' },
    });
    const payload = String(fields[BITABLE_LIBRARY_FIELDS.payload]);
    expect(payload).not.toContain('private-bytes');
    expect(payload).not.toContain('private-image');
    expect(payload).not.toContain('blob:');
    expect(payload).not.toContain('file:');
    expect(JSON.parse(payload)).toMatchObject({ id: 'photo:hash-1', thumb: '', full: '', qwen: { summary: '值得保留', preview: '' } });
  });

  it('keeps unconfirmed rows off Earth and turns a pending book into a reviewable Qwen result', async () => {
    const pendingItem = {
      record_id: 'rec-pending', fields: {
        [BITABLE_LIBRARY_FIELDS.title]: '夜航',
        [BITABLE_LIBRARY_FIELDS.author]: '圣埃克苏佩里',
        [BITABLE_LIBRARY_FIELDS.country]: '法国',
        [BITABLE_LIBRARY_FIELDS.status]: BITABLE_LIBRARY_STATUS.pending,
      },
    };
    const updates: any[] = [];
    const client = {
      listBitableRecords: async () => [pendingItem],
      createBitableRecords: async () => ({}),
      updateBitableRecords: async (records: unknown[], table: string) => { updates.push({ records, table }); },
    };
    const library = createBitableLibrary({ client, config: { bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books' } } });

    const before = await library.readDomain('books');
    expect(before).toMatchObject({ records: [], rejected: [], pending: [{ recordId: 'rec-pending', status: '待分析' }] });
    expect(draftFromBitableItem('books', pendingItem)).toMatchObject({ record: { id: 'book:feishu:rec-pending', title: '夜航' } });

    const processed = await library.processPending('books', async ({ sourceText }: { sourceText: string }) => {
      expect(sourceText).toContain('标题：夜航');
      return { model: 'qwen-test', locations: [{ modernName: '巴黎', longitude: 2.35, latitude: 48.85, confidence: 0.9, evidence: '法国', description: '作者与作品的地理背景' }] };
    });

    expect(processed).toMatchObject({ processed: 1, failed: 0 });
    expect(updates[0]).toMatchObject({ table: 'tbl-books', records: [{ record_id: 'rec-pending', fields: { 审核状态: '分析中' } }] });
    expect(updates[1].records[0]).toMatchObject({ record_id: 'rec-pending', fields: { 'Pocket ID': 'book:feishu:rec-pending', 审核状态: '待确认', 来源: '飞书多维表格 · qwen-test' } });
    const payload = JSON.parse(updates[1].records[0].fields['数据 JSON']);
    expect(payload.locations).toEqual([{ kind: 'story', place: '巴黎', lng: 2.35, lat: 48.85, confidence: 0.9 }]);
  });

  it('creates the four knowledge tables and their collaborative fields in one action', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-schema-'));
    const createdTables: string[] = [];
    const createdFields: Array<{ tableId: string; fieldName: string; type: number }> = [];
    const config: any = { dataDir, bitableAppToken: '', bitableLibraryTables: {} };
    const client = {
      createBitableApp: async () => ({ appToken: 'base-created' }),
      listBitableTables: async () => [],
      createBitableTable: async (name: string) => { createdTables.push(name); return { tableId: `tbl-${createdTables.length}` }; },
      listBitableFields: async () => [],
      createBitableField: async (tableId: string, fieldName: string, type: number) => { createdFields.push({ tableId, fieldName, type }); },
      listBitableRecords: async () => [],
      createBitableRecords: async () => ({}),
      updateBitableRecords: async () => ({}),
    };
    const library = createBitableLibrary({ client, config });

    const result = await library.ensureSchema();

    expect(result).toMatchObject({
      appToken: 'base-created', createdApp: true,
      createdTables: ['books', 'movies', 'music', 'photos'],
      tables: {
        books: { tableId: 'tbl-1', name: 'Pocket Earth · 书籍' },
        photos: { tableId: 'tbl-4', name: 'Pocket Earth · 照片' },
      },
    });
    expect(createdTables).toEqual(['Pocket Earth · 书籍', 'Pocket Earth · 电影', 'Pocket Earth · 音乐', 'Pocket Earth · 照片']);
    expect(createdFields.some((field) => field.fieldName === '审核状态')).toBe(true);
    expect(createdFields.some((field) => field.fieldName === '数据 JSON')).toBe(true);
    expect(config.bitableLibraryTables).toEqual({ books: 'tbl-1', movies: 'tbl-2', music: 'tbl-3', photos: 'tbl-4' });
  });
});
