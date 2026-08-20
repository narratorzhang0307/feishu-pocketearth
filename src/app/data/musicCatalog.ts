// 音乐名录（解耦）：把电台资料库里的所有歌曲摊平成「条目」，并支持三/四种归类——
// 地域（按经纬度归大洲/区域）/ 城市 / 歌手 / 流派（流派随 Data Pack 一起安装）。
// 数据来自当前装备的 pocket.music/v1；换包后数组就地重建，旧调用方无需改 import。

import { RADIO_CITIES, ensureMusicData, subscribeMusicData } from '../../../frost-agent/data/radio';

export interface Song {
  id: string;
  title: string;
  artist: string;
  city: string;
  region: string;
  genre: string;
  lat?: number;
  lng?: number;
  durationSec?: number;
}

export type GroupKey = 'region' | 'city' | 'artist' | 'genre';

// 经纬度 → 地域（粗粒度大洲/区域）。按由具体到一般的顺序判定。
function regionOf(lat?: number, lng?: number): string {
  if (lat == null || lng == null) return '其他';
  const inLng = (a: number, b: number) => lng >= a && lng <= b;
  const inLat = (a: number, b: number) => lat >= a && lat <= b;
  if (inLng(110, 180) && inLat(-50, -10)) return '大洋洲';
  if (inLng(100, 150) && inLat(20, 55)) return '东亚';
  if (inLng(90, 145) && inLat(-11, 21)) return '东南亚';
  if (inLng(60, 98) && inLat(3, 38)) return '南亚';
  if (inLng(34, 63) && inLat(12, 43)) return '中东';
  if (inLng(-12, 46) && inLat(35, 72)) return '欧洲';
  if (inLng(-19, 52) && inLat(-36, 37)) return '非洲';
  if (inLng(-170, -50) && inLat(13, 73)) return '北美';
  if (inLng(-120, -33) && inLat(-56, 14)) return '拉丁美洲';
  return '其他';
}

export const genreOf = (_artist: string, genre?: string): string => genre || '其他';

// 摊平：每城每曲一条；去重 id
export const songs: Song[] = [];
export let songTotal = 0;
export let hasMusicCatalog = false;
const catalogListeners = new Set<() => void>();

function rebuildMusicCatalog() {
  const next: Song[] = [];
  const seen = new Set<string>();
  for (const c of RADIO_CITIES) {
    for (const t of c.tracks) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      next.push({
        id: t.id,
        title: t.title,
        artist: t.artist,
        city: c.cityNameZh,
        region: regionOf(c.lat, c.lng),
        genre: genreOf(t.artist, t.genre),
        lat: c.lat,
        lng: c.lng,
        durationSec: t.durationSec,
      });
    }
  }
  songs.splice(0, songs.length, ...next);
  songTotal = songs.length;
  hasMusicCatalog = songTotal > 0;
  catalogListeners.forEach((listener) => listener());
}

subscribeMusicData(rebuildMusicCatalog);

export async function ensureMusicCatalog(): Promise<void> {
  await ensureMusicData();
  rebuildMusicCatalog();
}

export const subscribeMusicCatalog = (listener: () => void): (() => void) => {
  catalogListeners.add(listener);
  return () => catalogListeners.delete(listener);
};

// 地域 / 流派 的固定展示顺序（让分组稳定、好看）
const REGION_ORDER = ['东亚', '东南亚', '南亚', '中东', '欧洲', '非洲', '北美', '拉丁美洲', '大洋洲', '其他'];
const GENRE_ORDER = ['流行', '摇滚', '独立', '嘻哈说唱', '电子', '民谣', '爵士', 'R&B灵魂', '朋克', '金属', '雷鬼', '拉丁', '非洲', '世界音乐', '古典', '其他'];

export interface SongGroup { key: string; songs: Song[] }

// 按指定维度分组，返回有序分组（地域/流派按固定序，城市/歌手按数量降序）
export function groupSongs(by: GroupKey): SongGroup[] {
  const buckets = new Map<string, Song[]>();
  for (const s of songs) {
    const k = s[by] || '其他';
    const arr = buckets.get(k) || [];
    arr.push(s); buckets.set(k, arr);
  }
  const order = by === 'region' ? REGION_ORDER : by === 'genre' ? GENRE_ORDER : null;
  let keys = [...buckets.keys()];
  if (order) keys.sort((a, b) => { const ia = order.indexOf(a), ib = order.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
  else keys.sort((a, b) => buckets.get(b)!.length - buckets.get(a)!.length || a.localeCompare(b, 'zh'));
  return keys.map((k) => ({ key: k, songs: buckets.get(k)!.sort((x, y) => x.title.localeCompare(y.title, 'zh')) }));
}

export const GROUP_LABELS: { key: GroupKey; label: string }[] = [
  { key: 'region', label: '地域' },
  { key: 'city', label: '城市' },
  { key: 'artist', label: '歌手' },
  { key: 'genre', label: '流派' },
];
