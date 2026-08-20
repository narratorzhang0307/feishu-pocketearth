import { describe, expect, it } from 'vitest';
import { captureGuideBrief, selectCaptureGuideForArtifact } from './captureGuide';

describe('CaptureGuide · Qwen 演示采集引导验收', () => {
  it('Qwen 补全萨莫色雷斯胜利女神像字段后给出雕塑三圈绕拍', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '胜利女神',
      museum: '卢浮宫',
      tags: {
        nameEn: 'Winged Victory of Samothrace',
        aliases: ['Nike of Samothrace'],
        category: '造像',
        material: ['大理石'],
        dynastyLabel: '希腊化时代',
      },
    });

    expect(guide.kind).toBe('sculpture');
    expect(captureGuideBrief(guide)).toBe('雕塑 / 塑像 / 俑 · 视频/多图 · 绕 3 圈 · 平视、略俯、低角度');
  });

  it('Qwen 补全平面文献或书画器类后优先给多图网格采集', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '无题册页',
      tags: {
        category: '书画',
        material: ['纸本设色'],
        dynastyLabel: '清代',
      },
    });

    expect(guide.kind).toBe('flat');
    expect(guide.mode).toBe('photo');
    expect(captureGuideBrief(guide)).toBe('书画 / 帛画 / 平面文物 · 多图 · 正对');
  });

  it('展签读到玻璃展柜语境时不被结构化造像器类覆盖', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '玉人',
      labels: [{ rawText: '展品位于玻璃展柜内，请勿触碰' }],
      tags: {
        category: '造像',
        material: ['玉'],
      },
    });

    expect(guide.kind).toBe('glasscase');
    expect(captureGuideBrief(guide)).toBe('玻璃罩 / 展柜内 · 录视频 · 绕 2 圈 · 平视、略俯');
  });
});
