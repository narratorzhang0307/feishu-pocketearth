// Legacy import compatibility. Active implementation and endpoint are Qwen Image.
export {
  QWEN_IMAGE_ENDPOINT as GEMINI_IMAGE_ENDPOINT,
  QWEN_IMAGE_TIMEOUT_MS as GEMINI_IMAGE_TIMEOUT_MS,
  parseQwenImagePayload as parseGeminiImagePayload,
  requestQwenImage as requestGeminiImage,
  qwenImage as geminiImage,
  imageEmptyError,
} from './qwenImage';
export type {
  QwenImageRequestOptions as GeminiImageRequestOptions,
  QwenImageResult as GeminiImageResult,
} from './qwenImage';
