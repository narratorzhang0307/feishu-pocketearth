// Frost Harness · 按步骤健康追踪（G）
// 按「步骤键」而非「会话」记录每一步的成败，让优雅降级变得可观测：
// 比如端侧路由失败→走了云脑、云脑不可用→走了规则兜底，UI/日志据此提示"已降级"。
// 纯内存、轻量 pub/sub，不持久化（健康是即时态）。

export interface StepHealth {
  lastOkAt?: string;
  lastFailAt?: string;
  failCount: number;     // 连续失败次数（成功即清零）
  lastError?: string;
}

const steps: Record<string, StepHealth> = {};
const subs = new Set<() => void>();

/** 记一步成败：ok=true 清零失败计数，ok=false 累加并记错误。 */
export function recordHealth(step: string, ok: boolean, error?: string): void {
  const h = (steps[step] ||= { failCount: 0 });
  const now = new Date().toISOString();
  if (ok) { h.lastOkAt = now; h.failCount = 0; h.lastError = undefined; }
  else { h.lastFailAt = now; h.failCount += 1; h.lastError = error || 'unknown'; }
  subs.forEach((fn) => fn());
}

// 注：getHealth / subscribeHealth 曾为「健康面板」预留，从未接线，已删（R3 死代码清理）。recordHealth 仍在 edge/router/heartbeat 用。
