import { describe, expect, it } from 'vitest';
import { captureGuideBrief, selectCaptureGuideForArtifact } from './captureGuide';

describe('selectCaptureGuideForArtifact · Qwen 结构化器类兜底', () => {
  it('Qwen 只补出拓本或摄影器类时也会驱动平面多图采集', () => {
    const rubbingGuide = selectCaptureGuideForArtifact({
      nameZh: '无题一',
      tags: { category: '拓本' },
    });
    const photographyGuide = selectCaptureGuideForArtifact({
      nameZh: '无题二',
      tags: { category: '摄影' },
    });
    const contactSheetGuide = selectCaptureGuideForArtifact({
      nameZh: '摄影接触印样',
      tags: { category: 'contact sheet' },
    });
    const negativeStripGuide = selectCaptureGuideForArtifact({
      nameZh: '底片条',
      tags: { category: 'negative strip' },
    });
    const englishRubbingGuide = selectCaptureGuideForArtifact({
      nameZh: '石碑拓片',
      tags: { category: 'stone rubbing' },
    });

    expect(rubbingGuide.kind).toBe('flat');
    expect(photographyGuide.kind).toBe('flat');
    expect(contactSheetGuide.kind).toBe('flat');
    expect(negativeStripGuide.kind).toBe('flat');
    expect(englishRubbingGuide.kind).toBe('flat');
    expect(rubbingGuide.mode).toBe('photo');
    expect(captureGuideBrief(photographyGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出印刷品或宣传品器类时也会驱动平面多图采集', () => {
    const printGuide = selectCaptureGuideForArtifact({
      nameZh: '无题三',
      tags: { category: '印刷品' },
    });
    const ephemeraGuide = selectCaptureGuideForArtifact({
      nameZh: '无题四',
      tags: { category: '宣传品' },
    });

    expect(printGuide.kind).toBe('flat');
    expect(ephemeraGuide.kind).toBe('flat');
    expect(printGuide.mode).toBe('photo');
    expect(captureGuideBrief(ephemeraGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出壁画或英文 fresco 器类时也会驱动平面多图采集', () => {
    const frescoGuide = selectCaptureGuideForArtifact({
      nameZh: '无题壁画',
      tags: { category: 'fresco' },
    });
    const watercolorGuide = selectCaptureGuideForArtifact({
      nameZh: '无题水彩',
      tags: { category: 'watercolor' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题壁画',
      tags: { category: '壁画' },
    });

    expect(frescoGuide.kind).toBe('flat');
    expect(watercolorGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(frescoGuide.mode).toBe('photo');
    expect(captureGuideBrief(watercolorGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出水粉或粉彩素描器类时也会驱动平面多图采集', () => {
    const gouacheGuide = selectCaptureGuideForArtifact({
      nameZh: '无题水粉',
      tags: { category: 'gouache' },
    });
    const pastelGuide = selectCaptureGuideForArtifact({
      nameZh: '无题粉彩',
      tags: { category: 'pastel drawing' },
    });
    const charcoalGuide = selectCaptureGuideForArtifact({
      nameZh: '无题炭笔',
      tags: { category: 'charcoal drawing' },
    });

    expect(gouacheGuide.kind).toBe('flat');
    expect(pastelGuide.kind).toBe('flat');
    expect(charcoalGuide.kind).toBe('flat');
    expect(gouacheGuide.mode).toBe('photo');
    expect(captureGuideBrief(pastelGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出唱片或唱片封套器类时也会驱动平面多图采集', () => {
    const vinylGuide = selectCaptureGuideForArtifact({
      nameZh: '爵士黑胶唱片',
      tags: { category: 'vinyl record' },
    });
    const sleeveGuide = selectCaptureGuideForArtifact({
      nameZh: '唱片封套设计',
      tags: { category: 'record sleeve' },
    });

    expect(vinylGuide.kind).toBe('flat');
    expect(sleeveGuide.kind).toBe('flat');
    expect(vinylGuide.mode).toBe('photo');
    expect(captureGuideBrief(sleeveGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出贺卡或英文 greeting card 器类时也会驱动平面多图采集', () => {
    const greetingGuide = selectCaptureGuideForArtifact({
      nameZh: '无题贺卡',
      tags: { category: 'greeting card' },
    });
    const holidayGuide = selectCaptureGuideForArtifact({
      nameZh: '无题节日卡',
      tags: { category: 'holiday card' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题新年贺卡',
      tags: { category: '贺卡' },
    });

    expect(greetingGuide.kind).toBe('flat');
    expect(holidayGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(greetingGuide.mode).toBe('photo');
    expect(captureGuideBrief(holidayGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出明信片或英文 postcard 器类时也会驱动平面多图采集', () => {
    const postcardGuide = selectCaptureGuideForArtifact({
      nameZh: '无题明信片',
      tags: { category: 'postcard' },
    });
    const souvenirGuide = selectCaptureGuideForArtifact({
      nameZh: '无题风景明信片',
      tags: { category: 'souvenir postcard' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题美术明信片',
      tags: { category: '明信片' },
    });

    expect(postcardGuide.kind).toBe('flat');
    expect(souvenirGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(postcardGuide.mode).toBe('photo');
    expect(captureGuideBrief(chineseGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出日历或英文 almanac 器类时也会驱动平面多图采集', () => {
    const calendarGuide = selectCaptureGuideForArtifact({
      nameZh: '无题日历',
      tags: { category: 'wall calendar' },
    });
    const almanacGuide = selectCaptureGuideForArtifact({
      nameZh: '无题历书',
      tags: { category: 'almanac' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题月份牌',
      tags: { category: '月份牌' },
    });

    expect(calendarGuide.kind).toBe('flat');
    expect(almanacGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(calendarGuide.mode).toBe('photo');
    expect(captureGuideBrief(almanacGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出票根或英文 ration coupon 器类时也会驱动平面多图采集', () => {
    const ticketGuide = selectCaptureGuideForArtifact({
      nameZh: '无题票根',
      tags: { category: 'ticket stub' },
    });
    const couponGuide = selectCaptureGuideForArtifact({
      nameZh: '无题粮票',
      tags: { category: 'ration coupon' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题收据',
      tags: { category: '粮票' },
    });

    expect(ticketGuide.kind).toBe('flat');
    expect(couponGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(ticketGuide.mode).toBe('photo');
    expect(captureGuideBrief(couponGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出莎草纸卷轴英文器类时也会驱动平面多图采集', () => {
    const scrollGuide = selectCaptureGuideForArtifact({
      nameZh: '无题莎草纸卷',
      tags: { category: 'papyrus scroll' },
    });
    const fragmentGuide = selectCaptureGuideForArtifact({
      nameZh: '无题莎草纸残片',
      tags: { category: 'papyrus fragment' },
    });

    expect(scrollGuide.kind).toBe('flat');
    expect(fragmentGuide.kind).toBe('flat');
    expect(scrollGuide.mode).toBe('photo');
    expect(captureGuideBrief(fragmentGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出纺织品或挂毯器类时也会驱动平面多图采集', () => {
    const textileGuide = selectCaptureGuideForArtifact({
      nameZh: '无题五',
      tags: { category: '纺织品' },
    });
    const tapestryGuide = selectCaptureGuideForArtifact({
      nameZh: '无题六',
      tags: { category: '挂毯' },
    });

    expect(textileGuide.kind).toBe('flat');
    expect(tapestryGuide.kind).toBe('flat');
    expect(textileGuide.mode).toBe('photo');
    expect(captureGuideBrief(tapestryGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出地毯或英文 rug 器类时也会驱动平面多图采集', () => {
    const carpetGuide = selectCaptureGuideForArtifact({
      nameZh: '无题地毯',
      tags: { category: '地毯' },
    });
    const rugGuide = selectCaptureGuideForArtifact({
      nameZh: '无题织物',
      tags: { category: 'prayer rug' },
    });

    expect(carpetGuide.kind).toBe('flat');
    expect(rugGuide.kind).toBe('flat');
    expect(carpetGuide.mode).toBe('photo');
    expect(captureGuideBrief(rugGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出披肩或英文 lace collar 器类时也会驱动织绣平面采集', () => {
    const shawlGuide = selectCaptureGuideForArtifact({
      nameZh: '无题披肩',
      tags: { category: '披肩' },
    });
    const laceGuide = selectCaptureGuideForArtifact({
      nameZh: '无题花边衣领',
      tags: { category: 'lace collar' },
    });

    expect(shawlGuide.kind).toBe('flat');
    expect(laceGuide.kind).toBe('flat');
    expect(shawlGuide.mode).toBe('photo');
    expect(captureGuideBrief(laceGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出被面或英文 woven mat 器类时也会驱动织绣平面采集', () => {
    const quiltGuide = selectCaptureGuideForArtifact({
      nameZh: '无题被面',
      tags: { category: 'quilt' },
    });
    const matGuide = selectCaptureGuideForArtifact({
      nameZh: '无题席垫',
      tags: { category: 'woven mat' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题草席',
      tags: { category: '草席' },
    });

    expect(quiltGuide.kind).toBe('flat');
    expect(matGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(quiltGuide.mode).toBe('photo');
    expect(captureGuideBrief(matGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出法衣或英文 chasuble 器类时也会驱动织绣平面采集', () => {
    const vestmentGuide = selectCaptureGuideForArtifact({
      nameZh: '无题祭服',
      tags: { category: 'vestment' },
    });
    const chasubleGuide = selectCaptureGuideForArtifact({
      nameZh: '无题法衣',
      tags: { category: 'chasuble' },
    });
    const dalmaticGuide = selectCaptureGuideForArtifact({
      nameZh: '无题礼仪服',
      tags: { category: 'dalmatic' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题织绣',
      tags: { category: '祭披' },
    });

    expect(vestmentGuide.kind).toBe('flat');
    expect(chasubleGuide.kind).toBe('flat');
    expect(dalmaticGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(vestmentGuide.mode).toBe('photo');
    expect(captureGuideBrief(chasubleGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出英文 numismatic object 或 trade token 器类时也会驱动钱币多图采集', () => {
    const numismaticGuide = selectCaptureGuideForArtifact({
      nameZh: '无题一〇',
      tags: { category: 'numismatic object' },
    });
    const tokenGuide = selectCaptureGuideForArtifact({
      nameZh: '无题一一',
      tags: { category: 'trade token' },
    });
    const banknoteGuide = selectCaptureGuideForArtifact({
      nameZh: '无题纸钞',
      tags: { category: 'banknote' },
    });
    const paperMoneyGuide = selectCaptureGuideForArtifact({
      nameZh: '无题纸币',
      tags: { category: '纸币' },
    });
    const decorationGuide = selectCaptureGuideForArtifact({
      nameZh: '无题勋饰',
      tags: { category: 'orders and decorations' },
    });
    const orderBadgeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题勋章',
      tags: { category: 'order badge' },
    });

    expect(numismaticGuide.kind).toBe('flat');
    expect(tokenGuide.kind).toBe('flat');
    expect(banknoteGuide.kind).toBe('flat');
    expect(paperMoneyGuide.kind).toBe('flat');
    expect(decorationGuide.kind).toBe('flat');
    expect(orderBadgeGuide.kind).toBe('flat');
    expect(numismaticGuide.mode).toBe('photo');
    expect(captureGuideBrief(orderBadgeGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出乐器或英文 musical instrument 器类时也会驱动复杂物体采集', () => {
    const instrumentGuide = selectCaptureGuideForArtifact({
      nameZh: '无题乐器',
      tags: { category: '乐器' },
    });
    const musicalGuide = selectCaptureGuideForArtifact({
      nameZh: '无题琴',
      tags: { category: 'musical instrument' },
    });
    const fluteGuide = selectCaptureGuideForArtifact({
      nameZh: '无题长笛',
      tags: { category: 'flute' },
    });
    const drumGuide = selectCaptureGuideForArtifact({
      nameZh: '无题铜鼓',
      tags: { category: 'drum' },
    });
    const gongGuide = selectCaptureGuideForArtifact({
      nameZh: '无题铜锣',
      tags: { category: '铜锣' },
    });

    expect(instrumentGuide.kind).toBe('large');
    expect(musicalGuide.kind).toBe('large');
    expect(fluteGuide.kind).toBe('large');
    expect(drumGuide.kind).toBe('large');
    expect(gongGuide.kind).toBe('large');
    expect(instrumentGuide.mode).toBe('video');
    expect(captureGuideBrief(musicalGuide)).toContain('大件 / 青铜重器 / 车马');
  });

  it('Qwen 只补出钟磬或英文 bianzhong 器类时也会驱动复杂物体采集', () => {
    const bianzhongGuide = selectCaptureGuideForArtifact({
      nameZh: '无题一二',
      tags: { category: 'bianzhong' },
    });
    const chimeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题一三',
      tags: { category: 'chime bells' },
    });

    expect(bianzhongGuide.kind).toBe('large');
    expect(chimeGuide.kind).toBe('large');
    expect(bianzhongGuide.mode).toBe('video');
    expect(captureGuideBrief(chimeGuide)).toContain('大件 / 青铜重器 / 车马');
  });

  it('Qwen 只补出模型或英文 diorama 器类时也会驱动复杂物体采集', () => {
    const modelGuide = selectCaptureGuideForArtifact({
      nameZh: '无题模型',
      tags: { category: '模型' },
    });
    const dioramaGuide = selectCaptureGuideForArtifact({
      nameZh: '无题沙盘',
      tags: { category: 'diorama' },
    });

    expect(modelGuide.kind).toBe('large');
    expect(dioramaGuide.kind).toBe('large');
    expect(modelGuide.mode).toBe('video');
    expect(captureGuideBrief(dioramaGuide)).toContain('大件 / 青铜重器 / 车马');
  });

  it('Qwen 只补出交通工具或英文 carriage 器类时也会驱动大件采集', () => {
    const vehicleGuide = selectCaptureGuideForArtifact({
      nameZh: '无题车马',
      tags: { category: '交通工具' },
    });
    const carriageGuide = selectCaptureGuideForArtifact({
      nameZh: '无题马车',
      tags: { category: 'carriage' },
    });
    const boatGuide = selectCaptureGuideForArtifact({
      nameZh: '无题船只',
      tags: { category: 'boat' },
    });

    expect(vehicleGuide.kind).toBe('large');
    expect(carriageGuide.kind).toBe('large');
    expect(boatGuide.kind).toBe('large');
    expect(vehicleGuide.mode).toBe('video');
    expect(captureGuideBrief(carriageGuide)).toContain('大件 / 青铜重器 / 车马');
  });

  it('Qwen 只补出装置艺术或英文 installation art 器类时也会驱动复杂物体采集', () => {
    const installationGuide = selectCaptureGuideForArtifact({
      nameZh: '无题装置',
      tags: { category: '装置' },
    });
    const immersiveGuide = selectCaptureGuideForArtifact({
      nameZh: '无题空间',
      tags: { category: 'installation art' },
    });

    expect(installationGuide.kind).toBe('large');
    expect(immersiveGuide.kind).toBe('large');
    expect(installationGuide.mode).toBe('video');
    expect(captureGuideBrief(immersiveGuide)).toContain('大件 / 青铜重器 / 车马');
  });

  it('Qwen 只补出仪器或英文 astrolabe 器类时也会驱动钟表仪器采集', () => {
    const instrumentGuide = selectCaptureGuideForArtifact({
      nameZh: '无题仪器',
      tags: { category: '仪器' },
    });
    const astrolabeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题星盘',
      tags: { category: 'astrolabe' },
    });

    expect(instrumentGuide.kind).toBe('instrument');
    expect(astrolabeGuide.kind).toBe('instrument');
    expect(instrumentGuide.mode).toBe('both');
    expect(captureGuideBrief(astrolabeGuide)).toContain('钟表 / 科学仪器');
  });

  it('Qwen 只补出英文 camera 或 film projector 器类时也会驱动仪器采集', () => {
    const cameraGuide = selectCaptureGuideForArtifact({
      nameZh: '无题相机',
      tags: { category: 'camera' },
    });
    const projectorGuide = selectCaptureGuideForArtifact({
      nameZh: '无题放映机',
      tags: { category: 'film projector' },
    });

    expect(cameraGuide.kind).toBe('instrument');
    expect(projectorGuide.kind).toBe('instrument');
    expect(cameraGuide.mode).toBe('both');
    expect(captureGuideBrief(projectorGuide)).toContain('钟表 / 科学仪器');
  });

  it('Qwen 只补出佩饰或英文 jewelry 器类时也会驱动小件采集', () => {
    const ornamentGuide = selectCaptureGuideForArtifact({
      nameZh: '无题佩饰',
      tags: { category: '佩饰' },
    });
    const jewelryGuide = selectCaptureGuideForArtifact({
      nameZh: '无题珠饰',
      tags: { category: 'jewelry' },
    });
    const earSpoolGuide = selectCaptureGuideForArtifact({
      nameZh: '无题耳饰',
      tags: { category: 'ear spool' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题耳珰',
      tags: { category: '耳珰' },
    });

    expect(ornamentGuide.kind).toBe('small');
    expect(jewelryGuide.kind).toBe('small');
    expect(earSpoolGuide.kind).toBe('small');
    expect(chineseGuide.kind).toBe('small');
    expect(ornamentGuide.mode).toBe('both');
    expect(captureGuideBrief(earSpoolGuide)).toContain('小件展品');
  });

  it('Qwen 只补出发簪或英文 fibula 器类时也会驱动小件采集', () => {
    const hairpinGuide = selectCaptureGuideForArtifact({
      nameZh: '无题发饰',
      tags: { category: 'hairpin' },
    });
    const fibulaGuide = selectCaptureGuideForArtifact({
      nameZh: '无题扣针',
      tags: { category: 'fibula' },
    });
    const beltHookGuide = selectCaptureGuideForArtifact({
      nameZh: '无题带钩',
      tags: { category: '带钩' },
    });

    expect(hairpinGuide.kind).toBe('small');
    expect(fibulaGuide.kind).toBe('small');
    expect(beltHookGuide.kind).toBe('small');
    expect(hairpinGuide.mode).toBe('both');
    expect(captureGuideBrief(fibulaGuide)).toContain('小件展品');
  });

  it('Qwen 只补出臂环、带扣或英文 torc 器类时也会驱动小件采集', () => {
    const torcGuide = selectCaptureGuideForArtifact({
      nameZh: '无题颈环',
      tags: { category: 'torc' },
    });
    const armletGuide = selectCaptureGuideForArtifact({
      nameZh: '无题臂环',
      tags: { category: 'armlet' },
    });
    const buckleGuide = selectCaptureGuideForArtifact({
      nameZh: '无题带扣',
      tags: { category: 'belt buckle' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题佩饰',
      tags: { category: '带扣' },
    });

    expect(torcGuide.kind).toBe('small');
    expect(armletGuide.kind).toBe('small');
    expect(buckleGuide.kind).toBe('small');
    expect(chineseGuide.kind).toBe('small');
    expect(torcGuide.mode).toBe('both');
    expect(captureGuideBrief(buckleGuide)).toContain('小件展品');
  });

  it('Qwen 只补出头饰或英文 headdress 器类时也会驱动小件采集', () => {
    const headdressGuide = selectCaptureGuideForArtifact({
      nameZh: '无题头饰',
      tags: { category: 'headdress' },
    });
    const crownGuide = selectCaptureGuideForArtifact({
      nameZh: '无题王冠',
      tags: { category: 'ceremonial crown' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题礼冠',
      tags: { category: '头饰' },
    });

    expect(headdressGuide.kind).toBe('small');
    expect(crownGuide.kind).toBe('small');
    expect(chineseGuide.kind).toBe('small');
    expect(headdressGuide.mode).toBe('both');
    expect(captureGuideBrief(crownGuide)).toContain('小件展品');
  });

  it('Qwen 只补出徽章或英文 campaign button 器类时也会驱动小件采集', () => {
    const badgeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题徽章',
      tags: { category: '徽章' },
    });
    const buttonGuide = selectCaptureGuideForArtifact({
      nameZh: '无题纪念扣',
      tags: { category: 'campaign button' },
    });
    const insigniaGuide = selectCaptureGuideForArtifact({
      nameZh: '无题徽饰',
      tags: { category: 'insignia' },
    });
    const scepterGuide = selectCaptureGuideForArtifact({
      nameZh: '无题权杖',
      tags: { category: 'scepter' },
    });

    expect(badgeGuide.kind).toBe('small');
    expect(buttonGuide.kind).toBe('small');
    expect(insigniaGuide.kind).toBe('small');
    expect(scepterGuide.kind).toBe('small');
    expect(badgeGuide.mode).toBe('both');
    expect(captureGuideBrief(scepterGuide)).toContain('小件展品');
  });

  it('Qwen 只补出根付或绪缔珠英文器类时也会驱动小件采集', () => {
    const netsukeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题根付',
      tags: { category: 'netsuke' },
    });
    const ojimeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题绪缔',
      tags: { category: 'ojime bead' },
    });

    expect(netsukeGuide.kind).toBe('small');
    expect(ojimeGuide.kind).toBe('small');
    expect(netsukeGuide.mode).toBe('both');
    expect(captureGuideBrief(ojimeGuide)).toContain('小件展品');
  });

  it('Qwen 只补出浮雕宝石或圣甲虫英文器类时也会驱动小件采集', () => {
    const cameoGuide = selectCaptureGuideForArtifact({
      nameZh: '无题浮雕宝石',
      tags: { category: 'cameo' },
    });
    const intaglioGuide = selectCaptureGuideForArtifact({
      nameZh: '无题凹雕宝石',
      tags: { category: 'intaglio' },
    });
    const scarabGuide = selectCaptureGuideForArtifact({
      nameZh: '无题圣甲虫印',
      tags: { category: 'scarab seal' },
    });

    expect(cameoGuide.kind).toBe('small');
    expect(intaglioGuide.kind).toBe('small');
    expect(scarabGuide.kind).toBe('small');
    expect(cameoGuide.mode).toBe('both');
    expect(captureGuideBrief(scarabGuide)).toContain('小件展品');
  });

  it('Qwen 只补出印章或英文 seal matrix 器类时也会驱动小件采集', () => {
    const sealGuide = selectCaptureGuideForArtifact({
      nameZh: '无题印章',
      tags: { category: '印章' },
    });
    const plainSealGuide = selectCaptureGuideForArtifact({
      nameZh: '无题封泥印',
      tags: { category: 'seal' },
    });
    const matrixGuide = selectCaptureGuideForArtifact({
      nameZh: '无题印玺',
      tags: { category: 'seal matrix' },
    });
    const stampGuide = selectCaptureGuideForArtifact({
      nameZh: '无题印戳',
      tags: { category: 'seal stamp' },
    });

    expect(sealGuide.kind).toBe('small');
    expect(plainSealGuide.kind).toBe('small');
    expect(matrixGuide.kind).toBe('small');
    expect(stampGuide.kind).toBe('small');
    expect(sealGuide.mode).toBe('both');
    expect(captureGuideBrief(stampGuide)).toContain('小件展品');
  });

  it('Qwen 只补出容器或英文 reliquary 器类时也会驱动小件采集', () => {
    const containerGuide = selectCaptureGuideForArtifact({
      nameZh: '无题小盒',
      tags: { category: '容器' },
    });
    const reliquaryGuide = selectCaptureGuideForArtifact({
      nameZh: '无题圣物匣',
      tags: { category: 'reliquary' },
    });
    const vesselGuide = selectCaptureGuideForArtifact({
      nameZh: '无题陶罐',
      tags: { category: 'vessel' },
    });
    const ewerGuide = selectCaptureGuideForArtifact({
      nameZh: '无题水注',
      tags: { category: 'ewer' },
    });
    const basketGuide = selectCaptureGuideForArtifact({
      nameZh: '无题编篮',
      tags: { category: 'basketry tray' },
    });
    const coiledBasketGuide = selectCaptureGuideForArtifact({
      nameZh: '无题盘编篮',
      tags: { category: 'coiled basket' },
    });
    const wickerBasketGuide = selectCaptureGuideForArtifact({
      nameZh: '无题藤编篮',
      tags: { category: 'wicker basket' },
    });
    const chaliceGuide = selectCaptureGuideForArtifact({
      nameZh: '无题圣杯',
      tags: { category: 'chalice' },
    });
    const censerGuide = selectCaptureGuideForArtifact({
      nameZh: '无题香炉',
      tags: { category: 'censer' },
    });

    expect(containerGuide.kind).toBe('small');
    expect(reliquaryGuide.kind).toBe('small');
    expect(vesselGuide.kind).toBe('small');
    expect(ewerGuide.kind).toBe('small');
    expect(basketGuide.kind).toBe('small');
    expect(coiledBasketGuide.kind).toBe('small');
    expect(wickerBasketGuide.kind).toBe('small');
    expect(chaliceGuide.kind).toBe('small');
    expect(censerGuide.kind).toBe('small');
    expect(containerGuide.mode).toBe('both');
    expect(captureGuideBrief(censerGuide)).toContain('小件展品');
  });

  it('Qwen 只补出印笼或鼻烟壶英文器类时也会驱动对应采集', () => {
    const inroGuide = selectCaptureGuideForArtifact({
      nameZh: '无题印笼',
      tags: { category: 'inro' },
    });
    const snuffBottleGuide = selectCaptureGuideForArtifact({
      nameZh: '无题鼻烟壶',
      tags: { category: 'snuff bottle' },
    });
    const brushPotGuide = selectCaptureGuideForArtifact({
      nameZh: '无题笔筒',
      tags: { category: 'brush pot' },
    });
    const writingBoxGuide = selectCaptureGuideForArtifact({
      nameZh: '无题文具盒',
      tags: { category: 'writing box' },
    });
    const chineseBrushWasherGuide = selectCaptureGuideForArtifact({
      nameZh: '无题笔洗',
      tags: { category: '笔洗' },
    });

    expect(inroGuide.kind).toBe('reflective');
    expect(inroGuide.mode).toBe('both');
    expect(captureGuideBrief(inroGuide)).toContain('高反光 / 抛光材质');
    expect(snuffBottleGuide.kind).toBe('small');
    expect(brushPotGuide.kind).toBe('small');
    expect(writingBoxGuide.kind).toBe('small');
    expect(chineseBrushWasherGuide.kind).toBe('small');
    expect(captureGuideBrief(snuffBottleGuide)).toContain('小件展品');
  });

  it('Qwen 只补出灯具或英文 oil lamp 器类时也会驱动小件采集', () => {
    const lampGuide = selectCaptureGuideForArtifact({
      nameZh: '无题宫灯',
      tags: { category: '灯具' },
    });
    const oilLampGuide = selectCaptureGuideForArtifact({
      nameZh: '无题油灯',
      tags: { category: 'oil lamp' },
    });
    const candlestickGuide = selectCaptureGuideForArtifact({
      nameZh: '无题烛台',
      tags: { category: 'candlestick' },
    });

    expect(lampGuide.kind).toBe('small');
    expect(oilLampGuide.kind).toBe('small');
    expect(candlestickGuide.kind).toBe('small');
    expect(lampGuide.mode).toBe('both');
    expect(captureGuideBrief(oilLampGuide)).toContain('小件展品');
  });

  it('Qwen 从玻璃器形补出的材质会覆盖容器默认小件采集', () => {
    const vesselGuide = selectCaptureGuideForArtifact({
      nameZh: '罗马玻璃瓶',
      tags: { category: '容器', material: ['玻璃'] },
    });
    const windowGuide = selectCaptureGuideForArtifact({
      nameZh: '彩绘玻璃窗',
      tags: { category: '书画', material: ['彩绘玻璃'] },
    });

    expect(vesselGuide.kind).toBe('transparent');
    expect(vesselGuide.mode).toBe('both');
    expect(captureGuideBrief(vesselGuide)).toContain('透明 / 半透明材质');
    expect(windowGuide.kind).toBe('flat');
    expect(windowGuide.mode).toBe('photo');
    expect(captureGuideBrief(windowGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出瓷瓶或陶壶英文器形时也会驱动小件采集', () => {
    const porcelainGuide = selectCaptureGuideForArtifact({
      nameZh: '无题瓷瓶',
      tags: { category: 'porcelain vase' },
    });
    const ewerGuide = selectCaptureGuideForArtifact({
      nameZh: '无题陶壶',
      tags: { category: 'stoneware ewer' },
    });

    expect(porcelainGuide.kind).toBe('small');
    expect(ewerGuide.kind).toBe('small');
    expect(porcelainGuide.mode).toBe('both');
    expect(captureGuideBrief(ewerGuide)).toContain('小件展品');
  });

  it('Qwen 只补出陶片或瓷片英文器类时也会驱动小件采集', () => {
    const ceramicGuide = selectCaptureGuideForArtifact({
      nameZh: '无题陶片',
      tags: { category: 'ceramic sherd' },
    });
    const porcelainGuide = selectCaptureGuideForArtifact({
      nameZh: '无题瓷片',
      tags: { category: 'porcelain fragment' },
    });
    const earthenwareGuide = selectCaptureGuideForArtifact({
      nameZh: '无题陶器残片',
      tags: { category: 'earthenware fragment' },
    });
    const celadonGuide = selectCaptureGuideForArtifact({
      nameZh: '无题青瓷片',
      tags: { category: 'celadon fragment' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题残片',
      tags: { category: '陶片' },
    });
    const tabletGuide = selectCaptureGuideForArtifact({
      nameZh: '无题泥板',
      tags: { category: 'cuneiform tablet' },
    });
    const ostraconGuide = selectCaptureGuideForArtifact({
      nameZh: '无题陶片文字',
      tags: { category: 'ostracon' },
    });

    expect(ceramicGuide.kind).toBe('small');
    expect(porcelainGuide.kind).toBe('small');
    expect(earthenwareGuide.kind).toBe('small');
    expect(celadonGuide.kind).toBe('small');
    expect(chineseGuide.kind).toBe('small');
    expect(tabletGuide.kind).toBe('small');
    expect(ostraconGuide.kind).toBe('small');
    expect(ceramicGuide.mode).toBe('both');
    expect(captureGuideBrief(porcelainGuide)).toContain('小件展品');
  });

  it('Qwen 只补出棺椁或英文 sarcophagus 器类时也会驱动大件采集', () => {
    const coffinGuide = selectCaptureGuideForArtifact({
      nameZh: '无题石棺',
      tags: { category: '棺椁' },
    });
    const sarcophagusGuide = selectCaptureGuideForArtifact({
      nameZh: '无题木乃伊棺',
      tags: { category: 'sarcophagus' },
    });
    const mummyGuide = selectCaptureGuideForArtifact({
      nameZh: '无题遗存',
      tags: { category: 'mummified remains' },
    });

    expect(coffinGuide.kind).toBe('large');
    expect(sarcophagusGuide.kind).toBe('large');
    expect(mummyGuide.kind).toBe('large');
    expect(coffinGuide.mode).toBe('video');
    expect(captureGuideBrief(sarcophagusGuide)).toContain('大件 / 青铜重器 / 车马');
  });

  it('Qwen 只补出英文家具器类时也会驱动大件采集', () => {
    const throneGuide = selectCaptureGuideForArtifact({
      nameZh: '无题宝座',
      tags: { category: 'throne' },
    });
    const wardrobeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题橱柜',
      tags: { category: 'wardrobe' },
    });

    expect(throneGuide.kind).toBe('large');
    expect(wardrobeGuide.kind).toBe('large');
    expect(throneGuide.mode).toBe('video');
    expect(captureGuideBrief(wardrobeGuide)).toContain('大件 / 青铜重器 / 车马');
  });

  it('Qwen 只补出甲胄或英文 armor 器类时也会驱动大件采集', () => {
    const armorGuide = selectCaptureGuideForArtifact({
      nameZh: '无题甲胄',
      tags: { category: '甲胄' },
    });
    const englishArmorGuide = selectCaptureGuideForArtifact({
      nameZh: '无题盔甲',
      tags: { category: 'armor' },
    });
    const helmetGuide = selectCaptureGuideForArtifact({
      nameZh: '无题头盔',
      tags: { category: 'ceremonial helmet' },
    });

    expect(armorGuide.kind).toBe('large');
    expect(englishArmorGuide.kind).toBe('large');
    expect(helmetGuide.kind).toBe('large');
    expect(armorGuide.mode).toBe('video');
    expect(captureGuideBrief(englishArmorGuide)).toContain('大件 / 青铜重器 / 车马');
    expect(captureGuideBrief(helmetGuide)).toContain('大件 / 青铜重器 / 车马');
  });

  it('Qwen 只补出兵器或英文 sword / firearm 器类时也会驱动高反光采集', () => {
    const weaponGuide = selectCaptureGuideForArtifact({
      nameZh: '无题兵器',
      tags: { category: '兵器' },
    });
    const swordGuide = selectCaptureGuideForArtifact({
      nameZh: '无题刀剑',
      tags: { category: 'sword' },
    });
    const shieldGuide = selectCaptureGuideForArtifact({
      nameZh: '无题盾牌',
      tags: { category: 'shield' },
    });
    const firearmGuide = selectCaptureGuideForArtifact({
      nameZh: '无题火枪',
      tags: { category: 'firearm' },
    });

    expect(weaponGuide.kind).toBe('reflective');
    expect(swordGuide.kind).toBe('reflective');
    expect(shieldGuide.kind).toBe('reflective');
    expect(firearmGuide.kind).toBe('reflective');
    expect(weaponGuide.mode).toBe('both');
    expect(captureGuideBrief(swordGuide)).toContain('高反光 / 抛光材质');
  });

  it('Qwen 只补出英文建筑构件或浮雕器类时也会驱动石刻多高度采集', () => {
    const fragmentGuide = selectCaptureGuideForArtifact({
      nameZh: '无题建筑构件',
      tags: { category: 'architectural fragment' },
    });
    const reliefGuide = selectCaptureGuideForArtifact({
      nameZh: '无题浮雕',
      tags: { category: 'bas-relief' },
    });
    const plaqueGuide = selectCaptureGuideForArtifact({
      nameZh: '无题铭牌',
      tags: { category: 'inscribed stone plaque' },
    });
    const tabletGuide = selectCaptureGuideForArtifact({
      nameZh: '无题石牌',
      tags: { category: 'stone tablet' },
    });
    const commemorativeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题纪念牌',
      tags: { category: 'commemorative plaque' },
    });

    expect(fragmentGuide.kind).toBe('sculpture');
    expect(reliefGuide.kind).toBe('sculpture');
    expect(plaqueGuide.kind).toBe('sculpture');
    expect(tabletGuide.kind).toBe('sculpture');
    expect(commemorativeGuide.kind).toBe('sculpture');
    expect(fragmentGuide.mode).toBe('both');
    expect(captureGuideBrief(tabletGuide)).toContain('雕塑 / 塑像 / 俑');
  });

  it('Qwen 只补出木雕或牙雕器类时也会驱动雕塑多高度采集', () => {
    const woodGuide = selectCaptureGuideForArtifact({
      nameZh: '无题十二',
      tags: { category: 'wood carving' },
    });
    const ivoryGuide = selectCaptureGuideForArtifact({
      nameZh: '无题十三',
      tags: { category: 'ivory carving' },
    });

    expect(woodGuide.kind).toBe('sculpture');
    expect(ivoryGuide.kind).toBe('sculpture');
    expect(woodGuide.mode).toBe('both');
    expect(captureGuideBrief(ivoryGuide)).toContain('雕塑 / 塑像 / 俑');
  });

  it('Qwen 只补出陶塑或泥塑器类时也会驱动雕塑多高度采集', () => {
    const terracottaGuide = selectCaptureGuideForArtifact({
      nameZh: '无题陶塑',
      tags: { category: '陶塑' },
    });
    const clayGuide = selectCaptureGuideForArtifact({
      nameZh: '无题泥塑',
      tags: { category: '泥塑' },
    });
    const paintedGuide = selectCaptureGuideForArtifact({
      nameZh: '无题彩塑',
      tags: { category: '彩塑' },
    });

    expect(terracottaGuide.kind).toBe('sculpture');
    expect(clayGuide.kind).toBe('sculpture');
    expect(paintedGuide.kind).toBe('sculpture');
    expect(terracottaGuide.mode).toBe('both');
    expect(captureGuideBrief(paintedGuide)).toContain('雕塑 / 塑像 / 俑');
  });

  it('Qwen 只补出石膏翻模或英文 plaster cast 器类时也会驱动雕塑多高度采集', () => {
    const plasterGuide = selectCaptureGuideForArtifact({
      nameZh: '无题石膏像',
      tags: { category: 'plaster cast' },
    });
    const castGuide = selectCaptureGuideForArtifact({
      nameZh: '无题复制件',
      tags: { category: 'sculpture cast' },
    });

    expect(plasterGuide.kind).toBe('sculpture');
    expect(castGuide.kind).toBe('sculpture');
    expect(plasterGuide.mode).toBe('both');
    expect(captureGuideBrief(castGuide)).toContain('雕塑 / 塑像 / 俑');
  });

  it('Qwen 只补出能面或伎乐面器类时也会驱动雕塑多高度采集', () => {
    const nohGuide = selectCaptureGuideForArtifact({
      nameZh: '无题面具一',
      tags: { category: '能面' },
    });
    const bugakuGuide = selectCaptureGuideForArtifact({
      nameZh: '无题面具二',
      tags: { category: '伎乐面' },
    });
    const englishGuide = selectCaptureGuideForArtifact({
      nameZh: '无题面具三',
      tags: { category: 'Noh mask' },
    });

    expect(nohGuide.kind).toBe('sculpture');
    expect(bugakuGuide.kind).toBe('sculpture');
    expect(englishGuide.kind).toBe('sculpture');
    expect(nohGuide.mode).toBe('both');
    expect(captureGuideBrief(bugakuGuide)).toContain('雕塑 / 塑像 / 俑');
  });

  it('Qwen 只补出沙布提葬俑英文器类时也会驱动雕塑多高度采集', () => {
    const ushabtiGuide = selectCaptureGuideForArtifact({
      nameZh: '无题沙布提',
      tags: { category: 'ushabti' },
    });
    const shabtiGuide = selectCaptureGuideForArtifact({
      nameZh: '无题沙布提二',
      tags: { category: 'shabti' },
    });

    expect(ushabtiGuide.kind).toBe('sculpture');
    expect(shabtiGuide.kind).toBe('sculpture');
    expect(ushabtiGuide.mode).toBe('both');
    expect(captureGuideBrief(shabtiGuide)).toContain('雕塑 / 塑像 / 俑');
  });

  it('Qwen 只补出英文 screen 器类时也会驱动屏风平面多图采集', () => {
    const guide = selectCaptureGuideForArtifact({
      nameZh: '无题七',
      tags: { category: 'screen' },
    });

    expect(guide.kind).toBe('flat');
    expect(guide.mode).toBe('photo');
    expect(captureGuideBrief(guide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出册页或英文 album leaf 器类时也会驱动平面多图采集', () => {
    const albumLeafGuide = selectCaptureGuideForArtifact({
      nameZh: '无题册页',
      tags: { category: 'album leaf' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题册页二',
      tags: { category: '册页' },
    });

    expect(albumLeafGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(albumLeafGuide.mode).toBe('photo');
    expect(captureGuideBrief(chineseGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出相册或英文 scrapbook 器类时也会驱动平面多图采集', () => {
    const photoAlbumGuide = selectCaptureGuideForArtifact({
      nameZh: '家族影集',
      tags: { category: 'photograph album' },
    });
    const scrapbookGuide = selectCaptureGuideForArtifact({
      nameZh: '旅行剪贴簿',
      tags: { category: 'scrapbook' },
    });
    const photoBookGuide = selectCaptureGuideForArtifact({
      nameZh: '摄影集',
      tags: { category: 'photo book' },
    });
    const chinesePhotoBookGuide = selectCaptureGuideForArtifact({
      nameZh: '当代照片书',
      tags: { category: '照片书' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '民国相册',
      tags: { category: '剪贴簿' },
    });

    expect(photoAlbumGuide.kind).toBe('flat');
    expect(scrapbookGuide.kind).toBe('flat');
    expect(photoBookGuide.kind).toBe('flat');
    expect(chinesePhotoBookGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(scrapbookGuide.mode).toBe('photo');
    expect(captureGuideBrief(photoAlbumGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出手稿单叶或英文 folio 器类时也会驱动平面多图采集', () => {
    const manuscriptLeafGuide = selectCaptureGuideForArtifact({
      nameZh: '无题一',
      tags: { category: 'manuscript leaf' },
    });
    const folioGuide = selectCaptureGuideForArtifact({
      nameZh: '无题二',
      tags: { category: 'folio' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题三',
      tags: { category: '手稿页' },
    });

    expect(manuscriptLeafGuide.kind).toBe('flat');
    expect(folioGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(manuscriptLeafGuide.mode).toBe('photo');
    expect(captureGuideBrief(folioGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出古籍装帧或英文 bookbinding 器类时也会驱动平面多图采集', () => {
    const bindingGuide = selectCaptureGuideForArtifact({
      nameZh: '无题装帧',
      tags: { category: 'bookbinding' },
    });
    const manuscriptBindingGuide = selectCaptureGuideForArtifact({
      nameZh: '无题封皮',
      tags: { category: 'manuscript binding' },
    });
    const coverGuide = selectCaptureGuideForArtifact({
      nameZh: '无题书封',
      tags: { category: 'book cover' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题古籍',
      tags: { category: '古籍装帧' },
    });

    expect(bindingGuide.kind).toBe('flat');
    expect(manuscriptBindingGuide.kind).toBe('flat');
    expect(coverGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(bindingGuide.mode).toBe('photo');
    expect(captureGuideBrief(coverGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出乐谱或英文 musical score 器类时也会驱动平面多图采集', () => {
    const scoreGuide = selectCaptureGuideForArtifact({
      nameZh: '无题乐谱',
      tags: { category: 'musical score' },
    });
    const sheetMusicGuide = selectCaptureGuideForArtifact({
      nameZh: '无题手稿乐谱',
      tags: { category: 'sheet music' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题曲谱',
      tags: { category: '乐谱' },
    });
    const songbookGuide = selectCaptureGuideForArtifact({
      nameZh: '无题唱本',
      tags: { category: 'songbook' },
    });
    const librettoGuide = selectCaptureGuideForArtifact({
      nameZh: '无题歌剧脚本',
      tags: { category: 'libretto' },
    });

    expect(scoreGuide.kind).toBe('flat');
    expect(sheetMusicGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(songbookGuide.kind).toBe('flat');
    expect(librettoGuide.kind).toBe('flat');
    expect(scoreGuide.mode).toBe('photo');
    expect(captureGuideBrief(sheetMusicGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出唱片或英文 phonograph record 器类时也会驱动平面多图采集', () => {
    const phonographGuide = selectCaptureGuideForArtifact({
      nameZh: '无题录音',
      tags: { category: 'phonograph record' },
    });
    const shellacGuide = selectCaptureGuideForArtifact({
      nameZh: '无题唱片',
      tags: { category: 'shellac record' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题黑胶',
      tags: { category: '黑胶唱片' },
    });

    expect(phonographGuide.kind).toBe('flat');
    expect(shellacGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(phonographGuide.mode).toBe('photo');
    expect(captureGuideBrief(shellacGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出唐卡或英文 thangka 器类时也会驱动平面多图采集', () => {
    const thangkaGuide = selectCaptureGuideForArtifact({
      nameZh: '无题唐卡',
      tags: { category: 'thangka' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题佛画',
      tags: { category: '唐卡' },
    });

    expect(thangkaGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(thangkaGuide.mode).toBe('photo');
    expect(captureGuideBrief(chineseGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出圣像或祭坛画英文器类时也会驱动平面多图采集', () => {
    const iconGuide = selectCaptureGuideForArtifact({
      nameZh: '无题圣像',
      tags: { category: 'painted icon' },
    });
    const altarpieceGuide = selectCaptureGuideForArtifact({
      nameZh: '无题祭坛画',
      tags: { category: 'altarpiece' },
    });
    const triptychGuide = selectCaptureGuideForArtifact({
      nameZh: '无题三联画',
      tags: { category: 'triptych' },
    });

    expect(iconGuide.kind).toBe('flat');
    expect(altarpieceGuide.kind).toBe('flat');
    expect(triptychGuide.kind).toBe('flat');
    expect(iconGuide.mode).toBe('photo');
    expect(captureGuideBrief(altarpieceGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出折扇或英文 fan 器类时也会驱动平面多图采集', () => {
    const foldingFanGuide = selectCaptureGuideForArtifact({
      nameZh: '无题折扇',
      tags: { category: 'folding fan' },
    });
    const fanLeafGuide = selectCaptureGuideForArtifact({
      nameZh: '无题扇面',
      tags: { category: 'fan leaf' },
    });

    expect(foldingFanGuide.kind).toBe('flat');
    expect(fanLeafGuide.kind).toBe('flat');
    expect(foldingFanGuide.mode).toBe('photo');
    expect(captureGuideBrief(fanLeafGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出皮影或英文 shadow puppet 器类时也会驱动平面多图采集', () => {
    const shadowPuppetGuide = selectCaptureGuideForArtifact({
      nameZh: '无题皮影',
      tags: { category: 'shadow puppet' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题影偶',
      tags: { category: '皮影' },
    });

    expect(shadowPuppetGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(shadowPuppetGuide.mode).toBe('photo');
    expect(captureGuideBrief(chineseGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出地图或建筑图纸器类时也会驱动平面多图采集', () => {
    const mapGuide = selectCaptureGuideForArtifact({
      nameZh: '无题地图',
      tags: { category: 'map' },
    });
    const blueprintGuide = selectCaptureGuideForArtifact({
      nameZh: '无题图纸',
      tags: { category: 'architectural plan' },
    });

    expect(mapGuide.kind).toBe('flat');
    expect(blueprintGuide.kind).toBe('flat');
    expect(mapGuide.mode).toBe('photo');
    expect(captureGuideBrief(blueprintGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出图录或英文 catalogue 器类时也会驱动平面多图采集', () => {
    const catalogueGuide = selectCaptureGuideForArtifact({
      nameZh: '无题展览图录',
      tags: { category: 'catalogue' },
    });
    const exhibitionGuide = selectCaptureGuideForArtifact({
      nameZh: '无题展览目录',
      tags: { category: 'exhibition catalog' },
    });
    const auctionGuide = selectCaptureGuideForArtifact({
      nameZh: '无题拍卖图录',
      tags: { category: 'auction catalogue' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题图录',
      tags: { category: '展览图录' },
    });

    expect(catalogueGuide.kind).toBe('flat');
    expect(exhibitionGuide.kind).toBe('flat');
    expect(auctionGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(catalogueGuide.mode).toBe('photo');
    expect(captureGuideBrief(exhibitionGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出纸牌或英文 playing card 器类时也会驱动平面多图采集', () => {
    const playingCardGuide = selectCaptureGuideForArtifact({
      nameZh: '维多利亚纸牌',
      tags: { category: 'playing card' },
    });
    const tarotGuide = selectCaptureGuideForArtifact({
      nameZh: '塔罗牌',
      tags: { category: 'tarot cards' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '清代扑克牌',
      tags: { category: '扑克牌' },
    });

    expect(playingCardGuide.kind).toBe('flat');
    expect(tarotGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(playingCardGuide.mode).toBe('photo');
    expect(captureGuideBrief(tarotGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出英文印刷宣传品器类时也会驱动平面多图采集', () => {
    const ephemeraGuide = selectCaptureGuideForArtifact({
      nameZh: '无题八',
      tags: { category: 'printed ephemera' },
    });
    const pamphletGuide = selectCaptureGuideForArtifact({
      nameZh: '无题九',
      tags: { category: 'pamphlet' },
    });
    const playbillGuide = selectCaptureGuideForArtifact({
      nameZh: '无题节目单',
      tags: { category: 'playbill' },
    });
    const menuGuide = selectCaptureGuideForArtifact({
      nameZh: '无题菜单',
      tags: { category: 'restaurant menu' },
    });

    expect(ephemeraGuide.kind).toBe('flat');
    expect(pamphletGuide.kind).toBe('flat');
    expect(playbillGuide.kind).toBe('flat');
    expect(menuGuide.kind).toBe('flat');
    expect(ephemeraGuide.mode).toBe('photo');
    expect(captureGuideBrief(menuGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出邮票或首日封英文器类时也会驱动平面多图采集', () => {
    const stampGuide = selectCaptureGuideForArtifact({
      nameZh: '无题邮票',
      tags: { category: 'postage stamp' },
    });
    const coverGuide = selectCaptureGuideForArtifact({
      nameZh: '无题首日封',
      tags: { category: 'first day cover' },
    });
    const envelopeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题信封',
      tags: { category: 'envelope' },
    });

    expect(stampGuide.kind).toBe('flat');
    expect(coverGuide.kind).toBe('flat');
    expect(envelopeGuide.kind).toBe('flat');
    expect(stampGuide.mode).toBe('photo');
    expect(captureGuideBrief(coverGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出邀请函或商业卡英文器类时也会驱动平面多图采集', () => {
    const invitationGuide = selectCaptureGuideForArtifact({
      nameZh: '无题邀请函',
      tags: { category: 'invitation card' },
    });
    const tradeCardGuide = selectCaptureGuideForArtifact({
      nameZh: '无题商业卡',
      tags: { category: 'trade card' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题请柬',
      tags: { category: '请柬' },
    });

    expect(invitationGuide.kind).toBe('flat');
    expect(tradeCardGuide.kind).toBe('flat');
    expect(chineseGuide.kind).toBe('flat');
    expect(invitationGuide.mode).toBe('photo');
    expect(captureGuideBrief(tradeCardGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出木版画或浮世绘器类时也会驱动平面多图采集', () => {
    const woodblockGuide = selectCaptureGuideForArtifact({
      nameZh: '无题木版画',
      tags: { category: 'woodblock print' },
    });
    const ukiyoGuide = selectCaptureGuideForArtifact({
      nameZh: '无题浮世绘',
      tags: { category: 'ukiyo-e print' },
    });

    expect(woodblockGuide.kind).toBe('flat');
    expect(ukiyoGuide.kind).toBe('flat');
    expect(woodblockGuide.mode).toBe('photo');
    expect(captureGuideBrief(ukiyoGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出版画工艺术语时也会驱动平面多图采集', () => {
    const lithographGuide = selectCaptureGuideForArtifact({
      nameZh: '无题石版画',
      tags: { category: 'lithograph' },
    });
    const photogravureGuide = selectCaptureGuideForArtifact({
      nameZh: '无题照相凹版',
      tags: { category: 'photogravure' },
    });
    const collotypeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题珂罗版',
      tags: { category: 'collotype' },
    });
    const aquatintGuide = selectCaptureGuideForArtifact({
      nameZh: '无题飞尘腐蚀版',
      tags: { category: 'aquatint' },
    });
    const linocutGuide = selectCaptureGuideForArtifact({
      nameZh: '无题亚麻版',
      tags: { category: 'linocut' },
    });
    const monotypeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题单版画',
      tags: { category: 'monotype' },
    });
    const engravingGuide = selectCaptureGuideForArtifact({
      nameZh: '无题雕版画',
      tags: { category: 'engraving' },
    });
    const screenprintGuide = selectCaptureGuideForArtifact({
      nameZh: '无题丝网版画',
      tags: { category: 'screenprint' },
    });
    const silkscreenGuide = selectCaptureGuideForArtifact({
      nameZh: '无题丝网版画',
      tags: { category: 'silkscreen' },
    });

    expect(lithographGuide.kind).toBe('flat');
    expect(photogravureGuide.kind).toBe('flat');
    expect(collotypeGuide.kind).toBe('flat');
    expect(aquatintGuide.kind).toBe('flat');
    expect(linocutGuide.kind).toBe('flat');
    expect(monotypeGuide.kind).toBe('flat');
    expect(engravingGuide.kind).toBe('flat');
    expect(screenprintGuide.kind).toBe('flat');
    expect(silkscreenGuide.kind).toBe('flat');
    expect(lithographGuide.mode).toBe('photo');
    expect(captureGuideBrief(screenprintGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出摄影底片或玻璃干版器类时也会驱动平面多图采集', () => {
    const negativeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题底片',
      tags: { category: 'photographic negative' },
    });
    const glassPlateGuide = selectCaptureGuideForArtifact({
      nameZh: '无题玻璃干版',
      tags: { category: 'glass plate negative' },
    });
    const lanternSlideGuide = selectCaptureGuideForArtifact({
      nameZh: '无题幻灯片',
      tags: { category: 'lantern slide' },
    });

    expect(negativeGuide.kind).toBe('flat');
    expect(glassPlateGuide.kind).toBe('flat');
    expect(lanternSlideGuide.kind).toBe('flat');
    expect(negativeGuide.mode).toBe('photo');
    expect(captureGuideBrief(glassPlateGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出银版照或蛋白照片器类时也会驱动平面多图采集', () => {
    const daguerreotypeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题银版照',
      tags: { category: 'daguerreotype' },
    });
    const albumenGuide = selectCaptureGuideForArtifact({
      nameZh: '无题蛋白照片',
      tags: { category: 'albumen print' },
    });
    const cyanotypeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题蓝晒',
      tags: { category: 'cyanotype' },
    });

    expect(daguerreotypeGuide.kind).toBe('flat');
    expect(albumenGuide.kind).toBe('flat');
    expect(cyanotypeGuide.kind).toBe('flat');
    expect(daguerreotypeGuide.mode).toBe('photo');
    expect(captureGuideBrief(albumenGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出立体照片卡或 cabinet card 器类时也会驱动平面多图采集', () => {
    const stereographGuide = selectCaptureGuideForArtifact({
      nameZh: '无题立体照片',
      tags: { category: 'stereograph' },
    });
    const cabinetCardGuide = selectCaptureGuideForArtifact({
      nameZh: '无题肖像卡',
      tags: { category: 'cabinet card' },
    });
    const carteGuide = selectCaptureGuideForArtifact({
      nameZh: '无题名片照',
      tags: { category: 'carte-de-visite' },
    });

    expect(stereographGuide.kind).toBe('flat');
    expect(cabinetCardGuide.kind).toBe('flat');
    expect(carteGuide.kind).toBe('flat');
    expect(stereographGuide.mode).toBe('photo');
    expect(captureGuideBrief(cabinetCardGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出新闻剪报或通信类英文器类时也会驱动平面多图采集', () => {
    const clippingGuide = selectCaptureGuideForArtifact({
      nameZh: '无题剪报',
      tags: { category: 'newspaper clipping' },
    });
    const periodicalGuide = selectCaptureGuideForArtifact({
      nameZh: '无题期刊',
      tags: { category: 'periodical' },
    });
    const correspondenceGuide = selectCaptureGuideForArtifact({
      nameZh: '无题通信',
      tags: { category: 'correspondence' },
    });

    expect(clippingGuide.kind).toBe('flat');
    expect(periodicalGuide.kind).toBe('flat');
    expect(correspondenceGuide.kind).toBe('flat');
    expect(clippingGuide.mode).toBe('photo');
    expect(captureGuideBrief(correspondenceGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出自然史图版或标本夹页器类时也会驱动平面多图采集', () => {
    const botanicalGuide = selectCaptureGuideForArtifact({
      nameZh: '无题植物图版',
      tags: { category: 'botanical illustration' },
    });
    const sheetGuide = selectCaptureGuideForArtifact({
      nameZh: '无题标本夹页',
      tags: { category: 'specimen sheet' },
    });
    const drawerGuide = selectCaptureGuideForArtifact({
      nameZh: '无题昆虫标本抽屉',
      tags: { category: 'entomology drawer' },
    });

    expect(botanicalGuide.kind).toBe('flat');
    expect(sheetGuide.kind).toBe('flat');
    expect(drawerGuide.kind).toBe('flat');
    expect(botanicalGuide.mode).toBe('photo');
    expect(captureGuideBrief(drawerGuide)).toContain('书画 / 帛画 / 平面文物');
  });

  it('Qwen 只补出陨石或矿物标本器类时也会驱动小件采集', () => {
    const meteoriteGuide = selectCaptureGuideForArtifact({
      nameZh: '无题陨石',
      tags: { category: 'meteorite fragment' },
    });
    const mineralGuide = selectCaptureGuideForArtifact({
      nameZh: '无题矿物',
      tags: { category: 'mineral specimen' },
    });

    expect(meteoriteGuide.kind).toBe('small');
    expect(mineralGuide.kind).toBe('small');
    expect(meteoriteGuide.mode).toBe('both');
    expect(captureGuideBrief(mineralGuide)).toContain('小件展品');
  });

  it('Qwen 只补出珊瑚或贝类标本器类时也会驱动小件采集', () => {
    const coralGuide = selectCaptureGuideForArtifact({
      nameZh: '无题珊瑚',
      tags: { category: 'coral specimen' },
    });
    const shellGuide = selectCaptureGuideForArtifact({
      nameZh: '无题海螺',
      tags: { category: 'marine shell specimen' },
    });
    const conchGuide = selectCaptureGuideForArtifact({
      nameZh: '无题贝壳',
      tags: { category: 'conch shell' },
    });

    expect(coralGuide.kind).toBe('small');
    expect(shellGuide.kind).toBe('small');
    expect(conchGuide.kind).toBe('small');
    expect(coralGuide.mode).toBe('both');
    expect(captureGuideBrief(shellGuide)).toContain('小件展品');
  });

  it('Qwen 只补出液浸标本英文器类时也会驱动透明材质采集', () => {
    const jarGuide = selectCaptureGuideForArtifact({
      nameZh: '无题鱼类标本',
      tags: { category: 'wet specimen jar' },
    });
    const formalinGuide = selectCaptureGuideForArtifact({
      nameZh: '无题两栖标本',
      tags: { category: 'formalin-preserved specimen' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题液浸标本',
      tags: { category: '液浸标本' },
    });

    expect(jarGuide.kind).toBe('transparent');
    expect(formalinGuide.kind).toBe('transparent');
    expect(chineseGuide.kind).toBe('transparent');
    expect(jarGuide.mode).toBe('both');
    expect(captureGuideBrief(formalinGuide)).toContain('透明 / 半透明材质');
  });

  it('Qwen 只补出化石骨或恐龙蛋器类时也会驱动小件采集', () => {
    const boneGuide = selectCaptureGuideForArtifact({
      nameZh: '无题化石骨',
      tags: { category: 'fossil bone' },
    });
    const eggGuide = selectCaptureGuideForArtifact({
      nameZh: '无题恐龙蛋',
      tags: { category: 'dinosaur egg' },
    });

    expect(boneGuide.kind).toBe('small');
    expect(eggGuide.kind).toBe('small');
    expect(boneGuide.mode).toBe('both');
    expect(captureGuideBrief(eggGuide)).toContain('小件展品');
  });

  it('Qwen 只补出奖杯或英文 trophy 器类时也会驱动反光采集', () => {
    const trophyGuide = selectCaptureGuideForArtifact({
      nameZh: '无题奖杯',
      tags: { category: 'trophy' },
    });
    const awardCupGuide = selectCaptureGuideForArtifact({
      nameZh: '无题奖杯二',
      tags: { category: 'award cup' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题奖杯三',
      tags: { category: '奖杯' },
    });

    expect(trophyGuide.kind).toBe('reflective');
    expect(awardCupGuide.kind).toBe('reflective');
    expect(chineseGuide.kind).toBe('reflective');
    expect(trophyGuide.mode).toBe('both');
    expect(captureGuideBrief(awardCupGuide)).toContain('高反光 / 抛光材质');
  });

  it('Qwen 只补出玩具或英文 game piece 器类时也会驱动小件采集', () => {
    const toyGuide = selectCaptureGuideForArtifact({
      nameZh: '无题玩具',
      tags: { category: '玩具' },
    });
    const gamePieceGuide = selectCaptureGuideForArtifact({
      nameZh: '无题棋子',
      tags: { category: 'game piece' },
    });
    const puppetGuide = selectCaptureGuideForArtifact({
      nameZh: '无题木偶',
      tags: { category: 'puppet' },
    });

    expect(toyGuide.kind).toBe('small');
    expect(gamePieceGuide.kind).toBe('small');
    expect(puppetGuide.kind).toBe('small');
    expect(toyGuide.mode).toBe('both');
    expect(captureGuideBrief(gamePieceGuide)).toContain('小件展品');
  });

  it('Qwen 只补出钥匙或英文 padlock 器类时也会驱动小件采集', () => {
    const keyGuide = selectCaptureGuideForArtifact({
      nameZh: '无题钥匙',
      tags: { category: 'key' },
    });
    const padlockGuide = selectCaptureGuideForArtifact({
      nameZh: '无题挂锁',
      tags: { category: 'padlock' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题锁具',
      tags: { category: '锁具' },
    });

    expect(keyGuide.kind).toBe('small');
    expect(padlockGuide.kind).toBe('small');
    expect(chineseGuide.kind).toBe('small');
    expect(keyGuide.mode).toBe('both');
    expect(captureGuideBrief(padlockGuide)).toContain('小件展品');
  });

  it('Qwen 只补出鞋履或英文 footwear 器类时也会驱动小件采集', () => {
    const footwearGuide = selectCaptureGuideForArtifact({
      nameZh: '无题鞋履',
      tags: { category: 'footwear' },
    });
    const embroideredGuide = selectCaptureGuideForArtifact({
      nameZh: '无题绣鞋',
      tags: { category: 'embroidered shoes', material: ['silk embroidery'] },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题弓鞋',
      tags: { category: '绣鞋' },
    });

    expect(footwearGuide.kind).toBe('small');
    expect(embroideredGuide.kind).toBe('small');
    expect(chineseGuide.kind).toBe('small');
    expect(footwearGuide.mode).toBe('both');
    expect(captureGuideBrief(embroideredGuide)).toContain('小件展品');
  });

  it('Qwen 只补出烟具或英文 smoking pipe 器类时也会驱动小件采集', () => {
    const pipeGuide = selectCaptureGuideForArtifact({
      nameZh: '无题烟斗',
      tags: { category: 'smoking pipe' },
    });
    const hookahGuide = selectCaptureGuideForArtifact({
      nameZh: '无题水烟袋',
      tags: { category: 'hookah' },
    });
    const chineseGuide = selectCaptureGuideForArtifact({
      nameZh: '无题烟具',
      tags: { category: '烟具' },
    });

    expect(pipeGuide.kind).toBe('small');
    expect(hookahGuide.kind).toBe('small');
    expect(chineseGuide.kind).toBe('small');
    expect(pipeGuide.mode).toBe('both');
    expect(captureGuideBrief(hookahGuide)).toContain('小件展品');
  });
});
