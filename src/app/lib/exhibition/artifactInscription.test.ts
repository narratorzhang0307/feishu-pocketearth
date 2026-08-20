import { describe, expect, it } from 'vitest';
import { chooseArtifactInscriptionCandidate, inscriptionAgreement, inscriptionCandidateIssue, languagePassPreservesOriginal } from './artifactInscription';

describe('artifact inscription transfer gate', () => {
  it('accepts a close Base/LoRA agreement', () => {
    const result = chooseArtifactInscriptionCandidate('孔夫子問曰囘榮啟奇', '孔夫子\n問曰囘\n榮啟奇');
    expect(result.source).toBe('agreement');
    expect(result.needsConfirmation).toBe(false);
  });

  it('rejects repetition and falls back to a sane Base output', () => {
    const result = chooseArtifactInscriptionCandidate('孔夫子問曰囘榮啟奇', '高高高高高高高高高');
    expect(result.source).toBe('base-fallback');
    expect(result.rawText).toBe('孔夫子問曰囘榮啟奇');
  });

  it('requires review when plausible candidates materially disagree', () => {
    const result = chooseArtifactInscriptionCandidate('孔夫子周公登靈官寺', '雲章奇周日登孔夫子');
    expect(result.source).toBe('comparison-review');
    expect(result.needsConfirmation).toBe(true);
  });

  it('uses output-only checks that are available on a phone', () => {
    expect(inscriptionCandidateIssue('□ '.repeat(20))).toContain('占位符');
    expect(inscriptionAgreement('孔夫子問曰囘', '孔夫子問曰囘')).toBe(1);
  });

  it('allows punctuation but rejects changed, simplified or missing original characters', () => {
    expect(languagePassPreservesOriginal('季貞作尊鬲', '季貞作尊鬲。')).toBe(true);
    expect(languagePassPreservesOriginal('季貞作尊鬲', '季贞作尊鬲。')).toBe(false);
    expect(languagePassPreservesOriginal('孔夫子問曰囘榮啟奇', '孔夫子問曰：榮啟奇。')).toBe(false);
  });
});
