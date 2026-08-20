const SHARED_POLICY = Object.freeze({
  freshnessHours: 72,
  minimumIndependentSources: 2,
  maxDiscoveryQueries: 2,
  maxSignals: 4,
  maxEvidenceCalls: 4,
  maxEvidencePerSignal: 6,
  maxVerifiedRecords: 2,
  blockedDomains: Object.freeze([
    'news.google.com',
    'google.com',
    'bing.com',
    'www.bing.com',
    'msn.com',
    'aol.com',
    'yahoo.com',
    'beincrypto.com',
    'gizmodo.com',
  ]),
})

function topic(config) {
  return Object.freeze({
    ...config,
    queries: Object.freeze(config.queries),
    preferredDomains: Object.freeze(config.preferredDomains),
    priorityTerms: Object.freeze(config.priorityTerms || []),
    excludedTerms: Object.freeze(config.excludedTerms || []),
    policy: SHARED_POLICY,
  })
}

// Eight domain experts share one Knowledge Scout Harness. These objects contain
// only domain differences: vocabulary, source preferences and presentation role.
export const KNOWLEDGE_TOPICS = Object.freeze({
  ai: topic({
    agentId: 'knowledge-scout.ai.v1',
    label: 'AI',
    role: '模型、研究、监管与芯片',
    query: 'Google artificial intelligence models research regulation chips',
    queries: [
      'artificial intelligence',
      'AI safety model release official research laboratory',
    ],
    preferredDomains: ['ai.google.dev', 'deepmind.google', 'research.google', 'blog.google', 'nature.com', 'science.org', 'reuters.com', 'nytimes.com'],
    priorityTerms: ['model', 'research', 'regulation', 'safety', 'chip', 'benchmark', 'release', 'open-weight', 'laboratory'],
    excludedTerms: ['mlb', 'baseball', 'dugout', 'fantasy sports'],
  }),
  technology: topic({
    agentId: 'knowledge-scout.technology.v1',
    label: '科技',
    role: '半导体、机器人、网络安全与航天',
    query: 'technology semiconductors robotics cybersecurity space research',
    queries: [
      'technology',
      'technology research launch security official announcement',
    ],
    preferredDomains: ['ieee.org', 'nist.gov', 'nasa.gov', 'esa.int', 'reuters.com', 'nature.com'],
    priorityTerms: ['semiconductor', 'robot', 'cybersecurity', 'space', 'launch', 'standard', 'infrastructure'],
    excludedTerms: ['celebrity', 'gossip'],
  }),
  finance: topic({
    agentId: 'knowledge-scout.finance.v1',
    label: '金融',
    role: '市场、央行、监管与全球经济',
    query: 'global finance markets central banks regulation digital infrastructure',
    queries: [
      'global markets finance',
      'digital assets financial infrastructure official regulation',
    ],
    preferredDomains: ['imf.org', 'bis.org', 'worldbank.org', 'federalreserve.gov', 'ecb.europa.eu', 'reuters.com'],
    priorityTerms: ['central bank', 'regulation', 'market', 'inflation', 'economy', 'infrastructure', 'stablecoin'],
    excludedTerms: ['lottery', 'celebrity'],
  }),
  climate: topic({
    agentId: 'knowledge-scout.climate.v1',
    label: '气候',
    role: '气候、能源转型与极端天气',
    query: 'climate science energy transition emissions policy weather research',
    queries: [
      'climate',
      'extreme weather climate report official research',
    ],
    preferredDomains: ['ipcc.ch', 'wmo.int', 'noaa.gov', 'nasa.gov', 'iea.org', 'carbonbrief.org', 'nature.com'],
    priorityTerms: ['climate', 'emission', 'energy', 'temperature', 'weather', 'transition', 'report'],
    excludedTerms: ['celebrity'],
  }),
  science: topic({
    agentId: 'knowledge-scout.science.v1',
    label: '科学',
    role: '太空、生命、物理与研究发现',
    query: 'science research discovery peer reviewed space biology physics',
    queries: [
      'science research',
      'space astronomy research institution discovery',
    ],
    preferredDomains: ['nature.com', 'science.org', 'pnas.org', 'nasa.gov', 'esa.int', 'cern.ch'],
    priorityTerms: ['study', 'research', 'discovery', 'experiment', 'peer-reviewed', 'mission'],
    excludedTerms: ['horoscope', 'astrology'],
  }),
  health: topic({
    agentId: 'knowledge-scout.health.v1',
    label: '健康生命',
    role: '健康、医学、生物技术与公共卫生',
    query: 'global health medicine biotechnology public health research',
    queries: [
      'health medicine',
      'health agency guideline trial official research',
    ],
    preferredDomains: ['who.int', 'nih.gov', 'cdc.gov', 'fda.gov', 'thelancet.com', 'nejm.org', 'nature.com'],
    priorityTerms: ['trial', 'study', 'guideline', 'public health', 'medicine', 'biotechnology', 'vaccine'],
    excludedTerms: ['celebrity diet', 'miracle cure'],
  }),
  culture: topic({
    agentId: 'knowledge-scout.culture.v1',
    label: '文化',
    role: '城市、文化、考古、遗产与设计',
    query: 'books film music museums cultural heritage research',
    queries: [
      'culture museum film books',
      'culture design preservation institution announcement',
    ],
    preferredDomains: ['unesco.org', 'icom.museum', 'metmuseum.org', 'britishmuseum.org', 'smithsonianmag.com'],
    priorityTerms: ['museum', 'heritage', 'archaeology', 'book', 'film', 'music', 'design', 'preservation'],
    excludedTerms: ['celebrity gossip'],
  }),
  policy: topic({
    agentId: 'knowledge-scout.policy.v1',
    label: '政策社会',
    role: '政策、监管、社会与公共制度',
    query: 'global public policy regulation society institutions public interest',
    queries: [
      'public policy regulation',
      'government public interest policy research international organization',
    ],
    preferredDomains: ['un.org', 'oecd.org', 'worldbank.org', 'europa.eu', 'gov.uk', 'reuters.com'],
    priorityTerms: ['policy', 'regulation', 'law', 'institution', 'public interest', 'proposal', 'agreement'],
    excludedTerms: ['celebrity'],
  }),
})

export const PUBLIC_TOPIC_KEYS = Object.freeze(Object.keys(KNOWLEDGE_TOPICS))
export function isKnowledgeTopic(value) {
  return Object.hasOwn(KNOWLEDGE_TOPICS, String(value || '').toLowerCase())
}
