import { deleteInstalledPack, getInstalledPack, listInstalledPacks, putInstalledPack } from './idb';
import {
  DataPackError,
  dataPackErrorMessage,
  resolveDataPackFileUrl,
  safeDataPackUrl,
  sha256Hex,
  validateDataPackDocument,
  validateRecords,
} from './protocol';
import {
  DATA_PACK_PROTOCOL,
  DATA_PACK_RUNTIME_VERSION,
  dataPackAdapterForDomain,
  packKeyOf,
  type DataPackDomain,
  type DataPackRecord,
  type DataPackState,
  type InstalledDataPack,
} from './types';
import { setDataPackMapLayerEnabled } from './mapLayer';

const ACTIVE_KEY = 'pe.dataPacks.active.v1';
const DISABLED_KEY = 'pe.dataPacks.disabled.v1';
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

export const DEFAULT_DATA_PACK_URLS: Record<DataPackDomain, string> = {
  // The Feishu build ships dedicated 100-record demo projections on the same HTTPS origin. Large
  // media stays on OSS through validated playback/image references; the JSON itself stays tiny.
  books: import.meta.env.VITE_BOOKS_DATA_PACK_URL || '/data-packs/feishu-pocket-earth-books/1.0.0/manifest.json',
  movies: import.meta.env.VITE_MOVIES_DATA_PACK_URL || '/data-packs/feishu-pocket-earth-movies/1.0.0/manifest.json',
  music: import.meta.env.VITE_MUSIC_DATA_PACK_URL || '/data-packs/feishu-pocket-earth-music/1.0.0/manifest.json',
  mapping: import.meta.env.VITE_MAPPING_DATA_PACK_URL || '',
};

const REPLACEABLE_DEMO_PACK_IDS: Partial<Record<DataPackDomain, string[]>> = {
  // v1 of the Feishu book demo still contained temporary verification rows. Treat it like the
  // original legacy demo so existing WebViews install the cleaned v2 pack once. Personal and
  // Feishu-synced packs use different ids and are never replaced here.
  books: ['earth.pocket.demo.books', 'earth.pocket.feishu.demo.books'],
  movies: ['earth.pocket.demo.movies'],
  music: ['earth.pocket.demo.music'],
};

const states: Record<DataPackDomain, DataPackState> = {
  books: { status: 'idle', active: null, error: '' },
  movies: { status: 'idle', active: null, error: '' },
  music: { status: 'idle', active: null, error: '' },
  mapping: { status: 'idle', active: null, error: '' },
};
const listeners = new Set<() => void>();
const pending: Partial<Record<DataPackDomain, Promise<InstalledDataPack | null>>> = {};
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

const notify = () => listeners.forEach((listener) => listener());
const setState = (domain: DataPackDomain, next: Partial<DataPackState>) => {
  states[domain] = { ...states[domain], ...next };
  notify();
};

function readMap(key: string): Partial<Record<DataPackDomain, string | boolean>> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function writeMap(key: string, value: Partial<Record<DataPackDomain, string | boolean>>) {
  localStorage.setItem(key, JSON.stringify(value));
}

function activeKeys(): Partial<Record<DataPackDomain, string>> {
  return readMap(ACTIVE_KEY) as Partial<Record<DataPackDomain, string>>;
}

function disabledDomains(): Partial<Record<DataPackDomain, boolean>> {
  return readMap(DISABLED_KEY) as Partial<Record<DataPackDomain, boolean>>;
}

function setActiveKey(domain: DataPackDomain, packKey: string | null) {
  const keys = activeKeys();
  if (packKey) keys[domain] = packKey;
  else delete keys[domain];
  writeMap(ACTIVE_KEY, keys);
}

function setDisabled(domain: DataPackDomain, disabled: boolean) {
  const values = disabledDomains();
  if (disabled) values[domain] = true;
  else delete values[domain];
  writeMap(DISABLED_KEY, values);
}

async function responseBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new DataPackError('download', `下载失败 ${response.status}：${url}`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_DOWNLOAD_BYTES) throw new DataPackError('size', '数据包文件超过 50MB 限制');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new DataPackError('size', '数据包文件超过 50MB 限制');
  return bytes;
}

function parseJson(bytes: ArrayBuffer, label: string): unknown {
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new DataPackError('json', `${label} 不是有效 JSON`); }
}

