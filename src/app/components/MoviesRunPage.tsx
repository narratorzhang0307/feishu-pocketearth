import { useMemo, useReducer, useRef, useState, useEffect } from 'react';
import { ChevronLeft, Film, Camera, Star, MapPin, Loader2, Check } from 'lucide-react';
import { movieDataVersion, movieRecords, moviePoints, movieTotal, movieMappedTotal, movieCountries, movieCountry, doubanRating, ensureMovieData, subscribeMovieData, type MovieRecord } from '../data/movies';
import { getUserMarksByKind, subscribeUserMarks } from '../data/userMarks';
import { runMovieAgent, confirmPin, recordRatingFix, recordPlaceFix, GEO_LABEL, GEO_COLOR, type MovieDraft, type MoviePhase } from '../lib/movie';
import { AnimatePresence } from 'motion/react';
import MarkerDetail, { type MarkerDetailData } from './MarkerDetail';
import RunTrace from './RunTrace';
import { startAgentRun } from '../lib/observe/bus';
import DataPackManager from './DataPackManager';
import { uniqueDataPackRecords } from '../lib/dataPack';
import { requestMapFocus } from '../data/mapFocus';

// movies-agent 运行页 —— 观影 agent。
// 1) 把豆瓣观影记录做成「电影票根」流；2) 用户记一笔/截图 → 端侧识别 → 实时钉到中间的地球（与 tab1 联动）。
// 和 obsidian 的区别：不是纯文本笔记，而是「票根 + 地球落点」，端侧模型负责从截图认片。

interface Props { onBack: () => void; embedded?: boolean }
const AMBER = '#ffb000';

interface Ticket {
  key: string; title: string; original?: string; director?: string;
  country: string; year?: number | null; rating?: number | null; type?: string; date?: string;
  synopsis?: string; douban?: number; pinned: boolean; user?: boolean; lng?: number; lat?: number;
}

const stars = (r?: number | null) => {
  const n = Math.max(0, Math.min(5, r || 0));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
};

function fromRecord(m: MovieRecord): Ticket {
  const point = moviePoints.find((item) => item.id === m.id);
  return { key: 'd' + m.id, title: m.title, original: m.original, director: m.director, country: m.country,
    year: m.year, rating: m.rating, type: m.type, date: m.date, synopsis: m.synopsis, douban: doubanRating(m.id),
    pinned: Boolean(point), lng: point?.lng, lat: point?.lat };
}

const isFeishuRecord = (record: MovieRecord) => /(?:^|:)feishu(?::|$)/i.test(record.id);

