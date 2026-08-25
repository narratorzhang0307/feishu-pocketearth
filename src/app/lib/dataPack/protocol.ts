import {
  DATA_PACK_PROTOCOL,
  DATA_PACK_RUNTIME_VERSION,
  dataPackAdapterForSchema,
  type BookPackRecord,
  type DataPackDomain,
  type DataPackFile,
  type DataPackManifest,
  type DataPackRecord,
  type MappingPackRecord,
  type MusicCityPackRecord,
  type MoviePackRecord,
  type PhotoPackRecord,
} from './types';

const MAX_RECORDS = 50_000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const RUNTIME_SEMVER = /^\d+\.\d+\.\d+$/;
const SCHEMA_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*\/v[1-9]\d*$/;
const SKILL_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const DATE = /^(?:|\d{4}-\d{2}-\d{2})$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export class DataPackError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DataPackError';
  }
}

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DataPackError('schema', `${label} 必须是对象`);
  return value as Record<string, unknown>;
};

const string = (value: unknown, label: string, max = 500, allowEmpty = false): string => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) {
    throw new DataPackError('schema', `${label} 不是有效文本`);
  }
  return value;
};

const numberOrNull = (value: unknown, label: string, min: number, max: number): number | null => {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new DataPackError('schema', `${label} 超出范围`);
  }
  return value;
};

const requiredNumber = (value: unknown, label: string, min: number, max: number): number => {
  const result = numberOrNull(value, label, min, max);
  if (result === null) throw new DataPackError('schema', `${label} 必须是数字`);
  return result;
};

const integerOrNull = (value: unknown, label: string, min: number, max: number): number | null => {
  const n = numberOrNull(value, label, min, max);
  if (n !== null && !Number.isInteger(n)) throw new DataPackError('schema', `${label} 必须是整数`);
  return n;
};

const noExtraKeys = (value: Record<string, unknown>, allowed: string[], label: string) => {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) throw new DataPackError('schema', `${label} 包含未知字段 ${extra}`);
};

const compareVersions = (left: string, right: string): number => {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

function validateLocation(value: unknown, domain: DataPackDomain, label: string) {
  const v = object(value, label);
  noExtraKeys(v, ['kind', 'place', 'lng', 'lat', 'confidence'], label);
  const kinds = domain === 'books' ? ['story', 'author', 'country'] : ['filming', 'story', 'country'];
  if (!kinds.includes(String(v.kind))) throw new DataPackError('schema', `${label}.kind 不兼容`);
  string(v.place, `${label}.place`, 200);
  numberOrNull(v.lng, `${label}.lng`, -180, 180);
  numberOrNull(v.lat, `${label}.lat`, -90, 90);
  numberOrNull(v.confidence, `${label}.confidence`, 0, 1);
}

function validateLocations(value: unknown, domain: DataPackDomain, label: string) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 20) throw new DataPackError('schema', `${label} 不是有效地点数组`);
  value.forEach((item, index) => validateLocation(item, domain, `${label}[${index}]`));
}

export function validateBookRecord(value: unknown, index = 0): BookPackRecord {
  const label = `records[${index}]`;
  const v = object(value, label);
  noExtraKeys(v, ['id', 'title', 'author', 'country', 'type', 'year', 'rating', 'date', 'synopsis', 'locations'], label);
  string(v.id, `${label}.id`, 128);
  string(v.title, `${label}.title`, 300);
  string(v.author, `${label}.author`, 300, true);
  string(v.country, `${label}.country`, 120, true);
  string(v.type, `${label}.type`, 120, true);
  integerOrNull(v.year, `${label}.year`, 0, 3000);
  numberOrNull(v.rating, `${label}.rating`, 0, 5);
  const date = string(v.date, `${label}.date`, 10, true);
  if (!DATE.test(date)) throw new DataPackError('schema', `${label}.date 必须是 YYYY-MM-DD 或空字符串`);
  string(v.synopsis, `${label}.synopsis`, 4000, true);
  validateLocations(v.locations, 'books', `${label}.locations`);
  return value as BookPackRecord;
}

