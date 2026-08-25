import { readFeishuConfig } from './config.mjs'
import { assertIsolatedLibraryTables } from './library-contracts.mjs'

function isPublicHttps(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)
      && !/(^|\.)example\.(com|org|net)$/.test(url.hostname)
      && !url.hostname.startsWith('your-')
  } catch { return false }
}

export function evaluateFeishuDeployment(env = process.env, rootDir = process.cwd()) {
  const config = readFeishuConfig(env, rootDir)
  const checks = []
  const add = (id, status, message) => checks.push({ id, status, message })

  add('feishu_credentials', config.appId && config.appSecret ? 'pass' : 'fail',
    config.appId && config.appSecret ? '飞书 App ID / Secret 已配置' : '缺少飞书 App ID 或 App Secret')
  add('public_https', isPublicHttps(config.webBaseUrl) ? 'pass' : 'fail',
    isPublicHttps(config.webBaseUrl) ? '飞书主页与卡片链接使用公网 HTTPS' : 'FEISHU_WEB_BASE_URL 必须替换为公网 HTTPS 地址')
  add('qwen', config.qwenConfigured ? 'pass' : 'fail',
    config.qwenConfigured ? 'Qwen 服务端密钥已配置' : '缺少 DASHSCOPE_API_KEY / QWEN_API_KEY')
  add('paddle_ocr', config.paddleOcrUrl ? 'pass' : 'warn',
    config.paddleOcrUrl ? 'PaddleOCR 地址已配置，可处理 PDF / 图片' : '未配置 PaddleOCR；飞书文档主流程可运行，PDF / 图片入口不可用')
  add('paddle_ocr_auth', config.paddleOcrUrl && !config.paddleOcrApiKey ? 'fail' : config.paddleOcrApiKey ? 'pass' : 'warn',
    config.paddleOcrUrl && !config.paddleOcrApiKey ? '已配置 OCR 地址但缺少 PADDLE_OCR_API_KEY' : config.paddleOcrApiKey ? 'OCR sidecar 鉴权已启用' : '未启用 OCR sidecar')

  if (config.encryptKey) add('callback_security', 'pass', '事件回调已启用 Encrypt Key 验签与解密')
  else if (config.verificationToken) add('callback_security', 'warn', '事件回调只有 Verification Token，建议启用 Encrypt Key')
  else add('callback_security', 'fail', '事件回调缺少 Verification Token / Encrypt Key')

  add('production_auth', !config.devBypassAuth ? 'pass' : 'fail',
    !config.devBypassAuth ? '生产免登未启用绕过' : 'FEISHU_DEV_BYPASS_AUTH 必须为 false')
  add('real_ocr_only', !config.allowPreextractedOcr ? 'pass' : 'fail',
    !config.allowPreextractedOcr ? '比赛流程强制真实 OCR' : 'FEISHU_ALLOW_PREEXTRACTED_OCR 必须为 false')

  const bitableParts = [config.bitableAppToken, config.bitableTableId].filter(Boolean).length
  if (bitableParts === 2) add('bitable', 'pass', '多维表格写回已配置')
  else if (bitableParts === 1) add('bitable', 'fail', '多维表格配置不完整，App Token 与 Table ID 必须同时提供')
  else add('bitable', 'warn', '未配置多维表格，流程仍会写入飞书文档与消息卡片')

  const libraryTableCount = Object.values(config.bitableLibraryTables || {}).filter(Boolean).length
  let libraryTablesIsolated = true
  try { assertIsolatedLibraryTables(config.bitableLibraryTables || {}) } catch { libraryTablesIsolated = false }
  if (!libraryTablesIsolated) add('bitable_library', 'fail', '协作数据库配置串表：书籍、电影、音乐、照片必须使用四个不同的 Table ID')
  else if (config.bitableAppToken && libraryTableCount === 4) add('bitable_library', 'pass', '书籍、电影、音乐、照片四张独立协作数据表已配置')
  else if (libraryTableCount || config.bitableAppToken) add('bitable_library', 'fail', '协作数据库配置不完整：需要 App Token 与四个 Library Table ID')
  else add('bitable_library', 'warn', '未启用多维表格协作数据库，Data Pack 仍使用原有来源')

  if (libraryTableCount === 4 && config.bitableRefreshToken) add('bitable_auto_refresh', 'pass', '多维表格变更刷新 Webhook 已启用鉴权')
  else if (libraryTableCount === 4) add('bitable_auto_refresh', 'warn', '未配置刷新 Webhook token；仍可依靠启动、聚焦和定时检查自动同步')
  else add('bitable_auto_refresh', 'warn', '协作数据库未启用，无需配置变更刷新 Webhook')

  const ocrMaxBytes = Math.max(1024, Number(env.OCR_MAX_BYTES || 18 * 1024 * 1024))
  add('upload_limit', !config.paddleOcrUrl ? 'warn' : config.maxUploadBytes <= ocrMaxBytes ? 'pass' : 'fail',
    !config.paddleOcrUrl ? '未启用 PDF / 图片入口，无需校验 OCR 上传上限' : config.maxUploadBytes <= ocrMaxBytes ? '主服务与 OCR 上传上限兼容' : 'FEISHU_MAX_UPLOAD_BYTES 不能大于 OCR_MAX_BYTES')
  add('real_map', env.VITE_MAPBOX_TOKEN ? 'pass' : 'warn',
    env.VITE_MAPBOX_TOKEN ? '真实地图令牌将在构建期注入' : '未配置 Mapbox Token，将使用无外部依赖地图')

  return {
    ok: !checks.some((check) => check.status === 'fail'),
    checks,
    summary: {
      pass: checks.filter((check) => check.status === 'pass').length,
      warn: checks.filter((check) => check.status === 'warn').length,
      fail: checks.filter((check) => check.status === 'fail').length,
    },
  }
}
