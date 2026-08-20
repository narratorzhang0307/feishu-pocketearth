// 感知层：把三种输入归一成「候选展品名 + 展签原文 + 可选评分」。
// 展签是嵌套多字段 → 端侧 [visionRead]（原图不出端）优先；端侧读不出且用户允许 → Qwen 云端视觉兜底 [qwenVision]。
// 一句话用确定性正则抽取（[parseInput] skill），不耗云端。
import { visionRead } from '../skills/visionRead';
import { qwenVision } from '../skills/qwenVision';
import { parseRating as parseRatingText, parseTitle as parseTitleText } from '../skills/parseInput';
import { MUSEUM_SEEDS } from './catalog';

const EN_NUM: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5 };
const CN_NUM: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5 };
const EN_LABELED_STAR_RATING = /\b(?:rated|rating|score)\s*:?\s*(?:a\s+)?([0-5]|zero|one|two|three|four|five)(?:\s*stars?|[-\s]*star(?:\s+rating)?)\b/ig;
const EN_RATING = /\b([0-5]|zero|one|two|three|four|five)\s*stars?\b/ig;
const EN_CONTEXT_STAR_RATING = /\b(?:i\s+)?(?:gave|give|rated|rate|scored|score)\s+(?:it|this|this\s+one|the\s+(?:artifact|exhibit|piece|work))?\s*(?:as\s+)?(?:a\s+)?([0-5]|zero|one|two|three|four|five)(?:\s*stars?|[-\s]*star(?:\s+rating)?)\b/ig;
const EN_STAR_QUALIFIER_RATING = /\b(?:a\s+)?([0-5]|zero|one|two|three|four|five)[-\s]*star(?:\s+rating)?\b/ig;
const EN_FIVE_POINT_RATING = /\b(?:(?:rated|rating|score|rate)\s*:?\s*)?([0-5])\s*\/\s*5\b/ig;
const EN_OUT_OF_FIVE_RATING = /\b(?:(?:rated|rating|score|rate)\s*:?\s*)?([0-5]|zero|one|two|three|four|five)\s+out\s+of\s+(?:5|five)\b/ig;
const EN_LABELED_UNITLESS_RATING = /\b(?:rated|rating|score)\s*:?\s*(?:a\s+)?([0-5]|zero|one|two|three|four|five)\b/ig;
const CN_STAR_RATING_TEXT = String.raw`(?:^|[\s,，。；;、!！?？])([0-5零一二两三四五])\s*颗?\s*星(半)?(?:\s*(?:推荐|好评))?(?=$|[\s,，。；;、!！?？])`;
const CN_STAR_RATING = new RegExp(CN_STAR_RATING_TEXT, 'ig');
const CN_LABELED_UNITLESS_RATING = /(?:个人)?(?:评分|打分|给分)\s*[:：]?\s*([0-5零一二两三四五])(?:\s*(?:满分|好评|推荐))?/ig;
const CN_CONTEXT_SCORE_RATING = /(?:我给|个人给|给它|给|打分|给分|打|评分|评)\s*[:：]?\s*([0-5零一二两三四五])\s*分(?!之|钟|裂|期|钱)(?:\s*(?:满分|好评|推荐))?/ig;
const CN_TAIL_SCORE_RATING = /(?:^|[\s,，。；;、!！?？])([0-5零一二两三四五])\s*分(?!之|钟|裂|期|钱)(?:\s*(?:满分|好评|推荐))?/ig;
const CN_FULL_RATING = /(?:^|[\s,，。；;、!！?？])(?:满分|神作|封神)(?=$|[\s,，。；;、!！?？])/g;
const GLYPH_STAR_RATING_TEXT = String.raw`(?:^|[\s,，。；;、!！?？])((?:(?:⭐|★|☆)\ufe0f?\s*){1,5})(?=$|[\s,，。；;、!！?？])`;
const GLYPH_STAR_RATING = new RegExp(GLYPH_STAR_RATING_TEXT, 'g');

const normalizeRating = (rating: number | undefined): number | undefined => {
  if (typeof rating !== 'number') return undefined;
  return Math.max(0, Math.min(5, Math.round(Number.isFinite(rating) ? rating : 0)));
};

function parseGlyphStarRating(text: string): number | undefined {
  const match = new RegExp(GLYPH_STAR_RATING_TEXT).exec(text || '');
  if (!match) return undefined;
  return (match[1].match(/⭐|★/g) || []).length;
}

export const parseRating = (text: string): number | undefined => {
  const safeText = hideKnownStarWords(text || '');
  const glyphStars = parseGlyphStarRating(safeText);
  if (typeof glyphStars === 'number') return glyphStars;
  const cnScore = safeText.match(/(?:我给|个人给|给它|给|打分|给分|打|评分|评)\s*[:：]?\s*([0-5零一二两三四五])\s*分(?!之|钟|裂|期|钱)/i)
    || safeText.match(/(?:^|[\s,，。；;、!！?？])([0-5零一二两三四五])\s*分(?!之|钟|裂|期|钱)/i);
  if (cnScore) return /[0-5]/.test(cnScore[1]) ? Number(cnScore[1]) : CN_NUM[cnScore[1]];
  const labeledCnScore = safeText.match(/(?:个人)?(?:评分|打分|给分)\s*[:：]?\s*([0-5零一二两三四五])(?:\s*(?:满分|好评|推荐))?/i);
  if (labeledCnScore) return /[0-5]/.test(labeledCnScore[1]) ? Number(labeledCnScore[1]) : CN_NUM[labeledCnScore[1]];
  const cnStar = new RegExp(CN_STAR_RATING_TEXT, 'i').exec(safeText);
  if (cnStar) {
    const n = /[0-5]/.test(cnStar[1]) ? Number(cnStar[1]) : CN_NUM[cnStar[1]];
    return Math.max(0, Math.min(5, n + (cnStar[2] ? 1 : 0)));
  }
  const local = parseRatingText(safeText);
  if (typeof local === 'number') return local;
  const labeledStar = safeText.match(/\b(?:rated|rating|score)\s*:?\s*(?:a\s+)?([0-5]|zero|one|two|three|four|five)(?:\s*stars?|[-\s]*star(?:\s+rating)?)\b/i);
  if (labeledStar) return /[0-5]/.test(labeledStar[1]) ? Number(labeledStar[1]) : EN_NUM[labeledStar[1].toLowerCase()];
  const m = safeText.match(/\b([0-5]|zero|one|two|three|four|five)\s*stars?\b/i);
  if (m) return /[0-5]/.test(m[1]) ? Number(m[1]) : EN_NUM[m[1].toLowerCase()];
  const starQualifier = safeText.match(/\b(?:a\s+)?([0-5]|zero|one|two|three|four|five)[-\s]*star(?:\s+rating)?\b/i);
  if (starQualifier) return /[0-5]/.test(starQualifier[1]) ? Number(starQualifier[1]) : EN_NUM[starQualifier[1].toLowerCase()];
  const score = safeText.match(/\b(?:(?:rated|rating|score|rate)\s*:?\s*)?([0-5])\s*\/\s*5\b/i);
  if (score) return Number(score[1]);
  const outOfFive = safeText.match(/\b(?:(?:rated|rating|score|rate)\s*:?\s*)?([0-5]|zero|one|two|three|four|five)\s+out\s+of\s+(?:5|five)\b/i);
  if (outOfFive) return /[0-5]/.test(outOfFive[1]) ? Number(outOfFive[1]) : EN_NUM[outOfFive[1].toLowerCase()];
  const labeledUnitless = safeText.match(/\b(?:rated|rating|score)\s*:?\s*(?:a\s+)?([0-5]|zero|one|two|three|four|five)\b/i);
  if (labeledUnitless) return /[0-5]/.test(labeledUnitless[1]) ? Number(labeledUnitless[1]) : EN_NUM[labeledUnitless[1].toLowerCase()];
  return undefined;
};

