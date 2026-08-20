import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { timelineGroups, calendarMonths, magazineYears, hasPhotos, photoCredit, type CalendarMonth } from '../data/photos';
import type { PhotoChronicleData } from '../lib/photo';
import MagazineBook from './MagazineBook';

// 照片 tab —— 同一批照片以「时间 / 日历 / 杂志」三种方式分布。
// 数据全部来自解耦的 photos 数据源（换照片只换数据源，这里不动）。

const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const SEGMENTS = ['时间', '杂志', '日历'] as const;
const CALENDAR_LATEST_YEAR = 2026;
const CALENDAR_LATEST_MONTH = 8;
const CALENDAR_EARLIEST_YEAR = 2020;
const CALENDAR_EARLIEST_MONTH = 1;
type Segment = (typeof SEGMENTS)[number];
type Lightbox = { img: string; caption: string; sub?: string };

const padMonth = (value: number) => String(value).padStart(2, '0');
const calendarRange = (source: CalendarMonth[]): CalendarMonth[] => {
  const sourceByLabel = new Map(source.map((month) => [month.label, month]));
  const latest = CALENDAR_LATEST_YEAR * 12 + CALENDAR_LATEST_MONTH - 1;
  const earliest = CALENDAR_EARLIEST_YEAR * 12 + CALENDAR_EARLIEST_MONTH - 1;
  return Array.from({ length: latest - earliest + 1 }, (_, index) => {
    const serialMonth = latest - index;
    const year = Math.floor(serialMonth / 12);
    const month = serialMonth % 12 + 1;
    const label = `${year}.${padMonth(month)}`;
    return sourceByLabel.get(label) ?? { label, dim: new Date(year, month, 0).getDate(), days: {} };
  });
};

// OSS 图片加载失败时优雅降级：隐藏失败图，露出父级灰底占位
const onImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.opacity = '0'; };


interface PhotosChronicleProps {
  embedded?: boolean;
  segment?: Segment;
  showSegments?: boolean;
  data?: PhotoChronicleData;
  onOpenAsset?: (assetKey: string) => void;
}

