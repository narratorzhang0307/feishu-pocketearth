import { describe, it, expect } from 'vitest';
import { selectCaptureGuide, selectCaptureGuideForArtifact, captureGuideHintFromArtifact, captureGuideBrief, ALL_GUIDES } from './captureGuide';

// 锁住 R6 绕拍引导的分类逻辑（此前只临时 node 验过一次、没留测试）。

describe('selectCaptureGuide · 关键词分类', () => {
  const cases: Array<[string, string]> = [
    ['玻璃展柜里的青铜器', 'glasscase'],
    ['青铜鼎', 'large'],
    ['编钟', 'large'],
    ['宋代帛画', 'flat'],
    ['王羲之书法卷', 'flat'],
    ['兵马俑陶俑', 'sculpture'],
    ['大理石雕像', 'sculpture'],
    ['marble statue', 'sculpture'],
    ['stone relief panel', 'sculpture'],
    ['stone stele inscription', 'sculpture'],
    ['inscription slab', 'sculpture'],
    ['碑刻墓志', 'sculpture'],
    ['汉画像石', 'sculpture'],
    ['画像砖浮雕', 'sculpture'],
    ['terracotta warrior', 'sculpture'],
    ['terracotta army figure', 'sculpture'],
    ['gold funerary mask', 'sculpture'],
    ['青铜面具', 'sculpture'],
    ['能面', 'sculpture'],
    ['seated Buddha', 'sculpture'],
    ['bodhisattva head', 'sculpture'],
    ['architectural fragment', 'sculpture'],
    ['column capital', 'sculpture'],
    ['建筑构件柱头', 'sculpture'],
    ['taxidermy mount', 'sculpture'],
    ['动物标本', 'sculpture'],
    ['oil painting on canvas', 'flat'],
    ['Pompeii fresco mural', 'flat'],
    ['gelatin silver print', 'flat'],
    ['daguerreotype portrait', 'flat'],
    ['albumen print portrait', 'flat'],
    ['cyanotype print', 'flat'],
    ['photographer contact sheet', 'flat'],
    ['35mm negative strip', 'flat'],
    ['film transparency slide', 'flat'],
    ['stereograph card', 'flat'],
    ['cabinet card portrait', 'flat'],
    ['carte-de-visite portrait', 'flat'],
    ['woven tapestry fragment', 'flat'],
    ['painted silk banner', 'flat'],
    ['hanging scroll landscape', 'flat'],
    ['papyrus scroll fragment', 'flat'],
    ['illuminated codex', 'flat'],
    ['Beethoven manuscript score', 'flat'],
    ['sheet music for piano', 'flat'],
    ['清代乐谱', 'flat'],
    ['phonograph record from an oral history collection', 'flat'],
    ['shellac 78 rpm record', 'flat'],
    ['民国黑胶唱片', 'flat'],
    ['rare book', 'flat'],
    ['manuscript binding with tooled leather cover', 'flat'],
    ['bookbinding fragment', 'flat'],
    ['古籍装帧书封', 'flat'],
    ['photograph album', 'flat'],
    ['limited edition photo book', 'flat'],
    ['photobook maquette', 'flat'],
    ['autograph scrapbook', 'flat'],
    ['民国剪贴簿相册摄影集照片书', 'flat'],
    ['bamboo slips', 'flat'],
    ['letter from Vincent van Gogh', 'flat'],
    ['archival document', 'flat'],
    ['newspaper clipping', 'flat'],
    ['wartime leaflet', 'flat'],
    ['theatre playbill', 'flat'],
    ['restaurant menu', 'flat'],
    ['museum invitation card', 'flat'],
    ['Victorian trade card', 'flat'],
    ['museum greeting card', 'flat'],
    ['Victorian holiday card', 'flat'],
    ['museum souvenir postcard', 'flat'],
    ['清代请柬', 'flat'],
    ['民国贺卡', 'flat'],
    ['民国明信片', 'flat'],
    ['1930s wall calendar', 'flat'],
    ['pocket almanac', 'flat'],
    ['民国月份牌日历', 'flat'],
    ['1950s railway ticket stub', 'flat'],
    ['wartime ration coupon', 'flat'],
    ['民国收据粮票', 'flat'],
    ['Victorian postage stamp', 'flat'],
    ['first day cover envelope', 'flat'],
    ['folding screen panel', 'flat'],
    ['embroidered silk panel', 'flat'],
    ['embroidered court robe', 'flat'],
    ['Noh theatre costume', 'flat'],
    ['kimono with cranes', 'flat'],
    ['embroidered chasuble', 'flat'],
    ['liturgical vestment', 'flat'],
    ['ecclesiastical dalmatic', 'flat'],
    ['法衣刺绣', 'flat'],
    ['祭服织锦', 'flat'],
    ['embroidered shoes', 'small'],
    ['lotus shoes', 'small'],
    ['清代绣鞋', 'small'],
    ['embroidered silk shawl', 'flat'],
    ['lace collar sampler', 'flat'],
    ['清代披肩', 'flat'],
    ['Amish quilt', 'flat'],
    ['woven reed mat', 'flat'],
    ['清代草席', 'flat'],
    ['Ottoman prayer rug', 'flat'],
    ['woven kilim fragment', 'flat'],
    ['清代地毯', 'flat'],
    ['Roman mosaic panel', 'flat'],
    ['stained glass window', 'flat'],
    ['Iznik tile panel', 'flat'],
    ['glazed ceramic tile fragment', 'flat'],
    ['唐卡织锦', 'flat'],
    ['马赛克壁饰', 'flat'],
    ['彩绘玻璃窗', 'flat'],
    ['琉璃砖壁饰', 'flat'],
    ['龙袍', 'flat'],
    ['清代服饰', 'flat'],
    ['绢本山水立轴', 'flat'],
    ['纸本册页', 'flat'],
    ['佛经写本', 'flat'],
    ['古籍善本', 'flat'],
    ['敦煌经卷', 'flat'],
    ['居延汉简牍', 'flat'],
    ['鲁迅书信手稿', 'flat'],
    ['民国报纸剪报', 'flat'],
    ['抗战宣传传单', 'flat'],
    ['museum exhibition catalogue', 'flat'],
    ['auction catalog for design objects', 'flat'],
    ['展览图录目录册', 'flat'],
    ['Victorian playing cards', 'flat'],
    ['tarot card deck', 'flat'],
    ['清代纸牌扑克牌', 'flat'],
    ['清代戏单', 'flat'],
    ['民国菜单', 'flat'],
    ['毕业证书票据', 'flat'],
    ['屏风扇面', 'flat'],
    ['shadow puppet figure', 'flat'],
    ['皮影戏人物', 'flat'],
    ['版画海报', 'flat'],
    ['photogravure portrait', 'flat'],
    ['collotype album plate', 'flat'],
    ['aquatint landscape', 'flat'],
    ['drypoint print', 'flat'],
    ['monotype proof', 'flat'],
    ['monoprint study', 'flat'],
    ['linocut poster', 'flat'],
    ['silkscreen poster', 'flat'],
    ['watercolor drawing', 'flat'],
    ['gouache study', 'flat'],
    ['pastel portrait', 'flat'],
    ['charcoal drawing', 'flat'],
    ['ink drawing', 'flat'],
    ['vinyl record sleeve', 'flat'],
    ['shellac record', 'flat'],
    ['黑胶唱片封套', 'flat'],
    ['herbarium sheet', 'flat'],
    ['herbarium specimen', 'flat'],
    ['botanical illustration', 'flat'],
    ['specimen sheet', 'flat'],
    ['entomology drawer', 'flat'],
    ['植物图谱', 'flat'],
    ['dried plant specimen', 'flat'],
    ['leaf fossil slab', 'flat'],
    ['pinned butterfly specimen tray', 'flat'],
    ['insect specimen drawer', 'flat'],
    ['植物标本', 'flat'],
    ['干制植物标本', 'flat'],
    ['昆虫标本盒', 'flat'],
    ['蝴蝶标本', 'flat'],
    ['mammal skull specimen', 'sculpture'],
    ['bird skeleton specimen', 'sculpture'],
    ['动物骨骼标本', 'sculpture'],
    ['头骨标本', 'sculpture'],
    ['dinosaur fossil tooth', 'small'],
    ['meteorite fragment', 'small'],
    ['quartz crystal cluster', 'small'],
    ['恐龙牙齿化石', 'small'],
    ['陨石碎片', 'small'],
    ['矿物标本', 'small'],
    ['贝壳标本', 'small'],
    ['碑拓拓片', 'flat'],
    ['画像石拓片', 'flat'],
    ['stone rubbing', 'flat'],
    ['bronze ritual bell', 'large'],
    ['bronze ritual vessel', 'large'],
    ['Egyptian sarcophagus', 'large'],
    ['painted wooden coffin', 'large'],
    ['mummy case', 'large'],
    ['木乃伊棺', 'large'],
    ['彩绘棺椁', 'large'],
    ['samurai armor', 'large'],
    ['suit of armour', 'large'],
    ['ceremonial helmet', 'large'],
    ['甲胄', 'large'],
    ['日本兜鍪', 'large'],
    ['Ming dynasty chair', 'large'],
    ['ceremonial throne', 'large'],
    ['lacquer cabinet', 'large'],
    ['黄花梨圈椅', 'large'],
    ['王座', 'large'],
    ['木柜', 'large'],
    ['bronze ceremonial drum', 'large'],
    ['taiko drum', 'large'],
    ['Greek lyre musical instrument', 'large'],
    ['唐代古琴', 'large'],
    ['铜鼓', 'large'],
    ['编磬', 'large'],
    ['room-sized installation', 'large'],
    ['immersive installation art', 'large'],
    ['大型装置艺术', 'large'],
    ['沉浸式装置', 'large'],
    ['architectural model', 'large'],
    ['ship model', 'large'],
    ['museum diorama', 'large'],
    ['maquette for a public plaza', 'large'],
    ['建筑模型沙盘', 'large'],
    ['微缩景观', 'large'],
    ['brass astrolabe', 'instrument'],
    ['pocket watch', 'instrument'],
    ['vintage camera', 'instrument'],
    ['magic lantern projector', 'instrument'],
    ['天球仪', 'instrument'],
    ['dinosaur skeleton', 'large'],
    ['鲸骨架', 'large'],
    ['Photography by Jane Doe bronze bell', 'large'],
    ['bronze bell pendant', 'small'],
    ['jade seal stone with dragon carving', 'small'],
    ['Ming dynasty brush pot', 'small'],
    ['青花笔洗', 'small'],
    ['小铜钟挂坠', 'small'],
    ['玉印章', 'small'],
    ['gold hairpin', 'small'],
    ['Roman fibula brooch', 'small'],
    ['ceremonial crown', 'small'],
    ['ritual hat with beadwork', 'small'],
    ['Moche ear spool', 'small'],
    ['jade ear flare', 'small'],
    ['Bronze Age torc', 'small'],
    ['gold armlet with terminals', 'small'],
    ['Victorian belt buckle', 'small'],
    ['汉代玉带钩', 'small'],
    ['清代带扣', 'small'],
    ['青铜臂环', 'small'],
    ['清代王冠头饰', 'small'],
    ['汉代耳珰耳饰', 'small'],
    ['木梳', 'small'],
    ['campaign button badge', 'small'],
    ['清代衣扣', 'small'],
    ['painted ceramic bowl', 'small'],
    ['bronze coin', 'flat'],
    ['silver medal', 'flat'],
    ['orders and decorations display', 'flat'],
    ['military decoration with ribbon', 'flat'],
    ['汉代铜钱', 'flat'],
    ['青铜镜', 'small'],
    ['glass vitrine bronze vessel', 'glasscase'],
    ['jade cup in display cabinet', 'glasscase'],
    ['陈列柜里的玉杯', 'glasscase'],
    ['jade cup behind protective glass', 'glasscase'],
    ['shooting Rosetta Stone through glass', 'glasscase'],
    ['shooting Rosetta Stone through plexiglass', 'glasscase'],
    ['jade cup under acrylic', 'glasscase'],
    ['jade cup under glass', 'glasscase'],
    ['bronze mirror in an acrylic case', 'glasscase'],
    ['亚克力罩里的玉杯', 'glasscase'],
    ['隔着玻璃拍玉杯', 'glasscase'],
    ['glass vessel', 'transparent'],
    ['Roman glassware', 'transparent'],
    ['ceramic vessel', 'small'],
    ['ancient glass bottle', 'transparent'],
    ['rock crystal cup', 'transparent'],
    ['agate bead necklace', 'transparent'],
    ['玛瑙珠串', 'transparent'],
    ['amber bead necklace', 'transparent'],
    ['琥珀坠饰', 'transparent'],
    ['lucite sculpture', 'transparent'],
    ['wet specimen jar', 'transparent'],
    ['spirit preserved fish specimen', 'transparent'],
    ['福尔马林液浸标本', 'transparent'],
    ['polished silver cup', 'reflective'],
    ['award cup', 'reflective'],
    ['World Cup trophy', 'reflective'],
    ['奖杯', 'reflective'],
    ['bronze mirror with reflective surface', 'reflective'],
    ['bronze sword', 'reflective'],
    ['iron shield', 'reflective'],
    ['steel musket', 'reflective'],
    ['铁刃短刀', 'reflective'],
    ['鎏金银盘', 'reflective'],
    ['抛光铜镜', 'reflective'],
    ['玻璃杯', 'transparent'],
    ['琉璃瓶', 'transparent'],
    ['水晶观音像', 'transparent'],
    ['青花瓷碗', 'small'],
    ['', 'small'],
  ];
  for (const [input, kind] of cases) {
    it(`「${input || '(空)'}」→ ${kind}`, () => expect(selectCaptureGuide(input).kind).toBe(kind));
  }
});

