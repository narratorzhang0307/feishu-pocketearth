import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { validatePackFile } from './protocol.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const DB = path.join(ROOT, 'var', 'data-packs', 'pocket-earth-library.sqlite');
const targets = [
  ['books', 'pocket-earth-books'],
  ['movies', 'pocket-earth-movies'],
  ['music', 'pocket-earth-music'],
];

const db = new DatabaseSync(DB, { readOnly: true });
const count = db.prepare('SELECT COUNT(*) AS count FROM records WHERE domain=?');
const results = [];
for (const [domain, slug] of targets) {
  const manifest = validatePackFile(path.join(ROOT, 'public', 'data-packs', slug, '1.0.0', 'manifest.json'));
  const bundle = validatePackFile(path.join(ROOT, 'public', 'data-packs', slug, '1.0.0', 'bundle.json'));
  const databaseCount = Number(count.get(domain).count);
  if (manifest.records.length !== bundle.records.length || manifest.records.length !== databaseCount) throw new Error(`${domain} 数据库、Manifest 与 Bundle 记录数不一致`);
  if (JSON.stringify(manifest.records) !== JSON.stringify(bundle.records)) throw new Error(`${domain} Manifest 与 Bundle 内容不一致`);
  results.push({ domain, records: databaseCount, chunks: manifest.manifest.files.length, pack: manifest.manifest.identity.id });
}
db.close();
console.log(JSON.stringify({ status: 'VERIFIED', database: DB, packs: results }, null, 2));
