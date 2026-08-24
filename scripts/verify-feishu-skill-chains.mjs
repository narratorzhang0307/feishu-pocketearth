import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  BITABLE_LIBRARY_FIELDS,
  BITABLE_LIBRARY_STATUS,
  createBitableLibrary,
  fieldsFromLibraryRecord,
  hydrateBitableLibraryConfig,
} from '../server/feishu/bitable-library.mjs'
import { createFeishuClient } from '../server/feishu/client.mjs'
import { readFeishuConfig } from '../server/feishu/config.mjs'
import { createQwenLibraryInstructionParser } from '../server/feishu/qwen-library-instruction.mjs'
import { createQwenProvider } from '../server/qwen-provider.mjs'

const rootDir = process.cwd()
const config = readFeishuConfig(process.env, rootDir)
await hydrateBitableLibraryConfig(config)

if (!config.appId || !config.appSecret || !config.bitableAppToken) {
  throw new Error('feishu_skill_chain_config_incomplete')
}

const client = createFeishuClient(config)
const library = createBitableLibrary({ client, config, cacheTtlMs: 0 })
const parser = createQwenLibraryInstructionParser(createQwenProvider(process.env))
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12)
const today = new Date().toISOString().slice(0, 10)

const fixtures = {
  books: {
    instruction: '【比赛链路验证】用 AI 记录《夜航》，我喜欢它关于责任、飞行与孤独的书写，并给出作品相关地点。',
    record: { id: `book:chain-proof:${stamp}`, title: 'AI 待整理', author: '', country: '', type: '小说', year: null, rating: null, date: today, note: '', synopsis: '', locations: [] },
  },
  movies: {
    instruction: '【比赛链路验证】用 AI 记录电影《花样年华》，我喜欢它的香港城市气质，并给出故事或取景相关地点。',
    record: { id: `movie:chain-proof:${stamp}`, title: 'AI 待整理', original: '', director: '', country: '', type: '电影', year: null, rating: null, date: today, note: '', synopsis: '', locations: [] },
  },
  music: {
    instruction: '【比赛链路验证】用 AI 记录赵雷的歌曲《成都》，关联成都，作为一条可定位的音乐记忆。',
    record: { id: `music-city:chain-proof:${stamp}`, slug: `chain-proof-${stamp}`, cityName: '待 AI 识别', cityNameZh: '待 AI 识别', ianaTz: null, tzOffset: 0, station: { freq: 0, name: 'Pocket Earth' }, cover: '', lat: null, lng: null, description: '', tracks: [], podcast: [] },
  },
  photos: {
    instruction: '【比赛链路验证】整理一张杭州西湖雨夜照片，拍摄地为杭州，作为杂志、日历与地球的候选照片。',
    record: { id: `photo:chain-proof:${stamp}`, title: 'AI 待整理', city: '待 AI 识别', date: today, lat: null, lng: null, qwen: { summary: '' } },
  },
}

const results = []
for (const [domain, fixture] of Object.entries(fixtures)) {
  const tableId = config.bitableLibraryTables?.[domain]
  if (!tableId) throw new Error(`feishu_skill_chain_${domain}_table_missing`)

  const pending = { ...fixture.record, aiInstruction: fixture.instruction, note: fixture.instruction }
  const created = await client.createBitableRecords([
    fieldsFromLibraryRecord(domain, pending, {
      status: BITABLE_LIBRARY_STATUS.pending,
      source: 'Pocket Earth · 比赛端到端验证',
    }),
  ], tableId)
  const recordId = created.records?.[0]?.record_id
  if (!recordId) throw new Error(`feishu_skill_chain_${domain}_create_failed`)

  await client.updateBitableRecords([{ record_id: recordId, fields: {
    [BITABLE_LIBRARY_FIELDS.status]: BITABLE_LIBRARY_STATUS.analyzing,
  } }], tableId)
  const generated = await parser.parse({ domain, recordId, instruction: fixture.instruction })
  await client.updateBitableRecords([{ record_id: recordId, fields: fieldsFromLibraryRecord(domain, generated.record, {
    status: BITABLE_LIBRARY_STATUS.review,
    source: `飞书多维表格 · ${generated.model} · 自然语言写入 · 比赛验证`,
  }) }], tableId)

  const reviewItems = await client.listBitableRecords(tableId)
  const reviewItem = reviewItems.find((item) => item.record_id === recordId)
  if (reviewItem?.fields?.[BITABLE_LIBRARY_FIELDS.status] !== BITABLE_LIBRARY_STATUS.review) {
    throw new Error(`feishu_skill_chain_${domain}_review_missing`)
  }

  await client.updateBitableRecords([{ record_id: recordId, fields: {
    [BITABLE_LIBRARY_FIELDS.status]: BITABLE_LIBRARY_STATUS.confirmed,
  } }], tableId)
  library.invalidate(domain)
  const synced = await library.readDomain(domain, { force: true })
  const confirmed = synced.records.find((record) => record.id === generated.record.id)
  if (!confirmed) throw new Error(`feishu_skill_chain_${domain}_sync_missing`)

  results.push({
    domain,
    recordId,
    pocketId: confirmed.id,
    title: confirmed.title || confirmed.cityNameZh || confirmed.city,
    status: BITABLE_LIBRARY_STATUS.confirmed,
    mapReady: Number.isFinite(confirmed.lat) && Number.isFinite(confirmed.lng)
      || Array.isArray(confirmed.locations) && confirmed.locations.some((location) => Number.isFinite(location.lat) && Number.isFinite(location.lng)),
  })
}

const report = {
  schema: 'pocket-earth.feishu-skill-chain-proof/v1',
  verifiedAt: new Date().toISOString(),
  appUrl: `https://feishu.cn/base/${config.bitableAppToken}`,
  results,
}
const output = path.resolve(process.argv.find((arg) => arg.startsWith('--output='))?.slice(9) || `var/feishu/skill-chain-proof-${stamp}.json`)
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
