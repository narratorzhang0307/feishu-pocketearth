import path from 'node:path'

const yes = (value) => /^(1|true|yes)$/i.test(String(value || ''))

export function readFeishuConfig(env = process.env, rootDir = process.cwd()) {
  const apiBase = String(env.FEISHU_API_BASE_URL || 'https://open.feishu.cn/open-apis').replace(/\/$/, '')
  const bitableLibraryTables = {
    books: String(env.FEISHU_BITABLE_BOOKS_TABLE_ID || '').trim(),
    movies: String(env.FEISHU_BITABLE_MOVIES_TABLE_ID || '').trim(),
    music: String(env.FEISHU_BITABLE_MUSIC_TABLE_ID || '').trim(),
    photos: String(env.FEISHU_BITABLE_PHOTOS_TABLE_ID || '').trim(),
  }
  return {
    apiBase,
    appId: String(env.FEISHU_APP_ID || '').trim(),
    appSecret: String(env.FEISHU_APP_SECRET || '').trim(),
    verificationToken: String(env.FEISHU_VERIFICATION_TOKEN || '').trim(),
    encryptKey: String(env.FEISHU_ENCRYPT_KEY || '').trim(),
    webBaseUrl: String(env.FEISHU_WEB_BASE_URL || 'http://localhost:3009').replace(/\/$/, ''),
    documentFolderToken: String(env.FEISHU_DOCUMENT_FOLDER_TOKEN || '').trim(),
    bitableAppToken: String(env.FEISHU_BITABLE_APP_TOKEN || '').trim(),
    bitableTableId: String(env.FEISHU_BITABLE_TABLE_ID || '').trim(),
    bitableLibraryTables,
    bitableRefreshToken: String(env.FEISHU_BITABLE_REFRESH_TOKEN || '').trim(),
    paddleOcrUrl: String(env.PADDLE_OCR_URL || '').trim(),
    paddleOcrApiKey: String(env.PADDLE_OCR_API_KEY || '').trim(),
    qwenConfigured: Boolean(env.DASHSCOPE_API_KEY || env.QWEN_API_KEY),
    allowPreextractedOcr: yes(env.FEISHU_ALLOW_PREEXTRACTED_OCR),
    devBypassAuth: yes(env.FEISHU_DEV_BYPASS_AUTH),
    workflowVersion: String(env.FEISHU_WORKFLOW_VERSION || 'feishu-p0-v1').trim(),
    dataDir: path.resolve(rootDir, String(env.FEISHU_DATA_DIR || 'var/feishu')),
    maxUploadBytes: Math.max(1024, Number(env.FEISHU_MAX_UPLOAD_BYTES || 18 * 1024 * 1024)),
    taskRateLimitPerMinute: Math.max(1, Number(env.FEISHU_TASK_RATE_LIMIT_PER_MINUTE || 6)),
  }
}

export function publicFeishuConfig(config) {
  const bitableDomains = Object.fromEntries(Object.entries(config.bitableLibraryTables || {}).map(([domain, tableId]) => [domain, Boolean(config.bitableAppToken && tableId)]))
  return {
    appId: config.appId,
    bitableAppUrl: config.bitableAppToken ? `https://feishu.cn/base/${encodeURIComponent(config.bitableAppToken)}` : '',
    configured: Boolean(config.appId && config.appSecret),
    devBypassAuth: config.devBypassAuth,
    maxUploadBytes: config.maxUploadBytes,
    acceptedTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
    integrations: {
      ocr: Boolean(config.paddleOcrUrl),
      qwen: config.qwenConfigured,
      document: Boolean(config.appId && config.appSecret),
      bitable: Boolean(config.bitableAppToken && config.bitableTableId),
      bitableLibrary: Object.values(bitableDomains).some(Boolean),
    },
    bitableDomains,
  }
}
