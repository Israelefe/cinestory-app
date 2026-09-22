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

export function safeMessages(messages) {
  // Validate and sanitize multi-turn conversation history.
  // Preserves alternating user and assistant turns ending with the user's latest question.
  // This ensures the model has clear context that earlier questions were already answered,
  // preventing it from re-answering or packing all previous questions into each new reply.
  if (!Array.isArray(messages) || !messages.length) return [];

  const valid = messages
    .filter(message => ['user', 'assistant'].includes(message?.role) && typeof message?.content === 'string')
    .map(message => ({
      role: message.role,
      content: message.content.trim().slice(0, 3000)
    }))
    .filter(message => message.content.length > 0);

  if (!valid.length) return [];

  // The conversation sent to the model must end with the user's current question
  const lastUserIndex = valid.map(m => m.role).lastIndexOf('user');
  if (lastUserIndex === -1) return [];
  const trimmed = valid.slice(0, lastUserIndex + 1);

  // Reconstruct alternating turns backwards from the latest user message
  const history = [];
  let expectedRole = 'user';
  for (let i = trimmed.length - 1; i >= 0 && history.length < 8; i--) {
    const item = trimmed[i];
    if (item.role === expectedRole) {
      history.unshift(item);
      expectedRole = expectedRole === 'user' ? 'assistant' : 'user';
    }
  }

  // Ensure history starts with a user turn
  while (history.length && history[0].role !== 'user') {
    history.shift();
  }

  // Enforce total character budget (max 12,000 characters)
  let totalLength = history.reduce((sum, item) => sum + item.content.length, 0);
  while (totalLength > 12_000 && history.length > 1) {
    const removed = history.shift();
    totalLength -= removed.content.length;
    if (history.length && history[0].role !== 'user') {
      const extra = history.shift();
      totalLength -= extra.content.length;
    }
  }

  return history;
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
