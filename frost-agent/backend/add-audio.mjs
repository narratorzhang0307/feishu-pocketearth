// 往链接库 audio.db 写/改一条音频托管链接。写完跑 build-library.mjs 让前端更新。
// 用法：
//   node frost-agent/backend/add-audio.mjs podcast     <city_slug> <audio_url> [title] [text]
//   node frost-agent/backend/add-audio.mjs track-audio <city_slug> <track_id> <audio_url>
//   node frost-agent/backend/add-audio.mjs track-intro <city_slug> <track_id> <audio_url>
//   node frost-agent/backend/add-audio.mjs cover       <city_slug> <audio_url>
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// frost-agent/backend/ → 仓库根（上溯 2 层）→ resource-library/audio.db
const DB_PATH = path.resolve(import.meta.dirname, '..', '..', 'resource-library', 'audio.db');
if (!fs.existsSync(DB_PATH)) {
  console.error('未找到 audio.db，请先建数据底座：node frost-agent/backend/seed-db.mjs');
  process.exit(1);
}

const [, , kind, slug, a, b, c] = process.argv;
if (!kind || !slug) { console.error('缺参数。见文件顶部用法。'); process.exit(1); }

const db = new DatabaseSync(DB_PATH);
const exists = db.prepare('SELECT 1 FROM cities WHERE slug=?').get(slug);
if (!exists) { console.error(`城市 slug 不存在: ${slug}`); process.exit(1); }

if (kind === 'podcast') {
  const url = a; if (!url) { console.error('缺 audio_url'); process.exit(1); }
  const title = b || db.prepare('SELECT city_name_zh FROM cities WHERE slug=?').get(slug).city_name_zh;
  const text = c || '';
  const ord = db.prepare('SELECT COUNT(*) n FROM podcast WHERE city_slug=?').get(slug).n;
  db.prepare(`INSERT INTO podcast (city_slug,ord,seg_id,title,subtitle,text,audio_url) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(city_slug,seg_id) DO UPDATE SET title=excluded.title,text=excluded.text,audio_url=excluded.audio_url`)
    .run(slug, ord, 'city', title, '城市', text, url);
  console.log(`已写入 ${slug} 播客: ${url}`);
} else if (kind === 'track-audio' || kind === 'track-intro') {
  const trackId = a, url = b; if (!trackId || !url) { console.error('缺 track_id 或 audio_url'); process.exit(1); }
  const col = kind === 'track-audio' ? 'audio_url' : 'intro_audio_url';
  const r = db.prepare(`UPDATE tracks SET ${col}=? WHERE city_slug=? AND track_id=?`).run(url, slug, trackId);
  console.log(r.changes ? `已更新 ${slug}/${trackId} ${col}` : `未找到曲目 ${slug}/${trackId}`);
} else if (kind === 'cover') {
  const url = a; if (!url) { console.error('缺 audio_url'); process.exit(1); }
  db.prepare('UPDATE cities SET cover_url=? WHERE slug=?').run(url, slug);
  console.log(`已更新 ${slug} 封面`);
} else { console.error('未知 kind:', kind); process.exit(1); }
db.close();
console.log('记得运行: node frost-agent/backend/build-library.mjs');
