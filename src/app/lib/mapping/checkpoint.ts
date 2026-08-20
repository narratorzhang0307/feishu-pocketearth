import type { ForgeBookMeta, ForgePageEvidence, ForgePlaceCandidate } from './forge';

const DATABASE = 'pocket-earth-content-mapping';
const STORE = 'checkpoints';
const VERSION = 1;

export interface ForgeCheckpoint {
  sourceSha256: string;
  sourceName: string;
  updatedAt: string;
  meta: ForgeBookMeta;
  pages: ForgePageEvidence[];
  candidates: ForgePlaceCandidate[];
  candidateVersion?: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'sourceSha256' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开 Mapping 断点数据库'));
  });
}

export async function loadForgeCheckpoint(sourceSha256: string): Promise<ForgeCheckpoint | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(sourceSha256);
      request.onsuccess = () => resolve((request.result as ForgeCheckpoint | undefined) || null);
      request.onerror = () => reject(request.error || new Error('无法读取 Mapping 断点'));
    });
  } finally { database.close(); }
}

export async function saveForgeCheckpoint(checkpoint: Omit<ForgeCheckpoint, 'updatedAt'>): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put({ ...checkpoint, updatedAt: new Date().toISOString() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('无法保存 Mapping 断点'));
    });
  } finally { database.close(); }
}
