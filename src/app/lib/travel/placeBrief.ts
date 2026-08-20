import { runQwenGroundedPlaceBrief } from '../../../../frost-agent/edge/httpQwenEdge';

export interface TravelPlaceSource {
  title: string;
  publisher: string;
  language?: 'zh' | 'ja' | 'en';
  url: string;
  sourceGroup?: string;
  sourceType?: 'institution' | 'government' | 'encyclopedia';
  discoveredBy?: 'qwen-cloud' | 'direct-search' | 'wikipedia-fallback';
  authorityWeight?: 1 | 2 | 3;
  revisionId: number | null;
  excerpt: string;
}

export interface TravelPlaceBrief {
  text: string;
  sources: TravelPlaceSource[];
  retrievedAt: string;
  model: string;
  method: 'qwen-grounded' | 'source-extract';
  generationError?: string;
}

const cache = new Map<string, TravelPlaceBrief>();

async function runQwenCloudPlaceBrief(prompt: string, system: string): Promise<{ text: string; backend: 'qwen-cloud' | 'stub'; model?: string }> {
  try {
    const response = await fetch('/api/travel-place-brief', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, system }),
      signal: AbortSignal.timeout(50000),
    });
    if (!response.ok) return { text: '', backend: 'stub' };
    const data = await response.json() as { text?: unknown; backend?: unknown; model?: unknown };
    const ok = data.backend === 'qwen-cloud' && typeof data.text === 'string' && data.text.trim();
    return { text: ok ? (data.text as string).trim() : '', backend: ok ? 'qwen-cloud' : 'stub', model: typeof data.model === 'string' ? data.model : undefined };
  } catch { return { text: '', backend: 'stub' }; }
}

export const PLACE_BRIEF_SYSTEM = [
  '你是严谨的旅行资料压缩编辑，不是导游文案作者。只能压缩、重排和改写用户提供的编号材料，不得补充记忆中的事实。',
  '按材料标注的权威权重取舍：优先写被两个以上独立来源印证的事实；单一来源事实只在高权重官方材料明确记载时使用，并紧跟该材料编号。来源多不等于事实真，冲突时保留更高权重来源的谨慎表述。',
  '写450至550个汉字的中文介绍。用具体地名、人物、年代、建筑、物产、习俗或事件写出它区别于别处的特征；优先写多个材料能相互印证的事实。',
  '拒绝“历史悠久、文化底蕴深厚、独具魅力、值得一游”等空话。禁止补充材料没有的年份、菜肴、营业时间、价格、排名、体验、建议或游览承诺。',
  '只有材料中逐字出现的名称才可加引号；翻译或归纳后的称呼不要加引号。',
  '正文写成四个紧凑部分：它是什么、最耳熟能详的知识、到现场能辨认的特色、它为何形成这种特色。正文末尾标出实际使用的材料编号，如[1][2][3]。',
  '不要输出标题、Markdown、来源列表或链接，应用会在正文后单独附上原始材料。',
].join('');

export function buildPlaceBriefPrompt(city: string, place: string, sources: TravelPlaceSource[]): string {
  const material = sources.map((source, index) => `[${index + 1}] 权威权重 ${source.authorityWeight || 1}/3 · ${source.publisher}《${source.title}》\n${source.excerpt}`).join('\n\n');
  return `地点：${city} · ${place}\n\n三个独立机构发布的材料（同一机构的多语言页面不会重复计数）：\n${material}\n\n请先在内部交叉核对三份材料，再严格据此写一篇约500字、有特色、可逐句查证的介绍。没有依据的知识宁可不写。`;
}

export function normalizePlaceBriefText(value: string): string {
  const cleaned = value
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```[a-z]*\s*|\s*```$/gi, '')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^(?:介绍|正文)[:：]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= 620) return cleaned;
  const end = Math.max(cleaned.lastIndexOf('。', 560), cleaned.lastIndexOf('！', 560), cleaned.lastIndexOf('？', 560));
  return end >= 420 ? cleaned.slice(0, end + 1) : `${cleaned.slice(0, 550)}……`;
}

export function removeUnsupportedQuotationMarks(text: string, sources: TravelPlaceSource[]): string {
  const material = sources.map((source) => source.excerpt).join('\n');
  return text.replace(/[「“\"]([^」”\"]{2,24})[」”\"]/g, (quoted, phrase: string) => (
    material.includes(phrase) ? quoted : phrase
  ));
}

const EMPTY_PHRASES = [
  '闻名于世', '最具代表性', '必去', '不容错过', '正宗地道', '味觉记忆', '核心区域',
  '历史悠久', '底蕴深厚', '独具魅力', '值得一游', '令人流连忘返', '规模庞大', '最核心', '不可或缺',
];

const HIGH_RISK_FACTS = ['春卷', '寿司', '营业时间', '门票', '价格', '排名'];

