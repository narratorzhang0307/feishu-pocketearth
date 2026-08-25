import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MarkerDetail from './MarkerDetail';

describe('MarkerDetail · 原版知识票据', () => {
  it('藏书票展示作者、年份、类型、简介、地点与阅读日期', () => {
    const html = renderToStaticMarkup(React.createElement(MarkerDetail, {
      data: {
        kind: 'book', title: '酒吧长谈', author: '马里奥·巴尔加斯·略萨', country: '秘鲁',
        year: 1969, genre: '小说', synopsis: '以利马为背景的多声部叙事。',
        place: '利马', geoKind: 'story', date: '2026-08-25', rating: 5,
      },
      onClose: () => {},
    }));

    expect(html).toContain('EX LIBRIS · 藏书票');
    expect(html).toContain('马里奥·巴尔加斯·略萨 · 秘鲁');
    expect(html).toContain('1969');
    expect(html).toContain('类型·小说');
    expect(html).toContain('以利马为背景的多声部叙事。');
    expect(html).toContain('钉于 故事地利马 · 读于 2026-08-25');
  });

  it('电影票展示导演、年份、类型、简介与地点', () => {
    const html = renderToStaticMarkup(React.createElement(MarkerDetail, {
      data: {
        kind: 'movie', title: '花样年华', director: '王家卫', country: '中国香港', year: 2000,
        genre: '剧情', synopsis: '两段克制的情感在香港交错。', place: '香港', geoKind: 'filming', rating: 5,
      },
      onClose: () => {},
    }));

    expect(html).toContain('ADMIT ONE · 观影票根');
    expect(html).toContain('王家卫 · 中国香港 · 2000');
    expect(html).toContain('类型·剧情');
    expect(html).toContain('两段克制的情感在香港交错。');
    expect(html).toContain('钉于 取景地香港');
  });

  it('音乐城市卡展示歌名、歌手、流派与城市', () => {
    const html = renderToStaticMarkup(React.createElement(MarkerDetail, {
      data: { kind: 'music', title: 'California Dreamin\'', artist: 'The Mamas & the Papas', genre: '摇滚', city: '洛杉矶' },
      onClose: () => {},
    }));

    expect(html).toContain('CITY · 音乐城市');
    expect(html).toContain('California Dreamin&#x27;');
    expect(html).toContain('The Mamas &amp; the Papas');
    expect(html).toContain('流派·摇滚');
    expect(html).toContain('钉于 洛杉矶');
  });
});

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
