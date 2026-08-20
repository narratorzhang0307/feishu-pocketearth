import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDailyKnowledgeService } from './daily-service.mjs'
import { buildPocketPodcast } from './podcast-agent.mjs'
import { KNOWLEDGE_TOPICS, PUBLIC_TOPIC_KEYS } from './topics.mjs'

const WORKER_SCHEMA = 'pocket-earth-knowledge-worker/v1'

function loadDotEnv(file = resolve(process.cwd(), '.env')) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const key = match[1]
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function safeDate(value, now = new Date()) {
  const fallback = now.toISOString().slice(0, 10)
  return /^20\d{2}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : fallback
}

function normalizeTopics(value) {
  const requested = Array.isArray(value) ? value : String(value || '').split(',')
  const topics = requested.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
  return [...new Set((topics.length ? topics : PUBLIC_TOPIC_KEYS).filter((topic) => KNOWLEDGE_TOPICS[topic]))]
}

function retentionDays(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : 7
}

function utcDateValue(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(String(value || ''))) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed.getTime() : null
}

export async function pruneKnowledgeHistory({ outputDir, runDate, keepDays = 7 } = {}) {
  const days = retentionDays(keepDays)
  const runValue = utcDateValue(runDate)
  if (runValue === null) throw new Error('knowledge_retention_invalid_run_date')
  const cutoff = runValue - ((days - 1) * 86_400_000)
  const removed = []
  const entries = await readdir(outputDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const value = utcDateValue(entry.name)
    if (value === null || value >= cutoff) continue
    // Only an exact, validated YYYY-MM-DD child of outputDir can reach rm.
    await rm(resolve(outputDir, entry.name), { recursive: true, force: true })
    removed.push(entry.name)
  }
  return {
    keepDays: days,
    windowStart: new Date(cutoff).toISOString().slice(0, 10),
    windowEnd: runDate,
    removed: removed.sort(),
  }
}

async function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, file)
}

export function nextDailyRun(now = new Date(), hourUtc = 0, minuteUtc = 10) {
  const hour = Math.min(23, Math.max(0, Number(hourUtc) || 0))
  const minute = Math.min(59, Math.max(0, Number(minuteUtc) || 0))
  const next = new Date(now)
  next.setUTCHours(hour, minute, 0, 0)
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  return next
}

