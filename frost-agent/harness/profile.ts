// Frost Harness · 跨会话长期个人画像（与 memory.ts 平行）
// memory.ts 管「会话内最近几轮」；profile.ts 管「跨会话沉淀下来的口味」。
// 结构化脱敏画像：只存偏好标签的计数（导演 / 作者 / 艺人 / 流派 / 城市…），
// 不存任何原文 / 隐私内容。每个 agent 跑完一次就把信号追加进来，越用越懂你。
//
// 隐私边界（重要）：本模块只在【云脑侧】(httpBrain / 对话注入) 读取使用，
// 端侧 Qwen/MNN Selector 一律不接触本模块，长期画像不会被塞进端侧模型上下文。

import type { FrostBrain } from './types';
import { HUMAN_VOICE, cleanVoice } from './persona';

export type ProfileDomain = 'books' | 'movies' | 'music' | 'photos' | 'travel' | 'exhibitions';

export interface TagCount { tag: string; n: number }
/** 一个领域下若干「字段 → 标签计数」，如 movies.directors / books.authors。 */
export type ProfileFields = Record<string, TagCount[]>;

export interface Profile {
  domains: Record<string, ProfileFields>;
  seedVersion: number;   // 基线播种版本（见 profileSeed.ts），用于幂等重播
  updatedAt: string;     // ISO
}

const KEY = 'pe.profile.v1';
const MAX_TAGS_PER_FIELD = 50;   // 每个字段最多留 50 个标签，按热度截断，限制体积

function empty(): Profile {
  return { domains: {}, seedVersion: 0, updatedAt: new Date().toISOString() };
}

function load(): Profile {
  try {
    if (typeof localStorage === 'undefined') return empty();
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Profile;
    if (!p || typeof p !== 'object' || typeof p.domains !== 'object' || p.domains === null || Array.isArray(p.domains)) return empty();   // domains 必须是普通对象：损坏/旧版存成 7/"x"/数组时回落 empty()，免 recordSignals 在原始值上赋属性崩（与 heartbeat/skillForge 同款损坏存档护栏）
    return { domains: p.domains, seedVersion: p.seedVersion || 0, updatedAt: p.updatedAt || new Date().toISOString() };
  } catch { return empty(); }
}

let profile: Profile = load();
const subs = new Set<() => void>();

function persist() {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* 容量/隐私模式：内存仍可用 */ }
}
function emit() { subs.forEach((fn) => fn()); }

export function getProfile(): Profile { return profile; }
export function getProfileSeedVersion(): number { return profile.seedVersion; }

/** 累加一批信号：domain.field 下，把每个标签计数 +1（同标签合并、按热度排序、截断）。 */
export function recordSignals(domain: ProfileDomain, fields: Record<string, Array<string | null | undefined>>): void {
  const dom = (profile.domains[domain] ||= {});
  let changed = false;
  for (const [field, tags] of Object.entries(fields)) {
    if (!tags || !tags.length) continue;
    const list = (dom[field] ||= []);
    const index = new Map(list.map((tc) => [tc.tag, tc]));
    for (const raw of tags) {
      const tag = (raw || '').trim();
      if (!tag) continue;
      const hit = index.get(tag);
      if (hit) hit.n += 1;
      else { const tc = { tag, n: 1 }; list.push(tc); index.set(tag, tc); }
      changed = true;
    }
    list.sort((a, b) => b.n - a.n);
    if (list.length > MAX_TAGS_PER_FIELD) dom[field] = list.slice(0, MAX_TAGS_PER_FIELD);
  }
  if (changed) { profile.updatedAt = new Date().toISOString(); persist(); emit(); }
}

/** 标记基线已按某版本播种（幂等：profileSeed 用它避免重复累加同一批静态数据）。 */
export function setSeedVersion(v: number): void {
  if (profile.seedVersion === v) return;
  profile.seedVersion = v;
  profile.updatedAt = new Date().toISOString();
  persist(); emit();
}


