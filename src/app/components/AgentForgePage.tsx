import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Check, ChevronLeft, Database, Download, FileImage, FileText, LoaderCircle, MapPinned, PackageOpen, ShieldCheck, Trash2 } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFPageProxy } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { edgeSafe } from '../../../frost-agent/edge/contract';
import { useFrostTaskHandoff } from './FrostTaskHandoffFrame';
import { fetchWithDeadline } from '../lib/runtime/fetchWithDeadline';
import { visionRead } from '../lib/skills/visionRead';
import {
  activateDataPack,
  getDataPackState,
  installDataPackFromFile,
  installedDataPacks,
  isDataPackMapLayerEnabled,
  removeDataPack,
  setDataPackMapLayerEnabled,
  subscribeDataPacks,
  subscribeDataPackMapLayers,
  type InstalledDataPack,
  type MappingPackRecord,
} from '../lib/dataPack';
import { startAgentRun } from '../lib/observe/bus';
import RunTrace from './RunTrace';
import { loadForgeCheckpoint, saveForgeCheckpoint } from '../lib/mapping/checkpoint';
import { extractEpubText } from '../lib/mapping/epubText';
import { prepareDocumentCanvas } from '../lib/mapping/documentPreprocess';
import {
  adapterForVisualRoute,
  assessOcrCompleteness,
  buildMappingDataPack,
  dedupeOverlapText,
  fallbackPlaceCandidates,
  gazetteerPlaceCandidates,
  normalizeModelCandidates,
  parseLooseJson,
  resolveVisualRoute,
  routePdfPage,
  visibleCharacters,
  type ForgeBookMeta,
  type ForgeGazetteerPlace,
  type ForgeOcrBlock,
  type ForgePageEvidence,
  type ForgePlaceCandidate,
  type ForgeVisualRoute,
  type MappingDataPackBundle,
} from '../lib/mapping/forge';

GlobalWorkerOptions.workerSrc = pdfWorker;

const ACCENT = '#b388ff';
const VISION_BASE = 'Qwen3-VL-2B-Instruct-MNN';
const OCR_PROMPT_VERSION = 'general-document-ocr-transcription-v4-adaptive-horizontal';
const PIPELINE_VERSION = 'book-to-earth-mapping-v3-adaptive-horizontal-ocr';
const CANDIDATE_VERSION = 'guji-place-candidates-v3-reference-aligned';
const GUJI_GAZETTEER_URL = '/assets/skills/guji/place-gazetteer.compact.json';
let gujiGazetteerPromise: Promise<ForgeGazetteerPlace[]> | null = null;
type Phase = 'idle' | 'routing' | 'ocr' | 'text-review' | 'filtering' | 'review' | 'done' | 'error';
const PHASE_LABEL: Record<Phase, string> = { idle: '等待资料', routing: '载体路由', ocr: 'Qwen 端侧识读', 'text-review': '逐页校文', filtering: '地点筛选', review: '待人工确认', done: '已生成数据包', error: '需要处理' };

interface RuntimeStatus { checking: boolean; engine: string; visionReady: boolean; adapters: Record<string, { installed?: boolean }> }

async function loadGujiGazetteer(): Promise<ForgeGazetteerPlace[]> {
  if (!gujiGazetteerPromise) gujiGazetteerPromise = fetch(GUJI_GAZETTEER_URL).then(async (response) => {
    if (!response.ok) throw new Error(`古籍地点索引加载失败：${response.status}`);
    const document = await response.json();
    return Array.isArray(document?.places) ? document.places as ForgeGazetteerPlace[] : [];
  }).catch(() => []);
  return gujiGazetteerPromise;
}

function fileDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(file); });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
}

async function sha256(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function canvasSha256(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('页面图像编码失败')), 'image/png'));
  return sha256(await blob.arrayBuffer());
}

function reviewImage(canvas: HTMLCanvasElement): string {
  const scale = Math.min(1, 960 / Math.max(canvas.width, canvas.height, 1));
  const preview = document.createElement('canvas'); preview.width = Math.max(1, Math.round(canvas.width * scale)); preview.height = Math.max(1, Math.round(canvas.height * scale));
  preview.getContext('2d', { alpha: false })?.drawImage(canvas, 0, 0, preview.width, preview.height);
  return preview.toDataURL('image/jpeg', 0.72);
}

async function renderPdfPage(page: PDFPageProxy): Promise<HTMLCanvasElement> {
  const initial = page.getViewport({ scale: 1.5 }); const scale = Math.min(1, 1800 / Math.max(initial.width, initial.height)); const viewport = page.getViewport({ scale: 1.5 * scale });
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(viewport.width)); canvas.height = Math.max(1, Math.round(viewport.height));
  const canvasContext = canvas.getContext('2d', { alpha: false }); if (!canvasContext) throw new Error('浏览器没有可用的页面画布');
  await page.render({ canvasContext, viewport }).promise; return canvas;
}

async function imageCanvas(file: File): Promise<HTMLCanvasElement> {
  const image = await loadImage(await fileDataUrl(file)); const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d', { alpha: false })?.drawImage(image, 0, 0, canvas.width, canvas.height); return canvas;
}

function tileCanvas(canvas: HTMLCanvasElement): Array<{ image: string; polygon: ForgeOcrBlock['polygon']; index: number }> {
  const count = canvas.height / Math.max(canvas.width, 1) > 2.7 ? 3 : canvas.height / Math.max(canvas.width, 1) > 1.25 ? 2 : 1;
  if (count === 1) return [{ image: canvas.toDataURL('image/jpeg', 0.86), polygon: [0, 0, 1, 0, 1, 1, 0, 1], index: 0 }];
  const overlap = Math.round(canvas.height * 0.035); const height = Math.ceil(canvas.height / count);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.max(0, index * height - (index ? overlap : 0)); const end = Math.min(canvas.height, (index + 1) * height + (index + 1 < count ? overlap : 0));
    const tile = document.createElement('canvas'); tile.width = canvas.width; tile.height = Math.max(1, end - start); tile.getContext('2d')?.drawImage(canvas, 0, start, canvas.width, end - start, 0, 0, tile.width, tile.height);
    const top = start / canvas.height; const bottom = end / canvas.height;
    return { image: tile.toDataURL('image/jpeg', 0.88), polygon: [0, top, 1, top, 1, bottom, 0, bottom], index };
  });
}

function verificationCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height; const context = canvas.getContext('2d', { alpha: false });
  if (!context) return source; context.filter = 'grayscale(1) contrast(1.16)'; context.drawImage(source, 0, 0); context.filter = 'none'; return canvas;
}

async function classifyVisual(image: string, meta: ForgeBookMeta): Promise<ForgeVisualRoute> {
  const prompt = [
    '同时判断物理载体和文字内容。现代横排、简体重排或学术整理本，只要正文属于古籍、方志、旧志、古典文献，也必须标为 ancient-book，不能因横排而当普通文档。',
    'material：guji=传统刻本/抄本/线装影印原页；rubbing=碑刻现场或拓片；general=其他现代页面。',
    'textDomain：ancient-book=古籍、方志、古典文献正文（包括现代横排整理本）；modern-document=普通现代文档。',
    `用户填写的资料标题“${meta.title || '未填写'}”、作者“${meta.author || '未填写'}”、时代“${meta.era || '未填写'}”只作辅助，仍要核对可见内容。`,
    '只输出 JSON：{"material":"guji|rubbing|general","textDomain":"ancient-book|modern-document"}',
  ].join('\n');
  return resolveVisualRoute(parseLooseJson(await visionRead(image, prompt, { redact: false, detail: 'fast', maxTokens: 120, max: 700, timeoutMs: 45_000 })) || {});
}

function ocrPrompt(route: ForgeVisualRoute): string {
  const domain = route === 'guji' ? '古籍书页，保留竖排顺序与夹注' : route === 'guji-modern' ? '现代横排古籍整理本，保留古文原字、段落与页码' : route === 'rubbing' ? '碑刻或拓片，看不清的字写作□' : '普通文档或照片';
  return `逐字转录这张${domain}。不要总结、解释、翻译或补全；页码、水印与正文分行保留。完成最后一个可见字符后立即结束，只输出转录文本。`;
}

async function ocrCanvas(canvas: HTMLCanvasElement, route: ForgeVisualRoute, installed: Set<string>) {
  const adapter = adapterForVisualRoute(route); if (!installed.has(adapter)) throw new Error(`${adapter} 尚未安装；不会用共享基座冒充该 LoRA。`);
  const prepared = prepareDocumentCanvas(canvas); const working = prepared.canvas;
  const primaryImage = working.toDataURL('image/jpeg', 0.86);
  const detail = route === 'guji-modern' ? 'high' : 'ocr';
  const primary = await visionRead(primaryImage, ocrPrompt(route), { redact: false, adapter, detail, maxTokens: 1024, max: 16_000, timeoutMs: 120_000 });
  if (!primary) throw new Error(`${adapter} 没有返回识读结果，已失败闭合。`);
  const blocks: ForgeOcrBlock[] = [{ id: 'primary-1', text: primary, polygon: [0, 0, 1, 0, 1, 1, 0, 1], readingOrder: 0, tileIndex: 0, pass: 'primary' }];
  const initialGate = assessOcrCompleteness(primary, blocks, 1); const needsVerification = route === 'guji-modern' || initialGate.status !== 'pass' || visibleCharacters(primary).length >= 900;
  let verificationText: string | undefined;
  if (needsVerification) {
    const parts: string[] = [];
    for (const tile of tileCanvas(verificationCanvas(working))) {
      const text = await visionRead(tile.image, ocrPrompt(route), { redact: false, adapter, detail, maxTokens: 1024, max: 16_000, timeoutMs: 120_000 });
      parts.push(text); blocks.push({ id: `verify-${tile.index + 1}`, text, polygon: tile.polygon, readingOrder: tile.index, tileIndex: tile.index, pass: 'verification' });
    }
    verificationText = dedupeOverlapText(parts);
  }
  const gate = verificationText === undefined ? initialGate : assessOcrCompleteness(primary, blocks, 1, verificationText);
  const useVerification = gate.status !== 'pass' && verificationText && assessOcrCompleteness(verificationText, blocks.filter((block) => block.pass === 'verification'), Math.max(1, blocks.length - 1)).status === 'pass';
  const preprocess: NonNullable<ForgePageEvidence['preprocess']> = [
    { operation: 'bounded-deskew-crop', parameters: { skewDegrees: prepared.audit.skewDegrees, cropped: Boolean(prepared.audit.crop), outputWidth: working.width, outputHeight: working.height } },
    { operation: 'full-page-primary', parameters: { count: 1, preservesLayoutContext: true } },
    { operation: 'overlap-verification', parameters: { activated: needsVerification, count: Math.max(0, blocks.length - 1) } },
  ];
  return {
    text: useVerification ? verificationText! : primary, adapter, blocks,
    qualityGate: useVerification ? { ...assessOcrCompleteness(verificationText!, blocks.filter((block) => block.pass === 'verification'), Math.max(1, blocks.length - 1)), reasons: ['primary-degenerate-auto-retry'] } : gate,
    preprocess,
  };
}

function pageGroups(pages: ForgePageEvidence[]): ForgePageEvidence[][] {
  const groups: ForgePageEvidence[][] = []; let current: ForgePageEvidence[] = []; let size = 0;
  for (const page of pages) { const next = page.text.slice(0, 4200); if (current.length && size + next.length > 6200) { groups.push(current); current = []; size = 0; } current.push({ ...page, text: next }); size += next.length; }
  if (current.length) groups.push(current); return groups;
}

