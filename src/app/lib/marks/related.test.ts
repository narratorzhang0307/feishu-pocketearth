import { describe, expect, it } from 'vitest';
import { diceSim, distKm, metaTags, rankRelated, scoreCandidate, type RelatedCandidate, type RelatedQuery } from './related';

// 杭州西湖附近两点（相距 ~2km 级）与一个远城（北京）
const HZ = { lat: 30.246, lng: 120.14 };
const HZ2 = { lat: 30.26, lng: 120.15 };
const BJ = { lat: 39.9, lng: 116.4 };

const cand = (over: Partial<RelatedCandidate>): RelatedCandidate => ({
  id: 'c-' + Math.random().toString(36).slice(2, 7),
  kind: 'book', label: '候选', lat: BJ.lat, lng: BJ.lng, origin: 'visited', ...over,
});

describe('related · 四路信号打分', () => {
  it('同城地理命中：给出「同城」理由', () => {
    const q: RelatedQuery = { lat: HZ.lat, lng: HZ.lng };
    const { score, reasons } = scoreCandidate(q, cand({ lat: HZ2.lat, lng: HZ2.lng }));
    expect(score).toBeGreaterThanOrEqual(2);
    expect(reasons.join()).toContain('同城');
  });

  it('跨国际日期线不误判为远距离', () => {
    expect(distKm(0, 179.9, 0, -179.9)).toBeLessThan(30);
  });

  it('同一周记的：时间信号命中', () => {
    const q: RelatedQuery = { createdAt: '2026-07-01T00:00:00Z' };
    const { reasons } = scoreCandidate(q, cand({ createdAt: '2026-07-04T00:00:00Z' }));
    expect(reasons).toContain('同一周记的');
  });

  it('结构化标签共现：朝代匹配给「都是」措辞、人名给「同为」', () => {
    const q: RelatedQuery = { tags: [{ k: '朝代', v: '宋' }, { k: '导演', v: '侯孝贤' }] };
    const { score, reasons } = scoreCandidate(q, cand({ tags: [{ k: '朝代', v: '宋' }, { k: '导演', v: '侯孝贤' }] }));
    expect(score).toBeGreaterThanOrEqual(4);
    expect(reasons).toContain('都是「宋」');
    expect(reasons).toContain('同为侯孝贤');
  });

  it('中文 bigram 文字相近：无需分词器', () => {
    expect(diceSim('大英博物馆的帕特农浮雕', '在大英博物馆看浮雕')).toBeGreaterThan(0.12);
    expect(diceSim('大英博物馆', '完全无关词组')).toBe(0);
  });

  it('低于阈值的候选被过滤；零命中返回空数组', () => {
    const q: RelatedQuery = { lat: HZ.lat, lng: HZ.lng };
    expect(rankRelated(q, [cand({ lat: BJ.lat, lng: BJ.lng })])).toEqual([]);
  });

  it('排除自身 + 每类限量 + 截断', () => {
    const q: RelatedQuery = { selfId: 'self', lat: HZ.lat, lng: HZ.lng };
    const near = (id: string, kind: RelatedCandidate['kind'], label: string) => cand({ id, kind, label, lat: HZ2.lat, lng: HZ2.lng });
    const items = rankRelated(q, [
      near('self', 'book', '自己'),
      near('b1', 'book', '书一'), near('b2', 'book', '书二'), near('b3', 'book', '书三'),
      near('m1', 'movie', '影一'), near('m2', 'movie', '影二'), near('e1', 'exhibition', '展一'),
    ]);
    expect(items.find((x) => x.id === 'self')).toBeUndefined();
    expect(items.filter((x) => x.kind === 'book').length).toBeLessThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(4);
  });

  it('资料层(seen)相对你记的(visited)降权；跨域有意外关联加分', () => {
    const q: RelatedQuery = { kind: 'exhibition', lat: HZ.lat, lng: HZ.lng };
    const visited = scoreCandidate(q, cand({ origin: 'visited', kind: 'movie', lat: HZ2.lat, lng: HZ2.lng }));
    const seen = scoreCandidate(q, cand({ origin: 'seen', kind: 'movie', lat: HZ2.lat, lng: HZ2.lng }));
    const sameKind = scoreCandidate(q, cand({ origin: 'visited', kind: 'exhibition', lat: HZ2.lat, lng: HZ2.lng }));
    expect(visited.score).toBeGreaterThan(seen.score);
    expect(visited.score).toBeGreaterThan(sameKind.score);
  });

  it('metaTags：从 pin 写入的 meta 抽标签（含材质数组）', () => {
    const tags = metaTags({ dynastyLabel: '唐', category: '金银器', material: ['银', '鎏金'], director: '' });
    expect(tags).toContainEqual({ k: '朝代', v: '唐' });
    expect(tags).toContainEqual({ k: '材质', v: '鎏金' });
    expect(tags.find((t) => t.k === '导演')).toBeUndefined();
  });

  it('不显示相似度数字：理由是人话不是百分比', () => {
    const q: RelatedQuery = { lat: HZ.lat, lng: HZ.lng, createdAt: '2026-07-01T00:00:00Z', tags: [{ k: '朝代', v: '宋' }] };
    const items = rankRelated(q, [cand({ lat: HZ2.lat, lng: HZ2.lng, createdAt: '2026-07-02T00:00:00Z', tags: [{ k: '朝代', v: '宋' }] })]);
    expect(items[0].reasons.every((r) => !/%|0\.\d/.test(r))).toBe(true);
  });
});
