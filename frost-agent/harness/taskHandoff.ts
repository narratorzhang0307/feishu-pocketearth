import type { FrostPlan, FrostPlanStep } from './skillRouter';

const KEY = 'pe.frost.task-handoff.v1';

export interface FrostTaskHandoff {
  protocol: 'pocket-frost-task/v1';
  planId: string;
  stepId: string;
  skillId: string;
  target: string;
  objective: string;
  userText: string;
  status: 'dispatched';
  createdAt: string;
}

/**
 * 把已确认任务以固定契约交给目标 Skill。这里只写本机 sessionStorage；
 * 不上传、不开外链，也不执行目标 Skill 的副作用。
 */
export function stageTaskHandoff(plan: FrostPlan, step: FrostPlanStep, userText: string): FrostTaskHandoff {
  if (!plan.steps.some((item) => item.id === step.id && item.skillId === step.skillId && item.target === step.target)) {
    throw new Error('任务步骤不属于当前计划');
  }
  if (step.availability !== 'equipped') throw new Error('Skill 尚未装备');
  const handoff: FrostTaskHandoff = {
    protocol: 'pocket-frost-task/v1', planId: plan.id, stepId: step.id,
    skillId: step.skillId, target: step.target, objective: step.objective,
    userText: userText.slice(0, 2000), status: 'dispatched', createdAt: new Date().toISOString(),
  };
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, JSON.stringify(handoff)); } catch { /* private mode */ }
  return handoff;
}

export function peekTaskHandoff(target?: string): FrostTaskHandoff | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const value = JSON.parse(sessionStorage.getItem(KEY) || 'null') as FrostTaskHandoff | null;
    if (!value || value.protocol !== 'pocket-frost-task/v1' || value.status !== 'dispatched') return null;
    if (target && value.target !== target) return null;
    return value;
  } catch { return null; }
}

export function clearTaskHandoff(): void {
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(KEY); } catch { /* private mode */ }
}
