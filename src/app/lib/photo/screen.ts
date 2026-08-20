// 编排器：单张走串行流水线（Handoff Contract，阶段间只传 PhotoFeatures/PhotoResult 小结论，
// 原图/canvas 绝不留主上下文），再查重聚类→Critic 纠错→持久化。舱壁降级：单张坏图跳过不中断整轮。
import { extractFeatures, readExif } from './features';
import { ensureVision, classifyVision } from './vision';
import { classify, valueByType, technicalQualityOf, technicalReasonsOf, decide, dedupAndCluster, inRange } from './reasoning';
import { applyCritic, applySoftBias, applyUserOverride } from './critic';
import { getKnown, putPhoto } from './store';
import type { PhotoResult, ScreenOpts } from './types';

type Progress = (done: number, total: number, phase: string) => void;

export async function runScreen(files: File[], opts: ScreenOpts, onProgress?: Progress): Promise<PhotoResult[]> {
  const maxSize = opts.maxAnalyze || 256;

  // ① 读 EXIF 日期做时间段过滤（cheap；贵的 decode/CLIP 压到后面、最少）
  onProgress?.(0, files.length, '读取拍摄日期');
  const inrange: { file: File; exif: Awaited<ReturnType<typeof readExif>> | null }[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const ex = await readExif(files[i]);
      const hint = opts.assetHints?.[files[i].name];
      if (hint?.capDate) ex.capDate = hint.capDate;
      if (hint?.latitude != null && hint?.longitude != null) {
        ex.hasGPS = true; ex.lat = hint.latitude; ex.lng = hint.longitude;
      }
      if (inRange(ex.capDate, opts.fromYM, opts.toYM)) inrange.push({ file: files[i], exif: ex });
    }
    catch { if (opts.fromYM == null && opts.toYM == null) inrange.push({ file: files[i], exif: null }); }   // 读不出日期且没设范围 → 收进来（preExif=null，pass③ 内部回落自读）
    onProgress?.(i + 1, files.length, '读取拍摄日期');
  }

  // ② 端侧模型仅在勾选时预热一次（超时/失败优雅降级，绝不卡死）
  let modelReady = false;
  if (opts.useModel) { onProgress?.(0, 1, '加载端侧模型…'); modelReady = await ensureVision((s) => onProgress?.(0, 1, s)); }

  // ③ 逐张：features → 查记忆 →（需要才）CLIP → classify → value → decide
  const results: PhotoResult[] = [];
  for (let i = 0; i < inrange.length; i++) {
    onProgress?.(i + 1, inrange.length, '端侧逐张分析');
    const { file, exif: preExif } = inrange[i];
    let ex: Awaited<ReturnType<typeof extractFeatures>> = null;
    try { ex = await extractFeatures(file, maxSize, preExif ?? undefined); } catch { ex = null; }   // 舱壁：坏图/HEIC 解码失败 → 跳过；复用 ① 的 EXIF
    if (!ex) continue;
    const { features, canvas } = ex;
    const known = await getKnown(features.dHash);
    // 跑 CLIP 条件：开了模型 ∧ 就绪 ∧ 没跑过 ∧（资料临界 / 钉候选 / 无相机信息）
    let vision: Awaited<ReturnType<typeof classifyVision>> = null;
    const wantVision = modelReady && !known?.hadVision &&
      ((features.isUtilityProb >= 0.3 && features.isUtilityProb <= 0.7) || (features.hasCameraFields && features.hasGPS) || !features.hasCameraFields);
    if (wantVision) { onProgress?.(i + 1, inrange.length, '端侧模型精筛'); try { vision = await classifyVision(canvas); } catch { vision = null; } }
    // canvas 出此作用域即可 GC（修 OOM：不挂到 result 上）

    const c = classify(features, vision);
    const valueScore = valueByType(features, c.photoType);
    const technicalQuality = technicalQualityOf(features);
    const dec = decide(c.photoType, valueScore, features.hasGPS);
    const confidence = c.photoType === 'uncertain' ? 0.35
      : vision ? 0.86
        : features.softwareIsScreenshot || features.hasCameraFields || features.hasGPS ? 0.92
          : c.photoType === 'junk' ? 0.88 : 0.64;
    const r: PhotoResult = {
      id: features.dHash, uid: features.dHash + ':' + i, url: URL.createObjectURL(file), name: file.name, date: features.capDate,
      sourceSize: file.size, sourceLastModified: file.lastModified,
      perceptualHash: features.pHash,
      w: features.w, h: features.h, photoType: c.photoType, valueScore, technicalQuality,
      sharpness: features.sharpness, exposure: features.exposure, colorful: features.colorful,
      contrast: features.contrast, meanLuma: features.mean,
      confidence, verdict: dec.verdict, pinnable: dec.pinnable,
      needPlace: dec.needPlace, hasGPS: features.hasGPS, lat: features.lat, lng: features.lng,
      pinSource: features.hasGPS ? 'exif' : undefined, tags: c.tags, reason: c.reason, reasons: [c.reason], features,
    };
    applyCritic(r);
    applySoftBias(r);              // 端侧纠错统计 → 临界张有界软偏置（铁证不翻、只动临界）
    applyUserOverride(r, known);
    results.push(r);
  }

  // ④ 查重 + 时空聚类（簇代表才 pinnable）
  onProgress?.(0, 1, '查重聚类');
  const final = dedupAndCluster(results);

  for (const r of final) {
    r.reasons = [r.reason, ...(r.features ? technicalReasonsOf(r.features) : [])];
  }

  // ⑤ 持久化（只写派生小结论，原图/canvas/embedding 无字段位置）
  for (const r of final) {
    try { await putPhoto({ id: r.id, photoType: r.photoType, valueScore: r.valueScore, verdict: r.verdict, pinnable: r.pinnable, hasGPS: r.hasGPS, lat: r.lat, lng: r.lng, hadVision: !!(opts.useModel && modelReady), userOverride: r.userOverride, ts: Date.now() }); } catch { /* 隐私模式忽略 */ }
  }
  for (const r of final) delete r.features;   // 释放
  return final;
}
