const QUOTA_CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

function providerConfig() {
  const apiKey = String(process.env.ALIBABA_MODEL_STUDIO_API_KEY || '').trim();
  const workspaceId = String(process.env.ALIBABA_WORKSPACE_ID || '').trim();
  const configuredBase = String(process.env.ALIBABA_BASE_URL || '').trim();
  const baseUrl = configuredBase || (workspaceId ? `https://${workspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` : '');
  if (!apiKey || !baseUrl) return null;
  let parsed;
  try { parsed = new URL(baseUrl); } catch { return null; }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.aliyuncs.com')) return null;
  parsed.pathname = parsed.pathname.replace(/\/compatible-mode\/v1\/?$/, '').replace(/\/$/, '');
  return { apiKey, quotaUrl: `${parsed.toString().replace(/\/$/, '')}/api/v1/quotas` };
}

function normalizeQuota(record) {
  if (!record || typeof record !== 'object') return null;
  const account = record.model_limit || {};
  const workspace = record.workspace_limit || {};
  const numberOrNull = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const workspaceRequestLimit = numberOrNull(workspace.request_limit);
  const accountRequestLimit = numberOrNull(account.request_limit);
  const workspaceRequestPeriod = numberOrNull(workspace.request_limit_period);
  const accountRequestPeriod = numberOrNull(account.request_limit_period);
  const workspaceTokenLimit = numberOrNull(workspace.usage_limit);
  const accountTokenLimit = numberOrNull(account.usage_limit);
  const workspaceTokenPeriod = numberOrNull(workspace.usage_limit_period);
  const accountTokenPeriod = numberOrNull(account.usage_limit_period);
  const workspaceQueueLimit = numberOrNull(workspace.async_user_queue_limit);
  const accountQueueLimit = numberOrNull(account.async_user_queue_limit);
  const workspaceConcurrencyLimit = numberOrNull(workspace.async_user_concurrency_limit);
  const accountConcurrencyLimit = numberOrNull(account.async_user_concurrency_limit);
  return {
    model: String(record.model || ''),
    workspaceId: String(record.workspace_id || ''),
    account,
    workspace,
    requestLimit: workspaceRequestLimit ?? accountRequestLimit,
    requestPeriodSeconds: workspaceRequestPeriod ?? accountRequestPeriod,
    tokenLimit: workspaceTokenLimit ?? accountTokenLimit,
    tokenPeriodSeconds: workspaceTokenPeriod ?? accountTokenPeriod,
    queueLimit: workspaceQueueLimit ?? accountQueueLimit,
    concurrencyLimit: workspaceConcurrencyLimit ?? accountConcurrencyLimit,
    fetchedAt: new Date().toISOString()
  };
}

export async function fetchAlibabaQuota(model, { force = false } = {}) {
  const modelId = String(model || '').trim();
  if (!modelId) return null;
  const cached = cache.get(modelId);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const provider = providerConfig();
  if (!provider) return null;
  try {
    const url = new URL(provider.quotaUrl);
    url.searchParams.set('model', modelId);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    const record = Array.isArray(payload?.output?.quotas) ? payload.output.quotas.find(item => item?.model === modelId) || payload.output.quotas[0] : null;
    const value = normalizeQuota(record);
    if (value) cache.set(modelId, { value, expiresAt: Date.now() + QUOTA_CACHE_MS });
    return value;
  } catch (error) {
    // Quota discovery is a safety hint, never a reason to stop an otherwise
    // healthy delivery worker. The worker keeps its conservative defaults.
    return null;
  }
}

export async function fetchAlibabaQuotas(models = [], options = {}) {
  const uniqueModels = [...new Set(models.map(model => String(model || '').trim()).filter(Boolean))];
  const entries = await Promise.all(uniqueModels.map(async model => [model, await fetchAlibabaQuota(model, options)]));
  return Object.fromEntries(entries.filter(([, value]) => value));
}
