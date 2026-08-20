// 全局运行轨迹抽屉（可观测 manifestation ②）：会话内所有 agent 运行的时间线，每条可展开成它的编排树。
// 与 RunTrace 共用同一 FrostBus——RunTrace 管单次运行(内联在运行页)，本抽屉管跨运行(浮在手机框内)。一套事件、两个视图。
import { useEffect, useState } from 'react';
import { Activity, X } from 'lucide-react';
import { frostBus } from '../lib/observe/bus';
import RunTrace from './RunTrace';

interface RunMeta { runId: string; name: string; ts: number; ok?: boolean; durMs?: number; done: boolean }

export default function RunDrawer() {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => frostBus.on((e) => {
    if (e.type !== 'agent') return;   // 只收 agent 根事件（一次运行一条）
    if (e.phase === 'start') setRuns((p) => [{ runId: e.runId, name: e.name, ts: e.ts, done: false }, ...p].slice(0, 40));
    else setRuns((p) => p.map((r) => (r.runId === e.runId ? { ...r, done: true, ok: e.ok, durMs: e.durMs } : r)));
  }), []);

  if (!runs.length) return null;   // 没跑过任何 agent 就不显示

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="absolute right-3 bottom-[92px] z-40 flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-2 text-[11px] font-mono text-zinc-100 shadow-lg border border-white/10 active:translate-y-px">
          <Activity className="w-3.5 h-3.5 text-orange-400" strokeWidth={2.5} /> 运行轨迹 · {runs.length}
        </button>
      )}
      {open && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-full max-h-[72%] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-zinc-100">
              <Activity className="w-4 h-4 text-orange-400" strokeWidth={2.5} />
              <span className="font-semibold tracking-tight">运行轨迹 · 本次会话 {runs.length} 次</span>
              <button onClick={() => setOpen(false)} aria-label="关闭" className="ml-auto"><X className="w-4 h-4 text-zinc-400" /></button>
            </div>
            <div className="space-y-1.5">
              {runs.map((r) => (
                <div key={r.runId} className="rounded-lg border border-white/5 bg-zinc-900/60">
                  <button onClick={() => setExpanded(expanded === r.runId ? null : r.runId)}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
                    <span className={r.done ? (r.ok ? 'text-emerald-400' : 'text-amber-400') : 'text-orange-400'}>{r.done ? (r.ok ? '✓' : '✗') : '◐'}</span>
                    <span className="truncate text-zinc-200">{r.name}</span>
                    <span className="ml-auto tabular-nums text-zinc-500">{r.durMs ? `${(r.durMs / 1000).toFixed(2)}s` : '…'}</span>
                  </button>
                  {expanded === r.runId && <div className="px-2 pb-2"><RunTrace runId={r.runId} /></div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
