// 音乐听歌记忆库（端侧 json） + 命中/破茧双轨推荐。
// 记每首歌：听了几次 / 累计多少秒 / 最近何时；常听 artist/genre/city 回流 profile('music') 长期画像。
// 推荐双轨（全从现有曲库 musicCatalog 选，不引外部）：
//   forYou = 贴合你常听口味的「新发现」；explore = 你少听类型/地区的「不妨试试」破茧。
import { songs, type Song } from '../../data/musicCatalog';
import { recordSignals } from '../../../../frost-agent/harness/profile';

export interface PlayStat { id: string; title: string; artist: string; genre: string; city: string; count: number; seconds: number; last: number }

const KEY = 'pe.musicPlays.v1';
const subs = new Set<() => void>();
let plays: Record<string, PlayStat> = load();
function load(): Record<string, PlayStat> { try { if (typeof localStorage !== 'undefined') { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } } catch { /* */ } return {}; }
function persist() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(plays)); } catch { /* */ } }
function emit() { subs.forEach((fn) => fn()); }


export interface PlayInput { id: string; title?: string; artist?: string; genre?: string; city?: string }
// 开始播放某歌：次数 +1，并把这首的 artist/genre/city 回流长期画像（听得多的自然计数高，与书影 pin 同机制）。
export function recordPlay(s: PlayInput): void {
  if (!s.id) return;
  const p = plays[s.id] || (plays[s.id] = { id: s.id, title: '', artist: '', genre: '', city: '', count: 0, seconds: 0, last: 0 });
  p.count += 1; p.last = Date.now();
  if (s.title) p.title = s.title; if (s.artist) p.artist = s.artist; if (s.genre) p.genre = s.genre; if (s.city) p.city = s.city;
  persist(); emit();
  recordSignals('music', { artists: s.artist ? [s.artist] : [], genres: s.genre ? [s.genre] : [], cities: s.city ? [s.city] : [] });
}

// 听歌画像：按收听次数加权排序某字段的 top 值
function weighted(field: 'artist' | 'genre' | 'city'): string[] {
  const w: Record<string, number> = {};
  for (const p of Object.values(plays)) { const k = p[field]; if (k) w[k] = (w[k] || 0) + p.count; }
  return Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

export interface MusicRecs { forYou: Song[]; explore: Song[]; basis: string }
// 双轨推荐：纯本地、用现有曲库。forYou=常听口味的没听过的；explore=你少听类型的破茧尝试。
export function recommendMusic(): MusicRecs {
  const playedIds = new Set(Object.keys(plays).filter((id) => plays[id].count > 0));
  const topGenres = weighted('genre');
  const topArtists = weighted('artist');
  const allGenres = [...new Set(songs.map((s) => s.genre).filter(Boolean))];
  // 取 n 首：去重 + 默认避开已听过的（推「发现」而非复述）
  const pick = (arr: Song[], n: number) => {
    const seen = new Set<string>(); const out: Song[] = [];
    for (const s of arr) { if (seen.has(s.id) || playedIds.has(s.id)) continue; seen.add(s.id); out.push(s); if (out.length >= n) break; }
    return out;
  };
  if (playedIds.size) {
    const lovedG = topGenres.slice(0, 3);
    const lovedA = topArtists.slice(0, 6);
    const forYou = pick(shuffle(songs.filter((s) => lovedA.includes(s.artist) || lovedG.includes(s.genre))), 6);
    const lowGenres = allGenres.filter((g) => !topGenres.slice(0, 4).includes(g));
    const explore = pick(shuffle(songs.filter((s) => lowGenres.includes(s.genre))), 4);
    const basis = `常听：${[...lovedA.slice(0, 2), ...lovedG.slice(0, 2)].filter(Boolean).join('、') || '—'}`;
    return { forYou, explore, basis };
  }
  // 冷启动：还没攒到听歌习惯 → 随机铺一些 + 不同类型破茧
  const forYou = pick(shuffle(songs), 6);
  const explore = pick(shuffle(songs.filter((s) => !forYou.some((f) => f.genre === s.genre))), 4);
  return { forYou, explore, basis: '还没攒到你的听歌习惯，先随机铺一些——多听几首我就懂你了' };
}
