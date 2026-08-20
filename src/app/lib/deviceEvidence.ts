import type { EdgeResponse } from '../../../frost-agent/edge/types';

export const DEVICE_EVIDENCE_PROTOCOL = 'pocket-device-evidence/v2';
export const LEGACY_DEVICE_EVIDENCE_KEY = 'pocket-earth:device-evidence:v1';
const DATABASE_NAME = 'pe-device-evidence';
const DATABASE_VERSION = 1;
const RECORDS = 'records';
const SUITES = 'suites';
const SAMPLES = 'samples';

export interface DeviceBenchmarkSample {
  id?: string;
  suiteId?: string;
  pairId?: string;
  legIndex?: number;
  mode?: 'A' | 'B';
  inputSha256?: string;
  index: number;
  warmup: boolean;
  startedAt: string;
  completedAt: string;
  ok: boolean;
  invalidReason?: string;
  error?: string;
  output?: string;
  outputSha256?: string;
  normalizedOutputSha256?: string;
  qualityGatePassed?: boolean;
  runtime?: EdgeResponse['runtime'];
  stats?: EdgeResponse['stats'];
}

export interface MetricSummary {
  count: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

export interface DeviceBenchmarkGroup {
  id: string;
  label: string;
  mnnEnabled: boolean;
  sme2Requested: boolean;
  sme2Effective: boolean;
  cpuTarget: number;
  startedAt: string;
  completedAt: string;
  warmups: DeviceBenchmarkSample[];
  samples: DeviceBenchmarkSample[];
  summaries: Record<string, MetricSummary>;
  runtime?: EdgeResponse['runtime'];
}

export interface DeviceEvidenceRecord {
  protocol: string;
  id: string;
  kind: 'configuration' | 'benchmark' | 'sme2-ab';
  createdAt: string;
  note: string;
  clientElapsedMs?: number;
  runtime?: EdgeResponse['runtime'];
  groups?: DeviceBenchmarkGroup[];
  comparison?: Record<string, number | null>;
}

export type FormalSuiteState = 'created' | 'running' | 'paused' | 'invalid' | 'completed' | 'exported';
export type FormalEvidenceScenario = 'fixed-text' | 'long-context' | 'vision' | 'ocr-lora';
export type FormalPairState = 'pending' | 'running' | 'paused' | 'invalid' | 'completed';
export type FormalLegState = 'pending' | 'running' | 'completed';

export interface FormalRuntimeFingerprint {
  inputSha256: string;
  mnnVersion: string;
  appVersionName: string;
  appVersionCode: number;
  device: string;
  android: string;
  abi: string;
}

export interface FormalSuiteLeg {
  id: string;
  index: number;
  mode: 'A' | 'B';
  state: FormalLegState;
  warmupsTarget: number;
  measuredTarget: number;
  warmupsCommitted: number;
  measuredCommitted: number;
}

export interface FormalSuitePair {
  id: string;
  index: number;
  state: FormalPairState;
  currentLegIndex: number;
  sequence: readonly ['A', 'B', 'B', 'A'];
  legs: FormalSuiteLeg[];
  invalidReason?: string;
}

export interface FormalEvidenceSuite {
  protocol: typeof DEVICE_EVIDENCE_PROTOCOL;
  id: string;
  kind: 'sme2-formal-abba';
  scenario?: FormalEvidenceScenario;
  state: FormalSuiteState;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  exportedAt?: string;
  note: string;
  input: { label: string; sha256: string };
  fingerprint: FormalRuntimeFingerprint;
  pairs: FormalSuitePair[];
  counts: { warmup: number; measuredA: number; measuredB: number; total: number };
  gates: {
    maxThermalStatus: number;
    maxBatteryTemperatureC: number;
    maxTemperatureDriftC: number;
    temperatureMinC?: number;
    temperatureMaxC?: number;
  };
  invalidations: Array<{ at: string; reason: string; sampleId?: string }>;
}

export interface NativeEvidenceArtifacts {
  capturedAt?: string;
  logcat?: { available?: boolean; source?: string; reason?: string; text?: string };
  perfetto?: { compatible?: boolean; systemTraceCaptured?: boolean; reason?: string; trace?: { traceEvents?: unknown[]; displayTimeUnit?: string; metadata?: unknown } };
}

const METRICS: (keyof NonNullable<EdgeResponse['stats']>)[] = [
  'elapsedMs', 'modelLoadMs', 'ttfaMs', 'prefillMs', 'decodeMs', 'sampleMs',
  'prefillTokensPerSecond', 'decodeTokensPerSecond', 'currentRssMb', 'peakRssMb',
  'appPssMb', 'batteryTemperatureC', 'batteryPercent', 'deviceAvailableMemoryMb',
];

function percentile(sorted: number[], ratio: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

const rounded = (value: number): number => Number(value.toFixed(3));

export function summarizeValues(values: number[]): MetricSummary | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return {
    count: sorted.length,
    min: rounded(sorted[0]),
    p50: rounded(percentile(sorted, 0.5)),
    p95: rounded(percentile(sorted, 0.95)),
    max: rounded(sorted[sorted.length - 1]),
    mean: rounded(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
  };
}

export function summarizeSamples(samples: DeviceBenchmarkSample[]): Record<string, MetricSummary> {
  const output: Record<string, MetricSummary> = {};
  for (const metric of METRICS) {
    const values = samples.map((sample) => sample.stats?.[metric]).filter((value): value is number => typeof value === 'number');
    const summary = summarizeValues(values);
    if (summary) output[String(metric)] = summary;
  }
  return output;
}

export function improvementPercent(baseline: MetricSummary | undefined, accelerated: MetricSummary | undefined, higherIsBetter = false): number | null {
  if (!baseline || !accelerated || baseline.p50 === 0) return null;
  const delta = higherIsBetter ? accelerated.p50 - baseline.p50 : baseline.p50 - accelerated.p50;
  return rounded(delta / baseline.p50 * 100);
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('indexeddb_request_failed'));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('indexeddb_transaction_failed'));
  transaction.onabort = () => reject(transaction.error || new Error('indexeddb_transaction_aborted'));
});

