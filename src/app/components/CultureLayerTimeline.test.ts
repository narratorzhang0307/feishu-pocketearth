import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CultureLayerTimeline from './CultureLayerTimeline';

describe('CultureLayerTimeline · Qwen 展示字段', () => {
  it('在时间线缩略项上展示 Qwen 置信度和时间线位置', () => {
    const html = renderToStaticMarkup(React.createElement(CultureLayerTimeline, {
      items: [{
        id: 'art:nike@louvre',
        nameZh: '萨莫色雷斯胜利女神像',
        nameEn: 'Winged Victory of Samothrace',
        dynastyLabel: '希腊化时代',
        eraStart: -323,
        material: ['大理石'],
        category: '造像',
        culture: '古希腊',
        qwenConfidence: 0.91,
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线',
        museum: '卢浮宫',
        curatorNote: '像一阵海风停在船首。',
        timelineNote: '时间线位置：古希腊文明晚段，位于古典期之后。',
        rating: 5,
      }],
    }));

    expect(html).toContain('萨莫色雷斯胜利女神像');
    expect(html).toContain('QWEN·91%');
    expect(html).toContain('QWEN·视觉识别 · 结构化补全 · 导览/时间线');
    expect(html).toContain('古希腊文明晚段，位于古典期之后。');
  });

  it('3D 失败且只剩任务 id 时，不在时间线误亮 3D 标记', () => {
    const failedHtml = renderToStaticMarkup(React.createElement(CultureLayerTimeline, {
      items: [{
        id: 'art:nike@louvre',
        nameZh: '萨莫色雷斯胜利女神像',
        dynastyLabel: '希腊化时代',
        eraStart: -323,
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线',
        splatStatus: 'failed',
        splatId: 'mock-gmi-3d-failed',
      }],
    }));

    const readyHtml = renderToStaticMarkup(React.createElement(CultureLayerTimeline, {
      items: [{
        id: 'art:nike-ready@louvre',
        nameZh: '萨莫色雷斯胜利女神像',
        dynastyLabel: '希腊化时代',
        eraStart: -323,
        splatStatus: 'ready',
        splatId: 'mock-gmi-3d-ready',
      }],
    }));

    expect(failedHtml).not.toContain('◆');
    expect(readyHtml).toContain('◆');
  });

  it('3D 生成中只剩任务 id 时，不在时间线误亮 3D 标记', () => {
    const html = renderToStaticMarkup(React.createElement(CultureLayerTimeline, {
      items: [{
        id: 'art:nike-reconstructing@louvre',
        nameZh: '萨莫色雷斯胜利女神像',
        dynastyLabel: '希腊化时代',
        eraStart: -323,
        splatStatus: 'reconstructing',
        splatId: 'mock-kiri-task-id',
      }],
    }));

    expect(html).not.toContain('◆');
  });
});
