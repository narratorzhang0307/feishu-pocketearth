import { Check, ChevronLeft, Cpu, Layers3, ScanLine } from 'lucide-react';
import Museum2_5DViewer from './Museum2_5DViewer';
import { MUSEUM_2_5D_DEMOS, MUSEUM_2_5D_PIPELINE, MUSEUM_MATTING_PROOF } from '../lib/exhibition/museum2_5d';

type MuseumStoryMode = 'build' | 'inscription';

export default function Museum2_5DStoryPage({ mode, onBack }: { mode: MuseumStoryMode; onBack: () => void }) {
  const demo = MUSEUM_2_5D_DEMOS[0];
  const hotspot = demo.hotspots[0];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#EAEAEA] font-sans">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label="返回看展搭子" className="grid h-9 w-9 place-items-center border-2 border-black bg-white shadow-[2px_2px_0_#000]">
          <ChevronLeft className="h-4 w-4" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-[10px] tracking-[0.14em]">MUSEUM CAPTURE · {mode === 'build' ? '01' : '02'}</div>
          <div className="mt-0.5 truncate text-[10px] font-bold text-black/50">
            {mode === 'build' ? '六角度原图 → 可旋转 2.5D' : '独立铭文近拍 → 原字守恒解释'}
          </div>
        </div>
        <span className="border-2 border-black bg-[#7CFF6B] px-2 py-1 font-pixel text-[7px]">REAL ASSET</span>
      </header>

      <div className="flex shrink-0 items-center justify-between border-b-2 border-black bg-black px-3 py-2 text-[#7CFF6B]">
        <span className="font-pixel text-[7px]">{demo.label} · {demo.views.length}/{demo.views.length} OBSERVED</span>
        <span className="font-pixel text-[6px] text-white/70">NO GENERATED BACKSIDE</span>
      </div>

      {mode === 'build' ? (
        <main className="min-h-0 flex-1 overflow-y-auto p-3">
          <section className="border-2 border-black bg-[#fffaf0] shadow-[3px_3px_0_#000]">
            <div className="flex items-center justify-between border-b-2 border-black px-3 py-2">
              <div>
                <div className="font-pixel text-[7px] text-[#5A8F7B]">01 · MULTI-VIEW INPUT</div>
                <h1 className="mt-1 text-[17px] font-black">围绕同一件展品拍六张</h1>
              </div>
              <span className="font-pixel text-[7px]">6 / 6 通过</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-2.5">
              {demo.views.map((view) => (
                <figure key={view.id} className="relative aspect-square overflow-hidden border-2 border-black bg-[#d7d0c3]">
                  <img src={view.originalUrl || view.colorUrl} alt={`${demo.label} ${view.yawDeg}度原始照片`} className="h-full w-full object-contain" />
                  <figcaption className="absolute bottom-0 right-0 border-l border-t border-black bg-white px-1 py-0.5 font-pixel text-[5px]">{view.yawDeg}°</figcaption>
                </figure>
              ))}
            </div>
            <div className="grid grid-cols-3 border-t-2 border-black bg-white text-center">
              <div className="border-r border-black p-2"><div className="font-pixel text-[8px] text-[#5A8F7B]">6 / 6</div><div className="mt-0.5 text-[8px]">角度覆盖</div></div>
              <div className="border-r border-black p-2"><div className="font-pixel text-[8px] text-[#5A8F7B]">PASS</div><div className="mt-0.5 text-[8px]">抠图门控</div></div>
              <div className="p-2"><div className="font-pixel text-[8px] text-[#5A8F7B]">OBSERVED</div><div className="mt-0.5 text-[8px]">不补造背面</div></div>
            </div>
          </section>

          <div className="my-3 flex flex-wrap items-center justify-center gap-1.5">
            {MUSEUM_2_5D_PIPELINE.map((step, index) => (
              <div key={step} className="contents">
                <span className="border border-black bg-white px-2 py-1 font-pixel text-[6px] shadow-[1px_1px_0_#000]">{step}</span>
                {index < MUSEUM_2_5D_PIPELINE.length - 1 && <span className="font-pixel text-[8px]">→</span>}
              </div>
            ))}
          </div>

          <section className="border-2 border-black bg-white shadow-[3px_3px_0_#000]">
            <div className="flex items-center justify-between border-b-2 border-black px-3 py-2">
              <div className="flex items-center gap-2"><Layers3 className="h-4 w-4" strokeWidth={2.5} /><b className="text-[14px]">02 · 可旋转 2.5D 结果</b></div>
              <span className="border border-black bg-[#7CFF6B] px-1.5 py-0.5 font-pixel text-[6px]">READY</span>
            </div>
            <Museum2_5DViewer compact assetUrl={demo.manifestUrl} hideDemoSwitch />
            <div className="flex items-center justify-between border-t-2 border-black bg-[#f4eedb] px-3 py-2">
              <span className="flex items-center gap-1 font-pixel text-[6px]"><Cpu className="h-3 w-3" /> {MUSEUM_MATTING_PROOF.runtime}</span>
              <span className="font-pixel text-[6px]">BLIND IoU {MUSEUM_MATTING_PROOF.tuned.iou.toFixed(3)}</span>
            </div>
          </section>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col p-3">
          <section className="mb-2 shrink-0 border-2 border-black bg-[#fffaf0] px-3 py-2 shadow-[2px_2px_0_#000]">
            <div className="flex items-start gap-2">
              <ScanLine className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
              <div>
                <div className="font-pixel text-[7px] text-[#5A8F7B]">DETAIL HOTSPOT · SEPARATE PHOTO</div>
                <div className="mt-1 text-[13px] font-black">铭文细节不从环绕照裁切，单独近拍后附着到对应角度</div>
                <div className="mt-1 text-[9px] leading-relaxed text-black/55">视觉层保留原字与置信度；馆方释文确认后，原生 Qwen 只负责断句和现代解释。</div>
              </div>
            </div>
          </section>
          <div className="min-h-0 flex-1">
            <Museum2_5DViewer
              fill
              assetUrl={demo.manifestUrl}
              initialHotspotId={hotspot?.id}
              hideDemoSwitch
            />
          </div>
          <div className="mt-2 flex shrink-0 items-center justify-between border-2 border-black bg-[#e8f5e9] px-3 py-2 shadow-[2px_2px_0_#000]">
            <span className="flex items-center gap-1.5 text-[10px] font-bold"><Check className="h-4 w-4" strokeWidth={3} /> 原字守恒 · 不可见字不强猜</span>
            <span className="font-pixel text-[6px]">QWEN EXPLAINS</span>
          </div>
        </main>
      )}
    </div>
  );
}
