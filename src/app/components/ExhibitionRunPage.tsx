// exhibition-agent 运行页 —— 看展搭子。
// 一句话/拍展签 → 端侧 Qwen/MNN 认字 → Qwen 云端可选补全 → 出「展品草稿」→ 确认钉回展馆坐标。
// 顶部二级 tab：集邮（展品流）| 时间线（文化层叠压）。展品卡可点开详情；草稿卡可加真实展品照。
import { useCallback, useReducer, useRef, useState, useEffect } from 'react';
import { ChevronLeft, Landmark, Camera, Star, MapPin, Loader2, Check, Clock, Grid3x3, CalendarDays, ImagePlus, X, Cloud, Sparkles } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { getUserMarksByKind, subscribeUserMarks, removeUserMark, type UserMark } from '../data/userMarks';
import { runExhibitionAgent, confirmPin, archiveOnly, recordRatingFix, recordPlaceFix, GEO_LABEL, GEO_COLOR, createQwenOwnedGpuCompetitionDemoDraft, artifactKey, createCuratorNotes, allVenues, addCustomVenue, matchVenue, hasRenderableSplat, attachFull3D, deleteFull3DCapture, full3DOf, ownedGpu3dgsAvailable, readOwnedGpu3DGS, removeFull3D, representationsOf, saveFull3DCapture, submitOwnedGpu3DGS, viewingAsset, type ArtifactDraft, type ExhibitionPhase, type Splat3D, type VenueType } from '../lib/exhibition';
import { resolvePlace } from '../lib/skills/resolvePlace';
import { requestMapFocus } from '../data/mapFocus';
import { putSplat, getSplatObjectUrl, deleteSplat, normalizeSplatFormat, splatImportFormatErrorMessage, SUPPORTED_SPLAT_FORMAT_HELP } from '../lib/exhibition/splatStore';
import RunTrace from './RunTrace';
import { startAgentRun } from '../lib/observe/bus';
import ArtifactCard, { type ArtifactCardData } from './ArtifactCard';
import CultureLayerTimeline from './CultureLayerTimeline';
import VisitTimeline from './VisitTimeline';
import BatchOrganizePanel from './BatchOrganizePanel';
import MarkerDetail, { type MarkerDetailData } from './MarkerDetail';
import CaptureGuideCard from './CaptureGuideCard';
import { selectCaptureGuideForArtifact, captureGuideBrief, type CaptureGuide } from '../lib/exhibition/captureGuide';
import { MUSEUM_2_5D_DEMOS } from '../lib/exhibition/museum2_5d';
import Exhibit3DGSEvidencePage from './Exhibit3DGSEvidencePage';
import Museum2_5DStoryPage from './Museum2_5DStoryPage';

import Viewer3D from './Viewer3D';

interface Props { onBack: () => void; embedded?: boolean }
const TEAL = '#5A8F7B';
const PHOTO_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const PHOTO_MAX_SIDE = 1200;
const PHOTO_JPEG_QUALITY = 0.78;
const MAX_DRAFT_PHOTOS = 6;
const museumDemoCard = (demo: (typeof MUSEUM_2_5D_DEMOS)[number]): ArtifactCardData => ({
  id: `demo:${demo.id}`,
  nameZh: `${demo.label} 2.5D 展品`,
  nameEn: `${demo.nameEn} · Museum Matting MNN`,
  dynastyLabel: '年代待展签确认',
  material: demo.material,
  category: demo.category,
  culture: '公开物体数据样本',
  qwenConfidence: 0.9,
  qwenContributionSummary: '结构化补全',
  museum: demo.sourceLabel,
  findspot: '待展签确认',
  dimensions: '尺寸待展签确认',
  curatorNote: '普通 RGB 照片经博物馆场景专项抠图 MNN、相对深度与确定性 Builder，组成可旋转的多视角 2.5D 展品。',
  timelineNote: 'Qwen3‑VL‑2B MNN 负责拍摄路由、展签 OCR 与结构化；专项 MNN 模型负责抠图与端侧展示。',
  rating: 5,
  photos: demo.views[0]?.colorUrl ? [demo.views[0].colorUrl] : [],
  visitDate: '2026-08-08',
  exhibition: 'Qwen + 博物馆抠图 MNN 的多视图 2.5D 实例',
  splatStatus: 'ready',
  splatUrl: demo.manifestUrl,
  format: 'multiview-2_5d',
});

const readDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
const readPhotoDataUrl = async (f: File) => {
  const src = await readDataUrl(f);
  if (src.length < 900_000 || typeof Image === 'undefined' || typeof document === 'undefined') return src;
  return new Promise<string>((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || 1) * scale));
        const h = Math.max(1, Math.round((img.height || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { res(src); return; }
        ctx.drawImage(img, 0, 0, w, h);
        res(canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY));
      } catch { res(src); }
    };
    img.onerror = () => res(src);
    img.src = src;
  });
};

function fromMark(m: UserMark): ArtifactCardData {
  const meta = (m.meta || {}) as Record<string, unknown>;
  return {
    id: m.id, nameZh: m.label || String(meta.nameZh || ''), nameEn: String(meta.nameEn || ''),
    aliases: Array.isArray(meta.aliases) ? (meta.aliases as string[]) : [],
    dynastyLabel: String(meta.dynastyLabel || ''), eraStart: (typeof meta.eraStart === 'number' ? meta.eraStart : null),
    material: Array.isArray(meta.material) ? (meta.material as string[]) : [],
    category: String(meta.category || ''), culture: String(meta.culture || ''),
    qwenConfidence: typeof meta.qwenConfidence === 'number' ? meta.qwenConfidence : (typeof meta.gmiConfidence === 'number' ? meta.gmiConfidence : undefined),
    qwenContributions: Array.isArray(meta.qwenContributions) ? (meta.qwenContributions as string[]) : (Array.isArray(meta.gmiContributions) ? (meta.gmiContributions as string[]) : []),
    qwenContributionSummary: String(meta.qwenContributionSummary || meta.gmiContributionSummary || ''),
    museum: String(meta.museum || ''), place: String(meta.place || ''),
    findspot: String(meta.findspot || ''), dimensions: String(meta.dimensions || ''), labelZh: String(meta.labelZh || ''),
    curatorNote: String(meta.curatorNote || ''), timelineNote: String(meta.timelineNote || ''),
    rating: typeof meta.rating === 'number' ? meta.rating : 0,
    splatStatus: String(meta.splatStatus || ''), splatUrl: String(meta.splatUrl || ''),
    splatId: String(meta.splatId || ''), format: String(meta.splatFormat || ''),
    splatCaptureQualityWarn: String(meta.splatCaptureQualityWarn || ''),
    photos: Array.isArray(meta.photos) ? (meta.photos as string[]) : [],
    visitDate: String(meta.visitDate || ''),
    exhibition: String(meta.exhibition || ''),   // 特展名（pin 时一直在存，UI 从这轮起用起来）
    createdAt: m.createdAt,                      // 钉入时间：文化层「新」印章判据
  };
}

