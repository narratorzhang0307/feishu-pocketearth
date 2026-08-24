import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowRight, Bot, Check, ExternalLink, FileText, ImagePlus, Layers3, Loader2, LockKeyhole, RefreshCw, RotateCcw, ShieldCheck, X } from 'lucide-react';
import {
  authenticateFeishu, bootstrapFeishuLibrary, createFeishuDocumentTask, getFeishuConfig, getFeishuTask,
  resumeFeishuSession, retryFeishuTask, writeBackFeishuTask,
} from './api';
import { requestFeishuAuthCode } from './bridge';
import { pinFeishuLocations, type PinnedFeishuLocation } from './earthMarks';
import type { FeishuConfig, FeishuTask, FeishuUser, ReviewedLocation } from './types';
import { BUILTIN_SKILLS, ensureBuiltinSkills } from '../lib/skill';
import { runFrostOrchestrator, type FrostPlan, type FrostPlanStep } from '../../../frost-agent/harness/skillRouter';
import { stageTaskHandoff } from '../../../frost-agent/harness/taskHandoff';
import { getFeishuLibrarySyncState, setFeishuLibraryDomainEnabled, startFeishuLibraryAutoSync, subscribeFeishuLibrarySync, syncFeishuLibraryNow } from './librarySync';
import { submitPhotoOrganizerRequest } from '../lib/photo';
import { bookRecords } from '../data/books';
import { movieRecords } from '../data/movies';
import { inferWorkTitleRoute } from './workTitleRoute';

const RUNNING = new Set<FeishuTask['status']>(['queued', 'ocr_running', 'qwen_running', 'writing_back']);

function readableError(cause: unknown) {
  const value = cause instanceof Error ? cause.message : String(cause);
  if (value.includes('credentials_not_configured') || value.includes('应用尚未配置')) return '飞书凭证待配置：请在服务端设置 FEISHU_APP_ID 与 FEISHU_APP_SECRET。';
  if (value.includes('document_url_invalid')) return '请粘贴飞书新版文档（docx）链接。';
  if (value.includes('99991663') || value.includes('permission') || value.includes('forbidden')) return '当前飞书用户或应用没有读取这篇文档的权限。';
  if (value.includes('qwen_api_key_not_configured')) return 'AI 分析服务尚未配置，任务没有生成伪结果。';
  if (value.includes('bitable_not_configured')) return '服务端还没有配置飞书多维表格空间，暂时无法新建知识库。';
  return value;
}

interface FeishuEarthPanelProps {
  onClose: () => void;
  onPinned: (location?: PinnedFeishuLocation) => void;
  onOpenSkill: (target: string) => void;
}

