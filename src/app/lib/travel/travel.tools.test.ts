// travel 真工具层单测：纯函数部分（票务深链 / 天气映射 / OSM kind 映射）。网络调用不进单测（预览/线上验证）。
import { describe, it, expect } from 'vitest';
import { flightLink, trainLink, hotelLink, addDays, cityCode, seatSummary } from './tickets';
import { wmoText, weatherLine, rainAdvice, type DailyWeather } from './weather';
import { tagOfOsmKind, noteOfOsmKind } from './discover';

describe('票务深链', () => {
  it('机票：两端有城市码 → 携程精确航线页', () => {
    const { url, exact } = flightLink('上海', '成都', '2026-08-01');
    expect(exact).toBe(true);
    expect(url).toBe('https://flights.ctrip.com/online/list/oneway-sha-ctu?depdate=2026-08-01');
  });
  it('机票：京都映射到大阪机场（osa）', () => {
    expect(cityCode('京都')).toBe('osa');
  });
  it('机票：未知城市 → 退 Trip.com 首页（exact=false，不出死链）', () => {
    const { url, exact } = flightLink('义乌', '京都', '2026-08-01');
    expect(exact).toBe(false);
    expect(url).toContain('trip.com/flights');
  });
  it('火车票：中文站名直传携程 H5', () => {
    const url = trainLink('上海', '杭州', '2026-08-01');
    expect(url).toContain('trains.ctrip.com/webapp/train/list');
    expect(decodeURIComponent(url)).toContain('dStation=上海');
    expect(decodeURIComponent(url)).toContain('aStation=杭州');
    expect(url).toContain('dDate=2026-08-01');
  });
  it('酒店：Booking 城市+入住退房', () => {
    const url = hotelLink('杭州', '2026-08-01', '2026-08-03');
    expect(decodeURIComponent(url)).toContain('ss=杭州');
    expect(url).toContain('checkin=2026-08-01');
    expect(url).toContain('checkout=2026-08-03');
  });
  it('addDays 跨月正确', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-08-01', 2)).toBe('2026-08-03');
  });
  it('seatSummary：报有戏的席别，最多 3 项；全无票如实说', () => {
    expect(seatSummary({ 二等: '有', 一等: '2', 商务: '无', 硬卧: '' })).toBe('二等·有 · 一等 2');
    expect(seatSummary({ 二等: '无', 硬座: '无' })).toBe('无票/候补');
    expect(seatSummary({ 二等: '有', 一等: '有', 硬卧: '有', 软卧: '有' })).toBe('二等·有 · 一等·有 · 硬卧·有');
  });
});

describe('天气映射', () => {
  it('WMO 码 → 中文', () => {
    expect(wmoText(0).label).toBe('晴');
    expect(wmoText(63).label).toBe('雨');
    expect(wmoText(95).label).toBe('雷暴');
    expect(wmoText(999).label).toBe('未知');
  });
  it('weatherLine 组装：温度取整、低降水不显示', () => {
    const line = weatherLine({ date: '2026-08-01', code: 1, tmax: 31.6, tmin: 24.2, rain: 10 });
    expect(line).toContain('多云');
    expect(line).toContain('24~32°C');
    expect(line).not.toContain('降水');
  });
  it('rainAdvice：≥60% 才触发并点名哪天', () => {
    const days: DailyWeather[] = [
      { date: 'd1', code: 0, tmax: 30, tmin: 22, rain: 10 },
      { date: 'd2', code: 63, tmax: 26, tmin: 21, rain: 85 },
    ];
    expect(rainAdvice(days)).toContain('第2天');
    expect(rainAdvice([days[0]])).toBeNull();
  });
});

describe('OSM kind 映射', () => {
  it('museum/gallery → 艺术；viewpoint → 自然；restaurant → 美食', () => {
    expect(tagOfOsmKind('museum')).toBe('艺术');
    expect(tagOfOsmKind('viewpoint')).toBe('自然');
    expect(tagOfOsmKind('restaurant')).toBe('美食');
    expect(tagOfOsmKind('attraction')).toBe('历史');
    expect(tagOfOsmKind('')).toBe('小众');
  });
  it('note 标明 OSM 实景来源', () => {
    expect(noteOfOsmKind('museum')).toContain('OpenStreetMap');
  });
});
