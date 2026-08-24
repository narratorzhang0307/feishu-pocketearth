import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Aperture, Camera, Copy, Cpu,
  Images, MapPin, RefreshCw, ScanLine, Search, ShieldCheck, Upload, X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  addPhotoPins,
  analyzePhotoAssets,
  attachPhotoLocations,
  buildPreferencePairs,
  buildCuratedPhotoAssets,
  buildPhotoChronicleData,
  buildPhotoDecisionGroups,
  buildPhotoSemanticIndex,
  checkPhotoAuthorization,
  checkPhotoLocationAuthorization,
  clearPhotoDerivedCache,
  clearPhotoIndexCheckpoint,
  clearPhotoSemanticIndex,
  clearPhotoPreference,
  clearPhotoLibraryIndex,
  clearPhotoSearchHistory,
  clearPhotoRadar,
  explainPhotoSearchMatch,
  getIndexedAssets,
  getPhotoIndexCheckpoint,
  getPhotoDeviceBudget,
  getPhotoLibraryCapabilities,
  getPhotoPreferenceModel,
  getPhotoSearchHistory,
  getPhotoSemanticIndexStatus,
  getRadarAnalyses,
  importWebPhotos,
  learnPhotoPreference,
  listPhotoLibrary,
  markNativeLibraryUnavailable,
  mergePhotoSearchResults,
  MIN_PREFERENCE_CHOICES,
  needsPhotoRadarAnalysis,
  PHOTO_EMBEDDING_VERSION,
  openPhotoOriginal,
  photoPinIdentity,
  photoAuthorizationTransition,
  preferenceVector,
  putRadarAnalyses,
  releaseSessionAsset,
  rememberPhotoSearch,
  requestPhotoAuthorization,
  requestPhotoLocationAuthorization,
  reconcileRadarGroups,
  reconcileFullLibrarySnapshot,
  reconcilePhotoSemanticIndex,
  scorePreference,
  savePhotoIndexCheckpoint,
  searchPhotoRadar,
  searchPhotoSemantic,
  consumePhotoOrganizerRequest,
  curatedPhotoRecord,
  photoCurationInput,
  upsertIndexedAssets,
  type PhotoLocationAuthorization,
  type PhotoLibraryAsset,
  type PhotoLibraryAuthorization,
  type PhotoRadarAnalysis,
  type PhotoSemanticMatch,
  undoPhotoPreference,
} from '../lib/photo';
import { startAgentRun } from '../lib/observe/bus';
import RunTrace from './RunTrace';
import PhotosChronicle from './PhotosChronicle';
import { getFeishuPhotoAssets, subscribeFeishuPhotoAssets } from '../feishu/librarySync';
import { reviewFeishuPhotos, upsertFeishuLibraryRecords } from '../feishu/api';

const PHOTO_SECTIONS = ['照片整理', '杂志', '日历'] as const;
const ORGANIZE_TABS = ['待你决定', '找照片'] as const;
type PhotoSection = (typeof PHOTO_SECTIONS)[number];
type OrganizeTab = (typeof ORGANIZE_TABS)[number];
type ActiveTask = 'library-index' | 'selection' | 'location' | 'semantic' | 'curation' | null;
const BATCH_SIZE = 48;
const SEARCH_WINDOW = 60;

const mergeByKey = <T extends { key: string }>(before: T[], incoming: T[]): T[] => {
  const map = new Map(before.map((item) => [item.key, item]));
  for (const item of incoming) map.set(item.key, { ...map.get(item.key), ...item });
  return [...map.values()];
};

const imageUrl = (asset?: PhotoLibraryAsset): string => {
  if (!asset || asset.sourceState === 'missing' || asset.sourceState === 'permission-revoked') return '';
  return asset.thumbnailUrl || asset.thumbnailRef || '';
};
const dateLabel = (time?: number): string => time ? new Date(time).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) : '日期未知';

function Metric({ label, value, tone = 'black' }: { label: string; value: number | string; tone?: 'black' | 'green' | 'amber' }) {
  const color = tone === 'green' ? 'text-[#087a43]' : tone === 'amber' ? 'text-[#9a6500]' : 'text-black';
  return <div className="border-2 border-black bg-white px-2 py-2 text-center"><div className={`font-pixel text-[15px] ${color}`}>{value}</div><div className="mt-0.5 text-[8px] text-black/50">{label}</div></div>;
}

