export const MAX_DELIVERY_PHOTO_UPLOADS = 10;
export const PHOTO_UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const SAMPLE_MS = 25_000;
const STALL_MS = 45_000;
const RECOVERY_MS = 60_000;
const FAILURE_COOLDOWN_MS = 5_000;

// Only byte progress from actual R2 transfers is measured here. Time spent
// requesting permission or adding a photo to a delivery is not a network stall.
export function createAdaptivePhotoUpload({ maxConcurrent = 10, now = () => performance.now(), onChange = () => {} } = {}) {
  const maximum = Math.max(1, Math.min(MAX_DELIVERY_PHOTO_UPLOADS, Math.floor(Number(maxConcurrent) || 2)));
  let limit = Math.min(6, maximum);
  let offline = false;
  let reason = '';
  let transferred = 0;
  let recoveryUntil = 0;
  let lastReduction = -Infinity;
  let trial = null;
  let sample = { at: now(), bytes: 0, saturated: false };
  const transfers = new Map();

  function state() {
    return { limit, maximum, offline, reason, activeTransfers: transfers.size };
  }
  function emit() { onChange(state()); }
  function resetSample() { sample = { at: now(), bytes: transferred, saturated: false }; }
  function setLimit(next, nextReason = '') {
    limit = Math.max(1, Math.min(maximum, next));
    reason = nextReason;
    resetSample();
    emit();
  }
  function reduce(nextReason) {
    const at = now();
    if (offline || at - lastReduction < FAILURE_COOLDOWN_MS) return;
    lastReduction = at;
    recoveryUntil = at + RECOVERY_MS;
    trial = null;
    setLimit(limit > 3 ? 3 : Math.min(2, limit), nextReason);
  }

  return {
    state,
    start(index, size) {
      transfers.set(index, { size, loaded: 0, startedAt: now(), lastProgressAt: now() });
      if (transfers.size >= limit) sample.saturated = true;
      emit();
    },
    progress(index, loaded) {
      const transfer = transfers.get(index);
      if (!transfer) return;
      const value = Math.max(transfer.loaded, Math.min(transfer.size, Number(loaded) || 0));
      if (value > transfer.loaded) {
        transferred += value - transfer.loaded;
        transfer.loaded = value;
        transfer.lastProgressAt = now();
      }
      if (transfers.size >= limit) sample.saturated = true;
    },
    finish(index) { transfers.delete(index); emit(); },
    failure(kind) { reduce(kind === 'busy' ? 'busy' : 'connection'); },
    setOffline(value) {
      if (offline === Boolean(value)) return;
      offline = Boolean(value);
      trial = null;
      if (offline) {
        resetSample(); emit();
      } else {
        recoveryUntil = now() + RECOVERY_MS;
        setLimit(Math.min(3, limit), 'connection');
        // Discard offline time when estimating remaining upload time.
        for (const transfer of transfers.values()) {
          transfer.startedAt = now(); transfer.lastProgressAt = now(); transfer.estimateLoaded = transfer.loaded;
        }
      }
    },
    tick({ queued = 0 } = {}) {
      if (offline) return;
      const at = now();
      const unfinished = [...transfers.values()].filter(transfer => transfer.loaded < transfer.size);
      const struggling = unfinished.some(transfer => {
        if (at - transfer.lastProgressAt >= STALL_MS) return true;
        const elapsed = at - transfer.startedAt;
        const sent = transfer.loaded - (transfer.estimateLoaded || 0);
        const rate = sent / Math.max(1, elapsed);
        return elapsed >= 60_000 && rate > 0 && (transfer.size - transfer.loaded) / rate > PHOTO_UPLOAD_TIMEOUT_MS * 0.75;
      });
      if (struggling) { reduce('slow'); return; }
      const elapsed = at - sample.at;
      if (elapsed < SAMPLE_MS) return;
      const rate = (transferred - sample.bytes) / elapsed;
      const saturated = sample.saturated;
      resetSample();
      // A quiet queue or a single remaining large file cannot show whether
      // more parallel transfers would improve the overall batch speed.
      if (queued < 2 || !saturated || rate <= 0 || at < recoveryUntil) return;
      if (trial) {
        const previous = trial;
        trial = null;
        if (rate < previous.rate * 1.1) {
          recoveryUntil = at + RECOVERY_MS;
          setLimit(previous.limit, previous.reason);
          return;
        }
      }
      if (limit >= maximum) return;
      const next = limit < 3 ? 3 : limit < 6 ? 6 : limit < 8 ? 8 : 10;
      trial = { limit, rate, reason };
      setLimit(Math.min(next, maximum), next >= 6 ? '' : reason);
    }
  };
}

// Changing the limit affects admission to the queue, never an active transfer.
export function runPhotoUploadQueue(count, { controller, task, onFinish = () => {} }) {
  let cursor = 0;
  let active = 0;
  let stopped = false;
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  function pump() {
    if (active === 0 && (cursor >= count || stopped)) { resolveDone(); return; }
    while (!stopped && !controller.state().offline && active < controller.state().limit && cursor < count) {
      const index = cursor++;
      active++;
      Promise.resolve().then(() => task(index)).finally(() => {
        active--; onFinish(index); pump();
      }).catch(() => { /* The task records its outcome before settling. */ });
    }
  }
  return {
    done, pump,
    queued: () => count - cursor,
    active: () => active,
    stop() { stopped = true; pump(); }
  };
}

// Retries already belong to an admitted task. They still need a free transfer
// slot, particularly when six waiting tasks resume after the limit fell to three.
export function createPhotoTransferSlots(readState) {
  let active = 0;
  const waiting = [];
  function pump() {
    const state = readState();
    while (!state.offline && active < state.limit && waiting.length) {
      const waiter = waiting.shift();
      waiter.signal?.removeEventListener('abort', waiter.abort);
      active++;
      let released = false;
      waiter.resolve(() => {
        if (released) return;
        released = true; active--; pump();
      });
    }
  }
  return {
    pump,
    acquire(signal) {
      if (signal?.aborted) return Promise.reject(signal.reason);
      return new Promise((resolve, reject) => {
        const waiter = { resolve, signal };
        waiter.abort = () => { waiting.splice(waiting.indexOf(waiter), 1); reject(signal.reason); };
        waiting.push(waiter);
        signal?.addEventListener('abort', waiter.abort, { once: true });
        pump();
      });
    }
  };
}
