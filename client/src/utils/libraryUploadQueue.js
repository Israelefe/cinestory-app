import api, { apiMessage } from '../services/api.js';
import { toast } from 'react-toastify';
import { createAdaptivePhotoUpload } from './adaptivePhotoUpload.js';
import { isRawPhoto, uploadEditorReturn, uploadLibraryPhoto, validLibraryPhoto } from './storageUpload.js';

const entries = [];
const listeners = new Set();
let snapshot = { entries: [], paused: false, offline: false };
let paused = false;
let offline = typeof navigator !== 'undefined' && navigator.onLine === false;
let active = 0;
let ownerId;
const terminal = new Set(['added', 'failed', 'cancelled']);
const transfers = createAdaptivePhotoUpload({ maxConcurrent: 6, onChange: () => { emit(); queueMicrotask(pump); } });

function emit() {
  snapshot = { entries: entries.map(entry => ({ ...entry })), paused, offline, transferLimit: transfers.state().limit };
  listeners.forEach(listener => listener());
}
function change(entry, values) {
  if (values.state === 'uploading') {
    if (!entry.transferring) { entry.transferring = true; transfers.start(entry.id, values.total || entry.total); }
    transfers.progress(entry.id, values.loaded || 0);
  } else if (values.state && entry.transferring) { entry.transferring = false; transfers.finish(entry.id); }
  Object.assign(entry, values); emit();
}
function transient(error) {
  const status = error.response?.status || error.status;
  return !status || status === 408 || status === 429 || status >= 500;
}
async function clean(entry) {
  if (entry.scope !== 'library') {
    if (entry.record.signature) await api.post('/v1/storage/public/' + encodeURIComponent(entry.publicId) + '/uploads/cleanup', { objectKey: entry.record.signature.objectKey, editorGrant: entry.record.signature.editorGrant }, { headers: { Authorization: 'Bearer ' + entry.token } }).catch(() => {});
    return;
  }
  const uploads = ['image', 'raw'].flatMap(type => {
    const signature = entry.record[type + 'Signature'];
    return signature ? [{ publicId: signature.objectKey, resourceType: type }] : [];
  });
  if (uploads.length) await api.post('/v1/storage/uploads/cleanup', { uploads }).catch(() => {});
}
async function run(entry) {
  active++;
  entry.controller = new AbortController();
  try {
    if (!validLibraryPhoto(entry.file) || entry.scope !== 'library' && isRawPhoto(entry.file)) throw new Error('Use a supported photograph up to 100 MB. Editor returns must be JPEG, PNG, or WebP.');
    for (let attempt = 0; ; attempt++) {
      try {
        const options = { signal: entry.controller.signal, record: entry.record, onChange: values => { if (!entry.disposed) change(entry, values); } };
        const result = entry.scope === 'library'
          ? await uploadLibraryPhoto(entry.file, { ...options, folder: entry.folder })
          : await uploadEditorReturn(entry.file, entry.sourceAssetId, entry.token, entry.publicId, { ...options, variationId: entry.variationId, variationName: entry.variationName });
        if (entry.disposed) break;
        change(entry, { state: 'added', loaded: entry.total, result, error: '' });
        window.dispatchEvent(new CustomEvent(entry.scope === 'library' ? 'veylo:library-photo-added' : 'veylo:editor-photo-added', { detail: { ...result, publicId: entry.publicId } }));
        break;
      } catch (error) {
        if (entry.disposed) break;
        if (entry.controller.signal.aborted || error.code === 'UPLOAD_CANCELLED') { change(entry, { state: 'cancelled', error: '' }); await clean(entry); break; }
        if (offline) { change(entry, { state: 'queued', error: '' }); break; }
        if (attempt < 2 && transient(error)) {
          transfers.failure(error.response?.status === 429 ? 'busy' : 'connection');
          change(entry, { state: 'retrying', error: 'Connection interrupted. Trying again…' });
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        change(entry, { state: 'failed', error: apiMessage(error, error.message || 'This photograph could not be saved.') });
        break;
      }
    }
  } catch (error) { change(entry, { state: 'failed', error: error.message }); }
  finally {
    if (entry.transferring) { entry.transferring = false; transfers.finish(entry.id); }
    active--; entry.controller = null; emit(); pump();
    const batch = entries.filter(item => item.batchId === entry.batchId);
    if (batch.length && !batch.some(item => !terminal.has(item.state) || item.batchNotified)) {
      batch.forEach(item => { item.batchNotified = true; });
      const added = batch.filter(item => item.state === 'added').length, failed = batch.filter(item => item.state === 'failed').length;
      if (added || failed) toast[failed ? 'info' : 'success'](added + ' photograph' + (added === 1 ? '' : 's') + ' saved.' + (failed ? ' ' + failed + ' need another try. See the upload tray.' : ''));
    }
    if (!entries.some(item => item.scope === 'library' && !terminal.has(item.state))) window.dispatchEvent(new Event('veylo:library-uploads-settled'));
  }
}
function pump() {
  if (paused || offline) return;
  for (const entry of entries) {
    if (active >= transfers.state().limit) break;
    if (entry.state !== 'queued' || entry.controller) continue;
    entry.state = 'preparing'; run(entry);
  }
  emit();
}

export const libraryUploads = {
  setOwner(nextOwnerId) {
    if (ownerId === nextOwnerId) return;
    ownerId = nextOwnerId;
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index];
      if (entry.scope !== 'library') continue;
      entry.disposed = true; entry.controller?.abort();
      URL.revokeObjectURL(entry.preview); entries.splice(index, 1);
    }
    emit();
  },
  authorize(scope, token) { entries.filter(entry => entry.scope === scope).forEach(entry => { entry.token = token; }); },
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot: () => snapshot,
  add(files, options = {}) {
    if (!files?.length) return [];
    const batchId = crypto.randomUUID();
    const added = [...files].map(file => ({ id: crypto.randomUUID(), batchId, scope: options.scope || 'library', folder: options.folder || 'Unfiled', ...options, file,
      preview: !isRawPhoto(file) && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? URL.createObjectURL(file) : '', state: 'queued', loaded: 0, total: file.size, record: {}, error: '' }));
    entries.push(...added); emit(); pump();
    toast.info(added.length + ' photograph' + (added.length === 1 ? '' : 's') + ' added to the upload queue.');
    return added.map(entry => entry.id);
  },
  retry(id) {
    const entry = entries.find(item => item.id === id);
    if (!entry || !['failed', 'cancelled'].includes(entry.state)) return;
    if (entry.state === 'cancelled') entry.record = {};
    change(entry, { state: 'queued', error: '' }); pump();
  },
  retryFailed(scope) { entries.filter(entry => entry.scope === scope && entry.state === 'failed').forEach(entry => this.retry(entry.id)); },
  cancel(id) {
    const entry = entries.find(item => item.id === id);
    if (!entry || terminal.has(entry.state) || entry.state === 'saving' || entry.record.confirmationStarted) return;
    if (entry.controller) entry.controller.abort();
    else { change(entry, { state: 'cancelled' }); clean(entry); }
  },
  pause() { paused = !paused; emit(); if (!paused) pump(); },
  clear(scope) {
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i].scope === scope && terminal.has(entries[i].state)) { if (entries[i].state !== 'added') clean(entries[i]); URL.revokeObjectURL(entries[i].preview); entries.splice(i, 1); }
    emit();
  }
};
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => { offline = true; transfers.setOffline(true); emit(); });
  window.addEventListener('online', () => { offline = false; transfers.setOffline(false); emit(); pump(); });
  window.setInterval(() => { if (active) transfers.tick({ queued: entries.filter(entry => entry.state === 'queued').length }); }, 5000);
  window.addEventListener('beforeunload', event => {
    if (entries.some(entry => !terminal.has(entry.state))) { event.preventDefault(); event.returnValue = ''; }
  });
}
emit();
