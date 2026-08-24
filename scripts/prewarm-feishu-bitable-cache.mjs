import { createBitableLibrary } from '../server/feishu/bitable-library.mjs'
import { createFeishuClient } from '../server/feishu/client.mjs'
import { readFeishuConfig } from '../server/feishu/config.mjs'
import { loadLocalEnv } from './feishu-env.mjs'

loadLocalEnv()

const config = readFeishuConfig(process.env, process.cwd())
const library = createBitableLibrary({ client: createFeishuClient(config), config })
const snapshot = await library.readAll({ force: true })
console.log(JSON.stringify({
  ok: true,
  cachedAt: snapshot.syncedAt,
  domains: Object.fromEntries(Object.entries(snapshot.domains).map(([domain, value]) => [domain, {
    count: value.records.length,
    pending: value.pending.length,
    rejected: value.rejected.length,
    version: value.version,
  }])),
}, null, 2))
