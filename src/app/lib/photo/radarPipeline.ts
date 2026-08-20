import type { PhotoRuntimeStatus } from '../../../../frost-agent/edge/httpPhotoEdge';
import { runScreen } from './screen';
import { patchIndexedAssets, upsertIndexedAssets } from './libraryStore';
import { resolveThumbnailUrl } from './libraryBridge';
import type { PhotoLibraryAsset } from './libraryTypes';
import { getPhotoPreferenceModel, preferenceVector, scorePreference } from './preference';
import { putRadarAnalyses, putRadarAnalysis } from './radarStore';
import type { PhotoRadarAnalysis } from './radarTypes';
import { extractDocumentWithQualityGate, understandPhotoWithQwen } from './understanding';

export type PhotoRadarPhase = '读取缩略图' | '端侧技术分析' | '相似与事件聚类' | '保存本地索引';
export type PhotoRadarProgress = (done: number, total: number, phase: PhotoRadarPhase | string) => void;

export const PHOTO_RADAR_ALGORITHM_VERSION = 'photo-radar-dhash-phash-v3' as const;

export function needsPhotoRadarAnalysis(asset: PhotoLibraryAsset, analysis?: PhotoRadarAnalysis): boolean {
  return asset.mediaType === 'image' && (!analysis || analysis.algorithmVersion !== PHOTO_RADAR_ALGORITHM_VERSION);
}

async function analysisFile(asset: PhotoLibraryAsset): Promise<File | null> {
  try {
    if (asset.localFile) {
      return new File([asset.localFile], asset.key, { type: asset.localFile.type, lastModified: asset.localFile.lastModified });
    }
    const thumbnailUrl = await resolveThumbnailUrl(asset);
    if (!thumbnailUrl) return null;
    const response = await fetch(thumbnailUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], asset.key, { type: blob.type || asset.mimeType, lastModified: asset.modificationTime || asset.creationTime || Date.now() });
  } catch { return null; }
}

