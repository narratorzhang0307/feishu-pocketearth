import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Database, Loader2 } from 'lucide-react';
import { edgeSafe } from '../../../frost-agent/edge/contract';
import { assembleMemory } from '../lib/memoryRouter';
import { HUMAN_VOICE, cleanVoice } from '../../../frost-agent/harness/persona';
import { streamText } from '../../../frost-agent/sync/stream';
import { streamComplete } from '../lib/streamComplete';
import AgentLuIcon from './AgentLuIcon';
import UserZhaIcon from './UserZhaIcon';
import { getFeishuConfig, upsertFeishuLibraryRecords } from '../feishu/api';
import type { FrostSubmissionDraft } from '../feishu/frostSubmission';

// 通用「对话层」：各 Skill（读书 / 观影 / 城市播客）共用的对话框。
// Qwen/MNN 端侧先做意图分类（端侧「挑」），Qwen 云脑结合脱敏上下文作答（云「写」）。
// 数据接地：每次发送把用户该领域的记录(context)注入 system，让回答基于「你的书/你的观影/你的城市」。

export interface AgentChatConfig {
  accent: string;
  persona: string;            // system 人设
  context: () => string;      // 用户数据摘要（每次发送时取最新）
  placeholder: string;
  suggestions: string[];
  initialInput?: string;       // Frost handoff：只预填，不自动发送，保留用户确认门
  intentLabels?: string[];    // 端侧意图分类标签（可选）
  // 「这部作品用户接触过吗」查询（命中已看/已读全集则返回标注词如「看过」，否则 null）。
  // 用于推荐去重：扫云脑回复里的《作品名》，把用户已看过的当场标出来（确定性兜底，不靠云脑自觉）。
  checkSeen?: (title: string) => string | null;
  // 飞书比赛版：识别用户明确的“记录/提交”意图，先生成草稿，必须再次点击确认才写入多维表格。
  feishuSubmission?: {
    createDraft: (text: string) => FrostSubmissionDraft | null;
  };
}

interface Turn {
  role: 'user' | 'agent';
  text: string;
  intent?: string;
  error?: boolean;
  submission?: {
    draft: FrostSubmissionDraft;
    status: 'ready' | 'sending' | 'done' | 'error';
    error?: string;
  };
}

// 用户是否在要「没接触过的新东西」（→ 走源头过滤路径，别事后红标注补救）。
// 明确要「经典/名著」则不算（那种就是想聊已知作品，红标注可出现）。
function wantsNew(text: string): boolean {
  if (/经典|名著|影史|公认|必看|史上最|神作|最好的(电影|书|片)|豆瓣(高分|top)/.test(text)) return false;
  return /推荐|推.{0,3}[部本张首个]|没看过|没读过|没听过|周末|换一?批|换个|还有(什么|没|别的)|再来[一几]?|新片|新书|冷门|小众|有没有.{0,6}(推|没)/.test(text);
}
// 从云脑文本里抠出第一个 JSON 对象（容忍 ```json 包裹）
function extractJSON(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const s = body.indexOf('{'); const e = body.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(body.slice(s, e + 1)) as Record<string, unknown>; } catch { return null; }
}

