import { afterEach, describe, expect, it } from 'vitest';
import { setFrostBrain, stubBrain } from '../../../../frost-agent/harness/brain';
import type { AgentManifest } from './manifest';
import { populateMap } from './research';

const manifest: AgentManifest = {
  id: 'kiln-map', name: '官窑地图', emoji: '🏺', domain: '官窑', desc: '', keywords: ['官窑'],
  geoStrategy: ['origin'], tagFields: ['年代'], tools: ['enrich', 'geocode', 'mark_place'],
  cardStyle: 'generic', color: '#336699', persona: '', createdAt: '2026-07-14',
};

describe('Agent Forge candidate verification', () => {
  afterEach(() => setFrostBrain(stubBrain));

  it('labels model-knowledge candidates as pending and never asks for fabricated search sources', async () => {
    const prompts: string[] = [];
    setFrostBrain({
      async complete(prompt) {
        prompts.push(prompt);
        if (prompt.includes('候选生成')) return '{"queries":["杭州官窑"],"target":4}';
        if (prompt.includes('候选条目')) return '{"records":[{"label":"南宋官窑博物馆","city":"","tags":{"年代":"南宋"},"note":"模型知识候选","verificationPrompt":"核对博物馆官方目录"}]}';
        return '{"done":true,"more":[]}';
      },
    });

    const draft = await populateMap(manifest, '杭州官窑地图', undefined, { maxRounds: 1, maxQueries: 1 });
    expect(draft.records).toHaveLength(1);
    expect(draft.records[0]).toMatchObject({
      verificationStatus: 'pending',
      verificationPrompt: '核对博物馆官方目录',
    });
    expect(prompts.join('\n')).not.toContain('联网检索');
    expect(prompts.join('\n')).not.toContain('来源名或链接');
  });
});
