// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· 纯浏览器端侧视觉原语（browser vision）—— 零网络
// ────────────────────────────────────────────────────────────────────────────
// 四个领域无关的通用图像原语：① 安全解码缩图 ② dHash ③ pHash ④ 浏览器内 CLIP 零样本分类。
//
// 与 [visionRead] 的区别（端侧看图的【两条线】，别混）：
//   · visionRead   ：走 edgeSafe.vision → 浏览器内 Gemma + MediaPipe【读字/语义】，原图不出端。
//                    适合用户【挑一张】截图/票据读成字段。
//   · browserVision：纯浏览器内 transformers.js（WASM/WebGPU）跑 CLIP【分类/打分/embedding】，
//                    原图【连本机服务都不发】。适合【整本相册批量筛选】这种极致隐私场景。
//
// 这些原语本是领域无关的通用能力（不该归 photo 整理器私有）；按关注点分离搬到公共目录，谁都能 import。
// ════════════════════════════════════════════════════════════════════════════

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); });
  return Promise.race([p, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

// ── ① 解码 + 缩图（方向归一化：createImageBitmap from-image / <img> 兜底兼容 Safari HEIC；OOM 安全释放）──
export async function decode(file: File, maxSize: number): Promise<{ canvas: HTMLCanvasElement; w: number; h: number } | null> {
  let bw = 0, bh = 0;
  let draw: (ctx: CanvasRenderingContext2D, dw: number, dh: number) => void;
  // 统一释放：不论从哪条提前返回路径都释放 bmp/objectURL，杜绝批处理 OOM。
  let cleanup: () => void = () => {};
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    bw = bmp.width; bh = bmp.height;
    draw = (ctx, dw, dh) => { ctx.drawImage(bmp, 0, 0, dw, dh); };
    cleanup = () => (bmp as ImageBitmap).close?.();
  } catch {
    const url = URL.createObjectURL(file);
    cleanup = () => URL.revokeObjectURL(url);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      bw = img.naturalWidth; bh = img.naturalHeight;
      draw = (ctx, dw, dh) => { ctx.drawImage(img, 0, 0, dw, dh); };
    } catch { cleanup(); return null; }
  }
  if (!bw || !bh) { cleanup(); return null; }
  const s = Math.min(1, maxSize / Math.max(bw, bh));
  const dw = Math.max(1, Math.round(bw * s)), dh = Math.max(1, Math.round(bh * s));
  const canvas = document.createElement('canvas');
  canvas.width = dw; canvas.height = dh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) { cleanup(); return null; }
  draw(ctx, dw, dh);
  cleanup();
  return { canvas, w: bw, h: bh };
}

// ── ② 感知哈希 dHash（9×8 灰度）+ 汉明距离：图片去重 / 找相似 ──
export function dHash(canvas: HTMLCanvasElement): string {
  const c = document.createElement('canvas');
  c.width = 9; c.height = 8;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';
  ctx.drawImage(canvas, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data;
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const i = (y * 9 + x) * 4, j = (y * 9 + x + 1) * 4;
    bits += (d[i] + d[i + 1] + d[i + 2]) > (d[j] + d[j + 1] + d[j + 2]) ? '1' : '0';
  }
  let hex = '';
  for (let k = 0; k < 64; k += 4) hex += parseInt(bits.slice(k, k + 4), 2).toString(16);
  return hex;
}
export function hamming(a: string, b: string): number {
  if (a.length !== b.length || !a) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}

// ── ③ pHash（32×32 灰度 → 低频 8×8 DCT）──
// 算法选择与阈值核对参考 OpenCV img_hash::pHash（Apache-2.0）；这里是独立的
// TypeScript 可分离 DCT 实现，不引入 OpenCV 二进制，也不复制其 C++ 源码。
const PHASH_INPUT_SIZE = 32;
const PHASH_LOW_FREQUENCY = 8;
const PHASH_COSINES = Array.from({ length: PHASH_LOW_FREQUENCY }, (_, frequency) =>
  Float64Array.from({ length: PHASH_INPUT_SIZE }, (_, position) =>
    Math.cos(((2 * position + 1) * frequency * Math.PI) / (2 * PHASH_INPUT_SIZE))),
);

const dctScale = (frequency: number): number =>
  frequency === 0 ? Math.sqrt(1 / PHASH_INPUT_SIZE) : Math.sqrt(2 / PHASH_INPUT_SIZE);

function hashBitsToHex(bits: boolean[]): string {
  let hex = '';
  for (let index = 0; index < bits.length; index += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4; bit++) nibble = (nibble << 1) | (bits[index + bit] ? 1 : 0);
    hex += nibble.toString(16);
  }
  return hex;
}

