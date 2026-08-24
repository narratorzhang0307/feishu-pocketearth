import { boundedText, isSafeDataImage } from '../security.mjs'

const MAX_PHOTOS = 8
const RECOMMENDATIONS = new Set(['keep', 'review', 'reject'])

const stripFence = (value) => String(value || '').trim()
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/, '')

const score = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0
}
const text = (value, max) => boundedText(String(value || '').trim(), max)

export function parseQwenPhotoCuration(rawText, expectedIds) {
  let payload
  try { payload = JSON.parse(stripFence(rawText)) } catch { throw new Error('qwen_photo_curation_non_json') }
  if (!Array.isArray(payload?.reviews)) throw new Error('qwen_photo_curation_reviews_missing')
  const expected = new Set(expectedIds)
  const seen = new Set()
  const reviews = payload.reviews.map((item) => {
    const id = text(item?.id, 128)
    if (!expected.has(id) || seen.has(id)) throw new Error('qwen_photo_curation_id_invalid')
    const recommendation = text(item?.recommendation, 16)
    if (!RECOMMENDATIONS.has(recommendation)) throw new Error('qwen_photo_curation_recommendation_invalid')
    seen.add(id)
    return {
      id,
      recommendation,
      qualityScore: score(item?.qualityScore),
      storyScore: score(item?.storyScore),
      summary: text(item?.summary, 240),
      reasons: Array.isArray(item?.reasons) ? item.reasons.map((reason) => text(reason, 120)).filter(Boolean).slice(0, 4) : [],
    }
  })
  if (seen.size !== expected.size || [...expected].some((id) => !seen.has(id))) throw new Error('qwen_photo_curation_incomplete')
  return reviews
}

export function createQwenPhotoCurator(provider, fetchImpl = fetch) {
  return {
    async review(input) {
      if (!provider?.key) throw new Error('qwen_api_key_not_configured')
      if (!Array.isArray(input) || input.length < 1 || input.length > MAX_PHOTOS) throw new Error('photo_curation_batch_invalid')
      const photos = input.map((item) => {
        const id = text(item?.id, 128)
        if (!/^[A-Za-z0-9:_|.-]{4,128}$/.test(id)) throw new Error('photo_curation_id_invalid')
        if (!isSafeDataImage(item?.image, 1_500_000)) throw new Error('photo_curation_image_invalid')
        return {
          id,
          image: item.image,
          technicalQuality: score(item?.technicalQuality),
          tags: Array.isArray(item?.tags) ? item.tags.map((tag) => text(tag, 40)).filter(Boolean).slice(0, 8) : [],
        }
      })
      if (new Set(photos.map((photo) => photo.id)).size !== photos.length) throw new Error('photo_curation_id_duplicate')

      const instructions = [
        '你是 Pocket Earth 的照片精选编辑。确定性程序已经完成哈希去重、连拍聚类、清晰度和曝光测量。',
        '你只评估画面是否值得进入个人杂志与日历：主体明确、构图可读、具有生活或地点叙事价值。',
        '不要猜人物身份、关系、精确地点或敏感信息。技术分低不等于必须淘汰，有记忆价值可给 review。',
        '必须只返回 JSON：{"reviews":[{"id":"原ID","recommendation":"keep|review|reject","qualityScore":0,"storyScore":0,"summary":"一句中文","reasons":["理由"]}]}。',
        '每个输入 ID 必须且只能返回一次。',
      ].join('\n')
      const content = [{ type: 'text', text: instructions }]
      for (const photo of photos) {
        content.push({ type: 'text', text: `PHOTO_ID=${photo.id}\n本地技术分=${photo.technicalQuality}\n本地标签=${photo.tags.join('、') || '无'}` })
        content.push({ type: 'image_url', image_url: { url: photo.image } })
      }
      const response = await fetchImpl(provider.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({
          model: provider.visionModel,
          temperature: 0,
          max_tokens: 1800,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content }],
        }),
        signal: AbortSignal.timeout(60_000),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(`qwen_${response.status}:${text(data?.error?.message || data?.error, 240)}`)
      const raw = data?.choices?.[0]?.message?.content
      if (typeof raw !== 'string' || !raw.trim()) throw new Error('qwen_photo_curation_empty')
      return { model: provider.visionModel, reviews: parseQwenPhotoCuration(raw, photos.map((photo) => photo.id)) }
    },
  }
}
