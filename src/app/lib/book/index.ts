// 读书整理 agent · 解耦模块公共出口（六层架构）。详见 读书 Agent/00-架构总纲.md。
export type {
  BookInput, BookInputKind, BookTags, GeoTarget, GeoKind, BookSource, BookDraft, BookPhase, OnBookPhase,
} from './types';
export { STAR, bookKey } from './types';
export { runBookAgent, confirmPin, archiveOnly, alreadyPinned, unpin, recordPlaceFix, recordRatingFix } from './agent';
export { structureNotes, getNotes, getNotesForBook, addNote, removeNote, subscribeNotes, type StructuredNote, type NoteInput, type NotePhase } from './notes';
export { seenBefore } from './catalog';

import type { GeoKind } from './types';
export const GEO_LABEL: Record<GeoKind, string> = { story: '故事地', author: '作者地', country: '国家' };
export const GEO_COLOR: Record<GeoKind, string> = { story: '#0a7d4a', author: '#c08a00', country: '#8a6d3b' };
