import { createModelRequestScheduler } from './modelRequestScheduler.service.js';
import { modelBudget, providerBudgetObservation } from './modelBudget.service.js';
import { modelRequestContext } from './modelRequestContext.service.js';

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
export const GROQ_PROVIDER_NAME = 'Groq AI';
export const ALIBABA_PROVIDER_NAME = 'Alibaba Model Studio';
export const DEFAULT_GROQ_MODEL = 'qwen/qwen3.8-27b';
export const DEFAULT_GROQ_TEXT_MODEL = 'openai/gpt-oss-120b';
export const DEFAULT_ALIBABA_FALLBACK_MODEL = 'deepseek-v4.1-flash';
// Per delivery analysis batches, not a shared limit across AI features.
export const MAX_CONCURRENT_MODEL_REQUESTS = 5;
const scheduler = createModelRequestScheduler({ budget: modelBudget });
const setting = (name, fallback) => String(process.env[name] || fallback).trim() || fallback;
const groqKey = () => setting('GROQ_API_KEY', '');

function alibabaSettings() {
  const apiKey = setting('ALIBABA_MODEL_STUDIO_API_KEY', '');
  const workspaceId = setting('ALIBABA_WORKSPACE_ID', '');
  const baseUrl = setting('ALIBABA_BASE_URL', workspaceId ? 'https://' + workspaceId + '.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1' : '');
  if (!apiKey || !baseUrl) return null;
  let parsed;
  try { parsed = new URL(baseUrl); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !/\.(?:aliyuncs\.com|alibabacloud\.com)$/i.test(parsed.hostname)) return null;
  return { apiKey, endpoint: baseUrl.replace(/\/$/, '') + '/chat/completions' };
}

export function modelProviderState() {
  const primaryConfigured = Boolean(groqKey());
  const fallbackConfigured = Boolean(alibabaSettings());
  const primaryModel = setting('GROQ_VISION_MODEL', setting('GROQ_MODEL', DEFAULT_GROQ_MODEL));
  const textModel = setting('GROQ_TEXT_MODEL', DEFAULT_GROQ_TEXT_MODEL);
  const fallbackModel = setting('ALIBABA_FALLBACK_MODEL', DEFAULT_ALIBABA_FALLBACK_MODEL);
  return {
    provider: primaryConfigured || !fallbackConfigured ? GROQ_PROVIDER_NAME : ALIBABA_PROVIDER_NAME,
    configured: primaryConfigured || fallbackConfigured, primaryConfigured,
    model: !primaryConfigured && fallbackConfigured ? fallbackModel : primaryModel,
    primaryModel, visionModel: !primaryConfigured && fallbackConfigured ? fallbackModel : primaryModel,
    textModel: !primaryConfigured && fallbackConfigured ? fallbackModel : textModel,
    fallbackProvider: ALIBABA_PROVIDER_NAME, fallbackConfigured, fallbackModel
  };
}
export const anyModelProviderConfigured = () => modelProviderState().configured;
export const modelRequestQueueState = () => scheduler.snapshot();

export function requestContainsImages(body) {
  return (body.messages || []).some(message => Array.isArray(message.content) && message.content.some(part => part?.type === 'image_url'));
}

export function estimatedModelTokens(body) {
  let textBytes = 0, images = 0;
  for (const message of body.messages || []) {
    if (typeof message.content === 'string') textBytes += Buffer.byteLength(message.content);
    else for (const part of message.content || []) {
      if (part?.type === 'image_url') images++;
      else if (typeof part?.text === 'string') textBytes += Buffer.byteLength(part.text);
    }
  }
  return Math.ceil(textBytes / 3) + images * 2048 + Number(body.max_completion_tokens || body.max_tokens || 4000) + 128;
}

function bodyForProvider(body, provider) {
  const result = { ...body, model: provider.model };
  if (provider.name === GROQ_PROVIDER_NAME) {
    result.max_completion_tokens ??= result.max_tokens;
    delete result.max_tokens;
    delete result.enable_thinking;
    result.reasoning_effort = provider.model.startsWith('openai/gpt-oss-') ? 'low' : 'none';
    result.reasoning_format = 'hidden';
  }
  return result;
}

async function bufferedResponse(response) {
  const chunks = []; let size = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          throw Object.assign(new Error('The AI response was too large. Try a smaller batch.'), { code: 'AI_RESPONSE_TOO_LARGE' });
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
  }
  const content = Buffer.concat(chunks).toString('utf8');
  let usage;
  try { usage = JSON.parse(content).usage; } catch { /* Callers validate the response. */ }
  return { response: new Response([204, 205, 304].includes(response.status) ? null : content, { status: response.status, statusText: response.statusText, headers: response.headers }), usage };
}

/** Fair processing lanes; MongoDB shares provider allowance across processes. */
export async function requestModelCompletion(body, options = {}) {
  const context = modelRequestContext();
  const hasImages = requestContainsImages(body);
  const workload = options.workload || context.workload || (hasImages ? 'analysis' : 'writing');
  const state = modelProviderState();
  const providers = [];
  if (groqKey()) providers.push({ name: GROQ_PROVIDER_NAME, model: hasImages ? state.visionModel : state.textModel, apiKey: groqKey(), endpoint: GROQ_API_BASE + '/chat/completions' });
  const alibaba = alibabaSettings();
  if (alibaba) providers.push({ name: ALIBABA_PROVIDER_NAME, model: state.fallbackModel, ...alibaba });
  if (!providers.length) throw Object.assign(new Error('Configure Groq or Alibaba Model Studio to use Veylo AI.'), { code: 'AI_NOT_CONFIGURED' });
  const timeoutMs = Math.max(1, Math.min(600_000, Math.ceil(Number(options.timeoutMs) || 90_000)));
  const background = options.background ?? context.background ?? false;
  const signals = [options.signal, context.signal, !background && AbortSignal.timeout(timeoutMs)].filter(Boolean);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  for (let index = 0; index < providers.length; index++) {
    const provider = providers[index];
    try {
      while (true) {
        const response = await scheduler.run(async (_admission, entry) => {
          let original, usage;
          try {
            const transferSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean));
            original = await fetch(provider.endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + provider.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyForProvider(options.prepareBody ? options.prepareBody() : body, provider)), signal: transferSignal });
            const buffered = await bufferedResponse(original);
            usage = buffered.usage;
            return buffered.response;
          } finally {
            await modelBudget.finish(entry, original ? providerBudgetObservation(original, usage) : {});
          }
        }, { provider: provider.name, model: provider.model, workload, owner: options.ownerId || context.ownerId || 'unassigned', tokens: estimatedModelTokens(body), timeoutMs, signal,
          onWaiting: () => context.onWaiting?.(workload), onStarted: () => context.onStarted?.(workload) });
        // Cooldowns are waiting work, not failed creation attempts.
        if (response.status === 429 && background) continue;
        if (response.ok || response.status === 429 || index === providers.length - 1) return { response, provider: provider.name, model: provider.model, fallbackUsed: index > 0 };
        console.warn('[ai-provider] ' + provider.name + ' returned HTTP ' + response.status + '; trying ' + providers[index + 1].name + '.');
        break;
      }
    } catch (error) {
      if (signal?.aborted || index === providers.length - 1 || ['AI_REQUEST_TOO_LARGE', 'AI_SCHEDULER_UNAVAILABLE'].includes(error.code)) throw error;
      console.warn('[ai-provider] ' + provider.name + ' request failed (' + (error.name || 'network error') + '); trying ' + providers[index + 1].name + '.');
    }
  }
}
