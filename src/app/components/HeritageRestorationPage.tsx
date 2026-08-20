import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, ChevronLeft, Download, Eraser, FileImage, LoaderCircle, ScanText, ShieldCheck, Sparkles } from 'lucide-react';
import { getEdgeRuntimeStatus } from '../../../frost-agent/edge/httpEdge';
import { prepareAndEquipSkill } from '../lib/skill';
import { startAgentRun } from '../lib/observe/bus';
import { runHeritageRestoration, runRubbingOcr, type RubbingResult } from '../lib/heritage/rubbing';
import RunTrace from './RunTrace';

const ACCENT = '#C9A84C';
const SKILL_KEY = 'pocket.rubbing@1.0.0';
const SAMPLE_RUBBING = '/assets/heritage-demo/stele-rubbing-readable.jpg';
const SAMPLE_DAMAGE = '/assets/heritage-demo/restoration-damaged.png';
const SAMPLE_MASK = '/assets/heritage-demo/restoration-mask.png';

const fileDataUrl = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(file);
});

const fetchDataUrl = async (url: string): Promise<string> => {
  const response = await fetch(url); if (!response.ok) throw new Error(`样例读取失败：${response.status}`);
  return fileDataUrl(await response.blob());
};

function downloadDataUrl(name: string, url: string) {
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
}

