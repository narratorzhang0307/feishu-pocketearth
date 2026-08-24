import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { createFeishuClient } from '../server/feishu/client.mjs'
import { readFeishuConfig } from '../server/feishu/config.mjs'
import { BITABLE_LIBRARY_FIELDS } from '../server/feishu/bitable-library.mjs'
import { loadLocalEnv } from './feishu-env.mjs'

loadLocalEnv()

const apply = process.argv.includes('--apply')
const config = readFeishuConfig(process.env, process.cwd())
const client = createFeishuClient(config)
const limits = { books: 100, movies: 100, photos: 100 }
const domains = Object.keys(limits)
const evidencePrefix = 'evidence:'

function scalar(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (Array.isArray(value)) return value.map(scalar).join('')
  if (typeof value === 'object') return scalar(value.text ?? value.name ?? value.text_run?.content ?? '')
  return ''
}

function payloadOf(item) {
  try { return JSON.parse(scalar(item?.fields?.[BITABLE_LIBRARY_FIELDS.payload])) }
  catch { return {} }
}

function pointOf(item) {
  const payload = payloadOf(item)
  const location = Array.isArray(payload.locations)
    ? payload.locations.find((entry) => Number.isFinite(Number(entry?.lat)) && Number.isFinite(Number(entry?.lng)))
    : payload
  const lat = Number(location?.lat)
  const lng = Number(location?.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

function regionOf(item) {
  const point = pointOf(item)
  if (!point) return '未标注坐标'
  const { lat, lng } = point
  if (lat >= 20 && lat <= 55 && lng >= 100 && lng <= 150) return '东亚'
  if (lat >= -15 && lat <= 35 && lng >= 65 && lng <= 140) return '南亚与东南亚'
  if (lat >= 35 && lat <= 72 && lng >= -25 && lng <= 45) return '欧洲'
  if (lat >= 10 && lat <= 75 && lng >= -170 && lng <= -50) return '北美洲'
  if (lat >= -60 && lat < 15 && lng >= -85 && lng <= -30) return '南美洲'
  if (lat >= -40 && lat <= 40 && lng >= -20 && lng <= 65) return '非洲与中东'
  if (lat >= -50 && lat <= 5 && lng >= 110 && lng <= 180) return '大洋洲'
  return '其他地域'
}

function stableRank(item) {
  const id = scalar(item?.fields?.[BITABLE_LIBRARY_FIELDS.id]) || scalar(item?.record_id)
  return createHash('sha256').update(id).digest('hex')
}

function selectBalanced(items, limit) {
  const pinned = items.filter((item) => scalar(item?.fields?.[BITABLE_LIBRARY_FIELDS.id]).startsWith(evidencePrefix))
  const pinnedIds = new Set(pinned.map((item) => item.record_id))
  const buckets = new Map()
  for (const item of items.filter((candidate) => !pinnedIds.has(candidate.record_id))) {
    const region = regionOf(item)
    if (!buckets.has(region)) buckets.set(region, [])
    buckets.get(region).push(item)
  }
  for (const values of buckets.values()) values.sort((left, right) => stableRank(left).localeCompare(stableRank(right)))
  const selected = pinned.slice(0, limit)
  const regions = [...buckets.keys()].sort()
  while (selected.length < limit) {
    let added = false
    for (const region of regions) {
      const item = buckets.get(region).shift()
      if (!item) continue
      selected.push(item)
      added = true
      if (selected.length >= limit) break
    }
    if (!added) break
  }
  return selected
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const backupDir = path.join(config.dataDir, 'backups')
const backupPath = path.join(backupDir, `bitable-before-demo-prune-${timestamp}.json.gz`)
const backup = { createdAt: new Date().toISOString(), reason: 'Pocket Earth 飞书比赛 Demo 地域均衡裁剪', tables: {} }
const plan = []

for (const domain of domains) {
  const tableId = config.bitableLibraryTables[domain]
  const items = await client.listBitableRecords(tableId)
  const selected = selectBalanced(items, limits[domain])
  const selectedIds = new Set(selected.map((item) => item.record_id))
  const removeIds = items.map((item) => item.record_id).filter((id) => id && !selectedIds.has(id))
  const regionCounts = Object.fromEntries([...selected.reduce((map, item) => map.set(regionOf(item), (map.get(regionOf(item)) || 0) + 1), new Map()).entries()].sort())
  backup.tables[domain] = { tableId, items }
  plan.push({ domain, before: items.length, keep: selected.length, remove: removeIds.length, regionCounts, evidenceKept: selected.filter((item) => scalar(item?.fields?.[BITABLE_LIBRARY_FIELDS.id]).startsWith(evidencePrefix)).length })
  if (apply) await client.deleteBitableRecords(removeIds, tableId)
}

await mkdir(backupDir, { recursive: true, mode: 0o700 })
await writeFile(backupPath, gzipSync(Buffer.from(JSON.stringify(backup))), { mode: 0o600 })

if (apply) {
  for (const row of plan) {
    const remaining = await client.listBitableRecords(config.bitableLibraryTables[row.domain])
    if (remaining.length !== row.keep) throw new Error(`prune_count_mismatch:${row.domain}:${remaining.length}:${row.keep}`)
    row.after = remaining.length
  }
}

console.log(JSON.stringify({ ok: true, mode: apply ? 'apply' : 'dry-run', backupPath, plan }, null, 2))
