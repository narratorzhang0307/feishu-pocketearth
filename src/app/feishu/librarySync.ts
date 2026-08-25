import { getDataPackState, installDataPackRecords, removeDataPack, setDataPackMapLayerEnabled } from '../lib/dataPack';
import type { PhotoLibraryAsset } from '../lib/photo';
import type { UserMark } from '../data/userMarks';
import { getFeishuLibraryDomain, getFeishuLibraryVersions, requestFeishuLibrarySync } from './api';
import { upsertFeishuLibraryRecords } from './api';
import type { FeishuLibraryDomain, FeishuLibraryDomainData } from './types';

const VERSION_KEY = 'pocket-earth.feishu.library-versions.v1';
const PHOTO_KEY = 'pocket-earth.feishu.photos.v1';
const SOURCE_KEY = 'pocket-earth.feishu.library-sources.v1';
const DEFAULT_MAP_LAYERS_KEY = 'pocket-earth.feishu.default-map-layers.v1';
const PHOTO_EVENT = 'pocket-earth:feishu-photos';
const USER_MARK_EVENT = 'pocket-earth:user-mark-added';
const POLL_MS = 20_000;
const DATA_PACK_DOMAINS = new Set<FeishuLibraryDomain>(['books', 'movies', 'music', 'photos']);
const labels = { books: '书籍', movies: '电影', music: '音乐', photos: '照片' } as const;

type SyncState = {
  status: 'idle' | 'syncing' | 'ready' | 'error';
  configuredDomains: FeishuLibraryDomain[];
  versions: Partial<Record<FeishuLibraryDomain, string>>;
  rejected: Partial<Record<FeishuLibraryDomain, number>>;
  syncedAt: string;
  error: string;
  enabledDomains: FeishuLibraryDomain[];
};

let state: SyncState = { status: 'idle', configuredDomains: [], versions: {}, rejected: {}, syncedAt: '', error: '', enabledDomains: [...DATA_PACK_DOMAINS] };
let running: Promise<void> | null = null;
let started = false;
let timer = 0;
let currentScope = 'anonymous';
let refreshHandler: (() => void) | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());
const updateState = (next: Partial<SyncState>) => { state = { ...state, ...next }; notify(); };

const scopedKey = (key: string) => `${key}:${currentScope}`;

function storedVersions(): Partial<Record<FeishuLibraryDomain, string>> {
  try { return JSON.parse(localStorage.getItem(scopedKey(VERSION_KEY)) || '{}'); }
  catch { return {}; }
}

function saveVersions(versions: Partial<Record<FeishuLibraryDomain, string>>) {
  try { localStorage.setItem(scopedKey(VERSION_KEY), JSON.stringify(versions)); } catch { /* memory state remains usable */ }
}

function sourcePreferences(): Partial<Record<FeishuLibraryDomain, 'feishu' | 'personal'>> {
  try { return JSON.parse(localStorage.getItem(scopedKey(SOURCE_KEY)) || '{}'); }
  catch { return {}; }
}

const feishuSourceEnabled = (domain: FeishuLibraryDomain) => sourcePreferences()[domain] !== 'personal';

function saveSourcePreference(domain: FeishuLibraryDomain, source: 'feishu' | 'personal') {
  const preferences = sourcePreferences();
  preferences[domain] = source;
  try { localStorage.setItem(scopedKey(SOURCE_KEY), JSON.stringify(preferences)); } catch { /* memory state remains usable */ }
  updateState({ enabledDomains: (['books', 'movies', 'music', 'photos'] as FeishuLibraryDomain[]).filter(feishuSourceEnabled) });
}

/** Keep the Feishu "内置 ON" slots and the original Earth layer state consistent on first launch. */
export function enableFeishuBuiltinMapLayersOnce(): void {
  const key = scopedKey(DEFAULT_MAP_LAYERS_KEY);
  try {
    if (localStorage.getItem(key)) return;
    for (const domain of ['books', 'movies', 'music'] as const) {
      if (feishuSourceEnabled(domain)) setDataPackMapLayerEnabled(domain, true);
    }
    localStorage.setItem(key, '1');
  } catch { /* layer state remains user-controllable when storage is unavailable */ }
}

function safePhotoUrl(value: unknown): string {
  const url = String(value || '').trim();
  return /^https:\/\//i.test(url) ? url : '';
}

