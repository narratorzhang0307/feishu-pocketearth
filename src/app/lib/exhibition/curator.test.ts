import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExhibitionDemoDraft } from './demo';
import { createCuratorNotes } from './curator';

const mocks = vi.hoisted(() => ({
  enrichJSON: vi.fn(),
}));

vi.mock('../skills/enrichEntity', () => ({
  enrichJSON: mocks.enrichJSON,
}));

describe('createCuratorNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('优先使用 Qwen 结构化导览词', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合绕着看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代',
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'video' });

    expect(notes).toEqual({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合绕着看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代',
      source: 'qwen',
    });
    expect(mocks.enrichJSON).toHaveBeenCalledWith(expect.objectContaining({
      task: 'exhibition-narrative',
      prompt: expect.stringContaining('has3D：true'),
    }));
  });

  it('Qwen 无输出时本地兜底，且 3D 语境会进入导览词', async () => {
    mocks.enrichJSON.mockResolvedValueOnce(null);

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes.source).toBe('local');
    expect(notes.curatorNote).toContain('旋转看');
    expect(notes.timelineNote).toContain('希腊化时代');
  });

  it('Qwen 返回裸时间线短语时补齐统一字段前缀', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合绕着看衣褶。',
      timelineNote: '古希腊 · 希腊化时代 · 卢浮宫',
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('Qwen 返回占位导览词时本地兜底，不把占位文本展示到卡片', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      curatorNote: 'Unknown',
      timelineNote: '时间线位置：暂无',
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes.source).toBe('local');
    expect(notes.curatorNote).toContain('旋转看');
    expect(notes.timelineNote).toContain('希腊化时代');
    expect(notes.curatorNote).not.toMatch(/unknown|暂无/i);
    expect(notes.timelineNote).not.toMatch(/unknown|暂无/i);
  });

  it('Qwen 返回 Markdown 或序号包装时清理成可展示短句', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      curatorNote: '- **导览词：她把海风与胜利的瞬间凝在大理石里，适合绕着看衣褶。**',
      timelineNote: '1. **时间线位置: 古希腊 · 希腊化时代 · 卢浮宫**',
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合绕着看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
    expect(notes.curatorNote).not.toMatch(/[*#`-]|导览词/);
    expect(notes.timelineNote).not.toMatch(/[*#`]|^1\./);
  });

  it('Qwen 返回英文字段名前缀时清理后再展示到导览和时间线', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      curatorNote: 'Curator note: Sea wind and victory stay carved in marble.',
      timelineNote: 'Timeline position: Ancient Greece · Hellenistic',
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: 'Sea wind and victory stay carved in marble.',
      timelineNote: '时间线位置：Ancient Greece · Hellenistic',
      source: 'qwen',
    });
    expect(notes.curatorNote).not.toMatch(/curator note/i);
    expect(notes.timelineNote).not.toMatch(/timeline position/i);
  });

  it('Qwen 返回 snake_case 或同义字段名时仍能生成导览卡', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      guide_note: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
      timeline_position: '古希腊 · 希腊化时代 · 卢浮宫',
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('解包 Qwen 返回的嵌套导览对象数组', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      data: {
        notes: [
          {
            guide_note: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
            timeline_position: '古希腊 · 希腊化时代 · 卢浮宫',
          },
        ],
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('兼容 Qwen 展品卡包装里的导览正文和时间线位置字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      exhibitCard: {
        guideText: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
        timelinePlacement: '古希腊 · 希腊化时代 · 卢浮宫',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('兼容 Qwen 展品卡包装里的 tourGuide 和 timelineLabel 字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      artifactCard: {
        tourGuide: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
        timelineLabel: '古希腊 · 希腊化时代 · 卢浮宫',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('解包 Qwen message.content 里的 JSON 字符串导览结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              guide_note: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
              timeline_position: '古希腊 · 希腊化时代 · 卢浮宫',
            }),
          },
        },
      ],
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('解包 Qwen message.content 说明文字里的 JSON 导览结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: [
              '可以，下面是展品卡 JSON：',
              JSON.stringify({
                guide_note: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
                timeline_position: '古希腊 · 希腊化时代 · 卢浮宫',
              }),
              '已尽量保持短句。',
            ].join('\n'),
          },
        },
      ],
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('解包 Qwen message.content 里的纯文本导览结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: [
              '导览词：她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
              '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
            ].join('\n'),
          },
        },
      ],
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('兼容 Qwen 纯文本里的 Guide 和 Timeline 简短标签', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: [
              'Guide: Sea wind stays carved in marble as the 3D turns.',
              'Timeline: Ancient Greece · Hellenistic · Louvre',
            ].join('\n'),
          },
        },
      ],
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: 'Sea wind stays carved in marble as the 3D turns.',
      timelineNote: '时间线位置：Ancient Greece · Hellenistic · Louvre',
      source: 'qwen',
    });
    expect(notes.curatorNote).not.toMatch(/^Guide/i);
    expect(notes.timelineNote).not.toMatch(/^Timeline/i);
  });

  it('兼容 Qwen 纯文本里用短横线分隔的 Guide 和 Timeline 标签', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: [
        'Guide - Sea wind stays carved in marble as the 3D turns.',
        'Timeline - Ancient Greece · Hellenistic · Louvre',
      ].join('\n'),
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: 'Sea wind stays carved in marble as the 3D turns.',
      timelineNote: '时间线位置：Ancient Greece · Hellenistic · Louvre',
      source: 'qwen',
    });
    expect(notes.curatorNote).not.toMatch(/^Guide/i);
    expect(notes.timelineNote).not.toMatch(/^Timeline/i);
  });

  it('兼容 Qwen 纯文本里用长短破折号分隔的 Guide 和 Timeline 标签', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: [
        'Guide – Sea wind stays carved in marble as the 3D turns.',
        'Timeline — Ancient Greece · Hellenistic · Louvre',
      ].join('\n'),
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: 'Sea wind stays carved in marble as the 3D turns.',
      timelineNote: '时间线位置：Ancient Greece · Hellenistic · Louvre',
      source: 'qwen',
    });
    expect(notes.curatorNote).not.toMatch(/^Guide/i);
    expect(notes.timelineNote).not.toMatch(/^Timeline/i);
  });

  it('解包 Qwen output_text 里的纯文本导览结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: [
        'Guide: Sea wind stays carved in marble as the 3D turns.',
        'Timeline: Ancient Greece · Hellenistic · Louvre',
      ].join('\n'),
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: 'Sea wind stays carved in marble as the 3D turns.',
      timelineNote: '时间线位置：Ancient Greece · Hellenistic · Louvre',
      source: 'qwen',
    });
  });

  it('兼容 Qwen output_text 纯文本里的展品卡字段名', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: [
        'guideText: 她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
        'timelinePlacement: 古希腊 · 希腊化时代 · 卢浮宫',
      ].join('\n'),
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
    expect(notes.curatorNote).not.toMatch(/^guideText/i);
    expect(notes.timelineNote).not.toMatch(/^timelinePlacement/i);
  });

  it('兼容 Qwen 展品卡里的导览行和时间线行字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      artifactCard: {
        tourGuideLine: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
        timelineLine: '古希腊 · 希腊化时代 · 卢浮宫',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('兼容 Qwen 3D 展品卡包装里的语音导览行和时间线语境', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      threeDCard: {
        audioGuideLine: '旋转模型时先看大理石衣褶，它把海风和胜利留在同一刻。',
        timelineContext: '古希腊 · 希腊化时代 · 卢浮宫',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'video' });

    expect(notes).toMatchObject({
      curatorNote: '旋转模型时先看大理石衣褶，它把海风和胜利留在同一刻。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('兼容 Qwen 3D 展品卡里的 voiceGuideLine 和 chronologyPosition 字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      modelCard: {
        voiceGuideLine: '转到船首角度时看翅膀和衣褶，它们把胜利的风向固定住。',
        chronologyPosition: '古希腊 · 希腊化时代 · 约公元前190年',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'multi-image' });

    expect(notes).toMatchObject({
      curatorNote: '转到船首角度时看翅膀和衣褶，它们把胜利的风向固定住。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 约公元前190年',
      source: 'qwen',
    });
  });

  it('兼容 Qwen 3D 展品卡里的 guideSentence 和 timelineAnchor 字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      splatCard: {
        guideSentence: '旋转到侧面时看翅膀和衣褶，它们把胜利的风向固定住。',
        timelineAnchor: '古希腊 · 希腊化时代 · 卢浮宫',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toMatchObject({
      curatorNote: '旋转到侧面时看翅膀和衣褶，它们把胜利的风向固定住。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('兼容 Qwen 纯文本里的 guideSentence 和 timelineAnchor 字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: [
        'guideSentence: 旋转到侧面时看翅膀和衣褶，它们把胜利的风向固定住。',
        'timelineAnchor: 古希腊 · 希腊化时代 · 卢浮宫',
      ].join('\n'),
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toMatchObject({
      curatorNote: '旋转到侧面时看翅膀和衣褶，它们把胜利的风向固定住。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
    expect(notes.curatorNote).not.toMatch(/^guideSentence/i);
    expect(notes.timelineNote).not.toMatch(/^timelineAnchor/i);
  });

  it('兼容 Qwen guideCard 里的单句导览和时间线摘要字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      guideCard: {
        oneLineGuide: '旋转模型时先看船首和衣褶，它们把海风推到胜利一刻。',
        timelineSummary: '古希腊 · 希腊化时代 · 约公元前190年',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toMatchObject({
      curatorNote: '旋转模型时先看船首和衣褶，它们把海风推到胜利一刻。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 约公元前190年',
      source: 'qwen',
    });
  });

  it('兼容 Qwen guideCard 里的短导览和时代时间线字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      guideCard: {
        shortGuide: '旋转到船首角度时看衣褶，它把海风和胜利固定在大理石里。',
        timelineEra: '古希腊 · 希腊化时代 · 卢浮宫',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toMatchObject({
      curatorNote: '旋转到船首角度时看衣褶，它把海风和胜利固定在大理石里。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('兼容 Qwen 返回的中文字段别名 guide_zh 和 timeline_zh', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      card: {
        guide_zh: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
        timeline_zh: '古希腊 · 希腊化时代 · 卢浮宫',
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toMatchObject({
      curatorNote: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('兼容 Qwen 中文 JSON 字段名里的私人导览词和时间轴位置', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      guideCard: {
        私人导览词: { 文本: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。' },
        时间轴位置: { 内容: '古希腊 · 希腊化时代 · 卢浮宫' },
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toMatchObject({
      curatorNote: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('兼容 Qwen 纯文本里的私人导览词和时间轴位置标签', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: [
        '私人导览词：旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
        '时间轴位置：古希腊 · 希腊化时代 · 卢浮宫',
      ].join('\n'),
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toMatchObject({
      curatorNote: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('兼容 Qwen 导览字段值里的对象和数组包装', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      threeDCard: {
        curatorNote: { text: '旋转模型时先看船首和衣褶，胜利的风向被固定在大理石里。' },
        timelineNote: [
          { label: 'Unknown' },
          { label: '古希腊 · 希腊化时代 · 卢浮宫' },
        ],
      },
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toMatchObject({
      curatorNote: '旋转模型时先看船首和衣褶，胜利的风向被固定在大理石里。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('合并 Qwen content block 拆开的导览词和时间线', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: [
              { type: 'text', text: 'Guide: Sea wind stays carved in marble as the 3D turns.' },
              { type: 'output_text', text: 'Timeline: Ancient Greece · Hellenistic · Louvre' },
            ],
          },
        },
      ],
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: 'Sea wind stays carved in marble as the 3D turns.',
      timelineNote: '时间线位置：Ancient Greece · Hellenistic · Louvre',
      source: 'qwen',
    });
  });

  it('合并 Qwen message.content 和 tool_calls 拆开的导览词与时间线', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: {
              type: 'text',
              text: 'Guide: Sea wind stays carved in marble as the 3D turns.',
            },
            tool_calls: [
              {
                function: {
                  arguments: JSON.stringify({
                    timeline_position: 'Ancient Greece · Hellenistic · Louvre',
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: 'Sea wind stays carved in marble as the 3D turns.',
      timelineNote: '时间线位置：Ancient Greece · Hellenistic · Louvre',
      source: 'qwen',
    });
  });

  it('解包 Qwen content block 里的 JSON 导览结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: [
              {
                type: 'output_json',
                json: {
                  guide_note: '旋转模型时看船首与衣褶，海风和胜利被压进同一块大理石。',
                },
              },
              {
                type: 'json_object',
                json: {
                  timeline_position: '古希腊 · 希腊化时代 · 卢浮宫',
                },
              },
            ],
          },
        },
      ],
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true, sourceKind: 'kiri' });

    expect(notes).toMatchObject({
      curatorNote: '旋转模型时看船首与衣褶，海风和胜利被压进同一块大理石。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('解包 Qwen tool_calls.arguments 里的 JSON 字符串导览结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  arguments: JSON.stringify({
                    guide_note: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
                    timeline_position: '古希腊 · 希腊化时代 · 卢浮宫',
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes).toMatchObject({
      curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合旋转看衣褶。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
      source: 'qwen',
    });
  });

  it('Qwen 抛错时仍返回本地导览词，不中断草稿链路', async () => {
    mocks.enrichJSON.mockRejectedValueOnce(new Error('gmi timeout'));

    const notes = await createCuratorNotes(createExhibitionDemoDraft(), { has3D: true });

    expect(notes.source).toBe('local');
    expect(notes.curatorNote).toContain('旋转看');
    expect(notes.timelineNote).toContain('希腊化时代');
  });
});
