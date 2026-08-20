import { describe, expect, it } from 'vitest';
import { canPlayMusicSource, directAudioUrl, musicSourceLabel, youtubeEmbedUrl, youtubeVideoId, youtubeWatchUrl } from './playback';

describe('music playback sources', () => {
  it('resolves YouTube ids without treating the page as direct audio', () => {
    const playback = { provider: 'youtube' as const, url: '', sourceId: 'M7lc1UVf-VE', sourceUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE' };
    expect(youtubeVideoId(playback)).toBe('M7lc1UVf-VE');
    expect(directAudioUrl(playback)).toBe('');
    expect(canPlayMusicSource(playback)).toBe(true);
    expect(youtubeWatchUrl(playback)).toBe('https://www.youtube.com/watch?v=M7lc1UVf-VE');
    expect(youtubeEmbedUrl(playback, true)).toContain('/embed/M7lc1UVf-VE?');
    expect(musicSourceLabel(playback)).toBe('YouTube 原曲');
  });

  it('extracts ids from common YouTube URLs', () => {
    expect(youtubeVideoId({ provider: 'youtube', url: 'https://youtu.be/M7lc1UVf-VE' })).toBe('M7lc1UVf-VE');
    expect(youtubeVideoId({ provider: 'youtube', url: 'https://www.youtube.com/shorts/M7lc1UVf-VE' })).toBe('M7lc1UVf-VE');
  });

  it('only returns direct audio URLs for OSS or external providers', () => {
    expect(directAudioUrl({ provider: 'oss', url: 'https://example.com/song.m4a' })).toBe('https://example.com/song.m4a');
    expect(directAudioUrl({ provider: 'external', url: 'https://example.com/song.mp3' })).toBe('https://example.com/song.mp3');
    expect(canPlayMusicSource({ provider: 'none', url: '' })).toBe(false);
  });
});