export function photoAssetFromFeishuRecord(value: unknown, now = Date.now()): PhotoLibraryAsset | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = String(record.id || '').trim();
  if (!id) return null;
  const thumbnailUrl = safePhotoUrl(record.thumb || record.thumbnailUrl || record.full || record.url);
  const creationTime = Date.parse(String(record.date || ''));
  return {
    key: `feishu:${id}`,
    assetId: id,
    source: 'web-picker',
    access: 'selected',
    mediaType: 'image',
    mimeType: String(record.mimeType || 'image/jpeg'),
    fileName: String(record.title || record.city || id),
    width: Number(record.width || 0),
    height: Number(record.height || 0),
    creationTime: Number.isFinite(creationTime) ? creationTime : undefined,
    latitude: typeof record.lat === 'number' ? record.lat : undefined,
    longitude: typeof record.lng === 'number' ? record.lng : undefined,
    thumbnailRef: thumbnailUrl || undefined,
    thumbnailUrl: thumbnailUrl || undefined,
    indexedAt: now,
    lastSeenAt: now,
    analysisState: 'pending',
    sourceState: thumbnailUrl ? 'available' : 'missing',
    curated: true,
    contentHash: String(record.contentHash || '').trim() || undefined,
  };
}

const metaText = (meta: Record<string, unknown>, key: string, fallback = '') => String(meta[key] ?? fallback).trim();
const metaNumber = (meta: Record<string, unknown>, key: string): number | null => {
  const value = Number(meta[key]);
  return Number.isFinite(value) ? value : null;
};

export function libraryRecordFromUserMark(mark: UserMark): { domain: FeishuLibraryDomain; record: Record<string, unknown> } | null {
  const meta = mark.meta || {};
  if (mark.kind === 'book') return { domain: 'books', record: {
    id: mark.id, title: metaText(meta, 'title', mark.label || '未命名书籍'), author: metaText(meta, 'author'),
    country: metaText(meta, 'country'), type: metaText(meta, 'genre'), year: metaNumber(meta, 'year'), rating: metaNumber(meta, 'rating'),
    date: metaText(meta, 'date'), synopsis: metaText(meta, 'synopsis', metaText(meta, 'plot')),
    locations: [{ kind: ['author', 'country'].includes(metaText(meta, 'geoKind')) ? metaText(meta, 'geoKind') : 'story', place: metaText(meta, 'place', mark.label || ''), lng: mark.lng, lat: mark.lat, confidence: 1 }],
  } };
  if (mark.kind === 'movie') return { domain: 'movies', record: {
    id: mark.id, title: metaText(meta, 'title', mark.label || '未命名电影'), original: metaText(meta, 'original'), type: metaText(meta, 'type', metaText(meta, 'genre')),
    director: metaText(meta, 'director'), country: metaText(meta, 'country'), year: metaNumber(meta, 'year'), rating: metaNumber(meta, 'rating'),
    publicRating: metaNumber(meta, 'douban'), date: metaText(meta, 'date'), synopsis: metaText(meta, 'synopsis', metaText(meta, 'plot')),
    locations: [{ kind: ['story', 'country'].includes(metaText(meta, 'geoKind')) ? metaText(meta, 'geoKind') : 'filming', place: metaText(meta, 'place', mark.label || ''), lng: mark.lng, lat: mark.lat, confidence: 1 }],
  } };
  if (mark.kind === 'music') {
    const city = metaText(meta, 'city', mark.label || '未命名城市');
    const title = metaText(meta, 'track', mark.label || '未命名曲目');
    return { domain: 'music', record: {
      id: mark.id, slug: mark.id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'), cityName: city, cityNameZh: city,
      ianaTz: null, tzOffset: 0, station: { freq: 0, name: `${city} · Pocket Earth` }, cover: '', lat: mark.lat, lng: mark.lng,
      description: '由用户在 Pocket Earth 确认并同步到飞书。', tracks: [{
        id: `${mark.id}-track`, title, artist: metaText(meta, 'artist'), genre: metaText(meta, 'genre'), durationSec: null,
        playback: { provider: 'none', url: '' }, introText: '', introPlayback: { provider: 'none', url: '' },
      }], podcast: [],
    } };
  }
  if (mark.kind === 'photo') return { domain: 'photos', record: {
    id: metaText(meta, 'contentHash') ? `photo:${metaText(meta, 'contentHash')}` : mark.id,
    title: mark.label || metaText(meta, 'city', '我的照片'), city: metaText(meta, 'city', mark.label || ''),
    date: mark.createdAt.slice(0, 10), lat: mark.lat, lng: mark.lng,
    thumbnailUrl: safePhotoUrl(meta.thumb || meta.thumbnailUrl), contentHash: metaText(meta, 'contentHash'),
    summary: metaText(meta, 'summary'),
  } };
  return null;
}

