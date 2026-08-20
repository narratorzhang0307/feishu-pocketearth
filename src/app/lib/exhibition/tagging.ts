// 协作·子 agent 层：两个运行时子 agent（仿 movie/tagging.ts）。
// ① 补全子 agent：一次云脑（/api/frost-llm, json）强约束 JSON，据展签文本出 朝代键/材质/器类/文明/出土地/尺寸/展馆。
//    dynastyKey/category 只能从给定枚举/词表选（受控），不确定留空——把幻觉压在 critic 护栏之前。
// ② 地理子 agent：展馆 > 出土地 > 城市逐级 geocode（展馆种子表先行，再 resolvePlace 全球兜底）。
import { resolvePlace } from '../skills/resolvePlace';
import { enrichJSON } from '../skills/enrichEntity';
import { formatInstructions, type Shape } from '../skills/structured';
import { matchDynasty, isValidDynastyKey, DYNASTY_KEYS, CATEGORY_VOCAB } from './catalog';
import { matchVenue } from './venues';
import type { GeoTarget } from './types';

// 云脑补全子 agent 的原始产出（全部可缺，缺则空）
export interface EnrichRaw {
  nameZh: string; nameEn: string; aliases: string[];
  dynastyKey: string; material: string[]; category: string; culture: string;
  findspot: string; dimensions: string; museum: string;
  confidence: number | null;
}
const EMPTY: EnrichRaw = { nameZh: '', nameEn: '', aliases: [], dynastyKey: '', material: [], category: '', culture: '', findspot: '', dimensions: '', museum: '', confidence: null };

const ENRICH_SHAPE: Shape = {
  nameZh: { type: 'string', desc: '展品中文名' },
  nameEn: { type: 'string', desc: '展品英文名，不确定留空' },
  aliases: { type: 'string[]', desc: '常见别名/旧译名，最多 4 个，不确定留空数组' },
  dynastyKey: { type: 'string', desc: '朝代枚举键，只能从给定列表选，不确定留空' },
  material: { type: 'string[]', desc: '材质，如 青铜/陶/银，最多 3 个' },
  category: { type: 'string', desc: '器类，只能从给定词表选' },
  culture: { type: 'string', desc: '所属文明，如 华夏/古埃及/两河，默认 华夏' },
  findspot: { type: 'string', desc: '出土地，中文，不确定留空' },
  dimensions: { type: 'string', desc: '尺寸，如 通高33.5厘米，不确定留空' },
  museum: { type: 'string', desc: '收藏展馆全名，不确定留空' },
  confidence: { type: 'number', desc: '结构化补全置信度，0 到 1；不确定填 0' },
};

const PLACEHOLDER_RE = /^(?:n\/?a|none|null|unknown|not\s+available|not\s+provided|暂无|无|未知|不详|未提供|无法判断|无法确定)$/i;
const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
const OBJECT_TEXT_KEYS = ['value', 'label', 'name', 'text', 'displayName', 'display_name', 'title', 'rawText', 'raw_text'];
const strFromObject = (x: unknown) => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return '';
  const obj = x as Record<string, unknown>;
  for (const key of OBJECT_TEXT_KEYS) {
    const value = str(obj[key]);
    if (value && !PLACEHOLDER_RE.test(value)) return value;
  }
  return '';
};
function cleanScalar(x: unknown): string {
  if (Array.isArray(x)) {
    for (const item of x) {
      const value = cleanScalar(item);
      if (value && !PLACEHOLDER_RE.test(value)) return value;
    }
    return '';
  }
  const value = str(x) || strFromObject(x);
  return value && !PLACEHOLDER_RE.test(value) ? value : '';
}
const isEmptyFieldValue = (value: unknown) => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return !cleanScalar(value);
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => !cleanScalar(item));
  }
  if (typeof value === 'object') return !cleanScalar(value);
  return false;
};
const pickField = (obj: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = obj[key];
    if (!isEmptyFieldValue(value)) return value;
  }
  return undefined;
};
const hasCjk = (value: string) => /[\u3400-\u9fff]/.test(value);
const GENERIC_NAME_KEYS = ['title', 'objectTitle', 'object_title', 'objectName', 'object_name', 'artifactName', 'artifact_name', 'workTitle', 'work_title', 'displayName', 'display_name', 'name'];
const MATERIAL_KEYS = ['material', 'materials', 'materialDisplay', 'material_display', 'materialsDisplay', 'materials_display', 'medium', 'mediumDisplay', 'medium_display', 'materialsAndTechniques', 'materials_and_techniques', 'mediumAndSupport', 'medium_and_support', 'mediumAndTechnique', 'medium_and_technique'];
const MUSEUM_KEYS = ['museum', 'museumName', 'museum_name', 'institution', 'repository', 'repositoryName', 'repository_name', 'repositoryLocation', 'repository_location', 'currentLocation', 'current_location', 'presentLocation', 'present_location', 'currentRepository', 'current_repository', 'holdingInstitution', 'holding_institution', 'holdingMuseum', 'holding_museum'];
const DATE_KEYS = ['dynastyKey', 'dynasty_key', 'period', 'periods', 'periodDisplay', 'period_display', 'timePeriod', 'time_period', 'era', 'dynasty', 'date', 'dateDisplay', 'date_display', 'displayDate', 'display_date', 'objectDate', 'object_date', 'dateCreated', 'date_created', 'creationDate', 'creation_date', 'creationPeriod', 'creation_period', 'productionDate', 'production_date', 'productionPeriod', 'production_period', 'periodName', 'period_name'];
const DIMENSION_KEYS = ['dimensions', 'dimension', 'measurements', 'measurement', 'objectMeasurements', 'object_measurements', 'objectDimensions', 'object_dimensions', 'size'];
const ENRICH_CONTENT_KEYS = [
  'nameZh', 'name_zh', 'titleZh', 'title_zh', 'zhName', 'zh_name', 'chineseName', 'chinese_name',
  'nameEn', 'name_en', 'titleEn', 'title_en', 'enName', 'en_name', 'englishName', 'english_name',
  ...GENERIC_NAME_KEYS,
  'aliases', 'alias', 'alternativeNames', 'alternative_names', 'otherNames', 'other_names',
  ...DATE_KEYS,
  ...MATERIAL_KEYS,
  'category', 'objectType', 'object_type', 'objectClassification', 'object_classification', 'classificationTitle', 'classification_title', 'type', 'classification',
  'culture', 'cultures', 'civilization', 'civilizations', 'culturalContext', 'cultural_context',
  'findspot', 'placeOfOrigin', 'place_of_origin', 'placesOfOrigin', 'places_of_origin', 'productionPlace', 'production_place', 'origin', 'site',
  ...DIMENSION_KEYS,
  ...MUSEUM_KEYS,
];
const ENRICH_WRAPPER_KEYS = ['artifact', 'artifacts', 'exhibit', 'exhibits', 'object', 'objects', 'data', 'result', 'results', 'record', 'items', 'choices', 'candidates', 'candidate', 'message', 'content', 'parts', 'part', 'output_text', 'outputText', 'output', 'text', 'response', 'tool_calls', 'toolCalls', 'toolCall', 'tool_call', 'function', 'functionCall', 'function_call', 'arguments', 'args', 'parameters', 'params', 'parsed', 'metadata', 'meta'];
const ENRICH_CONFIDENCE_KEYS = [
  'confidence',
  'confidenceScore',
  'confidence_score',
  'confidenceValue',
  'confidence_value',
  'qwenConfidence',
  'gmi_confidence',
  'normalizedConfidence',
  'normalized_confidence',
  'confidenceNormalized',
  'confidence_normalized',
  'estimatedConfidence',
  'estimated_confidence',
  'score',
];
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hasEnrichContent = (obj: Record<string, unknown>) => ENRICH_CONTENT_KEYS.some((key) => !isEmptyFieldValue(obj[key]));
const TEXT_CONTENT_BLOCK_TYPES = ['text', 'output_text', 'input_text', 'markdown', 'output_markdown', 'input_markdown'];
const TEXT_CONTENT_BLOCK_KEYS = ['text', 'content', 'markdown'];
const textContentBlockValue = (obj: Record<string, unknown>) => {
  const type = cleanScalar(obj.type).toLowerCase().replace(/[-\s]+/g, '_');
  if (!TEXT_CONTENT_BLOCK_TYPES.includes(type)) return null;
  for (const key of TEXT_CONTENT_BLOCK_KEYS) {
    if (typeof obj[key] === 'string') return obj[key] as string;
  }
  return null;
};
const STRUCTURED_CONTENT_BLOCK_TYPES = ['json', 'output_json', 'input_json', 'json_object'];
const STRUCTURED_CONTENT_BLOCK_KEYS = ['json', 'parsed', 'data', 'object', 'value', 'content', 'text'];

