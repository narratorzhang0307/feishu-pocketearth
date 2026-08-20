import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { validateRecords } from './protocol.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const DB_DIR = path.join(ROOT, 'var', 'data-packs');
const DB_PATH = path.join(DB_DIR, 'pocket-earth-library.sqlite');
const PUBLIC_ROOT = path.join(ROOT, 'public', 'data-packs');
const GENERATED_AT = '2026-08-10T00:00:00.000Z';
const CHUNK_SIZE = 250;

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const compact = (value) => Buffer.from(JSON.stringify(value) + '\n');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stableId = (domain, value) => `${domain.slice(0, -1)}:${String(value).padStart(5, '0')}`;
const cleanDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
const cleanMusicTitle = (value) => {
  const text = String(value || '').replace(/^[《「『﹝]+/, '').replace(/[》」』﹞]+$/, '').trim();
  return text || String(value || '');
};
const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const playbackRef = (url) => {
  const value = String(url || '').trim();
  if (!value) return { provider: 'none', url: '' };
  if (/youtu(?:\.be|be\.com)/i.test(value)) return { provider: 'youtube', url: value };
  if (/\.oss-cn-[^/]+\.aliyuncs\.com/i.test(value)) return { provider: 'oss', url: value };
  return { provider: 'external', url: value };
};

const BOOK_COUNTRY = {
  '中国大陆': [116.40, 39.90], '中国': [116.40, 39.90], '中国台湾': [121.56, 25.03], '中国香港': [114.17, 22.32],
  '美国': [-73.97, 40.78], '日本': [139.69, 35.68], '英国': [-0.12, 51.51], '法国': [2.35, 48.85],
  '德国': [13.40, 52.52], '意大利': [12.49, 41.90], '爱尔兰': [-6.26, 53.35], '瑞士': [8.54, 47.37],
  '智利': [-70.65, -33.46], '哥伦比亚': [-74.07, 4.71], '俄国': [37.62, 55.75], '俄罗斯': [37.62, 55.75], '苏联': [37.62, 55.75],
  '阿根廷': [-58.38, -34.60], '波兰': [21.01, 52.23], '加拿大': [-79.38, 43.65], '马来西亚': [101.69, 3.14],
  '韩国': [126.97, 37.56], '捷克': [14.42, 50.09], '墨西哥': [-99.13, 19.43], '荷兰': [4.90, 52.37],
  '葡萄牙': [-9.14, 38.72], '西班牙': [-3.70, 40.42], '瑞典': [18.07, 59.33], '塞尔维亚': [20.46, 44.79],
  '澳大利亚': [151.21, -33.87], '挪威': [10.75, 59.91], '古希腊': [23.73, 37.98], '希腊': [23.73, 37.98],
  '斯洛文尼亚': [14.51, 46.06], '印度': [72.88, 19.08], '奥地利': [16.37, 48.21], '芬兰': [24.94, 60.17],
  '南非': [18.42, -33.92], '罗马尼亚': [26.10, 44.43], '越南': [105.83, 21.03], '波斯': [51.39, 35.69], '伊朗': [51.39, 35.69],
  '丹麦': [12.57, 55.68], '土耳其': [28.98, 41.01],
};

const MOVIE_COUNTRY = {
  '中国大陆': [116.40, 39.90], '美国': [-118.24, 34.05], '日本': [139.69, 35.68], '中国香港': [114.17, 22.32],
  '法国': [2.35, 48.85], '英国': [-0.12, 51.50], '中国台湾': [121.56, 25.03], '韩国': [126.97, 37.56],
  '意大利': [12.49, 41.90], '德国': [13.40, 52.52], '瑞典': [18.07, 59.33], '西班牙': [-3.70, 40.42],
  '波兰': [21.01, 52.23], '芬兰': [24.94, 60.17], '加拿大': [-79.38, 43.65], '泰国': [100.50, 13.76],
  '丹麦': [12.57, 55.68], '澳大利亚': [151.21, -33.87], '伊朗': [51.39, 35.69], '苏联': [37.62, 55.75],
  '希腊': [23.73, 37.98], '墨西哥': [-99.13, 19.43], '印度': [72.88, 19.08], '南斯拉夫': [20.46, 44.79],
  '智利': [-70.65, -33.46], '巴西': [-43.20, -22.91], '新西兰': [174.78, -41.29], '挪威': [10.75, 59.91],
  '奥地利': [16.37, 48.21], '俄罗斯': [37.62, 55.75], '土耳其': [28.98, 41.01], '捷克斯洛伐克': [14.42, 50.09],
  '匈牙利': [19.04, 47.50], '阿根廷': [-58.38, -34.60], '比利时': [4.35, 50.85], '爱尔兰': [-6.26, 53.35],
  '塞尔维亚': [20.46, 44.79], '新加坡': [103.82, 1.35], '马来西亚': [101.69, 3.14], '哥伦比亚': [-74.07, 4.71],
  '捷克': [14.42, 50.09], '南非': [18.42, -33.92], '荷兰': [4.90, 52.37], '葡萄牙': [-9.14, 38.72],
  '瑞士': [8.54, 47.37], '黎巴嫩': [35.50, 33.89], '以色列': [34.78, 32.08], '哈萨克斯坦': [76.89, 43.24],
};

