import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, FolderOpen, HardDrive, ShieldCheck, Trash2, MapPin, Upload, Sparkles } from 'lucide-react';
import { curated, dupGroups, curationStats, VERDICT_LABEL, VERDICT_COLOR, type CuratedPhoto } from '../data/photoCuration';
import { edgeSafe } from '../../../frost-agent/edge/contract';
import { downscaleForVision } from '../lib/imageDownscale';
import { runScreen, type PhotoResult, type PhotoType, type Verdict, TYPE_LABEL, addPhotoPins, toPins, learnFromOverride, recordPhotoOverride, getPrefs } from '../lib/photo';
import { recordsFromFiles, buildBackupIndex, matchBackup, looksLikeSelfPick, type BackupMatch, type BackupRecord } from '../lib/photo/backup';
import RunTrace from './RunTrace';
import { startAgentRun } from '../lib/observe/bus';

// photos-agent 运行页 —— 真·端侧照片整理 agent。
// 「我的照片」：用户在系统选择器多选自己的真实照片 → 设年月范围 → 一键端侧筛选
//   （混合：快速逐像素分析 + 可选小视觉模型精筛）→ 真实打分/查重/判留删，全程原图不出手机。
// 「示例」：原概念报告（mock 数据），留作演示。

interface Props { onBack: () => void }
const onImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.opacity = '0'; };

// 真·结果的判定配色
const RV_LABEL: Record<Verdict, string> = { keep: '留', review: '待定', clean: '可清理' };
const RV_COLOR: Record<Verdict, string> = { keep: '#00aa55', review: '#c08a00', clean: '#d23b3b' };

const NOW_Y = new Date().getFullYear();
const YEARS = Array.from({ length: NOW_Y - 2007 }, (_, i) => NOW_Y - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// ───────────────────────── 示例（原概念报告，mock） ─────────────────────────
const CLEAN_KEY = 'pe.photoCleaned.v1';
function loadCleaned(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CLEAN_KEY) || '[]')); } catch { return new Set(); }
}
const SEGMENTS = ['整理报告', '重复清理', '高价值'] as const;
type Segment = (typeof SEGMENTS)[number];