export function validateMovieRecord(value: unknown, index = 0): MoviePackRecord {
  const label = `records[${index}]`;
  const v = object(value, label);
  noExtraKeys(v, ['id', 'title', 'original', 'type', 'director', 'country', 'year', 'rating', 'publicRating', 'date', 'synopsis', 'locations'], label);
  string(v.id, `${label}.id`, 128);
  string(v.title, `${label}.title`, 300);
  string(v.original, `${label}.original`, 300, true);
  string(v.type, `${label}.type`, 120, true);
  string(v.director, `${label}.director`, 300, true);
  string(v.country, `${label}.country`, 120, true);
  integerOrNull(v.year, `${label}.year`, 0, 3000);
  numberOrNull(v.rating, `${label}.rating`, 0, 5);
  if (v.publicRating !== undefined) numberOrNull(v.publicRating, `${label}.publicRating`, 0, 10);
  const date = string(v.date, `${label}.date`, 10, true);
  if (!DATE.test(date)) throw new DataPackError('schema', `${label}.date 必须是 YYYY-MM-DD 或空字符串`);
  string(v.synopsis, `${label}.synopsis`, 4000, true);
  validateLocations(v.locations, 'movies', `${label}.locations`);
  return value as MoviePackRecord;
}

function validatePlayback(value: unknown, label: string) {
  const v = object(value, label);
  noExtraKeys(v, ['provider', 'url', 'sourceUrl', 'sourceId'], label);
  const provider = String(v.provider);
  if (!['oss', 'youtube', 'external', 'none'].includes(provider)) throw new DataPackError('schema', `${label}.provider 无效`);
  const url = string(v.url, `${label}.url`, 2000, true);
  if (url && !/^https:\/\//.test(url)) throw new DataPackError('schema', `${label}.url 必须是 HTTPS 地址`);
  let sourceUrl = '';
  if (v.sourceUrl !== undefined) {
    sourceUrl = string(v.sourceUrl, `${label}.sourceUrl`, 2000, true);
    if (sourceUrl && !/^https:\/\//.test(sourceUrl)) throw new DataPackError('schema', `${label}.sourceUrl 必须是 HTTPS 地址`);
  }
  const sourceId = v.sourceId === undefined ? '' : string(v.sourceId, `${label}.sourceId`, 300, true);
  if (provider === 'youtube') {
    if (url) throw new DataPackError('schema', `${label}.url 必须留空；YouTube 页面写入 sourceUrl`);
    if (!YOUTUBE_ID.test(sourceId)) throw new DataPackError('schema', `${label}.sourceId 必须是 11 位 YouTube 视频 ID`);
    if (!sourceUrl || youtubeIdFromSourceUrl(sourceUrl) !== sourceId) throw new DataPackError('schema', `${label}.sourceUrl 必须是与 sourceId 一致的 YouTube HTTPS 页面`);
  } else if (provider === 'oss' || provider === 'external') {
    if (!url) throw new DataPackError('schema', `${label}.url 必须是可直接播放的 HTTPS 音频地址`);
    if (v.sourceId !== undefined) throw new DataPackError('schema', `${label}.sourceId 仅供 YouTube 来源使用`);
  } else if (url || v.sourceId !== undefined || v.sourceUrl !== undefined) {
    throw new DataPackError('schema', `${label} 使用 provider=none 时只允许空 url`);
  }
}

function youtubeIdFromSourceUrl(input: string): string | null {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return YOUTUBE_ID.test(url.pathname.split('/').filter(Boolean)[0] || '') ? url.pathname.split('/').filter(Boolean)[0] : null;
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) return null;
    const queryId = url.searchParams.get('v') || '';
    if (YOUTUBE_ID.test(queryId)) return queryId;
    const parts = url.pathname.split('/').filter(Boolean);
    return ['embed', 'shorts', 'live'].includes(parts[0] || '') && YOUTUBE_ID.test(parts[1] || '') ? parts[1] : null;
  } catch { return null; }
}

