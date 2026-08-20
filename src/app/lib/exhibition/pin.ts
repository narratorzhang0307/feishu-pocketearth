// 行动层：suggest-then-confirm。draft 只是建议，用户确认才落地——绝不自动钉。
// 写进共享落点总线 userMarks(kind:'exhibition')：全字段进 meta（地球详情/展品卡都读它）+ 喂长期画像 + 落本地索引（幂等）。
import { markPlace, isPinned, unmarkPlace } from '../skills/markPlace';
import { recordSignals } from '../../../../frost-agent/harness/profile';
import type { ArtifactDraft } from './types';
import { full3DOf, representationsOf } from './representations';
import { putArtifact } from './store';

const PREFIX = 'uex-';   // userMarks 里看展钉的 id 前缀

// 该展品是否已钉（按归一名主键判，避免重复落点）
export function alreadyPinned(draft: ArtifactDraft): boolean { return isPinned('exhibition', PREFIX, draft.id); }

function curatorSourceFromReason(reason: string): 'qwen' | 'local' | '' {
  if (reason.includes('Qwen生成3D导览词')) return 'qwen';
  if (reason.includes('Qwen生成导览词')) return 'qwen';
  // 旧草稿理由只读兼容；重新落库时统一写为 qwen。
  if (reason.includes('GMI生成3D导览词')) return 'qwen';
  if (reason.includes('GMI生成导览词')) return 'qwen';
  if (reason.includes('本地3D导览词')) return 'local';
  if (reason.includes('本地导览词')) return 'local';
  return '';
}

const QWEN_CONTRIBUTION_LABELS: Record<string, string> = {
  vision: '视觉识别',
  structured: '结构化补全',
  curator: '导览/时间线',
  '3d': '3D兜底',
};

