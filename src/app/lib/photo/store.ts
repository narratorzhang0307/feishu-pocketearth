// 记忆层：端侧持久化（原图/canvas/embedding 绝不入库，只存派生小结论）。
// ① IndexedDB 照片索引：dHash 主键，增量幂等——重扫先查命中即复用、跳过 CLIP；写 userOverride。IDB 收口到 [keyedStore]。
// ② localStorage 偏好：端侧个性化阈值 + 纠错统计（photo 专属：overrides/lessons，非 placeFix/ratingFix，故不用 correctionsStore）。
import type { PhotoType, Verdict } from './types';
import { keyedStore } from '../skills/keyedStore';

export interface StoredPhoto {
  id: string;                 // dHash
  photoType: PhotoType;
  valueScore: number;
  verdict: Verdict;
  pinnable: boolean;
  hasGPS: boolean;
  lat?: number; lng?: number;
  hadVision: boolean;         // 是否已跑过 CLIP（跑过的重扫不再跑）
  userOverride?: 'keep' | 'clean' | 'place' | 'utility';
  ts: number;
}

const store = keyedStore<StoredPhoto>('pe-photos', 'id');
export const getKnown = (id: string): Promise<StoredPhoto | null> => store.get(id);
export const putPhoto = (p: StoredPhoto): Promise<void> => store.put(p);
export const allPhotos = (): Promise<StoredPhoto[]> => store.all();

export async function recordPhotoOverride(id: string, override: StoredPhoto['userOverride']): Promise<void> {
  const cur = await getKnown(id);
  await putPhoto({
    id, photoType: cur?.photoType || 'uncertain', valueScore: cur?.valueScore ?? 0,
    verdict: cur?.verdict || 'review', pinnable: cur?.pinnable ?? false,
    hasGPS: cur?.hasGPS ?? false, lat: cur?.lat, lng: cur?.lng, hadVision: cur?.hadVision ?? false,
    userOverride: override, ts: Date.now(),
  });
}
export async function clearGeo(): Promise<void> {
  // 逐条 put（每次独立事务）→ 天然避开"同一事务内夹 await 会失活"的坑（隐私功能：抹掉所有已存坐标）。
  const all = await allPhotos();
  for (const p of all) if (p.hasGPS) { p.hasGPS = false; p.lat = undefined; p.lng = undefined; await putPhoto(p); }
}

// ── 端侧偏好/纠错（localStorage）——反思层写入、推理层读取，越用越准 ──
const PREF_KEY = 'pe.photoPrefs.v1';
export interface PhotoPrefs {
  // 纠错统计（用户把 X 误判拉回 Y 的次数），驱动阈值自适应
  overrides: { screenshotToReal: number; realToUtility: number; cleanToKeep: number; keepToClean: number };
  // 反思层凝练出的「经验」一句话（仅 UI 展示，不参与判定；判定只读 overrides 计数 + 软偏置）
  lessons: string[];
}
const DEFAULT_PREFS: PhotoPrefs = { overrides: { screenshotToReal: 0, realToUtility: 0, cleanToKeep: 0, keepToClean: 0 }, lessons: [] };
export function getPrefs(): PhotoPrefs {
  // 只取已知字段并逐层深拷贝：杜绝旧数据缺字段 / 共享 DEFAULT 引用被原地改坏。
  try {
    if (typeof localStorage !== 'undefined') {
      const r = localStorage.getItem(PREF_KEY);
      if (r) { const p = JSON.parse(r); return { overrides: { ...DEFAULT_PREFS.overrides, ...(p.overrides || {}) }, lessons: Array.isArray(p.lessons) ? p.lessons.slice() : [] }; }
    }
  } catch { /* */ }
  return { overrides: { ...DEFAULT_PREFS.overrides }, lessons: [] };
}
function savePrefs(p: PhotoPrefs) { try { if (typeof localStorage !== 'undefined') localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* */ } }
export function recordOverride(kind: keyof PhotoPrefs['overrides']) {
  const p = getPrefs(); p.overrides[kind] = (p.overrides[kind] || 0) + 1; savePrefs(p);
}

// 反思：纠错次数到阈值 → 凝练一句「经验」（幂等去重，仅 UI 展示）。判定不读 lessons，只读 overrides 计数。
const LESSON_RULES: Array<[keyof PhotoPrefs['overrides'], number, string]> = [
  ['screenshotToReal', 3, '你常把被判成截图/资料的图拉回真实照片——这类临界图我会更倾向当真照保留。'],
  ['realToUtility', 3, '你常把真实照片归为工具/截图——遇到临界图我会更谨慎、倾向当资料处理。'],
  ['cleanToKeep', 3, '你常把建议清理的图改成保留——我会适当放宽清理门槛。'],
  ['keepToClean', 3, '你常把建议保留的图清掉——我会适当收紧保留门槛。'],
];
export function distillLessons(): void {
  const p = getPrefs();
  const have = new Set(p.lessons);
  let changed = false;
  for (const [k, th, text] of LESSON_RULES) if ((p.overrides[k] || 0) >= th && !have.has(text)) { have.add(text); changed = true; }
  if (changed) { p.lessons = [...have].slice(-8); savePrefs(p); }
}
