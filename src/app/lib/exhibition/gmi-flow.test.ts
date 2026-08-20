import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runExhibitionAgent } from './agent';
import { captureGuideBrief, selectCaptureGuideForArtifact } from './captureGuide';
import { confirmPin } from './pin';
import { artifactKey } from './types';

const mocks = vi.hoisted(() => ({
  visionRead: vi.fn(),
  qwenVision: vi.fn(),
  markPlace: vi.fn(() => ({ pinned: true })),
  isPinned: vi.fn(() => false),
  unmarkPlace: vi.fn(),
  recordSignals: vi.fn(),
  getKnownArtifact: vi.fn(async () => null),
  putArtifact: vi.fn(async () => undefined),
  getExhibitionPrefs: vi.fn(() => ({ placeFix: {}, ratingFix: {} })),
}));

vi.mock('../skills/visionRead', () => ({
  visionRead: mocks.visionRead,
}));

vi.mock('../skills/qwenVision', () => ({
  qwenVision: mocks.qwenVision,
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
  getKnownArtifact: mocks.getKnownArtifact,
  putArtifact: mocks.putArtifact,
  getExhibitionPrefs: mocks.getExhibitionPrefs,
}));

const originalFetch = globalThis.fetch;

describe('Exhibition Agent x Qwen 闭环', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getKnownArtifact.mockResolvedValue(null);
    mocks.markPlace.mockReturnValue({ pinned: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('从图片展签到3D钉地球时保留Qwen全链路贡献', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce([
      'Winged Victory of Samothrace',
      'Marble, Hellenistic period',
      'Louvre',
    ].join('\n'));

    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      const payload = call === 1
        ? {
            nameZh: '萨莫色雷斯胜利女神像',
            nameEn: 'Winged Victory of Samothrace',
            aliases: ['Nike of Samothrace'],
            dynastyKey: 'greece-hellenistic',
            material: ['marble'],
            category: 'sculpture',
            culture: 'Ancient Greece',
            findspot: 'Samothrace',
            dimensions: '244 cm',
            museum: 'Louvre',
            confidence: 0.94,
          }
        : {
            curatorNote: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
            timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
          };
      return new Response(JSON.stringify({ text: JSON.stringify(payload) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const draft = await runExhibitionAgent({
      kind: 'image',
      imageDataUrl: 'data:image/jpeg;base64,label',
      allowCloud: true,
    });

    expect(mocks.visionRead).toHaveBeenCalled();
    expect(mocks.qwenVision).toHaveBeenCalled();
    expect(draft).not.toBeNull();
    expect(draft?.labels[0]).toMatchObject({
      ocrEngine: 'qwen-vision',
      rawText: expect.stringContaining('Winged Victory of Samothrace'),
    });
    expect(draft?.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(draft?.tags.nameEn).toBe('Winged Victory of Samothrace');
    expect(draft?.tags.aliases).toEqual(['Nike of Samothrace']);
    expect(draft?.tags.dynastyLabel).toBe('希腊化时代');
    expect(draft?.tags.material).toEqual(['大理石']);
    expect(draft?.tags.category).toBe('造像');
    expect(draft?.tags.qwenConfidence).toBe(0.94);
    expect(draft?.museum).toBe('卢浮宫');
    expect(draft?.tags.timelineNote).toContain('希腊化时代');

    const guide = selectCaptureGuideForArtifact(draft);
    expect(captureGuideBrief(guide)).toBe('雕塑 / 塑像 / 俑 · 视频/多图 · 绕 3 圈 · 平视、略俯、低角度');

    draft!.splat = {
      status: 'ready',
      sourceKind: 'multi-image',
      engine: 'qwen-colmap-gsplat',
      splatId: 'mock-qwen-3d',
      format: 'splat',
      captureQualityWarn: 'mock only',
    };

    await confirmPin(draft!);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      key: draft!.id,
      label: '萨莫色雷斯胜利女神像',
      meta: expect.objectContaining({
        labelOcrEngine: 'qwen-vision',
        labelOcrEngines: ['qwen-vision'],
        qwenConfidence: 0.94,
        curatorSource: 'qwen',
        timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
        splatEngine: 'qwen-colmap-gsplat',
        splatId: 'mock-qwen-3d',
        qwenContributions: ['vision', 'structured', 'curator', '3d'],
        qwenContributionSummary: '视觉识别 · 结构化补全 · 导览/时间线 · 3D兜底',
      }),
    }));
  });

  it('Qwen 只完成云视觉时，用户补展馆后钉地球只记录视觉贡献', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce([
      'Winged Victory of Samothrace',
      'Marble statue, Hellenistic period',
      'Louvre',
    ].join('\n'));

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ text: '' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

    const draft = await runExhibitionAgent({
      kind: 'image',
      imageDataUrl: 'data:image/jpeg;base64,label',
      allowCloud: true,
    });

    expect(mocks.visionRead).toHaveBeenCalled();
    expect(mocks.qwenVision).toHaveBeenCalled();
    expect(draft).not.toBeNull();
    expect(draft?.nameZh).toBe('Winged Victory of Samothrace');
    expect(draft?.source).toBe('label-ocr');
    expect(draft?.labels[0]).toMatchObject({
      ocrEngine: 'qwen-vision',
      rawText: expect.stringContaining('Marble statue'),
    });
    expect(draft?.reason).toContain('云脑不可用');
    expect(draft?.reason).toContain('本地导览词');

    const guide = selectCaptureGuideForArtifact(draft);
    expect(captureGuideBrief(guide)).toBe('雕塑 / 塑像 / 俑 · 视频/多图 · 绕 3 圈 · 平视、略俯、低角度');

    draft!.museum = '卢浮宫';
    draft!.geo = { kind: 'venue', place: '卢浮宫', lng: 2.3376, lat: 48.8606, confidence: 0.98 };
    draft!.needPlace = false;
    draft!.id = artifactKey(draft!.nameZh, draft!.museum);

    await confirmPin(draft!);

    expect(mocks.markPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      key: artifactKey('Winged Victory of Samothrace', '卢浮宫'),
      meta: expect.objectContaining({
        labelOcrEngine: 'qwen-vision',
        labelOcrEngines: ['qwen-vision'],
        curatorSource: 'local',
        qwenContributions: ['vision'],
        qwenContributionSummary: '视觉识别',
        qwenConfidence: null,
        splatEngine: '',
      }),
    }));
  });
});
