import { describe, expect, it } from 'vitest';
import {
  formatPublicSemanticMemory,
  retrievePublicSemanticMemory,
  selectPublicKnowledgeTopics,
} from './publicSemantic.mjs';

describe('public semantic memory', () => {
  it('requires an explicit knowledge or current-events intent', () => {
    expect(selectPublicKnowledgeTopics('我喜欢人工智能')).toEqual([]);
    expect(selectPublicKnowledgeTopics('今天最新的人工智能新闻')).toEqual(['ai']);
  });

  it('only recalls supported, sourced records above the truth threshold', async () => {
    const fetcher = async () => ({
      ok: true,
      json: async () => ({
        topic: 'ai',
        memoryTier: 'L3',
        mode: 'live',
        reviewGate: { required: true },
        edition: { editionRoot: '0xabc' },
        records: [
          { id: 'good', topic: 'ai', claim: '可核验事实', summary: '摘要', verdict: 'supported', truthScore: 88, sources: [{ title: '来源', publisher: 'Publisher', url: 'https://example.com' }] },
          { id: 'weak', topic: 'ai', claim: '低分主张', verdict: 'supported', truthScore: 40, sources: [{ title: '来源', publisher: 'Publisher', url: 'https://example.com' }] },
          { id: 'empty', topic: 'ai', claim: '无来源主张', verdict: 'supported', truthScore: 90, sources: [] },
        ],
      }),
    }) as Response;
    const records = await retrievePublicSemanticMemory('今天 AI 有什么最新进展', { fetcher });
    expect(records.map((record) => record.id)).toEqual(['good']);
    expect(records[0]?.metadata?.humanReviewRequired).toBe(true);
  });

  it('keeps public facts separate from identity and chain claims', () => {
    const text = formatPublicSemanticMemory([{ id: 'r', kind: 'semantic', tier: 'long-term', content: '事实', summary: '', recordedAt: '', trustScore: 90, evidence: [], metadata: { humanReviewRequired: true } }]);
    expect(text).toContain('待人工发布');
    expect(text).toContain('不要把它们描述成用户的个人经历或偏好');
    expect(text).not.toMatch(/Injective|钱包|链上/i);
  });
});
