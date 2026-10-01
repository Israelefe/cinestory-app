import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, Check, LoaderCircle, Search, X } from 'lucide-react';
import { useDialogFocus } from '../useDialogFocus.js';
import './ShowcasePhotoPicker.css';

export default function ShowcasePhotoPicker({ title, assets, currentId, mediaUrl, onSelect, onClose }) {
  const dialog = useRef(null);
  const pending = useRef(false);
  const controller = useRef(null);
  const requestVersion = useRef(0);
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState(currentId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reduced = useReducedMotion();
  useEffect(() => () => controller.current?.abort(), []);
  const close = () => { requestVersion.current++; controller.current?.abort(); onClose(); };
  useDialogFocus(true, dialog, close);
  const filtered = assets.filter(asset => String(asset.originalFilename || '').toLowerCase().includes(query.trim().toLowerCase()));
  async function usePhoto() {
    if (!choice || pending.current) return;
    pending.current = true;
    setBusy(true); setError('');
    const version = ++requestVersion.current;
    const request = new AbortController(); controller.current = request;
    try {
      await onSelect(choice, request.signal);
      if (!request.signal.aborted && version === requestVersion.current) onClose();
    } catch (failure) {
      if (!request.signal.aborted && version === requestVersion.current) setError(failure.message || 'These words could not be generated. Try this photo again.');
    } finally { if (version === requestVersion.current) { pending.current = false; setBusy(false); } }
  }
  return createPortal(<div className="showcase-picker-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <motion.section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="showcase-picker-title" tabIndex={-1} className="showcase-picker" initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }}>
      <header><div><h2 id="showcase-picker-title">{title}</h2><p>Choose by looking at your photographs. Your full gallery stays intact.</p></div><button type="button" onClick={close} aria-label="Close photo picker"><X size={22} /></button></header>
      <label className="showcase-picker-search"><Search size={18} /><input aria-label="Search uploaded photos" placeholder="Search by filename" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="showcase-picker-grid" aria-label="Available photographs">
        {filtered.map(asset => <button type="button" key={asset.assetId} aria-label={'Choose ' + (asset.originalFilename || 'photograph')} aria-pressed={choice === asset.assetId} onClick={() => { requestVersion.current++; controller.current?.abort(); pending.current = false; setBusy(false); setChoice(asset.assetId); setError(''); }}>
          <div><img src={mediaUrl(asset.thumbnailUrl || asset.url)} alt={asset.originalFilename || 'Uploaded photograph'} loading="lazy" />{choice === asset.assetId && <span><Check size={18} /></span>}</div><small>{asset.originalFilename || 'Photograph'}</small>
        </button>)}
        {!filtered.length && <p className="showcase-picker-empty">No photos match that filename.</p>}
      </div>
      <footer>
        {error && <p role="alert"><AlertCircle size={18} />{error} Your current photo and words have been kept.</p>}
        <div><span role="status">{busy ? 'Checking the words for this photo…' : `${filtered.length} photos available`}</span><button type="button" onClick={usePhoto} disabled={!choice || busy}>{busy && <LoaderCircle size={18} className="v3-spin" />}{busy ? 'Preparing photo' : 'Use this photo'}</button></div>
      </footer>
    </motion.section>
  </div>, document.body);
}