// ——————————————————————————————————————————————
// 画像摘要：注入云脑提示用（结构化、便宜、总是新鲜）
// ——————————————————————————————————————————————
const DOMAIN_LABEL: Record<string, string> = { movies: '电影', books: '书', music: '音乐', photos: '照片', travel: '行程', exhibitions: '展览' };
const FIELD_LABEL: Record<string, string> = {
  directors: '常看导演', countries: '偏好国别', authors: '偏爱作者', storyPlaces: '故事地',
  artists: '常听艺人', genres: '流派', moods: '情绪', cities: '城市', aesthetics: '风格',
  prefs: '旅行偏好', seasons: '偏好季节', modes: '交通偏好',   // travel 子字段（只扩标签，不扩 ProfileDomain）
  categories: '器类', dynasties: '朝代', cultures: '文明',   // exhibition 子字段
};

function topTags(list: TagCount[], k: number): string[] { return list.slice(0, k).map((t) => t.tag); }

/** 把画像格式化成一段可直接塞进云脑提示的文本（无数据返回空串）。 */
export function getProfileSummary(opts?: { perField?: number }): string {
  const k = opts?.perField ?? 5;
  const lines: string[] = [];
  for (const [domain, fields] of Object.entries(profile.domains)) {
    const parts: string[] = [];
    for (const [field, list] of Object.entries(fields)) {
      if (!list || !list.length) continue;
      parts.push(`${FIELD_LABEL[field] || field} ${topTags(list, k).join('、')}`);
    }
    if (parts.length) lines.push(`- ${DOMAIN_LABEL[domain] || domain}：${parts.join('；')}`);
  }
  if (!lines.length) return '';
  return `# 你的长期口味画像（跨会话沉淀，仅供参考）\n${lines.join('\n')}\n`;
}

// ——————————————————————————————————————————————
// C · fingerprint 缓存：口味一句话只在画像「实质变化」时才请一次云脑（成本护盾）
// ——————————————————————————————————————————————
function fnv(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** 画像签名：只取每字段 top 标签，签名不变=口味没实质变化，可跳过云脑重算。 */
export function profileFingerprint(): string {
  const sig: string[] = [];
  for (const [domain, fields] of Object.entries(profile.domains))
    for (const [field, list] of Object.entries(fields))
      sig.push(`${domain}.${field}:${topTags(list, 6).join(',')}`);
  return fnv(sig.sort().join('|'));
}

const NARR_KEY = 'pe.profile.narrative.v1';

/** 同步读已缓存的「一句话口味气质」（summarizeTaste 落盘的 text），无则空串。
 *  供 memoryRouter 注入用——只读现成缓存、绝不触发云脑（刷新由别处的 summarizeTaste 负责）。
 *  这是唯一的叙事载体（锚定 NARR_KEY），不另起第二份 narrative store。 */
export function getCachedTasteLine(): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    const raw = localStorage.getItem(NARR_KEY);
    if (raw) { const c = JSON.parse(raw); if (c && typeof c.text === 'string') return c.text; }
  } catch { /* ignore */ }
  return '';
}

/** 一句话口味画像（云脑润色）。fingerprint 命中缓存则直接返回，跳过云脑调用。 */
export async function summarizeTaste(brain: FrostBrain): Promise<string> {
  const summary = getProfileSummary({ perField: 6 });
  if (!summary) return '';
  const fp = profileFingerprint();
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(NARR_KEY);
      if (raw) { const c = JSON.parse(raw); if (c && c.fp === fp && typeof c.text === 'string' && c.text) return c.text; }
    }
  } catch { /* ignore */ }
  const prompt = `${summary}\n用一句不超过 40 字的中文，概括这个人的整体口味气质（第二人称「你」，不罗列、不客套）。\n${HUMAN_VOICE}`;
  let text = '';
  try { text = (await brain.complete(prompt)) || ''; } catch { text = ''; }
  text = cleanVoice(text).replace(/^[「"]|["」]$/g, '').trim();
  if (text) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(NARR_KEY, JSON.stringify({ fp, text })); } catch { /* ignore */ }
  }
  return text;
}