function DemoView() {
  const [segment, setSegment] = useState<Segment>('整理报告');
  const [scanned, setScanned] = useState(0);
  const [cleaned, setCleaned] = useState<Set<string>>(loadCleaned);
  const [edgeScored, setEdgeScored] = useState<Record<string, { score?: number; reason: string; busy?: boolean }>>({});
  const [edgeRunning, setEdgeRunning] = useState(false);
  const total = curationStats.total;
  const done = scanned >= total;

  useEffect(() => {
    if (scanned >= total) return;
    const t = window.setInterval(() => setScanned((s) => Math.min(total, s + Math.max(3, Math.round(total / 40)))), 90);
    return () => window.clearInterval(t);
  }, [scanned, total]);

  const persistCleaned = (next: Set<string>) => {
    setCleaned(next);
    try { localStorage.setItem(CLEAN_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  };
  const cleanGroup = (g: typeof dupGroups[number]) => {
    const next = new Set(cleaned); g.photos.forEach((p) => { if (p.id !== g.keepId) next.add(p.id); }); persistCleaned(next);
  };
  const cleanAllDups = () => {
    const next = new Set(cleaned); dupGroups.forEach((g) => g.photos.forEach((p) => { if (p.id !== g.keepId) next.add(p.id); })); persistCleaned(next);
  };

  const report = useMemo(() => [...curated].sort((a, b) => b.score - a.score), []);
  const shown = report.slice(0, Math.max(scanned, done ? total : 0));
  const keeps = useMemo(() => curated.filter((c) => c.verdict === 'keep'), []);

  const runEdgeScore = async () => {
    if (edgeRunning) return;
    const picks = report.filter((c) => c.thumb && /^https?:/.test(c.thumb) && !edgeScored[c.id]).slice(0, 3);
    if (!picks.length) return;
    setEdgeRunning(true);
    for (const c of picks) {
      setEdgeScored((m) => ({ ...m, [c.id]: { reason: '端侧看图中…', busy: true } }));
      let score: number | undefined; let reason = '';
      try {
        const img = await downscaleForVision(c.thumb!);
        const out = await edgeSafe.vision(img, '看这张照片，判断收藏价值。只回 JSON：{"score":0到100的整数,"reason":"一句不超过18字的中文理由"}');
        const norm = (out || '').replace(/```json|```/g, '').trim().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
        const obj = norm.match(/\{[\s\S]*?\}/);
        try { const j = JSON.parse(obj ? obj[0] : norm); score = Math.round(Number(j.score)); reason = String(j.reason || '').slice(0, 24); } catch { /* */ }
        if (score === undefined || Number.isNaN(score)) { const sm = norm.match(/score["']?\s*[:：]\s*["']?(\d{1,3})/) || norm.match(/(\d{1,3})/); if (sm) score = Math.min(100, Number(sm[1])); }
        if (!reason) { const rm = norm.match(/reason["']?\s*[:：]\s*["']?([^"'}\n]+)/); reason = (rm ? rm[1] : norm.replace(/[{}"]/g, '')).trim().slice(0, 24); }
      } catch { /* */ }
      setEdgeScored((m) => ({ ...m, [c.id]: { score, reason: reason || '端侧未就绪', busy: false } }));
    }
    setEdgeRunning(false);
  };

  const Card = (c: CuratedPhoto, idx: number) => {
    const isClean = cleaned.has(c.id);
    return (
      <div key={c.id + '#' + idx} className={`flex gap-2.5 border-2 border-black bg-white p-2 shadow-[2px_2px_0_rgba(0,0,0,0.85)] ${isClean ? 'opacity-45' : ''}`}>
        <div className="w-16 h-16 shrink-0 bg-[#d8d8d6] border border-black/40 overflow-hidden relative">
          <img src={c.thumb} onError={onImgErr} alt="" loading="lazy" className={`w-full h-full object-cover ${c.verdict === 'keep' ? '' : 'grayscale'}`} />
          <span className="absolute top-0 left-0 font-pixel text-[8px] text-white bg-black/70 px-1 leading-tight">{c.score}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-pixel text-[7px] px-1.5 py-0.5 text-white" style={{ background: VERDICT_COLOR[c.verdict] }}>{VERDICT_LABEL[c.verdict]}</span>
            <span className="text-[12px] font-bold truncate">{c.city || '未知地点'}</span>
            {isClean && <span className="font-pixel text-[7px] text-[#d23b3b]">已标记清理</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {c.tags.map((t, i) => (<span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 text-black/60 bg-[#EAEAEA]">{t}</span>))}
          </div>
          <div className="text-[10px] text-black/55 leading-snug mt-1">{c.reason}</div>
          {edgeScored[c.id] && (
            <div className="mt-1 flex items-center gap-1.5 text-[10px]">
              <span className="font-pixel text-[6px] px-1 py-0.5 text-black shrink-0" style={{ background: '#00ff88' }}>端侧实判</span>
              {edgeScored[c.id].busy ? <span className="text-black/45 animate-pulse">端侧看图中…</span>
                : <span className="text-black/70 leading-snug">{edgeScored[c.id].score != null ? <b>{edgeScored[c.id].score} 分</b> : null} · {edgeScored[c.id].reason}</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 py-2.5 border-b-2 border-black bg-black text-[#00ff88] shrink-0">
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>高价值 {curationStats.highValue}</span><span className="opacity-40">|</span>
          <span>待定 {curationStats.review}</span><span className="opacity-40">|</span>
          <span>重复 {curationStats.dupGroups} 组</span><span className="opacity-40">|</span>
          <span>可清理 {curationStats.cleanable}</span>
        </div>
      </div>
      <div className="px-3 py-2 border-b-2 border-black bg-white flex items-center gap-2 shrink-0">
        <div className="flex border-2 border-black bg-[#EAEAEA] p-0.5 flex-1">
          {SEGMENTS.map((s) => (
            <button key={s} onClick={() => setSegment(s)} className={`flex-1 py-1 text-[10px] font-bold ${segment === s ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>{s}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {segment === '整理报告' && (<>
          <button onClick={runEdgeScore} disabled={edgeRunning} className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-[#00ff88] text-black px-2 py-1.5 text-[11px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-50">
            {edgeRunning ? '端侧看图打分中…' : '▶ 端侧看图打分 · 真模型看 3 张'}
          </button>
          {shown.map((c, i) => Card(c, i))}
          {!done && <div className="text-center font-pixel text-[8px] text-black/40 py-2 tracking-widest animate-pulse">示例载入中… {scanned}/{total}</div>}
        </>)}
        {segment === '重复清理' && (<>
          <div className="flex items-center justify-between bg-white border-2 border-black p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="text-[11px]"><b>{dupGroups.length}</b> 组重复 · 已标记清理 <b>{cleaned.size}</b></div>
            <button onClick={cleanAllDups} className="flex items-center gap-1 border-2 border-black bg-[#d23b3b] text-white px-2 py-1 text-[10px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px"><Trash2 className="w-3 h-3" strokeWidth={2.5} /> 一键清理重复</button>
          </div>
          <div className="font-pixel text-[7px] text-black/40 px-1">清理仅做标记，不会删除你的原图</div>
          {dupGroups.slice(0, 30).map((g, gi) => (
            <div key={g.key + '#' + gi} className="border-2 border-black bg-white p-2 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-pixel text-[8px] text-black/55">{g.photos.length} 张重复 · 保留最高分</span>
                <button onClick={() => cleanGroup(g)} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 active:translate-y-px">清理本组</button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto">
                {g.photos.map((p, pi) => {
                  const keep = p.id === g.keepId; const isClean = cleaned.has(p.id);
                  return (
                    <div key={p.id + '#' + pi} className="relative shrink-0">
                      <div className={`w-14 h-14 border-2 overflow-hidden ${keep ? 'border-[#00aa55]' : 'border-black/40'} ${isClean ? 'opacity-40' : ''}`}>
                        <img src={p.thumb} onError={onImgErr} alt="" loading="lazy" className={`w-full h-full object-cover ${keep ? '' : 'grayscale'}`} />
                      </div>
                      <span className="absolute top-0 left-0 font-pixel text-[7px] text-white bg-black/70 px-0.5">{p.score}</span>
                      {keep && <span className="absolute bottom-0 inset-x-0 font-pixel text-[6px] text-center text-white bg-[#00aa55]">保留</span>}
                      {!keep && isClean && <span className="absolute bottom-0 inset-x-0 font-pixel text-[6px] text-center text-white bg-[#d23b3b]">清理</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>)}
        {segment === '高价值' && (<>
          <div className="bg-white border-2 border-black p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)] flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#00e5ff]" strokeWidth={2.5} />
            <div className="text-[11px] leading-snug"><b>{keeps.length}</b> 张高价值照片已钉到地球（tab1）与日历。</div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {keeps.map((c, i) => (
              <div key={c.id + '#' + i} className="aspect-square border-2 border-black overflow-hidden shadow-[1px_1px_0_#000] relative bg-[#d8d8d6]">
                <img src={c.thumb} onError={onImgErr} alt="" loading="lazy" className="w-full h-full object-cover" />
                <span className="absolute top-0 left-0 font-pixel text-[7px] text-white bg-black/70 px-0.5">{c.score}</span>
                <span className="absolute bottom-0 inset-x-0 font-pixel text-[6px] text-center text-white bg-black/60 truncate px-0.5">{c.city}</span>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </>
  );
}

// ───────────────────────── 我的照片（真·端侧筛选） ─────────────────────────
type Filter = 'all' | 'keep' | 'review' | 'clean' | 'utility' | 'needplace' | 'deletable';
const isUtil = (t: PhotoType) => t === 'screenshot' || t === 'document';
const TYPE_COLOR: Record<PhotoType, string> = {
  place: '#0a7d4a', life: '#0a7d4a', place_nogps: '#7a5a1f',
  screenshot: '#5a5a5a', document: '#5a5a5a', junk: '#888', uncertain: '#c08a00',
};
// ── 搬家/核验 UI 态（核验引擎在 lib/photo/backup.ts；网页不写盘、不删相册——iOS 对所有浏览器的铁律）──
type BackupMatches = Record<string, BackupMatch>;
type BackupState = 'verified' | 'content' | 'suspected' | 'none';

const MOVED_KEY = 'pe.photoMoved.v1';   // 「已删原片」记账（dHash 为键：内容指纹，跨会话/重选稳定）
function loadMoved(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(MOVED_KEY) || '[]')); } catch { return new Set(); }
}

// 搬原片走系统通道：深链唤起用户建好的快捷指令（Apple 官方 URL scheme，网页可用），原片不经网页、画质无损
const SHORTCUT_NAME = '搬到SSD';
const SHORTCUT_URL = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
// iPadOS 会伪装成 Mac：用触点数兜底识别
const IS_IOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n >= 10 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
}

function assetKey(name: string, size: number, lastModified: number): string {
  return `${name}::${size}::${lastModified}`;
}
function fileKey(file: File): string {
  return assetKey(file.name, file.size, file.lastModified);
}
function resultKey(r: PhotoResult): string {
  return assetKey(r.name, r.sourceSize ?? -1, r.sourceLastModified ?? -1);
}
function backupStateOf(key: string, matches: BackupMatches): BackupState {
  const s = matches[key]?.status;
  return s === 'verified' ? 'verified' : s === 'verified_content' ? 'content' : s === 'suspected' ? 'suspected' : 'none';
}
function isStrongBackupState(state: BackupState): boolean {
  return state === 'verified' || state === 'content';
}
function backupLabel(state: BackupState): string {
  if (state === 'verified') return 'hash 已验证';
  if (state === 'content') return '内容已验证';
  if (state === 'suspected') return '疑似已备份';
  return '未备份';
}
function backupBadgeColor(state: BackupState): string {
  if (state === 'verified') return '#0a7d4a';
  if (state === 'content') return '#0a6f91';
  if (state === 'suspected') return '#c08a00';
  return '#777';
}
function isMemoryKeep(r: PhotoResult): boolean {
  return r.verdict === 'keep' || r.needPlace;
}
function actionLabel(r: PhotoResult, state: BackupState, movedDone: boolean): string {
  if (movedDone) return '已删原片 ✓';
  if (state === 'suspected') return '疑似备份 · 先复核';
  if (!isStrongBackupState(state)) return '未备份 · 先别删';
  if (r.pinnable) return '可删原片 · 已入 Pocket Earth';
  if (r.needPlace) return '可删原片 · 待补地点';
  if (r.verdict === 'keep') return '可删原片 · 建议保留';
  return '可删原片';
}
const MATCH_TEXT: Record<BackupMatch['status'], string> = {
  verified: '已验证(hash)', verified_content: '已验证(内容)', suspected: '疑似', missing: '未找到',
};
function verifyCsv(files: File[], matches: BackupMatches, movedFlags: Record<string, boolean>): string {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [['file_name', 'status', 'action', 'backup_path', 'size', 'last_modified']];
  files.forEach((f) => {
    const k = fileKey(f);
    const m = matches[k];
    const state = backupStateOf(k, matches);
    const action = movedFlags[k] ? '已删' : isStrongBackupState(state) ? '可删' : state === 'suspected' ? '先复核' : '先别删';
    rows.push([f.name, m ? MATCH_TEXT[m.status] : '未核验', action, m?.path || '', formatBytes(f.size), new Date(f.lastModified).toISOString()]);
  });
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\n');   // BOM：Excel 打开中文不乱码
}

function RealView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);
  const backupDirRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<PhotoResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: '' });
  const [runId, setRunId] = useState<string | null>(null);
  const [useModel, setUseModel] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [err, setErr] = useState('');
  const [pinned, setPinned] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const backupCancelRef = useRef(false);   // 核验中途取消（选错文件夹/文件夹太大时不用干等）
  const [backupMsg, setBackupMsg] = useState('');
  const [backupRecords, setBackupRecords] = useState<BackupRecord[]>([]);
  const [backupMatches, setBackupMatches] = useState<BackupMatches>({});
  const [moved, setMoved] = useState<Set<string>>(loadMoved);   // 已删原片记账（键=dHash）
  const [lessons, setLessons] = useState<string[]>(() => getPrefs().lessons);   // 反思层凝练的经验（越用越懂你）
  // 年月范围（'' = 不限）
  const [fromY, setFromY] = useState(''); const [fromM, setFromM] = useState('');
  const [toY, setToY] = useState(''); const [toM, setToM] = useState('');

  const resultsRef = useRef<PhotoResult[]>([]);
  resultsRef.current = results;
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; resultsRef.current.forEach((r) => URL.revokeObjectURL(r.url)); }, []);
  const totalSelectedBytes = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
  // 视频：不进端侧筛选（解码/美学都不适用），但占空间大头，走「核验→可删」通道
  const videoFiles = useMemo(() => files.filter((f) => f.type.startsWith('video/') || /\.(?:mov|mp4|m4v|avi|mts|3gp)$/i.test(f.name)), [files]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files || []));
    setErr(''); setBackupMsg(''); setBackupRecords([]); setBackupMatches({});
  };

  const toggleMoved = (id: string) => {
    setMoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(MOVED_KEY, JSON.stringify([...next])); } catch { /* 隐私模式忽略 */ }
      return next;
    });
  };

  const verifyBackupRecords = async (records: BackupRecord[], sourceLabel: string) => {
    if (!files.length || backupBusy) return;
    if (!records.length) {
      setBackupMsg('这个备份位置里没有可核验的照片/视频文件');
      setBackupRecords([]);
      setBackupMatches({});
      return;
    }
    if (looksLikeSelfPick(files, records)) {
      setBackupRecords([]);
      setBackupMatches({});
      setBackupMsg('⚠️ 这批「备份文件」和刚授权的照片一模一样——像是又从相册选了一遍。相册不是备份，这样核出来的「已备份」不作数。请在选择器里点「选取文件」，去文件 App 选 SSD/网盘里的真备份（或直接用「选备份文件夹」整夹选取）。');
      return;
    }
    setBackupBusy(true);
    backupCancelRef.current = false;
    setBackupRecords(records);
    setBackupMatches({});
    setBackupMsg(`正在建立 ${sourceLabel} 索引 · ${records.length} 个文件`);
    try {
      const index = buildBackupIndex(records);
      // 筛选结果的 dHash（感知指纹）：相册选择器给的转码件字节对不上时，用它认「内容同一张」
      const dhashByKey = new Map<string, string>();
      for (const r of resultsRef.current) dhashByKey.set(resultKey(r), r.id);
      const next: BackupMatches = {};
      let verified = 0, suspected = 0, missing = 0;
      // 大批量时降低整表复制+重渲染频率（每次 {...next} 是 O(已处理数)，太密会二次方级卡顿）
      const step = files.length > 300 ? 25 : 3;
      for (let i = 0; i < files.length; i++) {
        if (backupCancelRef.current || !mountedRef.current) {
          setBackupMatches({ ...next });
          setBackupMsg(`已取消对账 · 已完成 ${i}/${files.length} 的结果保留（已验证 ${verified}）`);
          return;
        }
        const f = files[i];
        const match = await matchBackup(f, dhashByKey.get(fileKey(f)), index);
        next[fileKey(f)] = match;
        if (match.status === 'verified' || match.status === 'verified_content') verified++;
        else if (match.status === 'suspected') suspected++;
        else missing++;
        if (i % step === 0 || i === files.length - 1) {
          setBackupMatches({ ...next });
          setBackupMsg(`端侧对账中 · ${i + 1}/${files.length} · 已验证 ${verified} · 疑似 ${suspected} · 未找到 ${missing}`);
        }
        // 没命中候选的文件走纯同步路径，攒多了会长时间霸占主线程 → 定期让渡一帧
        if (i % 25 === 24) await new Promise((r) => setTimeout(r, 0));
      }
      setBackupMatches(next);
      // 没先筛选时转码照片没有感知指纹可比，大量核不上是预期现象——主动点破下一步，别让用户以为备份丢了
      const noScreenHint = !resultsRef.current.length && verified < suspected + missing
        ? ' 提示：这批还没跑端侧筛选——先「一键开始筛选」再核验一次，相册给的转码照片就能按内容认出来，命中率会明显提高。'
        : '';
      setBackupMsg(`对账完成：已验证 ${verified}，疑似 ${suspected}，未找到 ${missing}。只有「已验证」进入可删清单。${noScreenHint}`);
    } catch (e) {
      setBackupMsg('对账中断：' + (e instanceof Error ? e.message : '备份位置可能不可读'));
    } finally {
      setBackupBusy(false);
    }
  };
  const onPickBackupFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const records = recordsFromFiles(e.target.files || []);
    if (backupFileRef.current) backupFileRef.current.value = '';
    await verifyBackupRecords(records, '已选备份文件');
  };
  const onPickBackupDir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    const records = recordsFromFiles(list);
    if (backupDirRef.current) backupDirRef.current.value = '';
    const wholeFolder = list.some((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath);
    await verifyBackupRecords(records, wholeFolder ? '备份文件夹' : '已选备份文件');
  };
  // 每个文件的「已删」态：照片按 dHash（筛过才有）、其余按 localHash/fileKey 解析
  const movedFlagFor = (f: File): boolean => {
    const k = fileKey(f);
    const dhash = resultsRef.current.find((r) => resultKey(r) === k)?.id;
    return moved.has(dhash || backupMatches[k]?.localHash || k);
  };
  const markAllMoved = () => {
    setMoved((prev) => {
      const next = new Set(prev);
      for (const r of resultsRef.current) if (isStrongBackupState(backupStateOf(resultKey(r), backupMatches))) next.add(r.id);
      for (const f of videoFiles) {
        const m = backupMatches[fileKey(f)];
        if (m && (m.status === 'verified' || m.status === 'verified_content')) next.add(m.localHash || fileKey(f));
      }
      try { localStorage.setItem(MOVED_KEY, JSON.stringify([...next])); } catch { /* 隐私模式忽略 */ }
      return next;
    });
  };
  const exportVerifyCsv = () => {
    if (!files.length) return;
    const movedFlags: Record<string, boolean> = {};
    for (const f of files) movedFlags[fileKey(f)] = movedFlagFor(f);
    const url = URL.createObjectURL(new Blob([verifyCsv(files, backupMatches, movedFlags)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PocketEarth-核验清单.csv';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const run = async () => {
    if (!files.length || running) return;
    results.forEach((r) => URL.revokeObjectURL(r.url));
    const tr = startAgentRun(`端侧整理照片 · ${files.length} 张`); setRunId(tr.runId);
    let lastPhase = '';
    setResults([]); setErr(''); setPinned(false); setRunning(true); setProgress({ done: 0, total: files.length, phase: '准备' });
    try {
      const fromYM = fromY && fromM ? +fromY * 12 + (+fromM - 1) : undefined;
      const toYM = toY && toM ? +toY * 12 + (+toM - 1) : undefined;
      const res = await runScreen(files, { fromYM, toYM, useModel, maxAnalyze: 256, modelTopN: 24 },
        (done, total, phase) => {
          setProgress({ done, total, phase });
          if (phase && phase !== lastPhase) { tr.phase(phase, total > 1 ? `共 ${total} 张` : undefined); lastPhase = phase; }   // 里程碑变化才发一条，不每张图一行
        });
      tr.end(true);
      // 若筛选期间组件已卸载（用户返回），这批 objectURL 永远进不了 state 的清理 → 此处主动释放，杜绝泄漏
      if (!mountedRef.current) { res.forEach((r) => URL.revokeObjectURL(r.url)); return; }
      setResults(res);
      if (!res.length) setErr(videoFiles.length
        ? `端侧筛选只看照片；本批 ${videoFiles.length} 个视频请在上方「② 核验备份」确认后删除。`
        : '这批照片里没有落在所选时间段内的（或都无法解析）。换个范围或多选一些试试。');
    } catch (e) {
      tr.end(false);
      if (mountedRef.current) setErr('筛选出错了：' + (e instanceof Error ? e.message : String(e)));
    } finally { if (mountedRef.current) setRunning(false); }
  };

  const stats = useMemo(() => {
    const s = { keep: 0, review: 0, clean: 0, utility: 0, needplace: 0, dup: 0, pin: 0 };
    for (const r of results) {
      if (r.dupOf) s.dup++;
      if (r.pinnable) s.pin++;
      if (isUtil(r.photoType)) s.utility++;
      else if (r.needPlace) s.needplace++;
      else s[r.verdict]++;
    }
    return s;
  }, [results]);

  const backupStats = useMemo(() => {
    const scanned = Object.keys(backupMatches).length > 0;
    const s = { verified: 0, suspected: 0, missing: 0, scanned, freeableBytes: 0 };   // freeable：删掉已验证项能腾出的空间（用户最关心的数字）
    if (!scanned) return s;
    for (const f of files) {
      const state = backupStateOf(fileKey(f), backupMatches);
      if (isStrongBackupState(state)) { s.verified++; s.freeableBytes += f.size; }
      else if (state === 'suspected') s.suspected++;
      else s.missing++;
    }
    return s;
  }, [files, backupMatches]);

  const migrationStats = useMemo(() => {
    const s = { backedKeep: 0, backedClean: 0, backedReview: 0, backedPocket: 0, notBackedKeep: 0, notBackedClean: 0, notBackedReview: 0, suspected: 0, deletable: 0, moved: 0 };
    for (const r of results) {
      const state = backupStateOf(resultKey(r), backupMatches);
      const backed = isStrongBackupState(state);
      if (state === 'suspected') s.suspected++;
      if (backed) { s.deletable++; if (moved.has(r.id)) s.moved++; if (r.pinnable) s.backedPocket++; }
      const key = isMemoryKeep(r) ? 'Keep' : r.verdict === 'clean' ? 'Clean' : 'Review';
      if (backed) s[`backed${key}` as keyof typeof s]++;
      else s[`notBacked${key}` as keyof typeof s]++;
    }
    return s;
  }, [results, backupMatches, moved]);

  const shown = useMemo(() => {
    if (filter === 'all') return results;
    if (filter === 'utility') return results.filter((r) => isUtil(r.photoType));
    if (filter === 'needplace') return results.filter((r) => r.needPlace);
    if (filter === 'deletable') return results.filter((r) => isStrongBackupState(backupStateOf(resultKey(r), backupMatches)));
    return results.filter((r) => !isUtil(r.photoType) && !r.needPlace && r.verdict === filter);
  }, [results, filter, backupMatches]);

  const pinning = useRef(false);
  const pinAll = async () => {
    if (pinning.current || pinned) return;   // 同步重入守卫：移动端快速双击在 React 提交 disabled 前会触发两次 → 同步 ref 挡住第二次，免重复钉
    pinning.current = true;
    setPinned(true);
    try { await addPhotoPins(toPins(results.filter((r) => r.pinnable))); }
    finally { pinning.current = false; }
  };

  // 纠错：拉回实拍 / 标为资料 / 留 / 清理 —— 写偏好(越用越准)+ 记住(下次同图沿用)
  const correct = (r: PhotoResult, to: 'place' | 'utility' | 'keep' | 'clean') => {
    learnFromOverride(r.photoType, to);
    recordPhotoOverride(r.id, to);
    setResults((prev) => prev.map((x) => {
      if (x.uid !== r.uid) return x;
      const n: PhotoResult = { ...x, userOverride: to };
      if (to === 'place') { n.photoType = x.hasGPS ? 'place' : 'place_nogps'; n.pinnable = x.hasGPS; n.needPlace = !x.hasGPS; n.verdict = 'keep'; }
      else if (to === 'utility') { n.photoType = 'screenshot'; n.pinnable = false; n.needPlace = false; n.verdict = 'review'; }
      else if (to === 'keep') n.verdict = 'keep';
      else if (to === 'clean') { n.verdict = 'clean'; n.pinnable = false; }
      return n;
    }));
    setLessons(getPrefs().lessons);   // 纠正后反思层可能凝练出新经验，刷新展示
  };

  const dateStr = (d: Date | null) => d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '无日期';

  // 按拍摄日分组的搬家清单：照片App只能按天快速圈选，这份摘要让用户「选整天、再排除留手机的几张」
  const moveDigest = useMemo(() => {
    const byDay = new Map<string, { total: number; keeps: string[] }>();
    for (const r of results) {
      const day = dateStr(r.date);
      const g = byDay.get(day) || { total: 0, keeps: [] };
      g.total++;
      if (isMemoryKeep(r)) g.keeps.push(r.name.replace(/\.[a-z0-9]+$/i, ''));
      byDay.set(day, g);
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [results]);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 控制台 */}
      <div className="px-3 pt-3 pb-2 space-y-2.5 border-b-2 border-black bg-white">
        {/* 时间段 */}
        <div className="border-2 border-black p-2.5 bg-[#EAEAEA]">
          <div className="font-pixel text-[8px] tracking-widest text-black/50 mb-1.5">时间段（按 EXIF 拍摄日期 · 不选=不限）</div>
          <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
            <span className="text-black/50">从</span>
            <select value={fromY} onChange={(e) => setFromY(e.target.value)} className="border-2 border-black bg-white px-1 py-1 text-[11px]"><option value="">年</option>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>
            <select value={fromM} onChange={(e) => setFromM(e.target.value)} className="border-2 border-black bg-white px-1 py-1 text-[11px]"><option value="">月</option>{MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            <span className="text-black/50">到</span>
            <select value={toY} onChange={(e) => setToY(e.target.value)} className="border-2 border-black bg-white px-1 py-1 text-[11px]"><option value="">年</option>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>
            <select value={toM} onChange={(e) => setToM(e.target.value)} className="border-2 border-black bg-white px-1 py-1 text-[11px]"><option value="">月</option>{MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </div>
        </div>
        {/* 选图 + 选项 */}
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={onPick} />
        <input ref={backupFileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={onPickBackupFiles} />
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 border-2 border-black bg-white px-2 py-2 text-[12px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px">
            <Upload className="w-4 h-4" strokeWidth={2.5} /> {files.length ? `已授权 ${files.length} 张 · 重选` : '选择照片 / 授权相册'}
          </button>
        </div>
        {!files.length && (
          <div className="text-[10.5px] text-black/55 leading-relaxed border-l-2 border-[#00aa55] pl-2">
            点开后在系统相册里 <b>多选 / 全选</b>——选中即把这批照片<b>授权</b>给端侧分析。
            <span className="text-black/40">iOS 不给网页「常驻全相册」权限（那是原生 App 才有的），只能这样逐次选；但选中的照片是真读真分析。</span>
            <span className="block mt-0.5 text-[#7a5a1f]">想钉地球：在选择器左下角「选项」里打开<b>「位置」</b>，照片才带 GPS 坐标（iOS 默认剥离）。</span>
          </div>
        )}
        <label className="flex items-center gap-2 text-[11px] cursor-pointer select-none">
          <input type="checkbox" checked={useModel} onChange={(e) => setUseModel(e.target.checked)} className="w-4 h-4 accent-black" />
          <Sparkles className="w-3.5 h-3.5 text-[#c08a00]" strokeWidth={2.5} />
          用端侧 AI 模型精筛 top（首次需下载模型，之后缓存；不勾=纯快速分析，秒出）
        </label>
        <button onClick={run} disabled={!files.length || running}
          className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-[#00ff88] text-black px-2 py-2.5 text-[13px] font-bold shadow-[3px_3px_0_#000] active:translate-y-px disabled:opacity-40">
          {running ? '端侧筛选中…' : '▶ 一键开始筛选'}
        </button>
        <div className="font-pixel text-[7px] text-black/40 leading-relaxed">全程在你手机本地完成 · 原图一步都不出手机 · 只产出分数/标签</div>
      </div>

      {/* 搬家到 SSD：搬运/删除走系统通道（iOS 不让任何网页写外接盘、删相册），Pocket Earth 做筛选/核验/记账 */}
      {files.length > 0 && (
        <div className="px-3 pt-3 pb-3 space-y-2.5 border-b-2 border-black bg-[#f6fbff]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <HardDrive className="w-4 h-4 shrink-0 text-[#0a6f91]" strokeWidth={2.5} />
              <div className="font-pixel text-[8px] tracking-widest truncate">搬家到 EXTREME SSD</div>
            </div>
            <span className="font-pixel text-[7px] text-black/45 shrink-0">{files.length} 个 · {formatBytes(totalSelectedBytes)}</span>
          </div>
          <div className="text-[10.5px] text-black/60 leading-relaxed">
            iOS 不让任何网页写外接盘、删相册，所以<b>搬运和删除走系统通道</b>（原片直达 SSD、画质无损）；Pocket Earth 负责它真能做好的：筛选价值、核验备份、记账防看走眼。
          </div>

          <div className="border-2 border-black bg-white p-2.5 space-y-1.5">
            <div className="font-pixel text-[8px] tracking-widest text-[#0a6f91]">① 搬原片 + 删原片（系统一条龙）</div>
            {IS_IOS ? (
              <>
                <a href={SHORTCUT_URL}
                  className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-[#0a6f91] text-white px-2 py-2 text-[12px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px">
                  ▶ 运行「{SHORTCUT_NAME}」快捷指令
                </a>
                <div className="text-[10px] text-black/50 leading-relaxed">
                  把要搬的照片放进相册「搬去SSD」→ 点上面按钮 → 选 SSD 里的文件夹 → 系统弹一次删除确认。搬 + 删一次完成，原片不经网页。
                </div>
                <div className="text-[10px] text-[#7a5a1f] leading-relaxed border-l-2 border-[#c08a00] pl-1.5">
                  第一次点会提示「未找到快捷指令」——那不是坏了，是手机上还没建这个指令（苹果不让网页替你装）。展开下面教程建一次（约 1 分钟），以后就是真·一键。
                </div>
              </>
            ) : (
              <div className="text-[10.5px] text-black/60 leading-relaxed border border-black/30 bg-[#f6f6f4] px-2 py-1.5">
                快捷指令按钮在 iPhone/iPad 上才会出现。电脑上大批量搬家最稳的路：数据线连 Mac 用「图像捕捉」勾选「导入后删除」（真·移动；需临时关闭 iCloud 照片，否则删除被禁用）。
              </div>
            )}
            <details className="text-[10.5px] text-black/60 leading-relaxed">
              <summary className="font-bold cursor-pointer select-none">第一次用？1 分钟建好这个快捷指令</summary>
              <ol className="list-decimal pl-4 mt-1 space-y-0.5">
                <li>照片 App：新建相册「搬去SSD」，把要搬的照片加进去（它就是你的转移清单，再也不怕看走眼）</li>
                <li>快捷指令 App → ＋ → 添加动作「查找照片」，条件设：相册 是 搬去SSD</li>
                <li>添加动作「存储文件」：内容选上一步的「照片」，打开「询问存储位置」</li>
                <li>添加动作「删除照片」：删除「查找照片」的结果</li>
                <li>重命名为「{SHORTCUT_NAME}」→ 完成</li>
              </ol>
              <div className="mt-1 text-black/45">防坑：每批 ≤500；开了 iCloud「优化储存空间」会边下原图边存（需要网络）；SSD 用 exFAT/APFS 格式；删完清空「最近删除」才真正腾出空间；iCloud 照片开着时删本地=同步删云端。</div>
            </details>
            <details className="text-[10.5px] text-black/60 leading-relaxed">
              <summary className="font-bold cursor-pointer select-none">不用快捷指令的手动姿势（含防坑）</summary>
              <ol className="list-decimal pl-4 mt-1 space-y-0.5">
                <li>照片 App 建相册「搬去SSD」当清单 → 相册内全选 → 分享 → 「导出未修改的原片」→ 选 SSD</li>
                <li>分批 ≤200：一次 500+ 文件或 50GB+ 大概率报「无权限」错误（SanDisk Extreme 高发）</li>
                <li>报错就在文件 App 里把盘抹掉成 APFS，或改走「存储到文件」（可能丢元数据）</li>
                <li>导出成功后回同一相册全选删除 → 清空「最近删除」</li>
              </ol>
            </details>
          </div>

          <div className="border-2 border-black bg-white p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="font-pixel text-[8px] tracking-widest text-[#0a7d4a]">② 核验备份（端侧对账 · 不联网）</div>
              {backupRecords.length > 0 && <span className="font-pixel text-[7px] text-black/45 shrink-0">{backupRecords.length} 个备份文件</span>}
            </div>
            <div className="text-[10.5px] text-black/60 leading-relaxed">
              选 SSD 或网盘同步出来的备份文件夹，端侧按 文件名 / 大小 / SHA-256 / 感知哈希 对账。以前传过网盘的旧备份也能这样核，不用云端、不耗流量。
            </div>
            {backupStats.scanned && (
              <div className="grid grid-cols-3 gap-1.5">
                <div className="border border-black/30 bg-white px-2 py-1">
                  <div className="font-pixel text-[7px] text-black/45">已验证</div>
                  <div className="font-pixel text-[10px] text-[#0a7d4a]">{backupStats.verified}</div>
                </div>
                <div className="border border-black/30 bg-white px-2 py-1">
                  <div className="font-pixel text-[7px] text-black/45">疑似</div>
                  <div className="font-pixel text-[10px] text-[#c08a00]">{backupStats.suspected}</div>
                </div>
                <div className="border border-black/30 bg-white px-2 py-1">
                  <div className="font-pixel text-[7px] text-black/45">未找到</div>
                  <div className="font-pixel text-[10px] text-[#777]">{backupStats.missing}</div>
                </div>
              </div>
            )}
            {backupStats.verified > 0 && (
              <div className="border-2 border-[#0a7d4a] bg-[#EAF7EE] px-2 py-1.5 text-[11px] leading-snug">
                ✓ 已验证 {backupStats.verified} 个备份无误——删掉原片可腾出约 <b className="text-[#0a7d4a]">{formatBytes(backupStats.freeableBytes)}</b>
              </div>
            )}
            {backupBusy ? (
              <button
                onClick={() => { backupCancelRef.current = true; }}
                className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-[#fff0f0] px-2 py-1.5 text-[11px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px"
              >
                ■ 取消核验（保留已完成部分）
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => backupDirRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 border-2 border-black bg-white px-2 py-1.5 text-[11px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px"
                >
                  <FolderOpen className="w-3.5 h-3.5" strokeWidth={2.5} />
                  选备份文件夹
                </button>
                <button
                  onClick={() => backupFileRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 border-2 border-black bg-white px-2 py-1.5 text-[11px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px"
                >
                  <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
                  多选备份文件
                </button>
              </div>
            )}
            <div className="flex items-start gap-1.5 text-[10px] leading-relaxed text-black/45">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-[#c08a00]" strokeWidth={2.5} />
              <span>整夹选取需要 iOS 18.4+，更旧系统请用「多选备份文件」。只核验你选的位置、不扫整个盘；「疑似」永远不进可删清单。先跑下面的筛选再核验，转码过的照片也能按内容认出来。</span>
            </div>
            {backupStats.scanned && !backupBusy && (
              <button onClick={exportVerifyCsv} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white active:translate-y-px">导出核验清单 CSV</button>
            )}
            {backupMsg && <div className="text-[10.5px] text-[#0a7d4a] leading-relaxed">{backupMsg}</div>}
            {/* 视频不进筛选，核验完直接在这给结论（占空间大头，删对一个顶几十张照片） */}
            {videoFiles.length > 0 && (
              <div className="border-t border-black/15 pt-1.5 space-y-1">
                <div className="font-pixel text-[7px] text-black/45">视频 {videoFiles.length} 个（不进筛选，核验后看这里）</div>
                {!backupStats.scanned && (
                  <div className="text-[10px] text-black/45 leading-snug">提示：相册给网页的视频常被压缩转码，会核不上原件——想核视频，备份和本批都从「文件」App 选，或以名字/大小人工复核。</div>
                )}
                {backupStats.scanned && videoFiles.slice(0, 30).map((f) => {
                  const match = backupMatches[fileKey(f)];
                  const state = backupStateOf(fileKey(f), backupMatches);
                  const movedKey = match?.localHash || fileKey(f);
                  const movedDone = moved.has(movedKey);
                  return (
                    <div key={fileKey(f)} className={`flex items-center gap-1.5 text-[10.5px] ${movedDone ? 'opacity-45' : ''}`}>
                      <span className="font-pixel text-[7px] px-1.5 py-0.5 text-white shrink-0" style={{ background: movedDone ? '#5a5a5a' : backupBadgeColor(state) }}>
                        {movedDone ? '已删 ✓' : backupLabel(state)}
                      </span>
                      <span className="truncate flex-1 text-black/65">{f.name}</span>
                      <span className="text-black/40 shrink-0">{formatBytes(f.size)}</span>
                      {isStrongBackupState(state) && (
                        <button onClick={() => toggleMoved(movedKey)} className={`font-pixel text-[7px] border border-black px-1 py-0.5 shrink-0 active:translate-y-px ${movedDone ? 'bg-[#5a5a5a] text-white' : 'bg-[#EAF7EE]'}`}>
                          {movedDone ? '撤销' : '已删'}
                        </button>
                      )}
                    </div>
                  );
                })}
                {backupStats.scanned && videoFiles.length > 30 && <div className="text-[10px] text-black/40">…还有 {videoFiles.length - 30} 个，全量见「导出核验清单 CSV」</div>}
              </div>
            )}
          </div>

          <div className="text-[10px] text-black/50 leading-relaxed">
            ③ 核验后，下方筛选结果每张会挂「可删原片 / 建议保留 / 先别删」徽章；在照片 App 删完点「已删记账」，Pocket Earth 帮你记住哪些处理过了。
          </div>
          <input
            ref={(el) => { backupDirRef.current = el; el?.setAttribute('webkitdirectory', ''); }}
            type="file" multiple className="hidden" onChange={onPickBackupDir}
          />
        </div>
      )}

      {/* 进度 */}
      {running && (
        <div className="px-3 py-3 bg-[#EAEAEA] border-b-2 border-black">
          <div className="font-pixel text-[8px] tracking-widest text-black/55 mb-1.5">{progress.phase} · {progress.done}/{progress.total}</div>
          <div className="h-3 border-2 border-black bg-white overflow-hidden">
            <div className="h-full bg-[#00ff88] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total * 100) : 0}%` }} />
          </div>
        </div>
      )}

      {runId && <div className="m-3"><RunTrace runId={runId} /></div>}

      {err && <div className="m-3 border-2 border-[#d23b3b] bg-[#fff0f0] text-[#a02020] text-[11px] p-2.5 leading-relaxed">{err}</div>}

      {/* 结果 */}
      {results.length > 0 && !running && (
        <>
          <div className="px-4 py-2.5 border-b-2 border-black bg-black text-[#00ff88]">
            <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
              <span>留 {stats.keep}</span><span className="opacity-40">|</span>
              <span>待定 {stats.review}</span><span className="opacity-40">|</span>
              <span>清 {stats.clean}</span><span className="opacity-40">|</span>
              <span>资料 {stats.utility}</span><span className="opacity-40">|</span>
              <span>待补 {stats.needplace}</span>
            </div>
          </div>

          <div className="px-3 py-2.5 border-b-2 border-black bg-[#f6fbff]">
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <div className="font-pixel text-[7px] tracking-widest text-[#0a6f91]">备份 × 保留 · 敢删清单</div>
              <div className="flex gap-1 shrink-0">
                {migrationStats.deletable > 0 && (
                  <button onClick={() => setFilter('deletable')} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white active:translate-y-px">
                    看可删 {migrationStats.deletable} 张{migrationStats.moved ? ` · 已删 ${migrationStats.moved}` : ''}
                  </button>
                )}
                {migrationStats.deletable > migrationStats.moved && (
                  <button onClick={markAllMoved} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-[#EAF7EE] active:translate-y-px">
                    全部记已删
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="border border-black/30 bg-white px-2 py-1">
                <div className="font-pixel text-[7px] text-black/45">已备份 + 建议保留</div>
                <div className="font-pixel text-[10px] text-[#0a7d4a]">{migrationStats.backedKeep}</div>
              </div>
              <div className="border border-black/30 bg-white px-2 py-1">
                <div className="font-pixel text-[7px] text-black/45">已备份 + 可清理</div>
                <div className="font-pixel text-[10px] text-[#d23b3b]">{migrationStats.backedClean}</div>
              </div>
              <div className="border border-black/30 bg-white px-2 py-1">
                <div className="font-pixel text-[7px] text-black/45">未验证 + 建议保留</div>
                <div className="font-pixel text-[10px] text-[#7a5a1f]">{migrationStats.notBackedKeep}</div>
              </div>
              <div className="border border-black/30 bg-white px-2 py-1">
                <div className="font-pixel text-[7px] text-black/45">未验证 + 可清理</div>
                <div className="font-pixel text-[10px] text-[#777]">{migrationStats.notBackedClean}</div>
              </div>
            </div>
            <div className="text-[10px] text-black/50 leading-relaxed mt-1.5">
              {backupStats.scanned
                ? <>只有「hash/内容已验证」的进可删清单；疑似 {migrationStats.suspected} 张先复核。其中 {migrationStats.backedPocket} 张可直接加入 Pocket Earth 地球。在照片 App 删完后，点卡片上的「已删记账」。</>
                : <>还没核验备份——先在上方「② 核验备份」里选 SSD/网盘的备份位置，这里才会亮起可删清单。</>}
            </div>
          </div>

          {/* 按日期搬家清单：桥接「筛选结果 → 照片App按天圈选」这步网页替不了的手工活 */}
          {moveDigest.length > 0 && (
            <div className="px-3 py-2.5 border-b-2 border-black bg-white">
              <details open={moveDigest.length <= 3}>
                <summary className="font-pixel text-[7px] tracking-widest text-[#0a6f91] cursor-pointer select-none">
                  按日期搬家清单 · {moveDigest.length} 天（回照片App照着选）
                </summary>
                <div className="mt-1.5 space-y-1">
                  {moveDigest.slice(0, 14).map(([day, g]) => (
                    <div key={day} className="text-[10.5px] text-black/65 leading-snug flex gap-1.5">
                      <span className="font-pixel text-[7px] text-black/40 shrink-0 mt-0.5">{day}</span>
                      <span>
                        共 {g.total} 张 → 搬走 <b>{g.total - g.keeps.length}</b>
                        {g.keeps.length > 0 && <> · 留手机 <b>{g.keeps.length}</b>（{g.keeps.slice(0, 3).join('、')}{g.keeps.length > 3 ? ` 等${g.keeps.length}张` : ''}）</>}
                      </span>
                    </div>
                  ))}
                  {moveDigest.length > 14 && <div className="text-[10px] text-black/40">…还有 {moveDigest.length - 14} 天，导出核验清单 CSV 里有全量</div>}
                  <div className="text-[10px] text-black/40 leading-snug">用法：照片App里按这天全选 → 加入相册「搬去SSD」→ 把「留手机」那几张移出去 → 跑快捷指令。</div>
                </div>
              </details>
            </div>
          )}

          {/* 反思记忆：从你历次纠正里凝练的经验（仅展示；判定由端侧纠错统计的软偏置驱动） */}
          {lessons.length > 0 && (
            <div className="px-3 py-2.5 border-b-2 border-black bg-[#FFF8E6]">
              <div className="font-pixel text-[7px] tracking-widest text-[#7a5a1f] mb-1.5 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-[#c08a00]" strokeWidth={2.5} /> 我从你的纠正里学到的（越用越懂你）
              </div>
              <ul className="space-y-1">
                {lessons.map((t, i) => (
                  <li key={i} className="text-[10.5px] text-[#5a4510] leading-snug flex gap-1.5">
                    <span className="text-[#c08a00] shrink-0">·</span><span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 钉到地球：只钉实拍·有真坐标·簇代表 */}
          <div className="px-3 py-2.5 border-b-2 border-black bg-[#EAF7EE]">
            <button onClick={pinAll} disabled={!stats.pin || pinned}
              className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-[#0a7d4a] text-white px-2 py-2 text-[12px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-40">
              <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} />
              {pinned ? `✓ 已钉 ${stats.pin} 张到地球` : stats.pin ? `▶ 把 ${stats.pin} 张地方照片钉到地球` : '没有可钉的照片（需实拍且带坐标）'}
            </button>
            {!!stats.needplace && <div className="text-[10px] text-[#7a5a1f] mt-1.5 leading-snug">另有 {stats.needplace} 张实拍但没坐标，归到「待补地点」，以后补地名再钉。</div>}
          </div>

          <div className="px-3 py-2 border-b-2 border-black bg-white">
            <div className="grid grid-cols-7 border-2 border-black bg-[#EAEAEA] p-0.5 gap-0.5">
              {([['all', '全部'], ['keep', '留'], ['review', '待定'], ['clean', '清'], ['utility', '资料'], ['needplace', '待补'], ['deletable', '可删']] as [Filter, string][]).map(([f, label]) => (
                <button key={f} onClick={() => setFilter(f)} className={`py-1 text-[10px] font-bold ${filter === f ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="px-3 py-3 space-y-2.5">
            {shown.map((r) => {
              const backupState = backupStateOf(resultKey(r), backupMatches);
              const movedDone = moved.has(r.id);
              return (
                <div key={r.uid} className={`flex gap-2.5 border-2 border-black bg-white p-2 shadow-[2px_2px_0_rgba(0,0,0,0.85)] ${movedDone ? 'opacity-45' : r.verdict === 'clean' ? 'opacity-60' : ''}`}>
                  <div className="w-16 h-16 shrink-0 bg-[#d8d8d6] border border-black/40 overflow-hidden relative">
                    <img src={r.url} alt="" loading="lazy" className={`w-full h-full object-cover ${r.verdict === 'keep' ? '' : 'grayscale-[.4]'}`} />
                    <span className="absolute top-0 left-0 font-pixel text-[8px] text-white bg-black/70 px-1 leading-tight">{r.valueScore}</span>
                    {r.pinnable && <span className="absolute bottom-0 right-0 bg-[#0a7d4a] text-white px-0.5 py-px leading-none"><MapPin className="w-2.5 h-2.5" strokeWidth={3} /></span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-pixel text-[7px] px-1.5 py-0.5 text-white" style={{ background: TYPE_COLOR[r.photoType] }}>{TYPE_LABEL[r.photoType]}</span>
                      <span className="font-pixel text-[7px] px-1.5 py-0.5 text-white" style={{ background: RV_COLOR[r.verdict] }}>{RV_LABEL[r.verdict]}</span>
                      <span className="font-pixel text-[7px] px-1.5 py-0.5 text-white" style={{ background: movedDone ? '#5a5a5a' : backupBadgeColor(backupState) }}>{actionLabel(r, backupState, movedDone)}</span>
                      {backupState !== 'none' && !movedDone && <span className="font-pixel text-[7px] px-1.5 py-0.5 border border-black/30 bg-white text-black/55">{backupLabel(backupState)}</span>}
                      <span className="text-[11px] text-black/55 truncate">{dateStr(r.date)} · {r.w}×{r.h}</span>
                    </div>
                    {!!r.tags.length && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.tags.map((t, i) => (<span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 text-black/60 bg-[#EAEAEA]">{t}</span>))}
                      </div>
                    )}
                    <div className="text-[10px] text-black/45 mt-1 leading-snug">{r.reason}</div>
                    {r.dupOf && <div className="text-[10px] text-[#d23b3b] mt-0.5">与已保留的某张重复 · 建议清理（不删原图）</div>}
                    {/* 纠错：点一下越用越准，并对同图永久记住 */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {isUtil(r.photoType)
                        ? <button onClick={() => correct(r, 'place')} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-[#EAF7EE] active:translate-y-px">其实是实拍</button>
                        : <button onClick={() => correct(r, 'utility')} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-[#f1f1f1] active:translate-y-px">其实是资料</button>}
                      {r.verdict !== 'keep' && <button onClick={() => correct(r, 'keep')} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white active:translate-y-px">留</button>}
                      {r.verdict !== 'clean' && <button onClick={() => correct(r, 'clean')} className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white active:translate-y-px">清理</button>}
                      {isStrongBackupState(backupState) && (
                        <button onClick={() => toggleMoved(r.id)} className={`font-pixel text-[7px] border border-black px-1.5 py-0.5 active:translate-y-px ${movedDone ? 'bg-[#5a5a5a] text-white' : 'bg-[#EAF7EE]'}`}>
                          {movedDone ? '↩ 撤销已删' : '✓ 已删记账'}
                        </button>
                      )}
                      {r.userOverride && <span className="font-pixel text-[7px] px-1 py-0.5 text-[#0a7d4a]">✓ 已按你的纠正</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 空态引导 */}
      {!results.length && !running && !err && (
        <div className="px-4 py-8 text-center text-black/45 text-[12px] leading-relaxed">
          选一批你自己的照片/视频，设个时间段，点「开始筛选」。<br />
          照片端侧逐张看：清晰度、曝光、色彩、查重，挑出值得留的；<br />
          视频不进筛选，走上方「核验备份 → 可删结论」通道。<br />
          <span className="font-pixel text-[8px] text-black/35 tracking-wide">原图不出手机 · iOS 上点选即从系统相册多选</span>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── 外壳 ─────────────────────────
export default function PhotosAgentRunPage({ onBack }: Props) {
  const [mode, setMode] = useState<'real' | 'demo'>('real');
  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans relative overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">PHOTOS-AGENT</div>
          <div className="text-[9px] text-black/45 truncate">端侧整理 · 原图不出手机</div>
        </div>
        <div className="flex border-2 border-black bg-[#EAEAEA] p-0.5 shrink-0">
          <button onClick={() => setMode('real')} className={`px-2 py-1 text-[9px] font-bold ${mode === 'real' ? 'bg-black text-[#7CFF6B]' : 'text-black'}`}>我的照片</button>
          <button onClick={() => setMode('demo')} className={`px-2 py-1 text-[9px] font-bold ${mode === 'demo' ? 'bg-black text-[#7CFF6B]' : 'text-black'}`}>示例</button>
        </div>
      </div>
      {mode === 'real' ? <RealView /> : <DemoView />}
    </div>
  );
}
