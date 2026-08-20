#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const release = process.env.POCKET_STATIC_RELEASE || '20260811-final-v3';
const prefix = `pocket-earth/releases/${release}`;
const codeExtensions = new Set(['.css', '.js', '.mjs']);

const contentType = (file) => ({
  '.glb': 'model/gltf-binary',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.splat': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
}[path.extname(file).toLowerCase()] || 'application/octet-stream');

const sha256 = (file) => new Promise((resolve, reject) => {
  const digest = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', (chunk) => digest.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(digest.digest('hex')));
});

async function filesBelow(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

const candidates = [];
for (const directoryName of ['assets', 'exhibits']) {
  const directory = path.join(dist, directoryName);
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory()) continue;
  for (const file of await filesBelow(directory)) {
    if (directoryName === 'assets' && codeExtensions.has(path.extname(file).toLowerCase())) continue;
    candidates.push(file);
  }
}

const objects = [];
for (const file of candidates.sort()) {
  const relative = path.relative(dist, file).split(path.sep).join('/');
  const info = await stat(file);
  objects.push({
    local: `dist/${relative}`,
    key: `${prefix}/${relative}`,
    bytes: info.size,
    sha256: await sha256(file),
    contentType: contentType(file),
  });
}

const manifest = {
  schema: 'pocket-earth.oss-release/v1',
  release,
  bucket: 'last-night-on-earth',
  endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
  publicBase: 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com',
  status: 'ready-for-upload',
  objects,
};

const output = path.join(root, 'docs/deploy/oss-static-release-20260811.json');
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, objects: objects.length, bytes: objects.reduce((sum, item) => sum + item.bytes, 0) }));
