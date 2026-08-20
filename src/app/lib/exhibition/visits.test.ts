// 观展史聚合纯函数单测：日期降序 / 天内按馆分组 / 无日期无场馆的沉底语义 / 汇总口径。
import { describe, it, expect } from 'vitest';
import { groupVisits, visitSummary, UNDATED, UNKNOWN_VENUE } from './visits';

const item = (visitDate: string, museum: string, name = '') => ({ visitDate, museum, name });

describe('groupVisits 观展史分组', () => {
  it('按日期降序，天内按馆分组，同馆保持录入顺序', () => {
    const days = groupVisits([
      item('2026-06-01', '卢浮宫', 'A'),
      item('2026-07-02', '大英博物馆', 'B'),
      item('2026-07-02', '大英博物馆', 'C'),
      item('2026-07-02', '泰特现代美术馆', 'D'),
    ]);
    expect(days.map((d) => d.date)).toEqual(['2026-07-02', '2026-06-01']);
    expect(days[0].total).toBe(3);
    expect(days[0].venues.map((v) => v.museum)).toEqual(['大英博物馆', '泰特现代美术馆']);
    expect(days[0].venues[0].items.map((i) => i.name)).toEqual(['B', 'C']);
  });
  it('无日期沉到最后、无场馆沉到当天最后', () => {
    const days = groupVisits([
      item('', '某馆', 'X'),
      item('2026-07-01', '', 'Y'),
      item('2026-07-01', '卢浮宫', 'Z'),
    ]);
    expect(days[days.length - 1].date).toBe(UNDATED);
    const day1 = days.find((d) => d.date === '2026-07-01')!;
    expect(day1.venues.map((v) => v.museum)).toEqual(['卢浮宫', UNKNOWN_VENUE]);
  });
  it('星期几标注正确（2026-07-02 是周四），未记日期无星期', () => {
    const days = groupVisits([item('2026-07-02', '馆'), item('', '馆')]);
    expect(days[0].weekday).toBe('周四');
    expect(days[1].weekday).toBe('');
  });
  it('空输入出空数组', () => {
    expect(groupVisits([])).toEqual([]);
  });
});

describe('visitSummary 汇总口径', () => {
  it('天数/馆数去重，未记不计入，件数全计', () => {
    const s = visitSummary([
      item('2026-07-02', '大英博物馆'),
      item('2026-07-02', '卢浮宫'),
      item('2026-06-01', '卢浮宫'),
      item('', ''),
    ]);
    expect(s).toEqual({ days: 2, venues: 2, items: 4 });
  });
});