let databasePromise: Promise<IDBDatabase | null> | null = null;
let migrationPromise: Promise<void> | null = null;

function rawDatabase(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SUITES)) {
        const suites = db.createObjectStore(SUITES, { keyPath: 'id' });
        suites.createIndex('state', 'state', { unique: false });
        suites.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(SAMPLES)) {
        const samples = db.createObjectStore(SAMPLES, { keyPath: 'id' });
        samples.createIndex('suiteId', 'suiteId', { unique: false });
        samples.createIndex('pairId', 'pairId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexeddb_open_failed'));
  });
  return databasePromise;
}

async function migrateLegacy(db: IDBDatabase): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(LEGACY_DEVICE_EVIDENCE_KEY);
  if (!raw) return;
  let records: DeviceEvidenceRecord[] = [];
  try { records = JSON.parse(raw); } catch { return; }
  if (!Array.isArray(records) || !records.length) { localStorage.removeItem(LEGACY_DEVICE_EVIDENCE_KEY); return; }
  const tx = db.transaction(RECORDS, 'readwrite');
  const committed = transactionDone(tx);
  for (const record of records) if (record?.id) tx.objectStore(RECORDS).put(record);
  await committed;
  localStorage.removeItem(LEGACY_DEVICE_EVIDENCE_KEY);
}

async function database(): Promise<IDBDatabase | null> {
  const db = await rawDatabase();
  if (!db) return null;
  migrationPromise ||= migrateLegacy(db);
  await migrationPromise;
  return db;
}

export async function readDeviceEvidence(): Promise<DeviceEvidenceRecord[]> {
  const db = await database();
  if (!db) return [];
  const tx = db.transaction(RECORDS, 'readonly');
  const committed = transactionDone(tx);
  const values = await requestResult(tx.objectStore(RECORDS).getAll()) as DeviceEvidenceRecord[];
  await committed;
  return values.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
}

