// 看展搭子 · 绕拍采集引导（CaptureGuide）
// 自有 GPU 3DGS / 摄影测量的重建质量高度依赖“怎么拍”。这里把采集经验沉淀成结构化引导：
// 按展品类型(小件/雕塑/玻璃罩/透明材质/高反光材质/平面/大件/仪器)给定制步骤、量化规格与避坑清单，供录视频/多图前的 UI 卡片渲染。
// 纯数据 + 规则、不依赖任何模型；selectCaptureGuide 用展品名/材质关键词挑类型，挑不中回落通用小件。
// Qwen 已补全的器类/材质/别名/尺寸可通过 selectCaptureGuideForArtifact 进入同一套规则，避免 UI 只靠输入框原文猜拍法。

export type ExhibitKind = 'small' | 'sculpture' | 'glasscase' | 'transparent' | 'reflective' | 'flat' | 'large' | 'instrument';

export interface CaptureStep {
  icon: string; // 单个 emoji/字符，UI 前缀
  title: string;
  detail: string;
}

export interface CaptureGuide {
  kind: ExhibitKind;
  label: string; // 展品类型中文名
  mode: 'video' | 'photo' | 'both'; // 推荐采集方式
  steps: CaptureStep[]; // 绕拍步骤（通用原则 + 类型专属）
  specs: {
    // 量化规格：给 UI 显示"拍多久 / 多少张 / 绕几圈 / 哪些高度"
    videoSec?: [number, number];
    photoCount?: [number, number];
    orbits?: number;
    heights?: string[];
  };
  pitfalls: string[]; // 避坑清单
}

export interface CaptureGuideArtifactLike {
  nameZh?: string;
  nameEn?: string;
  museum?: string;
  exhibition?: string;
  labels?: Array<{ rawText?: string }>;
  tags?: {
    nameEn?: string;
    aliases?: string[];
    category?: string;
    material?: string[];
    culture?: string;
    findspot?: string;
    dimensions?: string;
    dynastyLabel?: string;
  };
}

// 所有类型通用的底层原则（并进每种类型的 steps 最前）
const COMMON_STEPS: CaptureStep[] = [
  { icon: '🎯', title: '让展品填满画面', detail: '展品占画面 6–8 成，别拍太多背景；重建靠的是展品表面细节。' },
  { icon: '🐢', title: '匀速慢绕，别停顿', detail: '像绕柱子走路一样匀速环绕，相机高度稳住；过快会糊、拼不上。' },
  { icon: '🔁', title: '相邻画面大量重叠', detail: '每一步只移一点点，前后两帧要有大片重叠，算法才对得上位。' },
];

const COMMON_PITFALLS = [
  '强反光 / 镜面 / 透明材质（玻璃、抛光金属、亮釉）最难重建——换斜角、避开灯的直射反光点。',
  '纯色无纹理表面（大片白、素陶）缺特征点，重建会漏；尽量把周边有纹理的部分也带进画面。',
  '别让人从展品前走过；移动物体会被当噪点，污染点云。',
  '光线要稳、均匀，别一半过曝一半死黑。',
];

const GUIDES: Record<ExhibitKind, CaptureGuide> = {
  small: {
    kind: 'small',
    label: '小件展品',
    mode: 'both',
    steps: [
      ...COMMON_STEPS,
      { icon: '🌀', title: '绕满 360°、两三圈', detail: '水平绕一整圈，再抬高、压低机位各绕一圈，覆盖顶面与底缘。' },
    ],
    specs: { videoSec: [20, 40], photoCount: [30, 60], orbits: 3, heights: ['平视', '俯视 30°', '仰视 20°'] },
    pitfalls: COMMON_PITFALLS,
  },
  sculpture: {
    kind: 'sculpture',
    label: '雕塑 / 塑像 / 俑',
    mode: 'both',
    steps: [
      ...COMMON_STEPS,
      { icon: '📐', title: '多高度多圈', detail: '头部、腰部、脚下至少三个高度各绕一圈；背面别偷懒。' },
      { icon: '🕳️', title: '补拍遮挡缝隙', detail: '衣纹、手臂内侧、底座接缝这些藏起来的地方，凑近单独补几帧。' },
    ],
    specs: { videoSec: [30, 60], photoCount: [50, 90], orbits: 3, heights: ['平视', '略俯', '低角度'] },
    pitfalls: COMMON_PITFALLS,
  },
  glasscase: {
    kind: 'glasscase',
    label: '玻璃罩 / 展柜内',
    mode: 'video',
    steps: [
      ...COMMON_STEPS,
      { icon: '📷', title: '贴近玻璃、斜角拍', detail: '镜头尽量贴玻璃、与玻璃成斜角，把灯的反光点甩到画面外。' },
      { icon: '🚫', title: '关闪光灯', detail: '闪光灯打玻璃直接一片白；用现场光，手稳住多绕几圈。' },
    ],
    specs: { videoSec: [25, 45], orbits: 2, heights: ['平视', '略俯'] },
    pitfalls: ['隔玻璃能拿到的细节有限，尽量贴近、绕到反光最少的角度。', ...COMMON_PITFALLS],
  },
  transparent: {
    kind: 'transparent',
    label: '透明 / 半透明材质',
    mode: 'both',
    steps: [
      ...COMMON_STEPS,
      { icon: '💎', title: '先拍轮廓和边缘', detail: '透明本体缺纹理，先围着外轮廓、口沿、底足、刻纹慢拍，别只对准正中透明区域。' },
      { icon: '↗', title: '多用斜角避穿透', detail: '每圈都带一点斜侧角，让反光和折射形成可追踪细节；正面直拍很容易拼不上。' },
      { icon: '🌫️', title: '补拍底座和阴影', detail: '如果展品太通透，把底座、标签边缘和投影一起带进画面，给重建算法更多稳定参照。' },
    ],
    specs: { videoSec: [25, 50], photoCount: [40, 80], orbits: 3, heights: ['平视斜角', '略俯', '低角度'] },
    pitfalls: ['透明 / 半透明材质可能只能重建轮廓和局部表面；结果不完整时优先保留照片层。', ...COMMON_PITFALLS],
  },
  reflective: {
    kind: 'reflective',
    label: '高反光 / 抛光材质',
    mode: 'both',
    steps: [
      ...COMMON_STEPS,
      { icon: '◒', title: '先找无高光角度', detail: '绕到灯光反射不直冲镜头的位置，再开始录；不要让亮斑盖住纹饰。' },
      { icon: '↔', title: '小步横移补视差', detail: '反光表面会骗过算法，多做短距离横移，让边缘、口沿和纹饰保持可追踪。' },
      { icon: '▣', title: '带上底座和阴影', detail: '画面里保留展台、底座或标签边缘，给重建算法一个稳定参照，不要只拍亮面。' },
    ],
    specs: { videoSec: [25, 45], photoCount: [40, 70], orbits: 3, heights: ['平视斜角', '略俯', '低角度'] },
    pitfalls: ['镜面 / 抛光金属可能重建不出完整亮面；优先记录形制、边缘和纹饰，失败时保留照片层。', ...COMMON_PITFALLS],
  },
  flat: {
    kind: 'flat',
    label: '书画 / 帛画 / 平面文物',
    mode: 'photo',
    steps: [
      { icon: '🗺️', title: '像扫描一样分块拍', detail: '正对画面，从左到右、从上到下网格式覆盖，每块都和邻块重叠。' },
      { icon: '💡', title: '避开正中反光', detail: '灯偏一点或斜着拍，别让高光落在画心；玻璃裱框同理。' },
      { icon: '📏', title: '保持等距正对', detail: '每张离画面差不多远、正对拍摄，减少透视变形。' },
    ],
    specs: { photoCount: [20, 50], heights: ['正对'] },
    pitfalls: ['平面文物适合多图网格；绕拍视频通常难以还原平面细节。', ...COMMON_PITFALLS],
  },
  large: {
    kind: 'large',
    label: '大件 / 青铜重器 / 车马',
    mode: 'video',
    steps: [
      ...COMMON_STEPS,
      { icon: '🚶', title: '走大圈、多圈层', detail: '退开距离绕大圈保整体，再凑近绕一圈补纹饰，高低各来一圈。' },
      { icon: '🔦', title: '深腔单独补', detail: '鼎腹内壁、镂空、车厢内部这些深腔，凑近单独补拍。' },
    ],
    specs: { videoSec: [40, 70], orbits: 3, heights: ['整体大圈', '细节近圈', '俯视'] },
    pitfalls: COMMON_PITFALLS,
  },
  instrument: {
    kind: 'instrument',
    label: '钟表 / 科学仪器',
    mode: 'both',
    steps: [
      ...COMMON_STEPS,
      { icon: '◷', title: '先绕整体轮廓', detail: '先保住表盘、支架和外框的完整形体，再靠近补机械结构。' },
      { icon: '▦', title: '补表盘、刻度和指针', detail: '刻度、铭文、齿轮、指针和玻璃边缘单独补几段，别让反光盖住细节。' },
      { icon: '↗', title: '斜角避玻璃反光', detail: '有玻璃面或抛光金属时，保持轻微斜角，带上底座或展台作为稳定参照。' },
    ],
    specs: { videoSec: [25, 50], photoCount: [40, 80], orbits: 3, heights: ['正面', '略俯', '侧后方'] },
    pitfalls: ['表盘玻璃和金属件容易反光，先找无高光角度；细刻度糊掉时优先补多图。', ...COMMON_PITFALLS],
  },
};