describe('CaptureGuide · 数据完整性', () => {
  it('各类都有步骤 / 规格 / 避坑 / 合法 mode', () => {
    for (const g of Object.values(ALL_GUIDES)) {
      expect(g.steps.length).toBeGreaterThan(0);
      expect(g.pitfalls.length).toBeGreaterThan(0);
      expect(['video', 'photo', 'both']).toContain(g.mode);
    }
  });
  it('玻璃罩推荐录视频、平面文物推荐多图', () => {
    expect(selectCaptureGuide('玻璃展柜').mode).toBe('video');
    expect(selectCaptureGuide('帛画').mode).toBe('photo');
  });
});

describe('selectCaptureGuideForArtifact · Qwen 字段接入', () => {
  it('Qwen 补全的造像字段会稳定给出三圈雕塑绕拍建议', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '萨莫色雷斯胜利女神像',
      museum: '卢浮宫',
      tags: {
        nameEn: 'Winged Victory of Samothrace',
        aliases: ['Nike of Samothrace'],
        category: '造像',
        material: ['大理石'],
        culture: '古希腊',
        dimensions: '高约 244 厘米',
        dynastyLabel: '希腊化时代',
      },
    });

    expect(guide.kind).toBe('sculpture');
    expect(guide.specs.orbits).toBe(3);
    expect(guide.specs.heights).toEqual(['平视', '略俯', '低角度']);
    expect(captureGuideBrief(guide)).toBe('雕塑 / 塑像 / 俑 · 视频/多图 · 绕 3 圈 · 平视、略俯、低角度');
  });

  it('Qwen 补全的雕塑器类可在名称不含造像关键词时驱动三圈绕拍', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '胜利女神',
      museum: '卢浮宫',
      tags: {
        nameEn: 'Winged Victory of Samothrace',
        category: '雕塑',
        material: ['大理石'],
        culture: '古希腊',
        dynastyLabel: '希腊化时代',
      },
    });

    expect(guide.kind).toBe('sculpture');
    expect(guide.specs.heights).toEqual(['平视', '略俯', '低角度']);
  });

  it('Qwen 补全的古籍器类可在名称不含纸本关键词时驱动多图采集', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '永乐大典残页',
      tags: {
        category: '古籍',
        material: ['纸'],
        dynastyLabel: '明',
      },
    });

    expect(guide.kind).toBe('flat');
    expect(guide.mode).toBe('photo');
  });

  it('Qwen 补全的干制植物材质可驱动平面标本多图采集', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '19世纪植物标本',
      tags: {
        category: '其他',
        material: ['干制植物'],
        culture: '自然史',
      },
    });

    expect(guide.kind).toBe('flat');
    expect(guide.mode).toBe('photo');
  });

  it('Qwen 补全的动物骨骼标本可驱动多高度绕拍', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '渡渡鸟骨架',
      tags: {
        category: '动物骨骼标本',
        material: ['骨骼'],
        culture: '自然史',
      },
    });

    expect(guide.kind).toBe('sculpture');
    expect(guide.mode).toBe('both');
    expect(guide.specs.heights).toEqual(['平视', '略俯', '低角度']);
  });

  it('显式展柜语境优先于结构化器类，避免隔玻璃展品误走普通绕拍', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '玉杯',
      labels: [{ rawText: '展品位于玻璃展柜内，请勿触碰' }],
      tags: { category: '造像', material: ['玉'] },
    });

    expect(guide.kind).toBe('glasscase');
    expect(guide.mode).toBe('video');
  });

  it('Qwen 补全的透明材质会优先给出透明材质采集建议', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '水晶观音像',
      tags: { category: '造像', material: ['水晶'] },
    });

    expect(guide.kind).toBe('transparent');
    expect(guide.mode).toBe('both');
    expect(captureGuideBrief(guide)).toContain('透明 / 半透明材质');
  });

  it('Qwen 只补出透明材质时也会驱动透明材质采集建议', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '无题小件',
      tags: { category: '其他', material: ['玻璃'] },
    });
    const agateGuide = selectCaptureGuideForArtifact({
      nameZh: '无题珠饰',
      tags: { category: '其他', material: ['agate', '玛瑙', '红玉髓'] },
    });
    const amberGuide = selectCaptureGuideForArtifact({
      nameZh: '无题串饰',
      tags: { category: '其他', material: ['amber', '琥珀'] },
    });

    expect(guide.kind).toBe('transparent');
    expect(agateGuide.kind).toBe('transparent');
    expect(amberGuide.kind).toBe('transparent');
    expect(guide.mode).toBe('both');
    expect(captureGuideBrief(guide)).toContain('透明 / 半透明材质');
    expect(captureGuideBrief(agateGuide)).toContain('透明 / 半透明材质');
  });

  it('Qwen 从琥珀包裹体器类推断材质后会驱动透明材质采集建议', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '琥珀含虫标本',
      tags: { category: '标本', material: ['琥珀'] },
    });

    expect(guide.kind).toBe('transparent');
    expect(guide.mode).toBe('both');
    expect(captureGuideBrief(guide)).toContain('透明 / 半透明材质');
  });

  it('Qwen 只补出彩绘玻璃材质时仍走平面多图采集', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '无题窗饰',
      tags: { category: '其他', material: ['stained glass', '彩绘玻璃'] },
    });
    const panelGuide = selectCaptureGuideForArtifact({
      nameZh: '玻璃窗饰',
      tags: { category: '其他', material: ['painted glass panel'] },
    });

    expect(guide.kind).toBe('flat');
    expect(panelGuide.kind).toBe('flat');
    expect(guide.mode).toBe('photo');
    expect(captureGuideBrief(guide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出液浸标本材质时也会驱动透明材质采集建议', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '无题标本',
      tags: { category: '其他', material: ['formalin-preserved specimen', '液浸标本'] },
    });

    expect(guide.kind).toBe('transparent');
    expect(guide.mode).toBe('both');
    expect(captureGuideBrief(guide)).toContain('透明 / 半透明材质');
  });

  it('Qwen 只补出干制植物材质时也会驱动平面标本多图采集', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '无题标本',
      tags: { category: '其他', material: ['pressed plant specimen', '干制植物'] },
    });

    expect(guide.kind).toBe('flat');
    expect(guide.mode).toBe('photo');
    expect(captureGuideBrief(guide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出骨骼类材质时也会驱动多高度绕拍', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '无题标本',
      tags: { category: '其他', material: ['skull specimen', '骨骼'] },
    });

    expect(guide.kind).toBe('sculpture');
    expect(guide.mode).toBe('both');
    expect(guide.specs.heights).toEqual(['平视', '略俯', '低角度']);
  });

  it('Qwen 只补出纸本羊皮纸等平面材质时也会驱动多图采集', () => {
    const paperGuide = selectCaptureGuideForArtifact({
      nameZh: '无题一',
      tags: { category: '其他', material: ['ink on paper'] },
    });
    const parchmentGuide = selectCaptureGuideForArtifact({
      nameZh: '无题二',
      tags: { category: '其他', material: ['parchment', 'vellum'] },
    });
    const normalizedGuide = selectCaptureGuideForArtifact({
      nameZh: '无题三',
      tags: { category: '其他', material: ['莎草纸', '亚麻', '竹简'] },
    });

    expect(paperGuide.kind).toBe('flat');
    expect(parchmentGuide.kind).toBe('flat');
    expect(normalizedGuide.kind).toBe('flat');
    expect(captureGuideBrief(paperGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出亮釉等高反光材质时也会驱动反光采集建议', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '无题陶瓷',
      tags: { category: '其他', material: ['high-gloss glaze', '亮釉'] },
    });

    expect(guide.kind).toBe('reflective');
    expect(guide.mode).toBe('both');
    expect(captureGuideBrief(guide)).toContain('高反光 / 抛光材质');
  });

  it('Qwen 只补出珐琅或景泰蓝材质时也会驱动反光采集建议', () => {
    const enamelGuide = selectCaptureGuideForArtifact({
      nameZh: '无题小件',
      tags: { category: '其他', material: ['enamel', '珐琅'] },
    });
    const cloisonneGuide = selectCaptureGuideForArtifact({
      nameZh: '无题器',
      tags: { category: '其他', material: ['cloisonne enamel', '景泰蓝'] },
    });

    expect(enamelGuide.kind).toBe('reflective');
    expect(cloisonneGuide.kind).toBe('reflective');
    expect(captureGuideBrief(enamelGuide)).toContain('高反光 / 抛光材质');
  });

  it('Qwen 只补出贝母或螺钿材质时也会驱动反光采集建议', () => {
    const nacreGuide = selectCaptureGuideForArtifact({
      nameZh: '无题小盒',
      tags: { category: '其他', material: ['nacre', 'mother-of-pearl', '贝母'] },
    });
    const inlayGuide = selectCaptureGuideForArtifact({
      nameZh: '无题饰片',
      tags: { category: '其他', material: ['shell inlay', '螺钿'] },
    });

    expect(nacreGuide.kind).toBe('reflective');
    expect(inlayGuide.kind).toBe('reflective');
    expect(captureGuideBrief(nacreGuide)).toContain('高反光 / 抛光材质');
  });

  it('Qwen 补全的漆木器小件走反光采集，漆柜仍保留大件拍法', () => {
    const lacquerBoxGuide = selectCaptureGuideForArtifact({
      nameZh: '剔红花卉纹盒',
      tags: { category: '漆木器', material: ['漆'] },
    });
    const lacquerCabinetGuide = selectCaptureGuideForArtifact({
      nameZh: '朱漆柜',
      tags: { category: '漆木器', material: ['lacquered wood'] },
    });

    expect(lacquerBoxGuide.kind).toBe('reflective');
    expect(captureGuideBrief(lacquerBoxGuide)).toContain('高反光 / 抛光材质');
    expect(lacquerCabinetGuide.kind).toBe('large');
  });

  it('Qwen 补全的高反光材质会给出反光小件采集建议', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '银杯',
      tags: { category: '金银器', material: ['银', '抛光金属'] },
    });

    expect(guide.kind).toBe('reflective');
    expect(guide.mode).toBe('both');
    expect(captureGuideBrief(guide)).toContain('高反光 / 抛光材质');
  });

  it('Qwen 补全的金银器类会给出金属反光采集建议', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '银杯',
      tags: { category: '金银器', material: ['银'] },
    });

    expect(guide.kind).toBe('reflective');
    expect(guide.mode).toBe('both');
    expect(captureGuideBrief(guide)).toContain('高反光 / 抛光材质');
  });

  it('Qwen 金银器分类不覆盖面具等更具体造型关键词', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: 'gold funerary mask',
      tags: { category: '金银器', material: ['gold'] },
    });

    expect(guide.kind).toBe('sculpture');
  });

  it('Qwen 补全的金属兵器会给出反光材质采集建议', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '越王勾践剑',
      tags: { category: '其他', material: ['青铜'] },
    });

    expect(guide.kind).toBe('reflective');
    expect(guide.mode).toBe('both');
    expect(captureGuideBrief(guide)).toContain('高反光 / 抛光材质');
  });

  it('Qwen 补全的宽泛家具分类不覆盖屏风等平面媒介拍法', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '十二扇屏风',
      tags: { category: '家具', material: ['纸本设色'] },
    });

    expect(guide.kind).toBe('flat');
    expect(guide.mode).toBe('photo');
    expect(captureGuideBrief(guide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('采集引导 hint 会带入 Qwen 别名、材质、尺寸与展馆，供关键词规则复用', () => {
    const hint = captureGuideHintFromArtifact({
      nameZh: '胜利女神',
      museum: '卢浮宫',
      labels: [{ rawText: 'Winged Victory of Samothrace' }],
      tags: {
        aliases: ['Nike of Samothrace'],
        category: '造像',
        material: ['大理石'],
        dimensions: '高约 244 厘米',
      },
    });

    expect(hint).toContain('Nike of Samothrace');
    expect(hint).toContain('大理石');
    expect(hint).toContain('高约 244 厘米');
    expect(hint).toContain('卢浮宫');
  });
});
