import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enrichArtifact } from './tagging';

const mocks = vi.hoisted(() => ({
  enrichJSON: vi.fn(),
}));

vi.mock('../skills/enrichEntity', () => ({
  enrichJSON: mocks.enrichJSON,
}));

describe('enrichArtifact · Qwen 结构化字段归一化', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('将 Qwen 常见器类同义词归一到受控词表', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'greece-hellenistic',
      material: ['大理石'],
      category: '雕塑',
      culture: '古希腊',
      findspot: '萨莫色雷斯岛',
      dimensions: '高约 244 厘米',
      museum: '卢浮宫',
    });

    const result = await enrichArtifact('萨莫色雷斯胜利女神像', 'Winged Victory of Samothrace');

    expect(result.ok).toBe(true);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.museum).toBe('卢浮宫');
  });

  it('从 Qwen 返回的器类短语里提取受控器类', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'Hellenistic period',
      material: ['white marble'],
      category: 'marble sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'white marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.material).toEqual(['大理石']);
  });

  it('接收 Qwen 数组分类字段并挑出可归一的器类', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      period: 'Hellenistic period',
      materials: 'white marble',
      classification: ['collection metadata', 'marble sculpture'],
      civilization: 'Ancient Greece',
      currentLocation: 'Louvre',
      confidenceScore: '89%',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'vision classification array');

    expect(result.ok).toBe(true);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.89);
  });

  it('归一 Qwen 常见英文器类到受控词表补位', async () => {
    const cases: Array<[string, string]> = [
      ['ceramics', '陶器'],
      ['ceramic ware', '陶器'],
      ['porcelain', '瓷器'],
      ['porcelain bowl', '瓷器'],
      ['jade', '玉器'],
      ['jade ware', '玉器'],
      ['lacquerware', '漆木器'],
      ['goldwork', '金银器'],
      ['silverware', '金银器'],
      ['bronze ritual vessel', '青铜器'],
      ['oracle bone inscription', '甲骨'],
      ['illuminated manuscript', '书画'],
      ['folding screen', '书画'],
      ['archival document', '书画'],
    ];
    for (const [category, expected] of cases) {
      mocks.enrichJSON.mockResolvedValueOnce({
        nameZh: '测试展品',
        category,
        culture: 'Ancient China',
      });

      const result = await enrichArtifact('测试展品', category);

      expect(result.ok).toBe(true);
      expect(result.raw.category).toBe(expected);
    }
  });

  it('将 Qwen 常见英文材质归一成中文展品卡字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'greece-hellenistic',
      material: ['marble', 'bronze', 'gold leaf'],
      category: 'statue',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.material).toEqual(['大理石', '青铜', '金箔']);
    expect(result.raw.category).toBe('造像');
  });

  it('归一 Qwen 常见石材、珐琅和镀金青铜材质', async () => {
    const payload = {
      nameZh: '埃及神像',
      category: 'sculpture',
      culture: 'Ancient Egypt',
      museum: 'British Museum',
    };
    mocks.enrichJSON
      .mockResolvedValueOnce({
        ...payload,
        material: 'red granite; diorite; enamel',
      })
      .mockResolvedValueOnce({
        ...payload,
        material: 'gilded bronze',
      });

    const stone = await enrichArtifact('Egyptian statue', 'red granite and diorite with enamel inlay');
    const gilt = await enrichArtifact('Gilded bronze figure', 'gilded bronze figure');

    expect(stone.ok).toBe(true);
    expect(stone.raw.material).toEqual(['花岗岩', '闪长岩', '珐琅']);
    expect(stone.raw.category).toBe('造像');
    expect(stone.raw.culture).toBe('古埃及');
    expect(gilt.raw.material).toEqual(['鎏金青铜']);
  });

  it('归一 Qwen 常见有机和镶嵌材质', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '贝母镶嵌盒',
      category: 'decorative object',
      culture: 'Ancient China',
      material: 'nacre; mother-of-pearl; shell; horn',
      museum: 'Shanghai Museum',
    });

    const result = await enrichArtifact('Inlaid box', 'nacre mother-of-pearl shell and horn inlay');

    expect(result.ok).toBe(true);
    expect(result.raw.material).toEqual(['贝母', '贝壳', '角']);
    expect(result.raw.culture).toBe('华夏');
  });

  it('归一 Qwen 常见武备和民族志材质，避免英文原词进入草稿卡', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '仪式短剑',
      category: 'sword',
      culture: 'Ancient China',
      material: 'brass; steel; leather',
      museum: 'British Museum',
    });

    const result = await enrichArtifact('Ceremonial dagger', 'brass steel leather weapon label');

    expect(result.ok).toBe(true);
    expect(result.raw.material).toEqual(['黄铜', '钢', '皮革']);
    expect(result.raw.category).toBe('兵器');
    expect(result.raw.culture).toBe('华夏');
  });

  it('归一 Qwen 常见宝石和半透明材质', async () => {
    mocks.enrichJSON
      .mockResolvedValueOnce({
        nameZh: '琥珀串饰',
        category: 'jewelry',
        culture: 'Ancient China',
        material: 'amber; lapis lazuli; turquoise',
        museum: 'Shanghai Museum',
      })
      .mockResolvedValueOnce({
        nameZh: '玛瑙珠',
        category: 'jewelry',
        culture: 'Ancient China',
        material: 'agate; carnelian',
        museum: 'Shanghai Museum',
      })
      .mockResolvedValueOnce({
        nameZh: '水晶玉髓珠',
        category: 'jewelry',
        culture: 'Ancient China',
        material: 'rock crystal; quartz; chalcedony',
        museum: 'Shanghai Museum',
      });

    const bead = await enrichArtifact('Amber beads', 'amber, lapis lazuli and turquoise beads');
    const agate = await enrichArtifact('Agate bead', 'agate and carnelian bead');
    const crystal = await enrichArtifact('Rock crystal bead', 'rock crystal quartz chalcedony bead');

    expect(bead.ok).toBe(true);
    expect(bead.raw.material).toEqual(['琥珀', '青金石', '绿松石']);
    expect(agate.raw.material).toEqual(['玛瑙', '红玉髓']);
    expect(crystal.raw.material).toEqual(['水晶', '石英', '玉髓']);
  });

  it('从 Qwen 只在器类中给出的玻璃器形补出透明材质', async () => {
    mocks.enrichJSON
      .mockResolvedValueOnce({
        nameZh: '罗马玻璃瓶',
        category: 'glass vessel',
        culture: 'Ancient Rome',
        museum: 'The Metropolitan Museum of Art',
      })
      .mockResolvedValueOnce({
        nameZh: '彩绘玻璃窗',
        category: 'stained glass window',
        culture: 'Medieval Europe',
        museum: 'The Metropolitan Museum of Art',
      })
      .mockResolvedValueOnce({
        nameZh: '伊斯兰玻璃器',
        category: 'glassware',
        culture: 'Persian',
        museum: 'Museum of Islamic Art',
      });

    const vessel = await enrichArtifact('Roman glass vessel', 'glass vessel label');
    const window = await enrichArtifact('Stained glass window', 'stained glass label');
    const glassware = await enrichArtifact('Islamic glassware', 'glassware label');

    expect(vessel.ok).toBe(true);
    expect(vessel.raw.category).toBe('容器');
    expect(vessel.raw.material).toEqual(['玻璃']);
    expect(vessel.raw.culture).toBe('古罗马');
    expect(window.raw.category).toBe('书画');
    expect(window.raw.material).toEqual(['彩绘玻璃']);
    expect(glassware.raw.category).toBe('容器');
    expect(glassware.raw.material).toEqual(['玻璃']);
  });

  it('从 Qwen 只在器类中给出的琥珀包裹体补出半透明材质', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '琥珀含虫标本',
      category: 'amber inclusion',
      culture: 'Natural history',
      museum: 'Natural History Museum',
    });

    const result = await enrichArtifact('Amber inclusion', 'amber inclusion with insect label');

    expect(result.ok).toBe(true);
    expect(result.raw.category).toBe('标本');
    expect(result.raw.material).toEqual(['琥珀']);
  });

  it('从 Qwen 英文材质短语里提取核心中文材质', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'Hellenistic period',
      material: ['white marble', 'Parian marble', 'cast bronze'],
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'white marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.material).toEqual(['大理石', '青铜']);
    expect(result.raw.category).toBe('造像');
  });

  it('归一 Qwen 常见摄影和绘画媒介材质，避免英文原词进入展品卡', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '展墙照片与彩绘残片',
      dynastyKey: 'Hellenistic period',
      material: 'gelatin silver print; painted plaster; faience',
      category: 'painting',
      culture: 'Ancient Greece',
      museum: 'Louvre',
    });

    const result = await enrichArtifact('展墙照片与彩绘残片', 'gelatin silver print and painted plaster label');

    expect(result.ok).toBe(true);
    expect(result.raw.material).toEqual(['明胶银盐照片', '石膏', '彩釉陶']);
    expect(result.raw.category).toBe('书画');
  });

  it('归一 Qwen 展签里常见的水墨纸本媒介短语', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '山水图',
      dynastyKey: 'ming',
      material: 'ink and color on paper',
      category: 'painting',
      culture: 'China',
      museum: 'Shanghai Museum',
    });

    const result = await enrichArtifact('山水图', 'ink and color on paper');

    expect(result.ok).toBe(true);
    expect(result.raw.material).toEqual(['墨', '纸']);
    expect(result.raw.category).toBe('书画');
    expect(result.raw.culture).toBe('华夏');
  });

  it('归一 Qwen 常见文献和织物材质，避免英文原词进入草稿卡', async () => {
    mocks.enrichJSON
      .mockResolvedValueOnce({
        nameZh: '中世纪手抄本页',
        material: 'vellum; papyrus; bamboo slips',
        category: 'manuscript',
        culture: 'Ancient China',
        museum: 'British Museum',
      })
      .mockResolvedValueOnce({
        nameZh: '织物残片',
        material: 'linen; cotton; wool',
        category: 'textile',
        culture: 'Ancient Egypt',
        museum: 'British Museum',
      });

    const manuscript = await enrichArtifact('Manuscript leaf', 'vellum papyrus bamboo slips');
    const textile = await enrichArtifact('Textile fragment', 'linen cotton wool');

    expect(manuscript.ok).toBe(true);
    expect(manuscript.raw.material).toEqual(['羊皮纸', '莎草纸', '竹简']);
    expect(manuscript.raw.category).toBe('书画');
    expect(textile.raw.material).toEqual(['亚麻', '棉', '羊毛']);
    expect(textile.raw.category).toBe('织绣');
    expect(textile.raw.culture).toBe('古埃及');
  });

  it('从 Qwen 莎草纸卷轴器类补出平面文献材质', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '亡灵书残片',
      category: 'papyrus scroll',
      culture: 'Ancient Egypt',
      museum: 'British Museum',
      confidence: '86%',
    });

    const result = await enrichArtifact('Book of the Dead fragment', 'papyrus scroll fragment label');

    expect(result.ok).toBe(true);
    expect(result.raw.category).toBe('书画');
    expect(result.raw.material).toEqual(['莎草纸']);
    expect(result.raw.culture).toBe('古埃及');
    expect(result.raw.confidence).toBeCloseTo(0.86);
  });

  it('归一 Qwen 自然史标本材质，保留采集引导可用字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '自然史标本组合',
      material: 'herbarium sheet; formalin-preserved specimen; skull specimen',
      category: 'natural history specimen',
      culture: 'Natural history',
      museum: 'Natural History Museum',
    });

    const result = await enrichArtifact('Natural history specimens', 'herbarium sheet formalin-preserved specimen skull specimen');

    expect(result.ok).toBe(true);
    expect(result.raw.material).toEqual(['干制植物', '液浸标本', '骨骼']);
    expect(result.raw.category).toBe('标本');
    expect(result.raw.museum).toBe('Natural History Museum');
  });

  it('从 Qwen 液浸标本器类补出透明材质，保留采集引导可用字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '鱼类液浸标本',
      category: 'wet specimen jar',
      culture: 'Natural history',
      museum: 'Natural History Museum',
    });

    const result = await enrichArtifact('Wet specimen jar', 'wet specimen jar fish preserved in formalin');

    expect(result.ok).toBe(true);
    expect(result.raw.category).toBe('标本');
    expect(result.raw.material).toEqual(['液浸标本']);
    expect(result.raw.museum).toBe('Natural History Museum');
  });

  it('从 Qwen 泥板类器类补出陶材质，保留草稿卡可审计字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '楔形文字泥板',
      category: 'cuneiform tablet',
      culture: 'Mesopotamian',
      museum: 'British Museum',
      confidence: '88%',
    });

    const result = await enrichArtifact('Cuneiform tablet', 'clay cuneiform tablet label');

    expect(result.ok).toBe(true);
    expect(result.raw.category).toBe('陶器');
    expect(result.raw.material).toEqual(['陶']);
    expect(result.raw.culture).toBe('两河');
    expect(result.raw.confidence).toBeCloseTo(0.88);
  });

  it('兼容 Qwen 纯文本结构化字段的短横线和长破折号分隔', async () => {
    mocks.enrichJSON.mockResolvedValueOnce(`
      Object title - Winged Victory of Samothrace
      Period display – Hellenistic period
      Materials display — marble
      Object classification - sculpture
      Repository location – Louvre
      Confidence - 91%
    `);

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Louvre label');

    expect(result.ok).toBe(true);
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBeCloseTo(0.91);
  });

  it('Qwen 返回重复英文材质时先去重再保留前三个核心材质', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'Hellenistic period',
      material: 'white marble; Parian marble; bronze; limestone',
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'marble statue on limestone ship base');

    expect(result.ok).toBe(true);
    expect(result.raw.material).toEqual(['大理石', '青铜', '石灰石']);
  });

  it('拆分 Qwen 压成字符串的多材质列表', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'Hellenistic period',
      material: 'marble; limestone; bronze',
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'marble statue with limestone and bronze');

    expect(result.ok).toBe(true);
    expect(result.raw.material).toEqual(['大理石', '石灰石', '青铜']);
  });

  it('将 Qwen 常见英文文明归一成中文时间线泳道字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: '',
      material: ['marble'],
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
  });

  it('将 Qwen 返回的时代名归一到朝代枚举键', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'Hellenistic period',
      material: ['marble'],
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.culture).toBe('古希腊');
  });

  it('接收 Qwen 同义字段名返回的结构化补全', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      aliases: [],
      alternativeNames: 'Nike of Samothrace / Victoire de Samothrace',
      dynastyKey: '',
      period: 'Hellenistic period',
      material: '',
      materials: 'white marble; gold leaf',
      category: '',
      objectType: 'marble sculpture',
      culture: 'Ancient Greece',
      placeOfOrigin: 'Samothrace',
      dimensions: '',
      dimension: '244 cm',
      museum: '',
      institution: 'Louvre',
      confidence: '',
      confidenceScore: '87%',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.aliases).toEqual(['Nike of Samothrace', 'Victoire de Samothrace']);
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石', '金箔']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.87);
  });

  it('接收 Qwen snake_case 字段名返回的结构化补全', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      name_zh: '萨莫色雷斯胜利女神像',
      english_name: 'Winged Victory of Samothrace',
      alternative_names: 'Nike of Samothrace / Victoire de Samothrace',
      time_period: 'Hellenistic period',
      materials: 'white marble; bronze',
      object_type: 'marble sculpture',
      civilization: 'Ancient Greece',
      place_of_origin: 'Samothrace',
      dimension: '244 cm',
      museum_name: 'Louvre',
      confidence_score: 'confidence: 0.91',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.aliases).toEqual(['Nike of Samothrace', 'Victoire de Samothrace']);
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石', '青铜']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.91);
  });

  it('接收 Qwen 博物馆元数据常见字段名返回的材质和馆藏地', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      period: 'Hellenistic period',
      materialsAndTechniques: 'Parian marble; bronze',
      objectType: 'winged sculpture',
      culturalContext: 'Ancient Greek',
      placeOfOrigin: 'Samothrace',
      dimensions: '244 cm',
      currentLocation: 'Louvre',
      confidenceScore: '86%',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'museum metadata fields');

    expect(result.ok).toBe(true);
    expect(result.raw.material).toEqual(['大理石', '青铜']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.86);
  });

  it('接收 Qwen 对象化字段里的材质、器类、展馆和置信度', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      period: { label: 'Hellenistic period' },
      materials: [{ name: 'Parian marble' }, { value: 'bronze' }],
      classification: [{ label: 'collection metadata' }, { label: 'marble sculpture' }],
      civilization: { text: 'Ancient Greek' },
      placeOfOrigin: { displayName: 'Samothrace' },
      dimensions: { value: 'Dimensions: 244 cm high' },
      currentLocation: { label: 'Louvre' },
      confidenceScore: { value: '89%' },
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'object shaped Qwen fields');

    expect(result.ok).toBe(true);
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石', '青铜']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm high');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.89);
  });

  it('接收 Qwen 对象化置信度里的数值 value 字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      period: 'Hellenistic period',
      materials: 'Parian marble',
      objectType: 'marble sculpture',
      civilization: 'Ancient Greek',
      currentLocation: 'Louvre',
      confidenceScore: { value: 0.93 },
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'numeric confidence object');

    expect(result.ok).toBe(true);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.93);
  });

  it('接收 Qwen 对象化置信度里的十分制 max 字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      period: 'Hellenistic period',
      materials: 'Parian marble',
      objectType: 'marble sculpture',
      civilization: 'Ancient Greek',
      currentLocation: 'Louvre',
      confidenceScore: { value: 8.7, max: 10 },
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'numeric confidence object with max');

    expect(result.ok).toBe(true);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBeCloseTo(0.87);
  });

  it('接收 Qwen 置信度别名字段里的数值和对象包装', async () => {
    const payload = {
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      period: 'Hellenistic period',
      materials: 'Parian marble',
      objectType: 'marble sculpture',
      civilization: 'Ancient Greek',
      currentLocation: 'Louvre',
    };
    mocks.enrichJSON
      .mockResolvedValueOnce({ ...payload, confidence_value: '92%' })
      .mockResolvedValueOnce({
        ...payload,
        metadata: {
          normalizedConfidence: { value: 8.8, max: 10 },
        },
      });

    const snakeCase = await enrichArtifact('Winged Victory of Samothrace', 'Qwen confidence_value field');
    const nestedObject = await enrichArtifact('Winged Victory of Samothrace', 'Qwen normalizedConfidence field');

    expect(snakeCase.ok).toBe(true);
    expect(snakeCase.raw.confidence).toBe(0.92);
    expect(nestedObject.ok).toBe(true);
    expect(nestedObject.raw.confidence).toBeCloseTo(0.88);
  });

  it('接收 Qwen 数组包装里的时代、文明、展馆和置信度', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      period: [{ label: 'Unknown' }, { label: 'Hellenistic period' }],
      materials: 'Parian marble',
      objectType: 'sculpture',
      civilization: [{ label: 'Unknown' }, { label: 'Ancient Greek' }],
      placeOfOrigin: [{ displayName: 'Samothrace' }],
      dimensions: [{ value: 'Dimensions: 244 cm high' }],
      currentLocation: [{ label: 'Louvre' }],
      confidenceScore: [{ value: '91%' }],
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen array wrapped metadata');

    expect(result.ok).toBe(true);
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm high');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.91);
  });

  it('保留 Qwen metadata 嵌套对象里的结构化置信度', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      period: 'Hellenistic period',
      materials: 'Parian marble',
      objectType: 'marble sculpture',
      civilization: 'Ancient Greek',
      repository: 'Louvre',
      metadata: {
        confidence: { score: '8.4/10' },
      },
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen metadata confidence wrapper');

    expect(result.ok).toBe(true);
    expect(result.raw.confidence).toBeCloseTo(0.84);
  });

  it('接收 Qwen 馆藏元数据复数字段和 display 字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      objectTitle: 'Winged Victory of Samothrace',
      periods: [{ displayName: 'Hellenistic period' }],
      materialsDisplay: 'Parian marble; limestone',
      objectClassification: { label: 'marble sculpture' },
      cultures: [{ label: 'Ancient Greek' }],
      placesOfOrigin: [{ label: 'Samothrace' }],
      repositoryLocation: { label: 'Louvre' },
      confidenceScore: 'confidence 90%',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'museum plural metadata');

    expect(result.ok).toBe(true);
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石', '石灰石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.9);
  });

  it('接收 Qwen 无空格斜杠别名和馆藏测量字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      alternativeNames: 'Nike of Samothrace/Victoire de Samothrace',
      period: 'Hellenistic period',
      materials: 'Parian marble',
      objectType: 'sculpture',
      culturalContext: 'Ancient Greek',
      placeOfOrigin: 'Samothrace',
      objectMeasurements: 'Measurements: 244 cm high',
      currentRepository: 'Louvre',
      confidenceScore: '88%',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen museum metadata fields');

    expect(result.ok).toBe(true);
    expect(result.raw.aliases).toEqual(['Nike of Samothrace', 'Victoire de Samothrace']);
    expect(result.raw.dimensions).toBe('244 cm high');
    expect(result.raw.museum).toBe('Louvre');
  });

  it('接收 Qwen 对象数组里的别名字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      aliases: [
        { label: 'Nike of Samothrace' },
        { value: 'Victoire de Samothrace' },
        { text: 'Nike of Samothrace' },
        { name: 'Unknown' },
      ],
      period: 'Hellenistic period',
      materials: 'Parian marble',
      objectType: 'sculpture',
      culturalContext: 'Ancient Greek',
      placeOfOrigin: 'Samothrace',
      dimensions: '244 cm high',
      currentRepository: 'Louvre',
      confidenceScore: '88%',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen object aliases');

    expect(result.ok).toBe(true);
    expect(result.raw.aliases).toEqual(['Nike of Samothrace', 'Victoire de Samothrace']);
  });

  it('接收 Qwen 博物馆日期字段名返回的时间线锚点', async () => {
    mocks.enrichJSON
      .mockResolvedValueOnce({
        titleZh: '萨莫色雷斯胜利女神像',
        englishName: 'Winged Victory of Samothrace',
        objectDate: 'Hellenistic period, c. 190 BCE',
        materials: 'Parian marble',
        objectType: 'sculpture',
        repository: 'Louvre',
      })
      .mockResolvedValueOnce({
        titleZh: '萨莫色雷斯胜利女神像',
        englishName: 'Winged Victory of Samothrace',
        dateCreated: 'Hellenistic period',
        materials: 'Parian marble',
        objectType: 'sculpture',
        repository: 'Louvre',
      })
      .mockResolvedValueOnce({
        titleZh: '萨莫色雷斯胜利女神像',
        englishName: 'Winged Victory of Samothrace',
        creationPeriod: 'Hellenistic period',
        materials: 'Parian marble',
        objectType: 'sculpture',
        repository: 'Louvre',
      });

    const objectDate = await enrichArtifact('Winged Victory of Samothrace', 'museum objectDate metadata');
    const dateCreated = await enrichArtifact('Winged Victory of Samothrace', 'museum dateCreated metadata');
    const creationPeriod = await enrichArtifact('Winged Victory of Samothrace', 'museum creationPeriod metadata');

    expect(objectDate.raw.dynastyKey).toBe('greece-hellenistic');
    expect(dateCreated.raw.dynastyKey).toBe('greece-hellenistic');
    expect(creationPeriod.raw.dynastyKey).toBe('greece-hellenistic');
  });

  it('接收 Qwen 生产时期和藏馆名称字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      titleZh: '萨莫色雷斯胜利女神像',
      englishName: 'Winged Victory of Samothrace',
      productionPeriod: 'Hellenistic period',
      materials: 'Parian marble',
      objectType: 'sculpture',
      repositoryName: 'Louvre',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'museum production metadata');

    expect(result.ok).toBe(true);
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.museum).toBe('Louvre');
  });

  it('接收 Qwen 通用标题字段返回的中英文展品名', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      title: '萨莫色雷斯胜利女神像',
      objectName: 'Winged Victory of Samothrace',
      period: 'Hellenistic period',
      materials: 'marble',
      objectType: 'sculpture',
      civilization: 'Ancient Greece',
      repository: 'Louvre',
      confidence: 'confidence: 0.9',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.9);
  });

  it('解包 Qwen 返回的嵌套展品对象', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      artifact: {
        titleZh: '萨莫色雷斯胜利女神像',
        englishName: 'Winged Victory of Samothrace',
        period: 'Hellenistic period',
        materials: 'white marble; bronze',
        objectType: 'marble sculpture',
        civilization: 'Ancient Greece',
        placeOfOrigin: 'Samothrace',
        dimension: '244 cm',
        repository: 'Louvre',
      },
      confidenceScore: '88%',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石', '青铜']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.88);
  });

  it('解包 Qwen 返回的顶层展品数组', async () => {
    mocks.enrichJSON.mockResolvedValueOnce([
      {
        titleZh: '萨莫色雷斯胜利女神像',
        englishName: 'Winged Victory of Samothrace',
        period: 'Hellenistic period',
        materials: 'white marble',
        objectType: 'marble sculpture',
        civilization: 'Ancient Greece',
        placeOfOrigin: 'Samothrace',
        dimension: '244 cm',
        repository: 'Louvre',
      },
    ]);

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
  });

  it('递归解包 Qwen 返回的深层数组展品对象', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      data: {
        confidence_score: '93%',
        results: [
          {
            artifact: {
              chineseName: '萨莫色雷斯胜利女神像',
              englishName: 'Winged Victory of Samothrace',
              period: 'Hellenistic period',
              materials: 'white marble',
              classification: 'sculpture',
              civilization: 'Ancient Greece',
              placeOfOrigin: 'Samothrace',
              size: '244 cm',
              institution: 'Louvre',
            },
          },
        ],
      },
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.93);
  });

  it('解包 Qwen message.content 里的 JSON 字符串补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              artifact: {
                chineseName: '萨莫色雷斯胜利女神像',
                englishName: 'Winged Victory of Samothrace',
                period: 'Hellenistic period',
                materials: 'white marble',
                classification: 'sculpture',
                civilization: 'Ancient Greece',
                placeOfOrigin: 'Samothrace',
                size: '244 cm',
                institution: 'Louvre',
                confidence_score: '92%',
              },
            }),
          },
        },
      ],
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.92);
  });

  it('解包 Qwen message.content 说明文字里的 JSON 补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: [
              '识别结果如下，请用户确认：',
              JSON.stringify({
                artifact: {
                  chineseName: '萨莫色雷斯胜利女神像',
                  englishName: 'Winged Victory of Samothrace',
                  period: 'Hellenistic period',
                  materials: 'white marble',
                  classification: 'sculpture',
                  civilization: 'Ancient Greece',
                  placeOfOrigin: 'Samothrace',
                  size: '244 cm',
                  institution: 'Louvre',
                  confidence_score: '90%',
                },
              }),
              '以上字段来自展签和视觉识别。',
            ].join('\n'),
          },
        },
      ],
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.9);
  });

  it('解包 Qwen message.content 数组里的 text block 补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  artifact: {
                    chineseName: '萨莫色雷斯胜利女神像',
                    englishName: 'Winged Victory of Samothrace',
                    period: 'Hellenistic period',
                    materials: 'white marble',
                    classification: 'sculpture',
                    civilization: 'Ancient Greece',
                    placeOfOrigin: 'Samothrace',
                    size: '244 cm',
                    institution: 'Louvre',
                    confidence_score: '91%',
                  },
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.91);
  });

  it('解包 Qwen message.content 数组里的 markdown 补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: [
              {
                type: 'markdown',
                markdown: [
                  '展签识别结果：',
                  '- Object title: Winged Victory of Samothrace',
                  '- Period display: Hellenistic period',
                  '- Materials display: marble',
                  '- Object classification: sculpture',
                  '- Repository location: Louvre',
                  '- Confidence: 89%',
                ].join('\n'),
              },
            ],
          },
        },
      ],
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen markdown content block');

    expect(result.ok).toBe(true);
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.89);
  });

  it('解包 Qwen output_text 内容块的 content 字段补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: [
              {
                type: 'output_text',
                content: [
                  'Object title: Winged Victory of Samothrace',
                  'Period display: Hellenistic period',
                  'Materials display: white marble',
                  'Object classification: sculpture',
                  'Civilization: Ancient Greece',
                  'Place of origin: Samothrace',
                  'Size: 244 cm',
                  'Repository location: Louvre',
                  'Confidence: 92%',
                ].join('\n'),
              },
            ],
          },
        },
      ],
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen output_text content field');

    expect(result.ok).toBe(true);
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.92);
  });

  it('解包 Qwen message.content 数组里的 output_json 和 json_object 补全块', async () => {
    mocks.enrichJSON
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: [
                {
                  type: 'output_json',
                  json: {
                    artifact: {
                      chineseName: '萨莫色雷斯胜利女神像',
                      englishName: 'Winged Victory of Samothrace',
                      period: 'Hellenistic period',
                      materials: 'white marble',
                      classification: 'sculpture',
                      civilization: 'Ancient Greece',
                      placeOfOrigin: 'Samothrace',
                      size: '244 cm',
                      institution: 'Louvre',
                      confidence_score: '94%',
                    },
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: [
                {
                  type: 'json_object',
                  parsed: {
                    artifact: {
                      chineseName: '萨莫色雷斯胜利女神像',
                      englishName: 'Winged Victory of Samothrace',
                      period: 'Hellenistic period',
                      materials: 'Parian marble',
                      objectType: 'marble sculpture',
                      civilization: 'Ancient Greece',
                      currentLocation: 'Louvre',
                      confidence_score: '93%',
                    },
                  },
                },
              ],
            },
          },
        ],
      });

    const outputJson = await enrichArtifact('Winged Victory of Samothrace', 'Qwen output_json content block');
    const jsonObject = await enrichArtifact('Winged Victory of Samothrace', 'Qwen json_object content block');

    expect(outputJson.ok).toBe(true);
    expect(outputJson.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(outputJson.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(outputJson.raw.dynastyKey).toBe('greece-hellenistic');
    expect(outputJson.raw.material).toEqual(['大理石']);
    expect(outputJson.raw.category).toBe('造像');
    expect(outputJson.raw.culture).toBe('古希腊');
    expect(outputJson.raw.findspot).toBe('Samothrace');
    expect(outputJson.raw.dimensions).toBe('244 cm');
    expect(outputJson.raw.museum).toBe('Louvre');
    expect(outputJson.raw.confidence).toBe(0.94);
    expect(jsonObject.raw.material).toEqual(['大理石']);
    expect(jsonObject.raw.category).toBe('造像');
    expect(jsonObject.raw.museum).toBe('Louvre');
    expect(jsonObject.raw.confidence).toBe(0.93);
  });

  it('合并 Qwen choices 数组中拆开的结构化字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: {
              type: 'text',
              text: JSON.stringify({
                artifact: {
                  chineseName: '萨莫色雷斯胜利女神像',
                  englishName: 'Winged Victory of Samothrace',
                  materials: 'white marble',
                },
              }),
            },
          },
        },
        {
          message: {
            content: {
              type: 'text',
              text: JSON.stringify({
                artifact: {
                  period: 'Hellenistic period',
                  classification: 'sculpture',
                  civilization: 'Ancient Greece',
                  institution: 'Louvre',
                  confidence_score: '92%',
                },
              }),
            },
          },
        },
      ],
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen split choices');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.92);
  });

  it('合并 Qwen message.content 和 tool_calls 拆开的结构化字段', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: {
              type: 'text',
              text: JSON.stringify({
                artifact: {
                  chineseName: '萨莫色雷斯胜利女神像',
                  englishName: 'Winged Victory of Samothrace',
                  materials: 'white marble',
                },
              }),
            },
            tool_calls: [
              {
                function: {
                  arguments: JSON.stringify({
                    period: 'Hellenistic period',
                    classification: 'sculpture',
                    civilization: 'Ancient Greece',
                    repository: 'Louvre',
                    confidence_score: '92%',
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen message split content and tools');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.92);
  });

  it('解包 Qwen output_text 里的 JSON 字符串补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: JSON.stringify({
        artifact: {
          chineseName: '萨莫色雷斯胜利女神像',
          englishName: 'Winged Victory of Samothrace',
          period: 'Hellenistic period',
          materials: 'white marble',
          classification: 'sculpture',
          civilization: 'Ancient Greece',
          placeOfOrigin: 'Samothrace',
          size: '244 cm',
          institution: 'Louvre',
          confidence_score: '95%',
        },
      }),
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.95);
  });

  it('解析 Qwen output_text 里的纯文本键值行补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: [
        'Object: Winged Victory of Samothrace',
        'Chinese name: 萨莫色雷斯胜利女神像',
        'Period: Hellenistic period, c. 190 BCE',
        'Materials: Parian marble; bronze',
        'Classification: marble sculpture',
        'Culture: Ancient Greek',
        'Findspot: Samothrace',
        'Dimensions: 244 cm high',
        'Repository: Louvre',
        'Confidence: 91%',
      ].join('\n'),
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'plain text Qwen output');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石', '青铜']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm high');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.91);
  });

  it('解析 Qwen 纯文本里的等号键值字段补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: [
        'Object title = Winged Victory of Samothrace',
        'Chinese name = 萨莫色雷斯胜利女神像',
        'Period display = Hellenistic period, c. 190 BCE',
        'Materials display = white marble',
        'Object classification = sculpture',
        'Cultural context = Ancient Greek',
        'Repository location = Louvre',
        'Confidence score = 92%',
      ].join('\n'),
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen equals text fields');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.92);
  });

  it('解析 Qwen 纯文本里字段名另起一行的补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: [
        '中文名：',
        '萨莫色雷斯胜利女神像',
        '英文名：',
        'Winged Victory of Samothrace',
        '年代：',
        '希腊化时代',
        '材质：',
        '大理石',
        '器类：',
        '雕塑',
        '文明：',
        '古希腊',
        '展馆：',
        '卢浮宫',
        '置信度：',
        '93%',
      ].join('\n'),
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen multiline text fields');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('卢浮宫');
    expect(result.raw.confidence).toBe(0.93);
  });

  it('解析 Qwen 纯文本同一行里的分号分隔字段补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: '中文名：萨莫色雷斯胜利女神像；英文名：Winged Victory of Samothrace；年代：希腊化时代；材质：大理石；器类：雕塑；文明：古希腊；展馆：卢浮宫；置信度：94%',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen semicolon text fields');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('卢浮宫');
    expect(result.raw.confidence).toBe(0.94);
  });

  it('解析 Qwen output_markdown 里的 Markdown 字段表格补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      message: {
        content: [
          {
            type: 'output_markdown',
            markdown: [
              '| Field | Value |',
              '| --- | --- |',
              '| Chinese name | 萨莫色雷斯胜利女神像 |',
              '| English name | Winged Victory of Samothrace |',
              '| Period | Hellenistic period, c. 190 BCE |',
              '| Materials | Parian marble |',
              '| Classification | sculpture |',
              '| Culture | Ancient Greek |',
              '| Repository | Louvre |',
              '| Confidence score | 90% |',
            ].join('\n'),
          },
        ],
      },
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen markdown table');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.9);
  });

  it('解析 Qwen 纯文本里无首尾竖线的 Markdown 字段表格', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: [
        'Field | Value',
        '--- | ---',
        'Chinese name | 萨莫色雷斯胜利女神像',
        'English name | Winged Victory of Samothrace',
        'Period | Hellenistic period, c. 190 BCE',
        'Materials | Parian marble; bronze',
        'Classification | marble sculpture',
        'Culture | Ancient Greek',
        'Repository | Louvre',
        'Confidence score | 96%',
      ].join('\n'),
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen loose markdown table');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石', '青铜']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.96);
  });

  it('解析 Qwen 纯文本里的馆藏 display 字段补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      output_text: [
        'Object title: Winged Victory of Samothrace',
        'Period display: Hellenistic period, c. 190 BCE',
        'Materials display: Parian marble; limestone',
        'Object classification: marble sculpture',
        'Cultural context: Ancient Greek',
        'Place of origin: Samothrace',
        'Object dimensions: 244 cm high',
        'Repository location: Louvre',
        'Confidence score: 93%',
      ].join('\n'),
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'plain text museum display fields');

    expect(result.ok).toBe(true);
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石', '石灰石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm high');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.93);
  });

  it('解包 Qwen tool_calls.arguments 里的 JSON 字符串补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  arguments: JSON.stringify({
                    titleZh: '萨莫色雷斯胜利女神像',
                    englishName: 'Winged Victory of Samothrace',
                    period: 'Hellenistic period',
                    materials: 'white marble',
                    classification: 'sculpture',
                    civilization: 'Ancient Greece',
                    placeOfOrigin: 'Samothrace',
                    size: '244 cm',
                    repository: 'Louvre',
                    confidence_score: '94%',
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.94);
  });

  it('优先解包带函数名的 Qwen tool_calls.arguments 结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      choices: [
        {
          message: {
            tool_calls: [
              {
                type: 'function',
                function: {
                  name: 'extract_exhibition_artifact',
                  arguments: JSON.stringify({
                    titleZh: '萨莫色雷斯胜利女神像',
                    englishName: 'Winged Victory of Samothrace',
                    period: 'Hellenistic period',
                    materials: 'white marble',
                    classification: 'sculpture',
                    civilization: 'Ancient Greece',
                    placeOfOrigin: 'Samothrace',
                    size: '244 cm',
                    repository: 'Louvre',
                    confidence_score: '93%',
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'named function tool call');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.93);
  });

  it('解包 Qwen 单个 toolCall.functionCall.args 包装的结构化补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      toolCall: {
        functionCall: {
          args: JSON.stringify({
            titleZh: '萨莫色雷斯胜利女神像',
            englishName: 'Winged Victory of Samothrace',
            period: 'Hellenistic period',
            materials: 'Parian marble',
            objectClassification: 'marble sculpture',
            civilization: 'Ancient Greece',
            placeOfOrigin: 'Samothrace',
            objectDimensions: '244 cm high',
            currentRepository: 'Louvre',
            confidence: '95%',
          }),
        },
      },
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'single tool call wrapper');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.findspot).toBe('Samothrace');
    expect(result.raw.dimensions).toBe('244 cm high');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.95);
  });

  it('解包 Qwen 单个 toolCall.functionCall.parameters 包装的结构化补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      toolCall: {
        functionCall: {
          parameters: {
            chineseName: '萨莫色雷斯胜利女神像',
            englishName: 'Winged Victory of Samothrace',
            period: 'Hellenistic period',
            materials: 'Parian marble',
            classification: 'marble sculpture',
            civilization: 'Ancient Greek',
            repository: 'Louvre',
            confidence_score: '93%',
          },
        },
      },
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen functionCall parameters');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.93);
  });

  it('解包 Qwen 单个 toolCall.functionCall.params JSON 字符串包装的结构化补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      toolCall: {
        functionCall: {
          params: JSON.stringify({
            titleZh: '萨莫色雷斯胜利女神像',
            englishName: 'Winged Victory of Samothrace',
            periodDisplay: 'Hellenistic period',
            materialDisplay: 'Parian marble',
            objectType: 'sculpture',
            culturalContext: 'Ancient Greek',
            repositoryName: 'Louvre',
            confidenceScore: '92%',
          }),
        },
      },
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen functionCall params');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.92);
  });

  it('解包 Qwen candidates.content.parts.functionCall.args 包装的结构化补全结果', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: 'extract_exhibition_artifact',
                  args: {
                    chineseName: '萨莫色雷斯胜利女神像',
                    englishName: 'Winged Victory of Samothrace',
                    period: 'Hellenistic period',
                    materials: 'Parian marble',
                    classification: 'marble sculpture',
                    civilization: 'Ancient Greek',
                    repository: 'Louvre',
                    confidence_score: '91%',
                  },
                },
              },
            ],
          },
        },
      ],
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Qwen candidates parts function call');

    expect(result.ok).toBe(true);
    expect(result.raw.nameZh).toBe('萨莫色雷斯胜利女神像');
    expect(result.raw.nameEn).toBe('Winged Victory of Samothrace');
    expect(result.raw.dynastyKey).toBe('greece-hellenistic');
    expect(result.raw.material).toEqual(['大理石']);
    expect(result.raw.category).toBe('造像');
    expect(result.raw.culture).toBe('古希腊');
    expect(result.raw.museum).toBe('Louvre');
    expect(result.raw.confidence).toBe(0.91);
  });

  it('清洗 Qwen 返回的别名和结构化置信度', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      aliases: ['Nike of Samothrace', 'Winged Nike', 'Unknown', 'Nike of Samothrace', 'A very very very very very long placeholder alias'],
      dynastyKey: 'Hellenistic period',
      material: ['marble'],
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
      confidence: '87%',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.aliases).toEqual(['Nike of Samothrace', 'Winged Nike']);
    expect(result.raw.confidence).toBe(0.87);
  });

  it('接收全角百分号置信度，并丢弃越界置信度', async () => {
    const payload = {
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'Hellenistic period',
      material: ['marble'],
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
    };
    mocks.enrichJSON
      .mockResolvedValueOnce({ ...payload, confidence: '87％' })
      .mockResolvedValueOnce({ ...payload, confidence: '120%' });

    const valid = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');
    const invalid = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(valid.ok).toBe(true);
    expect(valid.raw.confidence).toBe(0.87);
    expect(invalid.ok).toBe(true);
    expect(invalid.raw.confidence).toBeNull();
  });

  it('解析 Qwen 返回的自然语言置信度字符串', async () => {
    const payload = {
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'Hellenistic period',
      material: ['marble'],
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
    };
    mocks.enrichJSON
      .mockResolvedValueOnce({ ...payload, confidence: 'confidence: 0.87' })
      .mockResolvedValueOnce({ ...payload, confidence: '87 percent' });

    const decimal = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');
    const percent = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(decimal.ok).toBe(true);
    expect(decimal.raw.confidence).toBe(0.87);
    expect(percent.ok).toBe(true);
    expect(percent.raw.confidence).toBe(0.87);
  });

  it('解析 Qwen 返回的分数式置信度字符串', async () => {
    const payload = {
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'Hellenistic period',
      material: ['marble'],
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
    };
    mocks.enrichJSON
      .mockResolvedValueOnce({ ...payload, confidence: '92/100' })
      .mockResolvedValueOnce({ ...payload, confidence: 'confidence score: 8.5/10' });

    const percentLike = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');
    const tenPoint = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(percentLike.ok).toBe(true);
    expect(percentLike.raw.confidence).toBe(0.92);
    expect(tenPoint.ok).toBe(true);
    expect(tenPoint.raw.confidence).toBe(0.85);
  });

  it('保留 Qwen 明确返回的低置信度和带说明文本的置信度', async () => {
    const payload = {
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'Hellenistic period',
      material: ['marble'],
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
    };
    mocks.enrichJSON
      .mockResolvedValueOnce({ ...payload, confidence: 0 })
      .mockResolvedValueOnce({ ...payload, confidence: '0.92 (high)' });

    const zero = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');
    const annotated = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(zero.ok).toBe(true);
    expect(zero.raw.confidence).toBe(0);
    expect(annotated.ok).toBe(true);
    expect(annotated.raw.confidence).toBe(0.92);
  });

  it('拆分 Qwen 返回的字符串别名列表', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      aliases: 'Nike of Samothrace; Winged Nike / Victoire de Samothrace，Unknown',
      dynastyKey: 'Hellenistic period',
      material: ['marble'],
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: '244 cm',
      museum: 'Louvre',
      confidence: 0.92,
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.aliases).toEqual(['Nike of Samothrace', 'Winged Nike', 'Victoire de Samothrace']);
    expect(result.raw.confidence).toBe(0.92);
  });

  it('清理 Qwen 尺寸字段里的包装字段名', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: '萨莫色雷斯胜利女神像',
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'Hellenistic period',
      material: ['marble'],
      category: 'sculpture',
      culture: 'Ancient Greece',
      findspot: 'Samothrace',
      dimensions: 'Dimensions: 244 cm high',
      museum: 'Louvre',
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'Hellenistic marble statue');

    expect(result.ok).toBe(true);
    expect(result.raw.dimensions).toBe('244 cm high');
  });

  it('忽略 Qwen 返回的占位结构化字段，避免把失败补全记为有效', async () => {
    mocks.enrichJSON.mockResolvedValueOnce({
      nameZh: 'Unknown',
      nameEn: 'N/A',
      aliases: ['Unknown'],
      dynastyKey: 'not available',
      material: ['Unknown', 'N/A'],
      category: 'Unknown',
      culture: 'Unknown',
      findspot: 'N/A',
      dimensions: 'unknown',
      museum: 'N/A',
      confidence: 0,
    });

    const result = await enrichArtifact('Winged Victory of Samothrace', 'label text');

    expect(result.ok).toBe(false);
    expect(result.raw.nameZh).toBe('');
    expect(result.raw.nameEn).toBe('');
    expect(result.raw.material).toEqual([]);
    expect(result.raw.category).toBe('');
    expect(result.raw.culture).toBe('华夏');
    expect(result.raw.findspot).toBe('');
    expect(result.raw.dimensions).toBe('');
    expect(result.raw.museum).toBe('');
    expect(result.raw.confidence).toBeNull();
  });
});
