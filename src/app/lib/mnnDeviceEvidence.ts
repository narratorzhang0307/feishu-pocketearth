import type { EdgeResponse } from '../../../frost-agent/edge/types';

export const MNN_EVIDENCE_PROTOCOL = 'pocket-earth/mnn-on-device-acceptance/v1';
export const MNN_LEDGER_EVENT = 'pocket-earth:mnn-evidence-changed';
export const MNN_WARMUPS = 2;
export const MNN_MEASURED_SAMPLES = 20;
export const MNN_STABILITY_TARGET_MS = 10 * 60 * 1000;

export type MnnCheckId =
  | 'runtime' | 'assets' | 'performance20' | 'mnnOff' | 'offlineText'
  | 'offlineVision' | 'offlineLora' | 'restartReload' | 'stability10m'
  | 'nativeArtifacts' | 'exportBundle';
export type MnnCheckState = 'pending' | 'running' | 'waiting' | 'passed' | 'failed' | 'blocked';
export type MnnSuiteState = 'created' | 'running' | 'paused' | 'completed' | 'invalid' | 'exported';

export interface MnnCheck {
  id: MnnCheckId;
  state: MnnCheckState;
  updatedAt: string;
  detail?: string;
  completedSamples?: number;
  requiredSamples?: number;
}

export interface MnnFingerprint {
  device: string;
  android?: string;
  abi?: string;
  appVersionName?: string;
  appVersionCode?: number;
  mnnVersion?: string;
  baseReleaseId?: string;
  baseManifestSha256?: string;
  fixedTextInputSha256: string;
  fixedVisionInputSha256: string;
}

export interface MnnEvidenceSuite {
  id: string;
  protocol: typeof MNN_EVIDENCE_PROTOCOL;
  createdAt: string;
  updatedAt: string;
  state: MnnSuiteState;
  fingerprint: MnnFingerprint;
  checks: Record<MnnCheckId, MnnCheck>;
  restartProcessInstanceId?: string;
  invalidations: Array<{ at: string; reason: string }>;
}

export interface MnnEvidenceSample {
  id: string;
  suiteId: string;
  checkId: MnnCheckId;
  index: number;
  warmup: boolean;
  startedAt: string;
  completedAt: string;
  online: boolean;
  backend: EdgeResponse['backend'];
  model?: string;
  ok: boolean;
  qualityGatePassed: boolean;
  inputSha256: string;
  outputSha256?: string;
  normalizedOutputSha256?: string;
  output?: string;
  error?: string;
  stats?: EdgeResponse['stats'];
  runtime?: EdgeResponse['runtime'];
  runId?: string;
}

export const MNN_CHECK_DEFINITIONS: ReadonlyArray<{ id: MnnCheckId; title: string; detail: string }> = [
  { id: 'runtime', title: 'MNN Runtime / JNI', detail: 'Android 原生桥、ABI、MNN 版本和 native library' },
  { id: 'assets', title: 'Qwen 模型完整性', detail: 'Release、Manifest SHA、双基座与精确文件尺寸' },
  { id: 'performance20', title: '冷启动 + 20 次正式样本', detail: '2 次预热；Load、TTFA、Prefill、Decode、tokens/s' },
  { id: 'mnnOff', title: 'MNN OFF 闭环', detail: '关闭后必须拒绝 JNI 推理，不得伪装成本地结果' },
  { id: 'offlineText', title: '飞行模式 · 文本', detail: '网络离线时 Qwen/MNN 真实 decode' },
  { id: 'offlineVision', title: '飞行模式 · Qwen-VL', detail: 'APK 内固定碑拓图片；输入 SHA 与输出质量门' },
  { id: 'offlineLora', title: '飞行模式 · LoRA Skill', detail: '已安装 Adapter 的端侧推理，不用基座冒充' },
  { id: 'restartReload', title: '应用重启 / 模型重载', detail: '进程 ID 必须改变，重启后重新加载并完成探针' },
  { id: 'stability10m', title: '10 分钟稳定性', detail: '逐条记录内存、温度、失败率与性能衰减' },
  { id: 'nativeArtifacts', title: 'Logcat / Perfetto', detail: '原生 Trace 事件和系统外部证据状态' },
  { id: 'exportBundle', title: '统一证据包', detail: '设备、模型/APK 哈希、汇总、原始样本与 Trace' },
];

const DATABASE_NAME = 'pe-mnn-device-evidence';
const DATABASE_VERSION = 1;
const SUITES = 'suites';
const SAMPLES = 'samples';

