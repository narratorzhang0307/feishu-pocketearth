import { describe, expect, it } from 'vitest';
import {
  decideReadingOcr, decideReadingOcrRoute, decideReadingVerification, normalizedOcrDistance, parseReadingOcr, scoreReadingOcr,
} from './readingJot';

describe('reading jot OCR gate', () => {
  it('parses fenced JSON and clamps confidence', () => {
    expect(parseReadingOcr('```json\n{"text":"山川异域，风月同天。","confidence":1.4}\n```')).toEqual({ text: '山川异域，风月同天。', confidence: 1 });
  });

  it('keeps useful raw text when the native decoder ignores JSON mode', () => {
    expect(parseReadingOcr('  山川异域，风月同天。  ')).toEqual({ text: '山川异域，风月同天。', confidence: 0.58 });
  });

  it('fails placeholder and terminal-collapse outputs regardless of self-reported confidence', () => {
    expect(scoreReadingOcr({ text: '□□□□□□', confidence: 0.99 }).status).not.toBe('pass');
    expect(scoreReadingOcr({ text: `真实摘录${'尾'.repeat(30)}`, confidence: 0.99 })).toMatchObject({ status: 'fail', issues: expect.arrayContaining(['terminal-collapse']) });
  });

  it('does not reward a longer task-drift hallucination', () => {
    const clean = scoreReadingOcr({ text: '风月同天。', confidence: 0.6 });
    const hallucination = scoreReadingOcr({ text: '根据图片，作为一个AI助手，我将为你解释这段内容并总结如下。', confidence: 0.99 });
    expect(clean.status).toBe('pass');
    expect(hallucination.status).toBe('fail');
    expect(clean.score).toBeGreaterThan(hallucination.score);
  });

  it('accepts LoRA only after an independent enhanced-view pass supports it', () => {
    const base = { text: '这是□□□□原文', confidence: 0.95, maxTokens: 720 };
    const lora = { text: '这是一段完整而且清晰可读的原文内容', confidence: 0.7, maxTokens: 256 };
    const result = decideReadingOcr(base, lora, { route: 'general-ocr-vision', output: { ...lora, confidence: 0.61 } });
    expect(result.qualityGate).toBe('lora-accepted');
    expect(result.selected).toBe('lora');
    expect(result.finalText).toBe(lora.text);
  });

  it('does not auto-promote a plausible LoRA without independent support', () => {
    const result = decideReadingOcr(
      { text: '这是□□□□原文', confidence: 0.95 },
      { text: '这是一段完整而且清晰可读的原文内容', confidence: 0.98 },
    );
    expect(result.qualityGate).toBe('manual-review');
    expect(result.needsReview).toBe(true);
  });

  it('keeps Base when both valid candidates agree', () => {
    const result = decideReadingOcr(
      { text: '山川异域，风月同天，寄诸佛子，共结来缘。', confidence: 0.7 },
      { text: '山川异域，风月同天，寄诸佛子，共结来缘。', confidence: 0.99 },
    );
    expect(result.qualityGate).toBe('base-kept');
    expect(result.selected).toBe('base');
  });

  it('requests a verification pass when valid candidates disagree', () => {
    const base = { text: '窗外的河流向北，月光落在旧桥上。', confidence: 0.82 };
    const lora = { text: '门前的山路向南，晨光落在新城里。', confidence: 0.84 };
    expect(normalizedOcrDistance(base.text, lora.text)).toBeGreaterThan(0.34);
    expect(decideReadingVerification(base, lora)).toMatchObject({ run: true, route: 'base', reasons: expect.arrayContaining(['base-lora-disagreement']) });
    expect(decideReadingOcr(base, lora).qualityGate).toBe('manual-review');
  });

  it('lets an enhanced Base view recover a failed first pass', () => {
    const result = decideReadingOcr(
      { text: '根据图片，作为一个AI助手，我无法看到原文。', confidence: 0.99 },
      undefined,
      { route: 'base', output: { text: '真正值得留下的，是愿意再次回看的那一刻。', confidence: 0.58 } },
    );
    expect(result).toMatchObject({ qualityGate: 'base-accepted', needsReview: false, finalText: '真正值得留下的，是愿意再次回看的那一刻。' });
  });

  it('keeps clean, sharp excerpts on the Base-only route', () => {
    expect(decideReadingOcrRoute(
      { text: '真正值得留下的，是你愿意再次回看的那一刻。', confidence: 0.95 },
      { width: 788, height: 210, meanLuma: 0.78, contrast: 0.229, edgeStrength: 0.079, laplacianVariance: 0.024, highlightClipping: 0.02 },
    )).toMatchObject({ runLora: false, reasons: [] });
  });

  it('routes low-contrast, soft-focus or clipped excerpts through the LoRA gate', () => {
    const result = decideReadingOcrRoute(
      { text: '真正值得留下的，是你愿意再次回看的那一刻。', confidence: 0.95 },
      { width: 788, height: 210, meanLuma: 0.923, contrast: 0.038, edgeStrength: 0.013, laplacianVariance: 0.003, highlightClipping: 0.21 },
    );
    expect(result.runLora).toBe(true);
    expect(result.reasons).toEqual(expect.arrayContaining(['low-contrast', 'soft-focus', 'glare-like']));
  });

  it('keeps a valid Base when the LoRA candidate degenerates', () => {
    const result = decideReadingOcr(
      { text: '真正的阅读不是摘抄，而是与过去的自己重新相遇。', confidence: 0.72 },
      { text: '...', confidence: 0.99 },
    );
    expect(result.qualityGate).toBe('base-kept');
    expect(result.needsReview).toBe(false);
  });
});
