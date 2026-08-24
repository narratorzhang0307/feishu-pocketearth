import { describe, expect, it } from 'vitest';
import { bookMapPoint, hasBookMapPoint, recentBookRecords, type BookRecord } from './books';

const baseBook: BookRecord = {
  id: 'book:city-and-dogs',
  title: '城市与狗',
  author: '马里奥·巴尔加斯·略萨',
  country: '秘鲁',
  type: '小说',
  year: 1963,
  rating: null,
  date: '2026-08-24',
  synopsis: '利马的军校故事',
  locations: [],
};

describe('book map state', () => {
  it('treats a confirmed Feishu coordinate as pinned even without a country fallback', () => {
    expect(hasBookMapPoint({
      ...baseBook,
      locations: [{ kind: 'story', place: '莱昂西奥·普拉多军事学校（利马）', lng: -77.0369, lat: -12.0464, confidence: 0.75 }],
    })).toBe(true);
  });

  it('does not claim a map pin when neither coordinates nor a country fallback exist', () => {
    expect(hasBookMapPoint(baseBook)).toBe(false);
  });

  it('shows a later same-day Feishu record before older rows', () => {
    const earlier = { ...baseBook, id: 'book:earlier', title: '城市与狗' };
    const later = { ...baseBook, id: 'book:later', title: '酒吧长谈' };
    expect(recentBookRecords([earlier, later], 1)).toEqual([later]);
  });

  it('uses the same deterministic coordinates for a card and its map marker', () => {
    const located = { ...baseBook, locations: [{ kind: 'story' as const, place: '利马', lng: -77.0369, lat: -12.0464, confidence: 0.9 }] };
    expect(bookMapPoint(located)).toMatchObject({ id: located.id });
    expect(bookMapPoint(located)).toEqual(bookMapPoint(located));
  });
});
