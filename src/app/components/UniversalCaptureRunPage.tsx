import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen, Camera, Check, ChevronLeft, Database, ImagePlus, Pencil, RotateCcw, ScanText, Trash2, X,
} from 'lucide-react';
import { getPhotoRuntimeStatus, runPhotoVision, type PhotoRuntimeStatus } from '../../../frost-agent/edge/httpPhotoEdge';
import { isNativeMnnPlatform } from '../../../frost-agent/edge/capacitorMnnEdge';
import { startAgentRun } from '../lib/observe/bus';
import {
  decideReadingOcr, decideReadingOcrRoute, decideReadingVerification, deleteReadingNote, listReadingNotes, newReadingNoteId, parseReadingOcr, saveReadingNote,
  type ReadingImageQuality, type ReadingNote, type ReadingOcrDecision, type ReadingOcrInput, type ReadingSelectionMode,
} from '../lib/readingJot';
import { ensureBuiltinSkills, getInstalledSkill, prepareAndEquipSkill } from '../lib/skill';
import RunTrace from './RunTrace';

interface Props { onBack: () => void }
interface Point { x: number; y: number }
type Stroke = Point[];

const SKILL_KEY = 'pocket.reading-jot@1.0.0';
const ADAPTER_VERSION = 'general-document-ocr-v6-int8@d09be9ee';
const EMPTY_RUNTIME: PhotoRuntimeStatus = {
  phase: 'checking', engine: 'stub', baseReady: false, ocrAdapterReady: false,
  baseModel: 'Qwen3-VL-2B-Instruct', ocrAdapter: 'general-ocr-vision', runtime: 'MNN 3.6.1', acceleration: [], sme2Verified: false,
};
const OCR_PROMPT = '只转录这张裁剪图中实际可见的书中文字。保留原文标点和换行；看不清写□；不要解释、续写、改写或总结。只输出 JSON：{"text":"...","confidence":0-1}。';
const OCR_STRESS_PROMPT = '你是严谨的通用文档 OCR。完整转录图中可见文字，保持真实阅读顺序；不可见字符写 □，不得按上下文补字。逐字转录这张普通文档或照片，不要总结、解释、翻译或补全；完成最后一个可见字符后立即结束。只输出转录文本。';

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'));
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = src;
  });
}

