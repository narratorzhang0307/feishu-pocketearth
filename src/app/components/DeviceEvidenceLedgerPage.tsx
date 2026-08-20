import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, Check, ChevronDown, Database, FileArchive, FilePlus2, ShieldCheck, Trash2 } from 'lucide-react';
import { getEdgeEvidenceArtifacts, getEdgeRuntimeStatus } from '../../../frost-agent/edge/httpEdge';
import type { EdgeResponse } from '../../../frost-agent/edge/types';
import { isNativeMnnPlatform } from '../../../frost-agent/edge/capacitorMnnEdge';
import {
  buildEvidenceExport, clearDeviceEvidence, improvementPercent, nextFormalLeg,
  readDeviceEvidence, readFormalSamples, readFormalSuites, sha256Text, summarizeSamples,
  type DeviceBenchmarkSample, type DeviceEvidenceRecord, type FormalEvidenceSuite,
} from '../lib/deviceEvidence';
import {
  DEVICE_LEDGER_EVENT, DEVICE_LEDGER_PROTOCOL, clearLedgerForDevice, ensureCurrentDevice, freshArtifact,
  readLedger, saveTestArtifact,
  type DeviceEvidenceDevice, type DeviceTestArtifact, type LedgerSnapshot,
} from '../lib/deviceEvidenceLedger';
import {
  MNN_LEDGER_EVENT, clearMnnEvidence, readMnnSamples, readMnnSuites,
  type MnnEvidenceSuite,
} from '../lib/mnnDeviceEvidence';
import MnnEvidencePanel from './MnnEvidencePanel';

const ACCENT = '#79bed0';
const SME = '#d89a3d';
const EMPTY: LedgerSnapshot = { devices: [], artifacts: [] };
const SCENARIO_LABELS: Record<string, string> = {
  'fixed-text': '固定文本探针', 'long-context': '长上下文 Prefill', vision: 'Qwen-VL 固定视觉', 'ocr-lora': '碑拓 OCR / LoRA',
};

const SUITE_STATE: Record<FormalEvidenceSuite['state'], { label: string; color: string }> = {
  created: { label: '未开始', color: '#777' }, running: { label: '进行中', color: '#1665c1' }, paused: { label: '已中断 · 可续跑', color: '#a76100' },
  invalid: { label: '无效 · 需重测', color: '#bd1e45' }, completed: { label: '已完成', color: '#087c49' }, exported: { label: '已完成并导出', color: '#087c49' },
};