export function getFeishuPhotoAssets(): PhotoLibraryAsset[] {
  try {
    const records = JSON.parse(localStorage.getItem(scopedKey(PHOTO_KEY)) || '[]') as unknown[];
    return Array.isArray(records) ? records.map((record) => photoAssetFromFeishuRecord(record)).filter((asset): asset is PhotoLibraryAsset => Boolean(asset)) : [];
  } catch { return []; }
}

export function subscribeFeishuPhotoAssets(listener: () => void): () => void {
  window.addEventListener(PHOTO_EVENT, listener);
  return () => window.removeEventListener(PHOTO_EVENT, listener);
}

async function applyDomain(data: FeishuLibraryDomainData) {
  if (!feishuSourceEnabled(data.domain)) return;
  if (DATA_PACK_DOMAINS.has(data.domain)) {
    const records = compactFeishuRuntimeRecords(data.domain, data.records);
    await installDataPackRecords(data.domain, records, {
      version: data.version,
      source: `feishu-bitable:${data.domain}:${data.version}`,
      name: `飞书多维表格 · ${labels[data.domain]}`,
    });
    if (data.domain !== 'photos') setDataPackMapLayerEnabled(data.domain, true);
    if (data.domain === 'photos') {
      try { localStorage.setItem(scopedKey(PHOTO_KEY), JSON.stringify(records)); } catch { /* keep previous cache when quota is full */ }
      window.dispatchEvent(new Event(PHOTO_EVENT));
    }
  }
  const versions = { ...state.versions, [data.domain]: data.version };
  const rejected = { ...state.rejected, [data.domain]: data.rejected.length };
  saveVersions(versions);
  updateState({ versions, rejected, syncedAt: data.syncedAt });
}

/**
 * The Feishu music table stores one collaborative knowledge row per city. Some legacy rows contain
 * a whole city playlist, which made a 100-row demo expand back into hundreds of tracks in the Web
 * App. Keep one representative track per row in the runtime projection; the source table remains
 * untouched and adding/removing a row changes the visible knowledge count by exactly one.
 */
export function compactFeishuRuntimeRecords(domain: FeishuLibraryDomain, records: unknown[]): unknown[] {
  if (!DATA_PACK_DOMAINS.has(domain)) return records;
  return records.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'aiInstruction' && key !== 'note'));
    if (domain === 'photos') return {
      id: String(record.id || '').trim(),
      title: String(record.title || record.city || '').trim(),
      city: String(record.city || '').trim(),
      date: String(record.date || '').trim(),
      lat: typeof record.lat === 'number' ? record.lat : null,
      lng: typeof record.lng === 'number' ? record.lng : null,
      thumbnailUrl: safePhotoUrl(record.thumbnailUrl || record.thumb || record.full),
      contentHash: String(record.contentHash || '').trim(),
      summary: String(record.summary || (record.qwen as Record<string, unknown> | undefined)?.summary || '').trim(),
    };
    if (domain !== 'music') return record;
    return {
      ...record,
      tracks: Array.isArray(record.tracks) ? record.tracks.slice(0, 1) : [],
      podcast: [],
    };
  });
}

