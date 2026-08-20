// Legacy API compatibility for old tests and persisted integrations. New code
// imports qwenClient.ts directly; these aliases do not register a GMI provider.
export {
  isLikelyQwenImageSource as isLikelyGmiImageSource,
  normalizeQwenImageSource as normalizeGmiImageSource,
  normalizeQwenPrompt as normalizeGmiPrompt,
  parseRetryAfterMs,
  postQwenJson as postGmiJson,
  readQwenError as readGmiError,
  readStringField,
} from './qwenClient';
export type {
  QwenFetch as GmiFetch,
  QwenJsonRequest as GmiJsonRequest,
  QwenJsonResult as GmiJsonResult,
} from './qwenClient';
