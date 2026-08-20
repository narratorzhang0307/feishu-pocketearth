// Google-first provider selection shared by the daily knowledge worker.
// Official Gemini API is preferred; GMI is accepted only as a transport for
// Google-owned Gemini model ids so the verification model family stays honest.

const directModel = (value, fallback) => value && value.startsWith('gemini-') ? value : fallback
const gmiModel = (value, fallback) => value && value.startsWith('google/gemini-') ? value : fallback

export function getGoogleKnowledgeProviders(env = process.env) {
  const providers = []
  if (env.GEMINI_API_KEY) {
    const baseUrl = env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai'
    providers.push({
      name: 'google-gemini-api',
      owner: 'Google',
      transport: 'google-gemini-api',
      url: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      key: env.GEMINI_API_KEY,
      model: directModel(env.GEMINI_MODEL_KNOWLEDGE || env.GEMINI_MODEL, 'gemini-3.5-flash'),
    })
  }
  if (env.GMI_API_KEY) {
    const baseUrl = env.GMI_BASE_URL || 'https://api.gmi-serving.com/v1'
    providers.push({
      name: 'gmi-google-fallback',
      owner: 'Google',
      transport: 'gmi-inference-engine',
      url: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      key: env.GMI_API_KEY,
      model: gmiModel(env.GMI_MODEL_KNOWLEDGE || env.GMI_MODEL, 'google/gemini-3.5-flash'),
    })
  }
  return providers
}

export function buildGoogleKnowledgeRequest(provider, { messages, json = true } = {}) {
  if (!provider?.key || !provider?.url || !provider?.model) throw new Error('knowledge_provider_invalid')
  const validModel = provider.transport === 'google-gemini-api'
    ? provider.model.startsWith('gemini-')
    : provider.model.startsWith('google/gemini-')
  if (!validModel) throw new Error(`knowledge_google_model_required:${provider.model}`)
  return {
    url: provider.url,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
    body: {
      model: provider.model,
      messages,
      temperature: json ? 0 : 0.4,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    },
  }
}
