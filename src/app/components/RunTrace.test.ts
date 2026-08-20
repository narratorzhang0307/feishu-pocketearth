import { describe, expect, it } from 'vitest';
import { deriveBadge } from './RunTrace';
import { frostBus, startAgentRun } from '../lib/observe/bus';

describe('RunTrace model badges', () => {
  it('does not mislabel Qwen3-VL as Gemma merely because it contains VL', () => {
    expect(deriveBadge('Qwen3-VL-2B · MNN')).toBe('Qwen');
    expect(deriveBadge('Travel LoRA')).toBe('Qwen');
  });

  it('keeps MNN and Qwen cloud labels distinct', () => {
    expect(deriveBadge('MNN 端侧推理')).toBe('MNN');
    expect(deriveBadge('Qwen 云脑')).toBe('Qwen');
  });

  it('does not claim MNN for local rules, Canvas or ONNX merely because they run on-device', () => {
    expect(deriveBadge('端侧缩略图分析')).toBe('本地');
    expect(deriveBadge('端侧语义 CLIP top-k')).toBe('本地');
    expect(deriveBadge('edge fallback')).toBe('本地');
  });

  it('keeps structured competition evidence on the run tree', () => {
    const run = startAgentRun('碑拓识读', { skillId: 'pocket.rubbing', skillVersion: '1.0.0', executionPath: 'local-mnn', runtime: 'MNN 3.6.1', acceleration: ['arm82'], visualInput: '1 × 320px', maxTokens: 320 });
    run.phase('Quality Gate', '需要人工复核', { qualityGate: 'manual-review', userConfirmation: 'required' });
    run.end(true);
    const evidence = frostBus.recent(run.runId).reduce((all, event) => ({ ...all, ...event.evidence }), {});
    expect(evidence).toMatchObject({ skillId: 'pocket.rubbing', executionPath: 'local-mnn', runtime: 'MNN 3.6.1', acceleration: ['arm82'], visualInput: '1 × 320px', maxTokens: 320, qualityGate: 'manual-review', userConfirmation: 'required' });
  });
});
