import { runPhotoVision } from '../../../../frost-agent/edge/httpPhotoEdge';
import type {
  PhotoDocumentEvidence, PhotoDocumentKind, PhotoPrivacyRisk, PhotoRouterDocumentType,
  PhotoRouterEvidence, PhotoRouterRoute, PhotoSourceType,
} from './radarTypes';

export interface PhotoUnderstanding extends PhotoRouterEvidence {
  tags: string[];
  photoCategory: 'real-scene' | 'real-life' | 'screenshot' | 'document' | 'uncertain';
  documentKind: PhotoDocumentKind;
  hasPeople: boolean;
  hasPet: boolean;
  hasQrCode: boolean;
  hardDocument: boolean;
  confidence: number;
}

export interface ParsedOcrDocument {
  kind: PhotoDocumentKind;
  text: string;
  merchant?: string;
  amount?: string;
  date?: string;
  identifiers: string[];
  confidence: number;
}

function jsonObject(text: string): Record<string, unknown> | null {
  const body = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(body.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

const textValue = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const booleanValue = (value: unknown): boolean => value === true || value === 'true';
const confidenceValue = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number > 1 ? number / 100 : number)) : 0;
};
const documentKind = (value: unknown): PhotoDocumentKind => {
  const kind = textValue(value).toLowerCase();
  return ['receipt', 'boarding-pass', 'ticket', 'qr-code', 'document', 'none'].includes(kind) ? kind as PhotoDocumentKind : 'none';
};
const routerDocumentType = (value: unknown): PhotoRouterDocumentType => {
  const kind = textValue(value).toLowerCase();
  return ['receipt', 'ticket', 'menu', 'id', 'other', 'none'].includes(kind) ? kind as PhotoRouterDocumentType : 'none';
};
const sourceType = (value: unknown): PhotoSourceType => {
  const source = textValue(value).toLowerCase();
  return ['real_photo', 'screenshot', 'document_photo', 'artwork', 'uncertain'].includes(source) ? source as PhotoSourceType : 'uncertain';
};
const routerRoute = (value: unknown): PhotoRouterRoute | null => {
  const route = textValue(value).toLowerCase();
  return ['semantic_index', 'ocr', 'geo_pin', 'review'].includes(route) ? route as PhotoRouterRoute : null;
};
const privacyRisk = (value: unknown): PhotoPrivacyRisk[] => Array.isArray(value)
  ? [...new Set(value.map(textValue).filter((risk): risk is PhotoPrivacyRisk => ['face', 'id_number', 'address', 'qr'].includes(risk)))]
  : [];
const photoCategory = (value: unknown): PhotoUnderstanding['photoCategory'] => {
  const category = textValue(value).toLowerCase();
  return ['real-scene', 'real-life', 'screenshot', 'document', 'uncertain'].includes(category)
    ? category as PhotoUnderstanding['photoCategory'] : 'uncertain';
};

