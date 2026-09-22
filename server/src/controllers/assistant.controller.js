import { z } from 'zod';
import User from '../models/User.js';
import { answerVeyloQuestion, REFUSAL } from '../services/alibabaAssistant.service.js';
import { assistantSuggestedQuestions } from '../knowledge/veyloAssistantKnowledge.js';
import { isRuntimeFeatureEnabled } from '../services/runtimeConfig.service.js';
import { resolveEntitlements } from '../services/entitlement.service.js';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(3000)
}).strict();

const chatSchema = z.object({
  surface: z.enum(['public', 'studio', 'delivery']).default('public'),
  messages: z.array(messageSchema).min(1).max(20)
}).strict();

function safeMessages(messages) {
  // The browser owns its display history and can therefore not be trusted to
  // label text as an assistant instruction. Only user turns are sent back to
  // the model; the server-generated answer is always the latest turn.
  const userTurns = messages.filter(message => message.role === 'user').slice(-8);
  const total = userTurns.reduce((sum, message) => sum + message.content.length, 0);
  if (total <= 12_000) return userTurns;
  let remaining = 12_000;
  return userTurns.reverse().map(message => {
    if (remaining <= 0) return null;
    const content = message.content.slice(-remaining);
    remaining -= content.length;
    return { role: 'user', content };
  }).filter(Boolean).reverse();
}

async function safeAccountContext(req) {
  if (!req.user?.id) return '';
  const user = await User.findById(req.user.id).select('plan planOverride proRetentionUntil onboardingCompletedAt').lean();
  if (!user) return '';
  const entitlements = await resolveEntitlements(user, { includeUsage: false });
  const available = Object.entries(entitlements.features || {}).filter(([, enabled]) => enabled === true).map(([name]) => name).slice(0, 12).join(', ');
  return `Signed-in studio account. Current plan: ${entitlements.planName}. Onboarding complete: ${user.onboardingCompletedAt ? 'yes' : 'no'}. Available product features: ${available || 'standard Veylo delivery features'}.`;
}

export async function chatWithVeyloAssistant(req, res) {
  if (!await isRuntimeFeatureEnabled('veyloAssistant', true)) return res.status(404).json({ success: false, code: 'ASSISTANT_DISABLED', message: 'Veylo Help is not available right now.' });
  const parsed = chatSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ success: false, code: 'ASSISTANT_INPUT_INVALID', message: 'Please send a shorter Veylo question.' });
  const messages = safeMessages(parsed.data.messages);
  if (!messages.length) return res.status(400).json({ success: false, code: 'ASSISTANT_INPUT_INVALID', message: 'Please ask a Veylo question.' });
  try {
    let safeContext = '';
    if (parsed.data.surface !== 'delivery') {
      try { safeContext = await safeAccountContext(req); } catch { safeContext = ''; }
    }
    const data = await answerVeyloQuestion({
      messages,
      surface: parsed.data.surface,
      authenticated: Boolean(req.user?.id),
      safeContext
    });
    return res.json({ success: true, data });
  } catch (error) {
    // Never send provider messages, model names, request payloads, or stack
    // traces to the browser. The client only needs a useful next step.
    if (error.code === 'ASSISTANT_UNSAFE_OUTPUT') {
      return res.json({ success: true, data: { answer: REFUSAL, topics: [], suggestions: assistantSuggestedQuestions(parsed.data.surface) } });
    }
    if (process.env.NODE_ENV !== 'test') console.error('[assistant/chat]', error.code || 'ASSISTANT_FAILED', error.providerStatus || '');
    const status = error.code === 'ASSISTANT_PROVIDER_BUSY' ? 503 : error.code === 'ASSISTANT_NOT_CONFIGURED' ? 503 : 502;
    return res.status(status).json({ success: false, code: error.code || 'ASSISTANT_FAILED', message: 'Veylo Help is temporarily unavailable. You can try again or contact Veylo support.' });
  }
}