function toDetail(d: ArtifactCardData): MarkerDetailData {
  return { kind: 'exhibition', markId: d.id, title: d.nameZh, original: d.nameEn, museum: d.museum,
    dynasty: d.dynastyLabel, eraStart: d.eraStart, material: d.material, category: d.category, culture: d.culture,
    findspot: d.findspot, dimensions: d.dimensions, aliases: d.aliases, qwenConfidence: d.qwenConfidence, qwenContributions: d.qwenContributions, qwenContributionSummary: d.qwenContributionSummary, labelZh: d.labelZh, place: d.place, rating: d.rating,
    curatorNote: d.curatorNote, timelineNote: d.timelineNote, exhibitionName: d.exhibition,
    splatUrl: d.splatUrl, splatStatus: d.splatStatus, splatId: d.splatId, splatFormat: d.format, splatCaptureQualityWarn: d.splatCaptureQualityWarn, photos: d.photos, date: d.visitDate };
}

const qwenConfidenceText = (n?: number) => (typeof n === 'number' ? `QWEN·${Math.round(Math.max(0, Math.min(1, n)) * 100)}%` : '');

function readRecoveryParam(name: string): string {
  try {
    if (typeof location === 'undefined') return '';
    return new URLSearchParams(location.search).get(name)?.trim() || '';
  } catch { return ''; }
}