export function isGroundedPlaceBrief(text: string, sources: TravelPlaceSource[]): boolean {
  const material = sources.map((source) => source.excerpt).join('\n');
  const unsupportedNumbers = text.match(/\d{2,}/g)?.some((value) => !material.includes(value)) ?? false;
  const emptyPhrase = EMPTY_PHRASES.some((claim) => text.includes(claim));
  const unsupportedRiskyFact = HIGH_RISK_FACTS.some((claim) => text.includes(claim) && !material.includes(claim));
  const unsupportedQuotedTerm = [...text.matchAll(/[「“"]([^」”"]{2,24})[」”"]/g)]
    .some((match) => !material.includes(match[1]));
  const citations = new Set([...text.matchAll(/\[([1-3])\]/g)].map((match) => match[1]));
  return text.length >= 350 && text.length <= 620 && citations.size >= Math.min(3, sources.length) && !unsupportedNumbers && !emptyPhrase && !unsupportedRiskyFact && !unsupportedQuotedTerm;
}

export function sourceExtractBrief(sources: TravelPlaceSource[]): string {
  const selected = sources.slice(0, 3);
  const chinese = selected.find((source) => source.language === 'zh' && source.excerpt.length >= 450);
  if (chinese) {
    const excerpt = chinese.excerpt
      .replace(/={2,}\s*概要\s*={2,}/g, ' ')
      .replace(/={2,}\s*([^=]+?)\s*={2,}/g, ' $1：')
      .replace(/\s+/g, ' ')
      .trim();
    return excerpt.length <= 525 ? `[1] ${excerpt}` : `[1] ${excerpt.slice(0, 518).trimEnd()}……`;
  }
  const quota = Math.max(150, Math.floor((525 - selected.length * 5) / Math.max(1, selected.length)));
  return selected.map((source, index) => {
    const excerpt = source.excerpt.replace(/\s+/g, ' ').trim();
    if (excerpt.length <= quota) return `[${index + 1}] ${excerpt}`;
    const clipped = excerpt.slice(0, Math.max(1, quota - 1)).trimEnd();
    return `[${index + 1}] ${clipped}……`;
  }).join('\n\n');
}

export async function loadTravelPlaceBrief(city: string, place: string): Promise<TravelPlaceBrief> {
  const key = `v10\u0000${city}\u0000${place}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const query = new URLSearchParams({ city, place });
  const response = await fetch(`/api/travel-place-sources?${query}`, { signal: AbortSignal.timeout(12000) });
  const data = await response.json().catch(() => ({ sources: [] }));
  const sourceGroups = new Set<string>();
  const sources: TravelPlaceSource[] = Array.isArray(data?.sources)
    ? (data.sources as TravelPlaceSource[]).filter((source) => {
      if (!source || !/^https:\/\//.test(source.url) || source.excerpt?.length < 80) return false;
      const group = source.sourceGroup || new URL(source.url).hostname.replace(/^www\./, '');
      if (sourceGroups.has(group)) return false;
      sourceGroups.add(group);
      return true;
    }).slice(0, 3)
    : [];
  if (sources.length < 3) throw new Error('暂未找到 3 个相互独立的可靠来源，未生成介绍');
  let text = '';
  let method: TravelPlaceBrief['method'] = 'qwen-grounded';
  let model = 'Qwen3-VL-2B-Instruct';
  let generationError: string | undefined;
  try {
    const prompt = buildPlaceBriefPrompt(city, place, sources);
    const cloud = await runQwenCloudPlaceBrief(prompt, PLACE_BRIEF_SYSTEM);
    const result = cloud.backend === 'qwen-cloud' ? cloud : await runQwenGroundedPlaceBrief(prompt, PLACE_BRIEF_SYSTEM);
    if (cloud.backend === 'qwen-cloud') model = cloud.model || 'qwen-plus';
    text = removeUnsupportedQuotationMarks(normalizePlaceBriefText(result.text), sources);
    const missingSources = sources.map((_, index) => `[${index + 1}]`).filter((marker) => !text.includes(marker)).join('');
    if (missingSources) text = `${text}${missingSources}`;
    if ((result.backend !== 'mnn' && result.backend !== 'qwen-cloud') || !isGroundedPlaceBrief(text, sources)) {
      text = sourceExtractBrief(sources);
      method = 'source-extract';
      generationError = '三个独立来源的事实校验已完成：为避免泛化，本次采用约500字原始材料摘编。';
    }
  } catch {
    text = sourceExtractBrief(sources);
    method = 'source-extract';
    generationError = 'Qwen 暂时不可用，本次展示原始材料摘编。';
  }
  const brief: TravelPlaceBrief = {
    text,
    sources,
    retrievedAt: typeof data.retrievedAt === 'string' ? data.retrievedAt : new Date().toISOString(),
    model,
    method,
    generationError,
  };
  cache.set(key, brief);
  return brief;
}
