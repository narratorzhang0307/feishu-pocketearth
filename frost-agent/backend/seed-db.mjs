// 数据底座 · 建 schema 并（如有 JSON 数据）灌库。
// audio.db 是城市/曲目/播客的链接库（真源）；UI 实际读由它生成的 cities/*.json。
// 二进制 audio.db 不入库；本脚本即其 schema 的可执行定义。
//   数据流：cities/*.json --(本脚本)--> audio.db --(build-library)--> cities/*.json --(前端)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// frost-agent/backend/ → 仓库根（上溯 2 层）→ resource-library
const ROOT = path.resolve(import.meta.dirname, '..', '..', 'resource-library');
const CITIES_DIR = path.join(ROOT, 'cities');
const DB_PATH = path.join(ROOT, 'audio.db');

fs.mkdirSync(ROOT, { recursive: true });
fs.rmSync(DB_PATH, { force: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE cities (
    slug TEXT PRIMARY KEY, city_name TEXT, city_name_zh TEXT,
    iana_tz TEXT, tz_offset REAL, station_freq REAL, station_name TEXT, cover_url TEXT
  );
  CREATE TABLE tracks (
    city_slug TEXT, ord INTEGER, track_id TEXT, title TEXT, artist TEXT, duration_sec INTEGER,
    audio_url TEXT, intro_text TEXT, intro_audio_url TEXT,
    PRIMARY KEY (city_slug, track_id)
  );
  CREATE TABLE podcast (
    city_slug TEXT, ord INTEGER, seg_id TEXT, title TEXT, subtitle TEXT, text TEXT, audio_url TEXT,
    PRIMARY KEY (city_slug, seg_id)
  );
`);

// 无 cities/*.json 数据时只建空 schema（干净仓库可直接验证 schema 正确）。
if (!fs.existsSync(CITIES_DIR)) {
  console.log('已建 audio.db schema（cities/ 目录不存在，未灌入数据）。');
  db.close();
  process.exit(0);
}

const insCity = db.prepare(`INSERT INTO cities VALUES (?,?,?,?,?,?,?,?)`);
const insTrack = db.prepare(`INSERT INTO tracks VALUES (?,?,?,?,?,?,?,?,?)`);
const insPod = db.prepare(`INSERT INTO podcast VALUES (?,?,?,?,?,?,?)`);

let nc = 0, nt = 0, np = 0;
for (const f of fs.readdirSync(CITIES_DIR).filter((f) => f.endsWith('.json'))) {
  const c = JSON.parse(fs.readFileSync(path.join(CITIES_DIR, f), 'utf8'));
  insCity.run(c.slug, c.cityName, c.cityNameZh, c.ianaTz ?? null, c.tzOffset, c.station.freq, c.station.name, c.cover);
  c.tracks.forEach((t, i) => { insTrack.run(c.slug, i, t.id, t.title, t.artist, t.durationSec, t.audioUrl, t.introText, t.introAudioUrl); nt++; });
  (c.podcast || []).forEach((p, i) => { insPod.run(c.slug, i, p.id, p.title, p.subtitle, p.text, p.audioUrl); np++; });
  nc++;
}
console.log(`已灌入 audio.db — 城市 ${nc}，曲目 ${nt}，播客段 ${np}`);
db.close();
