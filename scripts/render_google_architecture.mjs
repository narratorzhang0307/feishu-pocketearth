#!/usr/bin/env node

import { copyFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'file:///Users/zhangcheng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = '/Users/zhangcheng/Desktop/pocket earth_google';
const source = `${root}/docs/technical-evidence/architecture/index.html`;
const outputDir = `${root}/PocketEarthGoogle_提交包/02_架构图`;
const outputs = {
  A: `${outputDir}/架构图A_frost-agent_Google-first_4K.png`,
  B: `${outputDir}/架构图B_Google推理主链_GMI弱化版_4K.png`,
  C: `${outputDir}/架构图C_跨文化看展闭环_4K.png`,
  D: `${outputDir}/架构图D_可信执行证据_4K.png`,
};
const legacyBOutput = `${outputDir}/架构图B_Google双推理平面_4K.png`;

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
try {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  for (const [id, output] of Object.entries(outputs)) {
    const url = new URL(pathToFileURL(source));
    url.searchParams.set('id', id);
    await page.goto(url.href, { waitUntil: 'load' });
    await page.addStyleTag({ content: 'html,body{width:1920px;height:1080px}.canvas{transform:scale(.9375)}' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: output, fullPage: false });
  }
  await copyFile(outputs.B, legacyBOutput);
  await context.close();
} finally {
  await browser.close();
}

for (const output of Object.values(outputs)) console.log(output);
console.log(legacyBOutput);
