import { describe, expect, it } from 'vitest';
import { buildPlaceBriefPrompt, isGroundedPlaceBrief, normalizePlaceBriefText, removeUnsupportedQuotationMarks, sourceExtractBrief, type TravelPlaceSource } from './placeBrief';

const source: TravelPlaceSource = {
  title: '锦市场介绍', publisher: '京都锦市场商店街振兴组合', url: 'https://www.kyoto-nishiki.or.jp/example', sourceGroup: 'kyoto-nishiki.or.jp',
  language: 'ja', revisionId: null, excerpt: '錦市場是位于京都市的一条商店街，沿线商铺销售生鲜食材与加工食品。',
};
const sources: TravelPlaceSource[] = [
  source,
  { ...source, language: 'en', publisher: '京都市观光协会', url: 'https://kyoto.travel/example', sourceGroup: 'kyoto.travel', excerpt: '錦市場位于京都市中京区，商店供应鱼、肉、干货、豆皮和京都蔬菜。' },
  { ...source, language: 'en', publisher: '日本政府观光局', url: 'https://www.japan.travel/example', sourceGroup: 'japan.travel', excerpt: 'Nishiki Market is a marketplace in downtown Kyoto selling food and produce.' },
];

describe('travel place brief grounding', () => {
  it('puts the exact source material into the Qwen prompt', () => {
    const prompt = buildPlaceBriefPrompt('京都', '锦市场', sources);
    expect(prompt).toContain('[1] 权威权重 1/3 · 京都锦市场商店街振兴组合《锦市场介绍》');
    expect(prompt).toContain(source.excerpt);
    expect(prompt).toContain('三个独立机构');
  });

  it('removes model wrappers and bounds an overlong brief', () => {
    expect(normalizePlaceBriefText('```\n介绍：锦市场是京都的商店街。\n```')).toBe('锦市场是京都的商店街。');
    expect(normalizePlaceBriefText(`正文：${'资料内容'.repeat(180)}。`).length).toBeLessThanOrEqual(552);
  });

  it('keeps exact quoted names but removes unsupported quotation marks', () => {
    expect(removeUnsupportedQuotationMarks('这里是「錦市場」，也称“京都厨房”。', sources))
      .toBe('这里是「錦市場」，也称京都厨房。');
  });

  it('rejects unsupported years and risky claims', () => {
    expect(isGroundedPlaceBrief('锦市场自1984年起成为最具代表性的美食街区。[1][2]'.repeat(12), sources)).toBe(false);
    const grounded = '锦市场位于京都市，沿线商铺销售生鲜食材与加工食品，这些具体信息可由材料核对。[1][2][3]';
    expect(isGroundedPlaceBrief(grounded.repeat(9).slice(0, 520), sources)).toBe(true);
    expect(isGroundedPlaceBrief(`${grounded.repeat(8)}还可品尝「材料中没有的菜」。[1][2][3]`.slice(0, 560), sources)).toBe(false);
  });

  it('falls back to a bounded verbatim source extract', () => {
    const text = sourceExtractBrief(sources.map((item) => ({ ...item, excerpt: `${item.excerpt.repeat(8)}。` })));
    expect(text.length).toBeLessThanOrEqual(550);
    expect(text).toContain('[1]');
    expect(text).toContain(source.excerpt.slice(0, 20));
    const shortSources = sourceExtractBrief(sources);
    expect(shortSources).toContain('[2]');
    expect(shortSources).toContain('[3]');
  });
});
