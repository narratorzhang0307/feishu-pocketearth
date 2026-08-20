import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(playwrightModule);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'docs/assets/hardware/render-sources/hardware-visual-boards.html');
const denseSource = path.join(root, 'docs/assets/hardware/render-sources/frost-edge-dense-boards.html');
const outputDir = path.join(root, 'docs/assets/hardware/frost-edge-4k');
const requestedSlides = new Set(
  String(process.env.HARDWARE_SLIDES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const shouldRender = (slide) => requestedSlides.size === 0 || requestedSlides.has(slide);
const slides = [
  ['01', '05-frost-edge-hardware-overview-4k.png'],
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({
  viewport: { width: 2048, height: 1152 },
  deviceScaleFactor: 2,
});

for (const [slide, name] of slides) {
  if (!shouldRender(slide)) continue;
  const url = `${pathToFileURL(source).href}?slide=${slide}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({
    content: `
      html, body { width: 2048px !important; height: 1152px !important; overflow: hidden !important; }
      .slide.active { transform: none !important; transform-origin: 0 0 !important; }
    `,
  });
  await page.screenshot({
    path: path.join(outputDir, name),
    fullPage: false,
    animations: 'disabled',
  });
}

for (const [slide, name] of [
  ['A', '01-mobile-to-frost-edge-system-boundary-4k.png'],
  ['B', '02-frost-edge-raspberry-pi-runtime-layers-4k.png'],
  ['C', '03-working-prototype-to-frost-edge-product-4k.png'],
  ['D', '04-frost-edge-hardware-anatomy-google-ai-4k.png'],
  ['E', '06-frost-edge-real-device-experiences-4k.png'],
  ['F', '07-gemma-gemini-edge-cloud-routing-4k.png'],
  ['G', '08-code-to-device-verification-chain-4k.png'],
]) {
  if (!shouldRender(slide)) continue;
  await page.goto(`${pathToFileURL(denseSource).href}?slide=${slide}`, { waitUntil: 'load' });
  await page.screenshot({
    path: path.join(outputDir, name),
    fullPage: false,
    animations: 'disabled',
  });
}

await browser.close();
console.log(outputDir);