function parseJsonStringPayload(value: string): unknown | null {
  const text = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const candidates = [text];
  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1));
  for (const candidate of [...new Set(candidates)]) {
    if (!/^[{[]/.test(candidate)) continue;
    try {
      return JSON.parse(candidate);
    } catch { /* try next candidate */ }
  }
  return null;
}

const PLAIN_FIELD_KEYS: Record<string, string> = {
  artifact: 'objectName',
  object: 'objectName',
  objectname: 'objectName',
  objecttitle: 'objectTitle',
  title: 'title',
  worktitle: 'workTitle',
  name: 'name',
  namezh: 'nameZh',
  titlezh: 'titleZh',
  zhname: 'zhName',
  chinesename: 'chineseName',
  chinese: 'chineseName',
  中文名: 'nameZh',
  展品中文名: 'nameZh',
  nameen: 'nameEn',
  titleen: 'titleEn',
  enname: 'enName',
  englishname: 'englishName',
  english: 'englishName',
  英文名: 'nameEn',
  展品英文名: 'nameEn',
  aliases: 'aliases',
  alias: 'aliases',
  alternativenames: 'alternativeNames',
  othernames: 'otherNames',
  别名: 'aliases',
  又名: 'aliases',
  旧译名: 'aliases',
  dynastykey: 'dynastyKey',
  period: 'period',
  timeperiod: 'timePeriod',
  era: 'era',
  dynasty: 'dynasty',
  date: 'date',
  perioddisplay: 'periodDisplay',
  datedisplay: 'dateDisplay',
  displaydate: 'displayDate',
  objectdate: 'objectDate',
  datecreated: 'dateCreated',
  creationdate: 'creationDate',
  creationperiod: 'creationPeriod',
  productiondate: 'productionDate',
  productionperiod: 'productionPeriod',
  periodname: 'periodName',
  年代: 'period',
  时代: 'period',
  时期: 'period',
  朝代: 'dynasty',
  materials: 'materials',
  material: 'material',
  materialsdisplay: 'materialsDisplay',
  materialdisplay: 'materialDisplay',
  medium: 'medium',
  mediumdisplay: 'mediumDisplay',
  mediumandsupport: 'mediumAndSupport',
  mediumandtechnique: 'mediumAndTechnique',
  materialsandtechniques: 'materialsAndTechniques',
  材质: 'material',
  材料: 'material',
  category: 'category',
  classification: 'classification',
  objecttype: 'objectType',
  objectclassification: 'objectClassification',
  classificationtitle: 'classificationTitle',
  type: 'type',
  器类: 'category',
  类别: 'category',
  类型: 'category',
  culture: 'culture',
  cultures: 'cultures',
  civilization: 'civilization',
  civilizations: 'civilizations',
  culturalcontext: 'culturalContext',
  文明: 'culture',
  文化: 'culture',
  findspot: 'findspot',
  placeoforigin: 'placeOfOrigin',
  placesoforigin: 'placesOfOrigin',
  productionplace: 'productionPlace',
  origin: 'origin',
  site: 'site',
  出土地: 'findspot',
  发现地: 'findspot',
  产地: 'findspot',
  dimensions: 'dimensions',
  dimension: 'dimension',
  measurements: 'measurements',
  measurement: 'measurement',
  objectmeasurements: 'objectMeasurements',
  objectdimensions: 'objectDimensions',
  size: 'size',
  尺寸: 'dimensions',
  大小: 'size',
  museum: 'museum',
  museumname: 'museumName',
  institution: 'institution',
  repository: 'repository',
  repositoryname: 'repositoryName',
  repositorylocation: 'repositoryLocation',
  currentlocation: 'currentLocation',
  presentlocation: 'presentLocation',
  currentrepository: 'currentRepository',
  holdinginstitution: 'holdingInstitution',
  holdingmuseum: 'holdingMuseum',
  展馆: 'museum',
  博物馆: 'museum',
  馆藏地: 'repository',
  收藏地: 'repository',
  现藏: 'currentLocation',
  现藏地: 'currentLocation',
  confidence: 'confidence',
  confidencescore: 'confidenceScore',
  confidencevalue: 'confidenceValue',
  gmiconfidence: 'qwenConfidence',
  normalizedconfidence: 'normalizedConfidence',
  confidencenormalized: 'confidenceNormalized',
  estimatedconfidence: 'estimatedConfidence',
  score: 'score',
  置信度: 'confidence',
  可信度: 'confidence',
};

const normalizePlainFieldLabel = (value: string) => value
  .replace(/[「」“”"']/g, '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '')
  .replace(/[()（）]/g, '');

const cleanPlainTextLine = (value: string) => value
  .replace(/^\s*(?:[-*•]\s+|\d+[.)、]\s*)/, '')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .trim();

const PLAIN_FIELD_RE = /^(.{1,48}?)(?:[：:]|\s+[-–—]\s+|\s*[=＝]\s*)\s*(.+)$/;
const PLAIN_FIELD_START_RE = /(?:^|[;；]\s*)(.{1,48}?)(?:[：:]|\s+[-–—]\s+|\s*[=＝]\s*)/g;
const PLAIN_FIELD_LABEL_ONLY_RE = /^(.{1,48}?)(?:[：:]|\s+[-–—]\s*|\s*[=＝]\s*)$/;

function setPlainPayloadField(payload: Record<string, unknown>, label: string, fieldValue: string): void {
  const key = PLAIN_FIELD_KEYS[normalizePlainFieldLabel(label)];
  const value = fieldValue.trim();
  if (!key || !value || PLACEHOLDER_RE.test(value) || !isEmptyFieldValue(payload[key])) return;
  payload[key] = value;
}

function markdownTableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.replace(/\*\*([^*]+)\*\*/g, '$1').trim());
  if (cells.length < 2) return null;
  if (cells.every((cell) => !cell || /^:?-{3,}:?$/.test(cell))) return null;
  if (!PLAIN_FIELD_KEYS[normalizePlainFieldLabel(cells[0])]) return null;
  return cells;
}

function parsePlainTextFields(line: string): Array<[label: string, value: string]> {
  const matches: Array<{ label: string; start: number; valueStart: number }> = [];
  PLAIN_FIELD_START_RE.lastIndex = 0;
  for (let match = PLAIN_FIELD_START_RE.exec(line); match; match = PLAIN_FIELD_START_RE.exec(line)) {
    if (!PLAIN_FIELD_KEYS[normalizePlainFieldLabel(match[1])]) continue;
    matches.push({ label: match[1], start: match.index, valueStart: PLAIN_FIELD_START_RE.lastIndex });
  }
  if (matches.length <= 1) {
    const match = line.match(PLAIN_FIELD_RE);
    return match ? [[match[1], match[2]]] : [];
  }
  return matches
    .map((match, index) => {
      const end = matches[index + 1]?.start ?? line.length;
      return [match.label, line.slice(match.valueStart, end).replace(/[;；]\s*$/, '').trim()] as [string, string];
    })
    .filter(([, value]) => value);
}

function parsePlainTextLabelOnly(line: string): string | null {
  const match = line.match(PLAIN_FIELD_LABEL_ONLY_RE);
  if (!match) return null;
  return PLAIN_FIELD_KEYS[normalizePlainFieldLabel(match[1])] ? match[1] : null;
}

