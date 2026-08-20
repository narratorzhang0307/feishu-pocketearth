const ACCEPTED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])

function normalizePages(rawPages) {
  if (!Array.isArray(rawPages)) throw new Error('ocr_pages_missing')
  const pages = rawPages.slice(0, 100).map((page, index) => ({
    page: Math.max(1, Number(page?.page || index + 1)),
    text: String(page?.text || '').trim().slice(0, 60_000),
    confidence: Number.isFinite(Number(page?.confidence)) ? Number(page.confidence) : null,
  })).filter((page) => page.text)
  if (!pages.length) throw new Error('ocr_returned_no_text')
  return pages
}

export function createOcrProvider(config, fetchImpl = fetch) {
  return {
    async recognize(source) {
      if (!ACCEPTED.has(source.mimeType)) throw new Error('unsupported_source_type')
      if (config.allowPreextractedOcr && Array.isArray(source.pages)) {
        return { engine: 'preextracted-development-only', pages: normalizePages(source.pages) }
      }
      if (!config.paddleOcrUrl) throw new Error('paddle_ocr_not_configured')
      if (!source.sourceBase64) throw new Error('source_file_missing')
      const response = await fetchImpl(config.paddleOcrUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          ...(config.paddleOcrApiKey ? { authorization: `Bearer ${config.paddleOcrApiKey}` } : {}),
        },
        body: JSON.stringify({
          fileName: source.fileName,
          mimeType: source.mimeType,
          dataBase64: source.sourceBase64,
          features: ['ocr', 'layout', 'page_number', 'confidence'],
        }),
        signal: AbortSignal.timeout(120_000),
      })
      let data = null
      try { data = await response.json() } catch { data = null }
      if (!response.ok) throw new Error(`paddle_ocr_${response.status}:${data?.error || response.statusText}`)
      return { engine: String(data?.engine || 'paddleocr-pp-structure'), pages: normalizePages(data?.pages) }
    },
  }
}

export { normalizePages }
