import { AsyncLocalStorage } from 'node:async_hooks';

const contexts = new AsyncLocalStorage();

export function withModelRequestContext(context, task) {
  return contexts.run({ ...contexts.getStore(), ...context }, task);
}

export function modelRequestContext() {
  const context = contexts.getStore() || {};
  return { ...context, ownerId: context.ownerId || context.readOwner?.() };
}

export function modelRequestContextMiddleware(req, res, next) {
  const controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(new Error('The request was cancelled.')); };
  res.once('close', abort);
  withModelRequestContext({ readOwner: () => req.user?.id, background: false, signal: controller.signal }, next);
}
