import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { MagazinePhoto } from '../data/photos';

// 杂志手帐 · 双页摊开 + 翻书。点进某一年的杂志后，照片像贴在手帐对开页上（拍立得 + 胶带 + 手写日期），
// 一个对开页放最多 4 张，左右箭头一页页翻。黑白，触碰 / hover 变彩色，点开看大图。

interface Props {
  year: number;
  photos: MagazinePhoto[];
  onBack: () => void;
  onOpen: (img: string, caption: string) => void;
  onOpenAsset?: (assetKey: string) => void;
}

const onImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.opacity = '0'; };
// 一个对开页里 4 张照片的散落位置（百分比 + 旋转），像随手贴的
const SLOTS = [
  { left: '5%', top: '4%', rot: -5 },
  { left: '52%', top: '8%', rot: 4 },
  { left: '9%', top: '50%', rot: 3 },
  { left: '49%', top: '53%', rot: -4 },
];
const TAPE = ['#e9d8a6cc', '#cde7f0cc', '#f0cdd8cc', '#d4f0cdcc'];

export default function MagazineBook({ year, photos, onBack, onOpen, onOpenAsset }: Props) {
  const spreads: MagazinePhoto[][] = [];
  for (let i = 0; i < photos.length; i += 4) spreads.push(photos.slice(i, i + 4));
  const total = Math.max(1, spreads.length);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const go = (d: number) => { const n = idx + d; if (n < 0 || n >= total) return; setDir(d); setIdx(n); };
  const cur = spreads[idx] || [];

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA]">
      {/* 头：返回 + 刊名 + 页码 */}
      <div className="px-4 py-2 flex items-center gap-2 shrink-0 border-b border-black/10">
        <button onClick={onBack} className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={3} />
        </button>
        <div className="font-pixel text-[11px] tracking-wider">{year} · 手帐</div>
        <span className="ml-auto font-pixel text-[8px] text-black/40">p.{idx * 2 + 1}–{idx * 2 + 2} / {total * 2}</span>
      </div>

      {/* 对开页（书台） */}
      <div className="flex-1 relative overflow-hidden px-3 py-3" style={{ perspective: 1200 }}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={idx}
            custom={dir}
            initial={{ opacity: 0, rotateY: dir * 22, x: dir * 40 }}
            animate={{ opacity: 1, rotateY: 0, x: 0 }}
            exit={{ opacity: 0, rotateY: dir * -18, x: dir * -30 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            className="absolute inset-3 border-2 border-black shadow-[4px_4px_0_rgba(0,0,0,0.6)] overflow-hidden"
            style={{
              background: '#efeada',
              backgroundImage: 'repeating-linear-gradient(transparent, transparent 21px, rgba(0,0,0,0.05) 22px)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* 书脊中缝阴影 */}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-6 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.16), transparent)' }} />

            {cur.map((p, i) => {
              const s = SLOTS[i % SLOTS.length];
              return (
                <button
                  key={p.id}
                  onClick={() => p.assetKey && onOpenAsset ? onOpenAsset(p.assetKey) : onOpen(p.full, `${p.city} · ${p.date}`)}
                  className="absolute bg-white p-1.5 pb-5 border border-black/30 shadow-[2px_3px_6px_rgba(0,0,0,0.35)] active:scale-95 transition-transform"
                  style={{ left: s.left, top: s.top, width: '42%', rotate: `${s.rot}deg` }}
                >
                  {/* 胶带 */}
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-4 rotate-[-6deg]" style={{ background: TAPE[i % TAPE.length] }} />
                  <div className="w-full aspect-square overflow-hidden bg-[#d8d8d6]">
                    <img src={p.thumb} onError={onImgErr} alt={p.city} className="w-full h-full object-cover grayscale hover:grayscale-0 active:grayscale-0 transition-all duration-500" />
                  </div>
                  <div className="absolute bottom-1 left-0 right-0 text-center font-serif italic text-[8px] text-black/60 truncate px-1">{p.date}</div>
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 翻页 */}
      <div className="px-4 py-2.5 border-t-2 border-black bg-white shrink-0 flex items-center justify-between">
        <button onClick={() => go(-1)} disabled={idx === 0} className="flex items-center gap-1 border-2 border-black px-3 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-30">
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={3} /> 上一页
        </button>
        <span className="font-pixel text-[8px] text-black/45">{idx + 1} / {total}</span>
        <button onClick={() => go(1)} disabled={idx >= total - 1} className="flex items-center gap-1 border-2 border-black px-3 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-30">
          下一页 <ChevronRight className="w-3.5 h-3.5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
