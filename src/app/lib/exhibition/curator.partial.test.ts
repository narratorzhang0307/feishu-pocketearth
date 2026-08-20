import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExhibitionDemoDraft } from './demo';
import { createCuratorNotes } from './curator';

const mocks = vi.hoisted(() => ({
  enrichJSON: vi.fn(),
}));

vi.mock('../skills/enrichEntity', () => ({
  enrichJSON: mocks.enrichJSON,
}));

describe('createCuratorNotes · Qwen 单侧字段兜底', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Qwen 只返回导览词时仍用本地时间线补齐 3D 展品卡', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      guideCard: {
        oneLineGuide: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes.source).toBe('qwen');
    expect(notes.curatorNote).toBe('旋转模型时先看船首和衣褶，海风像被固定在大理石里。');
    expect(notes.timelineNote).toContain('时间线位置：');
    expect(notes.timelineNote).toContain('希腊化时代');
  });

  it('Qwen 只返回时间线时仍用本地导览词补齐 3D 展品卡', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      modelCard: {
        timelineSummary: '古希腊 · 希腊化时代 · 约公元前190年',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes.source).toBe('qwen');
    expect(notes.curatorNote).toContain('旋转看');
    expect(notes.timelineNote).toBe('时间线位置：古希腊 · 希腊化时代 · 约公元前190年');
  });

  it('Qwen 将导览词和时间线拆在数组项里时仍合并成 3D 展品卡', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          guideCard: {
            oneLineGuide: '旋转模型时先看衣褶转折，船首和海风会把胜利瞬间带出来。',
          },
        },
        {
          modelCard: {
            timelineSummary: '古希腊 · 希腊化时代 · 卢浮宫',
          },
        },
      ],
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toEqual({
      source: 'qwen',
      curatorNote: '旋转模型时先看衣褶转折，船首和海风会把胜利瞬间带出来。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
    });
  });

  it('Qwen 用单个 toolCall arguments 包装时仍解出 3D 展品卡字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      toolCall: {
        functionCall: {
          args: JSON.stringify({
            curatorNote: '旋转模型时先看船翼和衣褶，3D卡保留胜利女神的临场感。',
            timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
          }),
        },
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toEqual({
      source: 'qwen',
      curatorNote: '旋转模型时先看船翼和衣褶，3D卡保留胜利女神的临场感。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
    });
  });

  it('Qwen 用 functionCall.parameters 对象包装时仍解出 3D 展品卡字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      toolCall: {
        functionCall: {
          parameters: {
            guide_note: '旋转模型时先看大理石衣褶，海风和胜利被压进同一瞬间。',
            timeline_position: '古希腊 · 希腊化时代 · 卢浮宫',
          },
        },
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toEqual({
      source: 'qwen',
      curatorNote: '旋转模型时先看大理石衣褶，海风和胜利被压进同一瞬间。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
    });
  });

  it('Qwen 用 functionCall.params JSON 字符串包装时仍解出 3D 展品卡字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      toolCall: {
        functionCall: {
          params: JSON.stringify({
            oneLineGuide: '旋转到船首角度时看翅膀和衣褶，它们把胜利的风向固定住。',
            timelineSummary: '古希腊 · 希腊化时代 · 约公元前190年',
          }),
        },
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toEqual({
      source: 'qwen',
      curatorNote: '旋转到船首角度时看翅膀和衣褶，它们把胜利的风向固定住。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 约公元前190年',
    });
  });

  it('Qwen 用 candidates.content.parts.functionCall.args 包装时仍解出 3D 展品卡字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: 'build_exhibition_3d_card',
                  args: {
                    guide_note: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
                    timeline_position: '古希腊 · 希腊化时代 · 卢浮宫',
                  },
                },
              },
            ],
          },
        },
      ],
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toEqual({
      source: 'qwen',
      curatorNote: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
    });
  });
});
