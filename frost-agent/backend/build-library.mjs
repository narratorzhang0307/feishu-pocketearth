// 真源 audio.db → 生成 resource-library/cities/*.json（前端通过 import.meta.glob 读这些）。
// 新增/修改音频托管链接后跑这个，前端即更新。
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// frost-agent/backend/ → 仓库根（上溯 2 层）→ resource-library
const ROOT = path.resolve(import.meta.dirname, '..', '..', 'resource-library');
const CITIES_DIR = path.join(ROOT, 'cities');
const DB_PATH = path.join(ROOT, 'audio.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('未找到 audio.db，请先建数据底座：node frost-agent/backend/seed-db.mjs');
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const cities = db.prepare(`SELECT * FROM cities`).all();
const tracksFor = db.prepare(`SELECT * FROM tracks WHERE city_slug=? ORDER BY ord`);
const podFor = db.prepare(`SELECT * FROM podcast WHERE city_slug=? ORDER BY ord`);

fs.mkdirSync(CITIES_DIR, { recursive: true });
let n = 0;
for (const c of cities) {
  const out = {
    slug: c.slug, cityName: c.city_name, cityNameZh: c.city_name_zh,
    ianaTz: c.iana_tz ?? null, tzOffset: c.tz_offset,
    station: { freq: c.station_freq, name: c.station_name },
    cover: c.cover_url,
    tracks: tracksFor.all(c.slug).map((t) => ({
      id: t.track_id, title: t.title, artist: t.artist, durationSec: t.duration_sec,
      audioUrl: t.audio_url, introText: t.intro_text, introAudioUrl: t.intro_audio_url,
    })),
    podcast: podFor.all(c.slug).map((p) => ({
      id: p.seg_id, title: p.title, subtitle: p.subtitle, text: p.text, audioUrl: p.audio_url,
    })),
  };
  fs.writeFileSync(path.join(CITIES_DIR, c.slug + '.json'), JSON.stringify(out, null, 2) + '\n');
  n++;
}
console.log(`已从 audio.db 生成 ${n} 个城市 JSON`);
db.close();
