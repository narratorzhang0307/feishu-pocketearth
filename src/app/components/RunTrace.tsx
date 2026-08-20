// 可观测 UI · 编排树：把 agent 的单行阶段进度，升级成边跑边长出来的「实时编排树」。
// 订阅 FrostBus，按 runId 收本次运行的根(agent)+子(各阶段)事件，渲成带耗时/状态/徽章的树。
// 这是「难点不在让模型更聪明，而在编排」的活证据：用户能看到 router→agent→skill 的逐步执行。
import { useEffect, useState } from 'react';
import { Loader2, Check, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { frostBus, type FrostEvent } from '../lib/observe/bus';

// 从 note（无则回落 name）派生「云/端侧/本地」色徽章——让树一眼看出每步在哪儿算（数据离没离设备）。显式 tags 优先。
const BADGE: Record<string, string> = {
  Qwen: 'bg-violet-500/20 text-violet-300',
  MNN: 'bg-sky-500/20 text-sky-300',
  本地: 'bg-emerald-500/15 text-emerald-300/90',
  fallback: 'bg-amber-500/20 text-amber-300',
};
export function deriveBadge(note?: string): string | null {
  if (!note) return null;
  if (/Qwen|Travel\s*LoRA|云脑|cloud/i.test(note)) return 'Qwen';
  // “端侧/edge/CLIP”只说明数据没有离开设备，不能证明实际命中了 MNN。
  // MNN 徽章必须来自明确的 runtime/步骤文案，避免把 Canvas、规则或 ONNX 误标成 MNN。
  if (/MNN/i.test(note)) return 'MNN';
  if (/resolvePlace|matchCatalog|本地|端侧|edge|CLIP|\bVL\b|Mapbox|parse|catalog/i.test(note)) return '本地';
  return null;
}

function useRunEvents(runId: string | null): FrostEvent[] {
  const [events, setEvents] = useState<FrostEvent[]>([]);
  useEffect(() => {
    setEvents(runId ? frostBus.recent(runId) : []);   // 先 seed buffer 里订阅前已发的事件(start/首阶段)
    if (!runId) return;
    return frostBus.on((e) => {
      if (e.runId === runId || e.parentId === runId) setEvents((prev) => [...prev, e]);
    });
  }, [runId]);
  return events;
}

interface RunTraceProps {
  runId: string | null;
  /** 运行时保持展开；结束后自动收成一行摘要，用户仍可手动查看详情。 */
  collapseWhenDone?: boolean;
}

export default function RunTrace({ runId, collapseWhenDone = false }: RunTraceProps) {
  const events = useRunEvents(runId);
  const [, tick] = useState(0);
  const [expanded, setExpanded] = useState(true);
  // done 一旦出现即永久为真（events 只增）→ 运行结束后停表，避免已完成运行仍以 5fps 空转重渲染
  const isDone = !!(runId && events.some((e) => e.runId === runId && e.phase !== 'start'));
  useEffect(() => setExpanded(true), [runId]);
  useEffect(() => { if (collapseWhenDone && isDone) setExpanded(false); }, [collapseWhenDone, isDone, runId]);
  // 让「进行中」步骤的耗时实时走动（仅运行中）
  useEffect(() => { if (isDone) return; const id = setInterval(() => tick((n) => n + 1), 200); return () => clearInterval(id); }, [isDone]);

  if (!runId || !events.length) return null;
  const root = events.find((e) => e.runId === runId && e.phase === 'start');
  const done = events.find((e) => e.runId === runId && e.phase !== 'start');
  const steps = events.filter((e) => e.parentId === runId).sort((a, b) => a.ts - b.ts);
  const now = Date.now();
  const total = ((done?.durMs ?? (now - (root?.ts ?? now))) / 1000).toFixed(2);
  const showSteps = !done || expanded;
  const evidence = events.reduce((merged, event) => ({ ...merged, ...event.evidence }), {} as NonNullable<FrostEvent['evidence']>);
  const evidenceRows = [
    evidence.skillId && ['Skill', `${evidence.skillId}@${evidence.skillVersion || '?'}`],
    evidence.baseRevision && ['Qwen Base', evidence.baseRevision],
    evidence.adapterVersion && ['Adapter', evidence.adapterVersion],
    evidence.executionPath && ['路径', evidence.executionPath],
    evidence.runtime && ['运行时', evidence.runtime],
    evidence.acceleration?.length && ['加速', evidence.acceleration.join(' · ')],
    evidence.visualInput && ['视觉输入', evidence.visualInput],
    evidence.maxTokens != null && ['Max tokens', String(evidence.maxTokens)],
    evidence.modelLoadMs != null && ['模型加载', `${Math.round(evidence.modelLoadMs)}ms`],
    evidence.peakMemoryMb != null && ['峰值内存', `${evidence.peakMemoryMb.toFixed(1)}MB`],
    evidence.inputSummary && ['输入', evidence.inputSummary],
    evidence.tools?.length && ['工具', evidence.tools.join(' · ')],
    evidence.qualityGate && ['Quality Gate', evidence.qualityGate],
    evidence.fallbackReason && ['回退', evidence.fallbackReason],
    evidence.userConfirmation && ['用户确认', evidence.userConfirmation],
    evidence.finalWrites?.length && ['写入', evidence.finalWrites.join(' · ')],
  ].filter(Boolean) as [string, string][];

  return (
    <div className={`rounded-xl border border-white/10 bg-zinc-900 font-mono text-[11px] leading-relaxed text-zinc-300 shadow-sm ${done && !expanded ? 'p-2.5' : 'p-3'}`}>
      <button
        type="button"
        disabled={!done}
        aria-expanded={done ? expanded : true}
        aria-label={done ? (expanded ? '收起运行详情' : '展开运行详情') : '运行中'}
        onClick={() => { if (done) setExpanded((value) => !value); }}
        className="flex w-full items-center gap-1.5 text-left text-zinc-100 disabled:cursor-default"
      >
        {done
          ? (done.ok ? <Check className="h-3 w-3 text-emerald-400" strokeWidth={2.5} /> : <AlertTriangle className="h-3 w-3 text-amber-400" strokeWidth={2.5} />)
          : <Loader2 className="h-3 w-3 animate-spin text-orange-400" strokeWidth={2.5} />}
        <span className="text-[9px] font-medium tracking-tight">{root?.name || '运行'}</span>
        {done && <span className="text-[8px] text-zinc-500">{steps.length} 步已完成</span>}
        <span className="ml-auto text-[9px] tabular-nums text-zinc-500">{total}s</span>
        {done && (expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-zinc-500" />
          : <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />)}
      </button>
      {showSteps && <div className="mt-2 space-y-1">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const nextTs = steps[i + 1]?.ts ?? done?.ts ?? now;
          const dur = Math.max(0, Math.round(nextTs - s.ts));
          const running = last && !done;
          return (
            <div key={s.runId} className="flex items-center gap-2">
              <span className="text-zinc-600 select-none">{last ? '└' : '├'}</span>
              {running
                ? <Loader2 className="w-2.5 h-2.5 animate-spin text-orange-400" strokeWidth={3} />
                : <Check className="w-2.5 h-2.5 text-emerald-400/70" strokeWidth={3} />}
              <span className={running ? 'text-zinc-100' : 'text-zinc-400'}>{s.name}</span>
              {s.note && <span className="text-zinc-500 truncate">· {s.note}</span>}
              {(s.tags && s.tags.length ? s.tags : ([deriveBadge(s.note) ?? deriveBadge(s.name)].filter(Boolean) as string[])).map((t) => (
                <span key={t} className={`rounded px-1 py-px text-[9px] leading-none ${BADGE[t] || 'bg-white/10 text-zinc-300'}`}>{t}</span>
              ))}
              <span className="ml-auto tabular-nums text-zinc-600">{dur}ms</span>
            </div>
          );
        })}
      </div>}
      {showSteps && evidenceRows.length > 0 && <dl className="mt-2 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 border-t border-white/10 pt-2 text-[8px] leading-snug">
        {evidenceRows.map(([label, value]) => <div key={label} className="contents"><dt className="text-zinc-600">{label}</dt><dd className="break-words text-zinc-400">{value}</dd></div>)}
      </dl>}
    </div>
  );
}
