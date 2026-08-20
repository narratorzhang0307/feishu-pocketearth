const TOPIC_RULES = Object.freeze([
  ['ai', /\bai\b|人工智能|大模型|模型|智能体|agent|llm|算力/i],
  ['technology', /科技|技术|芯片|半导体|机器人|网络安全|航天|太空产业/i],
  ['finance', /金融|财经|市场|央行|经济|投资|资产|金融科技|支付|稳定币/i],
  ['climate', /气候|环境|能源|极端天气|碳排放|全球变暖/i],
  ['science', /科学|研究|发现|实验|物理|天文|生物/i],
  ['health', /健康|医学|医疗|药物|疾病|公共卫生|生物技术/i],
  ['culture', /文化|艺术|电影|书籍|音乐|博物馆|考古|遗产|设计/i],
  ['policy', /政策|监管|法律|法规|制度|政府|公共治理/i],
]);

const KNOWLEDGE_TRIGGER = /新闻|消息|知识|事实|核验|证据|来源|进展|动态|发生了什么|值得知道|最新|最近|今日|今天.{0,8}(发生|进展|消息)|\bnews\b|\blatest\b|\bcurrent\b|\bfact/i;
const TEMPORAL_TRIGGER = /今天|今日|最近|本周|这周|现在|当前|最新|\btoday\b|\brecent\b|\bcurrent\b|\blatest\b/i;

export function selectPublicKnowledgeTopics(query, limit = 2) {
  const text = String(query || '').trim();
  if (!text) return [];
  const matched = TOPIC_RULES.flatMap(([topic, pattern]) => pattern.test(text) ? [topic] : []);
  if (!KNOWLEDGE_TRIGGER.test(text) && !(matched.length && TEMPORAL_TRIGGER.test(text))) return [];
  const topics = matched.length ? matched : ['ai', 'technology'];
  return [...new Set(topics)].slice(0, Math.max(1, Number(limit) || 1));
}

function normalizeTier(value) {
  return String(value || '').includes('L3') ? 'long-term' : 'short-term';
}

function normalizeEntry(record, bundle) {
  const sources = Array.isArray(record?.sources) ? record.sources : [];
  const commitment = record?.commitment || {};
  return {
    id: String(record?.id || commitment.recordHash || ''),
    kind: 'semantic',
    tier: normalizeTier(bundle?.memoryTier),
    content: String(record?.claim || '').trim(),
    summary: String(record?.summary || '').trim(),
    topic: String(record?.topic || bundle?.topic || ''),
    recordedAt: String(record?.createdAt || bundle?.generatedAt || ''),
    trustScore: Number(record?.truthScore) || 0,
    evidence: sources.slice(0, 3).map((source) => ({
      title: String(source?.title || ''),
      publisher: String(source?.publisher || ''),
      url: String(source?.url || ''),
      publishedAt: source?.publishedAt ? String(source.publishedAt) : null,
    })).filter((source) => source.title && source.url),
    metadata: {
      verdict: String(record?.verdict || ''),
      recordHash: String(commitment.recordHash || record?.recordHash || ''),
      editionRoot: String(bundle?.edition?.editionRoot || ''),
      humanReviewRequired: bundle?.reviewGate?.required !== false,
      mode: String(record?.mode || bundle?.mode || ''),
    },
  };
}

function isUsableRecord(record) {
  return record?.verdict === 'supported'
    && Number(record?.truthScore) >= 70
    && String(record?.claim || '').trim().length > 0
    && Array.isArray(record?.sources)
    && record.sources.length > 0;
}

export async function retrievePublicSemanticMemory(query, options = {}) {
  const topics = selectPublicKnowledgeTopics(query, options.maxTopics || 2);
  if (!topics.length) return [];
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== 'function') return [];
  const date = options.date && /^20\d{2}-\d{2}-\d{2}$/.test(String(options.date)) ? String(options.date) : '';
  const bundles = await Promise.all(topics.map(async (topic) => {
    try {
      const params = new URLSearchParams({ tool: 'today', topic });
      if (date) params.set('date', date);
      const response = await fetcher(`/api/knowledge?${params.toString()}`);
      if (!response?.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }));
  const maximum = Math.max(1, Number(options.maxEntries) || 3);
  return bundles.flatMap((bundle) => {
    if (!bundle || !Array.isArray(bundle.records)) return [];
    return bundle.records.filter(isUsableRecord).map((record) => normalizeEntry(record, bundle));
  }).filter((entry) => entry.id && entry.content).slice(0, maximum);
}

/** MemoryStore 的公共语义实现；只读，不提供 write/append，物理上杜绝污染私人画像。 */
export const publicSemanticStore = Object.freeze({
  kind: 'semantic',
  retrieve: retrievePublicSemanticMemory,
});

export function formatPublicSemanticMemory(entries) {
  if (!Array.isArray(entries) || !entries.length) return '';
  const records = entries.map((entry) => {
    const publishers = [...new Set((entry.evidence || []).map((item) => item.publisher).filter(Boolean))];
    const review = entry.metadata?.humanReviewRequired ? '待人工发布' : '人工已确认';
    const summary = entry.summary ? `\n  摘要：${entry.summary}` : '';
    const evidence = publishers.length ? `\n  证据来源：${publishers.join('、')}` : '';
    return `- [${entry.topic || '公共知识'} · 可信度 ${entry.trustScore || 0} · ${review}] ${entry.content}${summary}${evidence}`;
  });
  return [
    '# 公共语义记忆（只读，与私人画像隔离）',
    '仅把以下记录当作有来源的公共知识证据；不要把它们描述成用户的个人经历或偏好。模型核验不能代替人工发布决定。',
    ...records,
  ].join('\n');
}