async function loadFromUrl(input: string, expectedDomain: DataPackDomain): Promise<InstalledDataPack> {
  const manifestUrl = safeDataPackUrl(input);
  const manifestBytes = await responseBytes(manifestUrl);
  const document = validateDataPackDocument(parseJson(manifestBytes, 'Data Pack'), expectedDomain);
  let records: DataPackRecord[];
  if (document.inlineRecords) {
    records = document.inlineRecords;
  } else {
    const loaded: unknown[] = [];
    for (const file of document.manifest.files || []) {
      const fileUrl = resolveDataPackFileUrl(manifestUrl, file.path);
      const bytes = await responseBytes(fileUrl);
      if (bytes.byteLength !== file.bytes) throw new DataPackError('size', `${file.path} 大小不匹配`);
      const digest = await sha256Hex(bytes);
      if (digest !== file.sha256) throw new DataPackError('sha256', `${file.path} SHA256 不匹配`);
      const values = parseJson(bytes, file.path);
      if (!Array.isArray(values) || values.length !== file.records) throw new DataPackError('record_count', `${file.path} 记录数不匹配`);
      loaded.push(...values);
    }
    records = validateRecords(document.domain, loaded);
  }
  if (records.length !== document.manifest.schema.record_count) throw new DataPackError('record_count', 'Data Pack 总记录数不匹配');
  return {
    packKey: packKeyOf(document.manifest),
    domain: document.domain,
    manifest: document.manifest,
    records,
    installedAt: new Date().toISOString(),
    source: manifestUrl,
  };
}

async function loadFromFile(file: File, expectedDomain: DataPackDomain): Promise<InstalledDataPack> {
  if (file.size > MAX_DOWNLOAD_BYTES) throw new DataPackError('size', '本地 Bundle 超过 50MB 限制');
  const bytes = await file.arrayBuffer();
  const document = validateDataPackDocument(parseJson(bytes, file.name), expectedDomain);
  if (!document.inlineRecords) throw new DataPackError('local_manifest', '本地导入必须是包含 records 的单文件 Bundle');
  return {
    packKey: packKeyOf(document.manifest),
    domain: document.domain,
    manifest: document.manifest,
    records: document.inlineRecords,
    installedAt: new Date().toISOString(),
    source: `file:${file.name}`,
  };
}

async function persistAndActivate(pack: InstalledDataPack): Promise<InstalledDataPack> {
  // A Feishu sync can finish while the IndexedDB registry is still hydrating on first launch.
  // Finish hydration first so its older active key cannot overwrite the freshly synced projection.
  await hydrate();
  await putInstalledPack(pack);
  setActiveKey(pack.domain, pack.packKey);
  setDisabled(pack.domain, false);
  setState(pack.domain, { status: 'ready', active: pack, error: '' });
  return pack;
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const keys = activeKeys();
      await Promise.all((Object.keys(states) as DataPackDomain[]).map(async (domain) => {
        const packKey = keys[domain];
        if (!packKey) return;
        const pack = await getInstalledPack(packKey);
        if (pack) states[domain] = { status: 'ready', active: pack, error: '' };
        else setActiveKey(domain, null);
      }));
      hydrated = true;
      notify();
    })().finally(() => { hydratePromise = null; });
  }
  await hydratePromise;
}

export const subscribeDataPacks = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getDataPackState = (domain: DataPackDomain): DataPackState => states[domain];

export async function ensureActiveDataPack(domain: DataPackDomain): Promise<InstalledDataPack | null> {
  await hydrate();
  const active = states[domain].active;
  const replaceableDemoIds = REPLACEABLE_DEMO_PACK_IDS[domain] || [];
  if (active && !replaceableDemoIds.includes(active.manifest.identity.id)) return active;
  if (disabledDomains()[domain]) return null;
  if (!DEFAULT_DATA_PACK_URLS[domain]) return null;
  if (pending[domain]) return pending[domain]!;
  const task = installDataPackFromUrl(domain, DEFAULT_DATA_PACK_URLS[domain]).finally(() => { delete pending[domain]; });
  pending[domain] = task;
  return task;
}