function parsePlainTextPayload(value: string): Record<string, unknown> | null {
  const text = value
    .trim()
    .replace(/^```(?:md|markdown|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const payload: Record<string, unknown> = {};
  let pendingLabel = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const cells = markdownTableCells(rawLine);
    if (cells) {
      pendingLabel = '';
      setPlainPayloadField(payload, cells[0], cells.slice(1).join(' | '));
      continue;
    }
    const line = cleanPlainTextLine(rawLine);
    if (!line) continue;
    const fields = parsePlainTextFields(line);
    if (fields.length) {
      pendingLabel = '';
      for (const [label, fieldValue] of fields) {
        setPlainPayloadField(payload, label, fieldValue);
      }
      continue;
    }
    const labelOnly = parsePlainTextLabelOnly(line);
    if (labelOnly) {
      pendingLabel = labelOnly;
      continue;
    }
    if (pendingLabel) {
      setPlainPayloadField(payload, pendingLabel, line);
      pendingLabel = '';
      continue;
    }
  }
  return hasEnrichContent(payload) ? payload : null;
}

function mergeEnrichPayload(base: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(next)) {
    if (!isEmptyFieldValue(value) && isEmptyFieldValue(merged[key])) merged[key] = value;
  }
  return merged;
}

function unwrapToolArgumentPayload(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  for (const key of ['arguments', 'args', 'parameters', 'params']) {
    const hit = unwrapEnrichPayload(value[key], depth + 1);
    if (hasEnrichContent(hit)) return hit;
  }
  return {};
}

function unwrapSdkWrapperPayload(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  const type = cleanScalar(value.type).toLowerCase().replace(/[-\s]+/g, '_');
  if (!['function', 'tool_call', 'function_call', 'message'].includes(type)) return {};
  let merged: Record<string, unknown> = {};
  for (const key of ENRICH_WRAPPER_KEYS) {
    const hit = unwrapEnrichPayload(value[key], depth + 1);
    if (hasEnrichContent(hit)) merged = mergeEnrichPayload(merged, hit);
  }
  return hasEnrichContent(merged) ? merged : {};
}

function unwrapStructuredContentBlock(value: Record<string, unknown>, depth: number): Record<string, unknown> | null {
  const type = cleanScalar(value.type).toLowerCase().replace(/[-\s]+/g, '_');
  if (!STRUCTURED_CONTENT_BLOCK_TYPES.includes(type)) return null;
  for (const key of STRUCTURED_CONTENT_BLOCK_KEYS) {
    if (!(key in value)) continue;
    const hit = unwrapEnrichPayload(value[key], depth + 1);
    if (hasEnrichContent(hit)) return hit;
  }
  return {};
}

function unwrapEnrichPayload(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 10) return {};
  if (typeof value === 'string') {
    const parsed = parseJsonStringPayload(value);
    if (parsed != null) return unwrapEnrichPayload(parsed, depth + 1);
    return parsePlainTextPayload(value) || {};
  }
  if (Array.isArray(value)) {
    let merged: Record<string, unknown> = {};
    for (const item of value) {
      const hit = unwrapEnrichPayload(item, depth + 1);
      if (hasEnrichContent(hit)) merged = mergeEnrichPayload(merged, hit);
    }
    return hasEnrichContent(merged) ? merged : {};
  }
  if (!isRecord(value)) return {};
  const textBlockValue = textContentBlockValue(value);
  if (textBlockValue != null) return unwrapEnrichPayload(textBlockValue, depth + 1);
  const structuredContentBlockPayload = unwrapStructuredContentBlock(value, depth);
  if (structuredContentBlockPayload !== null) return structuredContentBlockPayload;
  const toolArgumentPayload = unwrapToolArgumentPayload(value, depth);
  if (hasEnrichContent(toolArgumentPayload)) return toolArgumentPayload;
  const sdkWrapperPayload = unwrapSdkWrapperPayload(value, depth);
  if (hasEnrichContent(sdkWrapperPayload)) return sdkWrapperPayload;
  if (hasEnrichContent(value)) return value;
  let merged: Record<string, unknown> = {};
  for (const key of ENRICH_WRAPPER_KEYS) {
    const hit = unwrapEnrichPayload(value[key], depth + 1);
    if (hasEnrichContent(hit)) merged = mergeEnrichPayload(merged, hit);
  }
  if (hasEnrichContent(merged)) return merged;
  return value;
}

function pickNestedConfidence(value: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = pickNestedConfidence(item, depth + 1);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const direct = pickConfidenceField(value);
  if (direct !== undefined) return direct;
  for (const key of ENRICH_CONFIDENCE_KEYS) {
    const hit = pickNestedConfidence(value[key], depth + 1);
    if (hit !== undefined) return hit;
  }
  for (const key of ENRICH_WRAPPER_KEYS) {
    const hit = pickNestedConfidence(value[key], depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}
const pickGenericName = (obj: Record<string, unknown>, preferCjk: boolean) => {
  for (const key of GENERIC_NAME_KEYS) {
    const value = cleanScalar(obj[key]);
    if (value && hasCjk(value) === preferCjk) return value;
  }
  return '';
};
const MATERIAL_LIST_SPLIT_RE = /[、,，;；|/]+|\s+(?:and|with|plus)\s+|\n+/i;
const strArr = (x: unknown) => {
  const source = Array.isArray(x) ? x : (cleanScalar(x) ? [x] : []);
  return source
    .flatMap((item) => {
      if (typeof item !== 'string') return [item];
      const value = item.trim();
      if (!value || PLACEHOLDER_RE.test(value)) return [];
      return value.split(MATERIAL_LIST_SPLIT_RE);
    })
    .map(cleanScalar)
    .filter(Boolean);
};

function normalizeAliases(x: unknown): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  const aliasTextKeys = ['value', 'label', 'name', 'text', 'displayName', 'display_name', 'title'];
  const cleanAlias = (item: unknown) => {
    const direct = cleanScalar(item);
    if (direct) return direct;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
    const obj = item as Record<string, unknown>;
    for (const key of aliasTextKeys) {
      const value = cleanScalar(obj[key]);
      if (value) return value;
    }
    return '';
  };
  const source = Array.isArray(x) ? x : (cleanAlias(x) ? [x] : []);
  const items = source
    .map(cleanAlias)
    .filter((item) => item && !PLACEHOLDER_RE.test(item))
    .flatMap((item) => item.split(/[、,，;；|]+|\s*\/\s*|\n+/).map((s) => s.trim()).filter(Boolean));
  for (const item of items) {
    const value = item.replace(/[「」“”"']/g, '').trim();
    const key = value.toLowerCase();
    if (!value || value.length > 40 || PLACEHOLDER_RE.test(value) || seen.has(key)) continue;
    seen.add(key);
    aliases.push(value);
    if (aliases.length >= 4) break;
  }
  return aliases;
}

const CONFIDENCE_OBJECT_KEYS = [
  'value',
  'score',
  'confidence',
  'confidenceScore',
  'confidence_score',
  'confidenceValue',
  'confidence_value',
  'qwenConfidence',
  'gmi_confidence',
  'normalizedConfidence',
  'normalized_confidence',
  'confidenceNormalized',
  'confidence_normalized',
  'estimatedConfidence',
  'estimated_confidence',
  'probability',
  'percent',
  'percentage',
  'label',
  'text',
];
const CONFIDENCE_NUMERATOR_KEYS = [
  'value',
  'score',
  'confidence',
  'confidenceScore',
  'confidence_score',
  'confidenceValue',
  'confidence_value',
  'qwenConfidence',
  'gmi_confidence',
  'normalizedConfidence',
  'normalized_confidence',
  'confidenceNormalized',
  'confidence_normalized',
  'estimatedConfidence',
  'estimated_confidence',
  'probability',
  'percent',
  'percentage',
];
const CONFIDENCE_DENOMINATOR_KEYS = ['max', 'maximum', 'outOf', 'out_of', 'scale', 'denominator', 'total'];

function confidenceObjectRatio(value: Record<string, unknown>): string[] {
  for (const numeratorKey of CONFIDENCE_NUMERATOR_KEYS) {
    const numerator = parseConfidencePrimitive(value[numeratorKey]);
    if (!Number.isFinite(numerator) || numerator < 0) continue;
    for (const denominatorKey of CONFIDENCE_DENOMINATOR_KEYS) {
      const denominator = parseConfidencePrimitive(value[denominatorKey]);
      if (!Number.isFinite(denominator) || denominator <= 0 || numerator > denominator) continue;
      if (denominator > 1 && numerator <= 1) continue;
      return [`${numerator}/${denominator}`];
    }
  }
  return [];
}

function confidenceCandidates(value: unknown, depth = 0): unknown[] {
  if (depth > 4 || value === undefined || value === null) return [];
  if (typeof value === 'number' || typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => confidenceCandidates(item, depth + 1));
  if (!isRecord(value)) return [];
  const ratio = confidenceObjectRatio(value);
  const nested = CONFIDENCE_OBJECT_KEYS.flatMap((key) => confidenceCandidates(value[key], depth + 1));
  const scalar = cleanScalar(value);
  return scalar ? [...ratio, ...nested, scalar] : [...ratio, ...nested];
}

function parseConfidencePrimitive(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = typeof value === 'string' ? value.trim() : cleanScalar(value);
  if (!text) return NaN;
  const ratio = text.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (ratio) {
    const numerator = Number(ratio[1]);
    const denominator = Number(ratio[2]);
    if (
      !Number.isFinite(numerator)
      || !Number.isFinite(denominator)
      || denominator <= 0
      || numerator < 0
      || numerator > denominator
    ) return NaN;
    return numerator / denominator;
  }
  const isConfidenceText = /[％%]|\bpercent(?:age)?\b|confidence|置信度|可信度/i.test(text);
  const isNumericText = /^-?\d+(?:\.\d+)?$/.test(text);
  const isNumericWithNote = /^-?\d+(?:\.\d+)?\s*\([^)]+\)$/.test(text);
  if (!isConfidenceText && !isNumericText && !isNumericWithNote) return NaN;
  return Number(text.match(/-?\d+(?:\.\d+)?/)?.[0] ?? NaN);
}

function pickConfidenceField(obj: Record<string, unknown>): unknown {
  for (const key of ENRICH_CONFIDENCE_KEYS) {
    if (!(key in obj)) continue;
    const value = obj[key];
    if (confidenceCandidates(value).length) return value;
  }
  return undefined;
}

function normalizeConfidence(x: unknown): number | null {
  for (const candidate of confidenceCandidates(x)) {
    const raw = parseConfidencePrimitive(candidate);
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) continue;
    const value = raw > 1 && raw <= 100 ? raw / 100 : raw;
    return Math.max(0, Math.min(1, value));
  }
  return null;
}

const MATERIAL_ALIASES: Record<string, string> = {
  alabaster: '雪花石膏',
  agate: '玛瑙',
  amber: '琥珀',
  bamboo: '竹',
  'bamboo slip': '竹简',
  'bamboo slips': '竹简',
  basalt: '玄武岩',
  bone: '骨',
  brass: '黄铜',
  bronze: '青铜',
  carnelian: '红玉髓',
  canvas: '画布',
  celadon: '青瓷',
  ceramic: '陶瓷',
  chalcedony: '玉髓',
  clay: '陶',
  copper: '铜',
  cotton: '棉',
  diorite: '闪长岩',
  earthenware: '陶',
  enamel: '珐琅',
  faience: '彩釉陶',
  glass: '玻璃',
  'gilded bronze': '鎏金青铜',
  'gilt bronze': '鎏金青铜',
  'gilt-bronze': '鎏金青铜',
  gouache: '水粉',
  gold: '金',
  'gold leaf': '金箔',
  'gelatin silver print': '明胶银盐照片',
  'gelatin-silver print': '明胶银盐照片',
  granite: '花岗岩',
  granodiorite: '花岗闪长岩',
  'herbarium sheet': '干制植物',
  'herbarium specimen': '干制植物',
  horn: '角',
  ink: '墨',
  iron: '铁',
  ivory: '象牙',
  jade: '玉',
  lacquer: '漆',
  'lapis lazuli': '青金石',
  leather: '皮革',
  linen: '亚麻',
  limestone: '石灰石',
  marble: '大理石',
  'mother of pearl': '贝母',
  'mother-of-pearl': '贝母',
  nacre: '贝母',
  paper: '纸',
  papyrus: '莎草纸',
  parchment: '羊皮纸',
  'photographic paper': '相纸',
  pigment: '颜料',
  plaster: '石膏',
  'plant specimen': '干制植物',
  porcelain: '瓷',
  'pressed plant specimen': '干制植物',
  'pressed plants': '干制植物',
  quartz: '石英',
  'rock crystal': '水晶',
  sandstone: '砂岩',
  shell: '贝壳',
  'skull specimen': '骨骼',
  silk: '丝绸',
  silver: '银',
  'skeleton specimen': '骨骼',
  steel: '钢',
  stone: '石',
  stoneware: '炻器',
  tempera: '蛋彩',
  terracotta: '陶',
  textile: '织物',
  turquoise: '绿松石',
  watercolor: '水彩',
  watercolour: '水彩',
  vellum: '羊皮纸',
  'wet specimen': '液浸标本',
  wood: '木',
  'wooden slip': '木牍',
  'wooden slips': '木牍',
  wool: '羊毛',
  'alcohol-preserved specimen': '液浸标本',
  'fluid-preserved specimen': '液浸标本',
  'formalin-preserved specimen': '液浸标本',
  'spirit-preserved specimen': '液浸标本',
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATERIAL_ALIAS_MATCHERS: Array<[RegExp, string]> = Object.entries(MATERIAL_ALIASES)
  .filter(([key]) => /^[a-z][a-z\s-]*$/.test(key))
  .sort(([a], [b]) => b.length - a.length)
  .map(([key, value]) => [new RegExp(`\\b${escapeRegExp(key).replace(/\s+/g, '\\s+')}\\b`, 'i'), value]);

function normalizeMaterialItem(item: string): string {
  const key = item.toLowerCase().replace(/\s+/g, ' ');
  const exact = MATERIAL_ALIASES[key];
  if (exact) return exact;
  return MATERIAL_ALIAS_MATCHERS.find(([pattern]) => pattern.test(key))?.[1] || item;
}

function normalizeMaterial(x: unknown): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of strArr(x)) {
    const value = normalizeMaterialItem(item);
    if (seen.has(value)) continue;
    seen.add(value);
    values.push(value);
    if (values.length >= 3) break;
  }
  return values;
}

function inferMaterialFromCategory(x: unknown): string[] {
  for (const item of strArr(x)) {
    if (/(?:泥板|陶板|楔形文字泥板|陶片文字|\bclay\s+tablets?\b|\bcuneiform\s+tablets?\b|\bterracotta\s+tablets?\b|\bostrac(?:a|ons?)\b)/i.test(item)) {
      return ['陶'];
    }
    if (/(?:莎草纸卷轴|莎草纸残片|\bpapyrus\s+(?:scrolls?|fragments?|documents?|manuscripts?)\b)/i.test(item)) {
      return ['莎草纸'];
    }
    if (/(?:彩绘玻璃|彩色玻璃|玻璃彩窗|\bstained\s+glass\b|\bpainted\s+glass\b)/i.test(item)) {
      return ['彩绘玻璃'];
    }
    if (/(?:琥珀包裹体|琥珀内含物|\bamber\s+(?:inclusions?|specimens?|fossils?)\b|\binsects?\s+in\s+amber\b|\bfossil\s+resin\b)/i.test(item)) {
      return ['琥珀'];
    }
    if (/(?:液浸|浸制|福尔马林|酒精保存|液体保存).{0,8}标本|标本.{0,8}(?:液浸|浸制|福尔马林|酒精保存|液体保存)|\bwet\s+specimen\s+(?:jars?|vessels?)\b|\b(?:wet|fluid|spirit|alcohol|formalin)[-\s]?(?:preserved\s+)?(?:\w+\s+){0,3}specimens?\b|\bspecimens?\s+(?:preserved\s+)?(?:in\s+)?(?:fluid|spirit|alcohol|formalin)\b/i.test(item)) {
      return ['液浸标本'];
    }
    if (/(?:玻璃|琉璃).{0,8}(?:器|瓶|杯|碗|罐|壶|珠|坠|佩|像|雕|球)|(?:器|瓶|杯|碗|罐|壶|珠|坠|佩|像|雕|球).{0,8}(?:玻璃|琉璃)|\bglass\s*(?:ware|wares)\b|\bglass\s+(?:vessels?|bottles?|cups?|bowls?|vases?|jars?|ewers?|beads?|pendants?|figurines?|sculptures?|objects?|artifacts?|artefacts?)\b/i.test(item)) {
      return ['玻璃'];
    }
  }
  return [];
}

const CATEGORY_ALIAS_PATTERNS: Array<[RegExp, string]> = [
  [/^(?:雕塑|雕像|塑像|陶塑|泥塑|彩塑|陶俑|墓俑|人物俑|兵马俑|沙布提(?:俑|像)?|乌沙布提(?:俑|像)?|木雕|牙雕|骨雕|石膏像|石膏雕像|石膏翻模|雕塑复制件|能面|能乐面|伎乐面|舞乐面|statue|statuary|statuettes?|sculpture|sculptural\s+object|figures?|figurines?|(?:(?:terracotta|clay|ceramic|funerary|tomb|standing|seated|kneeling|votive)\s+)+figures?|u?shabtis?|shawabtis?|carved\s+figures?|(?:wood(?:en)?|ivory|bone|horn)\s+carvings?|plaster\s+casts?|sculpture\s+casts?|cast\s+(?:statues?|sculptures?|figures?|busts?)|busts?|masks?|(?:noh|bugaku|theat(?:er|re)|ritual|funerary)\s+masks?|buddhas?|bodhisattvas?|taxidermy(?:\s+mounts?)?|mounted\s+(?:animals?|birds?|mammals?)|(?:animal|bird)\s+mounts?|(?:(?:animal|mammal|bird|fish|reptile|dodo|horse|deer|bear|tiger|lion)\s+)?(?:skulls?|skeletons?)\s+specimens?)$/i, '造像'],
  [/^(?:青铜器|bronze|bronzes|bronze\s+(?:ware|vessel|object|artifact|artefact|ritual\s+vessel))$/i, '青铜器'],
  [/^(?:陶器|陶瓷|陶|陶罐|陶瓶|陶碗|陶杯|陶盘|陶盆|陶壶|陶片|陶瓷片|陶器残片|陶瓷残片|陶板|泥板|楔形文字泥板|陶片文字|彩陶罐|彩陶盆|pottery|potsherds?|pottery\s+sherds?|earthenware|stoneware|faience|ceramic|ceramics|ceramic\s+ware|clay\s+tablets?|cuneiform\s+tablets?|terracotta\s+tablets?|ostrac(?:a|ons?)|(?:ceramic|earthenware|stoneware|faience)\s+(?:ware|vessels?|vases?|bowls?|jars?|pots?|cups?|plates?|dish(?:es)?|ewers?|objects?|sherds?|fragments?))$/i, '陶器'],
  [/^(?:瓷器|瓷|青花瓷|青花瓷瓶|青花瓷碗|白瓷|青瓷|瓷瓶|瓷碗|瓷杯|瓷盘|瓷壶|瓷罐|瓷片|瓷器残片|porcelain|celadon|porcelain\s+ware|(?:porcelain|celadon)\s+(?:ware|vessels?|vases?|bowls?|jars?|pots?|cups?|plates?|dish(?:es)?|ewers?|objects?|sherds?|fragments?))$/i, '瓷器'],
  [/^(?:玉器|玉|jade|jadeite|jade\s+(?:ware|object|artifact|artefact|ornament))$/i, '玉器'],
  [/^(?:绘画|油画|水彩|壁画|版画|浮世绘|书法|书画|唐卡|painting|drawing|fresco(?:es)?|murals?|wall\s+paintings?|watercolou?rs?|gouaches?|pastels?|pastel\s+drawings?|charcoal\s+drawings?|ink\s+drawings?|prints?|woodblock\s+prints?|ukiyo[-\s]?e\s+prints?|woodcuts?|linocuts?|photogravures?|collotypes?|aquatints?|mezzotints?|drypoints?|monotypes?|monoprints?|lithographs?|etchings?|engravings?|wood\s+engravings?|screenprints?|screen\s+prints?|silkscreens?|silk\s+screens?|silk\s+screen\s+prints?|serigraphs?|thangkas?|icons?|painted\s+icons?|religious\s+icons?|altarpieces?|triptychs?|diptychs?|photographs?|photography|photographic\s+(?:prints?|negatives?|slides?)|contact\s+sheets?|proof\s+sheets?|negative\s+strips?|film\s+strips?|film\s+negatives?|transparenc(?:y|ies)|35mm\s+slides?|stereographs?|stereoscopic\s+(?:cards?|photographs?)|cabinet\s+cards?|cartes?[-\s]?de[-\s]?visite|daguerreotypes?|ambrotypes?|tintypes?|albumen\s+prints?|cyanotypes?|glass\s+plate\s+negatives?|lantern\s+slides?|magic\s+lantern\s+slides?|calligraphy|mosaics?|mosaic\s+(?:panels?|floors?|fragments?)|tiles?|tile\s+(?:panels?|fragments?)|ceramic\s+tiles?|glazed\s+tiles?|stained\s+glass(?:\s+(?:windows?|panels?))?|painted\s+glass\s+(?:windows?|panels?))$/i, '书画'],
  [/^(?:乐谱|曲谱|手稿乐谱|唱本|歌本|赞美诗集|musical\s+scores?|manuscript\s+scores?|sheet\s+music|music\s+manuscripts?|songbooks?|hymnals?|librettos?|libretti)$/i, '书画'],
  [/^(?:唱片|黑胶唱片|留声机唱片|phonograph\s+records?|gramophone\s+records?|vinyl\s+records?|shellac\s+records?|78\s*rpm\s+records?|lp\s+records?|record\s+sleeves?)$/i, '书画'],
  [/^(?:纸牌|扑克牌|塔罗牌|游戏卡|playing\s+cards?|tarot\s+cards?|game\s+cards?|card\s+games?)$/i, '书画'],
  [/^(?:贺卡|节日卡|圣诞卡|新年贺卡|greeting\s+cards?|holiday\s+cards?|christmas\s+cards?|new\s+year\s+cards?)$/i, '书画'],
  [/^(?:明信片|美术明信片|风景明信片|postcards?|picture\s+postcards?|souvenir\s+postcards?)$/i, '书画'],
  [/^(?:日历|月历|年历|月份牌|历书|通书|黄历|(?:wall|desk|pocket|advertising|promotional)\s+calendars?|calendars?|calendar\s+(?:cards?|leaves|posters?)|almanacs?)$/i, '书画'],
  [/^(?:门票|票根|票券|收据|发票|凭证|粮票|布票|ticket\s+stubs?|(?:admission|museum|event|railway|train)\s+tickets?|receipts?|invoices?|coupons?|vouchers?|ration\s+(?:books?|coupons?|tickets?))$/i, '书画'],
  [/^(?:莎草纸卷轴|莎草纸残片|papyrus\s+(?:scrolls?|fragments?|documents?|manuscripts?))$/i, '书画'],
  [/^(?:植物图谱|植物画|植物标本夹页|标本夹页|昆虫标本抽屉|botanical\s+(?:illustrations?|plates?)|natural\s+history\s+illustrations?|specimen\s+sheets?|plant\s+specimen\s+sheets?|entomology\s+drawers?|insect\s+drawers?)$/i, '书画'],
  [/^(?:古籍|善本|古书|线装书|书籍|写本|手稿|手稿页|古籍残页|古籍装帧|装帧|书封|书皮|封面|文献|档案|报纸|剪报|期刊|杂志|书信|信札|通信|相册|影集|摄影集|照片书|剪贴簿|屏风|册页|扇面|折扇|团扇|地图|图集|图录|展览图录|拍卖图录|馆藏图录|目录册|蓝图|平面图|皮影|影偶|拓本|拓片|碑拓|节目单|戏单|菜单|邀请函|请柬|名片|商业卡|烟卡|screens?|scrolls?|hand\s*scrolls?|handscrolls?|folding\s+screens?|screen\s+paintings?|painted\s+screens?|album\s+(?:leaf|leaves)|(?:photograph|photo|autograph)\s+albums?|photo\s*books?|photobooks?|scrapbooks?|(?:manuscript|book|folio)\s+(?:leaf|leaves)|foli(?:o|os)|folding\s+fans?|hand\s+fans?|fan\s+(?:leaves?|paintings?)|fans?|shadow\s+puppets?|(?:stone\s+|ink\s+)?rubbings?|manuscripts?|illuminated\s+manuscripts?|codex(?:es)?|codices|rare\s+books?|printed\s+books?|books?|bookbindings?|book\s+bindings?|manuscript\s+bindings?|codex\s+bindings?|bindings?|book\s+covers?|catalog(?:ue)?s?|(?:exhibition|collection|auction|trade|sales?)\s+catalog(?:ue)?s?|documents?|archival\s+documents?|archives?|letters?|(?:personal\s+)?correspondence|newspapers?|newspaper\s+clippings?|press\s+clippings?|magazines?|periodicals?|serials?|journals?|diar(?:y|ies)|maps?|atlas(?:es)?|cartographic\s+materials?|blueprints?|architectural\s+plans?|site\s+plans?|floor\s+plans?|ephemera|printed\s+ephemera|posters?|broadsides?|pamphlets?|leaflets?|flyers?|tickets?|certificates?|invitation\s+cards?|trade\s+cards?|business\s+cards?|visiting\s+cards?|calling\s+cards?|cigarette\s+cards?|playbills?|theat(?:er|re)\s+program(?:me)?s?|programmes?|programs?|restaurant\s+menus?|menus?|brochures?|postcards?|postage\s+stamps?|philatelic\s+materials?|first\s+day\s+covers?|postal\s+covers?|envelopes?|herbarium\s+(?:sheets?|specimens?)|(?:plant|dried\s+plant|botanical)\s+specimens?(?:\s+sheets?)?|pressed\s+(?:plants?|flowers?)(?:\s+specimens?)?|leaf\s+fossils?|fossil\s+(?:slabs?|plates?)|pinned\s+(?:insects?|butterfl(?:y|ies))(?:\s+specimens?)?(?:\s+(?:boxes?|cases?|drawers?|trays?))?|(?:insect|butterfl(?:y|ies))\s+specimens?\s+(?:boxes?|cases?|drawers?|trays?))$/i, '书画'],
  [/^(?:标本|自然史标本|natural\s+history\s+specimens?|wet\s+specimen\s+(?:jars?|vessels?)|(?:wet|fluid|spirit|alcohol|formalin)[-\s]?(?:preserved\s+)?(?:\w+\s+){0,3}specimens?|specimens?\s+(?:preserved\s+)?(?:in\s+)?(?:fluid|spirit|alcohol|formalin)|(?:mineral|rock|shell|coral|marine\s+shell)\s+specimens?|rock\s+samples?|meteorite\s+fragments?|moon\s+rock(?:\s+fragments?)?|quartz\s+crystals?|crystal\s+clusters?|coral\s+(?:specimens?|fragments?)|conch\s+shells?|sea\s+shells?|marine\s+shells?|(?:(?:dinosaur|shark|mammoth)\s+(?:fossil\s+)?(?:tooth|teeth|claws?|eggs?|bones?))|fossil\s+(?:tooth|teeth|shell|bones?|eggs?)|(?:ammonite|trilobite)\s+fossils?|amber\s+(?:inclusions?|specimens?|fossils?)|insects?\s+in\s+amber|fossil\s+resin|矿物标本|矿石标本|岩石标本|陨石碎片|月岩样本|水晶簇|贝壳标本|贝类标本|海螺标本|珊瑚标本|液浸标本|浸制标本|福尔马林标本|酒精保存标本|液体保存标本|琥珀包裹体|琥珀内含物|化石牙|牙齿化石|化石骨|化石蛋|恐龙蛋|菊石化石|三叶虫化石)$/i, '标本'],
  [/^(?:工具|钥匙|锁具|锁|挂锁|keys?|door\s+keys?|padlocks?|locks?|door\s+locks?)$/i, '工具'],
  [/^(?:玩具|玩偶|木偶|偶人|棋子|骰子|toys?|dolls?|puppets?|game\s+pieces?|gaming\s+pieces?|dice)$/i, '玩具'],
  [/^(?:烟具|烟斗|烟管|水烟袋|smoking\s+pipes?|tobacco\s+pipes?|hookahs?|water\s+pipes?|opium\s+pipes?)$/i, '烟具'],
  [/^(?:灯具|宫灯|油灯|铜灯|灯盏|灯台|烛台|提灯|lanterns?|lamps?|oil\s+lamps?|mosque\s+lamps?|candlesticks?|candelabr(?:a|um)|rushlights?)$/i, '灯具'],
  [/^(?:钱币|货币|硬币|纸币|纸钞|钞票|奖章|勋章|勋饰|纪念章|coin(?:s|age)?|medals?|medallions?|tokens?|trade\s+tokens?|bank\s*notes?|banknotes?|paper\s+(?:money|currency)|currency\s+notes?|numismatic(?:\s+(?:objects?|items?|collections?))?|currency|orders?\s+and\s+decorations?|military\s+decorations?|service\s+medals?|campaign\s+medals?|commemorative\s+medals?|order\s+badges?)$/i, '钱币'],
  [/^(?:家具|椅|椅子|宝座|王座|柜|橱|桌|桌案|床|床榻|长凳|凳|凳子|furniture|chairs?|thrones?|cabinets?|wardrobes?|chests?|tables?|desks?|beds?|benches?|stools?)$/i, '家具'],
  [/^(?:漆木器|漆器|木器|lacquer|lacquerware|lacquer\s+ware|lacquered\s+wood|woodwork|woodenware|inr[oō](?:\s+cases?)?)$/i, '漆木器'],
  [/^(?:金银器|金器|银器|奖杯|奖盃|goldwork|silverwork|silverware|gold\s+ware|silver\s+ware|precious\s+metalwork|metalwork|troph(?:y|ies)|award\s+cups?|prize\s+cups?|presentation\s+cups?)$/i, '金银器'],
  [/^(?:织物|织品|织锦|刺绣|挂毯|地毯|服饰|袍服|龙袍|衣冠|衣裙|旗袍|和服|法衣|祭服|祭披|披肩|围巾|头巾|蕾丝|花边|围裙|被面|拼布被|绗缝被|草席|竹席|编席|席垫|textiles?|tapestr(?:y|ies)|embroider(?:y|ies)|carpets?|rugs?|kilims?|robes?|garments?|costumes?|dress(?:es)?|gowns?|kimonos?|tunics?|vestments?|liturgical\s+vestments?|ecclesiastical\s+vestments?|chasubles?|dalmatics?|stoles?|liturgical\s+stoles?|copes?|shawls?|sashes?|scarves?|headscarves?|lace(?:work)?|samplers?|aprons?|quilts?|coverlets?|bedcovers?|bedspreads?|woven\s+mats?|reed\s+mats?|bamboo\s+mats?|straw\s+mats?|matting|mats?)$/i, '织绣'],
  [/^(?:乐器|古琴|琵琶|竖琴|箜篌|古筝|扬琴|小提琴|大提琴|编钟|钟磬|铜钟|鼓|铜鼓|大鼓|建鼓|鼍鼓|编磬|石磬|铜锣|笛|箫|musical\s+instruments?|stringed\s+instruments?|plucked\s+instruments?|lutes?|lyres?|harps?|zithers?|pip(?:a|as)|guqins?|flutes?|drums?|gongs?|temple\s+bells?|standing\s+bells?|ceremonial\s+bells?|chime\s+bells?|bell\s+chimes?|bianzhong|violins?|cellos?|guitars?)$/i, '乐器'],
  [/^(?:模型|沙盘|建筑模型|场景模型|微缩模型|微缩景观|船模|车模|architectural\s+models?|scale\s+models?|ship\s+models?|boat\s+models?|train\s+models?|city\s+models?|site\s+models?|building\s+models?|dioramas?|maquettes?)$/i, '模型'],
  [/^(?:交通工具|车马|车船|车辆|车驾|马车|战车|船|舟|船只|chariots?|ceremonial\s+chariots?|war\s+chariots?|carriages?|carts?|wagons?|coaches?|vehicles?|boats?|ships?|watercraft|canoes?|barges?)$/i, '交通工具'],
  [/^(?:装置|装置艺术|大型装置|沉浸式装置|场景装置|installations?|installation\s+art|immersive\s+installations?|site-specific\s+installations?|room-sized\s+installations?)$/i, '装置'],
  [/^(?:仪器|科学仪器|天文仪器|航海仪器|计时仪器|光学仪器|摄影器材|电影器材|钟表|座钟|怀表|天球仪|地球仪|浑天仪|星盘|日晷|罗盘|指南针|六分仪|象限仪|显微镜|望远镜|照相机|摄影机|放映机|幻灯机|镜头|scientific\s+instruments?|timepieces?|clocks?|watch(?:es)?|pocket\s+watch(?:es)?|astrolabes?|sundials?|compasses?|sextants?|quadrants?|armillary\s+spheres?|orreries|celestial\s+globes?|terrestrial\s+globes?|globes?|microscopes?|telescopes?|navigational\s+instruments?|measuring\s+instruments?|photographic\s+instruments?|optical\s+instruments?|cameras?|camera\s+lens(?:es)?|photographic\s+lens(?:es)?|projectors?|film\s+projectors?|slide\s+projectors?|magic\s+lanterns?|cinematographs?)$/i, '仪器'],
  [/^(?:甲胄|盔甲|铠甲|头盔|兜鍪|胄|armou?r|arms?\s+and\s+armou?r|suits?\s+of\s+armou?r|samurai\s+armou?r|body\s+armou?r|mail\s+armou?r|helmets?|war\s+helmets?|ceremonial\s+helmets?|kabuto)$/i, '甲胄'],
  [/^(?:兵器|武器|刀剑|剑|刀|匕首|矛|矛头|枪矛|戈|戟|钺|盾|盾牌|火枪|火器|枪械|swords?|daggers?|knives?|blades?|spearheads?|spears?|lances?|halberds?|axeheads?|battle\s+axes?|shields?|firearms?|guns?|pistols?|rifles?|muskets?|crossbows?|weapons?|arms)$/i, '兵器'],
  [/^(?:佩饰|首饰|饰品|徽饰|头饰|冠帽|王冠|冠冕|礼冠|帽子|礼帽|权杖|鞋履|鞋|靴|靴子|绣鞋|弓鞋|三寸金莲|珠串|项链|戒指|耳饰|耳珰|耳环|耳坠|胸针|手镯|手链|臂环|臂钏|臂镯|脚镯|脚环|踝饰|踝环|颈环|项圈|护身符|坠饰|挂坠|吊坠|发簪|簪|发钗|钗|梳|梳子|带钩|带扣|腰带扣|扣饰|徽章|像章|胸章|襟章|纽扣|钮扣|衣扣|jewel(?:ry|lery)|ornaments?|personal\s+ornaments?|adornments?|regalia|insignia|headdress(?:es)?|headgear|crowns?|diadems?|sceptres?|scepters?|hats?|caps?|footwear|shoes?|(?:embroidered|lotus|platform|ceremonial)\s+shoes?|boots?|sandals?|slippers?|moccasins?|pendants?|amulets?|beads?|necklaces?|rings?|neck\s+rings?|earrings?|ear\s+(?:ornaments?|spools?|flares?|plugs?|pendants?)|brooch(?:es)?|bracelets?|torcs?|torques?|armlets?|anklets?|belt\s+buckles?|dress\s+buckles?|shoe\s+buckles?|buckles?|hairpins?|hair\s+ornaments?|combs?|tiaras?|fibulae?|fibulas?|belt\s+hooks?|badges?|lapel\s+badges?|hat\s+badges?|cap\s+badges?|button\s+badges?|campaign\s+buttons?|dress\s+buttons?|buttons?|lapel\s+pins?|hat\s+pins?|tie\s+pins?|netsukes?|ojime(?:\s+beads?)?|cameos?|scarabs?|scarab\s+amulets?)$/i, '佩饰'],
  [/^(?:印章|印玺|玉印|玺印|seals?|seal\s+stamps?|cylinder\s+seals?|stamp\s+seals?|seal\s+(?:stones?|matrix|matrices|impressions?)|intaglios?|scarab\s+seals?|scaraboid\s+seals?)$/i, '印章'],
  [/^(?:容器|盒|盒子|匣|匣子|香盒|经盒|舍利盒|圣物匣|玻璃器|琉璃器|瓶|罐|碗|杯|高脚杯|圣杯|壶|盘|碟|篮|筐|竹篮|藤篮|编篮|托盘|香炉|熏炉|文具盒|文房盒|笔筒|笔洗|水盂|box(?:es)?|caskets?|reliquar(?:y|ies)|glass\s*wares?|containers?|vessels?|jars?|bowls?|cups?|chalices?|goblets?|vases?|ewers?|dishes?|plates?|bottles?|pots?|trays?|baskets?|basketry|woven\s+baskets?|coiled\s+baskets?|wicker\s+baskets?|splint\s+baskets?|basketry\s+(?:baskets?|trays?|containers?)|censers?|incense\s+burners?|thuribles?|snuff\s+box(?:es)?|writing\s+box(?:es)?|brush\s+(?:pots?|washers?)|water\s+droppers?)$/i, '容器'],
  [/^(?:棺椁|棺槨|棺|木棺|石棺|木乃伊棺|木乃伊|sarcophag(?:us|i)|coffins?|mumm(?:y|ies)|mummified\s+remains|(?:human|animal)\s+mumm(?:y|ies)|mummy\s+(?:cases?|coffins?|sarcophag(?:us|i)))$/i, '棺椁'],
  [/^(?:甲骨|卜骨|oracle\s+bones?)$/i, '甲骨'],
  [/^(?:石刻|碑刻|碑|石碑|石牌|石匾|碑额|reliefs?|relief\s+(?:panels?|fragments?|sculptures?)|bas[-\s]?reliefs?|stele|stelae?|stone\s+carvings?|stone\s+tablets?|inscribed\s+(?:stone\s+)?slabs?|(?:inscribed|stone|memorial|commemorative)\s+plaques?|inscriptions?|architectural\s+(?:fragments?|elements?|members?)|column\s+capitals?|stone\s+capitals?|friezes?|lintels?)$/i, '石刻'],
];

const CATEGORY_PHRASE_PATTERNS: Array<[RegExp, string]> = [
  [/(?:甲骨|卜骨|\boracle\s+bones?\b)/i, '甲骨'],
  [/(?:雕塑|雕像|塑像|造像|佛像|陶塑|泥塑|彩塑|陶俑|墓俑|人物俑|兵马俑|沙布提(?:俑|像)?|乌沙布提(?:俑|像)?|木雕|牙雕|骨雕|石膏像|石膏雕像|石膏翻模|雕塑复制件|能面|能乐面|伎乐面|舞乐面|\b(?:(?:terracotta|clay|ceramic|funerary|tomb|standing|seated|kneeling|votive)\s+)+figures?\b|\bu?shabtis?\b|\bshawabtis?\b|\bcarved\s+figures?\b|\b(?:wood(?:en)?|ivory|bone|horn)\s+carvings?\b|\bplaster\s+casts?\b|\bsculpture\s+casts?\b|\bcast\s+(?:statues?|sculptures?|figures?|busts?)\b|\b(?:statue|statuary|statuettes?|sculpture|sculptural|figurines?|busts?|masks?|buddhas?|bodhisattvas?|taxidermy)\b|\b(?:noh|bugaku|theat(?:er|re)|ritual|funerary)\s+masks?\b|\bmounted\s+(?:animals?|birds?|mammals?)\b|\b(?:animal|bird)\s+mounts?\b|\b(?:(?:animal|mammal|bird|fish|reptile|dodo|horse|deer|bear|tiger|lion)\s+)?(?:skulls?|skeletons?)\s+specimens?\b)/i, '造像'],
  [/(?:绘画|油画|水彩|壁画|版画|浮世绘|书法|书画|唐卡|\b(?:painting|drawing|fresco(?:es)?|murals?|wall\s+paintings?|watercolou?rs?|gouaches?|pastels?|pastel\s+drawings?|charcoal\s+drawings?|ink\s+drawings?|prints?|woodblock\s+prints?|ukiyo[-\s]?e\s+prints?|woodcuts?|linocuts?|photogravures?|collotypes?|aquatints?|mezzotints?|drypoints?|monotypes?|monoprints?|lithographs?|etchings?|engravings?|wood\s+engravings?|screenprints?|screen\s+prints?|silkscreens?|silk\s+screens?|silk\s+screen\s+prints?|serigraphs?|thangkas?|icons?|painted\s+icons?|religious\s+icons?|altarpieces?|triptychs?|diptychs?|photographs?|photography|photographic\s+(?:prints?|negatives?|slides?)|contact\s+sheets?|proof\s+sheets?|negative\s+strips?|film\s+strips?|film\s+negatives?|transparenc(?:y|ies)|35mm\s+slides?|stereographs?|stereoscopic\s+(?:cards?|photographs?)|cabinet\s+cards?|cartes?[-\s]?de[-\s]?visite|daguerreotypes?|ambrotypes?|tintypes?|albumen\s+prints?|cyanotypes?|glass\s+plate\s+negatives?|lantern\s+slides?|magic\s+lantern\s+slides?|calligraphy|mosaics?|mosaic\s+(?:panels?|floors?|fragments?)|tiles?|tile\s+(?:panels?|fragments?)|ceramic\s+tiles?|glazed\s+tiles?|stained\s+glass(?:\s+(?:windows?|panels?))?|painted\s+glass\s+(?:windows?|panels?))\b)/i, '书画'],
  [/(?:乐谱|曲谱|唱本|歌本|赞美诗集|\b(?:musical\s+scores?|manuscript\s+scores?|sheet\s+music|music\s+manuscripts?|songbooks?|hymnals?|librettos?|libretti)\b)/i, '书画'],
  [/(?:唱片|黑胶唱片|留声机唱片|\b(?:phonograph|gramophone|vinyl|shellac)\s+records?\b|\b78\s*rpm\s+records?\b|\blp\s+records?\b|\brecord\s+sleeves?\b)/i, '书画'],
  [/(?:贺卡|节日卡|圣诞卡|新年贺卡|\b(?:greeting|holiday|christmas|new\s+year)\s+cards?\b)/i, '书画'],
  [/(?:明信片|美术明信片|风景明信片|\b(?:(?:picture|souvenir)\s+)?postcards?\b)/i, '书画'],
  [/(?:日历|月历|年历|月份牌|历书|通书|黄历|\b(?:(?:wall|desk|pocket|advertising|promotional)\s+)?calendars?\b|\bcalendar\s+(?:cards?|leaves|posters?)\b|\balmanacs?\b)/i, '书画'],
  [/(?:门票|票根|票券|收据|发票|凭证|粮票|布票|\bticket\s+stubs?\b|\b(?:admission|museum|event|railway|train)\s+tickets?\b|\b(?:receipts?|invoices?|coupons?|vouchers?)\b|\bration\s+(?:books?|coupons?|tickets?)\b)/i, '书画'],
  [/(?:莎草纸卷轴|莎草纸残片|\bpapyrus\s+(?:scrolls?|fragments?|documents?|manuscripts?)\b)/i, '书画'],
  [/(?:植物图谱|植物画|植物标本夹页|标本夹页|昆虫标本抽屉|\b(?:botanical\s+(?:illustrations?|plates?)|natural\s+history\s+illustrations?|specimen\s+sheets?|plant\s+specimen\s+sheets?|entomology\s+drawers?|insect\s+drawers?)\b)/i, '书画'],
  [/(?:古籍|善本|古书|线装书|书籍|写本|手稿|手稿页|古籍残页|古籍装帧|装帧|书封|书皮|文献|档案|报纸|剪报|期刊|杂志|书信|信札|通信|相册|影集|摄影集|照片书|剪贴簿|屏风|册页|扇面|折扇|团扇|地图|图集|图录|展览图录|拍卖图录|馆藏图录|目录册|蓝图|平面图|皮影|影偶|拓本|拓片|碑拓|节目单|戏单|菜单|邀请函|请柬|名片|商业卡|烟卡|\b(?:scrolls?|hand\s*scrolls?|handscrolls?|folding\s+screens?|screen\s+paintings?|painted\s+screens?|album\s+(?:leaf|leaves)|(?:photograph|photo|autograph)\s+albums?|photo\s*books?|photobooks?|scrapbooks?|(?:manuscript|book|folio)\s+(?:leaf|leaves)|foli(?:o|os)|folding\s+fans?|hand\s+fans?|fan\s+(?:leaves?|paintings?)|fans?|shadow\s+puppets?|(?:stone\s+|ink\s+)?rubbings?|manuscripts?|illuminated\s+manuscripts?|codex(?:es)?|codices|rare\s+books?|printed\s+books?|books?|bookbindings?|book\s+bindings?|manuscript\s+bindings?|codex\s+bindings?|book\s+covers?|(?:exhibition|collection|auction|trade|sales?)\s+catalog(?:ue)?s?|documents?|archival\s+documents?|archives?|(?:personal\s+)?correspondence|newspapers?|newspaper\s+clippings?|press\s+clippings?|magazines?|periodicals?|serials?|journals?|diar(?:y|ies)|maps?|atlas(?:es)?|cartographic\s+materials?|blueprints?|architectural\s+plans?|site\s+plans?|floor\s+plans?|ephemera|printed\s+ephemera|posters?|broadsides?|pamphlets?|leaflets?|flyers?|tickets?|certificates?|invitation\s+cards?|trade\s+cards?|business\s+cards?|visiting\s+cards?|calling\s+cards?|cigarette\s+cards?|playbills?|theat(?:er|re)\s+program(?:me)?s?|programmes?|programs?|exhibition\s+programs?|restaurant\s+menus?|menus?|brochures?|postcards?|postage\s+stamps?|philatelic\s+materials?|first\s+day\s+covers?|postal\s+covers?|envelopes?|herbarium\s+(?:sheets?|specimens?)|(?:plant|dried\s+plant|botanical)\s+specimens?(?:\s+sheets?)?|pressed\s+(?:plants?|flowers?)(?:\s+specimens?)?|leaf\s+fossils?|fossil\s+(?:slabs?|plates?)|pinned\s+(?:insects?|butterfl(?:y|ies))(?:\s+specimens?)?(?:\s+(?:boxes?|cases?|drawers?|trays?))?|(?:insect|butterfl(?:y|ies))\s+specimens?\s+(?:boxes?|cases?|drawers?|trays?))\b)/i, '书画'],
  [/(?:标本|自然史标本|\bnatural\s+history\s+specimens?\b|\bwet\s+specimen\s+(?:jars?|vessels?)\b|\b(?:wet|fluid|spirit|alcohol|formalin)[-\s]?(?:preserved\s+)?(?:\w+\s+){0,3}specimens?\b|\bspecimens?\s+(?:preserved\s+)?(?:in\s+)?(?:fluid|spirit|alcohol|formalin)\b|\b(?:mineral|rock|shell|coral|marine\s+shell)\s+specimens?\b|\brock\s+samples?\b|\bmeteorite\s+fragments?\b|\bmoon\s+rock(?:\s+fragments?)?\b|\bquartz\s+crystals?\b|\bcrystal\s+clusters?\b|\bcoral\s+(?:specimens?|fragments?)\b|\bconch\s+shells?\b|\bsea\s+shells?\b|\bmarine\s+shells?\b|\b(?:(?:dinosaur|shark|mammoth)\s+(?:fossil\s+)?(?:tooth|teeth|claws?|eggs?|bones?))\b|\bfossil\s+(?:tooth|teeth|shell|bones?|eggs?)\b|\b(?:ammonite|trilobite)\s+fossils?\b|\bamber\s+(?:inclusions?|specimens?|fossils?)\b|\binsects?\s+in\s+amber\b|\bfossil\s+resin\b|矿物标本|矿石标本|岩石标本|陨石碎片|月岩样本|水晶簇|贝壳标本|贝类标本|海螺标本|珊瑚标本|液浸标本|浸制标本|福尔马林标本|酒精保存标本|液体保存标本|琥珀包裹体|琥珀内含物|化石牙|牙齿化石|化石骨|化石蛋|恐龙蛋|菊石化石|三叶虫化石)/i, '标本'],
  [/(?:工具|钥匙|锁具|挂锁|\b(?:door\s+keys?|keys?|padlocks?|door\s+locks?)\b)/i, '工具'],
  [/(?:玩具|玩偶|木偶|偶人|棋子|骰子|\b(?:toys?|dolls?|puppets?|game\s+pieces?|gaming\s+pieces?|dice)\b)/i, '玩具'],
  [/(?:烟具|烟斗|烟管|水烟袋|\b(?:smoking\s+pipes?|tobacco\s+pipes?|hookahs?|water\s+pipes?|opium\s+pipes?)\b)/i, '烟具'],
  [/(?:灯具|宫灯|油灯|铜灯|灯盏|灯台|烛台|提灯|\b(?:oil\s+lamps?|mosque\s+lamps?|candlesticks?|candelabr(?:a|um)|rushlights?)\b)/i, '灯具'],
  [/(?:钱币|货币|硬币|纸币|纸钞|钞票|奖章|勋章|勋饰|纪念章|\b(?:coin(?:s|age)?|medals?|medallions?|tokens?|trade\s+tokens?|bank\s*notes?|banknotes?|paper\s+(?:money|currency)|currency\s+notes?|numismatic(?:\s+(?:objects?|items?|collections?))?|currency|orders?\s+and\s+decorations?|military\s+decorations?|service\s+medals?|campaign\s+medals?|commemorative\s+medals?|order\s+badges?)\b)/i, '钱币'],
  [/(?:家具|椅子|宝座|王座|柜|橱|桌|桌案|床榻?|\b(?:furniture|chairs?|thrones?|cabinets?|wardrobes?|chests?|tables?|desks?|beds?|benches?|stools?|screens?)\b)/i, '家具'],
  [/(?:青铜器|青铜礼器|\b(?:bronze|ritual)\s+(?:ritual\s+)?(?:ware|vessels?|bells?|tripods?|objects?)\b|\britual\s+bronzes?\b|\bbronze\s+ritual\b)/i, '青铜器'],
  [/(?:陶器|陶罐|陶瓶|陶碗|陶杯|陶盘|陶盆|陶壶|陶片|陶瓷片|陶器残片|陶瓷残片|陶板|泥板|楔形文字泥板|陶片文字|彩陶罐|彩陶盆|\b(?:ceramic|earthenware|stoneware|faience)\s+(?:ware|vessels?|vases?|bowls?|jars?|pots?|cups?|plates?|dish(?:es)?|ewers?|objects?|sherds?|fragments?)\b|\b(?:pottery|potsherds?|pottery\s+sherds?|clay\s+tablets?|cuneiform\s+tablets?|terracotta\s+tablets?|ostrac(?:a|ons?))\b)/i, '陶器'],
  [/(?:瓷器|青花瓷|白瓷|青瓷|瓷瓶|瓷碗|瓷杯|瓷盘|瓷壶|瓷罐|瓷片|瓷器残片|\b(?:porcelain|celadon)\s+(?:ware|vessels?|vases?|bowls?|jars?|pots?|cups?|plates?|dish(?:es)?|ewers?|objects?|sherds?|fragments?)\b)/i, '瓷器'],
  [/(?:玉器|\bjade\s+(?:ware|vessels?|objects?|carvings?|pendants?)\b)/i, '玉器'],
  [/(?:漆木器|\blacquerware\b|\blacquer(?:ed)?\s+(?:ware|wood|objects?|boxes?|vessels?)\b|\binr[oō](?:\s+cases?)?\b)/i, '漆木器'],
  [/(?:金银器|奖杯|奖盃|\b(?:goldwork|silverwork|troph(?:y|ies)|award\s+cups?|prize\s+cups?|presentation\s+cups?)\b|\b(?:gold|silver|gilt|silver[-\s]?gilt)\s+(?:ware|vessels?|cups?|plates?|objects?)\b)/i, '金银器'],
  [/(?:织物|织品|织锦|刺绣|挂毯|地毯|服饰|袍服|龙袍|衣冠|衣裙|旗袍|和服|法衣|祭服|祭披|披肩|围巾|头巾|蕾丝|花边|围裙|被面|拼布被|绗缝被|草席|竹席|编席|席垫|\b(?:textiles?|tapestr(?:y|ies)|embroider(?:y|ies)|embroidered|carpets?|rugs?|kilims?|robes?|garments?|costumes?|dress(?:es)?|gowns?|kimonos?|tunics?|vestments?|liturgical\s+vestments?|ecclesiastical\s+vestments?|chasubles?|dalmatics?|stoles?|liturgical\s+stoles?|copes?|shawls?|sashes?|scarves?|headscarves?|lace(?:work)?|samplers?|aprons?|quilts?|coverlets?|bedcovers?|bedspreads?|woven\s+mats?|reed\s+mats?|bamboo\s+mats?|straw\s+mats?|matting|mats?)\b)/i, '织绣'],
  [/(?:乐器|古琴|琵琶|竖琴|箜篌|古筝|扬琴|小提琴|大提琴|编钟|钟磬|铜钟|铜鼓|大鼓|建鼓|鼍鼓|编磬|石磬|铜锣|\b(?:musical|stringed|plucked)\s+instruments?\b|\b(?:lutes?|lyres?|harps?|zithers?|pip(?:a|as)|guqins?|flutes?|drums?|gongs?|temple\s+bells?|standing\s+bells?|ceremonial\s+bells?|chime\s+bells?|bell\s+chimes?|bianzhong|violins?|cellos?|guitars?)\b)/i, '乐器'],
  [/(?:模型|沙盘|微缩景观|船模|车模|\b(?:(?:architectural|scale|ship|boat|train|city|site|building)\s+models?|dioramas?|maquettes?)\b)/i, '模型'],
  [/(?:交通工具|车船|车辆|车驾|马车|战车|\b(?:ceremonial\s+chariots?|war\s+chariots?|chariots?|carriages?|carts?|wagons?|coaches?|vehicles?|boats?|ships?|watercraft|canoes?|barges?)\b)/i, '交通工具'],
  [/(?:装置艺术|大型装置|沉浸式装置|场景装置|\b(?:installation\s+art|installations?|immersive\s+installations?|site-specific\s+installations?|room-sized\s+installations?)\b)/i, '装置'],
  [/(?:仪器|科学仪器|天文仪器|航海仪器|计时仪器|光学仪器|摄影器材|电影器材|钟表|座钟|怀表|天球仪|地球仪|浑天仪|星盘|日晷|罗盘|指南针|六分仪|象限仪|显微镜|望远镜|照相机|摄影机|放映机|幻灯机|镜头|\b(?:scientific|navigational|measuring|photographic|optical)\s+instruments?\b|\b(?:timepieces?|clocks?|watch(?:es)?|pocket\s+watch(?:es)?|astrolabes?|sundials?|compasses?|sextants?|quadrants?|armillary\s+spheres?|orreries|celestial\s+globes?|terrestrial\s+globes?|globes?|microscopes?|telescopes?|cameras?|camera\s+lens(?:es)?|photographic\s+lens(?:es)?|projectors?|film\s+projectors?|slide\s+projectors?|magic\s+lanterns?|cinematographs?)\b)/i, '仪器'],
  [/(?:甲胄|盔甲|铠甲|头盔|兜鍪|\b(?:arms?\s+and\s+armou?r|suits?\s+of\s+armou?r|samurai\s+armou?r|body\s+armou?r|mail\s+armou?r|armou?r|helmets?|war\s+helmets?|ceremonial\s+helmets?|kabuto)\b)/i, '甲胄'],
  [/(?:兵器|武器|刀剑|匕首|矛头|盾牌|火枪|火器|枪械|\b(?:swords?|daggers?|knives?|blades?|spearheads?|spears?|lances?|halberds?|axeheads?|battle\s+axes?|shields?|firearms?|guns?|pistols?|rifles?|muskets?|crossbows?|weapons?)\b)/i, '兵器'],
  [/(?:佩饰|首饰|饰品|徽饰|头饰|冠帽|王冠|冠冕|礼冠|帽子|礼帽|权杖|鞋履|绣鞋|弓鞋|三寸金莲|珠串|项链|戒指|耳饰|耳珰|耳环|耳坠|胸针|手镯|手链|臂环|臂钏|臂镯|脚镯|脚环|踝饰|踝环|颈环|项圈|护身符|坠饰|挂坠|吊坠|发簪|发钗|梳子|带钩|带扣|腰带扣|扣饰|徽章|像章|胸章|襟章|纽扣|钮扣|衣扣|\b(?:jewel(?:ry|lery)|ornaments?|personal\s+ornaments?|adornments?|regalia|insignia|headdress(?:es)?|headgear|crowns?|diadems?|sceptres?|scepters?|hats?|caps?|footwear|shoes?|(?:embroidered|lotus|platform|ceremonial)\s+shoes?|boots?|sandals?|slippers?|moccasins?|pendants?|amulets?|beads?|necklaces?|rings?|neck\s+rings?|earrings?|ear\s+(?:ornaments?|spools?|flares?|plugs?|pendants?)|brooch(?:es)?|bracelets?|torcs?|torques?|armlets?|anklets?|belt\s+buckles?|dress\s+buckles?|shoe\s+buckles?|buckles?|hairpins?|hair\s+ornaments?|combs?|tiaras?|fibulae?|fibulas?|belt\s+hooks?|badges?|lapel\s+pins?|hat\s+pins?|tie\s+pins?|button\s+badges?|campaign\s+buttons?|dress\s+buttons?|netsukes?|ojime(?:\s+beads?)?|cameos?|scarabs?|scarab\s+amulets?)\b)/i, '佩饰'],
  [/(?:印章|印玺|玉印|玺印|\b(?:seal\s+stamps?|cylinder\s+seals?|stamp\s+seals?|seal\s+(?:stones?|matrix|matrices|impressions?)|intaglios?|scarab\s+seals?|scaraboid\s+seals?)\b)/i, '印章'],
  [/(?:香盒|经盒|舍利盒|圣物匣|香炉|熏炉|玻璃器|琉璃器|容器|竹篮|藤篮|编篮|文具盒|文房盒|笔筒|笔洗|水盂|\b(?:snuff\s+box(?:es)?|writing\s+box(?:es)?|brush\s+(?:pots?|washers?)|water\s+droppers?|reliquar(?:y|ies)|caskets?|glass\s*wares?|containers?|vessels?|jars?|bowls?|cups?|chalices?|goblets?|vases?|ewers?|dishes?|plates?|bottles?|pots?|trays?|baskets?|basketry|woven\s+baskets?|coiled\s+baskets?|wicker\s+baskets?|splint\s+baskets?|censers?|incense\s+burners?|thuribles?)\b)/i, '容器'],
  [/(?:棺椁|棺槨|木棺|石棺|木乃伊棺|木乃伊|\bmummified\s+(?:human\s+|animal\s+)?remains\b|\b(?:human|animal)\s+mumm(?:y|ies)\b|\b(?:sarcophag(?:us|i)|coffins?|mummy\s+(?:cases?|coffins?|sarcophag(?:us|i)))\b)/i, '棺椁'],
  [/(?:石刻|碑刻|墓志|石碑|石牌|石匾|碑额|\b(?:reliefs?|relief\s+(?:panels?|fragments?|sculptures?)|bas[-\s]?reliefs?|stele|stelae?|stone\s+carvings?|stone\s+tablets?|inscribed\s+(?:stone\s+)?slabs?|(?:inscribed|stone|memorial|commemorative)\s+plaques?|inscriptions?|architectural\s+(?:fragments?|elements?|members?)|column\s+capitals?|stone\s+capitals?|friezes?|lintels?)\b)/i, '石刻'],
];

const CATEGORY_WHOLE_PHRASE_RE = /\borders?\s+and\s+decorations?\b/i;

function normalizeCategory(x: unknown): string {
  const source = Array.isArray(x) ? x : (cleanScalar(x) ? [x] : []);
  const rawValues = source.map(cleanScalar).filter((value) => value && CATEGORY_WHOLE_PHRASE_RE.test(value));
  const values = [...new Set([...rawValues, ...strArr(x)])];
  if (!values.length) return '';
  for (const value of values) {
    if (CATEGORY_VOCAB.includes(value)) return value;
    const hit = CATEGORY_ALIAS_PATTERNS.find(([pattern]) => pattern.test(value));
    if (hit) return hit[1];
    const phraseHit = CATEGORY_PHRASE_PATTERNS.find(([pattern]) => pattern.test(value));
    if (phraseHit) return phraseHit[1];
  }
  return '其他';
}

const CULTURE_ALIASES: Record<string, string> = {
  china: '华夏',
  chinese: '华夏',
  'ancient china': '华夏',
  'ancient egypt': '古埃及',
  'ancient egyptian': '古埃及',
  egyptian: '古埃及',
  mesopotamia: '两河',
  mesopotamian: '两河',
  'ancient mesopotamia': '两河',
  'ancient greece': '古希腊',
  'ancient greek': '古希腊',
  greek: '古希腊',
  hellenistic: '古希腊',
  'hellenistic greek': '古希腊',
  'ancient rome': '古罗马',
  'ancient roman': '古罗马',
  roman: '古罗马',
  india: '印度',
  indian: '印度',
  'indus valley': '印度',
  'indus valley civilization': '印度',
  maya: '玛雅',
  mayan: '玛雅',
  aztec: '阿兹特克',
  inca: '印加',
  persia: '波斯',
  persian: '波斯',
  'achaemenid persian': '波斯',
};
const CULTURE_ALIAS_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:china|chinese)\b/i, '华夏'],
  [/\b(?:ancient\s+)?egypt(?:ian)?\b|\bptolemaic\b/i, '古埃及'],
  [/\bmesopotamia(?:n)?\b|\bsumerian?\b|\bbabylonian?\b|\bassyria[n]?\b/i, '两河'],
  [/\b(?:ancient\s+)?greek\b|\bhellenistic\b/i, '古希腊'],
  [/\b(?:ancient\s+)?roman\b|\broman\s+(?:republic|empire)\b|\bimperial\s+roman\b/i, '古罗马'],
  [/\b(?:india|indian|indus(?:\s+valley)?)\b/i, '印度'],
  [/\bmaya(?:n)?\b/i, '玛雅'],
  [/\baztec\b/i, '阿兹特克'],
  [/\binca\b/i, '印加'],
  [/\bpersia[n]?|\bachaemenid\b/i, '波斯'],
];

function normalizeCulture(x: unknown): string {
  const value = cleanScalar(x);
  if (!value) return '';
  const key = value.toLowerCase().replace(/\s+/g, ' ');
  return CULTURE_ALIASES[key] || CULTURE_ALIAS_PATTERNS.find(([pattern]) => pattern.test(value))?.[1] || value;
}

function normalizeDynastyKey(x: unknown): string {
  const value = cleanScalar(x);
  if (!value) return '';
  if (isValidDynastyKey(value)) return value;
  return matchDynasty(value)?.key || '';
}

function normalizeDimensions(x: unknown): string {
  return cleanScalar(x)
    .replace(/^(?:(?:object\s*)?dimensions?|(?:object\s*)?measurements?|size|尺寸|大小)\s*[：:\-–—]\s*/i, '')
    .trim()
    .slice(0, 40);
}

// 补全子 agent：调云脑，强约束 JSON。失败→EMPTY（舱壁：单级失败不抛错）。
export async function enrichArtifact(nameHint: string, labelText: string): Promise<{ raw: EnrichRaw; ok: boolean }> {
  const system = '你是博物馆研究员。根据展品名与展签文本，给出结构化字段。' + formatInstructions(ENRICH_SHAPE)
    + ` dynastyKey 只能从这些键里选：${DYNASTY_KEYS.join('/')}。category 只能从这些里选：${CATEGORY_VOCAB.join('/')}。`
    + ' 重要：不确定的字段一律留空字符串或空数组，绝对不要编造年代、出土地或尺寸。';
  const prompt = `展品名：${nameHint || '(见展签)'}。展签文本：${labelText || '(无)'}。请输出 JSON。`;
  const obj = await enrichJSON<Record<string, unknown>>({ prompt, system, task: 'exhibition-multilingual' });
  if (!obj) return { raw: EMPTY, ok: false };
  const payload = unwrapEnrichPayload(obj);
  // 云脑吐同义字段名或时代名时先归一；仍不认识再丢弃（护栏）
  const dynastyInput = pickField(payload, DATE_KEYS);
  const categoryInput = pickField(payload, ['category', 'objectType', 'object_type', 'objectClassification', 'object_classification', 'classificationTitle', 'classification_title', 'type', 'classification']);
  const cat = normalizeCategory(categoryInput); // 常见同义词归一；未知项归「其他」
  const material = normalizeMaterial(pickField(payload, MATERIAL_KEYS));
  const genericNameZh = pickGenericName(payload, true);
  const genericNameEn = pickGenericName(payload, false);
  const raw: EnrichRaw = {
    nameZh: cleanScalar(pickField(payload, ['nameZh', 'name_zh', 'titleZh', 'title_zh', 'zhName', 'zh_name', 'chineseName', 'chinese_name'])) || genericNameZh,
    nameEn: cleanScalar(pickField(payload, ['nameEn', 'name_en', 'titleEn', 'title_en', 'enName', 'en_name', 'englishName', 'english_name'])) || genericNameEn,
    aliases: normalizeAliases(pickField(payload, ['aliases', 'alias', 'alternativeNames', 'alternative_names', 'otherNames', 'other_names'])),
    dynastyKey: normalizeDynastyKey(dynastyInput),
    material: material.length ? material : inferMaterialFromCategory(categoryInput), category: cat, culture: normalizeCulture(pickField(payload, ['culture', 'cultures', 'civilization', 'civilizations', 'culturalContext', 'cultural_context'])) || '华夏',
    findspot: cleanScalar(pickField(payload, ['findspot', 'placeOfOrigin', 'place_of_origin', 'placesOfOrigin', 'places_of_origin', 'productionPlace', 'production_place', 'origin', 'site'])),
    dimensions: normalizeDimensions(pickField(payload, DIMENSION_KEYS)),
    museum: cleanScalar(pickField(payload, MUSEUM_KEYS)),
    confidence: normalizeConfidence(pickField(payload, ENRICH_CONFIDENCE_KEYS) ?? pickNestedConfidence(obj)),
  };
  // 云脑可能吐退化 JSON({} / 全空)：所有实质字段皆空(culture 回落'华夏'不算产出)→ 视同没补出内容 ok:false，
  // 否则 pin 会误标 enriched=true 造成缓存中毒（重跑永久跳过补全、字段再也补不上）。
  const produced = !!(raw.nameZh || raw.nameEn || raw.aliases.length || raw.dynastyKey || raw.category || raw.material.length || raw.findspot || raw.dimensions || raw.museum || raw.culture !== '华夏');
  return { raw: produced ? raw : { ...raw, confidence: null }, ok: produced };
}

// 地理子 agent：展馆 > 出土地 > 城市。场馆库先行（内建种子+用户自定义场馆，免 geocode），再 resolvePlace 全球兜底。
export async function geoResolve(opts: { museum?: string; findspot?: string; city?: string }): Promise<GeoTarget | null> {
  if (opts.museum) {
    const seed = matchVenue(opts.museum);
    if (seed) return { kind: 'venue', place: seed.name, lng: seed.lng, lat: seed.lat, confidence: 0.95 };
    const g = await resolvePlace(opts.museum);
    if (g) return { kind: 'venue', place: g.place, lng: g.lng, lat: g.lat, confidence: g.source === 'local' ? 0.85 : 0.78 };
  }
  if (opts.findspot) {
    const g = await resolvePlace(opts.findspot);
    if (g) return { kind: 'findspot', place: g.place, lng: g.lng, lat: g.lat, confidence: 0.6 };
  }
  if (opts.city) {
    const g = await resolvePlace(opts.city);
    if (g) return { kind: 'city', place: g.place, lng: g.lng, lat: g.lat, confidence: 0.5 };
  }
  return null;
}
