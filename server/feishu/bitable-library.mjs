import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const BITABLE_LIBRARY_DOMAINS = ['books', 'movies', 'music', 'photos']

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
  status: '审核状态',
  source: '来源',
  schema: 'Schema',
  payload: '数据 JSON',
  updatedAt: '更新时间',
})

const schemaName = {
  books: 'pocket.books/v1',
  movies: 'pocket.movies/v1',
  music: 'pocket.music/v1',
  photos: 'pocket.photos/v1',
}

export const BITABLE_LIBRARY_DEFINITIONS = Object.freeze({
  books: { name: 'Pocket Earth · 书籍', fields: ['title', 'author', 'country', 'type', 'year', 'rating', 'date', 'description'] },
  movies: { name: 'Pocket Earth · 电影', fields: ['title', 'author', 'country', 'type', 'year', 'rating', 'date', 'description'] },
  music: { name: 'Pocket Earth · 音乐', fields: ['title', 'city', 'latitude', 'longitude', 'description'] },
  photos: { name: 'Pocket Earth · 照片', fields: ['title', 'city', 'date', 'latitude', 'longitude', 'description'] },
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
    config.bitableLibraryTables = { ...(saved?.bitableLibraryTables || {}), ...(config.bitableLibraryTables || {}) }
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
  }
  if (domain === 'music') return {
    ...payload,
    id,
    cityNameZh: stringField(fields, BITABLE_LIBRARY_FIELDS.title, text(payload.cityNameZh)),
    cityName: stringField(fields, BITABLE_LIBRARY_FIELDS.city, text(payload.cityName)),
    lat: numberField(fields, BITABLE_LIBRARY_FIELDS.latitude, payload.lat ?? null),
    lng: numberField(fields, BITABLE_LIBRARY_FIELDS.longitude, payload.lng ?? null),
    description: stringField(fields, BITABLE_LIBRARY_FIELDS.description, text(payload.description)),
  }
  return {
    ...payload,
    id,
    city: stringField(fields, BITABLE_LIBRARY_FIELDS.city, text(payload.city)),
    date: stringField(fields, BITABLE_LIBRARY_FIELDS.date, text(payload.date)),
    lat: numberField(fields, BITABLE_LIBRARY_FIELDS.latitude, payload.lat ?? null),
    lng: numberField(fields, BITABLE_LIBRARY_FIELDS.longitude, payload.lng ?? null),
    title: stringField(fields, BITABLE_LIBRARY_FIELDS.title, text(payload.title || payload.city)),
  }
}

const validCoordinate = (value, limit) => value == null || (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit)

