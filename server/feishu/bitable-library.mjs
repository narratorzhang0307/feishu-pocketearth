import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { textBlock } from './client.mjs'
import { FEISHU_LIBRARY_CONTRACTS, FEISHU_LIBRARY_DOMAINS, assertIsolatedLibraryTables } from './library-contracts.mjs'

export const BITABLE_LIBRARY_DOMAINS = FEISHU_LIBRARY_DOMAINS

export const BITABLE_LIBRARY_STATUS = Object.freeze({
  pending: '待分析',
  analyzing: '分析中',
  review: '待确认',
  confirmed: '已确认',
  failed: '分析失败',
})

export const BITABLE_LIBRARY_FIELDS = Object.freeze({
  id: 'Pocket ID',
  title: '标题',
  author: '作者 / 主创',
  country: '国家 / 地区',
  type: '类型',
  year: '年份',
  rating: '评分',
  date: '日期',
  city: '城市',
  latitude: '纬度',
  longitude: '经度',
  description: '简介',
  instruction: 'AI 指令',
  note: '我的笔记',
  status: '审核状态',
  source: '来源',
  schema: 'Schema',
  payload: '数据 JSON',
  updatedAt: '更新时间',
})

const schemaName = Object.fromEntries(Object.entries(FEISHU_LIBRARY_CONTRACTS).map(([domain, contract]) => [domain, contract.schema]))

export const BITABLE_LIBRARY_DEFINITIONS = Object.freeze({
  books: { name: FEISHU_LIBRARY_CONTRACTS.books.tableName, fields: ['instruction', 'note', 'title', 'author', 'country', 'type', 'year', 'rating', 'date', 'description'] },
  movies: { name: FEISHU_LIBRARY_CONTRACTS.movies.tableName, fields: ['instruction', 'note', 'title', 'author', 'country', 'type', 'year', 'rating', 'date', 'description'] },
  music: { name: FEISHU_LIBRARY_CONTRACTS.music.tableName, fields: ['instruction', 'note', 'title', 'city', 'latitude', 'longitude', 'description'] },
  photos: { name: FEISHU_LIBRARY_CONTRACTS.photos.tableName, fields: ['instruction', 'note', 'title', 'city', 'date', 'latitude', 'longitude', 'description'] },
})

const BITABLE_LIBRARY_COMMON_FIELDS = ['id', 'status', 'source', 'schema', 'payload', 'updatedAt']
const BITABLE_LIBRARY_NUMERIC_FIELDS = new Set(['year', 'rating', 'latitude', 'longitude'])
const BITABLE_LIBRARY_DATE_FIELDS = new Set(['updatedAt'])

const runtimeConfigPath = (config) => config.dataDir ? path.join(config.dataDir, 'bitable-library-schema.json') : ''

/** Restore table ids created by the in-product knowledge-library bootstrap after a server restart. */
export async function hydrateBitableLibraryConfig(config) {
  const file = runtimeConfigPath(config)
  if (!file) return config
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'))
    if (!config.bitableAppToken && saved?.bitableAppToken) config.bitableAppToken = String(saved.bitableAppToken)
    const configuredTables = Object.fromEntries(Object.entries(config.bitableLibraryTables || {}).filter(([, tableId]) => Boolean(String(tableId || '').trim())))
    config.bitableLibraryTables = { ...(saved?.bitableLibraryTables || {}), ...configuredTables }
    assertIsolatedLibraryTables(config.bitableLibraryTables)
    if (!config.bitableGuideDocument && saved?.bitableGuideDocument?.documentId) {
      config.bitableGuideDocument = saved.bitableGuideDocument
    }
    if (!config.bitableGuideVersion && saved?.bitableGuideVersion) config.bitableGuideVersion = Number(saved.bitableGuideVersion)
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('[feishu-bitable] ignored invalid schema config:', error?.message || error)
  }
  return config
}

async function persistBitableLibraryConfig(config) {
  const file = runtimeConfigPath(config)
  if (!file) return
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify({
    bitableAppToken: config.bitableAppToken,
    bitableLibraryTables: config.bitableLibraryTables,
    bitableGuideDocument: config.bitableGuideDocument || null,
    bitableGuideVersion: Number(config.bitableGuideVersion || 0),
    updatedAt: new Date().toISOString(),
  }, null, 2), { mode: 0o600 })
  await rename(temporary, file)
}

