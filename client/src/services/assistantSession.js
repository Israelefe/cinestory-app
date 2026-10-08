import { ASSISTANT_KINDS, ASSISTANT_STEPS, trimActivity, safeAssistantPage } from '../utils/assistantContext.mjs';

export function createAssistantSession() {
  let state = { page: '', workflow: {}, recent: [], capturedAt: Date.now(), revision: 0, enabled: true };
  const subscribers = new Set();
  let handlers = {};
  const publish = patch => { state = { ...state, ...patch, revision: state.revision + 1 }; subscribers.forEach(fn => fn()); };
  const record = (event, step) => ({ event, page: state.page, ...(ASSISTANT_STEPS.includes(step) ? { step } : {}), at: Date.now() });
  return {
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    getSnapshot: () => state,
    reset() { handlers = {}; publish({ page: '', workflow: {}, recent: [], enabled: true, capturedAt: Date.now() }); },
    route(page, deliveryId, kind) {
      page = safeAssistantPage(page);
      if (page === state.page && deliveryId === state.workflow.deliveryId && kind === state.workflow.kind) return;
      handlers = {};
      const workflow = { ...(ASSISTANT_KINDS.includes(kind) ? { kind } : {}), ...(/^[a-f0-9]{24}$/i.test(deliveryId || '') ? { deliveryId } : {}) };
      publish({ page, workflow, recent: state.enabled && page ? trimActivity([...state.recent, { event: 'page-opened', page, at: Date.now() }]) : [], capturedAt: Date.now() });
    },
    workflow(input, nextHandlers = {}) {
      const workflow = {};
      if (ASSISTANT_KINDS.includes(input.kind)) workflow.kind = input.kind;
      if (/^[a-f0-9]{24}$/i.test(input.deliveryId || '')) workflow.deliveryId = input.deliveryId;
      if (ASSISTANT_STEPS.includes(input.step)) workflow.step = input.step;
      for (const key of ['photoCount', 'failedUploads', 'uploadPercent']) if (Number.isInteger(input[key]) && input[key] >= 0) workflow[key] = Math.min(input[key], key === 'uploadPercent' ? 100 : 500);
      for (const key of ['uploading', 'unsaved', 'hasError', 'previewOpen', 'busy']) if (typeof input[key] === 'boolean') workflow[key] = input[key];
      handlers = nextHandlers;
      const old = state.workflow;
      if (JSON.stringify(old) === JSON.stringify(workflow)) return;
      const recent = trimActivity(state.recent);
      const event = workflow.step !== old.step ? 'step-opened' : workflow.uploading && !old.uploading ? 'upload-started' : workflow.failedUploads > (old.failedUploads || 0) ? 'upload-failed' : old.uploading && !workflow.uploading ? 'upload-ended' : workflow.unsaved && !old.unsaved ? 'draft-edited' : old.unsaved && !workflow.unsaved ? 'form-clean' : workflow.previewOpen && !old.previewOpen ? 'preview-opened' : workflow.hasError && !old.hasError ? 'request-failed' : '';
      if (event && state.enabled && state.page) recent.push(record(event, workflow.step));
      publish({ workflow, recent, capturedAt: Date.now() });
    },
    clear() { publish({ recent: [], capturedAt: Date.now() }); },
    setEnabled(enabled) { publish({ enabled, recent: [], capturedAt: Date.now() }); },
    requestContext() { return state.enabled && state.page ? { page: state.page, workflow: state.workflow, recent: trimActivity(state.recent), capturedAt: Date.now() } : undefined; },
    async apply(proposal) {
      if (!handlers[proposal.kind] || state.workflow.busy || (proposal.deliveryId && proposal.deliveryId !== state.workflow.deliveryId)) throw new Error('Open the matching draft and wait for the current step to finish.');
      const result = await handlers[proposal.kind](proposal);
      if (state.enabled && state.page) publish({ recent: trimActivity([...state.recent, record('writing-applied', state.workflow.step)]), capturedAt: Date.now() });
      return result;
    },
    canApply(kind) { return Boolean(handlers[kind]) && !state.workflow.busy; }
  };
}
