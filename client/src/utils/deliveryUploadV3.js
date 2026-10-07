import api from '../services/api.js';
import { uploadR2Object } from './r2Upload.js';
import { createAdaptivePhotoUpload, createPhotoTransferSlots, runPhotoUploadQueue } from './adaptivePhotoUpload.js';
import { createUploadConnection, uploadPermissionIsFresh, waitForUploadRetry } from './uploadConnection.js';

function uploadErrorMessage(error) {
  return String(error?.response?.data?.message || error?.message || 'The upload could not be completed.').trim().slice(0, 180);
}

function readPendingUploads(deliveryId) {
  try {
    const value = JSON.parse(sessionStorage.getItem(`delivery-upload-v3:${deliveryId}`) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function storePendingUploads(deliveryId, uploads) {
  try {
    const key = `delivery-upload-v3:${deliveryId}`;
    if (Object.keys(uploads).length) sessionStorage.setItem(key, JSON.stringify(uploads));
    else sessionStorage.removeItem(key);
  } catch { /* Uploads can continue when browser storage is unavailable. */ }
}

function fatalUploadError(error) {
  const code = error?.response?.data?.code || error?.code || '';
  return code.startsWith('DELIVERY_IMAGE_WORKER_') || ['AUTH_REQUIRED', 'SESSION_EXPIRED', 'CSRF_INVALID', 'EMAIL_NOT_VERIFIED', 'R2_NOT_CONFIGURED'].includes(code);
}

function retryable(error) {
  const status = Number(error?.response?.status || error?.status || 0);
  if (error?.code === 'UPLOAD_CANCELLED') return false;
  return !status || status === 408 || status === 429 || status >= 500;
}

export async function uploadDeliveryPhotosV3(deliveryId, files, onProgress = () => {}) {
  const outcomes = new Array(files.length);
  const loaded = files.map(() => 0);
  const lastReports = files.map(() => -Infinity);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0) || 1;
  const pendingUploads = readPendingUploads(deliveryId);
  const occurrences = new Map();
  const fileKeys = files.map(file => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    const occurrence = occurrences.get(key) || 0;
    occurrences.set(key, occurrence + 1);
    return occurrence ? `${key}:duplicate:${occurrence}` : key;
  });
  const records = fileKeys.map(key => {
    const saved = Object.hasOwn(pendingUploads, key) ? pendingUploads[key] : null;
    const record = saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.uploadId)
      ? { uploadId: saved.uploadId, attempted: Boolean(saved.attempted) }
      : { uploadId: crypto.randomUUID(), attempted: false };
    pendingUploads[key] = record;
    return record;
  });
  let completed = 0;
  let highestPercent = 0;
  let initialSignature;
  let controller;
  let transferSlots;
  let queue;
  let timer;
  let fatalError;
  const stopWaiting = new AbortController();

  function batch() {
    const state = controller?.state() || { limit: 6, offline: false, reason: '', activeTransfers: 0 };
    return { ...state, completed, total: files.length };
  }
  function report(index, amount, status, details = {}) {
    if (index !== undefined) loaded[index] = Math.max(0, Math.min(files[index].size, amount));
    const percent = Math.round(loaded.reduce((sum, bytes) => sum + bytes, 0) / totalBytes * 100);
    highestPercent = Math.max(highestPercent, Math.min(completed === files.length ? 100 : 99, percent));
    if (index !== undefined && status === 'uploading') {
      const at = performance.now();
      if (at - lastReports[index] < 200) return;
      lastReports[index] = at;
    }
    onProgress(highestPercent, {
      ...(index !== undefined ? { index, file: files[index], loaded: loaded[index], total: files[index].size } : {}),
      status, completed, count: files.length, batch: batch(), ...details
    });
  }
  const onConnectionChange = () => { report(undefined, 0, 'connection'); transferSlots?.pump(); queue?.pump(); };
  const connection = createUploadConnection(value => { controller?.setOffline(value); });
  controller = createAdaptivePhotoUpload({ maxConcurrent: 2, onChange: onConnectionChange });
  controller.setOffline(connection.isOffline());

  function finish(index, asset, error) {
    outcomes[index] = asset ? { file: files[index], asset } : { file: files[index], error };
    if (asset) {
      completed++;
      delete pendingUploads[fileKeys[index]];
      storePendingUploads(deliveryId, pendingUploads);
      report(index, files[index].size, 'complete');
    } else report(index, 0, 'failed', { error: uploadErrorMessage(error) });
  }
  function stopBatch(error) {
    if (fatalError) return;
    fatalError = error;
    stopWaiting.abort(error);
    queue?.stop();
  }
  const sign = index => api.post(`/v1/deliveries/${deliveryId}/uploads/sign`, { uploadId: records[index].uploadId, contentType: files[index].type });

  async function uploadPhoto(index) {
    const file = files[index];
    const record = records[index];
    let attempt = 0;
    let lastError;
    while (attempt < 3) {
      let stage = 'preparing';
      try {
        await connection.wait(stopWaiting.signal);
        report(index, loaded[index], attempt ? 'retrying' : 'starting', { attempt: attempt + 1, ...(lastError ? { error: uploadErrorMessage(lastError) } : {}) });
        let payload;
        let signature;
        if (record.attempted || attempt) {
          const recovered = (await api.post(`/v1/deliveries/${deliveryId}/uploads/recover`, { uploadId: record.uploadId, contentType: file.type })).data.data;
          if (recovered.asset) { finish(index, recovered.asset); return; }
          payload = recovered.uploaded;
          signature = recovered.signature;
        } else signature = index === 0 && initialSignature ? initialSignature : (await sign(index)).data.data;
        await connection.wait(stopWaiting.signal);
        if (!payload) {
          const releaseSlot = await transferSlots.acquire(stopWaiting.signal);
          try {
            await connection.wait(stopWaiting.signal);
            if (!uploadPermissionIsFresh(signature)) signature = (await sign(index)).data.data;
            record.attempted = true;
            storePendingUploads(deliveryId, pendingUploads);
            stage = 'transferring';
            controller.start(index, file.size);
            payload = await uploadR2Object(signature, file, amount => {
              controller.progress(index, amount);
              report(index, Math.min(amount, file.size * .98), 'uploading');
            });
          } finally { controller.finish(index); releaseSlot(); }
        }
        stage = 'saving';
        report(index, file.size * .98, 'saving');
        // Recovery refreshes permission without another PUT when the device
        // was offline after a completed transfer and its token has expired.
        await connection.wait(stopWaiting.signal);
        if (!uploadPermissionIsFresh(signature)) {
          const recovered = (await api.post(`/v1/deliveries/${deliveryId}/uploads/recover`, { uploadId: record.uploadId, contentType: file.type })).data.data;
          if (recovered.asset) { finish(index, recovered.asset); return; }
          signature = recovered.signature;
        }
        const confirmed = await api.post(`/v1/deliveries/${deliveryId}/uploads/confirm`, {
          objectKey: payload.objectKey || payload.public_id || signature.objectKey,
          uploadToken: signature.uploadToken, resourceType: 'image', originalFilename: file.name, uploadId: record.uploadId
        });
        finish(index, confirmed.data.data);
        return;
      } catch (error) {
        lastError = error;
        if (fatalUploadError(error)) stopBatch(error);
        if (fatalError) { finish(index, null, fatalError); return; }
        if (connection.isOffline()) {
          report(index, loaded[index], 'waiting');
          // An offline interval does not spend an attempt or discard progress.
          await connection.wait(stopWaiting.signal).catch(() => {});
          continue;
        }
        const status = Number(error?.response?.status || error?.status || 0);
        if (status === 429) controller.failure('busy');
        else if (stage === 'transferring' && ['UPLOAD_CONNECTION_INTERRUPTED', 'UPLOAD_TIMED_OUT'].includes(error?.code)) controller.failure('connection');
        attempt++;
        if (attempt >= 3 || !retryable(error)) { finish(index, null, error); return; }
        report(index, loaded[index], 'retrying', { attempt: attempt + 1, error: uploadErrorMessage(error) });
        await waitForUploadRetry(2_000 * 2 ** (attempt - 1), stopWaiting.signal).catch(() => {});
      }
    }
  }

  try {
    if (!files.length) return { errors: [], successfulAssets: [], completed: 0, total: 0 };
    report(0, 0, 'starting', { attempt: 1 });
    while (!initialSignature) {
      await connection.wait();
      try { initialSignature = (await sign(0)).data.data; }
      catch (error) {
        if (connection.isOffline()) continue;
        if (error.response?.status === 503 || fatalUploadError(error)) throw error;
        break; // Individual retry/recovery still handles lost setup responses.
      }
    }
    controller = createAdaptivePhotoUpload({ maxConcurrent: initialSignature?.maxConcurrentUploads || 2, onChange: onConnectionChange });
    controller.setOffline(connection.isOffline());
    transferSlots = createPhotoTransferSlots(() => controller.state());
    queue = runPhotoUploadQueue(files.length, { controller, task: uploadPhoto });
    timer = setInterval(() => { controller.tick({ queued: queue.queued() }); queue.pump(); }, 1_000);
    report(undefined, 0, 'connection');
    queue.pump();
    await queue.done;
    for (let index = 0; index < outcomes.length; index++) {
      if (!outcomes[index]) finish(index, null, fatalError || new Error('This photo could not finish uploading. Please retry it.'));
    }
    const errors = outcomes.flatMap((item, index) => item.error ? [{ file: item.file, index, error: item.error }] : []);
    return { errors, successfulAssets: outcomes.filter(item => item.asset).map(item => item.asset), completed, total: files.length };
  } finally {
    clearInterval(timer);
    connection.dispose();
  }
}
