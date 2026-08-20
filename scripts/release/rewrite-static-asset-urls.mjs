#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const root = path.resolve(option('--root', 'dist'));
const base = option('--base', process.env.STATIC_ASSET_BASE || '').replace(/\/+$/, '');
if (!/^https:\/\//.test(base)) throw new Error('Pass an HTTPS OSS release URL with --base');

const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.svg', '.txt', '.webmanifest', '.xml']);
const roots = [
  'assets/exhibit-2_5d',
  'assets/exhibit-3dgs',
  'assets/heritage-demo',
  'assets/skills/guji',
  'assets/ort-wasm-*.wasm',
  'exhibits',
];
const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const resourceUrl = /(?<![A-Za-z0-9._~:/-])\/(assets\/exhibit-2_5d|assets\/exhibit-3dgs|assets\/heritage-demo|assets\/skills\/guji|exhibits)\//g;
const resourceFileUrl = /(?<![A-Za-z0-9._~:/-])\/(assets\/ort-wasm-[A-Za-z0-9._-]+\.wasm)(?=[?"'\s),;#]|$)/g;
const ossCodeUrl = new RegExp(`${escapedBase}/assets/([^"'\\s),;?#]+\\.(?:js|mjs|css)(?:\\?[^"'\\s),;#]*)?)(?=[?"'\\s),;#]|$)`, 'g');

async function filesBelow(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

const rootInfo = await stat(root).catch(() => null);
if (!rootInfo?.isDirectory()) throw new Error(`Build directory not found: ${root}`);
let scanned = 0;
let changed = 0;
let replacements = 0;
for (const file of await filesBelow(root)) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (relative === 'sw.js' || !textExtensions.has(path.extname(file).toLowerCase())) continue;
  scanned += 1;
  const before = await readFile(file, 'utf8');
  let local = 0;
  const rewrittenDirectories = before.replace(resourceUrl, (_match, resourceRoot) => {
    local += 1;
    return `${base}/${resourceRoot}/`;
  });
  const rewritten = rewrittenDirectories.replace(resourceFileUrl, (_match, resourcePath) => {
    local += 1;
    return `${base}/${resourcePath}`;
  });
  const after = rewritten.replace(ossCodeUrl, (_match, fileName) => {
    local = Math.max(0, local - 1);
    return `/assets/${fileName}`;
  });
  if (after === before) continue;
  await writeFile(file, after);
  changed += 1;
  replacements += local;
}

const report = { schema: 'pocket-earth.asset-cdn/v1', assetBase: base, scanned, changed, replacements, roots };
await writeFile(path.join(root, 'asset-cdn-manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
