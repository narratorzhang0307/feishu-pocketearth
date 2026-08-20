import test from 'node:test'
import assert from 'node:assert/strict'
import { createFrostFeed } from './frost-feed-service.mjs'

function response() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers = {}) { this.status = status; this.headers = headers },
    end(body = '') { this.body += String(body) },
  }
}

const podcast = {
  podcastId: 'podcast_1',
  generatedAt: '2026-07-19T00:10:00.000Z',
  segments: [{
    title: 'Google AI 公共知识',
    summary: '双来源核验完成，仍待人工确认。',
    narration: '这条知识已经完成调查与质疑。',
    truthScore: 84,
    sources: [{ url: 'https://ai.google.dev/' }, { url: 'https://developers.googleblog.com/' }],
  }],
}

test('requires a configured bearer token', async () => {
  const feed = createFrostFeed({ readPodcast: async () => podcast })
  const res = response()
  await feed.handle({ method: 'GET', headers: {} }, res, new URL('http://local/api/frost-feed'))
  assert.equal(res.status, 503)
})

test('emits one replay-safe, bounded public knowledge event', async () => {
  const feed = createFrostFeed({ token: 'secret', readPodcast: async () => podcast })
  const first = response()
  await feed.handle({ method: 'GET', headers: { authorization: 'Bearer secret' } }, first, new URL('http://local/api/frost-feed'))
  assert.equal(first.status, 200)
  assert.match(first.headers['content-type'], /application\/x-ndjson/)
  const event = JSON.parse(first.body)
  assert.equal(event.kind, 'public_knowledge_brief')
  assert.equal(event.verdict, 'review_required')
  assert.equal(event.truthScore, 84)
  assert.deepEqual(event.sourceUrls, ['https://ai.google.dev/', 'https://developers.googleblog.com/'])
  assert.doesNotMatch(first.body, /API_KEY|PRIVATE_KEY|password/i)

  const second = response()
  const cursor = first.headers['x-frost-next-cursor']
  await feed.handle({ method: 'GET', headers: { authorization: 'Bearer secret' } }, second, new URL(`http://local/api/frost-feed?after=${encodeURIComponent(cursor)}`))
  assert.equal(second.status, 204)
})