/** Pure pHash core, exported so the numerical behavior can be tested without a DOM/canvas. */
export function perceptualHashFromLuma(luma: ArrayLike<number>): string {
  if (luma.length !== PHASH_INPUT_SIZE * PHASH_INPUT_SIZE) return '';
  // Separable DCT: 32×32×8 + 32×8×8, instead of calculating every 2-D coefficient directly.
  const horizontal = new Float64Array(PHASH_INPUT_SIZE * PHASH_LOW_FREQUENCY);
  for (let y = 0; y < PHASH_INPUT_SIZE; y++) {
    for (let u = 0; u < PHASH_LOW_FREQUENCY; u++) {
      let sum = 0;
      for (let x = 0; x < PHASH_INPUT_SIZE; x++) sum += Number(luma[y * PHASH_INPUT_SIZE + x]) * PHASH_COSINES[u][x];
      horizontal[y * PHASH_LOW_FREQUENCY + u] = sum * dctScale(u);
    }
  }
  const coefficients = new Float64Array(PHASH_LOW_FREQUENCY * PHASH_LOW_FREQUENCY);
  for (let v = 0; v < PHASH_LOW_FREQUENCY; v++) {
    for (let u = 0; u < PHASH_LOW_FREQUENCY; u++) {
      let sum = 0;
      for (let y = 0; y < PHASH_INPUT_SIZE; y++) sum += horizontal[y * PHASH_LOW_FREQUENCY + u] * PHASH_COSINES[v][y];
      coefficients[v * PHASH_LOW_FREQUENCY + u] = sum * dctScale(v);
    }
  }
  coefficients[0] = 0; // DC 只表示整体亮度，不能参与视觉相似度。
  const mean = coefficients.reduce((sum, value) => sum + value, 0) / coefficients.length;
  return hashBitsToHex(Array.from(coefficients, (value) => value > mean));
}

export function pHash(canvas: HTMLCanvasElement): string {
  const reduced = document.createElement('canvas');
  reduced.width = PHASH_INPUT_SIZE; reduced.height = PHASH_INPUT_SIZE;
  const context = reduced.getContext('2d', { willReadFrequently: true });
  if (!context) return '';
  context.drawImage(canvas, 0, 0, PHASH_INPUT_SIZE, PHASH_INPUT_SIZE);
  const rgba = context.getImageData(0, 0, PHASH_INPUT_SIZE, PHASH_INPUT_SIZE).data;
  const luma = new Float64Array(PHASH_INPUT_SIZE * PHASH_INPUT_SIZE);
  for (let pixel = 0, offset = 0; pixel < luma.length; pixel++, offset += 4) {
    luma[pixel] = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
  }
  return perceptualHashFromLuma(luma);
}

// ── ④ 浏览器内 CLIP 零样本图像分类（transformers.js，WASM/WebGPU；原图不出浏览器）──
let pipe: any = null;
let tried = false;

/** 加载浏览器内 CLIP 零样本分类管线（首次需下载权重，超时绝不卡死、失败优雅降级）。 */
export async function ensureZeroShotImage(onStatus?: (s: string) => void): Promise<boolean> {
  if (pipe) return true;
  if (tried) return false;
  tried = true;
  try {
    onStatus?.('加载端侧模型…（首次需下载，最多 ~40s 自动跳过）');
    const load = (async () => {
      const url = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
      const t: any = await import(/* @vite-ignore */ url);
      if (t?.env) { t.env.allowLocalModels = false; try { t.env.remoteHost = 'https://hf-mirror.com'; } catch { /* 旧版无此项 */ } }
      return t.pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
        device: (navigator as Navigator & { gpu?: unknown }).gpu ? 'webgpu' : undefined,
      });
    })();
    pipe = await withTimeout(load, 40000);
    onStatus?.('端侧模型就绪');
    return !!pipe;
  } catch {
    pipe = null;
    tried = false;   // 不永久禁用：一次 CDN 超时后，用户联网恢复再勾选可重试加载
    onStatus?.('端侧模型加载超时/不可用，已用快速分析结果');
    return false;
  }
}

/** 对一张图（canvas 或 dataURL）做 CLIP 零样本分类，返回各候选标签的得分。未加载/失败 → null。 */
export async function classifyImage(input: HTMLCanvasElement | string, labels: string[], timeoutMs = 15000): Promise<{ label: string; score: number }[] | null> {
  if (!pipe) return null;
  try {
    const dataUrl = typeof input === 'string' ? input : input.toDataURL('image/jpeg', 0.8);
    return await withTimeout(pipe(dataUrl, labels), timeoutMs);
  } catch { return null; }
}
