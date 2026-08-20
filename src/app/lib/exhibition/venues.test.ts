// 场馆层（地球博物馆数据底座）单测：种子完整性 / 名称匹配 / GPS 归馆 / 自定义场馆全生命周期。
import { describe, it, expect, beforeEach } from 'vitest';
import { MUSEUM_SEEDS, matchMuseum } from './catalog';
import {
  builtinVenues, customVenues, allVenues, venueById, matchVenue,
  nearestVenue, distanceKm, addCustomVenue, removeCustomVenue, venueVisitStats, VENUE_PREFIX,
} from './venues';
import { getUserMarksByKind, addUserMark, removeUserMark } from '../../data/userMarks';

function clearMuseumMarks() {
  for (const m of [...getUserMarksByKind('museum')]) removeUserMark(m.id);
  for (const m of [...getUserMarksByKind('exhibition')]) removeUserMark(m.id);
}

describe('MUSEUM_SEEDS 种子完整性（地球博物馆口径）', () => {
  it('id 全局唯一且非空', () => {
    const ids = MUSEUM_SEEDS.map((s) => s.id);
    expect(ids.every((id) => id && /^[a-z0-9-]+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('坐标合法（经度 ±180、纬度 ±90、非 0,0）', () => {
    for (const s of MUSEUM_SEEDS) {
      expect(Math.abs(s.lng)).toBeLessThanOrEqual(180);
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(s.lng) + Math.abs(s.lat)).toBeGreaterThan(0.01);
    }
  });
  it('每家都有国家/类型/城市，type 只能是 museum|gallery', () => {
    for (const s of MUSEUM_SEEDS) {
      expect(s.country.length).toBeGreaterThan(0);
      expect(s.city.length).toBeGreaterThan(0);
      expect(['museum', 'gallery']).toContain(s.type);
    }
  });
  it('海外场馆 ≥24 家（提交文档「24 个海外展馆坐标种子」口径成真）', () => {
    const domestic = new Set(['中国', '中国台湾', '中国香港']);
    const overseas = MUSEUM_SEEDS.filter((s) => !domestic.has(s.country));
    expect(overseas.length).toBeGreaterThanOrEqual(24);
  });
  it('总量 ≥60，博物馆美术馆并存（同一图层不拆家）', () => {
    expect(MUSEUM_SEEDS.length).toBeGreaterThanOrEqual(60);
    expect(MUSEUM_SEEDS.some((s) => s.type === 'gallery')).toBe(true);
    expect(MUSEUM_SEEDS.some((s) => s.type === 'museum')).toBe(true);
  });
  it('url 若有必须是 https 官网', () => {
    for (const s of MUSEUM_SEEDS) if (s.url) expect(s.url.startsWith('https://')).toBe(true);
  });
});

describe('matchMuseum 扩容后回归（旧别名不回摆 + 新馆可命中）', () => {
  it('旧种子别名照常命中', () => {
    expect(matchMuseum('大英')?.name).toBe('大英博物馆');
    expect(matchMuseum('在国博看了后母戊鼎')?.name).toBe('中国国家博物馆');
    expect(matchMuseum('Louvre')?.name).toBe('卢浮宫');
    expect(matchMuseum('台北故宫')?.name).toBe('国立故宫博物院');
  });
  it('新增海外馆命中（中英别名）', () => {
    expect(matchMuseum('MoMA')?.name).toBe('纽约现代艺术博物馆');
    expect(matchMuseum('泰特现代')?.name).toBe('泰特现代美术馆');
    expect(matchMuseum('奥赛博物馆')?.name).toBe('奥赛博物馆');
    expect(matchMuseum('Rijksmuseum')?.name).toBe('荷兰国立博物馆');
    expect(matchMuseum('乌菲兹')?.name).toBe('乌菲兹美术馆');
  });
  it('同名家族按长别名优先：National Gallery of Art ≠ 伦敦国家美术馆', () => {
    expect(matchMuseum('National Gallery of Art')?.name).toBe('美国国家美术馆');
    expect(matchMuseum('The National Gallery')?.name).toBe('英国国家美术馆');
    expect(matchMuseum('National Gallery Singapore')?.name).toBe('新加坡国家美术馆');
    expect(matchMuseum('Hong Kong Palace Museum')?.name).toBe('香港故宫文化博物馆');
    expect(matchMuseum('National Palace Museum')?.name).toBe('国立故宫博物院');
    expect(matchMuseum('Palace Museum')?.name).toBe('故宫博物院');
  });
  it('泛词不误命中', () => {
    expect(matchMuseum('博物馆')).toBeNull();
    expect(matchMuseum('美术馆')).toBeNull();
  });
});

describe('venues 统一视图与 GPS 归馆', () => {
  beforeEach(clearMuseumMarks);

  it('builtinVenues 与种子一一对应，venueById 可查', () => {
    expect(builtinVenues().length).toBe(MUSEUM_SEEDS.length);
    expect(venueById('louvre')?.name).toBe('卢浮宫');
    expect(venueById('不存在')).toBeNull();
  });
  it('nearestVenue：卢浮宫门口 300m 内归卢浮宫；太平洋中心归不了任何馆', () => {
    const hit = nearestVenue(48.8612, 2.3400, 2);
    expect(hit?.venue.id).toBe('louvre');
    expect(hit && hit.km < 1).toBe(true);
    expect(nearestVenue(0, -160, 2)).toBeNull();
  });
  it('distanceKm 数量级正确（伦敦→巴黎 ≈ 340km）', () => {
    const km = distanceKm(51.5194, -0.1270, 48.8606, 2.3376);
    expect(km).toBeGreaterThan(300);
    expect(km).toBeLessThan(400);
  });

  it('自定义场馆：添加→匹配→GPS 归馆→删除 全生命周期', () => {
    const { venue, pinned } = addCustomVenue({ name: '西岸美术馆', city: '上海', type: 'gallery', lng: 121.4550, lat: 31.1770 });
    expect(pinned).toBe(true);
    expect(customVenues().length).toBe(1);
    expect(allVenues()[0].custom).toBe(true);                    // 自定义排最前
    expect(matchVenue('西岸美术馆')?.id).toBe(venue.id);          // 名称命中
    expect(matchVenue('在西岸美术馆看了展')?.id).toBe(venue.id);   // 句子子串命中
    expect(nearestVenue(31.1772, 121.4553)?.venue.id).toBe(venue.id);
    // 幂等：同名同坐标重复添加不重钉
    addCustomVenue({ name: '西岸美术馆', city: '上海', type: 'gallery', lng: 121.4550, lat: 31.1770 });
    expect(customVenues().length).toBe(1);
    removeCustomVenue(venue.id);
    expect(customVenues().length).toBe(0);
  });
  it('matchVenue：内建优先于自定义，短查询（<2字）不匹配', () => {
    addCustomVenue({ name: '卢浮宫咖啡角', lng: 2.34, lat: 48.86 });
    expect(matchVenue('卢浮宫')?.id).toBe('louvre');             // 内建种子语义不被自定义覆盖
    expect(matchVenue('馆')).toBeNull();
  });
  it('自定义场馆坐标不抖散（真实地点必须落准）', () => {
    addCustomVenue({ name: '테스트미술관', lng: 127.0000, lat: 37.5000 });
    const mark = getUserMarksByKind('museum')[0];
    expect(mark.lng).toBeCloseTo(127.0000, 6);
    expect(mark.lat).toBeCloseTo(37.5000, 6);
    expect(mark.id.startsWith(VENUE_PREFIX)).toBe(true);
  });

  it('venueVisitStats：按馆聚合我的展品，最近观展日期在前', () => {
    addUserMark({ id: 'uex-a', kind: 'exhibition', lng: 2.33, lat: 48.86, label: '胜利女神', meta: { museum: '卢浮宫', nameZh: '萨莫色雷斯的胜利女神', visitDate: '2026-06-01' } });
    addUserMark({ id: 'uex-b', kind: 'exhibition', lng: 2.33, lat: 48.86, label: '蒙娜丽莎', meta: { museum: '卢浮宫', nameZh: '蒙娜丽莎', visitDate: '2026-07-02' } });
    addUserMark({ id: 'uex-c', kind: 'exhibition', lng: -0.12, lat: 51.51, label: '罗塞塔石碑', meta: { museum: '大英博物馆', nameZh: '罗塞塔石碑', visitDate: '2026-05-20' } });
    const stats = venueVisitStats('卢浮宫');
    expect(stats.count).toBe(2);
    expect(stats.lastVisit).toBe('2026-07-02');
    expect(stats.items[0].name).toBe('蒙娜丽莎');
    expect(venueVisitStats('大英博物馆').count).toBe(1);
    expect(venueVisitStats('没去过的馆').count).toBe(0);
  });
});
