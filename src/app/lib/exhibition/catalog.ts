// 记忆·知识层：确定性本地库（不联网、可离线）。
// ① 朝代→公元年份映射表（排序键唯一事实源，云脑只吐 dynastyKey 枚举，eraStart 一律本地查表，排序 100% 可复现）。
// ② 器类受控词表（横向对比强关联键，避免「鼎」vs「青铜鼎」碎片化）。
// ③ 常见展馆坐标种子（省一次 geocode；未命中走 resolvePlace）。

export interface DynastyEra { key: string; zh: string; start: number; end: number; approx?: boolean; culture?: string; aliases?: string[] }

// 中国朝代起止公元年份（负=BCE）。夏商西周为文献重构年代（教科书间可差数十年），标 approx，UI 显示「约」。
export const DYNASTY_ERA: DynastyEra[] = [
  { key: 'xia', zh: '夏', start: -2070, end: -1600, approx: true },
  { key: 'shang', zh: '商', start: -1600, end: -1046, approx: true },
  { key: 'western-zhou', zh: '西周', start: -1046, end: -771, approx: true, aliases: ['Western Zhou', 'Western Zhou dynasty'] },
  { key: 'eastern-zhou', zh: '东周', start: -770, end: -256, aliases: ['Eastern Zhou', 'Eastern Zhou dynasty'] },
  { key: 'spring-autumn', zh: '春秋', start: -770, end: -476, aliases: ['Spring and Autumn period'] },
  { key: 'warring-states', zh: '战国', start: -475, end: -221, aliases: ['Warring States', 'Warring States period'] },
  { key: 'qin', zh: '秦', start: -221, end: -206, aliases: ['Qin dynasty'] },
  { key: 'western-han', zh: '西汉', start: -202, end: 8, aliases: ['Western Han', 'Western Han dynasty'] },
  { key: 'xin', zh: '新', start: 9, end: 23 },
  { key: 'eastern-han', zh: '东汉', start: 25, end: 220, aliases: ['Eastern Han', 'Eastern Han dynasty'] },
  { key: 'han', zh: '汉', start: -202, end: 220, aliases: ['Han dynasty'] },
  { key: 'three-kingdoms', zh: '三国', start: 220, end: 280 },
  { key: 'western-jin', zh: '西晋', start: 265, end: 317 },
  { key: 'eastern-jin', zh: '东晋', start: 317, end: 420 },
  { key: 'northern-southern', zh: '南北朝', start: 420, end: 589 },
  { key: 'sui', zh: '隋', start: 581, end: 618 },
  { key: 'tang', zh: '唐', start: 618, end: 907, aliases: ['Tang dynasty'] },
  { key: 'five-dynasties', zh: '五代十国', start: 907, end: 979 },
  { key: 'liao', zh: '辽', start: 907, end: 1125 },
  { key: 'northern-song', zh: '北宋', start: 960, end: 1127, aliases: ['Northern Song', 'Northern Song dynasty'] },
  { key: 'western-xia', zh: '西夏', start: 1038, end: 1227 },
  { key: 'jin-jurchen', zh: '金', start: 1115, end: 1234 },
  { key: 'southern-song', zh: '南宋', start: 1127, end: 1279, aliases: ['Southern Song', 'Southern Song dynasty'] },
  { key: 'song', zh: '宋', start: 960, end: 1279, aliases: ['Song dynasty'] },
  { key: 'yuan', zh: '元', start: 1271, end: 1368, aliases: ['Yuan dynasty'] },
  { key: 'ming', zh: '明', start: 1368, end: 1644, aliases: ['Ming dynasty'] },
  { key: 'qing', zh: '清', start: 1644, end: 1912, aliases: ['Qing dynasty'] },
  { key: 'republic', zh: '民国', start: 1912, end: 1949 },
  // ── 世界古文明（跨文明泳道，绝对公元年；精度受学界争议，标 approx，与中国朝代同轴按公元对齐）──
  { key: 'egypt-old', zh: '古埃及古王国', start: -2686, end: -2181, approx: true, culture: '古埃及', aliases: ['Egyptian Old Kingdom', 'Old Kingdom period'] },
  { key: 'egypt-middle', zh: '古埃及中王国', start: -2055, end: -1650, approx: true, culture: '古埃及', aliases: ['Egyptian Middle Kingdom', 'Middle Kingdom period'] },
  { key: 'egypt-new', zh: '古埃及新王国', start: -1550, end: -1069, approx: true, culture: '古埃及', aliases: ['Egyptian New Kingdom', 'New Kingdom period'] },
  { key: 'sumer', zh: '苏美尔', start: -4500, end: -1900, approx: true, culture: '两河', aliases: ['Sumerian', 'Sumer'] },
  { key: 'babylon', zh: '古巴比伦', start: -1894, end: -1595, approx: true, culture: '两河', aliases: ['Old Babylonian', 'Babylonian'] },
  { key: 'assyria', zh: '亚述', start: -911, end: -609, approx: true, culture: '两河', aliases: ['Assyrian'] },
  { key: 'greece-archaic', zh: '古希腊古风期', start: -800, end: -480, approx: true, culture: '古希腊', aliases: ['Archaic Greece', 'Archaic Greek period'] },
  { key: 'greece-classical', zh: '古希腊古典期', start: -510, end: -323, approx: true, culture: '古希腊', aliases: ['Classical Greece', 'Classical Greek period'] },
  { key: 'greece-hellenistic', zh: '希腊化时代', start: -323, end: -31, approx: true, culture: '古希腊', aliases: ['Hellenistic', 'Hellenistic period'] },
  { key: 'rome-republic', zh: '罗马共和国', start: -509, end: -27, culture: '古罗马', aliases: ['Roman Republic'] },
  { key: 'rome-empire', zh: '罗马帝国', start: -27, end: 476, culture: '古罗马', aliases: ['Roman Empire', 'Imperial Roman'] },
  { key: 'indus', zh: '印度河文明', start: -3300, end: -1300, approx: true, culture: '印度', aliases: ['Indus Valley Civilization', 'Indus civilization'] },
  { key: 'maurya', zh: '孔雀王朝', start: -322, end: -185, approx: true, culture: '印度', aliases: ['Maurya', 'Mauryan'] },
  { key: 'maya-classic', zh: '玛雅古典期', start: 250, end: 900, approx: true, culture: '玛雅', aliases: ['Classic Maya', 'Maya Classic period'] },
  { key: 'aztec', zh: '阿兹特克', start: 1345, end: 1521, approx: true, culture: '阿兹特克', aliases: ['Aztec'] },
  { key: 'inca', zh: '印加', start: 1438, end: 1533, approx: true, culture: '印加', aliases: ['Inca'] },
  { key: 'persia-achaemenid', zh: '波斯阿契美尼德', start: -550, end: -330, approx: true, culture: '波斯', aliases: ['Achaemenid', 'Achaemenid Persian'] },
];

