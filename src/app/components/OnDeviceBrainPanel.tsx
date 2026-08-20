import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Check, ChevronDown, Cpu, Download, FileDown, Loader2, Square, Trash2, Zap } from 'lucide-react';
import {
  cancelEdgeAsset, configureEdgeRuntime, getEdgeAssets, getEdgeEvidenceArtifacts, getEdgeRuntimeStatus, installEdgeAsset, probeEdgeRuntime,
  runEdgeChatEvidence, runEdgeVisionEvidence,
} from '../../../frost-agent/edge/httpEdge';
import { isNativeMnnPlatform, subscribeNativeAssetProgress } from '../../../frost-agent/edge/capacitorMnnEdge';
import type { EdgeAssetId, EdgeAssetStatus, EdgeResponse } from '../../../frost-agent/edge/types';
import {
  DEVICE_EVIDENCE_PROTOCOL, appendDeviceEvidence, buildEvidenceExport, buildRuntimeFingerprint,
  clearDeviceEvidence, commitFormalSample, createFormalEvidenceSuite, formalOutputQualityGate, improvementPercent, markSuiteState,
  normalizeEvidenceOutput,
  nextFormalLeg, readDeviceEvidence, readFormalSamples, readFormalSuites, saveFormalSuite, sha256Text,
  summarizeSamples, validateFormalEnvironment, validateFormalSample,
  type DeviceBenchmarkGroup, type DeviceBenchmarkSample, type DeviceEvidenceRecord, type FormalEvidenceScenario, type FormalEvidenceSuite,
} from '../lib/deviceEvidence';

const ACCENT = '#79bed0';
const SME = '#d89a3d';
const BASE_ASSET: EdgeAssetId = 'qwen3-vl-2b-mnn';
const WARMUP_RUNS = 2;
const MEASURED_RUNS = 5;
const FORMAL_INPUT = 'runtime_probe:只回复 POCKET_MNN_READY';
const LONG_CONTEXT_MARKER = 'POCKET_LONG_CONTEXT_READY';
const LONG_CONTEXT_PROMPT = `${Array.from({ length: 96 }, (_, index) => `第${index + 1}段：Pocket Earth 把书籍、电影、音乐与城市地点组织成可装卸的数据层；端侧 Qwen 负责理解与选择，确定性工具负责校验、排序和落图。`).join('\n')}\n\n请确认读完以上全部内容，只回复 ${LONG_CONTEXT_MARKER}`;
const FIXED_VISION_URL = '/assets/heritage-demo/stele-rubbing-readable.jpg';
const FIXED_VISION_SHA256 = 'd34612763cf6cef1f96debcda6b949144af104262b79a0ed32f36b1f808e0545';
const VISION_PROMPT = '只用一句话判断图像主体是碑拓还是自然风景，并写出最明显的视觉依据。';
const OCR_PROMPT = '识读这张碑拓图中可辨认的汉字；先逐字抄录，再用一句话说明版面或书体特征。不要猜测看不清的字。';
const SCENARIO_LABELS: Record<FormalEvidenceScenario, string> = {
  'fixed-text': '固定文本探针',
  'long-context': '长上下文 Prefill',
  vision: 'Qwen-VL 固定视觉',
  'ocr-lora': '碑拓 OCR / LoRA',
};
const BASE_RELEASE = {
  url: 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/models/qwen3-vl-2b-dual/pocketearth-qwen3-vl-2b-dual-base-20260811/manifest.json',
  sha256: '1ec84bc53d6a58ce3685419dd0b2ad2bdb289cb18d876deec21634ff68c90313',
  bytes: 3748601738,
} as const;