export function parsePhotoUnderstanding(text: string): PhotoUnderstanding | null {
  const value = jsonObject(text);
  if (!value) return null;
  const canonicalKeys = ['sourceType', 'content', 'documentType', 'needsOcr', 'privacyRisk', 'route', 'description', 'hardDocument', 'confidence'];
  const hasCanonicalSchema = ['sourceType', 'content', 'documentType', 'needsOcr', 'privacyRisk', 'route'].some((key) => key in value);
  if (hasCanonicalSchema) {
    const source = textValue(value.sourceType).toLowerCase();
    const document = textValue(value.documentType).toLowerCase();
    const route = textValue(value.route).toLowerCase();
    const confidence = Number(value.confidence);
    if (!canonicalKeys.every((key) => key in value)
      || !['real_photo', 'screenshot', 'document_photo', 'artwork', 'uncertain'].includes(source)
      || !Array.isArray(value.content)
      || !['receipt', 'ticket', 'menu', 'id', 'other', 'none'].includes(document)
      || typeof value.needsOcr !== 'boolean'
      || !Array.isArray(value.privacyRisk)
      || !['semantic_index', 'ocr', 'geo_pin', 'review'].includes(route)
      || typeof value.description !== 'string'
      || typeof value.hardDocument !== 'boolean'
      || !Number.isFinite(confidence)) return null;
  } else if (!('photoCategory' in value) && !('documentKind' in value) && !('tags' in value)) return null;
  const legacyCategory = photoCategory(value.photoCategory);
  const canonicalSource = sourceType(value.sourceType);
  const resolvedSource: PhotoSourceType = canonicalSource !== 'uncertain' ? canonicalSource
    : legacyCategory === 'screenshot' ? 'screenshot'
      : legacyCategory === 'document' ? 'document_photo'
        : legacyCategory === 'real-life' || legacyCategory === 'real-scene' ? 'real_photo' : 'uncertain';
  const content = Array.isArray(value.content) ? value.content.map(textValue).filter(Boolean).slice(0, 16) : [];
  const tags = Array.isArray(value.tags) ? value.tags.map(textValue).filter(Boolean).slice(0, 12) : content.slice(0, 12);
  const legacyKind = documentKind(value.documentKind);
  const canonicalDocument = routerDocumentType(value.documentType);
  const resolvedDocument: PhotoRouterDocumentType = canonicalDocument !== 'none' ? canonicalDocument
    : legacyKind === 'receipt' ? 'receipt'
      : legacyKind === 'ticket' || legacyKind === 'boarding-pass' ? 'ticket'
        : legacyKind !== 'none' ? 'other' : 'none';
  const resolvedKind: PhotoDocumentKind = legacyKind !== 'none' ? legacyKind
    : resolvedDocument === 'receipt' ? 'receipt' : resolvedDocument === 'ticket' ? 'ticket'
      : resolvedDocument !== 'none' ? 'document' : 'none';
  const risks = privacyRisk(value.privacyRisk);
  const legacyPeople = booleanValue(value.hasPeople); const legacyPet = booleanValue(value.hasPet); const legacyQr = booleanValue(value.hasQrCode);
  if (legacyPeople && !risks.includes('face')) risks.push('face');
  if (legacyQr && !risks.includes('qr')) risks.push('qr');
  const normalizedContent = content.map((item) => item.toLowerCase());
  const needsOcr = value.needsOcr == null ? resolvedSource === 'document_photo' || resolvedDocument !== 'none' : booleanValue(value.needsOcr);
  const route = routerRoute(value.route) || (needsOcr ? 'ocr' : resolvedSource === 'real_photo' ? 'semantic_index' : 'review');
  const derivedCategory: PhotoUnderstanding['photoCategory'] = legacyCategory !== 'uncertain' ? legacyCategory
    : resolvedSource === 'screenshot' ? 'screenshot'
      : resolvedSource === 'document_photo' ? 'document'
        : resolvedSource === 'real_photo' ? (route === 'geo_pin' ? 'real-scene' : 'real-life') : 'uncertain';
  return {
    description: textValue(value.description),
    tags,
    sourceType: resolvedSource,
    content,
    documentType: resolvedDocument,
    needsOcr,
    privacyRisk: risks,
    route,
    photoCategory: derivedCategory,
    documentKind: resolvedKind,
    hasPeople: legacyPeople || normalizedContent.some((item) => ['person', 'people', 'face'].includes(item)),
    hasPet: legacyPet || normalizedContent.some((item) => ['pet', 'cat', 'dog', 'animal'].includes(item)),
    hasQrCode: legacyQr || risks.includes('qr') || normalizedContent.some((item) => ['qr', 'qr_code'].includes(item)),
    hardDocument: booleanValue(value.hardDocument),
    confidence: confidenceValue(value.confidence),
  };
}

export function parseOcrDocument(text: string): ParsedOcrDocument | null {
  const value = jsonObject(text);
  if (!value) return null;
  const body = textValue(value.text);
  const identifiers = Array.isArray(value.identifiers) ? value.identifiers.map(textValue).filter(Boolean).slice(0, 12) : [];
  return {
    kind: documentKind(value.kind),
    text: body,
    merchant: textValue(value.merchant) || undefined,
    amount: textValue(value.amount) || undefined,
    date: textValue(value.date) || undefined,
    identifiers,
    confidence: confidenceValue(value.confidence),
  };
}

export function ocrQualityScore(document: ParsedOcrDocument | null): number {
  if (!document) return 0;
  const visible = document.text.replace(/\s/g, '');
  const fieldCount = [document.merchant, document.amount, document.date].filter(Boolean).length + document.identifiers.length;
  const repeated = /(.)\1{7,}/.test(visible);
  const length = Math.min(1, visible.length / 80);
  const compact = (value: string | undefined) => (value || '').toLocaleLowerCase().replace(/[\s·:：,，.。¥￥$-]/g, '');
  const fieldValues = [document.merchant, document.amount, document.date, ...document.identifiers].filter(Boolean) as string[];
  const missingFields = fieldValues.filter((value) => !compact(document.text).includes(compact(value))).length;
  // Contradictory totals are a useful no-ground-truth warning for photographed receipts.
  const moneyValues = [...document.text.matchAll(/(?:合计|总计|应收金额)[^\d]{0,8}(\d+[.,]\d{2})/g)]
    .map((match) => match[1].replace(',', '.'));
  const contradictoryTotals = new Set(moneyValues).size > 1;
  return Math.max(0, Math.min(1,
    document.confidence * 0.5 + length * 0.3 + Math.min(1, fieldCount / 4) * 0.2
    - (repeated ? 0.35 : 0) - Math.min(0.24, missingFields * 0.06) - (contradictoryTotals ? 0.12 : 0),
  ));
}

export function shouldEscalateOcr(document: ParsedOcrDocument | null, hardDocument: boolean): boolean {
  return hardDocument || ocrQualityScore(document) < 0.62;
}

