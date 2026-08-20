// 推理层：按喜好/画像给 POI 排序 + 分天。
// 排序三级（隐私边界见 profile.ts：画像只走云脑；端侧只按旅行偏好、绝不碰画像；本地命中度兜底）：
//   ① 云脑（/api/frost-llm）注入跨域画像 → 按「你的口味」挑（线上主力，真实有效）
//   ② 端侧真后端（edgeSafe.available() 非 stub 才信）→ 按旅行偏好挑（不碰画像，合规）
//   ③ 本地命中度 → prefs.includes(tag) 确定性兜底
// 关键修正：端侧 Gemma 未加载时 edgeSafe.rank 返回空数组，
// 导致线上其实没按画像/偏好挑、只按 catalog 原始顺序排。这里改为 available() 判 stub + 云脑优先。
import { edgeSafe } from '../../../../frost-agent/edge/contract';
import type { Destination, Pref, DayPlan, PlanMode, POI, StopGuide, TravelPlannerTrace } from './types';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });
}

// 从 LLM 文本里抠出第一个 JSON 对象（容忍 ```json 包裹与前后废话）。抄 movie/tagging。
function extractJSON(text: string): unknown | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const s = body.indexOf('{'); const e = body.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(body.slice(s, e + 1)); } catch { return null; }
}

// ① 云脑画像排序：注入跨域长期画像，返回与候选同序的 0-1 分数数组；任何不达标 → null（交回上层降级）。
export async function cloudRankPOIs(dest: Destination, prefs: Pref[], memoryBlock: string): Promise<number[] | null> {
  const cand = dest.pois.map((p, i) => `${i}. ${p.name}（${p.tag}）${p.note}`);
  const system = '你是私人旅行选址助手。给定这位用户的长期口味画像 + 本次旅行偏好 + 候选地点，'
    + '为每个候选打一个 0~1 的「适合这位用户」分（越懂他越高）。要结合画像里的电影/读书/音乐气质做迁移判断：'
    + '偏爱文艺/历史/作者电影的人，博物馆、老城、书店类给更高分；爱热闹/夜生活的，夜市、酒吧街给更高分；偏小众的，避开最大众的打卡点。'
    + '只输出一个 JSON：{"scores":[按候选编号顺序的分数数组]}，数组长度必须严格等于候选数，不要任何解释或代码块标记。';
  const prompt = `${memoryBlock || '（暂无长期画像，仅按本次偏好）'}\n\n本次旅行偏好：${prefs.join('、') || '随便逛逛'}\n目的地：${dest.name}\n候选地点：\n${cand.join('\n')}\n请输出 scores JSON。`;
  try {
    const ac = new AbortController();
    const r = await withTimeout(fetch('/api/frost-llm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, system, json: true }),
      signal: ac.signal,
    }), 20000).catch((e) => { ac.abort(); throw e; });   // 超时/失败时主动断掉在途 fetch，不留挂起请求
    const data = await r.json();
    const obj = extractJSON(String(data?.text || '')) as { scores?: unknown } | null;
    const arr = obj?.scores;
    if (!Array.isArray(arr) || arr.length !== dest.pois.length) return null;
    const nums = arr.map((x) => (typeof x === 'number' ? x : (typeof x === 'string' ? parseFloat(x) : NaN)));
    if (nums.some((n) => !isFinite(n))) return null;
    return nums.map((n) => Math.max(0, Math.min(1, n)));   // 钳到 0-1，防越界
  } catch { return null; }
}

// ② 端侧真后端排序：仅当 available() 为真（非 stub、非离线）才信；只按旅行偏好、不注入画像（隐私边界）。
async function edgeRankPOIs(dest: Destination, prefs: Pref[]): Promise<number[] | null> {
  try {
    if (!(await edgeSafe.available())) return null;   // stub / 离线 → 跳过，绝不用线性递减假分
    const cand = dest.pois.map((p) => `${p.name}（${p.tag}）${p.note}`);
    const s = await edgeSafe.rank(`我的旅行偏好：${prefs.join('、') || '随便逛逛'}`, cand);
    return (s.length === dest.pois.length && s.some((x) => x > 0)) ? s : null;
  } catch { return null; }
}

