// 真 SSE 流式客户端：POST /api/frost-llm-stream，逐 token 读 SSE → onToken 回调 → 返回完整文本。
// 替代 frost-agent/sync/stream.ts 的「先整段生成再打字机模拟」——这是真·云脑逐 token 吐字。
// 注意：per-token 只走 onToken 回调，【不】发 FrostBus 事件——每 token 一条会灌爆 ring buffer（设计取舍）。
// 失败（无 key / 非 2xx / 网络）抛错，调用方兜底回非流式 complete（舱壁）。

export interface StreamOpts {
  system?: string;
  task?: string;                                     // 任务档（narrative/multilingual/…）：服务端按档选择 Qwen 模型；不传=默认档
  signal?: AbortSignal;
  onToken?: (token: string, full: string) => void;   // 每来一个 token 调一次（full=累计文本）
}

export async function streamComplete(prompt: string, opts: StreamOpts = {}): Promise<string> {
  const r = await fetch('/api/frost-llm-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, system: opts.system, task: opts.task }),
    signal: opts.signal,
  });
  if (!r.ok || !r.body) throw new Error('stream http ' + r.status);

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';                 // 末行可能不完整，留到下一块
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      let j: { token?: string; done?: boolean; error?: string };
      try { j = JSON.parse(t.slice(5).trim()); } catch { continue; }   // 非 JSON（注释/心跳）跳过
      if (j.token) { full += j.token; opts.onToken?.(j.token, full); }
      if (j.done) { if (j.error) throw new Error(String(j.error)); return full; }
    }
  }
  return full;
}