const uid = (): string => globalThis.crypto?.randomUUID?.() || `mnn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now = (): string => new Date().toISOString();

export function createMnnEvidenceSuite(fingerprint: MnnFingerprint): MnnEvidenceSuite {
  const at = now();
  const checks = Object.fromEntries(MNN_CHECK_DEFINITIONS.map(({ id }) => [id, { id, state: 'pending', updatedAt: at }])) as Record<MnnCheckId, MnnCheck>;
  return { id: uid(), protocol: MNN_EVIDENCE_PROTOCOL, createdAt: at, updatedAt: at, state: 'created', fingerprint, checks, invalidations: [] };
}

export function setMnnCheck(suite: MnnEvidenceSuite, id: MnnCheckId, checkState: MnnCheckState, detail?: string, counts?: { completed: number; required: number }): MnnEvidenceSuite {
  const at = now();
  const checks = { ...suite.checks, [id]: { id, state: checkState, updatedAt: at, detail, completedSamples: counts?.completed, requiredSamples: counts?.required } };
  const required = MNN_CHECK_DEFINITIONS.filter((item) => !['nativeArtifacts', 'exportBundle'].includes(item.id));
  const allPassed = required.every((item) => checks[item.id].state === 'passed');
  const anyRunning = Object.values(checks).some((check) => check.state === 'running');
  const suiteState: MnnSuiteState = allPassed ? 'completed' : anyRunning ? 'running' : suite.state === 'invalid' ? 'invalid' : suite.state === 'created' ? 'created' : 'paused';
  return { ...suite, checks, state: suiteState, updatedAt: at };
}

export function armMnnRestart(suite: MnnEvidenceSuite, processInstanceId: string): MnnEvidenceSuite {
  return { ...setMnnCheck(suite, 'restartReload', 'waiting', '已记录当前进程；请完全退出 App 后重新打开并再次验证'), restartProcessInstanceId: processInstanceId };
}

export function mnnSuiteMatches(a: MnnEvidenceSuite, fingerprint: MnnFingerprint): boolean {
  const left = a.fingerprint;
  return left.device === fingerprint.device && left.abi === fingerprint.abi
    && left.appVersionName === fingerprint.appVersionName && left.appVersionCode === fingerprint.appVersionCode
    && left.mnnVersion === fingerprint.mnnVersion && left.baseReleaseId === fingerprint.baseReleaseId
    && left.baseManifestSha256 === fingerprint.baseManifestSha256
    && left.fixedTextInputSha256 === fingerprint.fixedTextInputSha256
    && left.fixedVisionInputSha256 === fingerprint.fixedVisionInputSha256;
}

export function mnnSampleId(suiteId: string, checkId: MnnCheckId, warmup: boolean, index: number): string {
  return `${suiteId}:${checkId}:${warmup ? 'warmup' : 'measured'}:${index}`;
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('mnn_evidence_request_failed'));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('mnn_evidence_transaction_failed'));
  transaction.onabort = () => reject(transaction.error || new Error('mnn_evidence_transaction_aborted'));
});

let databasePromise: Promise<IDBDatabase | null> | null = null;
function database(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SUITES)) {
        const store = db.createObjectStore(SUITES, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(SAMPLES)) {
        const store = db.createObjectStore(SAMPLES, { keyPath: 'id' });
        store.createIndex('suiteId', 'suiteId', { unique: false });
        store.createIndex('checkId', 'checkId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('mnn_evidence_open_failed'));
  });
  return databasePromise;
}

function changed(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(MNN_LEDGER_EVENT));
}

export async function saveMnnSuite(suite: MnnEvidenceSuite): Promise<void> {
  const db = await database(); if (!db) return;
  const tx = db.transaction(SUITES, 'readwrite'); const committed = transactionDone(tx);
  tx.objectStore(SUITES).put(suite); await committed; changed();
}

export async function commitMnnSample(suite: MnnEvidenceSuite, sample: MnnEvidenceSample): Promise<void> {
  const db = await database(); if (!db) return;
  const tx = db.transaction([SUITES, SAMPLES], 'readwrite'); const committed = transactionDone(tx);
  tx.objectStore(SUITES).put(suite); tx.objectStore(SAMPLES).put(sample); await committed; changed();
}

export async function readMnnSuites(): Promise<MnnEvidenceSuite[]> {
  const db = await database(); if (!db) return [];
  const tx = db.transaction(SUITES, 'readonly'); const committed = transactionDone(tx);
  const values = await requestResult(tx.objectStore(SUITES).getAll()) as MnnEvidenceSuite[]; await committed;
  return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function readMnnSamples(suiteId: string): Promise<MnnEvidenceSample[]> {
  const db = await database(); if (!db) return [];
  const tx = db.transaction(SAMPLES, 'readonly'); const committed = transactionDone(tx);
  const values = await requestResult(tx.objectStore(SAMPLES).index('suiteId').getAll(suiteId)) as MnnEvidenceSample[]; await committed;
  return values.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

export async function clearMnnEvidence(): Promise<void> {
  const db = await database(); if (!db) return;
  const tx = db.transaction([SUITES, SAMPLES], 'readwrite'); const committed = transactionDone(tx);
  tx.objectStore(SUITES).clear(); tx.objectStore(SAMPLES).clear(); await committed; changed();
}