export async function installDataPackFromUrl(domain: DataPackDomain, url: string): Promise<InstalledDataPack> {
  setState(domain, { status: 'loading', error: '' });
  try { return await persistAndActivate(await loadFromUrl(url, domain)); }
  catch (error) {
    setState(domain, { status: states[domain].active ? 'ready' : 'error', error: dataPackErrorMessage(error) });
    throw error;
  }
}

export async function installDataPackFromFile(domain: DataPackDomain, file: File): Promise<InstalledDataPack> {
  setState(domain, { status: 'loading', error: '' });
  try { return await persistAndActivate(await loadFromFile(file, domain)); }
  catch (error) {
    setState(domain, { status: states[domain].active ? 'ready' : 'error', error: dataPackErrorMessage(error) });
    throw error;
  }
}

/** Install a server-validated record projection (for example Feishu Bitable) into the normal Data Pack runtime. */
export async function installDataPackRecords(
  domain: DataPackDomain,
  values: unknown[],
  options: { version: string; source: string; name?: string },
): Promise<InstalledDataPack> {
  setState(domain, { status: 'loading', error: '' });
  try {
    const records = validateRecords(domain, values);
    const adapter = dataPackAdapterForDomain(domain);
    const revision = Number.parseInt(options.version.slice(0, 8), 16);
    const version = `1.0.${Number.isFinite(revision) ? revision : Date.now()}`;
    const generatedAt = new Date().toISOString();
    return await persistAndActivate({
      packKey: `feishu-bitable-${domain}@${version}`,
      domain,
      manifest: {
        protocol: DATA_PACK_PROTOCOL,
        identity: {
          id: `feishu-bitable-${domain}`,
          name: options.name || `飞书多维表格 · ${domain}`,
          version,
          author: 'Pocket Earth × 飞书',
          description: '由飞书多维表格自动同步、经原 Pocket Data Pack Schema 校验的运行时投影。',
        },
        schema: { name: adapter.schemaName, version: adapter.schemaVersion, record_count: records.length },
        compatibility: { skills: [adapter.skillId], runtime_min: DATA_PACK_RUNTIME_VERSION },
        privacy: 'restricted',
        provenance: { source: options.source, license: 'private-collaborative', generated_at: generatedAt },
        distribution: { mode: 'inline' },
        records,
      },
      records,
      installedAt: generatedAt,
      source: options.source,
    });
  } catch (error) {
    setState(domain, { status: states[domain].active ? 'ready' : 'error', error: dataPackErrorMessage(error) });
    throw error;
  }
}

export async function activateDataPack(packKey: string): Promise<InstalledDataPack> {
  const pack = await getInstalledPack(packKey);
  if (!pack) throw new DataPackError('missing', '找不到已安装的数据包');
  setActiveKey(pack.domain, pack.packKey);
  setDisabled(pack.domain, false);
  setState(pack.domain, { status: 'ready', active: pack, error: '' });
  return pack;
}

export async function removeDataPack(packKey: string): Promise<void> {
  const pack = await getInstalledPack(packKey);
  if (!pack) return;
  await deleteInstalledPack(packKey);
  if (states[pack.domain].active?.packKey === packKey) {
    setActiveKey(pack.domain, null);
    setDisabled(pack.domain, true);
    setDataPackMapLayerEnabled(pack.domain, false);
    setState(pack.domain, { status: 'idle', active: null, error: '' });
  } else notify();
}

export const installedDataPacks = (domain?: DataPackDomain): Promise<InstalledDataPack[]> => listInstalledPacks(domain);

export async function installDefaultDataPack(domain: DataPackDomain): Promise<InstalledDataPack> {
  setDisabled(domain, false);
  return installDataPackFromUrl(domain, DEFAULT_DATA_PACK_URLS[domain]);
}

/** 一键恢复比赛演示基线：重新装备三个官方示例库，并把它们落位到地图。 */
export async function restoreDemoDataPacks(): Promise<Record<'books' | 'movies' | 'music', InstalledDataPack>> {
  const domains: Array<'books' | 'movies' | 'music'> = ['books', 'movies', 'music'];
  const packs = await Promise.all(domains.map((domain) => installDefaultDataPack(domain)));
  domains.forEach((domain) => setDataPackMapLayerEnabled(domain, true));
  return Object.fromEntries(domains.map((domain, index) => [domain, packs[index]])) as Record<'books' | 'movies' | 'music', InstalledDataPack>;
}