const text = (value, max = 200_000) => {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim().slice(0, max)
  if (Array.isArray(value)) return value.map((item) => text(item, max)).filter(Boolean).join('').slice(0, max)
  if (typeof value === 'object') {
    if ('text' in value) return text(value.text, max)
    if ('name' in value) return text(value.name, max)
    if ('link' in value) return text(value.link, max)
    if ('text_run' in value) return text(value.text_run?.content, max)
  }
  return ''
}

const number = (value) => {
  const candidate = typeof value === 'number' ? value : Number(text(value))
  return Number.isFinite(candidate) ? candidate : null
}

const field = (fields, name) => fields?.[name]
const stringField = (fields, name, fallback = '') => text(field(fields, name)) || fallback
const numberField = (fields, name, fallback = null) => number(field(fields, name)) ?? fallback
const dateField = (fields, name, fallback = '') => {
  const raw = field(fields, name)
  const candidate = typeof raw === 'number' ? raw : /^\d{10,13}$/.test(text(raw)) ? Number(text(raw)) : null
  if (Number.isFinite(candidate)) {
    const millis = candidate < 10_000_000_000 ? candidate * 1000 : candidate
    const parsed = new Date(millis)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }
  return text(raw) || fallback
}

const bitableDate = (value) => {
  const raw = text(value)
  if (!raw) return null
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw)
  return Number.isFinite(parsed) ? parsed : null
}

function payloadFromFields(fields) {
  const raw = stringField(fields, BITABLE_LIBRARY_FIELDS.payload)
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('payload_not_object')
    return value
  } catch {
    throw new Error('bitable_payload_json_invalid')
  }
}

function collaborationFields(fields, payload) {
  const note = stringField(fields, BITABLE_LIBRARY_FIELDS.note, text(payload.note))
  const aiInstruction = stringField(fields, BITABLE_LIBRARY_FIELDS.instruction, text(payload.aiInstruction))
  return { ...(note ? { note } : {}), ...(aiInstruction ? { aiInstruction } : {}) }
}

function applyColumns(domain, fields, payload) {
  const id = stringField(fields, BITABLE_LIBRARY_FIELDS.id, text(payload.id, 256))
  if (domain === 'books') return {
    ...payload,
    id,
    title: stringField(fields, BITABLE_LIBRARY_FIELDS.title, text(payload.title)),
    author: stringField(fields, BITABLE_LIBRARY_FIELDS.author, text(payload.author)),
    country: stringField(fields, BITABLE_LIBRARY_FIELDS.country, text(payload.country)),
    type: stringField(fields, BITABLE_LIBRARY_FIELDS.type, text(payload.type)),
    year: numberField(fields, BITABLE_LIBRARY_FIELDS.year, payload.year ?? null),
    rating: numberField(fields, BITABLE_LIBRARY_FIELDS.rating, payload.rating ?? null),
    date: dateField(fields, BITABLE_LIBRARY_FIELDS.date, text(payload.date)),
    synopsis: stringField(fields, BITABLE_LIBRARY_FIELDS.description, text(payload.synopsis)),
    ...collaborationFields(fields, payload),
  }
  if (domain === 'movies') return {
    ...payload,
    id,
    title: stringField(fields, BITABLE_LIBRARY_FIELDS.title, text(payload.title)),
    director: stringField(fields, BITABLE_LIBRARY_FIELDS.author, text(payload.director)),
    country: stringField(fields, BITABLE_LIBRARY_FIELDS.country, text(payload.country)),
    type: stringField(fields, BITABLE_LIBRARY_FIELDS.type, text(payload.type)),
    year: numberField(fields, BITABLE_LIBRARY_FIELDS.year, payload.year ?? null),
    rating: numberField(fields, BITABLE_LIBRARY_FIELDS.rating, payload.rating ?? null),
    date: dateField(fields, BITABLE_LIBRARY_FIELDS.date, text(payload.date)),
    synopsis: stringField(fields, BITABLE_LIBRARY_FIELDS.description, text(payload.synopsis)),
    ...collaborationFields(fields, payload),
  }
  if (domain === 'music') return {
    ...payload,
    id,
    cityNameZh: stringField(fields, BITABLE_LIBRARY_FIELDS.title, text(payload.cityNameZh)),
    cityName: stringField(fields, BITABLE_LIBRARY_FIELDS.city, text(payload.cityName)),
    lat: numberField(fields, BITABLE_LIBRARY_FIELDS.latitude, payload.lat ?? null),
    lng: numberField(fields, BITABLE_LIBRARY_FIELDS.longitude, payload.lng ?? null),
    description: stringField(fields, BITABLE_LIBRARY_FIELDS.description, text(payload.description)),
    ...collaborationFields(fields, payload),
  }
  return {
    ...payload,
    id,
    city: stringField(fields, BITABLE_LIBRARY_FIELDS.city, text(payload.city)),
    date: stringField(fields, BITABLE_LIBRARY_FIELDS.date, text(payload.date)),
    lat: numberField(fields, BITABLE_LIBRARY_FIELDS.latitude, payload.lat ?? null),
    lng: numberField(fields, BITABLE_LIBRARY_FIELDS.longitude, payload.lng ?? null),
    title: stringField(fields, BITABLE_LIBRARY_FIELDS.title, text(payload.title || payload.city)),
    thumbnailUrl: text(payload.thumbnailUrl || payload.thumb),
    contentHash: text(payload.contentHash),
    summary: stringField(fields, BITABLE_LIBRARY_FIELDS.description, text(payload.summary || payload.qwen?.summary)),
    ...collaborationFields(fields, payload),
  }
}

