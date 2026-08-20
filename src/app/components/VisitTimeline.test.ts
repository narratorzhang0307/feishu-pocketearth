import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import VisitTimeline from './VisitTimeline';

describe('VisitTimeline · 3D 状态展示', () => {
  it('GMI/KIRI 3D 未就绪但残留任务 id 时不误亮 3D 标记', () => {
    const failedHtml = renderToStaticMarkup(React.createElement(VisitTimeline, {
      items: [{
        id: 'art:nike-failed@louvre',
        nameZh: '萨莫色雷斯胜利女神像',
        museum: '卢浮宫',
        visitDate: '2026-07-10',
        splatStatus: 'failed',
        splatId: 'mock-gmi-3d-failed',
      }],
    }));
    const runningHtml = renderToStaticMarkup(React.createElement(VisitTimeline, {
      items: [{
        id: 'art:nike-running@louvre',
        nameZh: '萨莫色雷斯胜利女神像',
        museum: '卢浮宫',
        visitDate: '2026-07-10',
        splatStatus: 'reconstructing',
        splatId: 'mock-kiri-task-id',
      }],
    }));
    const readyHtml = renderToStaticMarkup(React.createElement(VisitTimeline, {
      items: [{
        id: 'art:nike-ready@louvre',
        nameZh: '萨莫色雷斯胜利女神像',
        museum: '卢浮宫',
        visitDate: '2026-07-10',
        splatStatus: 'ready',
        splatId: 'mock-gmi-3d-ready',
      }],
    }));

    expect(failedHtml).not.toContain('◆');
    expect(runningHtml).not.toContain('◆');
    expect(readyHtml).toContain('◆');
  });
});
