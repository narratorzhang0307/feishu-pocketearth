// 推理层：PhotoFeatures + 可选 CLIP → photoType + valueScore + verdict ⟂ pinnable。
// 类型先行（先分清是什么，再谈值不值/钉不钉）；质量分只管废片过滤 + 簇内选优。
import { clamp01, ym, type PhotoFeatures, type PhotoResult, type PhotoType, type Verdict } from './types';
import { hamming } from '../skills/browserVision';
import type { VisionResult } from './vision';

// ── 类型判定（EXIF 金信号 + 资料投票 +（可选）CLIP 纠偏）──
export function classify(f: PhotoFeatures, v?: VisionResult | null): { photoType: PhotoType; tags: string[]; reason: string } {
  const tags: string[] = [];
  // 废片闸（低光/艺术豁免：真相机夜景不判废）
  if (f.sharpness < 0.07) return { photoType: 'junk', tags: ['模糊/废片'], reason: '清晰度极低=模糊废片' };
  if (f.mean < 22 && !f.hasCameraFields) return { photoType: 'junk', tags: ['太暗'], reason: '亮度极低且无相机信息=欠曝废片' };

  // CLIP 优先（若跑了）
  if (v) {
    if (!v.isReal) {
      const k = v.utilityKind === 'document' ? 'document' : 'screenshot';
      tags.push(k === 'document' ? '文档' : '截图/网图');
      return { photoType: k, tags, reason: `端侧模型判为非实拍（${k}）` };
    }
    if (v.subTag) tags.push(v.subTag);
    if (!f.hasGPS) return { photoType: 'place_nogps', tags, reason: '端侧模型判实拍，但无坐标→待确认地点' };
    return { photoType: v.subKind === 'place' ? 'place' : 'life', tags, reason: '端侧模型判实拍 + 有坐标' };
  }

  // 无 CLIP：启发式
  if (f.isUtilityProb > 0.6) {
    const doc = f.contrast > 0.5 && f.colorful < 0.2;
    tags.push(doc ? '文档' : '截图/网图');
    return { photoType: doc ? 'document' : 'screenshot', tags, reason: `资料信号高(${f.isUtilityProb.toFixed(2)})` };
  }
  if (f.hasCameraFields) {
    if (f.hasGPS) return { photoType: 'place', tags, reason: '有相机 EXIF + 坐标=实拍地方照片' };
    return { photoType: 'place_nogps', tags, reason: '有相机 EXIF 但无坐标→待确认地点' };
  }
  // 无相机 EXIF：可能被剥 EXIF 的真照片，也可能是资料
  if (f.isUtilityProb >= 0.35) { tags.push('疑似资料'); return { photoType: 'uncertain', tags, reason: '无相机信息 + 资料信号中等→待定' }; }
  if (f.colorful > 0.22 && f.sharpness > 0.15) return { photoType: 'place_nogps', tags, reason: '无 EXIF 但画质/色彩像实拍→实拍无坐标待补' };
  return { photoType: 'uncertain', tags, reason: '信号不足→待定，宁可放过' };
}

// ── 按类型算价值（资料不进美学排序）──
const aesthetic = (f: PhotoFeatures) => clamp01(f.sharpness * 0.4 + f.exposure * 0.28 + f.colorful * 0.17 + f.contrast * 0.15);
export function technicalQualityOf(f: PhotoFeatures): number { return Math.round(aesthetic(f) * 100); }
export function technicalReasonsOf(f: PhotoFeatures): string[] {
  const reasons: string[] = [];
  if (f.sharpness < 0.12) reasons.push(`清晰度偏低（${Math.round(f.sharpness * 100)}/100）`);
  if (f.mean <= 48) reasons.push(`欠曝风险（平均亮度 ${Math.round(f.mean)}/255）`);
  else if (f.mean >= 207) reasons.push(`过曝风险（平均亮度 ${Math.round(f.mean)}/255）`);
  else if (f.exposure < 0.42) reasons.push(`高光或阴影裁切风险（曝光可用性 ${Math.round(f.exposure * 100)}/100）`);
  return reasons;
}
export function valueByType(f: PhotoFeatures, t: PhotoType): number {
  switch (t) {
    case 'place': return technicalQualityOf(f);
    case 'life': return Math.round(clamp01(aesthetic(f) * 0.8 + 0.25) * 100);   // 有主体/人=高权重，偏留
    case 'place_nogps': return technicalQualityOf(f);
    case 'screenshot': case 'document': return 45;   // 资料：不按美学，固定中值→默认待定·归档
    case 'uncertain': return 45;
    case 'junk': return 0;
  }
}

