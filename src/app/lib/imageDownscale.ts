// 发图前缩图：把要送去端侧视觉模型打分的图，先在前端缩小，降低上传与端侧 prefill 开销。
//
// 真机相册/相机来的是 data: / blob: 同源图，可直接画进 canvas 缩小再发——这是「发图前缩图」最划算的地方
// （一张几 MB 的原图先压到 ~512px，再交给端侧模型，prefill 大降）。
// 跨域远图（如 OSS 缩略图）不带 CORS 头时，画进 canvas 会污染、toDataURL 抛错，无法在前端缩；
// 这类图直接回退原 URL；Gemma 视觉调用会在浏览器内读取，不经过服务端端侧代理。

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * 把图缩到最长边 ≤ maxDim 的 JPEG dataURL。
 * 失败 / 跨域 / 本就够小 时回退原 src，绝不挡打分。
 */
export async function downscaleForVision(src: string, maxDim = 512, quality = 0.72): Promise<string> {
  // 跨域远图（http(s) 且非本站）canvas 会被污染、无法导出 → 交给服务端侧缩，这里直接回原图
  if (/^https?:/i.test(src)) {
    try {
      const u = new URL(src, location.href);
      if (u.origin !== location.origin) return src;
    } catch {
      return src;
    }
  }
  try {
    const img = await loadImage(src);
    const longest = Math.max(img.width, img.height);
    if (longest <= maxDim) return src; // 已经够小，不必重编码
    const s = maxDim / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * s));
    canvas.height = Math.max(1, Math.round(img.height * s));
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return src; // 加载/导出失败一律回退原图
  }
}
