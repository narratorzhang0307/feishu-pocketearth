// 反思层：确定性护栏纠正概率产出（挑错强于一次判对）。
// 展品字段（eraStart/dynastyKey/museum）与 movie（year/country）差异大，不套用通用 draftCritic，自写领域护栏。
import type { ArtifactDraft } from './types';
import { getExhibitionPrefs, type StoredArtifact } from './store';
import { eraOf } from './catalog';

const clampRating = (rating: number): number => {
  const n = Number(rating);
  return Math.max(0, Math.min(5, Math.round(Number.isFinite(n) ? n : 0)));
};

const roundConfidence = (n: number): number => Math.round(n * 1000) / 1000;
const QWEN_CONFIDENCE_VALUE_KEYS = [
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
const QWEN_CONFIDENCE_SCALE_KEYS = ['max', 'maximum', 'outOf', 'out_of', 'scale', 'denominator', 'total'];

function parseConfidencePrimitive(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = typeof value === 'string' ? value.trim().replace(/％/g, '%') : '';
  if (!text) return Number.NaN;
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
    ) return Number.NaN;
    return numerator / denominator;
  }
  return Number(text.match(/-?\d+(?:\.\d+)?/)?.[0] ?? Number.NaN);
}

function confidenceObjectRatio(value: Record<string, unknown>): string[] {
  for (const valueKey of QWEN_CONFIDENCE_VALUE_KEYS) {
    const numerator = parseConfidencePrimitive(value[valueKey]);
    if (!Number.isFinite(numerator) || numerator < 0) continue;
    for (const scaleKey of QWEN_CONFIDENCE_SCALE_KEYS) {
      const denominator = parseConfidencePrimitive(value[scaleKey]);
      if (!Number.isFinite(denominator) || denominator <= 0 || numerator > denominator) continue;
      if (denominator > 1 && numerator <= 1) continue;
      return [`${numerator}/${denominator}`];
    }
  }
  return [];
}

function confidenceCandidates(value: unknown, depth = 0): unknown[] {
  if (depth > 3 || value == null) return [];
  if (typeof value === 'number' || typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => confidenceCandidates(item, depth + 1));
  if (typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [
    ...confidenceObjectRatio(record),
    ...QWEN_CONFIDENCE_VALUE_KEYS.flatMap((key) => confidenceCandidates(record[key], depth + 1)),
  ];
}

function normalizeQwenConfidence(value: unknown): number | undefined {
  for (const candidate of confidenceCandidates(value)) {
    const n = parseConfidencePrimitive(candidate);
    if (!Number.isFinite(n) || n < 0) continue;
    if (n <= 1) return roundConfidence(n);
    if (n <= 10) return roundConfidence(n / 10);
    if (n <= 100) return roundConfidence(n / 100);
  }
  return undefined;
}

const LONG_ENGLISH_MATERIALS = new Set([
  'alabaster',
  'earthenware',
  'granodiorite',
  'limestone',
  'porcelain',
  'sandstone',
  'stoneware',
  'terracotta',
]);

function materialFragments(value: string): string[] {
  return value
    .split(/[，,、;；/＋+&]|\s+(?:and|with|on)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeMaterials(material: unknown): string[] {
  if (!Array.isArray(material)) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of material) {
    if (typeof item !== 'string') continue;
    for (const value of materialFragments(item)) {
      const isKnownLongEnglishMaterial = LONG_ENGLISH_MATERIALS.has(value.toLowerCase());
      if (!value || (value.length > 8 && !isKnownLongEnglishMaterial) || /[，。、;；:：]/.test(value) || seen.has(value)) continue;
      seen.add(value);
      cleaned.push(value);
      if (cleaned.length >= 3) break;
    }
    if (cleaned.length >= 3) break;
  }
  return cleaned;
}

export function applyCritic(d: ArtifactDraft): void {
  d.tags.myRating = clampRating(d.tags.myRating);   // 评分钳 0-5
  if (d.geo && (Math.abs(d.geo.lat) > 90 || Math.abs(d.geo.lng) > 180)) { d.geo = null; d.reason += '；Critic：坐标非法→丢弃'; }
  d.needPlace = !d.geo;
  // 朝代→年份一律查表得（云脑只吐 key）：合法键刷新 eraStart/eraEnd/label；非法键清空
  if (d.tags.dynastyKey) {
    const e = eraOf(d.tags.dynastyKey);
    if (e) { d.eraStart = e.start; d.eraEnd = e.end; d.tags.dynastyLabel = e.zh; if (e.culture) d.tags.culture = e.culture; }
    else { d.tags.dynastyKey = ''; d.tags.dynastyLabel = ''; d.eraStart = null; d.eraEnd = null; d.reason += '；Critic：非法朝代键→清空'; }
  }
  d.tags.material = normalizeMaterials(d.tags.material);   // 材质去脏串、空白和重复项
  const rawQwenConfidence = d.tags.qwenConfidence as unknown;
  if (rawQwenConfidence != null) {
    const qwenConfidence = normalizeQwenConfidence(rawQwenConfidence);
    if (typeof qwenConfidence === 'number') {
      if (qwenConfidence !== rawQwenConfidence) d.reason += '；Critic：Qwen置信度归一';
      d.tags.qwenConfidence = qwenConfidence;
    } else {
      delete d.tags.qwenConfidence;
      d.reason += '；Critic：非法Qwen置信度→清空';
    }
  }
}

// 应用历史纠错：同一展品之前被改过落点/评分 → 沿用（落点 kind=展馆）
export function applyUserFix(d: ArtifactDraft): void {
  const corr = getExhibitionPrefs();
  const pf = corr.placeFix[d.id];
  if (pf) { d.geo = { kind: 'venue', place: pf.place, lng: pf.lng, lat: pf.lat, confidence: 1 }; d.needPlace = false; d.reason += '；应用你定的落点:' + pf.place; }
  const rf = corr.ratingFix[d.id];
  if (typeof rf === 'number') { d.tags.myRating = clampRating(rf); d.reason += '；应用你定的评分'; }
}

// 命中本地索引（之前已补全/已钉）→ 沿用省云脑、保持一致；返回 known.enriched
export function mergeKnown(d: ArtifactDraft, known: StoredArtifact | null, options: { keepDraftRating?: boolean } = {}): boolean {
  if (!known) return false;
  const localDynKey = d.tags.dynastyKey, localDynLabel = d.tags.dynastyLabel;   // 本地朝代表确定性命中，优先于 known（后续 applyCritic 会据 key 重刷 era）
  const keepDraftRating = options.keepDraftRating ?? true;
  const currentRating = d.tags.myRating;
  d.tags = { ...known.tags, myRating: keepDraftRating ? currentRating : known.tags.myRating ?? currentRating ?? 0 };
  if (localDynKey) { d.tags.dynastyKey = localDynKey; d.tags.dynastyLabel = localDynLabel; }
  if (!Array.isArray(d.tags.material)) d.tags.material = [];                       // 旧/坏记录缺 material → 恢复数组不变式（舱壁）
  if (!d.geo && known.geo) d.geo = known.geo;
  if (d.eraStart == null) { d.eraStart = known.eraStart; d.eraEnd = known.eraEnd; }
  if (!d.museum) d.museum = known.museum;
  if (known.labels?.length && !d.labels.length) d.labels = known.labels;
  if (known.splat && !d.splat) d.splat = known.splat;
  if (known.representations && !d.representations) d.representations = known.representations;
  d.needPlace = !d.geo;
  d.reason += '；命中本地索引（已补全过）';
  d.source = 'mixed';
  return known.enriched;
}
