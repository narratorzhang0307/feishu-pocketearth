// 协作·子 agent 层：两个运行时子 agent。
// ① 补全子 agent：一次云脑（/api/frost-llm, json）强约束 JSON，出 导演/演员/类型/流派/剧情 + 取景地/故事地 + 补国家年份。
//    系统提示明确「不确定留空、禁编演员」——把幻觉压在 critic 护栏之前。
// ② 地理子 agent：取景地→故事地→国家逐级 geocode（经 resolvePlace：本地表→Mapbox 全球），返回 GeoTarget{kind} 让 UI 显示落点精度。
import { resolvePlace } from '../skills/resolvePlace';
import { movieCountry } from '../../data/movies';
import { enrichJSON } from '../skills/enrichEntity';
import { formatInstructions, type Shape } from '../skills/structured';
import type { GeoTarget } from './types';

// 云脑补全子 agent 的原始产出（全部可缺，缺则空）
export interface EnrichRaw {
  director: string;
  cast: string[];
  genre: string;
  movement: string;
  plot: string;
  country: string;
  year: number | null;
  filmingPlace: string;   // 主要取景城市（不确定留空）
  storyPlace: string;     // 故事发生城市（不确定留空）
}
const EMPTY: EnrichRaw = { director: '', cast: [], genre: '', movement: '', plot: '', country: '', year: null, filmingPlace: '', storyPlace: '' };

// 补全字段 schema（单一事实源）：formatInstructions 据此生成提示词字段清单。
const ENRICH_SHAPE: Shape = {
  director: { type: 'string', desc: '导演' },
  cast: { type: 'string[]', desc: '主演，最多 4 个' },
  genre: { type: 'string', desc: '主类型，如 剧情/科幻/爱情，单个' },
  movement: { type: 'string', desc: '流派或电影运动，如 法国新浪潮/作者电影/黑色电影，没有就空' },
  plot: { type: 'string', desc: '一句话剧情，不超过 40 字' },
  country: { type: 'string', desc: '主要出品国家/地区，中文' },
  year: { type: 'number', desc: '上映年份，数字或留空' },
  filmingPlace: { type: 'string', desc: '主要取景城市，中文，不确定就留空' },
  storyPlace: { type: 'string', desc: '故事发生城市，中文，不确定就留空' },
};

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
const strArr = (x: unknown) => Array.isArray(x) ? x.map(str).filter(Boolean).slice(0, 5) : (typeof x === 'string' && x ? x.split(/[、,，/]/).map((s) => s.trim()).filter(Boolean).slice(0, 5) : []);

// 补全子 agent：调用云脑，强约束 JSON。失败 → 返回 EMPTY（舱壁：单级失败不抛错，交回 resolve 走下一级兜底）。
export async function enrichTags(title: string, hint?: { director?: string; country?: string; year?: number | null }): Promise<{ raw: EnrichRaw; ok: boolean }> {
  // 字段清单由 schema 经 formatInstructions 确定性派生（借鉴 langchain output-parsers，免手写两遍）；领域戒律另附。
  const system = '你是电影资料员。根据片名给出结构化标签。' + formatInstructions(ENRICH_SHAPE)
    + ' 重要：不确定的字段一律留空字符串或空数组，绝对不要编造演员或地点。';
  const hintStr = hint ? `已知线索（可纠正/补充）：导演=${hint.director || '?'}，国家=${hint.country || '?'}，年份=${hint.year || '?'}。` : '';
  const prompt = `片名：《${title}》。${hintStr}请输出 JSON。`;
  // 调云脑要结构化 JSON 走 enrichEntity skill（共享 plumbing：超时+稳健解析）；字段映射是电影领域专属，留在此。
  const obj = await enrichJSON<Record<string, unknown>>({ prompt, system });
  if (!obj) return { raw: EMPTY, ok: false };
  const yearN = typeof obj.year === 'number' ? obj.year : (typeof obj.year === 'string' && /^\d{4}$/.test(obj.year) ? +obj.year : null);
  return {
    raw: {
      director: str(obj.director), cast: strArr(obj.cast), genre: str(obj.genre), movement: str(obj.movement),
      plot: str(obj.plot).slice(0, 60), country: str(obj.country), year: yearN,
      filmingPlace: str(obj.filmingPlace), storyPlace: str(obj.storyPlace),
    }, ok: true,
  };
}

// 地理子 agent：取景地 > 故事地 > 国家，逐级落坐标。
// 经 [resolvePlace] skill：本地表命中即返回（不联网）、未命中走 Mapbox 拿全球城市/区，破"只认 ~100 城"。
export async function geoResolve(opts: { filmingPlace?: string; storyPlace?: string; country?: string }): Promise<GeoTarget | null> {
  // 带国家消歧：光秃秃的中文地名会被 Mapbox 匹配到同名异地，拼上国家才钉对（同 book/tagging）
  const film = opts.filmingPlace ? await resolvePlace(opts.country ? `${opts.filmingPlace} ${opts.country}` : opts.filmingPlace) : null;
  if (film) return { kind: 'filming', place: film.place, lng: film.lng, lat: film.lat, confidence: film.source === 'local' ? 0.9 : 0.82 };
  const story = opts.storyPlace ? await resolvePlace(opts.country ? `${opts.storyPlace} ${opts.country}` : opts.storyPlace) : null;
  if (story) return { kind: 'story', place: story.place, lng: story.lng, lat: story.lat, confidence: story.source === 'local' ? 0.75 : 0.7 };
  if (opts.country) {
    const c = movieCountry(opts.country);
    if (c) return { kind: 'country', place: opts.country, lng: c[0], lat: c[1], confidence: 0.5 };
  }
  return null;
}