export default function MoviesRunPage({ onBack, embedded }: Props) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeUserMarks(force), []);
  useEffect(() => {
    const unsubscribe = subscribeMovieData(force);
    void ensureMovieData().catch(() => {});
    return unsubscribe;
  }, []);

  const [input, setInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [, setPhase] = useState<MoviePhase | ''>('');
  const [runId, setRunId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MovieDraft | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<MarkerDetailData | null>(null);

  // 用户记录（带地球落点）→ 票根
  const userTickets: Ticket[] = getUserMarksByKind('movie').map((m) => {
    const meta = (m.meta || {}) as Record<string, unknown>;
    return { key: m.id, title: m.label || String(meta.title || ''), original: String(meta.original || ''),
      director: String(meta.director || ''), country: String(meta.country || ''), year: meta.year as number,
      rating: meta.rating as number, type: String(meta.type || '电影'), date: String(meta.date || ''), synopsis: String(meta.synopsis || ''),
      pinned: true, user: true, lng: m.lng, lat: m.lat };
  });

  // 豆瓣记录：按观看日期倒序，取近 60 条做票根流
  const recent: Ticket[] = useMemo(
    () => [...movieRecords].sort((a, b) => (
      (b.date || '').localeCompare(a.date || '')
      || Number(isFeishuRecord(b)) - Number(isFeishuRecord(a))
      || b.id.localeCompare(a.id)
    )).slice(0, 60).map(fromRecord),
    [movieDataVersion]
  );
  const feed = uniqueDataPackRecords('movies', [...userTickets, ...recent]);

  const countriesSeen = useMemo(() => new Set(movieRecords.map((m) => m.country).filter(Boolean)).size, [movieDataVersion]);
  const avg = useMemo(() => {
    const rs = movieRecords.map((m) => m.rating).filter((r): r is number => typeof r === 'number');
    return rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1) : '—';
  }, [movieDataVersion]);
  const onGlobe = feed.filter((ticket) => ticket.pinned).length;

  const showToast = (s: string) => { setToast(s); window.setTimeout(() => setToast(null), 2400); };

  const openTicket = (ticket: Ticket) => {
    if (ticket.pinned && Number.isFinite(ticket.lng) && Number.isFinite(ticket.lat)) {
      requestMapFocus(ticket.lng!, ticket.lat!, 7.8);
      return;
    }
    setSelected({ kind: 'movie', title: ticket.title, original: ticket.original, director: ticket.director, country: ticket.country, year: ticket.year, rating: ticket.rating, date: ticket.date, synopsis: ticket.synopsis });
  };

  // 跑电影 agent：一句话 / 截图 → 解析→本地库→云脑补全子agent→地理子agent→校验 → 出草稿卡
  const analyze = async (inp: Parameters<typeof runMovieAgent>[0]) => {
    if (analyzing) return;
    // 一次 FrostBus 运行 → RunTrace 把各阶段渲成实时编排树（可观测）
    const label = inp.kind === 'image' ? '截图认片' : inp.kind === 'manual' ? '手动记录' : `「${(inp.text || '').slice(0, 14)}」`;
    const run = startAgentRun(`记一部电影 · ${label}`); setRunId(run.runId);
    setAnalyzing(true); setDraft(null); setPhase('解析输入');
    try {
      const d = await runMovieAgent(inp, (p, detail) => { setPhase(p); run.phase(p, detail); });
      run.end(!!d);
      if (!d) { showToast('没认出片名，换种说法或手动记一下'); }
      else setDraft(d);
    } catch { run.end(false); showToast('解析出错了，稍后再试'); }
    finally { setAnalyzing(false); setPhase(''); }
  };

  const onSubmitText = () => { const t = input.trim(); if (t) analyze({ kind: 'text', text: t }); };

  // 截图认片：原图只进端侧 vision（不出手机）→ 同一条 agent 流水线
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) { return; }
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f);
      });
      await analyze({ kind: 'image', imageDataUrl: dataUrl });
    } catch { showToast('读图失败 · 可手动记一下'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  // 草稿卡上的微调：星级 / 落点国家（写偏好，下次同片沿用）
  const setStars = (n: number) => setDraft((d) => { if (!d) return d; recordRatingFix(d.id, n); return { ...d, tags: { ...d.tags, userRating: n } }; });
  const pickCountry = (c: string) => setDraft((d) => {
    if (!d) return d; const base = movieCountry(c); if (!base) return d;
    recordPlaceFix(d.id, { lng: base[0], lat: base[1], place: c });
    return { ...d, country: c, geo: { kind: 'country', place: c, lng: base[0], lat: base[1], confidence: 0.5 }, needPlace: false };
  });

  // 确认钉地球（suggest-then-confirm 的 confirm）
  const confirm = async () => {
    if (!draft) return;
    const res = await confirmPin(draft);
    showToast(res.reason === 'exists'
      ? `已经记录过《${draft.title}》，没有重复添加`
      : res.pinned ? `已钉到地球 · ${GEO_LABEL[draft.geo!.kind]}·${draft.geo!.place}` : '没坐标，先存进片库，补地点后可钉');
    setDraft(null); setInput('');
  };

  return (
    <div className={`${embedded ? 'min-h-full' : 'h-full overflow-y-auto overscroll-y-contain'} bg-[#EAEAEA] font-sans relative`}>
      {/* Header（嵌入双 tab 时隐藏，大头交给外层）*/}
      {!embedded && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
          <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
            <ChevronLeft className="w-4 h-4" strokeWidth={3} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-pixel text-[11px] tracking-wider truncate">MOVIES-SKILL</div>
            <div className="text-[9px] text-black/45 truncate">观影 Skill · {movieTotal} 部 · 票根钉地球</div>
          </div>
          <Film className="w-4 h-4" strokeWidth={2.5} style={{ color: AMBER }} />
        </div>
      )}

      {/* Stat strip */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-[#F5F2E9] shrink-0 text-[#A96500]">
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>已观影 {movieTotal}</span><span className="text-black/20">|</span>
          <span>国家 {countriesSeen}</span><span className="text-black/20">|</span>
          <span>均分 {avg}</span><span className="text-black/20">|</span>
          <span>上地球 {onGlobe}</span>
        </div>
        <div className="mt-2">
          <DataPackManager domain="movies" accent={AMBER} compactLabel="电影数据包" mapPlacementCount={movieMappedTotal} />
        </div>
      </div>

      {/* 记一笔：一句话 / 截图 → 电影 agent 自动补全成带标签的票根草稿 */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0 space-y-2">
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="「我看了《泳池情杀案》四星」/ 直接发截图…"
            onKeyDown={(e) => e.key === 'Enter' && onSubmitText()} disabled={analyzing}
            className="flex-1 min-w-0 border-2 border-black px-2 py-1.5 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white disabled:opacity-50" />
          <button onClick={() => fileRef.current?.click()} title="发电影截图（端侧认片）" disabled={analyzing}
            className="w-9 shrink-0 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-50">
            <Camera className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <button onClick={onSubmitText} disabled={analyzing || !input.trim()}
            className="shrink-0 flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-40" style={{ background: AMBER }}>
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={3} /> : '标记'}
          </button>
        </div>
        {runId && (
          <div className="mt-1"><RunTrace runId={runId} /></div>
        )}
        {!analyzing && !draft && (
          <div className="font-pixel text-[7px] text-black/35 leading-relaxed tracking-wide">
            说「看了 xx 几星」或发张截图 · Skill 自动补 导演/演员/类型/流派/剧情 + 取景地 → 你确认再钉
          </div>
        )}

        {/* 草稿卡：子 agent 产出的全标签票根（suggest，确认才钉） */}
        {draft && (
          <div className="border-2 border-black bg-[#FFFDF5] shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between px-2.5 py-1" style={{ background: AMBER }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">DRAFT · 待确认票根</span>
              <span className="font-pixel text-[7px] text-black/70">{draft.source.toUpperCase()} · {Math.round(draft.confidence * 100)}%</span>
            </div>
            <div className="px-2.5 py-2 space-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[14px] font-bold leading-tight">{draft.title}</span>
                {!!draft.year && <span className="text-[10px] text-black/45">{draft.year}</span>}
                {draft.douban != null && <span className="font-pixel text-[8px] text-black/55">豆瓣 {draft.douban.toFixed(1)}</span>}
              </div>
              {draft.original && draft.original !== draft.title && <div className="font-pixel text-[7px] text-black/40">{draft.original}</div>}
              {/* 多维标签：导演/演员/类型/流派 */}
              <div className="flex flex-wrap gap-1">
                {draft.tags.director && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">导演·{draft.tags.director}</span>}
                {draft.tags.genre && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">类型·{draft.tags.genre}</span>}
                {draft.tags.movement && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#fff0d6]">流派·{draft.tags.movement}</span>}
                {draft.tags.cast.slice(0, 3).map((c, i) => <span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">{c}</span>)}
              </div>
              {draft.tags.plot && <div className="text-[10px] text-black/60 leading-snug">{draft.tags.plot}</div>}
              {/* 我的评分（可改） */}
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[7px] text-black/45">我的评分</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setStars(n)} className="active:scale-90">
                      <Star className="w-3.5 h-3.5" strokeWidth={2} fill={n <= draft.tags.userRating ? AMBER : 'none'} style={{ color: AMBER }} />
                    </button>
                  ))}
                </div>
              </div>
              {/* 落点：取景地/故事地/国家，needPlace 时给国家兜底选择 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <MapPin className="w-3 h-3" strokeWidth={2.5} style={{ color: draft.geo ? GEO_COLOR[draft.geo.kind] : '#bbb' }} />
                {draft.geo ? (
                  <span className="font-pixel text-[7px] px-1.5 py-0.5 text-white" style={{ background: GEO_COLOR[draft.geo.kind] }}>
                    {GEO_LABEL[draft.geo.kind]} · {draft.geo.place}
                  </span>
                ) : (
                  <>
                    <span className="font-pixel text-[7px] text-[#d23b3b]">没定位到 · 选个国家兜底：</span>
                    <select onChange={(e) => e.target.value && pickCountry(e.target.value)} defaultValue=""
                      className="border border-black px-1 py-0.5 text-[10px] bg-white max-w-[100px]">
                      <option value="" disabled>国家…</option>
                      {movieCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </>
                )}
              </div>
              <div className="text-[8px] text-black/35 leading-snug">{draft.reason}</div>
              {/* 确认 / 取消 */}
              <div className="flex gap-2 pt-0.5">
                <button onClick={confirm} disabled={!draft.geo}
                  className="flex-1 flex items-center justify-center gap-1 border-2 border-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-40" style={{ background: AMBER }}>
                  <Check className="w-3.5 h-3.5" strokeWidth={3} /> {draft.geo ? '确认 · 钉到地球' : '先选国家再钉'}
                </button>
                <button onClick={() => { setDraft(null); setInput(''); }}
                  className="border-2 border-black bg-white px-2.5 py-1.5 text-[11px] active:translate-y-px">取消</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 票根流 */}
      <div className="px-3 py-3 space-y-2.5">
        {!feed.length && (
          <div className="border-2 border-black bg-white px-4 py-5 text-center shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="text-[12px] font-bold">示例片库已卸载</div>
            <div className="mt-1 text-[10px] leading-relaxed text-black/45">点击上方“加载示例库”，观影票根会重新出现；电影 Skill 仍然可以使用。</div>
          </div>
        )}
        {feed.map((t) => (
          <button key={t.key} onClick={() => openTicket(t)} className="w-full text-left border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] bg-white relative overflow-hidden active:translate-y-px">
            {/* 票根顶部 amber 条 */}
            <div className="flex items-center justify-between px-2.5 py-1" style={{ background: AMBER }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">ADMIT ONE · 观影票根{t.user ? ' · NEW' : ''}</span>
              <span className="text-[10px] tracking-tight text-black/80">{stars(t.rating)}</span>
            </div>
            <div className="flex">
              <div className="flex-1 min-w-0 px-2.5 py-2">
                <div className="text-[13px] font-bold leading-tight truncate">{t.title}</div>
                {t.original && t.original !== t.title && (
                  <div className="font-pixel text-[7px] text-black/40 truncate mt-0.5">{t.original}</div>
                )}
                <div className="text-[10px] text-black/55 mt-1 truncate">
                  {[t.director, t.country, t.year].filter(Boolean).join(' · ')}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="w-2 h-2" style={{ background: t.pinned ? AMBER : '#bbb' }} />
                  <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                    {t.pinned ? `已钉 ${t.country || '—'}` : '未落地球'}{t.date ? ` · ${t.date}` : ''}
                  </span>
                </div>
              </div>
              {/* 撕票虚线 + 票根评分区（上：类型；下：豆瓣评分）*/}
              <div className="w-12 shrink-0 border-l-2 border-dashed border-black/40 flex flex-col items-center justify-center py-2">
                <span className="font-pixel text-[6px] text-black/40">{t.type || '电影'}</span>
                <span className="font-pixel text-[14px] leading-none mt-1" style={{ color: '#000' }}>{t.douban != null ? t.douban.toFixed(1) : '··'}</span>
              </div>
            </div>
          </button>
        ))}
        <div className="text-center text-[8px] font-pixel text-black/30 py-1 tracking-widest">
          票根来自当前 Data Pack · Skill 管「认片」· 落点钉地球
        </div>
      </div>

      {/* toast */}
      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50 border-2 border-black bg-black text-[11px] px-3 py-1.5 shadow-[2px_2px_0_#000]" style={{ color: AMBER }}>
          {toast}
        </div>
      )}

      {/* 点票根 → 和地球点开同款的票根详情（含 100 字简介）*/}
      <AnimatePresence>
        {selected && <MarkerDetail data={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
