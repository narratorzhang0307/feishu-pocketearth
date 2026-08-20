// Domain-neutral RSS evidence retrieval adapted from the user's FactAtlas project.
import { KNOWLEDGE_TOPICS } from './topics.mjs'

export function decodeEntities(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
}
function textFromTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return decodeEntities(match?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function parseGoogleNewsRss(xml, limit = 6) {
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/gi) ?? []
  return items.slice(0, limit).map((item, index) => {
    const sourceMatch = item.match(/<source(?:\s+url="([^"]+)")?>([\s\S]*?)<\/source>/i)
    return {
      id: `google-${index + 1}`,
      title: textFromTag(item, 'title') || 'Untitled source',
      url: textFromTag(item, 'link'),
      publisher: decodeEntities(sourceMatch?.[2] ?? 'Unknown publisher').replace(/<[^>]+>/g, '').trim(),
      publisherUrl: decodeEntities(sourceMatch?.[1] ?? ''),
      publishedAt: textFromTag(item, 'pubDate') || null,
      snippet: textFromTag(item, 'description') || textFromTag(item, 'title'),
      origin: 'Google News RSS',
      discoveryOnly: true,
    }
  }).filter((item) => item.url)
}

export function parseBingNewsRss(xml, limit = 6) {
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/gi) ?? []
  return items.slice(0, limit).map((item, index) => {
    const feedUrl = textFromTag(item, 'link')
    let url = feedUrl
    try {
      const parsed = new URL(feedUrl)
      const target = parsed.hostname.endsWith('bing.com') ? parsed.searchParams.get('url') : null
      if (target) url = target
    } catch { /* Keep the feed URL; the source guard will reject invalid URLs. */ }
    let publisher = textFromTag(item, 'News:Source')
    if (!publisher) {
      try { publisher = new URL(url).hostname.replace(/^www\./, '') } catch { publisher = 'Unknown publisher' }
    }
    return {
      id: `bing-${index + 1}`,
      title: textFromTag(item, 'title') || 'Untitled source',
      url,
      publisher,
      publisherUrl: 'https://www.bing.com/news',
      discoveryUrl: feedUrl === url ? null : feedUrl,
      publishedAt: textFromTag(item, 'pubDate') || null,
      snippet: textFromTag(item, 'description') || textFromTag(item, 'title'),
      origin: 'Bing News RSS',
      discoveryOnly: false,
    }
  }).filter((item) => item.url)
}

export function dedupeSources(sources, limit = 8) {
  const seenUrls = new Set()
  const seenTitles = new Set()
  return sources.filter((source) => {
    const title = String(source.title || '').toLowerCase().replace(/\s+/g, ' ').replace(/\s[-–—|]\s[^-–—|]{2,80}$/, '').trim()
    let url = String(source.url || '')
    try {
      const parsed = new URL(url)
      parsed.hash = ''
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) parsed.searchParams.delete(key)
      url = parsed.toString()
    } catch { url = '' }
    if (!title || !url || seenUrls.has(url) || seenTitles.has(title)) return false
    seenUrls.add(url); seenTitles.add(title)
    return true
  }).slice(0, limit)
}

export function sourceDomain(source) {
  for (const candidate of [source?.url, source?.publisherUrl]) {
    try {
      return new URL(String(candidate || '')).hostname.toLowerCase().replace(/^www\./, '')
    } catch { /* Try the next candidate. */ }
  }
  return ''
}

export function isOpaqueDiscoverySource(source) {
  const domain = sourceDomain(source)
  return Boolean(source?.discoveryOnly)
    || domain === 'news.google.com'
    || domain === 'google.com'
    || domain === 'bing.com'
}

function normalizedTerms(value) {
  return new Set(String(value || '').toLowerCase().match(/[a-z0-9\u4e00-\u9fff]{2,}/g) || [])
}

function relevanceScore(source, query) {
  const expected = normalizedTerms(query)
  if (!expected.size) return 0
  const actual = normalizedTerms(`${source?.title || ''} ${source?.snippet || ''}`)
  let overlap = 0
  for (const term of expected) if (actual.has(term)) overlap += 1
  return Math.min(24, Math.round((overlap / expected.size) * 24))
}

function importanceScore(source, topicConfig) {
  const text = `${source?.title || ''} ${source?.snippet || ''}`.toLowerCase()
  const positive = (topicConfig?.priorityTerms || []).filter((term) => text.includes(String(term).toLowerCase())).length
  const negative = (topicConfig?.excludedTerms || []).filter((term) => text.includes(String(term).toLowerCase())).length
  return Math.min(30, positive * 7) - Math.min(50, negative * 30)
}

