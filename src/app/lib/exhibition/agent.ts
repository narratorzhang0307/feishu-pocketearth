// 编排层：串起六层流水线（感知→本地朝代表→本地索引→云脑补全子agent→地理子agent→校验→draft）。
// 产出一张「展品卡草稿」（suggest，未钉）；阶段 onPhase 回调供 UI 显示进度。单级失败降级、不抛错（舱壁）。
import { sense } from './sense';
import { matchDynasty } from './catalog';
import { matchVenue } from './venues';
import { enrichArtifact, geoResolve, type EnrichRaw } from './tagging';
import { applyCritic, applyUserFix, mergeKnown } from './critic';
import { getKnownArtifact } from './store';
import { createCuratorNotes } from './curator';
import { artifactKey, type ArtifactDraft, type ExhibitionInput, type OnExhibitionPhase } from './types';

const today = () => new Date().toISOString().slice(0, 10);
const hasCjk = (text: string) => /[\u3400-\u9fff]/.test(text);
const comparableName = (text: string) => (text || '')
  .toLowerCase()
  .replace(/[‘’]/g, "'")
  .replace(/[^a-z0-9\u3400-\u9fff]+/g, '');

function shouldUseEnrichedChineseName(currentName: string, raw: EnrichRaw): boolean {
  const current = (currentName || '').trim();
  const nameZh = (raw.nameZh || '').trim();
  const nameEn = (raw.nameEn || '').trim();
  if (!nameZh) return false;
  if (!current) return true;
  if (current === nameZh) return false;
  if (!nameEn || !hasCjk(nameZh)) return false;
  return comparableName(current) === comparableName(nameEn);
}

