import { useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Braces, Check, ChevronLeft, ChevronRight, Cloud, Copy, Database, Download, HardDriveDownload, Link, Loader2, MapPinned, PackageOpen, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import {
  activateDataPack,
  createDataPackAiInstruction,
  dataPackAdapterForDomain,
  dataPackErrorMessage,
  DEFAULT_DATA_PACK_URLS,
  getDataPackState,
  installDataPackFromFile,
  installDataPackFromUrl,
  installDefaultDataPack,
  installedDataPacks,
  isDataPackMapLayerEnabled,
  removeDataPack,
  setDataPackMapLayerEnabled,
  subscribeDataPacks,
  subscribeDataPackMapLayers,
  type DataPackDomain,
  type InstalledDataPack,
} from '../lib/dataPack';
import { selectPersonalDataSource, setFeishuLibraryDomainEnabled, syncFeishuLibraryNow } from '../feishu/librarySync';
import { bootstrapFeishuLibrary, ensureFeishuSession, getFeishuConfig } from '../feishu/api';

interface Props {
  domain: DataPackDomain;
  accent: string;
  compactLabel: string;
  mapPlacementCount?: number;
}

const sourceLabel = (source?: string) => {
  if (!source) return '等待装入';
  if (source.startsWith('file:')) return '本地文件';
  if (source.includes('oss-cn-')) return '阿里云 OSS';
  if (source.startsWith('http')) return 'HTTPS 云端';
  return '内置发布物';
};

const DOMAIN_COPY: Record<DataPackDomain, { label: string; memory: string; unit: string; mapUnit: string }> = {
  books: { label: '书籍', memory: '书籍记忆', unit: '条', mapUnit: '个地点' },
  movies: { label: '电影', memory: '电影记忆', unit: '条', mapUnit: '个地点' },
  music: { label: '音乐', memory: '音乐记忆', unit: '条', mapUnit: '首音乐' },
  mapping: { label: '内容 Mapping', memory: '书籍地点证据', unit: '份', mapUnit: '个地点' },
};

const AI_REQUEST_EXAMPLE: Record<DataPackDomain, string> = {
  books: '使用这个 Skill，把这份书单整理成 Pocket Earth 书籍 Data Pack。',
  movies: '使用这个 Skill，把这份影单整理成 Pocket Earth 电影 Data Pack。',
  music: '使用这个 Skill，把这份歌单整理成 Pocket Earth 音乐 Data Pack。',
  mapping: '使用这个 Skill，把这份书籍或资料整理成 Pocket Earth 内容 Mapping Data Pack；候选地点保留页码、原文与置信度，待我确认后再落图。',
};

const FEISHU_LIBRARY_URL_KEY = 'pocket-earth.feishu.library-url.v1';

function cachedFeishuLibraryUrl() {
  try { return window.localStorage.getItem(FEISHU_LIBRARY_URL_KEY) || ''; }
  catch { return ''; }
}

function rememberFeishuLibraryUrl(url: string) {
  if (!url) return;
  try { window.localStorage.setItem(FEISHU_LIBRARY_URL_KEY, url); }
  catch { /* WebView 隐私模式下仍可在当前页使用 */ }
}

const displayCount = (pack: InstalledDataPack | null) => {
  if (!pack) return 0;
  return pack.manifest.schema.record_count;
};

export default function DataPackManager({ domain, accent, compactLabel, mapPlacementCount }: Props) {
  const [, render] = useReducer((value) => value + 1, 0);
  const [open, setOpen] = useState(false);
  const [protocolOpen, setProtocolOpen] = useState(true);
  const [url, setUrl] = useState('');
  const [packs, setPacks] = useState<InstalledDataPack[]>([]);
  const [message, setMessage] = useState('');
  const [creatingFeishuLibrary, setCreatingFeishuLibrary] = useState(false);
  const [syncingFeishuLibrary, setSyncingFeishuLibrary] = useState(false);
  const [feishuLibraryUrl, setFeishuLibraryUrl] = useState(cachedFeishuLibraryUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const state = getDataPackState(domain);
  const isFeishuSurface = typeof window !== 'undefined' && window.location.pathname.startsWith('/feishu');

  const refresh = async () => setPacks(await installedDataPacks(domain));
  useEffect(() => subscribeDataPacks(() => { render(); void refresh(); }), [domain]);
  useEffect(() => subscribeDataPackMapLayers(render), []);
  useEffect(() => { if (open) void refresh(); }, [open, domain]);
  useEffect(() => {
    if (!isFeishuSurface || domain === 'mapping') return;
    void getFeishuConfig().then((config) => {
      if (!config.bitableAppUrl) return;
      setFeishuLibraryUrl(config.bitableAppUrl);
      rememberFeishuLibraryUrl(config.bitableAppUrl);
    }).catch(() => {});
  }, [domain, isFeishuSurface]);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setMessage('');
    try { await task(); setMessage(success); await refresh(); }
    catch (error) { setMessage(dataPackErrorMessage(error)); }
  };

  const installUrl = () => {
    const value = url.trim();
    if (!value) return;
    if (domain !== 'mapping') selectPersonalDataSource(domain);
    void run(() => installDataPackFromUrl(domain, value), '数据包已校验、安装并启用');
  };

  const installFile = (file?: File) => {
    if (!file) return;
    if (domain !== 'mapping') selectPersonalDataSource(domain);
    void run(() => installDataPackFromFile(domain, file), '本地 Bundle 已校验、安装并启用');
  };

  const remove = (pack: InstalledDataPack) => {
    if (domain !== 'mapping') selectPersonalDataSource(domain);
    void run(() => removeDataPack(pack.packKey), '数据包已卸载；页面数据已清空，Skill 仍然保留');
  };

  const toggleExamplePack = () => {
    if (state.status === 'loading') return;
    if (state.active) { remove(state.active); return; }
    if (domain !== 'mapping') selectPersonalDataSource(domain);
    void run(() => installDefaultDataPack(domain), '示例库已加载，页面数据已恢复');
  };

  const createFeishuKnowledgeLibrary = async () => {
    if (creatingFeishuLibrary || domain === 'mapping') return;
    setCreatingFeishuLibrary(true);
    setMessage('');
    try {
      await ensureFeishuSession();
      const result = await bootstrapFeishuLibrary();
      setFeishuLibraryUrl(result.appUrl);
      rememberFeishuLibraryUrl(result.appUrl);
      await setFeishuLibraryDomainEnabled(domain, true);
      await syncFeishuLibraryNow([domain]);
      const created = result.createdTables.length
        ? `已建立 ${result.createdTables.length} 张数据表，并补齐 ${result.createdFields.length} 个字段`
        : `四张数据表已存在，字段检查完成${result.createdFields.length ? `，补齐 ${result.createdFields.length} 个字段` : ''}`;
      setMessage(`${created}。正在打开飞书整理文档；已确认的数据会同步到口袋地球。`);
      window.location.assign(result.guideDocument?.url || result.appUrl);
    } catch (error) {
      setMessage(`新建知识库失败：${dataPackErrorMessage(error)}`);
    } finally {
      setCreatingFeishuLibrary(false);
    }
  };

  const syncFeishuKnowledgeLibrary = async () => {
    if (syncingFeishuLibrary || domain === 'mapping') return;
    setSyncingFeishuLibrary(true);
    setMessage('');
    try {
      await ensureFeishuSession();
      await setFeishuLibraryDomainEnabled(domain, true);
      await syncFeishuLibraryNow([domain]);
      setMessage(`飞书${DOMAIN_COPY[domain].label}已同步到此页；已确认记录现在会显示在当前 Skill。`);
      await refresh();
    } catch (error) {
      setMessage(`同步飞书${DOMAIN_COPY[domain].label}失败：${dataPackErrorMessage(error)}`);
    } finally {
      setSyncingFeishuLibrary(false);
    }
  };

  const downloadAuthoringSkill = () => {
    const anchor = document.createElement('a');
    anchor.href = `${import.meta.env.BASE_URL}skills/make-pocket-data-pack.zip`;
    anchor.download = 'make-pocket-data-pack.zip';
    anchor.click();
    setMessage('Data Pack 制作 Skill 已下载：内含模板、Schema、示例与校验脚本');
  };

  const copyAiInstruction = async () => {
    try {
      await navigator.clipboard.writeText(createDataPackAiInstruction(domain));
      setMessage(`已复制${DOMAIN_COPY[domain].label}完整制作指令：内含模板、Schema 与合法示例`);
    } catch {
      setMessage('浏览器未允许复制，请使用仓库中的 pocket-data-v1-ai-guide.md');
    }
  };

  const activeName = state.active?.manifest.identity.name || '未加载数据';
  const activeCount = displayCount(state.active);
  const mappedCount = mapPlacementCount ?? activeCount;
  const countUnit = DOMAIN_COPY[domain].unit;
  const activeSource = sourceLabel(state.active?.source);
  const defaultActive = Boolean(state.active?.source.endsWith(DEFAULT_DATA_PACK_URLS[domain]));
  const mappedToEarth = isDataPackMapLayerEnabled(domain);
  const adapter = dataPackAdapterForDomain(domain);
  const appMain = typeof document !== 'undefined'
    ? document.querySelector<HTMLElement>('[data-pocket-earth-main]')
    : null;

  return (
    <>
      <div className="flex w-full min-w-0 items-stretch border-2 border-black bg-white p-1.5 shadow-[2px_2px_0_rgba(0,0,0,0.18)]">
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className="flex min-w-0 flex-1 items-stretch gap-2 text-left active:opacity-70" title="管理当前 Skill 使用的数据包">
          <div className="w-9 shrink-0 border-2 border-black flex items-center justify-center" style={{ background: accent }}>
            <Database className="w-4 h-4 text-black" strokeWidth={2.8} />
          </div>
          <div className="flex-1 min-w-0 py-0.5">
            <div className="flex items-center gap-1.5 font-pixel text-[6px] tracking-widest text-black/50">
              <span>DATA SLOT 01 · {compactLabel}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#18a957] border border-black" />
              <span>{state.active ? '已装备' : '空卡槽'}</span>
            </div>
            <div className="mt-0.5 text-[11px] font-bold leading-tight truncate">{activeName}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[8px] text-black/45 truncate">
              <Cloud className="w-2.5 h-2.5 shrink-0" strokeWidth={2.5} />
              <span className="truncate">{activeSource}{state.active ? ` · ${activeCount} ${countUnit} · 已缓存本机` : ' · Skill 仍可使用'}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 px-1 font-pixel text-[6px] text-black/45">
            管理<ChevronRight className="w-3 h-3" strokeWidth={3} />
          </div>
        </button>
        <button
          type="button"
          onClick={toggleExamplePack}
          disabled={state.status === 'loading'}
          className={`ml-1.5 flex w-[94px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border-2 border-black px-1.5 font-pixel text-[7px] leading-none shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-45 ${state.active ? 'text-[#B3261E]' : 'text-black'}`}
          style={{ background: state.active ? '#FFF1EE' : accent }}
          aria-label={state.active ? `卸载${defaultActive ? '示例库' : '当前数据库'}` : '加载示例库'}
        >
          {state.status === 'loading' ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> : state.active ? <Trash2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} /> : <PackageOpen className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />}
          {state.status === 'loading' ? '处理中' : state.active ? `卸载${defaultActive ? '示例库' : '当前库'}` : '加载示例库'}
        </button>
      </div>

      {isFeishuSurface && domain !== 'mapping' && (
        <div className="mt-1.5 border-2 border-black bg-[#F4F0DF] p-2">
          <button
            type="button"
            onClick={() => void createFeishuKnowledgeLibrary()}
            disabled={creatingFeishuLibrary}
            className="flex w-full items-center justify-center gap-1.5 border-2 border-black px-2 py-2 text-[10px] font-black shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-45"
            style={{ background: accent }}
          >
            {creatingFeishuLibrary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" strokeWidth={2.7} />}
            {creatingFeishuLibrary ? '正在建立飞书知识库…' : '新建你的知识库'}
          </button>
          <p className="mt-1.5 text-[8px] leading-4 text-black/55">直接创建书籍、电影、音乐、照片四张飞书多维表格，并预设标题、地点、坐标、审核状态、来源和数据 JSON 等字段。</p>
          <button
            type="button"
            onClick={() => void syncFeishuKnowledgeLibrary()}
            disabled={syncingFeishuLibrary || creatingFeishuLibrary}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 border border-black bg-white px-2 py-1.5 text-[9px] font-black active:bg-black active:text-white disabled:opacity-45"
          >
            {syncingFeishuLibrary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncingFeishuLibrary ? '正在读取飞书…' : `同步飞书${DOMAIN_COPY[domain].label}到此页`}
          </button>
          {feishuLibraryUrl ? (
            <a href={feishuLibraryUrl} target="_blank" rel="noreferrer" className="mt-1.5 block border border-black bg-white px-2 py-1.5 text-center text-[9px] font-bold">打开飞书多维表格 ↗</a>
          ) : (
            <button type="button" disabled className="mt-1.5 block w-full border border-black bg-white px-2 py-1.5 text-center text-[9px] font-bold opacity-45">打开飞书多维表格 ↗</button>
          )}
        </div>
      )}

      {(message || state.error) && !open && (
        <div
          aria-live="polite"
          className="mt-1.5 border-2 border-black bg-white px-2.5 py-2 text-[9px] font-bold leading-relaxed"
          style={{ borderLeftColor: state.error && !message ? '#b3261e' : accent, borderLeftWidth: 5 }}
        >
          {message || state.error}
        </div>
      )}

      {mapPlacementCount !== undefined && state.active && (
        <div className="mt-1.5 flex items-center gap-2 border-2 border-black bg-white p-1.5 shadow-[2px_2px_0_rgba(0,0,0,0.18)]">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
            <MapPinned className="h-4 w-4 shrink-0" strokeWidth={2.6} style={{ color: accent }} />
            <div className="min-w-0">
              <div className="font-pixel text-[6px] tracking-widest text-black/45">MAP LAYER · {DOMAIN_COPY[domain].label}图层</div>
              <div className="mt-0.5 truncate text-[9px] font-bold">{mappedToEarth ? `${mappedCount} ${DOMAIN_COPY[domain].mapUnit}已在中间地图` : `${mappedCount} ${DOMAIN_COPY[domain].mapUnit}等待落位`}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (mappedToEarth) return;
              setDataPackMapLayerEnabled(domain, true);
              setMessage(`${DOMAIN_COPY[domain].label}数据已落位到中间地图`);
            }}
            disabled={mappedToEarth}
            className="flex h-9 w-[102px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border-2 border-black px-1.5 text-[9px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px disabled:bg-[#F5F2E9] disabled:text-black/55"
            style={mappedToEarth ? undefined : { background: accent }}
            aria-label={mappedToEarth ? `${DOMAIN_COPY[domain].label}数据已落位到地图` : `将${DOMAIN_COPY[domain].label}数据落位到地图`}
          >
            {mappedToEarth ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <MapPinned className="h-3.5 w-3.5" strokeWidth={2.7} />}
            {mappedToEarth ? '已落位地图' : '落位到地图'}
          </button>
        </div>
      )}

      {open && appMain && createPortal(
        <div className="absolute inset-0 z-[90] flex flex-col bg-[#EAEAEA]">
          <div className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
            <button type="button" onClick={() => setOpen(false)} aria-label="关闭数据卡槽" className="w-8 h-8 shrink-0 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
              <ChevronLeft className="w-4 h-4" strokeWidth={3} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="font-pixel text-[10px] tracking-wider">DATA-LIBRARY</div>
              <div className="mt-0.5 text-[9px] font-bold text-black/45">{DOMAIN_COPY[domain].label}数据库 · 随时更换</div>
            </div>
            <Database className="w-4 h-4" strokeWidth={2.6} style={{ color: accent }} />
          </div>

          <div className="shrink-0 border-b-2 border-black bg-black px-4 py-2.5" style={{ color: accent }}>
            <div className="flex items-center justify-between font-pixel text-[7px] tracking-wider">
              <span>当前 {activeCount} {countUnit}</span><span className="opacity-40">|</span>
              <span>已装 {packs.length} 库</span><span className="opacity-40">|</span>
              <span>SKILL 保留</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            <section className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-2.5 px-2.5 py-2.5">
                <div className="w-9 h-9 shrink-0 border-2 border-black flex items-center justify-center" style={{ background: accent }}>
                  <Database className="w-4 h-4" strokeWidth={2.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-pixel text-[6px] tracking-widest text-black/40">CURRENT · 当前使用</div>
                  <div className="mt-0.5 truncate text-[13px] font-bold">{activeName}</div>
                  {state.active ? (
                    <div className="mt-0.5 truncate text-[9px] text-black/45">{activeSource} · v{state.active.manifest.identity.version} · {activeCount}{countUnit}</div>
                  ) : (
                    <div className="mt-0.5 text-[9px] text-black/45">还没有装入数据库</div>
                  )}
                </div>
                {state.active && (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="flex items-center gap-1 text-[8px] font-bold text-[#168654]"><Check className="w-3 h-3" strokeWidth={3} />使用中</span>
                    <button type="button" onClick={() => remove(state.active!)} className="border border-[#B3261E] bg-[#FFF1EE] px-1.5 py-0.5 text-[8px] font-bold text-[#B3261E]">卸载当前库</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 border-t border-black/15 bg-[#F5F2E9] px-2.5 py-1.5 text-[8px] text-black/45">
                <ShieldCheck className="w-3 h-3 shrink-0" strokeWidth={2.5} style={{ color: accent }} />
                换库或卸载只改变数据，Skill 能力和你的个人记录不会消失。
              </div>
            </section>

            <section className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
              <div className="px-2.5 pt-2.5">
                <div className="font-pixel text-[8px] tracking-wider">换一个数据库</div>
                <div className="mt-0.5 text-[9px] text-black/45">装入云端 Manifest，或从本机选择 JSON。</div>
              </div>
              <div className="space-y-2 px-2.5 py-2.5">
                <div className="flex gap-1.5">
                  <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && installUrl()}
                    placeholder={domain === 'music' ? 'Data Pack Manifest（非 YouTube 链接）' : 'OSS / HTTPS Manifest 地址'}
                    className="min-w-0 flex-1 border-2 border-black bg-white px-2 py-1.5 text-[10px] focus:outline-none"
                  />
                  <button type="button" aria-label="从地址装入数据包" onClick={installUrl} disabled={!url.trim() || state.status === 'loading'} className="w-9 shrink-0 border-2 border-black flex items-center justify-center shadow-[1px_1px_0_#000] disabled:opacity-35" style={{ background: accent }}>
                    {state.status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" strokeWidth={2.5} />}
                  </button>
                </div>
                {domain === 'music' && (
                  <div className="border-l-2 pl-2 text-[8px] leading-relaxed text-black/50" style={{ borderColor: accent }}>
                    YouTube 单曲或歌单先整理为 pocket.music/v1 JSON，再从这里装入；这个输入框不直接解析 YouTube。
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={state.status === 'loading'} className="flex items-center justify-center gap-1.5 border-2 border-black bg-white px-2 py-1.5 text-[10px] font-bold shadow-[1px_1px_0_#000] disabled:opacity-40">
                    <Upload className="w-3.5 h-3.5" strokeWidth={2.5} />导入 JSON
                  </button>
                  <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { installFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                  <button type="button" onClick={() => void run(() => installDefaultDataPack(domain), '默认数据包已恢复')} disabled={state.status === 'loading'} className="flex items-center justify-center gap-1.5 border-2 border-black px-2 py-1.5 text-[10px] font-bold shadow-[1px_1px_0_#000] disabled:opacity-40" style={{ background: accent }}>
                    <PackageOpen className="w-3.5 h-3.5" strokeWidth={2.5} />恢复示例库
                  </button>
                </div>
                <div className="flex items-start gap-1.5 text-[8px] leading-relaxed text-black/40">
                  <HardDriveDownload className="mt-0.5 w-3 h-3 shrink-0" strokeWidth={2.5} />
                  装入后缓存到本机；云端分块会先核对大小和 SHA256。
                </div>
              </div>
            </section>

            {(message || state.error) && (
              <div aria-live="polite" className="border-l-2 bg-white px-2.5 py-2 text-[9px] leading-relaxed shadow-[1px_1px_0_rgba(0,0,0,0.35)]" style={{ borderColor: state.error && !message ? '#b3261e' : accent }}>
                {message || state.error}
              </div>
            )}

            <section className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
              <div className="flex items-center justify-between border-b border-black/15 px-2.5 py-2">
                <span className="font-pixel text-[8px] tracking-wider">已装数据库</span>
                <span className="font-pixel text-[7px]" style={{ color: accent }}>{packs.length} SLOTS</span>
              </div>
              {!packs.length && <div className="px-2.5 py-4 text-center text-[10px] text-black/40">尚无已安装数据库</div>}
              {packs.map((pack) => {
                const active = state.active?.packKey === pack.packKey;
                return (
                  <div key={pack.packKey} className="flex items-center gap-2 border-b border-black/10 px-2.5 py-2 last:border-b-0" style={{ background: active ? `${accent}12` : 'white' }}>
                    <span className="h-7 w-1 shrink-0" style={{ background: active ? accent : '#d6d6d6' }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-bold">{pack.manifest.identity.name}</div>
                      <div className="truncate text-[8px] text-black/40">{sourceLabel(pack.source)} · v{pack.manifest.identity.version} · {displayCount(pack)}{countUnit}</div>
                    </div>
                    {active ? (
                      <span className="flex items-center gap-1 text-[8px] font-bold text-[#168654]"><Check className="w-3 h-3" strokeWidth={3} />使用中</span>
                    ) : (
                      <button type="button" onClick={() => void run(() => activateDataPack(pack.packKey), '已切换数据包')} className="border-2 border-black px-2 py-1 text-[9px] font-bold shadow-[1px_1px_0_#000]" style={{ background: accent }}>使用</button>
                    )}
                    <button type="button" onClick={() => remove(pack)} aria-label={`卸载 ${pack.manifest.identity.name}`} className="flex h-7 w-7 items-center justify-center text-[#b3261e]">
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={2.4} />
                    </button>
                  </div>
                );
              })}
            </section>

            <section className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
              <button type="button" onClick={() => setProtocolOpen((value) => !value)} aria-expanded={protocolOpen} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-black" style={{ background: accent }}>
                  <Braces className="w-3.5 h-3.5" strokeWidth={2.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold">通用数据协议</div>
                  <div className="mt-0.5 truncate font-pixel text-[6px] text-black/40">pocket-data/v1 → {adapter.schemaName}</div>
                </div>
                <span className="text-[8px] text-black/40">{protocolOpen ? '收起' : '查看规则'}</span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${protocolOpen ? 'rotate-90' : ''}`} strokeWidth={2.7} />
              </button>

              {protocolOpen && (
                <div className="border-t border-black/15 px-2.5 py-2.5">
                  <div className="font-pixel text-[7px] tracking-wider text-black/45">每个数据包都要包含</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {['protocol', 'identity', 'schema', 'compatibility', 'privacy', 'provenance', 'distribution', 'records'].map((field) => (
                      <span key={field} className="border border-black/40 bg-[#F5F2E9] px-1.5 py-0.5 font-pixel text-[6px]">{field}</span>
                    ))}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <div className="border-l-2 bg-[#F8F7F2] px-2 py-1.5 text-[8px] leading-relaxed" style={{ borderColor: accent }}>
                      <span className="font-bold">① Core 固定外壳：</span>protocol 标识协议；identity 管数据包 ID、作者与版本；privacy 和 provenance 记录隐私、真实来源与许可；distribution 决定本地单文件或 OSS 分块。
                    </div>
                    <div className="border-l-2 bg-[#F8F7F2] px-2 py-1.5 text-[8px] leading-relaxed" style={{ borderColor: accent }}>
                      <span className="font-bold">② {DOMAIN_COPY[domain].label} Adapter：</span>{adapter.schemaName} 精确定义每条记录的字段、类型、评分范围和地点格式；额外字段、错误类型或不兼容 Skill 会被拒绝。
                    </div>
                    <div className="border-l-2 bg-[#F8F7F2] px-2 py-1.5 text-[8px] leading-relaxed" style={{ borderColor: accent }}>
                      <span className="font-bold">③ 记录一致性：</span>records 数量必须与 record_count 一致，ID 不得重复；未知值不编造，地点使用 WGS84，评分、公开评分与置信度不能混用。
                    </div>
                    <div className="border-l-2 bg-[#F8F7F2] px-2 py-1.5 text-[8px] leading-relaxed" style={{ borderColor: accent }}>
                      <span className="font-bold">④ 安全与装入：</span>私人数据默认 private，来源与许可必须真实；只有 Core、当前 Adapter 和校验脚本全部通过后，数据包才会被装入。
                    </div>
                  </div>

                  {domain === 'music' && (
                    <div className="mt-2 bg-[#F5F2E9] px-2 py-2">
                      <div className="text-[9px] font-bold">YouTube 怎么进入音乐 Skill？</div>
                      <div className="mt-1.5 flex items-center gap-1 text-[7px] font-bold">
                        <span>① 单曲/歌单 URL</span><ChevronRight className="w-3 h-3 shrink-0" />
                        <span>② AI/导入器整理</span><ChevronRight className="w-3 h-3 shrink-0" />
                        <span>③ 装入 JSON</span>
                      </div>
                      <div className="mt-1.5 text-[8px] leading-relaxed text-black/50">
                        把 YouTube URL 连同制作 Skill 交给 AI；AI 先展开歌单，再为每首歌保存 provider、sourceId 与 sourceUrl。歌单 URL 本身不是 Manifest；无法读取完整歌单时必须索取导出清单，不能猜歌。
                      </div>
                      <div className="mt-1.5 space-y-1 border-l-2 border-black/20 pl-2 text-[7px] leading-relaxed text-black/60">
                        <div><b>YouTube：</b>url 必须留空；sourceId 是 11 位视频 ID；sourceUrl 是与它一致的原页面。</div>
                        <div><b>OSS / 外部音频：</b>url 必须是可直接播放的 HTTPS 音频地址，不填 sourceId。</div>
                        <div><b>只保留曲目信息：</b>使用 provider=none 与空 url，不伪造来源。</div>
                      </div>
                    </div>
                  )}

                  <div className="mt-2 border-2 border-black bg-[#F8F7F2] px-2 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[9px] font-bold">第一次怎么用？</div>
                      <span className="font-pixel text-[6px] text-black/40">USER FLOW · 5 STEPS</span>
                    </div>
                    <div className="mt-2 space-y-1.5 text-[8px] leading-relaxed">
                      <div className="flex gap-2"><span className="font-pixel" style={{ color: accent }}>01</span><span><b>下载并解压</b> make-pocket-data-pack.zip。</span></div>
                      <div className="flex gap-2"><span className="font-pixel" style={{ color: accent }}>02</span><span><b>交给 AI：</b>支持 Skills 就安装整个文件夹；不支持就上传整个文件夹，或点下方“复制完整指令”。</span></div>
                      <div className="flex gap-2"><span className="font-pixel" style={{ color: accent }}>03</span><span><b>同时给原始资料，直接说：</b>“{AI_REQUEST_EXAMPLE[domain]}”</span></div>
                      <div className="flex gap-2"><span className="font-pixel" style={{ color: accent }}>04</span><span><b>取回 JSON：</b>让 AI 按包内 Schema 整理并运行校验，直到返回 VALID。</span></div>
                      <div className="flex gap-2"><span className="font-pixel" style={{ color: accent }}>05</span><span><b>回到这里导入：</b>点击“导入 JSON”；若报错，把原错误交回 AI 修正，不要绕过校验。</span></div>
                    </div>
                  </div>

                  <div className="mt-2 border border-black/20 bg-white px-2 py-2">
                    <div className="text-[8px] font-bold">下载包里有什么？</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {['SKILL.md 路由', '3 份模板', '3 份 Schema', '合法示例', '校验脚本'].map((item) => (
                        <span key={item} className="border border-black/30 bg-[#F5F2E9] px-1.5 py-0.5 text-[7px]">{item}</span>
                      ))}
                    </div>
                    <div className="mt-1.5 text-[8px] leading-relaxed text-black/50">安装整个 Skill 后，AI 会只读取当前数据类型的规则；不必把所有协议文字反复粘贴进对话。</div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={downloadAuthoringSkill} className="flex items-center justify-center gap-1.5 whitespace-nowrap border-2 border-black bg-white px-1.5 py-1.5 text-[9px] font-bold shadow-[1px_1px_0_#000]">
                      <Download className="w-3.5 h-3.5" strokeWidth={2.5} />下载制作 Skill
                    </button>
                    <button type="button" onClick={() => void copyAiInstruction()} className="flex items-center justify-center gap-1.5 whitespace-nowrap border-2 border-black px-1.5 py-1.5 text-[9px] font-bold shadow-[1px_1px_0_#000]" style={{ background: accent }}>
                      <Copy className="w-3.5 h-3.5" strokeWidth={2.5} />复制完整指令
                    </button>
                  </div>
                </div>
              )}
            </section>

            <div className="pb-2 text-center text-[8px] text-black/35">数据库可以换，Skill 的能力与私人记忆留在本机。</div>
          </div>
        </div>,
        appMain,
      )}
    </>
  );
}
