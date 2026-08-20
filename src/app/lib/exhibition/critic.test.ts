import { describe, expect, it } from 'vitest';
import { applyCritic, mergeKnown } from './critic';
import { createExhibitionDemoDraft } from './demo';
import type { StoredArtifact } from './store';

describe('applyCritic · 展品字段护栏', () => {
  it('材质会去空白、去重并过滤脏串', () => {
    const draft = createExhibitionDemoDraft();
    draft.tags.material = [' 青铜 ', '青铜', '陶', '青铜、陶', 'verylongmaterial', '玉'];

    applyCritic(draft);

    expect(draft.tags.material).toEqual(['青铜', '陶', '玉']);
  });

  it('坏记录里的非数组材质会回落为空数组', () => {
    const draft = createExhibitionDemoDraft();
    draft.tags.material = '青铜' as unknown as string[];

    applyCritic(draft);

    expect(draft.tags.material).toEqual([]);
  });

  it('常见英文长材质词不会被误删', () => {
    const draft = createExhibitionDemoDraft();
    draft.tags.material = [' granodiorite ', 'porcelain', 'terracotta', 'verylongmaterial'];

    applyCritic(draft);

    expect(draft.tags.material).toEqual(['granodiorite', 'porcelain', 'terracotta']);
  });

  it('会拆开 OCR 或云脑合并在一个字段里的材质清单', () => {
    const draft = createExhibitionDemoDraft();
    draft.tags.material = [' 青铜、玉 ', 'bronze, gold', 'wood and pigment'];

    applyCritic(draft);

    expect(draft.tags.material).toEqual(['青铜', '玉', 'bronze']);
  });

  it('会把 Qwen 十分制和百分制置信度归一到展品卡审计范围', () => {
    const percentDraft = createExhibitionDemoDraft();
    percentDraft.tags.qwenConfidence = 92;
    const tenPointDraft = createExhibitionDemoDraft();
    tenPointDraft.tags.qwenConfidence = 8.7;

    applyCritic(percentDraft);
    applyCritic(tenPointDraft);

    expect(percentDraft.tags.qwenConfidence).toBe(0.92);
    expect(tenPointDraft.tags.qwenConfidence).toBe(0.87);
    expect(percentDraft.reason).toContain('Qwen置信度归一');
  });

  it('会兜住旧缓存里的 Qwen 分数式置信度', () => {
    const percentDraft = createExhibitionDemoDraft();
    percentDraft.tags.qwenConfidence = '92/100' as unknown as number;
    const tenPointDraft = createExhibitionDemoDraft();
    tenPointDraft.tags.qwenConfidence = 'confidence score: 8.5/10' as unknown as number;

    applyCritic(percentDraft);
    applyCritic(tenPointDraft);

    expect(percentDraft.tags.qwenConfidence).toBe(0.92);
    expect(tenPointDraft.tags.qwenConfidence).toBe(0.85);
  });

  it('会兜住旧缓存里的 Qwen 对象化置信度', () => {
    const draft = createExhibitionDemoDraft();
    draft.tags.qwenConfidence = { value: 8.4, max: 10 } as unknown as number;

    applyCritic(draft);

    expect(draft.tags.qwenConfidence).toBe(0.84);
  });

  it('会兜住旧缓存里的 Qwen 置信度别名字段', () => {
    const snakeCaseDraft = createExhibitionDemoDraft();
    snakeCaseDraft.tags.qwenConfidence = { confidence_value: 92, scale: 100 } as unknown as number;
    const normalizedDraft = createExhibitionDemoDraft();
    normalizedDraft.tags.qwenConfidence = { normalizedConfidence: 0.88 } as unknown as number;

    applyCritic(snakeCaseDraft);
    applyCritic(normalizedDraft);

    expect(snakeCaseDraft.tags.qwenConfidence).toBe(0.92);
    expect(normalizedDraft.tags.qwenConfidence).toBe(0.88);
  });

  it('会清空不可展示的 Qwen 置信度脏值', () => {
    const draft = createExhibitionDemoDraft();
    draft.tags.qwenConfidence = Number.NaN;

    applyCritic(draft);

    expect(draft.tags.qwenConfidence).toBeUndefined();
    expect(draft.reason).toContain('非法Qwen置信度');
  });
});

describe('mergeKnown · 本地索引合并', () => {
  it('保留本次输入的显式 0 星评分', () => {
    const draft = createExhibitionDemoDraft();
    draft.tags.myRating = 0;
    const known: StoredArtifact = {
      key: draft.id,
      nameZh: draft.nameZh,
      museum: draft.museum,
      eraStart: draft.eraStart,
      eraEnd: draft.eraEnd,
      tags: { ...draft.tags, myRating: 5 },
      labels: [],
      splat: null,
      photos: [],
      geo: draft.geo,
      pinned: true,
      enriched: true,
      visitDate: draft.visitDate,
      ts: 1,
    };

    expect(mergeKnown(draft, known)).toBe(true);

    expect(draft.tags.myRating).toBe(0);
    expect(draft.reason).toContain('命中本地索引');
  });

  it('未输入本次评分时可沿用本地索引评分', () => {
    const draft = createExhibitionDemoDraft();
    draft.tags.myRating = 0;
    const known: StoredArtifact = {
      key: draft.id,
      nameZh: draft.nameZh,
      museum: draft.museum,
      eraStart: draft.eraStart,
      eraEnd: draft.eraEnd,
      tags: { ...draft.tags, myRating: 4 },
      labels: [],
      splat: null,
      photos: [],
      geo: draft.geo,
      pinned: true,
      enriched: true,
      visitDate: draft.visitDate,
      ts: 1,
    };

    expect(mergeKnown(draft, known, { keepDraftRating: false })).toBe(true);

    expect(draft.tags.myRating).toBe(4);
  });
});