export async function runExhibitionAgent(input: ExhibitionInput, onPhase?: OnExhibitionPhase): Promise<ArtifactDraft | null> {
  const ph: OnExhibitionPhase = onPhase || (() => {});

  // ① 感知：三种输入归一成候选展品名 + 展签原文 + 可选评分
  ph(input.kind === 'image' ? '展签认字' : '解析输入');
  const sensed = await sense({ kind: input.kind, text: input.text, imageDataUrl: input.imageDataUrl, manualName: input.manual?.nameZh, manualRating: input.manual?.rating, allowCloud: input.allowCloud });
  const inputRating = typeof sensed.rating === 'number' ? sensed.rating : undefined;
  const nameZh = sensed.nameZh;
  if (!nameZh && !sensed.labelText) return null;   // 认不出且无展签 → 交回 UI 走纯手填兜底

  const draft: ArtifactDraft = {
    id: '', nameZh: nameZh || '', museum: input.manual?.museum || '', exhibition: '',
    eraStart: null, eraEnd: null,
    tags: { nameEn: '', dynastyKey: '', dynastyLabel: '', material: [], category: '', culture: '华夏', findspot: '', dimensions: '', myRating: inputRating ?? 0 },
    labels: sensed.labelText ? [{ lang: 'zh', rawText: sensed.labelText, ocrEngine: sensed.ocrEngine || (input.kind === 'image' ? 'edge-vision' : 'manual') }] : [],
    splat: null, photos: [],
    geo: null, needPlace: true, source: input.kind === 'image' ? 'label-ocr' : 'manual',
    confidence: 0.3, needsConfirm: true, reason: `感知:${sensed.from}「${nameZh || '展签'}」`, visitDate: today(),
  };

  if (draft.museum) {
    const mSeed = matchVenue(draft.museum);
    if (mSeed && draft.museum !== mSeed.name) { draft.museum = mSeed.name; draft.reason += `；展馆别名规范化「${mSeed.name}」`; }
  }

  // text 输入：从原句确定性提取展馆（"在国博" → 国博种子；用户自定义场馆同样命中）。parseTitle 已把地点前缀
  // 从展品名去掉，这里从原句补回展馆，保证「钉用户说的那个馆」而非云脑臆测的真实馆藏地。
  if (input.kind === 'text' && input.text && !draft.museum) {
    const mSeed = matchVenue(input.text);
    if (mSeed) { draft.museum = mSeed.name; draft.reason += `；原句识别展馆「${mSeed.name}」`; }
  }

  // ② 本地朝代表锚点（确定性先行：展签/名/手填朝代里抢先命中）
  ph('查朝代表', 'matchDynasty');
  const dyn = matchDynasty(sensed.labelText || nameZh || '') || (input.manual?.dynasty ? matchDynasty(input.manual.dynasty) : null);
  if (dyn) { draft.tags.dynastyKey = dyn.key; draft.tags.dynastyLabel = dyn.zh; draft.eraStart = dyn.start; draft.eraEnd = dyn.end; draft.confidence = 0.5; draft.reason += `；本地表命中「${dyn.zh}」`; }

  draft.id = artifactKey(draft.nameZh || sensed.labelText.slice(0, 12), draft.museum);

  // ③ 本地索引：之前补全/钉过 → 复用，省云脑、保持一致
  const keepInputRating = () => { if (typeof inputRating === 'number') draft.tags.myRating = inputRating; };
  const known = await getKnownArtifact(draft.id);
  const keepDraftRating = typeof inputRating === 'number';
  const alreadyEnriched = mergeKnown(draft, known, { keepDraftRating });
  keepInputRating();
  if (!Array.isArray(draft.tags.material)) draft.tags.material = [];   // 舱壁：坏记录恢复数组不变式

  // ④ 云脑补全子 agent：字段不全且没补过时才调
  const lack = !draft.tags.dynastyKey || !draft.tags.category || !draft.tags.material.length || !draft.museum;
  if (!alreadyEnriched && lack) {
    ph('云脑补全展品', '阿里云百炼 · qwen-plus');
    let raw: EnrichRaw = { nameZh: '', nameEn: '', aliases: [], dynastyKey: '', material: [], category: '', culture: '', findspot: '', dimensions: '', museum: '', confidence: null };
    let ok = false;
    try {
      const enriched = await enrichArtifact(draft.nameZh, draft.labels[0]?.rawText || '');
      raw = enriched.raw;
      ok = enriched.ok;
    } catch { /* 补全子 agent 异常时保留本地草稿 */ }
    if (ok) {
      const hadDynastyBeforeGmi = !!draft.tags.dynastyKey;
      const beforeName = draft.nameZh;
      if (shouldUseEnrichedChineseName(draft.nameZh, raw)) {
        draft.nameZh = raw.nameZh;
        if (beforeName && beforeName !== draft.nameZh) draft.reason += `；Qwen补全中文名「${draft.nameZh}」`;
      }
      draft.tags.nameEn = draft.tags.nameEn || raw.nameEn;
      if (!draft.tags.aliases?.length && raw.aliases.length) draft.tags.aliases = raw.aliases;
      if (!draft.tags.dynastyKey && raw.dynastyKey) draft.tags.dynastyKey = raw.dynastyKey;
      if (!draft.tags.material.length) draft.tags.material = raw.material;
      draft.tags.category = draft.tags.category || raw.category;
      if (!hadDynastyBeforeGmi && raw.culture) draft.tags.culture = raw.culture;
      draft.tags.findspot = draft.tags.findspot || raw.findspot;
      draft.tags.dimensions = draft.tags.dimensions || raw.dimensions;
      if (raw.confidence != null) draft.tags.qwenConfidence = raw.confidence;
      const rawMuseumSeed = raw.museum ? matchVenue(raw.museum) : null;
      draft.museum = draft.museum || (rawMuseumSeed?.name || raw.museum || '');   // 规范化到种子标准名，折叠「国博/国家博物馆」等写法，稳住 draft.id 主键
      if (rawMuseumSeed && !matchVenue(draft.museum)) {
        draft.museum = rawMuseumSeed.name;
        draft.reason += `；云脑展馆别名规范化「${rawMuseumSeed.name}」`;
      }
      draft.source = draft.source === 'label-ocr' ? 'mixed' : 'llm';
      draft.confidence = Math.max(draft.confidence, 0.72, raw.confidence ?? 0);
      draft.reason += '；云脑补全展品';
      const beforeRefresh = draft.id;
      draft.id = artifactKey(draft.nameZh || sensed.labelText.slice(0, 12), draft.museum);   // 名/馆可能被补全，刷新主键
      if (draft.id !== beforeRefresh) { const k2 = await getKnownArtifact(draft.id); if (k2) { mergeKnown(draft, k2, { keepDraftRating }); keepInputRating(); } }   // 新 key 回查一次：命中上一轮记录则复用，避免重复钉/重复调云
    } else {
      draft.reason += '；云脑不可用→保留已有';
    }
  }

  // ⑤ 地理子 agent：展馆 > 出土地 > 城市
  ph('定位展馆', 'resolvePlace 展馆优先');
  if (!draft.geo) {
    try {
      draft.geo = await geoResolve({ museum: draft.museum, findspot: draft.tags.findspot });
    } catch {
      draft.geo = null;
      draft.reason += '；定位不可用→待手选展馆';
    }
  }
  draft.needPlace = !draft.geo;

  // ⑥ 校验 + 历史纠错
  ph('校验');
  applyCritic(draft);
  applyUserFix(draft);
  try {
    const notes = await createCuratorNotes(draft);
    draft.tags.curatorNote = notes.curatorNote;
    draft.tags.timelineNote = notes.timelineNote;
    draft.reason += notes.source === 'qwen' ? '；Qwen生成导览词' : '；本地导览词';
  } catch { /* 导览词失败不影响草稿 */ }
  draft.needsConfirm = draft.confidence < 0.75 || draft.source === 'manual' || draft.needPlace || !draft.nameZh;

  ph('完成');
  return draft;
}

export { confirmPin, archiveOnly, alreadyPinned, unpin } from './pin';
export { recordPlaceFix, recordRatingFix } from './store';
