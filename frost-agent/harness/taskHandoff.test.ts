import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FrostPlan, FrostPlanStep } from './skillRouter';
import { clearTaskHandoff, peekTaskHandoff, stageTaskHandoff } from './taskHandoff';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function step(overrides: Partial<FrostPlanStep> = {}): FrostPlanStep {
  return {
    id: 'step-1', skillId: 'pocket.books', skillName: 'Books Skill', target: 'books-agent',
    objective: '整理阅读记录', reason: '书籍领域任务', availability: 'equipped',
    permissions: ['范围:private'], requiresConfirmation: false, ...overrides,
  };
}

function plan(planStep: FrostPlanStep): FrostPlan {
  return {
    id: 'plan-1', mode: 'single', source: 'local-rule', summary: '书籍任务', steps: [planStep],
    ready: true, createdAt: '2026-08-11T00:00:00.000Z',
  };
}

describe('Frost task handoff contract', () => {
  beforeEach(() => { Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() }); });
  afterEach(() => { clearTaskHandoff(); Reflect.deleteProperty(globalThis, 'sessionStorage'); });

  it('stages a bounded handoff and lets only the matching Skill target read it', () => {
    const selected = step();
    const handoff = stageTaskHandoff(plan(selected), selected, '把这份书单整理成阅读记录');
    expect(handoff.protocol).toBe('pocket-frost-task/v1');
    expect(peekTaskHandoff('movies-agent')).toBeNull();
    expect(peekTaskHandoff('books-agent')).toMatchObject({ skillId: 'pocket.books', objective: '整理阅读记录' });
  });

  it('rejects an invented step or an unavailable Skill', () => {
    const selected = step();
    expect(() => stageTaskHandoff(plan(selected), step({ id: 'step-invented' }), '任务')).toThrow('不属于当前计划');
    const unavailable = step({ availability: 'installed' });
    expect(() => stageTaskHandoff(plan(unavailable), unavailable, '任务')).toThrow('尚未装备');
  });

  it('bounds carried user text and supports explicit cleanup', () => {
    const selected = step();
    stageTaskHandoff(plan(selected), selected, '甲'.repeat(3000));
    expect(peekTaskHandoff()?.userText).toHaveLength(2000);
    clearTaskHandoff();
    expect(peekTaskHandoff()).toBeNull();
  });
});
