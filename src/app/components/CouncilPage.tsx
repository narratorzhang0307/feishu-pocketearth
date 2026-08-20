import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Play, Square, RotateCcw, Check, Gavel, Archive, MapPin } from 'lucide-react';
import PixelAvatar from './PixelAvatar';
import { COUNCIL_AGENTS, agentById } from '../council/agents';
import { COUNCIL_MODES, modeDef, runCouncil, type CouncilMode, type CouncilMsg, type CouncilBackend } from '../council/engine';
import { runCourtroom } from '../council/courtroom/stages';
import { saveCase } from '../council/courtroom/caseStore';
import type { Verdict, CourtStage } from '../council/courtroom/types';
import { addUserMark, spreadCoord } from '../data/userMarks';
import { geocodeCity } from '../data/geoStickers';

// 圆桌议事运行页（我们的像素风）：选谁入场 + 选讨论模式 + 出题 → 多 agent 轮流发言。
// 机制是频道群聊式的多 agent 同台（见 council/engine.ts），UI 完全是 Pocket Earth 风格；与各 agent 解耦。

const ACCENT = '#00ff88';
interface Props { onBack: () => void }

export default function CouncilPage({ onBack }: Props) {
  const [phase, setPhase] = useState<'setup' | 'run'>('setup');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(['bookworm', 'reel', 'vinyl', 'contra']));
  const [sides, setSides] = useState<Record<string, 'pro' | 'con'>>({});   // 法庭：用户手动指定的正反方覆盖（未指定者按位置默认）
  const [mode, setMode] = useState<CouncilMode>('roundtable');
  const [topic, setTopic] = useState('');
  const [rounds, setRounds] = useState(2);
  const [backend, setBackend] = useState<CouncilBackend>('cloud');
  const [messages, setMessages] = useState<CouncilMsg[]>([]);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<CourtStage | null>(null);    // 法庭当前阶段
  const [verdict, setVerdict] = useState<Verdict | null>(null);   // 结构化裁决产物
  const [saved, setSaved] = useState(false);
  const [pinned, setPinned] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, speaking, verdict]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // 法庭分边：在场的「庭长以外」成员（保持花名册顺序），默认前一半正方、后一半反方，用户可逐个改。
  const nonChairSelected = COUNCIL_AGENTS.filter((a) => selected.has(a.id) && a.id !== 'chair').map((a) => a.id);
  const defaultSideOf = (id: string): 'pro' | 'con' => nonChairSelected.indexOf(id) < Math.ceil(nonChairSelected.length / 2) ? 'pro' : 'con';
  const sideOf = (id: string): 'pro' | 'con' => sides[id] ?? defaultSideOf(id);
  const setSideOf = (id: string, s: 'pro' | 'con') => setSides((p) => ({ ...p, [id]: s }));
  const proCount = nonChairSelected.filter((id) => sideOf(id) === 'pro').length;
  const conCount = nonChairSelected.filter((id) => sideOf(id) === 'con').length;

  // 法庭模式需正反各一人：「庭长以外」≥2 且两侧各至少 1；其余模式 ≥2 即可
  const nonChairCount = nonChairSelected.length;
  const canStart = mode === 'courtroom' ? (nonChairCount >= 2 && proCount >= 1 && conCount >= 1) : selected.size >= 2;
  // 法庭必登场庭长 FROST（用户没手选也会自动请来收尾）：人数 +1，与台上实际发言角色数一致，免镜头里写「4 人」却 5 人发言
  const headcount = mode === 'courtroom' && !selected.has('chair') ? selected.size + 1 : selected.size;

  const start = async () => {
    if (!canStart) return;
    setMessages([]); setVerdict(null); setStage(null); setSaved(false); setPinned(false); setPhase('run'); setRunning(true);
    const ac = new AbortController(); abortRef.current = ac;
    const ids = COUNCIL_AGENTS.filter((a) => selected.has(a.id)).map((a) => a.id);
    const onMessage = (m: CouncilMsg) => setMessages((prev) => [...prev, m]);
    if (mode === 'courtroom') {
      // 法庭走新的流水线庭审引擎：议题里若能识别出城市，则带上地理锚点（裁决可钉地球）
      const g = geocodeCity(topic);
      const geo = g ? { lat: g.lat, lng: g.lng, place: g.place } : undefined;
      // 用户手动分边：按当前正反点选传入（每人都有默认侧，故两侧总非空，runCourtroom 直接采信）
      const nonChairIds = ids.filter((id) => id !== 'chair');
      const proIds = nonChairIds.filter((id) => sideOf(id) === 'pro');
      const conIds = nonChairIds.filter((id) => sideOf(id) === 'con');
      await runCourtroom({ agentIds: ids, proIds, conIds, topic, rounds, backend, geo, onMessage, onSpeaker: setSpeaking, onStage: setStage, onVerdict: setVerdict, signal: ac.signal });
    } else {
      // 其余三模式仍走旧引擎，零改动
      await runCouncil({ mode, agentIds: ids, topic, rounds, backend, onMessage, onSpeaker: setSpeaking, signal: ac.signal });
    }
    setRunning(false); setSpeaking(null); setStage(null);
  };
  const stop = () => { abortRef.current?.abort(); setRunning(false); setSpeaking(null); setStage(null); };

  // critical 违规（如疑似杜撰证据）：既不自动入库，也禁止手动存判例 / 钉地球，避免污染先例语料与地球
  const blockedByCritical = !!verdict?.criticalViolations?.length;
  // 存为判例（端侧判例库）
  const onSaveCase = () => { if (verdict && !blockedByCritical) { saveCase(verdict); setSaved(true); } };
  // 钉到地球（仅议题带地理锚点 + 置信≥0.6 + 无 critical；suggest-then-confirm）
  const canPin = !!verdict?.geo && (verdict?.confidence ?? 0) >= 0.6 && !blockedByCritical;
  const onPin = () => {
    if (!verdict?.geo) return;
    const id = 'council-' + verdict.id;
    const [lng, lat] = spreadCoord(id, verdict.geo.lng, verdict.geo.lat, 0.4);
    addUserMark({ id, kind: 'council', lng, lat, label: (verdict.topic || '议事').slice(0, 18),
      meta: { verdict: verdict.verdict, confidence: verdict.confidence, ruleEstablished: verdict.ruleEstablished, place: verdict.geo.place, date: verdict.createdAt.slice(0, 10) } });
    setPinned(true);
  };

  const speaker = speaking ? COUNCIL_AGENTS.find((a) => a.id === speaking) : null;

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={phase === 'run' ? () => { stop(); setPhase('setup'); } : onBack} aria-label={phase === 'run' ? '停止运行并返回设置' : '返回'} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">COUNCIL · 圆桌议事</div>
          <div className="text-[9px] text-black/45 truncate">多 agent 讨论 / 辩论 / 法庭 · 你来组局</div>
        </div>
        <span className="font-pixel text-[7px] text-black/45">{headcount} 人</span>
      </div>

      {phase === 'setup' ? (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {/* 议题 */}
          <div>
            <div className="font-pixel text-[9px] tracking-widest text-black/55 mb-1.5">议题 · TOPIC</div>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2}
              placeholder="抛一个话题让大家讨论，如「该不该搬去海边城市生活？」"
              className="w-full border-2 border-black px-2.5 py-2 text-[12px] bg-white focus:outline-none resize-none" />
          </div>

          {/* 模式 */}
          <div>
            <div className="font-pixel text-[9px] tracking-widest text-black/55 mb-1.5">模式 · MODE</div>
            <div className="grid grid-cols-2 gap-2">
              {COUNCIL_MODES.map((m) => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`text-left border-2 border-black p-2 shadow-[2px_2px_0_rgba(0,0,0,0.85)] active:translate-y-px ${mode === m.id ? 'bg-black text-[#7CFF6B]' : 'bg-white'}`}>
                  <div className="text-[12px] font-bold">{m.emoji} {m.label}</div>
                  <div className={`text-[9px] mt-0.5 ${mode === m.id ? 'text-[#7CFF6B]/70' : 'text-black/45'}`}>{m.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 花名册：点头像入场 / 退场 */}
          <div>
            <div className="font-pixel text-[9px] tracking-widest text-black/55 mb-1.5">在场的人 · 点头像加入或退出</div>
            <div className="grid grid-cols-2 gap-2">
              {COUNCIL_AGENTS.map((a) => {
                const on = selected.has(a.id);
                return (
                  <button key={a.id} onClick={() => toggle(a.id)}
                    className={`relative flex items-center gap-2 border-2 border-black p-1.5 text-left transition-all ${on ? 'bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]' : 'bg-[#E2E2E0] opacity-55'}`}>
                    <PixelAvatar spec={a.avatar} size={34} ring={a.color} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold leading-tight truncate">{a.name}</div>
                      <div className="text-[9px] text-black/50 leading-tight truncate">{a.tagline}</div>
                    </div>
                    {on && <span className="absolute -top-2 -right-2 w-4 h-4 flex items-center justify-center border-2 border-black" style={{ background: ACCENT }}><Check className="w-2.5 h-2.5" strokeWidth={4} /></span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 法庭分边：给每个在场（庭长以外）成员点选正方 / 反方 */}
          {mode === 'courtroom' && (
            <div>
              <div className="font-pixel text-[9px] tracking-widest text-black/55 mb-1.5">分边 · 谁是正方 / 谁是反方</div>
              {nonChairSelected.length < 2 ? (
                <div className="text-[9px] text-black/45">先在上方选至少两名「庭长以外」的人，再来分边。</div>
              ) : (
                <div className="space-y-1.5">
                  {nonChairSelected.map((id) => {
                    const a = agentById(id)!;
                    const side = sideOf(id);
                    return (
                      <div key={id} className="flex items-center gap-2 border-2 border-black bg-white px-2 py-1 shadow-[1px_1px_0_#000]">
                        <PixelAvatar spec={a.avatar} size={24} ring={a.color} />
                        <span className="text-[11px] font-bold flex-1 truncate">{a.name}</span>
                        <div className="flex border-2 border-black shrink-0">
                          <button onClick={() => setSideOf(id, 'pro')} className={`px-2.5 py-0.5 text-[10px] font-bold ${side === 'pro' ? 'bg-[#00b050] text-white' : 'text-black/40'}`}>正方</button>
                          <button onClick={() => setSideOf(id, 'con')} className={`px-2.5 py-0.5 text-[10px] font-bold ${side === 'con' ? 'bg-[#d23b3b] text-white' : 'text-black/40'}`}>反方</button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-[9px] text-black/45 leading-snug">⚖️ 默认前一半正方、后一半反方，可逐个改；最后由「庭长」裁断（没选也会自动请来收尾）。</div>
                  {(proCount < 1 || conCount < 1) && <div className="text-[9px] text-[#d23b3b] font-bold">正反两方各需至少一人，否则无法对辩。</div>}
                </div>
              )}
            </div>
          )}

          {/* 轮数 + 大脑（云端 / 端侧） */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-pixel text-[9px] tracking-widest text-black/55">每人轮数</div>
            <div className="flex border-2 border-black">
              {[1, 2, 3].map((r) => (
                <button key={r} onClick={() => setRounds(r)} className={`px-3 py-1 text-[11px] font-bold ${rounds === r ? 'text-black' : 'text-black/40'}`} style={rounds === r ? { background: ACCENT } : undefined}>{r}</button>
              ))}
            </div>
            <div className="font-pixel text-[9px] tracking-widest text-black/55 ml-1">大脑</div>
            <div className="flex border-2 border-black">
              <button onClick={() => setBackend('cloud')} className={`px-2.5 py-1 text-[11px] font-bold ${backend === 'cloud' ? 'text-black' : 'text-black/40'}`} style={backend === 'cloud' ? { background: ACCENT } : undefined}>☁ 云端</button>
              <button onClick={() => setBackend('edge')} className={`px-2.5 py-1 text-[11px] font-bold ${backend === 'edge' ? 'text-black' : 'text-black/40'}`} style={backend === 'edge' ? { background: ACCENT } : undefined}>🖥 端侧</button>
            </div>
          </div>
          <div className="text-[9px] text-black/45 leading-snug">
            {backend === 'cloud'
              ? '☁ 云端：阿里云百炼 Qwen3.5 Plus；仅在你选择云端时发送当前议题。'
              : '🖥 端侧：Qwen + MNN，本机推理、隐私不出端；未加载时使用本地文案兜底。'}
          </div>

          {/* 开始 */}
          <button onClick={start} disabled={!canStart}
            className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-black text-[#7CFF6B] py-2.5 font-pixel text-[10px] tracking-widest shadow-[2px_2px_0_rgba(0,0,0,0.85)] active:translate-y-px disabled:opacity-40">
            <Play className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} /> 开始议事（{headcount} 人 · {modeDef(mode).label}）
          </button>
          {!canStart && <div className="text-center text-[10px] text-black/40">{mode === 'courtroom' ? '法庭模式：至少选两名「庭长以外」的人当正反方' : '至少选两个人才能开始讨论'}</div>}
        </div>
      ) : (
        <>
          {/* 议题条（法庭模式显示当前阶段） */}
          <div className="px-3 py-2 border-b-2 border-black bg-black shrink-0 flex items-center gap-2" style={{ color: ACCENT }}>
            <span className="font-pixel text-[8px] tracking-wider shrink-0">{modeDef(mode).emoji} {modeDef(mode).label}</span>
            <span className="text-[11px] text-white truncate flex-1">{topic || '自由发挥'}</span>
            {stage && <span className="font-pixel text-[7px] tracking-wider shrink-0 text-[#caa64a] animate-pulse">⚖ {stage}</span>}
            <span className="font-pixel text-[7px] tracking-wider shrink-0 opacity-80">{backend === 'cloud' ? '☁ 云端' : '🖥 端侧'}</span>
          </div>

          {/* 讨论流 */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((m) => {
              const a = COUNCIL_AGENTS.find((x) => x.id === m.speakerId)!;
              return (
                <div key={m.id} className="flex gap-2 items-start">
                  <div className="shrink-0"><PixelAvatar spec={a.avatar} size={34} ring={a.color} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] font-bold" style={{ color: a.color }}>{m.name}</span>
                      {m.role && <span className="font-pixel text-[6px] border border-black/40 px-1 py-0.5 text-black/55">{m.role}</span>}
                    </div>
                    <div className="border-2 border-black bg-white px-2.5 py-1.5 text-[12px] leading-relaxed shadow-[2px_2px_0_rgba(0,0,0,0.85)]" style={{ borderLeftColor: a.color, borderLeftWidth: 4 }}>{m.text}</div>
                  </div>
                </div>
              );
            })}
            {speaker && (
              <div className="flex gap-2 items-center">
                <PixelAvatar spec={speaker.avatar} size={28} ring={speaker.color} />
                <span className="font-pixel text-[8px] text-black/45 tracking-widest animate-pulse">{speaker.name} 正在发言…</span>
              </div>
            )}
            {/* 结构化裁决产物（法庭流水线的终点：庭审纪要） */}
            {verdict && (
              <div className="border-2 border-black bg-[#FFFCF2] shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
                <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: '#caa64a' }}>
                  <span className="font-pixel text-[7px] tracking-widest text-black flex items-center gap-1"><Gavel className="w-3 h-3" strokeWidth={2.5} />VERDICT · 庭长 FROST 裁断</span>
                  <span className="font-pixel text-[7px] text-black/70">置信 {Math.round(verdict.confidence * 100)}%</span>
                </div>
                <div className="px-2.5 py-2 space-y-1.5">
                  {!!verdict.issues.length && <div className="flex flex-wrap gap-1">{verdict.issues.map((s, i) => <span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#f5edd6]">争点·{s}</span>)}</div>}
                  {/* 双方结构化论据（举证质证→claim/据证，法庭引擎的核心产物，原先只存盘未展示） */}
                  {(!!verdict.proArgs.length || !!verdict.conArgs.length) && (
                    <div className="space-y-1">
                      {([['正方', verdict.proArgs, '#2e7d4f'], ['反方', verdict.conArgs, '#a0432c']] as const).map(([label, args, c]) =>
                        args.length ? (
                          <div key={label} className="space-y-0.5">
                            <span className="font-pixel text-[6px] tracking-widest px-1 py-0.5 border" style={{ color: c, borderColor: c }}>{label}论据</span>
                            <ul className="space-y-0.5">
                              {args.map((a, i) => (
                                <li key={i} className="text-[10px] text-black/70 leading-snug border-l-2 pl-1.5" style={{ borderColor: c }}>
                                  {a.claim}{a.evidenceRef && <span className="text-black/45"> · 据 {a.evidenceRef}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null,
                      )}
                    </div>
                  )}
                  <div className="text-[12px] text-black/80 leading-relaxed">{verdict.verdict}</div>
                  {verdict.dissent && <div className="text-[10px] text-black/55 leading-snug">保留分歧 · {verdict.dissent}</div>}
                  {verdict.ruleEstablished && <div className="text-[11px] text-black/65 italic border-l-2 pl-2" style={{ borderColor: '#caa64a' }}>裁判要旨 · {verdict.ruleEstablished}</div>}
                  {verdict.critique && <div className="text-[10px] text-[#a05a2c] leading-snug">复核 · {verdict.critique}</div>}
                  {blockedByCritical && (
                    <div className="border-2 border-[#d23b3b] bg-[#fff0f0] px-2 py-1.5 text-[10px] text-[#d23b3b] font-bold leading-snug">
                      ⚠ 严重违规（不入判例库）· {verdict.criticalViolations!.join('；')}
                    </div>
                  )}
                  {!running && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={onSaveCase} disabled={saved || blockedByCritical}
                        className="flex-1 flex items-center justify-center gap-1 border-2 border-black bg-white px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-50">
                        <Archive className="w-3.5 h-3.5" strokeWidth={2.5} /> {blockedByCritical ? '严重违规·不可入库' : saved ? '已存判例' : '存为判例'}
                      </button>
                      {canPin && (
                        <button onClick={onPin} disabled={pinned}
                          className="flex-1 flex items-center justify-center gap-1 border-2 border-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-50" style={{ background: '#caa64a' }}>
                          <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} /> {pinned ? `已钉 ${verdict.geo?.place}` : `钉到 ${verdict.geo?.place}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {!running && messages.length > 0 && <div className="text-center font-pixel text-[8px] text-black/30 py-1 tracking-widest">— {mode === 'courtroom' ? '庭审结束' : '讨论结束'} —</div>}
            <div ref={endRef} />
          </div>

          {/* 控制条 */}
          <div className="px-3 py-2.5 border-t-2 border-black bg-white shrink-0 flex gap-2">
            {running ? (
              <button onClick={stop} className="flex-1 flex items-center justify-center gap-1.5 border-2 border-black bg-[#d23b3b] text-white py-2 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px">
                <Square className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} /> 喊停
              </button>
            ) : (
              <>
                <button onClick={() => setPhase('setup')} className="flex-1 border-2 border-black bg-white py-2 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px">换人 / 换题</button>
                <button onClick={start} className="flex-1 flex items-center justify-center gap-1.5 border-2 border-black bg-black text-[#7CFF6B] py-2 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px">
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.5} /> 再来一轮
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
