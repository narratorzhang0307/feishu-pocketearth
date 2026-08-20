// 批量观展分组纯函数单测：同天同馆聚组 / 无 GPS 跟随 / 多馆不误跟 / 日期降序 / 选馆回写。
import { describe, it, expect } from 'vitest';
import { groupIntoVisits, assignVenue, isoDate, type BatchPhoto } from './batch';

const photo = (i: number, date: string | null, venueName: string | null, time = '10:00'): BatchPhoto =>
  ({ index: i, file: null as unknown as File, date, time, venueName });

describe('groupIntoVisits 观展聚组', () => {
  it('同一天同一馆聚成一组，组间日期降序', () => {
    const v = groupIntoVisits([
      photo(0, '2026-06-01', '卢浮宫'),
      photo(1, '2026-07-02', '大英博物馆'),
      photo(2, '2026-07-02', '大英博物馆'),
    ]);
    expect(v.map((g) => g.key)).toEqual(['2026-07-02|大英博物馆', '2026-06-01|卢浮宫']);
    expect(v[0].photos.length).toBe(2);
  });
  it('无 GPS 照片跟随当天唯一识别出的馆（iOS 剥 GPS 兜底）', () => {
    const v = groupIntoVisits([
      photo(0, '2026-07-02', '大英博物馆'),
      photo(1, '2026-07-02', null),
    ]);
    expect(v.length).toBe(1);
    expect(v[0].venueName).toBe('大英博物馆');
    expect(v[0].photos.length).toBe(2);
  });
  it('当天出现两个馆时，无 GPS 照片不乱跟、单列待选馆', () => {
    const v = groupIntoVisits([
      photo(0, '2026-07-02', '大英博物馆'),
      photo(1, '2026-07-02', '泰特现代美术馆'),
      photo(2, '2026-07-02', null),
    ]);
    expect(v.length).toBe(3);
    const pending = v.find((g) => g.venueName === null)!;
    expect(pending.photos[0].index).toBe(2);
    expect(pending.key).toBe('2026-07-02|待选馆');
  });
  it('组内按拍摄时间升序（观展动线）', () => {
    const v = groupIntoVisits([
      photo(0, '2026-07-02', '卢浮宫', '15:30'),
      photo(1, '2026-07-02', '卢浮宫', '09:05'),
    ]);
    expect(v[0].photos.map((p) => p.index)).toEqual([1, 0]);
  });
  it('无日期照片沉到最后', () => {
    const v = groupIntoVisits([photo(0, null, null), photo(1, '2026-07-02', '卢浮宫')]);
    expect(v[v.length - 1].date).toBeNull();
    expect(v[v.length - 1].key).toBe('未记日期|待选馆');
  });
});

describe('assignVenue 选馆回写', () => {
  it('按 key 回写场馆并刷新 key，其他组不动', () => {
    const v = groupIntoVisits([photo(0, '2026-07-02', null), photo(1, '2026-06-01', '卢浮宫')]);
    const next = assignVenue(v, '2026-07-02|待选馆', '上海博物馆');
    expect(next[0].venueName).toBe('上海博物馆');
    expect(next[0].key).toBe('2026-07-02|上海博物馆');
    expect(next[1]).toBe(v[1]);
  });
});

describe('isoDate', () => {
  it('本地时区 YYYY-MM-DD', () => {
    expect(isoDate(new Date(2026, 6, 2, 9, 30))).toBe('2026-07-02');
  });
});
