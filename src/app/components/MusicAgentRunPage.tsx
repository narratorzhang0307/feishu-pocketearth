import { useEffect, useReducer, useRef, useState } from 'react';
import { ChevronLeft, ArrowUp, Check, Database, Loader2, Radio, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { runFrost } from '../../../frost-agent/harness/router';
import type { PlaylistEntry } from '../../../frost-agent/harness/types';
import { buildDayProgram, type DayProgram } from '../../../frost-agent/agents/radio-24h-director';
import { ensureMusicData, RADIO_CITIES, resolveTracksByIds, subscribeMusicData, type ResolvedTrack } from '../../../frost-agent/data/radio';
import { recommendMusic, recordPlay, type MusicRecs } from '../lib/music/plays';
import AgentLuIcon from './AgentLuIcon';
import UserZhaIcon from './UserZhaIcon';
import YouTubePlaybackFrame from './music/YouTubePlaybackFrame';
import { canPlayMusicSource, directAudioUrl, musicSourceLabel, youtubeVideoId } from '../lib/music/playback';
import { frostSubmissionFromText, type FrostSubmissionDraft } from '../feishu/frostSubmission';
import { upsertFeishuLibraryRecords } from '../feishu/api';

const FEISHU_LIBRARY_OPEN_PATH = '/api/feishu/library/open';

// 音乐 Skill 运行页：FROST 编排歌单，播放器按 Data Pack 声明走 OSS/外部直链或 YouTube 真实来源。

interface Turn {
  role: 'user' | 'frost';
  text: string;
  trace?: string[];
  playlist?: PlaylistEntry[];
  program?: DayProgram;
  recs?: MusicRecs;
  submission?: { draft: FrostSubmissionDraft; status: 'ready' | 'sending' | 'done' | 'error'; error?: string };
}

interface Props {
  onBack: () => void;
  embedded?: boolean;   // 嵌入「曲库/对话」双 tab 时隐藏自身大头，仅留 24H 动作
  initialInput?: string;
}

export default function MusicAgentRunPage({ onBack, embedded, initialInput = '' }: Props) {
  const [, refreshMusic] = useReducer((value) => value + 1, 0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(initialInput);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // 播放器不伪造音源：声明的原曲不可用时直接告知用户。
  const [queue, setQueue] = useState<ResolvedTrack[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(false);
  const cur = queue[idx];

  useEffect(() => {
    void ensureMusicData();
    return subscribeMusicData(refreshMusic);
  }, []);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, busy]);

  // 切曲：直链交给 audio，YouTube 交给官方 iframe。
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !cur) return;
    recordPlay({ id: cur.id, title: cur.title, artist: cur.artist, city: cur.cityNameZh });   // 记一次收听 → 听歌记忆 + 回流口味
    const directUrl = directAudioUrl(cur.playback);
    setSourceError(null);
    a.pause();
    a.removeAttribute('src');
    if (!directUrl) {
      a.load();
      if (!youtubeVideoId(cur.playback)) {
        setSourceError('这条数据没有可用的原曲来源');
        setPlaying(false);
      }
      return;
    }
    a.src = directUrl;
    a.load();
    const fail = () => {
      setSourceError('原曲音源暂不可用');
      setPlaying(false);
    };
    if (playingRef.current) a.play().catch(fail);
    a.addEventListener('error', fail);
    const t = window.setTimeout(() => { if (a.readyState < 2) fail(); }, 7000);
    return () => { window.clearTimeout(t); a.removeEventListener('error', fail); };
  }, [idx, cur]);

  // 播放 / 暂停
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !cur || youtubeVideoId(cur.playback)) return;
    if (playing) a.play().catch(() => { setSourceError('原曲音源暂不可用'); setPlaying(false); });
    else a.pause();
  }, [playing, cur]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const submission = typeof window !== 'undefined' && window.location.pathname.startsWith('/feishu')
      ? frostSubmissionFromText('music', text)
      : null;
    if (submission) {
      setTurns((turns) => [...turns,
        { role: 'user', text },
        {
          role: 'frost',
          text: `已识别为${submission.label}。确认后，AI 会补全曲目、艺人和关联城市，写入飞书多维表格；你在飞书改成“已确认”后才会进入音乐层。`,
          submission: { draft: submission, status: 'ready' },
        },
      ]);
      return;
    }
    const history = turns.map((t) => ({ role: t.role, text: t.text }));
    setTurns((t) => [...t, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await runFrost({ now: new Date(), userText: text, history });
      const playlist = (res.data as { playlist?: PlaylistEntry[] } | undefined)?.playlist;
      setTurns((t) => [...t, { role: 'frost', text: res.reply, trace: res.trace, playlist }]);
    } catch {
      setTurns((t) => [...t, { role: 'frost', text: '我这边断了一下，再说一遍？' }]);
    } finally { setBusy(false); }
  };

  const submitToFeishu = async (turnIndex: number, draft: FrostSubmissionDraft) => {
    setTurns((turns) => turns.map((turn, index) => index === turnIndex
      ? { ...turn, submission: { draft, status: 'sending' } }
      : turn));
    try {
      await upsertFeishuLibraryRecords('music', [draft.record], { status: '待分析', source: 'Frost Agent' });
      setTurns((turns) => turns.map((turn, index) => index === turnIndex
        ? {
          ...turn,
          text: `${draft.label}已作为“AI 指令”写入飞书音乐表，当前状态为“待分析”。AI 补全后进入“待确认”；你确认后才会上地球。`,
          submission: { draft, status: 'done' },
        }
        : turn));
    } catch (error) {
      const detail = error instanceof Error ? error.message : '提交失败';
      setTurns((turns) => turns.map((turn, index) => index === turnIndex
        ? { ...turn, submission: { draft, status: 'error', error: detail } }
        : turn));
    }
  };

  const generateDay = () => {
    if (busy) return;
    const program = buildDayProgram(RADIO_CITIES, new Date());
    if (!program.slots.length) {
      setTurns((t) => [...t, { role: 'frost', text: '今夜还排不出节目表，资料库里还没有可播的城市。' }]);
      return;
    }
    setTurns((t) => [...t, { role: 'frost', text: program.reply, program }]);
  };

  // 懂我推荐：基于听歌记忆，本地双轨选曲（命中口味 + 破茧探索），全用现有曲库
  const recommend = () => {
    if (busy) return;
    const recs = recommendMusic();
    setTurns((t) => [...t, { role: 'frost', text: recs.basis, recs }]);
  };

  const play = (trackIds: string[], startIndex = 0) => {
    const tracks = resolveTracksByIds(trackIds);
    if (!tracks.length) { setHint('没有可播放的曲目'); setTimeout(() => setHint(''), 1800); return; }
    setQueue(tracks);
    setIdx(Math.min(Math.max(0, startIndex), tracks.length - 1));
    setPlaying(canPlayMusicSource(tracks[Math.min(Math.max(0, startIndex), tracks.length - 1)]?.playback));
  };
  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min(queue.length - 1, i + 1));

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans relative overflow-hidden">
      {/* Header（嵌入双 tab 时只留 24H 动作，大头交给外层）*/}
      {embedded ? (
        <div className="flex items-center justify-between px-3 py-1.5 border-b-2 border-black bg-white shrink-0">
          <span className="font-pixel text-[7px] text-black/40 tracking-widest">音乐 Skill · 和 FROST 对话</span>
          <div className="flex items-center gap-1.5">
            <button onClick={recommend} disabled={busy} className="border-2 border-black bg-[#00ff88] text-black px-2 py-1 font-pixel text-[7px] tracking-widest active:translate-y-px disabled:opacity-40">♪ 懂我</button>
            <button onClick={generateDay} disabled={busy} className="flex items-center gap-1 border-2 border-black bg-black text-[#7CFF6B] px-2 py-1 font-pixel text-[7px] tracking-widest active:translate-y-px disabled:opacity-40">
              <Radio className="w-3 h-3" strokeWidth={2.5} /> 24H
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
          <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
            <ChevronLeft className="w-4 h-4" strokeWidth={3} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-pixel text-[11px] tracking-wider truncate">MUSIC-SKILL</div>
            <div className="text-[9px] text-black/45 truncate">音乐 Skill · {RADIO_CITIES.length} 城在库</div>
          </div>
          <button onClick={recommend} disabled={busy} className="border-2 border-black bg-[#00ff88] text-black px-2 py-1.5 font-pixel text-[7px] tracking-widest active:translate-y-px disabled:opacity-40">♪ 懂我</button>
          <button onClick={generateDay} disabled={busy} className="flex items-center gap-1 border-2 border-black bg-black text-[#7CFF6B] px-2 py-1.5 font-pixel text-[7px] tracking-widest active:translate-y-px disabled:opacity-40">
            <Radio className="w-3 h-3" strokeWidth={2.5} /> 24H
          </button>
        </div>
      )}

      {/* 对话区 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {turns.length === 0 && (
          <div className="text-[11px] text-black/45 leading-relaxed bg-white border-2 border-black p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            试试对它说：<br />
            「我在读海明威，帮我建个阅读歌单」<br />
            「跟着日落走」「切到东京」「讲讲这座城」
          </div>
        )}

        {turns.map((turn, i) => turn.role === 'user' ? (
          <div key={i} className="self-end flex flex-row-reverse items-start gap-2 max-w-[88%]">
            <div className="shrink-0 mt-0.5"><UserZhaIcon size={26} ring="#111" /></div>
            <div className="bg-black text-[#7CFF6B] border-2 border-black px-3 py-2 text-[12px] leading-relaxed shadow-[2px_2px_0_rgba(0,0,0,0.85)]">{turn.text}</div>
          </div>
        ) : (
          <div key={i} className="flex items-start gap-2 max-w-[96%]">
            <div className="shrink-0 mt-0.5"><AgentLuIcon size={26} /></div>
            <div className="flex flex-col gap-2 min-w-0 flex-1">
            <div className="font-pixel text-[7px] tracking-[0.2em] text-black/50">FROST</div>
            {turn.text && (
              <div className="bg-white border-2 border-black px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap shadow-[2px_2px_0_rgba(0,0,0,0.85)]">{turn.text}</div>
            )}

            {turn.submission && (
              <div className="border-2 border-black bg-[#F5F2E9] p-2 text-[10px] leading-relaxed">
                <div className="flex items-center gap-1.5 font-bold">
                  <Database className="h-3.5 w-3.5 text-[#168654]" strokeWidth={2.7} />
                  飞书多维表格草稿 · {turn.submission.draft.label}
                </div>
                {turn.submission.status === 'done' ? (
                  <a href={FEISHU_LIBRARY_OPEN_PATH} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-1.5 border-2 border-black bg-white px-2 py-2 font-bold text-[#168654] shadow-[1px_1px_0_#000] active:translate-y-px">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />已写入 · 打开飞书多维表格 ↗
                  </a>
                ) : (
                  <button type="button" disabled={turn.submission.status === 'sending'} onClick={() => void submitToFeishu(i, turn.submission!.draft)} className="mt-2 flex w-full items-center justify-center gap-1.5 border-2 border-black bg-[#00ff88] px-2 py-2 font-bold shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-45">
                    {turn.submission.status === 'sending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" strokeWidth={2.7} />}
                    {turn.submission.status === 'sending' ? '正在提交…' : turn.submission.status === 'error' ? '重试 AI 写入' : '用 AI 添加到飞书表格'}
                  </button>
                )}
                {turn.submission.status === 'error' && <div className="mt-1.5 text-[#b3261e]">提交失败：{turn.submission.error}</div>}
              </div>
            )}

            {/* thinking trace */}
            {turn.trace && turn.trace.length > 0 && (() => {
              const edgeOn = turn.trace.some((t) => t.includes('在端上按场景'));
              const edgeSeen = turn.trace.some((t) => t.includes('Selector(端侧)'));
              return (
                <div className="border-2 border-black/30 bg-[#E2E2E0]">
                  <div className="px-2.5 py-1 border-b border-black/15 font-pixel text-[6px] tracking-widest text-black/40 uppercase flex items-center justify-between">
                    <span>thinking</span>
                    {edgeSeen && (
                      edgeOn
                        ? <span className="bg-[#00ff88] text-black px-1.5 py-0.5 font-pixel text-[6px] tracking-wider not-italic">● 端侧排序中</span>
                        : <span className="bg-black/15 text-black/50 px-1.5 py-0.5 font-pixel text-[6px] tracking-wider">端侧未就绪</span>
                    )}
                  </div>
                  <div className="px-2.5 py-1.5 space-y-1">
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
                </div>
              );
            })()}

            {/* 歌单 */}
            {turn.playlist && turn.playlist.length > 0 && (
              <div className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)] overflow-hidden">
                <div className="px-3 py-2 bg-black/5 border-b-2 border-black flex items-center justify-between gap-2">
                  <span className="font-pixel text-[7px] tracking-widest text-black/55 uppercase flex items-center gap-1.5">
                    Playlist
                    {turn.trace?.some((t) => t.includes('在端上按场景')) && (
                      <span className="bg-[#00ff88] text-black px-1 py-0.5 tracking-wider">端侧精选</span>
                    )}
                  </span>
                  <button onClick={() => play(turn.playlist!.map((t) => t.trackId), 0)} className="border-2 border-black bg-[#00ff88] px-2 py-1 font-pixel text-[7px] tracking-wider active:translate-y-px">
                    ▶ 播放 {turn.playlist.length} 首
                  </button>
                </div>
                <div className="divide-y divide-black/10">
                  {turn.playlist.slice(0, 8).map((tr, idx) => (
                    <button key={idx} onClick={() => play(turn.playlist!.map((t) => t.trackId), idx)} className="w-full text-left px-3 py-2 hover:bg-[#00ff88]/10 active:bg-[#00ff88]/20 transition-colors">
                      <div className="flex gap-2 items-start">
                        <span className="font-pixel text-[7px] text-black/40 w-4 shrink-0 pt-1">{String(idx + 1).padStart(2, '0')}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] truncate">{tr.title}{tr.artist && <span className="text-black/45"> · {tr.artist}</span>}</div>
                          <div className="text-[10px] text-black/40 truncate">{tr.cityNameZh}</div>
                          {tr.note && <div className="text-[10px] text-black/45 leading-snug line-clamp-2 mt-0.5">{tr.note}</div>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 24H 节目表（简化：逐城 + 起播） */}
            {turn.program && (
              <div className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)] overflow-hidden">
                <div className="px-3 py-2 bg-black text-[#7CFF6B] flex items-center justify-between gap-2">
                  <span className="font-pixel text-[7px] tracking-widest">24H · 今夜 {turn.program.slots.length} 城</span>
                  <button onClick={() => play(programTrackIds(turn.program!), 0)} className="border border-[#7CFF6B] px-2 py-0.5 font-pixel text-[7px] tracking-wider active:translate-y-px">▶ 播放</button>
                </div>
                <div className="max-h-[260px] overflow-y-auto divide-y divide-black/10">
                  {turn.program.slots.map((s, si) => {
                    const offset = turn.program!.slots.slice(0, si).reduce((n, x) => n + x.songs.length, 0);
                    return (
                      <button key={s.rank} onClick={() => play(programTrackIds(turn.program!), offset)} className="w-full text-left px-3 py-2 hover:bg-[#00ff88]/10 active:bg-[#00ff88]/20 transition-colors flex items-center gap-2">
                        <span className="font-pixel text-[8px] text-black/55 w-9 shrink-0 tabular-nums">{s.userClock}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] truncate">{s.cityNameZh} <span className="text-[9px] text-black/35">CH {s.freq.toFixed(1)} · {s.songs.length} 首</span></div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 懂我推荐：双轨（命中口味 + 破茧探索） */}
            {turn.recs && (['forYou', 'explore'] as const).map((key) => {
              const list = turn.recs![key];
              if (!list.length) return null;
              const label = key === 'forYou' ? '根据你常听' : '不妨试试';
              const color = key === 'forYou' ? '#00ff88' : '#ffb000';
              return (
                <div key={key} className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)] overflow-hidden">
                  <div className="px-3 py-2 border-b-2 border-black flex items-center justify-between gap-2" style={{ background: color + '22' }}>
                    <span className="font-pixel text-[7px] tracking-widest text-black/60">{label}</span>
                    <button onClick={() => play(list.map((s) => s.id), 0)} className="border-2 border-black px-2 py-1 font-pixel text-[7px] tracking-wider active:translate-y-px" style={{ background: color }}>▶ 播 {list.length}</button>
                  </div>
                  <div className="divide-y divide-black/10">
                    {list.map((s, si) => (
                      <button key={s.id} onClick={() => play(list.map((x) => x.id), si)} className="w-full text-left px-3 py-2 hover:bg-black/5 active:bg-black/10 transition-colors flex gap-2 items-center">
                        <span className="font-pixel text-[7px] text-black/35 w-4 shrink-0">{String(si + 1).padStart(2, '0')}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] truncate">{s.title}<span className="text-black/45"> · {s.artist}</span></div>
                          <div className="text-[10px] text-black/40 truncate">{[s.genre, s.city].filter(Boolean).join(' · ')}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        ))}

        {busy && <div className="font-pixel text-[8px] text-black/45 tracking-widest">⋯ FROST 正在编排 ⋯</div>}
        <div ref={endRef} />
      </div>

      {/* 提示条 */}
      {hint && (
        <div className="absolute bottom-[64px] left-1/2 -translate-x-1/2 bg-black text-[#7CFF6B] border-2 border-[#7CFF6B] px-3 py-1.5 font-pixel text-[8px] tracking-wider z-20">{hint}</div>
      )}

      {/* 播放条 */}
      {cur && (
        <div className="border-t-2 border-black bg-black text-[#7CFF6B] shrink-0">
          {youtubeVideoId(cur.playback) && (
            <YouTubePlaybackFrame playback={cur.playback} playing={playing} title={cur.title} className="h-36 w-full border-b border-[#7CFF6B]/35" />
          )}
          <div className="px-3 py-2 flex items-center gap-2.5">
          <div className="w-9 h-9 shrink-0 border border-[#7CFF6B]/50 bg-[#0a0a0a] overflow-hidden">{cur.cover && <img src={cur.cover} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-white truncate">{cur.title}<span className="text-white/45"> · {cur.artist}</span></div>
            <div className={`font-pixel text-[6px] tracking-wider truncate mt-0.5 ${sourceError ? 'text-[#ff8a76]' : 'text-[#7CFF6B]/70'}`}>{sourceError || `${cur.cityNameZh} · ${idx + 1}/${queue.length} · ${musicSourceLabel(cur.playback)}`}</div>
          </div>
          <button onClick={prev} disabled={idx === 0} className="w-7 h-7 flex items-center justify-center disabled:opacity-30 active:scale-95"><SkipBack className="w-4 h-4" fill="currentColor" strokeWidth={0} /></button>
          <button onClick={() => setPlaying((p) => !p)} disabled={!canPlayMusicSource(cur.playback)} className="w-9 h-9 border-2 border-[#7CFF6B] flex items-center justify-center active:scale-95 disabled:opacity-30">{playing ? <Pause className="w-4 h-4" fill="currentColor" strokeWidth={0} /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" strokeWidth={0} />}</button>
          <button onClick={next} disabled={idx >= queue.length - 1} className="w-7 h-7 flex items-center justify-center disabled:opacity-30 active:scale-95"><SkipForward className="w-4 h-4" fill="currentColor" strokeWidth={0} /></button>
          </div>
        </div>
      )}
      <audio ref={audioRef} onEnded={next} />

      {/* 输入 */}
      <div className="px-3 py-3 border-t-2 border-black bg-white shrink-0">
        <form className="flex gap-2 items-center" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            type="text" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
            placeholder="对 FROST 说……（Enter 发送）"
            className="flex-1 h-10 border-2 border-black bg-[#EAEAEA] text-[12px] px-3 outline-none focus:bg-white transition-colors min-w-0 disabled:opacity-50"
          />
          <button type="submit" disabled={busy || !input.trim()} className="w-10 h-10 border-2 border-black bg-[#00ff88] flex items-center justify-center active:translate-y-px shrink-0 disabled:opacity-30">
            <ArrowUp className="w-4 h-4" strokeWidth={3} />
          </button>
        </form>
      </div>
    </div>
  );
}

// 节目表 → 跨城曲目 id 顺序（按 slot 顺序摊平）
function programTrackIds(program: DayProgram): string[] {
  const ids: string[] = [];
  for (const s of program.slots) for (const song of s.songs) ids.push(song.trackId);
  return ids;
}
