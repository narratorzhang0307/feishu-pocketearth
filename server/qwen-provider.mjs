const trimBase = (value) => String(value || '').replace(/\/$/, '')

export function createQwenProvider(env = process.env) {
  const base = trimBase(env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1')
  const nativeBase = trimBase(env.DASHSCOPE_NATIVE_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1')
  return {
    name: 'alibaba-model-studio',
    provider: 'Alibaba Cloud Model Studio',
    owner: 'Qwen',
    transport: 'dashscope-openai-compatible',
    key: env.DASHSCOPE_API_KEY || env.QWEN_API_KEY || '',
    url: `${base}/chat/completions`,
    nativeImageUrl: `${nativeBase}/services/aigc/multimodal-generation/generation`,
    model: env.QWEN_MODEL || 'qwen-plus',
    visionModel: env.QWEN_VISION_MODEL || 'qwen3-vl-plus',
    imageModel: env.QWEN_IMAGE_MODEL || 'qwen-image-2.0',
    searchModel: env.QWEN_SEARCH_MODEL || 'qwen3.5-plus',
    taskModels: {
      council: env.QWEN_MODEL_COUNCIL || 'qwen3.5-plus',
      narrative: env.QWEN_MODEL_NARRATIVE || 'qwen-plus',
      route: env.QWEN_MODEL_ROUTE || 'qwen-flash',
      multilingual: env.QWEN_MODEL_MULTILINGUAL || 'qwen-plus',
      default: env.QWEN_MODEL || 'qwen-plus',
    },
  }
}

export function qwenModelForTask(provider, task) {
  const name = String(task || 'default').trim().toLowerCase()
  if (provider.taskModels[name]) return provider.taskModels[name]
  if (name.startsWith('research-')) return provider.searchModel || provider.taskModels.default || provider.model
  if (name.includes('narrative')) return provider.taskModels.narrative || provider.taskModels.default || provider.model
  if (name.includes('multilingual')) return provider.taskModels.multilingual || provider.taskModels.default || provider.model
  if (name === 'route' || name.startsWith('mapping-') || name.endsWith('-route') || name.endsWith('-plan')) return provider.taskModels.route || provider.taskModels.default || provider.model
  if (name.startsWith('council-')) return provider.taskModels.council || provider.taskModels.default || provider.model
  return provider.taskModels.default || provider.model
}

export function buildQwenChatBody(provider, { prompt, system = '', task = 'default', json = false, stream = false, search = false, temperature } = {}) {
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: prompt || '' })
  return {
    model: qwenModelForTask(provider, task),
    messages,
    temperature: temperature ?? (json ? 0 : 0.65),
    stream,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    ...(search ? { enable_search: true, search_options: { forced_search: true, search_strategy: 'max' } } : {}),
  }
}

export function buildQwenImageBody(provider, prompt) {
  return {
    model: provider.imageModel,
    input: { messages: [{ role: 'user', content: [{ text: String(prompt || '').slice(0, 5200) }] }] },
    parameters: { prompt_extend: true, watermark: false, size: '1328*1328', n: 1 },
  }
}

export function readQwenImageUrl(data) {
  const content = data?.output?.choices?.[0]?.message?.content
  if (Array.isArray(content)) {
    const block = content.find((item) => typeof item?.image === 'string' || typeof item?.image_url === 'string')
    if (block) return block.image || block.image_url || ''
  }
  return data?.output?.results?.[0]?.url || ''
}