const countryLocation = (country, coords) => coords[country] ? [{ kind: 'country', place: country, lng: coords[country][0], lat: coords[country][1], confidence: 0.45 }] : undefined;

const rawBooks = readJson('src/app/data/douban-books.json');
const rawMovies = readJson('src/app/data/douban-movies.json');
const rawRatings = readJson('src/app/data/douban-ratings.json');
const musicGenres = readJson('src/app/data/music-genres.json');

const books = rawBooks.map((record) => ({
  id: stableId('books', record.id),
  title: String(record.title || '').trim(), author: String(record.author || '').trim(), country: String(record.country || '').trim(),
  type: String(record.type || '').trim(), year: Number.isInteger(record.year) ? record.year : null,
  rating: typeof record.rating === 'number' ? record.rating : null, date: cleanDate(record.date), synopsis: String(record.synopsis || '').trim(),
  ...(countryLocation(String(record.country || '').trim(), BOOK_COUNTRY) ? { locations: countryLocation(String(record.country || '').trim(), BOOK_COUNTRY) } : {}),
}));

const movies = rawMovies.map((record) => ({
  id: stableId('movies', record.id),
  title: String(record.title || '').trim(), original: String(record.original || '').trim(), type: String(record.type || '').trim(),
  director: String(record.director || '').trim(), country: String(record.country || '').trim(),
  year: Number.isInteger(record.year) ? record.year : null, rating: typeof record.rating === 'number' ? record.rating : null,
  ...(typeof rawRatings[String(record.id)] === 'number' ? { publicRating: rawRatings[String(record.id)] } : {}),
  date: cleanDate(record.date), synopsis: String(record.synopsis || '').trim(),
  ...(countryLocation(String(record.country || '').trim(), MOVIE_COUNTRY) ? { locations: countryLocation(String(record.country || '').trim(), MOVIE_COUNTRY) } : {}),
}));

function musicRecordsFromSource(sourceRoot) {
  const citiesDir = path.join(sourceRoot, 'cities');
  const metaFile = path.join(sourceRoot, 'city-meta.json');
  if (!fs.statSync(citiesDir).isDirectory() || !fs.statSync(metaFile).isFile()) throw new Error(`Music source is incomplete: ${sourceRoot}`);
  const cityMeta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  return fs.readdirSync(citiesDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const city = JSON.parse(fs.readFileSync(path.join(citiesDir, file), 'utf8'));
      const meta = cityMeta[city.cityNameZh] || {};
      return {
        id: `music-city:${city.slug}`,
        slug: String(city.slug || '').trim(),
        cityName: String(city.cityName || '').trim(),
        cityNameZh: String(city.cityNameZh || '').trim(),
        ianaTz: typeof city.ianaTz === 'string' && city.ianaTz ? city.ianaTz : null,
        tzOffset: Number(city.tzOffset),
        station: { freq: Number(city.station?.freq), name: String(city.station?.name || '').trim() },
        cover: String(city.cover || '').trim(),
        lat: typeof meta.lat === 'number' ? meta.lat : null,
        lng: typeof meta.lng === 'number' ? meta.lng : null,
        description: String(meta.description || '').trim(),
        tracks: (city.tracks || []).map((track) => ({
          id: `music-track:${city.slug}:${String(track.id || '').trim()}`,
          title: cleanMusicTitle(track.title),
          artist: String(track.artist || '').trim(),
          genre: String(musicGenres[track.artist] || '其他'),
          durationSec: Number.isInteger(track.durationSec) ? track.durationSec : null,
          playback: playbackRef(track.audioUrl),
          introText: String(track.introText || '').trim(),
          introPlayback: playbackRef(track.introAudioUrl),
        })),
        podcast: (city.podcast || []).map((segment) => ({
          id: String(segment.id || '').trim(),
          title: String(segment.title || '').trim(),
          subtitle: String(segment.subtitle || '').trim(),
          text: String(segment.text || '').trim(),
          playback: playbackRef(segment.audioUrl),
        })),
      };
    })
    .sort((a, b) => a.tzOffset - b.tzOffset || a.cityNameZh.localeCompare(b.cityNameZh, 'zh'));
}

function loadMusicRecords() {
  const source = argumentValue('--music-source') || process.env.POCKET_MUSIC_LIBRARY_SOURCE;
  if (source) return musicRecordsFromSource(path.resolve(source));
  const existingBundle = path.join(PUBLIC_ROOT, 'pocket-earth-music', '1.0.0', 'bundle.json');
  if (fs.existsSync(existingBundle)) return JSON.parse(fs.readFileSync(existingBundle, 'utf8')).records;
  throw new Error('Music source is required once: pass --music-source /path/to/resource-library');
}