export default function PhotosChronicle({ embedded = false, segment: controlledSegment, showSegments = true, data, onOpenAsset }: PhotosChronicleProps) {
  const sourceTimelineGroups = data?.timelineGroups ?? timelineGroups;
  const sourceCalendarMonths = data?.calendarMonths ?? calendarMonths;
  const allCalendarMonths = useMemo(() => calendarRange(sourceCalendarMonths), [sourceCalendarMonths]);
  const sourceMagazineYears = data?.magazineYears ?? magazineYears;
  const sourceHasPhotos = data?.hasPhotos ?? hasPhotos;
  const [localSegment, setLocalSegment] = useState<Segment>('杂志');
  const segment = controlledSegment ?? localSegment;
  const [lightbox, setLightbox] = useState<Lightbox | null>(null);
  const [openYear, setOpenYear] = useState<number | null>(null);
  const [magMode, setMagMode] = useState<'single' | 'mix'>('single');
  const [monthIdx, setMonthIdx] = useState(0);
  const month = allCalendarMonths[monthIdx];
  const [monthYear, monthNumber] = month.label.split('.').map(Number);
  const firstWeekday = new Date(monthYear, monthNumber - 1, 1).getDay();
  const monthCells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= month.dim ? day : null;
  });
  const moveMonth = (delta: number) => setMonthIdx((index) => Math.max(0, Math.min(allCalendarMonths.length - 1, index + delta)));
  const open = (assetKey: string | undefined, fallback: Lightbox) => {
    if (assetKey && onOpenAsset) onOpenAsset(assetKey);
    else setLightbox(fallback);
  };

  useEffect(() => {
    setMonthIdx((current) => Math.min(current, allCalendarMonths.length - 1));
    setOpenYear((current) => current != null && !sourceMagazineYears.some((issue) => issue.year === current) ? null : current);
  }, [allCalendarMonths.length, data, sourceMagazineYears]);

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans relative overflow-hidden">
      {/* 顶栏状态 */}
      {!embedded && <div className="flex justify-center items-center h-[30px] px-4 border-b-2 border-black bg-[#EAEAEA] shrink-0">
        <div className="font-pixel text-[10.4px] uppercase tracking-widest leading-none">POCKET EARTH</div>
      </div>}

      {/* 标题 */}
      {!embedded && <div className="px-4 py-4 border-b-2 border-black bg-white shrink-0">
        <h1 className="font-pixel text-xl uppercase tracking-wider mb-2">PHOTOS</h1>
        <p className="text-xs text-black/70 tracking-wide font-medium">
          按时间 / 杂志 / 日历整理你的照片<br />
          <span className="opacity-60 text-[9px] font-pixel block mt-1">Your moments, three ways.</span>
        </p>
      </div>}

      {/* 分段切换 */}
      {showSegments && <div className="px-4 py-3 border-b-2 border-black bg-white flex justify-center z-10 shrink-0">
        <div className="flex border-2 border-black bg-[#EAEAEA] p-1 w-full max-w-[280px]">
          {SEGMENTS.map((s) => (
            <button
              key={s}
              onClick={() => setLocalSegment(s)}
              className={`flex-1 py-1.5 text-[11px] font-bold text-center transition-all ${
                segment === s ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>}

      {/* 内容区 */}
      <div className={`min-h-0 flex-1 ${segment === '日历' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {!sourceHasPhotos ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-2 py-16">
            <div className="font-pixel text-[10px] text-black/40 tracking-widest uppercase">照片库为空</div>
            <div className="text-[11px] text-black/40 leading-relaxed">没有找到可显示的照片，请检查照片数据源。</div>
          </div>
        ) : (
          <>
            {/* —— 时间：日期分组的 Polaroid 堆 —— */}
            {segment === '时间' && (
              <div className="px-4 pt-4 pb-6 flex flex-col gap-7">
                {sourceTimelineGroups.map((g) => (
                  <div key={g.id}>
                    <div className="mb-2.5 flex items-baseline gap-2 pl-1">
                      <h2 className={`font-pixel text-[12px] ${g.special ? 'text-[#00aa55]' : 'text-black'}`}>{g.title}</h2>
                      {g.sub && <span className="text-[11px] text-black/45">· {g.sub}</span>}
                    </div>
                    <div className="flex flex-row items-end pl-1 overflow-x-auto pb-2">
                      {g.photos.map((p, idx) => (
                        <motion.button
                          key={p.id}
                          style={{ rotate: p.rot, marginLeft: idx === 0 ? 0 : -26 }}
                          whileHover={{ scale: 1.06, rotate: 0, y: -6, zIndex: 50 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => open(p.assetKey, { img: p.full, caption: p.cap })}
                          className="relative bg-white p-1.5 pb-4 border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] w-[92px] shrink-0 origin-bottom"
                        >
                          <div className="w-full aspect-square bg-[#d8d8d6] border border-black/30 overflow-hidden">
                            <img src={p.img} onError={onImgErr} alt={p.cap} className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all" />
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* —— 日历：月份网格（垂直居中于页面） —— */}
            {segment === '日历' && (
              <div data-photo-calendar={month.label} className="flex h-full min-h-0 items-center justify-center overflow-hidden px-4 py-2">
                <div className="w-full max-w-[380px]">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-pixel text-base tracking-wider">{month.label}</h2>
                  <div className="flex gap-1.5">
                    <button aria-label="上一个月" disabled={monthIdx === allCalendarMonths.length - 1} onClick={() => moveMonth(1)} className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-25 disabled:shadow-none">
                      <ChevronLeft className="w-3.5 h-3.5 text-black" strokeWidth={3} />
                    </button>
                    <button aria-label="下一个月" disabled={monthIdx === 0} onClick={() => moveMonth(-1)} className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-25 disabled:shadow-none">
                      <ChevronLeft className="w-3.5 h-3.5 text-black rotate-180" strokeWidth={3} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {WEEK.map((d) => (
                    <div key={d} className="text-center font-pixel text-[7px] text-black/45">{d}</div>
                  ))}
                </div>
                <div data-calendar-grid className="grid grid-cols-7 gap-1">
                  {monthCells.map((day, index) => {
                    if (day == null) return <div key={`blank-${index}`} aria-hidden="true" className="aspect-square" />;
                    const p = month.days[day];
                    if (p) {
                      return (
                        <button
                          key={day}
                          onClick={() => open(p.assetKey, { img: p.full, caption: `${month.label} · ${day}`, sub: `${p.count} 张 · LOC_SYNC` })}
                          className="aspect-square relative overflow-hidden border-2 border-black shadow-[1px_1px_0_#000] active:translate-y-px bg-[#d8d8d6]"
                        >
                          <img src={p.thumb} onError={onImgErr} alt={`${month.label} ${day}`} className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all" />
                          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />
                          <span className="absolute top-0.5 left-1 font-pixel text-[8px] text-[#7CFF6B] leading-none z-10">{day}</span>
                          {p.count > 1 && (
                            <div className="absolute top-0.5 right-0.5 bg-black border border-[#7CFF6B] px-1 z-10">
                              <span className="font-pixel text-[6px] text-[#7CFF6B] leading-none">{p.count}</span>
                            </div>
                          )}
                        </button>
                      );
                    }
                    return (
                      <div key={day} className="aspect-square relative border border-black/20 bg-[#E2E2E0]">
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-pixel text-[8px] text-black/35">{day}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 text-center font-pixel text-[8px] text-black/30 tracking-widest">
                  {Object.keys(month.days).length} DAYS LIT · {monthIdx + 1}/{allCalendarMonths.length}
                </div>
                </div>
              </div>
            )}

            {/* —— 杂志：年份相册书 → 翻开看那年照片 —— */}
            {segment === '杂志' && (
              openYear == null ? (
                <div className="h-full flex flex-col">
                  {/* 单页大图 / 瀑布混搭 切换（右上角）*/}
                  <div className="px-4 py-2 flex justify-between items-center shrink-0 border-b border-black/10">
                    <span className="font-pixel text-[10px] tracking-widest">MAGAZINE</span>
                    <button
                      onClick={() => setMagMode((m) => (m === 'single' ? 'mix' : 'single'))}
                      title="单页大图 / 瀑布混搭"
                      className="border-2 border-black px-2 py-1 hover:bg-[#7CFF6B] transition-colors active:translate-y-px"
                    >
                      <span className="font-pixel text-[12px] leading-none">{magMode === 'single' ? '▣' : '▦'}</span>
                    </button>
                  </div>

                  {magMode === 'single' ? (
                    /* 单页大图：一年一页，照片撑满整页（无文字，仅角落年份）*/
                    <div className="flex-1 overflow-y-auto snap-y snap-mandatory px-4 py-3 space-y-4">
                      {sourceMagazineYears.map((y, i) => (
                        <button
                          key={y.year}
                          onClick={() => setOpenYear(y.year)}
                          className="snap-center block w-full h-[72vh] min-h-[460px] max-h-[660px] relative border-2 border-black shadow-[6px_6px_0_#000] overflow-hidden bg-[#d8d8d6] active:translate-y-px text-left"
                        >
                          <img src={y.photos[0]?.full || y.cover} onError={onImgErr} alt={`${y.year} 年光阴志封面`} className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500" />
                          {/* 封面暗角，让杂志排版清晰 */}
                          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.8) 100%)' }} />
                          {/* 刊头 */}
                          <div className="absolute top-0 inset-x-0 px-4 pt-3 flex justify-between items-start">
                            <div>
                              <div className="font-pixel text-[15px] text-white tracking-wider drop-shadow-[1px_1px_0_#000] leading-none">POCKET EARTH</div>
                              <div className="font-pixel text-[7px] text-white/70 tracking-[0.3em] mt-1.5">光 阴 志 · 月 刊</div>
                            </div>
                            <div className="text-right">
                              <div className="font-pixel text-[6px] text-white/60 tracking-widest">ISSUE</div>
                              <div className="font-pixel text-[13px] text-[#7CFF6B] drop-shadow-[1px_1px_0_#000]">№{String(sourceMagazineYears.length - i).padStart(2, '0')}</div>
                            </div>
                          </div>
                          {/* 主视觉：大年份 + 本期专题 + 翻开 + 条码 */}
                          <div className="absolute bottom-0 inset-x-0 px-4 pb-4">
                            <div className="font-pixel text-[7px] text-white/75 tracking-wider mb-1.5 truncate">本期 · {y.photos.length} 帧 · {[...new Set(y.photos.map((p) => p.city).filter(Boolean))].slice(0, 3).join(' / ') || '环球'}</div>
                            <div className="flex items-end justify-between">
                              <span className="font-pixel text-[58px] leading-[0.8] text-white drop-shadow-[3px_3px_0_#000]">{y.year}</span>
                              <span className="font-pixel text-[9px] text-black bg-[#7CFF6B] border-2 border-black px-2 py-1 shadow-[2px_2px_0_#000] mb-1">翻开 ▶</span>
                            </div>
                            <div className="mt-2.5 flex items-center gap-2">
                              <div className="h-4 flex-1 max-w-[96px]" style={{ background: 'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 2px,#fff 2px 4px,transparent 4px 5px,#fff 5px 8px,transparent 8px 9px)' }} />
                              <span className="font-pixel text-[6px] text-white/55 tracking-widest">PE-{y.year}-光阴</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* 瀑布混搭：一年一刊，年份封面不同高度混排（黑白，触碰变彩色）*/
                    <div className="flex-1 overflow-y-auto px-3 py-3">
                      <div className="columns-2 gap-2">
                        {sourceMagazineYears.map((y, i) => (
                          <button
                            key={y.year}
                            onClick={() => setOpenYear(y.year)}
                            className="break-inside-avoid mb-2 block w-full relative border-2 border-black shadow-[3px_3px_0_#000] overflow-hidden bg-[#d8d8d6] active:translate-y-px"
                          >
                            <img src={y.cover} onError={onImgErr} alt={`${y.year} 年光阴志封面`} className="w-full object-cover grayscale hover:grayscale-0 transition-all" style={{ aspectRatio: ['3 / 4', '1 / 1', '4 / 5', '1 / 1', '3 / 4', '4 / 5'][i % 6] }} />
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 flex items-end justify-between">
                              <span className="font-pixel text-xl text-[#7CFF6B] drop-shadow-[1px_1px_0_#000]">{y.year}</span>
                              <span className="font-pixel text-[7px] text-white/80 mb-1">{y.photos.length} 张</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <MagazineBook
                  year={openYear}
                  photos={sourceMagazineYears.find((y) => y.year === openYear)?.photos || []}
                  onBack={() => setOpenYear(null)}
                  onOpen={(img, caption) => setLightbox({ img, caption })}
                  onOpenAsset={onOpenAsset}
                />
              )
            )}
          </>
        )}
      </div>

      {/* Lightbox（三视图共用） */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="w-[300px] bg-white border-[3px] border-black shadow-[6px_6px_0_#000] p-2 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setLightbox(null)}
                className="absolute -top-3 -right-3 w-7 h-7 bg-black border-2 border-[#7CFF6B] flex items-center justify-center z-10"
              >
                <X className="w-3.5 h-3.5 text-[#7CFF6B]" strokeWidth={3} />
              </button>
              <div className="w-full aspect-square bg-[#d8d8d6] border border-black overflow-hidden">
                <img src={lightbox.img} onError={onImgErr} alt={lightbox.caption} className="w-full h-full object-cover" />
              </div>
              <div className="py-2 text-center">
                <div className="font-pixel text-[9px] tracking-widest">{lightbox.caption}</div>
                {lightbox.sub && <div className="text-[10px] text-black/45 mt-0.5">{lightbox.sub}</div>}
                {(() => {
                  const c = photoCredit(lightbox.img);
                  return c?.author ? (
                    <div className="text-[10px] text-black/45 mt-0.5">
                      Photo by <a href={c.photoLink || c.authorLink} target="_blank" rel="noopener noreferrer" className="underline">{c.author}</a> on <a href="https://unsplash.com/?utm_source=pocket_earth&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline">Unsplash</a>
                    </div>
                  ) : null;
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