export async function appendDeviceEvidence(record: DeviceEvidenceRecord): Promise<DeviceEvidenceRecord[]> {
  const db = await database();
  if (!db) return [record];
  const tx = db.transaction(RECORDS, 'readwrite');
  const committed = transactionDone(tx);
  tx.objectStore(RECORDS).put(record);
  await committed;
  return readDeviceEvidence();
}

export async function clearDeviceEvidence(): Promise<void> {
  const db = await database();
  if (!db) return;
  const tx = db.transaction([RECORDS, SUITES, SAMPLES], 'readwrite');
  const committed = transactionDone(tx);
  tx.objectStore(RECORDS).clear();
  tx.objectStore(SUITES).clear();
  tx.objectStore(SAMPLES).clear();
  await committed;
}

export async function sha256Text(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('sha256_unavailable');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeEvidenceOutput(value: string): string {
  const trimmed = value.trim();
  try {
    const sortValue = (input: unknown): unknown => Array.isArray(input) ? input.map(sortValue)
      : input && typeof input === 'object' ? Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortValue(item)]))
        : input;
    return JSON.stringify(sortValue(JSON.parse(trimmed)));
  } catch { return trimmed.replace(/\s+/g, ' '); }
}

export function formalOutputQualityGate(output: string | undefined): boolean {
  return normalizeEvidenceOutput(output || '').toUpperCase().includes('POCKET_MNN_READY');
}

export function buildRuntimeFingerprint(runtime: EdgeResponse['runtime'], inputSha256: string): FormalRuntimeFingerprint {
  const device = runtime?.device;
  return {
    inputSha256,
    mnnVersion: runtime?.version || '',
    appVersionName: device?.appVersionName || '',
    appVersionCode: device?.appVersionCode || 0,
    device: [device?.manufacturer, device?.model, device?.device].filter(Boolean).join('/'),
    android: `${device?.android || ''}/sdk-${device?.sdk || 0}`,
    abi: device?.abi || '',
  };
}

export function fingerprintKey(fingerprint: FormalRuntimeFingerprint): string {
  return JSON.stringify(fingerprint);
}

export function createFormalEvidenceSuite(
  fingerprint: FormalRuntimeFingerprint,
  now = new Date().toISOString(),
  scenario: FormalEvidenceScenario = 'fixed-text',
  inputLabel = 'runtime_probe:只回复 POCKET_MNN_READY',
): FormalEvidenceSuite {
  const id = `sme2-${scenario}-abba-${now.replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`;
  const pairs = [0, 1].map((pairIndex): FormalSuitePair => ({
    id: `${id}-pair-${pairIndex + 1}`,
    index: pairIndex,
    state: 'pending',
    currentLegIndex: 0,
    sequence: ['A', 'B', 'B', 'A'],
    legs: (['A', 'B', 'B', 'A'] as const).map((mode, legIndex) => ({
      id: `${id}-pair-${pairIndex + 1}-leg-${legIndex + 1}-${mode}`,
      index: legIndex,
      mode,
      state: 'pending',
      warmupsTarget: 2,
      measuredTarget: 5,
      warmupsCommitted: 0,
      measuredCommitted: 0,
    })),
  }));
  return {
    protocol: DEVICE_EVIDENCE_PROTOCOL,
    id,
    kind: 'sme2-formal-abba',
    scenario,
    state: 'created',
    createdAt: now,
    updatedAt: now,
    note: `${scenario} · 固定输入 · ABBA×2 · 每个 leg 2 次预热 + 5 次计入；每模式 20 次正式样本`,
    input: { label: inputLabel, sha256: fingerprint.inputSha256 },
    fingerprint,
    pairs,
    counts: { warmup: 0, measuredA: 0, measuredB: 0, total: 0 },
    gates: { maxThermalStatus: 1, maxBatteryTemperatureC: 42, maxTemperatureDriftC: 2 },
    invalidations: [],
  };
}

export function nextFormalLeg(suite: FormalEvidenceSuite): { pair: FormalSuitePair; leg: FormalSuiteLeg } | null {
  for (const pair of suite.pairs) {
    const leg = pair.legs.find((candidate) => candidate.state !== 'completed');
    if (leg) return { pair, leg };
  }
  return null;
}

