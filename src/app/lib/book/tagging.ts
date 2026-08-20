// 协作·子 agent 层：①补全子 agent（云脑 JSON：作者/译者/类型/流派/剧情 + 故事地/作者地）
// ②地理子 agent（故事地→作者地→国家，逐级 geocode，经 resolvePlace：本地表→Mapbox 全球）。镜像 lib/movie/tagging.ts。
import { resolvePlace } from '../skills/resolvePlace';
import { bookCountry } from '../../data/books';
import { enrichJSON } from '../skills/enrichEntity';
import { formatInstructions, type Shape } from '../skills/structured';
import type { GeoTarget } from './types';

export interface EnrichRaw {
  author: string;
  translator: string;
  genre: string;
  movement: string;
  plot: string;
  country: string;
  year: number | null;
  storyPlace: string;    // 故事主要发生城市（不确定留空）
  authorPlace: string;   // 作者出身/写作城市（不确定留空）
}
const EMPTY: EnrichRaw = { author: '', translator: '', genre: '', movement: '', plot: '', country: '', year: null, storyPlace: '', authorPlace: '' };

// 补全字段 schema（单一事实源）：formatInstructions 据此生成提示词字段清单（与 lib/movie/tagging 同款）。
const ENRICH_SHAPE: Shape = {
  author: { type: 'string', desc: '作者' },
  translator: { type: 'string', desc: '译者，无或原文写作就留空' },
  genre: { type: 'string', desc: '类型，如 小说/非虚构/诗歌/历史/科幻，单个' },
  movement: { type: 'string', desc: '流派或文学运动，如 魔幻现实主义/意识流/垮掉的一代，没有就留空' },
  plot: { type: 'string', desc: '一句话主题或剧情，不超过 40 字' },
  country: { type: 'string', desc: '作者国籍，中文' },
  year: { type: 'number', desc: '成书年份，数字或留空' },
  storyPlace: { type: 'string', desc: '故事主要发生城市，中文，不确定就留空' },
  authorPlace: { type: 'string', desc: '作者出身或写作城市，中文，不确定就留空' },
};

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');

// 补全子 agent：调云脑要结构化 JSON 走 enrichEntity skill（共享 plumbing：超时 + withRetry 瞬时退避重试 + 稳健解析）。
// 失败 → 返回 EMPTY（舱壁：单级失败不抛错，交回 resolve 走下一级兜底）。字段映射是图书领域专属，留在此。
export async function enrichTags(title: string, hint?: { author?: string; country?: string; year?: number | null }): Promise<{ raw: EnrichRaw; ok: boolean }> {
  // 字段清单由 schema 经 formatInstructions 确定性派生（借鉴 langchain output-parsers，免手写两遍）；领域戒律另附。
  const system = '你是图书馆资料员。根据书名给出结构化标签。' + formatInstructions(ENRICH_SHAPE)
    + ' 重要：不确定的字段一律留空字符串或 null，绝对不要编造作者或地点。';
  const hintStr = hint ? `已知线索（可纠正/补充）：作者=${hint.author || '?'}，国籍=${hint.country || '?'}，年份=${hint.year || '?'}。` : '';
  const prompt = `书名：《${title}》。${hintStr}请输出 JSON。`;
  const obj = await enrichJSON<Record<string, unknown>>({ prompt, system });
  if (!obj) return { raw: EMPTY, ok: false };
  const yearN = typeof obj.year === 'number' ? obj.year : (typeof obj.year === 'string' && /^\d{4}$/.test(obj.year) ? +obj.year : null);
  return {
    raw: {
      author: str(obj.author), translator: str(obj.translator), genre: str(obj.genre), movement: str(obj.movement),
      plot: str(obj.plot).slice(0, 60), country: str(obj.country), year: yearN,
      storyPlace: str(obj.storyPlace), authorPlace: str(obj.authorPlace),
    }, ok: true,
  };
}

// 地理子 agent：故事地 > 作者地 > 国家（经 [resolvePlace]：本地表命中即返回、未命中走 Mapbox 拿全球）
export async function geoResolve(opts: { storyPlace?: string; authorPlace?: string; country?: string }): Promise<GeoTarget | null> {
  // 带国家消歧：光秃秃的中文地名（如「利马」）会被 Mapbox 匹配到同名异地（塞浦路斯利马索尔），拼上国家才钉对秘鲁利马
  const story = opts.storyPlace ? await resolvePlace(opts.country ? `${opts.storyPlace} ${opts.country}` : opts.storyPlace) : null;
  if (story) return { kind: 'story', place: story.place, lng: story.lng, lat: story.lat, confidence: story.source === 'local' ? 0.9 : 0.82 };
  const author = opts.authorPlace ? await resolvePlace(opts.country ? `${opts.authorPlace} ${opts.country}` : opts.authorPlace) : null;
  if (author) return { kind: 'author', place: author.place, lng: author.lng, lat: author.lat, confidence: author.source === 'local' ? 0.75 : 0.7 };
  if (opts.country) {
    const c = bookCountry(opts.country);
    if (c) return { kind: 'country', place: opts.country, lng: c[0], lat: c[1], confidence: 0.5 };
  }
  return null;
}
