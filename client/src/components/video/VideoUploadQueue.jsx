import React, { useEffect, useRef, useState } from 'react';
import { Upload, Pause, Play, X, FileVideo, RefreshCw } from 'lucide-react';
import api, { apiMessage } from '../../services/api.js';
import { videoBytes, videoFingerprint, persistVideoUpload, savedVideoUploads, forgetVideoUpload, transferVideo } from '../../services/videoDelivery.js';

export default function VideoUploadQueue({ deliveryId, initialize, onRefresh, onRemoveAsset, onState, disabled, maxBytes = 5_000_000_000, accountTransfers = 2 }) {
  const [queue, setQueue] = useState([]); const [error, setError] = useState('');
  const active = useRef(new Map()); const input = useRef(null); const mounted = useRef(true); const initializeRef = useRef(initialize); const refreshRef = useRef(onRefresh);
  const cancelled = useRef(new Set()); const removeAssetRef = useRef(onRemoveAsset);
  removeAssetRef.current = onRemoveAsset;
  initializeRef.current = initialize; refreshRef.current = onRefresh;
  useEffect(() => { onState?.({ uploading: queue.some(row => ['uploading', 'waiting'].includes(row.status)), failedUploads: queue.filter(row => row.error).length }); }, [queue, onState]);
  const update = (key, patch) => { if (mounted.current) setQueue(rows => rows.map(row => row.requestKey === key ? { ...row, ...patch } : row)); };
  async function cancelUpload(upload) {
    // Cleanup must remain available if Pro expires during the transfer.
    // The worker also removes the draft reference after confirming deletion.
    await Promise.resolve().then(() => removeAssetRef.current?.(upload.assetId)).catch(() => {});
    await api.delete(`/v1/videos/uploads/${upload.id}`);
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; for (const controller of active.current.values()) controller.abort(); }; }, []);
  useEffect(() => {
    if (!deliveryId) return;
    let current = true;
    savedVideoUploads(deliveryId).then(rows => { if (current) setQueue(existing => [...existing, ...rows.filter(row => !existing.some(value => value.requestKey === row.requestKey)).map(row => ({ ...row, status: 'needs-file', progress: 0 }))]); }).catch(() => {});
    return () => { current = false; };
  }, [deliveryId]);
  useEffect(() => {
    if (disabled) return;
    const slow = navigator.connection?.saveData || ['slow-2g', '2g'].includes(navigator.connection?.effectiveType);
    const capacity = slow ? 1 : accountTransfers;
    const waiting = queue.filter(row => row.status === 'waiting' && row.file && !active.current.has(row.requestKey));
    for (const row of waiting.slice(0, Math.max(0, capacity - active.current.size))) {
      const controller = new AbortController(); active.current.set(row.requestKey, controller);
      update(row.requestKey, { status: 'uploading', error: '' });
      void (async () => {
        let upload = row.upload;
        try {
          const fingerprint = row.fingerprint || await videoFingerprint(row.file);
          if (!upload) {
            const opened = await initializeRef.current({ filename: row.file.name, bytes: row.file.size, fingerprint, requestKey: row.requestKey });
            upload = opened.upload;
            const saved = { requestKey: row.requestKey, deliveryId: opened.deliveryId, upload, filename: row.file.name, bytes: row.file.size, fingerprint };
            update(row.requestKey, { ...saved });
            await persistVideoUpload(saved).catch(() => {});
          }
          if (controller.signal.aborted) throw new DOMException('Upload paused', 'AbortError');
          await transferVideo(row.file, upload, { signal: controller.signal, onProgress: progress => update(row.requestKey, { progress }) });
          await forgetVideoUpload(row.requestKey).catch(() => {});
          update(row.requestKey, { status: 'done', progress: 100, file: undefined });
          await refreshRef.current();
        } catch (failure) {
          if (controller.signal.aborted) {
            if (upload && cancelled.current.has(row.requestKey)) {
              try { await cancelUpload(upload); await forgetVideoUpload(row.requestKey).catch(() => {}); }
              catch (failure) { if (mounted.current) setError(apiMessage(failure, 'This upload could not be removed. Try again from your video library.')); }
            }
            else if (upload) await api.post(`/v1/videos/uploads/${upload.id}/pause`, {}).catch(() => {});
            update(row.requestKey, { status: 'paused', upload });
          } else update(row.requestKey, { status: 'paused', upload, error: apiMessage(failure, failure.message || 'The upload stopped. Your completed parts are saved.') });
        } finally { active.current.delete(row.requestKey); cancelled.current.delete(row.requestKey); if (mounted.current) setQueue(rows => [...rows]); }
      })();
    }
  }, [queue, accountTransfers, disabled]);
  async function addFiles(files) {
    setError(''); const valid = [];
    for (const file of [...files]) {
      if (!/\.(mp4|mov|webm)$/i.test(file.name) || !file.size || file.size > maxBytes) { setError('Choose MP4, MOV or WebM videos up to 5 GB each.'); continue; }
      valid.push({ requestKey: crypto.randomUUID(), filename: file.name, bytes: file.size, file, status: 'waiting', progress: 0 });
    }
    if (valid.length > 10 || queue.filter(row => row.status !== 'done').length + valid.length > 10) { setError('Add up to 10 videos to one delivery.'); return; }
    setQueue(rows => [...rows, ...valid]);
  }
  async function remove(row) {
    cancelled.current.add(row.requestKey);
    active.current.get(row.requestKey)?.abort();
    if (row.upload) { try { await cancelUpload(row.upload); } catch (failure) { setError(apiMessage(failure, 'This upload could not be removed.')); return; } }
    await forgetVideoUpload(row.requestKey).catch(() => {});
    setQueue(rows => rows.filter(value => value.requestKey !== row.requestKey));
    await refreshRef.current();
  }
  return <section className="vc-upload" aria-label="Upload finished videos">
    <input ref={input} type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" multiple hidden disabled={disabled} onChange={event => { void addFiles(event.target.files); event.target.value = ''; }} />
    <button type="button" className="vc-drop" disabled={disabled} onClick={() => input.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disabled) void addFiles(event.dataTransfer.files); }}><span><Upload size={25} /></span><strong>Choose your finished videos</strong><small>MP4, MOV or WebM · Up to 5 GB per video</small><b>Browse files</b></button>
    <p className="vc-upload-note">Completed parts are saved if your connection drops. After closing this page, choose the same original file to resume. Keep this tab open while files are transferring.</p>
    {error && <p role="alert" className="vc-error">{error}</p>}
    <div className="vc-upload-list">{queue.map(row => <div className="vc-upload-row" key={row.requestKey}><FileVideo size={20} /><div><strong>{row.filename}</strong><small>{videoBytes(row.bytes)} · {row.status === 'done' ? 'Uploaded · preparing playback' : row.status === 'needs-file' ? 'Choose the same file to resume' : row.status === 'paused' ? 'Paused · completed parts saved' : row.status === 'waiting' ? 'Waiting for an upload slot' : `${Math.floor(row.progress)}% uploaded`}</small>{['uploading', 'paused'].includes(row.status) && <progress value={row.progress} max={100} aria-label={`Upload progress for ${row.filename}`} />}{row.error && <p role="alert">{row.error}</p>}</div>{row.status === 'uploading' ? <button type="button" onClick={() => active.current.get(row.requestKey)?.abort()} aria-label={`Pause ${row.filename}`}><Pause size={17} /></button> : row.status === 'paused' && row.file ? <button type="button" onClick={() => update(row.requestKey, { status: 'waiting' })} aria-label={`Resume ${row.filename}`}><Play size={17} /></button> : row.status === 'needs-file' || (row.status === 'paused' && !row.file) ? <label className="vc-file-resume"><RefreshCw size={15} /><span>Choose file</span><input type="file" accept=".mp4,.mov,.webm" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; if (await videoFingerprint(file) !== row.fingerprint) { update(row.requestKey, { error: 'This is a different file. Choose the exact original you started uploading.' }); return; } update(row.requestKey, { file, status: 'waiting', error: '' }); }} /></label> : null}{row.status !== 'done' && <button type="button" aria-label={`Remove upload ${row.filename}`} onClick={() => remove(row)}><X size={17} /></button>}</div>)}</div>
  </section>;
}
