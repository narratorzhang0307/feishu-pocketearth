import { createHash } from 'node:crypto'
import { KNOWLEDGE_TOPICS, PUBLIC_TOPIC_KEYS } from './topics.mjs'

export const POCKET_PODCAST_SCHEMA = 'pocket-earth-daily-podcast/v1'

function cleanText(value, limit = 800) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function sourceView(source) {
  return {
    title: cleanText(source?.title, 240),
    publisher: cleanText(source?.publisher, 120),
    publishedAt: source?.publishedAt || null,
    url: cleanText(source?.url, 800),
  }
}

function eligibleRecord(record) {
  return record
    && ['supported', 'mixed'].includes(record.verdict)
    && Number(record.truthScore) >= 60
    && Array.isArray(record.sources)
    && record.sources.length >= 2
    && cleanText(record.claim)
}

function recordRank(record) {
  const confidence = Number(record?.confidence) || 0
  const sourceCount = Array.isArray(record?.sources) ? record.sources.length : 0
  return (Number(record?.truthScore) || 0) * 100 + confidence + Math.min(sourceCount, 9)
}

function segmentFor(topic, record, index) {
  const config = KNOWLEDGE_TOPICS[topic]
  const claim = cleanText(record.claim, 700)
  const summary = cleanText(record.summary, 700) || claim
  const sources = record.sources.map(sourceView).filter((source) => source.url && source.publisher)
  const publishers = [...new Set(sources.map((source) => source.publisher))].slice(0, 3)
  const transition = index === 0 ? '今天的第一站' : '接着把视线移到'
  return {
    id: cleanText(record.id, 160) || `${topic}-${index + 1}`,
    topic,
    label: config.label,
    role: config.role,
    title: claim,
    claim,
    summary,
    verdict: record.verdict,
    truthScore: Number(record.truthScore) || 0,
    confidence: Number(record.confidence) || 0,
    recordHash: record?.commitment?.recordHash || null,
    sources,
    narration: `${transition}${config.label}。${claim}${summary !== claim ? ` ${summary}` : ''} 这条内容由${publishers.join('、')}等${sources.length}个来源共同支持。`,
  }
}

function event(sequence, stage, status, detail) {
  return { sequence, stage, status, detail }
}

/**
 * Deterministic podcast compiler over already verified knowledge bundles.
 * It never searches the web and never invents connective facts: the upstream
 * Knowledge Scout Harness owns discovery and verification; this agent only
 * retrieves, focuses, composes and audits.
 */
export function buildPocketPodcast({ date, bundles = [], generatedAt = new Date().toISOString() } = {}) {
  const run = []
  run.push(event(1, 'plan', 'complete', { requestedTopics: PUBLIC_TOPIC_KEYS.length, outputModes: ['podcast', 'text'] }))

  const available = bundles.filter((bundle) => bundle && PUBLIC_TOPIC_KEYS.includes(bundle.topic))
  const memoryTiers = [...new Set(available.map((bundle) => bundle.memoryTier).filter(Boolean))]
  run.push(event(2, 'memory-retrieval', 'complete', { bundles: available.length, memoryTiers }))

  const selected = []
  for (const topic of PUBLIC_TOPIC_KEYS) {
    const bundle = available.find((item) => item.topic === topic)
    const records = (bundle?.records || []).filter(eligibleRecord).sort((left, right) => recordRank(right) - recordRank(left))
    if (records[0]) selected.push({ topic, record: records[0], edition: bundle.edition || null })
  }
  run.push(event(3, 'attention-focus', 'complete', { retained: selected.length, rule: 'one highest-scoring cross-verified record per topic' }))

  const segments = selected.map(({ topic, record }, index) => segmentFor(topic, record, index))
  run.push(event(4, 'compose', 'complete', { segments: segments.length, claimsAddedByComposer: 0 }))

  const invalid = segments.filter((segment) => segment.sources.length < 2 || !segment.claim || segment.truthScore < 60)
  if (invalid.length) throw new Error('pocket_podcast_critic_rejected_segment')
  run.push(event(5, 'critic', 'complete', { rejected: 0, checks: ['source-count', 'truth-score', 'claim-preservation'] }))

  const editionRoots = [...new Set(selected.map((item) => item.edition?.editionRoot).filter(Boolean))]
  const contentRoots = [...editionRoots]
  const outro = segments.length
    ? `以上是 ${date} 的口袋播客。完整来源、核验记录与可用的 Merkle 证明保留在文字模式中。`
    : `今天还没有达到播报门槛的可验证知识，口袋播客不会用候选新闻填充事实。`
  const intro = segments.length
    ? `早上好，这里是 ${date} 的口袋播客。今天从 ${segments.length} 个领域各选出一条经过交叉核验的公共知识。`
    : `这里是 ${date} 的口袋播客。`
  const script = [intro, ...segments.map((segment) => segment.narration), outro].join('\n\n')
  const podcastId = `podcast_${createHash('sha256').update(JSON.stringify({ date, segments: segments.map((segment) => segment.recordHash || segment.id) })).digest('hex').slice(0, 20)}`
  run.push(event(6, 'receipt', 'complete', { podcastId, editionRoots, contentRoots, automaticPublication: false }))

  return {
    schema: POCKET_PODCAST_SCHEMA,
    podcastId,
    date,
    generatedAt,
    state: segments.length ? 'ready' : 'waiting-for-verified-knowledge',
    modes: ['podcast', 'text'],
    title: `${date} · 口袋播客`,
    intro,
    outro,
    script,
    segments,
    memory: {
      hotWindowDays: 7,
      readTiers: memoryTiers,
      editionRoots,
      contentRoots,
      policy: '完整新闻草稿保留七天；通过人工复核的记录与本地内容根才进入长期精选层。',
    },
    run: {
      schema: 'pocket-earth-podcast-agent-run/v1',
      agentId: 'pocket-podcast.orchestrator.v1',
      state: 'complete',
      events: run,
    },
  }
}
