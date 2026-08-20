// 绕拍采集引导卡：录视频/多图前弹出，按展品类型给「怎么拍才能出好 3D」的步骤 + 规格 + 避坑。
// 决定自有 GPU 3DGS 重建质量的关键在采集端——乱拍出垃圾点云，按引导绕拍才能出好 3D。看展搭子像素风。
import type { CaptureGuide } from '../lib/exhibition/captureGuide';

const TEAL = '#5A8F7B';
const GOLD = '#C8A24B';

export default function CaptureGuideCard({ guide, onStart, onClose }: { guide: CaptureGuide; onStart: () => void; onClose: () => void }) {
  const modeLabel = guide.mode === 'video' ? '推荐录视频' : guide.mode === 'photo' ? '推荐多图' : '视频/多图皆可';
  const { specs } = guide;
  return (
    <div className="absolute inset-0 z-[140] bg-black/60 flex items-end justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-md bg-[#F5F1E8] border-2 border-black shadow-[3px_3px_0_#000] max-h-[86%] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b-2 border-black sticky top-0" style={{ background: TEAL }}>
          <span className="font-pixel text-[10px] text-white">◆ 绕拍引导 · {guide.label}</span>
          <span className="font-pixel text-[7px] text-white/85">{modeLabel}</span>
        </div>

        <div className="flex flex-wrap gap-1 px-3 pt-2.5">
          {specs.videoSec && <span className="font-pixel text-[7px] border border-black/40 px-1.5 py-0.5 bg-white">🎬 视频 {specs.videoSec[0]}–{specs.videoSec[1]}s</span>}
          {specs.photoCount && <span className="font-pixel text-[7px] border border-black/40 px-1.5 py-0.5 bg-white">📸 多图 {specs.photoCount[0]}–{specs.photoCount[1]} 张</span>}
          {specs.orbits && <span className="font-pixel text-[7px] border border-black/40 px-1.5 py-0.5 bg-white">🔄 绕 {specs.orbits} 圈</span>}
          {(specs.heights || []).map((h, i) => <span key={i} className="font-pixel text-[7px] border border-black/40 px-1.5 py-0.5 bg-[#eef4f1]">{h}</span>)}
        </div>

        <div className="px-3 py-2.5 space-y-2">
          {guide.steps.map((s, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-[15px] leading-none shrink-0">{s.icon}</span>
              <div className="min-w-0">
                <div className="font-pixel text-[9px] text-black">{s.title}</div>
                <div className="text-[11px] text-black/60 leading-relaxed break-words">{s.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-3 pb-2.5">
          <div className="font-pixel text-[8px] text-black/50 mb-1">⚠ 避坑</div>
          <ul className="space-y-0.5">
            {guide.pitfalls.map((p, i) => <li key={i} className="text-[10px] text-black/55 leading-relaxed break-words">· {p}</li>)}
          </ul>
        </div>

        <div className="flex gap-2 px-3 pb-3 pt-1 sticky bottom-0 bg-[#F5F1E8]">
          <button onClick={onStart} className="flex-1 font-pixel text-[10px] border-2 border-black py-2 active:translate-y-px shadow-[1px_1px_0_#000]" style={{ background: GOLD, color: '#000' }}>◆ 我知道了 · 去录制</button>
          <button onClick={onClose} className="border-2 border-black bg-white px-3 py-2 font-pixel text-[10px] active:translate-y-px">取消</button>
        </div>
      </div>
    </div>
  );
}
