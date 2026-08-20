// 感知层：把一张 File 解成「带置信度的便宜信号小结论」PhotoFeatures。
// 认知漏斗：解码→EXIF金信号→像素废片→资料投票→dHash/pHash。原图/canvas 跑完即释放（修 OOM）。
import { clamp01, type PhotoFeatures } from './types';
import { decode, dHash, pHash } from '../skills/browserVision';   // 通用图像原语（解码缩图 / 感知哈希）收口到 skill

let exifrMod: any = null;

interface ExifInfo {
  capDate: Date | null; hasCameraFields: boolean; hasGPS: boolean;
  lat?: number; lng?: number; softwareIsScreenshot: boolean; suspectExif: boolean;
}

// ── EXIF 金信号（最便宜最确定）：相机字段 / GPS / 截图软件 / 一致性校验 ──
export async function readExif(file: File): Promise<ExifInfo> {
  let out: any = null;
  try {
    if (!exifrMod) exifrMod = await import('exifr');
    const parse = exifrMod.parse || exifrMod.default?.parse;
    out = await parse(file, { tiff: true, ifd0: true, exif: true, gps: true });
  } catch { /* 无 EXIF / HEIC 解析失败 */ }
  const rawDate = out?.DateTimeOriginal || out?.CreateDate || out?.ModifyDate;
  let capDate: Date | null = rawDate instanceof Date && !isNaN(+rawDate) ? rawDate : null;
  if (!capDate && file.lastModified) { const d = new Date(file.lastModified); if (!isNaN(+d)) capDate = d; }
  const software = ((out?.Software || '') + '');
  const hasCameraFields = !!(out?.Make || out?.Model || out?.FNumber || out?.ExposureTime || out?.ISO || out?.FocalLength);
  const lat = typeof out?.latitude === 'number' ? out.latitude : undefined;
  const lng = typeof out?.longitude === 'number' ? out.longitude : undefined;
  const hasGPS = lat != null && lng != null && !(lat === 0 && lng === 0);
  const softwareIsScreenshot = /screenshot|screen shot|截屏|截图|snipaste|shottr|cleanshot|lightshot|snip/i.test(software);
  let suspectExif = false;
  if (hasGPS && (Math.abs(lat!) > 90 || Math.abs(lng!) > 180)) suspectExif = true;       // GPS 在海里
  if (capDate && capDate.getFullYear() < 1995) suspectExif = true;                        // 时间在出生前
  if (softwareIsScreenshot) suspectExif = true;                                           // 截图工具
  return { capDate, hasCameraFields, hasGPS, lat, lng, softwareIsScreenshot, suspectExif };
}

// ── 像素质量（清晰/曝光/色彩/对比/亮度）——只服务废片闸 + 簇内选优，不单独决定留/钉 ──
function pixelMetrics(data: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const gray = new Float32Array(n);
  let sum = 0, sum2 = 0, clip = 0, rgMean = 0, ybMean = 0;
  const rg = new Float32Array(n), yb = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = y; sum += y; sum2 += y * y;
    if (y < 6 || y > 249) clip++;
    const a = r - g, bb = 0.5 * (r + g) - b;
    rg[i] = a; yb[i] = bb; rgMean += a; ybMean += bb;
  }
  const mean = sum / n;
  const contrastStd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  let lapSum = 0, lapSum2 = 0, lapN = 0;
  for (let yk = 1; yk < h - 1; yk++) for (let xk = 1; xk < w - 1; xk++) {
    const i = yk * w + xk;
    const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
    lapSum += lap; lapSum2 += lap * lap; lapN++;
  }
  const lapVar = lapN ? Math.max(0, lapSum2 / lapN - (lapSum / lapN) ** 2) : 0;
  rgMean /= n; ybMean /= n;
  let rgVar = 0, ybVar = 0;
  for (let i = 0; i < n; i++) { rgVar += (rg[i] - rgMean) ** 2; ybVar += (yb[i] - ybMean) ** 2; }
  const colorfulness = Math.sqrt(rgVar / n + ybVar / n) + 0.3 * Math.sqrt(rgMean * rgMean + ybMean * ybMean);
  return {
    sharpness: clamp01(lapVar / 900),
    exposure: clamp01(1 - Math.abs(mean - 128) / 128) * clamp01(1 - (clip / n) * 2),
    colorful: clamp01(colorfulness / 80),
    contrast: clamp01(contrastStd / 70),
    mean,
  };
}