const CN_VENUE_PREFIX = String.raw`在\s*(?:[一-龥]{2,16}(?:馆|博物院|博物馆|美术馆|展厅|展)?|[A-Za-z][A-Za-z\s.&'-]{1,40})\s*`;
const CN_VISIT_VERBS = String.raw`复看了?|重看了?|再看了?|二刷了?|看了|看过|看一下|看一眼|逛了|参观了?|看到了?|看|偶遇了?|遇见了?|碰见了?|喜欢了?|很喜欢|欣赏了?|端详了?|研究了?|拍了(?:一?张)?|拍到|拍下了?|拍摄了?|打卡了?|记录了?|标记了?|收藏了?|速写了?|临摹了?|记一下`;
const EN_VENUE_PREFIX = String.raw`(?:at|in)\s+[A-Za-z][A-Za-z\s.&'-]{1,40}\s+`;
const EN_VISIT_VERBS = String.raw`\b(?:saw|see|revisited|revisit|visited|viewed|view|checked\s+out|check\s+out|spent\s+time\s+with|paused\s+at|pause\s+at|looked\s+at|look\s+at|examined|examine|spotted|spot|noticed|notice|came\s+across|come\s+across|stumbled\s+upon|stumble\s+upon|photographed|photograph|shot|(?:took|take|got|get|captured|capture|snapped|snap)\s+(?:(?:a|some)\s+)?(?:photos?|pictures?|shots?|snapshots?|pics?)\s+of|studied|study|sketched|sketch|recorded|record|logged|log|made\s+a\s+note\s+of|noted|note|bookmarked|bookmark|saved|save|favorited|favorite|favourited|favourite|flagged|flag|marked|mark)\b`;
const EN_OPINION_VERBS = String.raw`\b(?:gave|give|rated|rate|scored|score)\b`;
const EN_REACTION_VERBS = String.raw`\b(?:loved|liked|admired|enjoyed|enjoy|appreciated|appreciate|was\s+impressed\s+by|were\s+impressed\s+by|recommended|recommend)\b`;
const EN_MUSEUM_TRIP_PREFIX = new RegExp(String.raw`^(?:i\s+)?(?:just\s+|today\s+)?(?:went\s+to|visited|stopped\s+by|dropped\s+by|popped\s+into|walked\s+through)\s+(?:the\s+)?[A-Za-z][A-Za-z\s.&'-]{1,40}\s*(?:and\s+|to\s+|then\s+|,\s*)(?:${EN_VISIT_VERBS}|${EN_REACTION_VERBS})\s+`, 'i');
const EN_VENUE_SUBJECT_PREFIX = new RegExp(String.raw`^(?:at|in)\s+(?:the\s+)?[A-Za-z][A-Za-z\s.&'-]{1,40}?\s*,?\s*(?:i\s+)?(?:${EN_VISIT_VERBS}|${EN_OPINION_VERBS}|${EN_REACTION_VERBS})\s+`, 'i');
const EN_MUSEUM_ALIASES = MUSEUM_SEEDS
  .flatMap((m) => m.aliases)
  .filter((a) => /^[\x00-\x7f]+$/.test(a))
  .sort((a, b) => b.length - a.length);
const KNOWN_MUSEUM_PREFIXES = MUSEUM_SEEDS
  .flatMap((m) => [m.name, ...m.aliases])
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);
const KNOWN_STAR_WORDS = KNOWN_MUSEUM_PREFIXES.filter((p) => /星/.test(p)).sort((a, b) => b.length - a.length);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hideKnownStarWords(text: string): string {
  let t = text;
  KNOWN_STAR_WORDS.forEach((word, i) => {
    t = t.replace(new RegExp(escapeRegExp(word), 'g'), `__EXH_STARWORD_${i}__`);
  });
  return t;
}

function restoreKnownStarWords(text: string): string {
  let t = text;
  KNOWN_STAR_WORDS.forEach((word, i) => {
    t = t.replace(new RegExp(`__EXH_STARWORD_${i}__`, 'g'), word);
  });
  return t;
}

const TITLE_QUOTE_PAIRS: Record<string, string> = {
  '"': '"',
  "'": "'",
  '“': '”',
  '‘': '’',
  '「': '」',
  '『': '』',
  '《': '》',
  '〈': '〉',
  '【': '】',
  '[': ']',
};
function stripWrappingTitleQuotes(title: string): string {
  let t = title.trim();
  while (t.length >= 2 && TITLE_QUOTE_PAIRS[t[0]] === t[t.length - 1]) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function stripLeadingEnglishMuseumAlias(title: string): string {
  const t = title.trim();
  for (const alias of EN_MUSEUM_ALIASES) {
    const re = new RegExp(String.raw`^(?:the\s+)?${escapeRegExp(alias)}\s+`, 'i');
    if (re.test(t)) return t.replace(re, '').trim();
  }
  return t;
}

function stripLeadingKnownMuseumPrefix(title: string): string {
  const t = title.trim();
  for (const prefix of KNOWN_MUSEUM_PREFIXES) {
    const escaped = escapeRegExp(prefix);
    const flags = /^[\x00-\x7f]+$/.test(prefix) ? 'i' : '';
    const re = new RegExp(String.raw`^(?:the\s+)?${escaped}(?:\s*[:：\-—–]\s*|\s+)`, flags);
    if (re.test(t)) {
      const rest = t.replace(re, '').trim();
      if (rest) return rest;
    }
  }
  return t;
}

function stripLeadingKnownMuseumVisitPrefix(title: string): string {
  const t = title.trim();
  for (const prefix of KNOWN_MUSEUM_PREFIXES) {
    const escaped = escapeRegExp(prefix);
    const flags = /^[\x00-\x7f]+$/.test(prefix) ? 'i' : '';
    const cnRe = new RegExp(String.raw`^(?:我)?(?:刚|今天|昨天|周末|最近)?\s*在\s*(?:the\s+)?${escaped}\s*(?:${CN_VISIT_VERBS})\s*`, flags);
    if (cnRe.test(t)) {
      const rest = t.replace(cnRe, '').trim();
      if (rest) return rest;
    }
  }
  return t;
}

function stripTrailingEnglishMuseumAlias(title: string): string {
  let t = title.trim();
  for (const alias of EN_MUSEUM_ALIASES) {
    const escaped = escapeRegExp(alias);
    const re = new RegExp(String.raw`\s+(?:at|in)\s+(?:the\s+)?${escaped}$`, 'i');
    if (re.test(t)) t = t.replace(re, '').trim();
  }
  return t;
}

export function pickLabelTitle(labelText: string): string {
  const lines = (labelText || '').split(/\n|。/).map((s) => s.trim()).filter(Boolean);
  const rawCandidates = lines.filter((s, i) => !isLabelTitleNoise(s) && !isSplitMetadataValue(s, lines[i - 1]));
  const candidates = rawCandidates.map(cleanLabelTitleCandidate).filter(Boolean);
  const first = candidates[0] || '';
  if (first && (first.length <= 20 || (/^[\x00-\x7f]+$/.test(first) && first.length <= 48))) return first;
  return candidates.find((s) => s.length <= 20)
    || candidates.find((s) => /^[\x00-\x7f]+$/.test(s) && s.length <= 48)
    || '';
}

function cleanLabelTitleCandidate(line: string): string {
  const cleaned = stripWrappingTitleQuotes(line.trim()
    .replace(/^(?:object|artifact|exhibit|item|work)\s+(?:title|name)\s*[:：]\s*/i, '')
    .replace(/^(?:object|artifact|exhibit|item|work)\s*[:：]\s*/i, '')
    .replace(/^(?:title|name)\s*[:：]\s*/i, '')
    .replace(/^(?:作品名称|展品名称|文物名称|藏品名称|作品名|题名|标题|名称)\s*[:：]\s*/, '')
    .replace(/^[：:\-—–]\s*/, '')
    .trim());
  // 中英同行的展签标题（国内馆常见排版：「康业相墓志 Epitaph of Kang Yexiang」印同一行，OCR 常按版面合行）：
  // 取 CJK 前缀作中文标题——否则整行超 20 字会被选行器跳过、错捡年代行当标题。
  const mixed = /^([㐀-鿿][㐀-鿿0-9·、（）()："" 　]{1,22}[㐀-鿿）)0-9])\s+[A-Za-z]/.exec(cleaned);
  if (mixed) {
    const cjk = mixed[1].trim();
    if (cjk.length >= 3 && cjk.length <= 20 && !isStandalonePeriodLine(cjk)) return cjk;
  }
  return cleaned;
}

