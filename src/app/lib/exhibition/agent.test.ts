import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runExhibitionAgent } from './agent';
import { artifactKey } from './types';

const originalFetch = globalThis.fetch;

describe('runExhibitionAgent · 离线文本兜底', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ text: '' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('无云脑补全时，英文展馆文本仍生成可钉草稿', async () => {
    const phases: string[] = [];
    const draft = await runExhibitionAgent(
      { kind: 'text', text: '在 Met 看了 Rosetta Stone，五星' },
      (phase) => phases.push(phase),
    );

    expect(draft).not.toBeNull();
    expect(draft?.nameZh).toBe('Rosetta Stone');
    expect(draft?.museum).toBe('大都会艺术博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '大都会艺术博物馆' });
    expect(draft?.needPlace).toBe(false);
    expect(draft?.tags.myRating).toBe(5);
    expect(draft?.id).toBe(artifactKey('Rosetta Stone', '大都会艺术博物馆'));
    expect(draft?.reason).toContain('云脑不可用');
    expect(phases).toContain('完成');
  });

  it('Qwen 主链路：补全展品字段后生成私人导览词和时间线位置', async () => {
    const phases: string[] = [];
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      const payload = call === 1
        ? {
            nameZh: '萨莫色雷斯胜利女神像',
            nameEn: 'Winged Victory of Samothrace',
            dynastyKey: 'greece-hellenistic',
            material: ['大理石'],
            category: '造像',
            culture: '古希腊',
            findspot: '萨莫色雷斯岛',
            dimensions: '高约 244 厘米',
            museum: '卢浮宫',
          }
        : {
            curatorNote: '她把海风与胜利的瞬间凝在大理石里，适合绕着看衣褶。',
            timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
          };
      return new Response(JSON.stringify({ text: JSON.stringify(payload) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const draft = await runExhibitionAgent(
      { kind: 'text', text: '在卢浮宫看了萨莫色雷斯胜利女神像，五星' },
      (phase) => phases.push(phase),
    );

    expect(draft).not.toBeNull();
    expect(draft?.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(draft?.tags.nameEn).toBe('Winged Victory of Samothrace');
    expect(draft?.tags.dynastyLabel).toBe('希腊化时代');
    expect(draft?.tags.material).toEqual(['大理石']);
    expect(draft?.tags.category).toBe('造像');
    expect(draft?.museum).toBe('卢浮宫');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '卢浮宫' });
    expect(draft?.tags.curatorNote).toContain('大理石');
    expect(draft?.tags.timelineNote).toContain('希腊化时代');
    expect(draft?.reason).toContain('云脑补全展品');
    expect(draft?.reason).toContain('Qwen生成导览词');
    expect(phases).toContain('云脑补全展品');
    expect(phases).toContain('完成');
  });

  it('Qwen 返回英文名匹配当前标题时，将中文名用于草稿主名和主键', async () => {
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
            confidence: 0.88,
          }
        : {
            curatorNote: '大理石衣褶把海风和胜利瞬间固定下来。',
            timelineNote: '古希腊 · 希腊化时代 · 卢浮宫',
          };
      return new Response(JSON.stringify({ text: JSON.stringify(payload) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const draft = await runExhibitionAgent({
      kind: 'manual',
      manual: { nameZh: 'Winged Victory of Samothrace', museum: 'Louvre', rating: 5 },
    });

    expect(draft?.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(draft?.tags.nameEn).toBe('Winged Victory of Samothrace');
    expect(draft?.tags.aliases).toEqual(['Nike of Samothrace']);
    expect(draft?.tags.qwenConfidence).toBe(0.88);
    expect(draft?.tags.material).toEqual(['大理石']);
    expect(draft?.tags.category).toBe('造像');
    expect(draft?.museum).toBe('卢浮宫');
    expect(draft?.confidence).toBeGreaterThanOrEqual(0.88);
    expect(draft?.id).toBe(artifactKey('萨莫色雷斯胜利女神像', '卢浮宫'));
    expect(draft?.reason).toContain('Qwen补全中文名');
  });

  it('Qwen 未返回时代键时，仍保留文明泳道字段', async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      const payload = call === 1
        ? {
            nameZh: '希腊化大理石胜利女神残片',
            nameEn: 'Winged Victory fragment',
            dynastyKey: '',
            material: ['marble'],
            category: 'sculpture',
            culture: 'Ancient Greece',
            findspot: 'Samothrace',
            dimensions: '58 cm',
            museum: 'Louvre',
          }
        : {
            curatorNote: '残片仍能提示衣褶和海风的动势。',
            timelineNote: '古希腊 · 待补时代 · 卢浮宫',
          };
      return new Response(JSON.stringify({ text: JSON.stringify(payload) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const draft = await runExhibitionAgent({
      kind: 'manual',
      manual: { nameZh: 'Winged Victory fragment', museum: 'Louvre', rating: 4 },
    });

    expect(draft?.tags.dynastyKey).toBe('');
    expect(draft?.tags.culture).toBe('古希腊');
    expect(draft?.tags.category).toBe('造像');
    expect(draft?.tags.material).toEqual(['大理石']);
  });

  it('云脑补全子 agent 抛错时仍保留本地草稿并完成定位', async () => {
    const phases: string[] = [];
    vi.resetModules();
    vi.doMock('./tagging', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./tagging')>();
      return {
        ...actual,
        enrichArtifact: vi.fn(async () => { throw new Error('qwen down'); }),
      };
    });

    try {
      const { runExhibitionAgent: runWithThrowingEnrich } = await import('./agent');
      const draft = await runWithThrowingEnrich(
        { kind: 'text', text: 'at Met saw Rosetta Stone, 5 stars' },
        (phase) => phases.push(phase),
      );

      expect(draft).not.toBeNull();
      expect(draft?.nameZh).toBe('Rosetta Stone');
      expect(draft?.museum).toBe('大都会艺术博物馆');
      expect(draft?.geo).toMatchObject({ kind: 'venue', place: '大都会艺术博物馆' });
      expect(draft?.tags.myRating).toBe(5);
      expect(draft?.reason).toContain('云脑不可用');
      expect(phases).toContain('完成');
    } finally {
      vi.doUnmock('./tagging');
      vi.resetModules();
    }
  });

  it('地理子 agent 抛错时仍保留可手选展馆的草稿', async () => {
    const phases: string[] = [];
    vi.resetModules();
    vi.doMock('./tagging', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./tagging')>();
      return {
        ...actual,
        geoResolve: vi.fn(async () => { throw new Error('geocode down'); }),
      };
    });

    try {
      const { runExhibitionAgent: runWithThrowingGeo } = await import('./agent');
      const draft = await runWithThrowingGeo(
        { kind: 'text', text: 'saw Rosetta Stone, 4 stars' },
        (phase) => phases.push(phase),
      );

      expect(draft).not.toBeNull();
      expect(draft?.nameZh).toBe('Rosetta Stone');
      expect(draft?.geo).toBeNull();
      expect(draft?.needPlace).toBe(true);
      expect(draft?.needsConfirm).toBe(true);
      expect(draft?.tags.myRating).toBe(4);
      expect(draft?.reason).toContain('定位不可用');
      expect(phases).toContain('完成');
    } finally {
      vi.doUnmock('./tagging');
      vi.resetModules();
    }
  });

  it('无云脑补全时，全英文口语输入也能解析评分和展馆', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'at Met saw Rosetta Stone, 5 stars' });

    expect(draft?.nameZh).toBe('Rosetta Stone');
    expect(draft?.museum).toBe('大都会艺术博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '大都会艺术博物馆' });
    expect(draft?.tags.myRating).toBe(5);
  });

  it('无云脑补全时，英文展馆别名前的 the 不进入展品名', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'I visited the Met Temple of Dendur, four stars' });

    expect(draft?.nameZh).toBe('Temple of Dendur');
    expect(draft?.museum).toBe('大都会艺术博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '大都会艺术博物馆' });
    expect(draft?.tags.myRating).toBe(4);
  });

  it('无云脑补全时，英文句尾展馆也能解析', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'saw Rosetta Stone at British Museum, 5 stars' });

    expect(draft?.nameZh).toBe('Rosetta Stone');
    expect(draft?.museum).toBe('大英博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '大英博物馆' });
    expect(draft?.tags.myRating).toBe(5);
  });

  it('无云脑补全时，英文先去馆再看展品也能解析', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'I went to the British Museum and saw Rosetta Stone, 5 stars' });

    expect(draft?.nameZh).toBe('Rosetta Stone');
    expect(draft?.museum).toBe('大英博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '大英博物馆' });
    expect(draft?.tags.myRating).toBe(5);
  });

  it('无云脑补全时，句尾英文展馆前的 the 不进入展品名', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'saw Temple of Dendur at the Met, 4 stars' });

    expect(draft?.nameZh).toBe('Temple of Dendur');
    expect(draft?.museum).toBe('大都会艺术博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '大都会艺术博物馆' });
    expect(draft?.tags.myRating).toBe(4);
  });

  it('无云脑补全时，英文五分制评分会写入草稿', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'at Met saw Rosetta Stone, rated 4/5' });

    expect(draft?.nameZh).toBe('Rosetta Stone');
    expect(draft?.museum).toBe('大都会艺术博物馆');
    expect(draft?.tags.myRating).toBe(4);
  });

  it('命中本地索引时，本次显式 0 星不会被旧评分覆盖', async () => {
    const key = artifactKey('Rosetta Stone', '大英博物馆');
    vi.resetModules();
    vi.doMock('./store', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./store')>();
      return {
        ...actual,
        getKnownArtifact: vi.fn(async (requested: string) => (requested === key ? {
          key,
          nameZh: 'Rosetta Stone',
          museum: '大英博物馆',
          eraStart: null,
          eraEnd: null,
          tags: {
            nameEn: 'Rosetta Stone',
            dynastyKey: '',
            dynastyLabel: '',
            material: ['granodiorite'],
            category: '石刻',
            culture: '古埃及',
            findspot: '',
            dimensions: '',
            myRating: 5,
          },
          labels: [],
          splat: null,
          photos: [],
          geo: { kind: 'venue' as const, place: '大英博物馆', lng: -0.1269, lat: 51.5194, confidence: 0.95 },
          pinned: true,
          enriched: true,
          visitDate: '2026-07-04',
          ts: 1,
        } : null)),
      };
    });

    try {
      const { runExhibitionAgent: runWithKnown } = await import('./agent');
      const draft = await runWithKnown({ kind: 'text', text: 'saw Rosetta Stone at British Museum, 0 stars' });

      expect(draft?.tags.myRating).toBe(0);
      expect(draft?.reason).toContain('命中本地索引');
    } finally {
      vi.doUnmock('./store');
      vi.resetModules();
    }
  });

  it('命中本地索引且本次未评分时沿用旧评分', async () => {
    const key = artifactKey('Rosetta Stone', '大英博物馆');
    vi.resetModules();
    vi.doMock('./store', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./store')>();
      return {
        ...actual,
        getKnownArtifact: vi.fn(async (requested: string) => (requested === key ? {
          key,
          nameZh: 'Rosetta Stone',
          museum: '大英博物馆',
          eraStart: null,
          eraEnd: null,
          tags: {
            nameEn: 'Rosetta Stone',
            dynastyKey: '',
            dynastyLabel: '',
            material: ['granodiorite'],
            category: '石刻',
            culture: '古埃及',
            findspot: '',
            dimensions: '',
            myRating: 5,
          },
          labels: [],
          splat: null,
          photos: [],
          geo: { kind: 'venue' as const, place: '大英博物馆', lng: -0.1269, lat: 51.5194, confidence: 0.95 },
          pinned: true,
          enriched: true,
          visitDate: '2026-07-04',
          ts: 1,
        } : null)),
      };
    });

    try {
      const { runExhibitionAgent: runWithKnown } = await import('./agent');
      const draft = await runWithKnown({ kind: 'text', text: 'saw Rosetta Stone at British Museum' });

      expect(draft?.tags.myRating).toBe(5);
      expect(draft?.reason).toContain('命中本地索引');
    } finally {
      vi.doUnmock('./store');
      vi.resetModules();
    }
  });

  it('无云脑补全时，英文 out of five 评分会写入草稿', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'I visited Louvre Winged Victory, five out of five' });

    expect(draft?.nameZh).toBe('Winged Victory');
    expect(draft?.museum).toBe('卢浮宫');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '卢浮宫' });
    expect(draft?.tags.myRating).toBe(5);
  });

  it('无云脑补全时，英文 gave it 评分不会污染展品名', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'I went to the Met and saw Temple of Dendur, gave it five stars' });

    expect(draft?.nameZh).toBe('Temple of Dendur');
    expect(draft?.museum).toBe('大都会艺术博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '大都会艺术博物馆' });
    expect(draft?.tags.myRating).toBe(5);
  });

  it('无云脑补全时，英文评分动词后直接接展品名也能解析', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'I rated Rosetta Stone five stars at the British Museum' });

    expect(draft?.nameZh).toBe('Rosetta Stone');
    expect(draft?.museum).toBe('大英博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '大英博物馆' });
    expect(draft?.tags.myRating).toBe(5);
  });

  it('无云脑补全时，英文 five-star rating 不污染展品名', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'I gave Temple of Dendur a 4-star rating at the Met' });

    expect(draft?.nameZh).toBe('Temple of Dendur');
    expect(draft?.museum).toBe('大都会艺术博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '大都会艺术博物馆' });
    expect(draft?.tags.myRating).toBe(4);
  });

  it('无云脑补全时，英文 rating 标注式星级不污染展品名', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'saw Rosetta Stone at British Museum, rating: five stars' });

    expect(draft?.nameZh).toBe('Rosetta Stone');
    expect(draft?.museum).toBe('大英博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '大英博物馆' });
    expect(draft?.tags.myRating).toBe(5);
  });

  it('无云脑补全时，馆名速记输入也能解析为可钉草稿', async () => {
    const english = await runExhibitionAgent({ kind: 'text', text: 'Met: Temple of Dendur, 4 stars' });
    const chinese = await runExhibitionAgent({ kind: 'text', text: '国博：唐三彩骆驼，五星' });

    expect(english?.nameZh).toBe('Temple of Dendur');
    expect(english?.museum).toBe('大都会艺术博物馆');
    expect(english?.geo).toMatchObject({ kind: 'venue', place: '大都会艺术博物馆' });
    expect(english?.tags.myRating).toBe(4);
    expect(chinese?.nameZh).toBe('唐三彩骆驼');
    expect(chinese?.museum).toBe('中国国家博物馆');
    expect(chinese?.geo).toMatchObject({ kind: 'venue', place: '中国国家博物馆' });
    expect(chinese?.tags.myRating).toBe(5);
  });

  it('无云脑补全时，不把三星堆馆名误判为三星评分', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: '在三星堆看了青铜神树' });

    expect(draft?.nameZh).toBe('青铜神树');
    expect(draft?.museum).toBe('三星堆博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '三星堆博物馆' });
    expect(draft?.tags.myRating).toBe(0);
  });

  it('无云脑补全时，英文时代词也能锚定年代和文明', async () => {
    const draft = await runExhibitionAgent({ kind: 'text', text: 'at Louvre saw Hellenistic period marble sculpture, 5 stars' });

    expect(draft?.museum).toBe('卢浮宫');
    expect(draft?.tags.dynastyKey).toBe('greece-hellenistic');
    expect(draft?.tags.dynastyLabel).toBe('希腊化时代');
    expect(draft?.eraStart).toBe(-323);
    expect(draft?.tags.culture).toBe('古希腊');
  });

  it('手填展馆别名会规范化，主键与文本路径保持一致', async () => {
    const draft = await runExhibitionAgent({
      kind: 'manual',
      manual: { nameZh: '唐三彩骆驼', museum: '国博', rating: 4 },
    });

    expect(draft?.museum).toBe('中国国家博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '中国国家博物馆' });
    expect(draft?.id).toBe(artifactKey('唐三彩骆驼', '中国国家博物馆'));
    expect(draft?.reason).toContain('展馆别名规范化');
  });

  it('手填评分异常值会规整为 0-5 整数星级', async () => {
    const high = await runExhibitionAgent({
      kind: 'manual',
      manual: { nameZh: '唐三彩骆驼', museum: '国博', rating: 7.8 },
    });
    const low = await runExhibitionAgent({
      kind: 'manual',
      manual: { nameZh: '青铜鼎', museum: '上博', rating: -1.2 },
    });

    expect(high?.tags.myRating).toBe(5);
    expect(low?.tags.myRating).toBe(0);
  });

  it('云脑返回本地种子展馆时，会修正未知展馆写法并刷新主键', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      text: JSON.stringify({
        museum: '国博',
        material: ['陶'],
        category: '陶器',
      }),
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

    const draft = await runExhibitionAgent({
      kind: 'manual',
      manual: { nameZh: '唐三彩骆驼', museum: 'China National Museum', rating: 4 },
    });

    expect(draft?.museum).toBe('中国国家博物馆');
    expect(draft?.geo).toMatchObject({ kind: 'venue', place: '中国国家博物馆' });
    expect(draft?.id).toBe(artifactKey('唐三彩骆驼', '中国国家博物馆'));
    expect(draft?.reason).toContain('云脑展馆别名规范化');
  });

  it('历史评分纠错异常值会在读回时规整为 0-5 整数星级', async () => {
    const key = artifactKey('Rosetta Stone', '大英博物馆');
    const storage = new Map<string, string>([[
      'pe.exhibitionPrefs.v1',
      JSON.stringify({ placeFix: {}, ratingFix: { [key]: 7.8 } }),
    ]]);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((k: string) => storage.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => storage.set(k, v)),
      removeItem: vi.fn((k: string) => storage.delete(k)),
      clear: vi.fn(() => storage.clear()),
    });

    const draft = await runExhibitionAgent({ kind: 'text', text: 'saw Rosetta Stone at British Museum, 2 stars' });

    expect(draft?.tags.myRating).toBe(5);
    expect(draft?.reason).toContain('应用你定的评分');
  });
});