export async function photoImageDataUrl(asset: PhotoLibraryAsset): Promise<string> {
  const file = await analysisFile(asset);
  if (!file) return '';
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

export async function analyzePhotoAssets(
  assets: PhotoLibraryAsset[],
  options: { useLocalClip?: boolean; onProgress?: PhotoRadarProgress } = {},
): Promise<PhotoRadarAnalysis[]> {
  const images = assets.filter((asset) => asset.mediaType === 'image');
  await upsertIndexedAssets(images);
  const files: File[] = [];
  const failedAssetKeys: string[] = [];
  const assetByKey = new Map(images.map((asset) => [asset.key, asset]));
  const hints: NonNullable<Parameters<typeof runScreen>[1]['assetHints']> = {};
  for (let index = 0; index < images.length; index++) {
    options.onProgress?.(index, images.length, '读取缩略图');
    const asset = images[index];
    const file = await analysisFile(asset);
    if (!file) { failedAssetKeys.push(asset.key); continue; }
    files.push(file);
    hints[file.name] = {
      ...(asset.creationTime ? { capDate: new Date(asset.creationTime) } : {}),
      latitude: asset.latitude,
      longitude: asset.longitude,
    };
  }
  await patchIndexedAssets(failedAssetKeys.map((key) => ({ key, patch: { analysisState: 'failed' } })));
  options.onProgress?.(files.length, images.length, '端侧技术分析');
  const results = await runScreen(files, {
    maxAnalyze: 256,
    useModel: options.useLocalClip === true,
    modelTopN: 32,
    assetHints: hints,
  }, (done, total, phase) => options.onProgress?.(done, total, phase));
  options.onProgress?.(0, 1, '相似与事件聚类');
  const preference = getPhotoPreferenceModel();
  const analyses: PhotoRadarAnalysis[] = [];
  const analyzedAssetKeys: string[] = [];
  const batchId = images[0]?.assetId || String(Date.now());
  for (const result of results) {
    const asset = assetByKey.get(result.name);
    try { URL.revokeObjectURL(result.url); } catch { /* non-blob URL */ }
    if (!asset) continue;
    const base: PhotoRadarAnalysis = {
      key: asset.key,
      assetId: asset.assetId,
      contentHash: result.id,
      perceptualHash: result.perceptualHash,
      photoType: result.photoType,
      technicalQuality: result.technicalQuality,
      sharpness: result.sharpness,
      exposure: result.exposure,
      colorful: result.colorful,
      contrast: result.contrast,
      preferenceConfidence: 0,
      confidence: result.confidence,
      similarRepresentative: result.similarRepresentative,
      duplicateOf: result.dupOf,
      clusterId: result.clusterId ? `${batchId}:${result.clusterId}` : undefined,
      verdict: result.verdict,
      pinnable: result.pinnable,
      needPlace: result.needPlace,
      tags: result.tags,
      reasons: result.reasons,
      visionBackend: options.useLocalClip ? 'local-clip' : 'local-features',
      algorithmVersion: PHOTO_RADAR_ALGORITHM_VERSION,
      analyzedAt: Date.now(),
    };
    const scored = scorePreference(preference, preferenceVector(base, asset.latitude != null && asset.longitude != null));
    base.personalAffinity = scored.affinity;
    base.preferenceConfidence = scored.confidence;
    analyses.push(base);
    analyzedAssetKeys.push(asset.key);
  }
  await putRadarAnalyses(analyses);
  const completedAt = Date.now();
  await patchIndexedAssets(analyzedAssetKeys.map((key) => ({ key, patch: { analysisState: 'analyzed', lastSeenAt: completedAt } })));
  options.onProgress?.(analyses.length, analyses.length, '保存本地索引');
  return analyses;
}

export async function enrichRadarWithQwen(asset: PhotoLibraryAsset, analysis: PhotoRadarAnalysis, signal?: AbortSignal): Promise<PhotoRadarAnalysis> {
  const image = await photoImageDataUrl(asset);
  if (signal?.aborted) throw new DOMException('照片理解已取消', 'AbortError');
  if (!image) return analysis;
  const response = await understandPhotoWithQwen(image, signal);
  if (signal?.aborted) throw new DOMException('照片理解已取消', 'AbortError');
  if (response.backend !== 'mnn' || !response.result) return analysis;
  const result = response.result;
  const tags = [...new Set([...analysis.tags, ...result.tags, ...result.content,
    ...(result.hasPeople ? ['人物'] : []), ...(result.hasPet ? ['宠物'] : []), ...(result.hasQrCode ? ['二维码'] : [])])];
  const hasGps = asset.latitude != null && asset.longitude != null;
  const photoType = result.needsOcr || result.route === 'ocr' || result.documentKind !== 'none' || result.photoCategory === 'document' ? 'document'
    : result.photoCategory === 'screenshot' ? 'screenshot'
      : result.photoCategory === 'real-life' ? 'life'
        : result.photoCategory === 'real-scene' ? (hasGps ? 'place' : 'place_nogps')
          : analysis.photoType;
  const realPhoto = photoType === 'place' || photoType === 'life' || photoType === 'place_nogps';
  const next: PhotoRadarAnalysis = {
    ...analysis,
    photoType,
    verdict: realPhoto && analysis.technicalQuality >= 58 ? 'keep' : photoType === 'junk' ? 'clean' : 'review',
    pinnable: realPhoto && hasGps && analysis.technicalQuality >= 50,
    needPlace: realPhoto && !hasGps,
    tags,
    understanding: {
      sourceType: result.sourceType,
      content: result.content,
      documentType: result.documentType,
      needsOcr: result.needsOcr,
      privacyRisk: result.privacyRisk,
      route: result.route,
      description: result.description,
      hardDocument: result.hardDocument,
      confidence: result.confidence,
    },
    confidence: Math.max(analysis.confidence, result.confidence),
    reasons: [...analysis.reasons, `Qwen3-VL：${result.description || tags.join('、')}`],
    visionBackend: 'qwen3-vl-mnn',
    analyzedAt: Date.now(),
  };
  await putRadarAnalysis(next);
  return next;
}

export async function extractRadarDocument(
  asset: PhotoLibraryAsset,
  analysis: PhotoRadarAnalysis,
  runtime: PhotoRuntimeStatus,
  signal?: AbortSignal,
): Promise<{ analysis: PhotoRadarAnalysis; adapterAttempted: boolean }> {
  const image = await photoImageDataUrl(asset);
  if (signal?.aborted) throw new DOMException('票据识别已取消', 'AbortError');
  if (!image || runtime.engine !== 'mnn') return { analysis, adapterAttempted: false };
  const hardDocument = analysis.understanding?.hardDocument === true
    || analysis.reasons.some((reason) => /反光|小字|划痕|倾斜|难读/.test(reason));
  const result = await extractDocumentWithQualityGate(image, { hardDocument, adapterReady: runtime.ocrAdapterReady, signal });
  if (signal?.aborted) throw new DOMException('票据识别已取消', 'AbortError');
  if (result.backend !== 'mnn') return { analysis, adapterAttempted: result.adapterAttempted };
  const next: PhotoRadarAnalysis = {
    ...analysis,
    photoType: 'document',
    document: result.evidence,
    tags: [...new Set([...analysis.tags, result.evidence.kind, '票据'])],
    reasons: [...analysis.reasons, `OCR ${result.evidence.qualityGate} · ${result.evidence.route}`],
    visionBackend: 'qwen3-vl-mnn',
    analyzedAt: Date.now(),
  };
  await putRadarAnalysis(next);
  return { analysis: next, adapterAttempted: result.adapterAttempted };
}
