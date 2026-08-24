import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle, Bot, Check, CheckCircle2, ExternalLink, FileSearch, FileText,
  Globe2, Loader2, MapPin, RefreshCw, ShieldCheck, UploadCloud, X,
} from 'lucide-react';
import {
  authenticateFeishu, createFeishuTask, getFeishuConfig, getFeishuTask,
  retryFeishuTask, writeBackFeishuTask,
} from './api';
import { requestFeishuAuthCode } from './bridge';
import type { FeishuConfig, FeishuTask, FeishuUser, ReviewedLocation } from './types';

const STATUS_COPY: Record<FeishuTask['status'], string> = {
  queued: '已进入飞书任务队列',
  ocr_running: 'PaddleOCR 正在识别版面与文字',
  qwen_running: 'Qwen 正在抽取地点与原文证据',
  awaiting_review: '等待你确认地点、证据和坐标',
  writing_back: '正在写回飞书文档与多维表格',
  completed: '飞书知识闭环已完成',
  failed: '任务执行失败',
};

const RUNNING = new Set<FeishuTask['status']>(['queued', 'ocr_running', 'qwen_running', 'writing_back']);
const RealResultMap = lazy(() => import('./FeishuResultMap'));
const HAS_REAL_MAP = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);

function bytesLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}

function StatusRail({ task }: { task: FeishuTask }) {
  const steps = [
    ['ocr_running', 'OCR 识别'], ['qwen_running', 'Qwen 抽取'],
    ['awaiting_review', '人工确认'], ['completed', '飞书写回'],
  ];
  const progress = task.status === 'failed' ? task.progress.current : task.progress.current;
  return (
    <div className="grid grid-cols-4 gap-2">
      {steps.map(([status, label], index) => {
        const done = progress > index || task.status === 'completed';
        const active = task.status === status || (status === 'completed' && task.status === 'writing_back');
        return (
          <div key={status} className={`rounded-xl border px-2 py-3 text-center ${done ? 'border-emerald-500 bg-emerald-50' : active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
            <div className={`mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {done ? <Check className="h-4 w-4" /> : index + 1}
            </div>
            <p className="text-[11px] font-semibold text-slate-700">{label}</p>
          </div>
        );
      })}
    </div>
  );
}

function KnowledgeMap({ locations }: { locations: ReviewedLocation[] }) {
  const plotted = locations.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  if (HAS_REAL_MAP && plotted.length) return (
    <Suspense fallback={<div className="flex h-80 items-center justify-center rounded-2xl bg-slate-950 text-sm text-slate-300"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在准备真实地图…</div>}>
      <RealResultMap locations={locations} />
    </Suspense>
  );
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Knowledge Earth</p>
          <h3 className="mt-1 text-lg font-bold">材料里的地点，已经回到地球上</h3>
        </div>
        <Globe2 className="h-8 w-8 text-emerald-300" />
      </div>
      <div className="relative h-64 overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#164e63_0,#0f172a_55%,#020617_100%)]">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.18) 1px,transparent 1px)', backgroundSize: '10% 16.66%' }} />
        <div className="absolute left-[7%] top-[24%] h-[37%] w-[27%] rotate-[-8deg] rounded-[45%_55%_62%_38%] bg-emerald-400/15 blur-[1px]" />
        <div className="absolute right-[12%] top-[20%] h-[42%] w-[42%] rotate-[7deg] rounded-[55%_45%_35%_65%] bg-emerald-400/15 blur-[1px]" />
        {plotted.map((location) => {
          const left = ((Number(location.longitude) + 180) / 360) * 100;
          const top = ((90 - Number(location.latitude)) / 180) * 100;
          return (
            <div key={location.id} className="group absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
              <div className="h-4 w-4 rounded-full border-2 border-white bg-fuchsia-400 shadow-[0_0_0_5px_rgba(244,114,182,.2)]" />
              <div className="pointer-events-none absolute bottom-6 left-1/2 w-max max-w-36 -translate-x-1/2 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-900 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {location.modernName}
              </div>
            </div>
          );
        })}
        {!plotted.length && <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-slate-300">补充经纬度并通过审核后，地点会出现在这里。</div>}
      </div>
    </section>
  );
}

