import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ArrowUp, Check, LockKeyhole, PackageOpen, Play, Workflow } from 'lucide-react';
import { runGeneral } from '../../../frost-agent/agents/general';
import { runFrostOrchestrator, type FrostPlan, type FrostPlanStep } from '../../../frost-agent/harness/skillRouter';
import { stageTaskHandoff } from '../../../frost-agent/harness/taskHandoff';
import { getSuggestion, subscribeHeartbeat, adoptSuggestion } from '../../../frost-agent/harness/heartbeat';
import { derive, STATE_LABEL, type FrostState } from '../../../frost-agent/buddy/poses';
import { themeFor, THEME_LABEL, type FrostTheme } from '../../../frost-agent/buddy/themes';
import FrostPersona, { personaVariantForTheme } from './FrostPersona';
import UserZhaIcon from './UserZhaIcon';

// FROST · 总编排入口。
// 用户只和 Frost 对话；Frost 读取 Skill 目录，生成可审计计划，并在确认后交给目标 Skill。

interface Turn {
  role: 'user' | 'frost';
  text: string;
  trace?: string[];
  plan?: FrostPlan;
  userText?: string;
}

interface Props {
  onBack: () => void;
  onRun?: (target: string) => void;   // 跳到目标 Skill 运行页
}

// 高频快捷入口不做自动执行，只打开目标 Skill。
const QUICK: { label: string; target: string }[] = [
  { label: '整理书籍', target: 'books-agent' },
  { label: '整理电影', target: 'movies-agent' },
  { label: '整理音乐', target: 'music-agent' },
  { label: '规划旅行', target: 'travel-skill' },
  { label: '看展搭子', target: 'exhibition-agent' },
  { label: '一本书落地球', target: 'agent-forge' },
];

