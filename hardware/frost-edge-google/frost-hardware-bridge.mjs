// Pocket Earth · Google AI Edition — transport-neutral Frost Edge event bridge.
// The Raspberry Pi receives only public, bounded display payloads. Gemini keys,
// private memories, raw profile text, photos and precise coordinates are rejected.

export const EVENT_KIND = Object.freeze({
  MUSIC: 'music_now_playing',
  KNOWLEDGE: 'public_knowledge_brief',
  STATUS: 'buddy_status',
})

const SAFE_KEYS = new Set([
  'version', 'kind', 'source', 'state', 'priority', 'title', 'body', 'speak',
  'track', 'city', 'sourceUrls', 'truthScore', 'verdict', 'createdAt',
])
const SECRET_RE = /PRIVATE_KEY|API_KEY|ACCESS_TOKEN|PASSWORD|SECRET/i

const text = (value, max = 180) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
const now = (value) => text(value || new Date().toISOString(), 64)

function assertSafe(event) {
  for (const key of Object.keys(event)) if (!SAFE_KEYS.has(key)) throw new Error(`unsupported hardware field: ${key}`)
  if (!Object.values(EVENT_KIND).includes(event.kind)) throw new Error(`unsupported hardware kind: ${event.kind}`)
  if (SECRET_RE.test(JSON.stringify(event))) throw new Error('hardware event must not contain credentials')
  return event
}

export function createMusicEvent(input = {}) {
  const track = input.track && typeof input.track === 'object' ? {
    title: text(input.track.title, 80), artist: text(input.track.artist, 80), city: text(input.track.city, 80),
  } : undefined
  return assertSafe({
    version: '1.0.0', kind: EVENT_KIND.MUSIC, source: 'pocket-earth-music-agent', state: 'busy', priority: 'normal',
    title: text(input.title || track?.title || 'Frost Radio', 80),
    body: text(input.body || [track?.artist, track?.city].filter(Boolean).join(' · '), 220),
    speak: text(input.speak || '', 160), track, city: text(input.city || track?.city, 80), createdAt: now(input.createdAt),
  })
}

export function createKnowledgeBriefEvent(input = {}) {
  const score = Math.max(0, Math.min(100, Math.round(Number(input.truthScore) || 0)))
  const verdict = input.verdict === 'insufficient' ? 'insufficient' : 'review_required'
  const sourceUrls = (Array.isArray(input.sourceUrls) ? input.sourceUrls : [])
    .map((url) => text(url, 240)).filter((url) => /^https:\/\//.test(url)).slice(0, 4)
  return assertSafe({
    version: '1.0.0', kind: EVENT_KIND.KNOWLEDGE, source: 'pocket-earth-public-knowledge', state: 'attention', priority: 'normal',
    title: text(input.title || '公共知识简报', 80), body: text(input.body, 220), speak: text(input.speak, 160),
    sourceUrls, truthScore: score, verdict, createdAt: now(input.createdAt),
  })
}

export const toJsonLine = (event) => `${JSON.stringify(assertSafe(event))}\n`

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  process.stdout.write(toJsonLine(createKnowledgeBriefEvent({
    title: '欧盟前沿 AI 网络安全计划',
    body: '双独立来源完成 Gemini 调查与质疑；仍需人工确认。',
    speak: '这条公共知识完成双角色核验，仍等待你的确认。',
    truthScore: 82,
    sourceUrls: ['https://commission.europa.eu/', 'https://www.enisa.europa.eu/'],
  })))
}
