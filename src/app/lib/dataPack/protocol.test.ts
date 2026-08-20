import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDataPackFileUrl, safeDataPackUrl, sha256Hex, validateDataPackDocument } from './protocol';

const base = {
  protocol: 'pocket-data/v1',
  identity: { id: 'com.example.books', name: 'Example Books', version: '1.0.0', author: 'Example', description: '' },
  schema: { name: 'pocket.books/v1', version: '1.0.0', record_count: 1 },
  compatibility: { skills: ['pocket.books'], runtime_min: '1.0.0' },
  privacy: 'private',
  provenance: { source: 'unit test', license: 'private-use', generated_at: '2026-08-10T00:00:00.000Z' },
  distribution: { mode: 'inline' },
  records: [{ id: 'book:1', title: '测试书', author: '', country: '', type: '', year: null, rating: null, date: '', synopsis: '' }],
};

const music = {
  ...base,
  identity: { ...base.identity, id: 'com.example.music', name: 'Example Music' },
  schema: { name: 'pocket.music/v1', version: '1.0.0', record_count: 1 },
  compatibility: { skills: ['pocket.music'], runtime_min: '1.0.0' },
  records: [{
    id: 'music-city:hangzhou', slug: 'hangzhou', cityName: 'Hangzhou', cityNameZh: '杭州',
    ianaTz: 'Asia/Shanghai', tzOffset: 8, station: { freq: 88.8, name: 'FROST FM' },
    cover: 'https://example.com/hangzhou.jpg', lat: 30.27, lng: 120.15, description: '',
    tracks: [{
      id: 'music-track:hangzhou:1', title: '测试曲目', artist: '测试歌手', genre: '独立', durationSec: 180,
      playback: { provider: 'oss', url: 'https://example.com/track.m4a' }, introText: '',
      introPlayback: { provider: 'none', url: '' },
    }],
    podcast: [],
  }],
};

const mapping = {
  ...base,
  identity: { ...base.identity, id: 'com.example.mapping', name: 'Example Mapping' },
  schema: { name: 'pocket.mapping/v1', version: '1.0.0', record_count: 1 },
  compatibility: { skills: ['pocket.mapping'], runtime_min: '1.0.0' },
  records: [{
    id: 'mapping:1', title: '测试游记', author: '作者', era: '现代', city: '杭州', sourceName: 'test.txt', sourceSha256: 'a'.repeat(64), summary: '',
    locations: [{ id: 'place:1', name: '西湖', status: 'extant', relation: 'scene', page: 1, quote: '我在西湖边散步。', note: '人工确认', lng: 120.148, lat: 30.245, confidence: 0.9, confirmed: true, sourceRef: '第 1 页', sourceUrls: [] }],
  }],
};

