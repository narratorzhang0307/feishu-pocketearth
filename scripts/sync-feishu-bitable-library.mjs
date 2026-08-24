import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createBitableLibrary } from '../server/feishu/bitable-library.mjs'
import { createFeishuClient } from '../server/feishu/client.mjs'
import { readFeishuConfig } from '../server/feishu/config.mjs'
import { loadLocalEnv } from './feishu-env.mjs'

loadLocalEnv()
const rootDir = process.cwd()
const config = readFeishuConfig(process.env, rootDir)
const allDomains = ['books', 'movies', 'music', 'photos']
const domainArg = process.argv.find((arg) => arg.startsWith('--domains='))?.slice('--domains='.length) || ''
const selectedDomains = domainArg
  ? [...new Set(domainArg.split(',').map((value) => value.trim()).filter(Boolean))]
  : allDomains
const unknown = selectedDomains.filter((domain) => !allDomains.includes(domain))
if (unknown.length) throw new Error(`未知数据域：${unknown.join(', ')}`)
const missing = selectedDomains.filter((domain) => !config.bitableLibraryTables[domain])
if (!config.appId || !config.appSecret || !config.bitableAppToken || missing.length) {
  throw new Error(`飞书多维表格配置不完整${missing.length ? `：缺少 ${missing.join(', ')} Table ID` : ''}`)
}
const readJson = async (relative) => JSON.parse(await readFile(path.join(rootDir, relative), 'utf8'))
const bundles = {}
if (selectedDomains.includes('books')) bundles.books = await readJson('public/data-packs/pocket-earth-books/1.0.0/bundle.json')
if (selectedDomains.includes('movies')) bundles.movies = await readJson('public/data-packs/pocket-earth-movies/1.0.0/bundle.json')
if (selectedDomains.includes('music')) bundles.music = await readJson('public/data-packs/pocket-earth-music/1.0.0/bundle.json')
const worldPhotos = selectedDomains.includes('photos') ? await readJson('src/app/data/world-photos.json') : []
const showcase = [
  ['断桥残雪', 30.2609, 120.1470, '2025-03-14'], ['平湖秋月', 30.2542, 120.1416, '2025-03-15'],
  ['三潭印月', 30.2408, 120.1405, '2025-03-18'], ['花港观鱼', 30.2344, 120.1374, '2025-03-20'],
  ['雷峰塔', 30.2339, 120.1450, '2025-03-21'], ['曲院风荷', 30.2522, 120.1287, '2025-03-22'],
].map(([place, lat, lng, date], index) => ({
  id: `wl-${index + 1}`, title: `西湖 · ${place}`, city: `西湖 · ${place}`, lat, lng, date,
  thumb: `https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/showcase/thumb/wl-${index + 1}.jpg`,
  full: `https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/showcase/full/wl-${index + 1}.jpg`,
}))
const records = {
  ...(bundles.books ? { books: bundles.books.records } : {}),
  ...(bundles.movies ? { movies: bundles.movies.records } : {}),
  ...(bundles.music ? { music: bundles.music.records } : {}),
  ...(selectedDomains.includes('photos') ? { photos: [...worldPhotos, ...showcase] } : {}),
}
const library = createBitableLibrary({ client: createFeishuClient(config), config, cacheTtlMs: 0 })
for (const domain of selectedDomains) {
  const values = records[domain]
  const result = await library.upsert(domain, values)
  console.log(`✓ ${domain}: ${values.length} 条（新增 ${result.created} / 更新 ${result.updated}）`)
}
