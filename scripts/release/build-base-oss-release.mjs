#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const descriptorRelative = 'android/native/model-bundle.manifest.json';
const descriptorPath = path.join(root, descriptorRelative);
const descriptorBytes = await readFile(descriptorPath);
const descriptor = JSON.parse(descriptorBytes.toString('utf8'));
const languageRoot = process.env.POCKET_LANGUAGE_MODEL || '/Users/zhangcheng/mnn-models/Qwen3-VL-2B-Instruct-MNN';
const visionRoot = process.env.POCKET_VISION_MODEL || '/Users/zhangcheng/mnn-models/Qwen3-VL-2B-Instruct-MNN-v5-int8-paired';
const releasePrefix = `pocket-earth/models/qwen3-vl-2b-dual/${descriptor.releaseId}`;

const sha256 = (file) => new Promise((resolve, reject) => {
  const digest = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', (chunk) => digest.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(digest.digest('hex')));
});

const objects = [];
for (const [bundleName, bundle] of Object.entries(descriptor.bundles)) {
  const sourceRoot = bundleName === 'language' ? languageRoot : visionRoot;
  for (const item of bundle.files) {
    const absolute = path.join(sourceRoot, item.path);
    const info = await stat(absolute);
    const actualSha = await sha256(absolute);
    if (info.size !== item.bytes || actualSha !== item.sha256) {
      throw new Error(`Pinned base file mismatch: ${bundleName}/${item.path}`);
    }
    objects.push({
      local: path.relative(root, absolute),
      key: `${releasePrefix}/${bundleName}/${item.path}`,
      bytes: item.bytes,
      sha256: item.sha256,
      contentType: item.path.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream',
    });
  }
}

objects.unshift({
  local: descriptorRelative,
  key: `${releasePrefix}/manifest.json`,
  bytes: descriptorBytes.byteLength,
  sha256: createHash('sha256').update(descriptorBytes).digest('hex'),
  contentType: 'application/json; charset=utf-8',
});

const release = {
  schema: 'pocket-earth.oss-release/v1',
  release: descriptor.releaseId,
  bucket: 'last-night-on-earth',
  endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
  publicBase: 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com',
  status: 'ready-for-upload',
  bundleBytes: descriptor.totalBytes,
  objects,
};

const output = path.join(root, 'docs/deploy/oss-base-release-20260811.json');
await writeFile(output, `${JSON.stringify(release, null, 2)}\n`);
console.log(JSON.stringify({ output, objects: objects.length, bytes: objects.reduce((sum, item) => sum + item.bytes, 0) }));
