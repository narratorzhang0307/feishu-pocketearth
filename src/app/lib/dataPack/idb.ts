import type { DataPackDomain, InstalledDataPack } from './types';

const DB_NAME = 'pe-data-packs';
const DB_VERSION = 1;
const STORE = 'packs';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'packKey' });
        store.createIndex('domain', 'domain', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开 Data Pack 数据库'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Data Pack 数据库操作失败'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await requestResult(run(db.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    db.close();
  }
}

export const putInstalledPack = (pack: InstalledDataPack): Promise<IDBValidKey> => withStore('readwrite', (store) => store.put(pack));
export const getInstalledPack = (packKey: string): Promise<InstalledDataPack | undefined> => withStore('readonly', (store) => store.get(packKey));
export const deleteInstalledPack = (packKey: string): Promise<undefined> => withStore('readwrite', (store) => store.delete(packKey));

export async function listInstalledPacks(domain?: DataPackDomain): Promise<InstalledDataPack[]> {
  const packs = await withStore<InstalledDataPack[]>('readonly', (store) => store.getAll());
  return packs
    .filter((pack) => !domain || pack.domain === domain)
    .sort((a, b) => b.installedAt.localeCompare(a.installedAt));
}

