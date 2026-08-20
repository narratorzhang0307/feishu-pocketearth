import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCuratorNotes } from './curator';
import { createExhibitionDemoDraft } from './demo';

const mocks = vi.hoisted(() => ({
  enrichJSON: vi.fn(),
}));

vi.mock('../skills/enrichEntity', () => ({
  enrichJSON: mocks.enrichJSON,
}));

describe('Qwen 到 KIRI 后 3D 展品卡导览闭环', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('把 Qwen 结构化字段和 KIRI 3D 来源送入导览词 prompt', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      splatCard: {
        privateGuide: '这尊胜利女神适合旋转看衣褶和船艏动势。',
        chronologyPosition: '古希腊 · 希腊化时代 · 卢浮宫',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), {
      has3D: true,
      sourceKind: 'multi-image',
    });

    expect(notes).toEqual({
      curatorNote: '这尊胜利女神适合旋转看衣褶和船艏动势。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
    expect(mocks.enrichJSON).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('展品：萨莫色雷斯胜利女神像'),
    }));
    const prompt = mocks.enrichJSON.mock.calls[0]?.[0]?.prompt || '';
    expect(prompt).toContain('英文名：Winged Victory of Samothrace');
    expect(prompt).toContain('时代：希腊化时代');
    expect(prompt).toContain('文明：古希腊');
    expect(prompt).toContain('材质：大理石');
    expect(prompt).toContain('器类：造像');
    expect(prompt).toContain('展馆：卢浮宫');
    expect(prompt).toContain('has3D：true');
    expect(prompt).toContain('3D来源：multi-image');
  });

  it('Qwen 只返回 3D 私人导览时保留本地时间线位置', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      threeDCard: {
        personalNote: '3D 模型让你能从侧后方重新看见展开的翼和衣褶。',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '3D 模型让你能从侧后方重新看见展开的翼和衣褶。',
      source: 'qwen',
    });
    expect(notes.timelineNote).toContain('希腊化时代');
    expect(notes.timelineNote).toContain('约公元前323年');
  });

  it('Qwen 以 Markdown 表格返回 3D 导览时仍能解析导览词和时间线', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_markdown: [
        '| Field | Value |',
        '| --- | --- |',
        '| 私人导览 | 3D 模型让你从侧后方重新看见胜利女神的翼和衣褶。 |',
        '| Timeline position | 古希腊 · 希腊化时代 · 卢浮宫 |',
      ].join('\n'),
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), {
      has3D: true,
      sourceKind: 'multi-image',
    });

    expect(notes).toEqual({
      curatorNote: '3D 模型让你从侧后方重新看见胜利女神的翼和衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
    expect(mocks.enrichJSON).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('3D来源：multi-image'),
    }));
  });

  it('KIRI 后 Qwen 导览超时时仍保留本地 3D 导览和时间线位置', async () => {
    mocks.enrichJSON.mockRejectedValueOnce(new Error('gmi curator timeout'));

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), {
      has3D: true,
      sourceKind: 'video',
    });

    expect(notes.source).toBe('local');
    expect(notes.curatorNote).toContain('旋转看');
    expect(notes.timelineNote).toContain('时间线位置：');
    expect(notes.timelineNote).toContain('希腊化时代');
    expect(mocks.enrichJSON).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('3D来源：video'),
    }));
  });

  it('KIRI 失败残留任务 id 时不把 Qwen 导览 prompt 标成可旋转 3D', async () => {
    mocks.enrichJSON.mockRejectedValueOnce(new Error('gmi curator timeout'));
    const draft = createExhibitionDemoDraft();
    draft.splat = {
      status: 'failed',
      sourceKind: 'multi-image',
      engine: 'qwen-colmap-gsplat',
      splatId: 'kiri-failed-task',
      format: 'splat',
      captureQualityWarn: '隔玻璃反光过强，建议补拍一组。',
    };

    const notes = await createCuratorNotes(draft);

    expect(notes.source).toBe('local');
    expect(notes.curatorNote).not.toContain('旋转看');
    const prompt = mocks.enrichJSON.mock.calls[0]?.[0]?.prompt || '';
    expect(prompt).toContain('has3D：false');
    expect(prompt).toContain('3D来源：');
    expect(prompt).not.toContain('3D来源：multi-image');
  });
});