export function validateFormalEnvironment(suite: FormalEvidenceSuite, runtime: EdgeResponse['runtime'], inputSha256: string): string | null {
  if (inputSha256 !== suite.input.sha256) return 'input_sha256_changed';
  if (fingerprintKey(buildRuntimeFingerprint(runtime, inputSha256)) !== fingerprintKey(suite.fingerprint)) return 'runtime_or_apk_version_changed';
  return null;
}

export function validateFormalSample(suite: FormalEvidenceSuite, sample: DeviceBenchmarkSample): string | null {
  if (!sample.ok) return sample.error || 'probe_failed';
  if (sample.qualityGatePassed !== true) return 'scenario_output_quality_gate_failed';
  if (!sample.outputSha256 || !sample.normalizedOutputSha256) return 'output_hash_missing';
  if (sample.inputSha256 !== suite.input.sha256) return 'input_sha256_changed';
  const environment = validateFormalEnvironment(suite, sample.runtime, sample.inputSha256 || '');
  if (environment) return environment;
  if (sample.runtime?.mnnEnabled !== true) return 'mnn_not_enabled';
  if (sample.mode === 'A' && sample.runtime?.sme2Effective === true) return 'mode_a_sme2_not_off';
  if (sample.mode === 'B' && sample.runtime?.sme2Effective !== true) return 'mode_b_sme2_not_effective';
  const thermal = sample.stats?.thermalStatus;
  if (typeof thermal === 'number' && thermal > suite.gates.maxThermalStatus) return `thermal_status_${thermal}_over_${suite.gates.maxThermalStatus}`;
  const temperature = sample.stats?.batteryTemperatureC;
  if (typeof temperature === 'number' && temperature > suite.gates.maxBatteryTemperatureC) return `battery_temperature_${temperature}_over_${suite.gates.maxBatteryTemperatureC}`;
  return null;
}

export function advanceFormalSuite(suite: FormalEvidenceSuite, sample: DeviceBenchmarkSample): FormalEvidenceSuite {
  const next = structuredClone(suite);
  const pair = next.pairs.find((candidate) => candidate.id === sample.pairId);
  const leg = pair?.legs.find((candidate) => candidate.index === sample.legIndex);
  if (!pair || !leg || sample.mode !== leg.mode) throw new Error('sample_does_not_match_active_leg');
  const expectedIndex = sample.warmup ? leg.warmupsCommitted : leg.measuredCommitted;
  if (sample.index !== expectedIndex) throw new Error('sample_index_not_next');
  pair.state = 'running';
  pair.currentLegIndex = leg.index;
  leg.state = 'running';
  if (sample.warmup) {
    leg.warmupsCommitted += 1;
    next.counts.warmup += 1;
  } else {
    leg.measuredCommitted += 1;
    if (leg.mode === 'A') next.counts.measuredA += 1;
    else next.counts.measuredB += 1;
  }
  next.counts.total += 1;
  const temperature = sample.stats?.batteryTemperatureC;
  if (typeof temperature === 'number') {
    next.gates.temperatureMinC = Math.min(next.gates.temperatureMinC ?? temperature, temperature);
    next.gates.temperatureMaxC = Math.max(next.gates.temperatureMaxC ?? temperature, temperature);
    if (next.gates.temperatureMaxC - next.gates.temperatureMinC > next.gates.maxTemperatureDriftC && !sample.invalidReason) {
      sample.invalidReason = `temperature_drift_over_${next.gates.maxTemperatureDriftC}C`;
    }
  }
  if (sample.invalidReason) {
    next.state = 'invalid';
    pair.state = 'invalid';
    pair.invalidReason = sample.invalidReason;
    next.invalidations.push({ at: sample.completedAt, reason: sample.invalidReason, sampleId: sample.id });
  } else if (leg.warmupsCommitted >= leg.warmupsTarget && leg.measuredCommitted >= leg.measuredTarget) {
    leg.state = 'completed';
    pair.currentLegIndex = leg.index + 1;
    if (pair.legs.every((candidate) => candidate.state === 'completed')) pair.state = 'completed';
  }
  if (next.state !== 'invalid' && next.pairs.every((candidate) => candidate.state === 'completed')) {
    if (next.counts.measuredA < 20 || next.counts.measuredB < 20) {
      next.state = 'invalid';
      next.invalidations.push({ at: sample.completedAt, reason: 'formal_mode_count_below_20', sampleId: sample.id });
    } else {
      next.state = 'completed';
      next.completedAt = sample.completedAt;
    }
  } else if (next.state !== 'invalid') next.state = 'running';
  next.updatedAt = sample.completedAt;
  return next;
}

