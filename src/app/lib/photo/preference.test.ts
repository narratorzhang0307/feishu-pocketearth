import { describe, expect, it } from 'vitest';
import {
  buildPreferencePairs,
  createPreferenceModel,
  MIN_PREFERENCE_CHOICES,
  scorePreference,
  updatePreferenceModel,
  type PhotoPreferenceVector,
} from './preference';

const cat: PhotoPreferenceVector = {
  base: { technical: 0.7, hasGps: 1, place: 0, life: 1, document: 0, colorful: 0.7 },
  tags: ['猫', '宠物'],
};
const receipt: PhotoPreferenceVector = {
  base: { technical: 0.9, hasGps: 0, place: 0, life: 0, document: 1, colorful: 0.1 },
  tags: ['票据', '停车'],
};

describe('local photo preference model', () => {
  it('does not invent a preference score before enough explicit choices', () => {
    const first = updatePreferenceModel(createPreferenceModel(), cat, receipt, 1);
    expect(scorePreference(first, cat)).toEqual({ confidence: 1 / MIN_PREFERENCE_CHOICES });
  });

  it('learns a pairwise preference without changing technical quality', () => {
    let model = createPreferenceModel();
    for (let i = 0; i < MIN_PREFERENCE_CHOICES; i++) model = updatePreferenceModel(model, cat, receipt, i + 1);
    const catScore = scorePreference(model, cat).affinity || 0;
    const receiptScore = scorePreference(model, receipt).affinity || 0;
    expect(catScore).toBeGreaterThan(receiptScore);
    expect(cat.base.technical).toBe(0.7);
    expect(receipt.base.technical).toBe(0.9);
  });

  it('waits for ten explicit choices before exposing an affinity', () => {
    let model = createPreferenceModel();
    for (let i = 0; i < MIN_PREFERENCE_CHOICES - 1; i++) model = updatePreferenceModel(model, cat, receipt, i + 1);
    expect(scorePreference(model, cat).affinity).toBeUndefined();
    model = updatePreferenceModel(model, cat, receipt, MIN_PREFERENCE_CHOICES);
    expect(scorePreference(model, cat).affinity).toBeTypeOf('number');
  });

  it('prioritizes cross-type cold-start pairs', () => {
    const make = (key: string, photoType: 'life' | 'place' | 'document'): import('./radarTypes').PhotoRadarAnalysis => ({
      key, assetId: key, contentHash: key, photoType, technicalQuality: 70, preferenceConfidence: 0,
      confidence: 0.8, verdict: 'keep', pinnable: false, needPlace: false, tags: [], reasons: [],
      visionBackend: 'local-features', analyzedAt: 1,
    });
    const pairs = buildPreferencePairs([make('a', 'life'), make('b', 'life'), make('c', 'place'), make('d', 'document')], 3);
    expect(pairs).toHaveLength(3);
    expect(pairs.every(({ left, right }) => left.photoType !== right.photoType)).toBe(true);
  });
});
