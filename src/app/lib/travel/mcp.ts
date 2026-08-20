// 协作层（外部数据·只读）：经 server.mjs /api/travel-mcp 代理调 OSM(地理编码/POI) + Open-Meteo(天气)。
// 前端绝不直连（守 UA / CORS / 限频）。红线：只查询，无任何下单 / 支付端点。
// 任何失败（无网 / 限频 / 超时 / 线上未代理）静默返回 null/空，调用方走本地兜底——绝不阻断主流程。
async function mcp<T>(tool: string, params: Record<string, string>): Promise<T | null> {
  try {
    const qs = new URLSearchParams({ tool, ...params }).toString();
    const r = await fetch(`/api/travel-mcp?${qs}`, { signal: AbortSignal.timeout(11000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d && !d.error ? (d as T) : null;
  } catch { return null; }
}

// OSM 地理编码：任意城市名 → 坐标。本地字典 miss 时的兜底，让「字典外的任意城市」也能钉地球。
export async function geocodeViaOSM(city: string): Promise<{ lng: number; lat: number; name: string } | null> {
  const c = (city || '').trim(); if (!c) return null;
  const d = await mcp<{ lng: number; lat: number; name: string }>('geocode', { q: c });
  return d && isFinite(d.lng) && isFinite(d.lat) ? { lng: d.lng, lat: d.lat, name: d.name || c } : null;
}

// OSM 周边 POI（Overpass）：景点 / 餐厅 / 咖啡。给「真实地图补点」用（catalog 没有的城市）。
export async function poiViaOSM(lat: number, lng: number, kind: 'tourism' | 'restaurant' | 'cafe' = 'tourism', radius = 1500): Promise<{ name: string; lat: number; lng: number; kind: string }[]> {
  const d = await mcp<{ pois: { name: string; lat: number; lng: number; kind: string }[] }>('poi', { lat: String(lat), lng: String(lng), kind, radius: String(radius) });
  return d?.pois || [];
}

// Open-Meteo 当前天气（给行程卡配一句实时天气用）。
export async function weatherViaOSM(lat: number, lng: number): Promise<{ temp: number; code: number } | null> {
  return mcp<{ temp: number; code: number }>('weather', { lat: String(lat), lng: String(lng) });
}

// Open-Meteo 逐日预报：出行日期起 days 天（上游上限 16 天，超窗返回 null → UI 隐藏天气行）。
import type { DailyWeather } from './weather';
export async function forecastViaOSM(lat: number, lng: number, date: string, days: number): Promise<DailyWeather[] | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = await mcp<{ daily: DailyWeather[] }>('weather', { lat: String(lat), lng: String(lng), date, days: String(Math.max(1, days)) });
  return Array.isArray(d?.daily) && d.daily.length ? d.daily : null;
}

// ── 增强层（都叠在深链兜底之上，null=不可用→UI 只留深链，绝不空转）──

// 12306 余票（只读；境外服务器可能被限 → null）。中文站名直传，服务端查电报码。
export interface TrainRow {
  code: string; from: string; to: string; dep: string; arr: string; dur: string; canBuy: boolean;
  seats: Record<string, string>;
}
export async function trainsViaMcp(from: string, to: string, date: string): Promise<TrainRow[] | null> {
  const d = await mcp<{ rows: TrainRow[] }>('trains', { from, to, date });
  return Array.isArray(d?.rows) && d.rows.length ? d.rows : null;
}

// Amadeus 机票参考价（服务端没配 key / 无报价 → null）。传 IATA 城市三字码。
export interface FlightRef { min: number; currency: string; count: number; carrier?: string }
export async function flightRefViaMcp(fromCode: string, toCode: string, date: string): Promise<FlightRef | null> {
  const d = await mcp<FlightRef>('flights', { from: fromCode, to: toCode, date });
  return d && isFinite(d.min) && d.min > 0 ? d : null;
}

// OSRM 站间驾车路线：一天最多 5 个途经点一次算完各段（km/min）。
export async function routeViaMcp(points: { lng: number; lat: number }[]): Promise<{ km: number; min: number }[] | null> {
  if (points.length < 2) return null;
  const coords = points.slice(0, 5).map((p) => `${p.lng},${p.lat}`).join(';');
  const d = await mcp<{ legs: { km: number; min: number }[] }>('route', { coords });
  return Array.isArray(d?.legs) && d.legs.length ? d.legs : null;
}
