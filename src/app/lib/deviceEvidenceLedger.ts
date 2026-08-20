import type { EdgeResponse } from '../../../frost-agent/edge/types';

export const DEVICE_LEDGER_PROTOCOL = 'pocket-device-ledger/v1';
export const DEVICE_LEDGER_EVENT = 'pocket-earth:device-ledger-updated';
const DB_NAME = 'pocket-earth-device-evidence-artifacts';
const DB_VERSION = 2;
const INSTALL_ID_KEY = 'pocket-earth:device-install-id:v1';

export interface DeviceEvidenceDevice {
  id: string;
  protocol: typeof DEVICE_LEDGER_PROTOCOL;
  createdAt: string;
  lastSeenAt: string;
  manufacturer?: string;
  model?: string;
  device?: string;
  android?: string;
  sdk?: number;
  abi?: string;
  mnnVersion?: string;
  hardwareSme2?: boolean;
}

export interface DeviceTestArtifact {
  id: string;
  deviceId: string;
  pairId?: string;
  kind: 'json' | 'logcat' | 'perfetto' | 'screenshot' | 'other';
  name: string;
  size: number;
  sha256?: string;
  createdAt: string;
  note?: string;
  blob?: Blob;
}

export interface LedgerSnapshot {
  devices: DeviceEvidenceDevice[];
  artifacts: DeviceTestArtifact[];
}

let databasePromise: Promise<IDBDatabase> | null = null;

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('device_ledger_transaction_failed'));
    transaction.onabort = () => reject(transaction.error || new Error('device_ledger_transaction_aborted'));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('device_ledger_request_failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('indexeddb_unavailable')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta');
      if (!database.objectStoreNames.contains('devices')) database.createObjectStore('devices', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('artifacts')) {
        const artifacts = database.createObjectStore('artifacts', { keyPath: 'id' });
        artifacts.createIndex('deviceId', 'deviceId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { databasePromise = null; reject(request.error || new Error('device_ledger_open_failed')); };
    request.onblocked = () => { databasePromise = null; reject(new Error('device_ledger_open_blocked')); };
  });
  return databasePromise;
}

function newId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

async function installId(): Promise<string> {
  const database = await openDatabase();
  const transaction = database.transaction('meta', 'readwrite');
  const committed = transactionDone(transaction);
  const store = transaction.objectStore('meta');
  const cached = await requestValue(store.get(INSTALL_ID_KEY)) as string | undefined;
  if (cached) { await committed; return cached; }
  const created = newId('device');
  store.put(created, INSTALL_ID_KEY);
  await committed;
  return created;
}

async function put<T>(store: string, value: T): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(store, 'readwrite');
  const committed = transactionDone(transaction);
  transaction.objectStore(store).put(value);
  await committed;
}

async function valuesForDevice<T>(store: string, deviceId: string): Promise<T[]> {
  const database = await openDatabase();
  const transaction = database.transaction(store, 'readonly');
  const committed = transactionDone(transaction);
  const values = await requestValue(transaction.objectStore(store).index('deviceId').getAll(deviceId)) as T[];
  await committed;
  return values;
}

export async function ensureCurrentDevice(runtime?: EdgeResponse['runtime']): Promise<DeviceEvidenceDevice> {
  const database = await openDatabase();
  const id = await installId();
  const readTransaction = database.transaction('devices', 'readonly');
  const committed = transactionDone(readTransaction);
  const existing = await requestValue(readTransaction.objectStore('devices').get(id)) as DeviceEvidenceDevice | undefined;
  await committed;
  const now = new Date().toISOString();
  const next: DeviceEvidenceDevice = {
    id, protocol: DEVICE_LEDGER_PROTOCOL, createdAt: existing?.createdAt || now, lastSeenAt: now,
    ...runtime?.device, mnnVersion: runtime?.version, hardwareSme2: runtime?.hardware?.sme2,
  };
  await put('devices', next);
  return next;
}

export async function readLedger(deviceId?: string): Promise<LedgerSnapshot> {
  const database = await openDatabase();
  const transaction = database.transaction('devices', 'readonly');
  const committed = transactionDone(transaction);
  const devices = await requestValue(transaction.objectStore('devices').getAll()) as DeviceEvidenceDevice[];
  await committed;
  const selected = deviceId || await installId();
  return { devices, artifacts: (await valuesForDevice<DeviceTestArtifact>('artifacts', selected)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

export async function saveTestArtifact(artifact: DeviceTestArtifact): Promise<void> {
  await put('artifacts', artifact);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEVICE_LEDGER_EVENT));
}

export async function clearLedgerForDevice(deviceId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(['meta', 'devices', 'artifacts'], 'readwrite');
  const committed = transactionDone(transaction);
  const artifactStore = transaction.objectStore('artifacts');
  const keys = await requestValue(artifactStore.index('deviceId').getAllKeys(deviceId));
  keys.forEach((key) => artifactStore.delete(key));
  transaction.objectStore('devices').delete(deviceId);
  transaction.objectStore('meta').delete(INSTALL_ID_KEY);
  await committed;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEVICE_LEDGER_EVENT));
}

export function freshArtifact(deviceId: string, file: File, kind: DeviceTestArtifact['kind'], sha256?: string, pairId?: string): DeviceTestArtifact {
  return { id: newId('artifact'), deviceId, pairId, kind, name: file.name, size: file.size, sha256, createdAt: new Date().toISOString(), blob: file };
}