// ── 决策：verdict ⟂ pinnable 两条正交输出 ──
export function decide(t: PhotoType, valueScore: number, hasGPS: boolean): { verdict: Verdict; pinnable: boolean; needPlace: boolean } {
  let verdict: Verdict;
  if (t === 'junk') verdict = 'clean';
  else if (t === 'screenshot' || t === 'document') verdict = 'review';   // 资料默认待定·归档（不默认建议清理，防误删纪念截图）
  else if (t === 'uncertain') verdict = 'review';
  else verdict = valueScore >= 58 ? 'keep' : 'review';                   // 实拍：偏留，非废片不判可清理
  // pinnable：实拍 ∧ 有坐标 ∧ 价值达阈（簇代表在聚类阶段再收敛）；资料/废片/无坐标一律 false
  const pinnable = (t === 'place' || t === 'life') && hasGPS && valueScore >= 50;
  const needPlace = t === 'place_nogps' || ((t === 'place' || t === 'life') && !hasGPS);
  return { verdict, pinnable, needPlace };
}

// ── 查重（EXIF 时间10分钟分桶 + dHash/pHash 海明）+ 时空聚类选簇代表 ──
const DUP = 8;
// 低于常见图库的宽松阈值：手机相册建议宁可漏报，也不能把不同低频构图误当重复。
const PHASH_DUP = 6;
function bucketKey(d: Date | null): string { return d ? String(Math.floor((+d) / 600000)) : 'nodate_'; }
function dist(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function dedupAndCluster(results: PhotoResult[]): PhotoResult[] {
  // 查重：分高优先；资料型放宽（跳过）防误杀连续聊天截图
  const sorted = results.slice().sort((a, b) => b.valueScore - a.valueScore);
  const kept: PhotoResult[] = [];
  for (const r of sorted) {
    if (r.photoType === 'screenshot' || r.photoType === 'document' || r.photoType === 'junk') { kept.push(r); continue; }
    const bk = bucketKey(r.date);
    const near = kept.find((k) => {
      if (bucketKey(k.date) !== bk || !k.features || !r.features) return false;
      const hd = hamming(k.features.dHash, r.features.dHash);
      const phd = k.features.pHash && r.features.pHash ? hamming(k.features.pHash, r.features.pHash) : Number.POSITIVE_INFINITY;
      if (bk === 'nodate_') {
        // 无日期桶缺时间锚点：两张都有 GPS 且明显异地(>300m)→必非重复；其余抬严阈值到 4，挡住「结构偶然相近」的跨真实时间误判
        if (k.hasGPS && r.hasGPS && k.lat != null && k.lng != null && r.lat != null && r.lng != null && dist(k.lat, k.lng, r.lat, r.lng) > 300) return false;
        return hd <= 4 || phd <= 5;
      }
      return hd <= DUP || phd <= PHASH_DUP;
    });
    if (near) {
      r.dupOf = near.id; r.similarRepresentative = false; r.verdict = 'clean'; r.pinnable = false;
      near.similarRepresentative = true;
      if (!r.tags.includes('重复')) r.tags.push('重复');
    } else kept.push(r);
  }
  // 时空聚类：把可钉候选按 时间桶 + GPS 邻近(300m) 聚成「一次经历」，只簇代表 pinnable
  const cands = kept.filter((r) => r.pinnable && r.hasGPS && r.lat != null && r.lng != null);
  const clusters: PhotoResult[][] = [];
  for (const r of cands) {
    const bk = bucketKey(r.date);
    let cl = clusters.find((c) => bucketKey(c[0].date) === bk && dist(c[0].lat!, c[0].lng!, r.lat!, r.lng!) < 300);
    if (!cl) { cl = []; clusters.push(cl); }
    cl.push(r);
  }
  clusters.forEach((c, ci) => {
    c.sort((a, b) => b.valueScore - a.valueScore);
    c.forEach((r, i) => {
      r.clusterId = 'c' + ci; r.pinnable = i === 0;
      if (c.length > 1) r.similarRepresentative = i === 0;
      if (i > 0 && !r.tags.includes('同次经历')) r.tags.push('同次经历');
    });
  });
  return results.sort((a, b) => b.valueScore - a.valueScore);
}

// 时间段过滤
export function inRange(date: Date | null, fromYM?: number, toYM?: number): boolean {
  if (fromYM == null && toYM == null) return true;
  if (!date) return false;
  const m = ym(date);
  if (fromYM != null && m < fromYM) return false;
  if (toYM != null && m > toYM) return false;
  return true;
}