const ERA_BY_KEY = new Map(DYNASTY_ERA.map((d) => [d.key, d]));

export function eraOf(key: string): DynastyEra | null { return ERA_BY_KEY.get(key) || null; }
export function dynastyLabelOf(key: string): string { return ERA_BY_KEY.get(key)?.zh || ''; }
export function isValidDynastyKey(key: string): boolean { return ERA_BY_KEY.has(key); }
export const DYNASTY_KEYS = DYNASTY_ERA.map((d) => d.key);

// 从展签文本确定性抢先命中朝代（'唐'→tang），命中即锚点省云脑。长名先匹配避免「东汉」被「汉」误吃。
const MATCH_ORDER = [...DYNASTY_ERA].sort((a, b) => b.zh.length - a.zh.length);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALIAS_MATCH_ORDER = DYNASTY_ERA
  .flatMap((d) => (d.aliases || []).map((alias) => ({ alias, dynasty: d })))
  .sort((a, b) => b.alias.length - a.alias.length);
// 高风险单字键：zh 单字且会撞常见博物馆词（'新'→新石器、'金'→鎏金/金缕玉衣/金银器/描金）。
// 对它们收紧为「整词/带朝代后缀」才命中，或裸字命中但不落在材质/工艺否决语境；泛称汉/宋只吃明确朝代语境。
const RISKY_SINGLE: Record<string, { need: RegExp; veto?: RegExp; allowBare?: boolean }> = {
  xin: { need: /新莽|新朝|王莽/, veto: /新石器/ },
  'jin-jurchen': { need: /金朝|金代|大金|完颜/, veto: /(鎏|描|贴|洒|错|嵌|包|泥|销|赤|真|黄|白|铜)金|金(缕|银|器|饰|漆|箔|粉|地|彩|玉)/ },
  han: { need: /两汉|汉代|汉朝|汉墓|汉画像|汉简|汉帛|汉瓦|汉陶|汉俑|汉镜|汉印|汉隶|汉砖|汉阙/, allowBare: false },
  song: { need: /两宋|宋代|宋朝|赵宋|宋瓷|宋画|宋版|宋刻|宋拓|宋墓|宋窑|宋元/, allowBare: false },
  ming: { need: /明代|明朝|大明|晚明|明清|明墓|明瓷|明器|明式|明家具|明青花|朱元璋|永乐|宣德|成化|嘉靖|万历|崇祯/, allowBare: false },
};
export function matchDynasty(text: string): DynastyEra | null {
  const t = text || '';
  for (const { alias, dynasty } of ALIAS_MATCH_ORDER) {
    if (new RegExp('\\b' + escapeRegExp(alias) + '\\b', 'i').test(t)) return dynasty;
  }
  for (const d of MATCH_ORDER) {
    if (!d.zh) continue;
    const risk = RISKY_SINGLE[d.key];
    if (risk) {
      if (risk.need.test(t)) return d;                        // 明确整词/带朝代后缀 → 命中
      if (risk.allowBare !== false && t.includes(d.zh) && !risk.veto?.test(t)) return d;   // 裸字命中但不在材质/工艺否决语境
      continue;                                                // 否则本键跳过，交云脑判
    }
    if (t.includes(d.zh)) return d;
  }
  return null;
}