export async function syncFeishuLibrary({ force = false } = {}): Promise<void> {
  if (running) return running;
  running = (async () => {
    updateState({ status: 'syncing', error: '' });
    try {
      const versions = await getFeishuLibraryVersions();
      updateState({ configuredDomains: versions.configuredDomains });
      for (const domain of versions.configuredDomains) {
        const remote = versions.domains[domain];
        const active = DATA_PACK_DOMAINS.has(domain)
          ? getDataPackState(domain as 'books' | 'movies' | 'music').active
          : null;
        const runtimeProjectionCurrent = DATA_PACK_DOMAINS.has(domain)
          ? active?.source === `feishu-bitable:${domain}:${remote?.version}`
          : getFeishuPhotoAssets().length > 0;
        // A forced launch sync must replace stale IndexedDB projections even when the remembered
        // remote version happens to match. This is what removes records deleted in Feishu from the UI.
        if (remote && (force || remote.version !== state.versions[domain] || !runtimeProjectionCurrent)) {
          await applyDomain(await getFeishuLibraryDomain(domain));
        }
      }
      updateState({ status: 'ready', syncedAt: new Date().toISOString() });
    } catch (error) {
      updateState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  })().finally(() => { running = null; });
  return running;
}

export async function syncFeishuLibraryNow(domains?: FeishuLibraryDomain[]): Promise<void> {
  if (running) await running;
  updateState({ status: 'syncing', error: '' });
  try {
    const result = await requestFeishuLibrarySync(domains);
    updateState({ configuredDomains: result.snapshot.configuredDomains });
    const requested = domains?.length ? domains : result.snapshot.configuredDomains;
    for (const domain of requested) {
      const data = result.snapshot.domains[domain];
      if (data) await applyDomain(data);
    }
    updateState({ status: 'ready', syncedAt: result.snapshot.syncedAt });
  } catch (error) {
    updateState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function setFeishuLibraryDomainEnabled(domain: FeishuLibraryDomain, enabled: boolean): Promise<void> {
  saveSourcePreference(domain, enabled ? 'feishu' : 'personal');
  if (enabled) {
    if (state.configuredDomains.includes(domain)) await applyDomain(await getFeishuLibraryDomain(domain));
    return;
  }
  if (domain === 'photos') {
    try { localStorage.removeItem(scopedKey(PHOTO_KEY)); } catch { /* ignore */ }
    window.dispatchEvent(new Event(PHOTO_EVENT));
  }
  const active = getDataPackState(domain).active;
  if (active) await removeDataPack(active.packKey);
}

/** Called by DataPackManager before a user installs or unloads a personal pack. */
export function selectPersonalDataSource(domain: Exclude<FeishuLibraryDomain, never>): void {
  saveSourcePreference(domain, 'personal');
}

export function startFeishuLibraryAutoSync(userScope = 'anonymous'): void {
  const nextScope = String(userScope || 'anonymous').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128) || 'anonymous';
  if (started && currentScope === nextScope) {
    void syncFeishuLibrary().catch(() => {});
    return;
  }
  if (started) stopFeishuLibraryAutoSync();
  currentScope = nextScope;
  started = true;
  state = {
    ...state,
    versions: storedVersions(),
    enabledDomains: (['books', 'movies', 'music', 'photos'] as FeishuLibraryDomain[]).filter(feishuSourceEnabled),
  };
  refreshHandler = () => { if (document.visibilityState !== 'hidden') void syncFeishuLibrary().catch(() => {}); };
  window.addEventListener('focus', refreshHandler);
  document.addEventListener('visibilitychange', refreshHandler);
  window.addEventListener(USER_MARK_EVENT, mirrorUserMark as EventListener);
  timer = window.setInterval(() => {
    if (document.visibilityState !== 'hidden') void syncFeishuLibrary().catch(() => {});
  }, POLL_MS);
  void syncFeishuLibrary({ force: true }).catch(() => {});
}

function mirrorUserMark(event: CustomEvent<UserMark>) {
  const mapped = libraryRecordFromUserMark(event.detail);
  if (!mapped || !state.configuredDomains.includes(mapped.domain)) return;
  void upsertFeishuLibraryRecords(mapped.domain, [mapped.record])
    .then(() => syncFeishuLibrary().catch(() => {}))
    .catch((error) => updateState({ error: `写入飞书多维表格失败：${error instanceof Error ? error.message : String(error)}` }));
}

export function stopFeishuLibraryAutoSync(): void {
  if (!started) return;
  started = false;
  window.clearInterval(timer);
  if (refreshHandler) {
    window.removeEventListener('focus', refreshHandler);
    document.removeEventListener('visibilitychange', refreshHandler);
    refreshHandler = null;
  }
  window.removeEventListener(USER_MARK_EVENT, mirrorUserMark as EventListener);
  timer = 0;
}

export const getFeishuLibrarySyncState = (): SyncState => state;
export const subscribeFeishuLibrarySync = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
