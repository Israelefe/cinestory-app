export function createUploadConnection(onChange = () => {}) {
  let offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const waiters = new Set();
  const update = event => {
    offline = event.type === 'offline';
    onChange(offline);
    if (!offline) for (const resume of [...waiters]) resume();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
  }
  return {
    isOffline: () => offline,
    wait(signal) {
      if (signal?.aborted) return Promise.reject(signal.reason);
      if (!offline) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const finish = error => {
          waiters.delete(resume);
          signal?.removeEventListener('abort', abort);
          if (error) reject(error); else resolve();
        };
        const resume = () => finish();
        const abort = () => finish(signal.reason);
        waiters.add(resume);
        signal?.addEventListener('abort', abort, { once: true });
      });
    },
    dispose() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);
      }
      for (const resume of [...waiters]) resume();
    }
  };
}

export function waitForUploadRetry(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function uploadPermissionIsFresh(signature) {
  if (!signature?.expiresAt) return true;
  const expiry = Date.parse(signature.expiresAt);
  return Number.isFinite(expiry) && expiry - Date.now() > 60_000;
}
