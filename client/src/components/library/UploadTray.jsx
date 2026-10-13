import React, { useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, ChevronUp, FileImage, LoaderCircle, Pause, Play, RotateCcw, Upload, X } from 'lucide-react';
import { libraryUploads } from '../../utils/libraryUploadQueue.js';
import { formatBytes } from './libraryHelpers.js';
import './LibraryWorkspace.css';

const labels = { queued: 'Waiting', preparing: 'Preparing preview', uploading: 'Uploading', saving: 'Saving', added: 'Added', failed: 'Needs another try', cancelled: 'Cancelled', retrying: 'Trying again' };
function UploadThumbnail({ src }) {
  const [failed, setFailed] = useState(false);
  return <div className="lib-upload-thumb">{src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <FileImage size={20} />}</div>;
}
export default function UploadTray({ scope = 'library' }) {
  const { entries: all, paused, offline } = useSyncExternalStore(libraryUploads.subscribe, libraryUploads.getSnapshot);
  const [expanded, setExpanded] = useState(true);
  const entries = all.filter(entry => entry.scope === scope);
  if (!entries.length) return null;
  const added = entries.filter(entry => entry.state === 'added').length;
  const failed = entries.filter(entry => entry.state === 'failed').length;
  const cancelled = entries.filter(entry => entry.state === 'cancelled').length;
  const pending = entries.some(entry => !['added', 'failed', 'cancelled'].includes(entry.state));
  return <motion.aside className="lib-upload-tray" aria-label="Photograph uploads" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
    <header><Upload size={18} /><div><strong>{pending ? `${added} of ${entries.length} added` : `${added} photograph${added === 1 ? '' : 's'} added`}</strong><span role="status">{offline ? 'Offline · waiting for a connection' : paused && pending ? 'Queue paused' : failed ? `${failed} need another try` : pending ? 'You can keep working while these save.' : cancelled ? cancelled + ' cancelled' : 'Your photographs are saved.'}</span></div><button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-label={expanded ? 'Collapse uploads' : 'Expand uploads'}>{expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button>{!pending && <button type="button" aria-label="Dismiss upload summary" onClick={() => libraryUploads.clear(scope)}><X size={18} /></button>}</header>
    <AnimatePresence>{expanded && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <ul>{entries.map(entry => <li key={entry.id}><UploadThumbnail src={entry.preview} /><div className="lib-upload-file"><strong>{entry.file.name}</strong><span>{labels[entry.state]}{entry.state === 'uploading' ? ` · ${formatBytes(entry.loaded)} / ${formatBytes(entry.total)}` : ''}</span>{['uploading', 'saving'].includes(entry.state) && <div className="lib-progress" role="progressbar" aria-label={`Upload ${entry.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(entry.state === 'saving' ? 99 : 98, (entry.loaded / entry.total) * 100))}><i style={{ transform: `scaleX(${Math.min(.99, entry.loaded / entry.total || 0)})` }} /></div>}{entry.error && <small>{entry.error}</small>}</div>{entry.state === 'added' ? <Check size={18} className="lib-success" /> : entry.state === 'failed' || entry.state === 'cancelled' ? <button type="button" aria-label={`Retry ${entry.file.name}`} onClick={() => libraryUploads.retry(entry.id)}><RotateCcw size={17} /></button> : <>{['preparing', 'saving', 'retrying'].includes(entry.state) && <LoaderCircle size={16} className="lib-spin" />}<button type="button" disabled={entry.state === 'saving' || entry.record.confirmationStarted} aria-label={`Cancel ${entry.file.name}`} onClick={() => libraryUploads.cancel(entry.id)}><X size={16} /></button></>}</li>)}</ul>
      <footer>{pending && <button type="button" onClick={() => libraryUploads.pause()}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? 'Resume queue' : 'Pause waiting files'}</button>}{failed > 0 && <button type="button" onClick={() => libraryUploads.retryFailed(scope)}><RotateCcw size={14} />Retry failed</button>}{!pending && scope === 'library' && <a href="/library">View photographs</a>}</footer>
    </motion.div>}</AnimatePresence>
  </motion.aside>;
}
