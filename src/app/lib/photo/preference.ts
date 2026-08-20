import type { PhotoRadarAnalysis } from './radarTypes';

const STORAGE_KEY = 'pe.photoPreference.v1';
const HISTORY_KEY = 'pe.photoPreferenceHistory.v1';
const LEARNING_RATE = 0.12;
export const MIN_PREFERENCE_CHOICES = 10;

export interface PhotoPreferenceVector {
  base: {
    technical: number;
    hasGps: number;
    place: number;
    life: number;
    document: number;
    colorful: number;
  };
  tags: string[];
}

export interface PhotoPreferenceModel {
  version: 1;
  choices: number;
  baseWeights: Record<keyof PhotoPreferenceVector['base'], number>;
  tagWeights: Record<string, number>;
  updatedAt: number;
}

export interface PhotoPreferencePair {
  left: PhotoRadarAnalysis;
  right: PhotoRadarAnalysis;
}

const BASE_KEYS: Array<keyof PhotoPreferenceVector['base']> = ['technical', 'hasGps', 'place', 'life', 'document', 'colorful'];

export function createPreferenceModel(): PhotoPreferenceModel {
  return {
    version: 1,
    choices: 0,
    baseWeights: { technical: 0, hasGps: 0, place: 0, life: 0, document: 0, colorful: 0 },
    tagWeights: {},
    updatedAt: 0,
  };
}

function sigmoid(value: number): number { return 1 / (1 + Math.exp(-value)); }

function rawPreferenceScore(model: PhotoPreferenceModel, vector: PhotoPreferenceVector): number {
  let score = 0;
  for (const key of BASE_KEYS) score += model.baseWeights[key] * vector.base[key];
  if (vector.tags.length) score += vector.tags.reduce((sum, tag) => sum + (model.tagWeights[tag] || 0), 0) / Math.sqrt(vector.tags.length);
  return score;
}

export function preferenceVector(analysis: PhotoRadarAnalysis, hasGps: boolean): PhotoPreferenceVector {
  return {
    base: {
      technical: analysis.technicalQuality / 100,
      hasGps: hasGps ? 1 : 0,
      place: analysis.photoType === 'place' || analysis.photoType === 'place_nogps' ? 1 : 0,
      life: analysis.photoType === 'life' ? 1 : 0,
      document: analysis.photoType === 'document' || analysis.photoType === 'screenshot' ? 1 : 0,
      colorful: analysis.colorful || 0,
    },
    tags: [...new Set(analysis.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12),
  };
}

export function updatePreferenceModel(
  model: PhotoPreferenceModel,
  winner: PhotoPreferenceVector,
  loser: PhotoPreferenceVector,
  now = Date.now(),
): PhotoPreferenceModel {
  const next: PhotoPreferenceModel = {
    ...model,
    baseWeights: { ...model.baseWeights },
    tagWeights: { ...model.tagWeights },
    choices: model.choices + 1,
    updatedAt: now,
  };
  const error = 1 - sigmoid(rawPreferenceScore(model, winner) - rawPreferenceScore(model, loser));
  for (const key of BASE_KEYS) {
    next.baseWeights[key] += LEARNING_RATE * error * (winner.base[key] - loser.base[key]);
  }
  const tags = new Set([...winner.tags, ...loser.tags]);
  for (const tag of tags) {
    const delta = (winner.tags.includes(tag) ? 1 : 0) - (loser.tags.includes(tag) ? 1 : 0);
    next.tagWeights[tag] = Math.max(-2, Math.min(2, (next.tagWeights[tag] || 0) + LEARNING_RATE * error * delta));
  }
  return next;
}

export function scorePreference(model: PhotoPreferenceModel, vector: PhotoPreferenceVector): { affinity?: number; confidence: number } {
  const confidence = Math.min(1, model.choices / MIN_PREFERENCE_CHOICES);
  if (model.choices < MIN_PREFERENCE_CHOICES) return { confidence };
  return { affinity: Math.round(sigmoid(rawPreferenceScore(model, vector)) * 100), confidence };
}

function coarsePreferenceType(analysis: PhotoRadarAnalysis): string {
  if (analysis.photoType === 'place' || analysis.photoType === 'place_nogps') return 'place';
  if (analysis.photoType === 'document' || analysis.photoType === 'screenshot') return 'document';
  return analysis.photoType;
}

/**
 * Builds deterministic, visually/semantically varied cold-start pairs.
 * Cross-type pairs are always exhausted before same-type fallbacks, so a
 * sufficiently varied library cannot become ten near-identical questions.
 */
export function buildPreferencePairs(analyses: PhotoRadarAnalysis[], limit = MIN_PREFERENCE_CHOICES): PhotoPreferencePair[] {
  const unique = [...new Map(analyses.map((item) => [item.key, item])).values()]
    .filter((item) => item.photoType !== 'junk')
    .sort((a, b) => a.key.localeCompare(b.key));
  const pairs: PhotoPreferencePair[] = [];
  const seen = new Set<string>();
  const add = (left: PhotoRadarAnalysis, right: PhotoRadarAnalysis) => {
    if (left.key === right.key) return;
    const id = [left.key, right.key].sort().join('\u0000');
    if (seen.has(id) || pairs.length >= limit) return;
    seen.add(id); pairs.push({ left, right });
  };

  for (let gap = 1; gap < unique.length && pairs.length < limit; gap++) {
    for (let index = 0; index + gap < unique.length && pairs.length < limit; index++) {
      const left = unique[index]; const right = unique[index + gap];
      if (coarsePreferenceType(left) !== coarsePreferenceType(right)) add(left, right);
    }
  }
  for (let gap = 1; gap < unique.length && pairs.length < limit; gap++) {
    for (let index = 0; index + gap < unique.length && pairs.length < limit; index++) {
      add(unique[index], unique[index + gap]);
    }
  }
  return pairs;
}

export function getPhotoPreferenceModel(): PhotoPreferenceModel {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return createPreferenceModel();
    const parsed = JSON.parse(raw) as Partial<PhotoPreferenceModel>;
    const empty = createPreferenceModel();
    return {
      ...empty,
      ...parsed,
      version: 1,
      baseWeights: { ...empty.baseWeights, ...(parsed.baseWeights || {}) },
      tagWeights: parsed.tagWeights && typeof parsed.tagWeights === 'object' ? parsed.tagWeights : {},
    };
  } catch { return createPreferenceModel(); }
}

export function savePhotoPreferenceModel(model: PhotoPreferenceModel): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(model)); } catch { /* local privacy mode */ }
}

function getPreferenceHistory(): PhotoPreferenceModel[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-20) : [];
  } catch { return []; }
}

function savePreferenceHistory(history: PhotoPreferenceModel[]): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-20))); } catch { /* local privacy mode */ }
}

export function learnPhotoPreference(winner: PhotoPreferenceVector, loser: PhotoPreferenceVector): PhotoPreferenceModel {
  const current = getPhotoPreferenceModel();
  savePreferenceHistory([...getPreferenceHistory(), current]);
  const next = updatePreferenceModel(current, winner, loser);
  savePhotoPreferenceModel(next);
  return next;
}

export function undoPhotoPreference(): PhotoPreferenceModel | null {
  const history = getPreferenceHistory();
  const previous = history.pop();
  if (!previous) return null;
  savePreferenceHistory(history); savePhotoPreferenceModel(previous);
  return previous;
}

export function clearPhotoPreference(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(HISTORY_KEY);
    }
  } catch { /* local privacy mode */ }
}