async function extractCandidates(pages: ForgePageEvidence[], meta: ForgeBookMeta, gazetteer: ForgeGazetteerPlace[]): Promise<ForgePlaceCandidate[]> {
  const known = gazetteerPlaceCandidates(pages, gazetteer, meta.city, meta.title);
  const all: ForgePlaceCandidate[] = [];
  for (const group of pageGroups(pages)) {
    const source = group.map((page) => `【第${page.page}页】\n${page.text}`).join('\n');
    const raw = await edgeSafe.chat([`资料标题：${meta.title}；目标城市：${meta.city || '不限'}；目的：${meta.purpose || '把内容落到地球'}；偏好：${meta.preferences || '未指定'}。`, '找出资料里的全部地点实体，有几个列几个，不要只给一个。篇名、书名、章节名、人物、事件和普通名词不是地点；不得生成坐标，不得改写地名。', '每条 nameAsWritten 必须逐字出现在引用页；context 必须是包含该地名的原文短句。输出 JSON：{"claims":[{"nameAsWritten":"","page":1,"context":"原文短句","relation":"scene|mentioned|route|subject"}]}', source].join('\n'), { json: true, system: '你是 Qwen 端侧文献地点筛选器。宁可漏选也不把标题或普通名词伪装成地点，只输出有原文证据的 JSON。' });
    all.push(...normalizeModelCandidates(parseLooseJson(raw)?.claims, group));
  }
  // 小模型可能漏列或把篇名当地点。确定性原文扫描只补“候选”，坐标和人工闸门仍是硬要求。
  const titleKey = meta.title.normalize('NFKC').replace(/[《》\s]/gu, '');
  const pageByNumber = new Map(pages.map((page) => [page.page, page.text]));
  const merged = [...known, ...all, ...(known.length ? [] : fallbackPlaceCandidates(pages))].map((item) => {
    const withoutNegativeLead = item.name.replace(/^(?:不应凭空补写|不要补写|禁止补写|并非|不是)/u, '');
    const withoutCity = meta.city && withoutNegativeLead.startsWith(meta.city) && withoutNegativeLead.length - meta.city.length >= 2 ? withoutNegativeLead.slice(meta.city.length) : withoutNegativeLead;
    return withoutCity === item.name ? item : { ...item, name: withoutCity };
  }).filter((item) => {
    const key = item.name.normalize('NFKC').replace(/[《》\s]/gu, '');
    const source = pageByNumber.get(item.page) || '';
    if (key === titleKey || source.includes(`《${item.name}》`)) return false;
    if (/^(?:人工|质量|审核|确认|协议|数据|候选|模型)(?:闸门|门禁|关卡)$/u.test(item.name)) return false;
    if (/地点$/u.test(item.name) || /(?:原文|正文|页码|引用|候选|数据包).{0,4}地点|地点.{0,4}(?:原文|正文|页码|引用|候选|数据包)/u.test(item.name)) return false;
    const escaped = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:不应|不要|并非|禁止|凭空)[^。；\\n]{0,28}${escaped}`, 'u').test(item.context)) return false;
    return true;
  });
  const pruned = merged.filter((item, index) => !merged.some((other, otherIndex) => otherIndex !== index && other.page === item.page && item.name.length > other.name.length && item.name.includes(other.name) && other.name.length >= 2));
  const unique = new Map<string, ForgePlaceCandidate>();
  for (const item of pruned) {
    const key = `${item.name.normalize('NFKC')}:${item.page}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].slice(0, 40).map((item, index) => ({ ...item, id: `claim-${index + 1}` }));
}

function localMappingHit(name: string, city: string): { lat: number; lng: number; label: string } | null {
  const records = (getDataPackState('mapping').active?.records || []) as MappingPackRecord[];
  const compact = (value: string) => value.normalize('NFKC').replace(/[\s·・—－()（）]/g, '').toLowerCase();
  const target = compact(name); const cityTarget = compact(city);
  for (const record of records) for (const location of record.locations) {
    if (compact(location.name) === target && (!cityTarget || compact(record.city).includes(cityTarget))) return { lat: location.lat, lng: location.lng, label: `${location.name}｜${record.title}` };
  }
  return null;
}

