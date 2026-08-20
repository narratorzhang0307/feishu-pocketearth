const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Fetch with a real network deadline while preserving a caller supplied abort signal.
 * This prevents mobile weak-network requests from keeping an interaction pending forever.
 */
export async function fetchWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const upstream = init.signal;
  let timedOut = false;

  const abortFromUpstream = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) abortFromUpstream();
  else upstream?.addEventListener('abort', abortFromUpstream, { once: true });

  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, timeoutMs));

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(`request_timeout_${timeoutMs}`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    upstream?.removeEventListener('abort', abortFromUpstream);
  }
}
