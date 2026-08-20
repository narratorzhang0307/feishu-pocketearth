import type { MusicPlaybackRef } from '../dataPack';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

const youtubeIdFromUrl = (input?: string): string | null => {
  if (!input) return null;
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return YOUTUBE_ID.test(id) ? id : null;
    }
    if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') return null;
    const queryId = url.searchParams.get('v') || '';
    if (YOUTUBE_ID.test(queryId)) return queryId;
    const parts = url.pathname.split('/').filter(Boolean);
    if (['embed', 'shorts', 'live'].includes(parts[0] || '') && YOUTUBE_ID.test(parts[1] || '')) return parts[1];
  } catch { /* invalid source URL */ }
  return null;
};

export function youtubeVideoId(playback?: MusicPlaybackRef | null): string | null {
  if (!playback || playback.provider !== 'youtube') return null;
  const sourceId = playback.sourceId?.trim() || '';
  if (YOUTUBE_ID.test(sourceId)) return sourceId;
  return youtubeIdFromUrl(playback.sourceUrl) || youtubeIdFromUrl(playback.url);
}

export function directAudioUrl(playback?: MusicPlaybackRef | null): string {
  if (!playback || (playback.provider !== 'oss' && playback.provider !== 'external')) return '';
  return playback.url;
}

export function canPlayMusicSource(playback?: MusicPlaybackRef | null): boolean {
  return !!directAudioUrl(playback) || !!youtubeVideoId(playback);
}

export function youtubeWatchUrl(playback?: MusicPlaybackRef | null): string {
  const id = youtubeVideoId(playback);
  return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : playback?.sourceUrl || playback?.url || '';
}

export function youtubeEmbedUrl(playback: MusicPlaybackRef, autoplay: boolean): string | null {
  const id = youtubeVideoId(playback);
  if (!id) return null;
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    playsinline: '1',
    rel: '0',
  });
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params}`;
}

export function musicSourceLabel(playback?: MusicPlaybackRef | null): string {
  if (!playback || playback.provider === 'none') return '无播放来源';
  if (playback.provider === 'youtube') return youtubeVideoId(playback) ? 'YouTube 原曲' : 'YouTube 来源无效';
  return playback.provider === 'oss' ? 'OSS 原曲' : '外部原曲';
}
