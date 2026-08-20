const WIKIPEDIA = { lang: 'zh', api: 'https://zh.wikipedia.org/w/api.php', publisher: '中文维基百科' }
const SEARCH_URL = 'https://html.duckduckgo.com/html/'

const BLOCKED_HOSTS = [
  'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'tripadvisor.com',
  'booking.com', 'expedia.com', 'agoda.com', 'ctrip.com', 'qunar.com', 'mafengwo.cn', 'xiaohongshu.com',
  'google.com', 'googleapis.com', 'googleusercontent.com', 'wikipedia.org', 'wikimedia.org',
  'x.com', 'twitter.com', 'reddit.com',
]

function clean(value, max = 80) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
}

function textFromHtml(value, max = 1800) {
  return clean(decodeHtml(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')), max)
}

function compact(value) {
  return clean(value).toLocaleLowerCase().replace(/[\s·・—_()（）\[\]【】'"“”‘’]/g, '')
}

function domainGroup(value) {
  let hostname = ''
  try { hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) return ''
  const parts = hostname.split('.').filter(Boolean)
  if (parts.length <= 2) return hostname
  const compound = ['co.jp', 'or.jp', 'go.jp', 'ac.jp', 'gov.uk', 'org.uk', 'gov.cn', 'org.cn', 'com.cn', 'gov.au']
  const tail = parts.slice(-2).join('.')
  return compound.includes(tail) ? parts.slice(-3).join('.') : tail
}

function sourceGroup(value) {
  const domain = domainGroup(value)
  if (domain === 'japan.travel' || domain === 'japan-travel.cn') return 'jnto'
  if (domain === 'kyoto.travel' || domain === 'kyokanko.or.jp') return 'dmo-kyoto'
  if (domain === 'wikipedia.org' || domain === 'wikimedia.org') return 'wikimedia'
  return domain
}

function comparable(value) {
  return compact(value)
    .replace(/錦/g, '锦').replace(/場/g, '场').replace(/學/g, '学').replace(/園/g, '园')
    .replace(/嵐/g, '岚').replace(/禪/g, '禅').replace(/門/g, '门').replace(/廣/g, '广')
}

function blockedUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return true
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (!host || host === 'localhost' || /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) return true
    return BLOCKED_HOSTS.some((item) => host === item || host.endsWith(`.${item}`))
  } catch { return true }
}

function scorePage(page, place, city) {
  const title = compact(page?.title)
  const wanted = compact(place)
  const extract = clean(page?.extract, 2400).toLocaleLowerCase()
  let score = Math.max(0, 100 - Number(page?.index || 20) * 10)
  if (title === wanted) score += 1000
  else if (title.includes(wanted) || wanted.includes(title)) score += 450
  if (extract.includes(clean(city).toLocaleLowerCase())) score += 10
  return score
}

function toWikipediaSource(page) {
  const url = String(page.canonicalurl || page.fullurl)
  return {
    title: clean(page.title, 120), publisher: WIKIPEDIA.publisher, language: WIKIPEDIA.lang,
    url, sourceGroup: sourceGroup(url), sourceType: 'encyclopedia', discoveredBy: 'wikipedia-fallback', revisionId: Number(page.lastrevid) || null,
    excerpt: clean(page.extract, 1800),
  }
}

function validWikipediaPage(page) {
  return clean(page?.extract, 2400).length >= 80 && /^https:\/\//.test(String(page?.canonicalurl || page?.fullurl || ''))
}

async function readJSON(url, fetcher) {
  const response = await fetcher(url, {
    headers: { 'user-agent': 'PocketEarthFinals/1.0 (independent-source travel brief)' },
    signal: AbortSignal.timeout(8000),
  })
  return response.ok ? response.json() : null
}

async function searchWikipedia(place, city, fetcher) {
  const searchUrl = new URL(WIKIPEDIA.api)
  searchUrl.search = new URLSearchParams({
    action: 'query', list: 'search', srsearch: `${place} ${city}`, srlimit: '5', format: 'json', formatversion: '2',
  }).toString()
  const searchData = await readJSON(searchUrl, fetcher)
  const results = Array.isArray(searchData?.query?.search) ? searchData.query.search : []
  const candidate = results
    .map((item, index) => ({ ...item, index: index + 1, extract: item.snippet || '' }))
    .sort((a, b) => scorePage(b, place, city) - scorePage(a, place, city))[0]
  if (!candidate?.title) return null
  const pageUrl = new URL(WIKIPEDIA.api)
  pageUrl.search = new URLSearchParams({
    action: 'query', titles: candidate.title, prop: 'extracts|info', inprop: 'url', exchars: '1600',
    explaintext: '1', format: 'json', formatversion: '2',
  }).toString()
  const data = await readJSON(pageUrl, fetcher)
  const page = (Array.isArray(data?.query?.pages) ? data.query.pages : []).find(validWikipediaPage)
  return page ? toWikipediaSource(page) : null
}

function unwrapSearchUrl(value) {
  const decoded = decodeHtml(value)
  try {
    const url = new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded)
    if (url.hostname.endsWith('duckduckgo.com')) return url.searchParams.get('uddg') || ''
    return url.href
  } catch { return '' }
}

function parseSearchResults(html) {
  const results = []
  const pattern = /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of String(html || '').matchAll(pattern)) {
    const url = unwrapSearchUrl(match[1])
    const title = textFromHtml(match[2], 180)
    if (!url || !title || blockedUrl(url)) continue
    results.push({ url, title, sourceGroup: sourceGroup(url) })
  }
  return results
}

