import { describe, expect, it } from 'vitest';
import { validateDataPackDocument } from './protocol';
import { createDataPackAiInstruction, createEmptyDataPackTemplate } from './protocolAssets';

describe('pocket-data/v1 user assets', () => {
  it.each(['books', 'movies', 'music'] as const)('creates a valid empty %s template', (domain) => {
    const template = createEmptyDataPackTemplate(domain, '2026-08-10T00:00:00.000Z');
    expect(validateDataPackDocument(template, domain).inlineRecords).toEqual([]);
  });

  it('creates an AI instruction bound to the selected adapter', () => {
    const instruction = createDataPackAiInstruction('movies');
    expect(instruction).toContain('pocket.movies/v1');
    expect(instruction).toContain('pocket.movies');
    expect(instruction).toContain('【空白模板：在此结构中填数据】');
    expect(instruction).toContain('【记录 JSON Schema：每条 records 项必须完全通过它】');
    expect(instruction).toContain('"additionalProperties": false');
    expect(instruction).toContain('【合法示例：学习结构，不要照抄示例事实】');
    expect(instruction).toContain('movie:example-001');
  });

  it('explains how YouTube sources enter a music data pack', () => {
    const instruction = createDataPackAiInstruction('music');
    expect(instruction).toContain('sourceId');
    expect(instruction).toContain('不要把 YouTube 歌单 URL 当成 Data Pack Manifest');
    expect(instruction).toContain('歌单先展开为 tracks');
  });
});
