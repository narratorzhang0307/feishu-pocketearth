import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExhibitionDemoDraft } from './demo';
import { archiveOnly, confirmPin } from './pin';
import type { MarkPlaceResult } from '../skills/markPlace';

const mocks = vi.hoisted(() => ({
  markPlace: vi.fn((): MarkPlaceResult => ({ pinned: true })),
  isPinned: vi.fn(() => false),
  unmarkPlace: vi.fn(),
  recordSignals: vi.fn(),
  putArtifact: vi.fn(async () => undefined),
}));

vi.mock('../skills/markPlace', () => ({
  markPlace: mocks.markPlace,
  isPinned: mocks.isPinned,
  unmarkPlace: mocks.unmarkPlace,
}));

vi.mock('../../../../frost-agent/harness/profile', () => ({
  recordSignals: mocks.recordSignals,
}));

vi.mock('./store', () => ({
  putArtifact: mocks.putArtifact,
}));

describe('confirmPin · 3D 元数据持久化', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markPlace.mockReturnValue({ pinned: true });
  });

  it('preset 3D 存静态 URL，本地导入只存 splatId', async () => {
    const preset = createExhibitionDemoDraft();
    preset.tags.aliases = ['Nike of Samothrace'];
    preset.tags.qwenConfidence = 0.91;
    await confirmPin(preset);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      key: preset.id,
      meta: expect.objectContaining({
        splatUrl: '/exhibits/preset-nike.splat',
        splatId: '',
        splatFormat: 'splat',
        curatorNote: preset.tags.curatorNote,
        timelineNote: preset.tags.timelineNote,
        aliases: ['Nike of Samothrace'],
        qwenConfidence: 0.91,
      }),
    }));
    expect(mocks.putArtifact).toHaveBeenLastCalledWith(expect.objectContaining({
      splat: expect.objectContaining({ splatUrl: '/exhibits/preset-nike.splat' }),
    }));

    const local = {
      ...preset,
      id: preset.id + '-local',
      splat: {
        status: 'ready' as const,
        sourceKind: 'local' as const,
        engine: 'local' as const,
        splatUrl: 'blob:http://localhost/local-model',
        splatId: 'splat-local-1',
        format: 'glb',
      },
    };
    await confirmPin(local);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      key: local.id,
      meta: expect.objectContaining({
        splatUrl: '',
        splatId: 'splat-local-1',
        splatFormat: 'glb',
      }),
    }));
    expect(mocks.putArtifact).toHaveBeenLastCalledWith(expect.objectContaining({
      splat: expect.not.objectContaining({ splatUrl: 'blob:http://localhost/local-model' }),
    }));
  });

  it('内置多视图 2.5D 资产保留静态 manifest URL', async () => {
    const draft = createExhibitionDemoDraft();
    draft.id += '-2_5d';
    draft.splat = {
      status: 'ready',
      sourceKind: 'multi-image-2_5d',
      engine: 'rgb-2_5d-baseline',
      splatUrl: '/assets/exhibit-2_5d/demo/exhibit.json',
      format: 'multiview-2_5d',
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      meta: expect.objectContaining({ splatUrl: '/assets/exhibit-2_5d/demo/exhibit.json' }),
    }));
    expect(mocks.putArtifact).toHaveBeenLastCalledWith(expect.objectContaining({
      splat: expect.objectContaining({ splatUrl: '/assets/exhibit-2_5d/demo/exhibit.json' }),
    }));
  });

  it('已存在的展品不重复回流画像', async () => {
    mocks.markPlace.mockReturnValueOnce({ pinned: true, reason: 'exists' });

    await confirmPin(createExhibitionDemoDraft());

    expect(mocks.recordSignals).not.toHaveBeenCalled();
  });

  it('钉地球时保留展签识别来源，便于展示 Qwen 云视觉贡献', async () => {
    const draft = {
      ...createExhibitionDemoDraft(),
      labels: [
        { lang: 'en', rawText: 'Winged Victory of Samothrace', ocrEngine: 'edge-vision' as const },
        { lang: 'zh', rawText: '萨莫色雷斯胜利女神像，大理石，卢浮宫。', ocrEngine: 'qwen-vision' as const },
      ],
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      meta: expect.objectContaining({
        labelZh: '萨莫色雷斯胜利女神像，大理石，卢浮宫。',
        labelOcrEngine: 'qwen-vision',
        labelOcrEngines: ['edge-vision', 'qwen-vision'],
      }),
    }));
  });

  it('端侧和 Qwen 都给出中文展签时优先保留 Qwen 兜底文本', async () => {
    const draft = {
      ...createExhibitionDemoDraft(),
      labels: [
        { lang: 'zh', rawText: '胜利女神，残缺展签', ocrEngine: 'edge-vision' as const },
        { lang: 'zh', rawText: '萨莫色雷斯胜利女神像，大理石，希腊化时代，卢浮宫。', ocrEngine: 'qwen-vision' as const },
        { lang: 'en', rawText: 'Winged Victory of Samothrace', ocrEngine: 'edge-vision' as const },
      ],
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      meta: expect.objectContaining({
        labelZh: '萨莫色雷斯胜利女神像，大理石，希腊化时代，卢浮宫。',
        labelOcrEngine: 'qwen-vision',
        labelOcrEngines: ['edge-vision', 'qwen-vision'],
      }),
    }));
  });

  it('钉地球时保留 Qwen 导览词来源，便于时间线审计', async () => {
    const draft = createExhibitionDemoDraft();
    draft.reason += '；Qwen生成导览词';
    draft.tags.curatorNote = '旋转模型时先看船首和衣褶，海风像被固定在大理石里。';
    draft.tags.timelineNote = '时间线位置：古希腊 · 希腊化时代 · 卢浮宫';

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      meta: expect.objectContaining({
        curatorNote: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
        timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
        curatorSource: 'qwen',
      }),
    }));
  });

  it('自有 GPU 后的 Qwen 3D 导览词也计入 Qwen 链路摘要', async () => {
    const draft = createExhibitionDemoDraft();
    draft.source = 'mixed';
    draft.reason += '；Qwen生成3D导览词';
    draft.tags.qwenConfidence = 0.94;
    draft.tags.curatorNote = '旋转模型时先看船首和衣褶，海风像被固定在大理石里。';
    draft.tags.timelineNote = '时间线位置：古希腊 · 希腊化时代 · 卢浮宫';
    draft.splat = {
      status: 'ready',
      sourceKind: 'multi-image',
      engine: 'qwen-colmap-gsplat',
      splatId: 'owned-gpu-splat-3d-guide',
      format: 'ply',
      taskId: 'owned-gpu-task-3d-guide',
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      meta: expect.objectContaining({
        curatorSource: 'qwen',
        curatorNote: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
        timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
        splatEngine: 'qwen-colmap-gsplat',
        splatSourceKind: 'multi-image',
        qwenContributions: ['structured', 'curator', '3d'],
        qwenContributionSummary: '结构化补全 · 导览/时间线 · 3D兜底',
      }),
    }));
  });

  it('钉地球时汇总 Qwen 视觉、结构化、导览和 3D 贡献', async () => {
    const draft = createExhibitionDemoDraft();
    draft.source = 'mixed';
    draft.reason += '；Qwen生成导览词';
    draft.labels = [
      { lang: 'zh', rawText: '萨莫色雷斯胜利女神像，大理石，卢浮宫。', ocrEngine: 'qwen-vision' },
    ];
    draft.tags.aliases = ['Nike of Samothrace'];
    draft.tags.qwenConfidence = 0.93;
    draft.splat = {
      status: 'ready',
      sourceKind: 'multi-image',
      engine: 'qwen-colmap-gsplat',
      splatId: 'gmi-splat-1',
      format: 'splat',
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      meta: expect.objectContaining({
        qwenContributions: ['vision', 'structured', 'curator', '3d'],
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线 · 3D兜底',
      }),
    }));
  });

  it('仅存档不钉地球，并清理非 preset 的临时 3D URL', async () => {
    const draft = {
      ...createExhibitionDemoDraft(),
      splat: {
        status: 'ready' as const,
        sourceKind: 'local' as const,
        engine: 'local' as const,
        splatUrl: 'blob:http://localhost/archived-model',
        splatId: 'splat-archived-1',
        format: 'ply',
      },
    };

    await archiveOnly(draft);

    expect(mocks.markPlace).not.toHaveBeenCalled();
    expect(mocks.recordSignals).not.toHaveBeenCalled();
    expect(mocks.putArtifact).toHaveBeenLastCalledWith(expect.objectContaining({
      pinned: false,
      splat: expect.not.objectContaining({ splatUrl: 'blob:http://localhost/archived-model' }),
    }));
  });

  it('自有 GPU 生成 3D 钉地球时保留重建引擎和任务审计字段', async () => {
    const draft = {
      ...createExhibitionDemoDraft(),
      splat: {
        status: 'ready' as const,
        sourceKind: 'video' as const,
        engine: 'qwen-colmap-gsplat' as const,
        splatUrl: 'https://gpu.example/jobs/owned-gpu-task-7/model.splat',
        splatId: 'owned-gpu-splat-7',
        format: 'splat',
        taskId: 'owned-gpu-task-7',
      },
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      meta: expect.objectContaining({
        splatUrl: '',
        splatId: 'owned-gpu-splat-7',
        splatFormat: 'splat',
        splatEngine: 'qwen-colmap-gsplat',
        splatSourceKind: 'video',
        splatTaskId: 'owned-gpu-task-7',
      }),
    }));
    expect(mocks.putArtifact).toHaveBeenLastCalledWith(expect.objectContaining({
      splat: expect.objectContaining({
        engine: 'qwen-colmap-gsplat',
        sourceKind: 'video',
        taskId: 'owned-gpu-task-7',
      }),
    }));
  });

  it('自有 GPU 重建失败钉地球时保留采集质量提醒', async () => {
    const draft = {
      ...createExhibitionDemoDraft(),
      splat: {
        status: 'failed' as const,
        sourceKind: 'multi-image' as const,
        engine: 'qwen-colmap-gsplat' as const,
        splatUrl: 'https://gpu.example/jobs/owned-gpu-task-8/preview.splat',
        splatId: 'owned-gpu-splat-8',
        format: 'splat',
        taskId: 'owned-gpu-task-8',
        captureQualityWarn: '隔玻璃反光过强，建议绕到侧面补拍一组。',
      },
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      meta: expect.objectContaining({
        splatUrl: '',
        splatStatus: 'failed',
        splatEngine: 'qwen-colmap-gsplat',
        splatSourceKind: 'multi-image',
        splatTaskId: 'owned-gpu-task-8',
        splatCaptureQualityWarn: '隔玻璃反光过强，建议绕到侧面补拍一组。',
      }),
    }));
    expect(mocks.putArtifact).toHaveBeenLastCalledWith(expect.objectContaining({
      splat: expect.objectContaining({
        status: 'failed',
        captureQualityWarn: '隔玻璃反光过强，建议绕到侧面补拍一组。',
      }),
    }));
  });
});
