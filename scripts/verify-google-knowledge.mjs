import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDailyKnowledgeService } from '../knowledge/daily-service.mjs'
import { buildGoogleKnowledgeRequest, getGoogleKnowledgeProviders } from '../knowledge/google-provider.mjs'
import { runKnowledgeCycle } from '../knowledge/daily-worker.mjs'

const providers = getGoogleKnowledgeProviders({ GMI_API_KEY: 'test', GMI_MODEL: 'google/gemini-3.5-flash' })
assert.equal(providers.length, 1)
assert.equal(providers[0].owner, 'Google')
assert.equal(providers[0].transport, 'gmi-inference-engine')
assert.throws(() => buildGoogleKnowledgeRequest({ ...providers[0], model: 'external/non-google-model' }, { messages: [] }), /google_model_required/)

const service = createDailyKnowledgeService({ env: {} })
const ai = await service.get('ai', '2026-07-19')
assert.equal(ai.topic, 'ai')
assert.equal(ai.records.length, 1)
assert.match(ai.records[0].claim, /Google|Gemini/)
assert.equal(ai.edition.anchor, null)
const proof = await service.findProof(ai.records[0].commitment.recordHash)
assert.equal(proof?.verified, true)
const pack = await service.buildPublicPack('2026-07-19')
assert.equal(pack.records.every((entry) => entry.verified), true)
assert.doesNotMatch(JSON.stringify(pack), /Injective|contractAddress|transactionHash/i)
const podcast = await service.getPodcast()
assert.match(podcast.date, /^20\d{2}-\d{2}-\d{2}$/)
assert.equal(podcast.segments.length >= 2, true)

const outputDir = await mkdtemp(join(tmpdir(), 'pocket-earth-google-knowledge-'))
try {
  const stubService = {
    refresh: async (topic, date) => ({
      mode: 'live', topic, generatedAt: `${date}T00:00:00.000Z`,
      records: topic === 'ai' ? ai.records : [],
      edition: topic === 'ai' ? ai.edition : null,
      reviewGate: { status: 'draft_review_required', automaticPublication: false },
    }),
  }
  const manifest = await runKnowledgeCycle({
    env: { KNOWLEDGE_RETENTION_DAYS: '7' }, outputDir, date: '2026-07-19', topics: 'ai,climate', service: stubService,
  })
  assert.equal(manifest.summary.ready, 1)
  assert.equal(manifest.summary.skipped, 1)
  assert.equal(manifest.publicationPolicy.automaticPublication, false)
  const stored = JSON.parse(await readFile(join(outputDir, '2026-07-19', 'ai.json'), 'utf8'))
  assert.equal(stored.verificationPlane.includes('Google Gemini'), true)
  assert.equal(JSON.stringify(stored).includes('Injective'), false)
} finally {
  await rm(outputDir, { recursive: true, force: true })
}

console.log('google knowledge verification passed')
