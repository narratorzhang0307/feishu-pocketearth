// 观展史时间线 —— 「哪天 · 去了哪馆 · 看了什么」的个人观展轴（按 visitDate 降序）。
// 与 CultureLayerTimeline（文物创作年代的文化层叠压）互补成两条轴；正文 11-12px 保证可读性
// （文化层 5px 像素字被诟病难读，这里刻意反着来）。
import { type ArtifactCardData } from './ArtifactCard';
import { groupVisits, visitSummary, UNKNOWN_VENUE } from '../lib/exhibition/visits';
import { matchVenue } from '../lib/exhibition/venues';
import { hasRenderableSplat } from '../lib/exhibition/splatState';

const TEAL = '#5A8F7B';
const BLUE = '#2F6FED';
const GOLD = '#C8A24B';

export default function VisitTimeline({ items, onPick }: { items: ArtifactCardData[]; onPick?: (item: ArtifactCardData) => void }) {
  if (!items.length) {
    return (
      <div className="border-2 border-dashed border-black/30 bg-white px-3 py-6 text-center">
        <div className="font-pixel text-[9px] text-black/40 tracking-wider">观展史还是空的</div>
        <div className="text-[11px] text-black/45 mt-1.5">记一笔展品，这里就会长出「哪天去了哪馆」的时间线</div>
      </div>
    );
  }
  const days = groupVisits(items);
  const sum = visitSummary(items);
  return (
    <div className="space-y-3">
      <div className="bg-black px-3 py-2 flex items-center gap-3 border-2 border-black shadow-[2px_2px_0_#000]">
        <span className="font-pixel text-[8px] tracking-widest" style={{ color: '#7CFF6B' }}>MY VISITS</span>
        <span className="text-[11px] text-white">{sum.days} 天 · {sum.venues} 馆 · {sum.items} 件</span>
      </div>
      {days.map((day) => (
        <div key={day.date}>
          <div className="flex items-center gap-2">
            <span className="font-pixel text-[9px] bg-black text-white px-1.5 py-1">{day.date}{day.weekday ? ` · ${day.weekday}` : ''}</span>
            <span className="text-[10px] text-black/40">{day.total} 件</span>
            <div className="flex-1 border-t-2 border-dashed border-black/20" />
          </div>
          <div className="mt-1.5 space-y-1.5 pl-2 border-l-[3px]" style={{ borderColor: TEAL }}>
            {day.venues.map((vg) => {
              const venue = vg.museum === UNKNOWN_VENUE ? null : matchVenue(vg.museum);
              return (
                <div key={vg.museum} className="border-2 border-black bg-[#FFFDF5] shadow-[2px_2px_0_#000]">
                  <div className="flex items-center gap-1.5 px-2 py-1 border-b border-black/20">
                    <span className="w-2 h-2 shrink-0" style={{ background: BLUE }} />
                    <span className="text-[12px] font-bold truncate">{vg.museum}</span>
                    {venue && (
                      <span className="font-pixel text-[6px] border border-black/40 px-1 py-0.5 shrink-0 bg-[#eef2fd]">
                        {venue.type === 'gallery' ? '美术馆' : '博物馆'}{venue.city ? `·${venue.city}` : ''}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-black/45 shrink-0">{vg.items.length} 件</span>
                  </div>
                  <div className="px-2 py-1.5 space-y-1">
                    {vg.items.map((it) => (
                      <button key={it.id} onClick={() => onPick?.(it)} className="w-full flex items-center gap-2 text-left active:translate-y-px">
                        {it.photos?.[0] ? (
                          <img src={it.photos[0]} className="w-9 h-9 object-cover border border-black shrink-0" alt="" />
                        ) : (
                          <div className="w-9 h-9 border border-black/30 bg-[#EAEAEA] flex items-center justify-center shrink-0">
                            <span className="font-pixel text-[8px] text-black/40">{(it.nameZh || '?').slice(0, 1)}</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] leading-tight truncate">
                            {it.nameZh}
                            {hasRenderableSplat(it) ? <span style={{ color: GOLD }}> ◆</span> : null}
                          </div>
                          <div className="text-[9px] text-black/40 truncate">{[it.exhibition, it.dynastyLabel, it.category].filter(Boolean).join(' · ')}</div>
                        </div>
                        {it.rating ? <span className="text-[10px] shrink-0" style={{ color: TEAL }}>{'★'.repeat(Math.max(0, Math.min(5, it.rating)))}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