function IntegrationBadge({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />{label}
    </span>
  );
}

export default function FeishuApp() {
  const [config, setConfig] = useState<FeishuConfig | null>(null);
  const [user, setUser] = useState<FeishuUser | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [task, setTask] = useState<FeishuTask | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [authenticating, setAuthenticating] = useState(true);
  const [error, setError] = useState('');

  const taskIdFromUrl = useMemo(() => new URLSearchParams(location.search).get('taskId') || '', []);

  const refreshTask = useCallback(async (taskId: string) => {
    const result = await getFeishuTask(taskId);
    setTask(result.task);
    if (result.task.status === 'awaiting_review') setReviewed((current) => (
      current.length ? current : result.task.locations.map((item) => ({ ...item, approved: true }))
    ));
    return result.task;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const nextConfig = await getFeishuConfig();
        if (cancelled) return;
        setConfig(nextConfig);
        if (!nextConfig.configured && !nextConfig.devBypassAuth) throw new Error('飞书应用尚未配置，请先完成服务端环境变量。');
        const auth = nextConfig.devBypassAuth
          ? await authenticateFeishu({ devBypass: true })
          : await authenticateFeishu({ code: await requestFeishuAuthCode(nextConfig.appId) });
        if (cancelled) return;
        setUser(auth.user);
        if (taskIdFromUrl) await refreshTask(taskIdFromUrl);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setAuthenticating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshTask, taskIdFromUrl]);

  useEffect(() => {
    if (!task || !RUNNING.has(task.status)) return undefined;
    const timer = window.setInterval(() => {
      refreshTask(task.taskId).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    }, 1300);
    return () => window.clearInterval(timer);
  }, [refreshTask, task]);

  useEffect(() => {
    if (task?.status === 'awaiting_review') {
      setReviewed(task.locations.map((item) => ({ ...item, approved: item.reviewStatus !== 'rejected' })));
    }
  }, [task?.status, task?.locations]);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setError('');
    const selected = event.target.files?.[0] || null;
    if (!selected || !config) return setFile(selected);
    if (!config.acceptedTypes.includes(selected.type)) return setError('仅支持 PDF、PNG、JPG/JPEG 或 WebP。');
    if (selected.size > config.maxUploadBytes) return setError(`文件不能超过 ${bytesLabel(config.maxUploadBytes)}。`);
    setFile(selected);
  };

  const submit = async () => {
    if (!file || !config) return;
    setBusy(true); setError('');
    try {
      const result = await createFeishuTask({ fileName: file.name, mimeType: file.type, sourceBase64: await fileBase64(file) });
      setTask(result.task);
      history.replaceState(null, '', `/feishu/workflow?taskId=${encodeURIComponent(result.task.taskId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  };

  const updateReview = <K extends keyof ReviewedLocation>(index: number, key: K, value: ReviewedLocation[K]) => {
    setReviewed((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  const writeback = async () => {
    if (!task) return;
    setBusy(true); setError('');
    try { setTask((await writeBackFeishuTask(task.taskId, reviewed)).task); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const retry = async () => {
    if (!task) return;
    setBusy(true); setError('');
    try { setTask((await retryFeishuTask(task.taskId)).task); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const resetUpload = () => {
    setTask(null);
    setFile(null);
    setReviewed([]);
    setError('');
    history.replaceState(null, '', '/feishu/workflow');
  };

  if (authenticating) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50">
      <div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" /><p className="mt-4 text-sm font-semibold text-slate-600">正在通过飞书安全免登…</p></div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-[#f5f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-400 shadow-lg shadow-blue-200"><Globe2 className="h-6 w-6 text-white" /></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-600">Pocket Earth × Feishu</p><h1 className="text-lg font-black">文档里的地点，回到协作中的地球</h1></div>
          </div>
          {user && <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 sm:flex"><ShieldCheck className="h-4 w-4 text-emerald-600" />{user.name} · 飞书已认证</div>}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:px-8 lg:grid-cols-[1.35fr_.65fr]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-6 py-8 text-white md:px-8">
              <div className="flex items-start justify-between gap-5">
                <div><span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-[10px] font-bold tracking-widest text-emerald-200">飞书 AI 原生工作流</span><h2 className="mt-5 max-w-xl text-3xl font-black leading-tight md:text-4xl">上传 PDF 或图片，生成一份可审计、可协作的地理知识成果。</h2><p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">飞书负责身份、任务、人工审核和成果沉淀；PaddleOCR 与 Qwen 负责真实识别、抽取和判断。</p></div>
                <Bot className="hidden h-14 w-14 shrink-0 text-emerald-300 md:block" />
              </div>
            </div>

            {!task && (
              <div className="p-6 md:p-8">
                <label className="group flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 text-center transition hover:border-blue-500 hover:bg-blue-50/40">
                  <input className="hidden" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={chooseFile} />
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200"><UploadCloud className="h-7 w-7" /></div>
                  <p className="mt-4 text-base font-bold">{file ? file.name : '选择一份 PDF 或图片资料'}</p>
                  <p className="mt-2 text-xs text-slate-500">{file ? `${bytesLabel(file.size)} · 点击可更换` : `真实文件进入 OCR → Qwen → 飞书审核链路，上限 ${config ? bytesLabel(config.maxUploadBytes) : '—'}`}</p>
                </label>
                <button disabled={!file || busy || !user} onClick={submit} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}启动飞书 AI 任务
                </button>
              </div>
            )}

            {task && (
              <div className="space-y-6 p-6 md:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><FileText className="h-5 w-5" /></div><div><p className="font-bold">{task.fileName}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{task.taskId}</p></div></div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : task.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{STATUS_COPY[task.status]}</span>
                </div>
                <StatusRail task={task} />
                {RUNNING.has(task.status) && <div className="flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800"><Loader2 className="h-4 w-4 animate-spin" />{task.progress.label}</div>}
                {task.status === 'failed' && <div className="rounded-xl border border-red-200 bg-red-50 p-4"><div className="flex gap-2 text-sm font-bold text-red-800"><AlertTriangle className="h-5 w-5" />工作流没有伪造兜底结果</div><p className="mt-2 break-words font-mono text-xs text-red-700">{task.error}</p><button onClick={task.sourceRequired ? resetUpload : retry} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white">{task.sourceRequired ? <UploadCloud className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}{task.sourceRequired ? '重新上传原文件并恢复' : task.retryStage === 'writeback' ? '返回审核并继续写回' : '修正配置后重试'}</button></div>}
              </div>
            )}
          </section>

          {task?.status === 'awaiting_review' && (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-600">Human in the loop</p><h2 className="mt-2 text-2xl font-black">确认后，AI 才能写回飞书</h2><p className="mt-2 text-sm text-slate-500">每一条地点都带页码和原文证据；坐标不确定时由你补充，不让模型猜。</p></div><MapPin className="h-8 w-8 text-fuchsia-500" /></div>
              <div className="mt-6 space-y-4">
                {reviewed.map((location, index) => (
                  <article key={location.id} className={`rounded-2xl border p-4 ${location.approved ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-blue-600">第 {location.page} 页 · 置信度 {Math.round(location.confidence * 100)}%</p><p className="mt-1 text-lg font-black">{location.nameAsWritten}</p></div><button onClick={() => updateReview(index, 'approved', !location.approved)} className={`flex h-9 w-9 items-center justify-center rounded-full ${location.approved ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`} title={location.approved ? '纳入写回' : '已排除'}>{location.approved ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}</button></div>
                    <blockquote className="mt-3 rounded-xl border-l-4 border-fuchsia-400 bg-fuchsia-50 px-4 py-3 text-sm leading-6 text-slate-700">“{location.evidence}”</blockquote>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold text-slate-600">现代地名<input value={location.modernName} onChange={(event) => updateReview(index, 'modernName', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium outline-none focus:border-blue-500" /></label>
                      <label className="text-xs font-bold text-slate-600">说明<input value={location.description} onChange={(event) => updateReview(index, 'description', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium outline-none focus:border-blue-500" /></label>
                      <label className="text-xs font-bold text-slate-600">纬度<input type="number" step="any" value={location.latitude ?? ''} onChange={(event) => updateReview(index, 'latitude', event.target.value === '' ? null : Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium outline-none focus:border-blue-500" placeholder="-90 ～ 90" /></label>
                      <label className="text-xs font-bold text-slate-600">经度<input type="number" step="any" value={location.longitude ?? ''} onChange={(event) => updateReview(index, 'longitude', event.target.value === '' ? null : Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium outline-none focus:border-blue-500" placeholder="-180 ～ 180" /></label>
                    </div>
                  </article>
                ))}
              </div>
              <button onClick={writeback} disabled={busy || !reviewed.some((item) => item.approved)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:bg-slate-300">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}确认并写回飞书</button>
            </section>
          )}

          {task?.status === 'completed' && (
            <div className="space-y-6">
              <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm md:p-8"><div className="flex items-start gap-4"><CheckCircle2 className="h-9 w-9 shrink-0 text-emerald-600" /><div><h2 className="text-2xl font-black text-emerald-950">成果已沉淀回飞书</h2><p className="mt-2 text-sm leading-6 text-emerald-800">文档保留任务 ID、文件哈希、页码和原文证据；多维表格用于后续筛选、协作和自动化。</p>{task.outputs.document?.url && <a href={task.outputs.document.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white">打开飞书文档<ExternalLink className="h-4 w-4" /></a>}</div></div></section>
              <KnowledgeMap locations={reviewed.length ? reviewed : task.locations.map((item) => ({ ...item, approved: true }))} />
            </div>
          )}
        </div>

        <aside className="space-y-5">
          {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" />需要处理</div><p className="mt-2 break-words text-xs leading-5">{error}</p></div>}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">实时能力状态</p><div className="mt-4 flex flex-wrap gap-2">{config && <><IntegrationBadge ready={config.configured} label="飞书免登" /><IntegrationBadge ready={config.integrations.ocr} label="真实 OCR" /><IntegrationBadge ready={config.integrations.qwen} label="Qwen" /><IntegrationBadge ready={config.integrations.document} label="飞书文档" /><IntegrationBadge ready={config.integrations.bitable} label="多维表格" /></>}</div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">为什么这是 Feishu AI Native</p><ol className="mt-4 space-y-4 text-sm text-slate-700">{[['1', '飞书身份与文件启动真实任务'], ['2', 'OCR 和 Qwen 在任务中完成分析'], ['3', '用户在飞书内核对证据与坐标'], ['4', '结果回写文档、表格和消息卡片']].map(([number, copy]) => <li key={number} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{number}</span><span className="leading-6">{copy}</span></li>)}</ol></section>
          {task && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">可审计信息</p><dl className="mt-4 space-y-3 text-xs"><div><dt className="text-slate-400">文件 SHA-256</dt><dd className="mt-1 break-all font-mono text-slate-700">{task.sha256}</dd></div><div><dt className="text-slate-400">工作流版本</dt><dd className="mt-1 font-mono text-slate-700">{task.workflowVersion}</dd></div><div><dt className="text-slate-400">执行次数</dt><dd className="mt-1 font-semibold text-slate-700">{task.attempt}</dd></div></dl></section>}
        </aside>
      </main>
    </div>
  );
}