function isLabelTitleNoise(line: string): boolean {
  const s = line.trim().replace(/[：:]\s*$/, '');
  if (isKnownMuseumHeading(s) || isLikelyMuseumInstitutionHeading(s)) return true;
  if (isStandalonePeriodLine(s)) return true;
  if (isStandaloneDimensionLine(s)) return true;
  if (isStandaloneAccessionFragmentLine(s)) return true;
  if (/^(?:title|name|(?:object|artifact|exhibit|item|work)\s+(?:title|name))$/i.test(s)) return true;
  if (/^(?:museum|registration|accession|acc\.?|inventory|catalog(?:ue)?|no\.?|number|#)$/i.test(s)) return true;
  if (/^(?:object|artifact|exhibit|item|work)$/i.test(s)) return true;
  if (/^(?:(?:museum|registration|accession|acc\.?|inventory|catalog(?:ue)?)\s*(?:no\.?|number|#)|(?:object|item)\s*(?:id|no\.?|number|#))$/i.test(s)) return true;
  if (/^(?:object|artifact|exhibit|item|work)\s+(?:type|category|classification)$/i.test(s)) return true;
  if (/^(?:object|artifact|exhibit|item|work)\s+(?:type|category|classification)\s*[:：-]\s*\S+/i.test(s)) return true;
  if (/^(?:material|materials|medium|techniques?|process|method|date|period|classification|category|culture|department|curatorial\s+department|provenance|collection|credit\s+line|dimensions?|location|site|findspot|excavation|place\s+of\s+origin|place\s+made|geography|origin)\s*[:：-]\s*\S+/i.test(s)) return true;
  if (/^(?:material|materials|medium|techniques?|process|method|date|period|classification|category|culture|department|curatorial\s+department|provenance|collection|credit\s+line|dimensions?|location|site|findspot|excavation|place\s+of\s+origin|place\s+made|geography)$/i.test(s)) return true;
  if (/^(?:artist|maker|creator|designer|author|workshop|studio)\s*[:：-]\s*\S+/i.test(s)) return true;
  if (/^(?:artist|maker|creator|designer|author|workshop|studio)$/i.test(s)) return true;
  if (/^(?:(?:unknown|unidentified)(?:\s+[a-z]+){0,3}\s+(?:artist|maker|creator|designer|author)|(?:artist|maker|creator|designer|author)\s+(?:unknown|unidentified)|anonymous(?:\s+(?:artist|maker|creator|designer|author))?)$/i.test(s)) return true;
  if (/^attributed\s+to\b/i.test(s)) return true;
  if (/^(?:on\s+loan\s+from|loaned\s+by|lent\s+by|gift\s+of|given\s+by|donated\s+by|bequest\s+of|purchased\s+(?:with|from|by)|acquired\s+(?:with|from|by)|courtesy\s+of|image\s+courtesy\s+of|photo(?:graph)?(?:y)?\s+by|copyright)\b/i.test(s)) return true;
  if (/^(?:private\s+collection|(?:from\s+)?(?:the\s+)?collection\s+of|estate\s+of)\b/i.test(s)) return true;
  if (/^(?:conservation|restoration|condition)\s*(?:treatment|report|notes?|status|history)?\s*[:：-]\s*\S+/i.test(s)) return true;
  if (/^(?:conservation|restoration|condition)\s*(?:treatment|report|notes?|status|history)?$/i.test(s)) return true;
  if (/^(?:restored|conserved|cleaned|treated|stabilized|stabilised|repaired)\s+by\b/i.test(s)) return true;
  if (/^(?:replica|reproduction|facsimile|copy)(?:\s+(?:of|after|from)\b.*)?$/i.test(s)) return true;
  if (/^(?:复制品|仿制品|复制件|摹本|模型)(?:\s*[:：-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:(?:not|no longer)\s+(?:currently\s+)?(?:on\s+)?view|not\s+(?:currently\s+)?displayed|currently\s+off\s+display|temporarily\s+off\s+display|on\s+(?:view|display))$/i.test(s)) return true;
  if (/^(?:label\s+(?:date|updated|revised)|text\s+(?:updated|revised))\s*[:：-]\s*\S+/i.test(s)) return true;
  if (/^(?:材质|材料|工艺|技法|制作工艺|制作方式|年代|时期|时代|分类|类别|文化|来源|藏地|尺寸|规格|产地|出土地|发现地|地点|位置|遗址|窑口)$/.test(s)) return true;
  if (/^(?:材质|材料|工艺|技法|制作工艺|制作方式|年代|时期|时代|分类|类别|文化|来源|藏地|尺寸|规格|产地|出土地|发现地|地点|位置|遗址|窑口)\s*[:：-]\s*\S+/.test(s)) return true;
  if (/^(?:暂不展出|未展出|不在展出|正在展出|展出中|标签日期|标签更新|文字更新)(?:\s*[:：-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:保护修复|修复记录|修复说明|保存状况|保护状况|修复单位|修复人员)$/.test(s)) return true;
  if (/^(?:保护修复|修复记录|修复说明|保存状况|保护状况|修复单位|修复人员)\s*[:：-]\s*\S+/.test(s)) return true;
  if (/^(?:编号|藏品编号|文物编号|馆藏号|登记号|注册号|入藏号|收藏编号|目录号|总登记号)$/.test(s)) return true;
  if (/^(?:编号|藏品编号|文物编号|馆藏号|登记号|注册号|入藏号|收藏编号|目录号|总登记号)\s*[:：#-]\s*\S+/.test(s)) return true;
  if (/^(?:作者|艺术家|创作者|制作者|制造者|设计者|绘者|画家)$/.test(s)) return true;
  if (/^(?:作者|艺术家|创作者|制作者|制造者|设计者|绘者|画家)\s*[:：-]\s*\S+/.test(s)) return true;
  if (/^(?:佚名|无名氏|不详|作者不详|艺术家不详|创作者不详|制作者不详|制造者不详|设计者不详|绘者不详|画家不详)$/.test(s)) return true;
  if (/^(?:策展人|策划|展览策划|策展团队)$/.test(s)) return true;
  if (/^(?:策展人|策划|展览策划|策展团队)\s*[:：-]\s*\S+/.test(s)) return true;
  if (/^(?:由.+(?:捐赠|借展|出借)|(?:捐赠|借展|出借|购藏|购于|摄影|图片|版权|鸣谢|致谢)\s*[:：-]\s*\S+)/.test(s)) return true;
  if (/^(?:私人收藏|私人藏品|个人收藏|个人藏品)(?:\s*[:：-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:作品名称|展品名称|文物名称|藏品名称|作品名|题名|标题|名称)$/.test(s)) return true;
  if (/^(?:展品信息|藏品信息|作品信息|文物信息|展签|说明牌)$/i.test(s)) return true;
  if (/^(?:object|exhibit|artifact|item)\s+(?:label|information|info)$/i.test(s)) return true;
  if (/^(?:gallery|section|case|display|room)\s+(?:label|information|info)$/i.test(s)) return true;
  if (/^(?:gallery|room|hall|case|vitrine|floor|level)$/i.test(s)) return true;
  if (/^(?:展厅|展室|展柜|陈列室|楼层|楼)$/.test(s)) return true;
  if (/^(?:introduction|overview|wall\s+text|gallery\s+text|section\s+text|interpretive\s+text|introductory\s+panel|section\s+panel|caption|image\s+caption)$/i.test(s)) return true;
  if (/^curated\s+by\b/i.test(s)) return true;
  if (/^(?:curator|exhibition\s+curator|curatorial\s+team)$/i.test(s)) return true;
  if (/^(?:curator|exhibition\s+curator|curatorial\s+team)\s*[:：-]\s*\S+/i.test(s)) return true;
  if (/^(?:展墙文字|展墙说明|展览前言|展区导语|展区说明|展柜说明|单元导语|单元说明|导言|前言)$/.test(s)) return true;
  if (/^(?:(?:opening|museum|gallery)\s+hours?|hours?|admission|tickets?|ticketing|ticket\s+office|visitor\s+information|visitor\s+guide)\b(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:开放时间|开馆时间|闭馆时间|参观时间|门票|票务|购票|售票处|参观须知|入场须知|观众须知)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:(?:become|join)\s+(?:a\s+)?member|members?|membership|donate(?:\s+today)?|donations?|support\s+(?:the\s+)?museum|museum\s+(?:shop|store|cafe|café)|gift\s+shop|bookshop|cafe|café|restaurant)\b(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:会员|会员服务|加入会员|成为会员|捐赠|捐款|支持我们|文创商店|纪念品商店|博物馆商店|书店|咖啡厅|餐厅|服务台)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:price|pricing|cost)$/i.test(s)) return true;
  if (/^(?:(?:ticket|member|regular|sale|retail)\s+)?(?:price|pricing|cost)\s*[:：#-]\s*(?:[$€£¥￥]\s*)?\d/i.test(s)) return true;
  if (/^(?:[$€£¥￥]\s*)?\d+(?:[.,]\d{2})?\s*(?:usd|eur|gbp|rmb|cny|元|块)?$/i.test(s)) return true;
  if (/^(?:add\s+to\s+(?:cart|basket)|checkout|buy\s+now|purchase\s+online|shop\s+online|order\s+online)(?:\b.*)?$/i.test(s)) return true;
  if (/^(?:价格|售价|原价|优惠价|会员价|小计|合计)\s*[:：#-]\s*(?:[¥￥]\s*)?\d/.test(s)) return true;
  if (/^(?:加入购物车|购物车|结账|立即购买|在线购买|购买此商品|去购买|下单)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:floor\s+plan|gallery\s+map|museum\s+map|site\s+map|wayfinding|visitor\s+route|route\s+map|you\s+are\s+here|exit\s+route|emergency\s+exit)\b(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:楼层导览|楼层地图|展馆地图|展厅地图|导览地图|参观路线|游览路线|路线图|您在这里|当前位置|出口指引|紧急出口)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:restrooms?|toilets?|washrooms?|bathrooms?|wc|cloakroom|coat\s+check|bag\s+(?:check|drop|storage)|lockers?|lifts?|elevators?|stairs?|escalators?|exits?|way\s+out|information\s+desk|visitor\s+services|first\s+aid|baby\s+(?:changing|care|feeding)\s+(?:room|station)|nursing\s+room|wheelchair\s+(?:access|rental|loan|services?)|stroller\s+(?:parking|rental)|pushchair\s+(?:parking|rental))\b(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:卫生间|洗手间|厕所|母婴室|无障碍卫生间|寄存处|存包处|行李寄存|储物柜|电梯|直梯|扶梯|自动扶梯|楼梯|出口|安全出口|问讯处|咨询台|服务台|急救处|急救站|医务室|婴儿护理室|哺乳室|轮椅租借|轮椅服务|无障碍入口|婴儿车停放|婴儿车租借)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:(?:free|museum|visitor|guest)?\s*wi[-\s]?fi|wireless\s+(?:internet|network)|wi[-\s]?fi\s+(?:available|access|information|info|network|password|code)|network\s+name|ssid|connect\s+to\s+(?:the\s+)?wi[-\s]?fi)\b(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:免费\s*)?(?:wifi|wi-fi|无线网络|无线网|访客网络|网络名称|无线密码|上网密码)(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:(?:follow|find|tag)\s+(?:us|the\s+museum)\b|@\w{2,}|(?:instagram|facebook|twitter|x|wechat|weibo|youtube|tiktok)\s*[:：#-]?\s*@?\w{2,})/i.test(s)) return true;
  if (/^(?:关注(?:我们|公众号|微博|小红书)?|微信公众号|官方微信|官方微博|扫码关注|分享至朋友圈)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:interactive\s+(?:display|screen|station|kiosk|table|activity|experience)|touch\s*screen(?:\s+(?:activity|display|station))?|digital\s+(?:label|kiosk|interactive|display))\b(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:互动屏|互动装置|互动体验|触摸屏|数字展项|数字导览|多媒体互动)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:this\s+(?:exhibition|display|gallery)\s+)?(?:is\s+)?(?:made\s+possible\s+by|supported\s+by|sponsored\s+by|funded\s+by|with\s+support\s+from|generously\s+supported\s+by)\b/i.test(s)) return true;
  if (/^(?:赞助单位|支持单位|合作单位|协办单位|主办单位|承办单位|特别鸣谢)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:large\s+print(?:\s+(?:label|guide|text))?|braille(?:\s+(?:label|text|guide))?|accessible\s+(?:label|text|guide)|accessibility\s+(?:information|guide)|audio\s+described)\b(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:无障碍导览|无障碍说明|无障碍信息|大字版说明|大字版导览|盲文说明|盲文标签)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:(?:audio|video|media|multimedia)\s+)?(?:transcript|closed\s+captions?|captions?|subtitles?)(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:音频文字稿|视频文字稿|讲解文字稿|媒体文字稿|文字稿|闭路字幕|无障碍字幕|字幕)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:(?:family|kids?|children(?:'s)?|school|student|teacher|learning|education(?:al)?)\s+(?:guide|trail|activity|activities|worksheet|resource|program(?:me)?|tour|label|station)|(?:activity|worksheet|education(?:al)?\s+resource)\s+(?:for\s+)?(?:families|kids?|children|students|teachers))\b(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:亲子导览|亲子活动|儿童导览|儿童活动|少儿导览|少儿活动|家庭导览|家庭活动|学习单|教育活动|研学活动|学生任务单|教师资源|学校导览)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:(?:select|choose|change|pick)\s+(?:a\s+)?language|languages?|language\s+(?:selection|selector|options?|menu)|available\s+languages?|language\s*[:：#-]\s*\S+)(?:\s*.*)?$/i.test(s)) return true;
  if (/^(?:语言|选择语言|语言选择|切换语言|可选语言|语言\s*[:：#-]\s*\S+)(?:\s*.*)?$/.test(s)) return true;
  if (/^(?:(?:share|leave|send)\s+(?:your\s+)?feedback|tell\s+us\s+what\s+you\s+think|visitor\s+(?:feedback|survey)|take\s+(?:our\s+)?survey|survey)\b(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:观众反馈|意见反馈|留言反馈|参与问卷|填写问卷|问卷调查)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:(?:public\s+)?program(?:me)?s?|events?|event\s+calendar|lecture|talk|artist\s+talk|workshops?|drop-in\s+workshop|guided\s+tour|tour\s+schedule|daily\s+tour|tour\s+time)\b(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:讲座|讲解|讲解时间|导览活动|导览时间|定时导览|公众活动|公教活动|教育项目|工作坊|活动预告|活动日程)(?:\s*[:：#-]?\s*.*)?$/.test(s)) return true;
  if (/^(?:audio\s+(?:guide|tour|description)|multimedia\s+guide|guide\s+number)\b(?:\s*[:：#-]?\s*[\w-]+)?$/i.test(s)) return true;
  if (/^(?:qr\s*code|barcode|scan\s+(?:(?:the\s+)?qr\s+code|for|to)\b.*|learn\s+more(?:\s+(?:online|at|on|about)\b.*)?|listen\s+(?:with|to)\b.*)$/i.test(s)) return true;
  if (/^(?:(?:download|get|install|open|use)\s+(?:the\s+)?(?:(?:museum|official|exhibition)\s+)?(?:mobile\s+)?app|(?:(?:museum|official|exhibition)\s+)(?:mobile\s+)?app|app\s+store|google\s+play|available\s+on\s+(?:the\s+)?app\s+store|open\s+in\s+(?:wechat|weixin)(?:\s+mini\s+program)?|wechat\s+mini\s+program|mini\s+program|bloomberg\s+connects(?:\s+(?:app|audio\s+guide|guide))?|smartify(?:\s+(?:app|audio\s+guide|guide))?)\b(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:(?:下载|安装|打开|使用)(?:官方|博物馆|展览)?(?:app|应用|小程序)|(?:官方|博物馆|展览)?(?:app|应用|小程序)(?:下载|入口|二维码)?)(?:\s*[:：#-]?\s*.*)?$/i.test(s)) return true;
  if (/^(?:please\s+)?(?:do\s+not|don't|dont)\s+touch\b/i.test(s)) return true;
  if (/^(?:no\s+flash(?:\s+photography)?|no\s+(?:flash\s+)?photo(?:graph)?s?|no\s+photography|photo(?:graph)?y\s+prohibited|flash(?:\s+photography)?\s+prohibited)\b/i.test(s)) return true;
  if (/^(?:(?:please\s+)?(?:silence|mute|switch\s+off|turn\s+off)\s+(?:your\s+)?(?:mobile\s+)?phones?|(?:mobile\s+)?phones?\s+(?:off|on\s+silent)|no\s+(?:filming|videos?|video(?:graphy)?|recording|tripods?|selfie\s+sticks?|smoking|vaping)|(?:filming|video(?:graphy)?|recording|tripods?|selfie\s+sticks?|smoking|vaping)\s+prohibited)\b/i.test(s)) return true;
  if (/^(?:(?:please\s+)?(?:keep|stay)\s+(?:behind|within)\s+(?:the\s+)?(?:barrier|line|rope|rail|marked\s+area)|(?:please\s+)?(?:do\s+not|don't|dont)\s+(?:cross|step\s+over)\s+(?:the\s+)?(?:barrier|line|rope|rail)|(?:please\s+)?(?:do\s+not|don't|dont)\s+(?:lean|sit|climb)\s+(?:on|against|over)\s+(?:the\s+)?(?:display\s+case|case|vitrine|glass|barrier|rail)|no\s+(?:food|drink|food\s+(?:or|and)\s+drink|drinks?|eating|eating\s+or\s+drinking))\b/i.test(s)) return true;
  if (/^(?:扫码|扫描|二维码|语音导览|语音讲解|导览编号|请勿触摸|禁止触摸|禁止拍照|请勿拍照|禁止摄影|请勿摄影|禁止摄像|请勿摄像|禁止录像|请勿录像|请勿使用闪光灯|请勿开闪光灯|禁止使用闪光灯|禁止闪光灯|勿用闪光灯|请勿使用三脚架|禁止三脚架|请勿使用自拍杆|禁止自拍杆|请将手机调至静音|请保持手机静音|手机静音|禁止吸烟|请勿吸烟|禁止电子烟|请勿越线|禁止越线|请勿跨越|禁止跨越|请勿进入围栏|禁止进入围栏|禁止饮食|请勿饮食|禁止食物和饮料|请勿携带食物和饮料|请勿倚靠|禁止倚靠|请勿攀爬|禁止攀爬)/.test(s)) return true;
  if (/^(?:gallery|room|hall|case|vitrine|floor|level)\s*(?:no\.?|number|#)?\s*[:#-]?\s*[a-z]?\d+[a-z]?$/i.test(s)) return true;
  if (/^(?:展厅|展室|展柜|陈列室|楼层|楼)\s*[:：#-]?\s*[a-z0-9一二三四五六七八九十百零〇号层楼室区-]+$/i.test(s)) return true;
  return /^(?:(?:museum|registration|accession|acc\.?|inventory|catalog(?:ue)?)\s*(?:no\.?|number|#)?|(?:object|item)\s*(?:id|no\.?|number|#)|(?:no\.?|number|#))\s*[:#-]?\s*[\w\s.,/-]*\d[\w\s.,/-]*$/i.test(s);
}

function isSplitMetadataValue(line: string, previousLine?: string): boolean {
  if (!previousLine || !line.trim()) return false;
  if (isSplitShortCodeHeader(previousLine)) return isSplitShortCodeValue(line);
  if (isSplitNetworkValueHeader(previousLine)) return isLikelyNetworkValue(line);
  if (isSplitMaterialValueHeader(previousLine)) return isLikelyMaterialValue(line);
  if (isSplitLanguageValueHeader(previousLine)) return isLikelyLanguageValue(line);
  return isSplitMetadataValueHeader(previousLine);
}

function isSplitMaterialValueHeader(line: string): boolean {
  const s = line.trim().replace(/[：:]\s*$/, '').replace(/\s+/g, ' ');
  if (/^(?:material|materials|medium)$/i.test(s)) return true;
  return /^(?:材质|材料|媒介)$/.test(s);
}

function isLikelyMaterialValue(line: string): boolean {
  const s = line.trim().replace(/\s+/g, ' ');
  if (!s) return false;

  const enWords = new Set([
    'acrylic', 'alabaster', 'and', 'basalt', 'bone', 'brass', 'bronze', 'canvas', 'ceramic', 'clay',
    'copper', 'cotton', 'earthenware', 'enamel', 'glass', 'glaze', 'glazed', 'gold', 'granite',
    'granodiorite', 'gouache', 'ink', 'iron', 'ivory', 'jade', 'lacquer', 'leaf', 'leather',
    'limestone', 'linen', 'marble', 'media', 'mixed', 'oil', 'on', 'paint', 'paper', 'parchment',
    'pigment', 'plaster', 'porcelain', 'pottery', 'sandstone', 'silk', 'silver', 'stone',
    'tempera', 'terracotta', 'textile', 'vellum', 'watercolor', 'watercolour', 'with', 'wood',
    'wool',
  ]);
  const enTokens = s.toLowerCase().replace(/[().,;]/g, ' ').split(/[\s/+&-]+/).filter(Boolean);
  if (/^[\x00-\x7f]+$/.test(s) && enTokens.length > 0 && enTokens.length <= 10 && enTokens.every((t) => enWords.has(t))) return true;

  const cnWords = new Set([
    '金', '银', '铜', '铁', '青铜', '陶', '陶器', '陶瓷', '瓷', '瓷器', '玉', '玉石', '石', '石材',
    '砂岩', '石灰岩', '大理石', '花岗岩', '玄武岩', '木', '木质', '漆木', '骨', '象牙', '玻璃',
    '纸', '纸本', '绢', '绢本', '丝', '丝绸', '织物', '纺织品', '棉', '麻', '皮革', '漆', '颜料',
    '水墨', '设色', '纸本设色', '绢本设色',
  ]);
  const cnTokens = s.replace(/[（）()]/g, ' ').split(/[、，,；;\s/+&-]+/).filter(Boolean);
  return cnTokens.length > 0 && cnTokens.length <= 8 && cnTokens.every((t) => cnWords.has(t));
}

function isSplitLanguageValueHeader(line: string): boolean {
  const s = line.trim().replace(/[：:]\s*$/, '').replace(/\s+/g, ' ');
  if (/^(?:language|languages?|select\s+language|choose\s+language|change\s+language|language\s+(?:selection|selector|menu|options?)|available\s+languages?)$/i.test(s)) return true;
  return /^(?:语言|语言选择|选择语言|切换语言|可选语言)$/.test(s);
}

function isLikelyLanguageValue(line: string): boolean {
  const s = line.trim().replace(/\s+/g, ' ');
  if (!s || s.length > 40) return false;
  const values = s.split(/[\/|,，、·]+/).map((part) => part.trim()).filter(Boolean);
  if (!values.length || values.length > 5) return false;
  const en = new Set(['english', 'chinese', 'mandarin', 'french', 'spanish', 'german', 'italian', 'japanese', 'korean']);
  const cn = new Set(['中文', '简体中文', '繁體中文', '英文', '普通话', '法文', '西班牙文', '德文', '意大利文', '日文', '韩文']);
  return values.every((value) => en.has(value.toLowerCase()) || cn.has(value));
}

function isSplitMetadataValueHeader(line: string): boolean {
  const s = line.trim().replace(/[：:]\s*$/, '').replace(/\s+/g, ' ');
  if (/^(?:artist|maker|creator|designer|author|workshop|studio|curator|exhibition\s+curator|curatorial\s+team|culture|department|curatorial\s+department|classification|category|(?:object|artifact|exhibit|item|work)\s+(?:type|category|classification)|techniques?|process|method|period|provenance|collection|credit\s+line|location|site|findspot|excavation|place\s+of\s+origin|place\s+made|geography|origin)$/i.test(s)) return true;
  return /^(?:作者|艺术家|创作者|制作者|制造者|设计者|绘者|画家|策展人|策划|展览策划|策展团队|文化|分类|类别|工艺|技法|制作工艺|制作方式|时期|时代|来源|藏地|产地|出土地|发现地|地点|位置|遗址|窑口)$/.test(s);
}

function isSplitShortCodeHeader(line: string): boolean {
  const s = line.trim().replace(/[：:]\s*$/, '').replace(/\s+/g, ' ');
  if (/^(?:gallery|room|hall|case|vitrine|floor|level|audio\s+(?:guide|tour|description)|multimedia\s+guide|guide\s+number|qr\s*code|barcode)$/i.test(s)) return true;
  return /^(?:展厅|展室|展柜|陈列室|楼层|楼|语音导览|语音讲解|导览编号|二维码|条形码)$/.test(s);
}

function isSplitShortCodeValue(line: string): boolean {
  const s = line.trim().replace(/\s+/g, '');
  return s.length <= 16 && /\d/.test(s) && /^[#A-Z0-9._-]+$/i.test(s);
}

function isSplitNetworkValueHeader(line: string): boolean {
  const s = line.trim().replace(/[：:]\s*$/, '').replace(/\s+/g, ' ');
  if (/^(?:wi[-\s]?fi|wireless)\s+(?:network|name)|network\s+name|ssid|wi[-\s]?fi\s+(?:password|code)$/i.test(s)) return true;
  return /^(?:网络名称|无线网络|无线网|访客网络|wifi|wi-fi|无线密码|上网密码)$/i.test(s);
}

function isLikelyNetworkValue(line: string): boolean {
  const s = line.trim().replace(/\s+/g, ' ');
  if (!s || s.length > 32) return false;
  if (/^[#@]?\w[\w.-]{1,31}$/i.test(s)) return true;
  return /^(?:museum|visitor|guest|free|public|wifi|wi[-\s]?fi)\s+[\w.-]{2,24}$/i.test(s);
}

function isStandalonePeriodLine(line: string): boolean {
  const s = line.trim();
  if (/^(?:(?:c\.?|ca\.?|circa|about)\s*)?(?:(?:ad|ce|bc|bce)\s*)?\d{3,4}(?:\s*[-–—]\s*(?:(?:ad|ce|bc|bce)\s*)?\d{1,4})?\s*(?:ad|ce|bc|bce)?$/i.test(s)) return true;
  if (/^(?:(?:ad|ce)\s*)?\d{1,4}\s*(?:ad|ce|bc|bce)$/i.test(s)) return true;
  if (/^(?:early|mid|middle|late)?\s*\d{1,2}(?:st|nd|rd|th)\s+century(?:\s*(?:ad|ce|bc|bce))?$/i.test(s)) return true;
  if (/^(?:neolithic|paleolithic|bronze\s+age|iron\s+age|archaic|classical|hellenistic|roman|byzantine|medieval|renaissance|baroque|qing|ming|tang|song|yuan|han|shang|zhou)\s+(?:period|dynasty|era)$/i.test(s)) return true;
  if (/^(?:新石器时代|旧石器时代|青铜时代|商代|周代|西周|东周|春秋|战国|秦代|汉代|西汉|东汉|魏晋|南北朝|隋代|唐代|五代|宋代|北宋|南宋|辽代|金代|元代|明代|清代|民国)(?:早期|中期|晚期|前期|后期)?$/.test(s)) return true;
  if (/^(?:约)?公元(?:前)?\s*\d{1,4}\s*(?:年|世纪)(?:[前中后早晚期]*)?$/.test(s)) return true;
  return false;
}

function isStandaloneDimensionLine(line: string): boolean {
  const s = line.trim().replace(/\s+/g, ' ');
  const n = String.raw`(?:\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+)`;
  const enUnit = String.raw`(?:cm|mm|m|in\.?|inch(?:es)?|ft|feet)`;
  const enPrefix = String.raw`(?:(?:h|w|d|l|diam(?:eter)?|height|width|depth|length|overall)\.?\s*[:：]?\s*)?`;
  if (new RegExp(String.raw`^${enPrefix}${n}(?:\s*(?:×|x|by)\s*${n}){0,3}\s*${enUnit}\.?(?:\s*(?:h|w|d|l)\.?)?$`, 'i').test(s)) return true;
  const cnPrefix = String.raw`(?:(?:通高|高|宽|长|厚|深|径|直径|口径|底径|尺寸|大小)\s*[:：]?\s*)?`;
  if (new RegExp(String.raw`^${cnPrefix}${n}(?:\s*(?:×|x|X|乘)\s*${n}){0,3}\s*(?:厘米|毫米|米|cm|mm|m)(?:\s*(?:高|宽|长|厚|深))?$`, 'i').test(s)) return true;
  return false;
}

function isStandaloneAccessionFragmentLine(line: string): boolean {
  const s = line.trim().replace(/\s+/g, ' ');
  if (/^[A-Z]{1,5}\s*[-.]?\s*\d[\dA-Z.,/-]*$/.test(s)) return true;
  return /^\d{2,5}[,./-]\d[\dA-Z,./-]*$/.test(s);
}

function isKnownMuseumHeading(line: string): boolean {
  const compact = (line || '').trim().replace(/^the\s+/i, '').replace(/\s+/g, ' ');
  if (!compact) return false;
  return KNOWN_MUSEUM_PREFIXES.some((prefix) => {
    const p = prefix.trim().replace(/^the\s+/i, '').replace(/\s+/g, ' ');
    if (!p) return false;
    if (/^[\x00-\x7f]+$/.test(p)) return compact.toLowerCase() === p.toLowerCase();
    return compact.replace(/\s/g, '') === p.replace(/\s/g, '');
  });
}

function isLikelyMuseumInstitutionHeading(line: string): boolean {
  const compact = (line || '').trim().replace(/^the\s+/i, '').replace(/\s+/g, ' ');
  if (!compact || compact.length > 80) return false;
  if (/[：:#]|\d|https?:|www\.|@/.test(compact)) return false;
  if (/(?:博物馆|博物院|美术馆|艺术馆|画廊|艺廊)$/.test(compact)) return true;
  if (!/^[\p{L}\p{M}\s&.'’+-]+$/u.test(compact)) return false;
  return /\b(?:museums?|galleries?|gallery|mus[eé]e|museo|museu|galerie|galeria|galería)\b/i.test(compact);
}

// 从一句话抽展品名：《》优先；否则去看展动词/地点前缀/名词噪声（解耦进 [parseInput]）。
export function parseTitle(text: string): string {
  const withoutEnglishRating = (text || '')
    .replace(EN_LABELED_STAR_RATING, ' ')
    .replace(EN_CONTEXT_STAR_RATING, ' ')
    .replace(EN_RATING, ' ')
    .replace(EN_STAR_QUALIFIER_RATING, ' ')
    .replace(EN_FIVE_POINT_RATING, ' ')
    .replace(EN_OUT_OF_FIVE_RATING, ' ')
    .replace(EN_LABELED_UNITLESS_RATING, ' ')
    .replace(CN_STAR_RATING, ' ')
    .replace(CN_CONTEXT_SCORE_RATING, ' ')
    .replace(CN_LABELED_UNITLESS_RATING, ' ')
    .replace(CN_TAIL_SCORE_RATING, ' ')
    .replace(CN_FULL_RATING, ' ')
    .replace(GLYPH_STAR_RATING, ' ');
  const withoutVenueSubjectPrefix = withoutEnglishRating.replace(EN_VENUE_SUBJECT_PREFIX, ' ');
  const withoutTripPrefix = withoutVenueSubjectPrefix.replace(EN_MUSEUM_TRIP_PREFIX, ' ');
  const withoutMuseumVisitPrefix = stripLeadingKnownMuseumVisitPrefix(withoutTripPrefix);
  const withoutMuseumPrefix = stripLeadingKnownMuseumPrefix(withoutMuseumVisitPrefix);
  const protectedMuseumWords = hideKnownStarWords(withoutMuseumPrefix);
  const parsed = restoreKnownStarWords(parseTitleText(protectedMuseumWords, {
    // 地点前缀「在xx馆/在 Met」连同看展动词一起去掉，展馆由 agent 单独 matchMuseum 提取。
    verbs: new RegExp(String.raw`我?(刚|今天|昨天|周末|最近)?(${CN_VENUE_PREFIX})?(${CN_VISIT_VERBS})|(?:i\s+)?(?:just\s+|today\s+)?(?:${EN_VENUE_PREFIX})?(?:${EN_VISIT_VERBS}|${EN_OPINION_VERBS}|${EN_REACTION_VERBS})`, 'gi'),
    nouns: /这[件个尊座]?(文物|展品|器物|展览)?|的?这件|展览|博物馆|\b(?:this|artifact|exhibit)\b/gi,
  }));
  return stripWrappingTitleQuotes(stripTrailingEnglishMuseumAlias(stripLeadingEnglishMuseumAlias(stripLeadingKnownMuseumPrefix(parsed))));
}

const LABEL_PROMPT = '提取博物馆展品说明牌上的所有文字，包含中文和英文，原样输出，不要总结。';
const OCR_PREAMBLE_RE = /^(?:(?:ocr|recognized|extracted|transcribed)\s*(?:text|result)?(?:\s*(?:as\s+follows|below))?|(?:here(?:'s| is)\s+)?(?:the\s+)?(?:extracted|recognized|transcribed)\s+text|(?:here(?:'s| is)\s+)?(?:the\s+)?(?:text|words?)\s+(?:in|from|on)\s+(?:the\s+)?(?:image|photo|label)(?:\s+(?:is|reads?))?|(?:here(?:'s| is)\s+)?(?:the\s+)?(?:image|photo|label)\s+(?:text|words?)(?:\s+(?:is|reads?))?|(?:识别|提取)(?:到的)?(?:文字|文本|内容|结果)(?:如下)?|(?:图片|照片|展签|说明牌|博物馆展品说明牌)(?:中的)?(?:文字|文本|内容|结果)(?:如下)?|(?:以下|下面)(?:是|为)?(?:图片|展签|说明牌|博物馆展品说明牌)?(?:中的)?(?:全部)?(?:文字|文本|内容))\s*[：:\-—–]?\s*/i;
const OCR_JSON_TEXT_KEYS = [
  'text', 'output_text', 'outputText',
  'labelText', 'label_text', 'museumLabelText', 'museum_label_text',
  'ocrText', 'ocr_text', 'recognizedText', 'recognized_text',
  'extractedText', 'extracted_text', 'transcription', 'transcribedText', 'transcribed_text',
  'rawText', 'raw_text', 'description', 'content', 'result', 'output', 'response',
];
const OCR_JSON_ARGUMENT_KEYS = ['args', 'arguments', 'parameters', 'params'];
const OCR_JSON_WRAPPER_KEYS = [
  'choices', 'message', 'candidates', 'candidate', 'data', 'result', 'results', 'items', 'responses',
  'museumLabel', 'museum_label', 'exhibitionLabel', 'exhibition_label',
  'artifact', 'exhibit', 'object', 'record', 'label',
  'fullTextAnnotation', 'full_text_annotation',
  'content', 'output_text', 'outputText', 'output', 'response',
  'parts', 'part', 'tool_calls', 'toolCalls', 'tool_call', 'toolCall',
  'functionCall', 'function_call', 'function',
];
const OCR_STRUCTURED_FIELD_KEYS = [
  'title', 'object', 'objectTitle', 'object_title', 'displayTitle', 'display_title',
  'name', 'objectName', 'object_name', 'nameZh', 'name_zh', 'chineseName', 'chinese_name',
  'nameEn', 'name_en', 'englishName', 'english_name',
  'period', 'date', 'dynasty', 'era',
  'materials', 'material', 'medium',
  'objectType', 'object_type', 'classification', 'category',
  'culture', 'civilization',
  'museum', 'museumName', 'museum_name', 'repository', 'institution', 'currentLocation', 'current_location',
];
const OCR_STRUCTURED_PLACEHOLDER_RE = /^(?:n\/?a|none|null|unknown|not\s+available|not\s+provided|暂无|无|未知|不详|未提供)$/i;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function stripOcrCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:text|md|markdown|json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

function parseOcrJsonPayload(text: string): unknown | null {
  const trimmed = stripOcrCodeFence(text);
  const candidates = [trimmed];
  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  for (const candidate of [...new Set(candidates)]) {
    if (!/^[{[]/.test(candidate)) continue;
    try {
      return JSON.parse(candidate);
    } catch { /* try next candidate */ }
  }
  return null;
}

function ocrStructuredValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => typeof item === 'string' || typeof item === 'number' ? String(item).trim() : '')
    .filter((item) => item && !OCR_STRUCTURED_PLACEHOLDER_RE.test(item));
}

function unwrapStructuredOcrFields(obj: Record<string, unknown>): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const key of OCR_STRUCTURED_FIELD_KEYS) {
    for (const value of ocrStructuredValues(obj[key])) {
      const dedupeKey = value.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      lines.push(value);
    }
  }
  return lines.join('\n').trim();
}

function unwrapOcrPayload(value: unknown, depth = 0): string {
  if (depth > 10) return '';
  if (typeof value === 'string') {
    const nested = parseOcrJsonPayload(value);
    if (nested != null) return unwrapOcrPayload(nested, depth + 1) || value.trim();
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => unwrapOcrPayload(item, depth + 1)).filter(Boolean).join('\n').trim();
  }
  if (!isRecord(value)) return '';
  const annotations = Array.isArray(value.textAnnotations) ? value.textAnnotations : Array.isArray(value.text_annotations) ? value.text_annotations : null;
  if (annotations?.length) {
    const text = unwrapOcrPayload(annotations[0], depth + 1);
    if (text) return text;
  }
  for (const key of OCR_JSON_TEXT_KEYS) {
    const text = unwrapOcrPayload(value[key], depth + 1);
    if (text) return text;
  }
  for (const key of OCR_JSON_ARGUMENT_KEYS) {
    const text = unwrapOcrPayload(value[key], depth + 1);
    if (text) return text;
  }
  const structuredText = unwrapStructuredOcrFields(value);
  if (structuredText) return structuredText;
  for (const key of OCR_JSON_WRAPPER_KEYS) {
    const text = unwrapOcrPayload(value[key], depth + 1);
    if (text) return text;
  }
  return '';
}

function unwrapOcrJsonText(text: string): string {
  const trimmed = stripOcrCodeFence(text);
  const parsed = parseOcrJsonPayload(trimmed);
  if (parsed == null) return trimmed;
  return unwrapOcrPayload(parsed) || trimmed;
}

function cleanOcrText(raw: string): string {
  const text = stripOcrCodeFence(raw || '');
  const lines = unwrapOcrJsonText(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '';
  const first = lines[0].replace(OCR_PREAMBLE_RE, '').trim();
  if (first) lines[0] = first;
  else lines.shift();
  const cleaned = lines.join('\n').trim();
  return unwrapOcrJsonText(cleaned).trim();
}

// 展签 OCR：端侧优先（原图不出端）；端侧读不出且 allowCloud → Qwen 云端视觉兜底（公开说明牌语义可接受）。
// 两路都读不出时标记为 manual，方便 UI / 审计明确进入手填兜底。
export async function ocrLabel(imageDataUrl: string, allowCloud = false): Promise<{ text: string; engine: 'edge-vision' | 'qwen-vision' | 'manual' }> {
  let edge = '';
  try { edge = cleanOcrText(await visionRead(imageDataUrl, LABEL_PROMPT, { max: 800 })); } catch { edge = ''; }
  if (edge) return { text: edge, engine: 'edge-vision' };
  if (allowCloud) {
    let cloud = '';
    try { cloud = cleanOcrText(await qwenVision(imageDataUrl, LABEL_PROMPT)); } catch { cloud = ''; }
    if (cloud) return { text: cloud, engine: 'qwen-vision' };
  }
  return { text: '', engine: 'manual' };
}

export interface Sensed { nameZh: string; rating?: number; labelText: string; from: 'quote' | 'ocr' | 'manual'; ocrEngine?: 'edge-vision' | 'qwen-vision' | 'manual' }
export async function sense(input: { kind: 'text' | 'image' | 'manual'; text?: string; imageDataUrl?: string; manualName?: string; manualRating?: number; allowCloud?: boolean }): Promise<Sensed> {
  if (input.kind === 'image' && input.imageDataUrl) {
    const { text: labelText, engine } = await ocrLabel(input.imageDataUrl, input.allowCloud);
    // 展签第一行常是展品名；取首个非空短行作候选名（云脑层会再校正）
    const firstLine = pickLabelTitle(labelText);
    return { nameZh: firstLine, labelText, from: 'ocr', ocrEngine: engine };
  }
  if (input.kind === 'manual') {
    return { nameZh: (input.manualName || '').trim(), rating: normalizeRating(input.manualRating), labelText: '', from: 'manual' };
  }
  const text = input.text || '';
  return { nameZh: parseTitle(text), rating: parseRating(text), labelText: '', from: 'quote' };
}
