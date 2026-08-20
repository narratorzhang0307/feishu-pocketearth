import { describe, expect, it } from 'vitest';
import { assessRubbingCandidate, gateRubbingCandidates } from './rubbing';

describe('rubbing quality gate', () => {
  it('rejects empty, refusal and repetitive output', () => {
    expect(assessRubbingCandidate('rubbing-lora', '').valid).toBe(false);
    expect(assessRubbingCandidate('qwen-base', '抱歉，无法识别这张图片').valid).toBe(false);
    expect(assessRubbingCandidate('rubbing-lora', '永永永永永永永永永永永永').valid).toBe(false);
  });

  it('uses the valid candidate when the other candidate degenerates', () => {
    const result = gateRubbingCandidates('受命于天既寿永昌', '无法识别');
    expect(result.gate).toBe('passed');
    expect(result.selected).toBe('受命于天既寿永昌');
  });

  it('requires human review when two plausible transcriptions conflict', () => {
    const result = gateRubbingCandidates('受命于天既寿永昌', '长乐未央延年益寿');
    expect(result.gate).toBe('manual-review');
    expect(result.selected).toBe('');
  });

  it('accepts materially matching dual candidates', () => {
    const result = gateRubbingCandidates('受命于天，既寿永昌。', '受命于天 既寿永昌');
    expect(result.gate).toBe('passed');
    expect(result.selected).toContain('受命于天');
  });
});