// 用展品名 / 材质 / 用户输入里的关键词挑类型；挑不中回落小件通用引导。
export function selectCaptureGuide(hint?: string): CaptureGuide {
  const s = (hint || '').toLowerCase();
  const has = (...ks: string[]) => ks.some((k) => s.includes(k));
  const isRitualVessel = /\britual\s+vessels?\b/.test(s);
  const isFlatMedia = /\b(?:paintings?|fresco(?:es)?|murals?|mosaics?|mosaic\s+(?:panels?|floors?|fragments?)|stained\s+glass(?:\s+(?:windows?|panels?))?|painted\s+glass\s+(?:windows?|panels?)|tiles?|tile\s+(?:panels?|fragments?)|ceramic\s+tiles?|glazed\s+tiles?|photographs?|photographic\s+(?:prints?|negatives?|slides?)|contact\s+sheets?|proof\s+sheets?|negative\s+strips?|film\s+strips?|film\s+negatives?|transparenc(?:y|ies)|35mm\s+slides?|stereographs?|stereoscopic\s+(?:cards?|photographs?)|cabinet\s+cards?|cartes?[-\s]?de[-\s]?visite|daguerreotypes?|ambrotypes?|tintypes?|albumen\s+prints?|cyanotypes?|glass\s+plate\s+negatives?|lantern\s+slides?|magic\s+lantern\s+slides?|gelatin\s+silver\s+prints?|prints?|posters?|drawings?|watercolou?rs?|gouaches?|pastels?|pastel\s+drawings?|charcoal\s+drawings?|ink\s+drawings?|canvas|thangkas?|icons?|painted\s+icons?|religious\s+icons?|altarpieces?|triptychs?|diptychs?|silks?|silk\s+(?:banners?|paintings?|panels?|scrolls?)|hanging\s+scrolls?|hand\s*scrolls?|handscrolls?|papyrus\s+(?:scrolls?|fragments?)|bamboo\s+slips?|wooden\s+slips?|manuscripts?|illuminated\s+manuscripts?|(?:manuscript|book|folio)\s+(?:leaf|leaves)|foli(?:o|os)|codex(?:es)?|codices|rare\s+books?|printed\s+books?|books?|incunabula|bookbindings?|book\s+bindings?|manuscript\s+bindings?|codex\s+bindings?|book\s+covers?|(?:exhibition|collection|auction|trade|sales?)\s+catalog(?:ue)?s?|(?:photograph|photo|autograph)\s+albums?|photo\s*books?|photobooks?|scrapbooks?|letters?|correspondence|postcards?|postage\s+stamps?|philatelic\s+materials?|first\s+day\s+covers?|postal\s+covers?|envelopes?|diar(?:y|ies)|journals?|notebooks?|documents?|archives?|archival\s+(?:documents?|records?)|newspapers?|newspaper\s+(?:clippings?|pages?)|clippings?|maps?|atlas(?:es)?|cartographic\s+materials?|ephemera|printed\s+ephemera|broadsides?|leaflets?|flyers?|pamphlets?|tickets?|certificates?|invitation\s+cards?|trade\s+cards?|business\s+cards?|visiting\s+cards?|calling\s+cards?|cigarette\s+cards?|greeting\s+cards?|holiday\s+cards?|christmas\s+cards?|new\s+year\s+cards?|playbills?|theat(?:er|re)\s+program(?:me)?s?|programmes?|programs?|exhibition\s+programs?|restaurant\s+menus?|menus?|brochures?|blueprints?|architectural\s+plans?|site\s+plans?|floor\s+plans?|folding\s+screens?|album\s+(?:leaf|leaves)|folding\s+fans?|hand\s+fans?|fan\s+leaves|fan\s+leaf|fan\s+paintings?|shadow\s+puppets?|textiles?|tapestr(?:y|ies)|embroider(?:y|ies)|embroidered|carpets?|rugs?|kilims?|robes?|garments?|costumes?|dress(?:es)?|gowns?|kimonos?|tunics?|vestments?|liturgical\s+vestments?|ecclesiastical\s+vestments?|chasubles?|dalmatics?|stoles?|liturgical\s+stoles?|copes?|quilts?|coverlets?|bedcovers?|bedspreads?|woven\s+mats?|reed\s+mats?|bamboo\s+mats?|straw\s+mats?|matting|woodblock\s+prints?|ukiyo[-\s]?e\s+prints?|woodcuts?|linocuts?|photogravures?|collotypes?|aquatints?|mezzotints?|drypoints?|monotypes?|monoprints?|lithographs?|etchings?|engravings?|wood\s+engravings?|screenprints?|screen\s+prints?|silkscreens?|silk\s+screens?|silk\s+screen\s+prints?|serigraphs?|rubbings?|coins?|coinage|medals?|medallions?|trade\s+tokens?|bank\s*notes?|banknotes?|paper\s+(?:money|currency)|currency\s+notes?|numismatic|orders?\s+and\s+decorations?|military\s+decorations?|service\s+medals?|campaign\s+medals?|commemorative\s+medals?|order\s+badges?)\b/.test(s);
  const isMusicScoreFlatMedia = /\b(?:musical\s+scores?|manuscript\s+scores?|sheet\s+music|music\s+manuscripts?|songbooks?|hymnals?|librettos?|libretti)\b/.test(s)
    || has('乐谱', '曲谱', '手稿乐谱', '唱本', '歌本', '赞美诗集');
  const isAudioRecordFlatMedia = /\b(?:phonograph|gramophone|vinyl|shellac)\s+records?\b|\b(?:78\s*rpm|lp)\s+records?\b|\brecord\s+sleeves?\b/.test(s)
    || has('唱片', '黑胶唱片', '留声机唱片', '唱片封套');
  const isGameCardFlatMedia = /\b(?:playing|tarot|game)\s+cards?\b|\bcard\s+games?\b/.test(s)
    || has('纸牌', '扑克牌', '塔罗牌', '游戏卡');
  const isCalendarFlatMedia = /\b(?:(?:wall|desk|pocket|advertising|promotional)\s+)?calendars?\b|\bcalendar\s+(?:cards?|leaves|posters?)\b|\balmanacs?\b/.test(s)
    || has('日历', '月历', '年历', '月份牌', '历书', '通书', '黄历');
  const isTicketCouponFlatMedia = /\bticket\s+stubs?\b|\b(?:admission|museum|event|railway|train)\s+tickets?\b|\b(?:receipts?|invoices?|coupons?|vouchers?)\b|\bration\s+(?:books?|coupons?|tickets?)\b/.test(s)
    || has('门票', '票根', '票券', '收据', '发票', '凭证', '粮票', '布票');
  const isShadowPuppetObject = /\bshadow\s+puppets?\b/.test(s) || has('皮影', '影偶');
  const isFlatTextileAccessory = /\b(?:shawls?|sashes?|scarves?|headscarves?|lace(?:work)?|samplers?|aprons?)\b/.test(s)
    || has('披肩', '围巾', '头巾', '蕾丝', '花边', '围裙');
  const isFlatTextileCovering = /\b(?:quilts?|coverlets?|bedcovers?|bedspreads?|woven\s+mats?|reed\s+mats?|bamboo\s+mats?|straw\s+mats?|matting)\b/.test(s)
    || has('被面', '拼布被', '绗缝被', '草席', '竹席', '编席', '席垫');
  const isFootwearObject = /\b(?:footwear|shoes?|(?:embroidered|lotus|platform|ceremonial)\s+shoes?|boots?|sandals?|slippers?|moccasins?)\b/.test(s)
    || has('鞋履', '绣鞋', '弓鞋', '三寸金莲', '鞋', '靴', '靴子');
  const isLargeSpecimen = /\b(?:(?:dinosaur|whale|mammoth|mastodon|sauropod|triceratops|tyrannosaurus|t[-\s]?rex)\s+(?:skeleton|fossil|mount)|(?:skeleton|fossil)\s+(?:mount|cast))\b/.test(s)
    || has('恐龙骨架', '鲸骨架', '猛犸象骨架');
  const isFlatSpecimen = /\b(?:herbarium\s+(?:sheets?|specimens?)|(?:plant|dried\s+plant|botanical)\s+specimens?(?:\s+sheets?)?|pressed\s+(?:plants?|flowers?)|botanical\s+specimens?|leaf\s+fossils?|fossil\s+(?:slabs?|plates?)|pinned\s+(?:insects?|butterfl(?:y|ies))|(?:insect|butterfl(?:y|ies))\s+specimens?\s+(?:boxes?|cases?|drawers?|trays?))\b/.test(s)
    || has('植物标本', '干制植物', '腊叶标本', '压制标本', '叶化石', '化石板', '昆虫标本盒', '昆虫标本箱', '蝴蝶标本盒', '蝴蝶标本箱', '蝴蝶标本');
  const isFlatNaturalHistoryGraphic = /\b(?:botanical\s+(?:illustrations?|plates?)|natural\s+history\s+illustrations?|specimen\s+sheets?|plant\s+specimen\s+sheets?|entomology\s+drawers?|insect\s+drawers?)\b/.test(s)
    || has('植物图谱', '植物画', '植物标本夹页', '标本夹页', '昆虫标本抽屉');
  const isTaxidermySpecimen = /\b(?:taxidermy|mounted\s+(?:animal|bird|mammal)|animal\s+mount|bird\s+mount)\b/.test(s)
    || has('动物标本', '鸟类标本', '兽类标本', '剥制标本');
  const isThreeDimNaturalSpecimen = /\b(?:(?:animal|mammal|bird|fish|reptile|dodo|horse|deer|bear|tiger|lion)\s+)?(?:skulls?|skeletons?)\s+(?:specimens?|displays?|cases?)\b/.test(s)
    || /\b(?:skulls?|skeletons?)\s+of\s+(?:an?\s+)?(?:animal|mammal|bird|fish|reptile|dodo|horse|deer|bear|tiger|lion)\b/.test(s)
    || has('动物骨骼', '动物骨架', '鸟类骨骼', '鸟类骨架', '兽骨标本', '骨骼标本', '骨架标本', '头骨标本', '颅骨标本');
  const isCoffinObject = /\b(?:sarcophag(?:us|i)|coffins?|mummy\s+(?:cases?|coffins?|sarcophag(?:us|i)))\b/.test(s)
    || has('棺椁', '棺槨', '木棺', '石棺', '木乃伊棺');
  const isArmorObject = /\b(?:samurai\s+)?armou?r\b|\bsuit\s+of\s+armou?r\b|\b(?:war\s+|ceremonial\s+)?helmets?\b|\bkabuto\b/.test(s)
    || has('盔甲', '甲胄', '铠甲', '头盔', '兜鍪');
  const isFurnitureObject = /\b(?:chairs?|thrones?|cabinets?|wardrobes?|chests?|tables?|desks?|beds?|benches?|stools?|furniture)\b/.test(s)
    || has('家具', '椅', '王座', '宝座', '柜', '橱', '桌', '床榻');
  const isLargeInstrument = /\b(?:(?:bronze|ceremonial|temple|standing|taiko)\s+(?:drums?|gongs?|bells?)|(?:taiko|kettle)\s+drums?|gongs?|chime\s+bells?|bell\s+chimes?|bianzhong|(?:musical|stringed|plucked)\s+instruments?|lutes?|lyres?|harps?|zithers?|pip(?:a|as)|guqins?|flutes?|violins?|cellos?|guitars?)\b/.test(s)
    || has('乐器', '古琴', '琵琶', '竖琴', '箜篌', '古筝', '扬琴', '小提琴', '大提琴', '编钟', '钟磬', '铜钟', '铜鼓', '大鼓', '建鼓', '鼍鼓', '编磬', '石磬', '铜锣');
  const isInstallationObject = /\b(?:(?:room-sized|immersive|site-specific|large-scale)\s+)?installation(?:\s+art)?\b/.test(s)
    || has('装置艺术', '大型装置', '沉浸式装置', '场景装置');
  const isScaleModelObject = /\b(?:architectural|scale|ship|boat|train|city|site|building)\s+models?\b|\b(?:dioramas?|maquettes?)\b/.test(s)
    || has('建筑模型', '沙盘', '场景模型', '微缩模型', '微缩景观', '船模', '车模');
  const isTransportObject = /\b(?:ceremonial\s+chariots?|war\s+chariots?|chariots?|carriages?|carts?|wagons?|coaches?|vehicles?|boats?|ships?|watercraft|canoes?|barges?)\b/.test(s)
    || has('交通工具', '车马', '车船', '车辆', '车驾', '马车', '战车', '船只');
  const isInstrumentObject = /\b(?:scientific|navigational|measuring|photographic|optical)\s+instruments?\b|\b(?:timepieces?|clocks?|watch(?:es)?|pocket\s+watch(?:es)?|astrolabes?|sundials?|compasses?|sextants?|quadrants?|armillary\s+spheres?|orreries|celestial\s+globes?|terrestrial\s+globes?|globes?|microscopes?|telescopes?|cameras?|camera\s+lens(?:es)?|photographic\s+lens(?:es)?|projectors?|film\s+projectors?|slide\s+projectors?|magic\s+lanterns?|cinematographs?)\b/.test(s)
    || has('仪器', '科学仪器', '天文仪器', '航海仪器', '计时仪器', '光学仪器', '摄影器材', '电影器材', '钟表', '座钟', '怀表', '天球仪', '地球仪', '浑天仪', '星盘', '日晷', '罗盘', '指南针', '六分仪', '象限仪', '显微镜', '望远镜', '照相机', '摄影机', '放映机', '幻灯机', '镜头');
  const isSmallPortableObject = /\b(?:pendants?|charms?|amulets?|beads?|necklaces?|rings?|neck\s+rings?|earrings?|ear\s+(?:ornaments?|spools?|flares?|plugs?|pendants?)|brooch(?:es)?|bracelets?|torcs?|torques?|armlets?|anklets?|belt\s+buckles?|dress\s+buckles?|shoe\s+buckles?|buckles?|regalia|insignia|headdress(?:es)?|headgear|crowns?|diadems?|sceptres?|scepters?|hats?|caps?|hairpins?|hair\s+ornaments?|combs?|tiaras?|fibulae?|fibulas?|belt\s+hooks?|badges?|lapel\s+badges?|hat\s+badges?|cap\s+badges?|button\s+badges?|campaign\s+buttons?|dress\s+buttons?|lapel\s+pins?|hat\s+pins?|tie\s+pins?|jewel(?:ry|lery)|netsukes?|ojime(?:\s+beads?)?|cameos?|scarabs?|scarab\s+amulets?|cylinder\s+seals?|stamp\s+seals?|seal\s+(?:stones?|matrices|impressions?)|intaglios?|scarab\s+seals?|scaraboid\s+seals?)\b/.test(s)
    || has('佩饰', '徽饰', '头饰', '冠帽', '王冠', '冠冕', '礼冠', '帽子', '礼帽', '权杖', '挂坠', '吊坠', '坠饰', '项链', '戒指', '耳饰', '耳珰', '耳环', '耳坠', '胸针', '手镯', '手链', '臂环', '臂钏', '臂镯', '脚镯', '脚环', '踝饰', '踝环', '颈环', '项圈', '发簪', '簪', '发钗', '钗', '梳子', '梳', '带钩', '带扣', '腰带扣', '扣饰', '徽章', '像章', '胸章', '襟章', '纽扣', '钮扣', '衣扣', '珠串', '念珠', '护身符', '印章', '玉佩', '玉印');
  const isSmallToyObject = /\b(?:toys?|dolls?|puppets?|game\s+pieces?|gaming\s+pieces?|dice)\b/.test(s)
    || has('玩具', '玩偶', '木偶', '偶人', '棋子', '骰子');
  const isSmallToolObject = /\b(?:door\s+keys?|keys?|padlocks?|door\s+locks?)\b/.test(s)
    || has('工具', '钥匙', '锁具', '挂锁');
  const isSmallLightingObject = /\b(?:oil\s+lamps?|mosque\s+lamps?|candlesticks?|candelabr(?:a|um)|rushlights?)\b/.test(s)
    || has('灯具', '宫灯', '油灯', '铜灯', '灯盏', '灯台', '烛台', '提灯');
  const isAwardCupObject = /\b(?:troph(?:y|ies)|award\s+cups?|prize\s+cups?|presentation\s+cups?)\b/.test(s)
    || has('奖杯', '奖盃');
  const isSmallNaturalSpecimen = /\b(?:(?:dinosaur|shark|mammoth)\s+(?:fossil\s+)?(?:tooth|teeth|claws?|eggs?|bones?)|fossil\s+(?:tooth|teeth|shell|bones?|eggs?|ammonite|trilobite)|(?:ammonite|trilobite)\s+fossil|(?:mineral|rock|shell|coral|marine\s+shell)\s+specimens?|rock\s+samples?|meteorite\s+fragments?|moon\s+rock(?:\s+fragments?)?|quartz\s+crystals?|crystal\s+clusters?|coral\s+(?:specimens?|fragments?)|conch\s+shells?|sea\s+shells?|marine\s+shells?)\b/.test(s)
    || has('恐龙牙', '恐龙蛋', '恐龙骨', '猛犸牙', '鲨鱼牙', '化石牙', '牙齿化石', '化石骨', '化石蛋', '贝壳化石', '菊石化石', '三叶虫化石', '矿物标本', '矿石标本', '岩石标本', '陨石碎片', '月岩样本', '水晶簇', '贝壳标本', '贝类标本', '海螺标本', '珊瑚标本');
  const isLargeObject = has('鼎', '青铜器', '青铜重器', '神树', '编钟', '钟', '尊', 'bell', 'tripod', 'amphora', 'cauldron') || isRitualVessel || isLargeSpecimen || isCoffinObject || isArmorObject || isFurnitureObject || isLargeInstrument || isInstallationObject || isScaleModelObject || isTransportObject;
  const isChineseStoneRelief = /画像[石砖]/.test(s) && !has('拓片', '碑拓');
  const isBehindGlass = /(?:behind|through|under)\s+(?:an?\s+|the\s+)?(?:protective\s+)?(?:glass|plexiglass|acrylic|perspex)\b/.test(s)
    || /\b(?:acrylic|plexiglass|perspex)\s+(?:case|cover|vitrine|shield)\b/.test(s)
    || /隔着玻璃|玻璃后/.test(s);
  const isWetSpecimenObject = /\b(?:wet|fluid|spirit|alcohol|formalin)[-\s]?(?:preserved\s+)?(?:\w+\s+){0,3}specimens?\b|\bspecimens?\s+(?:preserved\s+)?(?:in\s+)?(?:fluid|spirit|alcohol|formalin)\b|\bwet\s+specimen\s+(?:jars?|vessels?)\b/.test(s)
    || /(?:液浸|浸制|福尔马林|酒精保存|液体保存).{0,8}标本|标本.{0,8}(?:液浸|浸制|福尔马林|酒精保存|液体保存)/.test(s);
  const isTransparentMaterialObject = /\bglass\s*wares?\b|\b(?:glass|crystal|rock\s+crystal|quartz|agate|carnelian|chalcedony|amber|fossil\s+resin|lucite|acrylic|plexiglass|perspex|transparent|translucent)\s+(?:vessels?|bottles?|cups?|bowls?|vases?|jars?|beads?|pendants?|figurines?|sculptures?|objects?|artifacts?|artefacts?)\b/.test(s)
    || /\b(?:vessels?|bottles?|cups?|bowls?|vases?|jars?|beads?|pendants?|figurines?|sculptures?|objects?|artifacts?|artefacts?)\s+(?:made\s+of\s+|in\s+)?(?:glass|crystal|rock\s+crystal|quartz|agate|carnelian|chalcedony|amber|fossil\s+resin|lucite|acrylic|plexiglass|perspex)\b/.test(s)
    || /\b(?:amber|fossil\s+resin)\b/.test(s)
    || /(?:玻璃|琉璃|水晶|石英|玛瑙|玉髓|红玉髓|琥珀).*(?:器|瓶|杯|碗|珠|坠|佩|像|雕|球)|(?:器|瓶|杯|碗|珠|坠|佩|像|雕|球).*(?:玻璃|琉璃|水晶|石英|玛瑙|玉髓|红玉髓|琥珀)|透明材质|半透明材质|琥珀/.test(s)
    || isWetSpecimenObject;
  const reflectiveCue = String.raw`(?:polished|mirror[-\s]?polished|reflective|specular|high[-\s]?gloss|shiny|gilded)`;
  const reflectiveObject = String.raw`(?:silver|gold|bronze|copper|metal|mirrors?|cups?|bowls?|plates?|dishes?|vessels?|objects?|artifacts?|artefacts?)`;
  const isReflectiveMaterialObject = new RegExp(`\\b${reflectiveCue}\\b[\\s\\S]*\\b${reflectiveObject}\\b|\\b${reflectiveObject}\\b[\\s\\S]*\\b${reflectiveCue}\\b`, 'i').test(s)
    || /(?:抛光|镜面|高反光|强反光|鎏金|描金).*(?:金|银|铜|铁|金属|镜|盘|杯|碗|器)|(?:金|银|铜|铁|金属|镜|盘|杯|碗|器).*(?:抛光|镜面|高反光|强反光|鎏金|描金)/.test(s);
  const isIridescentInlayObject = /\b(?:mother[-\s]?of[-\s]?pearl|nacre|abalone)\s+(?:inlays?|inlaid|boxes?|plaques?|panels?|objects?|artifacts?|artefacts?)\b|\b(?:inlays?|inlaid|objects?|artifacts?|artefacts?)\s+(?:with\s+)?(?:mother[-\s]?of[-\s]?pearl|nacre|abalone)\b|\b(?:shell|iridescent)\s+inlays?\b/.test(s)
    || /(?:贝母|珍珠母|螺钿|螺鈿|鲍贝).{0,12}(?:镶嵌|嵌|盒|器|饰|片)|(?:镶嵌|嵌|盒|器|饰|片).{0,12}(?:贝母|珍珠母|螺钿|螺鈿|鲍贝)/.test(s);
  const isMetalWeaponObject = /\b(?:bronze|iron|steel|silver|gold|copper|metal|gilt|silver[-\s]?gilt)\s+(?:swords?|daggers?|knives?|blades?|spearheads?|lances?|spears?|halberds?|axeheads?|shields?|firearms?|guns?|pistols?|rifles?|muskets?|crossbows?|weapons?)\b|\b(?:swords?|daggers?|knives?|blades?|spearheads?|lances?|spears?|halberds?|axeheads?|shields?|firearms?|guns?|pistols?|rifles?|muskets?|crossbows?|weapons?)\s+(?:made\s+of\s+|in\s+|of\s+)?(?:bronze|iron|steel|silver|gold|copper|metal|gilt|silver[-\s]?gilt)\b/.test(s)
    || /(?:青铜|铁|钢|银|金|铜|金属).{0,12}(?:剑|刀|刃|矛|戈|戟|钺|盾|盾牌|火枪|火器|枪械|兵器)|(?:剑|刀|刃|矛|戈|戟|钺|盾|盾牌|火枪|火器|枪械|兵器).{0,12}(?:青铜|铁|钢|银|金|铜|金属)/.test(s);
  if (has('玻璃展柜', '玻璃柜', '玻璃罩', '展柜', '展示柜', '陈列柜', '柜内', '罩内', '亚克力罩', '透明罩', '保护罩', 'display case', 'display cabinet', 'display drawer', 'glass case', 'glasscase', 'vitrine', 'showcase') || isBehindGlass) return GUIDES.glasscase;
  if (isTransparentMaterialObject) return GUIDES.transparent;
  if (isReflectiveMaterialObject || isIridescentInlayObject || isMetalWeaponObject || isAwardCupObject) return GUIDES.reflective;
  if (isInstrumentObject) return GUIDES.instrument;
  if (isShadowPuppetObject) return GUIDES.flat;
  if (isFootwearObject || isSmallPortableObject || isSmallToyObject || isSmallToolObject || isSmallLightingObject || isSmallNaturalSpecimen) return GUIDES.small;
  if (isChineseStoneRelief) return GUIDES.sculpture;
  if (has('画', '帛', '书法', '卷', '平面', '版画', '浮世绘', '拓片', '碑拓', '织物', '织锦', '刺绣', '地毯', '唐卡', '皮影', '影偶', '海报', '照片', '钱币', '铜钱', '古钱', '硬币', '纸币', '纸钞', '钞票', '金币', '银币', '纪念币', '币章', '绢本', '纸本', '写本', '抄本', '手稿', '档案', '文献', '文件', '古籍', '善本', '古书', '线装书', '书籍', '书页', '残页', '书信', '信札', '信件', '日记', '报纸', '报刊', '剪报', '传单', '宣传单', '小册子', '票据', '证书', '明信片', '贺卡', '节日卡', '圣诞卡', '新年贺卡', '日历', '月历', '年历', '月份牌', '历书', '通书', '黄历', '相册', '影集', '摄影集', '照片书', '剪贴簿', '邀请函', '请柬', '名片', '商业卡', '烟卡', '纸牌', '扑克牌', '塔罗牌', '节目单', '戏单', '菜单', '图录', '展览图录', '拍卖图录', '馆藏图录', '目录册', '地图', '图纸', '简牍', '竹简', '木牍', '经折', '立轴', '屏风', '册页', '扇面', '古籍装帧', '装帧', '书封', '书皮', '服饰', '袍服', '龙袍', '衣冠', '衣裙', '旗袍', '和服', '法衣', '祭服', '祭披', '马赛克', '镶嵌画', '彩色玻璃窗', '彩绘玻璃窗', '玻璃彩窗', '玻璃窗饰', '瓷砖', '琉璃砖', '壁砖', '铺地砖', 'scroll', 'flat', 'manuscript', 'calligraphy', 'map') || isFlatMedia || isMusicScoreFlatMedia || isAudioRecordFlatMedia || isGameCardFlatMedia || isCalendarFlatMedia || isTicketCouponFlatMedia || isFlatTextileAccessory || isFlatTextileCovering || isFlatSpecimen || isFlatNaturalHistoryGraphic) return GUIDES.flat;
  if (has('雕', '塑', '俑', '像', '佛', '面具', '能面', '能乐面', '伎乐面', '舞乐面', '沙布提', '乌沙布提', '木雕', '牙雕', '骨雕', '石膏像', '石膏雕像', '石膏翻模', '雕塑复制件', '碑', '碑刻', '墓志', '画像石', '画像砖', '建筑构件', '柱头', '门楣', 'stone carving', 'stone stele', 'stele', 'stela', 'inscription slab', 'statue', 'sculpt', 'sculpture', 'relief', 'figure', 'figurine', 'ushabti', 'shabti', 'shawabti', 'carved figure', 'wood carving', 'wooden carving', 'ivory carving', 'bone carving', 'horn carving', 'plaster cast', 'sculpture cast', 'cast sculpture', 'cast statue', 'bust', 'mask', 'buddha', 'bodhisattva', 'terracotta warrior', 'terracotta army', 'architectural fragment', 'column capital', 'stone capital', 'frieze') || isTaxidermySpecimen || (isThreeDimNaturalSpecimen && !isLargeSpecimen)) return GUIDES.sculpture;
  if (isLargeObject) return GUIDES.large;
  return GUIDES.small;
}