function PhotoThumb({ asset, analysis, onOpen }: { asset?: PhotoLibraryAsset; analysis: PhotoRadarAnalysis; onOpen: () => void }) {
  const src = imageUrl(asset);
  return (
    <button onClick={onOpen} className="relative aspect-square w-full overflow-hidden border-2 border-black bg-[#d8d8d6] text-left shadow-[2px_2px_0_#000]">
      {src ? <img src={src} alt={asset?.fileName || '本地照片'} className="h-full w-full object-cover" /> : <Images className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-black/25" />}
      <span className="absolute left-1 top-1 bg-black px-1 font-pixel text-[7px] text-[#7CFF6B]">技术 {analysis.technicalQuality}</span>
      {analysis.personalAffinity != null && <span className="absolute bottom-1 right-1 bg-white/90 px-1 font-pixel text-[7px] text-black">偏好 {analysis.personalAffinity}</span>}
    </button>
  );
}

function SearchMatchReasons({ asset, analysis, query, semanticScore }: {
  asset: PhotoLibraryAsset; analysis: PhotoRadarAnalysis; query: string; semanticScore?: number;
}) {
  const reasons = explainPhotoSearchMatch({ asset, analysis }, query, semanticScore).slice(0, 3);
  if (!reasons.length) return <div className="mt-1 text-[7px] text-black/40">按最近时间排序</div>;
  return <div className="mt-1 flex flex-wrap gap-1">{reasons.map((reason) => <span key={`${reason.kind}:${reason.label}`} className={`border px-1 text-[7px] ${reason.kind === 'semantic' ? 'border-[#087a43]/40 text-[#087a43]' : 'border-black/20 text-black/50'}`}>{reason.label}</span>)}</div>;
}

export default function PhotosTab() {
  const feishuMode = typeof location !== 'undefined' && (location.pathname === '/feishu' || location.pathname.startsWith('/feishu/'));
  const [section, setSection] = useState<PhotoSection>('照片整理');
  const [root, setRoot] = useState<OrganizeTab>('待你决定');
  const [assets, setAssets] = useState<PhotoLibraryAsset[]>([]);
  const [analyses, setAnalyses] = useState<PhotoRadarAnalysis[]>([]);
  const [authorization, setAuthorization] = useState<PhotoLibraryAuthorization>('notDetermined');
  const [locationAuthorization, setLocationAuthorization] = useState<PhotoLocationAuthorization>('unsupported');
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [query, setQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState(() => getPhotoSearchHistory());
  const [searchLimit, setSearchLimit] = useState(SEARCH_WINDOW);
  const [activeTask, setActiveTask] = useState<ActiveTask>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [preferenceModel, setPreferenceModel] = useState(() => getPhotoPreferenceModel());
  const [preferenceCursor, setPreferenceCursor] = useState(0);
  const [semanticStatus, setSemanticStatus] = useState({ count: 0, stale: 0, modelId: '', version: '' });
  const [semanticMatches, setSemanticMatches] = useState<PhotoSemanticMatch[]>([]);
  const [semanticSearchState, setSemanticSearchState] = useState('');
  const [confirmClearIndex, setConfirmClearIndex] = useState(false);
  const [lightbox, setLightbox] = useState<{ asset: PhotoLibraryAsset; url: string; original: boolean } | null>(null);
  const webInput = useRef<HTMLInputElement>(null);
  const assetsRef = useRef<PhotoLibraryAsset[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const cancelIndexRef = useRef(false);
  const cancelSemanticRef = useRef(false);
  const capabilities = getPhotoLibraryCapabilities();

  const updateAssets = (incoming: PhotoLibraryAsset[]) => setAssets((current) => {
    const next = mergeByKey(current, incoming); assetsRef.current = next; return next;
  });
  const updateAnalyses = (incoming: PhotoRadarAnalysis[]) => setAnalyses((current) => mergeByKey(current, incoming));

  useEffect(() => {
    let alive = true;
    // Restore local/Feishu-derived state first; original files remain in the user's photo library.
    void Promise.all([getIndexedAssets(), getRadarAnalyses(), checkPhotoAuthorization(), checkPhotoLocationAuthorization(), getPhotoSemanticIndexStatus()]).then(async ([storedAssets, storedAnalyses, auth, locationAuth, semantic]) => {
      if (!alive) return;
      let currentAssets = storedAssets;
      if (capabilities.native && auth !== 'authorized' && auth !== 'limited') {
        await markNativeLibraryUnavailable();
        currentAssets = await getIndexedAssets();
      }
      if (!alive) return;
      const restored = mergeByKey<PhotoLibraryAsset>(
        currentAssets.map((asset): PhotoLibraryAsset => ({ ...asset, thumbnailUrl: asset.thumbnailRef })),
        getFeishuPhotoAssets(),
      );
      assetsRef.current = restored; setAssets(restored); setAnalyses(storedAnalyses); setAuthorization(auth); setLocationAuthorization(locationAuth); setSemanticStatus(semantic);
      setInitialized(true);
      if (capabilities.native && (auth === 'authorized' || auth === 'limited')) {
        void listPhotoLibrary({ limit: 120 }).then((page) => { if (alive) updateAssets(page.assets); });
      }
    }).catch(() => { if (alive) setInitialized(true); });
    return () => { alive = false; assetsRef.current.forEach(releaseSessionAsset); };
  }, [capabilities.native]);

  useEffect(() => subscribeFeishuPhotoAssets(() => updateAssets(getFeishuPhotoAssets())), []);

  useEffect(() => {
    if (feishuMode) { setSection('照片整理'); setRoot('待你决定'); }
  }, [feishuMode]);

  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [root, section]);
  useEffect(() => { setSearchLimit(SEARCH_WINDOW); }, [query]);
  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const timer = window.setTimeout(() => setSearchHistory(rememberPhotoSearch(normalized)), 1200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.key, asset])), [assets]);
  const realLibraryAssets = useMemo(() => assets.filter((asset) => (
    asset.mediaType === 'image'
    && asset.sourceState !== 'missing'
    && asset.sourceState !== 'permission-revoked'
    && Boolean(imageUrl(asset))
  )), [assets]);
  const availableAnalyses = useMemo(() => analyses.filter((analysis) => {
    const asset = assetMap.get(analysis.key);
    return asset && asset.sourceState !== 'missing' && asset.sourceState !== 'permission-revoked';
  }), [analyses, assetMap]);
  const curatedAssets = useMemo(() => buildCuratedPhotoAssets(realLibraryAssets, availableAnalyses), [realLibraryAssets, availableAnalyses]);
  const chronicleData = useMemo(() => buildPhotoChronicleData(curatedAssets), [curatedAssets]);
  const decisions = useMemo(() => buildPhotoDecisionGroups(availableAnalyses), [availableAnalyses]);
  const searchable = useMemo(() => analyses.map((analysis) => {
    const asset = assetMap.get(analysis.key); return asset ? { asset, analysis } : null;
  }).filter((item): item is { asset: PhotoLibraryAsset; analysis: PhotoRadarAnalysis } => Boolean(
    item && item.asset.sourceState !== 'missing' && item.asset.sourceState !== 'permission-revoked',
  )), [analyses, assetMap]);
  const literalSearchResults = useMemo(() => searchPhotoRadar(searchable, query), [searchable, query]);
  const semanticScoreMap = useMemo(() => new Map(semanticMatches.map((match) => [match.key, match.score])), [semanticMatches]);
  const searchResults = useMemo(() => mergePhotoSearchResults(
    searchable, literalSearchResults, semanticMatches, query,
  ), [literalSearchResults, query, searchable, semanticMatches]);
  const visibleSearchResults = useMemo(() => searchResults.slice(0, searchLimit), [searchLimit, searchResults]);
  const webSessionRestoreCount = useMemo(() => assets.filter((asset) => asset.source === 'web-picker' && !asset.key.startsWith('feishu:') && !asset.thumbnailUrl).length, [assets]);
  const preferencePairs = useMemo(() => buildPreferencePairs(availableAnalyses), [availableAnalyses]);
  const coldStartPair = preferencePairs.length ? preferencePairs[preferenceCursor % preferencePairs.length] : null;

  useEffect(() => {
    let cancelled = false;
    if (!query.trim() || semanticStatus.count === 0) { setSemanticMatches([]); setSemanticSearchState(''); return; }
    const timer = window.setTimeout(() => {
      setSemanticSearchState('正在本机计算文本向量…');
      void searchPhotoSemantic(query, 60, (phase) => { if (!cancelled) setSemanticSearchState(`本地模型：${phase}`); })
        .then((matches) => { if (!cancelled) { setSemanticMatches(matches); setSemanticSearchState(`端侧语义 top-k · ${matches.length} 个候选`); } })
        .catch(() => { if (!cancelled) { setSemanticMatches([]); setSemanticSearchState('语义模型当前不可用，已降级为标签/时间/GPS/OCR 搜索'); } });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, semanticStatus.count]);

  const analyze = async (incoming: PhotoLibraryAsset[], run: ReturnType<typeof startAgentRun>): Promise<boolean> => {
    const known = new Map(analyses.map((item) => [item.key, item]));
    const pending = incoming.filter((asset) => needsPhotoRadarAnalysis(asset, known.get(asset.key)));
    if (!pending.length) { run.phase('复用本地派生索引', `${incoming.length} 个 assetId · 原片未复制`); return false; }
    const migrations = pending.filter((asset) => known.has(asset.key)).length;
    if (migrations) run.phase('迁移照片雷达索引', `${migrations} 条 dHash v2 → dHash/pHash v3 · 用户确认不变`);
    run.phase('端侧缩略图分析', `${pending.length} 张 · 像素/dHash/pHash/EXIF · 不读原片`);
    for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
      if (cancelIndexRef.current) return true;
      const batch = pending.slice(offset, offset + BATCH_SIZE);
      const result = await analyzePhotoAssets(batch, {
        onProgress: (done, total, phase) => setProgress(`${phase} ${Math.min(offset + done, pending.length)}/${pending.length}${total ? '' : ''}`),
      });
      updateAnalyses(result);
      if (cancelIndexRef.current) return true;
    }
    const stored = await getRadarAnalyses();
    const grouped = reconcileRadarGroups(mergeByKey(assetsRef.current, incoming), stored);
    await putRadarAnalyses(grouped);
    setAnalyses(grouped);
    run.phase('全局重复与连拍聚类', `${grouped.length} 条派生索引 · 跨分页稳定 asset key`);
    return false;
  };

  const connectSystemLibrary = async () => {
    if (busy) return;
    if (!capabilities.native) { webInput.current?.click(); return; }
    const run = startAgentRun('照片雷达 · 系统相册', { skillId: 'pocket.photos.radar', skillVersion: '1.1.0', executionPath: 'local-rules', visualInput: '≤256px 缩略图', inputSummary: '系统 assetId、文件元数据与缩略图；RunTrace 不记录私人文件名，不批量读取原片', tools: ['MediaStore/Photo Library', 'EXIF', 'dHash + pHash v3'], userConfirmation: 'required' }); setRunId(run.runId); setActiveTask('library-index'); setBusy(true); setMessage(''); cancelIndexRef.current = false;
    try {
      run.phase('请求系统相册权限', 'Android MediaStore · 支持选定照片/全部照片');
      const auth = await requestPhotoAuthorization(); setAuthorization(auth);
      if (auth !== 'authorized' && auth !== 'limited') {
        await markNativeLibraryUnavailable();
        const unavailable = assetsRef.current.map((asset) => asset.source === 'native-library' ? { ...asset, sourceState: 'permission-revoked' as const } : asset);
        assetsRef.current = unavailable; setAssets(unavailable); setSemanticMatches([]);
        setMessage('没有获得照片访问权限。已有派生索引已从搜索结果隐藏；你仍可使用系统选择器只选几张。'); run.end(false); return;
      }
      run.phase('枚举系统资产', `${auth === 'limited' ? '选定照片' : '授权相册'} · includeFullResolutionData=false`);
      const previous = getPhotoIndexCheckpoint();
      const resumable = previous && !previous.complete && previous.authorization === auth;
      const startedAt = resumable ? previous.startedAt : Date.now();
      let offset = resumable ? previous.offset : 0; let hasMore = true; const collected: PhotoLibraryAsset[] = [];
      const seenKeys = new Set(assetsRef.current.filter((asset) => resumable && asset.lastSeenAt >= startedAt).map((asset) => asset.key));
      if (resumable && offset > 0) run.phase('恢复相册索引断点', `从第 ${offset} 个 assetId 继续`);
      while (hasMore && !cancelIndexRef.current) {
        const page = await listPhotoLibrary({ offset, limit: 120 });
        const authorizationTransition = photoAuthorizationTransition(auth, page.authorization);
        if (authorizationTransition !== 'stable') {
          clearPhotoIndexCheckpoint(); setAuthorization(page.authorization); setSemanticMatches([]);
          if (authorizationTransition === 'revoked') {
            await markNativeLibraryUnavailable();
            const unavailable = assetsRef.current.map((asset) => asset.source === 'native-library' ? { ...asset, sourceState: 'permission-revoked' as const } : asset);
            assetsRef.current = unavailable; setAssets(unavailable);
            setMessage('扫描期间照片权限被收回；未把未见资产当作删除，恢复授权后会从第 0 张重新核对。');
            run.phase('权限在扫描中收回', '派生索引保留 · 搜索结果隐藏 · 未执行 missing 清理');
          } else {
            setMessage('扫描期间授权范围发生变化；为避免误判删除，本轮已停止，下次从第 0 张按新范围重新索引。');
            run.phase('授权范围在扫描中变化', `${auth} → ${page.authorization} · 已停止且未清理旧索引`);
          }
          run.end(false); return;
        }
        collected.push(...page.assets); updateAssets(page.assets); await upsertIndexedAssets(page.assets);
        page.assets.forEach((asset) => seenKeys.add(asset.key));
        offset += page.assets.length; hasMore = page.hasMore && page.assets.length > 0;
        savePhotoIndexCheckpoint({ version: 1, source: 'native-library', authorization: auth, offset, totalCount: page.totalCount, startedAt, updatedAt: Date.now(), complete: !hasMore });
        setProgress(`已发现 ${collected.length}/${page.totalCount} 张 · 原片未复制`);
      }
      if (cancelIndexRef.current) {
        setMessage(`已暂停并保存到第 ${offset} 个资产；下次会从断点继续。`); run.end(false); return;
      }
      const missing = await reconcileFullLibrarySnapshot(seenKeys, auth);
      if (missing) run.phase('核对系统资产变更', `${missing} 个旧资产已标记 missing · 未删除用户确认`);
      const persistedAssets = await getIndexedAssets();
      const persistedState = new Map(persistedAssets.map((asset) => [asset.key, asset.sourceState]));
      const refreshed = assetsRef.current.map((asset) => ({ ...asset, sourceState: persistedState.get(asset.key) || asset.sourceState }));
      assetsRef.current = refreshed; setAssets(refreshed);
      const semanticReconciliation = await reconcilePhotoSemanticIndex(persistedAssets, { pruneOrphans: auth === 'authorized' });
      if (semanticReconciliation.removed) run.phase('回收孤立语义向量', `${semanticReconciliation.removed} 条派生向量 · 不影响照片/偏好/确认`);
      if (semanticReconciliation.retainedForSafety) run.phase('语义索引安全闸', `${semanticReconciliation.orphaned} 条孤立向量超过 20% · 已保留待显式处理`);
      const discovered = mergeByKey(assetsRef.current.filter((asset) => asset.source === 'native-library'), collected);
      const analysisCancelled = await analyze(discovered, run);
      if (analysisCancelled) { setMessage('已在当前 48 张批次边界暂停；资产索引与已完成分析均已保存，下次刷新会继续。'); run.end(false); return; }
      setMessage(`已建立 ${collected.length} 个本地资产索引。原片仍在系统相册。`); run.end(true);
    } catch (error) {
      let currentAuthorization: PhotoLibraryAuthorization | null = null;
      try { currentAuthorization = await checkPhotoAuthorization(); } catch { /* keep the original failure */ }
      if (currentAuthorization && currentAuthorization !== 'authorized' && currentAuthorization !== 'limited') {
        clearPhotoIndexCheckpoint(); setAuthorization(currentAuthorization); setSemanticMatches([]);
        await markNativeLibraryUnavailable();
        const unavailable = assetsRef.current.map((asset) => asset.source === 'native-library' ? { ...asset, sourceState: 'permission-revoked' as const } : asset);
        assetsRef.current = unavailable; setAssets(unavailable);
        setMessage('系统在读取分页时收回了照片权限；旧派生索引已隐藏，没有把照片误标为删除。');
        run.phase('分页读取失败后复核权限', `${currentAuthorization} · 保留派生数据并从搜索隐藏`);
      } else setMessage(`相册索引失败：${error instanceof Error ? error.message : String(error)}`);
      run.end(false);
    }
    finally { setBusy(false); setActiveTask(null); setProgress(''); cancelIndexRef.current = false; }
  };

  const processSelectedFiles = async (files: FileList | File[], objective = '') => {
    if (!files.length || busy) return;
    const selected = importWebPhotos(files); updateAssets(selected);
    const run = startAgentRun(`照片雷达 · 手动选择 ${selected.length} 张`); setRunId(run.runId); setActiveTask('selection'); setBusy(true); setMessage('');
    try {
      setSection('照片整理'); setRoot('待你决定');
      run.phase('Frost 转交照片整理', `${selected.length} 张主动选择的照片${objective ? ` · 目标：${objective.slice(0, 80)}` : ''}`);
      await analyze(selected, run);
      setMessage(`已完成 ${selected.length} 张照片的本地查重与技术筛选。下一步点击“AI 精选待审照片”，确认后才会进入杂志、日历和飞书多维表格。`);
      run.end(true);
    }
    catch (error) { setMessage(String(error)); run.end(false); }
    finally { setBusy(false); setActiveTask(null); setProgress(''); if (webInput.current) webInput.current.value = ''; }
  };

  const pickWebFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await processSelectedFiles(files);
  };

  useEffect(() => {
    if (!initialized) return;
    const request = consumePhotoOrganizerRequest();
    if (request) void processSelectedFiles(request.files, request.objective);
    // The Photos tab is mounted when Frost routes here, so one pending handoff is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  const enablePhotoLocations = async () => {
    if (busy || !capabilities.native) return;
    const run = startAgentRun('照片雷达 · EXIF 位置'); setRunId(run.runId); setActiveTask('location'); setBusy(true); setMessage('');
    try {
      run.phase('请求照片位置权限', 'Android ACCESS_MEDIA_LOCATION · 与相册读取分开授权');
      const state = await requestPhotoLocationAuthorization(); setLocationAuthorization(state);
      if (state !== 'authorized' && state !== 'notRequired') {
        setMessage('没有读取照片原始位置；搜索和整理仍可使用，地图候选会保持为空。'); run.end(false); return;
      }
      run.phase('按 assetId 读取 EXIF 位置', `${assets.length} 个资产 · 不复制原片`);
      const located = await attachPhotoLocations(assets); updateAssets(located); await upsertIndexedAssets(located);
      const locationMap = new Map(located.filter((asset) => asset.latitude != null && asset.longitude != null).map((asset) => [asset.key, asset]));
      const nextAnalyses = analyses.map((analysis) => {
        const asset = locationMap.get(analysis.key); if (!asset) return analysis;
        const realPhoto = analysis.photoType === 'place' || analysis.photoType === 'life' || analysis.photoType === 'place_nogps';
        return { ...analysis, photoType: analysis.photoType === 'place_nogps' ? 'place' as const : analysis.photoType, needPlace: false, pinnable: realPhoto && analysis.technicalQuality >= 50 };
      });
      await putRadarAnalyses(nextAnalyses);
      setAnalyses(nextAnalyses);
      setMessage(`已在本机读取 ${locationMap.size} 张照片的位置；未发现位置的照片不会被猜测地点。`); run.end(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); run.end(false); }
    finally { setBusy(false); setActiveTask(null); }
  };

  const buildSemanticIndex = async () => {
    if (busy || !assets.length) return;
    const run = startAgentRun('照片雷达 · 全库语义索引', { skillId: 'pocket.photos.semantic', skillVersion: PHOTO_EMBEDDING_VERSION, executionPath: 'local-onnx', runtime: 'ONNX Runtime Web', visualInput: '224×224 缩略图', inputSummary: `${assets.length} 张 224px 本地缩略图；不记录文件名、不上传原片或向量`, tools: ['CLIP ViT-B/32', 'ONNX Runtime Web', 'IndexedDB'], userConfirmation: 'confirmed' }); setRunId(run.runId); setActiveTask('semantic'); setBusy(true); setMessage(''); cancelSemanticRef.current = false;
    try {
      const initialBudget = await getPhotoDeviceBudget();
      if (!initialBudget.allowed) {
        setMessage(`为保护设备，语义索引暂未启动：${initialBudget.pauseReason}。回到前台或接上电源后可继续。`);
        run.phase('设备预算暂停', initialBudget.pauseReason || '设备当前不适合持续推理'); run.end(false); return;
      }
      run.phase('用户启动端侧模型安装', 'CLIP ViT-B/32 · 文本塔+视觉塔 · 浏览器缓存 · 不上传照片');
      const result = await buildPhotoSemanticIndex(assets, {
        shouldCancel: () => cancelSemanticRef.current,
        shouldPause: async () => {
          const budget = await getPhotoDeviceBudget();
          return budget.allowed ? null : budget.pauseReason || '设备预算不足';
        },
        onProgress: (done, total, phase) => setProgress(`${phase} ${done}/${total}`),
        onModelProgress: (phase) => setProgress(`模型准备 · ${phase}`),
      });
      const status = await getPhotoSemanticIndexStatus(); setSemanticStatus(status);
      run.phase('本地向量持久化', `${status.count} 条 · 512d→int8 · ${result.backend} · 原片/向量均未上传`);
      setMessage(result.cancelled
        ? `已暂停语义索引${result.pauseReason ? `（${result.pauseReason}）` : ''}；新增 ${result.indexed}、复用 ${result.reused}、失败隔离 ${result.failed}。下次按 assetId 续建。`
        : `语义索引完成：新增 ${result.indexed}、复用 ${result.reused}、失败隔离 ${result.failed}，耗时 ${(result.durationMs / 1000).toFixed(1)} 秒。`);
      run.end(!result.cancelled && result.failed === 0);
    } catch (error) {
      setMessage(`语义索引未完成：${error instanceof Error ? error.message : String(error)}。标签与元数据搜索仍可使用。`); run.end(false);
    } finally { setBusy(false); setActiveTask(null); setProgress(''); cancelSemanticRef.current = false; }
  };

  const resetSemanticIndex = async () => {
    if (busy) return;
    await clearPhotoSemanticIndex(); const status = await getPhotoSemanticIndexStatus(); setSemanticStatus(status); setSemanticMatches([]);
    setMessage('已清除本机语义向量；照片索引、个人偏好和光阴志没有变化。');
  };

  const resetPhotoIndex = async () => {
    if (busy) return;
    if (!confirmClearIndex) {
      setConfirmClearIndex(true);
      setMessage('再次点击“确认清除派生索引”才会删除本机资产/雷达/语义索引；系统原片与个人偏好不受影响。');
      return;
    }
    assetsRef.current.forEach(releaseSessionAsset);
    const [, , , removedCacheFiles] = await Promise.all([clearPhotoLibraryIndex(), clearPhotoRadar(), clearPhotoSemanticIndex(), clearPhotoDerivedCache()]);
    assetsRef.current = []; setAssets([]); setAnalyses([]); setSemanticMatches([]);
    setSemanticStatus(await getPhotoSemanticIndexStatus()); setConfirmClearIndex(false);
    setMessage(`已清除本机照片派生索引与缓存${removedCacheFiles ? `（${removedCacheFiles} 个缓存文件）` : ''}；系统原片、地球已有落点和个人偏好没有变化。`);
  };

  const reviewCandidates = useMemo(() => availableAnalyses.filter((analysis) => (
    !analysis.duplicateOf
    && !analysis.chronicleIncluded
    && ['place', 'life', 'place_nogps', 'uncertain'].includes(analysis.photoType)
  )), [availableAnalyses]);
  const unreviewedCandidates = useMemo(() => reviewCandidates.filter((analysis) => !analysis.curation), [reviewCandidates]);

  const reviewWithQwen = async (only?: PhotoRadarAnalysis) => {
    const candidates = only ? [only] : unreviewedCandidates;
    if (!candidates.length || busy) return;
    const run = startAgentRun('照片精选 · AI 云端评审', {
      skillId: 'pocket.photos.curation', skillVersion: '1.0.0', executionPath: 'qwen-cloud',
      visualInput: '≤448px 用户主动选择缩略图', inputSummary: `${candidates.length} 张已完成本地查重/技术检测的候选；AI 只建议，不自动入库`,
      tools: ['AI Vision', 'Feishu Bitable'], userConfirmation: 'required',
    });
    setRunId(run.runId); setActiveTask('curation'); setBusy(true); setMessage('');
    try {
      const reviewed: PhotoRadarAnalysis[] = [];
      for (let offset = 0; offset < candidates.length; offset += 8) {
        const batch = candidates.slice(offset, offset + 8);
        setProgress(`AI 正在评审 ${Math.min(offset + batch.length, candidates.length)}/${candidates.length}`);
        const inputs = await Promise.all(batch.map(async (analysis) => {
          const asset = assetMap.get(analysis.key);
          if (!asset) throw new Error('候选照片已不可用，请重新选择。');
          return photoCurationInput(asset, analysis);
        }));
        const result = await reviewFeishuPhotos(inputs);
        const byId = new Map(result.reviews.map((review) => [review.id, review]));
        reviewed.push(...batch.map((analysis) => {
          const review = byId.get(analysis.contentHash);
          if (!review) throw new Error('AI 返回缺少照片评审结果。');
          return {
            ...analysis,
            curation: { ...review, model: result.model, reviewedAt: Date.now() },
            visionBackend: 'qwen-cloud' as const,
            analyzedAt: Date.now(),
          };
        }));
      }
      await putRadarAnalyses(reviewed); updateAnalyses(reviewed);
      run.phase('结构化评审完成', `${reviewed.length} 张 · keep/review/reject · 等待用户逐张确认`);
      setMessage(`AI 已完成 ${reviewed.length} 张精选建议。请逐张确认；确认前不会进入杂志、日历或飞书多维表格。`);
      run.end(true);
    } catch (error) {
      setMessage(`AI 精选失败：${error instanceof Error ? error.message : String(error)}`); run.end(false);
    } finally { setBusy(false); setActiveTask(null); setProgress(''); }
  };

  const confirmCurated = async (analysis: PhotoRadarAnalysis) => {
    const asset = assetMap.get(analysis.key);
    if (!asset || analysis.duplicateOf || !analysis.curation || busy) return;
    setBusy(true); setMessage('');
    try {
      const next = { ...analysis, chronicleIncluded: true, analyzedAt: Date.now() };
      const record = await curatedPhotoRecord(asset, next);
      await upsertFeishuLibraryRecords('photos', [record]);
      const hasLocation = asset.latitude != null && asset.longitude != null;
      if (hasLocation) {
        await addPhotoPins([{
          id: photoPinIdentity(asset.key, analysis.contentHash), assetKey: asset.key,
          contentHash: analysis.contentHash, lat: asset.latitude!, lng: asset.longitude!,
          thumb: imageUrl(asset), name: asset.fileName, source: 'exif', ts: Date.now(),
        }]);
      }
      await putRadarAnalyses([next]); updateAnalyses([next]);
      setMessage(`已确认：照片进入杂志与日历，按稳定 Pocket Photo ID 写入飞书照片多维表格${hasLocation ? '，并定位到地球' : '；补充地点后可定位到地球'}。重复记录会更新而不是新增。`);
    } catch (error) {
      setMessage(`确认未完成：${error instanceof Error ? error.message : String(error)}。本地与飞书都没有写入半成品。`);
    } finally { setBusy(false); }
  };

  const applyPreferenceModel = async (model: ReturnType<typeof getPhotoPreferenceModel>) => {
    const next = analyses.map((item) => {
      const asset = assetMap.get(item.key);
      const scored = scorePreference(model, preferenceVector(item, !!asset && asset.latitude != null && asset.longitude != null));
      return {
        ...item,
        personalAffinity: scored.affinity,
        preferenceConfidence: scored.confidence,
      };
    });
    await putRadarAnalyses(next);
    setPreferenceModel(model); setAnalyses(next);
  };

  const chooseColdStart = async (winner: PhotoRadarAnalysis, loser: PhotoRadarAnalysis) => {
    const winnerAsset = assetMap.get(winner.key); const loserAsset = assetMap.get(loser.key);
    if (!winnerAsset || !loserAsset) return;
    const model = learnPhotoPreference(
      preferenceVector(winner, winnerAsset.latitude != null && winnerAsset.longitude != null),
      preferenceVector(loser, loserAsset.latitude != null && loserAsset.longitude != null),
    );
    await applyPreferenceModel(model); setPreferenceCursor((value) => value + 1);
    setMessage(model.choices < MIN_PREFERENCE_CHOICES
      ? `已记住第 ${model.choices} 次明确选择；还需 ${MIN_PREFERENCE_CHOICES - model.choices} 次才会显示个人偏好。`
      : '10 组冷启动完成。个人偏好已开始参与排序，但不会改写技术质量。');
  };

  const undoLastPreference = async () => {
    const previous = undoPhotoPreference();
    if (!previous) { setMessage('没有可撤销的偏好选择。'); return; }
    await applyPreferenceModel(previous); setPreferenceCursor((value) => Math.max(0, value - 1));
    setMessage(`已撤销上次偏好学习；当前保留 ${previous.choices} 次明确选择。`);
  };

  const resetPreference = async () => {
    clearPhotoPreference(); const empty = getPhotoPreferenceModel(); await applyPreferenceModel(empty); setPreferenceCursor(0);
    setMessage('已清除本机个人偏好；照片索引和光阴志没有变化。');
  };

  const chooseRepresentative = async (winner: PhotoRadarAnalysis, group: PhotoRadarAnalysis[]) => {
    const loser = group.filter((item) => item.key !== winner.key).sort((a, b) => b.technicalQuality - a.technicalQuality)[0];
    if (!loser) { setMessage('已选择代表照片。请运行 AI 精选并确认后，再进入杂志、日历与飞书多维表格。'); return; }
    const winnerAsset = assetMap.get(winner.key); const loserAsset = assetMap.get(loser.key);
    if (!winnerAsset || !loserAsset) return;
    const model = learnPhotoPreference(
      preferenceVector(winner, winnerAsset.latitude != null && winnerAsset.longitude != null),
      preferenceVector(loser, loserAsset.latitude != null && loserAsset.longitude != null),
    );
    await applyPreferenceModel(model);
    setMessage(model.choices < MIN_PREFERENCE_CHOICES
      ? `已记住第 ${model.choices} 次明确选择；满 ${MIN_PREFERENCE_CHOICES} 次后才显示个人偏好分。`
      : '已更新本地个人偏好。还需通过 AI 精选并由你确认，才会进入杂志、日历和飞书。');
  };

  const pinToEarth = async (analysis: PhotoRadarAnalysis) => {
    const asset = assetMap.get(analysis.key);
    if (!asset || asset.latitude == null || asset.longitude == null) return;
    await addPhotoPins([{ id: photoPinIdentity(asset.key, analysis.contentHash), assetKey: asset.key, contentHash: analysis.contentHash, lat: asset.latitude, lng: asset.longitude, thumb: imageUrl(asset), name: asset.fileName, source: 'exif', ts: Date.now() }]);
    setMessage('已确认钉到 Pocket Earth；地球落点与杂志/日历收录是两个独立确认，地球只保存小缩略图，不保存原片。');
  };

  const openPhoto = (asset: PhotoLibraryAsset) => setLightbox({ asset, url: imageUrl(asset), original: false });
  const openPhotoByKey = (key: string) => {
    const asset = assetMap.get(key);
    if (asset) openPhoto(asset);
  };
  const openOriginal = async () => {
    if (!lightbox || lightbox.original) return;
    try {
      const result = await openPhotoOriginal(lightbox.asset);
      if (result.mode === 'system-gallery') {
        setMessage('已交给系统相册打开原片；Pocket Earth 没有复制、移动或接管原文件。');
      } else if (result.url) setLightbox({ ...lightbox, url: result.url, original: true });
    }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const closeLightbox = () => {
    if (lightbox?.original && lightbox.url.startsWith('blob:')) URL.revokeObjectURL(lightbox.url);
    setLightbox(null);
  };

  const firstBurst = decisions.bursts[0] || [];
  const technicalBest = firstBurst.slice().sort((a, b) => b.technicalQuality - a.technicalQuality)[0];
  const preferenceBest = firstBurst.filter((item) => item.personalAffinity != null).sort((a, b) => (b.personalAffinity || 0) - (a.personalAffinity || 0))[0];
  const includedAnalyses = availableAnalyses.filter((analysis) => analysis.chronicleIncluded && analysis.curation);
  const hiddenIncludedCount = analyses.filter((analysis) => analysis.chronicleIncluded && analysis.curation).length - includedAnalyses.length;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#EAEAEA] font-sans">
      <input ref={webInput} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void pickWebFiles(event.target.files)} />
      <div className="flex h-[30px] shrink-0 items-center justify-center border-b-2 border-black bg-[#EAEAEA] px-4">
        <div className="font-pixel text-[10.4px] uppercase tracking-widest leading-none">POCKET EARTH</div>
      </div>
      <header className="shrink-0 border-b-2 border-black bg-white px-4 py-4">
        <h1 className="mb-2 font-pixel text-xl uppercase tracking-wider">PHOTOS</h1>
        <p className="text-xs font-medium tracking-wide text-black/70">
          按照片整理 / 杂志 / 日历整理你的照片<br />
          <span className="mt-1 block font-pixel text-[9px] opacity-60">Your moments, three ways.</span>
        </p>
      </header>

      <div className="z-10 flex shrink-0 justify-center border-b-2 border-black bg-white px-4 py-3">
        <div className="flex w-full max-w-[280px] border-2 border-black bg-[#EAEAEA] p-1">
          {PHOTO_SECTIONS.map((item) => <button key={item} onClick={() => setSection(item)} className={`flex-1 py-1.5 text-center text-[11px] font-bold transition-all ${section === item ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>{item}</button>)}
        </div>
      </div>

      {section === '照片整理' && <div className="shrink-0 border-b-2 border-black bg-[#EAEAEA] px-3 py-2">
        {feishuMode ? (
          <div className="border-2 border-black bg-white p-2">
            <div className="flex items-center justify-between gap-2"><b className="text-[10px]">飞书照片整理</b><span className="border border-black bg-[#7CFF6B] px-1.5 py-0.5 font-pixel text-[6px]">DEDUPE → AI → CONFIRM → FEISHU</span></div>
            <p className="mt-1 text-[8px] leading-4 text-black/50">无需安装 PWA 模型。选择照片后先查重与技术检测，再由 AI 建议；你确认后才进入杂志、日历和飞书照片表。</p>
          </div>
        ) : (
          <>
            <div className="flex border-2 border-black bg-white p-1">
              {ORGANIZE_TABS.map((item) => <button key={item} onClick={() => setRoot(item)} className={`flex-1 py-1.5 text-[10px] font-bold ${root === item ? 'bg-black text-[#7CFF6B]' : ''}`}>{item}</button>)}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[7px] text-black/45">
              <span>照片雷达 · 最终决定留给你</span>
              <span className="border border-black bg-[#7CFF6B] px-1.5 py-0.5 font-pixel text-[6px]">LOCAL DEDUPE → AI → HUMAN</span>
            </div>
          </>
        )}
      </div>}

      <div ref={contentRef} className={`min-h-0 flex-1 ${section === '日历' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        <section className={`shrink-0 border-b-2 border-black px-3 py-2 ${realLibraryAssets.length ? 'bg-[#f8fff3]' : 'bg-[#fff8dc]'}`}>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-pixel text-[8px]">{realLibraryAssets.length ? `照片源 ${realLibraryAssets.length} 张 · 已确认精选 ${curatedAssets.length} 张` : '尚未连接或选择照片'}</div>
              <div className="mt-0.5 text-[8px] leading-relaxed text-black/50">{realLibraryAssets.length ? '照片整理先查重和评审；只有你确认的照片才进入杂志、日历，并 upsert 飞书多维表格。' : '选择照片后会先整理，不再自动把整批相册直接放进杂志和日历。'}</div>
            </div>
            <button disabled={busy} onClick={() => void connectSystemLibrary()} className="flex shrink-0 items-center gap-1 border-2 border-black bg-[#7CFF6B] px-2 py-2 text-[8px] font-bold shadow-[2px_2px_0_#000] disabled:opacity-50">
              {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : capabilities.native ? <Camera className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
              {realLibraryAssets.length ? '刷新照片集' : capabilities.native ? '访问用户相册，构建照片集' : '选择照片，构建照片集'}
            </button>
          </div>
          {activeTask === 'library-index' && capabilities.native && <div className="mt-2 flex items-center gap-2"><div className="flex-1 text-[8px] text-black/55">{progress || '正在读取系统资产元数据与缩略图…'}</div><button onClick={() => { cancelIndexRef.current = true; setProgress('将在当前分页完成后暂停…'); }} className="border border-black bg-[#ffe4a8] px-2 py-1 text-[8px] font-bold">停止</button></div>}
        </section>
        {section === '照片整理' && root === '待你决定' && <div className="space-y-3 p-3 pb-8">
          <section className="border-2 border-black bg-white p-3 shadow-[3px_3px_0_#000]">
            <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-[#087a43]" strokeWidth={2.5} /><div className="flex-1"><div className="font-pixel text-[9px]">系统相册是唯一原片库 · 建议不会自动执行</div><div className="mt-1 text-[9px] leading-relaxed text-black/55">Pocket Earth 持久化系统 assetId、文件元数据、缩略图缓存引用和派生标签/向量；日常分析只读 ≤320px 缩略图。查看原片时直接交给系统相册，不在 App 内复制原文件。{capabilities.native ? '当前为手机原生相册桥。' : '当前是网页降级，只能分析你本次主动选择的照片。'}</div></div></div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[7px]"><div className="border border-black/30 bg-[#f8fff3] px-1 py-1"><b>长期保存</b><br />assetId · 标签 · 向量</div><div className="border border-black/30 bg-white px-1 py-1"><b>派生缓存</b><br />≤320px 缩略图</div><div className="border border-black/30 bg-[#fff8dc] px-1 py-1"><b>系统保管</b><br />唯一原片</div></div>
            {webSessionRestoreCount > 0 && <div className="mt-2 border-2 border-[#9a6500] bg-[#fff8dc] p-2 text-[8px] leading-relaxed text-[#765000]">上次网页会话的 {webSessionRestoreCount} 张照片只剩本地派生标签；浏览器不会持久化原片或 blob 缩略图，因此这里显示占位而不是坏图。请重新选择原文件以恢复预览。</div>}
            {capabilities.native && (authorization === 'authorized' || authorization === 'limited') && locationAuthorization !== 'authorized' && locationAuthorization !== 'notRequired' && <button disabled={busy} onClick={() => void enablePhotoLocations()} className="mt-2 flex w-full items-center justify-center gap-1.5 border border-black bg-white py-1.5 text-[8px] font-bold"><MapPin className="h-3 w-3" />另行允许读取照片原始位置</button>}
            {(progress || message) && <div className="mt-2 border-l-2 border-black pl-2 text-[9px] leading-relaxed text-black/60">{progress || message}</div>}
            <div className="mt-2 text-[8px] text-black/40">相册授权：{authorization === 'authorized' ? '全部照片' : authorization === 'limited' ? '系统选定照片' : authorization} · 原始 GPS：{locationAuthorization} · 已引用 {assets.length} 个 assetId · 已分析 {analyses.length}</div>
            {(assets.length > 0 || analyses.length > 0) && <button disabled={busy} onClick={() => void resetPhotoIndex()} className={`mt-2 w-full border py-1.5 text-[8px] ${confirmClearIndex ? 'border-[#9a6500] bg-[#fff1c7] font-bold text-[#765000]' : 'border-black/35 bg-white text-black/55'}`}>{confirmClearIndex ? '确认清除派生索引' : '清除本机照片索引'}</button>}
          </section>

          <div className="grid grid-cols-5 gap-1.5"><Metric label="连拍组" value={decisions.bursts.length} /><Metric label="疑似重复" value={decisions.duplicates.length} /><Metric label="技术问题" value={decisions.technicalIssues.length} tone="amber" /><Metric label="票据" value={decisions.documents.length} /><Metric label="可落地球" value={decisions.earthCandidates.length} tone="green" /></div>

          {!!reviewCandidates.length && <section className="border-2 border-black bg-[#d9ffec] p-3 shadow-[3px_3px_0_#000]">
            <div className="flex items-start justify-between gap-3"><div><div className="font-pixel text-[9px]">AI 精选 → 你确认 → 飞书入库</div><div className="mt-1 text-[8px] leading-4 text-black/55">已排除确定重复、截图和票据。点击后仅将 ≤448px 缩略图发送给服务端 AI；它只建议故事与编辑价值，不会自动收录或删除。</div></div><span className="shrink-0 border border-black bg-white px-2 py-1 font-pixel text-[7px]">待评 {unreviewedCandidates.length}</span></div>
            <button disabled={busy || !unreviewedCandidates.length} onClick={() => void reviewWithQwen()} className="mt-3 w-full border-2 border-black bg-[#7CFF6B] py-2 text-[9px] font-black shadow-[2px_2px_0_#000] disabled:opacity-40">{activeTask === 'curation' ? progress || 'AI 正在评审…' : unreviewedCandidates.length ? `AI 精选待审照片（${unreviewedCandidates.length}）` : '本批照片已完成 AI 建议'}</button>
          </section>}

          {reviewCandidates.filter((analysis) => analysis.curation).slice(0, 12).map((analysis) => {
            const review = analysis.curation!;
            const tone = review.recommendation === 'keep' ? 'bg-[#d9ffec]' : review.recommendation === 'reject' ? 'bg-[#ffe5e2]' : 'bg-[#fff8dc]';
            return <section key={`curation:${analysis.key}`} className={`border-2 border-black p-3 ${tone}`}><div className="flex gap-3"><div className="w-[92px] shrink-0"><PhotoThumb asset={assetMap.get(analysis.key)} analysis={analysis} onOpen={() => { const asset = assetMap.get(analysis.key); if (asset) openPhoto(asset); }} /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="font-pixel text-[8px]">{review.recommendation === 'keep' ? '建议精选' : review.recommendation === 'reject' ? '建议不收录' : '建议人工复核'}</span><span className="border border-black bg-white px-1 text-[7px]">质量 {review.qualityScore} · 故事 {review.storyScore}</span></div><p className="mt-1 text-[9px] font-bold leading-4">{review.summary}</p><p className="mt-1 text-[8px] leading-4 text-black/55">{review.reasons.join('；')}</p><div className="mt-2 flex gap-1.5"><button disabled={busy || analysis.chronicleIncluded} onClick={() => void confirmCurated(analysis)} className="flex-1 border-2 border-black bg-[#7CFF6B] py-1.5 text-[8px] font-black disabled:opacity-50">{analysis.chronicleIncluded ? '已进入杂志 / 日历 / 飞书' : '确认收录并同步飞书'}</button><button disabled={busy} onClick={() => void reviewWithQwen(analysis)} className="border-2 border-black bg-white px-2 text-[8px]">重新评审</button></div></div></div></section>;
          })}

          {coldStartPair && preferenceModel.choices < MIN_PREFERENCE_CHOICES && <section className="border-2 border-black bg-[#f5f0ff] p-3 shadow-[3px_3px_0_#000]"><div className="flex items-center justify-between gap-2"><div><div className="font-pixel text-[9px]">个人偏好冷启动 · {preferenceModel.choices}/{MIN_PREFERENCE_CHOICES}</div><div className="mt-1 text-[8px] text-black/50">哪张更值得你留下？只在本机学习；跳过不算负样本。</div></div><button onClick={() => setPreferenceCursor((value) => value + 1)} className="shrink-0 border border-black bg-white px-2 py-1 text-[8px]">跳过</button></div><div className="mt-3 grid grid-cols-2 gap-3">{([coldStartPair.left, coldStartPair.right] as const).map((item, index) => <div key={item.key}><PhotoThumb asset={assetMap.get(item.key)} analysis={item} onOpen={() => { const asset = assetMap.get(item.key); if (asset) openPhoto(asset); }} /><button onClick={() => void chooseColdStart(item, index === 0 ? coldStartPair.right : coldStartPair.left)} className="mt-2 w-full border-2 border-black bg-white py-1.5 text-[8px] font-bold shadow-[2px_2px_0_#000]">更想留这张</button></div>)}</div></section>}

          {preferenceModel.choices > 0 && <div className="flex items-center justify-between border border-black/30 bg-white px-2 py-1.5 text-[8px] text-black/55"><span>{preferenceModel.choices < MIN_PREFERENCE_CHOICES ? `个人偏好学习中 · ${preferenceModel.choices}/${MIN_PREFERENCE_CHOICES}` : `个人偏好已启用 · ${preferenceModel.choices} 次明确选择`}</span><span className="flex gap-2"><button onClick={() => void undoLastPreference()} className="underline">撤销上次</button><button onClick={() => void resetPreference()} className="underline">清空偏好</button></span></div>}

          {!analyses.length && <section className="border-2 border-dashed border-black/35 px-5 py-10 text-center"><ScanLine className="mx-auto h-8 w-8 text-black/25" /><div className="mt-3 font-pixel text-[9px] text-black/45">还没有真实本地索引</div><div className="mt-2 text-[10px] leading-relaxed text-black/45">连接相册后，这里只呈现少数需要你决定的问题，不显示虚构数量。</div></section>}

          {!!firstBurst.length && <section className="border-2 border-black bg-[#f8fff3] p-3 shadow-[3px_3px_0_#000]"><div className="flex items-center gap-2"><Aperture className="h-4 w-4" /><div className="font-pixel text-[9px]">连拍代表 · 选择权在你</div></div><div className="mt-1 text-[9px] text-black/55">技术最佳与个人偏好分开显示；你的选择只训练本机小型排序器。</div><div className="mt-3 grid grid-cols-3 gap-2">{firstBurst.slice(0, 6).map((item) => <div key={item.key}><PhotoThumb asset={assetMap.get(item.key)} analysis={item} onOpen={() => { const asset = assetMap.get(item.key); if (asset) openPhoto(asset); }} /><div className="mt-1 min-h-[20px] text-[8px] leading-tight">{item.key === technicalBest?.key ? '✓ 技术代表' : item.key === preferenceBest?.key ? '♥ 更像你的偏好' : '同组候选'}</div><button onClick={() => void chooseRepresentative(item, firstBurst)} className="mt-1 w-full border border-black bg-white py-1 text-[8px] font-bold">选这张</button></div>)}</div></section>}

          {!!decisions.documents.length && <section className="border-2 border-black bg-white p-3"><div className="font-pixel text-[8px]">资料类照片已隔离 · {decisions.documents.length} 张</div><p className="mt-1 text-[8px] leading-4 text-black/55">截图、票据与文档不会进入本次照片精选，也不会自动进入杂志或日历；原资料保持不变，等待你另行处理。</p></section>}

          {decisions.earthCandidates.slice(0, 3).map((item) => <section key={item.key} className="flex gap-3 border-2 border-black bg-white p-3"><div className="w-[82px] shrink-0"><PhotoThumb asset={assetMap.get(item.key)} analysis={item} onOpen={() => { const asset = assetMap.get(item.key); if (asset) openPhoto(asset); }} /></div><div className="flex-1"><div className="flex items-center gap-1.5 font-pixel text-[8px]"><MapPin className="h-3.5 w-3.5 text-[#087a43]" />适合钉到地球</div><div className="mt-1 text-[9px] text-black/55">有系统 GPS · 技术质量 {item.technicalQuality} · 置信度 {Math.round(item.confidence * 100)}%</div><button onClick={() => void pinToEarth(item)} className="mt-3 border-2 border-black bg-[#7CFF6B] px-3 py-1.5 text-[9px] font-bold shadow-[2px_2px_0_#000]">确认钉到 Pocket Earth</button></div></section>)}

          {!!decisions.technicalIssues.length && <section className="border-2 border-black bg-[#fff8e6] p-3"><div className="flex items-center gap-2 font-pixel text-[8px]"><AlertTriangle className="h-4 w-4 text-[#9a6500]" />{decisions.technicalIssues.length} 张技术问题 · 仅建议</div><div className="mt-2 grid grid-cols-5 gap-1.5">{decisions.technicalIssues.slice(0, 10).map((item) => <PhotoThumb key={item.key} asset={assetMap.get(item.key)} analysis={item} onOpen={() => { const asset = assetMap.get(item.key); if (asset) openPhoto(asset); }} />)}</div><div className="mt-2 space-y-0.5 text-[8px] text-[#765000]">{decisions.technicalIssues.slice(0, 3).map((item) => <div key={item.key}>• {item.reasons.filter((reason) => /清晰度|过曝|欠曝|裁切/.test(reason)).join('；') || '技术质量偏低，建议对照原图复核'}</div>)}</div><div className="mt-2 text-[8px] text-black/45">Pocket Earth 不会自动删除。删除必须回到系统相册再次确认。</div></section>}
        </div>}

        {!feishuMode && section === '照片整理' && root === '找照片' && <div className="space-y-3 p-3 pb-8">
          <section className="border-2 border-black bg-white p-3 shadow-[3px_3px_0_#000]">
            <div className="flex items-start justify-between gap-3"><div><div className="font-pixel text-[9px]">端侧语义索引 · {semanticStatus.count}/{assets.length}</div><div className="mt-1 text-[8px] leading-relaxed text-black/50">用户点击后才安装量化 CLIP；每张只存 512 维 int8 向量。模型升级只重建向量，不动照片与确认。</div></div><Cpu className="h-5 w-5 shrink-0 text-[#087a43]" /></div>
            <div className="mt-3 flex gap-2"><button disabled={busy || !assets.length} onClick={() => void buildSemanticIndex()} className="flex-1 border-2 border-black bg-[#7CFF6B] py-2 text-[9px] font-bold shadow-[2px_2px_0_#000] disabled:opacity-40">{semanticStatus.count ? '增量更新语义索引' : '安装模型并建立语义索引'}</button>{activeTask === 'semantic' ? <button onClick={() => { cancelSemanticRef.current = true; setProgress('将在当前照片完成后暂停…'); }} className="border-2 border-black bg-[#ffe4a8] px-2 text-[8px] font-bold">停止</button> : semanticStatus.count > 0 && <button disabled={busy} onClick={() => void resetSemanticIndex()} className="border-2 border-black bg-white px-2 text-[8px] disabled:opacity-40">清除向量</button>}</div>
            {(progress || message) && <div className="mt-2 border-l-2 border-black pl-2 text-[8px] text-black/55">{progress || message}</div>}
            <div className="mt-2 text-[7px] text-black/35">固定模型：CLIP ViT-B/32 · WASM q8 / WebGPU fp16 · 向量对称 int8 · 原图不上传</div>
          </section>

          <div className="border-2 border-black bg-white p-3 shadow-[3px_3px_0_#000]">
            <label className="flex items-center gap-2 border-2 border-black bg-[#EAEAEA] px-2"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setSearchHistory(rememberPhotoSearch(query)); }} placeholder="去年杭州拍的猫" className="min-w-0 flex-1 bg-transparent py-2.5 text-[11px] outline-none" /></label>
            <div className="mt-2 flex flex-wrap gap-1.5">{['去年杭州拍的猫', '所有停车票据', '带二维码的照片', '没有 GPS 但像西湖的照片'].map((sample) => <button key={sample} onClick={() => { setQuery(sample); setSearchHistory(rememberPhotoSearch(sample)); }} className="border border-black/40 bg-white px-2 py-1 text-[8px]">{sample}</button>)}</div>
            {!!searchHistory.length && <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-1"><span className="shrink-0 text-[7px] text-black/35">本机最近 8 条</span>{searchHistory.map((item) => <button key={item} onClick={() => setQuery(item)} className="shrink-0 border border-black/20 bg-[#f5f5f2] px-1.5 py-0.5 text-[7px] text-black/55">{item}</button>)}<button onClick={() => { clearPhotoSearchHistory(); setSearchHistory([]); }} className="shrink-0 text-[7px] text-black/40 underline">清除</button></div>}
            <div className="mt-2 flex items-center gap-1 text-[8px] text-black/45"><Cpu className="h-3 w-3" />标签、时间、GPS、OCR 与 embedding top-k 在本机合并；原片不上传</div>{semanticSearchState && <div className="mt-1 text-[8px] text-[#087a43]">{semanticSearchState}</div>}
          </div>

          {!searchResults.length ? <div className="py-16 text-center text-[10px] text-black/40">{analyses.length ? '没有命中。可以增量建立语义索引。' : '先在“待你决定”连接并分析真实相册。'}</div> : <><div className="grid grid-cols-3 gap-2">{visibleSearchResults.map(({ asset, analysis }) => <div key={analysis.key}><PhotoThumb asset={asset} analysis={analysis} onOpen={() => openPhoto(asset)} /><SearchMatchReasons asset={asset} analysis={analysis} query={query} semanticScore={semanticScoreMap.get(analysis.key)} /><div className="mt-1 truncate text-[8px] text-black/55">{analysis.tags.slice(0, 3).join(' · ') || dateLabel(asset.creationTime)}</div><div className="mt-1 flex gap-1"><button disabled={busy || Boolean(analysis.duplicateOf)} onClick={() => void reviewWithQwen(analysis)} className="flex-1 border border-black bg-white py-1 text-[7px]">{analysis.curation ? '重评' : 'AI 评审'}</button><button disabled={busy || !analysis.curation || Boolean(analysis.duplicateOf) || analysis.chronicleIncluded} onClick={() => void confirmCurated(analysis)} className={`flex-1 border border-black py-1 text-[7px] ${analysis.chronicleIncluded ? 'bg-[#7CFF6B]' : 'bg-white'} disabled:opacity-40`}>{analysis.chronicleIncluded ? '已收录' : '确认收录'}</button></div></div>)}</div>{searchLimit < searchResults.length && <button onClick={() => setSearchLimit((value) => value + SEARCH_WINDOW)} className="w-full border-2 border-black bg-white py-2 text-[9px] font-bold">再显示 {Math.min(SEARCH_WINDOW, searchResults.length - searchLimit)} 张 · 当前 DOM {visibleSearchResults.length}/{searchResults.length}</button>}</>}
        </div>}

        {section !== '照片整理' && <div className={section === '日历' ? 'min-h-0 flex-1' : 'h-full'}>
          {hiddenIncludedCount > 0 && <div className="border-b-2 border-black bg-[#fff8dc] px-3 py-2 text-[8px] text-[#765000]">{hiddenIncludedCount} 条已确认记录因原片缺失或相册权限撤回而隐藏；确认记录未删除，权限恢复后会重新出现。</div>}
          <PhotosChronicle
            key={`${section}:${curatedAssets.length}:${realLibraryAssets.length ? 'device' : 'preview'}`}
            embedded
            segment={section}
            showSegments={false}
            data={(realLibraryAssets.length || analyses.length) ? chronicleData : undefined}
            onOpenAsset={curatedAssets.length ? openPhotoByKey : undefined}
          />
        </div>}
      </div>

      {section === '照片整理' && runId && <div className="absolute bottom-2 left-2 right-2 z-40"><RunTrace runId={runId} collapseWhenDone /></div>}

      <AnimatePresence>{lightbox && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[100] flex items-center justify-center bg-black/75 p-5" onClick={closeLightbox}><motion.div initial={{ scale: 0.94 }} animate={{ scale: 1 }} exit={{ scale: 0.94 }} className="w-full max-w-[340px] border-[3px] border-black bg-white p-2 shadow-[6px_6px_0_#7CFF6B]" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between pb-2"><div className="truncate font-pixel text-[8px]">{lightbox.asset.fileName}</div><button onClick={closeLightbox}><X className="h-4 w-4" /></button></div><div className="aspect-square overflow-hidden border-2 border-black bg-[#d8d8d6]"><img src={lightbox.url} alt={lightbox.asset.fileName} className="h-full w-full object-contain" /></div><div className="mt-2 flex items-center justify-between text-[8px] text-black/50"><span>{dateLabel(lightbox.asset.creationTime)}</span><span>{lightbox.original ? '本次会话原片' : '≤320px 本地缩略图'}</span></div>{!lightbox.original && <button onClick={() => void openOriginal()} className="mt-2 flex w-full items-center justify-center gap-1.5 border-2 border-black bg-[#7CFF6B] py-2 text-[9px] font-bold"><Copy className="h-3.5 w-3.5" />{lightbox.asset.source === 'native-library' ? '在系统相册打开原片' : '查看本次选择的原片'}</button>}</motion.div></motion.div>}</AnimatePresence>
    </div>
  );
}