export default function AgentChat({ config }: { config: AgentChatConfig }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(config.initialInput || '');
  const [busy, setBusy] = useState(false);
  const [feishuLibraryUrl, setFeishuLibraryUrl] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const lastAskRef = useRef('');
  const streamRef = useRef<{ cancel: () => void; done: Promise<void> } | null>(null);
  useEffect(() => () => { mountedRef.current = false; streamRef.current?.cancel(); }, []);   // 卸载时取消在飞的逐字流，清掉 streamText 内部 interval（否则它会对死组件空跑约 90 次）
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, busy]);
  useEffect(() => {
    if (!config.feishuSubmission) return;
    void getFeishuConfig().then((feishu) => setFeishuLibraryUrl(feishu.bitableAppUrl || '')).catch(() => {});
  }, [config.feishuSubmission]);

  // 云脑 JSON 调用（给推荐候选用）：自己 parse + 兜底
  const cloudJSON = async (system: string, prompt: string): Promise<Record<string, unknown> | null> => {
    try {
      const r = await fetch('/api/frost-llm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, prompt, json: true }) });
      if (!r.ok) return null;
      const d = await r.json();
      return extractJSON(typeof d?.text === 'string' ? d.text : '');
    } catch { return null; }
  };

  // 「推荐没看过的」源头过滤：云脑出候选 → 本地 checkSeen 硬过滤已看 → 不够回炉（最多 3 轮）
  // → 只返回「真没看过」的推荐文案；一个都找不到（库太全/失败）返回 null，调用方回退普通对话。
  const buildNewRecs = async (text: string, history: string): Promise<string | null> => {
    const checkSeen = config.checkSeen;
    if (!checkSeen) return null;
    const memory = assembleMemory();
    const baseSys = `${config.persona}\n\n${memory ? memory + '\n\n' : ''}【用户数据】\n${config.context()}\n\n用户想让你推荐 ta「没接触过」的。基于 ta 的口味画像列 10 个符合口味的候选，优先冷门 / 小众 / 近作。只输出 JSON：{"items":[{"title":"作品名(不带书名号)","why":"一句话为何对 ta 味，≤30字"}]}，不要任何解释。`;
    const pool: { title: string; why: string }[] = [];
    const seen: string[] = [];
    for (let round = 0; round < 3 && pool.length < 3; round++) {
      const avoid = seen.length ? `\nta 已经接触过这些、绝对别再出现、也别推它们人尽皆知的同类：${seen.join('、')}。换更冷门的。` : '';
      const obj = await cloudJSON(baseSys + avoid, `${history ? history + '\n' : ''}用户：${text}`);
      const items = (obj?.items as { title?: string; why?: string }[] | undefined) || [];
      if (!items.length) break;
      for (const it of items) {
        const title = String(it?.title || '').replace(/《|》/g, '').trim();
        if (!title) continue;
        if (checkSeen(title)) { const m = `《${title}》`; if (!seen.includes(m)) seen.push(m); }
        else if (!pool.some((p) => p.title === title)) pool.push({ title, why: String(it?.why || '').trim() });
      }
    }
    if (!pool.length) return null;
    return '给你挑了几个你应该还没碰过的：\n' + pool.slice(0, 3).map((p) => `《${p.title}》${p.why}`).join('\n');
  };

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setInput('');
    lastAskRef.current = text;   // 供「重试」回放
    const history = turns.slice(-6).map((t) => `${t.role === 'user' ? '用户' : '我'}：${t.text}`).join('\n');
    const submissionDraft = config.feishuSubmission?.createDraft(text) || null;
    if (submissionDraft) {
      setTurns((current) => [
        ...current,
        { role: 'user', text },
        {
          role: 'agent',
          text: `已识别为${submissionDraft.label}。确认后，我会把原始指令交给 AI，并写入飞书多维表格的“AI 指令”列；AI 补全字段后进入“待确认”，未确认前不会进入地球。`,
          submission: { draft: submissionDraft, status: 'ready' },
        },
      ]);
      return;
    }
    setTurns((t) => [...t, { role: 'user', text }]);
    setBusy(true);
    try {
      // 端侧意图分类（端侧「挑」），失败/空则跳过
      let intent = '';
      if (config.intentLabels?.length) {
        intent = await edgeSafe.classify(text, config.intentLabels);  // 契约入口：带兜底+健康追踪，失败返回''
      }

      let reply = '';
      let failed = false;
      let streamedLive = false;   // 真 SSE 已在气泡里逐 token 填完 → 不再走打字机
      let bubblePushed = false;   // 气泡是否已放（brain 路径会放空气泡；buildNewRecs 专路不放）
      const setLast = (patch: Partial<{ text: string; error: boolean }>) =>
        setTurns((t) => { const n = [...t]; const li = n.length - 1; if (n[li]?.role === 'agent') n[li] = { ...n[li], ...patch }; return n; });
      // 「推荐没看过的」专路：源头先把已看的候选过滤掉，从根上避免推已看（不靠事后红标注补救）。
      if (config.checkSeen && wantsNew(text)) {
        try { reply = (await buildNewRecs(text, history)) || ''; } catch { reply = ''; }
      }
      // 普通对话（含「推经典」场景、讨论、找片）：真 SSE 逐 token 流式作答（替代「整段生成 + 打字机模拟」）。
      if (!reply) {
        const memory = assembleMemory();   // 长期记忆经记忆中枢统一装配后注入云脑 system
        const system = `${config.persona}\n\n${memory ? memory + '\n\n' : ''}【用户数据】\n${config.context()}\n\n${HUMAN_VOICE}\n\n要求：结合用户的口味画像作答，像懂行的朋友，具体有判断，不超过 180 字。【若用户要你推荐】只推荐 ta 大概率「没看过 / 没读过 / 没听过」的冷门、小众或近作，主动避开人尽皆知的主流经典（ta 几乎都接触过了），每条点明为何对 ta 的味；绝不推荐 ta 很可能已经接触过的东西。`;
        const prompt = `${history ? history + '\n' : ''}用户：${text}`;
        if (!mountedRef.current) return;
        setTurns((t) => [...t, { role: 'agent', text: '', intent: intent || undefined }]); bubblePushed = true;   // 空气泡，下面逐 token 填
        try {
          const full = await streamComplete(prompt, { system, onToken: (_tok, soFar) => { if (mountedRef.current) setLast({ text: soFar }); } });
          reply = cleanVoice(full) || '我这边没生成出内容，换个说法再试试。';
          if (mountedRef.current) setLast({ text: reply });   // 流完 → 用清洗后的最终文本替换
          streamedLive = true;
        } catch {
          // 流式失败 → 回落非流式 fetch（保持原兜底语义），气泡已存在、交给下面打字机填
          try {
            const r = await fetch('/api/frost-llm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, system }) });
            if (r.ok) { const d = await r.json(); reply = cleanVoice(typeof d?.text === 'string' ? d.text : ''); } else failed = true;
          } catch { failed = true; }
          if (!reply) reply = failed ? '没连上大脑（网络或服务异常）。点「重试」再发一次，或先翻左边「数据层」。' : '我这边没生成出内容，换个说法再试试。';
        }
      }
      if (!mountedRef.current) return;        // 期间卸载 → 不再 setState
      if (streamedLive) return;               // 真流式已填完，结束
      // buildNewRecs 专路 / 流式回落：仍用打字机逐字填（专路无气泡则补放、回落气泡已在）
      if (!bubblePushed) {
        setTurns((t) => [...t, { role: 'agent', text: '', intent: intent || undefined, error: failed }]);
      } else { setLast({ error: failed }); }
      let acc = '';
      const handle = streamText(reply, (e) => {
        if (!mountedRef.current) return;     // 卸载后停止填充，避免对已卸载组件 setState
        if (e.phase === 'delta' && e.delta) { acc += e.delta; const cur = acc; setLast({ text: cur }); }
        else if (e.phase === 'end') { setLast({ text: reply }); }
      });
      streamRef.current = handle;
      try { await handle.done; } finally { streamRef.current = null; }
    } finally {
      if (mountedRef.current) setBusy(false);   // try/finally：任何抛错也不把对话框永久锁死
    }
  };

  const submitToFeishu = async (turnIndex: number, draft: FrostSubmissionDraft) => {
    setTurns((current) => current.map((turn, index) => index === turnIndex
      ? { ...turn, submission: { draft, status: 'sending' } }
      : turn));
    try {
      await upsertFeishuLibraryRecords(draft.domain, [draft.record], {
        status: '待分析',
        source: 'Frost Agent',
      });
      setTurns((current) => current.map((turn, index) => index === turnIndex
        ? {
          ...turn,
          text: `${draft.label}已作为“AI 指令”提交到飞书多维表格，当前状态为“待分析”。AI 会补全结构化字段和候选地点；你确认后才会进入地球。`,
          submission: { draft, status: 'done' },
        }
        : turn));
    } catch (error) {
      const detail = error instanceof Error ? error.message : '提交失败';
      setTurns((current) => current.map((turn, index) => index === turnIndex
        ? { ...turn, submission: { draft, status: 'error', error: detail } }
        : turn));
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] min-h-0">
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3 min-h-0">
        {turns.length === 0 && (
          <div className="text-[11px] text-black/50 leading-relaxed bg-white border-2 border-black p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            试试问它：
            <div className="flex flex-wrap gap-1.5 mt-2">
              {config.suggestions.map((s) => (
                <button key={s} onClick={() => ask(s)} className="text-[11px] px-2 py-0.5 border-2 border-black bg-[#EAEAEA] hover:bg-black/5 active:translate-y-px">{s}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => t.role === 'user' ? (
          <div key={i} className="self-end flex flex-row-reverse items-start gap-2 max-w-[88%]">
            <div className="shrink-0 mt-0.5"><UserZhaIcon size={26} ring="#111" /></div>
            <div className="text-white border-2 border-black px-3 py-2 text-[12px] leading-relaxed shadow-[2px_2px_0_rgba(0,0,0,0.85)]" style={{ background: '#111' }}>{t.text}</div>
          </div>
        ) : (
          <div key={i} className="flex items-start gap-2 max-w-[94%]">
            <div className="shrink-0 mt-0.5"><AgentLuIcon size={26} /></div>
            <div className="flex flex-col gap-1 min-w-0">
              <div className="font-pixel text-[7px] tracking-[0.2em] flex items-center gap-1.5" style={{ color: t.error ? '#d23b3b' : config.accent }}>
                {t.error ? '✕ 连接失败' : 'AGENT'}
                {t.intent && !t.error && <span className="not-italic" style={{ color: config.accent }}>· 端侧识别意图：{t.intent}</span>}
              </div>
              <div className={`bg-white border-2 px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap shadow-[2px_2px_0_rgba(0,0,0,0.85)] ${t.error ? 'border-[#d23b3b]' : 'border-black'}`}>{t.text}</div>
              {t.submission && (
                <div className="border-2 border-black bg-[#F5F2E9] p-2 text-[10px] leading-relaxed">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Database className="h-3.5 w-3.5" strokeWidth={2.7} style={{ color: config.accent }} />
                    飞书多维表格草稿 · {t.submission.draft.label}
                  </div>
                  {t.submission.status === 'done' ? (
                    feishuLibraryUrl ? (
                      <a href={feishuLibraryUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-1.5 border-2 border-black bg-white px-2 py-2 font-bold text-[#168654] shadow-[1px_1px_0_#000] active:translate-y-px">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />已写入 · 打开飞书多维表格 ↗
                      </a>
                    ) : (
                      <div className="mt-2 flex items-center gap-1.5 border-2 border-black bg-white px-2 py-1.5 font-bold text-[#168654]">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />已写入 · 待分析
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled={t.submission.status === 'sending'}
                      onClick={() => void submitToFeishu(i, t.submission!.draft)}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 border-2 border-black px-2 py-2 font-bold shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-45"
                      style={{ background: config.accent }}
                    >
                      {t.submission.status === 'sending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" strokeWidth={2.7} />}
                      {t.submission.status === 'sending' ? '正在提交…' : t.submission.status === 'error' ? '重试 AI 写入' : '用 AI 添加到飞书表格'}
                    </button>
                  )}
                  {t.submission.status === 'error' && (
                    <div className="mt-1.5 text-[#b3261e]">提交失败：{t.submission.error}</div>
                  )}
                </div>
              )}
              {config.checkSeen && !t.error && !t.submission && (() => {
                // 确定性去重：扫回复里的《作品名》，把命中已看/已读全集的当场标红（不靠云脑自觉）
                const titles = [...new Set(t.text.match(/《[^》]+》/g) || [])];
                const seen = titles.map((m) => { const lb = config.checkSeen!(m.slice(1, -1)); return lb ? `${m}（${lb}）` : null; }).filter(Boolean) as string[];
                if (!seen.length) return null;
                return <div className="text-[10px] text-[#d23b3b] leading-snug">⚠ 这些你已经接触过：{seen.join('、')} —— 要的话我换你没碰过的。</div>;
              })()}
              {t.error && !busy && (
                <button onClick={() => ask(lastAskRef.current)} className="self-start font-pixel text-[7px] border border-black px-2 py-0.5 bg-white text-[#d23b3b] active:translate-y-px">重试</button>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="font-pixel text-[8px] text-black/45 tracking-widest animate-pulse">⋯ 端侧识别 + 云端作答 ⋯</div>}
        <div ref={endRef} />
      </div>

      <div className="px-3 py-3 border-t-2 border-black bg-white shrink-0">
        <form className="flex gap-2 items-center" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <input
            type="text" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
            placeholder={config.placeholder}
            className="flex-1 h-10 border-2 border-black bg-[#EAEAEA] text-[12px] px-3 outline-none focus:bg-white transition-colors min-w-0 disabled:opacity-50"
          />
          <button type="submit" disabled={busy || !input.trim()} className="w-10 h-10 border-2 border-black flex items-center justify-center active:translate-y-px shrink-0 disabled:opacity-30 text-black" style={{ background: config.accent }}>
            <ArrowUp className="w-4 h-4" strokeWidth={3} />
          </button>
        </form>
      </div>
    </div>
  );
}
