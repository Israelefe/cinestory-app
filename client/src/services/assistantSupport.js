import { ASSISTANT_PAGES, ASSISTANT_STEPS, ASSISTANT_KINDS, contextLabel, trimActivity } from '../utils/assistantContext.mjs';
let draft;
export function clearAssistantSupportDraft() { draft = null; }
export function prepareAssistantSupport(context, { messages = [], ownerId = null } = {}) {
  const workflow = {};
  const source = context?.workflow || {};
  if (/^[a-f0-9]{24}$/i.test(source.deliveryId || '')) workflow.deliveryId = source.deliveryId;
  if (ASSISTANT_STEPS.includes(source.step)) workflow.step = source.step;
  if (ASSISTANT_KINDS.includes(source.kind)) workflow.kind = source.kind;
  for (const key of ['photoCount', 'failedUploads', 'uploadPercent']) if (Number.isInteger(source[key]) && source[key] >= 0) workflow[key] = Math.min(source[key], key === 'uploadPercent' ? 100 : 500);
  for (const key of ['uploading', 'unsaved', 'hasError', 'previewOpen', 'busy']) if (typeof source[key] === 'boolean') workflow[key] = source[key];
  const recent = trimActivity(context?.recent || []).map(({ page, event, at, step }) => ({ page, event, at, ...(ASSISTANT_STEPS.includes(step) ? { step } : {}) }));
  draft = {
    ownerId,
    createdAt: Date.now(), subject: context?.workflow?.failedUploads ? 'Upload problem' : context?.page === '/billing' ? 'Veylo Pro' : context?.page?.startsWith('/portfolio') ? 'Veylo Portfolio' : 'Delivery support',
    deliveryId: workflow.deliveryId,
    channel: 'assistant', context: context?.enabled === false || !Object.hasOwn(ASSISTANT_PAGES, context?.page || '') ? undefined : { page: context.page, capturedAt: Date.now(), workflow, recent },
    message: messages.filter(item => item.role === 'user' && !/^(?:send it|yes|please|contact support|message support)$/i.test(item.content.trim())).slice(-3).map(item => item.content).join('\n\n').slice(0, 3500) || `I need help in ${contextLabel(context)}.\n${context?.workflow?.failedUploads ? `The page reports ${context.workflow.failedUploads} failed uploads.\n` : ''}${context?.workflow?.hasError ? 'The page is showing an error.\n' : ''}\nWhat happened:\n\nWhat I expected:\n`
  };
  return consumeAssistantSupport(ownerId);
}
export function consumeAssistantSupport(ownerId = null) {
  const result = draft;
  return result && (!result.ownerId || String(result.ownerId) === String(ownerId)) && Date.now() - result.createdAt < 10 * 60 * 1000 ? { preparedAt: result.createdAt, subject: result.subject, deliveryId: result.deliveryId, message: result.message, channel: result.channel, context: result.context } : {};
}