function authorityScore(result, place, city) {
  let hostname = ''
  try { hostname = new URL(result.url).hostname.toLowerCase() } catch { return -1000 }
  const title = result.title.toLocaleLowerCase()
  const group = result.sourceGroup
  let score = 0
  if (/(?:^|\.)(?:gov|go|gouv)\.[a-z.]+$/.test(hostname) || /\.(?:gov|go)\.[a-z]{2}$/.test(hostname)) score += 170
  if (/\.(?:or|ac)\.jp$/.test(hostname) || /\.(?:edu|museum)$/.test(hostname)) score += 105
  if (/(?:公式|官方|official|政府|市役所|県|観光連盟|観光協会|tourism board|tourist board|national tourism)/i.test(title)) score += 130
  if (/(?:travel|tourism|kankou|visit|museum|temple|shrine|city|prefecture)/i.test(`${hostname} ${title}`)) score += 50
  if (compact(title).includes(compact(place))) score += 35
  if (compact(title).includes(compact(city))) score += 10
  if (group === 'wikimedia') score = 5
  return score
}

async function searchWeb(query, fetcher) {
  const url = new URL(SEARCH_URL)
  url.searchParams.set('q', query)
  const response = await fetcher(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; PocketEarthFinals/1.0; independent-source travel brief)' },
    signal: AbortSignal.timeout(10000),
  })
  return response.ok ? parseSearchResults(await response.text()) : []
}

function htmlMeta(html, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const a = new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["']`, 'i').exec(html)
    if (a?.[1]) return textFromHtml(a[1], 240)
    const b = new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i').exec(html)
    if (b?.[1]) return textFromHtml(b[1], 240)
  }
  return ''
}

function sourceFromPage(html, result, finalUrl) {
  const paragraphs = [...String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => textFromHtml(match[1], 700))
    .filter((text) => text.length >= 45 && !/(cookie|privacy policy|javascript|all rights reserved)/i.test(text))
  const description = htmlMeta(html, ['description', 'og:description'])
  const excerpt = [...new Set([description, ...paragraphs])].join(' ').slice(0, 1800).trim()
  if (excerpt.length < 100) return null
  const ogTitle = htmlMeta(html, ['og:title'])
  const documentTitle = textFromHtml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1], 180)
  const siteName = htmlMeta(html, ['og:site_name', 'application-name'])
  const url = finalUrl || result.url
  return {
    title: ogTitle || documentTitle || result.title,
    publisher: siteName || domainGroup(url),
    language: /<html\b[^>]*lang=["']ja/i.test(html) ? 'ja' : /<html\b[^>]*lang=["']en/i.test(html) ? 'en' : 'zh',
    url, sourceGroup: sourceGroup(url), sourceType: 'institution', discoveredBy: result.discoveredBy || 'direct-search', revisionId: null, excerpt,
  }
}

async function readPage(result, place, fetcher) {
  if (blockedUrl(result.url)) return null
  try {
    const response = await fetcher(result.url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; PocketEarthFinals/1.0; source-linked travel brief)' },
      signal: AbortSignal.timeout(9000),
    })
    const contentType = String(response.headers?.get?.('content-type') || '')
    if (!response.ok || !contentType.includes('text/html') || blockedUrl(response.url || result.url)) return null
    const source = sourceFromPage(await response.text(), result, response.url || result.url)
    if (!source || source.sourceGroup !== result.sourceGroup) return null
    const identity = comparable(`${result.title} ${source.title} ${source.excerpt}`)
    return identity.includes(comparable(place)) ? source : null
  } catch { return null }
}

function independentSources(sources, limit = 3) {
  const groups = new Set()
  return sources.filter((source) => {
    const group = source?.sourceGroup || sourceGroup(source?.url)
    if (!group || groups.has(group) || clean(source?.excerpt, 2400).length < 80) return false
    groups.add(group)
    return true
  }).slice(0, limit)
}

