// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· withRetry —— 瞬时故障的指数退避重试（借鉴 langchain RunnableRetry）
// ────────────────────────────────────────────────────────────────────────────
// langchain 把「容错」拆成两条正交的轴：retry（同目标退避重试，治【瞬时】故障）⊥ fallback（换目标，治
// 【持续性】故障/降级）。pocket-earth 已到处有 fallback（edgeSafe 三级回落、enrichJSON 边→云、舱壁），
// 但缺 retry——Qwen 云端网关偶发抖动/429/5xx 会被一次性 catch→null 白丢。这里补上 retry 这一条轴。
//
// 关键纪律（也来自 langchain）：用【类型化白名单】决定哪些错该重试——4xx 参数错不重试（重试也白搭），
// 只重试网络错/超时/429/5xx 这类瞬时故障，别把真 bug 反复重试。
// ════════════════════════════════════════════════════════════════════════════

export interface RetryOpts {
  attempts?: number;                    // 最多尝试次数（含首次），默认 3
  baseMs?: number;                      // 退避基数，默认 400
  maxMs?: number;                       // 单次退避上限，默认 6000
  retryOn?: (e: unknown) => boolean;    // 哪些错该重试（默认全部）
}

/**
 * 指数退避 + jitter 重试。最后一次或 retryOn 判否 → 直接上抛（保留原始错误，调用方走自己的兜底）。
 * 注意：retry 与 timeout 正交——把「带超时的单次调用」整个传进来，每次 attempt 各自超时。
 */
export async function withRetry<T>(fn: () => Promise<T>, o: RetryOpts = {}): Promise<T> {
  const { attempts = 3, baseMs = 400, maxMs = 6000, retryOn = () => true } = o;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === attempts - 1 || !retryOn(e)) throw e;   // 最后一次 / 不该重试 → 上抛
      const exp = Math.min(maxMs, baseMs * 2 ** i);
      await new Promise((r) => setTimeout(r, exp / 2 + Math.random() * exp / 2));   // jitter，错开重试洪峰
    }
  }
  throw last;
}

/** 带状态码的 HTTP 错误——让 retryOn 能区分 4xx(不重试) 与 5xx/429(重试)。 */
export class HttpError extends Error {
  constructor(public status: number) { super(`HTTP ${status}`); this.name = 'HttpError'; }
}

/** 瞬时故障判定：5xx/429 + 网络错/超时 → 重试；4xx 参数错 → 不重试。 */
export function isTransient(e: unknown): boolean {
  if (e instanceof HttpError) return e.status === 429 || e.status >= 500;
  if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') return false;   // 用户主动取消(AbortController.abort)→重试白搭且违背意图，不重试；超时是 TimeoutError、仍按瞬时重试
  return true;   // 网络错 / timeout 等其它非 HTTP 异常 → 视为瞬时
}
