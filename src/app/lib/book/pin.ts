// 行动层：suggest-then-confirm。确认才写 userMarks(kind:'book')，全标签 meta + 喂画像 + 落本地索引（幂等）。镜像 lib/movie/pin.ts。
import { markPlace, isPinned, unmarkPlace } from '../skills/markPlace';
import { recordSignals } from '../../../../frost-agent/harness/profile';
import type { BookDraft } from './types';
import { putBook } from './store';

const PREFIX = 'ubk-';

export function alreadyPinned(draft: BookDraft): boolean { return isPinned('book', PREFIX, draft.id); }

export async function confirmPin(draft: BookDraft): Promise<{ pinned: boolean; reason?: string }> {
  if (!draft.geo) return { pinned: false, reason: 'needPlace' };
  const r = markPlace({
    kind: 'book', prefix: PREFIX, key: draft.id, label: draft.title, amp: 0.5,
    geo: { lat: draft.geo.lat, lng: draft.geo.lng },
    meta: {
      title: draft.title, author: draft.tags.author, translator: draft.tags.translator,
      genre: draft.tags.genre, movement: draft.tags.movement, plot: draft.tags.plot, synopsis: draft.tags.plot, note: draft.tags.plot,
      country: draft.country, year: draft.year, rating: draft.tags.userRating,
      date: draft.date, place: draft.geo.place, geoKind: draft.geo.kind,
    },
  });
  // 首次钉才回流画像（作者/国别/类型+流派）。按真实星级加权：5★×3、4★×2、其余×1（同电影 pin）。
  if (r.reason !== 'exists') {
    const w = draft.tags.userRating >= 5 ? 3 : draft.tags.userRating >= 4 ? 2 : 1;
    const rep = (arr: string[]) => arr.flatMap((x) => Array(w).fill(x) as string[]);
    recordSignals('books', {
      authors: draft.tags.author ? rep([draft.tags.author]) : [],
      countries: draft.country ? rep([draft.country]) : [],
      genres: rep([draft.tags.genre, draft.tags.movement].filter(Boolean) as string[]),
    });
  }
  await persist(draft, true);
  return r;
}

export async function archiveOnly(draft: BookDraft): Promise<void> { await persist(draft, false); }

async function persist(draft: BookDraft, pinned: boolean): Promise<void> {
  await putBook({
    key: draft.id, title: draft.title, country: draft.country, year: draft.year,
    // enriched 仅在云脑补全过时为 true（'llm'/'mixed'）；纯本地命中('catalog')不算，免缓存中毒（同电影 pin）。
    tags: draft.tags, geo: draft.geo, pinned, enriched: draft.source === 'llm' || draft.source === 'mixed', ts: Date.now(),
  });
}

export function unpin(draft: BookDraft): void { unmarkPlace('book', PREFIX, draft.id); }
