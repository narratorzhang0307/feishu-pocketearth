import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { loadTravelPlaceBrief, type TravelPlaceBrief as Brief } from '../lib/travel/placeBrief';

export default function TravelPlaceBrief({ city, place }: { city: string; place: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState('');

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (brief || loading) return;
    setLoading(true); setError('');
    try { setBrief(await loadTravelPlaceBrief(city, place)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '资料加载失败'); }
    finally { setLoading(false); }
  };

  return <>
    <button type="button" onClick={() => void toggle()} aria-expanded={open}
      className="ml-auto flex shrink-0 items-center gap-1 border border-black bg-white px-1.5 py-0.5 text-[8px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px">
      <BookOpen className="h-2.5 w-2.5" /> {loading ? '查资料…' : open ? '收起' : '详情'}
      {loading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : open ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
    </button>
    {open && <div className="mt-1.5 basis-full border border-[#78b9e8] bg-[#f7fbff] p-2 text-[10px] leading-relaxed shadow-[1px_1px_0_#78b9e8]">
      {loading && <div className="flex items-center gap-1.5 text-black/45"><Loader2 className="h-3 w-3 animate-spin" />联网核对三个独立机构的材料，再由端侧 Qwen 撰写特色介绍…</div>}
      {error && <div className="text-[#9b2c2c]">{error}</div>}
      {brief && <>
        <div className="mb-1 flex items-center gap-1.5 text-[8px] font-bold text-black/45">
          <span className="border border-black/30 bg-white px-1 py-0.5">{brief.method === 'qwen-grounded' ? `${brief.model === 'Qwen3-VL-2B-Instruct' ? 'QWEN 端侧' : 'QWEN 云端'} · 有据摘要` : 'SOURCE · 原文摘编'}</span>
          <span>{brief.sources.every((source) => source.discoveredBy === 'qwen-cloud') ? 'Qwen 联网搜索' : '多源检索'} · {brief.sources.length} 个独立来源</span>
        </div>
        {brief.generationError && <div className="mb-1.5 border-l-2 border-[#78b9e8] pl-1.5 text-black/50">{brief.generationError}</div>}
        {brief.text && <p className="whitespace-pre-line text-black/72">{brief.text}</p>}
        <div className="mt-2 border-t border-black/15 pt-1.5">
          <div className="mb-1 text-[8px] font-bold text-black/45">原始材料 · 可打开查证</div>
          {brief.sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"
            className="block break-words text-[9px] font-bold text-[#1769aa] underline underline-offset-2">
            [{index + 1}] {source.publisher}《{source.title}》 · 权重 {source.authorityWeight || 1}/3{source.revisionId ? ` · 修订 ${source.revisionId}` : ''} ↗
          </a>)}
          <div className="mt-1 text-[8px] text-black/35">检索于 {new Date(brief.retrievedAt).toLocaleDateString('zh-CN')} · {brief.method === 'qwen-grounded' ? `介绍由 ${brief.model} 仅据以上材料生成` : '逐字取自以上原始材料，未采用未通过校验的生成稿'}</div>
        </div>
      </>}
    </div>}
  </>;
}
