import { runQwenAdapter } from '../../../../frost-agent/edge/httpQwenEdge';
import type { Pref, TravelPlannerTrace } from './types';

export const TRAVEL_INTENT_SCHEMA = 'pocket.travel-intent/v1' as const;
export const TRAINED_TRAVEL_INTENT_SCHEMA = 'shangjiequ.travel-intent/v1' as const;

// 保持与 LoRA 训练时的 system prompt 同分布；模型输出再由宿主适配成 Pocket 协议。
// 直接把 schema 名改成 pocket.* 会明显削弱已训练的字段和工具路由能力。
export const TRAINED_TRAVEL_SYSTEM_PROMPT = '你是“上街去”的离线旅行请求解析器。你只负责把用户需求转换成 shangjiequ.travel-intent/v1 JSON，并决定追问或调用本地工具；不背诵城市事实，不直接编造行程。硬约束必须原样保留。未知字段使用 null 或空数组，不得猜测。如果缺少目的地，或日期与天数都缺少，只追问一个最关键的问题并把 next_action 设为 ask_user；否则设为 call_tools。只输出一个 JSON 对象，不要 Markdown，不要解释。';

export interface PlannerIntentContext {
  destination: string;
  date: string;
  days: number;
  preferences: Pref[];
  requestText: string;
}

function firstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth !== 0) continue;
      try {
        const value = JSON.parse(text.slice(start, index + 1));
        return value && typeof value === 'object' && !Array.isArray(value)
          ? value as Record<string, unknown>
          : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** 只修复已在真实 MNN INT4 输出中出现过的多余根括号，不补写任何语义字段。 */
export function parsePlannerModelObject(text: string): { value: Record<string, unknown> | null; repaired: boolean } {
  const nextField = '(?=(?:next_action|tool_calls|missing_fields|clarification_question)"\\s*:)';
  const repairedText = text
    .replace(new RegExp('}}\\s*,\\s*\\{\\s*"' + nextField, 'g'), '},"')
    .replace(new RegExp('}\\s*,\\s*\\{\\s*"' + nextField, 'g'), '},"');
  if (repairedText !== text) {
    const value = firstJsonObject(repairedText);
    if (value) return { value, repaired: true };
  }
  return { value: firstJsonObject(text), repaired: false };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function hasPlannerSemantics(value: Record<string, unknown>): boolean {
  return [
    'schema', 'destination', 'duration_days', 'preferences', 'constraints',
    'preference', 'duration', 'departure_date', 'hard_constraints', 'soft_constraints',
    'soft_preferences', 'query', 'slots', 'next_action', 'tool_calls',
  ].some((key) => key in value);
}

const PREF_TERMS: Record<Pref, string[]> = {
  美食: ['美食', '餐厅', '小吃', '咖啡', '饮食', 'food'],
  历史: ['历史', '古籍', '碑拓', '遗产', '古迹', 'heritage', 'history'],
  自然: ['自然', '公园', '山', '湖', '花', '徒步', 'nature'],
  艺术: ['艺术', '展览', '美术馆', '博物馆', '电影', '书店', 'art'],
  夜生活: ['夜生活', '酒吧', '夜市', 'livehouse', 'nightlife'],
  小众: ['小众', '本地人', '冷门', '避开游客', 'quiet'],
  购物: ['购物', '市集', '商场', '买', 'shopping'],
};

export function interestsToPreferences(values: string[]): Pref[] {
  const corpus = values.join(' ').toLowerCase();
  return (Object.entries(PREF_TERMS) as Array<[Pref, string[]]>)
    .filter(([, terms]) => terms.some((term) => corpus.includes(term.toLowerCase())))
    .map(([pref]) => pref);
}

function localAvoidTerms(text: string): string[] {
  return [...text.matchAll(/(?:不去|不要|避开|排除)\s*([^，。；,;]{1,12})/g)]
    .map((match) => match[1].trim().replace(/^(?:太|所有)/, ''))
    .filter((term) => Boolean(term) && !/(?:重复|同一类|人多|拥挤|热门|游客|走路|步行)/.test(term));
}

function localMustVisitTerms(text: string): string[] {
  return [...text.matchAll(/(?:必去|必须去|一定要去)\s*([^，。；,;]{2,20})/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function explicitWalkingLimit(text: string): number | null {
  const match = text.match(/(?:步行|走路)(?:上限|不超过|最多|控制在)?\s*(\d+(?:\.\d+)?)\s*(?:公里|km)/i);
  return match ? Number(match[1]) : null;
}

function localCompactRoute(text: string): boolean {
  return /少走|少步行|别走太多|不想走|少绕路|少走回头路|walking/i.test(text);
}

function explicitStopsPerDay(text: string): number | null {
  const match = text.match(/每天(?:最多|不超过|安排)?\s*(\d+)\s*(?:个|处|站|地点)/);
  if (!match) return null;
  return Math.max(1, Math.min(6, Number(match[1])));
}

function normalizePace(value: unknown): TravelPlannerTrace['pace'] {
  const text = String(value || '').toLowerCase();
  if (/slow|relax|悠闲|松弛|慢/.test(text)) return 'slow';
  if (/fast|compact|紧凑|特种兵|快/.test(text)) return 'fast';
  if (/balanced|适中|平衡/.test(text)) return 'balanced';
  return null;
}

function normalizeCrowd(value: unknown): TravelPlannerTrace['crowdTolerance'] {
  const text = String(value || '').toLowerCase();
  if (/low|低|避开|清静|安静/.test(text)) return 'low';
  if (/high|高|热闹/.test(text)) return 'high';
  if (/medium|中|适中/.test(text)) return 'medium';
  return null;
}

function normalizeMix(value: unknown): TravelPlannerTrace['mixStrategy'] {
  const text = String(value || '').toLowerCase();
  if (/theme.day|主题分天|主题日/.test(text)) return 'theme_day';
  if (/primary|主次|为主/.test(text)) return 'primary_secondary';
  if (/balanced|平衡|均衡|多样|不重复/.test(text)) return 'balanced';
  return null;
}

function localPace(text: string): TravelPlannerTrace['pace'] {
  if (/松弛|悠闲|慢慢|不要太赶|不赶|慢节奏/.test(text)) return 'slow';
  if (/特种兵|紧凑|高强度|多安排|快节奏/.test(text)) return 'fast';
  return null;
}

function localCrowd(text: string): TravelPlannerTrace['crowdTolerance'] {
  if (/(?:避开|不想|不要|讨厌).*(?:人多|游客|拥挤|排队|热门)|清静|清净/.test(text)) return 'low';
  if (/喜欢热闹|人多也行/.test(text)) return 'high';
  return null;
}

function localMix(text: string): TravelPlannerTrace['mixStrategy'] {
  if (/按主题分天|主题日/.test(text)) return 'theme_day';
  if (/以.+为主|主次/.test(text)) return 'primary_secondary';
  if (/不要.*(?:重复|同一类|一种主题)|均衡|多样|丰富|混合/.test(text)) return 'balanced';
  return null;
}

function localDietary(text: string): string[] {
  return ['素食', '清真', '无麸质', '不吃辣', '海鲜过敏', '坚果过敏'].filter((term) => text.includes(term));
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

export function buildPlannerPrompt(context: PlannerIntentContext): string {
  const text = context.requestText.trim();
  const hints = [
    localPace(text) === 'slow' ? '节奏悠闲。' : localPace(text) === 'fast' ? '节奏紧凑。' : '',
    localCrowd(text) === 'low' ? '拥挤容忍度低，优先避开人潮。' : '',
    localMix(text) === 'balanced' ? '请均衡混合不同主题，不要连续重复同一类地点。' : '',
    localMix(text) === 'theme_day' ? '按主题分天。' : '',
    explicitWalkingLimit(text) ? `每天步行上限约 ${explicitWalkingLimit(text)} 公里。` : '',
    localCompactRoute(text) && !explicitWalkingLimit(text) ? '请按地理邻近安排，尽量少绕路；用户没有给出公里数，不要猜测步行上限。' : '',
    explicitStopsPerDay(text) ? `每天最多安排 ${explicitStopsPerDay(text)} 个地点。` : '',
  ].filter(Boolean);
  return [
    `帮我安排${context.destination}${context.days}日游。`,
    context.date ? `出行日期：${context.date}。` : '',
    `偏好${context.preferences.join('、') || '随意探索'}。`,
    text ? `用户补充原话：${text}` : '',
    ...hints,
    '目的地、日期和天数以界面填写为准，均已齐全；请解析完整约束并调用本地工具。',
    '城市事实由已加载的数据 Skills 提供，路线由确定性规划器计算。',
  ].filter(Boolean).join('\n');
}

export async function inferPlannerIntent(context: PlannerIntentContext): Promise<TravelPlannerTrace> {
  const localWalkingLimit = explicitWalkingLimit(context.requestText);
  const fallbackPace = localPace(context.requestText);
  const fallbackCrowd = localCrowd(context.requestText);
  const fallbackMix = localMix(context.requestText);
  const fallbackMaxStops = explicitStopsPerDay(context.requestText);
  const fallback: TravelPlannerTrace = {
    schema: TRAVEL_INTENT_SCHEMA,
    source: 'rules',
    gate: 'fallback',
    baseModel: 'Qwen3-VL-2B-Instruct',
    adapter: 'Travel Planner LoRA',
    interests: [...context.preferences],
    walkingLimitKm: localWalkingLimit,
    compactRoute: localCompactRoute(context.requestText),
    avoid: localAvoidTerms(context.requestText),
    mustVisit: localMustVisitTerms(context.requestText),
    dietary: localDietary(context.requestText),
    pace: fallbackPace,
    crowdTolerance: fallbackCrowd,
    mixStrategy: fallbackMix,
    maxStopsPerDay: fallbackMaxStops,
    ruleAssist: true,
    raw: '',
  };
  const response = await runQwenAdapter(buildPlannerPrompt(context), {
    system: TRAINED_TRAVEL_SYSTEM_PROMPT,
    json: true,
    adapter: 'travel-planner',
    maxTokens: 1024,
  });
  if (response.backend !== 'mnn' || !response.text) {
    return { ...fallback, error: response.error || 'mnn_runtime_unavailable' };
  }
  const parsed = parsePlannerModelObject(response.text);
  if (!parsed.value) return { ...fallback, raw: response.text, error: 'invalid_model_json' };
  if (!hasPlannerSemantics(parsed.value)) return { ...fallback, raw: response.text, error: 'invalid_model_contract' };

  const constraints = object(parsed.value.constraints);
  const hard = { ...constraints, ...object(parsed.value.hard_constraints) };
  const preferenceObject = object(parsed.value.preferences);
  const soft = {
    ...preferenceObject,
    ...object(parsed.value.soft_constraints),
    ...object(parsed.value.soft_preferences),
  };
  const slots = object(parsed.value.slots);
  const interestValues = [
    ...strings(soft.interests),
    ...strings(soft.experiences),
    ...strings(soft.cuisine),
    ...strings(soft.cuisines),
    ...strings(parsed.value.interests),
    ...strings(parsed.value.preferences),
    ...strings(parsed.value.preference),
    ...strings(slots.theme),
    context.requestText,
  ];
  const walking = Number(firstValue(hard.walking_limit_km, hard.max_walk_distance_km, hard.walking_limit));
  const modelWalking = Number.isFinite(walking) && walking > 0 ? walking : null;
  const modelPace = normalizePace(firstValue(soft.pace, soft.comfort_level));
  const modelCrowd = normalizeCrowd(firstValue(soft.crowd_tolerance, hard.crowd_tolerance))
    || (hard.avoid_popular_points === true ? 'low' : null);
  const modelMix = normalizeMix(firstValue(soft.mix_strategy, soft.theme_mix, hard.avoid_repetitions));
  const rawMaxStops = Number(firstValue(hard.max_stops_per_day, soft.max_stops_per_day, parsed.value.max_stops_per_day));
  const modelMaxStops = Number.isInteger(rawMaxStops) && rawMaxStops > 0 ? Math.min(6, rawMaxStops) : null;
  const modelAvoid = strings(hard.avoid);
  const modelMustVisit = [...strings(hard.must_visit), ...strings(constraints.must_visit)];
  const modelDietary = strings(hard.dietary);
  const ruleAssist = Boolean(
    (localWalkingLimit && !modelWalking)
    || (fallbackPace && !modelPace)
    || (fallbackCrowd && !modelCrowd)
    || (fallbackMix && !modelMix)
    || (fallbackMaxStops && !modelMaxStops)
    || fallback.avoid.some((value) => !modelAvoid.includes(value))
    || fallback.mustVisit.some((value) => !modelMustVisit.includes(value))
    || fallback.dietary.some((value) => !modelDietary.includes(value)),
  );
  return {
    ...fallback,
    source: 'qwen-lora',
    gate: parsed.repaired ? 'repaired' : 'parsed',
    interests: [...new Set([...context.preferences, ...interestsToPreferences(interestValues)])],
    walkingLimitKm: modelWalking || localWalkingLimit,
    compactRoute: Boolean(modelWalking || localCompactRoute(context.requestText)),
    avoid: [...new Set([...fallback.avoid, ...modelAvoid])],
    mustVisit: [...new Set([...fallback.mustVisit, ...modelMustVisit])],
    dietary: [...new Set([...fallback.dietary, ...modelDietary])],
    pace: modelPace || fallbackPace,
    crowdTolerance: modelCrowd || fallbackCrowd,
    mixStrategy: modelMix || fallbackMix,
    maxStopsPerDay: modelMaxStops || fallbackMaxStops,
    ruleAssist,
    raw: response.text,
  };
}
