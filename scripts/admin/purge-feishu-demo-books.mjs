import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const { readFeishuConfig } = await import(pathToFileURL(path.join(root, 'server/feishu/config.mjs')).href)
const { createFeishuClient } = await import(pathToFileURL(path.join(root, 'server/feishu/client.mjs')).href)
const { hydrateBitableLibraryConfig } = await import(pathToFileURL(path.join(root, 'server/feishu/bitable-library.mjs')).href)

const config = readFeishuConfig(process.env, root)
await hydrateBitableLibraryConfig(config)
const tableId = config.bitableLibraryTables?.books
if (!config.bitableAppToken || !tableId) throw new Error('books_bitable_not_configured')

const client = createFeishuClient(config, fetch)
const rows = await client.listBitableRecords(tableId)
const targets = ['酒吧长谈', '城市与狗', '百年孤独']
const textOf = (value) => {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(textOf).join('')
  if (typeof value === 'object') return textOf(value.text ?? value.name ?? value.value ?? Object.values(value))
  return ''
}
const matched = rows.filter((row) => {
  const title = textOf(row?.fields?.['标题']).replace(/\s+/g, '')
  return targets.some((target) => title.includes(target))
})
const ids = matched.map((row) => row.record_id).filter(Boolean)
const titles = matched.map((row) => textOf(row?.fields?.['标题']))
const result = await client.deleteBitableRecords(ids, tableId)
await rm(path.join(config.dataDir, 'bitable-library-cache', 'books.json'), { force: true })
console.log(JSON.stringify({ scanned: rows.length, matched: ids.length, deleted: result.deleted, titles }))
