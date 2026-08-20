// 批量观展一键整理面板 —— 「一堆照片丢进去，Qwen 替你整理成观展记录」。
// 流程：多选照片 → EXIF 时间/GPS 聚成「哪天·哪馆」观展组（batch.ts，纯端侧）→ 待选馆的组人工补选 →
// 逐张串行走 runExhibitionAgent 单件流水线（端侧 OCR 默认；云端识别需整批显式勾选——隐私闸门与单张同权）→
// 草稿按组陈列，可单件钉/整批钉。suggest-then-confirm：不确认不落地。
import { useRef, useState } from 'react';
import { Loader2, Check, X, ImagePlus, Cloud } from 'lucide-react';
import { runExhibitionAgent, confirmPin, allVenues, matchVenue, type ArtifactDraft } from '../lib/exhibition';
import { analyzeBatchPhotos, groupIntoVisits, assignVenue, type BatchVisit } from '../lib/exhibition/batch';

const TEAL = '#5A8F7B';
const BLUE = '#2F6FED';

const readDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });

// 送 OCR 前压到 1280px（够读展签小字，又不至于 base64 撑爆请求）；存进记录的缩略再压到 320px
async function downscale(dataUrl: string, maxSide: number, quality: number): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      if (scale >= 1) { res(dataUrl); return; }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { res(dataUrl); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      res(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

interface ItemResult {
  photoIndex: number;
  visitKey: string;
  status: 'pending' | 'running' | 'done' | 'pinned' | 'failed';
  draft?: ArtifactDraft;
  thumb?: string;
  error?: string;
}

export default function BatchOrganizePanel({ onClose, onPinned }: { onClose: () => void; onPinned?: (count: number, geo: { lng: number; lat: number } | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'pick' | 'grouped' | 'running' | 'done'>('pick');
  const [visits, setVisits] = useState<BatchVisit[]>([]);
  const [allowCloud, setAllowCloud] = useState(false);
  const [results, setResults] = useState<ItemResult[]>([]);
  const [progress, setProgress] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const cancelRef = useRef(false);

  const onPick = async (files: FileList | null) => {
    if (!files?.length) return;
    setAnalyzing(true);
    try {
      const photos = await analyzeBatchPhotos([...files].slice(0, 60));   // 上限 60 张：端侧串行 OCR 的现实吞吐
      setVisits(groupIntoVisits(photos));
      setPhase('grouped');
    } finally { setAnalyzing(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const totalPhotos = visits.reduce((n, v) => n + v.photos.length, 0);
  const pendingVenue = visits.filter((v) => !v.venueName).length;

  const run = async () => {
    setPhase('running');
    cancelRef.current = false;
    const rs: ItemResult[] = visits.flatMap((v) => v.photos.map((p) => ({ photoIndex: p.index, visitKey: v.key, status: 'pending' as const })));
    setResults([...rs]);
    let i = 0;
    for (const v of visits) {
      for (const p of v.photos) {
        if (cancelRef.current) { setPhase('done'); return; }
        i++;
        const r = rs.find((x) => x.photoIndex === p.index)!;
        r.status = 'running';
        setProgress(`第 ${i}/${totalPhotos} 张 · ${v.venueName || '未选馆'} ${p.time || ''}`);
        setResults([...rs]);
        try {
          const raw = await readDataUrl(p.file);
          const ocrUrl = await downscale(raw, 1280, 0.8);
          r.thumb = await downscale(raw, 320, 0.6);
          // 云端 OCR 偶发空返回：认字失败自动重试一次（间隔 900ms），别让整批里孤零零挂一张
          let draft = null;
          for (let attempt = 0; attempt < 2 && !draft; attempt++) {
            if (attempt) await new Promise((done) => setTimeout(done, 900));
            try { draft = await runExhibitionAgent({ kind: 'image', imageDataUrl: ocrUrl, allowCloud }); } catch { draft = null; }
            if (draft && !draft.nameZh && !draft.labels?.length) draft = null;   // OCR 空文本视同失败，进重试
          }
          if (!draft) { r.status = 'failed'; r.error = '识别失败'; setResults([...rs]); continue; }
          // 组的确定性信息优先于云端臆测：观展日期用 EXIF、场馆用 GPS 归馆/人工选馆
          if (p.date || v.date) draft.visitDate = p.date || v.date!;
          if (v.venueName) {
            const venue = matchVenue(v.venueName) || allVenues().find((x) => x.name === v.venueName) || null;
            if (venue) {
              draft.museum = venue.name;
              draft.geo = { kind: 'venue', place: venue.name, lng: venue.lng, lat: venue.lat, confidence: 0.95 };
              draft.needPlace = false;
            }
          }
          if (r.thumb) draft.photos = [...(draft.photos || []), r.thumb].slice(0, 6);
          r.draft = draft;
          r.status = 'done';
        } catch {
          r.status = 'failed'; r.error = '处理异常';
        }
        setResults([...rs]);
      }
    }
    setProgress('');
    setPhase('done');
  };

  const pinAll = async () => {
    let count = 0;
    let firstGeo: { lng: number; lat: number } | null = null;
    const rs = [...results];
    for (const r of rs) {
      if (r.status !== 'done' || !r.draft?.geo) continue;
      const res = await confirmPin(r.draft);
      if (res.pinned) {
        count++;
        r.status = 'pinned';
        if (!firstGeo) firstGeo = { lng: r.draft.geo.lng, lat: r.draft.geo.lat };
      }
    }
    setResults(rs);
    onPinned?.(count, firstGeo);
  };

  const pinOne = async (r: ItemResult) => {
    if (r.status !== 'done' || !r.draft?.geo) return;
    const res = await confirmPin(r.draft);
    if (res.pinned) { r.status = 'pinned'; setResults([...results]); onPinned?.(1, { lng: r.draft.geo.lng, lat: r.draft.geo.lat }); }
  };

  const doneCount = results.filter((r) => r.status === 'done').length;
  const pinnedCount = results.filter((r) => r.status === 'pinned').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  return (
    <div className="absolute inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:w-[360px] max-h-[86%] flex flex-col bg-[#EAEAEA] border-[3px] border-black shadow-[6px_6px_0_#000]" onClick={(e) => e.stopPropagation()}>
        {/* 头条 */}
        <div className="flex items-center justify-between px-3 py-2 bg-black shrink-0">
          <span className="font-pixel text-[9px] tracking-widest" style={{ color: '#7CFF6B' }}>⚡ 批量整理 · 一堆照片 → 观展记录</span>
          <button onClick={onClose} aria-label="关闭" className="w-6 h-6 border-2 border-[#7CFF6B] flex items-center justify-center">
            <X className="w-3 h-3 text-[#7CFF6B]" strokeWidth={3} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {/* ① 选照片 */}
          {phase === 'pick' && (
            <div className="space-y-2.5">
              <div className="text-[12px] text-black/70 leading-relaxed">
                把看展拍的<b>展签/展品照</b>一次多选进来：端侧读 EXIF 把它们按「哪天·哪馆」聚成观展组，再逐张认字、Qwen 补全、钉回展馆。原图不出设备。
              </div>
              <button onClick={() => fileRef.current?.click()} disabled={analyzing}
                className="w-full flex items-center justify-center gap-1.5 border-2 border-black py-2.5 text-[13px] font-bold text-white shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-50" style={{ background: BLUE }}>
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" strokeWidth={2.5} />}
                {analyzing ? '读取 EXIF 分组中…' : '选一批照片（≤60 张）'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onPick(e.target.files)} />
              <div className="text-[10px] text-black/45 leading-relaxed">
                📎 iOS 相册多选导出常剥 GPS：同一天只认出一个馆时，无定位的照片会自动跟随该馆；认不出的组可手动选馆。
              </div>
            </div>
          )}

          {/* ② 分组预览 + 选馆 + 开始 */}
          {phase !== 'pick' && (
            <>
              <div className="bg-black px-3 py-2 flex items-center gap-3 border-2 border-black">
                <span className="font-pixel text-[8px] tracking-widest" style={{ color: '#7CFF6B' }}>GROUPS</span>
                <span className="text-[11px] text-white">{totalPhotos} 张 → {visits.length} 组观展{pendingVenue ? ` · ${pendingVenue} 组待选馆` : ''}</span>
              </div>
              {visits.map((v) => {
                const groupResults = results.filter((r) => r.visitKey === v.key);
                return (
                  <div key={v.key} className="border-2 border-black bg-[#FFFDF5] shadow-[2px_2px_0_#000]">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-black/20 flex-wrap">
                      <span className="font-pixel text-[8px] bg-black text-white px-1.5 py-0.5">{v.date || '未记日期'}</span>
                      {v.venueName ? (
                        <span className="text-[12px] font-bold truncate">{v.venueName}</span>
                      ) : (
                        <select onChange={(e) => e.target.value && setVisits((vs) => assignVenue(vs, v.key, e.target.value))} defaultValue=""
                          disabled={phase !== 'grouped'}
                          className="border border-black px-1 py-0.5 text-[10px] bg-white max-w-[140px]">
                          <option value="" disabled>选场馆…</option>
                          {allVenues().map((s) => <option key={s.id} value={s.name}>{s.custom ? '⌂ ' : ''}{s.name}</option>)}
                        </select>
                      )}
                      <span className="ml-auto text-[10px] text-black/45 shrink-0">{v.photos.length} 张</span>
                    </div>
                    {/* 运行前：缩略行；运行后：逐张结果行 */}
                    {phase === 'grouped' ? (
                      <div className="px-2 py-1.5 text-[10px] text-black/50">
                        {v.photos.map((p) => p.time).filter(Boolean).slice(0, 6).join(' · ') || '无拍摄时间'}
                        {!v.venueName && <span className="text-[#d23b3b]"> · 不选馆则这组只存档不钉</span>}
                      </div>
                    ) : (
                      <div className="px-2 py-1.5 space-y-1">
                        {groupResults.map((r) => (
                          <div key={r.photoIndex} className="flex items-center gap-2">
                            {r.thumb
                              ? <img src={r.thumb} className="w-8 h-8 object-cover border border-black shrink-0" alt="" />
                              : <div className="w-8 h-8 border border-black/30 bg-[#EAEAEA] shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] leading-tight truncate">
                                {r.status === 'running' && <span className="text-black/50">识别中…</span>}
                                {r.status === 'pending' && <span className="text-black/35">排队</span>}
                                {r.status === 'failed' && <span className="text-[#d23b3b]">✕ {r.error || '失败'}</span>}
                                {(r.status === 'done' || r.status === 'pinned') && (r.draft?.nameZh || '未命名展品')}
                              </div>
                              {(r.status === 'done' || r.status === 'pinned') && (
                                <div className="text-[9px] text-black/40 truncate">{[r.draft?.tags.dynastyLabel, r.draft?.tags.category].filter(Boolean).join(' · ')}</div>
                              )}
                            </div>
                            {r.status === 'done' && r.draft?.geo && (
                              <button onClick={() => void pinOne(r)} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white active:translate-y-px shrink-0">钉</button>
                            )}
                            {r.status === 'pinned' && <span className="font-pixel text-[7px] shrink-0" style={{ color: TEAL }}>✔ 已钉</span>}
                            {r.status === 'running' && <Loader2 className="w-3 h-3 animate-spin shrink-0 text-black/40" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {phase === 'grouped' && (
                <>
                  <label className="flex items-start gap-2 border-2 border-black bg-white px-2.5 py-2 cursor-pointer">
                    <input type="checkbox" checked={allowCloud} onChange={(e) => setAllowCloud(e.target.checked)} className="mt-0.5" />
                    <span className="text-[11px] leading-snug text-black/70">
                      <Cloud className="w-3 h-3 inline-block mr-0.5" style={{ color: '#C8A24B' }} />
                      整批允许云端识别：端侧读不出的展签送 Qwen 视觉兜底（只送展签这类公开说明牌；不勾则全程端侧）
                    </span>
                  </label>
                  <button onClick={() => void run()}
                    className="w-full flex items-center justify-center gap-1.5 border-2 border-black py-2.5 text-[13px] font-bold text-white shadow-[2px_2px_0_#000] active:translate-y-px" style={{ background: TEAL }}>
                    <Check className="w-4 h-4" strokeWidth={3} /> 开始整理 {totalPhotos} 张
                  </button>
                </>
              )}

              {phase === 'running' && (
                <div className="flex items-center gap-2 border-2 border-black bg-black px-3 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#7CFF6B' }} />
                  <span className="font-pixel text-[8px] text-white tracking-wider flex-1 truncate">{progress}</span>
                  <button onClick={() => { cancelRef.current = true; }} className="font-pixel text-[7px] border border-white/60 text-white px-1.5 py-0.5">停</button>
                </div>
              )}

              {phase === 'done' && (
                <div className="space-y-2">
                  <div className="border-2 border-black bg-white px-3 py-2 text-[12px]">
                    整理完成：<b>{doneCount + pinnedCount}</b> 件识别成功{failedCount ? `，${failedCount} 张失败（可重选单拍）` : ''}{pinnedCount ? `，已钉 ${pinnedCount} 件` : ''}
                  </div>
                  {doneCount > 0 && (
                    <button onClick={() => void pinAll()}
                      className="w-full flex items-center justify-center gap-1.5 border-2 border-black py-2.5 text-[13px] font-bold text-white shadow-[2px_2px_0_#000] active:translate-y-px" style={{ background: TEAL }}>
                      <Check className="w-4 h-4" strokeWidth={3} /> 全部钉上地球（{doneCount} 件）
                    </button>
                  )}
                  <button onClick={onClose} className="w-full border-2 border-black bg-white py-2 text-[12px] active:translate-y-px">完成</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
