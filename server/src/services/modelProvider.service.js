const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
export const GROQ_PROVIDER_NAME = 'Groq AI';
export const ALIBABA_PROVIDER_NAME = 'Alibaba Model Studio';
export const DEFAULT_GROQ_MODEL = 'qwen/qwen3.8-27b';
export const DEFAULT_ALIBABA_FALLBACK_MODEL = 'deepseek-v4.1-flash';

function groqKey() {
  return String(process.env.GROQ_API_KEY || '').trim();
}

function alibabaSettings() {
  const apiKey = String(process.env.ALIBABA_MODEL_STUDIO_API_KEY || '').trim();
  const workspaceId = String(process.env.ALIBABA_WORKSPACE_ID || '').trim();
  const configuredBase = String(process.env.ALIBABA_BASE_URL || '').trim();
  const baseUrl = configuredBase || (workspaceId ? 'https://' + workspaceId + '.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1' : '');
  if (!apiKey || !baseUrl) return null;

  let parsed;
  try { parsed = new URL(baseUrl); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !/\.(?:aliyuncs\.com|alibabacloud\.com)$/i.test(parsed.hostname)) return null;
  return { apiKey, endpoint: baseUrl.replace(/\/$/, '') + '/chat/completions' };
}

export function modelProviderState() {
  const groqConfigured = Boolean(groqKey());
  const fallbackConfigured = Boolean(alibabaSettings());
  const groqModel = String(process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim() || DEFAULT_GROQ_MODEL;
  const fallbackModel = String(process.env.ALIBABA_FALLBACK_MODEL || DEFAULT_ALIBABA_FALLBACK_MODEL).trim() || DEFAULT_ALIBABA_FALLBACK_MODEL;
  return {
    provider: groqConfigured ? GROQ_PROVIDER_NAME : fallbackConfigured ? ALIBABA_PROVIDER_NAME : GROQ_PROVIDER_NAME,
    configured: groqConfigured || fallbackConfigured,
    primaryConfigured: groqConfigured,
    model: groqConfigured ? groqModel : fallbackConfigured ? fallbackModel : groqModel,
    primaryModel: groqModel,
    fallbackProvider: ALIBABA_PROVIDER_NAME,
    fallbackConfigured,
    fallbackModel
  };
}

export function anyModelProviderConfigured() {
  return modelProviderState().configured;
}

function requestSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function wasCallerCancelled(signal) {
  return Boolean(signal?.aborted && signal.reason?.name !== 'TimeoutError');
}

function bodyForProvider(body, provider) {
  const requestBody = { ...body, model: provider.model };
  if (provider.name === GROQ_PROVIDER_NAME) {
    if (requestBody.max_tokens !== undefined && requestBody.max_completion_tokens === undefined) {
      requestBody.max_completion_tokens = requestBody.max_tokens;
    }
    delete requestBody.max_tokens;
    delete requestBody.enable_thinking;
    requestBody.reasoning_effort = 'none';
    requestBody.reasoning_format = 'hidden';
  }
  return requestBody;
}

function providerCandidates(fallbackModel) {
  const providers = [];
  const key = groqKey();
  if (key) providers.push({
    name: GROQ_PROVIDER_NAME,
    apiKey: key,
    endpoint: GROQ_API_BASE + '/chat/completions',
    model: String(process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim() || DEFAULT_GROQ_MODEL
  });

  const alibaba = alibabaSettings();
  if (alibaba) providers.push({
    name: ALIBABA_PROVIDER_NAME,
    ...alibaba,
    model: String(process.env.ALIBABA_FALLBACK_MODEL || DEFAULT_ALIBABA_FALLBACK_MODEL).trim() || DEFAULT_ALIBABA_FALLBACK_MODEL
  });
  return providers;
}

/**
 * Send a chat completion to Groq first, then Model Studio if Groq is missing
 * or rejects/fails the request. Provider keys stay server-side.
 */
export async function requestModelCompletion(body, { fallbackModel, timeoutMs = 90_000, signal } = {}) {
  const providers = providerCandidates(fallbackModel);
  if (!providers.length) {
    throw Object.assign(new Error('Configure Groq or Alibaba Model Studio to use Veylo AI.'), { code: 'AI_NOT_CONFIGURED' });
  }

  let lastResponse = null;
  let lastProvider = null;
  let lastProviderIndex = -1;
  let lastThrown = null;
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    lastProvider = provider;
    lastProviderIndex = index;
    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + provider.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyForProvider(body, provider)),
        signal: requestSignal(signal, timeoutMs)
      });
      lastResponse = response;
      lastThrown = null;
      if (response.ok || index === providers.length - 1) {
        return { response, provider: provider.name, model: provider.model, fallbackUsed: index > 0 };
      }
      try { await response.body?.cancel?.(); } catch { /* Continue to the configured fallback. */ }
      console.warn('[ai-provider] ' + provider.name + ' returned HTTP ' + response.status + '; trying ' + providers[index + 1].name + '.');
    } catch (error) {
      if (wasCallerCancelled(signal)) throw error;
      lastThrown = error;
      if (index === providers.length - 1) throw error;
      console.warn('[ai-provider] ' + provider.name + ' request failed (' + (error.name || 'network error') + '); trying ' + providers[index + 1].name + '.');
    }
  }

  if (lastResponse) return { response: lastResponse, provider: lastProvider.name, model: lastProvider.model, fallbackUsed: lastProviderIndex > 0 };
  throw lastThrown || Object.assign(new Error('The configured AI providers could not complete this request.'), { code: 'AI_PROVIDER_FAILED' });
}