export async function runKnowledgeCycle({
  env = process.env,
  outputDir = resolve(process.cwd(), env.KNOWLEDGE_DATA_DIR || 'var/knowledge'),
  date,
  topics = env.KNOWLEDGE_TOPICS,
  now = new Date(),
  service = createDailyKnowledgeService({ env }),
} = {}) {
  const runDate = safeDate(date, now)
  const requestedTopics = normalizeTopics(topics)
  if (!requestedTopics.length) throw new Error('knowledge_worker_no_valid_topics')
  const dateDir = resolve(outputDir, runDate)
  await mkdir(dateDir, { recursive: true, mode: 0o700 })
  const startedAt = now.toISOString()
  const results = []
  const podcastBundles = []
  let podcast = { state: 'pending', segmentCount: 0, podcastId: null }
  let retention = { keepDays: retentionDays(env.KNOWLEDGE_RETENTION_DAYS), state: 'pending', removed: [] }
  const publicationPolicy = {
    automaticPublication: false,
    nextStep: 'review the source snapshots and Gemini audit trace, then approve explicitly in Public Earth',
    reason: 'a scheduled public-data worker may collect and verify drafts but must never publish them autonomously',
  }
  const makeManifest = (state, completedAt = null) => ({
    schema: WORKER_SCHEMA,
    state,
    date: runDate,
    startedAt,
    completedAt,
    topics: results,
    summary: {
      requested: requestedTopics.length,
      ready: results.filter((item) => item.status === 'ready').length,
      skipped: results.filter((item) => item.status === 'skipped').length,
      failed: results.filter((item) => item.status === 'failed').length,
      pending: requestedTopics.length - results.length,
    },
    publicationPolicy,
    retention,
    podcast,
  })
  await atomicJson(resolve(outputDir, 'status.json'), makeManifest('running'))

  for (const topic of requestedTopics) {
    const topicStartedAt = new Date().toISOString()
    try {
      const bundle = await service.refresh(topic, runDate)
      const snapshot = {
        schema: WORKER_SCHEMA,
        date: runDate,
        topic,
        agentId: KNOWLEDGE_TOPICS[topic].agentId,
        topicLabel: KNOWLEDGE_TOPICS[topic].label,
        topicRole: KNOWLEDGE_TOPICS[topic].role,
        verificationPlane: 'Google Gemini Investigator + Google Gemini Skeptic + deterministic judge',
        generatedAt: bundle.generatedAt,
        mode: bundle.mode,
        memoryTier: 'L2-short-term-cache',
        records: bundle.records || [],
        edition: bundle.edition || null,
        ...(bundle.harness ? { harness: bundle.harness } : {}),
        ...(bundle.reviewGate ? { reviewGate: bundle.reviewGate } : {}),
        ...(bundle.error ? { error: bundle.error } : {}),
      }
      await atomicJson(resolve(dateDir, `${topic}.json`), snapshot)
      podcastBundles.push({ ...snapshot, topic })
      results.push({
        topic,
        agentId: KNOWLEDGE_TOPICS[topic].agentId,
        status: bundle.records?.length ? 'ready' : 'skipped',
        mode: bundle.mode,
        recordCount: bundle.records?.length || 0,
        editionRoot: bundle.edition?.editionRoot || null,
        error: bundle.error || null,
        startedAt: topicStartedAt,
        completedAt: new Date().toISOString(),
      })
    } catch (error) {
      results.push({
        topic,
        status: 'failed',
        mode: null,
        recordCount: 0,
        editionRoot: null,
        error: String(error instanceof Error ? error.message : error).slice(0, 300),
        startedAt: topicStartedAt,
        completedAt: new Date().toISOString(),
      })
    }
    await atomicJson(resolve(outputDir, 'status.json'), makeManifest('running'))
  }

  try {
    const artifact = buildPocketPodcast({ date: runDate, bundles: podcastBundles })
    await atomicJson(resolve(dateDir, 'podcast.json'), artifact)
    podcast = { state: artifact.state, segmentCount: artifact.segments.length, podcastId: artifact.podcastId }
  } catch (error) {
    podcast = { state: 'failed', segmentCount: 0, podcastId: null, error: String(error instanceof Error ? error.message : error).slice(0, 300) }
  }

  try {
    retention = {
      state: 'complete',
      ...(await pruneKnowledgeHistory({
        outputDir,
        runDate,
        keepDays: env.KNOWLEDGE_RETENTION_DAYS,
      })),
    }
  } catch (error) {
    retention = {
      ...retention,
      state: 'failed',
      error: String(error instanceof Error ? error.message : error).slice(0, 300),
    }
  }

  const completedAt = new Date().toISOString()
  const manifest = makeManifest('complete', completedAt)
  await atomicJson(resolve(dateDir, 'manifest.json'), manifest)
  await atomicJson(resolve(outputDir, 'status.json'), manifest)
  return manifest
}

function parseArgs(argv) {
  const options = { once: false }
  for (const arg of argv) {
    if (arg === '--once') options.once = true
    else if (arg.startsWith('--date=')) options.date = arg.slice('--date='.length)
    else if (arg.startsWith('--topics=')) options.topics = arg.slice('--topics='.length)
    else if (arg.startsWith('--output-dir=')) options.outputDir = resolve(arg.slice('--output-dir='.length))
    else throw new Error(`unknown_argument:${arg}`)
  }
  return options
}

async function main() {
  loadDotEnv()
  const options = parseArgs(process.argv.slice(2))
  const outputDir = options.outputDir || resolve(process.cwd(), process.env.KNOWLEDGE_DATA_DIR || 'var/knowledge')
  const run = async () => {
    const manifest = await runKnowledgeCycle({ ...options, outputDir })
    process.stdout.write(`${JSON.stringify({ ok: manifest.summary.failed === 0, date: manifest.date, summary: manifest.summary, outputDir })}\n`)
  }
  if (options.once) return run()

  let stopping = false
  const stop = () => { stopping = true }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  while (!stopping) {
    await run()
    const next = nextDailyRun(new Date(), process.env.KNOWLEDGE_RUN_HOUR_UTC, process.env.KNOWLEDGE_RUN_MINUTE_UTC)
    const waitMs = Math.max(1000, next.getTime() - Date.now())
    await new Promise((resolveWait) => {
      const timer = setTimeout(resolveWait, waitMs)
      const stopWait = () => { clearTimeout(timer); resolveWait() }
      process.once('SIGINT', stopWait)
      process.once('SIGTERM', stopWait)
    })
  }
}

const directRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (directRun || process.env.KNOWLEDGE_WORKER_DAEMON === '1') {
  main().catch((error) => {
    process.stderr.write(`knowledge_worker_failed:${String(error?.message || error)}\n`)
    process.exitCode = 1
  })
}