export function captureGuideHintFromArtifact(artifact?: CaptureGuideArtifactLike | null): string {
  if (!artifact) return '';
  const tags = artifact.tags || {};
  const labels = (artifact.labels || []).map((label) => label.rawText || '');
  return [
    artifact.nameZh,
    artifact.nameEn,
    tags.nameEn,
    ...(tags.aliases || []),
    ...labels,
    tags.category,
    ...(tags.material || []),
    tags.culture,
    tags.findspot,
    tags.dimensions,
    tags.dynastyLabel,
    artifact.museum,
    artifact.exhibition,
  ].filter(Boolean).join(' ');
}

function guideByStructuredCategory(category?: string): CaptureGuide | null {
  switch ((category || '').trim().toLowerCase()) {
    case '造像':
    case '陶塑':
    case '泥塑':
    case '彩塑':
    case '石刻':
    case 'relief':
    case 'reliefs':
    case 'relief panel':
    case 'relief panels':
    case 'bas-relief':
    case 'bas relief':
    case 'architectural fragment':
    case 'architectural fragments':
    case 'architectural element':
    case 'architectural elements':
    case 'column capital':
    case 'column capitals':
    case 'stone capital':
    case 'stone capitals':
    case 'frieze':
    case 'friezes':
    case 'lintel':
    case 'lintels':
    case 'stone tablet':
    case 'stone tablets':
    case 'inscribed slab':
    case 'inscribed slabs':
    case 'inscribed stone slab':
    case 'inscribed stone slabs':
    case 'inscribed plaque':
    case 'inscribed plaques':
    case 'stone plaque':
    case 'stone plaques':
    case 'memorial plaque':
    case 'memorial plaques':
    case 'commemorative plaque':
    case 'commemorative plaques':
    case 'inscribed stone plaque':
    case 'inscribed stone plaques':
    case '石碑':
    case '石牌':
    case '石匾':
    case '碑额':
    case '木雕':
    case '牙雕':
    case '骨雕':
    case 'wood carving':
    case 'wood carvings':
    case 'wooden carving':
    case 'wooden carvings':
    case 'ivory carving':
    case 'ivory carvings':
    case 'bone carving':
    case 'bone carvings':
    case 'horn carving':
    case 'horn carvings':
    case 'carved figure':
    case 'carved figures':
    case '石膏像':
    case '石膏雕像':
    case '石膏翻模':
    case '雕塑复制件':
    case 'plaster cast':
    case 'plaster casts':
    case 'sculpture cast':
    case 'sculpture casts':
    case 'cast sculpture':
    case 'cast sculptures':
    case 'cast statue':
    case 'cast statues':
    case 'mask':
    case 'masks':
    case 'ritual mask':
    case 'ritual masks':
    case 'funerary mask':
    case 'funerary masks':
    case 'noh mask':
    case 'noh masks':
    case 'bugaku mask':
    case 'bugaku masks':
    case 'theater mask':
    case 'theater masks':
    case 'theatre mask':
    case 'theatre masks':
    case '能面':
    case '能乐面':
    case '伎乐面':
    case '舞乐面':
    case 'ushabti':
    case 'ushabtis':
    case 'shabti':
    case 'shabtis':
    case 'shawabti':
    case 'shawabtis':
    case '沙布提':
    case '沙布提俑':
    case '乌沙布提':
    case '乌沙布提俑':
      return GUIDES.sculpture;
    case '书画':
    case 'gouache':
    case 'gouaches':
    case 'pastel':
    case 'pastels':
    case 'pastel drawing':
    case 'pastel drawings':
    case 'charcoal drawing':
    case 'charcoal drawings':
    case 'ink drawing':
    case 'ink drawings':
    case '钱币':
    case 'coin':
    case 'coins':
    case 'coinage':
    case 'medal':
    case 'medals':
    case 'medallion':
    case 'medallions':
    case 'numismatic':
    case 'numismatic object':
    case 'numismatic objects':
    case 'trade token':
    case 'trade tokens':
    case 'order and decoration':
    case 'orders and decorations':
    case 'military decoration':
    case 'military decorations':
    case 'service medal':
    case 'service medals':
    case 'campaign medal':
    case 'campaign medals':
    case 'commemorative medal':
    case 'commemorative medals':
    case 'order badge':
    case 'order badges':
    case '勋章':
    case '勋饰':
    case '纪念章':
    case 'token':
    case 'tokens':
    case 'banknote':
    case 'banknotes':
    case 'bank note':
    case 'bank notes':
    case 'paper money':
    case 'paper currency':
    case 'currency note':
    case 'currency notes':
    case '纸币':
    case '纸钞':
    case '钞票':
    case '织绣':
    case '甲骨':
    case '拓本':
    case '摄影':
    case '底片':
    case '玻璃干版':
    case '印刷品':
    case '宣传品':
    case '织物':
    case '纺织品':
    case '刺绣':
    case '挂毯':
    case '地毯':
    case '服饰':
    case '披肩':
    case '围巾':
    case '头巾':
    case '蕾丝':
    case '花边':
    case '围裙':
    case '屏风':
    case '唐卡':
    case '册页':
    case 'thangka':
    case 'thangkas':
    case 'icon':
    case 'icons':
    case 'painted icon':
    case 'painted icons':
    case 'religious icon':
    case 'religious icons':
    case 'altarpiece':
    case 'altarpieces':
    case 'triptych':
    case 'triptychs':
    case 'diptych':
    case 'diptychs':
    case '扇面':
    case '折扇':
    case '团扇':
    case '皮影':
    case '影偶':
    case '地图':
    case '图集':
    case '蓝图':
    case '平面图':
    case 'screen':
    case 'screens':
    case 'folding screen':
    case 'folding screens':
    case 'painted screen':
    case 'painted screens':
    case 'album leaf':
    case 'album leaves':
    case 'manuscript':
    case 'manuscripts':
    case 'illuminated manuscript':
    case 'illuminated manuscripts':
    case 'manuscript leaf':
    case 'manuscript leaves':
    case 'book leaf':
    case 'book leaves':
    case 'folio':
    case 'folios':
    case 'folio leaf':
    case 'folio leaves':
    case 'codex':
    case 'codices':
    case 'rare book':
    case 'rare books':
    case 'printed book':
    case 'printed books':
    case 'book':
    case 'books':
    case 'incunabulum':
    case 'incunabula':
    case 'bookbinding':
    case 'bookbindings':
    case 'book binding':
    case 'book bindings':
    case 'manuscript binding':
    case 'manuscript bindings':
    case 'codex binding':
    case 'codex bindings':
    case 'binding':
    case 'bindings':
    case 'book cover':
    case 'book covers':
    case 'photograph album':
    case 'photograph albums':
    case 'photo album':
    case 'photo albums':
    case 'contact sheet':
    case 'contact sheets':
    case 'proof sheet':
    case 'proof sheets':
    case 'negative strip':
    case 'negative strips':
    case 'film strip':
    case 'film strips':
    case 'film negative':
    case 'film negatives':
    case 'transparency':
    case 'transparencies':
    case '35mm slide':
    case '35mm slides':
    case 'photo book':
    case 'photo books':
    case 'photobook':
    case 'photobooks':
    case 'autograph album':
    case 'autograph albums':
    case 'scrapbook':
    case 'scrapbooks':
    case '相册':
    case '影集':
    case '摄影集':
    case '照片书':
    case '剪贴簿':
    case '古籍':
    case '善本':
    case '古书':
    case '线装书':
    case '书籍':
    case '古籍装帧':
    case '装帧':
    case '书封':
    case '书皮':
    case '封面':
    case '写本':
    case '手稿':
    case '手稿页':
    case '古籍残页':
    case '残页':
    case 'fan':
    case 'fans':
    case 'folding fan':
    case 'folding fans':
    case 'hand fan':
    case 'hand fans':
    case 'fan leaf':
    case 'fan leaves':
    case 'fan painting':
    case 'fan paintings':
    case 'shadow puppet':
    case 'shadow puppets':
    case 'map':
    case 'maps':
    case 'atlas':
    case 'atlases':
    case 'cartographic material':
    case 'cartographic materials':
    case 'blueprint':
    case 'blueprints':
    case 'architectural plan':
    case 'architectural plans':
    case 'site plan':
    case 'site plans':
    case 'floor plan':
    case 'floor plans':
    case 'catalog':
    case 'catalogs':
    case 'catalogue':
    case 'catalogues':
    case 'exhibition catalog':
    case 'exhibition catalogs':
    case 'exhibition catalogue':
    case 'exhibition catalogues':
    case 'collection catalog':
    case 'collection catalogs':
    case 'collection catalogue':
    case 'collection catalogues':
    case 'auction catalog':
    case 'auction catalogs':
    case 'auction catalogue':
    case 'auction catalogues':
    case 'trade catalog':
    case 'trade catalogs':
    case 'trade catalogue':
    case 'trade catalogues':
    case 'sales catalog':
    case 'sales catalogs':
    case 'sales catalogue':
    case 'sales catalogues':
    case 'playing card':
    case 'playing cards':
    case 'tarot card':
    case 'tarot cards':
    case 'game card':
    case 'game cards':
    case 'card game':
    case 'card games':
    case '纸牌':
    case '扑克牌':
    case '塔罗牌':
    case '游戏卡':
    case '图录':
    case '展览图录':
    case '拍卖图录':
    case '馆藏图录':
    case '目录册':
    case 'ephemera':
    case 'printed ephemera':
    case 'poster':
    case 'posters':
    case 'woodblock print':
    case 'woodblock prints':
    case 'ukiyo-e print':
    case 'ukiyo-e prints':
    case 'ukiyo e print':
    case 'ukiyo e prints':
    case 'woodcut':
    case 'woodcuts':
    case 'linocut':
    case 'linocuts':
    case 'photogravure':
    case 'photogravures':
    case 'collotype':
    case 'collotypes':
    case 'aquatint':
    case 'aquatints':
    case 'mezzotint':
    case 'mezzotints':
    case 'drypoint':
    case 'drypoints':
    case 'monotype':
    case 'monotypes':
    case 'monoprint':
    case 'monoprints':
    case 'lithograph':
    case 'lithographs':
    case 'etching':
    case 'etchings':
    case 'engraving':
    case 'engravings':
    case 'wood engraving':
    case 'wood engravings':
    case 'screenprint':
    case 'screenprints':
    case 'screen print':
    case 'screen prints':
    case 'silkscreen':
    case 'silkscreens':
    case 'silk screen':
    case 'silk screens':
    case 'silk screen print':
    case 'silk screen prints':
    case 'serigraph':
    case 'serigraphs':
    case '浮世绘':
    case 'photographic negative':
    case 'photographic negatives':
    case 'glass plate negative':
    case 'glass plate negatives':
    case 'lantern slide':
    case 'lantern slides':
    case 'magic lantern slide':
    case 'magic lantern slides':
    case 'daguerreotype':
    case 'daguerreotypes':
    case 'ambrotype':
    case 'ambrotypes':
    case 'tintype':
    case 'tintypes':
    case 'albumen print':
    case 'albumen prints':
    case 'cyanotype':
    case 'cyanotypes':
    case 'stereograph':
    case 'stereographs':
    case 'stereoscopic card':
    case 'stereoscopic cards':
    case 'cabinet card':
    case 'cabinet cards':
    case 'carte-de-visite':
    case 'cartes-de-visite':
    case 'carte de visite':
    case 'cartes de visite':
    case 'broadside':
    case 'broadsides':
    case 'pamphlet':
    case 'pamphlets':
    case 'leaflet':
    case 'leaflets':
    case 'flyer':
    case 'flyers':
    case 'ticket':
    case 'tickets':
    case 'ticket stub':
    case 'ticket stubs':
    case 'admission ticket':
    case 'admission tickets':
    case 'museum ticket':
    case 'museum tickets':
    case 'event ticket':
    case 'event tickets':
    case 'railway ticket':
    case 'railway tickets':
    case 'train ticket':
    case 'train tickets':
    case 'receipt':
    case 'receipts':
    case 'invoice':
    case 'invoices':
    case 'coupon':
    case 'coupons':
    case 'voucher':
    case 'vouchers':
    case 'ration book':
    case 'ration books':
    case 'ration coupon':
    case 'ration coupons':
    case 'ration ticket':
    case 'ration tickets':
    case '门票':
    case '票根':
    case '票券':
    case '收据':
    case '发票':
    case '凭证':
    case '粮票':
    case '布票':
    case 'certificate':
    case 'certificates':
    case 'newspaper':
    case 'newspapers':
    case 'newspaper clipping':
    case 'newspaper clippings':
    case 'press clipping':
    case 'press clippings':
    case 'magazine':
    case 'magazines':
    case 'periodical':
    case 'periodicals':
    case 'serial':
    case 'serials':
    case 'journal':
    case 'journals':
    case 'diary':
    case 'diaries':
    case 'letter':
    case 'letters':
    case 'correspondence':
    case 'personal correspondence':
    case '报纸':
    case '剪报':
    case '期刊':
    case '杂志':
    case '书信':
    case '信札':
    case '通信':
    case 'invitation card':
    case 'invitation cards':
    case 'trade card':
    case 'trade cards':
    case 'business card':
    case 'business cards':
    case 'visiting card':
    case 'visiting cards':
    case 'calling card':
    case 'calling cards':
    case 'cigarette card':
    case 'cigarette cards':
    case 'playbill':
    case 'playbills':
    case 'theater program':
    case 'theater programs':
    case 'theatre program':
    case 'theatre programs':
    case 'programme':
    case 'programmes':
    case 'program':
    case 'programs':
    case 'menu':
    case 'menus':
    case 'restaurant menu':
    case 'restaurant menus':
    case '节目单':
    case '戏单':
    case '菜单':
    case '邀请函':
    case '请柬':
    case '名片':
    case '商业卡':
    case '烟卡':
    case 'brochure':
    case 'brochures':
    case 'postcard':
    case 'postcards':
    case 'picture postcard':
    case 'picture postcards':
    case 'souvenir postcard':
    case 'souvenir postcards':
    case '明信片':
    case '美术明信片':
    case '风景明信片':
    case 'greeting card':
    case 'greeting cards':
    case 'holiday card':
    case 'holiday cards':
    case 'christmas card':
    case 'christmas cards':
    case 'new year card':
    case 'new year cards':
    case '贺卡':
    case '节日卡':
    case '圣诞卡':
    case '新年贺卡':
    case 'calendar':
    case 'calendars':
    case 'wall calendar':
    case 'wall calendars':
    case 'desk calendar':
    case 'desk calendars':
    case 'pocket calendar':
    case 'pocket calendars':
    case 'calendar card':
    case 'calendar cards':
    case 'calendar leaf':
    case 'calendar leaves':
    case 'almanac':
    case 'almanacs':
    case '日历':
    case '月历':
    case '年历':
    case '月份牌':
    case '历书':
    case '通书':
    case '黄历':
    case 'postage stamp':
    case 'postage stamps':
    case 'philatelic material':
    case 'philatelic materials':
    case 'first day cover':
    case 'first day covers':
    case 'postal cover':
    case 'postal covers':
    case 'envelope':
    case 'envelopes':
    case '乐谱':
    case '曲谱':
    case '手稿乐谱':
    case 'musical score':
    case 'musical scores':
    case 'manuscript score':
    case 'manuscript scores':
    case 'sheet music':
    case 'music manuscript':
    case 'music manuscripts':
    case 'songbook':
    case 'songbooks':
    case 'hymnal':
    case 'hymnals':
    case 'libretto':
    case 'librettos':
    case 'libretti':
    case '唱本':
    case '歌本':
    case '赞美诗集':
    case '唱片':
    case '黑胶唱片':
    case '留声机唱片':
    case '唱片封套':
    case 'phonograph record':
    case 'phonograph records':
    case 'gramophone record':
    case 'gramophone records':
    case 'vinyl record':
    case 'vinyl records':
    case 'shellac record':
    case 'shellac records':
    case '78 rpm record':
    case '78 rpm records':
    case 'lp record':
    case 'lp records':
    case 'record sleeve':
    case 'record sleeves':
    case 'carpet':
    case 'carpets':
    case 'rug':
    case 'rugs':
    case 'prayer rug':
    case 'prayer rugs':
    case 'kilim':
    case 'kilims':
    case 'vestment':
    case 'vestments':
    case 'liturgical vestment':
    case 'liturgical vestments':
    case 'ecclesiastical vestment':
    case 'ecclesiastical vestments':
    case 'chasuble':
    case 'chasubles':
    case 'dalmatic':
    case 'dalmatics':
    case 'stole':
    case 'stoles':
    case 'liturgical stole':
    case 'liturgical stoles':
    case 'cope':
    case 'copes':
    case '法衣':
    case '祭服':
    case '祭披':
    case 'shawl':
    case 'shawls':
    case 'sash':
    case 'sashes':
    case 'scarf':
    case 'scarves':
    case 'headscarf':
    case 'headscarves':
    case 'lace':
    case 'lacework':
    case 'sampler':
    case 'samplers':
    case 'apron':
    case 'aprons':
    case '被面':
    case '拼布被':
    case '绗缝被':
    case '草席':
    case '竹席':
    case '编席':
    case '席垫':
    case 'quilt':
    case 'quilts':
    case 'coverlet':
    case 'coverlets':
    case 'bedcover':
    case 'bedcovers':
    case 'bedspread':
    case 'bedspreads':
    case 'mat':
    case 'mats':
    case 'matting':
    case 'woven mat':
    case 'woven mats':
    case 'reed mat':
    case 'reed mats':
    case 'bamboo mat':
    case 'bamboo mats':
    case 'straw mat':
    case 'straw mats':
    case 'herbarium sheet':
    case 'herbarium sheets':
    case 'herbarium specimen':
    case 'herbarium specimens':
    case 'specimen sheet':
    case 'specimen sheets':
    case 'plant specimen sheet':
    case 'plant specimen sheets':
    case 'botanical illustration':
    case 'botanical illustrations':
    case 'botanical plate':
    case 'botanical plates':
    case 'natural history illustration':
    case 'natural history illustrations':
    case 'entomology drawer':
    case 'entomology drawers':
    case 'insect drawer':
    case 'insect drawers':
    case '植物图谱':
    case '植物画':
    case '植物标本夹页':
    case '标本夹页':
    case '昆虫标本抽屉':
      return GUIDES.flat;
    case '家具':
    case 'furniture':
    case 'chair':
    case 'chairs':
    case 'throne':
    case 'thrones':
    case 'cabinet':
    case 'cabinets':
    case 'wardrobe':
    case 'wardrobes':
    case 'chest':
    case 'chests':
    case 'table':
    case 'tables':
    case 'desk':
    case 'desks':
    case 'bed':
    case 'beds':
    case 'bench':
    case 'benches':
    case 'stool':
    case 'stools':
    case '青铜器':
    case '乐器':
    case 'musical instrument':
    case 'musical instruments':
    case 'stringed instrument':
    case 'stringed instruments':
    case 'plucked instrument':
    case 'plucked instruments':
    case 'lute':
    case 'lutes':
    case 'lyre':
    case 'lyres':
    case 'harp':
    case 'harps':
    case 'zither':
    case 'zithers':
    case 'pipa':
    case 'pipas':
    case 'guqin':
    case 'guqins':
    case 'flute':
    case 'flutes':
    case 'violin':
    case 'violins':
    case 'cello':
    case 'cellos':
    case 'guitar':
    case 'guitars':
    case 'drum':
    case 'drums':
    case 'gong':
    case 'gongs':
    case 'temple bell':
    case 'temple bells':
    case 'standing bell':
    case 'standing bells':
    case 'ceremonial bell':
    case 'ceremonial bells':
    case 'chime bell':
    case 'chime bells':
    case 'bell chime':
    case 'bell chimes':
    case 'bianzhong':
    case '编钟':
    case '钟磬':
    case '铜钟':
    case '笛':
    case '箫':
    case '鼓':
    case '铜鼓':
    case '大鼓':
    case '建鼓':
    case '鼍鼓':
    case '编磬':
    case '石磬':
    case '铜锣':
    case '古筝':
    case '扬琴':
    case '小提琴':
    case '大提琴':
      return GUIDES.large;
    case '仪器':
    case '科学仪器':
    case '天文仪器':
    case '航海仪器':
    case '计时仪器':
    case '钟表':
    case '座钟':
    case '怀表':
    case '天球仪':
    case '地球仪':
    case '浑天仪':
    case '星盘':
    case '日晷':
    case '罗盘':
    case '指南针':
    case '六分仪':
    case '象限仪':
    case '显微镜':
    case '望远镜':
    case '光学仪器':
    case '摄影器材':
    case '电影器材':
    case '照相机':
    case '摄影机':
    case '放映机':
    case '幻灯机':
    case '镜头':
    case 'scientific instrument':
    case 'scientific instruments':
    case 'timepiece':
    case 'timepieces':
    case 'clock':
    case 'clocks':
    case 'watch':
    case 'watches':
    case 'pocket watch':
    case 'pocket watches':
    case 'astrolabe':
    case 'astrolabes':
    case 'sundial':
    case 'sundials':
    case 'compass':
    case 'compasses':
    case 'sextant':
    case 'sextants':
    case 'quadrant':
    case 'quadrants':
    case 'armillary sphere':
    case 'armillary spheres':
    case 'orrery':
    case 'orreries':
    case 'celestial globe':
    case 'celestial globes':
    case 'terrestrial globe':
    case 'terrestrial globes':
    case 'globe':
    case 'globes':
    case 'microscope':
    case 'microscopes':
    case 'telescope':
    case 'telescopes':
    case 'navigational instrument':
    case 'navigational instruments':
    case 'measuring instrument':
    case 'measuring instruments':
    case 'photographic instrument':
    case 'photographic instruments':
    case 'optical instrument':
    case 'optical instruments':
    case 'camera':
    case 'cameras':
    case 'camera lens':
    case 'camera lenses':
    case 'photographic lens':
    case 'photographic lenses':
    case 'projector':
    case 'projectors':
    case 'film projector':
    case 'film projectors':
    case 'slide projector':
    case 'slide projectors':
    case 'magic lantern':
    case 'magic lanterns':
    case 'cinematograph':
    case 'cinematographs':
      return GUIDES.instrument;
    case '模型':
    case '沙盘':
    case '建筑模型':
    case '场景模型':
    case '微缩模型':
    case '微缩景观':
    case '船模':
    case '车模':
    case 'architectural model':
    case 'architectural models':
    case 'scale model':
    case 'scale models':
    case 'ship model':
    case 'ship models':
    case 'boat model':
    case 'boat models':
    case 'train model':
    case 'train models':
    case 'city model':
    case 'city models':
    case 'site model':
    case 'site models':
    case 'building model':
    case 'building models':
    case 'diorama':
    case 'dioramas':
    case 'maquette':
    case 'maquettes':
    case '交通工具':
    case '车马':
    case '车船':
    case '车辆':
    case '车驾':
    case '马车':
    case '战车':
    case '船':
    case '舟':
    case '船只':
    case 'chariot':
    case 'chariots':
    case 'ceremonial chariot':
    case 'ceremonial chariots':
    case 'war chariot':
    case 'war chariots':
    case 'carriage':
    case 'carriages':
    case 'cart':
    case 'carts':
    case 'wagon':
    case 'wagons':
    case 'coach':
    case 'coaches':
    case 'vehicle':
    case 'vehicles':
    case 'boat':
    case 'boats':
    case 'ship':
    case 'ships':
    case 'watercraft':
    case 'canoe':
    case 'canoes':
    case 'barge':
    case 'barges':
    case '装置':
    case '装置艺术':
    case '大型装置':
    case '沉浸式装置':
    case '场景装置':
    case 'installation':
    case 'installations':
    case 'installation art':
    case 'immersive installation':
    case 'immersive installations':
    case 'site-specific installation':
    case 'site-specific installations':
    case 'room-sized installation':
    case 'room-sized installations':
    case '甲胄':
    case '盔甲':
    case '铠甲':
    case 'armor':
    case 'armour':
    case 'arms and armor':
    case 'arms and armour':
    case 'suit of armor':
    case 'suit of armour':
    case 'samurai armor':
    case 'samurai armour':
    case 'helmet':
    case 'helmets':
    case 'war helmet':
    case 'war helmets':
    case 'ceremonial helmet':
    case 'ceremonial helmets':
    case 'kabuto':
    case '头盔':
    case '兜鍪':
    case '胄':
    case '棺椁':
    case '棺槨':
    case '木棺':
    case '石棺':
    case '木乃伊棺':
    case '木乃伊':
    case '木乃伊遗存':
    case 'sarcophagus':
    case 'sarcophagi':
    case 'coffin':
    case 'coffins':
    case 'mummy':
    case 'mummies':
    case 'human mummy':
    case 'human mummies':
    case 'animal mummy':
    case 'animal mummies':
    case 'mummified remains':
    case 'mummy case':
    case 'mummy cases':
    case 'mummy coffin':
    case 'mummy coffins':
      return GUIDES.large;
    case '标本':
    case '自然史标本':
    case 'natural history specimen':
    case 'natural history specimens':
    case 'mineral specimen':
    case 'mineral specimens':
    case 'rock specimen':
    case 'rock specimens':
    case 'rock sample':
    case 'rock samples':
    case 'meteorite fragment':
    case 'meteorite fragments':
    case 'moon rock':
    case 'moon rock fragment':
    case 'moon rock fragments':
    case 'quartz crystal':
    case 'quartz crystals':
    case 'crystal cluster':
    case 'crystal clusters':
    case 'shell specimen':
    case 'shell specimens':
    case 'marine shell specimen':
    case 'marine shell specimens':
    case 'marine shell':
    case 'marine shells':
    case 'sea shell':
    case 'sea shells':
    case 'conch shell':
    case 'conch shells':
    case 'coral specimen':
    case 'coral specimens':
    case 'coral fragment':
    case 'coral fragments':
    case 'fossil tooth':
    case 'fossil teeth':
    case 'fossil shell':
    case 'fossil bone':
    case 'fossil bones':
    case 'fossil egg':
    case 'fossil eggs':
    case 'dinosaur egg':
    case 'dinosaur eggs':
    case 'dinosaur bone':
    case 'dinosaur bones':
    case 'ammonite fossil':
    case 'trilobite fossil':
    case '矿物标本':
    case '矿石标本':
    case '岩石标本':
    case '陨石碎片':
    case '月岩样本':
    case '水晶簇':
    case '贝壳标本':
    case '贝类标本':
    case '海螺标本':
    case '珊瑚标本':
    case '牙齿化石':
    case '化石牙':
    case '化石骨':
    case '化石蛋':
    case '恐龙蛋':
    case '恐龙骨':
    case '菊石化石':
    case '三叶虫化石':
    case '工具':
    case '钥匙':
    case '锁具':
    case '锁':
    case '挂锁':
    case 'key':
    case 'keys':
    case 'door key':
    case 'door keys':
    case 'lock':
    case 'locks':
    case 'door lock':
    case 'door locks':
    case 'padlock':
    case 'padlocks':
    case '玩具':
    case '玩偶':
    case '木偶':
    case '偶人':
    case '棋子':
    case '骰子':
    case 'toy':
    case 'toys':
    case 'doll':
    case 'dolls':
    case 'puppet':
    case 'puppets':
    case 'game piece':
    case 'game pieces':
    case 'gaming piece':
    case 'gaming pieces':
    case 'dice':
    case '烟具':
    case '烟斗':
    case '烟管':
    case '水烟袋':
    case 'smoking pipe':
    case 'smoking pipes':
    case 'tobacco pipe':
    case 'tobacco pipes':
    case 'hookah':
    case 'hookahs':
    case 'water pipe':
    case 'water pipes':
    case 'opium pipe':
    case 'opium pipes':
    case '灯具':
    case '宫灯':
    case '油灯':
    case '铜灯':
    case '灯盏':
    case '灯台':
    case '烛台':
    case '提灯':
    case 'lamp':
    case 'lamps':
    case 'oil lamp':
    case 'oil lamps':
    case 'mosque lamp':
    case 'mosque lamps':
    case 'lantern':
    case 'lanterns':
    case 'candlestick':
    case 'candlesticks':
    case 'candelabrum':
    case 'candelabra':
    case 'rushlight':
    case 'rushlights':
    case '鞋履':
    case '鞋':
    case '靴':
    case '靴子':
    case '绣鞋':
    case '弓鞋':
    case '三寸金莲':
    case 'footwear':
    case 'shoe':
    case 'shoes':
    case 'embroidered shoe':
    case 'embroidered shoes':
    case 'lotus shoe':
    case 'lotus shoes':
    case 'platform shoe':
    case 'platform shoes':
    case 'ceremonial shoe':
    case 'ceremonial shoes':
    case 'boot':
    case 'boots':
    case 'sandal':
    case 'sandals':
    case 'slipper':
    case 'slippers':
    case 'moccasin':
    case 'moccasins':
      return GUIDES.small;
    case '佩饰':
    case '首饰':
    case '饰品':
    case '耳饰':
    case '耳珰':
    case '头饰':
    case '冠帽':
    case '王冠':
    case '冠冕':
    case '礼冠':
    case '帽子':
    case '礼帽':
    case 'headdress':
    case 'headdresses':
    case 'headgear':
    case 'ceremonial headdress':
    case 'ritual headdress':
    case 'crown':
    case 'crowns':
    case 'ceremonial crown':
    case 'ritual crown':
    case 'diadem':
    case 'diadems':
    case 'hat':
    case 'hats':
    case 'ceremonial hat':
    case 'ritual hat':
    case 'cap':
    case 'caps':
    case '印章':
    case '印玺':
    case '玉印':
    case '玺印':
    case '容器':
    case '瓶':
    case '罐':
    case '碗':
    case '杯':
    case '高脚杯':
    case '圣杯':
    case '壶':
    case '盘':
    case '碟':
    case '香炉':
    case '熏炉':
    case '陶器':
    case '瓷器':
    case '玉器':
    case '陶罐':
    case '陶瓶':
    case '陶壶':
    case '瓷瓶':
    case '瓷壶':
    case '青花瓷瓶':
    case '盒':
    case '盒子':
    case '匣':
    case '匣子':
    case '香盒':
    case '经盒':
    case '舍利盒':
    case '圣物匣':
    case '篮':
    case '筐':
    case '竹篮':
    case '藤篮':
    case '编篮':
    case '托盘':
    case 'jewelry':
    case 'jewellery':
    case 'ornament':
    case 'ornaments':
    case 'personal ornament':
    case 'personal ornaments':
    case 'adornment':
    case 'adornments':
    case 'pendant':
    case 'pendants':
    case 'amulet':
    case 'amulets':
    case 'bead':
    case 'beads':
    case 'necklace':
    case 'necklaces':
    case 'ring':
    case 'rings':
    case 'earring':
    case 'earrings':
    case 'ear ornament':
    case 'ear ornaments':
    case 'ear spool':
    case 'ear spools':
    case 'ear flare':
    case 'ear flares':
    case 'ear plug':
    case 'ear plugs':
    case 'ear pendant':
    case 'ear pendants':
    case 'brooch':
    case 'brooches':
    case 'bracelet':
    case 'bracelets':
    case 'torc':
    case 'torcs':
    case 'torque':
    case 'torques':
    case 'armlet':
    case 'armlets':
    case 'anklet':
    case 'anklets':
    case 'neck ring':
    case 'neck rings':
    case 'belt buckle':
    case 'belt buckles':
    case 'dress buckle':
    case 'dress buckles':
    case 'shoe buckle':
    case 'shoe buckles':
    case 'buckle':
    case 'buckles':
    case 'hairpin':
    case 'hairpins':
    case 'hair ornament':
    case 'hair ornaments':
    case 'comb':
    case 'combs':
    case 'tiara':
    case 'tiaras':
    case 'fibula':
    case 'fibulae':
    case 'fibulas':
    case 'belt hook':
    case 'belt hooks':
    case 'badge':
    case 'badges':
    case 'lapel badge':
    case 'lapel badges':
    case 'hat badge':
    case 'hat badges':
    case 'cap badge':
    case 'cap badges':
    case 'button badge':
    case 'button badges':
    case 'campaign button':
    case 'campaign buttons':
    case 'dress button':
    case 'dress buttons':
    case 'button':
    case 'buttons':
    case 'insignia':
    case 'regalia':
    case 'royal regalia':
    case 'scepter':
    case 'scepters':
    case 'sceptre':
    case 'sceptres':
    case '徽饰':
    case '权杖':
    case 'lapel pin':
    case 'lapel pins':
    case 'hat pin':
    case 'hat pins':
    case 'tie pin':
    case 'tie pins':
    case 'netsuke':
    case 'netsukes':
    case 'ojime':
    case 'ojime bead':
    case 'ojime beads':
    case 'cameo':
    case 'cameos':
    case 'scarab':
    case 'scarabs':
    case 'scarab amulet':
    case 'scarab amulets':
    case '徽章':
    case '像章':
    case '胸章':
    case '襟章':
    case '纽扣':
    case '钮扣':
    case '衣扣':
    case 'cylinder seal':
    case 'cylinder seals':
    case 'stamp seal':
    case 'stamp seals':
    case 'seal':
    case 'seals':
    case 'seal stamp':
    case 'seal stamps':
    case 'seal stone':
    case 'seal stones':
    case 'seal matrix':
    case 'seal matrices':
    case 'seal impression':
    case 'seal impressions':
    case 'intaglio':
    case 'intaglios':
    case 'scarab seal':
    case 'scarab seals':
    case 'scaraboid seal':
    case 'scaraboid seals':
    case '发簪':
    case '发钗':
    case '钗':
    case '梳':
    case '梳子':
    case '带钩':
    case '带扣':
    case '腰带扣':
    case '扣饰':
    case '臂环':
    case '臂钏':
    case '臂镯':
    case '脚镯':
    case '脚环':
    case '踝饰':
    case '踝环':
    case '颈环':
    case '项圈':
    case 'box':
    case 'boxes':
    case 'casket':
    case 'caskets':
    case 'reliquary':
    case 'reliquaries':
    case 'container':
    case 'containers':
    case 'vessel':
    case 'vessels':
    case 'jar':
    case 'jars':
    case 'bowl':
    case 'bowls':
    case 'cup':
    case 'cups':
    case 'chalice':
    case 'chalices':
    case 'goblet':
    case 'goblets':
    case 'vase':
    case 'vases':
    case 'ewer':
    case 'ewers':
    case 'dish':
    case 'dishes':
    case 'plate':
    case 'plates':
    case 'bottle':
    case 'bottles':
    case 'pot':
    case 'pots':
    case 'tray':
    case 'trays':
    case 'basket':
    case 'baskets':
    case 'basketry':
    case 'woven basket':
    case 'woven baskets':
    case 'basketry tray':
    case 'basketry trays':
    case 'basketry container':
    case 'basketry containers':
    case 'coiled basket':
    case 'coiled baskets':
    case 'wicker basket':
    case 'wicker baskets':
    case 'splint basket':
    case 'splint baskets':
    case 'snuff box':
    case 'snuff boxes':
    case 'snuff bottle':
    case 'snuff bottles':
    case '文具盒':
    case '文房盒':
    case '笔筒':
    case '笔洗':
    case '水盂':
    case 'censer':
    case 'censers':
    case 'incense burner':
    case 'incense burners':
    case 'thurible':
    case 'thuribles':
    case 'writing box':
    case 'writing boxes':
    case 'brush pot':
    case 'brush pots':
    case 'brush washer':
    case 'brush washers':
    case 'water dropper':
    case 'water droppers':
    case 'ceramic vase':
    case 'ceramic vases':
    case 'ceramic sherd':
    case 'ceramic sherds':
    case 'ceramic fragment':
    case 'ceramic fragments':
    case 'clay tablet':
    case 'clay tablets':
    case 'cuneiform tablet':
    case 'cuneiform tablets':
    case 'terracotta tablet':
    case 'terracotta tablets':
    case 'ostracon':
    case 'ostracons':
    case 'ostraca':
    case 'earthenware cup':
    case 'earthenware cups':
    case 'earthenware sherd':
    case 'earthenware sherds':
    case 'earthenware fragment':
    case 'earthenware fragments':
    case 'stoneware ewer':
    case 'stoneware ewers':
    case 'stoneware fragment':
    case 'stoneware fragments':
    case 'faience vessel':
    case 'faience vessels':
    case 'faience fragment':
    case 'faience fragments':
    case 'pottery sherd':
    case 'pottery sherds':
    case 'pottery fragment':
    case 'pottery fragments':
    case 'potsherd':
    case 'potsherds':
    case 'porcelain vase':
    case 'porcelain vases':
    case 'porcelain dish':
    case 'porcelain dishes':
    case 'porcelain sherd':
    case 'porcelain sherds':
    case 'porcelain fragment':
    case 'porcelain fragments':
    case 'celadon bowl':
    case 'celadon bowls':
    case 'celadon sherd':
    case 'celadon sherds':
    case 'celadon fragment':
    case 'celadon fragments':
    case '陶片':
    case '陶瓷片':
    case '陶器残片':
    case '陶瓷残片':
    case '陶板':
    case '泥板':
    case '楔形文字泥板':
    case '陶片文字':
    case '瓷片':
    case '瓷器残片':
      return GUIDES.small;
    case '漆木器':
    case '金银器':
    case '奖杯':
    case '奖盃':
    case 'trophy':
    case 'trophies':
    case 'award cup':
    case 'award cups':
    case 'prize cup':
    case 'prize cups':
    case 'presentation cup':
    case 'presentation cups':
    case '兵器':
    case '武器':
    case '刀剑':
    case 'sword':
    case 'swords':
    case 'dagger':
    case 'daggers':
    case 'knife':
    case 'knives':
    case 'blade':
    case 'blades':
    case 'spearhead':
    case 'spearheads':
    case 'spear':
    case 'spears':
    case 'lance':
    case 'lances':
    case 'halberd':
    case 'halberds':
    case 'axehead':
    case 'axeheads':
    case 'shield':
    case 'shields':
    case 'firearm':
    case 'firearms':
    case 'gun':
    case 'guns':
    case 'pistol':
    case 'pistols':
    case 'rifle':
    case 'rifles':
    case 'musket':
    case 'muskets':
    case 'crossbow':
    case 'crossbows':
    case 'weapon':
    case 'weapons':
    case '盾':
    case '盾牌':
    case '火枪':
    case '火器':
    case '枪械':
    case 'inro':
    case 'inros':
    case 'inrō':
    case 'inrōs':
    case 'inro case':
    case 'inro cases':
    case 'inrō case':
    case 'inrō cases':
      return GUIDES.reflective;
    default:
      return null;
  }
}

