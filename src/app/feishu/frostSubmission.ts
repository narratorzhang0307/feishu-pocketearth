import type { FeishuLibraryDomain } from './types';

export type FrostSubmissionDraft = {
  domain: FeishuLibraryDomain;
  label: string;
  record: Record<string, unknown>;
};

const SUBMIT_INTENT = /提交|记录|入库|标记|收藏|我(?:读|看|听)了|读完|看完|听完/;

function titleFrom(text: string): string {
  return text.match(/《([^》]{1,120})》/)?.[1]?.trim() || '';
}

function ratingFrom(text: string): number | null {
  const value = Number(text.match(/([1-5](?:\.\d)?)\s*(?:星|分)/)?.[1]);
  return Number.isFinite(value) ? Math.min(5, value) : null;
}

function stableWorkKey(value: string): string {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]+/gu, '');
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const char of normalized) {
    const code = char.codePointAt(0) || 0;
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `${first.toString(36)}${second.toString(36)}`;
}

function draftId(prefix: string, title: string): string {
  return `${prefix}:frost:${stableWorkKey(title)}`;
}

export function frostSubmissionFromText(domain: FeishuLibraryDomain, input: string, now = new Date()): FrostSubmissionDraft | null {
  const text = input.trim();
  if (!SUBMIT_INTENT.test(text)) return null;
  const title = titleFrom(text);
  if (!title) return null;
  const date = now.toISOString().slice(0, 10);
  const rating = ratingFrom(text);
  if (domain === 'books') {
    return {
      domain,
      label: `《${title}》阅读记录`,
      record: {
        id: draftId('book', title), title, author: '', country: '', type: '', year: null,
        rating, date, synopsis: text, locations: [], aiInstruction: text, note: text,
      },
    };
  }
  if (domain === 'movies') return {
    domain,
    label: `《${title}》观影记录`,
    record: {
      id: draftId('movie', title), title, original: '', type: '', director: '', country: '', year: null,
      rating, publicRating: null, date, synopsis: text, locations: [], aiInstruction: text, note: text,
    },
  };
  if (domain === 'photos') return {
    domain,
    label: `《${title}》照片记录`,
    record: {
      id: draftId('photo', title), title, city: title, date, lat: null, lng: null,
      thumbnailUrl: '', contentHash: '', summary: text, aiInstruction: text, note: text,
    },
  };
  const id = draftId('music', title);
  return {
    domain,
    label: `《${title}》听歌记录`,
    record: {
      id,
      slug: id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
      cityName: '待 AI 识别',
      cityNameZh: '待 AI 识别',
      ianaTz: null,
      tzOffset: 0,
      station: { freq: 0, name: 'Pocket Earth · 待确认' },
      cover: '',
      lat: null,
      lng: null,
      description: text,
      tracks: [{
        id: `${id}:track`, title, artist: '', genre: '', durationSec: null,
        playback: { provider: 'none', url: '' }, introText: text,
        introPlayback: { provider: 'none', url: '' },
      }],
      podcast: [],
      aiInstruction: text,
      note: text,
    },
  };
}