export function evidenceQueryForSignal(title) {
  const clean = claimForSignal(title)
  const stopwords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'how', 'in', 'into',
    'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to', 'with', 'will',
    'announces', 'announced', 'calls', 'claims', 'latest', 'launches', 'launched', 'new', 'report', 'reports',
    'reveals', 'revealed', 'says', 'said', 'threatening', 'unveils', 'unveiled', 'upends',
  ])
  const tokens = clean.match(/[a-z][a-z0-9.'’+-]*|\d+(?:\.\d+)?|[\u4e00-\u9fff]{2,}/gi) || []
  const focused = tokens
    .map((token) => token.replace(/[.'’]s$/i, ''))
    .filter((token) => token.length > 1 && !stopwords.has(token.toLowerCase()))
    .slice(0, 7)
  return (focused.length >= 3 ? focused.join(' ') : clean).slice(0, 160)
}

export function claimForSignal(title) {
  return String(title || '')
    .replace(/^opinion\s*\|\s*/i, '')
    .replace(/\s[-–—]\s[^-–—]{2,80}$/, '')
    .replace(/,\s*(?:amid|as|prompting|raising|sparking|threatening)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function ageHours(value, now) {
  const timestamp = Date.parse(String(value || ''))
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY
  return Math.max(0, (now.getTime() - timestamp) / 3_600_000)
}

export function rankNewsSources(sources, topicConfig, {
  query = topicConfig?.query || '',
  now = new Date(),
  allowDiscovery = false,
  limit = topicConfig?.policy?.maxEvidencePerSignal || 6,
} = {}) {
  const blocked = new Set(topicConfig?.policy?.blockedDomains || [])
  const preferred = new Set(topicConfig?.preferredDomains || [])
  const freshnessHours = Number(topicConfig?.policy?.freshnessHours) || 72
  return dedupeSources(sources, Math.max(limit * 3, limit))
    .flatMap((source) => {
      const domain = sourceDomain(source)
      const discoveryOnly = isOpaqueDiscoverySource(source)
      const age = ageHours(source?.publishedAt, now)
      if (!domain || (!allowDiscovery && (blocked.has(domain) || discoveryOnly))) return []
      if (age > freshnessHours) return []
      const score = 35
        + relevanceScore(source, query)
        + importanceScore(source, topicConfig)
        + (preferred.has(domain) || [...preferred].some((item) => domain.endsWith(`.${item}`)) ? 24 : 0)
        + (age <= 24 ? 14 : age <= 48 ? 8 : 3)
        + (source?.publishedAt ? 3 : 0)
      return [{
        ...source,
        publisherDomain: domain,
        discoveryOnly,
        focusScore: Math.min(100, score),
        ageHours: Math.round(age * 10) / 10,
      }]
    })
    .sort((left, right) => right.focusScore - left.focusScore || left.ageHours - right.ageHours)
    .slice(0, limit)
}

export function selectIndependentSources(sources, topicConfig, options = {}) {
  const ranked = rankNewsSources(sources, topicConfig, options)
  const selected = []
  const domains = new Set()
  for (const source of ranked) {
    if (domains.has(source.publisherDomain)) continue
    domains.add(source.publisherDomain)
    selected.push(source)
  }
  return selected
}

async function fetchFeed(url, parser, limit, signal, fetchImpl) {
  const response = await fetchImpl(url, { headers: { accept: 'application/rss+xml, application/xml, text/xml' }, signal })
  if (!response.ok) throw new Error(`evidence_feed_${response.status}`)
  const sources = parser(await response.text(), limit)
  if (!sources.length) throw new Error('evidence_feed_empty')
  return sources
}

export async function searchNewsEvidence(query, { limit = 8, signal, fetchImpl = fetch, preferDirect = true } = {}) {
  const clean = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 320)
  if (!clean) return []
  const encoded = encodeURIComponent(clean)
  const requestSignal = signal || AbortSignal.timeout(12000)
  const urls = [
    { url: `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`, parser: parseGoogleNewsRss },
    { url: `https://www.bing.com/news/search?q=${encoded}&format=rss&mkt=en-US&setlang=en-US`, parser: parseBingNewsRss },
  ]
  const settled = await Promise.allSettled(urls.map((item) => fetchFeed(item.url, item.parser, limit, requestSignal, fetchImpl)))
  const merged = settled.flatMap((item) => item.status === 'fulfilled' ? item.value : [])
  if (preferDirect) merged.sort((left, right) => Number(Boolean(left.discoveryOnly)) - Number(Boolean(right.discoveryOnly)))
  if (!merged.length) throw new Error('public_news_unavailable')
  return dedupeSources(merged, limit)
}

export async function searchDailySignals(topic, date, options = {}) {
  const config = KNOWLEDGE_TOPICS[topic]
  if (!config) throw new Error('unsupported_knowledge_topic')
  const queryLimit = Math.max(1, Math.min(config.policy.maxDiscoveryQueries, Number(options.queryLimit) || config.policy.maxDiscoveryQueries))
  const lookbackDays = Math.max(1, Math.ceil(config.policy.freshnessHours / 24))
  const since = new Date(`${date}T00:00:00.000Z`)
  since.setUTCDate(since.getUTCDate() - lookbackDays)
  const afterDate = since.toISOString().slice(0, 10)
  const settled = await Promise.allSettled(config.queries.slice(0, queryLimit).map((query) => (
    searchNewsEvidence(`${query} after:${afterDate}`, { ...options, preferDirect: false, limit: options.limit || 12 })
  )))
  const merged = settled.flatMap((item) => item.status === 'fulfilled' ? item.value : [])
  if (!merged.length) throw new Error('public_news_unavailable')
  return rankNewsSources(merged, config, {
    query: config.query,
    now: options.now || new Date(`${date}T23:59:59.999Z`),
    allowDiscovery: true,
    limit: options.limit || 12,
  })
}
