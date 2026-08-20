// 文化知识流水线（离线 Node 脚本）。
// 真实可用：extract(txt/md) + chunk(重叠滑窗) + 落地分块语料 JSON。
// docx/pdf/epub 解析、embed(嵌入 API)、向量库 store 留接入点；不含密钥。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.resolve(HERE, '../../../../../resource-library/knowledge');

const CHUNK = 800, OVERLAP = 120;

/** 文本 → 重叠滑窗分块。 */
export function chunkText(text) {
  const clean = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const chunks = [];
  for (let i = 0; i < clean.length; i += CHUNK - OVERLAP) {
    const piece = clean.slice(i, i + CHUNK).trim();
    if (piece) chunks.push(piece);
    if (i + CHUNK >= clean.length) break;
  }
  return chunks;
}

function extract(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.txt' || ext === '.md') return fs.readFileSync(file, 'utf8');
  throw new Error(`暂不支持 ${ext}（docx/pdf/epub 需解析器，是接入点）。先转成 txt/md。`);
}

function arg(name) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : undefined; }
const cmd = process.argv[2];

if (cmd === 'ingest') {
  const inFile = arg('in'), kb = arg('kb') || 'default', tag = arg('tag') || '';
  if (!inFile) { console.error('用法: ingest --in <book.txt|.md> --kb <name> [--tag 洛杉矶]'); process.exit(1); }
  const text = extract(inFile);
  const chunks = chunkText(text);
  fs.mkdirSync(KB_DIR, { recursive: true });
  const out = path.join(KB_DIR, kb + '.json');
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  const base = prev.length;
  chunks.forEach((c, i) => prev.push({ id: `${kb}-${base + i}`, tag, text: c }));
  fs.writeFileSync(out, JSON.stringify(prev, null, 2) + '\n');
  console.log(`抽取+分块 ${chunks.length} 段 → ${out}（共 ${prev.length} 段）`);
  console.log('注：embed/向量库为接入点；deep-answer 接 RAG 前先用播客文稿兜底。');
  process.exit(0);
}

console.error('用法: pipeline.mjs ingest --in <file> --kb <name> [--tag ...]');
process.exit(1);
