#!/usr/bin/env node

import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const root = process.cwd();
const manifestPath = path.resolve(option('--manifest', 'docs/deploy/oss-static-release-20260811.json'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const externalizedPrefixes = [
  'dist/assets/exhibit-2_5d/',
  'dist/assets/exhibit-3dgs/',
  'dist/assets/heritage-demo/',
  'dist/assets/skills/guji/',
  'dist/assets/ort-wasm-',
  'dist/exhibits/',
];
let bytes = 0;
let files = 0;
for (const item of manifest.objects) {
  if (!externalizedPrefixes.some((prefix) => item.local.startsWith(prefix))) continue;
  const file = path.resolve(root, item.local);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) continue;
  if (info.size !== item.bytes) throw new Error(`Refusing to prune changed asset: ${item.local}`);
  await rm(file);
  bytes += info.size;
  files += 1;
}
await rm(path.join(root, 'dist/mediapipe'), { recursive: true, force: true });
console.log(JSON.stringify({ prunedUploadedFiles: files, prunedUploadedBytes: bytes, externalizedPrefixes, retiredRuntime: 'dist/mediapipe' }));