const music = loadMusicRecords();

validateRecords('books', books);
validateRecords('movies', movies);
validateRecords('music', music);

fs.mkdirSync(DB_DIR, { recursive: true });
fs.rmSync(DB_PATH, { force: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE data_packs (
    pack_id TEXT NOT NULL, version TEXT NOT NULL, domain TEXT NOT NULL, name TEXT NOT NULL,
    author TEXT NOT NULL, description TEXT NOT NULL, privacy TEXT NOT NULL, provenance_json TEXT NOT NULL,
    generated_at TEXT NOT NULL, PRIMARY KEY (pack_id, version)
  );
  CREATE TABLE records (
    pack_id TEXT NOT NULL, version TEXT NOT NULL, record_id TEXT NOT NULL, domain TEXT NOT NULL,
    title TEXT NOT NULL, record_json TEXT NOT NULL,
    PRIMARY KEY (pack_id, version, record_id),
    FOREIGN KEY (pack_id, version) REFERENCES data_packs(pack_id, version)
  );
  CREATE INDEX records_domain_title ON records(domain, title);
`);

const definitions = [
  {
    domain: 'books', slug: 'pocket-earth-books', id: 'earth.pocket.demo.books', name: 'Pocket Earth 示例书库',
    description: '与读书 Skill 解耦的 Pocket Earth 决赛演示书籍数据包', schema: 'pocket.books/v1', skill: 'pocket.books', records: books,
    source: 'User-provided reading history export normalized for the Pocket Earth competition demo',
  },
  {
    domain: 'movies', slug: 'pocket-earth-movies', id: 'earth.pocket.demo.movies', name: 'Pocket Earth 示例片库',
    description: '与电影 Skill 解耦的 Pocket Earth 决赛演示电影数据包', schema: 'pocket.movies/v1', skill: 'pocket.movies', records: movies,
    source: 'User-provided viewing history export normalized for the Pocket Earth competition demo',
  },
  {
    domain: 'music', slug: 'pocket-earth-music', id: 'earth.pocket.demo.music', name: 'Pocket Earth 世界音乐库',
    description: '与音乐 Skill 解耦的城市电台、曲目、播客和播放引用数据包', schema: 'pocket.music/v1', skill: 'pocket.music', records: music,
    source: 'User-authorized Pocket Earth city radio library normalized into pocket.music/v1; audio remains remotely hosted and is referenced, not embedded',
  },
];

const insertPack = db.prepare('INSERT INTO data_packs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
const insertRecord = db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?)');
db.exec('BEGIN');
try {
  for (const definition of definitions) {
    const provenance = { source: definition.source, license: 'competition-demonstration-only', generated_at: GENERATED_AT };
    insertPack.run(definition.id, '1.0.0', definition.domain, definition.name, 'Pocket Earth', definition.description, 'public', JSON.stringify(provenance), GENERATED_AT);
    for (const record of definition.records) insertRecord.run(definition.id, '1.0.0', record.id, definition.domain, record.title || record.cityNameZh, JSON.stringify(record));
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  db.close();
  throw error;
}

for (const definition of definitions) {
  const target = path.join(PUBLIC_ROOT, definition.slug, '1.0.0');
  if (!target.startsWith(PUBLIC_ROOT + path.sep)) throw new Error('Refusing to write outside public/data-packs');
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.join(target, 'chunks'), { recursive: true });
  const files = [];
  for (let offset = 0, part = 1; offset < definition.records.length; offset += CHUNK_SIZE, part += 1) {
    const records = definition.records.slice(offset, offset + CHUNK_SIZE);
    const relative = `chunks/records-${String(part).padStart(5, '0')}.json`;
    const bytes = compact(records);
    fs.writeFileSync(path.join(target, relative), bytes);
    files.push({ role: 'records', path: relative, media_type: 'application/json', bytes: bytes.byteLength, sha256: sha256(bytes), records: records.length });
  }
  const base = {
    protocol: 'pocket-data/v1',
    identity: { id: definition.id, name: definition.name, version: '1.0.0', author: 'Pocket Earth', description: definition.description },
    schema: { name: definition.schema, version: '1.0.0', record_count: definition.records.length },
    compatibility: { skills: [definition.skill], runtime_min: '1.0.0' },
    privacy: 'public',
    provenance: { source: definition.source, license: 'competition-demonstration-only', generated_at: GENERATED_AT },
  };
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({ ...base, distribution: { mode: 'chunked' }, files }, null, 2) + '\n');
  fs.writeFileSync(path.join(target, 'bundle.json'), JSON.stringify({ ...base, distribution: { mode: 'inline' }, records: definition.records }) + '\n');
}

const counts = db.prepare('SELECT domain, COUNT(*) AS records FROM records GROUP BY domain ORDER BY domain').all();
db.close();
console.log(JSON.stringify({ database: DB_PATH, output: PUBLIC_ROOT, counts }, null, 2));