function guideByStructuredMaterial(material?: string[]): CaptureGuide | null {
  const text = (material || []).join(' ').toLowerCase();
  if (!text) return null;
  if (/(?:彩绘玻璃|彩色玻璃|玻璃彩窗|\bstained\s+glass\b|\bpainted\s+glass\s+(?:windows?|panels?)\b)/i.test(text)) {
    return GUIDES.flat;
  }
  if (/(?:玻璃|琉璃|水晶|石英|玛瑙|玉髓|红玉髓|琥珀|透明|半透明|液浸|浸制|福尔马林|酒精保存|液体保存|\bglass\b|\bcrystal\b|\brock\s+crystal\b|\bquartz\b|\bagate\b|\bcarnelian\b|\bchalcedony\b|\bamber\b|\bfossil\s+resin\b|\bacrylic\b|\bplexiglass\b|\bperspex\b|\blucite\b|\btransparent\b|\btranslucent\b|\bwet\s+specimens?\b|\bfluid[-\s]?preserved\b|\bspirit[-\s]?preserved\b|\balcohol[-\s]?preserved\b|\bformalin[-\s]?preserved\b)/i.test(text)) {
    return GUIDES.transparent;
  }
  if (/(?:纸本|纸质|羊皮纸|莎草纸|绢本|绢|帛|丝绸|织物|织锦|刺绣|棉布|棉|麻布|亚麻|羊毛|相纸|竹简|木牍|简牍|\bpaper\b|\bparchment\b|\bvellum\b|\bpapyrus\b|\bcanvas\b|\bsilk\b|\btextiles?\b|\btapestr(?:y|ies)\b|\blinen\b|\bcotton\b|\bwool\b|\bfabrics?\b|\bcloth\b|\bphoto\s+paper\b|\bgelatin\s+silver\s+prints?\b|\bbamboo\s+slips?\b|\bwooden\s+slips?\b)/i.test(text)) {
    return GUIDES.flat;
  }
  if (/(?:高反光|强反光|抛光|镜面|亮釉|釉面|亮漆|漆面|髹漆|大漆|漆器|漆木|珐琅|搪瓷|景泰蓝|贝母|珍珠母|螺钿|螺鈿|鲍贝|鎏金|描金|金箔|银箔|\bhigh[-\s]?gloss\b|\breflective\b|\bspecular\b|\bshiny\b|\bpolished\b|\bmirror[-\s]?polished\b|\bglaz(?:e|ed|ing)\b|\benamels?\b|\benamel(?:ed|led|ware)?\b|\bcloisonn[eé]\b|\bnacre\b|\bmother[-\s]?of[-\s]?pearl\b|\bshell\s+inlays?\b|\binlaid\s+shell\b|\babalone\b|\biridescent\b|\blacquer(?:ed|ware)?\b|\burushi\b|\blust(?:er|re)\b|\bgilded\b|\bgilt\b|\bgold\s+leaf\b|\bsilver\s+leaf\b|\bmetal\s+leaf\b)/i.test(text)) {
    return GUIDES.reflective;
  }
  return null;
}

