import type { FeishuLibraryDomain } from './types';

export type FrostSubmissionDraft = {
  domain: Extract<FeishuLibraryDomain, 'books' | 'movies'>;
  label: string;
  record: Record<string, unknown>;
};

const SUBMIT_INTENT = /提交|记录|入库|标记|我(?:读|看)了|读完|看完/;

function titleFrom(text: string): string {
  return text.match(/《([^》]{1,120})》/)?.[1]?.trim() || '';
}

function ratingFrom(text: string): number | null {
  const value = Number(text.match(/([1-5](?:\.\d)?)\s*(?:星|分)/)?.[1]);
  return Number.isFinite(value) ? Math.min(5, value) : null;
}

function draftId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}:frost:${suffix}`;
}

export function frostSubmissionFromText(domain: 'books' | 'movies', input: string, now = new Date()): FrostSubmissionDraft | null {
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
        id: draftId('book'), title, author: '', country: '', type: '', year: null,
        rating, date, synopsis: text, locations: [], aiInstruction: text, note: text,
      },
    };
  }
  return {
    domain,
    label: `《${title}》观影记录`,
    record: {
      id: draftId('movie'), title, original: '', type: '', director: '', country: '', year: null,
      rating, publicRating: null, date, synopsis: text, locations: [], aiInstruction: text, note: text,
    },
  };
}
