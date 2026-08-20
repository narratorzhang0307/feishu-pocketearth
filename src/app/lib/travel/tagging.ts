// 协作层（A 线）：脱敏文本（多张截图）→ 云端 Qwen JSON → TripArchive 草稿。
// 强约束 JSON +「绝不编造」+ 忽略 *** 脱敏占位。结构在代码层组装（白名单字段），不靠 prompt 当保证。
import { slug, type RawShot, type TripArchive, type Segment, type Stay, type Spot, type TripMode } from './types';
import { enrichJSON } from '../skills/enrichEntity';

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
const pick = (x: unknown, k: string): unknown => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const MODES = new Set(['train', 'flight', 'bus', 'car']);
const asMode = (x: unknown): TripMode | undefined => { const s = str(x); return MODES.has(s) ? (s as TripMode) : undefined; };

// 多张脱敏文本 → 一次旅程的结构化草稿。读不出关键信息或云脑不可用 → null（上层走手填兜底）。
export async function structureTrip(shots: RawShot[]): Promise<TripArchive | null> {
  if (!shots.length) return null;
  const corpus = shots.map((s, i) => `【截图${i + 1}】\n${s.text}`).join('\n\n');
  const system = '你是行程整理助手。给定多张旅行票据/订单截图的 OCR 文本（已脱敏），提炼成一次完整旅程的结构化 JSON。'
    + '只输出一个 JSON：{"title":"一句话行程名(如 6月京都之旅)","dateStart":"YYYY-MM-DD","dateEnd":"YYYY-MM-DD",'
    + '"cities":["途经城市(中文)"],"segments":[{"mode":"train|flight|bus|car","code":"车次/航班号","date":"YYYY-MM-DD","fromCity":"中文城市","toCity":"中文城市"}],'
    + '"stays":[{"hotel":"酒店名","city":"中文城市","checkIn":"YYYY-MM-DD","checkOut":"YYYY-MM-DD"}],"spots":[{"name":"景点","city":"中文城市","date":"YYYY-MM-DD"}]}。'
    + '城市一律用中文。日期统一 YYYY-MM-DD。读不出的字段省略或留空，绝不编造车次/酒店/景点/城市。文本里的 *** 是已脱敏的隐私信息，忽略、不要试图还原。';
  const prompt = `${corpus}\n\n请输出这次旅程的 TripArchive JSON。`;
  try {
    // 云脑要结构化 JSON 走 enrichEntity skill（超时 + withRetry 瞬时退避重试 + 稳健解析）；嵌套结构按白名单在下面组装。
    const o = await enrichJSON<Record<string, unknown>>({ prompt, system });
    if (!o) return null;

    const segments: Segment[] = arr(pick(o, 'segments')).map((x) => ({
      mode: asMode(pick(x, 'mode')), code: str(pick(x, 'code')), date: str(pick(x, 'date')),
      fromCity: str(pick(x, 'fromCity')), toCity: str(pick(x, 'toCity')),
    })).filter((s) => s.fromCity || s.toCity || s.code);
    const stays: Stay[] = arr(pick(o, 'stays')).map((x) => ({
      hotel: str(pick(x, 'hotel')), city: str(pick(x, 'city')), checkIn: str(pick(x, 'checkIn')), checkOut: str(pick(x, 'checkOut')),
    })).filter((s) => s.hotel || s.city);
    const spots: Spot[] = arr(pick(o, 'spots')).map((x) => ({
      name: str(pick(x, 'name')), city: str(pick(x, 'city')), date: str(pick(x, 'date')),
    })).filter((s) => s.name);

    const cities = [...new Set([
      ...arr(pick(o, 'cities')).map(str),
      ...segments.flatMap((s) => [s.fromCity, s.toCity]),
      ...stays.map((s) => s.city), ...spots.map((s) => s.city),
    ].filter(Boolean) as string[])];

    if (!cities.length && !segments.length && !stays.length && !spots.length) return null;
    const title = str(pick(o, 'title')) || (cities[0] ? `${cities[0]}之旅` : '我的旅程');
    return {
      id: `tarc-${slug(title)}-${Date.now()}`, title,
      dateStart: str(pick(o, 'dateStart')) || undefined, dateEnd: str(pick(o, 'dateEnd')) || undefined,
      cities, segments, stays, spots, confidence: 0.6,
    };
  } catch { return null; }
}
