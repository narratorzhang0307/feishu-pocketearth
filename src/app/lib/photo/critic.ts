// 反思层：判定前用确定性锚点否决概率误判（挑错强于一次判对）；应用并记住用户纠错。
import type { PhotoResult } from './types';
import { recordOverride, getPrefs, distillLessons, type StoredPhoto } from './store';

// ── Critic：用 EXIF 截图标志 / GPS 一致性 等确定性信号，纠正 CLIP/启发式的概率误判 ──
export function applyCritic(r: PhotoResult): void {
  const f = r.features; if (!f) return;
  // 截图工具签名是铁证 → 不论 CLIP 说啥，一律资料·截图、不钉
  if (f.softwareIsScreenshot && r.photoType !== 'screenshot' && r.photoType !== 'document') {
    r.photoType = 'screenshot'; r.pinnable = false; r.needPlace = false;
    if (!r.tags.includes('截图/网图')) r.tags.push('截图/网图');
    r.reason += '；Critic：EXIF 截图签名→改判截图';
    if (r.verdict === 'keep') r.verdict = 'review';
  }
  // GPS 可疑 → 不信坐标、不钉
  if (f.suspectExif && r.hasGPS) {
    r.hasGPS = false; r.lat = undefined; r.lng = undefined; r.pinnable = false;
    if (r.photoType === 'place' || r.photoType === 'life') { r.needPlace = true; r.photoType = 'place_nogps'; }
    r.reason += '；Critic：EXIF 可疑→弃坐标';
  }
}

// ── 应用历史用户纠错（同一 dHash 之前被用户纠正过）──
export function applyUserOverride(r: PhotoResult, stored: StoredPhoto | null): void {
  if (!stored?.userOverride) return;
  r.userOverride = stored.userOverride;
  switch (stored.userOverride) {
    case 'keep': r.verdict = 'keep'; break;
    case 'clean': r.verdict = 'clean'; r.pinnable = false; break;
    case 'utility': r.photoType = 'screenshot'; r.pinnable = false; r.verdict = 'review'; break;
    case 'place': if (r.photoType === 'screenshot' || r.photoType === 'document' || r.photoType === 'uncertain') { r.photoType = r.hasGPS ? 'place' : 'place_nogps'; r.pinnable = r.hasGPS; r.needPlace = !r.hasGPS; if (r.verdict === 'review') r.verdict = 'keep'; } break;
  }
  r.tags.push('已按你的纠正');
  r.reason += '；应用历史纠错:' + stored.userOverride;
}

// ── 用户当下纠错 → 写偏好统计（语言强化学习：越用越准）──
export function learnFromOverride(from: PhotoResult['photoType'] | PhotoResult['verdict'], to: 'keep' | 'clean' | 'place' | 'utility'): void {
  if (to === 'place' && (from === 'screenshot' || from === 'document')) recordOverride('screenshotToReal');
  else if (to === 'utility') recordOverride('realToUtility');
  else if (to === 'keep') recordOverride('cleanToKeep');
  else if (to === 'clean') recordOverride('keepToClean');
  distillLessons();   // 计数更新后，看是否够格凝练成一句经验
}

// ── 有界软偏置：把端侧纠错统计兑现为对「临界张」的轻推（store.ts 承诺的「阈值自适应」终于接通）──
// 铁律：① 无特征 / EXIF 截图铁证(softwareIsScreenshot) 一律不在此翻案；② 只动临界态，不碰已确定的主体判断；
// ③ valueScore 调整有界(±8)，绝不直接改 pinnable / 坐标——确定性信号的领地，保持 verdict ⟂ pinnable 正交。
// 时机：applyCritic(铁证) 之后、applyUserOverride(本图显式纠正、最终压轴) 之前。
export function applySoftBias(r: PhotoResult): void {
  const f = r.features; if (!f || f.softwareIsScreenshot) return;
  const ov = getPrefs().overrides;

  // 屡次把「截图/资料」拉回真照 → 临界 review 的 资料/待定 张：软抬为保留、无坐标则提示补地点
  if (ov.screenshotToReal >= 3 && r.verdict === 'review'
      && (r.photoType === 'screenshot' || r.photoType === 'document' || r.photoType === 'uncertain')) {
    r.valueScore = Math.min(100, r.valueScore + 8);
    r.verdict = 'keep';
    if (!r.hasGPS && !r.pinnable) r.needPlace = true;
    r.reason += '；自适应：你常把这类当真照→临界态改判保留';
    return;
  }
  // 屡次把真照归为工具 → 临界 keep 的 实拍（刚过 58 线）张：软压、转复核
  if (ov.realToUtility >= 3 && r.verdict === 'keep'
      && (r.photoType === 'place' || r.photoType === 'life' || r.photoType === 'place_nogps')
      && r.valueScore <= 66) {
    r.valueScore = Math.max(0, r.valueScore - 8);
    r.verdict = 'review';
    r.reason += '；自适应：你常把这类归为工具→临界态转复核';
    return;
  }
  // 屡次救回建议清理的图 → 不直接清，留复核让你定（重复照在聚类阶段才产生、不受此影响）
  if (ov.cleanToKeep >= 3 && r.verdict === 'clean') {
    r.verdict = 'review';
    r.reason += '；自适应：你常救回这类→改为复核不直接清';
    return;
  }
  // 屡次清掉建议保留的图 → 临界 keep 收紧为复核
  if (ov.keepToClean >= 3 && r.verdict === 'keep'
      && (r.photoType === 'place' || r.photoType === 'life' || r.photoType === 'place_nogps')
      && r.valueScore <= 64) {
    r.valueScore = Math.max(0, r.valueScore - 6);
    r.verdict = 'review';
    r.reason += '；自适应：你常清掉这类→临界态收紧为复核';
  }
}
