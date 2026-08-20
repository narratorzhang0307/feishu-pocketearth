// Pocket Earth content-addressed knowledge kernel.
// Merkle roots provide portable integrity proofs only; they do not imply a
// blockchain transaction, token ownership or automatic publication.

export const KNOWLEDGE_RECORD_SCHEMA = 'pocket-earth-public-knowledge-record/v1'
export const DAILY_EDITION_SCHEMA = 'pocket-earth-public-knowledge-edition/v1'
export const ZERO_ROOT = `0x${'0'.repeat(64)}`

function normalizeString(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export function normalizeClaimStatement(value) {
  return normalizeString(value)
    .toLocaleLowerCase('und')
    .replace(/[\p{P}\p{Z}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, '$1')
    .trim()
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]))
  }
  return typeof value === 'string' ? normalizeString(value) : value
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value))
}

function toHex(buffer) {
  return `0x${Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function sha256(value) {
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))))
}

export async function hashValue(value) {
  return sha256(stableStringify(value))
}

async function hashPair(left, right) {
  const [first, second] = left.localeCompare(right) <= 0 ? [left, right] : [right, left]
  return sha256(`${first.slice(2)}${second.slice(2)}`)
}

async function merkleLayers(leaves) {
  if (!leaves.length) return [[await sha256('fact-atlas:empty')]]
  const layers = [[...leaves]]
  while (layers.at(-1).length > 1) {
    const current = layers.at(-1)
    const next = []
    for (let index = 0; index < current.length; index += 2) {
      next.push(await hashPair(current[index], current[index + 1] ?? current[index]))
    }
    layers.push(next)
  }
  return layers
}

export async function merkleRoot(leaves) {
  return (await merkleLayers(leaves)).at(-1)[0]
}

export async function buildMerkleProof(leaves, leafIndex) {
  if (leafIndex < 0 || leafIndex >= leaves.length) throw new Error('Merkle leaf index is out of range.')
  const layers = await merkleLayers(leaves)
  const proof = []
  let index = leafIndex
  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex++) {
    const layer = layers[layerIndex]
    proof.push(layer[index % 2 === 0 ? index + 1 : index - 1] ?? layer[index])
    index = Math.floor(index / 2)
  }
  return proof
}

export async function verifyMerkleProof(leaf, proof, root) {
  let current = leaf
  for (const sibling of proof) current = await hashPair(current, sibling)
  return current === root
}

export async function buildFactCommitment(result, canonicalClaim, locationScope = null, timeScope = null) {
  const claimIdentity = {
    schema: 'fact-atlas-claim/v1',
    statement: normalizeClaimStatement(canonicalClaim),
    locationScope: locationScope ? normalizeClaimStatement(locationScope) : null,
    timeScope: timeScope ? normalizeString(timeScope) : null,
  }
  const sourceHashes = await Promise.all((result.sources || []).map((source) => hashValue({
    id: source.id,
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    publishedAt: source.publishedAt,
    snippet: source.snippet,
    stance: source.stance,
    reliability: source.reliability,
  })))
  const receiptHashes = await Promise.all((result.trace || []).map((step) => hashValue({
    stage: step.stage,
    provider: step.provider,
    model: step.model,
    requestId: step.requestId,
    startedAt: step.startedAt,
    durationMs: step.durationMs,
    status: step.status,
  })))
  const claimKey = await hashValue(claimIdentity)
  const rawSnapshotHash = await hashValue(result)
  const evidenceRoot = await merkleRoot(sourceHashes.sort())
  const receiptRoot = await merkleRoot(receiptHashes.sort())
  const scorePolicyHash = await hashValue({ formula: result.scoring?.formula || '', schema: 'fact-atlas-score-policy/v1' })
  const recordHash = await hashValue({
    schema: KNOWLEDGE_RECORD_SCHEMA,
    claimKey,
    rawSnapshotHash,
    evidenceRoot,
    receiptRoot,
    scorePolicyHash,
    verdict: result.verdict,
    truthScore: result.truthScore,
    confidence: result.confidence,
    createdAt: result.createdAt,
  })
  return { schema: KNOWLEDGE_RECORD_SCHEMA, claimKey, rawSnapshotHash, evidenceRoot, receiptRoot, scorePolicyHash, recordHash }
}

function editionDay(date) {
  return Number(String(date).replaceAll('-', ''))
}

export async function buildDailyEditions(facts, initialPreviousRoot = ZERO_ROOT) {
  const grouped = new Map()
  for (const fact of facts) {
    const date = fact.savedAt.slice(0, 10)
    grouped.set(date, [...(grouped.get(date) || []), fact])
  }
  const editions = []
  let previousEditionRoot = initialPreviousRoot
  for (const date of [...grouped.keys()].sort()) {
    const editionFacts = grouped.get(date).sort((left, right) => left.commitment.recordHash.localeCompare(right.commitment.recordHash))
    const leaves = editionFacts.map((fact) => fact.commitment.recordHash)
    const factsRoot = await merkleRoot(leaves)
    const manifestHash = await hashValue(editionFacts.map((fact) => ({
      id: fact.id,
      claim: fact.claim,
      canonicalClaim: fact.canonicalClaim,
      verdict: fact.verdict,
      truthScore: fact.truthScore,
      claimKey: fact.commitment.claimKey,
      recordHash: fact.commitment.recordHash,
    })))
    const policyRoot = await merkleRoot([...new Set(editionFacts.map((fact) => fact.commitment.scorePolicyHash))].sort())
    const payload = { schema: DAILY_EDITION_SCHEMA, date, day: editionDay(date), factCount: editionFacts.length, factsRoot, manifestHash, policyRoot, previousEditionRoot }
    const editionRoot = await hashValue(payload)
    const proofs = Object.fromEntries(await Promise.all(editionFacts.map(async (fact, index) => [
      fact.commitment.recordHash,
      await buildMerkleProof(leaves, index),
    ])))
    editions.push({ ...payload, editionRoot, facts: editionFacts, proofs })
    previousEditionRoot = editionRoot
  }
  return editions
}

export function shortHash(value, head = 8, tail = 6) {
  if (!value) return '—'
  return `${value.slice(0, head + 2)}…${value.slice(-tail)}`
}
