import { useMemo, useReducer, useRef, useState, useEffect } from 'react';
import { ChevronLeft, BookOpen, Camera, Star, MapPin, Loader2, Check, NotebookPen, X, Quote } from 'lucide-react';
import { bookDataVersion, bookRecords, bookTotal, bookMappedTotal, bookMapPoint, recentBookRecords, BOOK_PLACES, bookPlace, ensureBookData, subscribeBookData, type BookRecord } from '../data/books';
import { getUserMarksByKind, subscribeUserMarks } from '../data/userMarks';
import { requestMapFocus } from '../data/mapFocus';
import { runBookAgent, confirmPin, recordRatingFix, recordPlaceFix, GEO_LABEL, GEO_COLOR, type BookDraft, type BookPhase,
  structureNotes, getNotes, addNote, removeNote, subscribeNotes, type StructuredNote } from '../lib/book';
import { AnimatePresence } from 'motion/react';
import MarkerDetail, { type MarkerDetailData } from './MarkerDetail';
import RunTrace from './RunTrace';
import { startAgentRun } from '../lib/observe/bus';
import DataPackManager from './DataPackManager';
import { uniqueDataPackRecords } from '../lib/dataPack';

// books-agent 运行页 —— 读书 agent。
// 1) 把豆瓣阅读记录做成「藏书票 EX LIBRIS」流；2) 用户记一本/截图认书 → 钉到「作者 / 故事之地」，与地球联动。
// 藏书票卡片显示一句话，点开 = 与地球点书点同款的紫色简介详情（≤100 字）。
// 和 obsidian 的区别：不是书目笔记，而是「书 → 地理 → 地球落点」；端侧模型从书封/书页截图认书。

interface Props { onBack: () => void; embedded?: boolean }
const VIOLET = '#b388ff';

interface Plate {
  key: string; title: string; author: string; place: string;
  year?: number | null; rating?: number | null; note?: string; synopsis?: string; date?: string; pinned?: boolean; user?: boolean;
  lng?: number; lat?: number;
}

const stars = (r?: number | null) => {
  const n = Math.max(0, Math.min(5, r || 0));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
};
// 卡片上的「一句话」：优先用户短评，否则取简介首句 / 截断
const oneLine = (p: Plate) => {
  if (p.note) return p.note;
  const s = (p.synopsis || '').trim();
  if (!s) return '';
  const head = s.split(/[。！？.!?]/)[0];
  const t = head && head.length <= 38 ? head : s.slice(0, 38);
  return t.length < s.length ? t + '…' : t;
};

function fromRecord(b: BookRecord): Plate {
  const point = bookMapPoint(b);
  return { key: 'bk' + b.id, title: b.title, author: b.author, place: b.country,
    year: b.year, rating: b.rating, synopsis: b.synopsis, date: b.date, pinned: !!point, lng: point?.lng, lat: point?.lat };
}