function weightedSources(sources) {
  return sources.map(({ score, ...source }) => ({
    ...source,
    authorityWeight: Number(score) >= 160 ? 3 : Number(score) >= 90 ? 2 : 1,
  }))
}

function collectResponseUrls(value, output = new Set(), depth = 0) {
  if (depth > 8 || value == null) return output
  if (Array.isArray(value)) {
    for (const item of value) collectResponseUrls(item, output, depth + 1)
    return output
  }
  if (typeof value !== 'object') return output
  for (const [key, child] of Object.entries(value)) {
    if (key === 'url' && typeof child === 'string' && !blockedUrl(child)) output.add(child)
    else collectResponseUrls(child, output, depth + 1)
  }
  return output
}

async function searchWithQwen(place, city, options, fetcher) {
  if (!options?.qwenKey) return []
  const base = String(options.qwenBase || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')
  const targets = [
    '地点运营方、场馆、寺社、市场或管理组织的官方网站',
    '当地政府、城市或省级官方文旅与文化机构的介绍页',
    '国家级观光、文化、遗产、博物馆或学术机构的介绍页',
  ]
  const responses = await Promise.allSettled(targets.map(async (target) => {
    const response = await fetcher(`${base}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${options.qwenKey}` },
      body: JSON.stringify({
        model: options.qwenSearchModel || 'qwen3.5-plus',
        input: [
          `请联网搜索“${city} ${place}”，本轮只找：${target}。`,
          '只返回与该地点本身直接相关、在中国大陆普通网络可直接打开的 HTTPS 原始页面。',
          '不要用 Google、Wikipedia、博客、论坛、社交媒体、订票平台、聚合攻略或同一机构的多语言镜像凑数。请搜索多个候选，后端会再次核验。',
        ].join('\n'),
        tools: [{ type: 'web_search' }],
        enable_thinking: false,
        max_output_tokens: 48,
      }),
      signal: AbortSignal.timeout(45000),
    })
    return response.ok ? response.json() : null
  }))
  const data = responses.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : [])
  const groups = new Set()
  return [...collectResponseUrls(data)].map((url) => ({
    url, title: '', sourceGroup: sourceGroup(url), discoveredBy: 'qwen-cloud',
  })).filter((source) => {
    if (!source.sourceGroup || groups.has(source.sourceGroup)) return false
    groups.add(source.sourceGroup)
    return true
  }).slice(0, 16)
}

/** Retrieve three independently published, source-linked materials. Multilingual mirrors count as one source. */
export async function getTravelPlaceSources(placeValue, cityValue, optionsOrFetcher = {}, fallbackFetcher = fetch) {
  const place = clean(placeValue)
  const city = clean(cityValue)
  if (place.length < 1 || city.length < 1) return []
  const options = typeof optionsOrFetcher === 'function' ? {} : optionsOrFetcher
  const fetcher = typeof optionsOrFetcher === 'function' ? optionsOrFetcher : fallbackFetcher

  let qwenPages = []
  try {
    const candidates = await searchWithQwen(place, city, options, fetcher)
    qwenPages = (await Promise.all(candidates.map((result) => readPage(result, place, fetcher)))).filter(Boolean)
      .map((source) => ({ ...source, score: authorityScore(source, place, city) }))
      .filter((source) => source.score >= 90)
      .sort((a, b) => b.score - a.score)
  } catch { /* deterministic direct-search fallback below */ }
  const qwenSelected = independentSources(qwenPages, 3)
  if (options.qwenKey) return weightedSources(qwenSelected)

  const queries = [
    `${place} ${city} 公式 観光`,
    `${place} ${city} official tourism history`,
    `${place} ${city} 政府 博物馆 文化`,
  ]
  const settled = await Promise.allSettled([
    ...queries.map((query) => searchWeb(query, fetcher)),
    searchWikipedia(place, city, fetcher),
  ])
  const webResults = settled.slice(0, queries.length)
    .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
  const ranked = [...new Map(webResults.map((result) => [result.sourceGroup, result])).values()]
    .map((result) => ({ ...result, score: authorityScore(result, place, city) }))
    .filter((result) => result.score >= 90)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
  const pages = (await Promise.all(ranked.map((result) => readPage(result, place, fetcher)))).filter(Boolean)
    .map((source) => ({ ...source, score: authorityScore(source, place, city) }))
    .sort((a, b) => b.score - a.score)
  return weightedSources(independentSources([...qwenSelected, ...pages], 3))
}

export const __test = { domainGroup, sourceGroup, independentSources, parseSearchResults, sourceFromPage, authorityScore, collectResponseUrls }
