import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { BITABLE_LIBRARY_FIELDS, BITABLE_LIBRARY_STATUS, createBitableLibrary, draftFromBitableItem, fieldsFromLibraryRecord, libraryRecordIdentity, recordFromBitableItem } from './bitable-library.mjs';

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
    expect(fields[BITABLE_LIBRARY_FIELDS.date]).toBe('2026-08-23');
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

  it('warns Frost about an existing same-title record without creating or overwriting it', async () => {
    const calls: string[] = [];
    const client = {
      listBitableRecords: async () => [{ record_id: 'rec-1', fields: fieldsFromLibraryRecord('books', book) }],
      createBitableRecords: async () => { calls.push('create'); },
      updateBitableRecords: async () => { calls.push('update'); },
      deleteBitableRecords: async () => ({ deleted: 0 }),
    };
    const library = createBitableLibrary({ client, config: { bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books' } } });
    const result = await library.upsert('books', [{ ...book, id: 'book:frost:same-title', rating: 1 }], { duplicatePolicy: 'warn' });
    expect(result).toMatchObject({ created: 0, updated: 0, alreadyExists: [{ pocketId: 'book:frost:same-title', title: '小王子' }] });
    expect(calls).toEqual([]);
  });

  it('defines independent duplicate identities for books, movies, music and photos', () => {
    expect(libraryRecordIdentity('books', { id: 'book-1', title: '《酒吧长谈》' }))
      .toBe(libraryRecordIdentity('books', { id: 'book-2', title: ' 酒吧长谈 ' }));
    expect(libraryRecordIdentity('movies', { id: 'movie-1', title: '《酒吧长谈》' }))
      .toBe(libraryRecordIdentity('movies', { id: 'movie-2', title: '酒吧长谈' }));
    expect(libraryRecordIdentity('music', { id: 'music-1', tracks: [{ title: 'Heroes', artist: 'David Bowie' }] }))
      .toBe(libraryRecordIdentity('music', { id: 'music-2', tracks: [{ title: ' heroes ', artist: 'DAVID BOWIE' }] }));
    expect(libraryRecordIdentity('photos', { id: 'photo-1', title: '西湖雨夜', city: '杭州', date: '2026-08-25' }))
      .toBe(libraryRecordIdentity('photos', { id: 'photo-2', title: '《西湖雨夜》', city: '杭州', date: '2026-08-25' }));
    expect(libraryRecordIdentity('books', { title: '酒吧长谈' })).not
      .toBe(libraryRecordIdentity('movies', { title: '酒吧长谈' }));
  });

  it('returns one record and removes historical duplicate rows during sync', async () => {
    const deleted: string[][] = [];
    const rows = [
      { record_id: 'rec-first', fields: fieldsFromLibraryRecord('books', { ...book, id: 'book:first', title: '酒吧长谈' }) },
      { record_id: 'rec-second', fields: fieldsFromLibraryRecord('books', { ...book, id: 'book:second', title: '《酒吧长谈》' }) },
      { record_id: 'rec-third', fields: fieldsFromLibraryRecord('books', { ...book, id: 'book:third', title: ' 酒吧长谈 ' }) },
    ];
    const client = {
      listBitableRecords: async () => rows,
      createBitableRecords: async () => ({}),
      updateBitableRecords: async () => ({}),
      deleteBitableRecords: async (recordIds: string[]) => { deleted.push(recordIds); return { deleted: recordIds.length }; },
    };
    const library = createBitableLibrary({ client, config: { bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books' } } });

    const result = await library.readDomain('books', { force: true });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ id: 'book:first', title: '酒吧长谈' });
    expect(deleted).toEqual([['rec-second', 'rec-third']]);
  });

  it('detects a repeated Frost submission even while the first row is still pending AI analysis', async () => {
    const pendingFields = fieldsFromLibraryRecord('books', { ...book, id: 'book:frost:stable' }, { status: BITABLE_LIBRARY_STATUS.pending });
    const client = {
      listBitableRecords: async () => [{ record_id: 'rec-pending', fields: pendingFields }],
      createBitableRecords: async () => { throw new Error('must_not_create_duplicate'); },
      updateBitableRecords: async () => { throw new Error('must_not_overwrite_existing'); },
      deleteBitableRecords: async () => ({ deleted: 0 }),
    };
    const library = createBitableLibrary({ client, config: { bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books' } } });
    const result = await library.upsert('books', [{ ...book, id: 'book:frost:stable' }], { duplicatePolicy: 'warn' });
    expect(result).toMatchObject({ created: 0, updated: 0, alreadyExists: [{ title: '小王子' }] });
  });

  it('creates only one row when a single request repeats the same normalized title', async () => {
    const created: unknown[] = [];
    const client = {
      listBitableRecords: async () => [],
      createBitableRecords: async (records: unknown[]) => { created.push(...records); },
      updateBitableRecords: async () => { throw new Error('must_not_update'); },
      deleteBitableRecords: async () => ({ deleted: 0 }),
    };
    const library = createBitableLibrary({ client, config: { bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books' } } });
    const result = await library.upsert('books', [
      { ...book, id: 'book:frost:first', title: '《酒吧长谈》' },
      { ...book, id: 'book:frost:second', title: ' 酒吧长谈 ' },
    ], { duplicatePolicy: 'warn' });

    expect(result).toMatchObject({ created: 1, updated: 0, alreadyExists: [{ pocketId: 'book:frost:second' }] });
    expect(created).toHaveLength(1);
  });

  it('serializes concurrent same-title writes so the second request observes the first', async () => {
    const rows: any[] = [];
    let sequence = 0;
    const client = {
      listBitableRecords: async () => [...rows],
      createBitableRecords: async (records: any[]) => {
        await Promise.resolve();
        rows.push(...records.map((fields) => ({ record_id: `rec-${++sequence}`, fields })));
      },
      updateBitableRecords: async () => { throw new Error('must_not_update'); },
      deleteBitableRecords: async () => ({ deleted: 0 }),
    };
    const library = createBitableLibrary({ client, config: { bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books' } } });
    const first = { ...book, id: 'book:frost:concurrent', title: '酒吧长谈' };
    const [one, two] = await Promise.all([
      library.upsert('books', [first], { duplicatePolicy: 'warn' }),
      library.upsert('books', [{ ...first, id: 'book:frost:concurrent-duplicate' }], { duplicatePolicy: 'warn' }),
    ]);

    expect(one).toMatchObject({ created: 1, updated: 0 });
    expect(two).toMatchObject({ created: 0, updated: 0, alreadyExists: [{ title: '酒吧长谈' }] });
    expect(rows).toHaveLength(1);
  });

  it('routes movie writes only to the movie table and never falls back to books', async () => {
    const calls: Array<{ kind: string; table: string }> = [];
    const client = {
      listBitableRecords: async (table: string) => {
        expect(table).toBe('tbl-movies');
        return [];
      },
      createBitableRecords: async (_records: unknown[], table: string) => { calls.push({ kind: 'create', table }); },
      updateBitableRecords: async (_records: unknown[], table: string) => { calls.push({ kind: 'update', table }); },
    };
    const library = createBitableLibrary({ client, config: {
      bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books', movies: 'tbl-movies' },
    } });
    await library.upsert('movies', [{
      id: 'movie:frost:bar-talk', title: '酒吧长谈', original: '', type: '电影', director: '', country: '', year: null,
      rating: null, date: '2026-08-25', synopsis: '很喜欢', locations: [],
    }]);
    expect(calls).toEqual([{ kind: 'create', table: 'tbl-movies' }]);
  });

  it('routes every Skill through its own table and writes its own Schema contract', async () => {
    const calls: Array<{ table: string; fields: Record<string, unknown> }> = [];
    const tables = { books: 'tbl-books', movies: 'tbl-movies', music: 'tbl-music', photos: 'tbl-photos' };
    const client = {
      listBitableRecords: async () => [],
      createBitableRecords: async (records: Array<Record<string, unknown>>, table: string) => {
        calls.push(...records.map((fields) => ({ table, fields })));
      },
      updateBitableRecords: async () => { throw new Error('must_not_update_new_record'); },
      deleteBitableRecords: async () => ({ deleted: 0 }),
    };
    const library = createBitableLibrary({ client, config: { bitableAppToken: 'app-personal', bitableLibraryTables: tables } });
    const records = {
      books: book,
      movies: {
        id: 'movie-1', title: '花样年华', original: '', type: '剧情', director: '王家卫', country: '中国香港',
        year: 2000, rating: 5, publicRating: null, date: '2026-08-25', synopsis: '电影记录', locations: [],
      },
      music: {
        id: 'music-1', slug: 'heroes-berlin', cityName: 'Berlin', cityNameZh: '柏林', ianaTz: null, tzOffset: 1,
        station: { freq: 0, name: 'Pocket Earth' }, cover: '', lat: 52.52, lng: 13.405, description: '城市声音',
        tracks: [{ id: 'track-1', title: 'Heroes', artist: 'David Bowie', genre: 'Rock', durationSec: null, playback: { provider: 'none', url: '' }, introText: '', introPlayback: { provider: 'none', url: '' } }],
        podcast: [],
      },
      photos: {
        id: 'photo-1', title: '西湖雨夜', city: '杭州', date: '2026-08-25', lat: 30.27, lng: 120.15,
        thumbnailUrl: '', contentHash: 'sha256-photo-1', summary: '照片记录',
      },
    } as const;

    for (const domain of ['books', 'movies', 'music', 'photos'] as const) {
      await library.upsert(domain, [records[domain]], { duplicatePolicy: 'warn' });
    }

    expect(calls.map(({ table, fields }) => ({ table, schema: fields.Schema }))).toEqual([
      { table: 'tbl-books', schema: 'pocket.books/v1' },
      { table: 'tbl-movies', schema: 'pocket.movies/v1' },
      { table: 'tbl-music', schema: 'pocket.music/v1' },
      { table: 'tbl-photos', schema: 'pocket.photos/v1' },
    ]);
    expect(new Set(calls.map(({ table }) => table)).size).toBe(4);
  });

  it('collapses legacy duplicate titles during upsert and supports explicit deletion', async () => {
    const legacy = { ...book, id: 'book:legacy:random-1', title: '酒吧长谈' };
    const duplicate = { ...book, id: 'book:legacy:random-2', title: '酒吧长谈' };
    const deleted: string[][] = [];
    const updated: any[] = [];
    const client = {
      listBitableRecords: async () => [
        { record_id: 'rec-first', fields: fieldsFromLibraryRecord('books', legacy) },
        { record_id: 'rec-duplicate', fields: fieldsFromLibraryRecord('books', duplicate) },
      ],
      createBitableRecords: async () => ({}),
      updateBitableRecords: async (records: unknown[]) => { updated.push(...records as any[]); },
      deleteBitableRecords: async (recordIds: string[]) => { deleted.push(recordIds); return { deleted: recordIds.length }; },
    };
    const library = createBitableLibrary({ client, config: { bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books' } } });
    const stable = { ...book, id: 'book:frost:stable', title: '酒吧长谈', rating: 5 };

    expect(await library.upsert('books', [stable])).toMatchObject({ created: 0, updated: 1 });
    expect(updated[0]).toMatchObject({ record_id: 'rec-first', fields: { 'Pocket ID': 'book:frost:stable' } });
    expect(deleted).toEqual([['rec-duplicate']]);

    await library.readDomain('books', { force: true });
    expect(await library.remove('books', ['book:legacy:random-1'])).toEqual({ deleted: 1 });
    expect(deleted.at(-1)).toEqual(['rec-first']);
  });

  it('rejects a configuration that shares one Feishu table across domains', () => {
    expect(() => createBitableLibrary({
      client: {}, config: { bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-shared', movies: 'tbl-shared' } },
    })).toThrow('bitable_library_table_id_shared:books:movies');
  });

  it('never writes local photo bytes or blob URLs into Feishu Bitable payloads', () => {
    const fields = fieldsFromLibraryRecord('photos', {
      id: 'photo:hash-1', title: '西湖留影', city: '杭州', date: '2026-08-23', lat: 30.27, lng: 120.15,
      thumb: 'data:image/jpeg;base64,private-bytes', full: 'blob:local-photo', image: 'data:image/png;base64,private-image',
      assetKey: 'device-private-token', qwen: { summary: '值得保留', preview: 'file:///private/photo.jpg' },
    });
    const payload = String(fields[BITABLE_LIBRARY_FIELDS.payload]);
    expect(payload).not.toContain('private-bytes');
    expect(payload).not.toContain('private-image');
    expect(payload).not.toContain('blob:');
    expect(payload).not.toContain('file:');
    expect(payload).not.toContain('device-private-token');
    expect(JSON.parse(payload)).toMatchObject({ id: 'photo:hash-1', thumb: '', qwen: { summary: '值得保留', preview: '' } });
    expect(JSON.parse(payload)).not.toHaveProperty('full');
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

  it('lets an AI instruction fill a Bitable row but stops at human review', async () => {
    const pendingItem = {
      record_id: 'rec-ai', fields: {
        [BITABLE_LIBRARY_FIELDS.instruction]: '帮我记录一条《百年孤独》的笔记，我很喜欢',
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

    const processed = await library.processPending('books', async () => { throw new Error('legacy_analyzer_should_not_run'); }, {
      analyzeInstruction: async ({ instruction, recordId }: { instruction: string; recordId: string }) => ({
        model: 'qwen-test',
        record: { ...book, id: `book:feishu-ai:${recordId}`, title: '百年孤独', note: '我很喜欢', aiInstruction: instruction },
      }),
    });

    expect(processed).toMatchObject({ processed: 1, failed: 0, results: [{ recordId: 'rec-ai', ok: true, instruction: true }] });
    expect(updates[0].records[0]).toMatchObject({ record_id: 'rec-ai', fields: { 审核状态: '分析中' } });
    expect(updates[1].records[0]).toMatchObject({ record_id: 'rec-ai', fields: {
      标题: '百年孤独', '我的笔记': '我很喜欢', 'AI 指令': '帮我记录一条《百年孤独》的笔记，我很喜欢', 审核状态: '待确认',
    } });
  });

  it('keeps the original Pocket ID when AI enriches a pending row', async () => {
    const pendingItem = {
      record_id: 'rec-ai-stable', fields: {
        [BITABLE_LIBRARY_FIELDS.id]: 'book:frost:stable-bar-talk',
        [BITABLE_LIBRARY_FIELDS.instruction]: '用 AI 记录《酒吧长谈》，我很喜欢',
        [BITABLE_LIBRARY_FIELDS.status]: BITABLE_LIBRARY_STATUS.pending,
      },
    };
    const updates: any[] = [];
    const client = {
      listBitableRecords: async () => [pendingItem],
      createBitableRecords: async () => ({}),
      updateBitableRecords: async (records: unknown[]) => { updates.push(...records as any[]); },
      deleteBitableRecords: async () => ({ deleted: 0 }),
    };
    const library = createBitableLibrary({ client, config: { bitableAppToken: 'app', bitableLibraryTables: { books: 'tbl-books' } } });

    await library.processPending('books', async () => ({}), {
      analyzeInstruction: async () => ({ model: 'ai-test', record: { ...book, id: 'book:ai:replacement', title: '酒吧长谈' } }),
    });

    expect(updates.at(-1)).toMatchObject({ fields: { 'Pocket ID': 'book:frost:stable-bar-talk', 标题: '酒吧长谈', 审核状态: '待确认' } });
  });

  it('creates the four knowledge tables and their collaborative fields in one action', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-schema-'));
    const createdTables: string[] = [];
    const createdFields: Array<{ tableId: string; fieldName: string; type: number }> = [];
    const documentCalls: Array<{ kind: string; token: string; value: unknown }> = [];
    const config: any = { dataDir, bitableAppToken: '', bitableLibraryTables: {} };
    const client = {
      createBitableApp: async () => ({ appToken: 'base-created' }),
      listBitableTables: async () => [],
      createBitableTable: async (name: string) => { createdTables.push(name); return { tableId: `tbl-${createdTables.length}` }; },
      listBitableFields: async () => [],
      createBitableField: async (tableId: string, fieldName: string, type: number) => { createdFields.push({ tableId, fieldName, type }); },
      createDocument: async (title: string, token: string) => {
        documentCalls.push({ kind: 'create', token, value: title });
        return { documentId: 'doc-guide', url: 'https://feishu.cn/docx/doc-guide' };
      },
      appendDocumentBlocks: async (documentId: string, blocks: unknown[], token: string) => {
        documentCalls.push({ kind: 'append', token, value: { documentId, blocks } });
      },
      listBitableRecords: async () => [],
      createBitableRecords: async () => ({}),
      updateBitableRecords: async () => ({}),
    };
    const library = createBitableLibrary({ client, config });

    const result = await library.ensureSchema({ userAccessToken: 'user-token' });

    expect(result).toMatchObject({
      appToken: 'base-created', createdApp: true,
      createdTables: ['books', 'movies', 'music', 'photos'],
      tables: {
        books: { tableId: 'tbl-1', name: 'Pocket Earth · 书籍' },
        photos: { tableId: 'tbl-4', name: 'Pocket Earth · 照片' },
      },
      guideDocument: { documentId: 'doc-guide', url: 'https://feishu.cn/docx/doc-guide' },
    });
    expect(createdTables).toEqual(['Pocket Earth · 书籍', 'Pocket Earth · 电影', 'Pocket Earth · 音乐', 'Pocket Earth · 照片']);
    expect(createdFields.some((field) => field.fieldName === '审核状态')).toBe(true);
    expect(createdFields.some((field) => field.fieldName === '数据 JSON')).toBe(true);
    expect(config.bitableLibraryTables).toEqual({ books: 'tbl-1', movies: 'tbl-2', music: 'tbl-3', photos: 'tbl-4' });
    expect(documentCalls).toHaveLength(2);
    expect(documentCalls.every((call) => call.token === 'user-token')).toBe(true);
  });
});
