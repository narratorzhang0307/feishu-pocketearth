import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createServer } from 'vite';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = join(projectRoot, 'tests', 'fixtures', 'reading-jot');
const endpoint = process.env.MNN_URL || 'http://127.0.0.1:8000';
const prompt = '只转录这张裁剪图中实际可见的书中文字。保留原文标点和换行；看不清写□；不要解释、续写、改写或总结。只输出 JSON：{"text":"...","confidence":0-1}。';
const documentSystem = '你是严谨的通用文档 OCR。完整转录图中可见文字，保持真实阅读顺序；标题、段落、列表和表格尽量用 Markdown 保留。不可见字符写 □，不得按上下文补字；印章、水印或手写批注若确实可见也要单独标明。只输出转录结果，不解释。';
const documentPrompt = '逐字转录这张普通文档或照片。不要总结、解释、翻译或补全看不清的字；印章、水印、页码与正文分行保留。完成最后一个可见字符后立即结束。只输出转录文本。';

function editDistance(left, right) {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function normalizedText(value) {
  return value.replace(/[\s\p{P}\p{S}]/gu, '');
}

function characterErrorRate(actual, expected) {
  const left = normalizedText(actual);
  const right = normalizedText(expected);
  return right.length ? editDistance(left, right) / right.length : left.length ? 1 : 0;
}

async function infer(image, adapter, profile = {}) {
  const startedAt = performance.now();
  const maxTokens = profile.maxTokens || 720;
  const budgets = [...new Set([maxTokens, maxTokens - 1, maxTokens - 2, maxTokens - 4].filter((value) => value > 0))];
  let lastFailure = '';
  for (const decodeBudget of budgets) {
    const response = await fetch(`${endpoint}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'vision',
        system: profile.system,
        prompt: profile.prompt || prompt,
        images: [`data:image/png;base64,${image.toString('base64')}`],
        adapter,
        detail: 'ocr',
        max_new_tokens: decodeBudget,
      }),
      signal: AbortSignal.timeout(150_000),
    });
    const data = await response.json();
    if (response.ok && data.backend === 'mnn' && typeof data.text === 'string') {
      return { raw: data.text.trim(), elapsedMs: Math.round(performance.now() - startedAt), backend: data.backend, decodeBudget };
    }
    lastFailure = `${response.status} ${JSON.stringify(data)}`;
    if (!/utf-8|decode/i.test(String(data.error || ''))) break;
  }
  throw new Error(`${adapter || 'base'} inference failed: ${lastFailure}`);
}

const vite = await createServer({ root: projectRoot, configFile: false, logLevel: 'silent', server: { middlewareMode: true } });
try {
  const { decideReadingOcr, decideReadingVerification, parseReadingOcr } = await vite.ssrLoadModule('/src/app/lib/readingJot.ts');
  const truth = JSON.parse(await readFile(join(fixtureDir, 'ground-truth.json'), 'utf8'));
  const stressMode = process.argv.includes('--stress');
  const transferMode = process.argv.includes('--transfer');
  const stress = stressMode ? JSON.parse(await readFile(join(fixtureDir, 'stress-cases.json'), 'utf8')) : null;
  const transfer = transferMode ? JSON.parse(await readFile(join(fixtureDir, 'transfer-cases.json'), 'utf8')) : null;
  const requestProfile = transferMode ? { system: documentSystem, prompt: documentPrompt, maxTokens: 256 } : {};
  const cases = transferMode
    ? transfer.cases.map((fixture) => ({ ...fixture, crop: fixture.file }))
    : stressMode
    ? stress.cases.map((fixture) => ({ ...fixture, mode: 'underline', expectedText: stress.expectedText, crop: fixture.file }))
    : ['underline', 'brackets'].map((mode) => ({ id: mode, label: mode, mode, ...truth[mode] }));
  const results = [];
  for (const fixture of cases) {
    const mode = fixture.mode;
    const image = await readFile(join(fixtureDir, fixture.crop));
    process.stderr.write(`[reading-jot] ${fixture.id}: Base 开始\n`);
    const baseRun = await infer(image, undefined, requestProfile);
    process.stderr.write(`[reading-jot] ${fixture.id}: Base 完成 ${baseRun.elapsedMs}ms；LoRA 开始\n`);
    const loraRun = await infer(image, 'general-ocr-vision', requestProfile);
    process.stderr.write(`[reading-jot] ${fixture.id}: LoRA 完成 ${loraRun.elapsedMs}ms\n`);
    const base = { ...parseReadingOcr(baseRun.raw), maxTokens: baseRun.decodeBudget };
    const lora = { ...parseReadingOcr(loraRun.raw), maxTokens: loraRun.decodeBudget };
    const verificationPlan = decideReadingVerification(base, lora);
    let verificationRun;
    let verification;
    if (verificationPlan.run) {
      const verificationImage = await sharp(image).grayscale().linear(1.16, -20.4).jpeg({ quality: 90 }).toBuffer();
      const verifyWithLora = verificationPlan.route === 'general-ocr-vision';
      process.stderr.write(`[reading-jot] ${fixture.id}: ${verifyWithLora ? 'LoRA' : 'Base'} 增强视图复核开始\n`);
      verificationRun = await infer(verificationImage, verifyWithLora ? 'general-ocr-vision' : undefined, verifyWithLora ? { ...requestProfile, maxTokens: 256 } : requestProfile);
      verification = { ...parseReadingOcr(verificationRun.raw), maxTokens: verificationRun.decodeBudget };
      process.stderr.write(`[reading-jot] ${fixture.id}: 增强视图复核完成 ${verificationRun.elapsedMs}ms\n`);
    }
    const decision = decideReadingOcr(base, lora, verification ? { route: verificationPlan.route, output: verification } : undefined);
    results.push({
      caseId: fixture.id,
      label: fixture.label,
      mode,
      expectedText: fixture.expectedText,
      base: { ...baseRun, ...base, cer: characterErrorRate(base.text, fixture.expectedText) },
      lora: { ...loraRun, ...lora, cer: characterErrorRate(lora.text, fixture.expectedText) },
      ...(verificationRun && verification ? { verification: { ...verificationRun, ...verification, route: verificationPlan.route, cer: characterErrorRate(verification.text, fixture.expectedText) } } : {}),
      decision: {
        selected: decision.selected,
        route: decision.route,
        qualityGate: decision.qualityGate,
        needsReview: decision.needsReview,
        reason: decision.reason,
        policyVersion: decision.policyVersion,
        gateReasons: decision.gateReasons,
        selectedText: decision.finalText,
      },
    });
  }
  process.stdout.write(`${JSON.stringify({
    schema: transferMode ? 'pocket-earth.reading-jot-transfer-eval.v1' : stressMode ? 'pocket-earth.reading-jot-stress-eval.v1' : 'pocket-earth.reading-jot-eval.v1',
    createdAt: new Date().toISOString(),
    syntheticFixture: true,
    fixtureLicense: transferMode ? transfer.license : stressMode ? stress.license : truth.license,
    endpoint,
    runtime: 'MNN 3.6.1 / Qwen3-VL-2B-Instruct',
    results,
  }, null, 2)}\n`);
} finally {
  await vite.close();
}
