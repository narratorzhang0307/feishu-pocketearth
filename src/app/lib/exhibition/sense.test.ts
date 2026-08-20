import { describe, expect, it } from 'vitest';
import { parseRating, parseTitle, pickLabelTitle } from './sense';

describe('exhibition sense · 文本解析', () => {
  it('去掉中文展馆前缀但保留展品名', () => {
    expect(parseTitle('在国博看了唐代鎏金舞马银壶，五星')).toBe('唐代鎏金舞马银壶');
    expect(parseTitle('在国博看唐三彩骆驼，五星')).toBe('唐三彩骆驼');
    expect(parseTitle('在上博看过青铜鼎，四分')).toBe('青铜鼎');
    expect(parseRating('在上博看过青铜鼎，四分')).toBe(4);
  });

  it('去掉英文展馆前缀，支持无云脑海外看展记录', () => {
    expect(parseTitle('在 Met 看了 Rosetta Stone，五星')).toBe('Rosetta Stone');
    expect(parseTitle('今天在 British Museum 看到了 Rosetta Stone')).toBe('Rosetta Stone');
  });

  it('支持全英文口语输入的展馆前缀和评分', () => {
    expect(parseTitle('at Met saw Rosetta Stone, 5 stars')).toBe('Rosetta Stone');
    expect(parseTitle('at the Met saw Rosetta Stone, 5 stars')).toBe('Rosetta Stone');
    expect(parseTitle('in the British Museum saw Rosetta Stone, 5 stars')).toBe('Rosetta Stone');
    expect(parseRating('at Met saw Rosetta Stone, 5 stars')).toBe(5);
    expect(parseTitle('I visited Louvre Winged Victory, five stars')).toBe('Winged Victory');
    expect(parseRating('I visited Louvre Winged Victory, five stars')).toBe(5);
  });

  it('支持英文地点前缀后再接主语的现场手记', () => {
    expect(parseTitle('At the Met, I saw Temple of Dendur, four stars')).toBe('Temple of Dendur');
    expect(parseRating('At the Met, I saw Temple of Dendur, four stars')).toBe(4);
    expect(parseTitle('In the British Museum I looked at Rosetta Stone, five stars')).toBe('Rosetta Stone');
    expect(parseRating('In the British Museum I looked at Rosetta Stone, five stars')).toBe(5);
  });

  it('英文动词后展馆别名前的 the 不会残留到展品名', () => {
    expect(parseTitle('I visited the Met Temple of Dendur, four stars')).toBe('Temple of Dendur');
    expect(parseRating('I visited the Met Temple of Dendur, four stars')).toBe(4);
    expect(parseTitle('I visited the British Museum Rosetta Stone, five stars')).toBe('Rosetta Stone');
  });

  it('支持英文展馆放在句尾', () => {
    expect(parseTitle('saw Rosetta Stone at British Museum, 5 stars')).toBe('Rosetta Stone');
    expect(parseTitle('saw Rosetta Stone at the British Museum, 5 stars')).toBe('Rosetta Stone');
    expect(parseTitle('saw Temple of Dendur at the Met, 4 stars')).toBe('Temple of Dendur');
    expect(parseRating('saw Rosetta Stone at British Museum, 5 stars')).toBe(5);
  });

  it('支持英文先去展馆再看展品的句式', () => {
    expect(parseTitle('I went to the British Museum and saw Rosetta Stone, 5 stars')).toBe('Rosetta Stone');
    expect(parseRating('I went to the British Museum and saw Rosetta Stone, 5 stars')).toBe(5);
    expect(parseTitle('Went to the Met to see Temple of Dendur, four stars')).toBe('Temple of Dendur');
    expect(parseRating('Went to the Met to see Temple of Dendur, four stars')).toBe(4);
    expect(parseTitle('I dropped by the Met and saw Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseRating('I dropped by the Met and saw Temple of Dendur, 4 stars')).toBe(4);
    expect(parseTitle('I walked through the British Museum, paused at Rosetta Stone, five stars')).toBe('Rosetta Stone');
  });

  it('支持英文五分制评分并从标题中清掉', () => {
    expect(parseTitle('saw Rosetta Stone at British Museum, rated 5/5')).toBe('Rosetta Stone');
    expect(parseRating('saw Rosetta Stone at British Museum, rated 5/5')).toBe(5);
    expect(parseTitle('I visited Louvre Winged Victory rating: 4/5')).toBe('Winged Victory');
    expect(parseRating('I visited Louvre Winged Victory rating: 4/5')).toBe(4);
  });

  it('支持英文 out of five 评分并从标题中清掉', () => {
    expect(parseTitle('I visited Louvre Winged Victory, five out of five')).toBe('Winged Victory');
    expect(parseRating('I visited Louvre Winged Victory, five out of five')).toBe(5);
    expect(parseTitle('saw Rosetta Stone at the British Museum, rated 4 out of 5')).toBe('Rosetta Stone');
    expect(parseRating('saw Rosetta Stone at the British Museum, rated 4 out of 5')).toBe(4);
  });

  it('支持英文上下文星级评分并从标题中清掉', () => {
    expect(parseTitle('I went to the Met and saw Temple of Dendur, gave it five stars')).toBe('Temple of Dendur');
    expect(parseRating('I went to the Met and saw Temple of Dendur, gave it five stars')).toBe(5);
    expect(parseTitle('saw Rosetta Stone at the British Museum, rated five stars')).toBe('Rosetta Stone');
    expect(parseRating('saw Rosetta Stone at the British Museum, rated five stars')).toBe(5);
  });

  it('支持英文评分动词后直接接展品名', () => {
    expect(parseTitle('I rated Rosetta Stone five stars at the British Museum')).toBe('Rosetta Stone');
    expect(parseRating('I rated Rosetta Stone five stars at the British Museum')).toBe(5);
    expect(parseTitle('I gave Temple of Dendur 4/5 at the Met')).toBe('Temple of Dendur');
    expect(parseRating('I gave Temple of Dendur 4/5 at the Met')).toBe(4);
  });

  it('支持英文 five-star 评分并从标题中清掉', () => {
    expect(parseTitle('saw Rosetta Stone at the British Museum, a five-star rating')).toBe('Rosetta Stone');
    expect(parseRating('saw Rosetta Stone at the British Museum, a five-star rating')).toBe(5);
    expect(parseTitle('I gave Temple of Dendur a 4-star rating at the Met')).toBe('Temple of Dendur');
    expect(parseRating('I gave Temple of Dendur a 4-star rating at the Met')).toBe(4);
  });

  it('支持英文 rating/score 标注式星级评分并从标题中清掉', () => {
    expect(parseTitle('saw Rosetta Stone at the British Museum, rating: five stars')).toBe('Rosetta Stone');
    expect(parseRating('saw Rosetta Stone at the British Museum, rating: five stars')).toBe(5);
    expect(parseTitle('I visited Louvre Winged Victory, score: 4 stars')).toBe('Winged Victory');
    expect(parseRating('I visited Louvre Winged Victory, score: 4 stars')).toBe(4);
  });

  it('支持中英文评分字段省略星/分单位', () => {
    expect(parseTitle('saw Rosetta Stone at the British Museum, score: 4')).toBe('Rosetta Stone');
    expect(parseRating('saw Rosetta Stone at the British Museum, score: 4')).toBe(4);
    expect(parseTitle('I visited Louvre Winged Victory, rating: five')).toBe('Winged Victory');
    expect(parseRating('I visited Louvre Winged Victory, rating: five')).toBe(5);
    expect(parseTitle('在上博看了青铜鼎，评分：4分')).toBe('青铜鼎');
    expect(parseRating('在上博看了青铜鼎，评分：4分')).toBe(4);
    expect(parseTitle('在上博看了青铜鼎，评分：4')).toBe('青铜鼎');
    expect(parseRating('在上博看了青铜鼎，评分：4')).toBe(4);
    expect(parseTitle('在国博记录唐三彩骆驼，打分 5')).toBe('唐三彩骆驼');
    expect(parseRating('在国博记录唐三彩骆驼，打分 5')).toBe(5);
  });

  it('支持英文喜欢/欣赏/推荐类口语动词作为离线看展记录', () => {
    expect(parseTitle('I loved Rosetta Stone at the British Museum, five stars')).toBe('Rosetta Stone');
    expect(parseRating('I loved Rosetta Stone at the British Museum, five stars')).toBe(5);
    expect(parseTitle('Went to the Met and admired Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseRating('Went to the Met and admired Temple of Dendur, 4 stars')).toBe(4);
    expect(parseTitle('I enjoyed Rosetta Stone at the British Museum, five stars')).toBe('Rosetta Stone');
    expect(parseTitle('Went to the Met and appreciated Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseTitle('I was impressed by Rosetta Stone at the British Museum, five stars')).toBe('Rosetta Stone');
    expect(parseTitle('Went to the Met and recommend Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
  });

  it('支持英文复访/研究/速写类现场记录动词', () => {
    expect(parseTitle('I revisited Louvre Winged Victory, five stars')).toBe('Winged Victory');
    expect(parseRating('I revisited Louvre Winged Victory, five stars')).toBe(5);
    expect(parseTitle('Went to the British Museum and studied Rosetta Stone, 4 stars')).toBe('Rosetta Stone');
    expect(parseRating('Went to the British Museum and studied Rosetta Stone, 4 stars')).toBe(4);
    expect(parseTitle('at Met sketched Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
  });

  it('支持英文顺路停留和细看类现场记录动词', () => {
    expect(parseTitle('I checked out Rosetta Stone at the British Museum, 5 stars')).toBe('Rosetta Stone');
    expect(parseRating('I checked out Rosetta Stone at the British Museum, 5 stars')).toBe(5);
    expect(parseTitle('Went to the Met and spent time with Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseRating('Went to the Met and spent time with Temple of Dendur, 4 stars')).toBe(4);
    expect(parseTitle('Stopped by the Met to see Temple of Dendur, four stars')).toBe('Temple of Dendur');
    expect(parseRating('Stopped by the Met to see Temple of Dendur, four stars')).toBe(4);
    expect(parseTitle('I spotted Rosetta Stone at the British Museum, 5 stars')).toBe('Rosetta Stone');
    expect(parseRating('I spotted Rosetta Stone at the British Museum, 5 stars')).toBe(5);
    expect(parseTitle('Went to the Met and came across Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseTitle('I stumbled upon Winged Victory at the Louvre, five stars')).toBe('Winged Victory');
  });

  it('支持中英文端详和复看类现场记录动词', () => {
    expect(parseTitle('I looked at Rosetta Stone at the British Museum, 5 stars')).toBe('Rosetta Stone');
    expect(parseRating('I looked at Rosetta Stone at the British Museum, 5 stars')).toBe(5);
    expect(parseTitle('Went to the Met and examined Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseRating('Went to the Met and examined Temple of Dendur, 4 stars')).toBe(4);
    expect(parseTitle('在国博复看了唐三彩骆驼，五颗星')).toBe('唐三彩骆驼');
    expect(parseRating('在国博复看了唐三彩骆驼，五颗星')).toBe(5);
    expect(parseTitle('在上博二刷青铜鼎，四颗星')).toBe('青铜鼎');
  });

  it('支持英文记录/收藏类现场动词', () => {
    expect(parseTitle('I made a note of Rosetta Stone at British Museum, 5 stars')).toBe('Rosetta Stone');
    expect(parseRating('I made a note of Rosetta Stone at British Museum, 5 stars')).toBe(5);
    expect(parseTitle('Went to the Met and bookmarked Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseRating('Went to the Met and bookmarked Temple of Dendur, 4 stars')).toBe(4);
  });

  it('支持中英文标记/收藏类现场手记动词', () => {
    expect(parseTitle('I saved Rosetta Stone at the British Museum, 5 stars')).toBe('Rosetta Stone');
    expect(parseRating('I saved Rosetta Stone at the British Museum, 5 stars')).toBe(5);
    expect(parseTitle('Went to the Met and flagged Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseRating('Went to the Met and flagged Temple of Dendur, 4 stars')).toBe(4);
    expect(parseTitle('在国博标记了唐三彩骆驼，五颗星')).toBe('唐三彩骆驼');
    expect(parseRating('在国博收藏了唐三彩骆驼，四颗星')).toBe(4);
  });

  it('支持中英文拍照口语动词作为离线看展记录', () => {
    expect(parseTitle('I took a photo of Rosetta Stone at the British Museum, 5 stars')).toBe('Rosetta Stone');
    expect(parseRating('I took a photo of Rosetta Stone at the British Museum, 5 stars')).toBe(5);
    expect(parseTitle('Went to the Met and took pictures of Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseRating('Went to the Met and took pictures of Temple of Dendur, 4 stars')).toBe(4);
    expect(parseTitle('I got a snapshot of Rosetta Stone at the British Museum, 5 stars')).toBe('Rosetta Stone');
    expect(parseRating('I got a snapshot of Rosetta Stone at the British Museum, 5 stars')).toBe(5);
    expect(parseTitle('Went to the Met and captured a pic of Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseTitle('At the Met, I snapped a picture of Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseTitle('在国博拍到唐三彩骆驼，四颗星')).toBe('唐三彩骆驼');
    expect(parseRating('在国博拍到唐三彩骆驼，四颗星')).toBe(4);
    expect(parseTitle('在上博拍了一张青铜鼎，四分')).toBe('青铜鼎');
  });

  it('支持中文打卡/记录/速写类现场动词', () => {
    expect(parseTitle('在上博打卡青铜鼎，四颗星')).toBe('青铜鼎');
    expect(parseRating('在上博打卡青铜鼎，四颗星')).toBe(4);
    expect(parseTitle('在国博记录唐三彩骆驼，五颗星')).toBe('唐三彩骆驼');
    expect(parseRating('在国博记录唐三彩骆驼，五颗星')).toBe(5);
    expect(parseTitle('在大都会艺术博物馆速写了丹铎神庙，四分')).toBe('丹铎神庙');
    expect(parseTitle('在上博偶遇青铜鼎，四颗星')).toBe('青铜鼎');
    expect(parseRating('在上博偶遇青铜鼎，四颗星')).toBe(4);
    expect(parseTitle('在国博碰见了唐三彩骆驼，五颗星')).toBe('唐三彩骆驼');
  });

  it('支持中文喜欢/欣赏/研究类现场手记动词', () => {
    expect(parseTitle('我在国博很喜欢唐三彩骆驼，五星')).toBe('唐三彩骆驼');
    expect(parseRating('我在国博很喜欢唐三彩骆驼，五星')).toBe(5);
    expect(parseTitle('在上博欣赏青铜鼎，四分')).toBe('青铜鼎');
    expect(parseRating('在上博欣赏青铜鼎，四分')).toBe(4);
    expect(parseTitle('在卢浮宫研究胜利女神像，五分')).toBe('胜利女神像');
  });

  it('支持英文直接 see/view 动词作为展馆前缀', () => {
    expect(parseTitle('at Met see Temple of Dendur, 5 stars')).toBe('Temple of Dendur');
    expect(parseRating('at Met see Temple of Dendur, 5 stars')).toBe(5);
    expect(parseTitle('in the British Museum view Rosetta Stone, four stars')).toBe('Rosetta Stone');
    expect(parseRating('in the British Museum view Rosetta Stone, four stars')).toBe(4);
  });

  it('支持已知展馆名速记前缀', () => {
    expect(parseTitle('Met: Temple of Dendur, 4 stars')).toBe('Temple of Dendur');
    expect(parseRating('Met: Temple of Dendur, 4 stars')).toBe(4);
    expect(parseTitle('British Museum - Rosetta Stone, five stars')).toBe('Rosetta Stone');
    expect(parseRating('British Museum - Rosetta Stone, five stars')).toBe(5);
    expect(parseTitle('国博：唐三彩骆驼，五星')).toBe('唐三彩骆驼');
    expect(parseRating('国博：唐三彩骆驼，五星')).toBe(5);
    expect(parseTitle('上海博物馆 青铜鼎，四分')).toBe('青铜鼎');
    expect(parseRating('上海博物馆 青铜鼎，四分')).toBe(4);
  });

  it('不会把三星堆误判成三星评分', () => {
    expect(parseTitle('在三星堆看了青铜神树')).toBe('青铜神树');
    expect(parseRating('在三星堆看了青铜神树')).toBeUndefined();
    expect(parseTitle('三星堆青铜神树')).toBe('三星堆青铜神树');
    expect(parseRating('三星堆青铜神树')).toBeUndefined();
  });

  it('支持中文“颗星”评分并从标题中清掉', () => {
    expect(parseTitle('在国博看了唐三彩骆驼，五颗星')).toBe('唐三彩骆驼');
    expect(parseRating('在国博看了唐三彩骆驼，五颗星')).toBe(5);
    expect(parseTitle('在上博看了青铜鼎，四颗星推荐')).toBe('青铜鼎');
    expect(parseRating('在上博看了青铜鼎，四颗星推荐')).toBe(4);
  });

  it('支持中文分制口语评分并从标题中清掉', () => {
    expect(parseTitle('在国博看了唐三彩骆驼，四分')).toBe('唐三彩骆驼');
    expect(parseRating('在国博看了唐三彩骆驼，四分')).toBe(4);
    expect(parseTitle('在卢浮宫看了萨莫色雷斯胜利女神像，满分')).toBe('萨莫色雷斯胜利女神像');
    expect(parseRating('在卢浮宫看了萨莫色雷斯胜利女神像，满分')).toBe(5);
    expect(parseTitle('在上博看了青铜鼎，给它三分推荐')).toBe('青铜鼎');
    expect(parseRating('在上博看了青铜鼎，给它三分推荐')).toBe(3);
  });

  it('《》标题优先，评分仍可解析', () => {
    expect(parseTitle('在卢浮宫看了《萨莫色雷斯胜利女神像》，5星')).toBe('萨莫色雷斯胜利女神像');
    expect(parseRating('在卢浮宫看了《萨莫色雷斯胜利女神像》，5星')).toBe(5);
  });

  it('英文引号包裹的展品名会去掉外层引号', () => {
    expect(parseTitle('I saw "Rosetta Stone" at the British Museum, 5 stars')).toBe('Rosetta Stone');
    expect(parseTitle('at Met saw “Temple of Dendur”, four stars')).toBe('Temple of Dendur');
    expect(parseRating('I saw "Rosetta Stone" at the British Museum, 5 stars')).toBe(5);
  });

  it('支持星号和 emoji 星级作为离线手记评分', () => {
    expect(parseTitle('saw Rosetta Stone at British Museum ⭐⭐⭐⭐')).toBe('Rosetta Stone');
    expect(parseRating('saw Rosetta Stone at British Museum ⭐⭐⭐⭐')).toBe(4);
    expect(parseTitle('在国博看了唐三彩骆驼 ★★★★☆')).toBe('唐三彩骆驼');
    expect(parseRating('在国博看了唐三彩骆驼 ★★★★☆')).toBe(4);
    expect(parseRating('在上博记录青铜鼎 ☆☆☆☆☆')).toBe(0);
  });

  it('展签标题候选支持较长英文名', () => {
    expect(pickLabelTitle('Winged Victory of Samothrace\nMarble, Hellenistic period')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('Winged Victory of Samothrace\nMarble\nHellenistic period')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('"Winged Victory of Samothrace"\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('这是一段很长很长的说明文字超过候选标题长度\n短标题')).toBe('短标题');
  });

  it('展签标题候选会跳过编号和栏目标题', () => {
    expect(pickLabelTitle('Accession No. EA 24\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('展品信息\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('Object label\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
  });

  it('展签标题候选会跳过展厅和楼层编号', () => {
    expect(pickLabelTitle('Gallery 204\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Gallery\n204\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Room 4B\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('展厅 2\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('展厅\n2\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
  });

  it('展签标题候选会跳过已知展馆页眉', () => {
    expect(pickLabelTitle('The British Museum\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Met\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('大都会艺术博物馆\n丹铎神庙\n砂岩')).toBe('丹铎神庙');
    expect(pickLabelTitle('Musée du Louvre\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('The Metropolitan Museum of Art\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
  });

  it('展签标题候选会跳过部门页眉和部门值', () => {
    expect(pickLabelTitle('Department\nEgypt and Sudan\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Curatorial Department: Egyptian Antiquities\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
  });

  it('展签只有单行噪声时会交回手填兜底', () => {
    expect(pickLabelTitle('The British Museum')).toBe('');
    expect(pickLabelTitle('Gallery 204')).toBe('');
    expect(pickLabelTitle('Accession No. EA 24')).toBe('');
  });

  it('展签标题候选会清理字段名前缀', () => {
    expect(pickLabelTitle('Title: Rosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Object: Rosetta Stone\nMuseum number: EA 24')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Name:\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('Title\n: Rosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('作品名称：唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('题名\n- 青铜神树\n商代')).toBe('青铜神树');
  });

  it('展签标题候选会清理中文书名号和方括号包裹', () => {
    expect(pickLabelTitle('《唐三彩骆驼》\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('【青铜神树】\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('[Rosetta Stone]\nGranodiorite')).toBe('Rosetta Stone');
  });

  it('展签标题候选会跳过博物馆编号和分类字段', () => {
    expect(pickLabelTitle('Museum number: EA 24\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Acc. no. 1899,0609.1\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Object ID: 1978.412.1\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Accession\nNo. EA 24\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Accession\nEA 24\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Inventory\n1899,0609.1\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Object\n: Temple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Object type: sculpture\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('Materials\nTemple of Dendur')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Classification: sculpture\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('Culture: Ancient Egypt\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('材质：青铜\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('文化大革命时期宣传画\n纸本')).toBe('文化大革命时期宣传画');
  });

  it('展签标题候选会跳过工艺和技法字段', () => {
    expect(pickLabelTitle('Technique: oil on canvas\nWater Lilies\nClaude Monet')).toBe('Water Lilies');
    expect(pickLabelTitle('Method: cast bronze\nRitual bell\nBronze')).toBe('Ritual bell');
    expect(pickLabelTitle('工艺：鎏金\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('技法')).toBe('');
  });

  it('展签标题候选会跳过中文编号字段', () => {
    expect(pickLabelTitle('藏品编号：故001\n青花瓷碗\n明代')).toBe('青花瓷碗');
    expect(pickLabelTitle('登记号：沪博青-42\n青铜鼎\n西周')).toBe('青铜鼎');
    expect(pickLabelTitle('文物编号：2024-001\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('藏品编号：故001')).toBe('');
  });

  it('展签标题候选会跳过地点和出土地字段', () => {
    expect(pickLabelTitle('Location: Gallery 5\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Place of origin: Jingdezhen\nBlue-and-white bowl\nPorcelain')).toBe('Blue-and-white bowl');
    expect(pickLabelTitle('Findspot: Thebes\nFunerary mask\nGold')).toBe('Funerary mask');
    expect(pickLabelTitle('出土地：三星堆遗址\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Location: Gallery 5')).toBe('');
  });

  it('展签标题候选会跳过独立日期和时期行', () => {
    expect(pickLabelTitle('c. 1889\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('19th century\nBlue-and-white bowl\nPorcelain')).toBe('Blue-and-white bowl');
    expect(pickLabelTitle('Hellenistic period\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('唐代\n唐三彩骆驼\n陶')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('公元前 2 世纪\n青铜神树\n青铜')).toBe('青铜神树');
    expect(pickLabelTitle('19th century')).toBe('');
  });

  it('展签标题候选会跳过独立尺寸行', () => {
    expect(pickLabelTitle('H. 24 cm\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('24 x 13 x 8 cm\nBlue-and-white bowl\nPorcelain')).toBe('Blue-and-white bowl');
    expect(pickLabelTitle('通高 33.5 厘米\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('24 x 13 cm')).toBe('');
  });

  it('展签标题候选会跳过导览和二维码噪声', () => {
    expect(pickLabelTitle('Audio guide 24\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Audio guide\n24\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Audio tour: 1288\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('导览编号\n1288\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('QR code\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('QR code\nA1288\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('Scan the QR code to learn more\nBlue-and-white bowl\nPorcelain')).toBe('Blue-and-white bowl');
    expect(pickLabelTitle('Learn more at metmuseum.org\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('扫码听讲解\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('Audio guide 24')).toBe('');
    expect(pickLabelTitle('Audio tour: 1288')).toBe('');
  });

  it('展签标题候选会跳过 App 下载和小程序入口', () => {
    expect(pickLabelTitle('Download the museum app\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('App Store\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Google Play\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('Bloomberg Connects\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('Smartify audio guide\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('官方小程序\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('下载官方APP\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Download the museum app')).toBe('');
    expect(pickLabelTitle('Bloomberg Connects')).toBe('');
  });

  it('展签标题候选会跳过借展、捐赠和版权来源说明', () => {
    expect(pickLabelTitle('On loan from the National Gallery\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Gift of John Smith\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Private collection\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('Collection of John Smith\nBlue-and-white bowl\nPorcelain')).toBe('Blue-and-white bowl');
    expect(pickLabelTitle('Estate of Claude Monet\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('由张三捐赠\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('私人收藏\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Photography by Jane Doe')).toBe('');
    expect(pickLabelTitle('Private collection')).toBe('');
  });

  it('展签标题候选会跳过作者和制作人字段', () => {
    expect(pickLabelTitle('Artist: Claude Monet\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('Maker: Unknown Chinese artist\nBowl with dragons\nPorcelain')).toBe('Bowl with dragons');
    expect(pickLabelTitle('Unknown artist\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('Anonymous\nBowl with dragons\nPorcelain')).toBe('Bowl with dragons');
    expect(pickLabelTitle('佚名\n山水图\n纸本设色')).toBe('山水图');
    expect(pickLabelTitle('作者不详\n青铜鼎\n西周')).toBe('青铜鼎');
    expect(pickLabelTitle('作者：齐白石\n虾\n纸本设色')).toBe('虾');
    expect(pickLabelTitle('Artist: Claude Monet')).toBe('');
    expect(pickLabelTitle('Unknown artist')).toBe('');
  });

  it('展签标题候选会跳过拆行元数据字段值', () => {
    expect(pickLabelTitle('Artist:\nClaude Monet\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('Maker:\nUnknown Chinese artist\nBowl with dragons\nPorcelain')).toBe('Bowl with dragons');
    expect(pickLabelTitle('Culture:\nAncient Egypt\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Technique:\noil on canvas\nWater Lilies\nClaude Monet')).toBe('Water Lilies');
    expect(pickLabelTitle('Place of origin:\nJingdezhen\nBlue-and-white bowl\nPorcelain')).toBe('Blue-and-white bowl');
    expect(pickLabelTitle('Materials:\nGranodiorite\nRosetta Stone\nPtolemaic period')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Medium:\noil on canvas\nWater Lilies\nClaude Monet')).toBe('Water Lilies');
    expect(pickLabelTitle('材质\n青铜\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Materials\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
  });

  it('展签标题候选会跳过策展和展区标签字段', () => {
    expect(pickLabelTitle('Curated by Jane Doe\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('Gallery label\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('策展人：李明\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('展区说明\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle("Curator's Choice\nPorcelain")).toBe("Curator's Choice");
    expect(pickLabelTitle('Curatorial team')).toBe('');
  });

  it('展签标题候选会跳过票务和开放时间提示', () => {
    expect(pickLabelTitle('Opening hours: 10:00-18:00\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Tickets required\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('开放时间：9:00-17:00\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('购票请至二层\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('Opening hours: 10:00-18:00')).toBe('');
  });

  it('展签标题候选会跳过展墙说明类页眉', () => {
    expect(pickLabelTitle('Wall text\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Introductory panel\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('展墙文字\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Introduction')).toBe('');
  });

  it('展签标题候选会跳过禁止触摸和禁止拍照提示', () => {
    expect(pickLabelTitle('Please do not touch\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('No photography\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('No flash photography\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('禁止拍照\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('请勿使用闪光灯\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('Do not touch')).toBe('');
    expect(pickLabelTitle('No flash photography')).toBe('');
  });

  it('展签标题候选会跳过参观边界和饮食提示', () => {
    expect(pickLabelTitle('Please keep behind the barrier\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Do not cross the line\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Please do not lean on the display case\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('No filming\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('No tripods or selfie sticks\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Please silence mobile phones\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('No food or drink\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('禁止摄像\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('请将手机调至静音\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('请勿越线\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('请勿倚靠展柜\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('禁止饮食')).toBe('');
    expect(pickLabelTitle('Please do not lean on the glass')).toBe('');
    expect(pickLabelTitle('No filming')).toBe('');
    expect(pickLabelTitle('Please silence mobile phones')).toBe('');
  });

  it('展签标题候选会跳过保护和修复说明', () => {
    expect(pickLabelTitle('Conservation treatment: cleaned in 2021\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Restored by museum conservators\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('保护修复：2021年\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Condition report')).toBe('');
  });

  it('展签标题候选会跳过复制和仿制品说明', () => {
    expect(pickLabelTitle('Replica\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Facsimile of original\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('复制品\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('仿制品')).toBe('');
  });

  it('展签标题候选会跳过展出状态和标签日期说明', () => {
    expect(pickLabelTitle('Not on view\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Currently off display\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Label date: 2024\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('暂不展出\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Label date: 2024')).toBe('');
  });

  it('展签标题候选会跳过互动屏、赞助和无障碍信息', () => {
    expect(pickLabelTitle('Interactive display\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Touch screen activity\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Supported by the Mellon Foundation\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('赞助单位：某基金会\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Large print label\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('无障碍导览\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('Interactive display')).toBe('');
  });

  it('展签标题候选会跳过导览文字稿和字幕页眉', () => {
    expect(pickLabelTitle('Audio transcript\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Transcript\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Closed captions\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('字幕\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('讲解文字稿\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('Audio transcript')).toBe('');
  });

  it('展签标题候选会跳过亲子教育活动提示', () => {
    expect(pickLabelTitle('Family guide\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle("Children's activity\nTemple of Dendur\nSandstone")).toBe('Temple of Dendur');
    expect(pickLabelTitle('School worksheet\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('亲子导览\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('儿童活动\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Family guide')).toBe('');
  });

  it('展签标题候选会跳过楼层导览和地图提示', () => {
    expect(pickLabelTitle('Floor plan\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Gallery map\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('You are here\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('楼层导览\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('参观路线\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Floor plan')).toBe('');
  });

  it('展签标题候选会跳过设施和出口导视', () => {
    expect(pickLabelTitle('Restrooms\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Elevator\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Cloakroom\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('First aid\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('Baby changing room\nBlue-and-white bowl\nPorcelain')).toBe('Blue-and-white bowl');
    expect(pickLabelTitle('Wheelchair access\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('洗手间\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('电梯\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('婴儿护理室\n青花瓷碗\n明代')).toBe('青花瓷碗');
    expect(pickLabelTitle('轮椅租借\n青铜鼎\n西周')).toBe('青铜鼎');
    expect(pickLabelTitle('Restrooms')).toBe('');
    expect(pickLabelTitle('First aid')).toBe('');
    expect(pickLabelTitle('出口')).toBe('');
  });

  it('展签标题候选会跳过 Wi-Fi 和社媒关注提示', () => {
    expect(pickLabelTitle('Free Wi-Fi\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Wi-Fi network\nMuseumGuest\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Follow us @metmuseum\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('免费 WiFi\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('关注公众号\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Free Wi-Fi')).toBe('');
  });

  it('展签标题候选会跳过语言选择和反馈问卷提示', () => {
    expect(pickLabelTitle('Select language\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Language:\nEnglish\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Language: English\nWinged Victory of Samothrace\nMarble')).toBe('Winged Victory of Samothrace');
    expect(pickLabelTitle('选择语言\n中文\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('Share your feedback\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('观众反馈\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Select language')).toBe('');
    expect(pickLabelTitle('Visitor survey')).toBe('');
  });

  it('展签标题候选会跳过会员、捐赠和商店餐饮提示', () => {
    expect(pickLabelTitle('Become a member\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Donate today\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Museum shop\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('会员服务\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('文创商店\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('Become a member')).toBe('');
  });

  it('展签标题候选会跳过商店定价和购买按钮', () => {
    expect(pickLabelTitle('Price: $12.00\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Price\n$12.00\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Add to cart\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('售价：¥68\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('立即购买\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('Price: $12.00')).toBe('');
  });

  it('展签标题候选会跳过讲座活动和导览时间提示', () => {
    expect(pickLabelTitle('Public program\nRosetta Stone\nGranodiorite')).toBe('Rosetta Stone');
    expect(pickLabelTitle('Lecture: Friday 18:00\nTemple of Dendur\nSandstone')).toBe('Temple of Dendur');
    expect(pickLabelTitle('Guided tour schedule\nWater Lilies\nOil on canvas')).toBe('Water Lilies');
    expect(pickLabelTitle('讲座\n青铜神树\n商代')).toBe('青铜神树');
    expect(pickLabelTitle('导览时间：14:00\n唐三彩骆驼\n唐代')).toBe('唐三彩骆驼');
    expect(pickLabelTitle('Public program')).toBe('');
  });
});
