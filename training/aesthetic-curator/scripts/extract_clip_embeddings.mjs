#!/usr/bin/env node
/** Extract the same quantized CLIP vectors used by the Photos tab, with resume support. */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from '@huggingface/transformers';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const VERSION = 'clip-vit-b32-q8-int8-v1';

function argument(name, fallback = undefined) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function quantize(values) {
  const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => Math.max(-127, Math.min(127, Math.round((value / length) * 127))));
}

const inputPath = argument('input');
const outputPath = argument('output');
const limit = Number(argument('limit', '0'));
const batchSize = Number(argument('batch-size', '8'));
if (!inputPath || !outputPath) throw new Error('Usage: --input manifest.jsonl --output embeddings.jsonl');
if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('--batch-size must be a positive integer');

env.cacheDir = path.resolve('training/aesthetic-curator/.model-cache/transformers-js');
await fsp.mkdir(env.cacheDir, { recursive: true });
await fsp.mkdir(path.dirname(outputPath), { recursive: true });
const source = (await fsp.readFile(inputPath, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const records = limit > 0 ? source.slice(0, limit) : source;
const completed = new Set();
if (fs.existsSync(outputPath)) {
  for (const line of (await fsp.readFile(outputPath, 'utf8')).split('\n')) {
    if (line.trim()) completed.add(JSON.parse(line).image);
  }
}

console.error(`loading ${MODEL_ID} (${VERSION}); ${completed.size}/${records.length} already complete`);
const [processor, model] = await Promise.all([
  AutoProcessor.from_pretrained(MODEL_ID),
  CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
]);
const pending = records.filter((record) => !completed.has(record.image));
const handle = fs.createWriteStream(outputPath, { flags: 'a' });
let done = completed.size;
for (let start = 0; start < pending.length; start += batchSize) {
  const batch = pending.slice(start, start + batchSize);
  const images = await Promise.all(batch.map((record) => RawImage.read(record.path)));
  const inputs = await processor(images);
  const output = await model(inputs);
  const vectors = output.image_embeds.normalize().tolist();
  if (vectors.length !== batch.length) throw new Error(`Embedding batch mismatch at ${start}`);
  for (let index = 0; index < batch.length; index += 1) {
    handle.write(`${JSON.stringify({
      image: batch[index].image,
      modelId: MODEL_ID,
      version: VERSION,
      dimension: vectors[index].length,
      quantization: 'symmetric-int8',
      vector: quantize(vectors[index]),
    })}\n`);
  }
  done += batch.length;
  if (done % 100 === 0 || done === records.length) console.error(`embedded ${done}/${records.length}`);
}
await new Promise((resolve, reject) => handle.end((error) => error ? reject(error) : resolve()));
await model.dispose?.();
console.log(JSON.stringify({ modelId: MODEL_ID, version: VERSION, records: done, output: outputPath }));
