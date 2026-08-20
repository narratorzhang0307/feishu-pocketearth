import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runExhibitionAgent } from './agent';
import { captureGuideBrief, selectCaptureGuideForArtifact } from './captureGuide';

const mocks = vi.hoisted(() => ({
  visionRead: vi.fn(),
  qwenVision: vi.fn(),
}));

vi.mock('../skills/visionRead', () => ({
  visionRead: mocks.visionRead,
}));

vi.mock('../skills/qwenVision', () => ({
  qwenVision: mocks.qwenVision,
}));

const originalFetch = globalThis.fetch;

describe('runExhibitionAgent · 图片展签 Qwen 云视觉链路', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('端侧 OCR 读不出时，经 Qwen 云视觉兜底识别展签并生成可采集的展品草稿', async () => {
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
            dynastyKey: 'Hellenistic period',
            material: ['marble'],
            category: 'sculpture',
            culture: 'Ancient Greece',
            findspot: 'Samothrace',
            dimensions: '244 cm',
            museum: 'Louvre',
            confidence: 'confidence 92%',
          }
        : {
            curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合绕着看衣褶。',
            timelineNote: '古希腊 · 希腊化时代 · 卢浮宫',
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
    expect(draft?.tags.culture).toBe('古希腊');
    expect(draft?.tags.material).toEqual(['大理石']);
    expect(draft?.tags.category).toBe('造像');
    expect(draft?.tags.qwenConfidence).toBe(0.92);
    expect(draft?.museum).toBe('卢浮宫');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '卢浮宫' });
    expect(draft?.tags.curatorNote).toContain('大理石');
    expect(draft?.tags.timelineNote).toContain('希腊化时代');
    expect(draft?.reason).toContain('云脑补全展品');
    expect(draft?.reason).toContain('Qwen生成导览词');

    const guide = selectCaptureGuideForArtifact(draft);
    expect(guide.kind).toBe('sculpture');
    expect(captureGuideBrief(guide)).toBe('雕塑 / 塑像 / 俑 · 视频/多图 · 绕 3 圈 · 平视、略俯、低角度');
  });

  it('端侧 OCR 已读出展签时，不再调用 Qwen 云视觉但继续走 Qwen 结构化补全', async () => {
    mocks.visionRead.mockResolvedValueOnce([
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
            dynastyKey: 'Hellenistic period',
            material: ['marble'],
            category: 'sculpture',
            culture: 'Ancient Greece',
            museum: 'Louvre',
            confidence: 0.91,
          }
        : {
            curatorNote: '端侧先读出展签，Qwen 再补足时代、材质和观看线索。',
            timelineNote: '古希腊 · 希腊化时代 · 卢浮宫',
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
    expect(mocks.qwenVision).not.toHaveBeenCalled();
    expect(draft).not.toBeNull();
    expect(draft?.labels[0]).toMatchObject({
      ocrEngine: 'edge-vision',
      rawText: expect.stringContaining('Winged Victory of Samothrace'),
    });
    expect(draft?.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(draft?.tags.nameEn).toBe('Winged Victory of Samothrace');
    expect(draft?.tags.dynastyLabel).toBe('希腊化时代');
    expect(draft?.tags.material).toEqual(['大理石']);
    expect(draft?.tags.category).toBe('造像');
    expect(draft?.tags.qwenConfidence).toBe(0.91);
    expect(draft?.museum).toBe('卢浮宫');
    expect(draft?.reason).toContain('云脑补全展品');
    expect(draft?.reason).toContain('Qwen生成导览词');

    const guide = selectCaptureGuideForArtifact(draft);
    expect(captureGuideBrief(guide)).toBe('雕塑 / 塑像 / 俑 · 视频/多图 · 绕 3 圈 · 平视、略俯、低角度');
  });

  it('Qwen 视觉读出展签但结构化补全不可用时，仍保留草稿和本地采集建议', async () => {
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

    const phases: string[] = [];
    const draft = await runExhibitionAgent({
      kind: 'image',
      imageDataUrl: 'data:image/jpeg;base64,label',
      allowCloud: true,
    }, (phase) => phases.push(phase));

    expect(mocks.qwenVision).toHaveBeenCalled();
    expect(draft).not.toBeNull();
    expect(draft?.nameZh).toBe('Winged Victory of Samothrace');
    expect(draft?.labels[0]).toMatchObject({
      ocrEngine: 'qwen-vision',
      rawText: expect.stringContaining('Marble statue'),
    });
    expect(draft?.tags.nameEn).toBe('');
    expect(draft?.tags.category).toBe('');
    expect(draft?.museum).toBe('');
    expect(draft?.geo).toBeNull();
    expect(draft?.needPlace).toBe(true);
    expect(draft?.needsConfirm).toBe(true);
    expect(draft?.reason).toContain('云脑不可用');
    expect(draft?.reason).toContain('本地导览词');
    expect(phases).toContain('完成');

    const guide = selectCaptureGuideForArtifact(draft);
    expect(guide.kind).toBe('sculpture');
    expect(captureGuideBrief(guide)).toBe('雕塑 / 塑像 / 俑 · 视频/多图 · 绕 3 圈 · 平视、略俯、低角度');
  });

  it('Qwen 视觉读到玻璃展柜语境时，优先给隔玻璃采集建议', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce([
      'Jade Cup',
      'Behind protective glass',
      'Qing dynasty, jade',
      'Louvre',
    ].join('\n'));

    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      const payload = call === 1
        ? {
            nameZh: '青玉杯',
            nameEn: 'Jade Cup',
            dynastyKey: 'Qing dynasty',
            material: ['jade'],
            category: 'sculpture',
            culture: 'China',
            museum: 'Louvre',
            confidence: 0.86,
          }
        : {
            curatorNote: '隔着玻璃先看杯口和玉质边缘，再补一圈细节。',
            timelineNote: '清代 · 玉器 · 卢浮宫',
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

    expect(draft).not.toBeNull();
    expect(draft?.labels[0]).toMatchObject({
      ocrEngine: 'qwen-vision',
      rawText: expect.stringContaining('Behind protective glass'),
    });
    expect(draft?.nameZh).toBe('青玉杯');
    expect(draft?.tags.category).toBe('造像');
    expect(draft?.tags.material).toEqual(['玉']);
    expect(draft?.reason).toContain('Qwen生成导览词');

    const guide = selectCaptureGuideForArtifact(draft);
    expect(guide.kind).toBe('glasscase');
    expect(guide.mode).toBe('video');
    expect(captureGuideBrief(guide)).toBe('玻璃罩 / 展柜内 · 录视频 · 绕 2 圈 · 平视、略俯');
  });
});
