import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || 'dist');
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const initial = new Set();
for (const match of html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
  const value = match[1];
  if (value.startsWith('/assets/') || value.startsWith('./assets/')) initial.add(value.replace(/^\.\//, '/'));
}

const queue = [...initial];
while (queue.length) {
  const current = queue.shift();
  if (!current.endsWith('.js')) continue;
  const source = await readFile(path.join(dist, current.replace(/^\//, '')), 'utf8');
  const imports = [
    ...source.matchAll(/(?:^|[;\n])\s*import\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g),
    ...source.matchAll(/(?:^|[;\n])\s*export\s+[^"']+?\s+from\s+["']([^"']+)["']/g),
  ];
  for (const match of imports) {
    if (!match[1].startsWith('.')) continue;
    const resolved = '/' + path.posix.normalize(path.posix.join(path.posix.dirname(current), match[1])).replace(/^\//, '');
    if (!initial.has(resolved)) { initial.add(resolved); queue.push(resolved); }
  }
}

const forbidden = [/\.mnn(?:$|\?)/i, /\.splat(?:$|\?)/i, /mediapipe\/wasm/i, /data-packs/i, /douban-movies/i, /exhibit-2_5d/i, /exhibit-3dgs/i];
const violations = [...initial].filter((file) => forbidden.some((pattern) => pattern.test(file)));
let bytes = 0;
const files = [];
for (const file of initial) {
  const info = await stat(path.join(dist, file.replace(/^\//, ''))); bytes += info.size; files.push({ file, bytes: info.size });
}
const limit = 3 * 1024 * 1024;
const result = { ok: !violations.length && bytes <= limit, initialBytes: bytes, limitBytes: limit, initialFiles: files.sort((a, b) => a.file.localeCompare(b.file)), forbiddenRequests: violations };
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