async function qwenResolveCandidates(candidates: ForgePlaceCandidate[], meta: ForgeBookMeta): Promise<ForgePlaceCandidate[]> {
  if (!candidates.length) return candidates;
  try {
    const response = await fetchWithDeadline('/api/frost-llm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task: 'mapping-place-resolve', json: true, system: '你是谨慎的中国地名检索助手。只给可复核的现代检索候选，不生成经纬度；没有证据就 unresolved。只输出 JSON。', prompt: [`目标城市：${meta.city || '不限'}；时代：${meta.era || '待考'}。`, '为候选地名给出现代地图检索词、简短依据和最多 3 个中国大陆可直访的可靠 HTTPS 来源。不得改写原文地名或声称已确址。', '输出 {"items":[{"id":"","status":"candidate|unresolved","modernQuery":"","rationale":"","sourceUrls":[]}]}', JSON.stringify(candidates.map((item) => ({ id: item.id, nameAsWritten: item.name, page: item.page, context: item.context.slice(0, 220) })))].join('\n') }), signal: AbortSignal.timeout(35_000) }, 36_000);
    const data = await response.json(); const parsed = parseLooseJson(String(data?.text || '')); const items = Array.isArray(parsed?.items) ? parsed.items as Array<Record<string, unknown>> : [];
    const byId = new Map(items.map((item) => [String(item.id || ''), item]));
    return candidates.map((candidate) => {
      const item = byId.get(candidate.id); if (!item || item.status !== 'candidate') return candidate;
      const sourceUrls = Array.isArray(item.sourceUrls) ? item.sourceUrls.filter((url): url is string => typeof url === 'string' && /^https:\/\//.test(url)).slice(0, 3) : [];
      return { ...candidate, resolutionSource: 'qwen-search', cloudResolution: { modernQuery: String(item.modernQuery || candidate.name), rationale: String(item.rationale || ''), sourceUrls, model: String(data?.model || 'Qwen') } };
    });
  } catch { return candidates; }
}

async function geocodeCandidates(candidates: ForgePlaceCandidate[], city: string): Promise<ForgePlaceCandidate[]> {
  const output: ForgePlaceCandidate[] = [];
  for (const candidate of candidates) {
    if (Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng)) { output.push(candidate); continue; }
    const local = localMappingHit(candidate.name, city);
    if (local) { output.push({ ...candidate, ...local, geocodeName: local.label, resolutionSource: 'local-gazetteer' }); continue; }
    try {
      const query = candidate.cloudResolution?.modernQuery || candidate.name;
      const response = await fetchWithDeadline(`/api/travel-mcp?tool=geocode&q=${encodeURIComponent(`${query} ${city}`)}`, {}, 12_000); const data = await response.json(); const lat = Number(data?.lat); const lng = Number(data?.lng); const geocodeName = String(data?.name || query);
      const compact = (value: string) => value.normalize('NFKC').replace(/[\s·・—－()（）]/g, '').toLowerCase();
      const target = compact(candidate.name); const hit = compact(geocodeName); const plausible = hit.includes(target) || target.includes(hit);
      output.push(Number.isFinite(lat) && Number.isFinite(lng) && plausible ? { ...candidate, lat, lng, geocodeName, resolutionSource: candidate.resolutionSource === 'qwen-search' ? 'qwen-search' : 'osm' } : candidate);
    } catch { output.push(candidate); }
  }
  return output;
}

function downloadJson(name: string, value: unknown) {
  const href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = href; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function packFileName(bundle: MappingDataPackBundle) { return `${bundle.identity.id}-${bundle.identity.version}.pocket-data.json`; }

export default function AgentForgePage({ onBack }: { onBack: () => void }) {
  const handoffObjective = useFrostTaskHandoff()?.objective || '';
  const [, render] = useReducer((value) => value + 1, 0);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<ForgeBookMeta>({ city: '', title: '', author: '', era: '', purpose: handoffObjective || '把书中人物、地点与事件落到私人地球', preferences: '' });
  const [phase, setPhase] = useState<Phase>('idle'); const [error, setError] = useState(''); const [progress, setProgress] = useState({ current: 0, total: 0, note: '' });
  const [pages, setPages] = useState<ForgePageEvidence[]>([]); const [candidates, setCandidates] = useState<ForgePlaceCandidate[]>([]); const [sourceHash, setSourceHash] = useState('');
  const [runId, setRunId] = useState<string | null>(null); const [bundle, setBundle] = useState<MappingDataPackBundle | null>(null); const [packs, setPacks] = useState<InstalledDataPack[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus>({ checking: true, engine: 'stub', visionReady: false, adapters: {} }); const cancelled = useRef(false);

  const refreshPacks = async () => setPacks(await installedDataPacks('mapping'));
  useEffect(() => { void refreshPacks(); const a = subscribeDataPacks(() => { render(); void refreshPacks(); }); const b = subscribeDataPackMapLayers(render); return () => { a(); b(); }; }, []);
  useEffect(() => {
    let alive = true;
    fetch('/api/edge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task: 'runtime_status' }) }).then((response) => response.json()).then((data) => {
      const value = data?.runtime || {}; if (alive) setRuntime({ checking: false, engine: String(value.engine || data?.backend || 'stub'), visionReady: Boolean(value.visionReady), adapters: value.adapters || {} });
    }).catch(() => { if (alive) setRuntime((value) => ({ ...value, checking: false })); });
    return () => { alive = false; };
  }, []);

  const routeCounts = useMemo(() => ({ text: pages.filter((page) => page.route === 'structure').length, guji: pages.filter((page) => page.visualRoute === 'guji' || page.visualRoute === 'guji-modern').length, rubbing: pages.filter((page) => page.visualRoute === 'rubbing').length, general: pages.filter((page) => page.visualRoute === 'general').length, review: pages.filter((page) => page.qualityGate?.status !== 'pass').length }), [pages]);
  const installed = new Set(Object.entries(runtime.adapters).filter(([, value]) => value?.installed).map(([name]) => name));

  const persist = async (nextPages: ForgePageEvidence[], nextCandidates: ForgePlaceCandidate[] = [], checkpointHash = sourceHash) => {
    if (checkpointHash && file) await saveForgeCheckpoint({ sourceSha256: checkpointHash, sourceName: file.name, meta, pages: nextPages, candidates: nextCandidates, candidateVersion: CANDIDATE_VERSION });
  };

  const finishFiltering = async (nextPages: ForgePageEvidence[], run: ReturnType<typeof startAgentRun>, checkpointHash = sourceHash) => {
    setPhase('filtering'); setProgress({ current: 0, total: nextPages.length, note: 'Qwen 基座从原文筛选可逐字核验的地点候选' }); run.phase('原文证据筛选', 'Qwen 端侧基座');
    const gazetteer = await loadGujiGazetteer(); run.phase('古籍地点索引', `上街去 · ${gazetteer.length} 条可替换地点`);
    let next = await extractCandidates(nextPages, meta, gazetteer); if (cancelled.current) throw new Error('已取消');
    run.phase('现代坐标候选', '本地 Data Pack → OpenStreetMap'); next = await geocodeCandidates(next, meta.city);
    const unresolved = next.filter((item) => !Number.isFinite(item.lat) || !Number.isFinite(item.lng));
    if (unresolved.length) {
      run.phase('疑难地名增强', `阿里云 Qwen · ${unresolved.length} 个未解析候选`);
      const enriched = await qwenResolveCandidates(unresolved, meta); const byId = new Map(enriched.map((item) => [item.id, item]));
      next = next.map((item) => byId.get(item.id) || item); next = await geocodeCandidates(next, meta.city);
    }
    setCandidates(next); await persist(nextPages, next, checkpointHash); setPhase('review'); setProgress({ current: next.length, total: next.length, note: '自动化止于草稿：请确认原文、地点状态与坐标' }); run.phase('人工确址闸门', `${next.length} 个候选待确认`); run.end(true);
  };

  const run = async () => {
    if (!file || !meta.title.trim()) return;
    cancelled.current = false; setError(''); setPages([]); setCandidates([]); setBundle(null);
    const trace = startAgentRun(`内容 Mapping · ${meta.title.slice(0, 18)}`); setRunId(trace.runId);
    try {
      const bytes = await file.arrayBuffer(); const sourceSha = await sha256(bytes); setSourceHash(sourceSha); trace.phase('底本指纹与断点', 'SHA256 · 本地 IndexedDB');
      const storedCheckpoint = await loadForgeCheckpoint(sourceSha); const checkpoint = storedCheckpoint?.pages.every((page) => page.pipelineVersion === PIPELINE_VERSION) ? storedCheckpoint : null; const nextPages: ForgePageEvidence[] = checkpoint?.pages || [];
      if (checkpoint?.candidates.length && checkpoint.candidateVersion === CANDIDATE_VERSION) { setPages(nextPages); setCandidates(checkpoint.candidates); setPhase('review'); trace.phase('恢复人工确认草稿', `${checkpoint.candidates.length} 个候选`); trace.end(true); return; }
      if (checkpoint?.pages.length) {
        setPages(nextPages);
        const gated = nextPages.filter((page) => page.qualityGate?.status !== 'pass');
        if (gated.length) { setPhase('text-review'); setError(`完整性门禁暂停在第 ${gated.map((page) => page.page).join('、')} 页。请对照原页校文，确认前不会筛选地点。`); trace.phase('恢复 OCR 校文断点', `${gated.length} 页待确认`); return; }
        trace.phase('复用已核 OCR', `${nextPages.length} 页 · 重新运行地点索引`); await finishFiltering(nextPages, trace, sourceSha); return;
      }
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        setPhase('routing'); const pdf = await getDocument({ data: bytes.slice(0) }).promise; setProgress({ current: nextPages.length, total: pdf.numPages, note: '逐页检查可靠文字层；扫描页才进入视觉 LoRA' }); trace.phase('PDF 逐页载体路由', `${pdf.numPages} 页 · 文字层优先`);
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled.current) throw new Error('已取消'); if (nextPages.some((page) => page.page === pageNumber)) continue;
          const page = await pdf.getPage(pageNumber); const content = await page.getTextContent(); const text = content.items.map((item) => String((item as { str?: string }).str || '')).join(' ').trim(); const route = routePdfPage(text, content.items.length);
          if (route === 'structure') nextPages.push({ page: pageNumber, pipelineVersion: PIPELINE_VERSION, route, text, source: 'pdf-text-layer', sourceRef: `第 ${pageNumber} 页`, sourceSha256: sourceSha, blocks: [{ id: `pdf-text-${pageNumber}`, text, polygon: [0, 0, 1, 0, 1, 1, 0, 1], readingOrder: 0, tileIndex: 0, pass: 'primary' }], qualityGate: assessOcrCompleteness(text, [{ id: `pdf-text-${pageNumber}`, text, polygon: [0, 0, 1, 0, 1, 1, 0, 1], readingOrder: 0, tileIndex: 0, pass: 'primary' }], 1) });
          else {
            if (!runtime.visionReady) throw new Error(`第 ${pageNumber} 页需要 OCR，但 Qwen3-VL 端侧运行时尚未就绪。`);
            setPhase('ocr'); const canvas = await renderPdfPage(page); const visualRoute = await classifyVisual(canvas.toDataURL('image/jpeg', 0.82), meta); trace.phase(`第 ${pageNumber} 页 ${visualRoute} 路由`, `${adapterForVisualRoute(visualRoute)} + ${VISION_BASE}`); const result = await ocrCanvas(canvas, visualRoute, installed);
            nextPages.push({ page: pageNumber, pipelineVersion: PIPELINE_VERSION, route, text: result.text, visualRoute, adapter: result.adapter, source: 'edge-vision', sourceSha256: sourceSha, renderedSha256: await canvasSha256(canvas), baseModel: VISION_BASE, reviewImage: reviewImage(canvas), promptVersion: OCR_PROMPT_VERSION, blocks: result.blocks, preprocess: result.preprocess, qualityGate: result.qualityGate });
          }
          setPages([...nextPages]); await saveForgeCheckpoint({ sourceSha256: sourceSha, sourceName: file.name, meta, pages: nextPages, candidates: [], candidateVersion: CANDIDATE_VERSION }); setProgress({ current: pageNumber, total: pdf.numPages, note: `第 ${pageNumber} 页完成并保存断点` }); page.cleanup();
        }
        await pdf.destroy();
      } else if (file.type.startsWith('image/')) {
        if (!runtime.visionReady) throw new Error('图片需要 OCR，但 Qwen3-VL 端侧运行时尚未就绪。');
        setPhase('ocr'); const canvas = await imageCanvas(file); const visualRoute = await classifyVisual(canvas.toDataURL('image/jpeg', 0.82), meta); trace.phase(`${visualRoute} 载体路由`, `${adapterForVisualRoute(visualRoute)} + ${VISION_BASE}`); const result = await ocrCanvas(canvas, visualRoute, installed);
        nextPages.push({ page: 1, pipelineVersion: PIPELINE_VERSION, route: 'ocr', text: result.text, visualRoute, adapter: result.adapter, source: 'edge-vision', sourceSha256: sourceSha, renderedSha256: await canvasSha256(canvas), baseModel: VISION_BASE, reviewImage: reviewImage(canvas), promptVersion: OCR_PROMPT_VERSION, blocks: result.blocks, preprocess: result.preprocess, qualityGate: result.qualityGate }); setPages([...nextPages]); await saveForgeCheckpoint({ sourceSha256: sourceSha, sourceName: file.name, meta, pages: nextPages, candidates: [], candidateVersion: CANDIDATE_VERSION });
      } else if (lower.endsWith('.epub') || file.type === 'application/epub+zip') {
        const chapters = await extractEpubText(bytes); trace.phase('EPUB 结构解析', `${chapters.length} 个 spine 章节`);
        chapters.forEach((chapter, index) => { const block: ForgeOcrBlock = { id: `epub-${index + 1}`, text: chapter.text, polygon: [0, 0, 1, 0, 1, 1, 0, 1], readingOrder: 0, tileIndex: 0, pass: 'primary' }; nextPages.push({ page: index + 1, pipelineVersion: PIPELINE_VERSION, route: 'structure', text: chapter.text, source: 'epub-text', sourceRef: chapter.href, sourceSha256: sourceSha, blocks: [block], qualityGate: assessOcrCompleteness(chapter.text, [block], 1) }); }); setPages([...nextPages]);
      } else {
        const text = new TextDecoder().decode(bytes); const block: ForgeOcrBlock = { id: 'plain-text-1', text, polygon: [0, 0, 1, 0, 1, 1, 0, 1], readingOrder: 0, tileIndex: 0, pass: 'primary' }; nextPages.push({ page: 1, pipelineVersion: PIPELINE_VERSION, route: 'structure', text, source: 'plain-text', sourceSha256: sourceSha, blocks: [block], qualityGate: assessOcrCompleteness(text, [block], 1) }); setPages([...nextPages]); trace.phase('纯文本解析', `${visibleCharacters(text).length} 字符`);
      }
      if (!nextPages.some((page) => page.text.trim())) throw new Error('没有取得可筛选的文字，请检查底本或模型状态。');
      const gated = nextPages.filter((page) => page.qualityGate?.status !== 'pass');
      if (gated.length) { setPhase('text-review'); setError(`完整性门禁暂停在第 ${gated.map((page) => page.page).join('、')} 页。请对照原页校文，确认前不会筛选地点。`); trace.phase('OCR 完整性门禁', `${gated.length} 页待人工校文`); return; }
      await finishFiltering(nextPages, trace, sourceSha);
    } catch (reason) { const message = reason instanceof Error ? reason.message : String(reason); setPhase(message === '已取消' ? 'idle' : 'error'); setError(message === '已取消' ? '任务已取消，断点已保留。' : message); trace.end(false); }
  };

  const updatePageText = (pageNumber: number, text: string) => setPages((items) => items.map((page) => page.page === pageNumber ? { ...page, text, humanReview: { originalText: page.humanReview?.originalText ?? page.text, editedText: text }, qualityGate: page.qualityGate ? { ...page.qualityGate, status: 'review', reasons: [...new Set([...page.qualityGate.reasons, 'human-edit-pending'])] } : page.qualityGate } : page));
  const confirmPageText = (pageNumber: number) => setPages((items) => items.map((page) => page.page === pageNumber ? { ...page, humanReview: { originalText: page.humanReview?.originalText ?? page.text, editedText: page.text, reviewedAt: new Date().toISOString(), reason: '人工对照原页确认' }, qualityGate: page.qualityGate ? { ...page.qualityGate, status: 'pass', reasons: [...new Set([...page.qualityGate.reasons.filter((reason) => reason !== 'human-edit-pending'), 'human-reviewed'])] } : page.qualityGate } : page));
  const continueAfterTextReview = async () => { if (pages.some((page) => page.qualityGate?.status !== 'pass')) { setError('仍有页面未完成人工校文。'); return; } const trace = startAgentRun(`内容 Mapping · ${meta.title.slice(0, 18)} · 续跑`); setRunId(trace.runId); setError(''); try { await persist(pages); await finishFiltering(pages, trace); } catch (reason) { setPhase('error'); setError(reason instanceof Error ? reason.message : String(reason)); trace.end(false); } };
  const patchCandidate = (id: string, patch: Partial<ForgePlaceCandidate>) => setCandidates((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));

  const forge = async () => {
    if (!file || !sourceHash) return; const nextBundle = buildMappingDataPack(meta, candidates, { name: file.name, sha256: sourceHash });
    if (!nextBundle.records[0].locations.length) { setError('至少确认一个有坐标的地点，才能生成 Data Pack。'); return; }
    try {
      const json = JSON.stringify(nextBundle, null, 2); const installedPack = await installDataPackFromFile('mapping', new File([json], packFileName(nextBundle), { type: 'application/json' })); setDataPackMapLayerEnabled('mapping', true); setBundle(nextBundle); setPhase('done'); setError('');
      const portablePages = pages.map((page) => { const value = { ...page }; delete value.reviewImage; return value; });
      downloadJson(`${nextBundle.identity.id}.evidence.json`, { format: 'pocket-mapping-evidence/v1', dataPack: installedPack.packKey, source: { name: file.name, sha256: sourceHash }, meta, carrierAudit: { pageCount: pages.length, ...routeCounts }, pages: portablePages, claims: candidates, gates: { ocrCompletenessPassed: pages.every((page) => page.qualityGate?.status === 'pass'), historicalPlacesHumanConfirmed: true, rightsChecked: false, publicReleaseAllowed: false } });
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  const busy = ['routing', 'ocr', 'filtering'].includes(phase); const inputClass = 'w-full border-2 border-black bg-white px-2 py-2 text-[11px] outline-none focus:bg-[#f7f1df]';
  return (
    <div className="h-full overflow-y-auto bg-[#eaeaea] font-sans">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center border-2 border-black bg-white shadow-[1px_1px_0_#000]" aria-label="返回 Skills"><ChevronLeft className="h-4 w-4" strokeWidth={3} /></button>
        <div className="min-w-0"><h1 className="font-pixel text-[11px] tracking-wider">BOOK-TO-EARTH</h1><p className="mt-0.5 text-[8px] text-black/45">内容落地球 · 古籍只是专业预设</p></div>
        <span className="ml-auto border-2 border-black bg-black px-2 py-1 font-pixel text-[6px] text-[#7CFF6B]">{PHASE_LABEL[phase]}</span>
      </header>
      <div className="border-b-2 border-black bg-black px-4 py-2 font-pixel text-[7px] tracking-widest text-[#00ff88]">SKILL 固定保留 · DATA PACK 可独立加载 / 卸载</div>
      <main className="space-y-3 p-3">
        <section className="border-2 border-black bg-[#f7f1df] p-3 shadow-[3px_3px_0_#b388ff]">
          <div className="flex items-start gap-2"><ShieldCheck className="h-5 w-5 shrink-0" style={{ color: ACCENT }} /><div className="min-w-0 flex-1"><h2 className="font-pixel text-[9px]">一本资料进去 · 可审核地图出来</h2><p className="mt-1 text-[9px] leading-relaxed text-black/60">PDF 文字层优先；扫描页由 Qwen3‑VL + 古籍 / 碑拓 / 通用 LoRA 识读。地点必须带原文、页码、坐标与人工确认，最终生成独立 pocket.mapping/v1 Data Pack。</p></div></div>
          <div className="mt-2 flex items-center gap-2 border-t border-black/20 pt-2 text-[8px]"><Database className="h-3.5 w-3.5" /><b>{VISION_BASE} + ROUTED LoRA</b><span className="ml-auto border border-black px-1.5 py-0.5" style={{ color: runtime.visionReady ? '#187c4b' : '#a33' }}>{runtime.checking ? '检查中' : runtime.visionReady ? `${runtime.engine} 已就绪` : '文字资料可用 · OCR 未就绪'}</span></div>
        </section>

        <section className="space-y-2 border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_#000]">
          <label className="flex min-h-20 cursor-pointer items-center gap-3 border-2 border-dashed border-black bg-[#f7f1df] p-3">
            {file?.type.startsWith('image/') ? <FileImage className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
            <span className="min-w-0 flex-1"><b className="block truncate text-[11px]">{file?.name || '选择 PDF、EPUB、图片、TXT 或 Markdown'}</b><small className="mt-1 block text-[8px] text-black/45">原图只进端侧；疑难地名增强只发送地名、时代与必要短句</small></span>
            <input type="file" accept="application/pdf,application/epub+zip,image/*,.epub,.txt,.md,text/plain" className="hidden" disabled={busy} onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next); setMeta((value) => ({ ...value, title: value.title || next?.name.replace(/\.[^.]+$/, '') || '' })); setPhase('idle'); setError(''); setPages([]); setCandidates([]); }} />
          </label>
          <div className="grid grid-cols-2 gap-2"><input className={inputClass} value={meta.title} onChange={(event) => setMeta({ ...meta, title: event.target.value })} placeholder="书名 / 资料名" /><input className={inputClass} value={meta.city} onChange={(event) => setMeta({ ...meta, city: event.target.value })} placeholder="目标城市（可留空）" /><input className={inputClass} value={meta.author} onChange={(event) => setMeta({ ...meta, author: event.target.value })} placeholder="作者（可待考）" /><input className={inputClass} value={meta.era} onChange={(event) => setMeta({ ...meta, era: event.target.value })} placeholder="时代（可待考）" /></div>
          <input className={inputClass} value={meta.purpose} onChange={(event) => setMeta({ ...meta, purpose: event.target.value })} placeholder="建立什么城市知识？" /><input className={inputClass} value={meta.preferences} onChange={(event) => setMeta({ ...meta, preferences: event.target.value })} placeholder="偏好：桥梁、水系、园林、人物行迹……" />
          <button disabled={!file || busy || !meta.title.trim()} onClick={() => void run()} className="flex w-full items-center justify-center gap-2 border-2 border-black py-2.5 font-pixel text-[8px] text-black shadow-[2px_2px_0_#000] disabled:opacity-40" style={{ background: ACCENT }}>{busy ? <><LoaderCircle className="h-4 w-4 animate-spin" />{PHASE_LABEL[phase]} {progress.total ? `${progress.current}/${progress.total}` : ''}</> : '▶ 开始 Mapping · 自动跑到人工审核'}</button>
          {busy && <button onClick={() => { cancelled.current = true; }} className="w-full border border-black py-1.5 font-pixel text-[6px]">安全停止并保留断点</button>}
          {progress.note && <p className="text-[9px] text-black/55">{progress.note}</p>}{error && <p className="border-2 border-black bg-[#fff0ea] p-2 text-[9px] font-bold text-[#a52d20]">{error}</p>}
        </section>

        <RunTrace runId={runId} collapseWhenDone />
        {pages.length > 0 && <section className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_#000]"><div className="font-pixel text-[8px]">载体与模型路由</div><div className="mt-2 grid grid-cols-5 gap-1 text-center text-[8px]">{Object.entries(routeCounts).map(([key, value]) => <div key={key} className="border border-black bg-[#f7f1df] p-1.5"><b className="block text-[12px]">{value}</b>{key}</div>)}</div></section>}

        {phase === 'text-review' && <section className="space-y-2 border-2 border-black bg-[#fff0ae] p-2.5 shadow-[2px_2px_0_#000]"><div className="font-pixel text-[8px]">OCR 完整性门禁 · 逐页校文</div>{pages.filter((page) => page.qualityGate?.status !== 'pass' || page.humanReview).map((page) => <article key={page.page} className="border-2 border-black bg-white p-2"><div className="flex items-center gap-2"><b className="font-pixel text-[7px]">第 {page.page} 页</b><span className="text-[7px] text-black/45">{page.adapter || page.source} · {page.qualityGate?.reasons.join(' / ')}</span></div><div className="mt-2 grid gap-2 sm:grid-cols-2">{page.reviewImage ? <img src={page.reviewImage} className="max-h-72 w-full border-2 border-black object-contain" alt={`第 ${page.page} 页原页`} /> : <div className="grid min-h-36 place-items-center border-2 border-dashed border-black/30 text-[8px]">可靠文字层</div>}<textarea className="min-h-72 border-2 border-black p-2 font-mono text-[9px]" value={page.text} onChange={(event) => updatePageText(page.page, event.target.value)} /></div><button onClick={() => confirmPageText(page.page)} className="mt-2 border-2 border-black bg-[#7CFF6B] px-3 py-1.5 font-pixel text-[7px]">已对照原页，确认本页文本</button></article>)}<button disabled={pages.some((page) => page.qualityGate?.status !== 'pass')} onClick={() => void continueAfterTextReview()} className="w-full border-2 border-black bg-black py-2.5 font-pixel text-[7px] text-[#7CFF6B] disabled:opacity-35">全部校文完成 · 继续地点筛选</button></section>}

        {candidates.length > 0 && <section className="space-y-2 border-2 border-black bg-[#f7f1df] p-2.5 shadow-[2px_2px_0_#000]"><div><div className="font-pixel text-[8px]">人工闸门 · {candidates.filter((item) => item.confirmed).length}/{candidates.length} 已确认</div><p className="mt-1 text-[8px] text-black/50">现代坐标只是候选，不等于历史确址；只有勾选项会写进 Data Pack。</p></div>{candidates.map((candidate) => <article key={candidate.id} className="border-2 border-black bg-white p-2"><div className="flex items-start gap-2"><input type="checkbox" checked={candidate.confirmed} disabled={!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)} onChange={(event) => patchCandidate(candidate.id, { confirmed: event.target.checked })} /><div className="min-w-0 flex-1"><b className="text-[11px]">{candidate.name}</b><span className="ml-2 font-pixel text-[5px] text-black/40">P.{candidate.page} · {candidate.relation}</span><p className="mt-1 text-[8.5px] leading-relaxed text-black/60">{candidate.context}</p></div></div><div className="mt-2 grid grid-cols-[1fr_1fr_88px] gap-1"><input className={inputClass} value={candidate.lng ?? ''} onChange={(event) => patchCandidate(candidate.id, { lng: Number(event.target.value), resolutionSource: 'manual' })} placeholder="经度" /><input className={inputClass} value={candidate.lat ?? ''} onChange={(event) => patchCandidate(candidate.id, { lat: Number(event.target.value), resolutionSource: 'manual' })} placeholder="纬度" /><select className="border-2 border-black bg-white px-1 text-[9px]" value={candidate.status} onChange={(event) => patchCandidate(candidate.id, { status: event.target.value as ForgePlaceCandidate['status'] })}><option value="memory-only">待考/已失</option><option value="extant">尚存</option><option value="rebuilt">重建</option></select></div>{candidate.geocodeName && <p className="mt-1 text-[7.5px] text-black/40">坐标候选：{candidate.geocodeName}</p>}{candidate.cloudResolution && <p className="mt-1 border-l-2 pl-2 text-[7.5px] text-black/50" style={{ borderColor: ACCENT }}>Qwen：{candidate.cloudResolution.rationale || '待人工核验'} · {candidate.cloudResolution.sourceUrls.length} 个来源</p>}</article>)}<button onClick={() => void forge()} className="flex w-full items-center justify-center gap-2 border-2 border-black bg-black py-2.5 font-pixel text-[8px] text-[#7CFF6B] shadow-[2px_2px_0_#b388ff]"><MapPinned className="h-4 w-4" />确认并装入内容地图 Data Pack</button></section>}

        {bundle && <section className="border-2 border-black bg-[#e9ddff] p-3 shadow-[3px_3px_0_#000]"><div className="flex items-center gap-2 font-pixel text-[8px]"><Check className="h-4 w-4" />已安装并落地图：{bundle.identity.name}</div><div className="mt-2 flex gap-2"><button onClick={() => downloadJson(packFileName(bundle), bundle)} className="flex flex-1 items-center justify-center gap-1 border-2 border-black bg-white py-2 text-[9px] font-bold"><Download className="h-4 w-4" />下载 Data Pack</button></div></section>}

        <section className="border-2 border-black bg-white shadow-[2px_2px_0_#000]"><div className="flex items-center gap-2 border-b-2 border-black px-2.5 py-2"><PackageOpen className="h-4 w-4" style={{ color: ACCENT }} /><b className="text-[10px]">已装内容地图</b><span className="ml-auto font-pixel text-[7px]" style={{ color: ACCENT }}>{packs.length} PACKS</span></div>{packs.length === 0 ? <p className="p-3 text-[9px] text-black/45">还没有内容 Mapping Data Pack；Skill 本身仍可随时使用。</p> : packs.map((pack) => { const active = getDataPackState('mapping').active?.packKey === pack.packKey; const mapped = active && isDataPackMapLayerEnabled('mapping'); return <div key={pack.packKey} className="flex items-center gap-2 border-b border-black/15 p-2.5 last:border-0"><span className="h-8 w-1.5" style={{ background: active ? ACCENT : '#ddd' }} /><div className="min-w-0 flex-1"><b className="block truncate text-[10px]">{pack.manifest.identity.name}</b><span className="text-[8px] text-black/45">{pack.manifest.schema.record_count} 份资料 · {(pack.records as MappingPackRecord[]).reduce((sum, record) => sum + record.locations.length, 0)} 个地点</span></div>{active ? <button onClick={() => setDataPackMapLayerEnabled('mapping', !mapped)} className="border-2 border-black px-2 py-1 text-[8px] font-bold" style={{ background: mapped ? ACCENT : '#fff' }}>{mapped ? '地图 ON' : '落位地图'}</button> : <button onClick={() => void activateDataPack(pack.packKey)} className="border-2 border-black px-2 py-1 text-[8px] font-bold">使用</button>}<button aria-label="卸载数据包" onClick={() => void removeDataPack(pack.packKey)} className="grid h-7 w-7 place-items-center border border-black text-[#b33]"><Trash2 className="h-3.5 w-3.5" /></button></div>; })}</section>
        <p className="pb-3 text-center text-[8px] text-black/35">Skill 能力不会随 Data Pack 卸载 · 原文与证据默认仅保存在本地</p>
      </main>
    </div>
  );
}