export default function FeishuEarthPanel({ onClose, onPinned, onOpenSkill }: FeishuEarthPanelProps) {
  const [config, setConfig] = useState<FeishuConfig | null>(null);
  const [user, setUser] = useState<FeishuUser | null>(null);
  const [objective, setObjective] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [plan, setPlan] = useState<FrostPlan | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeMessage, setRouteMessage] = useState('');
  const [catalogSize, setCatalogSize] = useState(0);
  const [task, setTask] = useState<FeishuTask | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedLocation[]>([]);
  const [busy, setBusy] = useState(true);
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [creatingLibrary, setCreatingLibrary] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [libraryUrl, setLibraryUrl] = useState('');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoMessage, setPhotoMessage] = useState('');
  const [error, setError] = useState('');
  const taskIdFromUrl = useMemo(() => new URLSearchParams(location.search).get('taskId') || '', []);
  const selectedSkill = config?.skills?.find((skill) => skill.id === 'pocket.book-to-earth') || null;
  const librarySync = useSyncExternalStore(subscribeFeishuLibrarySync, getFeishuLibrarySyncState, getFeishuLibrarySyncState);
  const photoPreviews = useMemo(() => photoFiles.map((file) => ({ file, url: URL.createObjectURL(file) })), [photoFiles]);
  const credentialsReady = Boolean(config?.configured);
  const configurationError = error === '飞书应用尚未配置' || error.includes('飞书凭证待配置');

  useEffect(() => () => photoPreviews.forEach(({ url }) => URL.revokeObjectURL(url)), [photoPreviews]);

  useEffect(() => {
    const reauthenticate = () => window.location.reload();
    window.addEventListener('pocket-earth:feishu-session-expired', reauthenticate, { once: true });
    return () => window.removeEventListener('pocket-earth:feishu-session-expired', reauthenticate);
  }, []);

  const refreshTask = useCallback(async (taskId: string) => {
    const next = (await getFeishuTask(taskId)).task;
    setTask(next);
    if (next.status === 'awaiting_review') setReviewed(next.locations.map((item) => ({ ...item, approved: item.reviewStatus !== 'rejected' })));
    return next;
  }, []);

  useEffect(() => {
    ensureBuiltinSkills();
    setCatalogSize(BUILTIN_SKILLS.length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const nextConfig = await getFeishuConfig();
        if (cancelled) return;
        setConfig(nextConfig);
        if (!nextConfig.configured && !nextConfig.devBypassAuth) {
          setError('飞书应用尚未配置');
          return;
        }
        let auth: { user: FeishuUser };
        try { auth = await resumeFeishuSession(); }
        catch {
          auth = nextConfig.devBypassAuth
            ? await authenticateFeishu({ devBypass: true })
            : await authenticateFeishu({ code: await requestFeishuAuthCode(nextConfig.appId) });
        }
        if (cancelled) return;
        setUser(auth.user);
        startFeishuLibraryAutoSync(auth.user.openId);
        if (taskIdFromUrl) await refreshTask(taskIdFromUrl);
      } catch (cause) {
        if (!cancelled) setError(readableError(cause));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshTask, taskIdFromUrl]);

  useEffect(() => {
    if (!task || !RUNNING.has(task.status)) return undefined;
    const timer = window.setInterval(() => refreshTask(task.taskId).catch((cause) => setError(readableError(cause))), 1300);
    return () => window.clearInterval(timer);
  }, [refreshTask, task]);

  const start = async () => {
    if (!documentUrl.trim()) { setError('请先粘贴飞书新版文档（docx）链接。'); return; }
    if (!user) { setError('飞书身份尚未连接，请从飞书工作台重新打开应用。'); return; }
    setBusy(true); setError('');
    try {
      const next = (await createFeishuDocumentTask(documentUrl.trim(), selectedSkill?.id)).task;
      setTask(next);
      history.replaceState(null, '', `/feishu?feishuPanel=1&taskId=${encodeURIComponent(next.taskId)}`);
    } catch (cause) { setError(readableError(cause)); }
    finally { setBusy(false); }
  };

  const routeObjective = async () => {
    const text = objective.trim();
    if ((!text && !photoFiles.length) || routing) return;
    setRouting(true); setRouteMessage(''); setPlan(null);
    try {
      if (photoFiles.length) {
        submitPhotoOrganizerRequest({ files: photoFiles, objective: text });
        setRouteMessage(`Frost 已把 ${photoFiles.length} 张照片交给“照片整理”：先本地查重与技术检测，再由 AI 建议、你确认、飞书入库。`);
        setPhotoMessage('已转入照片整理。杂志、日历与飞书多维表格都不会在你确认前写入。');
        onOpenSkill('photo-organizer');
        return;
      }
      ensureBuiltinSkills();
      const workRoute = inferWorkTitleRoute(text, bookRecords, movieRecords);
      if (workRoute?.ambiguous) {
        setRouteMessage(`“${workRoute.title}”同时存在书籍和电影版本。请补充“读了这本书”或“看了这部电影”，我会交给正确的 Skill。`);
        return;
      }
      const result = await runFrostOrchestrator({
        now: new Date(), surface: 'frost', userText: text,
        skillIds: BUILTIN_SKILLS.map((skill) => skill.identity.id),
        preferredSkillIds: workRoute?.skillId ? [workRoute.skillId] : undefined,
      });
      setPlan(result.plan);
      setRouteMessage(result.plan ? result.reply : 'Frost 没有发现必须调用的专用 Skill。请把任务说得更具体，例如书单、电影、旅行、展签或碑拓。');
    } catch (cause) {
      setRouteMessage(`路由失败：${readableError(cause)}`);
    } finally { setRouting(false); }
  };

  const selectPhotos = (files: FileList | null) => {
    const next = files ? Array.from(files).filter((file) => file.type.startsWith('image/')) : [];
    setPhotoFiles(next); setPhotoMessage(next.length ? `已选择 ${next.length} 张。请继续在下面描述希望 Frost 怎么整理。` : '');
  };

  const dispatchStep = (step: FrostPlanStep) => {
    if (!plan) return;
    if (step.availability !== 'equipped') {
      onOpenSkill('agent-plaza');
      return;
    }
    const source = documentUrl.trim() ? `${objective.trim()}\n飞书文档：${documentUrl.trim()}` : objective.trim();
    stageTaskHandoff(plan, step, source);
    onOpenSkill(step.target);
  };

  const updateReview = <K extends keyof ReviewedLocation>(index: number, key: K, value: ReviewedLocation[K]) => {
    setReviewed((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  const confirm = async () => {
    if (!task) return;
    setBusy(true); setError('');
    try {
      const completed = (await writeBackFeishuTask(task.taskId, reviewed)).task;
      const pinned = pinFeishuLocations(completed, reviewed);
      setTask(completed);
      onPinned(pinned[0]);
    } catch (cause) { setError(readableError(cause)); }
    finally { setBusy(false); }
  };

  const retry = async () => {
    if (!task) return;
    setBusy(true); setError('');
    try {
      const next = (await retryFeishuTask(task.taskId)).task;
      setTask(next);
      if (next.status === 'awaiting_review') {
        setReviewed(next.locations.map((item) => ({ ...item, approved: item.reviewStatus !== 'rejected' })));
      }
    }
    catch (cause) { setError(readableError(cause)); }
    finally { setBusy(false); }
  };

  const reset = () => {
    setTask(null); setReviewed([]); setObjective(''); setDocumentUrl(''); setPlan(null); setRouteMessage(''); setError('');
    history.replaceState(null, '', '/feishu');
  };

  const syncLibraryNow = async () => {
    if (syncingLibrary) return;
    setSyncingLibrary(true); setSyncMessage(''); setError('');
    try {
      await syncFeishuLibraryNow();
      setSyncMessage('同步完成：已重新读取飞书，并处理“待分析”记录。');
    } catch (cause) { setError(readableError(cause)); }
    finally { setSyncingLibrary(false); }
  };

  const createKnowledgeLibrary = async () => {
    if (creatingLibrary) return;
    setCreatingLibrary(true); setSyncMessage(''); setError('');
    try {
      const result = await bootstrapFeishuLibrary();
      setLibraryUrl(result.appUrl);
      await syncFeishuLibraryNow();
      const tableCopy = result.createdTables.length
        ? `${result.createdApp ? '已新建飞书多维表格，' : ''}已建立 ${result.createdTables.length} 张表并补齐 ${result.createdFields.length} 个字段。`
        : `四张表已存在，字段检查完成${result.createdFields.length ? `，补齐 ${result.createdFields.length} 个字段` : ''}。`;
      setSyncMessage(`${tableCopy} 在表格新增一行，只填“AI 指令”并设为“待分析”，AI 会整理并写回“待确认”。`);
    } catch (cause) { setError(readableError(cause)); }
    finally { setCreatingLibrary(false); }
  };

  return (
    <div className="absolute inset-2 z-[55] flex flex-col overflow-hidden border-2 border-black bg-[#EAEAEA] shadow-[4px_4px_0_#000]">
      <header className="flex items-center justify-between border-b-2 border-black bg-black px-3 py-2 text-white">
        <div><div className="font-pixel text-[8px] tracking-widest text-[#00ff88]">FEISHU × FROST</div><div className="mt-1 text-xs font-bold">一个入口，调度原来的 Pocket Earth Skills</div></div>
        <button type="button" onClick={onClose} aria-label="关闭飞书面板" className="border border-white/50 p-1"><X className="h-4 w-4" /></button>
      </header>

      <div className="flex items-center justify-between border-b-2 border-black bg-white px-3 py-2 text-[9px]">
        <span className="font-pixel text-[7px]">飞书 → FROST → SKILL → 地球 / 写回</span>
        <div className="flex items-center gap-2">
          {user && <span className={`font-pixel text-[6px] ${librarySync.status === 'error' ? 'text-[#b3261e]' : 'text-[#087a50]'}`}>多维库 {librarySync.status === 'syncing' ? `同步 ${Object.keys(librarySync.versions).length}/${librarySync.configuredDomains.length || 4}` : `${librarySync.configuredDomains.length}/4`}</span>}
          {user ? <span className="flex items-center gap-1 font-bold text-[#008844]"><ShieldCheck className="h-3.5 w-3.5" />{user.name}</span> : <span className="flex items-center gap-1 font-bold text-black/45"><LockKeyhole className="h-3.5 w-3.5" />身份待连接</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {busy && !task && <div className="flex h-full flex-col items-center justify-center gap-3 text-xs font-bold"><Loader2 className="h-6 w-6 animate-spin" />正在连接飞书身份…</div>}

        {!busy && !task && config && (
          <div className="space-y-3">
            <div className="border-2 border-black bg-white p-3">
              <div className="flex items-start gap-2.5">
                <div className="grid h-10 w-10 shrink-0 place-items-center border-2 border-black bg-[#00ff88]"><Bot className="h-5 w-5" strokeWidth={2.6} /></div>
                <div className="min-w-0 flex-1"><h2 className="text-sm font-black">飞书知识入口</h2><p className="mt-1 text-[9px] leading-4 text-black/55">飞书文档可直接进入核心链路；其他任务再由 Frost 交给原 Pocket Earth Skill。</p></div>
                <label className="flex h-12 w-24 shrink-0 cursor-pointer items-center justify-center gap-1.5 border-2 border-black bg-[#b9f4ff] text-[10px] font-black shadow-[2px_2px_0_#000] active:translate-y-px">
                  <ImagePlus className="h-4 w-4" strokeWidth={2.8} />相册
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => { selectPhotos(event.target.files); event.target.value = ''; }} />
                </label>
              </div>
              <section className="mt-3 border-2 border-black bg-[#f4f0df] p-2.5" aria-label="飞书文档核心流程">
                <div className="flex items-center justify-between gap-2">
                  <div><div className="font-pixel text-[7px] text-[#087a50]">CORE FLOW · 飞书文档</div><p className="mt-1 text-[9px] font-bold">读取你有权限的文档原文，生成可核验的知识地球</p></div>
                  <FileText className="h-5 w-5 shrink-0" />
                </div>
                <input value={documentUrl} onChange={(event) => { setDocumentUrl(event.target.value); setError(''); }} placeholder="https://…feishu.cn/docx/…" className="mt-2 w-full border-2 border-black bg-white px-2 py-2 text-[10px] outline-none focus:bg-[#fafffd]" aria-label="飞书新版文档链接" />
                <button type="button" onClick={start} disabled={busy || !user || !documentUrl.trim()} className="mt-2 flex w-full items-center justify-center gap-1.5 border-2 border-black bg-[#00ff88] py-2 text-[10px] font-black active:translate-y-px disabled:bg-black/10 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}读取飞书原文并生成知识地球
                </button>
                <p className="mt-1.5 text-[8px] leading-4 text-black/55">飞书身份 / 原文 → AI 证据抽取 → 你确认 → 地球 + 源文档 / 多维表格</p>
              </section>
              {!!photoPreviews.length && (
                <div className="mt-3 border-2 border-black bg-[#eefcff] p-2">
                  <div className="flex gap-1.5 overflow-x-auto pb-1">{photoPreviews.map(({ file, url }) => <img key={`${file.name}:${file.size}:${file.lastModified}`} src={url} alt={file.name} className="h-14 w-14 shrink-0 border-2 border-black object-cover" />)}</div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[8px]"><span>{photoMessage || `已选择 ${photoPreviews.length} 张`}</span><button type="button" onClick={() => { setPhotoFiles([]); setPhotoMessage(''); }} className="shrink-0 underline">清空</button></div>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2 text-[8px] text-black/45"><span className="h-px flex-1 bg-black/20" /><span>其他任务 · {catalogSize || 10} 个原 Skill</span><span className="h-px flex-1 bg-black/20" /></div>
              <textarea value={objective} onChange={(event) => { setObjective(event.target.value); setPlan(null); setRouteMessage(''); }} rows={3} placeholder="例如：整理书单；识别展签；规划京都两日路线……" className="mt-2 w-full resize-none border-2 border-black bg-[#EAEAEA] px-2 py-2 text-[11px] leading-5 outline-none focus:bg-white" />
              <button type="button" onClick={routeObjective} disabled={routing || (!objective.trim() && !photoFiles.length)} className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-black bg-[#00ff88] py-2 text-[11px] font-black shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-40">
                {routing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />}{photoFiles.length ? '让 Frost 整理这些照片' : '让 Frost 选择 Skill'}
              </button>
            </div>

            {(plan || routeMessage) && (
              <section className="border-2 border-black bg-[#f4f0df] p-2.5" aria-label="Frost 路由计划">
                <div className="flex items-center justify-between gap-2"><span className="font-pixel text-[7px] text-[#087a50]">FROST ROUTE</span>{plan && <span className="border border-black bg-white px-1.5 py-0.5 font-pixel text-[5px]">{plan.source}</span>}</div>
                <p className="mt-1 text-[10px] font-bold leading-4">{routeMessage}</p>
                {plan?.steps.map((step, index) => {
                  const directDocument = step.skillId === 'pocket.book-to-earth' && Boolean(documentUrl.trim());
                  const directReady = directDocument && Boolean(user && selectedSkill);
                  const equipped = step.availability === 'equipped';
                  return (
                    <article key={step.id} className="mt-2 border-2 border-black bg-white p-2">
                      <div className="flex items-start gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center bg-black font-pixel text-[7px] text-white">{index + 1}</span><div className="min-w-0 flex-1"><div className="text-[11px] font-black">{step.skillName}</div><p className="mt-0.5 text-[9px] leading-4 text-black/55">{step.objective}</p></div><span className={`shrink-0 border border-black px-1 py-0.5 font-pixel text-[5px] ${directReady || equipped ? 'bg-[#d9ffec] text-[#087a50]' : 'bg-[#ffe6a6]'}`}>{directReady ? '飞书可执行' : equipped ? '已装备' : '待装备'}</span></div>
                      {step.requiresConfirmation && <div className="mt-1.5 flex items-center gap-1 text-[8px] font-bold text-black/45"><ShieldCheck className="h-3 w-3" />副作用前再次确认</div>}
                      {directDocument ? (
                        <button type="button" onClick={start} disabled={!directReady || busy} className="mt-2 flex w-full items-center justify-center gap-1 border-2 border-black bg-[#00ff88] py-1.5 text-[9px] font-black disabled:bg-black/10 disabled:opacity-60">
                          <FileText className="h-3.5 w-3.5" />{directReady ? '读取飞书原文并执行' : '配置飞书身份后执行'}
                        </button>
                      ) : (
                        <button type="button" onClick={() => dispatchStep(step)} className="mt-2 flex w-full items-center justify-center gap-1 border-2 border-black bg-white py-1.5 text-[9px] font-black active:bg-[#00ff88]">
                          {equipped ? '交给原 Pocket Earth Skill' : '前往 Skills Plaza 装备'}<ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
            <p className="font-pixel text-[6px] leading-4 text-black/45">飞书负责身份 / 原文 / 协作 / 写回 · Frost 只路由 · 原 Skill 负责执行 · 用户掌握最终确认</p>
            <section className="border-2 border-black bg-white p-2.5" aria-label="数据源插槽">
              <div className="flex items-center justify-between"><h3 className="text-[11px] font-black">我的知识库</h3><button type="button" onClick={syncLibraryNow} disabled={syncingLibrary || !librarySync.configuredDomains.length} className="flex items-center gap-1 border border-black bg-[#00ff88] px-2 py-1 text-[7px] font-black disabled:bg-black/10 disabled:opacity-50"><RefreshCw className={`h-3 w-3 ${syncingLibrary ? 'animate-spin' : ''}`} />{syncingLibrary ? '同步中' : '立即同步'}</button></div>
              {!credentialsReady && (
                <div className="mt-2 border-2 border-black bg-[#fff1c7] p-2 text-[8px] leading-4" role="status">
                  <b>飞书凭证待配置</b><br />
                  请由部署者在服务端设置 <span className="font-pixel text-[6px]">FEISHU_APP_ID</span> 和 <span className="font-pixel text-[6px]">FEISHU_APP_SECRET</span>。凭证不会进入浏览器或公开 GitHub 仓库。
                </div>
              )}
              <button type="button" onClick={createKnowledgeLibrary} disabled={creatingLibrary || !user || !credentialsReady} className="mt-2 flex w-full items-center justify-center gap-1.5 border-2 border-black bg-[#00ff88] py-2 text-[10px] font-black shadow-[2px_2px_0_#000] active:translate-y-px disabled:bg-black/10 disabled:opacity-50">
                {creatingLibrary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />}{creatingLibrary ? '正在建立四张数据表…' : credentialsReady ? '新建你的知识库' : '配置飞书凭证后可新建'}
              </button>
              <p className="mt-1 text-[8px] leading-4 text-black/50">自动建立书籍、电影、音乐、照片四张飞书多维表格，并补齐 AI 指令、我的笔记、地点、坐标、审核状态、来源和数据 JSON 等字段。</p>
              {libraryUrl && <a href={libraryUrl} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center justify-center gap-1 border border-black bg-white py-1.5 text-[8px] font-bold">打开飞书多维表格<ExternalLink className="h-3 w-3" /></a>}
              <p className="mt-1 text-[8px] leading-4 text-black/50">可卸下比赛示例库，转到原 Skill 装载自己的 Data Pack；自动同步不会把已卸下的数据偷偷装回来。</p>
              <p className="mt-1 border-l-2 border-black pl-1.5 text-[8px] leading-4 text-black/65">在任一表新增一行，只填“AI 指令”并将“审核状态”设为“待分析”；AI 会补齐结构化字段与候选地点，写回“待确认”。你改成“已确认”后才会上地球。</p>
              {syncMessage && <p className="mt-1 border border-black bg-[#d9ffec] px-1.5 py-1 text-[8px] font-bold">{syncMessage}</p>}
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {(['books', 'movies', 'music', 'photos'] as const).map((domain) => {
                  const enabled = librarySync.enabledDomains.includes(domain);
                  const label = { books: '书籍', movies: '电影', music: '音乐', photos: '照片' }[domain];
                  const target = { books: 'books', movies: 'movies', music: 'music', photos: 'photos' }[domain];
                  return <div key={domain} className={`border-2 border-black p-1.5 ${enabled ? 'bg-[#d9ffec]' : 'bg-[#EAEAEA]'}`}><div className="flex items-center justify-between"><b className="text-[9px]">{label}</b><span className="font-pixel text-[5px]">{enabled ? '内置 ON' : '个人'}</span></div><button type="button" onClick={() => { if (enabled) { void setFeishuLibraryDomainEnabled(domain, false).then(() => onOpenSkill(target)); } else void setFeishuLibraryDomainEnabled(domain, true); }} className="mt-1 w-full border border-black bg-white py-1 text-[8px] font-bold">{enabled ? '卸下并使用我的' : '恢复内置库'}</button></div>;
                })}
              </div>
            </section>
          </div>
        )}

        {task && task.status !== 'awaiting_review' && task.status !== 'completed' && task.status !== 'failed' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#008844]" />
            <div className="text-sm font-black">{task.progress.label}</div>
            <div className="font-pixel text-[7px] text-black/45">{task.fileName}</div>
          </div>
        )}

        {task?.status === 'awaiting_review' && (
          <div className="space-y-3">
            <div><div className="font-pixel text-[8px] text-[#008844]">HUMAN REVIEW · {task.orchestration?.skillName || 'AI'}</div><h2 className="mt-1 text-sm font-black">确认这些地点，再写入地球与飞书</h2>{task.orchestration && <p className="mt-1 text-[9px] text-black/50">Frost 已路由到 {task.orchestration.skillId} · {task.orchestration.outputSchema}</p>}</div>
            {reviewed.map((item, index) => (
              <article key={item.id} className={`border-2 border-black p-2.5 ${item.approved ? 'bg-white' : 'bg-black/10 opacity-60'}`}>
                <div className="flex items-start justify-between gap-2"><div><div className="font-pixel text-[7px] text-[#008844]">原文证据 · {Math.round(item.confidence * 100)}%</div><div className="mt-1 text-sm font-black">{item.nameAsWritten}</div></div><button type="button" onClick={() => updateReview(index, 'approved', !item.approved)} className={`h-7 w-7 border-2 border-black ${item.approved ? 'bg-[#00ff88]' : 'bg-white'}`}>{item.approved && <Check className="mx-auto h-4 w-4" strokeWidth={3} />}</button></div>
                <blockquote className="mt-2 border-l-4 border-black bg-[#ffe08a] px-2 py-1.5 text-[10px] leading-4">{item.evidence}</blockquote>
                <input value={item.modernName} onChange={(event) => updateReview(index, 'modernName', event.target.value)} className="mt-2 w-full border-2 border-black px-2 py-1.5 text-[11px] font-bold" aria-label="现代地名" />
                <div className="mt-2 grid grid-cols-2 gap-2"><input type="number" step="any" value={item.latitude ?? ''} onChange={(event) => updateReview(index, 'latitude', event.target.value === '' ? null : Number(event.target.value))} placeholder="纬度" className="min-w-0 border-2 border-black px-2 py-1.5 text-[10px]" /><input type="number" step="any" value={item.longitude ?? ''} onChange={(event) => updateReview(index, 'longitude', event.target.value === '' ? null : Number(event.target.value))} placeholder="经度" className="min-w-0 border-2 border-black px-2 py-1.5 text-[10px]" /></div>
              </article>
            ))}
            <button type="button" onClick={confirm} disabled={busy || !reviewed.some((item) => item.approved && Number.isFinite(item.latitude) && Number.isFinite(item.longitude))} className="flex w-full items-center justify-center gap-2 border-2 border-black bg-[#00ff88] py-2.5 text-[11px] font-black shadow-[2px_2px_0_#000] disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={3} />}确认：上地球并写回飞书</button>
          </div>
        )}

        {task?.status === 'completed' && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center border-2 border-black bg-[#00ff88] shadow-[3px_3px_0_#000]"><Check className="h-7 w-7" strokeWidth={3} /></div>
            <h2 className="mt-4 text-base font-black">知识已经回到地球，也写回了飞书</h2>
            <p className="mt-2 text-[10px] leading-5 text-black/60">地点、原文证据、坐标和审核状态已完成沉淀。</p>
            <div className="mt-4 flex w-full gap-2">{task.outputs.document?.url && <a href={task.outputs.document.url} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1 border-2 border-black bg-white py-2 text-[10px] font-bold">查看飞书文档<ExternalLink className="h-3.5 w-3.5" /></a>}<button type="button" onClick={onClose} className="flex-1 border-2 border-black bg-[#00ff88] py-2 text-[10px] font-black">查看地球</button></div>
            <button type="button" onClick={reset} className="mt-3 text-[9px] underline">处理另一篇文档</button>
          </div>
        )}

        {task?.status === 'failed' && (
          <div className="border-2 border-black bg-[#ffd8d8] p-3"><div className="text-sm font-black">任务已停止，没有生成伪结果</div><p className="mt-2 break-words text-[10px] leading-4">{task.error}</p><button type="button" onClick={task.sourceRequired ? reset : retry} className="mt-3 flex items-center gap-1 border-2 border-black bg-white px-3 py-2 text-[10px] font-bold"><RotateCcw className="h-3.5 w-3.5" />{task.sourceRequired ? '重新选择文档' : '修正后重试'}</button></div>
        )}

        {error && <div className={`mt-3 border-2 border-black p-2 text-[10px] font-bold leading-4 ${configurationError ? 'bg-[#ffe6a6]' : 'bg-[#ffd8d8]'}`}>{error === '飞书应用尚未配置' ? '飞书凭证待配置：当前可体验 Frost 路由；服务端配置 App ID / App Secret 后，才会开放真实身份、文档读取和写回。' : error}</div>}
      </div>
    </div>
  );
}
