type SessionStorageLike = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

export const CHUNK_RELOAD_KEY = 'chunk-reload';
const APP_CACHE_PREFIXES = ['pocket-earth-', 'carrythecosmos-'];

function browserSessionStorage(): SessionStorageLike | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export function clearChunkReloadAttempt(
  storage = browserSessionStorage(),
): void {
  try {
    storage?.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    // A successful chunk load must stay successful even when storage is blocked.
  }
}

export function markChunkReloadAttempt(
  storage = browserSessionStorage(),
): boolean {
  try {
    if (!storage || storage.getItem(CHUNK_RELOAD_KEY) === '1') return false;
    storage.setItem(CHUNK_RELOAD_KEY, '1');
    return true;
  } catch {
    // Without durable session state, reloading could loop forever. Let the
    // ErrorBoundary surface the original chunk error instead.
    return false;
  }
}

type ChunkRecoveryRuntime = {
  storage?: SessionStorageLike;
  cacheStorage?: {
    keys(): Promise<string[]>;
    delete(name: string): Promise<boolean>;
  };
  serviceWorker?: {
    getRegistrations(): Promise<ReadonlyArray<{ unregister(): Promise<boolean> }>>;
  };
  location?: Pick<Location, 'href' | 'replace'>;
  now?: () => number;
};

/**
 * Recover from an old PWA shell pointing at a chunk that no longer exists.
 * A plain reload is insufficient because the active Service Worker can replay
 * the same stale index.html. Remove only this app's caches/worker, then request
 * a cache-busted shell once. WebLLM and third-party map caches are untouched.
 */
export async function recoverChunkLoadFailure(
  runtime: ChunkRecoveryRuntime = {},
): Promise<boolean> {
  if (!markChunkReloadAttempt(runtime.storage ?? browserSessionStorage())) return false;

  const cacheStorage = runtime.cacheStorage ?? globalThis.caches;
  const serviceWorker = runtime.serviceWorker ?? globalThis.navigator?.serviceWorker;
  const targetLocation = runtime.location ?? globalThis.location;
  const now = runtime.now ?? Date.now;

  await Promise.allSettled([
    cacheStorage
      ? cacheStorage.keys().then((names) => Promise.all(
        names
          .filter((name) => APP_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)))
          .map((name) => cacheStorage.delete(name)),
      ))
      : Promise.resolve(),
    serviceWorker
      ? serviceWorker.getRegistrations().then((registrations) => Promise.all(
        registrations.map((registration) => registration.unregister()),
      ))
      : Promise.resolve(),
  ]);

  if (!targetLocation) return false;
  const next = new URL(targetLocation.href);
  next.searchParams.set('__app_refresh', String(now()));
  targetLocation.replace(next.toString());
  return true;
}
