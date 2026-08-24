function stripFence(value) {
  const text = String(value || '').trim()
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : text
}

const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max)
const number = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const coordinate = (value, min, max) => {
  const parsed = number(value)
  return parsed !== null && parsed >= min && parsed <= max ? parsed : null
}

function locations(value, kind) {
  return (Array.isArray(value) ? value : []).slice(0, 8).map((item) => ({
    kind: ['story', 'author', 'country', 'filming'].includes(String(item?.kind)) ? String(item.kind) : kind,
    place: text(item?.place, 300),
    lng: coordinate(item?.lng, -180, 180),
    lat: coordinate(item?.lat, -90, 90),
    confidence: Math.min(1, Math.max(0, number(item?.confidence) ?? 0)),
  })).filter((item) => item.place)
}

export function parseQwenLibraryInstruction(rawText, { domain, recordId, instruction, today = new Date().toISOString().slice(0, 10) }) {
  let payload
  try { payload = JSON.parse(stripFence(rawText)) } catch { throw new Error('qwen_library_instruction_non_json') }
  const value = payload?.record
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('qwen_library_instruction_record_missing')
  const prefix = domain === 'books' ? 'book' : domain === 'movies' ? 'movie' : domain === 'music' ? 'music-city' : 'photo'
  const id = `${prefix}:feishu-ai:${text(recordId, 128)}`
  const shared = { id, aiInstruction: text(instruction, 5000), note: text(value.note || instruction, 5000) }

  if (domain === 'books') {
    const title = text(value.title, 300)
    if (!title) throw new Error('qwen_library_instruction_title_missing')
    return { ...shared, title, author: text(value.author, 300), country: text(value.country, 200), type: text(value.type, 120), year: number(value.year), rating: number(value.rating), date: text(value.date, 40), synopsis: text(value.description || value.synopsis, 5000), locations: locations(value.locations, 'story') }
  }
  if (domain === 'movies') {
    const title = text(value.title, 300)
    if (!title) throw new Error('qwen_library_instruction_title_missing')
    return { ...shared, title, original: text(value.original, 300), director: text(value.director || value.author, 300), country: text(value.country, 200), type: text(value.type, 120), year: number(value.year), rating: number(value.rating), date: text(value.date, 40), synopsis: text(value.description || value.synopsis, 5000), locations: locations(value.locations, 'filming') }
  }
  if (domain === 'music') {
    const cityNameZh = text(value.cityNameZh || value.city, 200)
    if (!cityNameZh) throw new Error('qwen_library_instruction_city_missing')
    const trackTitle = text(value.trackTitle || value.title, 300)
    return {
      ...shared, slug: id.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase(), cityName: text(value.cityName || cityNameZh, 200), cityNameZh,
      ianaTz: null, tzOffset: 0, station: { freq: 0, name: `${cityNameZh} · Pocket Earth` }, cover: '',
      lat: coordinate(value.lat, -90, 90), lng: coordinate(value.lng, -180, 180), description: text(value.description || instruction, 5000),
      tracks: trackTitle ? [{ id: `${id}:track`, title: trackTitle, artist: text(value.artist, 300), genre: text(value.genre, 120), durationSec: null, playback: { provider: 'none', url: '' }, introText: text(value.note || instruction, 5000), introPlayback: { provider: 'none', url: '' } }] : [], podcast: [],
    }
  }
  if (domain === 'photos') {
    const city = text(value.city || value.title, 200)
    if (!city) throw new Error('qwen_library_instruction_city_missing')
    return { ...shared, title: text(value.title || city, 300), city, date: text(value.date || today, 40), lat: coordinate(value.lat, -90, 90), lng: coordinate(value.lng, -180, 180), qwen: { summary: text(value.description || instruction, 5000) } }
  }
  throw new Error('bitable_library_domain_invalid')
}

function schemaFor(domain) {
  if (domain === 'books') return '{"record":{"title":"书名","author":"作者","country":"国家/地区","type":"类型","year":1967,"rating":null,"date":"YYYY-MM-DD或空字符串","note":"用户笔记","description":"简短介绍","locations":[{"kind":"story|author|country","place":"候选地点","lng":-74.19,"lat":10.59,"confidence":0.7}]}}'
  if (domain === 'movies') return '{"record":{"title":"片名","original":"原名","director":"导演/主创","country":"国家/地区","type":"类型","year":2000,"rating":null,"date":"YYYY-MM-DD或空字符串","note":"用户笔记","description":"简短介绍","locations":[{"kind":"filming|story|country","place":"候选地点","lng":120.1,"lat":30.2,"confidence":0.7}]}}'
  if (domain === 'music') return '{"record":{"title":"歌曲名","artist":"艺人","genre":"流派","city":"相关城市","cityName":"英文城市名或城市名","lat":30.2,"lng":120.1,"note":"用户笔记","description":"城市与音乐的关系"}}'
  return '{"record":{"title":"照片标题","city":"拍摄城市或地点","date":"YYYY-MM-DD","lat":30.2,"lng":120.1,"note":"用户笔记","description":"照片说明"}}'
}

export function createQwenLibraryInstructionParser(provider, fetchImpl = fetch) {
  return {
    async parse({ domain, recordId, instruction }) {
      if (!provider.key) throw new Error('qwen_api_key_not_configured')
      const response = await fetchImpl(provider.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: '你是飞书多维表格的知识记录整理器。把用户的一句话整理为指定数据结构；不得执行写入。地点与坐标只是待用户确认的候选，不能伪装成已核验事实。只输出严格 JSON。' },
            { role: 'user', content: `当前数据表：${domain}\n用户指令：${text(instruction, 5000)}\n请整理并适度补全常识性书目信息。用户没有提供评分时 rating 必须为 null；无法判断的字段用空字符串或 null。候选地点允许基于作品常识提出，但 confidence 不得高于 0.75，最终必须由用户确认。严格返回：${schemaFor(domain)}` },
          ],
        }),
        signal: AbortSignal.timeout(90_000),
      })
      let data = null
      try { data = await response.json() } catch { data = null }
      if (!response.ok) throw new Error(`qwen_${response.status}:${data?.error?.message || response.statusText}`)
      const rawText = data?.choices?.[0]?.message?.content
      if (!rawText) throw new Error('qwen_empty_response')
      return { model: provider.model, record: parseQwenLibraryInstruction(rawText, { domain, recordId, instruction }) }
    },
  }
}
