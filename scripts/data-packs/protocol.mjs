import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const RUNTIME_SEMVER = /^\d+\.\d+\.\d+$/;
const SCHEMA_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*\/v[1-9]\d*$/;
const SKILL_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const DATE = /^(?:|\d{4}-\d{2}-\d{2})$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const RUNTIME_VERSION = '1.0.0';
const ADAPTERS = [
  { domain: 'books', schemaName: 'pocket.books/v1', schemaVersion: '1.0.0', skillId: 'pocket.books' },
  { domain: 'movies', schemaName: 'pocket.movies/v1', schemaVersion: '1.0.0', skillId: 'pocket.movies' },
  { domain: 'music', schemaName: 'pocket.music/v1', schemaVersion: '1.0.0', skillId: 'pocket.music' },
  { domain: 'photos', schemaName: 'pocket.photos/v1', schemaVersion: '1.0.0', skillId: 'pocket.photos' },
  { domain: 'mapping', schemaName: 'pocket.mapping/v1', schemaVersion: '1.0.0', skillId: 'pocket.mapping' },
];

const fail = (message) => { throw new Error(message); };
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, label, { empty = false, max = 500 } = {}) => {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) fail(`${label} 无效`);
};
const numberOrNull = (value, label, min, max, integer = false) => {
  if (value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(`${label} 超出范围`);
};
const requiredNumber = (value, label, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} 超出范围`);
};
const noExtraKeys = (value, allowed, label) => {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) fail(`${label} 包含未知字段 ${extra}`);
};
const compareVersions = (left, right) => {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

function validateLocation(value, domain, label) {
  if (!isObject(value)) fail(`${label} 不是对象`);
  noExtraKeys(value, ['kind', 'place', 'lng', 'lat', 'confidence'], label);
  const kinds = domain === 'books' ? ['story', 'author', 'country'] : ['filming', 'story', 'country'];
  if (!kinds.includes(value.kind)) fail(`${label}.kind 不兼容`);
  text(value.place, `${label}.place`, { max: 200 });
  numberOrNull(value.lng, `${label}.lng`, -180, 180);
  numberOrNull(value.lat, `${label}.lat`, -90, 90);
  numberOrNull(value.confidence, `${label}.confidence`, 0, 1);
}

function validatePlayback(value, label) {
  if (!isObject(value) || !['oss', 'youtube', 'external', 'none'].includes(value.provider)) fail(`${label} 无效`);
  noExtraKeys(value, ['provider', 'url', 'sourceUrl', 'sourceId'], label);
  text(value.url, `${label}.url`, { empty: true, max: 2000 });
  if (value.url && !/^https:\/\//.test(value.url)) fail(`${label}.url 必须是 HTTPS 地址`);
  let sourceUrl = '';
  if (value.sourceUrl !== undefined) {
    text(value.sourceUrl, `${label}.sourceUrl`, { empty: true, max: 2000 });
    if (value.sourceUrl && !/^https:\/\//.test(value.sourceUrl)) fail(`${label}.sourceUrl 必须是 HTTPS 地址`);
    sourceUrl = value.sourceUrl;
  }
  if (value.sourceId !== undefined) text(value.sourceId, `${label}.sourceId`, { empty: true, max: 300 });
  const sourceId = value.sourceId || '';
  if (value.provider === 'youtube') {
    if (value.url) fail(`${label}.url 必须留空；YouTube 页面写入 sourceUrl`);
    if (!YOUTUBE_ID.test(sourceId)) fail(`${label}.sourceId 必须是 11 位 YouTube 视频 ID`);
    if (!sourceUrl || youtubeIdFromSourceUrl(sourceUrl) !== sourceId) fail(`${label}.sourceUrl 必须是与 sourceId 一致的 YouTube HTTPS 页面`);
  } else if (value.provider === 'oss' || value.provider === 'external') {
    if (!value.url) fail(`${label}.url 必须是可直接播放的 HTTPS 音频地址`);
    if (value.sourceId !== undefined) fail(`${label}.sourceId 仅供 YouTube 来源使用`);
  } else if (value.url || value.sourceId !== undefined || value.sourceUrl !== undefined) {
    fail(`${label} 使用 provider=none 时只允许空 url`);
  }
}

function youtubeIdFromSourceUrl(input) {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return YOUTUBE_ID.test(id) ? id : null;
    }
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) return null;
    const queryId = url.searchParams.get('v') || '';
    if (YOUTUBE_ID.test(queryId)) return queryId;
    const parts = url.pathname.split('/').filter(Boolean);
    return ['embed', 'shorts', 'live'].includes(parts[0] || '') && YOUTUBE_ID.test(parts[1] || '') ? parts[1] : null;
  } catch { return null; }
}

function validateMusicRecord(value, index) {
  const label = `records[${index}]`;
  if (!isObject(value)) fail(`${label} 不是对象`);
  noExtraKeys(value, ['id', 'slug', 'cityName', 'cityNameZh', 'ianaTz', 'tzOffset', 'station', 'cover', 'lat', 'lng', 'description', 'tracks', 'podcast'], label);
  text(value.id, `${label}.id`, { max: 128 });
  text(value.slug, `${label}.slug`, { max: 128 });
  text(value.cityName, `${label}.cityName`, { max: 200 });
  text(value.cityNameZh, `${label}.cityNameZh`, { max: 200 });
  if (value.ianaTz !== null) text(value.ianaTz, `${label}.ianaTz`, { max: 120 });
  requiredNumber(value.tzOffset, `${label}.tzOffset`, -24, 24);
  if (!isObject(value.station)) fail(`${label}.station 无效`);
  noExtraKeys(value.station, ['freq', 'name'], `${label}.station`);
  requiredNumber(value.station.freq, `${label}.station.freq`, 0, 10_000);
  text(value.station.name, `${label}.station.name`, { max: 200 });
  text(value.cover, `${label}.cover`, { empty: true, max: 2000 });
  if (value.cover && !/^https:\/\//.test(value.cover)) fail(`${label}.cover 必须是 HTTPS 地址`);
  numberOrNull(value.lat, `${label}.lat`, -90, 90);
  numberOrNull(value.lng, `${label}.lng`, -180, 180);
  text(value.description, `${label}.description`, { empty: true, max: 1000 });
  if (!Array.isArray(value.tracks) || value.tracks.length > 500) fail(`${label}.tracks 无效`);
  const trackIds = new Set();
  for (const [trackIndex, track] of value.tracks.entries()) {
    const trackLabel = `${label}.tracks[${trackIndex}]`;
    if (!isObject(track)) fail(`${trackLabel} 不是对象`);
    noExtraKeys(track, ['id', 'title', 'artist', 'genre', 'durationSec', 'playback', 'introText', 'introPlayback'], trackLabel);
    text(track.id, `${trackLabel}.id`, { max: 128 });
    if (trackIds.has(track.id)) fail(`曲目 ID 重复：${track.id}`);
    trackIds.add(track.id);
    text(track.title, `${trackLabel}.title`, { max: 300 });
    text(track.artist, `${trackLabel}.artist`, { empty: true, max: 300 });
    text(track.genre, `${trackLabel}.genre`, { empty: true, max: 120 });
    numberOrNull(track.durationSec, `${trackLabel}.durationSec`, 0, 86_400, true);
    validatePlayback(track.playback, `${trackLabel}.playback`);
    text(track.introText, `${trackLabel}.introText`, { empty: true, max: 10_000 });
    validatePlayback(track.introPlayback, `${trackLabel}.introPlayback`);
  }
  if (!Array.isArray(value.podcast) || value.podcast.length > 100) fail(`${label}.podcast 无效`);
  const podcastIds = new Set();
  for (const [podcastIndex, podcast] of value.podcast.entries()) {
    const podcastLabel = `${label}.podcast[${podcastIndex}]`;
    if (!isObject(podcast)) fail(`${podcastLabel} 不是对象`);
    noExtraKeys(podcast, ['id', 'title', 'subtitle', 'text', 'playback'], podcastLabel);
    text(podcast.id, `${podcastLabel}.id`, { max: 128 });
    if (podcastIds.has(podcast.id)) fail(`播客 ID 重复：${podcast.id}`);
    podcastIds.add(podcast.id);
    text(podcast.title, `${podcastLabel}.title`, { max: 300 });
    text(podcast.subtitle, `${podcastLabel}.subtitle`, { empty: true, max: 300 });
    text(podcast.text, `${podcastLabel}.text`, { empty: true, max: 30_000 });
    validatePlayback(podcast.playback, `${podcastLabel}.playback`);
  }
  return value;
}

function validateMappingRecord(value, index) {
  const label = `records[${index}]`;
  if (!isObject(value)) fail(`${label} 不是对象`);
  noExtraKeys(value, ['id', 'title', 'author', 'era', 'city', 'sourceName', 'sourceSha256', 'summary', 'locations'], label);
  text(value.id, `${label}.id`, { max: 128 });
  text(value.title, `${label}.title`, { max: 300 });
  text(value.author, `${label}.author`, { empty: true, max: 300 });
  text(value.era, `${label}.era`, { empty: true, max: 160 });
  text(value.city, `${label}.city`, { empty: true, max: 160 });
  text(value.sourceName, `${label}.sourceName`, { max: 500 });
  if (typeof value.sourceSha256 !== 'string' || !SHA256.test(value.sourceSha256)) fail(`${label}.sourceSha256 无效`);
  text(value.summary, `${label}.summary`, { empty: true, max: 4000 });
  if (!Array.isArray(value.locations) || !value.locations.length || value.locations.length > 500) fail(`${label}.locations 无效`);
  const ids = new Set();
  for (const [locationIndex, location] of value.locations.entries()) {
    const locationLabel = `${label}.locations[${locationIndex}]`;
    if (!isObject(location)) fail(`${locationLabel} 不是对象`);
    noExtraKeys(location, ['id', 'name', 'status', 'relation', 'page', 'quote', 'note', 'lng', 'lat', 'confidence', 'confirmed', 'sourceRef', 'sourceUrls'], locationLabel);
    text(location.id, `${locationLabel}.id`, { max: 128 });
    if (ids.has(location.id)) fail(`地点 ID 重复：${location.id}`); ids.add(location.id);
    text(location.name, `${locationLabel}.name`, { max: 300 });
    if (!['extant', 'rebuilt', 'memory-only'].includes(location.status)) fail(`${locationLabel}.status 无效`);
    if (!['scene', 'mentioned', 'route', 'subject'].includes(location.relation)) fail(`${locationLabel}.relation 无效`);
    if (!Number.isInteger(location.page) || location.page < 1 || location.page > 1_000_000) fail(`${locationLabel}.page 无效`);
    text(location.quote, `${locationLabel}.quote`, { max: 2000 });
    text(location.note, `${locationLabel}.note`, { empty: true, max: 2000 });
    requiredNumber(location.lng, `${locationLabel}.lng`, -180, 180);
    requiredNumber(location.lat, `${locationLabel}.lat`, -90, 90);
    requiredNumber(location.confidence, `${locationLabel}.confidence`, 0, 1);
    if (location.confirmed !== true) fail(`${locationLabel}.confirmed 必须为 true；未经人工确认的候选不能进入地图包`);
    if (location.sourceRef !== undefined) text(location.sourceRef, `${locationLabel}.sourceRef`, { empty: true, max: 500 });
    if (location.sourceUrls !== undefined) {
      if (!Array.isArray(location.sourceUrls) || location.sourceUrls.length > 8) fail(`${locationLabel}.sourceUrls 无效`);
      location.sourceUrls.forEach((url, urlIndex) => { text(url, `${locationLabel}.sourceUrls[${urlIndex}]`, { max: 2000 }); if (!/^https:\/\//.test(url)) fail(`${locationLabel}.sourceUrls[${urlIndex}] 必须是 HTTPS 地址`); });
    }
  }
  return value;
}

function validatePhotoRecord(value, index) {
  const label = `records[${index}]`;
  if (!isObject(value)) fail(`${label} 不是对象`);
  noExtraKeys(value, ['id', 'title', 'city', 'date', 'lat', 'lng', 'thumbnailUrl', 'contentHash', 'summary'], label);
  text(value.id, `${label}.id`, { max: 128 });
  text(value.title, `${label}.title`, { max: 300 });
  text(value.city, `${label}.city`, { empty: true, max: 200 });
  text(value.date, `${label}.date`, { empty: true, max: 10 });
  if (!DATE.test(value.date)) fail(`${label}.date 必须是 YYYY-MM-DD 或空字符串`);
  numberOrNull(value.lat, `${label}.lat`, -90, 90);
  numberOrNull(value.lng, `${label}.lng`, -180, 180);
  text(value.thumbnailUrl, `${label}.thumbnailUrl`, { empty: true, max: 2000 });
  if (value.thumbnailUrl && !/^https:\/\//.test(value.thumbnailUrl)) fail(`${label}.thumbnailUrl 必须是 HTTPS 地址`);
  text(value.contentHash, `${label}.contentHash`, { empty: true, max: 256 });
  text(value.summary, `${label}.summary`, { empty: true, max: 4000 });
  return value;
}

export function validateRecord(domain, value, index) {
  if (domain === 'mapping') return validateMappingRecord(value, index);
  if (domain === 'music') return validateMusicRecord(value, index);
  if (domain === 'photos') return validatePhotoRecord(value, index);
  const label = `records[${index}]`;
  if (!isObject(value)) fail(`${label} 不是对象`);
  noExtraKeys(value, domain === 'books'
    ? ['id', 'title', 'author', 'country', 'type', 'year', 'rating', 'date', 'synopsis', 'locations']
    : ['id', 'title', 'original', 'type', 'director', 'country', 'year', 'rating', 'publicRating', 'date', 'synopsis', 'locations'], label);
  text(value.id, `${label}.id`, { max: 128 });
  text(value.title, `${label}.title`, { max: 300 });
  text(value.country, `${label}.country`, { empty: true, max: 120 });
  text(value.type, `${label}.type`, { empty: true, max: 120 });
  numberOrNull(value.year, `${label}.year`, 0, 3000, true);
  numberOrNull(value.rating, `${label}.rating`, 0, 5);
  text(value.date, `${label}.date`, { empty: true, max: 10 });
  if (!DATE.test(value.date)) fail(`${label}.date 必须是 YYYY-MM-DD 或空字符串`);
  text(value.synopsis, `${label}.synopsis`, { empty: true, max: 4000 });
  if (domain === 'books') {
    text(value.author, `${label}.author`, { empty: true, max: 300 });
  } else {
    text(value.original, `${label}.original`, { empty: true, max: 300 });
    text(value.director, `${label}.director`, { empty: true, max: 300 });
    if (value.publicRating !== undefined) numberOrNull(value.publicRating, `${label}.publicRating`, 0, 10);
  }
  if (value.locations !== undefined) {
    if (!Array.isArray(value.locations) || value.locations.length > 20) fail(`${label}.locations 无效`);
    value.locations.forEach((location, locationIndex) => validateLocation(location, domain, `${label}.locations[${locationIndex}]`));
  }
  return value;
}

export function validateRecords(domain, records) {
  if (!Array.isArray(records) || records.length > 50_000) fail('records 不是有效数组');
  const ids = new Set();
  const musicTrackIds = new Set();
  records.forEach((record, index) => {
    validateRecord(domain, record, index);
    if (ids.has(record.id)) fail(`记录 ID 重复：${record.id}`);
    ids.add(record.id);
    if (domain === 'music') {
      for (const track of record.tracks) {
        if (musicTrackIds.has(track.id)) fail(`跨城市曲目 ID 重复：${track.id}`);
        musicTrackIds.add(track.id);
      }
    }
  });
  return records;
}

export function validateManifest(manifest) {
  if (!isObject(manifest) || manifest.protocol !== 'pocket-data/v1') fail('protocol 必须是 pocket-data/v1');
  noExtraKeys(manifest, ['protocol', 'identity', 'schema', 'compatibility', 'privacy', 'provenance', 'distribution', 'files', 'records'], 'Data Pack');
  if (!isObject(manifest.identity)) fail('identity 无效');
  noExtraKeys(manifest.identity, ['id', 'name', 'version', 'author', 'description'], 'identity');
  text(manifest.identity.id, 'identity.id', { max: 128 });
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(manifest.identity.id)) fail('identity.id 格式无效');
  text(manifest.identity.name, 'identity.name', { max: 80 });
  text(manifest.identity.version, 'identity.version', { max: 80 });
  if (!SEMVER.test(manifest.identity.version)) fail('identity.version 不是语义化版本');
  text(manifest.identity.author, 'identity.author', { max: 120 });
  text(manifest.identity.description, 'identity.description', { empty: true, max: 500 });
  if (!isObject(manifest.schema) || typeof manifest.schema.name !== 'string' || !SCHEMA_ID.test(manifest.schema.name) || typeof manifest.schema.version !== 'string' || !SEMVER.test(manifest.schema.version)) fail('schema 无效');
  noExtraKeys(manifest.schema, ['name', 'version', 'record_count'], 'schema');
  const adapter = ADAPTERS.find((item) => item.schemaName === manifest.schema.name);
  if (!adapter) fail(`Data Pack 符合 pocket-data/v1，但当前运行时尚未安装 ${manifest.schema.name} 适配器`);
  if (manifest.schema.version !== adapter.schemaVersion) fail(`${manifest.schema.name} 适配器仅支持 Schema ${adapter.schemaVersion}`);
  const domain = adapter.domain;
  if (!Number.isInteger(manifest.schema.record_count) || manifest.schema.record_count < 0 || manifest.schema.record_count > 50_000) fail('schema.record_count 无效');
  if (!isObject(manifest.compatibility) || !Array.isArray(manifest.compatibility.skills) || !manifest.compatibility.skills.length || manifest.compatibility.skills.length > 32 || manifest.compatibility.skills.some((skill) => typeof skill !== 'string' || !SKILL_ID.test(skill)) || !manifest.compatibility.skills.includes(adapter.skillId)) fail('compatibility.skills 无效');
  noExtraKeys(manifest.compatibility, ['skills', 'runtime_min'], 'compatibility');
  if (typeof manifest.compatibility.runtime_min !== 'string' || !RUNTIME_SEMVER.test(manifest.compatibility.runtime_min) || compareVersions(manifest.compatibility.runtime_min, RUNTIME_VERSION) > 0) fail('compatibility.runtime_min 无效');
  if (!['public', 'private', 'restricted'].includes(manifest.privacy)) fail('privacy 无效');
  if (!isObject(manifest.provenance)) fail('provenance 无效');
  noExtraKeys(manifest.provenance, ['source', 'license', 'generated_at'], 'provenance');
  text(manifest.provenance.source, 'provenance.source', { max: 500 });
  text(manifest.provenance.license, 'provenance.license', { max: 120 });
  text(manifest.provenance.generated_at, 'provenance.generated_at', { max: 80 });
  if (Number.isNaN(Date.parse(manifest.provenance.generated_at))) fail('provenance.generated_at 不是 ISO 时间');
  if (!isObject(manifest.distribution) || !['inline', 'chunked'].includes(manifest.distribution.mode)) fail('distribution 无效');
  noExtraKeys(manifest.distribution, ['mode'], 'distribution');
  return domain;
}

export const sha256File = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

export function validatePackFile(input) {
  const file = path.resolve(input);
  const document = JSON.parse(readFileSync(file, 'utf8'));
  const domain = validateManifest(document);
  let records = [];
  if (document.distribution.mode === 'inline') {
    records = validateRecords(domain, document.records);
  } else {
    if (!Array.isArray(document.files) || !document.files.length || document.files.length > 500) fail('files 无效');
    for (const [index, item] of document.files.entries()) {
      const label = `files[${index}]`;
      if (!isObject(item) || item.role !== 'records' || item.media_type !== 'application/json' || !SAFE_PATH.test(item.path)) fail('分块清单无效');
      noExtraKeys(item, ['role', 'path', 'media_type', 'bytes', 'sha256', 'records'], label);
      if (!Number.isInteger(item.bytes) || item.bytes < 2 || item.bytes > MAX_FILE_BYTES) fail(`${label}.bytes 超出范围`);
      if (typeof item.sha256 !== 'string' || !SHA256.test(item.sha256)) fail(`${label}.sha256 无效`);
      if (!Number.isInteger(item.records) || item.records < 0 || item.records > 10_000) fail(`${label}.records 超出范围`);
      const chunkFile = path.resolve(path.dirname(file), item.path);
      if (!chunkFile.startsWith(path.dirname(file) + path.sep)) fail('分块路径越界');
      const stat = readFileSync(chunkFile);
      if (stat.byteLength !== item.bytes) fail(`${item.path} 大小不匹配`);
      if (createHash('sha256').update(stat).digest('hex') !== item.sha256) fail(`${item.path} SHA256 不匹配`);
      const chunk = JSON.parse(stat.toString('utf8'));
      if (!Array.isArray(chunk) || chunk.length !== item.records) fail(`${item.path} 记录数不匹配`);
      records.push(...chunk);
    }
    validateRecords(domain, records);
  }
  if (records.length !== document.schema.record_count) fail('总记录数不匹配');
  return { file, domain, manifest: document, records };
}
