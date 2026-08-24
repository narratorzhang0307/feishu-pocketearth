import { extractionPromptForSkill } from './frost-skill-router.mjs'

function stripFence(value) {
  const text = String(value || '').trim()
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : text
}

function compact(value) {
  return String(value || '').replace(/\s+/g, '').toLocaleLowerCase()
}

function boundedCoordinate(value, min, max) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

export function parseQwenLocations(rawText, pages) {
  let payload
  try { payload = JSON.parse(stripFence(rawText)) } catch { throw new Error('qwen_non_json_response') }
  if (!Array.isArray(payload?.locations)) throw new Error('qwen_locations_missing')
  const pageByNumber = new Map(pages.map((page) => [Number(page.page), page]))
  const locations = payload.locations.slice(0, 100).map((item, index) => {
    const page = Math.max(1, Number(item?.page || 0))
    const sourcePage = pageByNumber.get(page)
    const evidence = String(item?.evidence || '').trim().slice(0, 1200)
    if (!sourcePage || !evidence || !compact(sourcePage.text).includes(compact(evidence))) {
      throw new Error(`qwen_evidence_not_grounded:${index + 1}`)
    }
    const nameAsWritten = String(item?.nameAsWritten || '').trim().slice(0, 300)
    if (!nameAsWritten) throw new Error(`qwen_location_name_missing:${index + 1}`)
    return {
      id: `location-${index + 1}`,
      nameAsWritten,
      modernName: String(item?.modernName || nameAsWritten).trim().slice(0, 300),
      description: String(item?.description || '').trim().slice(0, 2000),
      page,
      evidence,
      latitude: boundedCoordinate(item?.latitude, -90, 90),
      longitude: boundedCoordinate(item?.longitude, -180, 180),
      confidence: Math.min(1, Math.max(0, Number(item?.confidence) || 0)),
      reviewStatus: 'pending',
    }
  })
  if (!locations.length) throw new Error('qwen_returned_no_locations')
  return locations
}

export function createQwenLocationExtractor(provider, fetchImpl = fetch) {
  return {
    async extract(pages, orchestration = null) {
      if (!provider.key) throw new Error('qwen_api_key_not_configured')
      const pageText = pages.map((page) => `<<<PAGE ${page.page}>>>\n${page.text}`).join('\n\n').slice(0, 100_000)
      const skillPrompt = extractionPromptForSkill(orchestration)
      const response = await fetchImpl(provider.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: skillPrompt?.system || '你是可审计的地理知识抽取器。只能从用户提供的 OCR 页面中抽取明确出现的地点。evidence 必须逐字摘自对应页面；不确定的经纬度必须填 null，禁止猜测。只输出 JSON。',
            },
            {
              role: 'user',
              content: `${skillPrompt?.instruction || '从下列 OCR 页面抽取地点。confidence 必须根据原文明确程度填写 0 到 1 之间的真实判断值，禁止照抄示例占位值；能够可靠对应到现实地点时填写现代坐标，不确定时经纬度填 null。返回 {"locations":[{"nameAsWritten":"原文地点名","modernName":"现代规范名","description":"与材料相关的一句话","page":1,"evidence":"页面中的连续原文证据","latitude":39.9042,"longitude":116.4074,"confidence":0.95}]}。没有地点则返回 {"locations":[]}。'}\n\n${pageText}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(90_000),
      })
      let data = null
      try { data = await response.json() } catch { data = null }
      if (!response.ok) throw new Error(`qwen_${response.status}:${data?.error?.message || response.statusText}`)
      const rawText = data?.choices?.[0]?.message?.content
      if (!rawText) throw new Error('qwen_empty_response')
      return { model: provider.model, locations: parseQwenLocations(rawText, pages) }
    },
  }
}