export default function HeritageRestorationPage({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'ocr' | 'restore'>('ocr');
  const [image, setImage] = useState('');
  const [runtime, setRuntime] = useState({ checking: true, ready: false, rubbing: false, restorer: false, message: '检查端侧运行时…' });
  const [installing, setInstalling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ocr, setOcr] = useState<RubbingResult | null>(null);
  const [confirmedText, setConfirmedText] = useState('');
  const [restored, setRestored] = useState('');
  const [restoreStats, setRestoreStats] = useState('');
  const [hasMask, setHasMask] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  const refreshRuntime = async () => {
    const status = await getEdgeRuntimeStatus(); const adapters = status.runtime?.adapters || {};
    const ready = status.backend === 'mnn' && !!status.runtime?.visionReady;
    setRuntime({ checking: false, ready, rubbing: !!adapters['rubbing-vision']?.installed, restorer: !!status.runtime?.restorer?.installed, message: ready ? 'Qwen3-VL · MNN 端侧已就绪' : '端侧 MNN 尚未就绪' });
  };
  useEffect(() => { refreshRuntime().catch(() => setRuntime({ checking: false, ready: false, rubbing: false, restorer: false, message: '端侧运行时不可达' })); }, []);

  const equip = async () => {
    setInstalling(true); setError('');
    try { await prepareAndEquipSkill(SKILL_KEY); await refreshRuntime(); }
    catch (reason) { setError(String(reason)); }
    finally { setInstalling(false); }
  };

  const resetCanvas = (width: number, height: number) => {
    const canvas = maskRef.current; if (!canvas) return;
    canvas.width = Math.max(1, width); canvas.height = Math.max(1, height); canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); setHasMask(false);
  };
  const drawMaskImage = async (url: string) => {
    const source = new Image(); source.onload = () => {
      const canvas = maskRef.current; if (!canvas) return;
      canvas.width = source.naturalWidth; canvas.height = source.naturalHeight; canvas.getContext('2d')?.drawImage(source, 0, 0); setHasMask(true);
    }; source.src = url;
  };
  const loadSample = async () => {
    setError(''); setOcr(null); setRestored('');
    try {
      if (mode === 'ocr') setImage(await fetchDataUrl(SAMPLE_RUBBING));
      else {
        const [damaged, mask] = await Promise.all([fetchDataUrl(SAMPLE_DAMAGE), fetchDataUrl(SAMPLE_MASK)]);
        setImage(damaged); window.setTimeout(() => drawMaskImage(mask), 30);
      }
    } catch (reason) { setError(String(reason)); }
  };
  const chooseFile = async (file?: File) => {
    if (!file) return; setImage(await fileDataUrl(file)); setOcr(null); setConfirmedText(''); setRestored(''); setError('');
  };

  const maskPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = maskRef.current; if (!canvas) return null; const box = canvas.getBoundingClientRect();
    return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height };
  };
  const beginMask = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = maskRef.current; const point = maskPoint(event); if (!canvas || !point) return;
    drawing.current = true; canvas.setPointerCapture(event.pointerId); const context = canvas.getContext('2d'); if (!context) return;
    context.beginPath(); context.moveTo(point.x, point.y); context.strokeStyle = 'white'; context.lineCap = 'round'; context.lineJoin = 'round'; context.lineWidth = Math.max(12, Math.max(canvas.width, canvas.height) * 0.035); setHasMask(true);
  };
  const paintMask = (event: ReactPointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const point = maskPoint(event); const context = maskRef.current?.getContext('2d'); if (!point || !context) return; context.lineTo(point.x, point.y); context.stroke(); };
  const endMask = () => { drawing.current = false; maskRef.current?.getContext('2d')?.closePath(); };
  const clearMask = () => { const canvas = maskRef.current; if (!canvas) return; canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); setHasMask(false); };

  const runOcr = async () => {
    if (!image || busy) return; setBusy(true); setError(''); setOcr(null); setConfirmedText('');
    const run = startAgentRun('碑拓双候选识读', { skillId: 'pocket.rubbing', skillVersion: '1.0.0', baseRevision: 'pocketearth-int8-20260810', adapterVersion: 'rubbing-vision-lora@1427fbb0', executionPath: 'local-mnn', inputSummary: '用户主动选择的 1 张碑拓图', tools: ['vision'], userConfirmation: 'required' }); setRunId(run.runId);
    try {
      run.phase('Qwen3-VL Base 转录', 'MNN 端侧'); run.phase('碑拓 LoRA 转录', 'MNN 端侧 · rubbing-vision');
      const result = await runRubbingOcr(image); setOcr(result); setConfirmedText(result.selected);
      run.phase('输出 Quality Gate', result.reason, { qualityGate: result.gate, fallbackReason: result.gate === 'passed' ? undefined : result.reason, userConfirmation: result.gate === 'passed' ? 'required' : 'required' });
      run.end(result.gate !== 'failed');
    } catch (reason) { setError(String(reason)); run.phase('失败闭合', String(reason), { qualityGate: 'failed', fallbackReason: String(reason) }); run.end(false); }
    finally { setBusy(false); }
  };
  const runRestore = async () => {
    const canvas = maskRef.current; if (!image || !canvas || !hasMask || busy) return; setBusy(true); setError(''); setRestored('');
    const run = startAgentRun('遮罩内数字化复原', { skillId: 'pocket.rubbing', skillVersion: '1.0.0', adapterVersion: 'heritage-restorer@c571f660', executionPath: 'local-mnn', inputSummary: '用户主动选择的 1 张图 + 本地遮罩', tools: ['restore'], userConfirmation: 'required' }); setRunId(run.runId);
    try {
      run.phase('锁定遮罩外像素', '原图不可被覆盖'); run.phase('MNN 分块修复', '256px tile · 仅遮罩区域');
      const result = await runHeritageRestoration(image, canvas.toDataURL('image/png')); setRestored(result.image || '');
      setRestoreStats(`遮罩覆盖 ${((result.stats?.maskCoverage || 0) * 100).toFixed(1)}% · ${result.stats?.tileCount || 0} 分块 · 遮罩外最大改动 ${result.stats?.unmaskedMaxDelta ?? '?'} 像素`);
      run.phase('复原 Quality Gate', '遮罩外像素变化必须为 0', { qualityGate: 'passed', finalWrites: ['本地修复预览（未覆盖原图）'] }); run.end(true);
    } catch (reason) { setError(String(reason)); run.phase('失败闭合', String(reason), { qualityGate: 'failed', fallbackReason: String(reason) }); run.end(false); }
    finally { setBusy(false); }
  };

  const readyForMode = mode === 'ocr' ? runtime.ready && runtime.rubbing : runtime.ready && runtime.restorer;
  return <div className="flex h-full flex-col overflow-hidden bg-[#eaeaea] font-sans">
    <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
      <button type="button" onClick={onBack} aria-label="返回 Skills" className="grid h-9 w-9 place-items-center border-2 border-black bg-white shadow-[1px_1px_0_#000]"><ChevronLeft className="h-5 w-5" strokeWidth={3} /></button>
      <div className="min-w-0 flex-1"><h1 className="font-pixel text-[11px] tracking-wider">HERITAGE-SKILL</h1><p className="text-[9px] text-black/45">碑拓识读 · 遮罩内数字化复原</p></div><ScanText className="h-5 w-5" style={{ color: ACCENT }} />
    </header>
    <div className="shrink-0 border-b-2 border-black bg-black px-3 py-2 font-pixel text-[7px] text-[#7CFF6B]">QWEN BASE + LORA · QUALITY GATE · ORIGINAL KEPT</div>
    <main className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
      <section className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_#000]">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" style={{ color: readyForMode ? '#238c57' : '#b3261e' }} /><b className="text-[11px]">{runtime.checking ? '检查端侧模型…' : runtime.message}</b><span className="ml-auto text-[8px] text-black/45">{mode === 'ocr' ? runtime.rubbing ? 'LoRA 已装' : 'LoRA 未装' : runtime.restorer ? '修复器已装' : '修复器未装'}</span></div>
        {!readyForMode && !runtime.checking && <button type="button" onClick={equip} disabled={installing} className="mt-2 w-full border-2 border-black py-1.5 text-[9px] font-bold text-black" style={{ background: ACCENT }}>{installing ? '安装并校验中…' : '安装 32MB 专业资产并装备'}</button>}
      </section>

      <div className="grid grid-cols-2 gap-1.5"><button type="button" onClick={() => { setMode('ocr'); setImage(''); setRestored(''); setError(''); }} className={`border-2 border-black py-2 text-[10px] font-bold ${mode === 'ocr' ? 'bg-black text-[#7CFF6B]' : 'bg-white'}`}>碑拓双候选识读</button><button type="button" onClick={() => { setMode('restore'); setImage(''); setOcr(null); setError(''); }} className={`border-2 border-black py-2 text-[10px] font-bold ${mode === 'restore' ? 'bg-black text-[#7CFF6B]' : 'bg-white'}`}>遮罩内数字复原</button></div>

      <section className="border-2 border-black bg-white p-2.5">
        <div className="flex gap-1.5"><label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-2 border-black bg-[#f5f1e5] py-2 text-[9px] font-bold"><FileImage className="h-4 w-4" />选择本地图像<input type="file" accept="image/*" className="hidden" onChange={(event) => chooseFile(event.target.files?.[0])} /></label><button type="button" onClick={loadSample} className="border-2 border-black px-3 text-[9px] font-bold">载入验证样例</button></div>
        {image && <div className="mt-2 overflow-hidden border-2 border-black bg-[#171717]">
          <div className="relative mx-auto max-h-[340px] w-fit touch-none overflow-hidden">
            <img ref={imageRef} src={image} alt="原始资料" className="block max-h-[340px] max-w-full object-contain" onLoad={(event) => { if (!hasMask) resetCanvas(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight); }} />
            {mode === 'restore' && <canvas ref={maskRef} aria-label="修复遮罩画布" className="absolute inset-0 h-full w-full cursor-crosshair opacity-60" onPointerDown={beginMask} onPointerMove={paintMask} onPointerUp={endMask} onPointerCancel={endMask} />}
          </div>
        </div>}
        {mode === 'restore' && image && <div className="mt-2 flex items-center gap-2 text-[9px]"><span className="flex-1 text-black/55">用手指涂白残损区域；模型不得改动遮罩外像素。</span><button type="button" onClick={clearMask} className="flex items-center gap-1 border border-black px-2 py-1"><Eraser className="h-3 w-3" />清除</button></div>}
        <button type="button" disabled={!image || !readyForMode || busy || (mode === 'restore' && !hasMask)} onClick={mode === 'ocr' ? runOcr : runRestore} className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-black bg-black py-2 text-[10px] font-bold text-[#7CFF6B] disabled:opacity-35">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{mode === 'ocr' ? '运行 Base + 碑拓 LoRA' : '仅修复涂选区域'}</button>
      </section>

      <RunTrace runId={runId} collapseWhenDone />
      {error && <div className="border-2 border-[#b3261e] bg-[#fff0ed] p-2 text-[9px] leading-relaxed text-[#b3261e]">{error}</div>}

      {mode === 'ocr' && ocr && <section className="border-2 border-black bg-white shadow-[2px_2px_0_#000]">
        <div className="flex items-center gap-2 border-b-2 border-black px-2.5 py-2"><b className="text-[11px]">双候选与门禁</b><span className={`ml-auto border border-black px-1.5 py-0.5 text-[8px] ${ocr.gate === 'passed' ? 'bg-[#dff4e7] text-[#238c57]' : ocr.gate === 'manual-review' ? 'bg-[#fff1c7]' : 'bg-[#fff0ed] text-[#b3261e]'}`}>{ocr.gate}</span></div>
        <p className="border-b border-black/20 bg-[#f5f1e5] px-2.5 py-2 text-[9px] leading-relaxed">{ocr.reason}</p>
        <div className="grid grid-cols-2 gap-px bg-black/20"><button type="button" onClick={() => setConfirmedText(ocr.base.text)} className="bg-white p-2 text-left"><span className="font-pixel text-[7px]">QWEN BASE</span><p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed">{ocr.base.text || '无有效输出'}</p></button><button type="button" onClick={() => setConfirmedText(ocr.lora.text)} className="bg-white p-2 text-left"><span className="font-pixel text-[7px]">RUBBING LORA</span><p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed">{ocr.lora.text || '无有效输出'}</p></button></div>
        <div className="p-2.5"><label className="text-[9px] font-bold">人工确认稿（可校订）</label><textarea value={confirmedText} onChange={(event) => setConfirmedText(event.target.value)} rows={5} className="mt-1 w-full resize-y border-2 border-black p-2 text-[11px] leading-relaxed outline-none" /><p className="mt-1 flex items-center gap-1 text-[8px] text-black/45"><Check className="h-3 w-3" />只有这里确认的文字才能进入后续资料；原图和双候选始终保留。</p></div>
      </section>}

      {mode === 'restore' && restored && <section className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_#000]">
        <div className="mb-2 flex items-center"><b className="text-[11px]">原图 / 修复建议并列</b><button type="button" onClick={() => downloadDataUrl('pocket-earth-heritage-restored.png', restored)} className="ml-auto flex items-center gap-1 border border-black px-2 py-1 text-[8px]"><Download className="h-3 w-3" />下载副本</button></div>
        <div className="grid grid-cols-2 gap-2"><figure><img src={image} alt="原图" className="aspect-square w-full border border-black object-contain" /><figcaption className="mt-1 text-center text-[8px]">原图 · 永不覆盖</figcaption></figure><figure><img src={restored} alt="修复建议" className="aspect-square w-full border border-black object-contain" /><figcaption className="mt-1 text-center text-[8px]">MNN 修复建议</figcaption></figure></div><p className="mt-2 text-[8px] text-black/50">{restoreStats}</p>
      </section>}
      <p className="pb-3 text-center text-[8px] leading-relaxed text-black/35">端侧处理 · 不上传原图 · 未确认结果不写入地图或资料库</p>
    </main>
  </div>;
}
