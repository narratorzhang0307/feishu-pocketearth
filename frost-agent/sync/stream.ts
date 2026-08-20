// Frost Harness · 流式渲染（P2-J）
// 客户端「流式感」：把一段（已生成的）文本按 StreamEvent 的节奏逐块吐出（打字机）。
// 现状用本地节流模拟流式；未来云脑接 SSE 真·token 流时，只需把这里的定时吐字换成 SSE 读流，
// 上层 onEvent(StreamEvent) 的对接面不变（契约见 protocol.ts）。
import { makeStreamEvent, type StreamEvent } from './protocol';

export interface StreamHandle { cancel: () => void; done: Promise<void> }

/** 把 full 文本按打字机节奏逐块回调（start → delta… → end）；返回可取消句柄 + 完成 Promise。 */
export function streamText(
  full: string,
  onEvent: (e: StreamEvent) => void,
  opts?: { channel?: string; chunk?: number; intervalMs?: number },
): StreamHandle {
  const channel = opts?.channel || 'chat';
  const chunk = Math.max(1, opts?.chunk ?? 2);
  const iv = Math.max(8, opts?.intervalMs ?? 18);
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  if (!full) { onEvent(makeStreamEvent(channel, 'start')); onEvent(makeStreamEvent(channel, 'end')); resolve(); return { cancel: () => {}, done }; }
  onEvent(makeStreamEvent(channel, 'start'));
  let i = 0;
  const timer = setInterval(() => {
    const next = Math.min(full.length, i + chunk);
    onEvent(makeStreamEvent(channel, 'delta', full.slice(i, next)));
    i = next;
    if (i >= full.length) { clearInterval(timer); onEvent(makeStreamEvent(channel, 'end')); resolve(); }
  }, iv);
  return { cancel: () => { clearInterval(timer); resolve(); }, done };
}