// 器类受控词表（横向对比强关联键）
export const CATEGORY_VOCAB = ['青铜器', '陶器', '瓷器', '玉器', '书画', '造像', '钱币', '漆木器', '织绣', '金银器', '石刻', '甲骨', '家具', '乐器', '模型', '交通工具', '装置', '仪器', '甲胄', '兵器', '佩饰', '印章', '容器', '棺椁', '标本', '玩具', '烟具', '灯具', '工具', '其他'];

// 常见展馆坐标种子（含别名/模糊；命中即免 geocode）。
// 同时是「地球博物馆」图层的内建点位库：id 稳定（marker id/深链用），type 只作徽章区分（博物馆/美术馆
// 同一图层同一入口，不逼用户先分类）；blurb 一句话看点、url 官网供点位信息卡展示。
// 口径：海外场馆 ≥24 家（对齐提交文档「24 个海外展馆坐标种子」的说法并超额），总计 60+ 家。
export type VenueType = 'museum' | 'gallery';
export interface MuseumSeed {
  id: string;                 // 稳定短横线 id（'louvre'）：地球 marker id 与深链主键
  name: string; aliases: string[]; city: string;
  country: string;            // 国家/地区（信息卡与图层分组）
  type: VenueType;            // museum=博物馆（综合/历史/考古/自然），gallery=美术馆（艺术为主）
  lng: number; lat: number;
  blurb?: string;             // 一句话看点（信息卡）
  url?: string;               // 官网（信息卡「访问」）
}
export const MUSEUM_SEEDS: MuseumSeed[] = [
  { id: 'nmc', name: '中国国家博物馆', aliases: ['国博', '国家博物馆', 'National Museum of China', 'NMC'], city: '北京', country: '中国', type: 'museum', lng: 116.3958, lat: 39.9055, blurb: '后母戊鼎与四羊方尊坐镇的中华通史第一馆', url: 'https://www.chnmuseum.cn' },
  { id: 'palace-museum', name: '故宫博物院', aliases: ['故宫', '北京故宫', 'Palace Museum', 'Forbidden City'], city: '北京', country: '中国', type: 'museum', lng: 116.3972, lat: 39.9163, blurb: '明清紫禁城本体，藏品逾一百八十万件', url: 'https://www.dpm.org.cn' },
  { id: 'shaanxi-history', name: '陕西历史博物馆', aliases: ['陕历博', '陕博', 'Shaanxi History Museum'], city: '西安', country: '中国', type: 'museum', lng: 108.9440, lat: 34.2225, blurb: '古都长安地下宝库，唐代金银器与壁画' },
  { id: 'shanghai-museum', name: '上海博物馆', aliases: ['上博', 'Shanghai Museum'], city: '上海', country: '中国', type: 'museum', lng: 121.4753, lat: 31.2286, blurb: '青铜与书画重镇，大克鼎在此', url: 'https://www.shanghaimuseum.net' },
  { id: 'nanjing-museum', name: '南京博物院', aliases: ['南博', 'Nanjing Museum'], city: '南京', country: '中国', type: 'museum', lng: 118.8391, lat: 32.0416, blurb: '一院六馆，金缕玉衣与明清官窑' },
  { id: 'zhejiang-museum', name: '浙江省博物馆', aliases: ['浙博'], city: '杭州', country: '中国', type: 'museum', lng: 120.1503, lat: 30.2595, blurb: '《富春山居图》剩山图的守护者' },
  { id: 'hunan-museum', name: '湖南博物院', aliases: ['湖南省博物馆', '湘博'], city: '长沙', country: '中国', type: 'museum', lng: 112.9998, lat: 28.2126, blurb: '马王堆汉墓：素纱襌衣与辛追夫人' },
  { id: 'henan-museum', name: '河南博物院', aliases: ['豫博'], city: '郑州', country: '中国', type: 'museum', lng: 113.6470, lat: 34.7699, blurb: '贾湖骨笛与妇好鸮尊，中原之中' },
  { id: 'sichuan-museum', name: '四川博物院', aliases: ['川博'], city: '成都', country: '中国', type: 'museum', lng: 104.0409, lat: 30.6699, blurb: '巴蜀青铜与张大千敦煌临摹' },
  { id: 'capital-museum', name: '首都博物馆', aliases: ['首博'], city: '北京', country: '中国', type: 'museum', lng: 116.3325, lat: 39.9070, blurb: '北京城三千年，燕地青铜' },
  { id: 'suzhou-museum', name: '苏州博物馆', aliases: ['苏博'], city: '苏州', country: '中国', type: 'museum', lng: 120.6295, lat: 31.3239, blurb: '贝聿铭封山之作，片石假山' },
  { id: 'guangdong-museum', name: '广东省博物馆', aliases: ['粤博'], city: '广州', country: '中国', type: 'museum', lng: 113.3300, lat: 23.1197, blurb: '珠江边的月光宝盒，外销瓷与广作' },
  { id: 'npm-taipei', name: '国立故宫博物院', aliases: ['台北故宫', '台北国立故宫', 'National Palace Museum'], city: '台北', country: '中国台湾', type: 'museum', lng: 121.5487, lat: 25.1023, blurb: '翠玉白菜与毛公鼎，清宫旧藏南迁地', url: 'https://www.npm.gov.tw' },
  { id: 'yinxu', name: '殷墟博物馆', aliases: ['殷墟'], city: '安阳', country: '中国', type: 'museum', lng: 114.3160, lat: 36.1265, blurb: '甲骨文出土地，商文明现场' },
  { id: 'sanxingdui', name: '三星堆博物馆', aliases: ['三星堆'], city: '广汉', country: '中国', type: 'museum', lng: 104.2060, lat: 30.9970, blurb: '青铜纵目面具，古蜀之谜' },
  { id: 'terracotta-army', name: '秦始皇帝陵博物院', aliases: ['兵马俑', '秦始皇兵马俑'], city: '西安', country: '中国', type: 'museum', lng: 109.2734, lat: 34.3853, blurb: '八千兵马俑列阵的地下军团' },
  { id: 'hubei-museum', name: '湖北省博物馆', aliases: ['鄂博', 'Hubei Provincial Museum'], city: '武汉', country: '中国', type: 'museum', lng: 114.3654, lat: 30.5646, blurb: '曾侯乙编钟与越王勾践剑' },
  { id: 'shanxi-museum', name: '山西博物院', aliases: ['晋博', 'Shanxi Museum'], city: '太原', country: '中国', type: 'museum', lng: 112.5320, lat: 37.8640, blurb: '晋侯鸟尊，表里山河三千年' },
  { id: 'gansu-museum', name: '甘肃省博物馆', aliases: ['甘博', 'Gansu Provincial Museum'], city: '兰州', country: '中国', type: 'museum', lng: 103.7570, lat: 36.0670, blurb: '铜奔马（马踏飞燕）与丝路文明' },
  { id: 'namoc', name: '中国美术馆', aliases: ['NAMOC', 'National Art Museum of China'], city: '北京', country: '中国', type: 'gallery', lng: 116.4075, lat: 39.9251, blurb: '五四大街上的新中国美术殿堂' },
  { id: 'silk-museum', name: '中国丝绸博物馆', aliases: ['国丝馆', '国丝', 'China National Silk Museum'], city: '杭州', country: '中国', type: 'museum', lng: 120.1526, lat: 30.2185, blurb: '玉皇山下全球最大丝绸专题博物馆，丝路织物半壁在此', url: 'https://www.chinasilkmuseum.com' },
  { id: 'hkpm', name: '香港故宫文化博物馆', aliases: ['香港故宫', 'Hong Kong Palace Museum'], city: '香港', country: '中国香港', type: 'museum', lng: 114.1570, lat: 22.3040, blurb: '西九文化区的紫禁城分号', url: 'https://www.hkpm.org.hk' },
  { id: 'mplus', name: 'M+博物馆', aliases: ['M+', 'M Plus'], city: '香港', country: '中国香港', type: 'gallery', lng: 114.1600, lat: 22.3000, blurb: '亚洲首座全球当代视觉文化博物馆', url: 'https://www.mplus.org.hk' },
  // ── 海外知名展馆（出海：外文展品钉回它所在的城市；也是「地球博物馆」图层的全球种子）──
  { id: 'british-museum', name: '大英博物馆', aliases: ['大英', 'British Museum'], city: '伦敦', country: '英国', type: 'museum', lng: -0.1270, lat: 51.5194, blurb: '罗塞塔石碑与帕特农浮雕', url: 'https://www.britishmuseum.org' },
  { id: 'national-gallery-london', name: '英国国家美术馆', aliases: ['伦敦国家美术馆', '国家美术馆', 'The National Gallery'], city: '伦敦', country: '英国', type: 'gallery', lng: -0.1283, lat: 51.5089, blurb: '特拉法加广场，凡·高《向日葵》与透纳', url: 'https://www.nationalgallery.org.uk' },
  { id: 'tate-modern', name: '泰特现代美术馆', aliases: ['泰特现代', 'Tate Modern'], city: '伦敦', country: '英国', type: 'gallery', lng: -0.0994, lat: 51.5076, blurb: '发电站改造的现代艺术地标', url: 'https://www.tate.org.uk' },
  { id: 'va-museum', name: '维多利亚与艾尔伯特博物馆', aliases: ['V&A', 'Victoria and Albert Museum'], city: '伦敦', country: '英国', type: 'museum', lng: -0.1722, lat: 51.4966, blurb: '全球最大装饰艺术与设计博物馆', url: 'https://www.vam.ac.uk' },
  { id: 'nhm-london', name: '伦敦自然历史博物馆', aliases: ['自然历史博物馆', 'Natural History Museum'], city: '伦敦', country: '英国', type: 'museum', lng: -0.1764, lat: 51.4967, blurb: '恐龙骨架与蓝鲸 Hope 的哥特殿堂', url: 'https://www.nhm.ac.uk' },
  { id: 'louvre', name: '卢浮宫', aliases: ['罗浮宫', 'Louvre'], city: '巴黎', country: '法国', type: 'museum', lng: 2.3376, lat: 48.8606, blurb: '蒙娜丽莎、胜利女神与米洛的维纳斯', url: 'https://www.louvre.fr' },
  { id: 'orsay', name: '奥赛博物馆', aliases: ['奥塞', "Musée d'Orsay", 'Orsay'], city: '巴黎', country: '法国', type: 'gallery', lng: 2.3266, lat: 48.8600, blurb: '火车站里的印象派最强收藏', url: 'https://www.musee-orsay.fr' },
  { id: 'pompidou', name: '蓬皮杜艺术中心', aliases: ['蓬皮杜', 'Centre Pompidou'], city: '巴黎', country: '法国', type: 'gallery', lng: 2.3522, lat: 48.8607, blurb: '外露管线的现代艺术宝库', url: 'https://www.centrepompidou.fr' },
  { id: 'rijksmuseum', name: '荷兰国立博物馆', aliases: ['阿姆斯特丹国家博物馆', 'Rijksmuseum'], city: '阿姆斯特丹', country: '荷兰', type: 'museum', lng: 4.8852, lat: 52.3600, blurb: '伦勃朗《夜巡》与荷兰黄金时代', url: 'https://www.rijksmuseum.nl' },
  { id: 'van-gogh-museum', name: '梵高博物馆', aliases: ['凡高博物馆', 'Van Gogh Museum'], city: '阿姆斯特丹', country: '荷兰', type: 'gallery', lng: 4.8810, lat: 52.3584, blurb: '世界最全梵高真迹', url: 'https://www.vangoghmuseum.nl' },
  { id: 'prado', name: '普拉多博物馆', aliases: ['普拉多', 'Museo del Prado', 'Prado'], city: '马德里', country: '西班牙', type: 'gallery', lng: -3.6921, lat: 40.4138, blurb: '委拉斯开兹与戈雅，西班牙王室收藏', url: 'https://www.museodelprado.es' },
  { id: 'reina-sofia', name: '雷纳索菲亚艺术中心', aliases: ['索菲亚王后艺术中心', 'Reina Sofía', 'Reina Sofia'], city: '马德里', country: '西班牙', type: 'gallery', lng: -3.6946, lat: 40.4080, blurb: '毕加索《格尔尼卡》所在地' },
  { id: 'uffizi', name: '乌菲兹美术馆', aliases: ['乌菲齐', 'Uffizi'], city: '佛罗伦萨', country: '意大利', type: 'gallery', lng: 11.2559, lat: 43.7678, blurb: '波提切利《维纳斯的诞生》，文艺复兴心脏', url: 'https://www.uffizi.it' },
  { id: 'vatican-museums', name: '梵蒂冈博物馆', aliases: ['梵蒂冈', 'Vatican'], city: '梵蒂冈', country: '梵蒂冈', type: 'museum', lng: 12.4536, lat: 41.9065, blurb: '西斯廷穹顶与拉斐尔房间', url: 'https://www.museivaticani.va' },
  { id: 'khm-vienna', name: '维也纳艺术史博物馆', aliases: ['艺术史博物馆', 'Kunsthistorisches Museum', 'KHM'], city: '维也纳', country: '奥地利', type: 'museum', lng: 16.3616, lat: 48.2038, blurb: '哈布斯堡王朝收藏，勃鲁盖尔厅', url: 'https://www.khm.at' },
  { id: 'neues-museum', name: '柏林新博物馆', aliases: ['柏林博物馆岛', 'Neues Museum'], city: '柏林', country: '德国', type: 'museum', lng: 13.3980, lat: 52.5200, blurb: '娜芙蒂蒂胸像，博物馆岛' },
  { id: 'pergamon', name: '佩加蒙博物馆', aliases: ['帕加马博物馆', 'Pergamon Museum'], city: '柏林', country: '德国', type: 'museum', lng: 13.3969, lat: 52.5211, blurb: '伊什塔尔城门与帕加马祭坛' },
  { id: 'acropolis-museum', name: '雅典卫城博物馆', aliases: ['卫城博物馆', 'Acropolis Museum'], city: '雅典', country: '希腊', type: 'museum', lng: 23.7286, lat: 37.9685, blurb: '帕特农神庙雕塑的现代新家', url: 'https://www.theacropolismuseum.gr' },
  { id: 'hermitage', name: '冬宫博物馆', aliases: ['艾尔米塔什', 'Hermitage', '埃尔米塔日'], city: '圣彼得堡', country: '俄罗斯', type: 'museum', lng: 30.3141, lat: 59.9398, blurb: '叶卡捷琳娜的收藏，涅瓦河畔冬宫', url: 'https://www.hermitagemuseum.org' },
  { id: 'tretyakov', name: '特列季亚科夫画廊', aliases: ['特列恰科夫', 'Tretyakov Gallery'], city: '莫斯科', country: '俄罗斯', type: 'gallery', lng: 37.6208, lat: 55.7415, blurb: '俄罗斯绘画的国家收藏' },
  { id: 'istanbul-archaeology', name: '伊斯坦布尔考古博物馆', aliases: ['Istanbul Archaeology Museums'], city: '伊斯坦布尔', country: '土耳其', type: 'museum', lng: 28.9814, lat: 41.0117, blurb: '亚历山大石棺与两河珍藏' },
  { id: 'egyptian-museum', name: '埃及博物馆', aliases: ['开罗博物馆', '开罗埃及博物馆', 'Egyptian Museum'], city: '开罗', country: '埃及', type: 'museum', lng: 31.2333, lat: 30.0478, blurb: '解放广场的法老收藏百年老馆' },
  { id: 'gem', name: '大埃及博物馆', aliases: ['吉萨大博物馆', 'Grand Egyptian Museum'], city: '吉萨', country: '埃及', type: 'museum', lng: 31.1200, lat: 29.9938, blurb: '金字塔旁的新法老殿堂，图坦卡蒙全藏' },
  { id: 'met', name: '大都会艺术博物馆', aliases: ['大都会', 'Met', 'Metropolitan'], city: '纽约', country: '美国', type: 'museum', lng: -73.9632, lat: 40.7794, blurb: '中央公园旁的百科全书式艺术殿堂', url: 'https://www.metmuseum.org' },
  { id: 'moma', name: '纽约现代艺术博物馆', aliases: ['现代艺术博物馆', 'MoMA', 'Museum of Modern Art'], city: '纽约', country: '美国', type: 'gallery', lng: -73.9776, lat: 40.7614, blurb: '《星月夜》与现代主义正典', url: 'https://www.moma.org' },
  { id: 'guggenheim-ny', name: '古根海姆博物馆', aliases: ['古根海姆', 'Guggenheim'], city: '纽约', country: '美国', type: 'gallery', lng: -73.9590, lat: 40.7830, blurb: '赖特螺旋建筑里的现当代艺术', url: 'https://www.guggenheim.org' },
  { id: 'amnh', name: '美国自然历史博物馆', aliases: ['American Museum of Natural History', 'AMNH'], city: '纽约', country: '美国', type: 'museum', lng: -73.9740, lat: 40.7813, blurb: '《博物馆奇妙夜》原型，蓝鲸大厅', url: 'https://www.amnh.org' },
  { id: 'nga-dc', name: '美国国家美术馆', aliases: ['华盛顿国家美术馆', 'National Gallery of Art'], city: '华盛顿', country: '美国', type: 'gallery', lng: -77.0199, lat: 38.8913, blurb: '国会山旁的免费艺术殿堂，达·芬奇《吉内薇拉》', url: 'https://www.nga.gov' },
  { id: 'smithsonian-nmnh', name: '史密森尼国家自然历史博物馆', aliases: ['史密森尼自然历史博物馆', 'Smithsonian National Museum of Natural History'], city: '华盛顿', country: '美国', type: 'museum', lng: -77.0261, lat: 38.8913, blurb: '希望蓝钻与国家化石厅', url: 'https://naturalhistory.si.edu' },
  { id: 'art-institute-chicago', name: '芝加哥艺术博物馆', aliases: ['芝加哥艺术学院博物馆', 'Art Institute of Chicago'], city: '芝加哥', country: '美国', type: 'gallery', lng: -87.6237, lat: 41.8796, blurb: '《美国哥特式》与修拉《大碗岛》', url: 'https://www.artic.edu' },
  { id: 'mfa-boston', name: '波士顿美术馆', aliases: ['Museum of Fine Arts Boston', 'MFA Boston'], city: '波士顿', country: '美国', type: 'gallery', lng: -71.0940, lat: 42.3394, blurb: '美洲与亚洲艺术双强，莫奈重镇', url: 'https://www.mfa.org' },
  { id: 'getty', name: '盖蒂中心', aliases: ['盖蒂博物馆', 'Getty Center', 'Getty'], city: '洛杉矶', country: '美国', type: 'gallery', lng: -118.4741, lat: 34.0780, blurb: '山顶白色城堡，梵高《鸢尾花》', url: 'https://www.getty.edu' },
  { id: 'rom', name: '皇家安大略博物馆', aliases: ['Royal Ontario Museum', 'ROM'], city: '多伦多', country: '加拿大', type: 'museum', lng: -79.3948, lat: 43.6677, blurb: '水晶入口，恐龙与中国文物' },
  { id: 'mna-mexico', name: '墨西哥国立人类学博物馆', aliases: ['墨西哥人类学博物馆', 'Museo Nacional de Antropología', 'National Museum of Anthropology'], city: '墨西哥城', country: '墨西哥', type: 'museum', lng: -99.1863, lat: 19.4260, blurb: '阿兹特克太阳石与玛雅文明' },
  { id: 'masp', name: '圣保罗艺术博物馆', aliases: ['MASP'], city: '圣保罗', country: '巴西', type: 'gallery', lng: -46.6558, lat: -23.5614, blurb: '保利斯塔大道的悬浮红色方盒' },
  { id: 'louvre-abu-dhabi', name: '卢浮宫阿布扎比', aliases: ['阿布扎比卢浮宫', 'Louvre Abu Dhabi'], city: '阿布扎比', country: '阿联酋', type: 'museum', lng: 54.3980, lat: 24.5333, blurb: '雨光穹顶下的环球文明馆', url: 'https://www.louvreabudhabi.ae' },
  { id: 'mia-doha', name: '多哈伊斯兰艺术博物馆', aliases: ['伊斯兰艺术博物馆', 'Museum of Islamic Art'], city: '多哈', country: '卡塔尔', type: 'museum', lng: 51.5390, lat: 25.2951, blurb: '贝聿铭封笔的海上几何', url: 'https://mia.org.qa' },
  { id: 'national-museum-delhi', name: '印度国家博物馆', aliases: ['新德里国家博物馆', 'National Museum New Delhi'], city: '新德里', country: '印度', type: 'museum', lng: 77.2195, lat: 28.6118, blurb: '印度河文明与佛舍利' },
  { id: 'nmk-seoul', name: '韩国国立中央博物馆', aliases: ['首尔国立中央博物馆', 'National Museum of Korea'], city: '首尔', country: '韩国', type: 'museum', lng: 126.9804, lat: 37.5240, blurb: '新罗金冠与高丽青瓷', url: 'https://www.museum.go.kr' },
  { id: 'tokyo-national', name: '东京国立博物馆', aliases: ['东博', '东京国博', 'Tokyo National Museum'], city: '东京', country: '日本', type: 'museum', lng: 139.7767, lat: 35.7188, blurb: '日本最古老博物馆，国宝刀剑与浮世绘', url: 'https://www.tnm.jp' },
  { id: 'nmwa-tokyo', name: '国立西洋美术馆', aliases: ['西洋美术馆', 'National Museum of Western Art'], city: '东京', country: '日本', type: 'gallery', lng: 139.7757, lat: 35.7154, blurb: '柯布西耶建筑与松方收藏，上野', url: 'https://www.nmwa.go.jp' },
  { id: 'kyoto-national', name: '京都国立博物馆', aliases: ['京博', 'Kyoto National Museum'], city: '京都', country: '日本', type: 'museum', lng: 135.7727, lat: 34.9899, blurb: '明治洋馆与京都佛教美术', url: 'https://www.kyohaku.go.jp' },
  { id: 'nara-national', name: '奈良国立博物馆', aliases: ['奈良国博', 'Nara National Museum'], city: '奈良', country: '日本', type: 'museum', lng: 135.8365, lat: 34.6832, blurb: '正仓院展的舞台，佛像馆', url: 'https://www.narahaku.go.jp' },
  { id: 'national-gallery-sg', name: '新加坡国家美术馆', aliases: ['National Gallery Singapore'], city: '新加坡', country: '新加坡', type: 'gallery', lng: 103.8515, lat: 1.2903, blurb: '前最高法院里的东南亚现代艺术', url: 'https://www.nationalgallery.sg' },
  { id: 'ngv', name: '维多利亚国立美术馆', aliases: ['墨尔本维多利亚国立美术馆', 'National Gallery of Victoria', 'NGV'], city: '墨尔本', country: '澳大利亚', type: 'gallery', lng: 144.9690, lat: -37.8226, blurb: '南半球最老美术馆，水墙入口', url: 'https://www.ngv.vic.gov.au' },
];