const bytes = (value: number): string => !value ? '0 MB' : `${(value / 1024 / 1024).toFixed(value > 1024 * 1024 * 1024 ? 0 : 1)} MB`;
const fixed = (value: number | undefined, digits = 1): string => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
const makeId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function sha256Buffer(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function arrayBufferDataUrl(value: ArrayBuffer, type: string): string {
  const bytes = new Uint8Array(value); let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}

let fixedVisionFixture: Promise<string> | null = null;
function loadFixedVisionFixture(): Promise<string> {
  if (fixedVisionFixture) return fixedVisionFixture;
  fixedVisionFixture = (async () => {
    const response = await fetch(FIXED_VISION_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`fixed_vision_fixture_http_${response.status}`);
    const buffer = await response.arrayBuffer();
    const actualSha = await sha256Buffer(buffer);
    if (actualSha !== FIXED_VISION_SHA256) throw new Error(`fixed_vision_fixture_sha_changed:${actualSha}`);
    return arrayBufferDataUrl(buffer, response.headers.get('content-type') || 'image/jpeg');
  })();
  return fixedVisionFixture;
}

const responseOutput = (response: EdgeResponse): string => response.text ?? response.runtime?.probe?.output ?? '';

async function formalScenarioInput(scenario: FormalEvidenceScenario): Promise<{ sha256: string; label: string }> {
  if (scenario === 'fixed-text') return { sha256: await sha256Text(FORMAL_INPUT), label: FORMAL_INPUT };
  if (scenario === 'long-context') return { sha256: await sha256Text(LONG_CONTEXT_PROMPT), label: `long-context-96-paragraphs:${LONG_CONTEXT_MARKER}` };
  const prompt = scenario === 'vision' ? VISION_PROMPT : OCR_PROMPT;
  const adapter = scenario === 'ocr-lora' ? ':rubbing-vision-lora' : '';
  return { sha256: await sha256Text(`${FIXED_VISION_SHA256}:${prompt}${adapter}`), label: `${FIXED_VISION_URL}:${FIXED_VISION_SHA256.slice(0, 12)}:${scenario}` };
}

function scenarioQualityGate(scenario: FormalEvidenceScenario, output: string): boolean {
  if (scenario === 'fixed-text') return formalOutputQualityGate(output);
  if (scenario === 'long-context') return normalizeEvidenceOutput(output).toUpperCase().includes(LONG_CONTEXT_MARKER);
  if (scenario === 'vision') return /(碑拓|拓片|碑刻|rubbing)/i.test(output);
  return output.trim().length >= 4 && /[\u3400-\u9fff]/.test(output);
}

function Toggle({ label, value, disabled, onChange, color }: { label: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void; color: string }) {
  return <div className="grid grid-cols-[1fr_116px] items-center border-2 border-black bg-white">
    <div className="px-2.5 py-2"><b className="font-pixel text-[8px] tracking-wider">{label}</b></div>
    <div className="grid grid-cols-2 border-l-2 border-black">
      {[false, true].map((option) => <button key={String(option)} type="button" disabled={disabled} onClick={() => onChange(option)}
        className={`h-9 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-35 ${value === option ? 'text-black' : 'bg-[#ededed] text-black/40'} ${option ? 'border-l border-black/20' : ''}`}
        style={value === option ? { background: option ? color : '#d9d9d9' } : undefined}>{option ? 'ON' : 'OFF'}</button>)}
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-black/20 bg-white px-1.5 py-1"><div className="text-[7px] text-black/40">{label}</div><div className="font-mono text-[9px] font-bold">{value}</div></div>;
}

function EvidenceDetails({ record }: { record: DeviceEvidenceRecord }) {
  const comparison = record.comparison;
  const config = record.runtime?.configurationTrace;
  return <details className="border-2 border-black bg-white">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-[9px] font-bold">
      <span className="font-pixel text-[7px]" style={{ color: record.kind === 'sme2-ab' ? SME : ACCENT }}>{record.kind === 'sme2-ab' ? 'SME2 A/B' : record.kind.toUpperCase()}</span>
      <span className="truncate">{record.note}</span><span className="ml-auto shrink-0 text-[8px] text-black/35">{new Date(record.createdAt).toLocaleString()}</span>
    </summary>
    <div className="space-y-2 border-t-2 border-black p-2">
      {record.kind === 'configuration' && <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        <Metric label="切换端到端" value={`${fixed(record.clientElapsedMs, 1)} ms`} />
        <Metric label="释放旧 Session" value={`${fixed(config?.sessionReleaseMs, 3)} ms`} />
        <Metric label="重建 CPU dispatch" value={`${fixed(config?.dispatchInitMs, 3)} ms`} />
        <Metric label="原生总耗时" value={`${fixed(config?.nativeTotalMs, 3)} ms`} />
        <Metric label="配置代次" value={typeof config?.generation === 'number' ? String(config.generation) : '—'} />
        <Metric label="实际结果" value={record.runtime?.sme2Effective ? 'SME2 EFFECTIVE' : record.runtime?.mnnEnabled ? 'MNN / BASELINE' : 'MNN OFF'} />
      </div>}
      {comparison && <div className="grid grid-cols-3 gap-1">
        <Metric label="总耗时 P50 改善" value={`${fixed(comparison.elapsedP50Improvement ?? undefined)}%`} />
        <Metric label="首 Token P50 改善" value={`${fixed(comparison.ttfaP50Improvement ?? undefined)}%`} />
        <Metric label="Decode 吞吐提升" value={`${fixed(comparison.decodeTpsImprovement ?? undefined)}%`} />
      </div>}
      {record.groups?.map((group) => <div key={group.id} className="border border-black/25 bg-[#f5f5f5] p-2">
        <div className="flex items-center gap-2"><b className="text-[9px]">{group.label}</b><span className="font-pixel text-[6px]">TARGET {group.cpuTarget}</span><span className={`ml-auto text-[8px] font-bold ${group.sme2Effective ? 'text-[#7a4a00]' : 'text-black/45'}`}>{group.sme2Effective ? 'SME2 EFFECTIVE' : group.mnnEnabled ? 'SME2 OFF' : 'MNN OFF'}</span></div>
        <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Metric label="总耗时 P50/P95" value={`${fixed(group.summaries.elapsedMs?.p50, 0)} / ${fixed(group.summaries.elapsedMs?.p95, 0)} ms`} />
          <Metric label="首 Token P50" value={`${fixed(group.summaries.ttfaMs?.p50, 0)} ms`} />
          <Metric label="Decode P50" value={`${fixed(group.summaries.decodeTokensPerSecond?.p50)} tok/s`} />
          <Metric label="峰值 PSS/RSS" value={`${fixed(group.summaries.appPssMb?.max)} / ${fixed(group.summaries.peakRssMb?.max)} MB`} />
        </div>
        <details className="mt-1.5 border-t border-black/15 pt-1.5">
          <summary className="cursor-pointer text-[8px] font-bold text-black/55">展开 {group.warmups.length} 次预热 + {group.samples.length} 次原始样本</summary>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse font-mono text-[7px]"><thead><tr className="bg-black text-white"><th>#</th><th>组</th><th>OK</th><th>总 ms</th><th>Load ms</th><th>TTFA ms</th><th>Prefill ms</th><th>Decode ms</th><th>tok/s</th><th>PSS MB</th><th>温度</th><th>加速</th></tr></thead>
              <tbody>{[...group.warmups, ...group.samples].map((sample) => <tr key={`${sample.warmup}-${sample.index}`} className="border-b border-black/10 text-center"><td>{sample.index + 1}</td><td>{sample.warmup ? '预热' : '计入'}</td><td>{sample.ok ? '✓' : '✗'}</td><td>{fixed(sample.stats?.elapsedMs, 0)}</td><td>{fixed(sample.stats?.modelLoadMs, 0)}</td><td>{fixed(sample.stats?.ttfaMs, 0)}</td><td>{fixed(sample.stats?.prefillMs, 0)}</td><td>{fixed(sample.stats?.decodeMs, 0)}</td><td>{fixed(sample.stats?.decodeTokensPerSecond)}</td><td>{fixed(sample.stats?.appPssMb)}</td><td>{fixed(sample.stats?.batteryTemperatureC)}℃</td><td>{sample.stats?.acceleration?.join('+') || '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </div>)}
      <div className="text-[8px] leading-snug text-black/45">记录协议：{record.protocol}。原始样本保留；预热不进入 P50/P95；无法可靠获取的功耗字段留空，不使用估算值。</div>
    </div>
  </details>;
}

export default function OnDeviceBrainPanel({ onOpenLedger }: { onOpenLedger?: () => void }) {
  const native = isNativeMnnPlatform();
  const [open, setOpen] = useState(true);
  const [traceOpen, setTraceOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [runtime, setRuntime] = useState<EdgeResponse | null>(null);
  const [assets, setAssets] = useState<EdgeAssetStatus[]>([]);
  const [acting, setActing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [records, setRecords] = useState<DeviceEvidenceRecord[]>([]);
  const [suites, setSuites] = useState<FormalEvidenceSuite[]>([]);
  const [formalRunning, setFormalRunning] = useState(false);
  const pauseRequested = useRef(false);

  const refresh = useCallback(async () => {
    const [nextRuntime, nextAssets] = await Promise.all([getEdgeRuntimeStatus(), getEdgeAssets()]);
    setRuntime(nextRuntime); setAssets(nextAssets); setChecking(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    void Promise.all([readDeviceEvidence(), readFormalSuites()]).then(([nextRecords, nextSuites]) => {
      setRecords(nextRecords);
      setSuites(nextSuites);
    });
  }, []);
  useEffect(() => {
    let unsubscribe: (() => Promise<void>) | null = null;
    void subscribeNativeAssetProgress((event) => setAssets((current) => current.map((asset) => asset.id === event.assetId
      ? { ...asset, state: event.phase === 'done' ? 'installed' : 'downloading', downloaded: event.downloaded, total: event.total, installed: event.phase === 'done' }
      : asset))).then((dispose) => { unsubscribe = dispose; });
    return () => { if (unsubscribe) void unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!assets.some((asset) => asset.state === 'downloading')) return;
    const timer = window.setInterval(() => void refresh(), 1200);
    return () => window.clearInterval(timer);
  }, [assets, refresh]);

  const base = assets.find((asset) => asset.id === BASE_ASSET);
  const rubbingAdapterInstalled = assets.find((asset) => asset.id === 'rubbing-vision-lora')?.installed === true;
  const state = runtime?.runtime;
  const mnnEnabled = state?.mnnEnabled ?? true;
  const sme2Requested = state?.sme2Requested ?? true;
  const sme2Effective = state?.sme2Effective === true;
  const hardwareSme2 = state?.hardware?.sme2 === true;
  const pct = base?.total ? Math.min(100, Math.round(base.downloaded / base.total * 100)) : 0;
  const currentStatus = !native ? '网页预览 · 请在 Android APK 实测' : !mnnEnabled ? 'MNN 已关闭 · 强制回退' : sme2Effective ? 'MNN ON · SME2 EFFECTIVE' : sme2Requested ? 'MNN ON · 本机无 SME2' : 'MNN ON · SME2 OFF';
  const latestBenchmark = useMemo(() => records.find((record) => record.kind !== 'configuration'), [records]);
  const incompleteSuites = useMemo(() => suites.filter((suite) => !['completed', 'exported'].includes(suite.state)), [suites]);
  const latestFormalSuite = useMemo(() => suites.find((suite) => suite.kind === 'sme2-formal-abba'), [suites]);

  const refreshEvidence = async () => {
    const [nextRecords, nextSuites] = await Promise.all([readDeviceEvidence(), readFormalSuites()]);
    setRecords(nextRecords);
    setSuites(nextSuites);
  };

  const saveRecord = async (record: DeviceEvidenceRecord) => setRecords(await appendDeviceEvidence(record));

  const applyConfiguration = async (nextMnn: boolean, nextSme2: boolean, record = true) => {
    if (!native) return null;
    setActing(true); setError(''); setProgress(`切换到 MNN ${nextMnn ? 'ON' : 'OFF'} · SME2 ${nextSme2 ? 'ON' : 'OFF'}…`);
    try {
      const clientStarted = performance.now();
      const response = await configureEdgeRuntime(nextMnn, nextSme2);
      const clientElapsedMs = performance.now() - clientStarted;
      setRuntime(response);
      if (record) await saveRecord({ protocol: DEVICE_EVIDENCE_PROTOCOL, id: makeId('config'), kind: 'configuration', createdAt: new Date().toISOString(), note: `MNN ${nextMnn ? 'ON' : 'OFF'} · SME2 ${nextSme2 ? 'ON' : 'OFF'}；Session 已释放并重建 CPU dispatch`, clientElapsedMs, runtime: response.runtime });
      return response;
    } catch (reason) {
      setError(String(reason)); return null;
    } finally { setActing(false); setProgress(''); await refresh(); }
  };

  const install = async () => {
    setActing(true); setError('');
    try { setAssets(await installEdgeAsset(BASE_ASSET, BASE_RELEASE)); }
    catch (reason) { setError(String(reason)); }
    finally { setActing(false); }
  };
  const cancel = async () => { setActing(true); try { setAssets(await cancelEdgeAsset(BASE_ASSET)); } finally { setActing(false); } };

  const runSample = async (index: number, warmup: boolean): Promise<DeviceBenchmarkSample> => {
    const startedAt = new Date().toISOString();
    const wallStarted = performance.now();
    const response = await probeEdgeRuntime();
    const wallMs = performance.now() - wallStarted;
    return {
      index, warmup, startedAt, completedAt: new Date().toISOString(),
      ok: response.backend === 'mnn' && response.runtime?.probe?.ok === true,
      error: response.error,
      output: response.runtime?.probe?.output,
      runtime: response.runtime,
      stats: { ...response.stats, elapsedMs: response.stats?.elapsedMs ?? wallMs, mnnEnabled: response.stats?.mnnEnabled ?? response.runtime?.mnnEnabled },
    };
  };

  const runFormalScenarioSample = async (scenario: FormalEvidenceScenario, index: number, warmup: boolean): Promise<DeviceBenchmarkSample> => {
    const startedAt = new Date().toISOString();
    const wallStarted = performance.now();
    let response: EdgeResponse;
    if (scenario === 'fixed-text') response = await probeEdgeRuntime();
    else if (scenario === 'long-context') response = await runEdgeChatEvidence(LONG_CONTEXT_PROMPT, { maxTokens: 24 });
    else {
      const image = await loadFixedVisionFixture();
      response = await runEdgeVisionEvidence(image, scenario === 'vision' ? VISION_PROMPT : OCR_PROMPT, {
        adapter: scenario === 'ocr-lora' ? 'rubbing-vision-lora' : undefined,
        detail: scenario === 'ocr-lora' ? 'ocr' : 'high',
        maxTokens: scenario === 'ocr-lora' ? 160 : 64,
      });
    }
    const wallMs = performance.now() - wallStarted;
    const output = responseOutput(response);
    return {
      index, warmup, startedAt, completedAt: new Date().toISOString(),
      ok: response.backend === 'mnn' && response.runtime?.nativeBridge === true && !response.error,
      error: response.error,
      output,
      runtime: response.runtime,
      stats: { ...response.stats, elapsedMs: response.stats?.elapsedMs ?? wallMs, mnnEnabled: response.stats?.mnnEnabled ?? response.runtime?.mnnEnabled },
    };
  };

  const runGroup = async (nextSme2: boolean): Promise<DeviceBenchmarkGroup> => {
    const configured = await configureEdgeRuntime(true, nextSme2);
    const configuredRuntime = configured.runtime;
    const startedAt = new Date().toISOString();
    const warmups: DeviceBenchmarkSample[] = [];
    const samples: DeviceBenchmarkSample[] = [];
    for (let index = 0; index < WARMUP_RUNS; index += 1) {
      setProgress(`${nextSme2 ? 'SME2 ON' : 'SME2 OFF'} · 预热 ${index + 1}/${WARMUP_RUNS}`);
      warmups.push(await runSample(index, true));
    }
    for (let index = 0; index < MEASURED_RUNS; index += 1) {
      setProgress(`${nextSme2 ? 'SME2 ON' : 'SME2 OFF'} · 正式样本 ${index + 1}/${MEASURED_RUNS}`);
      samples.push(await runSample(index, false));
    }
    return {
      id: makeId(nextSme2 ? 'sme2-on' : 'sme2-off'),
      label: nextSme2 ? 'SME2 ON' : 'SME2 OFF · I8MM/NEON 基线',
      mnnEnabled: configuredRuntime?.mnnEnabled ?? true,
      sme2Requested: configuredRuntime?.sme2Requested ?? nextSme2,
      sme2Effective: configuredRuntime?.sme2Effective ?? false,
      cpuTarget: configuredRuntime?.cpuTarget ?? (nextSme2 ? 3 : 2),
      startedAt, completedAt: new Date().toISOString(), warmups, samples,
      summaries: summarizeSamples(samples), runtime: configuredRuntime,
    };
  };

  const runMnnOffGroup = async (): Promise<DeviceBenchmarkGroup> => {
    const configured = await configureEdgeRuntime(false, sme2Requested);
    const startedAt = new Date().toISOString();
    const warmups: DeviceBenchmarkSample[] = [];
    const samples: DeviceBenchmarkSample[] = [];
    for (let index = 0; index < WARMUP_RUNS; index += 1) {
      setProgress(`MNN OFF · 回退路由预热 ${index + 1}/${WARMUP_RUNS}`);
      const sample = await runSample(index, true);
      warmups.push({ ...sample, ok: sample.error === 'mnn_disabled_by_user' });
    }
    for (let index = 0; index < MEASURED_RUNS; index += 1) {
      setProgress(`MNN OFF · 回退路由样本 ${index + 1}/${MEASURED_RUNS}`);
      const sample = await runSample(index, false);
      samples.push({ ...sample, ok: sample.error === 'mnn_disabled_by_user' });
    }
    return {
      id: makeId('mnn-off'), label: 'MNN OFF · 原生门禁/回退交接', mnnEnabled: false,
      sme2Requested, sme2Effective: false, cpuTarget: configured.runtime?.cpuTarget ?? (sme2Requested ? 3 : 2),
      startedAt, completedAt: new Date().toISOString(), warmups, samples,
      summaries: summarizeSamples(samples), runtime: configured.runtime,
    };
  };

  const runCurrentBenchmark = async () => {
    if (!native || (mnnEnabled && !base?.installed)) return;
    setActing(true); setError(''); setTraceOpen(true);
    try {
      const group = mnnEnabled ? await runGroup(sme2Requested) : await runMnnOffGroup();
      await saveRecord({ protocol: DEVICE_EVIDENCE_PROTOCOL, id: makeId('bench'), kind: 'benchmark', createdAt: new Date().toISOString(), note: `${group.label} · ${WARMUP_RUNS} 次预热 + ${MEASURED_RUNS} 次正式样本`, runtime: group.runtime, groups: [group] });
    } catch (reason) { setError(String(reason)); }
    finally { setActing(false); setProgress(''); await refresh(); }
  };

  const placeSuite = (suite: FormalEvidenceSuite) => setSuites((current) => [suite, ...current.filter((item) => item.id !== suite.id)]);

  const runFormalSuite = async (resume?: FormalEvidenceSuite, requestedScenario: FormalEvidenceScenario = 'fixed-text') => {
    if (!native || !base?.installed || !hardwareSme2 || (resume && resume.state === 'invalid')) return;
    const scenario = resume?.scenario ?? requestedScenario;
    const restoreMnn = mnnEnabled;
    const restoreSme2 = sme2Requested;
    pauseRequested.current = false;
    setActing(true); setFormalRunning(true); setError(''); setTraceOpen(true);
    let working = resume;
    try {
      const scenarioInput = await formalScenarioInput(scenario);
      const inputSha256 = scenarioInput.sha256;
      const status = await getEdgeRuntimeStatus();
      if (!status.runtime?.nativeBridge) throw new Error('formal_suite_requires_android_native_bridge');
      if (scenario === 'ocr-lora') {
        const latestAssets = await getEdgeAssets();
        if (!latestAssets.find((asset) => asset.id === 'rubbing-vision-lora')?.installed) {
          throw new Error('formal_ocr_lora_requires_installed_rubbing_vision_lora');
        }
      }
      if (!working) {
        working = createFormalEvidenceSuite(buildRuntimeFingerprint(status.runtime, inputSha256), new Date().toISOString(), scenario, scenarioInput.label);
        await saveFormalSuite(working);
        placeSuite(working);
      } else {
        const environmentError = validateFormalEnvironment(working, status.runtime, inputSha256);
        if (environmentError) {
          working = await markSuiteState(working, 'invalid', environmentError);
          placeSuite(working);
          throw new Error(environmentError);
        }
      }
      working = structuredClone(working);
      working.state = 'running';
      working.updatedAt = new Date().toISOString();
      await saveFormalSuite(working);
      placeSuite(working);

      while (working.state === 'running') {
        if (pauseRequested.current) {
          working = await markSuiteState(working, 'paused');
          placeSuite(working);
          break;
        }
        const active = nextFormalLeg(working);
        if (!active) break;
        const sme2 = active.leg.mode === 'B';
        setProgress(`PAIR ${active.pair.index + 1}/2 · ${active.leg.index + 1}/4 ${active.leg.mode} · 切换 CPU TARGET ${sme2 ? 3 : 2}`);
        const configured = await configureEdgeRuntime(true, sme2);
        const environmentError = validateFormalEnvironment(working, configured.runtime, inputSha256);
        const modeError = active.leg.mode === 'B' && configured.runtime?.sme2Effective !== true
          ? 'mode_b_sme2_not_effective'
          : active.leg.mode === 'A' && configured.runtime?.sme2Effective === true ? 'mode_a_sme2_not_off' : null;
        if (environmentError || modeError) {
          working = await markSuiteState(working, 'invalid', environmentError || modeError || 'mode_configuration_failed');
          placeSuite(working);
          break;
        }

        const runAndCommit = async (index: number, warmup: boolean) => {
          setProgress(`PAIR ${active.pair.index + 1}/2 · ${active.leg.mode} · ${warmup ? '预热' : '正式'} ${index + 1}/${warmup ? active.leg.warmupsTarget : active.leg.measuredTarget}`);
          const measured = await runFormalScenarioSample(scenario, index, warmup);
          const sample: DeviceBenchmarkSample = {
            ...measured,
            id: `${working!.id}:${active.pair.id}:${active.leg.index}:${warmup ? 'w' : 'm'}:${index}`,
            suiteId: working!.id,
            pairId: active.pair.id,
            legIndex: active.leg.index,
            mode: active.leg.mode,
            inputSha256,
            outputSha256: await sha256Text(measured.output || ''),
            normalizedOutputSha256: await sha256Text(normalizeEvidenceOutput(measured.output || '')),
            qualityGatePassed: scenarioQualityGate(scenario, measured.output || ''),
          };
          sample.invalidReason = validateFormalSample(working!, sample) || undefined;
          working = await commitFormalSample(working!, sample);
          placeSuite(working);
        };

        for (let index = active.leg.warmupsCommitted; index < active.leg.warmupsTarget && working.state === 'running'; index += 1) {
          await runAndCommit(index, true);
          if (pauseRequested.current && working.state === 'running') {
            working = await markSuiteState(working, 'paused'); placeSuite(working); break;
          }
        }
        if (working.state !== 'running') break;
        for (let index = active.leg.measuredCommitted; index < active.leg.measuredTarget && working.state === 'running'; index += 1) {
          await runAndCommit(index, false);
          if (pauseRequested.current && working.state === 'running') {
            working = await markSuiteState(working, 'paused'); placeSuite(working); break;
          }
        }
      }
      if (working.state === 'completed') setProgress(`${SCENARIO_LABELS[scenario]} ABBA×2 完成 · A/B 各 20 次`);
    } catch (reason) {
      setError(String(reason));
      if (working && !['invalid', 'completed'].includes(working.state)) {
        working = await markSuiteState(working, 'paused', 'runner_interrupted');
        placeSuite(working);
      }
    } finally {
      try { await configureEdgeRuntime(restoreMnn, restoreSme2); } catch { /* evidence already contains the failure */ }
      setActing(false); setFormalRunning(false); setProgress('');
      await Promise.all([refresh(), refreshEvidence()]);
    }
  };

  const exportEvidence = async (selectedSuite = latestFormalSuite) => {
    setError('');
    const samples = selectedSuite ? await readFormalSamples(selectedSuite.id) : [];
    const artifacts = native ? await getEdgeEvidenceArtifacts() : undefined;
    const measuredA = samples.filter((sample) => !sample.warmup && sample.mode === 'A');
    const measuredB = samples.filter((sample) => !sample.warmup && sample.mode === 'B');
    const summaryA = summarizeSamples(measuredA);
    const summaryB = summarizeSamples(measuredB);
    const summary = {
      protocol: DEVICE_EVIDENCE_PROTOCOL,
      exportedAt: new Date().toISOString(),
      suite: selectedSuite,
      sampleCounts: { raw: samples.length, measuredA: measuredA.length, measuredB: measuredB.length },
      groups: { sme2Off: summaryA, sme2On: summaryB },
      comparison: {
        elapsedP50Improvement: improvementPercent(summaryA.elapsedMs, summaryB.elapsedMs),
        ttfaP50Improvement: improvementPercent(summaryA.ttfaMs, summaryB.ttfaMs),
        decodeTpsImprovement: improvementPercent(summaryA.decodeTokensPerSecond, summaryB.decodeTokensPerSecond, true),
      },
      disclosure: {
        systemPerfettoCaptured: artifacts?.perfetto?.systemTraceCaptured === true,
        powerWatts: null,
        note: '功耗不估算；systemPerfettoCaptured=false 时，perfetto-trace.json 仅为应用埋点兼容轨迹。',
      },
    };
    const entries: Record<string, string> = {
      'summary.json': JSON.stringify(summary, null, 2),
      'raw-samples.json': JSON.stringify(samples, null, 2),
      'configuration-records.json': JSON.stringify(buildEvidenceExport(records, runtime?.runtime), null, 2),
      'logcat.txt': artifacts?.logcat?.text || '',
      'logcat-metadata.json': JSON.stringify(artifacts?.logcat || { available: false, reason: 'not_android_native' }, null, 2),
      'perfetto-trace.json': JSON.stringify(artifacts?.perfetto?.trace || { traceEvents: [], metadata: { systemTraceCaptured: false } }, null, 2),
      'perfetto-metadata.json': JSON.stringify(artifacts?.perfetto || { compatible: false, systemTraceCaptured: false, reason: 'not_android_native' }, null, 2),
      'README.txt': 'Pocket Earth MNN / SME2 evidence bundle\n\n正式门禁：ABBA×2；A/B 各不少于 20 次；每个 sample 已单独提交 IndexedDB。\n若 perfetto-metadata.json 的 systemTraceCaptured=false，本包只含应用埋点轨迹；系统 Perfetto 需另用比赛手机采集。\n',
    };
    const manifestFiles = await Promise.all(Object.entries(entries).map(async ([name, content]) => ({ name, bytes: new TextEncoder().encode(content).byteLength, sha256: await sha256Text(content) })));
    entries['manifest.json'] = JSON.stringify({ protocol: 'pocket-evidence-bundle/v1', files: manifestFiles }, null, 2);
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const [name, content] of Object.entries(entries)) zip.file(name, content);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const file = new File([blob], `pocket-earth-mnn-sme2-evidence-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`, { type: 'application/zip' });
    const share = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
    if (share.share && (!share.canShare || share.canShare({ files: [file] }))) {
      try {
        await share.share({ title: 'Pocket Earth MNN / SME2 真机证据包', files: [file] });
        if (selectedSuite?.state === 'completed') { await markSuiteState(selectedSuite, 'exported'); await refreshEvidence(); }
        return;
      } catch { /* fall through to download */ }
    }
    const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (selectedSuite?.state === 'completed') { await markSuiteState(selectedSuite, 'exported'); await refreshEvidence(); }
  };

  return <section className="border-[3px] border-black bg-[#f6f1e5]">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 bg-black px-3 py-2 text-left text-white">
      <Cpu className="h-4 w-4 shrink-0" style={{ color: ACCENT }} strokeWidth={2.6} />
      <span className="font-pixel text-[9px] tracking-wider">DEVICE LAB · MNN × SME2 真机验收台</span><span className="flex-1" />
      <span className="text-[8px] font-bold" style={{ color: sme2Effective ? SME : ACCENT }}>{checking ? '读取中…' : currentStatus}</span>
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>

    {open && <div className="space-y-2 p-2.5">
      <div className="border-2 border-black bg-white p-2 text-[9px] leading-snug"><b>评委可直接操作：</b>MNN 控制推理是否走端侧；SME2 控制 MNN CPU target 2/3。切换会释放旧 Session，防止 OFF/ON 共用缓存或函数表。</div>
      <button type="button" onClick={onOpenLedger} disabled={!onOpenLedger} className="grid w-full grid-cols-[1fr_116px] items-stretch border-2 border-black bg-white text-left disabled:opacity-50">
        <span className="px-2.5 py-2"><b className="font-pixel text-[8px] tracking-wider">00 · MNN / SME2 真机验收账本</b><small className="mt-0.5 block text-[7px] text-black/45">MNN 端侧闭环 + SME2 同机 A/B · 按手机长期保存</small></span>
        <span className="grid place-items-center border-l-2 border-black px-2 text-center text-[8px] font-black" style={{ background: '#dceff3', color: '#245c68' }}>双账本记录 →</span>
      </button>
      <Toggle label="01 · MNN 端侧推理" value={mnnEnabled} disabled={!native || acting} color={ACCENT} onChange={(value) => void applyConfiguration(value, sme2Requested)} />
      <Toggle label="02 · SME2 指令集" value={sme2Requested} disabled={!native || acting || !mnnEnabled || !hardwareSme2} color={SME} onChange={(value) => void applyConfiguration(true, value)} />
      <div className="grid grid-cols-3 gap-1 text-center">
        <Metric label="实际路径" value={mnnEnabled ? 'MNN Android JNI' : 'RULE FALLBACK'} />
        <Metric label="CPU TARGET" value={mnnEnabled ? String(state?.cpuTarget ?? '—') : '—'} />
        <Metric label="SME2 三态" value={!hardwareSme2 ? '硬件不支持' : sme2Effective ? '请求+硬件+运行时有效' : sme2Requested ? '请求但未生效' : '已强制关闭'} />
      </div>

      <div className="border-2 border-black bg-white p-2">
        <div className="flex items-center gap-2"><b className="flex-1 text-[10px]">Qwen3-VL-2B · MNN INT8 双基座</b><span className="font-pixel text-[7px]">{base?.installed ? '已安装' : base?.state === 'downloading' ? `${pct}%` : '未安装'}</span></div>
        {base?.state === 'downloading' && <div className="mt-1.5 h-2 overflow-hidden border border-black bg-[#eaeaea]"><div className="h-full" style={{ width: `${pct}%`, background: ACCENT }} /></div>}
        <div className="mt-1 text-[8px] text-black/40">{bytes(base?.downloaded || 0)} / {bytes(base?.total || 0)} · SHA256 固定 · OSS Range 断点续传</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!base?.installed && base?.state !== 'downloading' && <button type="button" onClick={install} disabled={acting || !native} className="flex items-center gap-1 border-2 border-black bg-black px-2 py-1.5 text-[9px] font-bold text-[#9bd4e0] disabled:opacity-35"><Download className="h-3 w-3" />安装 MNN 基座</button>}
          {base?.state === 'downloading' && <button type="button" onClick={cancel} disabled={acting} className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1.5 text-[9px] font-bold"><Square className="h-3 w-3" />暂停</button>}
          <button type="button" onClick={runCurrentBenchmark} disabled={acting || !native || (mnnEnabled && !base?.installed)} className="flex items-center gap-1 border-2 border-black bg-black px-2 py-1.5 text-[9px] font-bold text-white disabled:opacity-30"><Activity className="h-3 w-3" />当前模式 2+5 实测</button>
          <button type="button" onClick={() => void runFormalSuite(undefined, 'fixed-text')} disabled={acting || !native || !mnnEnabled || !base?.installed || !hardwareSme2} className="flex items-center gap-1 border-2 border-black px-2 py-1.5 text-[9px] font-bold text-black disabled:opacity-30" style={{ background: SME }}><Zap className="h-3 w-3" />固定文本 ABBA×2</button>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          <button type="button" onClick={() => void runFormalSuite(undefined, 'long-context')} disabled={acting || !native || !mnnEnabled || !base?.installed || !hardwareSme2} className="border-2 border-black bg-[#f7e1b7] px-1 py-1.5 text-[8px] font-bold disabled:opacity-30">长上下文 A/B</button>
          <button type="button" onClick={() => void runFormalSuite(undefined, 'vision')} disabled={acting || !native || !mnnEnabled || !base?.installed || !hardwareSme2} className="border-2 border-black bg-[#dceff3] px-1 py-1.5 text-[8px] font-bold disabled:opacity-30">Qwen-VL 视觉 A/B</button>
          <button type="button" onClick={() => void runFormalSuite(undefined, 'ocr-lora')} disabled={acting || !native || !mnnEnabled || !base?.installed || !hardwareSme2 || !rubbingAdapterInstalled} className="border-2 border-black bg-[#eadff7] px-1 py-1.5 text-[8px] font-bold disabled:opacity-30" title={rubbingAdapterInstalled ? '' : '先安装碑拓识读 Skill 的 LoRA'}>OCR / LoRA A/B</button>
        </div>
      </div>

      <div className="border-2 border-black bg-white p-2">
        <div className="flex items-center gap-2"><b className="font-pixel text-[8px]">FORMAL SUITE STATE MACHINE</b><span className="ml-auto border border-black px-1 py-0.5 text-[7px] font-bold">IndexedDB · sample 逐笔提交</span></div>
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          <Metric label="顺序" value="ABBA × 2" />
          <Metric label="正式样本" value="A 20 / B 20" />
          <Metric label="失效门" value="温度 / 版本 / Input SHA" />
        </div>
        {formalRunning && <button type="button" onClick={() => { pauseRequested.current = true; setProgress('将在当前 sample 事务提交后暂停…'); }} className="mt-2 flex w-full items-center justify-center gap-1 border-2 border-black bg-[#fff4d6] py-1.5 text-[9px] font-bold"><Square className="h-3 w-3" />当前 sample 提交后暂停</button>}
        <div className="mt-2 border-t border-black/20 pt-1.5">
          <div className="text-[8px] font-bold">未完成列表 · {incompleteSuites.length}</div>
          {!incompleteSuites.length && <div className="mt-1 border border-dashed border-black/25 p-2 text-center text-[8px] text-black/40">暂无未完成 suite；正式运行可在 App 被打断后继续。</div>}
          {incompleteSuites.map((suite) => <div key={suite.id} className="mt-1.5 border border-black bg-[#f5f5f5] p-1.5">
            <div className="flex items-center gap-1.5"><b className="text-[8px]">{SCENARIO_LABELS[suite.scenario ?? 'fixed-text']}</b><span className="truncate text-[7px] text-black/35">{suite.id}</span><span className={`ml-auto text-[8px] font-bold ${suite.state === 'invalid' ? 'text-[#b3261e]' : 'text-[#9b4b00]'}`}>{suite.state.toUpperCase()}</span></div>
            <div className="mt-1 flex gap-1">{suite.pairs.map((pair) => <span key={pair.id} className="flex-1 border border-black/20 bg-white px-1 py-0.5 text-center text-[7px]">PAIR {pair.index + 1} · {pair.state}<br />{pair.legs.map((leg) => `${leg.mode}${leg.measuredCommitted}/${leg.measuredTarget}`).join(' · ')}</span>)}</div>
            <div className="mt-1.5 flex gap-1">
              <button type="button" onClick={() => void runFormalSuite(suite)} disabled={acting || suite.state === 'invalid'} className="flex-1 border border-black bg-black py-1 text-[8px] font-bold text-white disabled:opacity-30">继续 suite</button>
              <button type="button" onClick={() => void exportEvidence(suite)} disabled={acting} className="border border-black bg-white px-2 py-1 text-[8px] font-bold">导出当前证据</button>
            </div>
            {!!suite.invalidations.length && <div className="mt-1 text-[7px] text-[#b3261e]">最近：{suite.invalidations.at(-1)?.reason}</div>}
          </div>)}
          {latestFormalSuite && ['completed', 'exported'].includes(latestFormalSuite.state) && <div className="mt-1.5 flex items-center gap-2 border border-black bg-[#e7f8ee] p-1.5 text-[8px]"><Check className="h-3 w-3 text-[#238c57]" /><b>最新：{SCENARIO_LABELS[latestFormalSuite.scenario ?? 'fixed-text']} · A {latestFormalSuite.counts.measuredA} / B {latestFormalSuite.counts.measuredB}</b><button type="button" onClick={() => void exportEvidence(latestFormalSuite)} className="ml-auto border border-black bg-white px-2 py-1 font-bold">导出 ZIP</button></div>}
        </div>
      </div>

      {(acting || progress) && <div className="flex items-center gap-2 border-2 border-black bg-[#fff4d6] p-2 text-[9px] font-bold"><Loader2 className="h-3.5 w-3.5 animate-spin" />{progress || '执行中…'}</div>}
      {error && <div className="flex items-start gap-1.5 border-2 border-black bg-[#fff0f0] p-2 text-[9px] text-[#b3261e]"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}</div>}
      {!native && <div className="border-2 border-black bg-[#eeeeee] p-2 text-[9px] text-black/55">网页只能预览验收台；真实按钮仅在 Android APK 中启用，不会把服务器或浏览器结果冒充手机 MNN。</div>}

      <div className="border-2 border-black bg-[#ededed]">
        <button type="button" onClick={() => setTraceOpen((value) => !value)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left"><Activity className="h-3.5 w-3.5" style={{ color: SME }} /><b className="text-[9px]">详细 Trace / Evidence</b><span className="text-[8px] text-black/45">IndexedDB {records.length + suites.length} 组</span><span className="flex-1" />{(latestBenchmark || latestFormalSuite) && <span className="text-[8px] text-[#238c57]">✓ 已有实测</span>}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${traceOpen ? 'rotate-180' : ''}`} /></button>
        {traceOpen && <div className="space-y-1.5 border-t-2 border-black p-2">
          <div className="flex gap-1.5"><button type="button" onClick={() => void exportEvidence()} disabled={!records.length && !suites.length} className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[8px] font-bold disabled:opacity-30"><FileDown className="h-3 w-3" />导出证据 ZIP</button><button type="button" onClick={() => { void clearDeviceEvidence().then(() => { setRecords([]); setSuites([]); }); }} disabled={(!records.length && !suites.length) || acting} className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[8px] font-bold text-[#b3261e] disabled:opacity-30"><Trash2 className="h-3 w-3" />清空本机记录</button></div>
          {!records.length && !suites.length && <div className="border border-dashed border-black/30 bg-white p-3 text-center text-[8px] text-black/40">切换开关或运行实测后，配置、原始样本、P50/P95、设备与加速状态会逐笔写入 IndexedDB。</div>}
          {records.map((record) => <EvidenceDetails key={record.id} record={record} />)}
        </div>}
      </div>
      <p className="text-[8px] leading-snug text-black/40"><Check className="mr-1 inline h-3 w-3" />SME2 ON 只有“硬件支持 + target 3 + MNN dispatch 生效”同时满足才显示 EFFECTIVE；MNN OFF 的回退耗时不与模型吞吐混为一谈。</p>
    </div>}
  </section>;
}
