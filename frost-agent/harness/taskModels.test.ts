import { describe, expect, it } from 'vitest';
import { TASK_MODEL, modelLabel } from './taskModels';

describe('Qwen-first cloud routing', () => {
  it('routes every cloud task to a Qwen model', () => {
    expect(Object.values(TASK_MODEL)).toHaveLength(5);
    for (const model of Object.values(TASK_MODEL)) {
      expect(model).toMatch(/^qwen/);
    }
  });

  it('keeps the model visible in RunTrace-friendly labels', () => {
    expect(modelLabel('council')).toBe('qwen3.5-plus');
    expect(modelLabel('route')).toBe('qwen-flash');
  });
});
