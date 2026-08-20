// 音乐资产流水线（离线 Node 脚本）。
// 真实可用：writeback（音频托管 URL → audio.db）。外部阶段（resolve/download/normalize/upload）
// 需音视频解析/转码工具与对象存储凭据，留作接入点；本仓库不含任何密钥。
// 数据底座：仓库根的 resource-library/audio.db（二进制不入库，schema 见 backend）。
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// frost-agent/agents/music-pipeline/ → 仓库根（上溯 3 层）→ resource-library/audio.db
const DB_PATH = path.resolve(HERE, '../../../resource-library/audio.db');

const STAGES = ['resolve', 'download', 'normalize', 'upload', 'writeback'];

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];

if (cmd === 'plan') {
  const city = arg('city') || '<slug>';
  console.log(`音乐流水线 · ${city}`);
  STAGES.forEach((s, i) => {
    const impl = s === 'writeback' ? '✅ 已实现' : '接入点（需外部工具/凭据）';
    console.log(`  ${i + 1}. ${s.padEnd(10)} ${impl}`);
  });
  console.log('外部阶段：音视频解析/下载、转码取时长、对象存储上传（均需对应工具与凭据）。');
  process.exit(0);
}

if (cmd === 'writeback') {
  const city = arg('city'), track = arg('track'), url = arg('url');
  if (!city || !track || !url) { console.error('用法: writeback --city <slug> --track <trackId> --url <audio_url>'); process.exit(1); }
  if (!url.startsWith('http')) { console.error('url 必须是音频托管的绝对地址'); process.exit(1); }
  const db = new DatabaseSync(DB_PATH);
  const r = db.prepare('UPDATE tracks SET audio_url=? WHERE city_slug=? AND track_id=?').run(url, city, track);
  db.close();
  console.log(r.changes ? `已写回 ${city}/${track} → ${url}` : `未找到曲目 ${city}/${track}`);
  console.log('接着运行: npm run library:build');
  process.exit(r.changes ? 0 : 1);
}

console.error('用法: pipeline.mjs <plan|writeback> [...]\n  plan --city <slug>\n  writeback --city <slug> --track <trackId> --url <audio_url>');
process.exit(1);