export function chooseOcrEvidence(
  base: ParsedOcrDocument | null,
  enhanced: ParsedOcrDocument | null,
  adapterAttempted: boolean,
): PhotoDocumentEvidence {
  const baseScore = ocrQualityScore(base);
  const enhancedScore = ocrQualityScore(enhanced);
  const useEnhanced = !!enhanced && enhancedScore >= baseScore + 0.08;
  const selected = useEnhanced ? enhanced : base;
  const normalizeField = (value: string | undefined) => (value || '').toLocaleLowerCase().replace(/[\s·:：,，.。¥￥$-]/g, '');
  const conflicts = enhanced && base ? (['merchant', 'amount', 'date'] as const).filter((field) => {
    const left = normalizeField(base[field]);
    const right = normalizeField(enhanced[field]);
    return !!left && !!right && left !== right;
  }) : [];
  const scoresAreClose = !!enhanced && Math.abs(baseScore - enhancedScore) < 0.08;
  const manual = !selected || Math.max(baseScore, enhancedScore) < 0.42 || (scoresAreClose && conflicts.length > 0);
  const candidate = (document: ParsedOcrDocument | null, qualityScore: number) => ({
    merchant: document?.merchant,
    amount: document?.amount,
    date: document?.date,
    confidence: document?.confidence || 0,
    qualityScore,
  });
  return {
    kind: selected?.kind || 'document',
    text: selected?.text || '',
    merchant: selected?.merchant,
    amount: selected?.amount,
    date: selected?.date,
    identifiers: selected?.identifiers || [],
    confidence: selected?.confidence || 0,
    route: manual ? 'manual' : useEnhanced ? 'general-ocr-vision' : 'base',
    qualityScore: Math.max(baseScore, useEnhanced ? enhancedScore : 0),
    qualityGate: manual ? 'manual-review' : useEnhanced ? 'lora-accepted' : adapterAttempted ? 'base-kept' : 'base-accepted',
    ...(conflicts.length ? { conflicts } : {}),
    candidates: {
      base: candidate(base, baseScore),
      ...(enhanced ? { enhanced: candidate(enhanced, enhancedScore) } : {}),
    },
  };
}

const UNDERSTANDING_PROMPT = `你是完全在手机本地运行的相册路由器。只根据图片可见内容返回 JSON，不猜身份、关系或地点。固定字段：sourceType(real_photo|screenshot|document_photo|artwork|uncertain), content(最多12个英文类别，如 pet/cat/person/food/landmark/qr), documentType(receipt|ticket|menu|id|other|none), needsOcr(boolean), privacyRisk(face|id_number|address|qr 的数组), route(semantic_index|ocr|geo_pin|review), description(一句中文), hardDocument(反光/倾斜/小字/划痕导致难读), confidence(0-1)。只有可见证据支持时才标隐私风险；不要输出 OCR 正文。只输出 JSON。`;

const OCR_PROMPT = `只抄录图片中实际可见的票据或文档，不补全看不清的字符。返回 JSON：kind(receipt|boarding-pass|ticket|qr-code|document), text, merchant, amount, date, identifiers(数组), confidence(0-1)。只输出 JSON。`;

export async function understandPhotoWithQwen(imageDataUrl: string, signal?: AbortSignal): Promise<{ result: PhotoUnderstanding | null; backend: 'mnn' | 'stub'; error?: string }> {
  const response = await runPhotoVision(imageDataUrl, UNDERSTANDING_PROMPT, { detail: 'fast', maxTokens: 320, signal });
  return { result: response.backend === 'mnn' ? parsePhotoUnderstanding(response.text) : null, backend: response.backend, error: response.error };
}

export async function extractDocumentWithQualityGate(
  imageDataUrl: string,
  options: { hardDocument?: boolean; adapterReady?: boolean; signal?: AbortSignal } = {},
): Promise<{ evidence: PhotoDocumentEvidence; backend: 'mnn' | 'stub'; adapterAttempted: boolean; error?: string }> {
  const baseResponse = await runPhotoVision(imageDataUrl, OCR_PROMPT, { detail: 'high', maxTokens: 768, signal: options.signal });
  const base = baseResponse.backend === 'mnn' ? parseOcrDocument(baseResponse.text) : null;
  const escalate = !options.signal?.aborted && baseResponse.backend === 'mnn' && options.adapterReady === true && shouldEscalateOcr(base, !!options.hardDocument);
  let enhanced: ParsedOcrDocument | null = null;
  let enhancedError: string | undefined;
  if (escalate) {
    const response = await runPhotoVision(imageDataUrl, OCR_PROMPT, { adapter: 'general-ocr-vision', detail: 'ocr', maxTokens: 960, signal: options.signal });
    enhanced = response.backend === 'mnn' ? parseOcrDocument(response.text) : null;
    enhancedError = response.error;
  }
  return {
    evidence: chooseOcrEvidence(base, enhanced, escalate),
    backend: baseResponse.backend,
    adapterAttempted: escalate,
    error: baseResponse.error || enhancedError,
  };
}