const PRIVATE_PHOTO_KEYS = new Set(['image', 'dataBase64', 'sourceBase64', 'localFile', 'blob'])

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
    [BITABLE_LIBRARY_FIELDS.title]: record.cityNameZh || record.cityName,
    [BITABLE_LIBRARY_FIELDS.city]: record.cityName,
    [BITABLE_LIBRARY_FIELDS.latitude]: record.lat,
    [BITABLE_LIBRARY_FIELDS.longitude]: record.lng,
    [BITABLE_LIBRARY_FIELDS.description]: record.description,
  }
  return {
    [BITABLE_LIBRARY_FIELDS.title]: record.title || record.city,
    [BITABLE_LIBRARY_FIELDS.city]: record.city,
    [BITABLE_LIBRARY_FIELDS.date]: record.date,
    [BITABLE_LIBRARY_FIELDS.latitude]: record.lat,
    [BITABLE_LIBRARY_FIELDS.longitude]: record.lng,
    [BITABLE_LIBRARY_FIELDS.description]: record.qwen?.summary || '',
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

export function createBitableLibrary({ client, config, cacheTtlMs = 15_000, persistentStaleMs = 24 * 60 * 60 * 1000 }) {
  const cache = new Map()
  const processing = new Map()
  const refreshing = new Map()
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
      const items = await client.listBitableRecords(table)
      const records = []
      const rejected = []
      const pending = []
      const index = new Map()
      for (const item of items) {
        const status = stringField(item?.fields || {}, BITABLE_LIBRARY_FIELDS.status)
        if (status !== BITABLE_LIBRARY_STATUS.confirmed) {
          pending.push({ recordId: text(item?.record_id, 256), status: status || '未设置' })
          continue
        }
        try {
          const parsed = recordFromBitableItem(domain, item)
          records.push(parsed.record)
          if (parsed.recordId) index.set(parsed.record.id, parsed.recordId)
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

  async function upsert(domain, records, options = {}) {
    const list = Array.isArray(records) ? records : [records]
    if (!list.length) return { created: 0, updated: 0 }
    const current = await readDomain(domain)
    const currentCache = cache.get(domain)
    const toCreate = []
    const toUpdate = []
    for (const record of list) {
      const fields = fieldsFromLibraryRecord(domain, record, options)
      const recordId = currentCache?.index.get(record.id)
      if (recordId) toUpdate.push({ record_id: recordId, fields })
      else toCreate.push(fields)
    }
    if (toCreate.length) await client.createBitableRecords(toCreate, tableId(domain))
    if (toUpdate.length) await client.updateBitableRecords(toUpdate, tableId(domain))
    invalidate(domain)
    return { created: toCreate.length, updated: toUpdate.length, previousVersion: current.version }
  }

  async function ensureSchema() {
    let createdApp = false
    if (!config.bitableAppToken) {
      const created = await client.createBitableApp('Pocket Earth · 我的知识库')
      config.bitableAppToken = created.appToken
      createdApp = true
    }
    if (!config.bitableLibraryTables) config.bitableLibraryTables = {}
    const existingTables = await client.listBitableTables()
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
        const created = await client.createBitableTable(definition.name)
        table = { table_id: created.tableId, name: definition.name }
        createdTables.push(domain)
      }
      const tableIdValue = table.table_id
      config.bitableLibraryTables[domain] = tableIdValue
      tables[domain] = { tableId: tableIdValue, name: definition.name }
      const existingFields = await client.listBitableFields(tableIdValue)
      const names = new Set(existingFields.map((item) => item.field_name))
      for (const key of [...BITABLE_LIBRARY_COMMON_FIELDS, ...definition.fields]) {
        const fieldName = BITABLE_LIBRARY_FIELDS[key]
        if (names.has(fieldName)) continue
        const type = BITABLE_LIBRARY_NUMERIC_FIELDS.has(key) ? 2 : BITABLE_LIBRARY_DATE_FIELDS.has(key) ? 5 : 1
        await client.createBitableField(tableIdValue, fieldName, type)
        createdFields.push({ domain, fieldName })
      }
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
    }
  }

  async function processPending(domain, analyze, { limit = 3 } = {}) {
    if (!['books', 'movies'].includes(domain)) return { domain, processed: 0, failed: 0, results: [] }
    if (typeof analyze !== 'function') throw new Error('bitable_analysis_provider_missing')
    if (processing.has(domain)) return processing.get(domain)
    const task = (async () => {
      const table = tableId(domain)
      if (!config.bitableAppToken || !table) throw new Error(`bitable_library_${domain}_not_configured`)
      const items = await client.listBitableRecords(table)
      const targets = items.filter((item) => stringField(item?.fields || {}, BITABLE_LIBRARY_FIELDS.status) === BITABLE_LIBRARY_STATUS.pending).slice(0, Math.max(1, limit))
      const results = []
      for (const item of targets) {
        const recordId = text(item?.record_id, 256)
        try {
          await client.updateBitableRecords([{ record_id: recordId, fields: { [BITABLE_LIBRARY_FIELDS.status]: BITABLE_LIBRARY_STATUS.analyzing } }], table)
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
          await client.updateBitableRecords([{ record_id: recordId, fields }], table)
          results.push({ recordId, ok: true, locationCount: locations.length })
        } catch (error) {
          await client.updateBitableRecords([{ record_id: recordId, fields: {
            [BITABLE_LIBRARY_FIELDS.status]: BITABLE_LIBRARY_STATUS.failed,
            [BITABLE_LIBRARY_FIELDS.source]: `Qwen 分析失败：${text(error?.message || error, 160)}`,
          } }], table).catch(() => {})
          results.push({ recordId, ok: false, error: text(error?.message || error, 500) })
        }
      }
      invalidate(domain)
      return { domain, processed: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length, results }
    })().finally(() => processing.delete(domain))
    processing.set(domain, task)
    return task
  }

  return { configuredDomains, readDomain, readAll, invalidate, upsert, processPending, ensureSchema }
}
