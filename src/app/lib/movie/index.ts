// 电影整理 agent · 解耦模块公共出口（六层架构）。详见 电影 Agent/00-架构总纲.md。
export type {
  MovieInput, MovieInputKind, MovieTags, GeoTarget, GeoKind, MovieSource, MovieDraft, MoviePhase, OnMoviePhase,
} from './types';
export { STAR, movieKey } from './types';
export { runMovieAgent, confirmPin, archiveOnly, alreadyPinned, unpin, recordPlaceFix, recordRatingFix } from './agent';
export { seenBefore } from './catalog';

import type { GeoKind } from './types';
// 给 UI：落点精度的中文名 + 颜色（取景地最实、国家最虚）
export const GEO_LABEL: Record<GeoKind, string> = { filming: '取景地', story: '故事地', country: '国家' };
export const GEO_COLOR: Record<GeoKind, string> = { filming: '#0a7d4a', story: '#c08a00', country: '#8a6d3b' };
