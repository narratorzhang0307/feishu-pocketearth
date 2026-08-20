// 端侧整理照片 agent · 解耦模块公共出口（六层架构）。
export type { PhotoType, Verdict, PinSource, PhotoFeatures, PhotoResult, ScreenOpts, Phase } from './types';
export { runScreen } from './screen';
export {
  type PhotoPin, type Proposal,
  getPhotoPins, subscribePhotoPins, addPhotoPins, removePhotoPin, clearPhotoPins, photoPinIdentity,
  coarsenForShare, buildProposal, toPins,
} from './geoPin';
export { learnFromOverride } from './critic';
export { getPrefs, recordPhotoOverride, clearGeo } from './store';
export type { PhotoLibraryAsset, PhotoAssetIndex, PhotoLibraryAuthorization, PhotoIndexCheckpoint } from './libraryTypes';
export {
  checkPhotoAuthorization, requestPhotoAuthorization, listPhotoLibrary, importWebPhotos,
  openPhotoOriginal, photoOriginalOpenMode, clearPhotoDerivedCache,
  releaseSessionAsset, getPhotoLibraryCapabilities, photoAuthorizationTransition,
} from './libraryBridge';
export type { PhotoAuthorizationTransition, PhotoOriginalOpenMode } from './libraryBridge';
export { buildPhotoChronicleData } from './chronicleData';
export type { PhotoChronicleData } from './chronicleData';
export {
  getIndexedAssets, clearPhotoLibraryIndex, upsertIndexedAssets, getPhotoIndexCheckpoint,
  savePhotoIndexCheckpoint, clearPhotoIndexCheckpoint, reconcileFullLibrarySnapshot,
  markNativeLibraryUnavailable, estimatePhotoIndexStorage,
} from './libraryStore';
export type { PhotoLocationAuthorization } from './photoLocationBridge';
export { checkPhotoLocationAuthorization, requestPhotoLocationAuthorization, attachPhotoLocations } from './photoLocationBridge';
export type { PhotoRadarAnalysis, PhotoDecisionGroups } from './radarTypes';
export { getRadarAnalyses, putRadarAnalysis, putRadarAnalyses, clearPhotoRadar } from './radarStore';
export { analyzePhotoAssets, enrichRadarWithQwen, extractRadarDocument, needsPhotoRadarAnalysis, PHOTO_RADAR_ALGORITHM_VERSION } from './radarPipeline';
export { buildPhotoDecisionGroups } from './decisions';
export { reconcileRadarGroups } from './globalGroups';
export { evaluatePhotoDeviceBudget, getPhotoDeviceBudget } from './deviceBudget';
export type { PhotoDeviceBudgetSnapshot, PhotoDeviceBudgetDecision } from './deviceBudget';
export {
  searchPhotoRadar, mergePhotoSearchResults, matchesPhotoSearchConstraints, explainPhotoSearchMatch,
  getPhotoSearchHistory, rememberPhotoSearch, clearPhotoSearchHistory,
} from './search';
export type { PhotoSearchMatchReason, PhotoSearchMatchKind } from './search';
export type { PhotoSemanticEmbedding, PhotoSemanticMatch, PhotoSemanticIndexResult, PhotoSemanticReconciliationResult } from './semantic';
export {
  PHOTO_EMBEDDING_MODEL_ID, PHOTO_EMBEDDING_VERSION, PHOTO_EMBEDDING_DIMENSION,
  buildPhotoSemanticIndex, searchPhotoSemantic, getPhotoSemanticIndexStatus,
  clearPhotoSemanticIndex, removePhotoSemanticEmbedding, filterSemanticMatchesToAvailableAssets,
  reconcilePhotoSemanticIndex, PhotoSemanticQueryCache, LatestPhotoSemanticQueue,
} from './semantic';
export {
  getPhotoPreferenceModel, preferenceVector, scorePreference, learnPhotoPreference, clearPhotoPreference,
  undoPhotoPreference, buildPreferencePairs, MIN_PREFERENCE_CHOICES,
} from './preference';

// 给 UI 看的类型/判定中文名
import type { PhotoType, Verdict } from './types';
export const TYPE_LABEL: Record<PhotoType, string> = {
  place: '风景地点', life: '人与生活', place_nogps: '实拍·待补地点',
  screenshot: '截图/网图', document: '文档/票据', junk: '废片', uncertain: '待定',
};
export const VERDICT_LABEL: Record<Verdict, string> = { keep: '留', review: '待定', clean: '可清理' };
export const VERDICT_COLOR: Record<Verdict, string> = { keep: '#00aa55', review: '#c08a00', clean: '#d23b3b' };
