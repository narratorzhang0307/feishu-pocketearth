import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MarkerDetail from './MarkerDetail';

describe('MarkerDetail · 看展 Qwen 展示字段', () => {
  it('在钉地球详情里展示规整后的 Qwen 时间线位置', () => {
    const html = renderToStaticMarkup(React.createElement(MarkerDetail, {
      data: {
        kind: 'exhibition',
        title: '萨莫色雷斯胜利女神像',
        original: 'Winged Victory of Samothrace',
        dynasty: '希腊化时代',
        material: ['大理石'],
        category: '造像',
        culture: '古希腊',
        aliases: ['Nike of Samothrace'],
        qwenConfidence: 0.91,
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线 · 3D兜底',
        museum: '卢浮宫',
        curatorNote: '像一阵海风停在船首。',
        timelineNote: '时间线位置：古希腊文明晚段，位于古典期之后。',
        rating: 5,
      },
      onClose: () => {},
    }));

    expect(html).toContain('Qwen·91%');
    expect(html).toContain('阿里云百炼 Qwen · 云端 · 视觉识别 · 结构化补全 · 导览/时间线 · 3D兜底');
    expect(html).toContain('像一阵海风停在船首。');
    expect(html).toContain('时间线·古希腊文明晚段，位于古典期之后。');
    expect(html).not.toContain('时间线位置：古希腊文明晚段');
  });

  it('在钉地球详情里展示 KIRI 3D 生成状态', () => {
    const html = renderToStaticMarkup(React.createElement(MarkerDetail, {
      data: {
        kind: 'exhibition',
        title: '萨莫色雷斯胜利女神像',
        museum: '卢浮宫',
        splatStatus: ' Reconstructing ',
        splatId: 'mock-gmi-3d-reconstructing',
      },
      onClose: () => {},
    }));

    expect(html).toContain('◆ KIRI中');
    expect(html).not.toContain('◆ 3D 可看');
  });

  it('在钉地球详情里展示 KIRI 采集质量提醒', () => {
    const html = renderToStaticMarkup(React.createElement(MarkerDetail, {
      data: {
        kind: 'exhibition',
        title: '玉杯',
        museum: '卢浮宫',
        splatStatus: 'failed',
        splatCaptureQualityWarn: '隔玻璃反光过强，建议绕到侧面补拍一组。',
      },
      onClose: () => {},
    }));

    expect(html).toContain('◆ 3D失败');
    expect(html).toContain('采集提醒');
    expect(html).toContain('隔玻璃反光过强，建议绕到侧面补拍一组。');
  });
});
