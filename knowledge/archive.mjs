import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const KNOWLEDGE_ARCHIVE_SCHEMA = 'pocket-earth-reviewed-knowledge-archive/v1'

function assertHash(value, name) {
  if (!/^0x[0-9a-f]{64}$/i.test(String(value || ''))) throw new Error(`knowledge_archive_invalid_${name}`)
  return value
}

export function compactReviewedEdition(proof) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(String(proof?.date || ''))) throw new Error('knowledge_archive_invalid_date')
  if (!Number.isInteger(Number(proof?.revision)) || Number(proof.revision) < 1) throw new Error('knowledge_archive_invalid_revision')
  if (!Array.isArray(proof?.records) || !proof.records.length) throw new Error('knowledge_archive_empty')
  return {
    schema: KNOWLEDGE_ARCHIVE_SCHEMA,
    state: 'human-reviewed',
    memoryTier: 'L3-long-term-reviewed-memory',
    reviewer: String(proof.reviewer || 'Pocket Earth human review gate'),
    reviewedAt: String(proof.reviewedAt || proof.committedAt || ''),
    date: proof.date,
    day: Number(proof.day),
    revision: Number(proof.revision),
    factCount: Number(proof.factCount),
    factsRoot: assertHash(proof.factsRoot, 'facts_root'),
    manifestHash: assertHash(proof.manifestHash, 'manifest_hash'),
    policyRoot: assertHash(proof.policyRoot, 'policy_root'),
    previousEditionRoot: assertHash(proof.previousEditionRoot, 'previous_edition_root'),
    editionRoot: assertHash(proof.editionRoot, 'edition_root'),
    records: proof.records.map((record) => ({
      id: String(record.id || ''),
      topic: String(record.topic || ''),
      claim: String(record.claim || ''),
      verdict: String(record.verdict || ''),
      truthScore: Number(record.truthScore),
      recordHash: assertHash(record.recordHash, 'record_hash'),
      proof: (record.proof || []).map((item) => assertHash(item, 'proof')),
      sources: (record.sources || []).map((source) => ({
        title: String(source.title || ''),
        url: String(source.url || ''),
        publisher: String(source.publisher || ''),
        publishedAt: source.publishedAt || null,
      })),
    })),
    retentionPolicy: {
      lifetime: 'permanent',
      includes: 'reviewed claims, final sources, Merkle proofs and the local content-addressed edition root',
      excludes: 'candidate news, model drafts, failed searches and private memory',
    },
  }
}

export async function archiveReviewedEdition({ outputDir, proof } = {}) {
  const compact = compactReviewedEdition(proof)
  const directory = resolve(outputDir, 'editions')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = resolve(directory, `${compact.date}-r${compact.revision}.json`)
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${JSON.stringify(compact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, file)
  return { file, archive: compact }
}

export async function readLatestReviewedEdition(outputDir, date) {
  const directory = resolve(outputDir, 'editions')
  if (!existsSync(directory)) return null
  const pattern = new RegExp(`^${String(date).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-r(\\d+)\\.json$`)
  const matches = (await readdir(directory)).flatMap((name) => {
    const match = name.match(pattern)
    return match ? [{ name, revision: Number(match[1]) }] : []
  }).sort((left, right) => right.revision - left.revision)
  if (!matches.length) return null
  try {
    const value = JSON.parse(readFileSync(resolve(directory, matches[0].name), 'utf8'))
    return value?.schema === KNOWLEDGE_ARCHIVE_SCHEMA ? value : null
  } catch {
    return null
  }
}
