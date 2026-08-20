// 行动层：suggest-then-confirm。draft 只是建议，用户确认才落地——绝不自动钉。
// 写进共享落点总线 userMarks(kind:'movie')：全标签进 meta（地球详情/票根都读它）+ 喂长期画像 + 落本地索引（幂等）。
import { markPlace, isPinned, unmarkPlace } from '../skills/markPlace';
import { recordSignals } from '../../../../frost-agent/harness/profile';
import type { MovieDraft } from './types';
import { putMovie } from './store';

const PREFIX = 'umv-';   // userMarks 里电影钉的 id 前缀

// 该片是否已钉（按归一片名主键判，避免重复落点）
export function alreadyPinned(draft: MovieDraft): boolean { return isPinned('movie', PREFIX, draft.id); }

// 确认钉地球：经 markPlace skill 落点（全标签 meta）+ 喂画像 + 落索引。无坐标的不钉（needPlace）。
export async function confirmPin(draft: MovieDraft): Promise<{ pinned: boolean; reason?: string }> {
  if (!draft.geo) return { pinned: false, reason: 'needPlace' };
  const r = markPlace({
    kind: 'movie', prefix: PREFIX, key: draft.id, label: draft.title,
    geo: { lat: draft.geo.lat, lng: draft.geo.lng },
    meta: {
      title: draft.title, original: draft.original, director: draft.tags.director,
      cast: draft.tags.cast, genre: draft.tags.genre, movement: draft.tags.movement,
      plot: draft.tags.plot, synopsis: draft.tags.plot, country: draft.country, year: draft.year,
      rating: draft.tags.userRating, douban: draft.douban, type: draft.tags.genre || '电影',
      date: draft.date, place: draft.geo.place, geoKind: draft.geo.kind,
    },
  });
  // 首次钉才回流画像（已钉过 exists 不重复回流）。回流公开创作标签：国别/导演/类型+流派；
  // 故意不回流 cast 演员表，避免画像变社交图谱。按真实星级加权：5★×3、4★×2、其余×1。
  if (r.reason !== 'exists') {
    const w = draft.tags.userRating >= 5 ? 3 : draft.tags.userRating >= 4 ? 2 : 1;
    const rep = (arr: string[]) => arr.flatMap((x) => Array(w).fill(x) as string[]);
    recordSignals('movies', {
      countries: draft.country ? rep([draft.country]) : [],
      directors: draft.tags.director ? rep([draft.tags.director]) : [],
      genres: rep([draft.tags.genre, draft.tags.movement].filter(Boolean) as string[]),
    });
  }
  await persist(draft, true);
  return r;
}

// 不钉、仅存档（无坐标或用户暂不钉）：进本地索引，下次重跑直接命中
export async function archiveOnly(draft: MovieDraft): Promise<void> { await persist(draft, false); }

async function persist(draft: MovieDraft, pinned: boolean): Promise<void> {
  await putMovie({
    key: draft.id, title: draft.title, country: draft.country, year: draft.year,
    // enriched 只在云脑确实补全过时为 true（'llm'/'mixed'）。纯本地命中('catalog')标签稀疏，
    // 不能记 enriched:true——否则重跑命中索引会永久跳过云脑补全，标签永远补不全（缓存中毒）。
    tags: draft.tags, geo: draft.geo, pinned, enriched: draft.source === 'llm' || draft.source === 'mixed',
    ts: Date.now(),
  });
}

export function unpin(draft: MovieDraft): void { unmarkPlace('movie', PREFIX, draft.id); }
