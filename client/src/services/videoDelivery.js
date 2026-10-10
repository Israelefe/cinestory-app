import api from './api.js';
import { API_BASE_URL } from '../config/env.js';

export const videoMediaUrl = value => value?.startsWith('/api/') ? API_BASE_URL.replace(/\/$/, '') + value.slice(4) : value;
export const videoBytes = bytes => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(.1, bytes / 1e6).toFixed(1)} MB`;
export const videoStorageBytes = bytes => `${((bytes || 0) / 1024 ** 3).toFixed(1)} GB`;
export const videoDuration = seconds => { const minutes = Math.floor((seconds || 0) / 60); return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : `${minutes}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`; };
const dbName = 'veylo-video-uploads';
function uploadDB() {
  return new Promise((resolve, reject) => { const request = indexedDB.open(dbName, 1); request.onupgradeneeded = () => request.result.createObjectStore('uploads', { keyPath: 'requestKey' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export async function persistVideoUpload(value) {
  const db = await uploadDB();
  try { await new Promise((resolve, reject) => { const transaction = db.transaction('uploads', 'readwrite'); transaction.objectStore('uploads').put(value); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); }); } finally { db.close(); }
}
export async function forgetVideoUpload(key) {
  const db = await uploadDB();
  try { await new Promise((resolve, reject) => { const transaction = db.transaction('uploads', 'readwrite'); transaction.objectStore('uploads').delete(key); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); }); } finally { db.close(); }
}
export async function savedVideoUploads(deliveryId) {
  const db = await uploadDB();
  try { return await new Promise((resolve, reject) => { const request = db.transaction('uploads').objectStore('uploads').getAll(); request.onsuccess = () => resolve(request.result.filter(row => row.deliveryId === deliveryId)); request.onerror = () => reject(request.error); }); } finally { db.close(); }
}
export async function videoFingerprint(file) {
  const sample = new Uint8Array(await new Blob([file.name, String(file.size), String(file.lastModified), file.slice(0, 1024 * 1024), file.slice(Math.max(0, file.size - 1024 * 1024))]).arrayBuffer());
  const hash = await crypto.subtle.digest('SHA-256', sample);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}
function sendPart(url, blob, signal, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); const abort = () => xhr.abort();
    xhr.open('PUT', url); xhr.timeout = 15 * 60_000;
    xhr.upload.onprogress = event => onProgress(event.loaded);
    xhr.onload = () => { signal.removeEventListener('abort', abort); xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('This upload part could not be sent.')); };
    xhr.onerror = xhr.ontimeout = () => { signal.removeEventListener('abort', abort); reject(new Error('The connection was interrupted. Your completed parts are saved.')); };
    xhr.onabort = () => { signal.removeEventListener('abort', abort); reject(new DOMException('Upload paused', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); reject(new DOMException('Upload paused', 'AbortError')); return; }
    xhr.send(blob);
  });
}
export async function transferVideo(file, upload, { signal, onProgress }) {
  const { data: result } = await api.get(`/v1/videos/uploads/${upload.id}`, { signal });
  const state = result.data;
  if (state.state === 'completed') return;
  const parts = new Map(state.parts.map(part => [part.partNumber, part.bytes]));
  let completed = [...parts.values()].reduce((sum, bytes) => sum + bytes, 0);
  onProgress(completed / file.size * 100);
  for (let partNumber = 1; partNumber <= state.partCount; partNumber++) {
    if (parts.has(partNumber)) continue;
    const start = (partNumber - 1) * state.partBytes;
    const blob = file.slice(start, Math.min(file.size, start + state.partBytes));
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) throw new DOMException('Upload paused', 'AbortError');
      try {
        const { data } = await api.post(`/v1/videos/uploads/${upload.id}/part`, { partNumber }, { signal });
        await sendPart(data.data.url, blob, signal, bytes => onProgress((completed + bytes) / file.size * 100));
        completed += blob.size; break;
      } catch (error) {
        if (signal.aborted || attempt >= 2 || [400, 401, 403, 409, 410, 413, 429].includes(error.response?.status)) throw error;
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1500));
      }
    }
  }
  await api.post(`/v1/videos/uploads/${upload.id}/complete`, {}, { signal });
}