export function validateMusicRecord(value: unknown, index = 0): MusicCityPackRecord {
  const label = `records[${index}]`;
  const v = object(value, label);
  noExtraKeys(v, ['id', 'slug', 'cityName', 'cityNameZh', 'ianaTz', 'tzOffset', 'station', 'cover', 'lat', 'lng', 'description', 'tracks', 'podcast'], label);
  string(v.id, `${label}.id`, 128);
  string(v.slug, `${label}.slug`, 128);
  string(v.cityName, `${label}.cityName`, 200);
  string(v.cityNameZh, `${label}.cityNameZh`, 200);
  if (v.ianaTz !== null) string(v.ianaTz, `${label}.ianaTz`, 120);
  requiredNumber(v.tzOffset, `${label}.tzOffset`, -24, 24);
  const station = object(v.station, `${label}.station`);
  noExtraKeys(station, ['freq', 'name'], `${label}.station`);
  requiredNumber(station.freq, `${label}.station.freq`, 0, 10_000);
  string(station.name, `${label}.station.name`, 200);
  const cover = string(v.cover, `${label}.cover`, 2000, true);
  if (cover && !/^https:\/\//.test(cover)) throw new DataPackError('schema', `${label}.cover 必须是 HTTPS 地址`);
  numberOrNull(v.lat, `${label}.lat`, -90, 90);
  numberOrNull(v.lng, `${label}.lng`, -180, 180);
  string(v.description, `${label}.description`, 1000, true);

  if (!Array.isArray(v.tracks) || v.tracks.length > 500) throw new DataPackError('schema', `${label}.tracks 不是有效曲目数组`);
  const trackIds = new Set<string>();
  v.tracks.forEach((item, trackIndex) => {
    const trackLabel = `${label}.tracks[${trackIndex}]`;
    const track = object(item, trackLabel);
    noExtraKeys(track, ['id', 'title', 'artist', 'genre', 'durationSec', 'playback', 'introText', 'introPlayback'], trackLabel);
    const id = string(track.id, `${trackLabel}.id`, 128);
    if (trackIds.has(id)) throw new DataPackError('duplicate_id', `曲目 ID 重复：${id}`);
    trackIds.add(id);
    string(track.title, `${trackLabel}.title`, 300);
    string(track.artist, `${trackLabel}.artist`, 300, true);
    string(track.genre, `${trackLabel}.genre`, 120, true);
    integerOrNull(track.durationSec, `${trackLabel}.durationSec`, 0, 86_400);
    validatePlayback(track.playback, `${trackLabel}.playback`);
    string(track.introText, `${trackLabel}.introText`, 10_000, true);
    validatePlayback(track.introPlayback, `${trackLabel}.introPlayback`);
  });

  if (!Array.isArray(v.podcast) || v.podcast.length > 100) throw new DataPackError('schema', `${label}.podcast 不是有效播客数组`);
  const podcastIds = new Set<string>();
  v.podcast.forEach((item, podcastIndex) => {
    const podcastLabel = `${label}.podcast[${podcastIndex}]`;
    const podcast = object(item, podcastLabel);
    noExtraKeys(podcast, ['id', 'title', 'subtitle', 'text', 'playback'], podcastLabel);
    const id = string(podcast.id, `${podcastLabel}.id`, 128);
    if (podcastIds.has(id)) throw new DataPackError('duplicate_id', `播客 ID 重复：${id}`);
    podcastIds.add(id);
    string(podcast.title, `${podcastLabel}.title`, 300);
    string(podcast.subtitle, `${podcastLabel}.subtitle`, 300, true);
    string(podcast.text, `${podcastLabel}.text`, 30_000, true);
    validatePlayback(podcast.playback, `${podcastLabel}.playback`);
  });
  return value as MusicCityPackRecord;
}

export function validatePhotoRecord(value: unknown, index = 0): PhotoPackRecord {
  const label = `records[${index}]`;
  const v = object(value, label);
  noExtraKeys(v, ['id', 'title', 'city', 'date', 'lat', 'lng', 'thumbnailUrl', 'contentHash', 'summary'], label);
  string(v.id, `${label}.id`, 128);
  string(v.title, `${label}.title`, 300);
  string(v.city, `${label}.city`, 200, true);
  const date = string(v.date, `${label}.date`, 10, true);
  if (!DATE.test(date)) throw new DataPackError('schema', `${label}.date 必须是 YYYY-MM-DD 或空字符串`);
  numberOrNull(v.lat, `${label}.lat`, -90, 90);
  numberOrNull(v.lng, `${label}.lng`, -180, 180);
  const thumbnailUrl = string(v.thumbnailUrl, `${label}.thumbnailUrl`, 2000, true);
  if (thumbnailUrl && !/^https:\/\//.test(thumbnailUrl)) throw new DataPackError('schema', `${label}.thumbnailUrl 必须是 HTTPS 地址`);
  string(v.contentHash, `${label}.contentHash`, 256, true);
  string(v.summary, `${label}.summary`, 4000, true);
  return value as PhotoPackRecord;
}

export function validateMappingRecord(value: unknown, index = 0): MappingPackRecord {
  const label = `records[${index}]`;
  const v = object(value, label);
  noExtraKeys(v, ['id', 'title', 'author', 'era', 'city', 'sourceName', 'sourceSha256', 'summary', 'locations'], label);
  string(v.id, `${label}.id`, 128);
  string(v.title, `${label}.title`, 300);
  string(v.author, `${label}.author`, 300, true);
  string(v.era, `${label}.era`, 160, true);
  string(v.city, `${label}.city`, 160, true);
  string(v.sourceName, `${label}.sourceName`, 500);
  const sourceSha256 = string(v.sourceSha256, `${label}.sourceSha256`, 64);
  if (!SHA256.test(sourceSha256)) throw new DataPackError('schema', `${label}.sourceSha256 无效`);
  string(v.summary, `${label}.summary`, 4000, true);
  if (!Array.isArray(v.locations) || !v.locations.length || v.locations.length > 500) {
    throw new DataPackError('schema', `${label}.locations 不是有效地点数组`);
  }
  const locationIds = new Set<string>();
  v.locations.forEach((item, locationIndex) => {
    const locationLabel = `${label}.locations[${locationIndex}]`;
    const location = object(item, locationLabel);
    noExtraKeys(location, ['id', 'name', 'status', 'relation', 'page', 'quote', 'note', 'lng', 'lat', 'confidence', 'confirmed', 'sourceRef', 'sourceUrls'], locationLabel);
    const id = string(location.id, `${locationLabel}.id`, 128);
    if (locationIds.has(id)) throw new DataPackError('duplicate_id', `地点 ID 重复：${id}`);
    locationIds.add(id);
    string(location.name, `${locationLabel}.name`, 300);
    if (!['extant', 'rebuilt', 'memory-only'].includes(String(location.status))) throw new DataPackError('schema', `${locationLabel}.status 无效`);
    if (!['scene', 'mentioned', 'route', 'subject'].includes(String(location.relation))) throw new DataPackError('schema', `${locationLabel}.relation 无效`);
    if (!Number.isInteger(location.page) || Number(location.page) < 1 || Number(location.page) > 1_000_000) throw new DataPackError('schema', `${locationLabel}.page 无效`);
    string(location.quote, `${locationLabel}.quote`, 2000);
    string(location.note, `${locationLabel}.note`, 2000, true);
    requiredNumber(location.lng, `${locationLabel}.lng`, -180, 180);
    requiredNumber(location.lat, `${locationLabel}.lat`, -90, 90);
    requiredNumber(location.confidence, `${locationLabel}.confidence`, 0, 1);
    if (location.confirmed !== true) throw new DataPackError('schema', `${locationLabel}.confirmed 必须为 true；未经人工确认的候选不能进入地图包`);
    if (location.sourceRef !== undefined) string(location.sourceRef, `${locationLabel}.sourceRef`, 500, true);
    if (location.sourceUrls !== undefined) {
      if (!Array.isArray(location.sourceUrls) || location.sourceUrls.length > 8) throw new DataPackError('schema', `${locationLabel}.sourceUrls 无效`);
      location.sourceUrls.forEach((url, urlIndex) => {
        const value = string(url, `${locationLabel}.sourceUrls[${urlIndex}]`, 2000);
        if (!/^https:\/\//.test(value)) throw new DataPackError('schema', `${locationLabel}.sourceUrls[${urlIndex}] 必须是 HTTPS 地址`);
      });
    }
  });
  return value as MappingPackRecord;
}

export function validateRecords(domain: DataPackDomain, values: unknown): DataPackRecord[] {
  if (!Array.isArray(values) || values.length > MAX_RECORDS) throw new DataPackError('schema', 'records 不是有效数组或数量过大');
  const ids = new Set<string>();
  const musicTrackIds = new Set<string>();
  return values.map((value, index) => {
    const record = domain === 'books'
      ? validateBookRecord(value, index)
      : domain === 'movies'
        ? validateMovieRecord(value, index)
        : domain === 'music'
          ? validateMusicRecord(value, index)
          : domain === 'photos'
            ? validatePhotoRecord(value, index)
            : validateMappingRecord(value, index);
    if (ids.has(record.id)) throw new DataPackError('duplicate_id', `记录 ID 重复：${record.id}`);
    ids.add(record.id);
    if (domain === 'music') {
      for (const track of (record as MusicCityPackRecord).tracks) {
        if (musicTrackIds.has(track.id)) throw new DataPackError('duplicate_id', `跨城市曲目 ID 重复：${track.id}`);
        musicTrackIds.add(track.id);
      }
    }
    return record;
  });
}

function validateFiles(value: unknown): DataPackFile[] {
  if (!Array.isArray(value) || !value.length || value.length > 500) throw new DataPackError('schema', 'files 不是有效分块清单');
  return value.map((item, index) => {
    const label = `files[${index}]`;
    const v = object(item, label);
    noExtraKeys(v, ['role', 'path', 'media_type', 'bytes', 'sha256', 'records'], label);
    if (v.role !== 'records' || v.media_type !== 'application/json') throw new DataPackError('schema', `${label} 文件角色或媒体类型不支持`);
    const path = string(v.path, `${label}.path`, 500);
    if (!SAFE_PATH.test(path)) throw new DataPackError('unsafe_path', `${label}.path 不是安全相对路径`);
    if (!Number.isInteger(v.bytes) || Number(v.bytes) < 2 || Number(v.bytes) > MAX_FILE_BYTES) throw new DataPackError('schema', `${label}.bytes 超出范围`);
    if (typeof v.sha256 !== 'string' || !SHA256.test(v.sha256)) throw new DataPackError('schema', `${label}.sha256 无效`);
    if (!Number.isInteger(v.records) || Number(v.records) < 0 || Number(v.records) > 10_000) throw new DataPackError('schema', `${label}.records 超出范围`);
    return item as DataPackFile;
  });
}

export interface ValidatedDataPackDocument {
  manifest: DataPackManifest;
  domain: DataPackDomain;
  inlineRecords: DataPackRecord[] | null;
}

export function validateDataPackDocument(value: unknown, expectedDomain?: DataPackDomain): ValidatedDataPackDocument {
  const v = object(value, 'Data Pack');
  noExtraKeys(v, ['protocol', 'identity', 'schema', 'compatibility', 'privacy', 'provenance', 'distribution', 'files', 'records'], 'Data Pack');
  if (v.protocol !== DATA_PACK_PROTOCOL) throw new DataPackError('protocol', `仅支持 ${DATA_PACK_PROTOCOL}`);

  const identity = object(v.identity, 'identity');
  noExtraKeys(identity, ['id', 'name', 'version', 'author', 'description'], 'identity');
  const id = string(identity.id, 'identity.id', 128);
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(id)) throw new DataPackError('schema', 'identity.id 必须是稳定的小写命名空间 ID');
  string(identity.name, 'identity.name', 80);
  const version = string(identity.version, 'identity.version', 80);
  if (!SEMVER.test(version)) throw new DataPackError('schema', 'identity.version 必须是语义化版本');
  string(identity.author, 'identity.author', 120);
  string(identity.description, 'identity.description', 500, true);

  const schema = object(v.schema, 'schema');
  noExtraKeys(schema, ['name', 'version', 'record_count'], 'schema');
  const schemaName = string(schema.name, 'schema.name', 128);
  if (!SCHEMA_ID.test(schemaName)) throw new DataPackError('schema', 'schema.name 必须是稳定命名空间加主版本，例如 example.exhibitions/v1');
  const schemaVersion = string(schema.version, 'schema.version', 80);
  if (!SEMVER.test(schemaVersion)) throw new DataPackError('schema', 'schema.version 必须是语义化版本');
  if (!Number.isInteger(schema.record_count) || Number(schema.record_count) < 0 || Number(schema.record_count) > MAX_RECORDS) throw new DataPackError('schema', 'schema.record_count 超出范围');
  const adapter = dataPackAdapterForSchema(schemaName);
  if (!adapter) throw new DataPackError('adapter', `该 Data Pack 符合 ${DATA_PACK_PROTOCOL}，但当前运行时尚未安装 ${schemaName} 适配器`);
  if (schemaVersion !== adapter.schemaVersion) throw new DataPackError('schema', `${schemaName} 适配器仅支持 Schema ${adapter.schemaVersion}`);
  const domain = adapter.domain;
  if (expectedDomain && domain !== expectedDomain) throw new DataPackError('domain', `该数据包属于 ${domain}，不能装入 ${expectedDomain} Skill`);

  const compatibility = object(v.compatibility, 'compatibility');
  noExtraKeys(compatibility, ['skills', 'runtime_min'], 'compatibility');
  if (!Array.isArray(compatibility.skills) || !compatibility.skills.length || compatibility.skills.length > 32 || compatibility.skills.some((skill) => typeof skill !== 'string' || !SKILL_ID.test(skill))) {
    throw new DataPackError('compatibility', 'compatibility.skills 必须是稳定 Skill ID 数组');
  }
  if (!compatibility.skills.includes(adapter.skillId)) throw new DataPackError('compatibility', `数据包未声明兼容 ${adapter.skillId}`);
  const runtimeMin = string(compatibility.runtime_min, 'compatibility.runtime_min', 40);
  if (!RUNTIME_SEMVER.test(runtimeMin)) throw new DataPackError('compatibility', 'compatibility.runtime_min 必须是语义化版本');
  if (compareVersions(runtimeMin, DATA_PACK_RUNTIME_VERSION) > 0) throw new DataPackError('compatibility', `数据包要求运行时 ${runtimeMin}，当前版本为 ${DATA_PACK_RUNTIME_VERSION}`);

  if (!['public', 'private', 'restricted'].includes(String(v.privacy))) throw new DataPackError('schema', 'privacy 无效');
  const provenance = object(v.provenance, 'provenance');
  noExtraKeys(provenance, ['source', 'license', 'generated_at'], 'provenance');
  string(provenance.source, 'provenance.source', 500);
  string(provenance.license, 'provenance.license', 120);
  const generatedAt = string(provenance.generated_at, 'provenance.generated_at', 80);
  if (Number.isNaN(Date.parse(generatedAt))) throw new DataPackError('schema', 'provenance.generated_at 不是 ISO 时间');

  const distribution = object(v.distribution, 'distribution');
  noExtraKeys(distribution, ['mode'], 'distribution');
  if (distribution.mode !== 'inline' && distribution.mode !== 'chunked') throw new DataPackError('schema', 'distribution.mode 无效');

  let inlineRecords: DataPackRecord[] | null = null;
  if (distribution.mode === 'inline') {
    inlineRecords = validateRecords(domain, v.records);
    if (inlineRecords.length !== schema.record_count) throw new DataPackError('record_count', 'records 数量与 schema.record_count 不一致');
  } else {
    const files = validateFiles(v.files);
    const count = files.reduce((sum, file) => sum + file.records, 0);
    if (count !== schema.record_count) throw new DataPackError('record_count', '分块记录数与 schema.record_count 不一致');
  }

  return { manifest: value as DataPackManifest, domain, inlineRecords };
}

export function safeDataPackUrl(input: string, base?: string): string {
  let url: URL;
  try { url = new URL(input, base || (typeof location !== 'undefined' ? location.href : undefined)); }
  catch { throw new DataPackError('url', '数据包 URL 无效'); }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) throw new DataPackError('url', '数据包只允许 HTTPS；本机开发地址可使用 HTTP');
  return url.href;
}

export function resolveDataPackFileUrl(manifestUrl: string, path: string): string {
  if (!SAFE_PATH.test(path)) throw new DataPackError('unsafe_path', '分块路径不安全');
  const base = new URL(safeDataPackUrl(manifestUrl));
  const resolved = new URL(path, base);
  if (resolved.origin !== base.origin) throw new DataPackError('url', '分块文件不得跳转到其他域名');
  return safeDataPackUrl(resolved.href);
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new DataPackError('crypto', '当前环境不支持 SHA256 校验');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const dataPackErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : '数据包处理失败'
);
