#!/usr/bin/env node
/**
 * Reproducible local MNN OCR smoke evaluation for Pocket Earth Photos.
 * The fixtures are synthetic and contain no user photo or private transaction.
 *
 * Usage:
 *   node scripts/evaluate-photo-ocr-fixture.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const FIXTURE_DIR = path.join(ROOT, 'tests/fixtures/photo-radar');
const ENDPOINT = process.env.MNN_URL || 'http://127.0.0.1:8000';
const PROMPT = '只抄录图片中实际可见的票据或文档，不补全看不清的字符。返回 JSON：kind(receipt|boarding-pass|ticket|qr-code|document), text, merchant, amount, date, identifiers(数组), confidence(0-1)。只输出 JSON。';

function normalize(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

function parseObject(value) {
  if (typeof value !== 'string') return null;
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(value.slice(start, end + 1)); } catch { return null; }
}

async function infer(file, adapter) {
  const image = await fs.readFile(file);
  const startedAt = Date.now();
  const response = await fetch(`${ENDPOINT}/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'vision', images: [image.toString('base64')], detail: adapter ? 'ocr' : 'high',
      max_new_tokens: adapter ? 960 : 768, prompt: PROMPT, ...(adapter ? { adapter } : {}),
    }),
    signal: AbortSignal.timeout(125_000),
  });
  const envelope = await response.json();
  const parsed = parseObject(envelope.text);
  if (!response.ok || !parsed) throw new Error(`${adapter || 'base'} inference failed: ${JSON.stringify(envelope)}`);
  return { parsed, elapsedMs: Date.now() - startedAt };
}

function evaluate(result, truth) {
  const expected = normalize(truth.text);
  const actual = normalize(result.text);
  const visible = normalize(`${result.text || ''} ${(result.identifiers || []).join(' ')}`);
  const exact = (field) => normalize(result[field]) === normalize(truth[field]);
  return {
    cer: Number((editDistance(expected, actual) / Math.max(1, expected.length)).toFixed(4)),
    mustContainRecall: Number((truth.mustContain.filter((value) => visible.includes(normalize(value))).length / truth.mustContain.length).toFixed(4)),
    structuredFields: { merchant: exact('merchant'), amount: exact('amount'), date: exact('date') },
    structuredFieldAccuracy: Number(([exact('merchant'), exact('amount'), exact('date')].filter(Boolean).length / 3).toFixed(4)),
    identifierRecall: Number((truth.identifiers.filter((value) => visible.includes(normalize(value))).length / truth.identifiers.length).toFixed(4)),
    reportedConfidence: Number(result.confidence) || 0,
  };
}

const truth = JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, 'synthetic-receipt-ground-truth.json'), 'utf8'));
const cases = [
  ['clean-base', path.join(FIXTURE_DIR, 'synthetic-receipt-clean.png'), ''],
  ['stress-base', path.join(FIXTURE_DIR, 'synthetic-receipt-stress.png'), ''],
  ['stress-general-ocr-v6', path.join(FIXTURE_DIR, 'synthetic-receipt-stress.png'), 'general-ocr-vision'],
];
const evidence = { schema: 'pocket-earth-photo-ocr-eval/v1', synthetic: true, endpoint: ENDPOINT, runAt: new Date().toISOString(), cases: {} };
for (const [name, file, adapter] of cases) {
  const { parsed, elapsedMs } = await infer(file, adapter);
  evidence.cases[name] = { adapter: adapter || 'base', elapsedMs, metrics: evaluate(parsed, truth), output: parsed };
}
console.log(JSON.stringify(evidence, null, 2));