export default function FrostBuddyPage({ onBack, onRun }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<FrostState | null>(null);   // 一次性脉冲：celebrate / dizzy
  const [theme, setTheme] = useState<FrostTheme>('none');         // 当前聊天主题（换装）
  const [sug, setSug] = useState(getSuggestion());
  const endRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeHeartbeat(() => setSug(getSuggestion())), []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, busy]);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const buddyState = useMemo<FrostState>(
    () => flash ?? derive({ busy, attention: !!sug }),
    [flash, busy, sug],
  );
  const personaVariant = personaVariantForTheme(theme);

  const pulse = (s: FrostState, ms: number) => {
    setFlash(s);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), ms);
  };

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    setInput('');
    const history = turns.map((t) => ({ role: t.role, text: t.text }));
    setTurns((t) => [...t, { role: 'user', text }]);
    setBusy(true);
    try {
      const routed = await runFrostOrchestrator({ now: new Date(), surface: 'frost', userText: text, history });
      if (routed.plan) {
        setTurns((t) => [...t, { role: 'frost', text: routed.reply, trace: routed.trace, plan: routed.plan!, userText: text }]);
        setTheme(themeFor(text, 'general'));
        pulse('celebrate', 1800);
      } else {
        const answered = await runGeneral({ now: new Date(), surface: 'frost', userText: text, history });
        setTurns((t) => [...t, { role: 'frost', text: answered.reply, trace: [...(routed.trace || []), ...(answered.trace || [])] }]);
        setTheme(themeFor(text, 'general'));
      }
    } catch {
      setTurns((t) => [...t, { role: 'frost', text: '我这边断了一下，再说一遍？' }]);
      pulse('dizzy', 1500);
    } finally {
      setBusy(false);
    }
  };

  const dispatchStep = (plan: FrostPlan, step: FrostPlanStep, userText: string) => {
    if (busy) return;
    if (step.availability !== 'equipped') { onRun?.('agent-plaza'); return; }
    try {
      stageTaskHandoff(plan, step, userText);
      onRun?.(step.target);
    } catch {
      pulse('dizzy', 1500);
    }
  };

  const takeSuggestion = () => {
    const s = adoptSuggestion();
    setSug(getSuggestion());
    if (s?.target) onRun?.(s.target);
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate text-black">FROST</div>
          <div className="text-[9px] text-black/45 truncate">你的 Frost · 装备并调用 Skills</div>
        </div>
      </div>

      {/* Frost 的常用 Skill 快捷入口。 */}
      <div className="shrink-0 border-b-2 border-black bg-white px-3 py-2 overflow-x-auto">
        <div className="flex items-center gap-2 w-max">
          <span className="font-pixel text-[6px] tracking-widest text-black/35 shrink-0">调用 Skill →</span>
          {QUICK.map((q) => (
            <button
              key={q.target}
              onClick={() => { if (!busy) onRun?.(q.target); }}
              disabled={busy}
              className="shrink-0 border-2 border-black bg-[#EAEAEA] px-2 py-1 text-[10px] text-black outline-none focus:outline-none active:translate-y-px hover:bg-[#00ff88]/15 transition-colors disabled:opacity-40"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* 宠物舞台：固定高度（buddy 表情/建议怎么变都不撑动它）。底色 = 对话区同为 #EAEAEA、二者间无边框 →
          一道隐形线：线以上 buddy 随便动，线以下对话位置纹丝不动；对话增多则在线下独立滚动看全。 */}
      <div className="shrink-0 flex flex-col items-center px-4 pt-4 pb-2 overflow-hidden" style={{ background: '#EAEAEA' }}>
        <div className="flex items-center justify-center" style={{ height: 178 }}>
          <FrostPersona
            variant={personaVariant}
            size={168}
            className="border-[3px] border-black shadow-[4px_4px_0_#000]"
          />
        </div>
        <div className="flex items-center justify-center" style={{ height: 16 }}>
          <span className="font-pixel text-[7px] tracking-[0.3em] uppercase" style={{ color: buddyState === 'celebrate' ? '#9a7b2e' : '#234a63' }}>
            {buddyState === 'idle' && theme !== 'none' ? THEME_LABEL[theme] : STATE_LABEL[buddyState]}
          </span>
        </div>
        <div className="flex items-center justify-center mt-1" style={{ height: 24 }}>
          {sug && !busy && (
            <button
              onClick={takeSuggestion}
              className="max-w-full border-2 border-black bg-white px-2.5 py-1 font-pixel text-[7px] tracking-wider text-black active:translate-y-px truncate"
            >
              {sug.text} · {sug.cta || '运行'}
            </button>
          )}
        </div>
      </div>

      {/* 对话区 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3 bg-[#EAEAEA]">
        {turns.length === 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2 max-w-[96%]">
              <FrostPersona variant={personaVariant} size={28} className="mt-0.5 border-2 border-black" />
              <div className="flex flex-col gap-2 min-w-0 flex-1">
                <div className="font-pixel text-[7px] tracking-[0.2em] text-black/50">FROST</div>
                <div className="bg-white text-black border-2 border-black px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
                  我是 Frost。你说目标，我会先在已装备的 Skills 里选择能力、列出计划和权限，再把任务交到正确入口；没有把握时，我不会擅自执行。
                </div>
              </div>
            </div>
            <div className="text-[10px] text-black/40 pl-9 leading-relaxed">
              试试：「把这份书单整理后落地图」「规划京都两天行程」「用看展搭子整理这张展签」
            </div>
          </div>
        )}

        {turns.map((turn, i) => turn.role === 'user' ? (
          <div key={i} className="self-end flex flex-row-reverse items-start gap-2 max-w-[88%]">
            <div className="shrink-0 mt-0.5"><UserZhaIcon size={26} ring="#111" /></div>
            <div className="bg-white text-black border-2 border-black px-3 py-2 text-[12px] leading-relaxed shadow-[2px_2px_0_rgba(0,0,0,0.85)]">{turn.text}</div>
          </div>
        ) : (
          <div key={i} className="flex items-start gap-2 max-w-[96%]">
            <FrostPersona variant={personaVariant} size={28} className="mt-0.5 border-2 border-black" />
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <div className="font-pixel text-[7px] tracking-[0.2em] text-black/50">FROST</div>
              {turn.text && (
                <div className="bg-white text-black border-2 border-black px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap shadow-[2px_2px_0_rgba(0,0,0,0.85)]">{turn.text}</div>
              )}

              {turn.plan && (
                <section className="border-2 border-black bg-white" aria-label="Frost Skill 计划">
                  <div className="flex items-center gap-2 border-b-2 border-black bg-[#f4f1e7] px-2.5 py-2">
                    <Workflow className="h-4 w-4 shrink-0 text-[#20745a]" strokeWidth={2.5} />
                    <div className="min-w-0 flex-1">
                      <div className="font-pixel text-[7px] tracking-wider">SKILL PLAN · {turn.plan.mode.toUpperCase()}</div>
                      <div className="mt-0.5 truncate text-[9px] text-black/45">{turn.plan.source === 'qwen' ? '云端 Qwen 语义规划' : turn.plan.source === 'mnn' ? '端侧 Qwen / MNN 规划' : '端侧规则路由'} · {turn.plan.steps.length} 步</div>
                    </div>
                    <span className={`border px-1.5 py-0.5 text-[8px] font-bold ${turn.plan.ready ? 'border-[#238c57] text-[#18784b]' : 'border-[#a76100] text-[#8a5700]'}`}>
                      {turn.plan.ready ? '可运行' : '待装备'}
                    </span>
                  </div>
                  <ol className="divide-y divide-black/15">
                    {turn.plan.steps.map((step, index) => (
                      <li key={step.id} className="p-2.5">
                        <div className="flex items-start gap-2">
                          <span className="grid h-6 w-6 shrink-0 place-items-center border-2 border-black bg-[#e8f5ee] font-pixel text-[7px]">{String(index + 1).padStart(2, '0')}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <b className="text-[11px]">{step.skillName}</b>
                              <span className="border border-black/25 px-1 py-0.5 text-[7px] text-black/45">{step.availability === 'equipped' ? '已装备' : step.availability === 'installed' ? '已登记·待装备' : '未安装'}</span>
                              {step.requiresConfirmation && <span className="inline-flex items-center gap-0.5 border border-black/25 px-1 py-0.5 text-[7px] text-[#8a5700]"><LockKeyhole className="h-2.5 w-2.5" />写入前确认</span>}
                            </div>
                            <p className="mt-1 text-[10px] leading-relaxed text-black/65">{step.objective}</p>
                            <p className="mt-1 text-[8px] leading-relaxed text-black/40">{step.reason}</p>
                            <details className="mt-1.5 text-[8px] text-black/45">
                              <summary className="cursor-pointer select-none">权限边界 · {step.permissions.length} 项</summary>
                              <div className="mt-1 flex flex-wrap gap-1">{step.permissions.map((permission) => <span key={permission} className="border border-black/20 bg-[#f4f1e7] px-1 py-0.5">{permission}</span>)}</div>
                            </details>
                          </div>
                          <button
                            type="button"
                            onClick={() => dispatchStep(turn.plan!, step, turn.userText || step.objective)}
                            className={`grid min-h-9 shrink-0 place-items-center border-2 border-black px-2 text-[9px] font-bold active:translate-y-px ${step.availability === 'equipped' ? 'bg-[#00e58b]' : 'bg-[#f4c95d]'}`}
                            aria-label={step.availability === 'equipped' ? `运行 ${step.skillName}` : `装备 ${step.skillName}`}
                          >
                            {step.availability === 'equipped' ? <span className="inline-flex items-center gap-1"><Play className="h-3 w-3" fill="currentColor" />运行</span> : <span className="inline-flex items-center gap-1"><PackageOpen className="h-3 w-3" />装备</span>}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="flex items-center gap-1.5 border-t border-black/15 bg-[#fafafa] px-2.5 py-1.5 text-[8px] text-black/45">
                    <Check className="h-3 w-3 text-[#238c57]" />Frost 只负责选择与交接；目标 Skill 的质量门和确认门继续生效。
                  </div>
                </section>
              )}

              {/* 运行记录只展示可审计事件，不展示模型隐藏推理。 */}
              {turn.trace && turn.trace.length > 0 && (
                <details className="border-2 border-black/30 bg-[#E2E2E0]">
                  <summary className="cursor-pointer select-none px-2.5 py-1.5 font-pixel text-[6px] tracking-widest text-black/50 uppercase">TRACE / EVIDENCE · {turn.trace.length} EVENTS</summary>
                  <div className="space-y-1 border-t border-black/15 px-2.5 py-1.5">
                    {turn.trace.slice(0, 10).map((step, idx) => {
                      const isEdge = step.includes('端侧') || step.includes('Selector');
                      return (
                        <div key={idx} className={`flex gap-2 text-[10px] leading-snug ${isEdge ? 'bg-[#00ff88]/25 px-1 py-0.5 text-black/75 font-medium' : 'text-black/45'}`}>
                          <span className="text-black/30 w-4 shrink-0 tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
                          <span className="min-w-0">{step.replace(/^●\s*/, '')}</span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}

            </div>
          </div>
        ))}

        {busy && <div className="font-pixel text-[8px] text-black/45 tracking-widest">⋯ FROST 正在编排 ⋯</div>}
        <div ref={endRef} />
      </div>

      {/* 输入 */}
      <div className="px-3 py-3 border-t-2 border-black bg-white shrink-0">
        <form className="flex gap-2 items-center" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            type="text" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
            placeholder="对 FROST 说……（Enter 发送）"
            className="flex-1 h-10 border-2 border-black bg-[#EAEAEA] text-black text-[12px] px-3 outline-none focus:bg-white transition-colors min-w-0 disabled:opacity-50 placeholder:text-black/40"
          />
          <button type="submit" disabled={busy || !input.trim()} className="w-10 h-10 border-2 border-black bg-[#00ff88] flex items-center justify-center active:translate-y-px shrink-0 disabled:opacity-30">
            <ArrowUp className="w-4 h-4" strokeWidth={3} />
          </button>
        </form>
      </div>
    </div>
  );
}
