export interface DocumentPreprocessAudit {
  skewDegrees: number;
  skewConfidence: number;
  crop: { x: number; y: number; width: number; height: number } | null;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (context) { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0); }
  return canvas;
}

function grayscaleSample(source: HTMLCanvasElement, maxSide = 320): { values: Uint8Array; width: number; height: number } | null {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height, 1));
  const width = Math.max(1, Math.round(source.width * scale)); const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data; const values = new Uint8Array(width * height);
  for (let index = 0; index < values.length; index += 1) {
    const offset = index * 4; values[index] = Math.round(rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114);
  }
  return { values, width, height };
}

export function estimateSkewFromGrayscale(values: Uint8Array, width: number, height: number): { degrees: number; confidence: number } {
  if (width < 24 || height < 24 || values.length !== width * height) return { degrees: 0, confidence: 1 };
  let mean = 0; for (const value of values) mean += value; mean /= values.length;
  const threshold = Math.max(80, Math.min(220, mean - 28));
  const score = (degrees: number) => {
    const bins = new Float64Array(height + Math.ceil(width * 0.12) + 4); const shift = Math.ceil(width * 0.06) + 2; const tangent = Math.tan(degrees * Math.PI / 180);
    for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
      const value = values[y * width + x]; if (value >= threshold) continue;
      const target = Math.round(y + (x - width / 2) * tangent) + shift;
      if (target >= 0 && target < bins.length) bins[target] += (threshold - value) / threshold;
    }
    let average = 0; for (const value of bins) average += value; average /= bins.length;
    let variance = 0; for (const value of bins) variance += (value - average) ** 2;
    return variance / bins.length;
  };
  const baseline = score(0); let best = baseline; let bestDegrees = 0;
  for (let degrees = -5; degrees <= 5.001; degrees += 0.5) { const current = score(degrees); if (current > best) { best = current; bestDegrees = degrees; } }
  const confidence = baseline > 0 ? best / baseline : 1;
  return Math.abs(bestDegrees) >= 0.75 && confidence >= 1.08 ? { degrees: Math.round(bestDegrees * 10) / 10, confidence } : { degrees: 0, confidence };
}

function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  if (!degrees) return cloneCanvas(source);
  const radians = degrees * Math.PI / 180; const cosine = Math.abs(Math.cos(radians)); const sine = Math.abs(Math.sin(radians));
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(source.width * cosine + source.height * sine); canvas.height = Math.ceil(source.width * sine + source.height * cosine);
  const context = canvas.getContext('2d', { alpha: false }); if (!context) return cloneCanvas(source);
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.translate(canvas.width / 2, canvas.height / 2); context.rotate(radians); context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function boundedInkCrop(source: HTMLCanvasElement): { canvas: HTMLCanvasElement; crop: DocumentPreprocessAudit['crop'] } {
  const sample = grayscaleSample(source, 420); if (!sample) return { canvas: source, crop: null };
  const { values, width, height } = sample; let mean = 0; for (const value of values) mean += value; mean /= values.length;
  const threshold = Math.max(120, Math.min(238, mean - 10)); let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (values[y * width + x] < threshold) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  if (right < left || bottom < top) return { canvas: source, crop: null };
  const marginX = Math.round(width * 0.035); const marginY = Math.round(height * 0.035);
  left = Math.max(0, left - marginX); top = Math.max(0, top - marginY); right = Math.min(width - 1, right + marginX); bottom = Math.min(height - 1, bottom + marginY);
  const sampleWidth = right - left + 1; const sampleHeight = bottom - top + 1;
  const reduction = 1 - (sampleWidth * sampleHeight) / (width * height);
  if (reduction < 0.03 || sampleWidth / width < 0.72 || sampleHeight / height < 0.72) return { canvas: source, crop: null };
  const scaleX = source.width / width; const scaleY = source.height / height;
  const crop = { x: Math.max(0, Math.floor(left * scaleX)), y: Math.max(0, Math.floor(top * scaleY)), width: Math.min(source.width, Math.ceil(sampleWidth * scaleX)), height: Math.min(source.height, Math.ceil(sampleHeight * scaleY)) };
  const canvas = document.createElement('canvas'); canvas.width = crop.width; canvas.height = crop.height;
  const context = canvas.getContext('2d', { alpha: false }); if (!context) return { canvas: source, crop: null };
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return { canvas, crop };
}

export function prepareDocumentCanvas(source: HTMLCanvasElement): { canvas: HTMLCanvasElement; audit: DocumentPreprocessAudit } {
  const sample = grayscaleSample(source); const skew = sample ? estimateSkewFromGrayscale(sample.values, sample.width, sample.height) : { degrees: 0, confidence: 1 };
  const cropped = boundedInkCrop(rotateCanvas(source, skew.degrees));
  return { canvas: cropped.canvas, audit: { skewDegrees: skew.degrees, skewConfidence: Math.round(skew.confidence * 1000) / 1000, crop: cropped.crop, sourceWidth: source.width, sourceHeight: source.height, outputWidth: cropped.canvas.width, outputHeight: cropped.canvas.height } };
}
