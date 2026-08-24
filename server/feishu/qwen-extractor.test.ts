import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { createQwenLocationExtractor, parseQwenLocations } from './qwen-extractor.mjs';

describe('grounded Qwen location extraction', () => {
  const pages = [{ page: 1, text: '第一站从杭州西湖出发，随后抵达灵隐寺。' }];

  it('keeps page evidence and rejects guessed coordinates outside their legal range', () => {
    const locations = parseQwenLocations(JSON.stringify({ locations: [{
      nameAsWritten: '杭州西湖', modernName: '西湖风景名胜区', page: 1,
      evidence: '从杭州西湖出发', latitude: 999, longitude: 120.15, confidence: 0.91,
    }] }), pages);
    expect(locations[0]).toMatchObject({ page: 1, latitude: null, longitude: 120.15, confidence: 0.91, reviewStatus: 'pending' });
  });

  it('fails closed for non-JSON, empty results and evidence absent from OCR', () => {
    expect(() => parseQwenLocations('not json', pages)).toThrow('qwen_non_json_response');
    expect(() => parseQwenLocations('{"locations":[]}', pages)).toThrow('qwen_returned_no_locations');
    expect(() => parseQwenLocations('{"locations":[{"nameAsWritten":"故宫","page":1,"evidence":"北京故宫"}]}', pages)).toThrow('qwen_evidence_not_grounded');
  });

  it('executes the Book-to-Earth prompt selected by Frost', async () => {
    let requestBody: { messages?: Array<{ content?: string }> } = {};
    const extractor = createQwenLocationExtractor({ key: 'test-key', url: 'https://qwen.test', model: 'qwen-test' }, async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ locations: [{ nameAsWritten: '杭州西湖', page: 1, evidence: '杭州西湖' }] }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await extractor.extract(pages, { skillId: 'pocket.book-to-earth' });
    expect(requestBody.messages?.[0].content).toContain('Book-to-Earth');
    expect(requestBody.messages?.[0].content).toContain('pocket.mapping/v1');
  });
});
