import test from 'node:test'
import assert from 'node:assert/strict'
import { createKnowledgeBriefEvent, toJsonLine } from './frost-hardware-bridge.mjs'

test('public knowledge brief exposes sources and deterministic score only', () => {
  const event = createKnowledgeBriefEvent({
    title: '候选知识', body: '双角色核验完成', truthScore: 82,
    sourceUrls: ['https://example.com/a', 'javascript:alert(1)'],
  })
  assert.equal(event.kind, 'public_knowledge_brief')
  assert.equal(event.truthScore, 82)
  assert.deepEqual(event.sourceUrls, ['https://example.com/a'])
  assert.match(toJsonLine(event), /review_required/)
})

test('credential-shaped payloads are rejected', () => {
  assert.throws(() => createKnowledgeBriefEvent({ body: 'API_KEY=do-not-send' }), /credentials/)
})
