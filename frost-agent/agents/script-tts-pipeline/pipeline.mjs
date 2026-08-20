// DJ 声音流水线（离线 Node 脚本）。
// 真实可用：normalize（展示稿→口播稿）、writeback（音频托管 URL→audio.db）。
// synth（TTS 引擎）/ upload（对象存储）需 API 与凭据，留接入点；本仓库不含密钥。
// 数据底座：仓库根的 resource-library/audio.db（二进制不入库，schema 见 backend）。
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// frost-agent/agents/script-tts-pipeline/ → 仓库根（上溯 3 层）→ resource-library/audio.db
const DB_PATH = path.resolve(HERE, '../../../resource-library/audio.db');

const CN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 展示稿 → 口播稿：年份逐位读、阿拉伯数字转中文、清掉念不出的符号。 */
export function toSpoken(text) {
  let t = text;
  // 四位年份逐位：2012 → 二〇一二
  t = t.replace(/\b(1[5-9]\d{2}|20\d{2})\b/g, (y) => [...y].map((d) => CN[+d]).join(''));
  // 其余 1-3 位数字转中文（粗粒度，够念）
  t = t.replace(/\d+/g, (n) => [...n].map((d) => CN[+d]).join(''));
  // 念不出的符号
  t = t.replace(/[《》【】「」（）()\[\]"'""'']/g, ' ').replace(/[—\-–·]+/g, '，');
  return t.replace(/\s+/g, ' ').trim();
}

function arg(name) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : undefined; }
const cmd = process.argv[2];

if (cmd === 'normalize') {
  const text = arg('text');
  if (!text) { console.error('用法: normalize --text "..."'); process.exit(1); }
  console.log(toSpoken(text));
  process.exit(0);
}

if (cmd === 'writeback') {
  const city = arg('city'), kind = arg('kind'), url = arg('url');
  if (!city || !kind || !url) { console.error('用法: writeback --city <slug> --kind podcast|intro [--track <id>] --url <audio_url> [--text ...]'); process.exit(1); }
  if (!url.startsWith('http')) { console.error('url 必须是音频托管的绝对地址'); process.exit(1); }
  const db = new DatabaseSync(DB_PATH);
  if (!db.prepare('SELECT 1 FROM cities WHERE slug=?').get(city)) { console.error('城市不存在: ' + city); process.exit(1); }
  if (kind === 'podcast') {
    const text = arg('text') || '';
    const title = db.prepare('SELECT city_name_zh FROM cities WHERE slug=?').get(city).city_name_zh;
    const ord = db.prepare('SELECT COUNT(*) n FROM podcast WHERE city_slug=?').get(city).n;
    db.prepare(`INSERT INTO podcast (city_slug,ord,seg_id,title,subtitle,text,audio_url) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(city_slug,seg_id) DO UPDATE SET text=excluded.text,audio_url=excluded.audio_url`)
      .run(city, ord, 'city', title, '城市', text, url);
    console.log(`已写城市播客 ${city} → ${url}`);
  } else if (kind === 'intro') {
    const track = arg('track');
    if (!track) { console.error('intro 需要 --track <id>'); process.exit(1); }
    const r = db.prepare('UPDATE tracks SET intro_audio_url=? WHERE city_slug=? AND track_id=?').run(url, city, track);
    console.log(r.changes ? `已写 DJ 解说 ${city}/${track}` : `未找到曲目 ${city}/${track}`);
  } else { console.error('kind 只能是 podcast | intro'); process.exit(1); }
  db.close();
  console.log('接着运行: npm run library:build');
  process.exit(0);
}

console.error('用法: pipeline.mjs <normalize|writeback> [...]');
process.exit(1);
