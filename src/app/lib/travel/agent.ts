// 编排层：B 线规划流水线（读画像 → 三级排序 → 分天）。onPhase 回调供 UI 显示进度。舱壁降级不抛错。
// 对齐 movie/agent.ts：组件只调 runPlan，业务逻辑全在 lib（组件薄、lib 厚）。
import { assembleMemory } from '../memoryRouter';
import { destination } from './catalog';
import { discoverDestination } from './discover';
import { forecastViaOSM, routeViaMcp } from './mcp';
import { attachDayGuides, rankPOIs, planTrip } from './plan';
import { ocrShots } from './sense';
import { structureTrip } from './tagging';
import { inferPlannerIntent } from './intentRuntime';
import type { PlanInput, TripPlan, OnTravelPhase, TripArchive, OnArchivePhase } from './types';

// B 线规划：catalog 命中走本地精选库；miss 走 OSM 实时检索（任意城市）；找不到如实返回 null。
// RunTrace 纪律：每步【开始前】发 phase（耗时才会记在正确的步骤名下），结果落定后再补 mode/来源徽章。
export async function runPlan(input: PlanInput, onPhase?: OnTravelPhase): Promise<TripPlan | null> {
  const ph = onPhase || (() => {});

  // ① 定位候选：本地精选库 → OSM 真实检索（Nominatim 定位 + Overpass 拉景点/餐厅）
  let dest = destination(input.destName);
  let source: TripPlan['source'] = 'catalog';
  if (!dest) {
    ph('OSM 检索真实景点', 'OSM');
    dest = (await discoverDestination(input.destName)) ?? undefined;
    source = 'osm';
  }
  if (!dest) return null;

  // ② Travel LoRA 只把自然语言解析成固定协议；失败时显式回落相同字段的本地规则，
  // 不让基座/Gemma 冒充已加载的 LoRA，也不让模型直接生成景点事实。
  ph('Travel LoRA 理解约束', 'Qwen3-VL-2B');
  const planner = await inferPlannerIntent({
    destination: dest.name,
    date: input.date || '',
    days: input.days,
    preferences: input.prefs,
    requestText: input.requestText || '',
  });
  ph('需求协议通过', planner.source === 'qwen-lora' ? 'Travel LoRA' : '规则回退');
  const effectivePrefs = planner.interests.length ? [...planner.interests] : [...input.prefs];
  if (planner.crowdTolerance === 'low' && !effectivePrefs.includes('小众')) effectivePrefs.push('小众');
  if (planner.avoid.length) {
    const avoid = planner.avoid.map((term) => term.toLowerCase());
    const kept = dest.pois.filter((poi) => {
      const text = `${poi.name} ${poi.tag} ${poi.note}`.toLowerCase();
      return !avoid.some((term) => text.includes(term));
    });
    if (!kept.length) return null;
    if (kept.length !== dest.pois.length) dest = { ...dest, pois: kept };
  }

  // ③ 读跨域长期画像（电影/读书/音乐+travel）——只会被排序层按既有隐私边界使用，
  // 不写进 LoRA、不随模型权重绑定；书影音 Data Pack 可随时更换。
  ph('读取你的长期口味', '本地画像');
  const memoryBlock = assembleMemory({ domain: 'travel' });

  // ④ 候选排序仍只消费可替换数据；LoRA 不拥有候选地点。
  ph('按你的口味挑地点');
  const { scores, mode } = await rankPOIs(dest, effectivePrefs, memoryBlock);
  ph('排序完成', mode);

  // ⑤ 分天 + 出行日期的真实逐日天气（Open-Meteo；超 16 天预报窗/失败 → 无天气行，不阻断）
  const days = planTrip(dest, effectivePrefs, input.days, scores || undefined, {
    pace: planner.pace,
    crowdTolerance: planner.crowdTolerance,
    mixStrategy: planner.mixStrategy,
    walkingLimitKm: planner.walkingLimitKm,
    compactRoute: planner.compactRoute,
    mustVisit: planner.mustVisit,
    maxStopsPerDay: planner.maxStopsPerDay,
  });
  let weather: TripPlan['weather'] = null;
  if (input.date && days.length) {
    ph('查出行天气', 'Open-Meteo');
    weather = await forecastViaOSM(dest.lat, dest.lng, input.date, days.length);
  }

  // ⑥ 站间路线由确定性工具计算，模型不能绕过硬约束或编造里程。
  ph('算站间路线', 'OSRM');
  for (const d of days) {
    if (d.stops.length < 2) continue;
    const legs = await routeViaMcp(d.stops.map((s) => ({ lng: s.lng, lat: s.lat })));
    if (legs) d.legs = legs;
  }
  attachDayGuides(days, effectivePrefs, planner, source);
  ph('完成');
  return { dest, days, mode, source, date: input.date, weather, planner, effectivePrefs };
}

// A 线（截图提炼）编排：端侧 vision 读票据 → 端侧脱敏 → 云脑结构化 → TripArchive 草稿。
// 端侧未就绪（线上 stub / 没加载浏览器模型）→ reason='noEdge'，UI 引导加载端侧或走手动录入。
export async function runArchive(imageDataUrls: string[], onPhase?: OnArchivePhase): Promise<{ archive: TripArchive | null; shots: number; reason?: 'noEdge' | 'noStructure' }> {
  const ph = onPhase || (() => {});
  ph('端侧读票据');
  const shots = await ocrShots(imageDataUrls, (d, n) => ph(`端侧读票据 ${d}/${n}`));
  if (!shots.length) return { archive: null, shots: 0, reason: 'noEdge' };
  ph('整理成行程', '云脑结构化');
  const archive = await structureTrip(shots);
  ph('完成');
  return { archive, shots: shots.length, reason: archive ? undefined : 'noStructure' };
}

export { confirmTrip, pinManualStop, confirmArchive } from './pin';