// 展馆名（含别名/模糊）→ 种子坐标
const ASCII_ONLY = /^[\x00-\x7f]+$/;
export function matchMuseum(name: string): MuseumSeed | null {
  const raw = name || '';
  const q = raw.replace(/\s/g, '');
  if (!q) return null;
  const genericMuseumWord = /^(馆|博物馆|博物院|美术馆|展厅|展)$/;
  const asciiAliases = MUSEUM_SEEDS
    .flatMap((m) => m.aliases.filter((a) => ASCII_ONLY.test(a)).map((alias) => ({ alias, museum: m })))
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, museum } of asciiAliases) {
    // 先匹配更长英文别名，避免 Palace Museum 抢走 National Palace Museum。
    if (new RegExp('\\b' + escapeRegExp(alias) + '\\b', 'i').test(raw)) return museum;
  }
  // CJK 正向包含（查询含名/别名）：跨馆按长度降序统一排序——否则「台北故宫」会被排前面的
  // 「故宫博物院」短别名「故宫」抢走。
  const cjkCandidates = MUSEUM_SEEDS
    .flatMap((m) => [
      { text: m.name, museum: m },
      ...m.aliases.filter((a) => !ASCII_ONLY.test(a)).map((a) => ({ text: a, museum: m })),
    ])
    .sort((a, b) => b.text.length - a.text.length);
  for (const c of cjkCandidates) {
    if (q.includes(c.text)) return c.museum;
  }
  // CJK 反向包含（查询是标准名的一部分）：最短名优先（最接近精确）——否则「卢浮宫」会被
  // 「卢浮宫阿布扎比」吃掉。只对标准名开放、≥3 字、非泛词，防「馆」吃遍全表。
  if (q.length >= 3 && !genericMuseumWord.test(q)) {
    const byNameAsc = [...MUSEUM_SEEDS].sort((a, b) => a.name.length - b.name.length);
    for (const m of byNameAsc) {
      if (m.name.includes(q)) return m;
    }
  }
  return null;
}