const fixed = (value: number | undefined, digits = 1): string => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
const humanBytes = (value: number): string => value > 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(value / 1024))} KB`;

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fileSha256(file: File): Promise<string | undefined> {
  if (!crypto.subtle) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function artifactKind(file: File): DeviceTestArtifact['kind'] {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) return 'json';
  if (name.includes('logcat') || name.endsWith('.log') || name.endsWith('.txt')) return 'logcat';
  if (name.endsWith('.perfetto-trace') || name.endsWith('.trace') || name.endsWith('.ctrace')) return 'perfetto';
  if (file.type.startsWith('image/')) return 'screenshot';
  return 'other';
}

function SuiteCard({ suite, samples }: { suite: FormalEvidenceSuite; samples: DeviceBenchmarkSample[] }) {
  const state = SUITE_STATE[suite.state];
  const next = nextFormalLeg(suite);
  const measuredA = samples.filter((sample) => !sample.warmup && sample.mode === 'A');
  const measuredB = samples.filter((sample) => !sample.warmup && sample.mode === 'B');
  const summaryA = summarizeSamples(measuredA); const summaryB = summarizeSamples(measuredB);
  const percent = Math.min(100, Math.round(suite.counts.total / 56 * 100));
  return <details className="border-2 border-black bg-white" open={suite.state === 'paused' || suite.state === 'invalid'}>
    <summary className="flex cursor-pointer list-none items-center gap-2 p-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center border-2 border-black bg-[#f7e1b7] text-center font-pixel text-[6px] leading-tight">A20<br />B20</div>
      <div className="min-w-0 flex-1"><div className="text-[10px] font-black">{SCENARIO_LABELS[suite.scenario ?? 'fixed-text']} · ABBA×2</div><div className="mt-0.5 truncate text-[8px] text-black/45">{new Date(suite.createdAt).toLocaleString()} · {percent}% · {suite.fingerprint.device || '设备待识别'}</div></div>
      <span className="shrink-0 border border-black px-1.5 py-1 text-[7px] font-bold" style={{ color: state.color }}>{state.label}</span><ChevronDown className="h-3.5 w-3.5" />
    </summary>
    <div className="space-y-2 border-t-2 border-black p-2.5">
      <div className="h-2 overflow-hidden border border-black bg-[#e5e5e5]"><div className="h-full" style={{ width: `${percent}%`, background: suite.state === 'invalid' ? '#bd1e45' : ACCENT }} /></div>
      <div className="grid grid-cols-3 gap-1 text-center text-[8px]"><div className="border border-black/20 p-1.5"><span className="text-black/45">A · SME2 OFF</span><b className="mt-0.5 block font-mono">{suite.counts.measuredA}/20</b></div><div className="border border-black/20 p-1.5"><span className="text-black/45">B · SME2 ON</span><b className="mt-0.5 block font-mono">{suite.counts.measuredB}/20</b></div><div className="border border-black/20 p-1.5"><span className="text-black/45">下一步</span><b className="mt-0.5 block">{next ? `PAIR ${next.pair.index + 1} · ${next.leg.mode}` : '已完成'}</b></div></div>
      <div className="grid grid-cols-2 gap-1 text-[8px] sm:grid-cols-4"><div className="border border-black/20 p-1.5"><span className="text-black/45">总耗时 P50</span><b className="block font-mono">{fixed(summaryA.elapsedMs?.p50, 0)} → {fixed(summaryB.elapsedMs?.p50, 0)} ms</b></div><div className="border border-black/20 p-1.5"><span className="text-black/45">TTFA P50</span><b className="block font-mono">{fixed(summaryA.ttfaMs?.p50, 0)} → {fixed(summaryB.ttfaMs?.p50, 0)} ms</b></div><div className="border border-black/20 p-1.5"><span className="text-black/45">Decode P50</span><b className="block font-mono">{fixed(summaryA.decodeTokensPerSecond?.p50)} → {fixed(summaryB.decodeTokensPerSecond?.p50)}</b></div><div className="border border-black/20 p-1.5"><span className="text-black/45">耗时改善</span><b className="block font-mono">{fixed(improvementPercent(summaryA.elapsedMs, summaryB.elapsedMs) ?? undefined)}%</b></div></div>
      <div className="grid grid-cols-2 gap-1 text-[8px]"><div className="border border-black/20 p-1.5"><span className="text-black/45">APK</span><b className="block font-mono">{suite.fingerprint.appVersionName || '—'} ({suite.fingerprint.appVersionCode || '—'})</b></div><div className="border border-black/20 p-1.5"><span className="text-black/45">MNN / ABI</span><b className="block font-mono">{suite.fingerprint.mnnVersion || '—'} · {suite.fingerprint.abi || '—'}</b></div></div>
      {!!suite.invalidations.length && <div className="border-2 border-[#bd1e45] bg-[#fff0f3] p-2 text-[8px] text-[#9b1637]">{suite.invalidations.map((item) => <div key={`${item.at}-${item.reason}`}>✕ {item.reason} · {new Date(item.at).toLocaleTimeString()}</div>)}</div>}
      <details className="border border-black/25 bg-[#f5f5f5]"><summary className="cursor-pointer p-2 text-[8px] font-bold">原始样本 {samples.length} 条 · 每条已单独事务提交</summary><div className="max-h-64 overflow-auto border-t border-black/20"><table className="w-full min-w-[740px] border-collapse font-mono text-[7px]"><thead className="sticky top-0 bg-black text-white"><tr><th>PAIR</th><th>LEG</th><th>MODE</th><th>类型</th><th>QUALITY</th><th>总 ms</th><th>Load</th><th>TTFA</th><th>Prefill</th><th>Decode</th><th>tok/s</th><th>PSS</th><th>温度</th><th>TARGET</th><th>OUTPUT SHA</th></tr></thead><tbody>{samples.map((sample) => <tr key={sample.id || `${sample.pairId}-${sample.legIndex}-${sample.warmup}-${sample.index}`} className="border-b border-black/10 text-center"><td>{suite.pairs.find((pair) => pair.id === sample.pairId)?.index !== undefined ? (suite.pairs.find((pair) => pair.id === sample.pairId)!.index + 1) : '—'}</td><td>{(sample.legIndex ?? 0) + 1}</td><td>{sample.mode}</td><td>{sample.warmup ? '预热' : '计入'}</td><td>{sample.ok && sample.qualityGatePassed && !sample.invalidReason ? '✓' : '✕'}</td><td>{fixed(sample.stats?.elapsedMs, 0)}</td><td>{fixed(sample.stats?.modelLoadMs, 0)}</td><td>{fixed(sample.stats?.ttfaMs, 0)}</td><td>{fixed(sample.stats?.prefillMs, 0)}</td><td>{fixed(sample.stats?.decodeMs, 0)}</td><td>{fixed(sample.stats?.decodeTokensPerSecond)}</td><td>{fixed(sample.stats?.appPssMb)}</td><td>{fixed(sample.stats?.batteryTemperatureC)}℃</td><td>{sample.runtime?.cpuTarget ?? sample.stats?.cpuTarget ?? '—'}</td><td title={sample.normalizedOutputSha256}>{sample.normalizedOutputSha256?.slice(0, 8) || '—'}</td></tr>)}</tbody></table></div></details>
    </div>
  </details>;
}

export default function DeviceEvidenceLedgerPage({ onBack }: { onBack: () => void }) {
  const native = isNativeMnnPlatform();
  const [activeTab, setActiveTab] = useState<'mnn' | 'sme2'>('mnn');
  const [runtime, setRuntime] = useState<EdgeResponse | null>(null);
  const [device, setDevice] = useState<DeviceEvidenceDevice | null>(null);
  const [ledger, setLedger] = useState<LedgerSnapshot>(EMPTY);
  const [records, setRecords] = useState<DeviceEvidenceRecord[]>([]);
  const [formalSuites, setFormalSuites] = useState<FormalEvidenceSuite[]>([]);
  const [mnnSuites, setMnnSuites] = useState<MnnEvidenceSuite[]>([]);
  const [samplesBySuite, setSamplesBySuite] = useState<Record<string, DeviceBenchmarkSample[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clearArmed, setClearArmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextRuntime, nextRecords, nextSuites, nextMnnSuites] = await Promise.all([getEdgeRuntimeStatus(), readDeviceEvidence(), readFormalSuites(), readMnnSuites()]);
      const current = await ensureCurrentDevice(nextRuntime.runtime);
      const sampleEntries = await Promise.all(nextSuites.map(async (suite) => [suite.id, await readFormalSamples(suite.id)] as const));
      setRuntime(nextRuntime); setDevice(current); setRecords(nextRecords); setFormalSuites(nextSuites); setMnnSuites(nextMnnSuites);
      setSamplesBySuite(Object.fromEntries(sampleEntries)); setLedger(await readLedger(current.id));
    } catch (reason) { setError(String(reason)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const listener = () => void refresh();
    window.addEventListener(DEVICE_LEDGER_EVENT, listener); window.addEventListener(MNN_LEDGER_EVENT, listener);
    return () => { window.removeEventListener(DEVICE_LEDGER_EVENT, listener); window.removeEventListener(MNN_LEDGER_EVENT, listener); };
  }, [refresh]);

  const incomplete = formalSuites.filter((suite) => !['completed', 'exported', 'invalid'].includes(suite.state));
  const valid = formalSuites.filter((suite) => ['completed', 'exported'].includes(suite.state)).length;
  const sampleCount = useMemo(() => Object.values(samplesBySuite).reduce((sum, samples) => sum + samples.length, 0), [samplesBySuite]);

  const addArtifacts = async (files: FileList | null) => {
    if (!device || !files?.length) return;
    try { for (const file of Array.from(files)) await saveTestArtifact(freshArtifact(device.id, file, artifactKind(file), await fileSha256(file), formalSuites[0]?.id)); await refresh(); }
    catch (reason) { setError(String(reason)); }
  };

  const exportBundle = async () => {
    if (!device) return;
    const nativeArtifacts = native ? await getEdgeEvidenceArtifacts() : undefined;
    const JSZip = (await import('jszip')).default; const zip = new JSZip();
    const cleanArtifacts = ledger.artifacts.map(({ blob: _blob, ...artifact }) => artifact);
    const formalSamples = Object.values(samplesBySuite).flat();
    const mnnSamples = (await Promise.all(mnnSuites.map((suite) => readMnnSamples(suite.id)))).flat();
    const manifest: Array<{ name: string; bytes: number; sha256: string }> = [];
    const addText = async (name: string, value: unknown) => { const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2); zip.file(name, text); manifest.push({ name, bytes: new TextEncoder().encode(text).byteLength, sha256: await sha256Text(text) }); };
    await addText('device.json', { protocol: DEVICE_LEDGER_PROTOCOL, exportedAt: new Date().toISOString(), device, runtime: runtime?.runtime });
    await addText('formal-suites.json', formalSuites); await addText('formal-raw-samples.json', formalSamples);
    await addText('mnn-suites.json', mnnSuites); await addText('mnn-raw-samples.json', mnnSamples);
    await addText('configuration-records.json', buildEvidenceExport(records, runtime?.runtime));
    await addText('artifact-index.json', cleanArtifacts); await addText('native-logcat.txt', nativeArtifacts?.logcat?.text || '');
    await addText('native-perfetto.json', nativeArtifacts?.perfetto || { compatible: false, systemTraceCaptured: false, reason: 'not_android_native' });
    ledger.artifacts.forEach((artifact) => { if (artifact.blob) zip.file(`artifacts/${artifact.id}-${artifact.name}`, artifact.blob); });
    zip.file('manifest.json', JSON.stringify({ protocol: 'pocket-evidence-bundle/v1', files: manifest }, null, 2));
    download(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), `pocket-earth-sme2-ledger-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
  };

  const clearAll = async () => {
    if (!device) return;
    if (!clearArmed) { setClearArmed(true); window.setTimeout(() => setClearArmed(false), 5000); return; }
    await Promise.all([clearDeviceEvidence(), clearMnnEvidence(), clearLedgerForDevice(device.id)]); setClearArmed(false); await refresh();
  };

  const hasMnnOffEvidence = records.some((record) => record.groups?.some((group) => !group.mnnEnabled));
  const completedScenarios = new Set(formalSuites.filter((suite) => ['completed', 'exported'].includes(suite.state)).map((suite) => suite.scenario ?? 'fixed-text'));
  const mnnPassed = (id: keyof MnnEvidenceSuite['checks']): boolean => mnnSuites.some((suite) => suite.checks[id]?.state === 'passed');
  const matrix = [
    { title: 'Runtime Capability', detail: '硬件 SME2、ABI、MNN 版本与原生桥接', done: runtime?.runtime?.nativeBridge === true },
    { title: 'MNN OFF / 离线路由', detail: 'OFF 时明确回退，ON 时飞行模式 decode', done: hasMnnOffEvidence || (mnnPassed('mnnOff') && mnnPassed('offlineText')) },
    { title: 'SME2 固定探针 ABBA', detail: '同机、同版本、同 Input SHA 的 target 2/3 对照', done: completedScenarios.has('fixed-text'), active: incomplete.some((suite) => (suite.scenario ?? 'fixed-text') === 'fixed-text') },
    { title: 'SME2 长上下文', detail: '长文本 prefill 与首 Token 加速', done: completedScenarios.has('long-context'), active: incomplete.some((suite) => suite.scenario === 'long-context') },
    { title: 'SME2 视觉理解', detail: '固定照片 + Qwen3-VL 质量与性能', done: completedScenarios.has('vision'), active: incomplete.some((suite) => suite.scenario === 'vision') },
    { title: 'SME2 OCR / LoRA', detail: '固定碑拓难例与已安装 Adapter 质量门禁', done: completedScenarios.has('ocr-lora'), active: incomplete.some((suite) => suite.scenario === 'ocr-lora') },
    { title: '10 分钟稳定性', detail: '内存、温升、降频和性能衰减', done: mnnPassed('stability10m') },
    { title: 'ON → OFF 回切', detail: 'Session 释放与 CPU dispatch 重建', done: records.some((record) => record.kind === 'configuration' && record.note.includes('SME2 OFF')) || mnnPassed('mnnOff') },
  ];

  return <div className="h-full overflow-y-auto bg-[#eaeaea] text-black"><header className="sticky top-0 z-20 flex items-center gap-2 border-b-2 border-black bg-white px-3 py-2"><button type="button" aria-label="返回验收台" onClick={onBack} className="grid h-8 w-8 place-items-center border-2 border-black"><ArrowLeft className="h-4 w-4" /></button><div className="min-w-0 flex-1"><h1 className="font-pixel text-[12px] tracking-wider">真机验收账本</h1><p className="truncate text-[8px] text-black/45">MNN 端侧闭环 · SME2 同机 A/B · 原始样本逐条落盘</p></div><Database className="h-5 w-5" style={{ color: ACCENT }} /></header>
    <nav className="sticky top-[50px] z-10 grid grid-cols-2 border-b-2 border-black bg-white p-2"><button type="button" onClick={() => setActiveTab('mnn')} className={`border-2 border-black px-2 py-2 font-pixel text-[8px] ${activeTab === 'mnn' ? 'bg-black text-[#9bd4e0]' : 'bg-white text-black'}`}>MNN 端侧验收</button><button type="button" onClick={() => setActiveTab('sme2')} className={`border-y-2 border-r-2 border-black px-2 py-2 font-pixel text-[8px] ${activeTab === 'sme2' ? 'bg-black text-[#f0bd6c]' : 'bg-white text-black'}`}>SME2 A/B</button></nav>
    {activeTab === 'mnn' ? <MnnEvidencePanel native={native} device={device} externalArtifacts={ledger.artifacts} /> : <main className="space-y-3 p-3 pb-24">
      <section className="border-[3px] border-black bg-white p-3"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center border-2 border-black bg-[#dceff3]"><ShieldCheck className="h-6 w-6" style={{ color: '#245c68' }} /></div><div className="min-w-0 flex-1"><div className="font-pixel text-[10px]">{device?.manufacturer || '当前'} · {device?.model || '设备待识别'}</div><div className="mt-1 text-[8px] text-black/50">Android {device?.android || '—'} · {device?.abi || '—'} · MNN {device?.mnnVersion || '—'}</div><div className="mt-1 truncate font-mono text-[7px] text-black/30">DEVICE ID {device?.id || '—'}</div></div><span className={`border-2 border-black px-1.5 py-1 text-[7px] font-black ${device?.hardwareSme2 ? 'bg-[#f7e1b7] text-[#7a4a00]' : native ? 'bg-[#fff1c7] text-[#7a5100]' : 'bg-[#ededed] text-black/50'}`}>{device?.hardwareSme2 ? 'SME2 HARDWARE' : native ? 'NO SME2' : 'WEB PREVIEW ONLY'}</span></div><div className="mt-2 border-2 border-black bg-[#f6f1e5] px-2 py-1.5 text-[8px] leading-snug text-black/55">{native ? '当前为 Android 原生环境；安装模型后测试会进入 MNN JNI 真实推理。' : '网页只预览账本布局；不运行 MNN，也不会生成真机成绩。'}</div><div className="mt-2 grid grid-cols-4 gap-1.5 text-center"><div className="border-2 border-black bg-[#f6f1e5] p-1.5"><b className="block font-mono text-sm">8</b><span className="text-[7px] text-black/45">验收项</span></div><div className="border-2 border-black bg-[#e8f8ef] p-1.5"><b className="block font-mono text-sm text-[#087c49]">{valid}</b><span className="text-[7px] text-black/45">完成</span></div><div className="border-2 border-black bg-[#fff1c7] p-1.5"><b className="block font-mono text-sm text-[#7a5100]">{incomplete.length}</b><span className="text-[7px] text-black/45">待续跑</span></div><div className="border-2 border-black bg-white p-1.5"><b className="block font-mono text-sm">{sampleCount}</b><span className="text-[7px] text-black/45">样本</span></div></div></section>
      <section className="border-2 border-black bg-[#fff8e6] p-2.5 text-[9px] leading-relaxed"><b>正式规则：</b>OFF→ON→ON→OFF 跑两轮，每块 2 次预热 + 5 次计入；A/B 各 20 次。每完成一个 sample 就独立事务提交，锁屏、崩溃或退出后可从下一条继续。<button type="button" onClick={onBack} className="ml-2 border border-black bg-black px-2 py-1 text-[8px] font-bold text-white">回验收台开始 / 继续</button></section>
      {error && <div className="flex items-start gap-2 border-2 border-[#bd1e45] bg-[#fff0f3] p-2.5 text-[9px] text-[#9b1637]"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      <section><div className="mb-2 flex items-end justify-between"><h2 className="font-pixel text-[10px]">验收待办矩阵</h2><span className="text-[7px] text-black/40">自动告诉测试者下一步</span></div><div className="border-2 border-black bg-white">{matrix.map((item, index) => <div key={item.title} className={`flex items-center gap-2 p-2.5 ${index ? 'border-t-2 border-black' : ''}`}><span className="font-pixel text-[7px] text-black/35">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><b className="block text-[9px]">{item.title}</b><span className="block text-[7px] text-black/45">{item.detail}</span></div>{item.done ? <span className="flex items-center gap-1 text-[7px] font-bold text-[#087c49]"><Check className="h-3 w-3" />已验证</span> : item.active ? <span className="text-[7px] font-bold text-[#a76100]">续跑中</span> : <span className="text-[7px] text-black/35">未开始</span>}</div>)}</div></section>
      <section className="space-y-2"><div className="flex items-end justify-between"><h2 className="font-pixel text-[10px]">A/B 完整记录</h2><span className="text-[7px] text-black/40">{formalSuites.length} 份</span></div>{loading && <div className="border-2 border-black bg-white p-6 text-center text-[9px]">读取本机数据库…</div>}{!loading && !formalSuites.length && <div className="border-2 border-dashed border-black/35 bg-white p-6 text-center text-[9px] text-black/40">还没有正式 suite。回验收台启动后，第一个样本会立即出现。</div>}{formalSuites.map((suite) => <SuiteCard key={suite.id} suite={suite} samples={samplesBySuite[suite.id] || []} />)}</section>
      <section className="border-[3px] border-black bg-white p-2.5"><div className="flex items-center gap-2"><FileArchive className="h-4 w-4" /><h2 className="font-pixel text-[9px]">外部证据原件</h2><span className="ml-auto text-[7px] text-black/40">{ledger.artifacts.length} 件</span></div><p className="mt-1 text-[8px] text-black/45">Perfetto、logcat、APK 哈希文件和截图原件保存在本机，导出时与原始 samples 一起打包。</p><div className="mt-2 flex flex-wrap gap-1.5"><input ref={fileRef} type="file" multiple className="hidden" onChange={(event) => void addArtifacts(event.target.files)} /><button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 border-2 border-black px-2 py-1.5 text-[8px] font-bold"><FilePlus2 className="h-3 w-3" />添加 logcat / Perfetto</button><button type="button" onClick={() => void exportBundle()} disabled={!device} className="flex items-center gap-1 border-2 border-black bg-black px-2 py-1.5 text-[8px] font-bold text-white disabled:opacity-30"><FileArchive className="h-3 w-3" />导出完整 ZIP</button></div>{ledger.artifacts.map((artifact) => <div key={artifact.id} className="mt-1.5 flex items-center gap-2 border border-black/20 bg-[#f4f4f4] p-1.5 text-[8px]"><b>{artifact.kind.toUpperCase()}</b><span className="min-w-0 flex-1 truncate">{artifact.name}</span><span className="text-black/35">{humanBytes(artifact.size)}</span>{artifact.blob && <button type="button" onClick={() => download(artifact.blob!, artifact.name)} className="font-bold underline">下载</button>}</div>)}</section>
      <section className="border-2 border-black bg-[#f3f3f3] p-2.5"><div className="flex items-center gap-2"><Activity className="h-4 w-4" style={{ color: SME }} /><b className="text-[9px]">持久与边界</b></div><p className="mt-1 text-[8px] leading-relaxed text-black/50">同一手机更新 APK 后账本仍在；不同手机各有自己的 IndexedDB。清空 App 数据或卸载会删除账本，正式测试后请立即导出 ZIP。不自动把不同版本、设备、Input SHA 的 OFF/ON 拼成一对。</p><button type="button" onClick={() => void clearAll()} disabled={!device} className="mt-2 flex items-center gap-1 border-2 border-black bg-white px-2 py-1.5 text-[8px] font-bold text-[#bd1e45] disabled:opacity-30"><Trash2 className="h-3 w-3" />{clearArmed ? '再点一次确认清空' : '清空这台手机的账本'}</button></section>
    </main>}</div>;
}
