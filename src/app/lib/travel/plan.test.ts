import { describe, expect, it } from 'vitest';
import { attachDayGuides, planTrip } from './plan';
import type { Destination, TravelPlannerTrace } from './types';

const DESTINATION: Destination = {
  name: '测试城', lng: 120, lat: 30,
  pois: [
    { name: '热门古迹', tag: '历史', note: '古迹', lng: 120, lat: 30 },
    { name: '巷子书店', tag: '小众', note: '安静', lng: 120.001, lat: 30.001 },
    { name: '河边咖啡', tag: '美食', note: '咖啡', lng: 120.002, lat: 30.002 },
    { name: '城外公园', tag: '自然', note: '公园', lng: 120.2, lat: 30.2 },
    { name: '艺术中心', tag: '艺术', note: '展览', lng: 120.003, lat: 30.003 },
    { name: '夜间市集', tag: '夜生活', note: '夜市', lng: 120.004, lat: 30.004 },
    { name: '旧货市场', tag: '购物', note: '旧物', lng: 120.005, lat: 30.005 },
    { name: '山顶步道', tag: '自然', note: '步道', lng: 120.006, lat: 30.006 },
    { name: '河畔剧场', tag: '艺术', note: '演出', lng: 120.007, lat: 30.007 },
    { name: '深夜食堂', tag: '美食', note: '夜宵', lng: 120.008, lat: 30.008 },
  ],
};

describe('Travel deterministic strategy', () => {
  it('keeps a relaxed two-day trip useful with three core stops and one optional stop per day', () => {
    const days = planTrip(DESTINATION, ['历史', '美食'], 2, undefined, { pace: 'slow' });
    expect(days).toHaveLength(2);
    expect(days.map((day) => day.stops.length)).toEqual([4, 4]);
    expect(days.map((day) => day.optionalFromIndex)).toEqual([3, 3]);
    expect(days[0].rationale).toContain('慢节奏留空档');
    expect(days[0].rationale).toContain('3主站+1机动');
  });

  it('reduces to two stops only when the user explicitly asks for two', () => {
    const days = planTrip(DESTINATION, [], 2, undefined, { pace: 'slow', maxStopsPerDay: 2 });
    expect(days.map((day) => day.stops.length)).toEqual([2, 2]);
    expect(days.every((day) => day.optionalFromIndex == null)).toBe(true);
  });

  it('uses four core stops for balanced pace and five for fast pace', () => {
    expect(planTrip(DESTINATION, [], 1, undefined, { pace: 'balanced' })[0].stops).toHaveLength(4);
    expect(planTrip(DESTINATION, [], 1, undefined, { pace: 'fast' })[0].stops).toHaveLength(5);
  });

  it('prioritizes an explicit must-visit even when it is not a selected preference', () => {
    const days = planTrip(DESTINATION, ['历史'], 1, undefined, { pace: 'slow', mustVisit: ['艺术中心'] });
    expect(days.flatMap((day) => day.stops.map((stop) => stop.name))).toContain('艺术中心');
  });

  it('uses low crowd tolerance and balanced mix as executable ranking signals', () => {
    const days = planTrip(DESTINATION, [], 1, undefined, {
      crowdTolerance: 'low', mixStrategy: 'balanced', walkingLimitKm: 3,
    });
    expect(days[0].stops[0].name).toBe('巷子书店');
    expect(new Set(days[0].stops.map((stop) => stop.tag)).size).toBe(days[0].stops.length);
    expect(days[0].rationale).toContain('优先小众');
    expect(days[0].rationale).toContain('主题交错');
  });

  it('adds source-linked, non-factual guidance instead of model-written filler', () => {
    const days = planTrip(DESTINATION, ['美食', '小众'], 1, undefined, { pace: 'slow' });
    const planner: TravelPlannerTrace = {
      schema: 'pocket.travel-intent/v1', source: 'rules', gate: 'fallback',
      baseModel: 'Qwen3-VL-2B-Instruct', adapter: 'Travel Planner LoRA',
      interests: ['美食', '小众'], walkingLimitKm: null, compactRoute: true,
      avoid: [], mustVisit: [], dietary: [], pace: 'slow', crowdTolerance: 'low',
      mixStrategy: 'balanced', maxStopsPerDay: null, ruleAssist: true, raw: '',
    };
    attachDayGuides(days, ['美食', '小众'], planner, 'catalog');
    expect(days[0].guides).toHaveLength(4);
    expect(days[0].guides?.[0].why).toContain('命中本次');
    expect(days[0].guides?.[0].source).toBe('Pocket Earth 示例城市库');
    expect(days[0].guides?.[0].verify).toContain('出发前确认');
    expect(days[0].guides?.[3].why).toContain('机动候选');
    expect(days[0].guides?.[3].period).toBe('机动');
  });
});