// ── 资料检测多信号投票（关键修复：替换脆弱的 colorful<0.18&&contrast>0.55 单规则）──
// 屏幕宽高比表（竖/横）：iPhone 19.5:9、16:9、18:9、4:3 等
const SCREEN_RATIOS = [0.4615, 0.4624, 0.462, 0.5, 0.5625, 0.75, 0.4737];
function utilityVote(data: Uint8ClampedArray, w: number, h: number, m: { contrast: number; colorful: number }, exif: ExifInfo, origW: number, origH: number): { isUtilityProb: number; aspectScreenHit: boolean } {
  const n = w * h;
  // 量化颜色（4bit/通道 → 4096 桶）：唯一色数 + 最大单色块占比
  const bins = new Int32Array(4096);
  for (let p = 0; p < n * 4; p += 4) {
    const key = ((data[p] >> 4) << 8) | ((data[p + 1] >> 4) << 4) | (data[p + 2] >> 4);
    bins[key]++;
  }
  let unique = 0, maxBin = 0;
  for (let i = 0; i < 4096; i++) { if (bins[i] > 0) { unique++; if (bins[i] > maxBin) maxBin = bins[i]; } }
  const uniqueRatio = unique / n;
  const maxSolidBlockRatio = maxBin / n;
  // 宽高比命中屏幕分辨率（用原始尺寸）
  const ratio = Math.min(origW, origH) / Math.max(origW, origH);
  const aspectScreenHit = SCREEN_RATIOS.some((r) => Math.abs(ratio - r) < 0.006);

  if (exif.softwareIsScreenshot) return { isUtilityProb: 0.9, aspectScreenHit };
  const flat = maxSolidBlockRatio > 0.25;
  const fewColors = uniqueRatio < 0.04;
  const docLike = m.contrast > 0.5 && m.colorful < 0.2;        // 高对比低色彩 = 文档/票据 B/W 文字
  // 「硬屏内特征」=像素层面真证据；宽高比只是弱信号（16:9/4:3 也是大量实拍横图的比例，不能单独算屏内）
  const hardScreenish = flat || fewColors || docLike;
  let s = 0;
  if (flat) s += 0.3;
  if (fewColors) s += 0.3;
  if (docLike) s += 0.3;
  if (aspectScreenHit) s += 0.25;
  if (!exif.hasCameraFields) s += 0.25;
  // 关键护栏：没有任何「硬屏内特征」→ 即便宽高比命中或无相机 EXIF（可能是被社交平台剥了 EXIF 的真横图），
  // 也封顶 0.3、不武断判资料。aspectScreenHit 单独命中不再解除封顶（修：16:9/4:3 实拍横图被误判资料）。
  if (!hardScreenish) s = Math.min(s, 0.3);
  return { isUtilityProb: clamp01(s), aspectScreenHit };
}

// ── 感知层主入口：解一张图 → PhotoFeatures（小结论）+ canvas（caller 用完即弃，修 OOM）──
export async function extractFeatures(file: File, maxSize: number, preExif?: Awaited<ReturnType<typeof readExif>>): Promise<{ features: PhotoFeatures; canvas: HTMLCanvasElement } | null> {
  const exif = preExif ?? await readExif(file);   // 复用 ① 已解析的 EXIF，免每张重复解析（screen.ts pass① 已读过）
  const dec = await decode(file, maxSize);
  if (!dec) return null;
  const ctx = dec.canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, dec.canvas.width, dec.canvas.height);
  const m = pixelMetrics(img.data, dec.canvas.width, dec.canvas.height);
  const uv = utilityVote(img.data, dec.canvas.width, dec.canvas.height, m, exif, dec.w, dec.h);
  const features: PhotoFeatures = {
    dHash: dHash(dec.canvas),
    pHash: pHash(dec.canvas),
    w: dec.w, h: dec.h,
    capDate: exif.capDate, hasCameraFields: exif.hasCameraFields, hasGPS: exif.hasGPS,
    lat: exif.lat, lng: exif.lng, softwareIsScreenshot: exif.softwareIsScreenshot, suspectExif: exif.suspectExif,
    sharpness: m.sharpness, exposure: m.exposure, colorful: m.colorful, contrast: m.contrast, mean: m.mean,
    aspectScreenHit: uv.aspectScreenHit, isUtilityProb: uv.isUtilityProb,
  };
  return { features, canvas: dec.canvas };
}
