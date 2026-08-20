// 歌曲落点标记：把 RADIO_CITIES 的 621 首歌散射到各自城市内的不同地点，做成地图音乐卡片。
// 移植自桌面 sunset-radio 的 songMapMarkers，接 pocket-earth 现成的 frost-agent/data/radio（RADIO_CITIES）。
// 本地全部歌曲无精确 lat/lng → 走 scatteredSongCoordinate 确定性环形散射（城市中心 2~7km），
// 基于 stableHash，同一首歌每次落在同一位置；放大到街区即看到城市内分布的点。
import { RADIO_CITIES, ensureMusicData, formatTime, subscribeMusicData } from '../../../frost-agent/data/radio';
import type { RadioTrack } from '../../../frost-agent/data/radio';
import type { MusicPlaybackRef } from '../lib/dataPack';

export interface MapSongMarker {
  key: string;
  trackId: string;
  citySlug: string;
  cityName: string;
  cityNameZh: string;
  lat: number;
  lng: number;
  title: string;
  artist: string;
  duration: string;
  summary: string;
  detail: string;
  anchorLabel: string;
  cover: string;
  audioUrl: string;
  playback: MusicPlaybackRef;
  exact: boolean;
}

// 预留：将来若给某首歌补精确创作/录音地坐标，填 mapLat/mapLng 即可绕过散射。
type TrackWithMapAnchor = RadioTrack & {
  lat?: number;
  lng?: number;
  mapLat?: number;
  mapLng?: number;
  mapAnchor?: string;
  birthplace?: string;
  writingPlace?: string;
  recordingPlace?: string;
};

const SONG_CARD_SUMMARY_MAX = 152;
const SONG_CARD_SUMMARY_MIN = 82;
const SONG_CARD_DETAIL_MAX = 320;
const SONG_CARD_DETAIL_MIN = 210;

function normalizeText(text: string) {
  return (text || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s+([。！？；，,.!?])/g, '$1')
    .trim();
}

function clipAtSentence(text: string, max = SONG_CARD_SUMMARY_MAX, min = SONG_CARD_SUMMARY_MIN) {
  const cleaned = normalizeText(text);
  if (cleaned.length <= max) return cleaned;
  const windowed = cleaned.slice(0, max + 18);
  const cutCandidates = ['。', '！', '？', ';', '；', '.', '!', '?']
    .map((mark) => windowed.lastIndexOf(mark, max))
    .filter((idx) => idx >= min);
  const cut = cutCandidates.length ? Math.max(...cutCandidates) + 1 : max;
  return `${windowed.slice(0, cut).trim()}…`;
}

function cardSummary(track: RadioTrack) {
  const intro = normalizeText(track.introText || '');
  if (!intro) return `${track.artist} 的《${track.title}》被收进这座城市的歌单。`;

  const sentences = intro.match(/[^。！？.!?]+[。！？.!?]?/g) ?? [intro];
  const scored = sentences
    .map((sentence, index) => {
      const text = normalizeText(sentence);
      const score =
        (text.includes(track.title) ? 4 : 0) +
        (text.includes(track.artist) ? 3 : 0) +
        (/(录音棚|工作室|制片厂|出生|发行|写|城市|流派|代表|定义|重要|全球|互联网|东京|纽约|伦敦|柏林|巴黎|银座|涩谷|新宿|御茶之水)/.test(text) ? 2 : 0) -
        index * 0.08;
      return { text, score, index };
    })
    .filter((item) => item.text.length >= 18)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const picked = scored.slice(0, 3).sort((a, b) => a.index - b.index).map((item) => item.text).join('');
  return clipAtSentence(picked || intro);
}

function cardDetail(track: RadioTrack) {
  const intro = normalizeText(track.introText || '');
  if (!intro) return `${track.artist} 的《${track.title}》被收进这座城市的歌单。`;
  return clipAtSentence(intro, SONG_CARD_DETAIL_MAX, SONG_CARD_DETAIL_MIN);
}

function anchorLabel(track: TrackWithMapAnchor) {
  const explicit = track.mapAnchor || track.recordingPlace || track.writingPlace || track.birthplace;
  if (explicit) return clipAtSentence(explicit, 32, 18);

  const intro = normalizeText(track.introText || '');
  const placeMatch = intro.match(/([^。！？]{0,18}(录音棚|制片厂|工作室|银座|涩谷|新宿|御茶之水|丸之内|出生在|成立于|发行于)[^。！？]{0,28})/);
  if (placeMatch?.[1]) return clipAtSentence(placeMatch[1], 34, 18);

  return '城市音乐锚点';
}

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 围绕城市中心做确定性环形散射：每首歌按 index 分扇区 + hash 扰动，落在 2~7km 半径内，互不重叠。
function scatteredSongCoordinate(cityLng: number, cityLat: number, citySlug: string, trackId: string, index: number, total: number): [number, number] {
  const hash = stableHash(`${citySlug}:${trackId}`);
  const angle = (index / Math.max(1, total)) * Math.PI * 2 + (hash % 47) * 0.017;
  const ring = 0.018 + (index % 4) * 0.012 + (hash % 13) * 0.0012;
  const latRadius = ring;
  const lngRadius = ring / Math.max(0.35, Math.cos((Math.abs(cityLat) * Math.PI) / 180));
  const lng = cityLng + Math.cos(angle) * lngRadius;
  const lat = Math.max(-84, Math.min(84, cityLat + Math.sin(angle) * latRadius));
  return [lng, lat];
}

export const SONG_MARKERS: MapSongMarker[] = [];
export const SONG_MARKER_BY_KEY = new Map<string, MapSongMarker>();
const markerListeners = new Set<() => void>();

function rebuildSongMarkers() {
  const next = RADIO_CITIES.flatMap((city) => {
    if (!Number.isFinite(city.lat) || !Number.isFinite(city.lng)) return [];

    return city.tracks.map((track, index) => {
      const t = track as TrackWithMapAnchor;
      const exactLat = t.mapLat ?? t.lat;
      const exactLng = t.mapLng ?? t.lng;
      const hasExactPoint = Number.isFinite(exactLat) && Number.isFinite(exactLng);
      const [lng, lat] = hasExactPoint
        ? [Number(exactLng), Number(exactLat)]
        : scatteredSongCoordinate(city.lng as number, city.lat as number, city.slug, track.id, index, city.tracks.length);

      return {
        key: `${city.slug}::${track.id}`,
        trackId: track.id,
        citySlug: city.slug,
        cityName: city.cityName,
        cityNameZh: city.cityNameZh,
        lat,
        lng,
        title: track.title,
        artist: track.artist,
        duration: formatTime(track.durationSec),
        summary: cardSummary(track),
        detail: cardDetail(track),
        anchorLabel: anchorLabel(t),
        cover: city.cover,
        audioUrl: track.audioUrl,
        playback: track.playback,
        exact: hasExactPoint,
      } satisfies MapSongMarker;
    });
  });
  SONG_MARKERS.splice(0, SONG_MARKERS.length, ...next);
  SONG_MARKER_BY_KEY.clear();
  next.forEach((song) => SONG_MARKER_BY_KEY.set(song.key, song));
  markerListeners.forEach((listener) => listener());
}

subscribeMusicData(rebuildSongMarkers);

export async function ensureSongMarkers(): Promise<void> {
  await ensureMusicData();
  rebuildSongMarkers();
}

export const subscribeSongMarkers = (listener: () => void): (() => void) => {
  markerListeners.add(listener);
  return () => markerListeners.delete(listener);
};
