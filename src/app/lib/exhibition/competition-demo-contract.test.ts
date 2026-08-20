import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureGuideBrief, selectCaptureGuideForArtifact } from './captureGuide';
import { createExhibitionDemoDraft, createQwenOwnedGpuCompetitionDemoDraft } from './demo';
import { confirmPin } from './pin';

const mocks = vi.hoisted(() => ({
  markPlace: vi.fn(() => ({ pinned: true })),
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

describe('看展搭子 Qwen 比赛演示闭环 contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markPlace.mockReturnValue({ pinned: true });
  });

  it('把拍展签到自有 GPU 3D再钉地球的Qwen贡献完整写进展品卡元数据', async () => {
    const draft = createExhibitionDemoDraft();
    draft.source = 'mixed';
    draft.confidence = 0.94;
    draft.reason = 'Qwen生成导览词；自有 GPU 3D 生成完成';
    draft.labels = [{
      lang: 'zh',
      rawText: 'Winged Victory of Samothrace\nMarble, Hellenistic period\nLouvre',
      ocrEngine: 'qwen-vision',
    }];
    draft.tags.aliases = ['Nike of Samothrace'];
    draft.tags.qwenConfidence = 0.94;
    draft.tags.curatorNote = '旋转模型时先看船首和衣褶，海风像被固定在大理石里。';
    draft.tags.timelineNote = '时间线位置：古希腊 · 希腊化时代 · 卢浮宫';
    draft.splat = {
      status: 'ready',
      sourceKind: 'multi-image',
      engine: 'qwen-colmap-gsplat',
      splatId: 'mock-qwen-3d',
      format: 'splat',
      captureQualityWarn: 'mock only',
    };

    const guide = selectCaptureGuideForArtifact(draft);
    expect(captureGuideBrief(guide)).toBe('雕塑 / 塑像 / 俑 · 视频/多图 · 绕 3 圈 · 平视、略俯、低角度');

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'exhibition',
      key: draft.id,
      label: '萨莫色雷斯胜利女神像',
      meta: expect.objectContaining({
        labelOcrEngine: 'qwen-vision',
        labelOcrEngines: ['qwen-vision'],
        aliases: ['Nike of Samothrace'],
        qwenConfidence: 0.94,
        curatorSource: 'qwen',
        curatorNote: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
        timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
        splatEngine: 'qwen-colmap-gsplat',
        splatSourceKind: 'multi-image',
        splatId: 'mock-qwen-3d',
        qwenContributions: ['vision', 'structured', 'curator', '3d'],
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线 · 3D兜底',
      }),
    }));
    expect(mocks.putArtifact).toHaveBeenCalledWith(expect.objectContaining({
      key: draft.id,
      enriched: true,
      pinned: true,
    }));
  });

  it('自有 GPU 主链路 mock 钉地球时完整展示 Qwen 贡献', async () => {
    const draft = createQwenOwnedGpuCompetitionDemoDraft();

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'exhibition',
      key: draft.id,
      meta: expect.objectContaining({
        labelOcrEngine: 'qwen-vision',
        labelOcrEngines: ['qwen-vision'],
        aliases: ['Nike of Samothrace'],
        qwenConfidence: 0.94,
        curatorSource: 'qwen',
        splatStatus: 'ready',
        splatEngine: 'qwen-colmap-gsplat',
        splatSourceKind: 'multi-image',
        splatId: 'mock-owned-gpu-3d',
        splatTaskId: 'mock-owned-gpu-task',
        qwenContributions: ['vision', 'structured', 'curator', '3d'],
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线 · 3D兜底',
      }),
    }));
    expect(mocks.putArtifact).toHaveBeenCalledWith(expect.objectContaining({
      key: draft.id,
      enriched: true,
      pinned: true,
    }));
  });

  it('自有 GPU 3D 失败时保留Qwen结构化和导览贡献但不计入3D兜底', async () => {
    const draft = createExhibitionDemoDraft();
    draft.source = 'mixed';
    draft.confidence = 0.9;
    draft.reason = 'Qwen生成导览词；自有 GPU 3D 失败，保留照片层';
    draft.labels = [{
      lang: 'zh',
      rawText: 'Winged Victory of Samothrace\nMarble, Hellenistic period\nLouvre',
      ocrEngine: 'qwen-vision',
    }];
    draft.tags.aliases = ['Nike of Samothrace'];
    draft.tags.qwenConfidence = 0.9;
    draft.tags.curatorNote = '先看船首方向的动势，再绕到侧面看衣褶如何压住风。';
    draft.tags.timelineNote = '时间线位置：古希腊 · 希腊化时代 · 卢浮宫';
    draft.splat = {
      status: 'failed',
      sourceKind: 'video',
      engine: 'qwen-colmap-gsplat',
      splatId: 'mock-qwen-3d-failed',
      format: 'splat',
      captureQualityWarn: '隔玻璃反光过强，建议补一组侧面多图。',
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenCalledWith(expect.objectContaining({
      key: draft.id,
      meta: expect.objectContaining({
        labelOcrEngine: 'qwen-vision',
        aliases: ['Nike of Samothrace'],
        qwenConfidence: 0.9,
        curatorSource: 'qwen',
        splatStatus: 'failed',
        splatEngine: 'qwen-colmap-gsplat',
        splatSourceKind: 'video',
        splatCaptureQualityWarn: '隔玻璃反光过强，建议补一组侧面多图。',
        qwenContributions: ['vision', 'structured', 'curator'],
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线',
      }),
    }));
  });

  it('自有 GPU 3D 生成中即使已有任务id也不提前计入Qwen 3D兜底', async () => {
    const draft = createExhibitionDemoDraft();
    draft.source = 'mixed';
    draft.confidence = 0.91;
    draft.reason = 'Qwen生成导览词；自有 GPU 3D 生成中，等待用户补看';
    draft.labels = [{
      lang: 'zh',
      rawText: 'Winged Victory of Samothrace\nMarble, Hellenistic period\nLouvre',
      ocrEngine: 'qwen-vision',
    }];
    draft.tags.aliases = ['Nike of Samothrace'];
    draft.tags.qwenConfidence = 0.91;
    draft.tags.curatorNote = '先看船首方向的动势，再绕到侧面看衣褶如何压住风。';
    draft.tags.timelineNote = '时间线位置：古希腊 · 希腊化时代 · 卢浮宫';
    draft.splat = {
      status: 'reconstructing',
      sourceKind: 'video',
      engine: 'qwen-colmap-gsplat',
      splatId: 'mock-qwen-3d-running',
      taskId: 'owned-gpu-task-running',
      format: 'splat',
      captureQualityWarn: 'mock task pending',
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenCalledWith(expect.objectContaining({
      key: draft.id,
      meta: expect.objectContaining({
        labelOcrEngine: 'qwen-vision',
        qwenConfidence: 0.91,
        curatorSource: 'qwen',
        splatStatus: 'reconstructing',
        splatEngine: 'qwen-colmap-gsplat',
        splatId: 'mock-qwen-3d-running',
        splatTaskId: 'owned-gpu-task-running',
        qwenContributions: ['vision', 'structured', 'curator'],
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线',
      }),
    }));
  });

  it('Qwen 3D ready 状态带包装空格和大小写时仍计入3D兜底', async () => {
    const draft = createExhibitionDemoDraft();
    draft.source = 'mixed';
    draft.confidence = 0.92;
    draft.reason = 'Qwen生成导览词；Qwen 3D 包装层返回 Ready 状态';
    draft.labels = [{
      lang: 'zh',
      rawText: 'Winged Victory of Samothrace\nMarble, Hellenistic period\nLouvre',
      ocrEngine: 'qwen-vision',
    }];
    draft.tags.aliases = ['Nike of Samothrace'];
    draft.tags.qwenConfidence = 0.92;
    draft.tags.curatorNote = '旋转模型时先看船首和衣褶，海风像被固定在大理石里。';
    draft.tags.timelineNote = '时间线位置：古希腊 · 希腊化时代 · 卢浮宫';
    draft.splat = {
      status: ' Ready ' as any,
      sourceKind: 'multi-image',
      engine: 'qwen-colmap-gsplat',
      splatId: 'mock-qwen-3d-wrapped-ready',
      taskId: 'owned-gpu-task-wrapped-ready',
      format: 'splat',
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenCalledWith(expect.objectContaining({
      key: draft.id,
      meta: expect.objectContaining({
        splatStatus: ' Ready ',
        splatEngine: 'qwen-colmap-gsplat',
        splatId: 'mock-qwen-3d-wrapped-ready',
        qwenContributions: ['vision', 'structured', 'curator', '3d'],
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线 · 3D兜底',
      }),
    }));
  });

  it('Qwen 3D 引擎名带包装空格和下划线时仍计入3D兜底', async () => {
    const draft = createExhibitionDemoDraft();
    draft.source = 'mixed';
    draft.confidence = 0.92;
    draft.reason = 'Qwen生成导览词；Qwen 3D 包装层返回引擎名';
    draft.labels = [{
      lang: 'zh',
      rawText: 'Winged Victory of Samothrace\nMarble, Hellenistic period\nLouvre',
      ocrEngine: 'qwen-vision',
    }];
    draft.tags.aliases = ['Nike of Samothrace'];
    draft.tags.qwenConfidence = 0.92;
    draft.tags.curatorNote = '旋转模型时先看船首和衣褶，海风像被固定在大理石里。';
    draft.tags.timelineNote = '时间线位置：古希腊 · 希腊化时代 · 卢浮宫';
    draft.splat = {
      status: 'ready',
      sourceKind: 'multi-image',
      engine: ' Qwen_COLMAP_GSPLAT ' as any,
      splatId: 'mock-qwen-3d-wrapped-engine',
      taskId: 'owned-gpu-task-wrapped-engine',
      format: 'splat',
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenCalledWith(expect.objectContaining({
      key: draft.id,
      meta: expect.objectContaining({
        splatEngine: ' Qwen_COLMAP_GSPLAT ',
        splatId: 'mock-qwen-3d-wrapped-engine',
        qwenContributions: ['vision', 'structured', 'curator', '3d'],
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线 · 3D兜底',
      }),
    }));
  });

  it('Qwen 3D ready 但缺少可打开资产时不计入3D兜底', async () => {
    const draft = createExhibitionDemoDraft();
    draft.source = 'mixed';
    draft.confidence = 0.9;
    draft.reason = 'Qwen生成导览词；Qwen 3D 只返回 ready 状态但未返回资产';
    draft.labels = [{
      lang: 'zh',
      rawText: 'Winged Victory of Samothrace\nMarble, Hellenistic period\nLouvre',
      ocrEngine: 'qwen-vision',
    }];
    draft.tags.aliases = ['Nike of Samothrace'];
    draft.tags.qwenConfidence = 0.9;
    draft.tags.curatorNote = '先看船首方向的动势，再绕到侧面看衣褶如何压住风。';
    draft.tags.timelineNote = '时间线位置：古希腊 · 希腊化时代 · 卢浮宫';
    draft.splat = {
      status: 'ready',
      sourceKind: 'multi-image',
      engine: 'qwen-colmap-gsplat',
      taskId: 'owned-gpu-task-ready-without-asset',
      format: 'splat',
    };

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenCalledWith(expect.objectContaining({
      key: draft.id,
      meta: expect.objectContaining({
        splatStatus: 'ready',
        splatEngine: 'qwen-colmap-gsplat',
        splatTaskId: 'owned-gpu-task-ready-without-asset',
        splatId: '',
        qwenContributions: ['vision', 'structured', 'curator'],
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线',
      }),
    }));
  });

  it('Qwen展签引擎名带包装空格或大小写时仍计入视觉贡献', async () => {
    const draft = createExhibitionDemoDraft();
    draft.source = 'label-ocr';
    draft.confidence = 0.86;
    draft.reason = '端侧OCR先读展签；Qwen Vision 包装层返回中文展签';
    draft.labels = [
      {
        lang: 'zh',
        rawText: '萨莫色雷斯胜利女神像\n希腊化时代\n卢浮宫',
        ocrEngine: ' Qwen Vision ' as any,
      },
      {
        lang: 'en',
        rawText: 'Winged Victory of Samothrace',
        ocrEngine: 'edge-vision',
      },
    ];
    draft.tags.aliases = [];
    draft.tags.qwenConfidence = undefined;
    draft.splat = null;

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenCalledWith(expect.objectContaining({
      key: draft.id,
      meta: expect.objectContaining({
        labelZh: '萨莫色雷斯胜利女神像\n希腊化时代\n卢浮宫',
        labelOcrEngine: 'qwen-vision',
        labelOcrEngines: ['qwen-vision', 'edge-vision'],
        qwenContributions: ['vision'],
        qwenContributionSummary: '视觉识别',
      }),
    }));
  });

  it('端侧OCR和多次Qwen展签识别并存时贡献只按链路阶段去重', async () => {
    const draft = createExhibitionDemoDraft();
    draft.source = 'mixed';
    draft.confidence = 0.88;
    draft.reason = '端侧OCR先读展签；Qwen生成导览词；等待用户补拍3D';
    draft.labels = [
      {
        lang: 'zh',
        rawText: '萨莫色雷斯胜利女神像\n希腊化时代\n卢浮宫',
        ocrEngine: 'edge-vision',
      },
      {
        lang: 'zh',
        rawText: '萨莫色雷斯胜利女神像\n大理石\n卢浮宫',
        ocrEngine: 'qwen-vision',
      },
      {
        lang: 'en',
        rawText: 'Winged Victory of Samothrace\nMarble\nLouvre',
        ocrEngine: 'qwen-vision',
      },
    ];
    draft.tags.aliases = ['Nike of Samothrace'];
    draft.tags.qwenConfidence = 0.88;
    draft.tags.curatorNote = '先看船首方向的动势，再走到侧面观察衣褶。';
    draft.tags.timelineNote = '时间线位置：古希腊 · 希腊化时代 · 卢浮宫';
    draft.splat = null;

    await confirmPin(draft);

    expect(mocks.markPlace).toHaveBeenCalledWith(expect.objectContaining({
      key: draft.id,
      meta: expect.objectContaining({
        labelOcrEngine: 'qwen-vision',
        labelOcrEngines: ['edge-vision', 'qwen-vision'],
        qwenContributions: ['vision', 'structured', 'curator'],
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线',
      }),
    }));
  });
});