function isFootwearHint(hint: string): boolean {
  const text = hint.toLowerCase();
  return /\b(?:footwear|shoes?|(?:embroidered|lotus|platform|ceremonial)\s+shoes?|boots?|sandals?|slippers?|moccasins?)\b/.test(text)
    || /鞋履|绣鞋|弓鞋|三寸金莲|鞋|靴/.test(hint);
}

export function selectCaptureGuideForArtifact(artifact?: CaptureGuideArtifactLike | null): CaptureGuide {
  const hint = captureGuideHintFromArtifact(artifact);
  const keywordGuide = selectCaptureGuide(hint);
  if (keywordGuide.kind === 'glasscase' || keywordGuide.kind === 'transparent' || keywordGuide.kind === 'reflective' || keywordGuide.kind === 'flat') return keywordGuide;
  if (keywordGuide.kind === 'small' && isFootwearHint(hint)) return keywordGuide;
  const materialGuide = guideByStructuredMaterial(artifact?.tags?.material);
  if (materialGuide) {
    if (materialGuide.kind === 'reflective' && keywordGuide.kind !== 'small') return keywordGuide;
    return materialGuide;
  }
  const structuredGuide = guideByStructuredCategory(artifact?.tags?.category);
  if (structuredGuide?.kind === 'reflective' && keywordGuide.kind !== 'small') return keywordGuide;
  return structuredGuide || keywordGuide;
}

export function captureGuideBrief(guide: CaptureGuide): string {
  const mode = guide.mode === 'video' ? '录视频' : guide.mode === 'photo' ? '多图' : '视频/多图';
  const parts = [guide.label, mode];
  if (guide.specs.orbits) parts.push(`绕 ${guide.specs.orbits} 圈`);
  if (guide.specs.heights?.length) parts.push(guide.specs.heights.join('、'));
  return parts.join(' · ');
}

export const ALL_GUIDES = GUIDES;
