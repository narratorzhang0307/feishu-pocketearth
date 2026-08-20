import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ArtifactCard from './ArtifactCard';

describe('ArtifactCard · Qwen 展示字段', () => {
  it('在展品卡上展示 Qwen 时间线位置', () => {
    const html = renderToStaticMarkup(React.createElement(ArtifactCard, {
      data: {
        id: 'art:nike@louvre',
        nameZh: '萨莫色雷斯胜利女神像',
        nameEn: 'Winged Victory of Samothrace',
        dynastyLabel: '希腊化时代',
        eraStart: -323,
        material: ['大理石'],
        category: '造像',
        culture: '古希腊',
        qwenConfidence: 0.91,
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线 · 3D兜底',
        museum: '卢浮宫',
        curatorNote: '像一阵海风停在船首。',
        timelineNote: '时间线位置：古希腊文明晚段，位于古典期之后。',
        rating: 5,
      },
    }));

    expect(html).toContain('QWEN·91%');
    expect(html).toContain('QWEN链路 · 视觉识别 · 结构化补全 · 导览/时间线 · 3D兜底');
    expect(html).toContain('像一阵海风停在船首。');
    expect(html).toContain('时间线·古希腊文明晚段，位于古典期之后。');
  });

  it('在展品卡媒体区展示通用 3D 重建状态', () => {
    const html = renderToStaticMarkup(React.createElement(ArtifactCard, {
      data: {
        id: 'art:nike@louvre',
        nameZh: '萨莫色雷斯胜利女神像',
        museum: '卢浮宫',
        splatStatus: ' Reconstructing ',
        splatId: 'kiri-task-nike',
      },
    }));

    expect(html).toContain('◆ 3D重建中');
    expect(html).not.toContain('◆ 3D就绪');
  });
});
