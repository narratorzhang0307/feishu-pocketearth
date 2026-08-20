import { readFeishuConfig } from './config.mjs'

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
  add('paddle_ocr', config.paddleOcrUrl ? 'pass' : 'fail',
    config.paddleOcrUrl ? 'PaddleOCR 地址已配置' : '缺少 PADDLE_OCR_URL')
  add('paddle_ocr_auth', config.paddleOcrApiKey ? 'pass' : 'fail',
    config.paddleOcrApiKey ? 'OCR sidecar 鉴权已启用' : '缺少 PADDLE_OCR_API_KEY')

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

  const ocrMaxBytes = Math.max(1024, Number(env.OCR_MAX_BYTES || 18 * 1024 * 1024))
  add('upload_limit', config.maxUploadBytes <= ocrMaxBytes ? 'pass' : 'fail',
    config.maxUploadBytes <= ocrMaxBytes ? '主服务与 OCR 上传上限兼容' : 'FEISHU_MAX_UPLOAD_BYTES 不能大于 OCR_MAX_BYTES')
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
