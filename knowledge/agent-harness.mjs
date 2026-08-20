import { claimForSignal, evidenceQueryForSignal, selectIndependentSources } from './evidence.mjs'
import { KNOWLEDGE_TOPICS } from './topics.mjs'

export const KNOWLEDGE_HARNESS_SCHEMA = 'pocket-earth-knowledge-harness/v1'

export class KnowledgeHarnessError extends Error {
  constructor(code, run) {
    super(code)
    this.name = 'KnowledgeHarnessError'
    this.code = code
    this.run = run
  }
}

function safeDetail(value) {
  if (value === undefined) return undefined
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.slice(0, 300)
  if (Array.isArray(value)) return value.slice(0, 12).map(safeDetail)
  return Object.fromEntries(Object.entries(value).slice(0, 16).map(([key, item]) => [key, safeDetail(item)]))
}

function createRun(topic, date, config, now) {
  const events = []
  const counters = { discoveryCalls: 0, evidenceCalls: 0, verificationCalls: 0 }
  const startedAt = now().toISOString()
  return {
    schema: KNOWLEDGE_HARNESS_SCHEMA,
    runId: `knowledge_${topic}_${date}_${startedAt.replace(/\D/g, '').slice(0, 17)}`,
    agentId: config.agentId,
    topic,
    date,
    state: 'running',
    startedAt,
    completedAt: null,
    counters,
    limits: {
      discoveryCalls: 1,
      evidenceCalls: config.policy.maxEvidenceCalls,
      verificationCalls: config.policy.maxVerifiedRecords,
    },
    events,
  }
}

function event(run, now, stage, status, detail = undefined) {
  run.events.push({
    sequence: run.events.length + 1,
    at: now().toISOString(),
    stage,
    status,
    ...(detail === undefined ? {} : { detail: safeDetail(detail) }),
  })
}

function consume(run, counter) {
  if (run.counters[counter] >= run.limits[counter]) throw new KnowledgeHarnessError(`knowledge_budget_exhausted:${counter}`, run)
  run.counters[counter] += 1
}

function finish(run, now, state) {
  run.state = state
  run.completedAt = now().toISOString()
  return run
}

function reviewGate(records) {
  const eligible = records.every((record) => record.verdict === 'supported'
    && record.sources?.filter((source) => source.publisherDomain).length >= 2)
  return {
    status: 'draft_review_required',
    sourceChecksPassed: eligible,
    eligibleForPublication: false,
    automaticPublication: false,
    requiredAction: 'A human reviewer must approve the sources and claims before they enter Public Earth.',
  }
}

// Shared pipeline used by all eight topic agents. Domain specialization lives in
// topics.mjs; orchestration, budgets, trace and the review gate live here once.
export async function runKnowledgeTopicAgent({
  topic,
  date,
  discover,
  gatherEvidence,
  verify,
  assemble,
  now = () => new Date(),
} = {}) {
  const config = KNOWLEDGE_TOPICS[topic]
  if (!config) throw new Error('unsupported_knowledge_topic')
  const run = createRun(topic, date, config, now)
  try {
    event(run, now, 'plan', 'complete', {
      queries: config.queries.length,
      requiredIndependentSources: config.policy.minimumIndependentSources,
      maximumRecords: config.policy.maxVerifiedRecords,
    })

    consume(run, 'discoveryCalls')
    event(run, now, 'active-perception', 'started')
    const discovered = await discover(topic, date, {
      limit: Math.max(config.policy.maxSignals * 2, config.policy.maxSignals),
      queryLimit: config.policy.maxDiscoveryQueries,
      now: now(),
    })
    const signals = discovered.slice(0, config.policy.maxSignals)
    event(run, now, 'attention-focus', 'complete', { discovered: discovered.length, retained: signals.length })
    if (!signals.length) throw new KnowledgeHarnessError('knowledge_no_current_signals', run)

    const records = []
    for (const signal of signals) {
      if (records.length >= config.policy.maxVerifiedRecords) break
      const claim = claimForSignal(signal.title)
      consume(run, 'evidenceCalls')
      event(run, now, 'evidence-scout', 'started', { signal: signal.title, claim })
      let rawSources
      try {
        rawSources = await gatherEvidence(evidenceQueryForSignal(signal.title), { limit: config.policy.maxEvidencePerSignal })
      } catch (error) {
        event(run, now, 'evidence-scout', 'failed', { signal: signal.title, error: error?.message || String(error) })
        continue
      }
      const sources = selectIndependentSources(rawSources, config, {
        query: claim,
        now: new Date(`${date}T23:59:59.999Z`),
        limit: config.policy.maxEvidencePerSignal,
      })
      if (sources.length < config.policy.minimumIndependentSources) {
        event(run, now, 'source-guard', 'rejected', {
          signal: signal.title,
          independentSources: sources.length,
          required: config.policy.minimumIndependentSources,
        })
        continue
      }
      event(run, now, 'source-guard', 'passed', {
        signal: signal.title,
        domains: sources.map((source) => source.publisherDomain),
      })

      consume(run, 'verificationCalls')
      event(run, now, 'investigator-and-skeptic', 'started', { signal: signal.title })
      try {
        const record = await verify(topic, claim, sources)
        records.push({
          ...record,
          scoutAgent: { id: config.agentId, topic, role: config.role },
          sourcePolicy: {
            freshnessHours: config.policy.freshnessHours,
            minimumIndependentSources: config.policy.minimumIndependentSources,
          },
        })
        event(run, now, 'deterministic-judge', 'complete', {
          signal: signal.title,
          verdict: record.verdict,
          truthScore: record.truthScore,
        })
      } catch (error) {
        event(run, now, 'investigator-and-skeptic', 'failed', { signal: signal.title, error: error?.message || String(error) })
      }
    }

    if (!records.length) throw new KnowledgeHarnessError('knowledge_no_cross_verified_records', run)
    const bundle = await assemble(topic, date, records, 'live')
    event(run, now, 'receipt-keeper', 'complete', {
      records: records.length,
      editionRoot: bundle.edition?.editionRoot || null,
      automaticPublication: false,
    })
    finish(run, now, 'complete')
    return { ...bundle, harness: run, reviewGate: reviewGate(records) }
  } catch (error) {
    const harnessError = error instanceof KnowledgeHarnessError
      ? error
      : new KnowledgeHarnessError(error?.message || String(error), run)
    event(run, now, 'stop', 'failed', { code: harnessError.code })
    finish(run, now, 'failed')
    harnessError.run = run
    throw harnessError
  }
}
