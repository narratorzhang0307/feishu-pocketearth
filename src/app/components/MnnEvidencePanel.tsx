import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, Check, ChevronDown, FileArchive, Loader2, Play, RotateCcw, Square, WifiOff } from 'lucide-react';
import {
  configureEdgeRuntime, getEdgeApkEvidence, getEdgeAssets, getEdgeEvidenceArtifacts, getEdgeRuntimeStatus,
  probeEdgeRuntime, runEdgeChatEvidence, runEdgeVisionEvidence,
} from '../../../frost-agent/edge/httpEdge';
import type { EdgeAssetStatus, EdgeResponse } from '../../../frost-agent/edge/types';
import { formalOutputQualityGate, normalizeEvidenceOutput, sha256Text, summarizeSamples } from '../lib/deviceEvidence';
import type { DeviceEvidenceDevice, DeviceTestArtifact } from '../lib/deviceEvidenceLedger';
import {
  MNN_CHECK_DEFINITIONS, MNN_EVIDENCE_PROTOCOL, MNN_LEDGER_EVENT, MNN_MEASURED_SAMPLES,
  MNN_STABILITY_TARGET_MS, MNN_WARMUPS, armMnnRestart, commitMnnSample, createMnnEvidenceSuite,
  mnnSampleId, mnnSuiteMatches, readMnnSamples, readMnnSuites, saveMnnSuite, setMnnCheck,
  type MnnCheckId, type MnnEvidenceSample, type MnnEvidenceSuite, type MnnFingerprint,
} from '../lib/mnnDeviceEvidence';

const FIXED_TEXT_PROMPT = '只回复 POCKET_MNN_READY';
const FIXED_VISION_URL = '/assets/heritage-demo/stele-rubbing-readable.jpg';
const FIXED_VISION_SHA256 = 'd34612763cf6cef1f96debcda6b949144af104262b79a0ed32f36b1f808e0545';
const VISION_PROMPT = '只用一个词回答：图中主体是碑拓还是风景？';
const LORA_PROMPT = '为京都两日散步给出三处地点，只输出简短列表。';

const CHECK_STYLE = {
  pending: ['未开始', '#777'], running: ['运行中', '#1665c1'], waiting: ['等待操作', '#a76100'],
  passed: ['已验证', '#087c49'], failed: ['失败', '#bd1e45'], blocked: ['条件未满足', '#8b5b00'],
} as const;

const fixed = (value: number | undefined, digits = 1): string => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
const onlineNow = (): boolean => typeof navigator === 'undefined' ? true : navigator.onLine;
const median = (values: number[]): number | undefined => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); if (!sorted.length) return undefined;
  const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const download = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const evidenceOutput = (response: EdgeResponse): string => response.text
  ?? response.runtime?.probe?.output
  ?? response.error
  ?? '';

