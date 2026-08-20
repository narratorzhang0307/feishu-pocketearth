import type { Plugin } from 'vite'

// Unsplash 代理：dev 中间件，把 /api/unsplash?query=...&count=.. 转给 Unsplash 搜索。
// access key 只在服务端（从 .env 读 UNSPLASH_ACCESS_KEY），永不进前端 bundle。
// 无 key / 出错 / 零结果时返回空数组 + error 字段，前端如实降级提示。
// 自定义「星球」agent 用它按主题抓图，再把图钉到地球（图片走 Unsplash CDN 直链，不落 OSS）。

export interface UnsplashPhoto {
  id: string
  thumb: string      // urls.small
  full: string       // urls.regular
  alt: string
  author: string
  authorUrl: string
  link: string
  color: string      // 主色，占位/无图时用
  downloadLocation: string  // Unsplash 规范：照片被「使用」时需触发一次（看大图时 ping）
}

export function unsplashProxy(env: Record<string, string>): Plugin {
  const KEY = env.UNSPLASH_ACCESS_KEY || ''
  return {
    name: 'unsplash-proxy',
    configureServer(server) {
      server.middlewares.use('/api/unsplash', (req, res) => {
        const send = (obj: unknown, code = 200) => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        ;(async () => {
          try {
            if (!KEY) return send({ photos: [], error: 'no_key' })
            const url = new URL(req.url || '', 'http://localhost')
            // 合规埋点：看大图时前端 ping ?track=<download_location>，服务端补 client_id 触发，fire-and-forget
            const track = url.searchParams.get('track')
            if (track) {
              try {
                const t = new URL(track)
                t.searchParams.set('client_id', KEY)
                await fetch(t.toString())
              } catch { /* 静默：合规埋点不影响用户 */ }
              return send({ ok: true })
            }
            const query = (url.searchParams.get('query') || '').trim()
            const count = Math.min(30, Math.max(1, Number(url.searchParams.get('count') || 24)))
            if (!query) return send({ photos: [], error: 'no_query' })
            const api = new URL('https://api.unsplash.com/search/photos')
            api.searchParams.set('query', query)
            api.searchParams.set('per_page', String(count))
            api.searchParams.set('orientation', 'landscape')
            api.searchParams.set('content_filter', 'high')
            const r = await fetch(api.toString(), {
              headers: { Authorization: `Client-ID ${KEY}`, 'Accept-Version': 'v1' },
            })
            if (!r.ok) return send({ photos: [], error: `unsplash_${r.status}` })
            const data = await r.json()
            const photos: UnsplashPhoto[] = (data?.results || []).map((p: Record<string, never>) => {
              const urls = (p.urls || {}) as Record<string, string>
              const user = (p.user || {}) as Record<string, never>
              const links = (p.links || {}) as Record<string, string>
              const userLinks = (user.links || {}) as Record<string, string>
              return {
                id: String(p.id || ''),
                thumb: urls.small || urls.thumb || '',
                full: urls.regular || urls.full || urls.small || '',
                alt: String((p.alt_description as string) || (p.description as string) || ''),
                author: String((user.name as string) || ''),
                authorUrl: userLinks.html || '',
                link: links.html || '',
                color: String((p.color as string) || '#888'),
                downloadLocation: links.download_location || '',
              }
            }).filter((p: UnsplashPhoto) => p.thumb)
            send({ photos, total: data?.total || photos.length })
          } catch (e) {
            send({ photos: [], error: String(e) })
          }
        })()
      })
    },
  }
}
