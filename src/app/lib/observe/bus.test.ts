import { describe, expect, it } from 'vitest';
import { frostBus, startAgentRun } from './bus';

describe('RunTrace degradation evidence', () => {
  it('marks an explicit fallback phase for the visible trace', () => {
    const run = startAgentRun('审查运行');
    run.phase('云脑补全', '云脑不可用→保留已有');
    run.end(true);
    const fallback = frostBus.recent(run.runId).find((event) => event.parentId === run.runId);
    expect(fallback?.tags).toContain('fallback');
  });
});
