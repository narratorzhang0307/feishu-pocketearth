// 类型层：行程 agent 的领域类型。B 线（规划）+ A 线（手动存档版 P0）。对齐 movie/types.ts。
export type Pref = '美食' | '历史' | '自然' | '艺术' | '夜生活' | '小众' | '购物';
export const PREFERENCES: Pref[] = ['美食', '历史', '自然', '艺术', '夜生活', '小众', '购物'];

export interface POI { name: string; tag: Pref; note: string; lng: number; lat: number }
export interface Destination { name: string; lng: number; lat: number; pois: POI[] }
export interface StopGuide {
  period: '上午' | '中午' | '午后' | '傍晚' | '夜间' | '机动';
  duration: string;
  why: string;
  verify: string;
  source: string;
}
// legs：站间驾车参考（OSRM 真实路网），legs[i] = stops[i]→stops[i+1] 的 km/min；查不到则缺省
export interface DayPlan {
  day: number;
  stops: POI[];
  /** 从该下标起为机动候选，不要求用户当天必须完成。 */
  optionalFromIndex?: number;
  legs?: { km: number; min: number }[];
  /** 由实际约束和确定性排程规则生成，不让模型编造。 */
  rationale?: string;
  guides?: StopGuide[];
}

// 排序来源（对用户透明）：云脑按你的跨域口味挑 / 端侧真后端挑 / 纯本地命中度兜底。
// 隐私边界：画像只走「云脑」；「端侧」只按旅行偏好不碰画像（profile.ts 注释的硬约束）。
export type PlanMode = '云脑' | '端侧' | '本地';

// date=出行日期（供逐日天气与票务深链）；fromCity=出发城市（选填，只用于票务深链）
export interface PlanInput {
  destName: string;
  prefs: Pref[];
  days: number;
  date?: string;
  fromCity?: string;
  /** 交给 Travel LoRA 的自然语言约束；不包含城市事实或完整个人数据库。 */
  requestText?: string;
}
import type { DailyWeather } from './weather';
export interface TravelPlannerTrace {
  schema: 'pocket.travel-intent/v1';
  source: 'qwen-lora' | 'rules';
  gate: 'parsed' | 'repaired' | 'fallback';
  baseModel: 'Qwen3-VL-2B-Instruct';
  adapter: 'Travel Planner LoRA';
  interests: Pref[];
  walkingLimitKm: number | null;
  compactRoute: boolean;
  avoid: string[];
  mustVisit: string[];
  dietary: string[];
  pace: 'slow' | 'balanced' | 'fast' | null;
  crowdTolerance: 'low' | 'medium' | 'high' | null;
  mixStrategy: 'balanced' | 'primary_secondary' | 'theme_day' | null;
  maxStopsPerDay: number | null;
  /** 量化 LoRA 漏可选槽位时，是否由同义规则补齐；用于 UI 如实披露。 */
  ruleAssist: boolean;
  raw: string;
  error?: string;
}
// source：候选点来源——catalog=本地精选库，osm=OpenStreetMap 实时检索（任意城市）
export interface TripPlan {
  dest: Destination; days: DayPlan[]; mode: PlanMode;
  source: 'catalog' | 'osm'; date?: string; weather?: DailyWeather[] | null;
  planner: TravelPlannerTrace;
  effectivePrefs: Pref[];
}

export type OnTravelPhase = (phase: string, detail?: string) => void;   // detail → RunTrace 云/端侧/本地 badge

// A 线（手动存档版 P0，无 OCR）：用户手填一个停留点 → 钉地球。
export type TripMode = 'train' | 'flight' | 'bus' | 'car' | 'walk';
export const TRIP_MODES: { key: TripMode; label: string }[] = [
  { key: 'train', label: '高铁/火车' }, { key: 'flight', label: '飞机' },
  { key: 'bus', label: '大巴' }, { key: 'car', label: '自驾' }, { key: 'walk', label: '步行/其他' },
];
// lng/lat 可选：上游若已解析出坐标（如 JOT 记一笔已走 resolvePlace 命中 Mapbox），直接带进来，
// 免 pin 层拿地名二次地理编码（Mapbox 常回繁体名 / 长尾城市，本地表+OSM 多半查不到 → 明明定位到了却钉不上）。
export interface ManualStop { city: string; date?: string; mode?: TripMode; note?: string; lng?: number; lat?: number }

// 稳定 id slug（中文保留，去空格标点）——钉点幂等、可去重、可撤销。
export const slug = (s: string) => (s || '').replace(/[\s·\-—:：,，.。!！?？'"'']/g, '').slice(0, 16);

// ── A 线（截图自动提炼，P1）：端侧 vision 读票据 → 端侧脱敏文本 → 云脑结构化 → TripArchive 多点钉 ──
// 隐私铁律：原图只进端侧 vision（浏览器 WebGPU），永不上云；只有「脱敏后的文本」才喂云脑做结构化。
export interface RawShot { id: string; text: string }   // 一张截图的「脱敏后」OCR/VL 文本（绝不含原图）
export interface Segment { mode?: TripMode; code?: string; date?: string; depTime?: string; fromCity?: string; toCity?: string }
export interface Stay { hotel?: string; city?: string; checkIn?: string; checkOut?: string }
export interface Spot { name?: string; city?: string; date?: string }
export interface TripArchive {
  id: string; title: string; dateStart?: string; dateEnd?: string;
  cities: string[]; segments: Segment[]; stays: Stay[]; spots: Spot[]; confidence: number;
}
export type OnArchivePhase = (phase: string, detail?: string) => void;   // detail → RunTrace badge

// 行程月份 → 季节（回流 seasons 字段用）。
export function seasonOf(date?: string): string | null {
  if (!date) return null;
  const m = Number(String(date).split(/[-/]/)[1]);   // 按分隔符取月份，容忍 '2026-6-15' / '2026/6/15' 非零填充
  if (!m || m < 1 || m > 12) return null;
  return m <= 2 || m === 12 ? '冬' : m <= 5 ? '春' : m <= 8 ? '夏' : '秋';
}
