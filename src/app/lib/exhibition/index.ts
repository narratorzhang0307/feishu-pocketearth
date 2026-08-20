// 看展整理 agent · 解耦模块公共出口（六层架构，仿 lib/movie）。
export type {
  ExhibitionInput, ExhibitionInputKind, ArtifactTags, GeoTarget, GeoKind, ExhibitionSource,
  ArtifactDraft, ExhibitionPhase, OnExhibitionPhase, Label, Splat3D, ExhibitRepresentations,
} from './types';
export { STAR, artifactKey } from './types';
export { runExhibitionAgent, confirmPin, archiveOnly, alreadyPinned, unpin, recordPlaceFix, recordRatingFix } from './agent';
export { DYNASTY_ERA, CATEGORY_VOCAB, DYNASTY_KEYS, matchDynasty, eraOf, dynastyLabelOf, isValidDynastyKey, MUSEUM_SEEDS, matchMuseum, type DynastyEra, type MuseumSeed, type VenueType } from './catalog';
export {
  VENUE_PREFIX, VENUE_TYPE_LABEL, builtinVenues, customVenues, allVenues, venueById, matchVenue,
  nearestVenue, distanceKm, addCustomVenue, removeCustomVenue, subscribeVenues, venueVisitStats,
  type Venue, type VenueVisitStats,
} from './venues';
export { allArtifacts, getKnownArtifact, type StoredArtifact } from './store';
export { createExhibitionDemoDraft, createQwenOwnedGpuCompetitionDemoDraft } from './demo';
export { createCuratorNotes, type CuratorNotes, type CuratorContext } from './curator';
export { hasRenderableSplat, type RenderableSplatLike } from './splatState';
export { attachFull3D, full3DOf, isQuick2_5D, removeFull3D, representationsOf, viewingAsset } from './representations';
export { deleteFull3DCapture, FULL3D_MAX_VIEWS, FULL3D_MIN_VIEWS, getFull3DCapture, saveFull3DCapture } from './full3dCaptureStore';
export { ownedGpu3dgsAvailable, readOwnedGpu3DGS, submitOwnedGpu3DGS, type OwnedGpuJobStatus } from './ownedGpu3dgs';

import type { GeoKind } from './types';
// 给 UI：落点精度的中文名 + 颜色（展馆最实、城市最虚）
export const GEO_LABEL: Record<GeoKind, string> = { venue: '展馆', findspot: '出土地', city: '城市' };
export const GEO_COLOR: Record<GeoKind, string> = { venue: '#0a7d4a', findspot: '#c08a00', city: '#8a6d3b' };
