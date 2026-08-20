import { describe, expect, it } from 'vitest';
// @ts-expect-error Shared production module intentionally stays zero-dependency ESM.
import { __test } from '../../../../knowledge/travel-place-sources.mjs';

const source = (url: string, publisher: string) => ({
  title: publisher, publisher, url, sourceGroup: __test.sourceGroup(url), revisionId: null,
  excerpt: '这是一段足够长、可以用于测试来源独立性与去重规则的可靠材料。'.repeat(3),
});

describe('travel place source independence', () => {
  it('counts all Wikipedia language editions as one publisher group', () => {
    const selected = __test.independentSources([
      source('https://zh.wikipedia.org/wiki/example', '中文维基百科'),
      source('https://ja.wikipedia.org/wiki/example', '日文维基百科'),
      source('https://en.wikipedia.org/wiki/example', '英文维基百科'),
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0].sourceGroup).toBe('wikimedia');
  });

  it('deduplicates different domains operated by the same institution', () => {
    const selected = __test.independentSources([
      source('https://www.japan.travel/en/spot/1174/', 'JNTO English'),
      source('https://www.japan-travel.cn/spot/1174/', 'JNTO China'),
      source('https://kyoto.travel/en/example', 'DMO Kyoto'),
      source('https://www.kyoto-nishiki.or.jp/', 'Nishiki Market Association'),
    ]);
    expect(selected.map((item: { sourceGroup: string }) => item.sourceGroup)).toEqual(['jnto', 'dmo-kyoto', 'kyoto-nishiki.or.jp']);
  });
});