// 排序总入口：三级降级。返回分数（可空）+ 实际来源 mode（对用户透明）。
export async function rankPOIs(dest: Destination, prefs: Pref[], memoryBlock: string): Promise<{ scores: number[] | null; mode: PlanMode }> {
  const cloud = await cloudRankPOIs(dest, prefs, memoryBlock);
  if (cloud) return { scores: cloud, mode: '云脑' };
  const edge = await edgeRankPOIs(dest, prefs);
  if (edge) return { scores: edge, mode: '端侧' };
  return { scores: null, mode: '本地' };
}

export interface PlanTripOptions {
  pace?: TravelPlannerTrace['pace'];
  crowdTolerance?: TravelPlannerTrace['crowdTolerance'];
  mixStrategy?: TravelPlannerTrace['mixStrategy'];
  walkingLimitKm?: number | null;
  compactRoute?: boolean;
  mustVisit?: string[];
  maxStopsPerDay?: number | null;
}

function distanceKm(a: POI, b: POI): number {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function matchesAny(poi: POI, terms: string[]): boolean {
  const text = `${poi.name} ${poi.tag} ${poi.note}`.toLowerCase();
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function planRationale(options: PlanTripOptions, stops: POI[], optionalFromIndex?: number): string {
  const parts: string[] = [];
  if (options.pace === 'slow') parts.push('慢节奏留空档');
  else if (options.pace === 'fast') parts.push('紧凑多体验');
  if (options.compactRoute || options.walkingLimitKm) parts.push('地理邻近少绕路');
  if (options.crowdTolerance === 'low') parts.push('优先小众');
  if (options.mixStrategy === 'balanced') parts.push('主题交错');
  else if (options.mixStrategy === 'theme_day') parts.push('同日聚合主题');
  if (!parts.length) parts.push('按口味与距离组合');
  const count = optionalFromIndex == null
    ? `${stops.length}站`
    : `${optionalFromIndex}主站+${stops.length - optionalFromIndex}机动`;
  return `${parts.join(' · ')} · ${new Set(stops.map((stop) => stop.tag)).size}类${count}`;
}

// 分天计划：LoRA 只给约束；宿主按约束确定站数、主题多样性和地理顺序。
// “少走路”只作为紧凑路线目标，不把直线距离冒充真实步行里程；真实路网仍交给下游 OSRM。
export function planTrip(
  dest: Destination,
  prefs: Pref[],
  days: number,
  scores?: number[],
  options: PlanTripOptions = {},
): DayPlan[] {
  const paceDefault = options.pace === 'fast' ? 5 : 4;
  const perDay = options.maxStopsPerDay || paceDefault;
  const total = Math.min(dest.pois.length, Math.max(perDay, days * perDay));
  const mustVisit = options.mustVisit || [];
  const tagCounts = new Map<Pref, number>();
  const remaining = dest.pois.map((p, i) => {
    const edge = scores && scores.length === dest.pois.length ? scores[i] : 0;
    const local = prefs.includes(p.tag) ? 2 : 0;
    const must = matchesAny(p, mustVisit) ? 100 : 0;
    const quiet = options.crowdTolerance === 'low' && p.tag === '小众' ? 1.5 : 0;
    return { p, base: edge * 3 + local + must + quiet + (dest.pois.length - i) * 0.01 };
  });

  const picked: Array<{ p: POI; base: number }> = [];
  while (picked.length < total && remaining.length) {
    remaining.sort((a, b) => {
      const diversity = (item: { p: POI; base: number }) => {
        const used = tagCounts.get(item.p.tag) || 0;
        if (options.mixStrategy === 'balanced') return used === 0 ? 1.25 : -used * 0.75;
        return 0;
      };
      return (b.base + diversity(b)) - (a.base + diversity(a));
    });
    const next = remaining.shift()!;
    picked.push(next);
    tagCounts.set(next.p.tag, (tagCounts.get(next.p.tag) || 0) + 1);
  }

  const plans: DayPlan[] = [];
  const unassigned = [...picked];
  const activeDays = Math.min(days, total);
  const baseStops = Math.floor(total / activeDays);
  const extraStops = total % activeDays;
  for (let day = 0; day < activeDays && unassigned.length; day += 1) {
    const targetStops = baseStops + (day < extraStops ? 1 : 0);
    const stops: POI[] = [unassigned.shift()!.p];
    while (stops.length < targetStops && unassigned.length) {
      const previous = stops[stops.length - 1];
      const usedTags = new Set(stops.map((stop) => stop.tag));
      unassigned.sort((a, b) => {
        const routeWeight = options.compactRoute || options.walkingLimitKm ? 1.25 : 0.18;
        const aDistance = distanceKm(previous, a.p) * routeWeight;
        const bDistance = distanceKm(previous, b.p) * routeWeight;
        const aTheme = options.mixStrategy === 'balanced' && !usedTags.has(a.p.tag) ? 1 : 0;
        const bTheme = options.mixStrategy === 'balanced' && !usedTags.has(b.p.tag) ? 1 : 0;
        const aThemeDay = options.mixStrategy === 'theme_day' && a.p.tag === stops[0].tag ? 1 : 0;
        const bThemeDay = options.mixStrategy === 'theme_day' && b.p.tag === stops[0].tag ? 1 : 0;
        return (b.base + bTheme + bThemeDay - bDistance) - (a.base + aTheme + aThemeDay - aDistance);
      });
      stops.push(unassigned.shift()!.p);
    }
    const optionalFromIndex = options.pace === 'slow' && !options.maxStopsPerDay && stops.length >= 4
      ? stops.length - 1
      : undefined;
    plans.push({ day: day + 1, stops, optionalFromIndex, rationale: planRationale(options, stops, optionalFromIndex) });
  }
  return plans;
}

const VISIT_GUIDE: Record<Pref, { duration: string; verify: string }> = {
  美食: { duration: '建议 60–90 分钟', verify: '出发前确认营业、排队情况与忌口选择' },
  历史: { duration: '建议 75–120 分钟', verify: '出发前确认开放时间、预约与临时闭馆通知' },
  自然: { duration: '建议 60–120 分钟', verify: '出发前确认天气、体力要求与现场封闭情况' },
  艺术: { duration: '建议 90–120 分钟', verify: '出发前确认展期、预约要求与闭馆日' },
  夜生活: { duration: '建议 60–120 分钟', verify: '出发前确认晚间营业时间与返程交通' },
  小众: { duration: '建议 45–75 分钟', verify: '出发前确认现场可进入状态与社区规则' },
  购物: { duration: '建议 60–90 分钟', verify: '出发前确认营业时间与退税规则' },
};

function periodFor(stop: POI, index: number, count: number): StopGuide['period'] {
  if (stop.tag === '夜生活') return '夜间';
  const periods: StopGuide['period'][] = count >= 4
    ? ['上午', '中午', '午后', '傍晚']
    : ['上午', '午后', '傍晚'];
  return periods[Math.min(index, periods.length - 1)];
}

/** 给已选路线补充可解释信息；只描述命中的规则和来源，不生成新的城市事实。 */
export function attachDayGuides(
  days: DayPlan[],
  prefs: Pref[],
  planner: TravelPlannerTrace,
  source: 'catalog' | 'osm',
): void {
  days.forEach((day) => {
    day.guides = day.stops.map((stop, index) => {
      const optional = day.optionalFromIndex != null && index >= day.optionalFromIndex;
      const reasons: string[] = [];
      if (prefs.includes(stop.tag)) reasons.push(`命中本次“${stop.tag}”偏好`);
      if (planner.crowdTolerance === 'low' && stop.tag === '小众') reasons.push('符合避开人潮');
      if (planner.mixStrategy === 'balanced') reasons.push('与同日其他站保持主题差异');
      if (planner.compactRoute) reasons.push('参与地理邻近组合');
      if (optional) reasons.push('作为当天的机动候选');
      if (!reasons.length) reasons.push(`补足当天的${stop.tag}体验`);
      const guide = VISIT_GUIDE[stop.tag];
      return {
        period: optional ? '机动' : periodFor(stop, index, day.optionalFromIndex ?? day.stops.length),
        duration: guide.duration,
        why: reasons.join('；'),
        verify: guide.verify,
        source: source === 'osm' ? 'OpenStreetMap 实时地点' : 'Pocket Earth 示例城市库',
      };
    });
  });
}
