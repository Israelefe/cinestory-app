import { ASSISTANT_PAGES, contextLabel, trimActivity } from '../utils/assistantContext.mjs';
let draft;
export function clearAssistantSupportDraft() { draft = null; }
export function prepareAssistantSupport(context) {
  const recent = trimActivity(context?.recent || []).slice(-5).map(item => `${ASSISTANT_PAGES[item.page]}: ${item.event.replaceAll('-', ' ')}`).join('\n');
  draft = {
    createdAt: Date.now(), subject: context?.workflow?.failedUploads ? 'Upload problem' : context?.page === '/billing' ? 'Veylo Pro' : context?.page?.startsWith('/portfolio') ? 'Veylo Portfolio' : 'Delivery support',
    deliveryPublicId: context?.workflow?.deliveryId || '',
    message: `I need help in ${contextLabel(context)}.\n${context?.workflow?.failedUploads ? `The page reports ${context.workflow.failedUploads} failed uploads.\n` : ''}${context?.workflow?.hasError ? 'The page is showing an error.\n' : ''}${recent ? `\nRecent steps in this tab:\n${recent}\n` : ''}\nWhat happened:\n\nWhat I expected:\n`
  };
}
export function consumeAssistantSupport() {
  const result = draft;
  return result && Date.now() - result.createdAt < 10 * 60 * 1000 ? { subject: result.subject, deliveryPublicId: result.deliveryPublicId, message: result.message } : {};
}