export default function BooksRunPage({ onBack, embedded }: Props) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeUserMarks(force), []);
  useEffect(() => subscribeNotes(force), []);
  useEffect(() => {
    const unsubscribe = subscribeBookData(force);
    void ensureBookData().catch(() => {});
    return unsubscribe;
  }, []);

  const [mode, setMode] = useState<'mark' | 'note'>('mark');   // 标记书 / 整理笔记
  const [input, setInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [, setPhase] = useState<BookPhase | ''>('');
  const [runId, setRunId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BookDraft | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const noteFileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<MarkerDetailData | null>(null);
  // 读书笔记结构化
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState<StructuredNote | null>(null);
  const savedNotes = getNotes();

  const userPlates: Plate[] = getUserMarksByKind('book').map((m) => {
    const meta = (m.meta || {}) as Record<string, unknown>;
    return { key: m.id, title: m.label || String(meta.title || ''), author: String(meta.author || ''),
      place: String(meta.place || ''), year: meta.year as number, rating: meta.rating as number,
      note: String(meta.note || ''), synopsis: String(meta.synopsis || ''), date: String(meta.date || ''), pinned: true, user: true, lng: m.lng, lat: m.lat };
  });

  // 按读完日期倒序；同一天以飞书新写入的记录优先，避免新确认藏书票被挤到 60 条之外。
  const recent: Plate[] = useMemo(
    () => recentBookRecords(bookRecords, 60).map(fromRecord),
    [bookDataVersion]
  );
  const feed = uniqueDataPackRecords('books', [...userPlates, ...recent]);

  const countriesSeen = useMemo(() => new Set(bookRecords.map((b) => b.country).filter(Boolean)).size, [bookDataVersion]);
  const onGlobe = feed.filter((plate) => plate.pinned).length;

  const showToast = (s: string) => { setToast(s); window.setTimeout(() => setToast(null), 2400); };

  const openPlate = (p: Plate) => {
    if (p.pinned && Number.isFinite(p.lng) && Number.isFinite(p.lat)) {
      requestMapFocus(p.lng!, p.lat!, 7.8);
      return;
    }
    setSelected({ kind: 'book', title: p.title, author: p.author, place: p.place,
      year: p.year, rating: p.rating, synopsis: p.synopsis, date: p.date, note: p.note });
  };

  // 跑读书 agent：一句话 / 书封截图 → 解析→本地库→云脑补全子agent→地理子agent→校验 → 草稿藏书票
  const analyze = async (inp: Parameters<typeof runBookAgent>[0]) => {
    if (analyzing) return;
    const label = inp.kind === 'image' ? '书封认书' : inp.kind === 'manual' ? '手动记录' : `「${(inp.text || '').slice(0, 14)}」`;
    const run = startAgentRun(`记一本书 · ${label}`); setRunId(run.runId);
    setAnalyzing(true); setDraft(null); setPhase('解析输入');
    try {
      const d = await runBookAgent(inp, (p, detail) => { setPhase(p); run.phase(p, detail); });
      run.end(!!d);
      if (!d) showToast('没认出书名，换种说法或手动记一下');
      else setDraft(d);
    } catch { run.end(false); showToast('解析出错了，稍后再试'); }
    finally { setAnalyzing(false); setPhase(''); }
  };

  const onSubmitText = () => { const t = input.trim(); if (t) analyze({ kind: 'text', text: t }); };

  // 书封认书：原图只进端侧 vision（不出手机）→ 同一条 agent 流水线
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f);
      });
      await analyze({ kind: 'image', imageDataUrl: dataUrl });
    } catch { showToast('读图失败 · 可手动记一下'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  const setStars = (n: number) => setDraft((d) => { if (!d) return d; recordRatingFix(d.id, n); return { ...d, tags: { ...d.tags, userRating: n } }; });
  const pickPlace = (name: string) => setDraft((d) => {
    if (!d) return d; const p = bookPlace(name); if (!p) return d;
    recordPlaceFix(d.id, { lng: p.lng, lat: p.lat, place: p.name });
    return { ...d, geo: { kind: 'story', place: p.name, lng: p.lng, lat: p.lat, confidence: 0.6 }, needPlace: false };
  });

  const confirm = async () => {
    if (!draft) return;
    const res = await confirmPin(draft);
    showToast(res.reason === 'exists'
      ? `已经记录过《${draft.title}》，没有重复添加`
      : res.pinned ? `已钉到地球 · ${GEO_LABEL[draft.geo!.kind]}·${draft.geo!.place}` : '没坐标，先存进书库，补地点后可钉');
    setDraft(null); setInput('');
  };

  // —— 读书笔记结构化子 agent —— 不管输入什么，整理成结构化笔记（草稿，确认才保存）
  const runNotes = async (inp: Parameters<typeof structureNotes>[0]) => {
    if (noteBusy) return;
    setNoteBusy(true); setNoteDraft(null);
    try {
      const n = await structureNotes(inp);
      if (!n) showToast('没读到内容，粘点文字或换张清楚的图');
      else setNoteDraft(n);
    } catch { showToast('整理出错了，稍后再试'); }
    finally { setNoteBusy(false); }
  };
  const onSubmitNote = () => { const t = noteText.trim(); if (t) runNotes({ kind: 'text', text: t }); };
  const onNoteFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
      await runNotes({ kind: 'image', imageDataUrl: dataUrl });
    } catch { showToast('读图失败 · 可粘文字'); }
    finally { if (noteFileRef.current) noteFileRef.current.value = ''; }
  };
  const saveNote = () => { if (!noteDraft) return; addNote(noteDraft); setNoteDraft(null); setNoteText(''); showToast('笔记已存'); };

  return (
    <div className={`${embedded ? 'min-h-full' : 'h-full overflow-y-auto overscroll-y-contain'} bg-[#EAEAEA] font-sans relative`}>
      {/* Header（嵌入双 tab 时隐藏，大头交给外层）*/}
      {!embedded && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
          <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
            <ChevronLeft className="w-4 h-4" strokeWidth={3} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-pixel text-[11px] tracking-wider truncate">BOOKS-SKILL</div>
            <div className="text-[9px] text-black/45 truncate">读书 Skill · {bookTotal} 本 · 藏书票钉地球</div>
          </div>
          <BookOpen className="w-4 h-4" strokeWidth={2.5} style={{ color: VIOLET }} />
        </div>
      )}

      {/* Stat strip */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-[#F5F2E9] shrink-0 text-[#7A45C7]">
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>读过 {bookTotal}</span><span className="text-black/20">|</span>
          <span>国家 {countriesSeen}</span><span className="text-black/20">|</span>
          <span>上地球 {onGlobe}</span>
        </div>
        <div className="mt-2">
          <DataPackManager domain="books" accent={VIOLET} compactLabel="书籍数据包" mapPlacementCount={bookMappedTotal} />
        </div>
      </div>

      {/* 记一本 / 整理笔记 —— 模式切换 */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0 space-y-2">
        <div className="flex border-2 border-black bg-[#EAEAEA] p-0.5">
          <button onClick={() => setMode('mark')} className={`flex-1 py-1 text-[11px] font-bold ${mode === 'mark' ? 'bg-black text-[#c9a8ff]' : 'text-black hover:bg-black/5'}`}>标记书</button>
          <button onClick={() => setMode('note')} className={`flex-1 py-1 text-[11px] font-bold flex items-center justify-center gap-1 ${mode === 'note' ? 'bg-black text-[#c9a8ff]' : 'text-black hover:bg-black/5'}`}><NotebookPen className="w-3 h-3" strokeWidth={2.5} />整理笔记</button>
        </div>

        {mode === 'mark' && (<>
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="「我读了《百年孤独》五星」/ 发书封截图…"
            onKeyDown={(e) => e.key === 'Enter' && onSubmitText()} disabled={analyzing}
            className="flex-1 min-w-0 border-2 border-black px-2 py-1.5 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white disabled:opacity-50" />
          <button onClick={() => fileRef.current?.click()} title="发书封截图（端侧认书）" disabled={analyzing}
            className="w-9 shrink-0 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-50">
            <Camera className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <button onClick={onSubmitText} disabled={analyzing || !input.trim()}
            className="shrink-0 flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-40" style={{ background: VIOLET }}>
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={3} /> : '标记'}
          </button>
        </div>
        {runId && (
          <div className="mt-1"><RunTrace runId={runId} /></div>
        )}
        {!analyzing && !draft && (
          <div className="font-pixel text-[7px] text-black/35 leading-relaxed tracking-wide">
            说「读了 xx 几星」或发张书封 · Skill 自动补 作者/译者/类型/流派/剧情 + 故事地 → 你确认再钉
          </div>
        )}

        {/* 草稿藏书票：子 agent 产出的全标签（suggest，确认才钉） */}
        {draft && (
          <div className="border-2 border-black bg-[#FAF7FF] shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between px-2.5 py-1 border-b-2" style={{ borderColor: VIOLET }}>
              <span className="font-pixel text-[7px] tracking-widest" style={{ color: '#7a4dd6' }}>DRAFT · 待确认藏书票</span>
              <span className="font-pixel text-[7px] text-black/55">{draft.source.toUpperCase()} · {Math.round(draft.confidence * 100)}%</span>
            </div>
            <div className="px-2.5 py-2 space-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[14px] font-bold leading-tight">{draft.title}</span>
                {!!draft.year && <span className="text-[10px] text-black/45">{draft.year}</span>}
              </div>
              <div className="flex flex-wrap gap-1">
                {draft.tags.author && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EFE9FA]">作者·{draft.tags.author}</span>}
                {draft.tags.translator && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EFE9FA]">译·{draft.tags.translator}</span>}
                {draft.tags.genre && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">类型·{draft.tags.genre}</span>}
                {draft.tags.movement && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#f3ecff]">流派·{draft.tags.movement}</span>}
              </div>
              {draft.tags.plot && <div className="text-[11px] text-black/65 leading-snug italic">「{draft.tags.plot}」</div>}
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[7px] text-black/45">我的评分</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setStars(n)} className="active:scale-90">
                      <Star className="w-3.5 h-3.5" strokeWidth={2} fill={n <= draft.tags.userRating ? VIOLET : 'none'} style={{ color: VIOLET }} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <MapPin className="w-3 h-3" strokeWidth={2.5} style={{ color: draft.geo ? GEO_COLOR[draft.geo.kind] : '#bbb' }} />
                {draft.geo ? (
                  <span className="font-pixel text-[7px] px-1.5 py-0.5 text-white" style={{ background: GEO_COLOR[draft.geo.kind] }}>
                    {GEO_LABEL[draft.geo.kind]} · {draft.geo.place}
                  </span>
                ) : (
                  <>
                    <span className="font-pixel text-[7px] text-[#d23b3b]">没定位到 · 选个地点兜底：</span>
                    <select onChange={(e) => e.target.value && pickPlace(e.target.value)} defaultValue=""
                      className="border border-black px-1 py-0.5 text-[10px] bg-white max-w-[110px]">
                      <option value="" disabled>地点…</option>
                      {BOOK_PLACES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </select>
                  </>
                )}
              </div>
              <div className="text-[8px] text-black/35 leading-snug">{draft.reason}</div>
              <div className="flex gap-2 pt-0.5">
                <button onClick={confirm} disabled={!draft.geo}
                  className="flex-1 flex items-center justify-center gap-1 border-2 border-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-40" style={{ background: VIOLET }}>
                  <Check className="w-3.5 h-3.5" strokeWidth={3} /> {draft.geo ? '确认 · 钉到地球' : '先选地点再钉'}
                </button>
                <button onClick={() => { setDraft(null); setInput(''); }}
                  className="border-2 border-black bg-white px-2.5 py-1.5 text-[11px] active:translate-y-px">取消</button>
              </div>
            </div>
          </div>
        )}
        </>)}

        {/* 整理笔记：丢任意零散文字/书页截图 → 子 agent 整理成结构化笔记 */}
        {mode === 'note' && (<>
          <div className="flex gap-2 items-stretch">
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} disabled={noteBusy}
              placeholder="把读书时的零散文字、摘抄、感想…随便丢进来，笔记 Skill 帮你理成结构化笔记"
              className="flex-1 min-w-0 border-2 border-black px-2 py-1.5 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white resize-none disabled:opacity-50" />
            <div className="flex flex-col gap-1.5 shrink-0">
              <button onClick={() => noteFileRef.current?.click()} title="书页/手写截图整理（端侧认字）" disabled={noteBusy}
                className="w-9 flex-1 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-50">
                <Camera className="w-4 h-4" strokeWidth={2.5} />
              </button>
              <input ref={noteFileRef} type="file" accept="image/*" className="hidden" onChange={onNoteFile} />
              <button onClick={onSubmitNote} disabled={noteBusy || !noteText.trim()}
                className="w-9 flex-1 border-2 border-black flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-40" style={{ background: VIOLET }}>
                {noteBusy ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={3} /> : <Check className="w-4 h-4" strokeWidth={3} />}
              </button>
            </div>
          </div>
          {noteBusy && <div className="text-[10px] text-black/55 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" strokeWidth={2.5} />笔记 Skill 整理中…（认字 → 结构化）</div>}
          {!noteBusy && !noteDraft && <div className="font-pixel text-[7px] text-black/35 leading-relaxed tracking-wide">无论多零散 · 自动分出 金句摘抄 / 感想 / 主题 / 人物 / 关联 / 小结，确认后存进笔记本</div>}

          {/* 笔记草稿卡 */}
          {noteDraft && (
            <div className="border-2 border-black bg-[#FAF7FF] shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
              <div className="flex items-center justify-between px-2.5 py-1 border-b-2" style={{ borderColor: VIOLET }}>
                <span className="font-pixel text-[7px] tracking-widest" style={{ color: '#7a4dd6' }}>NOTE · 待存笔记{noteDraft.bookTitle ? ` · 《${noteDraft.bookTitle}》` : ''}</span>
                <span className="font-pixel text-[7px] text-black/45">{noteDraft.source === 'image' ? '截图' : '文字'}</span>
              </div>
              <div className="px-2.5 py-2 space-y-1.5">
                {!!noteDraft.themes.length && <div className="flex flex-wrap gap-1">{noteDraft.themes.map((t, i) => <span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#f3ecff]">主题·{t}</span>)}</div>}
                {!!noteDraft.quotes.length && (
                  <div className="space-y-1">
                    {noteDraft.quotes.map((q, i) => <div key={i} className="flex gap-1 text-[11px] text-black/75 leading-snug"><Quote className="w-3 h-3 shrink-0 mt-0.5" style={{ color: VIOLET }} strokeWidth={2.5} /><span className="italic">{q}</span></div>)}
                  </div>
                )}
                {!!noteDraft.insights.length && (
                  <div className="space-y-0.5">
                    {noteDraft.insights.map((s, i) => <div key={i} className="text-[11px] text-black/65 leading-snug">· {s}</div>)}
                  </div>
                )}
                {(!!noteDraft.characters.length || !!noteDraft.links.length) && (
                  <div className="flex flex-wrap gap-1">
                    {noteDraft.characters.map((c, i) => <span key={'c' + i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EFE9FA]">人物·{c}</span>)}
                    {noteDraft.links.map((l, i) => <span key={'l' + i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">关联·{l}</span>)}
                  </div>
                )}
                {noteDraft.summary && <div className="text-[10px] text-black/55 leading-snug border-t border-black/10 pt-1">小结 · {noteDraft.summary}</div>}
                <div className="flex gap-2 pt-0.5">
                  <button onClick={saveNote} className="flex-1 flex items-center justify-center gap-1 border-2 border-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black" style={{ background: VIOLET }}>
                    <Check className="w-3.5 h-3.5" strokeWidth={3} /> 存进笔记本
                  </button>
                  <button onClick={() => setNoteDraft(null)} className="border-2 border-black bg-white px-2.5 py-1.5 text-[11px] active:translate-y-px">重整</button>
                </div>
              </div>
            </div>
          )}

          {/* 已存笔记列表 */}
          {!!savedNotes.length && (
            <div className="space-y-1.5 pt-0.5">
              <div className="font-pixel text-[7px] text-black/40 tracking-widest">我的笔记 · {savedNotes.length}</div>
              {savedNotes.slice(0, 8).map((n) => (
                <div key={n.id} className="border-2 border-black bg-white px-2 py-1.5 relative">
                  <button onClick={() => removeNote(n.id)} className="absolute top-1 right-1 w-4 h-4 bg-black text-white flex items-center justify-center"><X className="w-2.5 h-2.5" strokeWidth={3} /></button>
                  <div className="font-pixel text-[7px] tracking-wider" style={{ color: '#7a4dd6' }}>{n.bookTitle ? `《${n.bookTitle}》` : '随手笔记'} · {n.quotes.length}摘 {n.insights.length}想</div>
                  <div className="text-[11px] text-black/70 leading-snug mt-0.5 line-clamp-2">{n.summary || n.quotes[0] || n.insights[0] || n.raw.slice(0, 50)}</div>
                </div>
              ))}
            </div>
          )}
        </>)}
      </div>

      {/* 藏书票流（点开 = 紫色 100 字简介，与地球点书点同款）*/}
      <div className="px-3 py-3 space-y-2.5">
        {!feed.length && (
          <div className="border-2 border-black bg-white px-4 py-5 text-center shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="text-[12px] font-bold">示例书库已卸载</div>
            <div className="mt-1 text-[10px] leading-relaxed text-black/45">点击上方“加载示例库”，藏书票会重新出现；读书 Skill 仍然可以使用。</div>
          </div>
        )}
        {feed.map((p) => {
          const line = oneLine(p);
          return (
            <button key={p.key} onClick={() => openPlate(p)} title={p.pinned ? '回到地球并定位这条知识' : '查看藏书票详情'} className="w-full text-left border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] bg-white active:translate-y-px">
              {/* EX LIBRIS 顶条 */}
              <div className="flex items-center justify-between px-2.5 py-1 border-b-2" style={{ borderColor: VIOLET }}>
                <span className="font-pixel text-[7px] tracking-widest" style={{ color: '#7a4dd6' }}>EX LIBRIS · 藏书票{p.user ? ' · NEW' : ''}</span>
                <span className="text-[10px] tracking-tight" style={{ color: '#7a4dd6' }}>{p.rating ? stars(p.rating) : ''}</span>
              </div>
              <div className="px-2.5 py-2">
                <div className="flex items-baseline gap-2">
                  <div className="text-[14px] font-bold leading-tight truncate">{p.title}</div>
                  {p.year && <span className="font-pixel text-[7px] text-black/35 shrink-0">{p.year}</span>}
                </div>
                <div className="text-[10px] text-black/55 mt-0.5 truncate">{[p.author, p.place].filter(Boolean).join(' · ')}</div>
                {line && <div className="text-[11px] text-black/70 mt-1.5 leading-snug italic line-clamp-2">「{line}」</div>}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="w-2 h-2" style={{ background: p.pinned ? VIOLET : '#bbb' }} />
                  <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                    {p.pinned ? `已钉 ${p.place || '故事之地'}` : '未落地球'}{p.date ? ` · 读于 ${p.date}` : ''}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
        <div className="text-center text-[8px] font-pixel text-black/30 py-1 tracking-widest">
          藏书票来自当前 Data Pack · Skill 管「认书」· 落点钉地球
        </div>
      </div>

      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50 border-2 border-black bg-black text-[11px] px-3 py-1.5 shadow-[2px_2px_0_#000]" style={{ color: VIOLET }}>
          {toast}
        </div>
      )}

      {/* 点藏书票 → 和地球点书点同款的紫色简介详情（≤100 字）*/}
      <AnimatePresence>
        {selected && <MarkerDetail data={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