export default function ExhibitionRunPage({ onBack, embedded }: Props) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeUserMarks(force), []);

  const [input, setInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [, setPhase] = useState<ExhibitionPhase | ''>('');
  const [runId, setRunId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ArtifactDraft | null>(null);
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);   // 供长耗时异步任务回来时校验展品身份是否已变，避免把 3D 写进失效 draft / 留孤儿 blob
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<'grid' | 'timeline' | 'visits'>('grid');
  const [catFilter, setCatFilter] = useState('');   // 集邮器类筛选（横向对比入口）
  const [selected, setSelected] = useState<MarkerDetailData | null>(null);
  const [view3D, setView3D] = useState<{ url: string; format: string } | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(() => readRecoveryParam('exhibit3dgsEvidence') === '1');
  const museumStory = readRecoveryParam('museumStory');
  const [full3dBusy, setFull3dBusy] = useState(false);
  const [guide, setGuide] = useState<CaptureGuide | null>(null);   // 绕拍采集引导卡（录视频/多图前弹，按展品类型给拍法）
  const fileRef = useRef<HTMLInputElement>(null);
  const cloudFileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const splatFileRef = useRef<HTMLInputElement>(null);
  const full3dImagesRef = useRef<HTMLInputElement>(null);

  const items: ArtifactCardData[] = getUserMarksByKind('exhibition').map(fromMark);
  const museumCount = new Set(items.map((i) => i.museum).filter(Boolean)).size;
  const with3D = items.filter(hasRenderableSplat).length;

  const showToast = (s: string) => { setToast(s); window.setTimeout(() => setToast(null), 2400); };
  const refreshCuratorNotes = useCallback(async (draftId: string, has3D = false, sourceKind = '') => {
    const base = draftRef.current;
    if (!base || base.id !== draftId) return;
    const notes = await createCuratorNotes(base, { has3D, sourceKind });
    setDraft((d) => {
      if (!d || d.id !== draftId) return d;
      const marker = notes.source === 'qwen'
        ? (has3D ? 'Qwen生成3D导览词' : 'Qwen生成导览词')
        : (has3D ? '本地3D导览词' : '本地导览词');
      return {
        ...d,
        tags: { ...d.tags, curatorNote: notes.curatorNote, timelineNote: notes.timelineNote },
        reason: d.reason.includes(marker) ? d.reason : `${d.reason}；${marker}`,
      };
    });
  }, []);

  const discardDraft = (resetInput = true) => {
    const sid = draftRef.current?.splat?.splatId;
    draftRef.current = null;
    setDraft(null);
    if (resetInput) setInput('');
    if (sid) void deleteSplat(sid);
  };

  const analyze = async (inp: Parameters<typeof runExhibitionAgent>[0]) => {
    if (analyzing) return;
    const label = inp.kind === 'image' ? '拍展签认字' : inp.kind === 'manual' ? '手动记录' : `「${(inp.text || '').slice(0, 14)}」`;
    const run = startAgentRun(`记一件展品 · ${label}`); setRunId(run.runId);
    setAnalyzing(true); discardDraft(false); setPhase('解析输入');
    try {
      const d = await runExhibitionAgent(inp, (p, detail) => { setPhase(p); run.phase(p, detail); });
      run.end(!!d);
      if (!d) showToast('没认出展品，换种说法或拍张展签');
      else setDraft(d);
    } catch { run.end(false); showToast('解析出错了，稍后再试'); }
    finally { setAnalyzing(false); setPhase(''); }
  };

  const onSubmitText = () => { const t = input.trim(); if (t) analyze({ kind: 'text', text: t }); };
  const onDemo = (demoId = MUSEUM_2_5D_DEMOS[0].id) => {
    if (analyzing) return;
    const selectedDemo = MUSEUM_2_5D_DEMOS.find((item) => item.id === demoId) || MUSEUM_2_5D_DEMOS[0];
    setRunId(null);
    setPhase('');
    discardDraft(true);
    const base = createQwenOwnedGpuCompetitionDemoDraft();
    const quick2DAsset: Splat3D = {
      status: 'ready',
      sourceKind: 'multi-image-2_5d',
      engine: 'museum-matting-2_5d',
      splatUrl: selectedDemo.manifestUrl,
      format: 'multiview-2_5d',
      captureQualityWarn: '6 个真实观察视角；相对深度由现成模型预测，大角度时切换到相邻观察视角。',
    };
    const demo: ArtifactDraft = {
      ...base,
      id: `art:${selectedDemo.id}-museum-2_5d-proof`,
      nameZh: `${selectedDemo.label} 2.5D 展品`,
      museum: selectedDemo.sourceLabel,
      exhibition: 'Qwen + 博物馆抠图 MNN 的多视图 2.5D 链路',
      eraStart: null,
      eraEnd: null,
      tags: {
        nameEn: `${selectedDemo.nameEn} · Museum Matting MNN`,
        dynastyKey: 'pending-label-ocr',
        dynastyLabel: '年代待展签确认',
        material: selectedDemo.material,
        category: selectedDemo.category,
        culture: '公开物体数据样本',
        findspot: '待展签确认',
        dimensions: '尺寸待展签确认',
        myRating: 5,
        qwenConfidence: 0.9,
        curatorNote: '六张普通 RGB 照片经博物馆场景专项抠图 MNN、Depth Anything V2 Small 相对深度与确定性 Builder，组成可旋转的观察视角深度卡。',
        timelineNote: 'Qwen3‑VL‑2B MNN 负责拍摄路由、展签 OCR 与结构化；抠图由独立专项 MNN 模型负责，不把它冒充 Qwen LoRA。',
      },
      labels: [{
        lang: 'zh',
        rawText: '当前示例验证 6 张环绕照片到 2.5D 资产；没有展签输入，元数据保持未知。',
        ocrEngine: 'manual',
      }],
      splat: quick2DAsset,
      representations: { quick2_5d: quick2DAsset },
      geo: null,
      needPlace: true,
      source: 'manual',
      confidence: 0.9,
      reason: `${selectedDemo.nameEn} 的 6 张 RGB → 博物馆场景专项抠图 MNN → Depth Anything V2 Small 相对深度 → 2.5D Builder；Qwen3‑VL‑2B MNN 负责路由、展签 OCR 与地图落位。`,
    };
    setDraft(demo);
    void refreshCuratorNotes(demo.id, true, 'multi-image-2_5d');
    showToast(`已载入${selectedDemo.label} 2.5D · MNN 链路已验证`);
  };
  const startFull3DGuide = () => {
    const cur = draftRef.current;
    if (!cur) { showToast('先拍展签或标记展品，再补拍高清 3D'); return; }
    setGuide(selectCaptureGuideForArtifact(cur));
  };

  // 拍展签：allowCloud=false 原图只进端侧 vision；allowCloud=true 端侧读不出时上云 Qwen 视觉识别
  const doImage = async (f: File, allowCloud: boolean) => {
    try { await analyze({ kind: 'image', imageDataUrl: await readDataUrl(f), allowCloud }); }
    catch { showToast('读图失败 · 可手动记一下'); }
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) await doImage(f, false); if (fileRef.current) fileRef.current.value = ''; };
  const onCloudFile = async (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) await doImage(f, true); if (cloudFileRef.current) cloudFileRef.current.value = ''; };

  // 加展品照（L1 照片层）：存进 draft.photos，钉地球后进 meta，时间线/详情显示真图
  const onArtifactPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if ((draftRef.current?.photos.length || 0) >= MAX_DRAFT_PHOTOS) { showToast(`最多保留 ${MAX_DRAFT_PHOTOS} 张展品照`); if (photoRef.current) photoRef.current.value = ''; return; }
    if (f.size > PHOTO_MAX_SOURCE_BYTES) { showToast('照片太大 · 先裁剪或压缩后再加'); if (photoRef.current) photoRef.current.value = ''; return; }
    try { const url = await readPhotoDataUrl(f); setDraft((d) => (d ? { ...d, photos: [...d.photos, url] } : d)); }
    catch { showToast('加照片失败'); }
    finally { if (photoRef.current) photoRef.current.value = ''; }
  };

  // 导入真展品 3D 文件（自有 GPU、Scaniverse、Polycam 等导出的模型）：存 IndexedDB blob，只把 splatId 指针进 meta
  const onSplatFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.size) { showToast('模型文件为空 · 换一个文件'); if (splatFileRef.current) splatFileRef.current.value = ''; return; }
    if (f.size > 220 * 1024 * 1024) { showToast('文件太大（>220MB）· 建议先在扫描 app 里压缩'); if (splatFileRef.current) splatFileRef.current.value = ''; return; }
    const format = normalizeSplatFormat(f.name) || normalizeSplatFormat(f.type);
    if (!format) {
      showToast(splatImportFormatErrorMessage(f.name, f.type));
      if (splatFileRef.current) splatFileRef.current.value = '';
      return;
    }
    const capturedId = draftRef.current?.id;
    try {
      const id = await putSplat(f, format);
      if (!draftRef.current || draftRef.current.id !== capturedId) { await deleteSplat(id); if (splatFileRef.current) splatFileRef.current.value = ''; return; }   // 导入期间换了展品/取消 → 丢弃孤儿 blob
      const url = await getSplatObjectUrl(id);
      const full3d: Splat3D = { status: 'ready', sourceKind: 'local', engine: 'local', splatId: id, splatUrl: url, format };
      setDraft((d) => (d && d.id === capturedId ? attachFull3D(d, full3d) : d));
      if (capturedId) void refreshCuratorNotes(capturedId, true, 'local');
      showToast('已导入 3D · ' + format.toUpperCase() + ' · ' + Math.round(f.size / 1048576) + 'MB');
    } catch { showToast('导入失败 · 换个文件试试'); }
    finally { if (splatFileRef.current) splatFileRef.current.value = ''; }
  };

  const onFull3DImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const artifactId = draftRef.current?.id;
    if (!artifactId) return;
    const existingCaptureId = full3DOf(draftRef.current!)?.captureId;
    setFull3dBusy(true);
    try {
      const manifest = await saveFull3DCapture(artifactId, files, existingCaptureId);
      if (draftRef.current?.id !== artifactId) return;
      const full3d: Splat3D = {
        status: manifest.readyToBuild ? 'ready_to_build' : 'needs_more_photos',
        sourceKind: 'multi-image',
        engine: 'qwen-colmap-gsplat',
        format: 'spz',
        captureId: manifest.captureId,
        captureQualityWarn: manifest.readyToBuild
          ? `已在端侧保存 ${manifest.views} 张原图并逐张记录 SHA-256；点击后才上传自有 GPU。`
          : `当前 ${manifest.views} 张；还需 ${20 - manifest.views} 张，建议 48 张以上。`,
      };
      setDraft((d) => (d && d.id === artifactId ? attachFull3D(d, full3d) : d));
      showToast(manifest.readyToBuild ? `已安全保存 ${manifest.views} 张 · 可上传重建` : `还需 ${20 - manifest.views} 张`);
    } catch (error) {
      const reason = String(error);
      showToast(reason.includes('too_many') ? '最多 80 张' : reason.includes('too_large') ? '照片过大 · 请先压缩' : '高清 3D 照片保存失败');
    } finally {
      setFull3dBusy(false);
      if (full3dImagesRef.current) full3dImagesRef.current.value = '';
    }
  };

  const submitFull3D = async () => {
    const cur = draftRef.current;
    const full = cur && full3DOf(cur);
    if (!cur || !full?.captureId) return;
    if (!ownedGpu3dgsAvailable()) { showToast('自有 GPU 服务尚未连接 · 原图仍安全留在本机'); return; }
    const artifactId = cur.id;
    setFull3dBusy(true);
    setDraft((d) => (d && d.id === artifactId ? attachFull3D(d, { ...full, status: 'uploading', captureQualityWarn: '用户已确认上传；正在发送至自有 GPU。' }) : d));
    try {
      const remote = await submitOwnedGpu3DGS(full.captureId);
      setDraft((d) => (d && d.id === artifactId ? attachFull3D(d, {
        ...full, status: remote.status, taskId: remote.jobId,
        captureQualityWarn: '自有 GPU 已接单；快速 2.5D 在重建期间继续可用。',
      }) : d));
      showToast('高清 3D 已进入自有 GPU 队列');
    } catch {
      setDraft((d) => (d && d.id === artifactId ? attachFull3D(d, { ...full, status: 'ready_to_build', captureQualityWarn: '上传失败；原图仍在本机，可稍后重试。' }) : d));
      showToast('上传失败 · 2.5D 与本地原图均已保留');
    } finally { setFull3dBusy(false); }
  };

  const syncFull3D = async () => {
    const cur = draftRef.current;
    const full = cur && full3DOf(cur);
    if (!cur || !full?.taskId) return;
    const artifactId = cur.id;
    setFull3dBusy(true);
    try {
      const remote = await readOwnedGpu3DGS(full.taskId);
      const next: Splat3D = remote.status === 'ready' ? {
        ...full, status: 'ready', splatUrl: remote.assetUrl, format: remote.format,
        assetSha256: remote.sha256, captureQualityWarn: '高清 3D 已通过云端质量门禁；点击后按需加载。',
      } : {
        ...full, status: remote.status,
        captureQualityWarn: remote.message || (remote.status === 'failed' ? '高清重建未通过；快速 2.5D 保持不变。' : '自有 GPU 正在重建。'),
      };
      setDraft((d) => (d && d.id === artifactId ? attachFull3D(d, next) : d));
      showToast(remote.status === 'ready' ? '高清 3D 已就绪' : remote.status === 'failed' ? '高清重建未通过 · 已回退 2.5D' : '已更新重建进度');
    } catch { showToast('暂时无法读取云端进度'); }
    finally { setFull3dBusy(false); }
  };

  const removeFull3DLayer = async () => {
    const full = draftRef.current && full3DOf(draftRef.current);
    setDraft((d) => (d ? removeFull3D(d) : d));
    if (full?.splatId) await deleteSplat(full.splatId);
    if (full?.captureId) await deleteFull3DCapture(full.captureId);
  };

  const previewRepresentation = async (kind: 'quick2_5d' | 'full3d') => {
    const cur = draftRef.current;
    if (!cur) return;
    const asset = viewingAsset(cur, kind);
    if (!asset) { showToast(kind === 'full3d' ? '高清 3D 尚未就绪' : '2.5D 尚未就绪'); return; }
    const url = asset.splatId ? await getSplatObjectUrl(asset.splatId) : (asset.splatUrl || '');
    if (url) setView3D({ url, format: asset.format || ((asset.splatUrl || '').split('.').pop() || '') });
  };

  const setStars = (n: number) => setDraft((d) => { if (!d) return d; recordRatingFix(d.id, n); return { ...d, tags: { ...d.tags, myRating: n } }; });
  const pickMuseum = (name: string) => setDraft((d) => {
    if (!d) return d; const seed = allVenues().find((s) => s.name === name); if (!seed) return d;   // 内建种子 + 用户自定义场馆统一视图
    const nextId = artifactKey(d.nameZh || d.labels[0]?.rawText.slice(0, 12) || '', seed.name);
    recordPlaceFix(nextId, { lng: seed.lng, lat: seed.lat, place: seed.name });
    if (d.tags.myRating) recordRatingFix(nextId, d.tags.myRating);
    return { ...d, id: nextId, museum: seed.name, geo: { kind: 'venue', place: seed.name, lng: seed.lng, lat: seed.lat, confidence: 0.9 }, needPlace: false };
  });

  // 自定义场馆：起名（+可选城市帮定位）→ geocode → 钉上地球博物馆图层并选用。
  // 城市级坐标先落点，位置可在地球上拖动微调（markerOverrides 免费获得）。
  const [venueForm, setVenueForm] = useState<{ name: string; city: string; type: VenueType } | null>(null);
  const [venueBusy, setVenueBusy] = useState(false);
  const submitVenue = async () => {
    if (!venueForm || venueBusy) return;
    const name = venueForm.name.trim();
    if (!name) { showToast('先给场馆起个名字'); return; }
    setVenueBusy(true);
    try {
      const known = matchVenue(name);
      if (known) { pickMuseum(known.name); setVenueForm(null); showToast(`已有这家 · 直接选用「${known.name}」`); return; }
      const g = (await resolvePlace(venueForm.city.trim() || name)) || (await resolvePlace(name));
      if (!g) { showToast('定位不到 · 补一个城市名再试'); return; }
      addCustomVenue({ name, city: venueForm.city.trim(), type: venueForm.type, lng: g.lng, lat: g.lat });
      pickMuseum(name);
      setVenueForm(null);
      showToast('已添加到地球博物馆 · 可在地球上拖动微调位置');
    } finally { setVenueBusy(false); }
  };

  // 钉完给「飞去看看」动作条（不强制跳走：连续记多件时被拽去地球很烦，点了才飞）
  const [flyOffer, setFlyOffer] = useState<{ lng: number; lat: number } | null>(null);
  // 批量观展一键整理面板
  const [batchOpen, setBatchOpen] = useState(false);
  const onBatchPinned = (count: number, geo: { lng: number; lat: number } | null) => {
    if (!count) return;
    showToast(`已钉 ${count} 件到地球`);
    if (geo) { setFlyOffer(geo); window.setTimeout(() => setFlyOffer(null), 6000); }
  };
  const confirm = async () => {
    if (!draft) return;
    const res = await confirmPin(draft);
    showToast(res.pinned ? `已钉到地球 · ${draft.geo ? GEO_LABEL[draft.geo.kind] + '·' + draft.geo.place : ''}` : '没坐标，先存档，补展馆后可钉');
    if (res.pinned && draft.geo) {
      setFlyOffer({ lng: draft.geo.lng, lat: draft.geo.lat });
      window.setTimeout(() => setFlyOffer(null), 6000);
    }
    setDraft(null); setInput('');
  };
  const archive = async () => {
    if (!draft) return;
    await archiveOnly(draft);
    showToast('已先存档 · 补展馆后可钉');
    setDraft(null); setInput('');
  };

  if (museumStory === 'build' || museumStory === 'inscription') {
    return <Museum2_5DStoryPage mode={museumStory} onBack={onBack} />;
  }

  return (
    <div
      className={`h-full min-h-0 flex flex-col bg-[#EAEAEA] font-sans relative ${draft ? 'overflow-y-auto overscroll-y-contain touch-pan-y' : 'overflow-hidden'}`}
      style={draft ? { WebkitOverflowScrolling: 'touch' } : undefined}
      data-exhibition-scroll={draft ? 'page' : 'content'}
    >
      {!embedded && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
          <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
            <ChevronLeft className="w-4 h-4" strokeWidth={3} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-pixel text-[11px] tracking-wider truncate">EXHIBITION-AGENT</div>
            <div className="text-[9px] text-black/45 truncate">看展搭子 · 展签识别 + 时间线 + 3D · 钉回展馆</div>
          </div>
          <Landmark className="w-4 h-4" strokeWidth={2.5} style={{ color: TEAL }} />
        </div>
      )}

      {/* Stat strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black shrink-0" style={{ color: TEAL }}>
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>去过 {museumCount} 馆</span><span className="opacity-40">|</span>
          <span>收 {items.length} 件</span><span className="opacity-40">|</span>
          <span>3D {with3D} 件</span>
        </div>
      </div>

      {/* 记一笔 */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0 space-y-2">
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="「在国博看了唐代鎏金舞马银壶，五星」/ 拍展签…"
            onKeyDown={(e) => e.key === 'Enter' && onSubmitText()} disabled={analyzing}
            className="flex-1 min-w-0 border-2 border-black px-2 py-1.5 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white disabled:opacity-50" />
          <button onClick={() => fileRef.current?.click()} title="拍展签（优先打开后置摄像头 · 端侧认字）" disabled={analyzing}
            className="w-9 shrink-0 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-50">
            <Camera className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
          <button onClick={() => cloudFileRef.current?.click()} title="Qwen 云端识别展签（端侧读不出时，由你主动选择后上传公开展签）" disabled={analyzing}
            className="w-9 shrink-0 border-2 border-black flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-50" style={{ background: '#C8A24B' }}>
            <Cloud className="w-4 h-4" strokeWidth={2.5} style={{ color: '#000' }} />
          </button>
          <input ref={cloudFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onCloudFile} />
          <button onClick={onSubmitText} disabled={analyzing || !input.trim()}
            className="shrink-0 flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-white disabled:opacity-40" style={{ background: TEAL }}>
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={3} /> : '标记'}
          </button>
        </div>
        {runId && <div className="mt-1"><RunTrace runId={runId} /></div>}
        {draft && (
          <button
            type="button"
            onClick={startFull3DGuide}
            disabled={analyzing || full3dBusy}
            className="flex min-h-8 w-full items-center justify-center gap-1.5 border-2 border-black px-2 font-pixel text-[7px] text-white active:translate-y-px disabled:opacity-50"
            style={{ background: TEAL }}
          >
            <Grid3x3 className="h-3.5 w-3.5" strokeWidth={2.5} />
            补拍高清 3D · 自有 GPU（20–80 张）
          </button>
        )}
        {!analyzing && !draft && (
          <div className="space-y-1.5">
            <div className="font-pixel text-[7px] text-black/40 leading-relaxed tracking-wide">
              说「在 xx 馆看了 xx，几星」或拍张展签 · agent 认字 + 补 朝代/器类/材质 + 定位展馆 → 你确认再钉
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" aria-label="展品实例与整理工具">
              <button onClick={() => setEvidenceOpen(true)}
                className="shrink-0 border-2 border-black bg-[#18344f] px-2.5 py-1 font-pixel text-[7px] text-white shadow-[1px_1px_0_#000] active:translate-y-px">
                ◈ 3DGS 胜例证据
              </button>
              <button onClick={() => setBatchOpen(true)}
                className="shrink-0 flex items-center gap-1 border border-black px-1.5 py-1 font-pixel text-[7px] text-white active:translate-y-px" style={{ background: '#2F6FED' }}>
                ⚡ 批量整理
              </button>
              {MUSEUM_2_5D_DEMOS.map((demo) => (
                <button key={demo.id} onClick={() => onDemo(demo.id)}
                  className="flex shrink-0 items-center gap-1 border border-black bg-[#FFFDF5] px-1.5 py-1 font-pixel text-[7px] active:translate-y-px">
                  <Sparkles className="w-3 h-3" strokeWidth={2.5} style={{ color: TEAL }} /> {demo.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 展品草稿（确认才钉）：使用 Pocket Earth 票根详情，不使用收藏卡牌/翻面层。 */}
        {draft && (
          <div className="border-2 border-black bg-[#FFFDF5] shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between px-2.5 py-1" style={{ background: TEAL }}>
              <span className="font-pixel text-[7px] tracking-widest text-white">DRAFT · 待确认展品</span>
              <span className="font-pixel text-[7px] text-white/80">{draft.source.toUpperCase()} · {Math.round(draft.confidence * 100)}%</span>
            </div>
            <div className="px-2.5 py-2 space-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[14px] font-bold leading-tight">{draft.nameZh || '（展签未认出名字）'}</span>
                {draft.tags.dynastyLabel && <span className="font-pixel text-[8px] text-white px-1 py-0.5" style={{ background: TEAL }}>{draft.tags.dynastyLabel}</span>}
              </div>
              {draft.tags.nameEn && <div className="font-pixel text-[7px] text-black/40">{draft.tags.nameEn}</div>}
              <div className="flex flex-wrap gap-1">
                {draft.tags.category && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">器类·{draft.tags.category}</span>}
                {draft.tags.material.map((m, i) => <span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">{m}</span>)}
                {draft.tags.culture && draft.tags.culture !== '华夏' && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#eef4f1]">{draft.tags.culture}</span>}
                {draft.tags.findspot && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">出土·{draft.tags.findspot}</span>}
                {draft.tags.aliases?.[0] && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#FFFDF5]">别名·{draft.tags.aliases[0]}</span>}
                {qwenConfidenceText(draft.tags.qwenConfidence) && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#eef4f1]">{qwenConfidenceText(draft.tags.qwenConfidence)}</span>}
              </div>
              {draft.tags.dimensions && <div className="text-[10px] text-black/55 leading-snug">{draft.tags.dimensions}</div>}
              {!draft.splat && (
                <div className="font-pixel text-[6px] border border-black/20 bg-[#eef4f1] px-1.5 py-1 text-black/55 leading-relaxed">
                  3D 建议 · {captureGuideBrief(selectCaptureGuideForArtifact(draft))}
                </div>
              )}
              {(draft.tags.curatorNote || draft.tags.timelineNote) && (
                <div className="border border-black/20 bg-[#eef4f1] px-2 py-1 space-y-0.5">
                  {draft.tags.curatorNote && <div className="text-[10px] text-black/75 leading-relaxed">✦ {draft.tags.curatorNote}</div>}
                  {draft.tags.timelineNote && <div className="font-pixel text-[6px] text-black/45 leading-relaxed">{draft.tags.timelineNote}</div>}
                </div>
              )}
              {/* 展品照片（L1 照片层，可选） */}
              <div className="flex items-center gap-1.5">
                <span className="font-pixel text-[7px] text-black/45 shrink-0">展品照</span>
                {draft.photos.map((p, i) => <img key={i} src={p} alt="" className="w-8 h-8 object-cover border border-black shrink-0" />)}
                <button onClick={() => photoRef.current?.click()} title="加一张展品照"
                  className="w-8 h-8 shrink-0 border border-black bg-white flex items-center justify-center active:translate-y-px">
                  <ImagePlus className="w-3.5 h-3.5" strokeWidth={2} style={{ color: TEAL }} />
                </button>
                <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onArtifactPhoto} />
              </div>
              {(() => {
                const quick = representationsOf(draft)?.quick2_5d || null;
                const full = full3DOf(draft);
                const fullReady = !!(full && full.status === 'ready' && (full.splatUrl || full.splatId));
                return <div className="border border-black/20 bg-[#f7f3e8] px-2 py-1.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-pixel text-[7px] text-black/45 shrink-0">快速 2.5D</span>
                    {quick ? <>
                      <span className="font-pixel text-[7px]" style={{ color: TEAL }}>● 默认保留 · 端侧可看</span>
                      <button onClick={() => void previewRepresentation('quick2_5d')}
                        className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white active:translate-y-px">预览</button>
                    </> : <span className="font-pixel text-[6px] text-black/40">添加 6–8 张照片后默认生成</span>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-pixel text-[7px] text-black/45 shrink-0">高清 3D</span>
                    {full ? <>
                      <span className="font-pixel text-[7px]" style={{ color: fullReady ? '#C8A24B' : TEAL }}>
                        ◆ {fullReady ? '已就绪' : full.status === 'needs_more_photos' ? '需补照片' : full.status === 'ready_to_build' ? '等待自有 GPU' : full.status}
                      </span>
                      {fullReady && <button onClick={() => void previewRepresentation('full3d')}
                        className="font-pixel text-[7px] border border-black px-1.5 py-0.5 active:translate-y-px" style={{ background: '#C8A24B' }}>预览</button>}
                      {full.status === 'needs_more_photos' && <button onClick={startFull3DGuide} disabled={full3dBusy}
                        className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white active:translate-y-px disabled:opacity-50">继续补拍</button>}
                      {(full.status === 'ready_to_build' || full.status === 'failed') && full.captureId && <button onClick={() => void submitFull3D()} disabled={full3dBusy}
                        className="font-pixel text-[7px] border border-black px-1.5 py-0.5 text-white active:translate-y-px disabled:opacity-50" style={{ background: TEAL }}>
                        {ownedGpu3dgsAvailable() ? '上传并重建' : '自有 GPU 待连接'}
                      </button>}
                      {full.taskId && !fullReady && <button onClick={() => void syncFull3D()} disabled={full3dBusy}
                        className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white active:translate-y-px disabled:opacity-50">刷新进度</button>}
                      <button onClick={() => void removeFull3DLayer()} disabled={full3dBusy}
                        className="font-pixel text-[7px] border border-black/40 px-1.5 py-0.5 bg-[#EAEAEA] active:translate-y-px">移除高清层</button>
                    </> : <>
                      <button onClick={startFull3DGuide}
                        className="font-pixel text-[7px] border border-black px-1.5 py-0.5 text-white active:translate-y-px" style={{ background: TEAL }}>补拍 20–80 张</button>
                      <button onClick={() => splatFileRef.current?.click()} title={`导入模型：${SUPPORTED_SPLAT_FORMAT_HELP}`}
                        className="font-pixel text-[7px] border border-black px-1.5 py-0.5 active:translate-y-px" style={{ background: '#C8A24B' }}>导入已有 3D</button>
                    </>}
                  </div>
                  {full?.captureQualityWarn && <div className="font-pixel text-[6px] text-black/45 leading-relaxed">{full.captureQualityWarn}</div>}
                  <div className="font-pixel text-[6px] text-black/35 leading-relaxed">选图只保存本机并记录哈希；点击“上传并重建”后才发送自有 GPU。博物馆抠图 + Mask + COLMAP + 3DGS 任一门禁失败，继续显示快速 2.5D。</div>
                  <input ref={splatFileRef} type="file" accept=".ply,.splat,.ksplat,.glb,.gltf,.usdz,.obj,.mtl,.fbx,.stl,.xyz,.spz,.zip,.rar,.7z,.tar,.tar.gz,.tgz,.gz,.dae,.3mf,.las,.laz,.e57,.pcd,.pts,.drc" className="hidden" onChange={onSplatFile} />
                  <input ref={full3dImagesRef} type="file" accept="image/*" multiple className="hidden" onChange={onFull3DImages} />
                </div>;
              })()}
              {/* 我的评分 */}
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[7px] text-black/45">我的评分</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setStars(n)} className="active:scale-90">
                      <Star className="w-3.5 h-3.5" strokeWidth={2} fill={n <= draft.tags.myRating ? TEAL : 'none'} style={{ color: TEAL }} />
                    </button>
                  ))}
                </div>
              </div>
              {/* 落点：展馆 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <MapPin className="w-3 h-3" strokeWidth={2.5} style={{ color: draft.geo ? GEO_COLOR[draft.geo.kind] : '#bbb' }} />
                {draft.geo ? (
                  <span className="font-pixel text-[7px] px-1.5 py-0.5 text-white" style={{ background: GEO_COLOR[draft.geo.kind] }}>
                    {GEO_LABEL[draft.geo.kind]} · {draft.geo.place}
                  </span>
                ) : (
                  <>
                    <span className="font-pixel text-[7px] text-[#d23b3b]">没定位到展馆 · 选一个：</span>
                    <select onChange={(e) => e.target.value && pickMuseum(e.target.value)} defaultValue=""
                      className="border border-black px-1 py-0.5 text-[10px] bg-white max-w-[120px]">
                      <option value="" disabled>展馆…</option>
                      {allVenues().map((s) => <option key={s.id} value={s.name}>{s.custom ? '⌂ ' : ''}{s.name}</option>)}
                    </select>
                    <button onClick={() => setVenueForm((f) => (f ? null : { name: '', city: '', type: 'museum' }))}
                      className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-[#eef2fd] active:translate-y-px">＋新场馆</button>
                  </>
                )}
              </div>
              {/* 特展名（选填）：观展记忆的一等单位——「中国古代通史陈列」比「国博」更接近你记住的那次展 */}
              <div className="flex items-center gap-1.5">
                <span className="font-pixel text-[7px] text-black/45 shrink-0">展览</span>
                <input value={draft.exhibition} onChange={(e) => setDraft((d) => (d ? { ...d, exhibition: e.target.value } : d))}
                  placeholder="特展名 · 选填（如：古代中国基本陈列）"
                  className="flex-1 min-w-0 border border-black/40 px-1.5 py-0.5 text-[11px] bg-white" />
              </div>
              {/* 自定义场馆内联表单：不在列表里的小馆/画廊/在地展馆，起名→定位→上地球博物馆图层 */}
              {venueForm && !draft.geo && (
                <div className="border-2 border-black bg-[#eef2fd] p-2 space-y-1.5">
                  <div className="font-pixel text-[7px] tracking-wider text-black/60">添加自定义场馆 · 会钉上地球博物馆图层</div>
                  <div className="flex gap-1.5">
                    <input value={venueForm.name} onChange={(e) => setVenueForm((f) => f && { ...f, name: e.target.value })}
                      placeholder="场馆名（必填）" className="flex-1 min-w-0 border border-black px-1.5 py-1 text-[12px] bg-white" />
                    <input value={venueForm.city} onChange={(e) => setVenueForm((f) => f && { ...f, city: e.target.value })}
                      placeholder="城市·帮定位" className="w-[88px] border border-black px-1.5 py-1 text-[12px] bg-white" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select value={venueForm.type} onChange={(e) => setVenueForm((f) => f && { ...f, type: e.target.value as VenueType })}
                      className="border border-black px-1 py-0.5 text-[10px] bg-white">
                      <option value="museum">博物馆</option>
                      <option value="gallery">美术馆</option>
                    </select>
                    <button onClick={submitVenue} disabled={venueBusy}
                      className="flex-1 border-2 border-black px-2 py-1 text-[11px] font-bold text-white active:translate-y-px disabled:opacity-50" style={{ background: '#2F6FED' }}>
                      {venueBusy ? '定位中…' : '添加并选用'}
                    </button>
                    <button onClick={() => setVenueForm(null)} className="border border-black bg-white px-2 py-1 text-[11px] active:translate-y-px">收起</button>
                  </div>
                </div>
              )}
              <div className="text-[8px] text-black/35 leading-snug">{draft.reason}</div>
              <div className="flex gap-2 pt-0.5">
                <button onClick={confirm} disabled={!draft.geo}
                  className="flex-1 flex items-center justify-center gap-1 border-2 border-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-white disabled:opacity-40" style={{ background: TEAL }}>
                  <Check className="w-3.5 h-3.5" strokeWidth={3} /> {draft.geo ? '确认 · 钉到地球' : '先选展馆再钉'}
                </button>
                {!draft.geo && (
                  <button onClick={archive}
                    className="border-2 border-black bg-[#FFFDF5] px-2.5 py-1.5 text-[11px] active:translate-y-px">仅存档</button>
                )}
                <button onClick={() => discardDraft(true)}
                  className="border-2 border-black bg-white px-2.5 py-1.5 text-[11px] active:translate-y-px">取消</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 二级 tab：集邮 | 观展史（我什么时候看的）| 文化层（它们多老）——两条时间轴各答各的问题 */}
      <div className={`${draft ? 'hidden' : 'flex'} border-b-2 border-black bg-white shrink-0`}>
        <button onClick={() => setTab('grid')} className={`flex-1 flex items-center justify-center gap-1 py-2 font-pixel text-[9px] tracking-wider ${tab === 'grid' ? 'text-white' : 'text-black/50 bg-white'}`} style={tab === 'grid' ? { background: TEAL } : undefined}>
          <Grid3x3 className="w-3 h-3" strokeWidth={2.5} /> 集邮
        </button>
        <button onClick={() => setTab('visits')} className={`flex-1 flex items-center justify-center gap-1 py-2 font-pixel text-[9px] tracking-wider border-l-2 border-black ${tab === 'visits' ? 'text-white' : 'text-black/50 bg-white'}`} style={tab === 'visits' ? { background: TEAL } : undefined}>
          <CalendarDays className="w-3 h-3" strokeWidth={2.5} /> 观展史
        </button>
        <button onClick={() => setTab('timeline')} className={`flex-1 flex items-center justify-center gap-1 py-2 font-pixel text-[9px] tracking-wider border-l-2 border-black ${tab === 'timeline' ? 'text-white' : 'text-black/50 bg-white'}`} style={tab === 'timeline' ? { background: TEAL } : undefined}>
          <Clock className="w-3 h-3" strokeWidth={2.5} /> 文化层
        </button>
      </div>

      {/* 内容区 */}
      <div className={`${draft ? 'hidden' : 'flex-1'} overflow-y-auto px-3 py-3 space-y-2.5`}>
        {tab === 'grid' ? (
          (() => {
            const exampleItems = MUSEUM_2_5D_DEMOS.map(museumDemoCard);
            const catalogItems = [...exampleItems, ...items];
            const catCount = new Map<string, number>();
            for (const it of catalogItems) if (it.category) catCount.set(it.category, (catCount.get(it.category) || 0) + 1);
            const cats = [...catCount.entries()].sort((a, b) => b[1] - a[1]);
            const gridItems = catFilter ? catalogItems.filter((it) => it.category === catFilter) : catalogItems;
            return (
              <>
                <div className="flex items-center justify-between border border-black/25 bg-[#eef4f1] px-2 py-1">
                  <span className="font-pixel text-[7px] tracking-wider" style={{ color: TEAL }}>看展搭子实例库 · {exampleItems.length} 件</span>
                  <span className="text-[9px] text-black/45">点击票根看详情与 2.5D</span>
                </div>
                {cats.length >= 2 && (
                  <div className="flex gap-1 overflow-x-auto pb-0.5 -mt-0.5">
                    <button onClick={() => setCatFilter('')}
                      className={`shrink-0 font-pixel text-[7px] border border-black px-1.5 py-1 active:translate-y-px ${catFilter ? 'bg-white text-black/50' : 'text-white'}`}
                      style={catFilter ? undefined : { background: TEAL }}>全部 {catalogItems.length}</button>
                    {cats.map(([c, n]) => (
                      <button key={c} onClick={() => setCatFilter(catFilter === c ? '' : c)}
                        className={`shrink-0 font-pixel text-[7px] border border-black px-1.5 py-1 active:translate-y-px ${catFilter === c ? 'text-white' : 'bg-white text-black/50'}`}
                        style={catFilter === c ? { background: TEAL } : undefined}>{c} {n}</button>
                    ))}
                  </div>
                )}
                {gridItems.map((it) => <ArtifactCard key={it.id} data={it} onClick={() => setSelected(toDetail(it))} />)}
              </>
            );
          })()
        ) : tab === 'visits' ? (
          <VisitTimeline items={items} onPick={(d) => setSelected(toDetail(d))} />
        ) : (
          <CultureLayerTimeline items={items} onPick={(d) => setSelected(toDetail(d))} />
        )}
        <div className="text-center text-[8px] font-pixel text-black/30 py-1 tracking-widest">
          端侧管「认字」· 云管「补全」· 展品钉回展馆
        </div>
      </div>

      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50 flex items-center border-2 border-black bg-black text-[11px] shadow-[2px_2px_0_#000]" style={{ color: TEAL }}>
          <span className="px-3 py-1.5">{toast}</span>
          {flyOffer && (
            <button onClick={() => {
              requestMapFocus(flyOffer.lng, flyOffer.lat, 14.2);
              setFlyOffer(null);
              setToast(null);
            }}
              className="px-2.5 py-1.5 border-l-2 border-black font-pixel text-[8px] text-black active:translate-y-px" style={{ background: '#7CFF6B' }}>
              🌍 飞去看看
            </button>
          )}
        </div>
      )}

      {/* 展品详情弹层（同地球点开的展品卡）：可移除、可看 3D */}
      <AnimatePresence>
        {selected && <MarkerDetail data={selected} onClose={() => setSelected(null)} onRemove={(id) => { const sid = selected?.splatId; setView3D(null); removeUserMark(id); setSelected(null); if (sid) deleteSplat(sid); showToast('已移除该展品'); }} onView3D={(url, format) => setView3D({ url, format })} />}
      </AnimatePresence>

      {/* 批量观展一键整理：一堆照片 → EXIF 聚组 → 逐张识别 → 整批钉 */}
      {batchOpen && <BatchOrganizePanel onClose={() => setBatchOpen(false)} onPinned={onBatchPinned} />}
      {evidenceOpen && <Exhibit3DGSEvidencePage onClose={() => setEvidenceOpen(false)} />}

      {/* 绕拍采集引导卡（补拍高清 3D 前弹，按展品类型给拍法，提升自有 GPU 重建质量） */}
      {guide && <CaptureGuideCard guide={guide} onClose={() => setGuide(null)} onStart={() => {
        setGuide(null);
        full3dImagesRef.current?.click();
      }} />}

      {/* 3D 高斯泼溅展品全屏 viewer（懒加载，只在点开时下载 three+splat chunk） */}
      {view3D && (
        <div className="absolute inset-0 z-[130] bg-black flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b-2 shrink-0" style={{ borderColor: '#C8A24B' }}>
            <span className="font-pixel text-[9px]" style={{ color: '#C8A24B' }}>◆ {view3D.format === 'multiview-2_5d' ? '2.5D 展品 · 6 个观察视角' : '3D 展品 · 拖动旋转'}</span>
            <button onClick={() => setView3D(null)} className="w-7 h-7 bg-black border-2 flex items-center justify-center" style={{ borderColor: '#C8A24B' }}>
              <X className="w-3.5 h-3.5" strokeWidth={3} style={{ color: '#C8A24B' }} />
            </button>
          </div>
          <div className="flex-1 relative">
            <Viewer3D url={view3D.url} format={view3D.format} onError={() => { setView3D(null); showToast('3D 加载失败'); }} />
          </div>
        </div>
      )}
    </div>
  );
}