describe('pocket-data/v1 protocol', () => {
  it('accepts a valid inline book bundle', () => {
    const result = validateDataPackDocument(base, 'books');
    expect(result.domain).toBe('books');
    expect(result.inlineRecords).toHaveLength(1);
  });

  it('accepts a valid music bundle with decoupled playback references', () => {
    const result = validateDataPackDocument(music, 'music');
    expect(result.domain).toBe('music');
    expect(result.inlineRecords).toHaveLength(1);
  });

  it('accepts an evidence-bearing Mapping bundle and rejects unconfirmed points', () => {
    expect(validateDataPackDocument(mapping, 'mapping').domain).toBe('mapping');
    const unconfirmed = structuredClone(mapping);
    unconfirmed.records[0].locations[0].confirmed = false;
    expect(() => validateDataPackDocument(unconfirmed, 'mapping')).toThrow(/未经人工确认/);
  });

  it('rejects Mapping points without a valid source fingerprint or verbatim quote', () => {
    const badHash = structuredClone(mapping); badHash.records[0].sourceSha256 = 'unknown';
    expect(() => validateDataPackDocument(badHash, 'mapping')).toThrow(/sourceSha256/);
    const noQuote = structuredClone(mapping); noQuote.records[0].locations[0].quote = '';
    expect(() => validateDataPackDocument(noQuote, 'mapping')).toThrow(/quote/);
  });

  it('rejects an unresolved non-none music playback source', () => {
    const invalid = structuredClone(music);
    invalid.records[0].tracks[0].playback = { provider: 'youtube', url: '' };
    expect(() => validateDataPackDocument(invalid, 'music')).toThrow(/11 位 YouTube 视频 ID/);
  });

  it('enforces provider-specific playback contracts', () => {
    const youtubePageInAudioUrl = structuredClone(music);
    youtubePageInAudioUrl.records[0].tracks[0].playback = {
      provider: 'youtube', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', sourceId: 'M7lc1UVf-VE', sourceUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    } as typeof music.records[0]['tracks'][0]['playback'];
    expect(() => validateDataPackDocument(youtubePageInAudioUrl, 'music')).toThrow(/url 必须留空/);

    const mismatchedYoutube = structuredClone(music);
    mismatchedYoutube.records[0].tracks[0].playback = {
      provider: 'youtube', url: '', sourceId: 'M7lc1UVf-VE', sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
    } as typeof music.records[0]['tracks'][0]['playback'];
    expect(() => validateDataPackDocument(mismatchedYoutube, 'music')).toThrow(/sourceId 一致/);

    const fakeOss = structuredClone(music);
    fakeOss.records[0].tracks[0].playback = { provider: 'oss', url: '', sourceId: 'M7lc1UVf-VE' } as typeof music.records[0]['tracks'][0]['playback'];
    expect(() => validateDataPackDocument(fakeOss, 'music')).toThrow(/可直接播放/);

    const fakeNone = structuredClone(music);
    fakeNone.records[0].tracks[0].playback = { provider: 'none', url: 'https://example.com/not-none.mp3' };
    expect(() => validateDataPackDocument(fakeNone, 'music')).toThrow(/provider=none/);
  });

  it('rejects the right protocol in the wrong Skill', () => {
    expect(() => validateDataPackDocument(base, 'movies')).toThrow(/不能装入 movies Skill/);
  });

  it('recognizes a generic protocol pack before requiring its Skill adapter', () => {
    const exhibitions = {
      ...base,
      schema: { ...base.schema, name: 'example.exhibitions/v1' },
      compatibility: { ...base.compatibility, skills: ['example.exhibitions'] },
    };
    expect(() => validateDataPackDocument(exhibitions)).toThrow(/符合 pocket-data\/v1.*尚未安装 example\.exhibitions\/v1 适配器/);
  });

  it('uses runtime_min as a minimum version instead of an exact version', () => {
    const compatible = { ...base, compatibility: { ...base.compatibility, runtime_min: '0.9.0' } };
    expect(validateDataPackDocument(compatible, 'books').domain).toBe('books');
    const future = { ...base, compatibility: { ...base.compatibility, runtime_min: '2.0.0' } };
    expect(() => validateDataPackDocument(future, 'books')).toThrow(/要求运行时 2\.0\.0/);
  });

  it('rejects duplicate record ids', () => {
    const duplicate = { ...base, schema: { ...base.schema, record_count: 2 }, records: [base.records[0], { ...base.records[0] }] };
    expect(() => validateDataPackDocument(duplicate, 'books')).toThrow(/记录 ID 重复/);
  });

  it('keeps the in-app and downloadable Skill validators equally strict about unknown fields', () => {
    const invalid = structuredClone(base) as typeof base & { accidental?: boolean };
    invalid.accidental = true;
    expect(() => validateDataPackDocument(invalid, 'books')).toThrow(/unknown|\u672a\u77e5字段/i);

    const directory = mkdtempSync(path.join(tmpdir(), 'pocket-data-validator-'));
    const input = path.join(directory, 'invalid-books.json');
    writeFileSync(input, JSON.stringify(invalid), 'utf8');
    try {
      expect(() => execFileSync(process.execPath, [
        path.resolve(import.meta.dirname, '../../../../skills/make-pocket-data-pack/scripts/validate-data-pack.mjs'),
        input,
      ], { encoding: 'utf8', stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects unsafe chunk paths', () => {
    const chunked = {
      ...base,
      distribution: { mode: 'chunked' },
      files: [{ role: 'records', path: '../secret.json', media_type: 'application/json', bytes: 10, sha256: 'a'.repeat(64), records: 1 }],
    };
    delete (chunked as { records?: unknown }).records;
    expect(() => validateDataPackDocument(chunked, 'books')).toThrow(/安全相对路径/);
  });

  it('only permits HTTPS and local development HTTP', () => {
    expect(safeDataPackUrl('https://example.com/pack.json')).toBe('https://example.com/pack.json');
    expect(safeDataPackUrl('http://localhost:5173/pack.json')).toBe('http://localhost:5173/pack.json');
    expect(() => safeDataPackUrl('http://example.com/pack.json')).toThrow(/只允许 HTTPS/);
    expect(() => safeDataPackUrl('javascript:alert(1)')).toThrow(/只允许 HTTPS/);
  });

  it('keeps chunk downloads on the manifest origin', () => {
    expect(resolveDataPackFileUrl('https://example.com/v1/manifest.json', 'chunks/records.json')).toBe('https://example.com/v1/chunks/records.json');
    expect(() => resolveDataPackFileUrl('https://example.com/v1/manifest.json', '../records.json')).toThrow(/不安全/);
  });

  it('computes the standard SHA256 digest', async () => {
    const bytes = new TextEncoder().encode('abc');
    expect(await sha256Hex(bytes.buffer)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('does not statically import the old full JSON libraries', () => {
    const root = path.resolve(import.meta.dirname, '..', '..');
    expect(readFileSync(path.join(root, 'data', 'books.ts'), 'utf8')).not.toContain("./douban-books.json");
    expect(readFileSync(path.join(root, 'data', 'movies.ts'), 'utf8')).not.toContain("./douban-movies.json");
    expect(readFileSync(path.resolve(root, '..', '..', 'frost-agent', 'data', 'radio.ts'), 'utf8')).not.toContain('import.meta.glob');
  });
});
