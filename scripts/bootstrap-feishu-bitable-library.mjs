import { readFeishuConfig } from '../server/feishu/config.mjs'
import { BITABLE_LIBRARY_FIELDS } from '../server/feishu/bitable-library.mjs'
import { createFeishuClient } from '../server/feishu/client.mjs'
import { loadLocalEnv } from './feishu-env.mjs'

loadLocalEnv()
const config = readFeishuConfig(process.env, process.cwd())
if (!config.appId || !config.appSecret || !config.bitableAppToken) {
  throw new Error('请先在 .env 配置 FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_BITABLE_APP_TOKEN')
}

const client = createFeishuClient(config)
const definitions = {
  books: { name: 'Pocket Earth · 书籍', fields: ['title', 'author', 'country', 'type', 'year', 'rating', 'date', 'description'] },
  movies: { name: 'Pocket Earth · 电影', fields: ['title', 'author', 'country', 'type', 'year', 'rating', 'date', 'description'] },
  music: { name: 'Pocket Earth · 音乐', fields: ['title', 'city', 'latitude', 'longitude', 'description'] },
  photos: { name: 'Pocket Earth · 照片', fields: ['title', 'city', 'date', 'latitude', 'longitude', 'description'] },
}
const common = ['id', 'status', 'source', 'schema', 'payload', 'updatedAt']
const numeric = new Set(['year', 'rating', 'latitude', 'longitude'])
const date = new Set(['updatedAt'])

const existingTables = await client.listBitableTables()
const result = {}
for (const [domain, definition] of Object.entries(definitions)) {
  const configuredTableId = config.bitableLibraryTables?.[domain]
  let table = configuredTableId
    ? existingTables.find((item) => item.table_id === configuredTableId)
    : existingTables.find((item) => item.name === definition.name)
  if (!table) {
    if (configuredTableId) throw new Error(`配置的数据表不存在：${domain} / ${configuredTableId}`)
    const created = await client.createBitableTable(definition.name)
    table = { table_id: created.tableId, name: definition.name }
    console.log(`✓ 创建数据表：${definition.name}`)
  } else console.log(`= 复用数据表：${definition.name}`)
  const tableId = table.table_id
  const existingFields = await client.listBitableFields(tableId)
  const names = new Set(existingFields.map((item) => item.field_name))
  for (const key of [...common, ...definition.fields]) {
    const fieldName = BITABLE_LIBRARY_FIELDS[key]
    if (names.has(fieldName)) continue
    const type = numeric.has(key) ? 2 : date.has(key) ? 5 : 1
    await client.createBitableField(tableId, fieldName, type)
    console.log(`  + ${fieldName}`)
  }
  result[domain] = tableId
}

const writebackDefinition = {
  name: 'Pocket Earth · 知识地点',
  fields: [
    ['任务 ID', 1], ['来源文件', 1], ['原文地点', 1], ['现代地名', 1],
    ['页码', 2], ['原文证据', 1], ['纬度', 2], ['经度', 2],
    ['置信度', 2], ['审核状态', 1],
  ],
}
let writebackTable = config.bitableTableId
  ? existingTables.find((item) => item.table_id === config.bitableTableId)
  : existingTables.find((item) => item.name === writebackDefinition.name)
if (!writebackTable) {
  if (config.bitableTableId) throw new Error(`配置的知识地点表不存在：${config.bitableTableId}`)
  const created = await client.createBitableTable(writebackDefinition.name)
  writebackTable = { table_id: created.tableId, name: writebackDefinition.name }
  console.log(`✓ 创建数据表：${writebackDefinition.name}`)
} else console.log(`= 复用数据表：${writebackTable.name}`)
const writebackFields = await client.listBitableFields(writebackTable.table_id)
const writebackNames = new Set(writebackFields.map((item) => item.field_name))
for (const [fieldName, type] of writebackDefinition.fields) {
  if (writebackNames.has(fieldName)) continue
  await client.createBitableField(writebackTable.table_id, fieldName, type)
  console.log(`  + ${fieldName}`)
}

console.log('\n把以下内容复制到 .env（不会改动现有文件）：')
console.log(`FEISHU_BITABLE_TABLE_ID=${writebackTable.table_id}`)
console.log(`FEISHU_BITABLE_BOOKS_TABLE_ID=${result.books}`)
console.log(`FEISHU_BITABLE_MOVIES_TABLE_ID=${result.movies}`)
console.log(`FEISHU_BITABLE_MUSIC_TABLE_ID=${result.music}`)
console.log(`FEISHU_BITABLE_PHOTOS_TABLE_ID=${result.photos}`)
