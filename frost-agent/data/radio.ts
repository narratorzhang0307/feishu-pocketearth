// ─────────────────────────────────────────────────────────────
// 电台 · 数据驱动
// 城市、电台、曲目与播客来自当前装备的 pocket.music/v1 Data Pack。
// Skill 能力代码保持不变；数据包可从 OSS / HTTPS / 本地 Bundle 安装、切换和卸载。
// 音频不塞进 JSON，只保存经过协议校验的播放引用。
// ─────────────────────────────────────────────────────────────

import {
  ensureActiveDataPack,
  getDataPackState,
  subscribeDataPacks,
  uniqueDataPackRecords,
  type MusicCityPackRecord,
  type MusicPlaybackRef,
} from '../../src/app/lib/dataPack';
import { directAudioUrl } from '../../src/app/lib/music/playback';

export interface RadioTrack {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  audioUrl: string;       // 歌曲音频
  playback: MusicPlaybackRef;
  introText: string;      // DJ 介绍这首歌的解说词
  introAudioUrl: string;  // DJ 解说音频
  introPlayback: MusicPlaybackRef;
  genre?: string;
  // 跨城歌单专用：每首歌带自己城市的封面/名/时区，让电台头与封面随歌联动。
  // 普通城市电台留空，回退到所属城市。
  cityNameZh?: string;
  cityName?: string;
  cover?: string;
  ianaTz?: string | null;
  tzOffset?: number;
}

export interface PodcastSegment {
  id: string;
  title: string;
  subtitle: string;       // 城市 / 作家
  text: string;           // 播客文稿
  audioUrl: string;
  playback: MusicPlaybackRef;
}

export interface RadioCity {
  slug: string;
  cityName: string;
  cityNameZh: string;
  ianaTz: string | null;  // 有则用 Intl 精确算当地时间
  tzOffset: number;       // 退化方案：按时区偏移粗算
  station: { freq: number; name: string };
  cover: string;          // 城市封面（OSS）
  tracks: RadioTrack[];
  podcast: PodcastSegment[]; // 没有播客 TTS 的城市为空数组 → UI 不显示「播客」
  lat?: number;           // 地球红点坐标（来自 city-meta，缺失则不在地球上画点）
  lng?: number;
  description?: string;    // 一句城市描述（红点 hover 展示）
}

// 清掉标题首尾残缺/多余的书名号与引号（部分数据是 "《看见爱" 这种只有半边的脏数据）
function cleanTitle(s: string): string {
  const out = (s || '').replace(/^[《「『﹝]+/, '').replace(/[》」』﹞]+$/, '').trim();
  return out || s;
}

// 西→东按时区排序（洛杉矶在前），同偏移按城市名。数组保持同一引用，兼容旧 Skill import。
export const RADIO_CITIES: RadioCity[] = [];

/** 解析后的可播放曲目（跨城歌单用：含音频、封面、DJ 解说稿）。 */
export interface ResolvedTrack {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  playback: MusicPlaybackRef;
  cover: string;
  cityNameZh: string;
  cityName: string;
  ianaTz: string | null;
  tzOffset: number;
  introText: string;       // DJ 介绍这首歌的解说稿（打字机用）
  introAudioUrl: string;
  introPlayback: MusicPlaybackRef;
}

const _trackIndex = new Map<string, ResolvedTrack>();
const dataListeners = new Set<() => void>();
let currentPackKey = '';

const packCityToRadioCity = (record: MusicCityPackRecord): RadioCity => ({
  slug: record.slug,
  cityName: record.cityName,
  cityNameZh: record.cityNameZh,
  ianaTz: record.ianaTz,
  tzOffset: record.tzOffset,
  station: record.station,
  cover: record.cover,
  lat: record.lat ?? undefined,
  lng: record.lng ?? undefined,
  description: record.description || undefined,
  tracks: record.tracks.map((track) => ({
    id: track.id,
    title: cleanTitle(track.title),
    artist: track.artist,
    genre: track.genre,
    durationSec: track.durationSec ?? 0,
    audioUrl: directAudioUrl(track.playback),
    playback: track.playback,
    introText: track.introText,
    introAudioUrl: directAudioUrl(track.introPlayback),
    introPlayback: track.introPlayback,
  })),
  podcast: record.podcast.map((segment) => ({
    id: segment.id,
    title: segment.title,
    subtitle: segment.subtitle,
    text: segment.text,
    audioUrl: directAudioUrl(segment.playback),
    playback: segment.playback,
  })),
});

function rebuildMusicData() {
  const pack = getDataPackState('music').active;
  const nextKey = pack?.packKey || '';
  if (nextKey === currentPackKey && (nextKey || RADIO_CITIES.length === 0)) return;
  currentPackKey = nextKey;
  const cities = pack
    ? uniqueDataPackRecords('music', pack.records as MusicCityPackRecord[]).map(packCityToRadioCity)
      .sort((a, b) => a.tzOffset - b.tzOffset || a.cityNameZh.localeCompare(b.cityNameZh, 'zh'))
    : [];
  RADIO_CITIES.splice(0, RADIO_CITIES.length, ...cities);
  _trackIndex.clear();
  for (const city of RADIO_CITIES) {
    for (const track of city.tracks) {
      _trackIndex.set(track.id, {
        id: track.id, title: track.title, artist: track.artist, audioUrl: track.audioUrl, playback: track.playback,
        cover: city.cover, cityNameZh: city.cityNameZh, cityName: city.cityName,
        ianaTz: city.ianaTz, tzOffset: city.tzOffset,
        introText: track.introText, introAudioUrl: track.introAudioUrl, introPlayback: track.introPlayback,
      });
    }
  }
  dataListeners.forEach((listener) => listener());
}

subscribeDataPacks(rebuildMusicData);

export async function ensureMusicData(): Promise<void> {
  await ensureActiveDataPack('music');
  rebuildMusicData();
}

export const subscribeMusicData = (listener: () => void): (() => void) => {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
};

/** 按 trackId 跨城解析成可播放曲目（Frost 歌单 → 电台播放）。 */
export function resolveTracksByIds(ids: string[]): ResolvedTrack[] {
  return ids.map((id) => _trackIndex.get(id)).filter((t): t is ResolvedTrack => !!t);
}

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 城市当地 hh:mm：优先 IANA 时区，退化到固定偏移。 */
export function cityClock(date: Date, city: { ianaTz: string | null; tzOffset: number }): string {
  if (city.ianaTz) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: city.ianaTz, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(date);
    } catch { /* fall through */ }
  }
  const d = new Date(date.getTime() + city.tzOffset * 3600000);
  return d.toISOString().substr(11, 5);
}

/** 主持人开场白：北京时间 + 城市当地时间（纯时间计算，非 AI）。 */
export function frostOpening(date: Date, city: RadioCity): string {
  let bj = '';
  try {
    bj = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  } catch { bj = ''; }
  const local = cityClock(date, city);
  return `现在是北京时间 ${bj}，${city.cityNameZh}当地时间 ${local}，正在经历日落。我是弗洛斯特。`;
}