export async function saveFormalSuite(suite: FormalEvidenceSuite): Promise<void> {
  const db = await database();
  if (!db) throw new Error('indexeddb_unavailable');
  const tx = db.transaction(SUITES, 'readwrite');
  const committed = transactionDone(tx);
  tx.objectStore(SUITES).put(suite);
  await committed;
}

export async function commitFormalSample(suite: FormalEvidenceSuite, sample: DeviceBenchmarkSample): Promise<FormalEvidenceSuite> {
  const db = await database();
  if (!db) throw new Error('indexeddb_unavailable');
  const persistedSample = { ...sample, id: sample.id || `${suite.id}:${sample.pairId}:${sample.legIndex}:${sample.warmup ? 'w' : 'm'}:${sample.index}` };
  const nextSuite = advanceFormalSuite(suite, persistedSample);
  const tx = db.transaction([SAMPLES, SUITES], 'readwrite');
  const committed = transactionDone(tx);
  tx.objectStore(SAMPLES).put(persistedSample);
  tx.objectStore(SUITES).put(nextSuite);
  await committed;
  return nextSuite;
}

export async function readFormalSuites(): Promise<FormalEvidenceSuite[]> {
  const db = await database();
  if (!db) return [];
  const tx = db.transaction(SUITES, 'readonly');
  const committed = transactionDone(tx);
  const values = await requestResult(tx.objectStore(SUITES).getAll()) as FormalEvidenceSuite[];
  await committed;
  return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function readIncompleteFormalSuites(): Promise<FormalEvidenceSuite[]> {
  return (await readFormalSuites()).filter((suite) => !['completed', 'exported'].includes(suite.state));
}

export async function readFormalSamples(suiteId: string): Promise<DeviceBenchmarkSample[]> {
  const db = await database();
  if (!db) return [];
  const tx = db.transaction(SAMPLES, 'readonly');
  const committed = transactionDone(tx);
  const index = tx.objectStore(SAMPLES).index('suiteId');
  const values = await requestResult(index.getAll(IDBKeyRange.only(suiteId))) as DeviceBenchmarkSample[];
  await committed;
  return values.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export async function markSuiteState(suite: FormalEvidenceSuite, state: FormalSuiteState, reason?: string): Promise<FormalEvidenceSuite> {
  const next = structuredClone(suite);
  next.state = state;
  next.updatedAt = new Date().toISOString();
  const active = nextFormalLeg(next);
  if (active && state === 'paused') active.pair.state = 'paused';
  if (active && state === 'invalid') {
    active.pair.state = 'invalid';
    active.pair.invalidReason = reason || 'suite_invalid';
  }
  if (reason) next.invalidations.push({ at: next.updatedAt, reason });
  if (state === 'exported') next.exportedAt = next.updatedAt;
  await saveFormalSuite(next);
  return next;
}

export function buildEvidenceExport(records: DeviceEvidenceRecord[], runtime?: EdgeResponse['runtime']) {
  return {
    protocol: DEVICE_EVIDENCE_PROTOCOL,
    exportedAt: new Date().toISOString(),
    runtime,
    records,
    disclosure: {
      measuredOnDeviceOnly: true,
      warmupsExcludedFromSummary: true,
      powerWatts: null,
      note: '无法由 Android 公共 API 可靠测量的功耗不填估算值；原始样本与汇总同时保留。',
    },
  };
}
