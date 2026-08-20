// Authenticated, cursor-based JSONL feed for the Frost Edge Raspberry Pi.
// It reads the already verified Daily Knowledge podcast and emits only the
// bounded public_knowledge_brief hardware envelope.
import { createKnowledgeBriefEvent, toJsonLine } from './hardware/frost-edge-google/frost-hardware-bridge.mjs'

const DEFAULT_CAPACITY = 64

function sendJson(res, value, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function bearer(req) {
  const value = String(req.headers?.authorization || '')
  return value.startsWith('Bearer ') ? value.slice(7) : ''
}

function cursorFor(sequence) {
  return Buffer.from(`frost:${sequence}`, 'utf8').toString('base64url')
}

function sequenceFromCursor(cursor) {
  if (!cursor) return 0
  try {
    const decoded = Buffer.from(String(cursor), 'base64url').toString('utf8')
    const match = decoded.match(/^frost:(\d+)$/)
    return match ? Number(match[1]) : null
  } catch {
    return null
  }
}

export function createFrostFeed({ token = '', capacity = DEFAULT_CAPACITY, readPodcast = async () => null } = {}) {
  const entries = []
  let nextSequence = 1
  let seedPromise = null
  let seededPodcastId = ''

  function publish(event) {
    const sequence = nextSequence++
    const entry = { sequence, cursor: cursorFor(sequence), event }
    entries.push(entry)
    if (entries.length > capacity) entries.splice(0, entries.length - capacity)
    return entry.cursor
  }

  function publishKnowledge(segment, createdAt) {
    return publish(createKnowledgeBriefEvent({
      title: segment?.title || '公共知识简报',
      body: segment?.summary || segment?.claim || '',
      speak: segment?.narration || segment?.summary || '',
      truthScore: segment?.truthScore,
      verdict: 'review_required',
      sourceUrls: (segment?.sources || []).map((source) => source?.url).filter(Boolean),
      createdAt,
    }))
  }

  async function seedFromDailyKnowledge() {
    if (seedPromise) return seedPromise
    seedPromise = Promise.resolve(readPodcast()).then((podcast) => {
      const podcastId = String(podcast?.podcastId || '')
      if (!podcastId || podcastId === seededPodcastId) return 0
      const segments = Array.isArray(podcast?.segments) ? podcast.segments.slice(0, 8) : []
      for (const segment of segments) publishKnowledge(segment, podcast.generatedAt)
      seededPodcastId = podcastId
      return segments.length
    }).catch(() => 0).finally(() => { seedPromise = null })
    return seedPromise
  }

  async function handle(req, res, url) {
    if (req.method !== 'GET') return sendJson(res, { error: 'method_not_allowed' }, 405)
    if (!token) return sendJson(res, { error: 'feed_token_not_configured' }, 503)
    if (bearer(req) !== token) return sendJson(res, { error: 'unauthorized' }, 401)

    const after = sequenceFromCursor(url.searchParams.get('after') || '')
    if (after === null) return sendJson(res, { error: 'invalid_cursor' }, 400)
    await seedFromDailyKnowledge()
    const entry = entries.find((item) => item.sequence > after)
    if (!entry) {
      const headers = { 'cache-control': 'no-store' }
      const latest = entries.at(-1)
      if (latest) headers['x-frost-next-cursor'] = latest.cursor
      res.writeHead(204, headers)
      res.end()
      return
    }
    res.writeHead(200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-frost-next-cursor': entry.cursor,
    })
    res.end(toJsonLine(entry.event))
  }

  return { handle, publish, publishKnowledge, seedFromDailyKnowledge, size: () => entries.length }
}