const validCoordinate = (value, limit) => value == null || (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit)

const PRIVATE_PHOTO_KEYS = new Set(['image', 'dataBase64', 'sourceBase64', 'localFile', 'blob', 'full', 'assetKey', 'assetToken', 'localAssetId', 'thumbnailRef'])

function sanitizePhotoValue(value) {
  if (typeof value === 'string') return /^(?:data|blob|file):/i.test(value.trim()) ? '' : value
  if (Array.isArray(value)) return value.map(sanitizePhotoValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !PRIVATE_PHOTO_KEYS.has(key))
    .map(([key, child]) => [key, sanitizePhotoValue(child)]))
}

export function validateBitableLibraryRecord(domain, value) {
  if (!BITABLE_LIBRARY_DOMAINS.includes(domain)) throw new Error('bitable_library_domain_invalid')
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${domain}_record_invalid`)
  const record = domain === 'photos' ? sanitizePhotoValue(value) : value
  if (!text(record.id, 256)) throw new Error(`${domain}_record_id_missing`)
  if (domain === 'books' && !text(record.title)) throw new Error('books_record_title_missing')
  if (domain === 'movies' && !text(record.title)) throw new Error('movies_record_title_missing')
  if (domain === 'music') {
    if (!text(record.cityNameZh || record.cityName)) throw new Error('music_record_city_missing')
    if (!Array.isArray(record.tracks) || !Array.isArray(record.podcast)) throw new Error('music_record_tracks_invalid')
  }
  if (domain === 'photos') {
    if (!text(record.city || record.title)) throw new Error('photos_record_city_missing')
    if (!text(record.date)) throw new Error('photos_record_date_missing')
  }
  if (!validCoordinate(record.lat, 90) || !validCoordinate(record.lng, 180)) throw new Error(`${domain}_record_coordinates_invalid`)
  return record
}

export function recordFromBitableItem(domain, item) {
  const fields = item?.fields || {}
  const record = validateBitableLibraryRecord(domain, applyColumns(domain, fields, payloadFromFields(fields)))
  return { recordId: text(item?.record_id, 256), record }
}

export function draftFromBitableItem(domain, item) {
  if (!['books', 'movies'].includes(domain)) throw new Error('bitable_analysis_domain_unsupported')
  const fields = item?.fields || {}
  const recordId = text(item?.record_id, 256)
  if (!recordId) throw new Error('bitable_record_id_missing')
  const payload = payloadFromFields(fields)
  const prefix = domain === 'books' ? 'book' : 'movie'
  const record = applyColumns(domain, {
    ...fields,
    [BITABLE_LIBRARY_FIELDS.id]: stringField(fields, BITABLE_LIBRARY_FIELDS.id, `${prefix}:feishu:${recordId}`),
  }, payload)
  if (!text(record.title)) throw new Error(`${domain}_record_title_missing`)
  const labels = domain === 'books'
    ? [['标题', record.title], ['作者', record.author], ['国家 / 地区', record.country], ['类型', record.type], ['年份', record.year], ['简介', record.synopsis]]
    : [['标题', record.title], ['导演 / 主创', record.director], ['国家 / 地区', record.country], ['类型', record.type], ['年份', record.year], ['简介', record.synopsis]]
  const sourceText = labels.filter(([, value]) => text(value)).map(([label, value]) => `${label}：${text(value)}`).join('\n')
  return { recordId, record, sourceText }
}

function humanFields(domain, record) {
  if (domain === 'books') return {
    [BITABLE_LIBRARY_FIELDS.instruction]: record.aiInstruction,
    [BITABLE_LIBRARY_FIELDS.note]: record.note,
    [BITABLE_LIBRARY_FIELDS.title]: record.title,
    [BITABLE_LIBRARY_FIELDS.author]: record.author,
    [BITABLE_LIBRARY_FIELDS.country]: record.country,
    [BITABLE_LIBRARY_FIELDS.type]: record.type,
    [BITABLE_LIBRARY_FIELDS.year]: record.year,
    [BITABLE_LIBRARY_FIELDS.rating]: record.rating,
    [BITABLE_LIBRARY_FIELDS.date]: bitableDate(record.date),
    [BITABLE_LIBRARY_FIELDS.description]: record.synopsis,
  }
  if (domain === 'movies') return {
    [BITABLE_LIBRARY_FIELDS.instruction]: record.aiInstruction,
    [BITABLE_LIBRARY_FIELDS.note]: record.note,
    [BITABLE_LIBRARY_FIELDS.title]: record.title,
    [BITABLE_LIBRARY_FIELDS.author]: record.director,
    [BITABLE_LIBRARY_FIELDS.country]: record.country,
    [BITABLE_LIBRARY_FIELDS.type]: record.type,
    [BITABLE_LIBRARY_FIELDS.year]: record.year,
    [BITABLE_LIBRARY_FIELDS.rating]: record.rating,
    [BITABLE_LIBRARY_FIELDS.date]: bitableDate(record.date),
    [BITABLE_LIBRARY_FIELDS.description]: record.synopsis,
  }
  if (domain === 'music') return {
    [BITABLE_LIBRARY_FIELDS.instruction]: record.aiInstruction,
    [BITABLE_LIBRARY_FIELDS.note]: record.note,
    [BITABLE_LIBRARY_FIELDS.title]: record.cityNameZh || record.cityName,
    [BITABLE_LIBRARY_FIELDS.city]: record.cityName,
    [BITABLE_LIBRARY_FIELDS.latitude]: record.lat,
    [BITABLE_LIBRARY_FIELDS.longitude]: record.lng,
    [BITABLE_LIBRARY_FIELDS.description]: record.description,
  }
  return {
    [BITABLE_LIBRARY_FIELDS.instruction]: record.aiInstruction,
    [BITABLE_LIBRARY_FIELDS.note]: record.note,
    [BITABLE_LIBRARY_FIELDS.title]: record.title || record.city,
    [BITABLE_LIBRARY_FIELDS.city]: record.city,
    [BITABLE_LIBRARY_FIELDS.date]: record.date,
    [BITABLE_LIBRARY_FIELDS.latitude]: record.lat,
    [BITABLE_LIBRARY_FIELDS.longitude]: record.lng,
    [BITABLE_LIBRARY_FIELDS.description]: record.summary || record.qwen?.summary || '',
  }
}

export function fieldsFromLibraryRecord(domain, input, { source = 'Pocket Earth', status = '已确认' } = {}) {
  const record = validateBitableLibraryRecord(domain, structuredClone(input))
  const values = {
    [BITABLE_LIBRARY_FIELDS.id]: text(record.id, 256),
    ...humanFields(domain, record),
    [BITABLE_LIBRARY_FIELDS.status]: status,
    [BITABLE_LIBRARY_FIELDS.source]: source,
    [BITABLE_LIBRARY_FIELDS.schema]: schemaName[domain],
    [BITABLE_LIBRARY_FIELDS.payload]: JSON.stringify(record),
    [BITABLE_LIBRARY_FIELDS.updatedAt]: Date.now(),
  }
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null))
}

function versionOf(records) {
  return createHash('sha256').update(JSON.stringify(records)).digest('hex').slice(0, 16)
}

const normalizeIdentityText = (value) => text(value, 500).normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]+/gu, '')

export function libraryRecordIdentity(domain, record) {
  if (!BITABLE_LIBRARY_DOMAINS.includes(domain)) throw new Error('bitable_library_domain_invalid')
  if (domain === 'books' || domain === 'movies') return `${domain}:${normalizeIdentityText(record?.title)}`
  if (domain === 'music') {
    const track = Array.isArray(record?.tracks) ? record.tracks[0] : null
    const title = normalizeIdentityText(track?.title)
    const artist = normalizeIdentityText(track?.artist)
    return title ? `music:${title}:${artist}` : `music-id:${normalizeIdentityText(record?.id)}`
  }
  const stableId = normalizeIdentityText(record?.contentHash || record?.assetId)
  if (stableId) return `photos-id:${stableId}`
  return `photos:${normalizeIdentityText(record?.title)}:${normalizeIdentityText(record?.city)}:${normalizeIdentityText(record?.date)}`
}

export function createBitableLibrary({ client, config, accessToken = '', cacheTtlMs = 15_000, persistentStaleMs = 24 * 60 * 60 * 1000 }) {
  assertIsolatedLibraryTables(config.bitableLibraryTables || {})
  const cache = new Map()
  const processing = new Map()
  const refreshing = new Map()
  const mutations = new Map()
  const hydrated = new Set()
  const invalidated = new Set()
  const cacheDir = config.dataDir ? path.join(config.dataDir, 'bitable-library-cache') : ''
  const tableId = (domain) => config.bitableLibraryTables?.[domain] || ''
  const configuredDomains = () => BITABLE_LIBRARY_DOMAINS.filter((domain) => Boolean(config.bitableAppToken && tableId(domain)))

  const cachePath = (domain) => path.join(cacheDir, `${domain}.json`)

  async function loadPersisted(domain) {
    if (!cacheDir) return undefined
    if (hydrated.has(domain) || invalidated.has(domain)) return cache.get(domain)
    hydrated.add(domain)
    try {
      const payload = JSON.parse(await readFile(cachePath(domain), 'utf8'))
      if (!payload?.value || !Number.isFinite(payload.cachedAt)) return undefined
      const cached = {
        expiresAt: payload.cachedAt + cacheTtlMs,
        staleUntil: payload.cachedAt + persistentStaleMs,
        value: payload.value,
        index: new Map(Array.isArray(payload.index) ? payload.index : []),
      }
      cache.set(domain, cached)
      return cached
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[feishu-bitable] ignored invalid ${domain} cache:`, error?.message || error)
      return undefined
    }
  }

  async function persist(domain, cachedAt, value, index) {
    if (!cacheDir) return
    await mkdir(cacheDir, { recursive: true, mode: 0o700 })
    const target = cachePath(domain)
    const temporary = `${target}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify({ cachedAt, value, index: [...index.entries()] }), { mode: 0o600 })
    await rename(temporary, target)
  }

  async function refreshDomain(domain) {
    if (refreshing.has(domain)) return refreshing.get(domain)
    const task = (async () => {
      const table = tableId(domain)
      const items = await client.listBitableRecords(table, accessToken)
      const records = []
      const rejected = []
      const pending = []
      const index = new Map()
      const registerIndex = (record, recordId) => {
        if (!recordId || !text(record?.id, 256)) return
        index.set(`id:${record.id}`, recordId)
        const identity = libraryRecordIdentity(domain, record)
        if (!identity || identity.endsWith(':')) return
        const identityKey = `identity:${identity}`
        const existing = index.get(identityKey)
        if (existing) {
          const duplicateKey = `duplicates:${identityKey}`
          index.set(duplicateKey, [...(index.get(duplicateKey) || []), recordId])
        } else index.set(identityKey, recordId)
      }
      for (const item of items) {
        const itemRecordId = text(item?.record_id, 256)
        try {
          const fields = item?.fields || {}
          registerIndex(applyColumns(domain, fields, payloadFromFields(fields)), itemRecordId)
        } catch { /* confirmed-row validation below reports malformed payloads */ }
        const status = stringField(item?.fields || {}, BITABLE_LIBRARY_FIELDS.status)
        if (status !== BITABLE_LIBRARY_STATUS.confirmed) {
          pending.push({ recordId: itemRecordId, status: status || '未设置' })
          continue
        }
        try {
          const parsed = recordFromBitableItem(domain, item)
          records.push(parsed.record)
        } catch (error) {
          rejected.push({ recordId: text(item?.record_id, 256), error: String(error?.message || error) })
        }
      }
      const value = { domain, schema: schemaName[domain], version: versionOf(records), records, rejected, pending, syncedAt: new Date().toISOString() }
      const cachedAt = Date.now()
      cache.set(domain, { expiresAt: cachedAt + cacheTtlMs, staleUntil: cachedAt + persistentStaleMs, value, index })
      invalidated.delete(domain)
      await persist(domain, cachedAt, value, index).catch((error) => console.warn(`[feishu-bitable] failed to persist ${domain} cache:`, error?.message || error))
      return value
    })().finally(() => refreshing.delete(domain))
    refreshing.set(domain, task)
    return task
  }

  async function readDomain(domain, { force = false } = {}) {
    if (!BITABLE_LIBRARY_DOMAINS.includes(domain)) throw new Error('bitable_library_domain_invalid')
    const table = tableId(domain)
    if (!config.bitableAppToken || !table) throw new Error(`bitable_library_${domain}_not_configured`)
    const cached = cache.get(domain) || await loadPersisted(domain)
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value
    if (!force && cached && cached.staleUntil > Date.now()) {
      void refreshDomain(domain).catch((error) => console.warn(`[feishu-bitable] background refresh failed for ${domain}:`, error?.message || error))
      return cached.value
    }
    return refreshDomain(domain)
  }

  async function readAll(options) {
    const domains = configuredDomains()
    const entries = await Promise.all(domains.map(async (domain) => [domain, await readDomain(domain, options)]))
    return { domains: Object.fromEntries(entries), configuredDomains: domains, syncedAt: new Date().toISOString() }
  }

  function invalidate(domain) {
    if (domain) {
      invalidated.add(domain)
      cache.delete(domain)
    } else {
      configuredDomains().forEach((item) => invalidated.add(item))
      cache.clear()
    }
  }

  async function serializeMutation(domain, operation) {
    const previous = mutations.get(domain) || Promise.resolve()
    let release
    const current = new Promise((resolve) => { release = resolve })
    mutations.set(domain, current)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (mutations.get(domain) === current) mutations.delete(domain)
    }
  }

  async function upsertUnlocked(domain, records, options = {}) {
    const list = Array.isArray(records) ? records : [records]
    if (!list.length) return { created: 0, updated: 0 }
    const current = await readDomain(domain)
    const currentCache = cache.get(domain)
    const toCreate = []
    const toUpdate = []
    const alreadyExists = []
    const plannedIdentities = new Set()
    for (const record of list) {
      const fields = fieldsFromLibraryRecord(domain, record, options)
      const identityKey = `identity:${libraryRecordIdentity(domain, record)}`
      if (plannedIdentities.has(identityKey)) {
        alreadyExists.push({ pocketId: text(record.id, 256), title: text(record.title || record.tracks?.[0]?.title || record.city || record.cityNameZh, 300) })
        continue
      }
      plannedIdentities.add(identityKey)
      const recordId = currentCache?.index.get(`id:${record.id}`) || currentCache?.index.get(record.id) || currentCache?.index.get(identityKey)
      if (recordId && options.duplicatePolicy === 'warn') alreadyExists.push({ pocketId: text(record.id, 256), title: text(record.title || record.tracks?.[0]?.title || record.city || record.cityNameZh, 300) })
      else if (recordId) toUpdate.push({ record_id: recordId, fields })
      else toCreate.push(fields)
      const duplicateIds = currentCache?.index.get(`duplicates:${identityKey}`) || []
      if (duplicateIds.length) await client.deleteBitableRecords(duplicateIds, tableId(domain), accessToken)
    }
    if (toCreate.length) await client.createBitableRecords(toCreate, tableId(domain), accessToken)
    if (toUpdate.length) await client.updateBitableRecords(toUpdate, tableId(domain), accessToken)
    invalidate(domain)
    return { created: toCreate.length, updated: toUpdate.length, alreadyExists, previousVersion: current.version }
  }

  async function upsert(domain, records, options = {}) {
    return serializeMutation(domain, () => upsertUnlocked(domain, records, options))
  }

  async function removeUnlocked(domain, pocketIds) {
    const ids = [...new Set((Array.isArray(pocketIds) ? pocketIds : [pocketIds]).map((value) => text(value, 256)).filter(Boolean))]
    if (!ids.length) throw new Error('bitable_library_record_ids_missing')
    await readDomain(domain)
    const currentCache = cache.get(domain)
    const recordIds = ids.map((id) => currentCache?.index.get(`id:${id}`) || currentCache?.index.get(id)).filter(Boolean)
    if (!recordIds.length) return { deleted: 0 }
    const result = await client.deleteBitableRecords(recordIds, tableId(domain), accessToken)
    invalidate(domain)
    return { deleted: result?.deleted ?? recordIds.length }
  }

  async function remove(domain, pocketIds) {
    return serializeMutation(domain, () => removeUnlocked(domain, pocketIds))
  }

  async function ensureSchema({ userAccessToken = '' } = {}) {
    const token = userAccessToken || accessToken
    assertIsolatedLibraryTables(config.bitableLibraryTables || {})
    let createdApp = false
    if (!config.bitableAppToken) {
      const created = await client.createBitableApp('Pocket Earth · 我的知识库', token)
      config.bitableAppToken = created.appToken
      createdApp = true
    }
    if (!config.bitableLibraryTables) config.bitableLibraryTables = {}
    const existingTables = await client.listBitableTables(token)
    const createdTables = []
    const createdFields = []
    const tables = {}
    for (const domain of BITABLE_LIBRARY_DOMAINS) {
      const definition = BITABLE_LIBRARY_DEFINITIONS[domain]
      const configuredTableId = config.bitableLibraryTables[domain]
      let table = configuredTableId
        ? existingTables.find((item) => item.table_id === configuredTableId)
        : existingTables.find((item) => item.name === definition.name)
      if (!table) {
        const created = await client.createBitableTable(definition.name, token)
        table = { table_id: created.tableId, name: definition.name }
        createdTables.push(domain)
      }
      const tableIdValue = table.table_id
      config.bitableLibraryTables[domain] = tableIdValue
      tables[domain] = { tableId: tableIdValue, name: definition.name }
      const existingFields = await client.listBitableFields(tableIdValue, token)
      const names = new Set(existingFields.map((item) => item.field_name))
      for (const key of [...BITABLE_LIBRARY_COMMON_FIELDS, ...definition.fields]) {
        const fieldName = BITABLE_LIBRARY_FIELDS[key]
        if (names.has(fieldName)) continue
        const type = BITABLE_LIBRARY_NUMERIC_FIELDS.has(key) ? 2 : BITABLE_LIBRARY_DATE_FIELDS.has(key) ? 5 : 1
        await client.createBitableField(tableIdValue, fieldName, type, token)
        createdFields.push({ domain, fieldName })
      }
    }
    assertIsolatedLibraryTables(config.bitableLibraryTables, { requireAll: true })
    const guideBlocks = []
    if (!config.bitableGuideDocument?.documentId && userAccessToken) {
      config.bitableGuideDocument = await client.createDocument('Pocket Earth · 我的知识库整理入口', userAccessToken)
      guideBlocks.push(
        textBlock('在飞书里，整理你的知识星球', 3),
        textBlock('把书籍、电影、音乐或照片的原始笔记写在这篇飞书文档中，也可以邀请同伴共同补充。'),
        textBlock('整理流程：飞书身份与原文 → AI 提取地点和证据 → 你审核确认 → 上地球并写回飞书。'),
        textBlock('推荐写法：类别｜标题｜作者 / 主创｜你的笔记｜相关地点。信息不完整也可以，AI 会先整理为待确认结果。'),
        textBlock(`结构化知识库：https://feishu.cn/base/${encodeURIComponent(config.bitableAppToken)}`),
        textBlock('完成记录后，回到口袋地球的飞书入口，粘贴本文档链接并启动 AI 整理。'),
      )
    }
    if (config.bitableGuideDocument?.documentId && userAccessToken && Number(config.bitableGuideVersion || 0) < 2) {
      guideBlocks.push(
        textBlock('直接在多维表格里让 AI 记录', 4),
        textBlock('在书籍、电影、音乐或照片表新增一行，只填写“AI 指令”，例如：帮我记录一条《百年孤独》的笔记，我很喜欢。'),
        textBlock('把“审核状态”设为“待分析”。口袋地球 AI 会补齐结构化字段和候选地点，并写回为“待确认”；只有你改成“已确认”才会上地球。'),
        textBlock(`返回口袋地球：${config.webBaseUrl}/feishu?feishuPanel=1`),
      )
      config.bitableGuideVersion = 2
    }
    if (guideBlocks.length) {
      await client.appendDocumentBlocks(config.bitableGuideDocument.documentId, guideBlocks, userAccessToken)
    }
    await persistBitableLibraryConfig(config)
    invalidate()
    return {
      appToken: config.bitableAppToken,
      appUrl: `https://feishu.cn/base/${encodeURIComponent(config.bitableAppToken)}`,
      createdApp,
      tables,
      createdTables,
      createdFields,
      guideDocument: config.bitableGuideDocument || null,
    }
  }

  async function processPending(domain, analyze, { limit = 3, analyzeInstruction } = {}) {
    if (typeof analyze !== 'function') throw new Error('bitable_analysis_provider_missing')
    if (processing.has(domain)) return processing.get(domain)
    const task = (async () => {
      const table = tableId(domain)
      if (!config.bitableAppToken || !table) throw new Error(`bitable_library_${domain}_not_configured`)
      const items = await client.listBitableRecords(table, accessToken)
      const targets = items.filter((item) => stringField(item?.fields || {}, BITABLE_LIBRARY_FIELDS.status) === BITABLE_LIBRARY_STATUS.pending).slice(0, Math.max(1, limit))
      const knownIdentities = new Map()
      for (const item of items) {
        try {
          const fields = item?.fields || {}
          const payload = payloadFromFields(fields)
          const candidate = applyColumns(domain, fields, payload)
          const identity = libraryRecordIdentity(domain, candidate)
          if (identity && !identity.endsWith(':')) knownIdentities.set(identity, text(item?.record_id, 256))
        } catch { /* malformed rows are handled by the normal read/review path */ }
      }
      const results = []
      for (const item of targets) {
        const recordId = text(item?.record_id, 256)
        try {
          await client.updateBitableRecords([{ record_id: recordId, fields: { [BITABLE_LIBRARY_FIELDS.status]: BITABLE_LIBRARY_STATUS.analyzing } }], table, accessToken)
          const instruction = stringField(item?.fields || {}, BITABLE_LIBRARY_FIELDS.instruction)
          if (instruction) {
            if (typeof analyzeInstruction !== 'function') throw new Error('bitable_ai_instruction_provider_missing')
            const generated = await analyzeInstruction({ domain, recordId, instruction })
            const record = validateBitableLibraryRecord(domain, generated.record)
            const fields = fieldsFromLibraryRecord(domain, record, {
              source: `飞书多维表格 · ${text(generated.model, 100) || 'AI'} · 自然语言写入`,
              status: BITABLE_LIBRARY_STATUS.review,
            })
            const identity = libraryRecordIdentity(domain, record)
            const existingRecordId = knownIdentities.get(identity)
            const targetRecordId = existingRecordId && existingRecordId !== recordId ? existingRecordId : recordId
            await client.updateBitableRecords([{ record_id: targetRecordId, fields }], table, accessToken)
            if (targetRecordId !== recordId) await client.deleteBitableRecords([recordId], table, accessToken)
            else knownIdentities.set(identity, recordId)
            results.push({ recordId: targetRecordId, ok: true, locationCount: Array.isArray(record.locations) ? record.locations.length : Number(Number.isFinite(record.lat) && Number.isFinite(record.lng)), instruction: true, duplicate: targetRecordId !== recordId })
            continue
          }
          if (!['books', 'movies'].includes(domain)) throw new Error('bitable_ai_instruction_required')
          const draft = draftFromBitableItem(domain, item)
          const analysis = await analyze({ domain, record: draft.record, sourceText: draft.sourceText })
          const locations = (analysis?.locations || []).filter((location) => location && typeof location === 'object').map((location) => ({
            kind: domain === 'books' ? 'story' : 'filming',
            place: text(location.modernName || location.nameAsWritten, 300),
            lng: number(location.longitude),
            lat: number(location.latitude),
            confidence: number(location.confidence) ?? 0,
          })).filter((location) => location.place)
          if (!locations.length) throw new Error('qwen_returned_no_locations')
          const record = validateBitableLibraryRecord(domain, { ...draft.record, locations })
          const fields = fieldsFromLibraryRecord(domain, record, {
            source: `飞书多维表格 · ${text(analysis?.model, 100) || 'Qwen'}`,
            status: BITABLE_LIBRARY_STATUS.review,
          })
          const identity = libraryRecordIdentity(domain, record)
          const existingRecordId = knownIdentities.get(identity)
          const targetRecordId = existingRecordId && existingRecordId !== recordId ? existingRecordId : recordId
          await client.updateBitableRecords([{ record_id: targetRecordId, fields }], table, accessToken)
          if (targetRecordId !== recordId) await client.deleteBitableRecords([recordId], table, accessToken)
          else knownIdentities.set(identity, recordId)
          results.push({ recordId: targetRecordId, ok: true, locationCount: locations.length, duplicate: targetRecordId !== recordId })
        } catch (error) {
          await client.updateBitableRecords([{ record_id: recordId, fields: {
            [BITABLE_LIBRARY_FIELDS.status]: BITABLE_LIBRARY_STATUS.failed,
            [BITABLE_LIBRARY_FIELDS.source]: `AI 分析失败：${text(error?.message || error, 160)}`,
          } }], table, accessToken).catch(() => {})
          results.push({ recordId, ok: false, error: text(error?.message || error, 500) })
        }
      }
      invalidate(domain)
      return { domain, processed: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length, results }
    })().finally(() => processing.delete(domain))
    processing.set(domain, task)
    return task
  }

  return { configuredDomains, readDomain, readAll, invalidate, upsert, remove, processPending, ensureSchema }
}
