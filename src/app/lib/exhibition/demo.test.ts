import { describe, expect, it } from 'vitest';
import { createExhibitionDemoDraft, createQwenOwnedGpuCompetitionDemoDraft } from './demo';
import { artifactKey } from './types';

describe('createExhibitionDemoDraft', () => {
  it('生成无需云端服务的可钉展品草稿', () => {
    const draft = createExhibitionDemoDraft();

    expect(draft.id).toBe(artifactKey(draft.nameZh, draft.museum));
    expect(draft.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(draft.geo).toMatchObject({ kind: 'venue', place: '卢浮宫' });
    expect(draft.needPlace).toBe(false);
    expect(draft.splat).toMatchObject({ status: 'ready', sourceKind: 'preset', engine: 'preset', format: 'splat' });
    expect(draft.visitDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('生成不调用真实 API 的 Qwen + 自有 GPU 比赛链路 mock 草稿', () => {
    const draft = createQwenOwnedGpuCompetitionDemoDraft();

    expect(draft.source).toBe('mixed');
    expect(draft.reason).toContain('Qwen生成导览词');
    expect(draft.reason).toContain('云端 mock');
    expect(draft.labels[0]).toMatchObject({ ocrEngine: 'qwen-vision' });
    expect(draft.tags.aliases).toEqual(['Nike of Samothrace']);
    expect(draft.tags.qwenConfidence).toBe(0.94);
    expect(draft.splat).toMatchObject({
      status: 'ready',
      sourceKind: 'multi-image',
      engine: 'qwen-colmap-gsplat',
      splatId: 'mock-owned-gpu-3d',
      taskId: 'mock-owned-gpu-task',
    });
  });
});