function strokeBounds(stroke: Stroke) {
  const xs = stroke.map((point) => point.x);
  const ys = stroke.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function selectionBox(mode: ReadingSelectionMode, strokes: Stroke[]) {
  if (mode === 'underline') {
    const bounds = strokeBounds(strokes[0]);
    const lineY = strokes[0].reduce((sum, point) => sum + point.y, 0) / strokes[0].length;
    return {
      x: Math.max(0, bounds.minX - 0.035), y: Math.max(0, lineY - 0.145),
      width: Math.min(1, bounds.maxX + 0.035) - Math.max(0, bounds.minX - 0.035),
      height: Math.min(1, lineY + 0.018) - Math.max(0, lineY - 0.145),
    };
  }
  const [first, second] = strokes;
  const firstX = first.reduce((sum, point) => sum + point.x, 0) / first.length;
  const secondX = second.reduce((sum, point) => sum + point.x, 0) / second.length;
  const all = [...first, ...second];
  const top = Math.max(0, Math.min(...all.map((point) => point.y)) - 0.018);
  const bottom = Math.min(1, Math.max(...all.map((point) => point.y)) + 0.018);
  const left = Math.max(0, Math.min(firstX, secondX) + 0.006);
  const right = Math.min(1, Math.max(firstX, secondX) - 0.006);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function cropSelection(src: string, mode: ReadingSelectionMode, strokes: Stroke[]) {
  const image = await loadImage(src);
  const box = selectionBox(mode, strokes);
  if (box.width <= 0.03 || box.height <= 0.02) throw new Error('选区太小，请重新画线');
  const sx = Math.round(box.x * image.naturalWidth);
  const sy = Math.round(box.y * image.naturalHeight);
  const sw = Math.max(1, Math.round(box.width * image.naturalWidth));
  const sh = Math.max(1, Math.round(box.height * image.naturalHeight));
  const scale = Math.min(1, 1600 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext('2d')!.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  const sampleStride = Math.max(1, Math.floor(Math.sqrt((canvas.width * canvas.height) / 6000)));
  const lumas: number[] = [];
  let edgeTotal = 0; let edgeCount = 0; let highlightCount = 0;
  let laplacianTotal = 0; let laplacianSquaredTotal = 0; let laplacianCount = 0;
  const lumaAt = (x: number, y: number) => {
    const offset = (y * canvas.width + x) * 4;
    return (pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114) / 255;
  };
  for (let y = 0; y < canvas.height; y += sampleStride) {
    for (let x = 0; x < canvas.width; x += sampleStride) {
      const luma = lumaAt(x, y);
      lumas.push(luma);
      if (luma >= 0.92) highlightCount += 1;
      if (x + sampleStride < canvas.width) {
        edgeTotal += Math.abs(luma - lumaAt(x + sampleStride, y)); edgeCount += 1;
      }
      if (x >= sampleStride && y >= sampleStride && x + sampleStride < canvas.width && y + sampleStride < canvas.height) {
        const laplacian = lumaAt(x - sampleStride, y) + lumaAt(x + sampleStride, y)
          + lumaAt(x, y - sampleStride) + lumaAt(x, y + sampleStride) - 4 * luma;
        laplacianTotal += laplacian; laplacianSquaredTotal += laplacian ** 2; laplacianCount += 1;
      }
    }
  }
  const meanLuma = lumas.reduce((sum, value) => sum + value, 0) / Math.max(1, lumas.length);
  const contrast = Math.sqrt(lumas.reduce((sum, value) => sum + ((value - meanLuma) ** 2), 0) / Math.max(1, lumas.length));
  const laplacianMean = laplacianTotal / Math.max(1, laplacianCount);
  const quality: ReadingImageQuality = {
    width: canvas.width, height: canvas.height, meanLuma, contrast,
    edgeStrength: edgeTotal / Math.max(1, edgeCount),
    laplacianVariance: Math.max(0, laplacianSquaredTotal / Math.max(1, laplacianCount) - laplacianMean ** 2),
    highlightClipping: highlightCount / Math.max(1, lumas.length),
  };
  const ocrDataUrl = canvas.toDataURL('image/jpeg', 0.9);

  const verification = document.createElement('canvas');
  verification.width = canvas.width; verification.height = canvas.height;
  const verificationContext = verification.getContext('2d')!;
  verificationContext.drawImage(canvas, 0, 0);
  const verificationPixels = verificationContext.getImageData(0, 0, verification.width, verification.height);
  for (let index = 0; index < verificationPixels.data.length; index += 4) {
    const gray = verificationPixels.data[index] * 0.299 + verificationPixels.data[index + 1] * 0.587 + verificationPixels.data[index + 2] * 0.114;
    const enhanced = Math.max(0, Math.min(255, (gray - 127.5) * 1.16 + 127.5));
    verificationPixels.data[index] = enhanced;
    verificationPixels.data[index + 1] = enhanced;
    verificationPixels.data[index + 2] = enhanced;
  }
  verificationContext.putImageData(verificationPixels, 0, 0);
  const verificationDataUrl = verification.toDataURL('image/jpeg', 0.9);

  const previewScale = Math.min(1, 520 / Math.max(canvas.width, canvas.height));
  const preview = document.createElement('canvas');
  preview.width = Math.max(1, Math.round(canvas.width * previewScale));
  preview.height = Math.max(1, Math.round(canvas.height * previewScale));
  preview.getContext('2d')!.drawImage(canvas, 0, 0, preview.width, preview.height);
  return { ocrDataUrl, verificationDataUrl, previewDataUrl: preview.toDataURL('image/jpeg', 0.72), quality };
}

const formatDate = (iso: string) => new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export default function UniversalCaptureRunPage({ onBack }: Props) {
  const [tab, setTab] = useState<'capture' | 'notes'>('capture');
  const [source, setSource] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [mode, setMode] = useState<ReadingSelectionMode>('underline');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [runtime, setRuntime] = useState<PhotoRuntimeStatus>(EMPTY_RUNTIME);
  const [installing, setInstalling] = useState(false);
  const [installLabel, setInstallLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [decision, setDecision] = useState<ReadingOcrDecision | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [excerpt, setExcerpt] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [page, setPage] = useState('');
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState<ReadingNote[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<number | null>(null);

  const refreshRuntime = useCallback(async () => {
    setRuntime((current) => ({ ...current, phase: 'checking' }));
    setRuntime(await getPhotoRuntimeStatus());
  }, []);
  const refreshNotes = useCallback(async () => setNotes(await listReadingNotes()), []);

  useEffect(() => {
    ensureBuiltinSkills();
    void refreshRuntime();
    void refreshNotes();
  }, [refreshNotes, refreshRuntime]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = 'round'; context.lineJoin = 'round'; context.lineWidth = 4 * ratio; context.strokeStyle = '#ff315f';
    for (const stroke of strokes) {
      if (!stroke.length) continue;
      context.beginPath();
      stroke.forEach((point, index) => {
        const x = point.x * canvas.width; const y = point.y * canvas.height;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
    }
  }, [strokes]);

  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw, source]);

  const chooseMode = (next: ReadingSelectionMode) => {
    setMode(next); setStrokes([]); setDecision(null); setPreviewDataUrl(null); setError('');
  };

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = [pointFromEvent(event)];
    setStrokes((current) => {
      const base = mode === 'underline' || current.length >= 2 ? [] : current;
      activeStroke.current = base.length;
      return [...base, next];
    });
    setDecision(null); setPreviewDataUrl(null); setError('');
  };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeStroke.current == null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointFromEvent(event);
    setStrokes((current) => current.map((stroke, index) => index === activeStroke.current ? [...stroke, point] : stroke));
  };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activeStroke.current = null;
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      setSource(await readFile(file)); setSourceName(file.name); setStrokes([]); setDecision(null); setPreviewDataUrl(null); setError(''); setEditingId(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '图片读取失败'); }
  };

  const selectionReady = mode === 'underline'
    ? strokes.length === 1 && strokes[0].length >= 2
    : strokes.length === 2 && strokes.every((stroke) => stroke.length >= 2);

  const installAdapter = async () => {
    if (!isNativeMnnPlatform() || installing) return;
    setInstalling(true); setError('');
    try {
      ensureBuiltinSkills();
      if (!getInstalledSkill(SKILL_KEY)) throw new Error('阅读摘录 Skill Manifest 未安装');
      await prepareAndEquipSkill(SKILL_KEY, {
        onProgress: (progress) => setInstallLabel(progress.phase === 'done' ? '校验完成' : `${Math.round((progress.downloaded / Math.max(1, progress.total)) * 100)}%`),
      });
      await refreshRuntime(); setToast('通用 OCR LoRA 已安装并通过 SHA256 校验');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'LoRA 安装失败'); }
    finally { setInstalling(false); window.setTimeout(() => setToast(''), 2400); }
  };

  const prepareManual = async () => {
    if (!source || !selectionReady) return;
    try {
      const crop = await cropSelection(source, mode, strokes);
      setPreviewDataUrl(crop.previewDataUrl); setDecision(null); setExcerpt(''); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '选区裁剪失败'); }
  };

  const recognize = async () => {
    if (!source || !selectionReady || busy) return;
    setBusy(true); setError(''); setDecision(null); setExcerpt('');
    const run = startAgentRun('阅读摘录 · 端侧识读', {
      skillId: 'pocket.reading-jot', skillVersion: '1.0.0', baseRevision: 'pocketearth-dual-base-20260811',
      adapterVersion: ADAPTER_VERSION, executionPath: 'local-mnn', runtime: 'MNN 3.6.1', visualInput: '用户画线选区；原书页不落库',
      userConfirmation: 'required',
    });
    setRunId(run.runId);
    try {
      setPhase('裁剪选区'); run.phase('裁剪选区', mode === 'underline' ? '只取红线以上的文字带' : '只取两根竖线之间的段落', { executionPath: 'local-rules' });
      const crop = await cropSelection(source, mode, strokes);
      setPreviewDataUrl(crop.previewDataUrl);
      const status = await getPhotoRuntimeStatus(); setRuntime(status);
      if (!status.baseReady) throw new Error('本机 Qwen3-VL-2B / MNN Base 尚未就绪；可先手动录入，或去 DEVICE LAB 安装基座。');

      setPhase('Qwen Base 识读'); run.phase('Qwen Base 识读', '固定裁剪图 · 离线 MNN', { executionPath: 'local-mnn', baseRevision: 'pocketearth-dual-base-20260811', maxTokens: 720 });
      const baseResponse = await runPhotoVision(crop.ocrDataUrl, OCR_PROMPT, { detail: 'ocr', maxTokens: 720 });
      if (baseResponse.backend !== 'mnn' || !baseResponse.text) throw new Error(`Base OCR 未返回有效结果${baseResponse.error ? `：${baseResponse.error}` : ''}`);
      const base: ReadingOcrInput = { ...parseReadingOcr(baseResponse.text), maxTokens: 720 };
      const loraRoute = decideReadingOcrRoute(base, crop.quality);
      run.phase('LoRA 分支路由', loraRoute.runLora ? `压力/退化信号：${loraRoute.reasons.join('、')}` : '清晰选区且 Base 通过，跳过 LoRA', {
        executionPath: 'local-rules',
        ...(loraRoute.runLora ? { fallbackReason: `进入 LoRA 双候选：${loraRoute.reasons.join(',')}` } : { qualityGate: 'passed' as const }),
      });

      let lora: ReadingOcrInput | undefined;
      if (status.ocrAdapterReady && loraRoute.runLora) {
        setPhase('通用 OCR LoRA'); run.phase('通用 OCR LoRA', '同一选区运行第二候选；不会直接覆盖 Base', { executionPath: 'local-mnn', adapterVersion: ADAPTER_VERSION, maxTokens: 256 });
        const loraResponse = await runPhotoVision(crop.ocrDataUrl, OCR_STRESS_PROMPT, { adapter: 'general-ocr-vision', detail: 'ocr', maxTokens: 256 });
        if (loraResponse.backend === 'mnn' && loraResponse.text) lora = { ...parseReadingOcr(loraResponse.text), maxTokens: 256 };
        else run.phase('LoRA 候选回退', '适配器本次未返回有效文字，质量门只保留 Base 候选', { executionPath: 'local-rules', fallbackReason: loraResponse.error || 'empty_lora_candidate' });
      }

      const verificationPlan = decideReadingVerification(base, lora, { pressure: loraRoute.runLora && !lora });
      let verificationOutput: ReadingOcrInput | undefined;
      if (verificationPlan.run) {
        const verifyWithLora = verificationPlan.route === 'general-ocr-vision';
        const verificationTokens = verifyWithLora ? 256 : 720;
        setPhase('增强视图复核');
        run.phase('独立增强视图复核', `灰度 + 1.16 对比度；${verifyWithLora ? 'LoRA' : 'Base'} 路径；原因：${verificationPlan.reasons.join('、')}`, {
          executionPath: 'local-mnn', adapterVersion: verifyWithLora ? ADAPTER_VERSION : undefined, maxTokens: verificationTokens,
        });
        const verificationResponse = await runPhotoVision(
          crop.verificationDataUrl,
          verifyWithLora ? OCR_STRESS_PROMPT : OCR_PROMPT,
          { adapter: verifyWithLora ? 'general-ocr-vision' : undefined, detail: 'ocr', maxTokens: verificationTokens },
        );
        if (verificationResponse.backend === 'mnn' && verificationResponse.text) {
          verificationOutput = { ...parseReadingOcr(verificationResponse.text), maxTokens: verificationTokens };
        } else {
          run.phase('增强复核未完成', '不以失败复核冒充第三票；后续进入人工校文', {
            executionPath: 'local-rules', qualityGate: 'manual-review', fallbackReason: verificationResponse.error || 'empty_verification_candidate',
          });
        }
      }

      const next = decideReadingOcr(base, lora, verificationOutput ? { route: verificationPlan.route, output: verificationOutput } : undefined);
      setDecision(next);
      setExcerpt(next.finalText);
      setPhase('质量门'); run.phase('Base / LoRA 质量门', next.reason, {
        executionPath: 'local-rules', adapterVersion: lora ? ADAPTER_VERSION : undefined,
        qualityGate: next.needsReview ? 'manual-review' : 'passed',
        fallbackReason: next.qualityGate === 'base-kept' ? 'LoRA 未通过硬门或未获独立复核支持，保留 Base' : undefined,
      });
      run.phase('等待用户确认', '文字可编辑；只有点击保存才写入本机阅读卡片', { userConfirmation: 'required' });
      run.end(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '识别失败';
      setError(message); run.phase('人工录入回退', message, { executionPath: 'local-rules', qualityGate: 'manual-review', fallbackReason: message, userConfirmation: 'required' }); run.end(false);
    } finally { setBusy(false); setPhase(''); }
  };

  const clearEditor = () => {
    setExcerpt(''); setBookTitle(''); setAuthor(''); setPage(''); setComment(''); setTags(''); setPreviewDataUrl(null); setDecision(null); setEditingId(null); setRunId(null);
  };

  const save = async () => {
    if (!excerpt.trim()) { setError('请先识别或输入要保存的原文'); return; }
    const existing = editingId ? notes.find((note) => note.id === editingId) : undefined;
    const now = new Date().toISOString();
    const selectedCandidate = decision
      ? decision.verification && decision.verificationRoute === decision.route ? decision.verification : decision.selected === 'lora' ? decision.lora! : decision.base
      : null;
    const note: ReadingNote = {
      id: existing?.id || newReadingNoteId(), excerpt: excerpt.trim(), bookTitle: bookTitle.trim(), author: author.trim(), page: page.trim(), comment: comment.trim(),
      tags: tags.split(/[，,\s#]+/).map((tag) => tag.trim()).filter(Boolean), selectionMode: existing?.selectionMode || mode,
      previewDataUrl: previewDataUrl || existing?.previewDataUrl, createdAt: existing?.createdAt || now, updatedAt: now,
      ocr: decision ? {
        route: decision.route, qualityGate: decision.qualityGate, confidence: selectedCandidate?.confidence || 0,
        baseText: decision.base.text, loraText: decision.lora?.text, verificationText: decision.verification?.text,
        adapterVersion: decision.lora ? ADAPTER_VERSION : undefined, policyVersion: decision.policyVersion, gateReasons: decision.gateReasons,
      } : existing?.ocr || { route: 'manual', qualityGate: 'manual-review', confidence: 0 },
    };
    await saveReadingNote(note); await refreshNotes(); clearEditor(); setTab('notes'); setToast(existing ? '阅读卡片已更新' : '阅读卡片只保存在这台手机');
    window.setTimeout(() => setToast(''), 2400);
  };

  const edit = (note: ReadingNote) => {
    setEditingId(note.id); setExcerpt(note.excerpt); setBookTitle(note.bookTitle); setAuthor(note.author); setPage(note.page); setComment(note.comment); setTags(note.tags.join(' '));
    setMode(note.selectionMode); setPreviewDataUrl(note.previewDataUrl || null); setDecision(null); setRunId(null); setError(''); setTab('capture');
  };

  const remove = async (id: string) => {
    if (deleteArmed !== id) { setDeleteArmed(id); return; }
    await deleteReadingNote(id); setDeleteArmed(null); await refreshNotes(); setToast('阅读卡片已从本机删除'); window.setTimeout(() => setToast(''), 2200);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#eaeaea] font-sans">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center border-2 border-black bg-white shadow-[1px_1px_0_#000] active:translate-y-px" aria-label="返回 Skills">
          <ChevronLeft className="h-4 w-4" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-pixel text-[11px] tracking-wider">READING-JOT</div>
          <div className="truncate text-[9px] text-black/45">Qwen Base + 通用 OCR LoRA · 只识别你画出的选区</div>
        </div>
        <BookOpen className="h-5 w-5 text-[#22bf72]" strokeWidth={2.5} />
      </header>

      <div className="flex shrink-0 border-b-2 border-black bg-[#eaeaea] p-2">
        <button onClick={() => setTab('capture')} className={`flex-1 border-2 border-black py-2 font-pixel text-[8px] ${tab === 'capture' ? 'bg-black text-[#00ff88]' : 'bg-white text-black/55'}`}>识别摘录</button>
        <button onClick={() => setTab('notes')} className={`flex-1 border-y-2 border-r-2 border-black py-2 font-pixel text-[8px] ${tab === 'notes' ? 'bg-black text-[#00ff88]' : 'bg-white text-black/55'}`}>阅读卡片 {notes.length}</button>
      </div>

      {tab === 'capture' ? (
        <main className="flex-1 space-y-3 overflow-y-auto px-3 py-3 pb-8">
          <section className="border-2 border-black bg-[#f7f1df] p-2.5">
            <div className="flex items-start gap-2">
              <ScanText className="mt-0.5 h-5 w-5 shrink-0 text-[#e63362]" strokeWidth={2.6} />
              <div className="text-[10px] leading-relaxed text-black/65">
                <strong className="text-black">原书页不落库。</strong> 红线模式提取线上方一句；双竖线模式提取两线之间的段落。只把裁剪选区送入本机 MNN。
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[8px] font-bold">
              <span className="border border-black bg-white px-1 py-1">MNN {runtime.baseReady ? 'READY' : runtime.phase === 'checking' ? 'CHECK' : '未就绪'}</span>
              <span className="border border-black bg-white px-1 py-1">LoRA {runtime.ocrAdapterReady ? 'READY' : '未安装'}</span>
              <span className="border border-black bg-white px-1 py-1">SME2 {runtime.sme2Verified ? 'ACTIVE' : '按实记录'}</span>
            </div>
            {!runtime.ocrAdapterReady && (
              <button onClick={installAdapter} disabled={!isNativeMnnPlatform() || installing} className="mt-2 w-full border-2 border-black bg-[#00ff88] px-2 py-2 font-pixel text-[7px] disabled:bg-black/10 disabled:text-black/40">
                {!isNativeMnnPlatform() ? '网页只预览 · 请在 Android 真机安装' : installing ? `安装通用 OCR LoRA · ${installLabel || '准备中'}` : '安装通用 OCR LoRA · 17.6MB'}
              </button>
            )}
          </section>

          {!editingId && (
            <section className="border-2 border-black bg-white p-2.5">
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = ''; }} />
              <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = ''; }} />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-1.5 border-2 border-black bg-black py-2 text-[10px] font-bold text-[#00ff88]"><Camera className="h-4 w-4" /> 拍书页</button>
                <button onClick={() => libraryRef.current?.click()} className="flex items-center justify-center gap-1.5 border-2 border-black bg-white py-2 text-[10px] font-bold shadow-[1px_1px_0_#000]"><ImagePlus className="h-4 w-4" /> 从相册选</button>
              </div>

              {source && (
                <>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[8.5px] text-black/50">
                    <span className="truncate">{sourceName || '书页照片'} · 仅本次内存</span>
                    <button onClick={() => { setSource(null); setStrokes([]); setPreviewDataUrl(null); setDecision(null); }} className="shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-2">
                    <button onClick={() => chooseMode('underline')} className={`border-2 border-black py-2 text-[9px] font-bold ${mode === 'underline' ? 'bg-[#ff315f] text-white' : 'bg-white'}`}>01 · 红线摘一句</button>
                    <button onClick={() => chooseMode('brackets')} className={`border-y-2 border-r-2 border-black py-2 text-[9px] font-bold ${mode === 'brackets' ? 'bg-[#ff315f] text-white' : 'bg-white'}`}>02 · 双竖线摘一段</button>
                  </div>
                  <div className="mt-2 border-2 border-black bg-black px-2 py-1.5 text-center font-pixel text-[6px] leading-relaxed text-[#ff7898]">
                    {mode === 'underline' ? '在想摘录的句子下面，从左向右画一条红线' : strokes.length === 0 ? '先画左侧竖线' : strokes.length === 1 ? '再画右侧竖线' : '两根竖线已就位 · 可重新画第一根'}
                  </div>
                  <div className="relative mt-2 overflow-hidden border-2 border-black bg-black">
                    <img src={source} alt="待摘录书页" className="block h-auto w-full" onLoad={redraw} draggable={false} />
                    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none cursor-crosshair" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label="书页画线选区" />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => { setStrokes([]); setPreviewDataUrl(null); setDecision(null); }} className="grid w-10 place-items-center border-2 border-black bg-white" aria-label="重画选区"><RotateCcw className="h-4 w-4" /></button>
                    <button onClick={recognize} disabled={!selectionReady || busy} className="flex-1 border-2 border-black bg-black py-2.5 font-pixel text-[8px] tracking-wider text-[#00ff88] disabled:opacity-30">
                      {busy ? phase || '识别中…' : selectionReady ? '端侧识别选区' : mode === 'underline' ? '请先画红线' : `还需 ${2 - strokes.length} 根竖线`}
                    </button>
                    <button onClick={prepareManual} disabled={!selectionReady || busy} className="border-2 border-black bg-white px-2 text-[8px] font-bold disabled:opacity-30">手动录入</button>
                  </div>
                </>
              )}
            </section>
          )}

          {runId && <RunTrace runId={runId} />}

          {(previewDataUrl || editingId) && (
            <section className="border-2 border-black bg-[#fffdf5] p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2 border-b-2 border-black pb-2">
                <div>
                  <div className="font-pixel text-[8px]">{editingId ? '编辑阅读卡片' : '校对文字后保存'}</div>
                  <div className="mt-1 text-[8px] text-black/45">选区图只供核对；原文可直接改字，保存后仍可再次编辑</div>
                </div>
                {editingId && <button onClick={clearEditor} className="border border-black bg-white px-2 py-1 text-[8px]">取消编辑</button>}
              </div>
              {previewDataUrl && <img src={previewDataUrl} alt="书页选区预览" className="mb-2 max-h-36 w-full border-2 border-black bg-white object-contain" />}
              {decision && (
                <div className={`mb-2 border-2 border-black p-2 ${decision.needsReview ? 'bg-[#fff0d7]' : 'bg-[#e8ffed]'}`}>
                  <div className="flex items-center justify-between gap-2 text-[8px] font-bold">
                    <span>{decision.qualityGate === 'lora-accepted' ? 'LoRA 达标，建议采用' : decision.qualityGate === 'base-kept' ? 'LoRA 未达标，保留 Base' : decision.needsReview ? '候选冲突，请人工确认' : 'Base 转录'}</span>
                    <span>Base {decision.base.status.toUpperCase()}{decision.lora ? ` / LoRA ${decision.lora.status.toUpperCase()}` : ''}</span>
                  </div>
                  <p className="mb-0 mt-1 text-[8px] leading-relaxed text-black/55">{decision.reason}</p>
                  {decision.gateReasons.length > 0 && <p className="mb-0 mt-1 font-mono text-[7px] leading-relaxed text-black/40">{decision.policyVersion} · {decision.gateReasons.join(' / ')}</p>}
                  {(decision.lora || decision.verification) && (
                    <div className={`mt-2 grid gap-1.5 ${decision.verification ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <button onClick={() => setExcerpt(decision.base.text)} className="border border-black bg-white px-1 py-1 text-[8px]">查看 / 采用 Base</button>
                      {decision.lora && <button onClick={() => setExcerpt(decision.lora!.text)} className="border border-black bg-white px-1 py-1 text-[8px]">查看 / 采用 LoRA</button>}
                      {decision.verification && <button onClick={() => setExcerpt(decision.verification!.text)} className="border border-black bg-white px-1 py-1 text-[8px]">增强复核</button>}
                    </div>
                  )}
                </div>
              )}
              <label className="block text-[8.5px] font-bold">摘录原文 *</label>
              <textarea value={excerpt} onChange={(event) => setExcerpt(event.target.value)} rows={5} placeholder="识别结果会出现在这里，也可以直接手动输入。" className="mt-1 w-full resize-none border-2 border-black bg-white p-2 text-[12px] leading-relaxed outline-none focus:bg-[#f7fff8]" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input value={bookTitle} onChange={(event) => setBookTitle(event.target.value)} placeholder="书名" className="border-2 border-black bg-white px-2 py-2 text-[10px] outline-none" />
                <input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="作者" className="border-2 border-black bg-white px-2 py-2 text-[10px] outline-none" />
                <input value={page} onChange={(event) => setPage(event.target.value)} placeholder="页码，如 P.27" className="border-2 border-black bg-white px-2 py-2 text-[10px] outline-none" />
                <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="标签，用空格分开" className="border-2 border-black bg-white px-2 py-2 text-[10px] outline-none" />
              </div>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} placeholder="我的想法（可选）" className="mt-2 w-full resize-none border-2 border-black bg-white p-2 text-[10px] outline-none" />
              <button onClick={save} className="mt-2 flex w-full items-center justify-center gap-1.5 border-2 border-black bg-[#00ff88] py-2.5 text-[10px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px">
                <Check className="h-4 w-4" strokeWidth={3} /> {editingId ? '更新阅读卡片' : '确认原文并保存到本机'}
              </button>
            </section>
          )}

          {error && <div className="border-2 border-black bg-[#ffe8ed] p-2.5 text-[9px] leading-relaxed text-[#a21c3b]">{error}</div>}
        </main>
      ) : (
        <main className="flex-1 space-y-2 overflow-y-auto px-3 py-3 pb-8">
          <div className="flex items-center gap-2 border-2 border-black bg-[#f7f1df] p-2.5">
            <Database className="h-5 w-5 shrink-0 text-[#22bf72]" />
            <div className="text-[9px] leading-relaxed text-black/60"><strong className="text-black">本机 IndexedDB · {notes.length} 张。</strong> 不登录、不上传；模型资产卸载也不会删除你的阅读卡片。</div>
          </div>
          {notes.length === 0 ? (
            <div className="border-2 border-dashed border-black/35 bg-white p-8 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-black/20" />
              <div className="mt-2 text-[10px] font-bold">还没有阅读卡片</div>
              <div className="mt-1 text-[9px] text-black/45">拍一页书，画出你真正想留下的那句话。</div>
              <button onClick={() => setTab('capture')} className="mt-3 border-2 border-black bg-black px-3 py-2 font-pixel text-[7px] text-[#00ff88]">去摘一句</button>
            </div>
          ) : notes.map((note, index) => (
            <article key={note.id} className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.8)]">
              <div className="flex gap-2.5">
                {note.previewDataUrl ? <img src={note.previewDataUrl} alt="阅读摘录选区" className="h-20 w-20 shrink-0 border-2 border-black bg-[#eee] object-cover" /> : <div className="grid h-20 w-20 shrink-0 place-items-center border-2 border-black bg-[#f7f1df]"><BookOpen className="h-7 w-7 text-black/25" /></div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-pixel text-[6px] text-[#258057]">READING NOTE {String(notes.length - index).padStart(2, '0')}</span>
                    <span className="text-[7.5px] text-black/35">{formatDate(note.updatedAt)}</span>
                  </div>
                  <blockquote className="my-1.5 line-clamp-3 text-[11px] font-medium leading-relaxed">“{note.excerpt}”</blockquote>
                  <div className="truncate text-[8.5px] text-black/50">{note.bookTitle || '未填写书名'}{note.author ? ` · ${note.author}` : ''}{note.page ? ` · ${note.page}` : ''}</div>
                </div>
              </div>
              {note.comment && <p className="mb-0 mt-2 border-l-2 border-[#00c978] pl-2 text-[9px] leading-relaxed text-black/60">{note.comment}</p>}
              {note.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{note.tags.map((tag) => <span key={tag} className="border border-black bg-[#f1f1f1] px-1.5 py-0.5 text-[7.5px]">#{tag}</span>)}</div>}
              <div className="mt-2 flex items-center justify-between border-t border-black/15 pt-2">
                <span className="text-[7.5px] text-black/40">{note.ocr.route === 'general-ocr-vision' ? 'Qwen + OCR LoRA' : note.ocr.route === 'base' ? 'Qwen Base' : '人工录入'} · {note.selectionMode === 'underline' ? '红线' : '双竖线'}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => edit(note)} className="flex items-center gap-1 border border-black bg-white px-2 py-1 text-[8px]"><Pencil className="h-3 w-3" /> 编辑文字</button>
                  <button onClick={() => void remove(note.id)} className={`flex items-center gap-1 border border-black px-2 py-1 text-[8px] ${deleteArmed === note.id ? 'bg-[#ff315f] text-white' : 'bg-white'}`}><Trash2 className="h-3 w-3" /> {deleteArmed === note.id ? '确认删除' : '删除'}</button>
                </div>
              </div>
            </article>
          ))}
        </main>
      )}

      {toast && <div className="absolute bottom-5 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap border-2 border-black bg-black px-3 py-2 font-pixel text-[7px] text-[#00ff88]">{toast}</div>}
    </div>
  );
}
