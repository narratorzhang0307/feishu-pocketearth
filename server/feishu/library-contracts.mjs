export const FEISHU_LIBRARY_CONTRACTS = Object.freeze({
  books: Object.freeze({
    schema: 'pocket.books/v1', skillId: 'pocket.books', agentTarget: 'books-agent',
    tableEnv: 'FEISHU_BITABLE_BOOKS_TABLE_ID', tableName: 'Pocket Earth · 书籍', idPrefix: 'book',
  }),
  movies: Object.freeze({
    schema: 'pocket.movies/v1', skillId: 'pocket.movies', agentTarget: 'movies-agent',
    tableEnv: 'FEISHU_BITABLE_MOVIES_TABLE_ID', tableName: 'Pocket Earth · 电影', idPrefix: 'movie',
  }),
  music: Object.freeze({
    schema: 'pocket.music/v1', skillId: 'pocket.music', agentTarget: 'music-agent',
    tableEnv: 'FEISHU_BITABLE_MUSIC_TABLE_ID', tableName: 'Pocket Earth · 音乐', idPrefix: 'music',
  }),
  photos: Object.freeze({
    schema: 'pocket.photos/v1', skillId: 'pocket.photos', agentTarget: 'photos-agent',
    tableEnv: 'FEISHU_BITABLE_PHOTOS_TABLE_ID', tableName: 'Pocket Earth · 照片', idPrefix: 'photo',
  }),
})

export const FEISHU_LIBRARY_DOMAINS = Object.freeze(Object.keys(FEISHU_LIBRARY_CONTRACTS))

const identifier = (value, max = 256) => {
  const text = String(value || '').trim()
  return /^[A-Za-z0-9_-]+$/.test(text) ? text.slice(0, max) : ''
}

export function assertIsolatedLibraryTables(tables = {}, { requireAll = false } = {}) {
  const entries = FEISHU_LIBRARY_DOMAINS
    .map((domain) => [domain, identifier(tables?.[domain])])
    .filter(([, tableId]) => Boolean(tableId))
  if (requireAll && entries.length !== FEISHU_LIBRARY_DOMAINS.length) throw new Error('bitable_library_tables_incomplete')
  const owner = new Map()
  for (const [domain, tableId] of entries) {
    const previous = owner.get(tableId)
    if (previous) throw new Error(`bitable_library_table_id_shared:${previous}:${domain}`)
    owner.set(tableId, domain)
  }
  return Object.fromEntries(entries)
}

export function normalizePersonalWorkspace(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { appToken: '', tables: {} }
  const appToken = identifier(value.appToken)
  const tables = assertIsolatedLibraryTables(value.tables || {})
  return { appToken, tables }
}

export function workspaceLinks(workspace) {
  const normalized = normalizePersonalWorkspace(workspace)
  if (!normalized.appToken) return { appUrl: '', domainUrls: {} }
  const appUrl = `https://feishu.cn/base/${encodeURIComponent(normalized.appToken)}`
  return {
    appUrl,
    domainUrls: Object.fromEntries(Object.entries(normalized.tables).map(([domain, tableId]) => [
      domain,
      `${appUrl}?table=${encodeURIComponent(tableId)}`,
    ])),
  }
}