const normalizedOcrEngine = (engine?: string) => String(engine || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
const normalizedSplatEngine = (engine?: string) => String(engine || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
const normalizedSplatStatus = (status?: string) => String(status || '').trim().toLowerCase();
const hasSplatAsset = (splat: ArtifactDraft['splat']) => !!((splat?.splatUrl || '').trim() || (splat?.splatId || '').trim());
const hasPersistentSplatUrl = (splat: ArtifactDraft['splat']) => ['preset', 'rgb-2-5d-baseline', 'museum-matting-2-5d'].includes(normalizedSplatEngine(splat?.engine));

function qwenContributions(draft: ArtifactDraft, labelOcrEngines: string[], curatorSource: string): string[] {
  const steps: string[] = [];
  if (labelOcrEngines.some((engine) => ['qwen-vision', 'gmi-vision'].includes(normalizedOcrEngine(engine)))) steps.push('vision');
  if (draft.source === 'llm' || draft.source === 'mixed' || typeof draft.tags.qwenConfidence === 'number' || (draft.tags.aliases || []).length > 0) steps.push('structured');
  if (curatorSource === 'qwen') steps.push('curator');
  const full3d = full3DOf(draft);
  if (['qwen-colmap-gsplat', 'gmi-colmap-gsplat'].includes(normalizedSplatEngine(full3d?.engine)) && normalizedSplatStatus(full3d?.status) === 'ready' && hasSplatAsset(full3d)) steps.push('3d');
  return Array.from(new Set(steps));
}

const qwenContributionSummary = (steps: string[]) => steps.map((s) => QWEN_CONTRIBUTION_LABELS[s] || s).join(' · ');

// 确认钉地球：经 markPlace skill 落点（全字段 meta）+ 喂画像 + 落索引。无坐标的不钉（needPlace）。
export async function confirmPin(draft: ArtifactDraft): Promise<{ pinned: boolean; reason?: string }> {
  if (!draft.geo) return { pinned: false, reason: 'needPlace' };
  const isQwenVisionLabel = (label: ArtifactDraft['labels'][number]) => ['qwen-vision', 'gmi-vision'].includes(normalizedOcrEngine(label.ocrEngine));
  const primaryLabel = draft.labels.find((l) => l.lang === 'zh' && isQwenVisionLabel(l))
    || draft.labels.find((l) => l.lang === 'zh')
    || draft.labels.find(isQwenVisionLabel)
    || draft.labels[0];
  const labelOcrEngines = Array.from(new Set(draft.labels.map((l) => normalizedOcrEngine(l.ocrEngine)).filter(Boolean)));
  const curatorSource = curatorSourceFromReason(draft.reason);
  const qwenSteps = qwenContributions(draft, labelOcrEngines, curatorSource);
  const reps = representationsOf(draft);
  const full3d = full3DOf(draft);
  const r = markPlace({
    kind: 'exhibition', prefix: PREFIX, key: draft.id, label: draft.nameZh,
    geo: { lat: draft.geo.lat, lng: draft.geo.lng },
    amp: 0.5,   // 同馆多展品密集，小抖散避重叠又不飘出馆
    meta: {
      nameZh: draft.nameZh, nameEn: draft.tags.nameEn, museum: draft.museum, exhibition: draft.exhibition,
      aliases: draft.tags.aliases || [], qwenConfidence: draft.tags.qwenConfidence ?? null,
      dynastyKey: draft.tags.dynastyKey, dynastyLabel: draft.tags.dynastyLabel, eraStart: draft.eraStart, eraEnd: draft.eraEnd,
      material: draft.tags.material, category: draft.tags.category, culture: draft.tags.culture,
      findspot: draft.tags.findspot, dimensions: draft.tags.dimensions, rating: draft.tags.myRating,
      curatorNote: draft.tags.curatorNote || '', timelineNote: draft.tags.timelineNote || '', curatorSource,
      qwenContributions: qwenSteps, qwenContributionSummary: qwenContributionSummary(qwenSteps),
      photos: draft.photos, splatUrl: hasPersistentSplatUrl(draft.splat) ? (draft.splat?.splatUrl || '') : '', splatStatus: draft.splat?.status || '',   // preset/内置2.5D 使用持久静态路径；本地导入是临时 objectURL → 存空、靠 splatId 从 IDB 重建
      splatId: draft.splat?.splatId || '', splatFormat: draft.splat?.format || '',
      splatEngine: normalizedSplatEngine(draft.splat?.engine) === 'gmi-colmap-gsplat' ? 'qwen-colmap-gsplat' : (draft.splat?.engine || ''), splatSourceKind: draft.splat?.sourceKind || '', splatTaskId: draft.splat?.taskId || '',
      splatCaptureQualityWarn: draft.splat?.captureQualityWarn || '',
      quick2_5dUrl: reps && hasPersistentSplatUrl(reps.quick2_5d) ? (reps.quick2_5d.splatUrl || '') : '',
      quick2_5dFormat: reps?.quick2_5d.format || '',
      full3dId: full3d?.splatId || '', full3dUrl: hasPersistentSplatUrl(full3d) ? (full3d?.splatUrl || '') : '',
      full3dFormat: full3d?.format || '', full3dStatus: full3d?.status || '', full3dEngine: normalizedSplatEngine(full3d?.engine) === 'gmi-colmap-gsplat' ? 'qwen-colmap-gsplat' : (full3d?.engine || ''),
      labelZh: primaryLabel?.rawText || '', labelOcrEngine: normalizedOcrEngine(primaryLabel?.ocrEngine) === 'gmi-vision' ? 'qwen-vision' : normalizedOcrEngine(primaryLabel?.ocrEngine), labelOcrEngines: labelOcrEngines.map((engine) => engine === 'gmi-vision' ? 'qwen-vision' : engine),
      visitDate: draft.visitDate, place: draft.geo.place, geoKind: draft.geo.kind,
    },
  });
  // 首次钉才回流画像（已钉过 exists 不重复回流）。回流公开创作标签：器类/朝代/文明；
  // 故意不回流 findspot 出土地与 labelZh 展签原文（私密/敏感）。按真实星级加权：5★×3、4★×2、其余×1。
  if (r.reason !== 'exists') {
    const w = draft.tags.myRating >= 5 ? 3 : draft.tags.myRating >= 4 ? 2 : 1;
    const rep = (arr: string[]) => arr.flatMap((x) => Array(w).fill(x) as string[]);
    recordSignals('exhibitions', {
      categories: draft.tags.category ? rep([draft.tags.category]) : [],
      dynasties: draft.tags.dynastyLabel ? rep([draft.tags.dynastyLabel]) : [],
      cultures: draft.tags.culture ? rep([draft.tags.culture]) : [],
    });
  }
  await persist(draft, true);
  return r;
}

// 不钉、仅存档（无坐标或用户暂不钉）：进本地索引，下次重跑直接命中
export async function archiveOnly(draft: ArtifactDraft): Promise<void> { await persist(draft, false); }

async function persist(draft: ArtifactDraft, pinned: boolean): Promise<void> {
  const splat = draft.splat
    ? { ...draft.splat, splatUrl: hasPersistentSplatUrl(draft.splat) ? draft.splat.splatUrl : undefined }
    : null;
  const representations = draft.representations ? {
    quick2_5d: {
      ...draft.representations.quick2_5d,
      splatUrl: hasPersistentSplatUrl(draft.representations.quick2_5d) ? draft.representations.quick2_5d.splatUrl : undefined,
    },
    ...(draft.representations.full3d ? {
      full3d: {
        ...draft.representations.full3d,
        splatUrl: hasPersistentSplatUrl(draft.representations.full3d) ? draft.representations.full3d.splatUrl : undefined,
      },
    } : {}),
  } : undefined;
  await putArtifact({
    key: draft.id, nameZh: draft.nameZh, museum: draft.museum,
    eraStart: draft.eraStart, eraEnd: draft.eraEnd, tags: draft.tags,
    labels: draft.labels, splat, representations, photos: draft.photos, geo: draft.geo,
    // enriched 只在云脑确实补全过时为 true（'llm'/'mixed'）；纯本地/手填不记，免缓存中毒（重跑永久跳过补全）。
    pinned, enriched: draft.source === 'llm' || draft.source === 'mixed', visitDate: draft.visitDate, ts: Date.now(),
  });
}

export function unpin(draft: ArtifactDraft): void { unmarkPlace('exhibition', PREFIX, draft.id); }
