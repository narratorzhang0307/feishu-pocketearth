import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = process.argv.slice(2);
if (!targets.length) throw new Error('usage: node scripts/rejudge-reading-jot-evidence.mjs <evidence.json> [...]');

const vite = await createServer({ root: projectRoot, configFile: false, logLevel: 'silent', server: { middlewareMode: true } });
try {
  const { decideReadingOcr } = await vite.ssrLoadModule('/src/app/lib/readingJot.ts');
  for (const target of targets) {
    const path = join(projectRoot, target);
    const evidence = JSON.parse(await readFile(path, 'utf8'));
    evidence.rejudgedAt = new Date().toISOString();
    evidence.results = evidence.results.map((result) => {
      const verificationInput = result.verification
        ? { route: result.verification.route || 'base', output: result.verification }
        : undefined;
      const decision = decideReadingOcr(result.base, result.lora, verificationInput);
      return {
        ...result,
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
      };
    });
    const temporary = `${path}.part`;
    await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
    process.stdout.write(`rejudged ${target}\n`);
  }
} finally {
  await vite.close();
}
