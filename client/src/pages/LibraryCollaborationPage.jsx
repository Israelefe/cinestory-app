import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Download, Image, LockKeyhole, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { API_BASE_URL } from '../config/env.js';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { uploadEditorReturn } from '../utils/storageUpload.js';
import './LibraryCollaborationPage.css';

function apiPath(path) {
  return `${String(API_BASE_URL).replace(/\/$/, '')}${path}`;
}

function formatBytes(value = 0) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export default function LibraryCollaborationPage({ kind }) {
  const reduced = useVeyloReducedMotion();
  const { publicId } = useParams();
  const [info, setInfo] = useState(null);
  const [content, setContent] = useState(null);
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [uploadingId, setUploadingId] = useState('');
  const [error, setError] = useState('');

  async function loadContent(accessToken) {
    const { data } = await api.get(`/v1/storage/public/${encodeURIComponent(publicId)}/content`, { params: { access_token: accessToken } });
    if (data.data.kind !== kind) throw new Error('This link is for a different kind of sharing.');
    setContent(data.data);
    setSelected(data.data.selectedAssetIds || []);
    setToken(accessToken);
  }

  useEffect(() => {
    let mounted = true;
    async function initialise() {
      setLoading(true); setError(''); setInfo(null); setContent(null);
      try {
        const { data } = await api.get(`/v1/storage/public/${encodeURIComponent(publicId)}`);
        if (!mounted) return;
        setInfo(data.data);
        if (data.data.kind !== kind) throw new Error('This link is for a different kind of sharing.');
        const remembered = sessionStorage.getItem(`veylo_library_access:${publicId}`) || '';
        if (remembered) {
          try { await loadContent(remembered); }
          catch { sessionStorage.removeItem(`veylo_library_access:${publicId}`); if (!data.data.requiresSecret) await unlock(''); }
        } else if (!data.data.requiresSecret) await unlock('');
      } catch (loadError) {
        if (mounted) setError(apiMessage(loadError, loadError.message || 'This sharing link could not be opened.'));
      } finally { if (mounted) setLoading(false); }
    }
    async function unlock(value) {
      const { data } = await api.post(`/v1/storage/public/${encodeURIComponent(publicId)}/unlock`, { secret: value });
      if (!mounted) return;
      sessionStorage.setItem(`veylo_library_access:${publicId}`, data.data.token);
      await loadContent(data.data.token);
    }
    initialise();
    return () => { mounted = false; };
  }, [publicId, kind]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  async function openWithSecret(event) {
    event.preventDefault();
    setWorking(true); setError('');
    try {
      const { data } = await api.post(`/v1/storage/public/${encodeURIComponent(publicId)}/unlock`, { secret });
      const accessToken = data.data.token;
      sessionStorage.setItem(`veylo_library_access:${publicId}`, accessToken);
      await loadContent(accessToken);
    } catch (unlockError) { setError(apiMessage(unlockError, 'That password or PIN did not match.')); }
    finally { setWorking(false); }
  }

  function mediaUrl(assetId) {
    return `${apiPath(`/v1/storage/public/${encodeURIComponent(publicId)}/media/${encodeURIComponent(assetId)}`)}?access_token=${encodeURIComponent(token)}`;
  }

  async function submitSelection() {
    if (!selected.length) return setError('Choose at least one photograph before sending your selection.');
    setWorking(true); setError('');
    try {
      const { data } = await api.post(`/v1/storage/public/${encodeURIComponent(publicId)}/selections`, { assetIds: selected }, { headers: { Authorization: `Bearer ${token}` } });
      setContent(current => ({ ...current, status: 'submitted', submitted: true, selectedAssetIds: selected }));
      toast.success(`Your selection was sent (${data.data.selectedCount} photographs).`);
    } catch (submitError) { setError(apiMessage(submitError, 'We could not send your selection.')); }
    finally { setWorking(false); }
  }

  async function downloadOriginal(asset) {
    const url = `${apiPath(`/v1/storage/public/${encodeURIComponent(publicId)}/download/${encodeURIComponent(asset.id)}`)}?access_token=${encodeURIComponent(token)}`;
    window.location.assign(url);
  }

  async function uploadEdit(asset, file) {
    if (!file) return;
    setUploadingId(asset.id); setError('');
    try {
      await uploadEditorReturn(file, asset.id, token, publicId);
      const { data } = await api.get(`/v1/storage/public/${encodeURIComponent(publicId)}/content`, { params: { access_token: token } });
      setContent(data.data);
      toast.success('Edited photograph returned to the library.');
    } catch (uploadError) { setError(apiMessage(uploadError, uploadError.message || 'We could not upload that edit.')); }
    finally { setUploadingId(''); }
  }

  if (loading) return <main className="v-library-collab-page"><div className="v-library-collab-loading">Opening private link…</div></main>;
  if (error && !info) return <main className="v-library-collab-page"><section className="v-library-collab-lock"><Image size={22} /><p>VEYLO · PRIVATE LINK</p><h1>This link is unavailable.</h1><span>{error}</span></section></main>;
  if (!content) return <main className="v-library-collab-page"><section className="v-library-collab-lock">
    <div className="v-library-collab-mark"><Image size={19} /></div><p>VEYLO · {kind === 'preselection' ? 'CLIENT PRESELECTION' : 'EDITOR HANDOFF'}</p>
    <h1>{info?.title || 'Private photo link'}</h1><span>{info?.clientName ? `Prepared for ${info.clientName}. ` : ''}{kind === 'preselection' ? 'Choose the photographs you would like the photographer to edit.' : 'Download the originals, make your edits, then return them here.'}</span>
    <form onSubmit={openWithSecret}>
      {info?.requiresSecret && <label>{kind === 'editor-handoff' ? 'Link password' : 'Six-digit PIN'}<span><LockKeyhole size={15} /><input autoComplete="off" autoFocus type={kind === 'editor-handoff' ? 'password' : 'text'} inputMode={kind === 'preselection' ? 'numeric' : undefined} maxLength={kind === 'preselection' ? 6 : 72} value={secret} onChange={event => setSecret(kind === 'preselection' ? event.target.value.replace(/\D/g, '').slice(0, 6) : event.target.value)} placeholder={kind === 'editor-handoff' ? 'Enter the password' : 'Enter the PIN'} /></span></label>}
      {error && <p className="v-library-collab-error" role="alert">{error}</p>}
      <button type="submit" className="v-library-collab-primary" disabled={working || (info?.requiresSecret && !secret)}>{working ? 'Opening…' : info?.requiresSecret ? 'Open link' : 'View photographs'}</button>
    </form>
    <small>Shared privately by a Veylo photographer. This link closes when it expires or the photographer’s Pro access ends.</small>
  </section></main>;

  const submitted = kind === 'preselection' && (content.submitted || content.status === 'submitted');
  const returnedBySource = new Map();
  for (const item of content.returned || []) returnedBySource.set(item.sourceAssetId, [...(returnedBySource.get(item.sourceAssetId) || []), item]);

  return <main className="v-library-collab-page">
    <div className="v-library-collab-glow" aria-hidden="true" />
    <div className="v-library-collab-wrap">
      <motion.header className="v-library-collab-head" initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <p>VEYLO · {kind === 'preselection' ? 'CLIENT PRESELECTION' : 'EDITOR HANDOFF'}</p>
        <h1>{content.title}</h1>
        <span>{kind === 'preselection' ? `Prepared by ${content.photographerName}. Choose the photographs you want edited.` : `Prepared by ${content.photographerName}. Download each original and return the edited file here.`}</span>
        {content.note && <blockquote>{content.note}</blockquote>}
      </motion.header>

      {kind === 'preselection' && <div className="v-library-collab-instruction"><Image size={17} /><p><strong>{submitted ? 'Your choices have been sent.' : 'Choose as many as you need.'}</strong><span>{submitted ? 'The photographer has your selection.' : 'These marked previews are for choosing. You can change your choices until you send them.'}</span></p></div>}
      {error && <p className="v-library-collab-error is-page" role="alert">{error}</p>}

      <motion.section className="v-library-collab-grid" initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: reduced ? 0 : 0.025 } } }}>
        {content.assets.map(asset => {
          const chosen = selectedSet.has(asset.id);
          const returned = returnedBySource.get(asset.id) || [];
          return <motion.article key={asset.id} className={`v-library-collab-card ${kind === 'preselection' && chosen ? 'is-chosen' : ''}`} variants={{ hidden: { opacity: 0, y: 10 }, shown: { opacity: 1, y: 0 } }}>
            {kind === 'preselection' ? <button type="button" className="v-library-select-image" aria-pressed={chosen} disabled={submitted} onClick={() => setSelected(current => chosen ? current.filter(id => id !== asset.id) : [...current, asset.id])}>
              <img src={mediaUrl(asset.id)} alt={asset.originalFilename} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              <span className="v-library-collab-watermark" aria-hidden="true"><i>FOR SELECTION</i><i>VEYLO · REVIEW COPY</i><i>FOR SELECTION</i></span>
              <span className="v-library-select-indicator">{chosen ? <Check size={18} /> : <span />}</span>
              <span className="v-library-collab-filename">{asset.originalFilename}</span>
            </button> : <div className="v-library-editor-photo">
              <img src={mediaUrl(asset.id)} alt={asset.originalFilename} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              <div className="v-library-editor-file"><strong>{asset.originalFilename}</strong><span>{asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : ''}{formatBytes(asset.sourceBytes || asset.bytes)}{asset.rawOriginal ? ' · camera original' : ''}</span></div>
              <button type="button" className="v-library-editor-action" onClick={() => downloadOriginal(asset)}><Download size={16} />Download original</button>
              <label className={`v-library-editor-action is-upload ${uploadingId === asset.id ? 'is-busy' : ''}`}><Upload size={16} />{uploadingId === asset.id ? 'Uploading edit…' : 'Upload edited photo'}<input type="file" aria-label={`Upload edited photo for ${asset.originalFilename}`} accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploadingId)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; uploadEdit(asset, file); }} /></label>
              {returned.length > 0 && <div className="v-library-editor-returned"><strong>{returned.length} file{returned.length === 1 ? '' : 's'} returned</strong><span>{returned.map(row => row.filename).join(', ')}</span></div>}
            </div>}
          </motion.article>;
        })}
      </motion.section>

      {kind === 'preselection' && !submitted && <div className="v-library-collab-submit"><div><strong>{selected.length} selected</strong><span>Your choices will be sent to {content.photographerName}.</span></div><button type="button" className="v-library-collab-primary" disabled={!selected.length || working} onClick={submitSelection}>{working ? 'Sending…' : 'Send my selection'}<Check size={16} /></button></div>}
      {kind === 'preselection' && submitted && <div className="v-library-collab-complete"><Check size={18} /><span>Your selection has been sent. Thank you.</span></div>}
      <footer className="v-library-collab-footer">Private photo sharing from Veylo</footer>
    </div>
  </main>;
}