async function sha256Buffer(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function arrayBufferDataUrl(value: ArrayBuffer, type: string): string {
  const bytes = new Uint8Array(value); let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}

async function makeSample(
  suite: MnnEvidenceSuite, checkId: MnnCheckId, index: number, warmup: boolean,
  inputSha256: string, response: EdgeResponse, qualityGatePassed: boolean,
  startedAt: string, outputOverride?: string, runId?: string,
): Promise<MnnEvidenceSample> {
  const output = outputOverride ?? evidenceOutput(response);
  return {
    id: runId ? `${suite.id}:${checkId}:${runId}:${index}` : mnnSampleId(suite.id, checkId, warmup, index),
    suiteId: suite.id, checkId, index, warmup, startedAt, completedAt: new Date().toISOString(),
    online: onlineNow(), backend: response.backend, model: response.model,
    ok: qualityGatePassed, qualityGatePassed, inputSha256,
    outputSha256: output ? await sha256Text(output) : undefined,
    normalizedOutputSha256: output ? await sha256Text(normalizeEvidenceOutput(output)) : undefined,
    output, error: response.error, stats: response.stats, runtime: response.runtime, runId,
  };
}

function MnnSuiteCard({ suite, samples }: { suite: MnnEvidenceSuite; samples: MnnEvidenceSample[] }) {
  const measured = samples.filter((sample) => sample.checkId === 'performance20' && !sample.warmup && sample.ok);
  const summary = summarizeSamples(measured);
  const passed = Object.values(suite.checks).filter((check) => check.state === 'passed').length;
  return <details className="border-2 border-black bg-white" open={suite.state !== 'completed' && suite.state !== 'exported'}>
    <summary className="flex cursor-pointer list-none items-center gap-2 p-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center border-2 border-black bg-[#dceff3] font-pixel text-[7px]">MNN</div>
      <div className="min-w-0 flex-1"><b className="block text-[9px]">MNN 端侧正式 Suite</b><span className="block truncate text-[7px] text-black/40">{new Date(suite.createdAt).toLocaleString()} · {suite.fingerprint.device}</span></div>
      <span className="text-[7px] font-bold text-[#087c49]">{passed}/11</span><ChevronDown className="h-3.5 w-3.5" />
    </summary>
    <div className="space-y-2 border-t-2 border-black p-2.5">
      <div className="grid grid-cols-2 gap-1 text-[7px]"><div className="border border-black/20 p-1.5"><span className="text-black/40">MNN / ABI</span><b className="block font-mono">{suite.fingerprint.mnnVersion || '—'} · {suite.fingerprint.abi || '—'}</b></div><div className="border border-black/20 p-1.5"><span className="text-black/40">MODEL MANIFEST</span><b className="block truncate font-mono" title={suite.fingerprint.baseManifestSha256}>{suite.fingerprint.baseManifestSha256?.slice(0, 12) || '—'}</b></div></div>
      <div className="grid grid-cols-2 gap-1 text-[7px] sm:grid-cols-4"><div className="border border-black/20 p-1.5"><span className="text-black/40">正式样本</span><b className="block font-mono">{measured.length}/20</b></div><div className="border border-black/20 p-1.5"><span className="text-black/40">总耗时 P50</span><b className="block font-mono">{fixed(summary.elapsedMs?.p50, 0)} ms</b></div><div className="border border-black/20 p-1.5"><span className="text-black/40">TTFA P50</span><b className="block font-mono">{fixed(summary.ttfaMs?.p50, 0)} ms</b></div><div className="border border-black/20 p-1.5"><span className="text-black/40">Decode P50</span><b className="block font-mono">{fixed(summary.decodeTokensPerSecond?.p50)} tok/s</b></div></div>
      <details className="border border-black/20 bg-[#f5f5f5]"><summary className="cursor-pointer p-2 text-[8px] font-bold">原始样本 {samples.length} 条 · 每条独立事务提交</summary><div className="max-h-60 overflow-auto border-t border-black/20"><table className="w-full min-w-[700px] border-collapse font-mono text-[7px]"><thead className="sticky top-0 bg-black text-white"><tr><th>CHECK</th><th>#</th><th>类型</th><th>结果</th><th>网络</th><th>总ms</th><th>Load</th><th>TTFA</th><th>Prefill</th><th>Decode</th><th>tok/s</th><th>PSS</th><th>温度</th><th>OUTPUT SHA</th></tr></thead><tbody>{samples.map((sample) => <tr key={sample.id} className="border-b border-black/10 text-center"><td>{sample.checkId}</td><td>{sample.index + 1}</td><td>{sample.warmup ? '预热' : '计入'}</td><td>{sample.ok ? '✓' : '✕'}</td><td>{sample.online ? 'ON' : 'OFF'}</td><td>{fixed(sample.stats?.elapsedMs, 0)}</td><td>{fixed(sample.stats?.modelLoadMs, 0)}</td><td>{fixed(sample.stats?.ttfaMs, 0)}</td><td>{fixed(sample.stats?.prefillMs, 0)}</td><td>{fixed(sample.stats?.decodeMs, 0)}</td><td>{fixed(sample.stats?.decodeTokensPerSecond)}</td><td>{fixed(sample.stats?.appPssMb)}</td><td>{fixed(sample.stats?.batteryTemperatureC)}℃</td><td title={sample.normalizedOutputSha256}>{sample.normalizedOutputSha256?.slice(0, 8) || '—'}</td></tr>)}</tbody></table></div></details>
    </div>
  </details>;
}

export default function MnnEvidencePanel({ native, device, externalArtifacts = [] }: { native: boolean; device: DeviceEvidenceDevice | null; externalArtifacts?: DeviceTestArtifact[] }) {
  const [runtime, setRuntime] = useState<EdgeResponse | null>(null);
  const [assets, setAssets] = useState<EdgeAssetStatus[]>([]);
  const [suites, setSuites] = useState<MnnEvidenceSuite[]>([]);
  const [samplesBySuite, setSamplesBySuite] = useState<Record<string, MnnEvidenceSample[]>>({});
  const [acting, setActing] = useState<MnnCheckId | ''>('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const stopRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [nextRuntime, nextAssets, nextSuites] = await Promise.all([getEdgeRuntimeStatus(), getEdgeAssets(), readMnnSuites()]);
      const entries = await Promise.all(nextSuites.map(async (suite) => [suite.id, await readMnnSamples(suite.id)] as const));
      setRuntime(nextRuntime); setAssets(nextAssets); setSuites(nextSuites); setSamplesBySuite(Object.fromEntries(entries));
    } catch (reason) { setError(String(reason)); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const listener = () => void refresh(); window.addEventListener(MNN_LEDGER_EVENT, listener); return () => window.removeEventListener(MNN_LEDGER_EVENT, listener); }, [refresh]);

  const base = assets.find((asset) => asset.id === 'qwen3-vl-2b-mnn');
  const activeSuite = suites.find((suite) => !['invalid', 'exported'].includes(suite.state)) || suites[0];
  const activeSamples = activeSuite ? samplesBySuite[activeSuite.id] || [] : [];
  const passedCount = activeSuite ? Object.values(activeSuite.checks).filter((check) => check.state === 'passed').length : 0;
  const blockedCount = activeSuite ? Object.values(activeSuite.checks).filter((check) => ['blocked', 'waiting', 'failed'].includes(check.state)).length : 0;

  const prepareSuite = async (): Promise<{ suite: MnnEvidenceSuite; status: EdgeResponse; assets: EdgeAssetStatus[] }> => {
    const [status, latestAssets, textSha] = await Promise.all([getEdgeRuntimeStatus(), getEdgeAssets(), sha256Text(FIXED_TEXT_PROMPT)]);
    const baseAsset = latestAssets.find((asset) => asset.id === 'qwen3-vl-2b-mnn');
    const info = status.runtime?.device;
    const fingerprint: MnnFingerprint = {
      device: device?.id || [info?.manufacturer, info?.model, info?.device].filter(Boolean).join('/') || 'unknown-device',
      android: info?.android, abi: info?.abi, appVersionName: info?.appVersionName, appVersionCode: info?.appVersionCode,
      mnnVersion: status.runtime?.version, baseReleaseId: baseAsset?.releaseId, baseManifestSha256: baseAsset?.manifestSha256,
      fixedTextInputSha256: textSha, fixedVisionInputSha256: FIXED_VISION_SHA256,
    };
    const current = (await readMnnSuites()).find((suite) => !['invalid', 'exported'].includes(suite.state) && mnnSuiteMatches(suite, fingerprint));
    let suite = current || createMnnEvidenceSuite(fingerprint);
    const runtimeOk = native && status.runtime?.nativeBridge === true && !!status.runtime.version && status.runtime.device?.abi?.includes('arm64');
    suite = setMnnCheck(suite, 'runtime', runtimeOk ? 'passed' : 'failed', runtimeOk ? `MNN ${status.runtime?.version} · ${status.runtime?.device?.abi} · JNI READY` : '必须在 Android ARM64 APK 内由原生桥返回 MNN 版本');
    const assetOk = baseAsset?.installed === true && baseAsset.filesVerified === true && !!baseAsset.manifestSha256;
    suite = setMnnCheck(suite, 'assets', assetOk ? 'passed' : 'blocked', assetOk ? `${baseAsset.releaseId} · ${baseAsset.manifestSha256}` : '先安装并通过双 Manifest marker + 精确文件尺寸校验');
    await saveMnnSuite(suite); setRuntime(status); setAssets(latestAssets); return { suite, status, assets: latestAssets };
  };

  const saveCheck = async (suite: MnnEvidenceSuite, id: MnnCheckId, state: Parameters<typeof setMnnCheck>[2], detail: string, counts?: { completed: number; required: number }) => {
    const next = setMnnCheck(suite, id, state, detail, counts); await saveMnnSuite(next); return next;
  };

  const runPerformance = async () => {
    setActing('performance20'); setError('');
    try {
      let { suite, status } = await prepareSuite();
      if (!native || suite.checks.runtime.state !== 'passed' || suite.checks.assets.state !== 'passed') throw new Error('需要 Android ARM64 原生环境并先安装通过校验的 MNN 双基座');
      await configureEdgeRuntime(true, false);
      let samples = await readMnnSamples(suite.id);
      suite = await saveCheck(suite, 'performance20', 'running', '固定 target 2 基线；逐条写入中', { completed: samples.filter((s) => s.checkId === 'performance20').length, required: MNN_WARMUPS + MNN_MEASURED_SAMPLES });
      const textSha = suite.fingerprint.fixedTextInputSha256;
      for (const warmup of [true, false]) {
        const required = warmup ? MNN_WARMUPS : MNN_MEASURED_SAMPLES;
        for (let index = 0; index < required; index += 1) {
          const id = mnnSampleId(suite.id, 'performance20', warmup, index);
          if (samples.some((sample) => sample.id === id && sample.ok)) continue;
          setProgress(`${warmup ? '预热' : '正式'} ${index + 1}/${required}`);
          const startedAt = new Date().toISOString(); const response = await probeEdgeRuntime();
          const output = evidenceOutput(response);
          const quality = response.backend === 'mnn' && response.runtime?.nativeBridge === true && formalOutputQualityGate(output);
          const sample = await makeSample(suite, 'performance20', index, warmup, textSha, response, quality, startedAt);
          samples = [...samples.filter((item) => item.id !== id), sample];
          const completed = samples.filter((item) => item.checkId === 'performance20').length;
          suite = setMnnCheck(suite, 'performance20', quality ? 'running' : 'failed', quality ? '样本已事务提交' : `样本 ${index + 1} 未通过质量门：${response.error || output || 'empty'}`, { completed, required: MNN_WARMUPS + MNN_MEASURED_SAMPLES });
          await commitMnnSample(suite, sample);
          if (!quality) throw new Error(suite.checks.performance20.detail);
        }
      }
      const measured = samples.filter((sample) => sample.checkId === 'performance20' && !sample.warmup && sample.ok);
      suite = await saveCheck(suite, 'performance20', measured.length >= MNN_MEASURED_SAMPLES ? 'passed' : 'failed', `固定输入正式样本 ${measured.length}/${MNN_MEASURED_SAMPLES}`, { completed: measured.length, required: MNN_MEASURED_SAMPLES });
      status = await getEdgeRuntimeStatus(); setRuntime(status);
    } catch (reason) { setError(String(reason)); }
    finally { setActing(''); setProgress(''); await refresh(); }
  };

  const runMnnOff = async () => {
    setActing('mnnOff'); setError('');
    let restoreSme2 = false;
    try {
      let { suite, status } = await prepareSuite(); restoreSme2 = status.runtime?.sme2Requested === true;
      suite = await saveCheck(suite, 'mnnOff', 'running', '正在关闭 MNN 并调用同一原生探针');
      await configureEdgeRuntime(false, false); const startedAt = new Date().toISOString(); const response = await probeEdgeRuntime();
      const quality = response.backend === 'stub' && (response.error || '').includes('mnn_disabled_by_user');
      const sample = await makeSample(suite, 'mnnOff', 0, false, suite.fingerprint.fixedTextInputSha256, response, quality, startedAt, response.error);
      suite = setMnnCheck(suite, 'mnnOff', quality ? 'passed' : 'failed', quality ? 'OFF 后原生推理被明确拒绝；未返回伪造结果' : `OFF 闭环异常：${response.error || response.backend}`);
      await commitMnnSample(suite, sample);
    } catch (reason) { setError(String(reason)); }
    finally { await configureEdgeRuntime(true, restoreSme2).catch(() => undefined); setActing(''); await refresh(); }
  };

  const requireOffline = async (suite: MnnEvidenceSuite, id: MnnCheckId): Promise<boolean> => {
    if (!onlineNow()) return true;
    await saveCheck(suite, id, 'blocked', '检测到网络仍在线；请开启飞行模式并关闭 Wi-Fi 后重试'); return false;
  };

  const runOfflineText = async () => {
    setActing('offlineText'); setError('');
    try {
      let { suite } = await prepareSuite(); if (!await requireOffline(suite, 'offlineText')) return;
      await configureEdgeRuntime(true, false); suite = await saveCheck(suite, 'offlineText', 'running', '网络已离线，正在执行固定文本探针');
      const startedAt = new Date().toISOString(); const response = await probeEdgeRuntime();
      const output = evidenceOutput(response);
      const quality = !onlineNow() && response.backend === 'mnn' && formalOutputQualityGate(output);
      const sample = await makeSample(suite, 'offlineText', 0, false, suite.fingerprint.fixedTextInputSha256, response, quality, startedAt);
      suite = setMnnCheck(suite, 'offlineText', quality ? 'passed' : 'failed', quality ? '飞行模式 + MNN JNI + 输出质量门均通过' : `离线文本失败：${response.error || output || 'empty'}`);
      await commitMnnSample(suite, sample);
    } catch (reason) { setError(String(reason)); }
    finally { setActing(''); await refresh(); }
  };

  const runOfflineVision = async () => {
    setActing('offlineVision'); setError('');
    try {
      let { suite } = await prepareSuite(); if (!await requireOffline(suite, 'offlineVision')) return;
      await configureEdgeRuntime(true, false); suite = await saveCheck(suite, 'offlineVision', 'running', '正在读取 APK 内固定图片并校验输入 SHA');
      const imageResponse = await fetch(FIXED_VISION_URL, { cache: 'no-store' }); const buffer = await imageResponse.arrayBuffer();
      const actualSha = await sha256Buffer(buffer); if (actualSha !== FIXED_VISION_SHA256) throw new Error(`固定视觉样本 SHA 不一致：${actualSha}`);
      const startedAt = new Date().toISOString(); const response = await runEdgeVisionEvidence(arrayBufferDataUrl(buffer, imageResponse.headers.get('content-type') || 'image/webp'), VISION_PROMPT, { detail: 'fast', maxTokens: 32 });
      const quality = !onlineNow() && response.backend === 'mnn' && /(碑拓|拓片|碑刻|rubbing)/i.test(response.text || '');
      const sample = await makeSample(suite, 'offlineVision', 0, false, actualSha, response, quality, startedAt);
      suite = setMnnCheck(suite, 'offlineVision', quality ? 'passed' : 'failed', quality ? `固定图片 ${actualSha.slice(0, 12)}… · Qwen-VL 识别通过` : `视觉质量门失败：${response.error || response.text || 'empty'}`);
      await commitMnnSample(suite, sample);
    } catch (reason) { setError(String(reason)); }
    finally { setActing(''); await refresh(); }
  };

  const runOfflineLora = async () => {
    setActing('offlineLora'); setError('');
    try {
      let prepared = await prepareSuite(); let suite = prepared.suite; if (!await requireOffline(suite, 'offlineLora')) return;
      const adapter = prepared.assets.find((asset) => asset.id === 'travel-planner-lora');
      if (!adapter?.installed) { await saveCheck(suite, 'offlineLora', 'blocked', 'Travel Planner LoRA 尚未安装；不会用基座冒充 Adapter'); return; }
      await configureEdgeRuntime(true, false); suite = await saveCheck(suite, 'offlineLora', 'running', '正在调用 travel-planner-lora 原生 Adapter');
      const inputSha = await sha256Text(LORA_PROMPT); const startedAt = new Date().toISOString();
      const response = await runEdgeChatEvidence(LORA_PROMPT, { adapter: 'travel-planner-lora', maxTokens: 128 });
      const quality = !onlineNow() && response.backend === 'mnn' && (response.text || '').trim().length >= 8;
      const sample = await makeSample(suite, 'offlineLora', 0, false, inputSha, response, quality, startedAt);
      suite = setMnnCheck(suite, 'offlineLora', quality ? 'passed' : 'failed', quality ? '飞行模式下 Adapter 实际安装、实际路由、实际生成均通过' : `LoRA 失败：${response.error || response.text || 'empty'}`);
      await commitMnnSample(suite, sample);
    } catch (reason) { setError(String(reason)); }
    finally { setActing(''); await refresh(); }
  };

  const runRestart = async () => {
    setActing('restartReload'); setError('');
    try {
      let { suite, status } = await prepareSuite(); const processId = status.runtime?.processInstanceId;
      if (!processId) { await saveCheck(suite, 'restartReload', 'failed', '原生 Runtime 未返回 processInstanceId，不能证明真实进程重启'); return; }
      if (!suite.restartProcessInstanceId) { await saveMnnSuite(armMnnRestart(suite, processId)); return; }
      if (suite.restartProcessInstanceId === processId) { await saveCheck(suite, 'restartReload', 'waiting', '进程 ID 尚未改变；请从系统最近任务划掉 App，再重新打开'); return; }
      await configureEdgeRuntime(true, false); const startedAt = new Date().toISOString(); const response = await probeEdgeRuntime();
      const output = evidenceOutput(response);
      const quality = response.backend === 'mnn' && formalOutputQualityGate(output);
      const sample = await makeSample(suite, 'restartReload', 0, false, suite.fingerprint.fixedTextInputSha256, response, quality, startedAt);
      suite = setMnnCheck(suite, 'restartReload', quality ? 'passed' : 'failed', quality ? `进程 ${suite.restartProcessInstanceId.slice(0, 8)} → ${processId.slice(0, 8)}；重载推理通过` : `重启后探针失败：${response.error || output || 'empty'}`);
      await commitMnnSample(suite, sample);
    } catch (reason) { setError(String(reason)); }
    finally { setActing(''); await refresh(); }
  };

  const runStability = async () => {
    setActing('stability10m'); setError(''); stopRef.current = false;
    try {
      let { suite } = await prepareSuite(); await configureEdgeRuntime(true, false);
      const runId = Date.now().toString(36); const started = performance.now(); let index = 0; let success = 0; const runSamples: MnnEvidenceSample[] = [];
      suite = await saveCheck(suite, 'stability10m', 'running', '连续运行 10:00；每次完成立即落盘');
      while (performance.now() - started < MNN_STABILITY_TARGET_MS && !stopRef.current) {
        setProgress(`稳定性 ${Math.floor((performance.now() - started) / 1000)} / 600 秒 · ${index} 样本`);
        const startedAt = new Date().toISOString(); const response = await probeEdgeRuntime();
        const quality = response.backend === 'mnn' && formalOutputQualityGate(evidenceOutput(response)); if (quality) success += 1;
        const sample = await makeSample(suite, 'stability10m', index, false, suite.fingerprint.fixedTextInputSha256, response, quality, startedAt, undefined, runId);
        runSamples.push(sample); index += 1; suite = setMnnCheck(suite, 'stability10m', 'running', `运行中 · ${index} 样本 · ${success} 成功`);
        await commitMnnSample(suite, sample);
      }
      const elapsed = performance.now() - started; const ratio = index ? success / index : 0;
      const quarter = Math.max(1, Math.floor(runSamples.length / 4));
      const firstP50 = median(runSamples.slice(0, quarter).map((sample) => sample.stats?.elapsedMs).filter((value): value is number => typeof value === 'number'));
      const lastP50 = median(runSamples.slice(-quarter).map((sample) => sample.stats?.elapsedMs).filter((value): value is number => typeof value === 'number'));
      const degradation = firstP50 && lastP50 ? (lastP50 - firstP50) / firstP50 * 100 : undefined;
      const maxThermal = Math.max(...runSamples.map((sample) => sample.stats?.thermalStatus).filter((value): value is number => typeof value === 'number'), -1);
      const temperatures = runSamples.map((sample) => sample.stats?.batteryTemperatureC).filter((value): value is number => typeof value === 'number');
      const temperatureDrift = temperatures.length > 1 ? Math.max(...temperatures) - Math.min(...temperatures) : undefined;
      const maxPss = Math.max(...runSamples.map((sample) => sample.stats?.appPssMb).filter((value): value is number => typeof value === 'number'), -1);
      const stable = !stopRef.current && elapsed >= MNN_STABILITY_TARGET_MS && ratio >= 0.95 && maxThermal < 4 && (degradation === undefined || degradation <= 50);
      const detail = stopRef.current
        ? `在 ${Math.round(elapsed / 1000)} 秒主动中断；正式验收需重新连续跑满 600 秒`
        : `持续 ${Math.round(elapsed / 1000)} 秒 · 成功率 ${(ratio * 100).toFixed(1)}% · 首/末 P50 ${fixed(firstP50, 0)}/${fixed(lastP50, 0)} ms · 衰减 ${fixed(degradation)}% · 温升 ${fixed(temperatureDrift)}℃ · PSS峰值 ${maxPss >= 0 ? fixed(maxPss) : '—'} MB · Thermal ${maxThermal >= 0 ? maxThermal : '—'}`;
      suite = await saveCheck(suite, 'stability10m', stable ? 'passed' : 'waiting', detail);
    } catch (reason) { setError(String(reason)); }
    finally { setActing(''); setProgress(''); stopRef.current = false; await refresh(); }
  };

  const refreshNativeArtifacts = async () => {
    setActing('nativeArtifacts'); setError('');
    try {
      let { suite } = await prepareSuite(); const [evidence, apk] = await Promise.all([getEdgeEvidenceArtifacts(), getEdgeApkEvidence()]);
      const logcat = evidence?.logcat?.available === true; const systemTrace = evidence?.perfetto?.systemTraceCaptured === true;
      const externalPerfetto = externalArtifacts.some((artifact) => artifact.kind === 'perfetto');
      const passed = logcat && (systemTrace || externalPerfetto);
      const apkProof = apk?.sha256 ? `APK ${apk.sha256.slice(0, 12)}…` : 'APK SHA 未取得';
      suite = await saveCheck(suite, 'nativeArtifacts', passed && !!apk?.sha256 ? 'passed' : 'waiting', passed ? `原生 Logcat + Perfetto 已登记 · ${apkProof}` : `Logcat ${logcat ? '已捕获' : '未捕获'}；Perfetto ${systemTrace || externalPerfetto ? '已登记' : '请从系统录制后在 SME2 页的外部证据区添加'}；${apkProof}`);
    } catch (reason) { setError(String(reason)); }
    finally { setActing(''); await refresh(); }
  };

  const exportBundle = async () => {
    setActing('exportBundle'); setError('');
    try {
      let { suite, status, assets: currentAssets } = await prepareSuite(); const allSuites = await readMnnSuites();
      const samples = (await Promise.all(allSuites.map((item) => readMnnSamples(item.id)))).flat(); const [nativeArtifacts, apkEvidence] = await Promise.all([getEdgeEvidenceArtifacts(), getEdgeApkEvidence()]);
      const JSZip = (await import('jszip')).default; const zip = new JSZip(); const manifest: Array<{ name: string; bytes: number; sha256: string }> = [];
      const addText = async (name: string, value: unknown) => { const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2); zip.file(name, text); manifest.push({ name, bytes: new TextEncoder().encode(text).byteLength, sha256: await sha256Text(text) }); };
      await addText('device-runtime.json', { protocol: MNN_EVIDENCE_PROTOCOL, exportedAt: new Date().toISOString(), device, runtime: status.runtime });
      await addText('apk-evidence.json', apkEvidence || { error: 'apk_digest_unavailable' });
      await addText('model-assets.json', currentAssets); await addText('mnn-suites.json', allSuites); await addText('raw-samples.json', samples);
      await addText('metric-summaries.json', Object.fromEntries(MNN_CHECK_DEFINITIONS.map((definition) => [definition.id, summarizeSamples(samples.filter((sample) => sample.checkId === definition.id && !sample.warmup))])));
      await addText('native-logcat.txt', nativeArtifacts?.logcat?.text || ''); await addText('native-perfetto.json', nativeArtifacts?.perfetto || {});
      const cleanArtifacts = externalArtifacts.map(({ blob: _blob, ...artifact }) => artifact); await addText('external-artifact-index.json', cleanArtifacts);
      externalArtifacts.forEach((artifact) => { if (artifact.blob) zip.file(`artifacts/${artifact.id}-${artifact.name}`, artifact.blob); });
      await addText('manifest.json', { protocol: 'pocket-earth/mnn-evidence-bundle/v1', files: manifest });
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      download(blob, `pocket-earth-mnn-ledger-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
      suite = setMnnCheck(suite, 'exportBundle', 'passed', `已导出 ${samples.length} 条原始样本；ZIP 内文件均列入 SHA-256 manifest`); suite.state = suite.state === 'completed' ? 'exported' : suite.state; await saveMnnSuite(suite);
    } catch (reason) { setError(String(reason)); }
    finally { setActing(''); await refresh(); }
  };

  const actions: Partial<Record<MnnCheckId, () => void>> = {
    runtime: () => void prepareSuite().finally(refresh), assets: () => void prepareSuite().finally(refresh), performance20: () => void runPerformance(),
    mnnOff: () => void runMnnOff(), offlineText: () => void runOfflineText(), offlineVision: () => void runOfflineVision(),
    offlineLora: () => void runOfflineLora(), restartReload: () => void runRestart(), stability10m: () => void runStability(),
    nativeArtifacts: () => void refreshNativeArtifacts(), exportBundle: () => void exportBundle(),
  };

  return <main className="space-y-3 p-3 pb-24">
    <section className="border-[3px] border-black bg-white p-3"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center border-2 border-black bg-[#dceff3]"><Activity className="h-6 w-6 text-[#245c68]" /></div><div className="min-w-0 flex-1"><div className="font-pixel text-[10px]">MNN · 端侧验收</div><div className="mt-1 text-[8px] text-black/50">{runtime?.runtime?.device?.model || device?.model || '设备待识别'} · {runtime?.runtime?.device?.abi || device?.abi || '—'} · MNN {runtime?.runtime?.version || device?.mnnVersion || '—'}</div><div className="mt-1 truncate font-mono text-[7px] text-black/30">MODEL {base?.releaseId || '未安装'}</div></div><span className={`border-2 border-black px-1.5 py-1 text-[7px] font-black ${native ? 'bg-[#dceff3] text-[#245c68]' : 'bg-[#ededed] text-black/50'}`}>{native ? 'ANDROID NATIVE' : 'WEB PREVIEW'}</span></div><div className="mt-2 border-2 border-black bg-[#f6f1e5] px-2 py-1.5 text-[8px] leading-snug text-black/55">{native ? '所有通过项都来自 MNN Android JNI 真调用；每条样本完成后立即写入 IndexedDB。' : '网页只展示验收结构，按钮禁用；不会生成或冒充真机成绩。'}</div><div className="mt-2 grid grid-cols-4 gap-1.5 text-center"><div className="border-2 border-black bg-[#f6f1e5] p-1.5"><b className="block font-mono text-sm">11</b><span className="text-[7px] text-black/45">验收项</span></div><div className="border-2 border-black bg-[#e8f8ef] p-1.5"><b className="block font-mono text-sm text-[#087c49]">{passedCount}</b><span className="text-[7px] text-black/45">已验证</span></div><div className="border-2 border-black bg-[#fff1c7] p-1.5"><b className="block font-mono text-sm text-[#7a5100]">{blockedCount}</b><span className="text-[7px] text-black/45">待操作</span></div><div className="border-2 border-black bg-white p-1.5"><b className="block font-mono text-sm">{activeSamples.length}</b><span className="text-[7px] text-black/45">样本</span></div></div></section>
    <section className="border-2 border-black bg-[#fff8e6] p-2.5 text-[9px] leading-relaxed"><b>验收逻辑：</b>先证明 Qwen 模型通过 MNN/JNI 在飞行模式真实运行，再由 SME2 页比较同一推理的 target 2 / 3 性能。两张账本不混用结论。{progress && <div className="mt-1 font-mono text-[#1665c1]">{progress}</div>}</section>
    {error && <div className="flex items-start gap-2 border-2 border-[#bd1e45] bg-[#fff0f3] p-2.5 text-[9px] text-[#9b1637]"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
    <section><div className="mb-2 flex items-end justify-between"><h2 className="font-pixel text-[10px]">MNN 验收待办矩阵</h2><span className="text-[7px] text-black/40">同一手机长期保存 · 自动提示下一步</span></div><div className="border-2 border-black bg-white">{MNN_CHECK_DEFINITIONS.map((definition, index) => { const check = activeSuite?.checks[definition.id]; const state = check?.state || 'pending'; const [label, color] = CHECK_STYLE[state]; const isActing = acting === definition.id; return <div key={definition.id} className={`flex items-center gap-2 p-2.5 ${index ? 'border-t-2 border-black' : ''}`}><span className="font-pixel text-[7px] text-black/35">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><b className="block text-[9px]">{definition.title}</b><span className="block text-[7px] text-black/45">{check?.detail || definition.detail}</span>{check?.requiredSamples && <span className="mt-0.5 block font-mono text-[7px]" style={{ color }}>{check.completedSamples || 0}/{check.requiredSamples}</span>}</div><button type="button" disabled={!native || (!!acting && !isActing)} onClick={isActing && definition.id === 'stability10m' ? () => { stopRef.current = true; } : actions[definition.id]} className="flex shrink-0 items-center gap-1 border border-black px-1.5 py-1 text-[7px] font-bold disabled:opacity-30" style={{ color, background: state === 'passed' ? '#e8f8ef' : 'white' }}>{isActing ? definition.id === 'stability10m' ? <><Square className="h-2.5 w-2.5" />停止</> : <><Loader2 className="h-2.5 w-2.5 animate-spin" />运行中</> : state === 'passed' ? <><Check className="h-2.5 w-2.5" />{label}</> : definition.id.startsWith('offline') ? <><WifiOff className="h-2.5 w-2.5" />{label === '未开始' ? '验证' : '重试'}</> : definition.id === 'restartReload' ? <><RotateCcw className="h-2.5 w-2.5" />{state === 'waiting' ? '重启后验证' : '开始'}</> : definition.id === 'exportBundle' ? <><FileArchive className="h-2.5 w-2.5" />导出</> : <><Play className="h-2.5 w-2.5" />{label === '未开始' ? '运行' : '重试'}</>}</button></div>; })}</div></section>
    <section className="space-y-2"><div className="flex items-end justify-between"><h2 className="font-pixel text-[10px]">MNN 完整记录</h2><span className="text-[7px] text-black/40">{suites.length} 份</span></div>{!suites.length && <div className="border-2 border-dashed border-black/35 bg-white p-6 text-center text-[9px] text-black/40">还没有 MNN 正式 suite。点击任一验收项后创建，并从第一条样本开始长期保存。</div>}{suites.map((suite) => <MnnSuiteCard key={suite.id} suite={suite} samples={samplesBySuite[suite.id] || []} />)}</section>
    <section className="border-2 border-black bg-[#f3f3f3] p-2.5"><b className="text-[9px]">证据边界</b><p className="mt-1 text-[8px] leading-relaxed text-black/50">“已验证”只表示当前设备、当前 APK 版本、当前 MNN 版本、当前模型 Manifest 与固定 Input SHA 的结果。任一指纹改变都新建 Suite；网页预览、网络在线的“离线测试”、未安装 LoRA 都不会通过。</p></section>
  </main>;
}
