import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../../services/api.js';
import { libraryUploads } from '../../utils/libraryUploadQueue.js';
import { collaborationUrl } from './LinkActions.jsx';
import { workflowPath } from './libraryHelpers.js';

export function useWorkflowDraft(kind, user, defaults, { revising = false } = {}) {
  const { id } = useParams(), location = useLocation();
  const key = 'veylo_library_setup:' + (user?.id || user?._id) + ':' + kind + ':' + (id || 'new');
  const [draft, setDraft] = useState(() => {
    let remembered; try { remembered = JSON.parse(localStorage.getItem(key)); } catch { /* Storage is optional. */ }
    return { ...defaults, ...(remembered || {}), ...(location.state?.assetIds ? { assetIds: location.state.assetIds } : {}), pin: '', password: '', creationKey: remembered?.creationKey || crypto.randomUUID() };
  });
  const [serverId, setServerId] = useState(id || draft.serverId || '');
  const [step, setStep] = useState(1), [busy, setBusy] = useState(false), [error, setError] = useState(''), [created, setCreated] = useState(null);
  const loaded = useRef('');
  const [loadingDraft, setLoadingDraft] = useState(Boolean(id));
  useEffect(() => {
    if (!id || loaded.current === id) return;
    let active = true; setLoadingDraft(true); setServerId(id);
    api.get('/v1/storage/collaborations/' + id).then(({ data }) => {
      if (!active) return;
      if (data.data.kind !== kind || (revising ? !['active', 'submitted'].includes(data.data.status) : data.data.status !== 'draft')) throw new Error('This link cannot be changed here. Open its detail page to review it.');
      loaded.current = id;
      setDraft(current => ({ ...current, ...data.data, selectionRule: data.data.selectionRule || { mode: 'unlimited' }, assetIds: data.data.assetIds.map(String), pin: '', password: '', dueAt: data.data.dueAt?.slice(0, 10) || '' }));
    }).catch(failure => { if (active) setError(apiMessage(failure, failure.message || 'This draft could not be loaded.')); }).finally(() => { if (active) setLoadingDraft(false); });
    return () => { active = false; };
  }, [id, kind, revising]);
  useEffect(() => {
    if (created) return;
    const timer = setTimeout(() => { try {
      const { title, clientName, note, assetIds, expiresInDays, selectionRule, dueAt, creationKey } = draft;
      localStorage.setItem(key, JSON.stringify({ title, clientName, note, assetIds, expiresInDays, selectionRule, dueAt, creationKey, serverId }));
    } catch { /* The form still works without local storage. */ } }, 300);
    return () => clearTimeout(timer);
  }, [draft, serverId, key, created]);
  async function save(status) {
    if (busy || loadingDraft || id && loaded.current !== id) return;
    if (!draft.title.trim()) { setError('Give this link a name.'); setStep(2); return; }
    if (!draft.assetIds.length) { setError('Choose at least one photograph.'); setStep(1); return; }
    if (kind === 'preselection' && draft.selectionRule.mode !== 'unlimited' && (!Number.isInteger(Number(draft.selectionRule.count)) || Number(draft.selectionRule.count) < 1 || Number(draft.selectionRule.count) > draft.assetIds.length)) { setError('Set a selection count between 1 and ' + draft.assetIds.length + '.'); setStep(2); return; }
    if (status === 'active' && kind === 'preselection' && draft.pin && !/^\d{6}$/.test(draft.pin)) { setError('Use a six-digit PIN or leave it blank.'); setStep(2); return; }
    if (status === 'active' && kind === 'editor-handoff' && (draft.password.length < 8 || new TextEncoder().encode(draft.password).length > 72)) { setError('Set an editor password with at least 8 characters and no more than 72 bytes.'); setStep(2); return; }
    setBusy(true); setError('');
    try {
      const body = { kind, title: draft.title, clientName: draft.clientName, note: draft.note, assetIds: draft.assetIds, expiresInDays: Number(draft.expiresInDays), status, creationKey: draft.creationKey };
      if (kind === 'preselection') { body.selectionRule = { mode: draft.selectionRule.mode, ...(draft.selectionRule.mode !== 'unlimited' ? { count: Number(draft.selectionRule.count) } : {}) }; if (status === 'active') body.pin = draft.pin; }
      else { body.dueAt = draft.dueAt ? new Date(draft.dueAt + 'T12:00:00Z').toISOString() : null; if (draft.password && status === 'active') body.password = draft.password; }
      if (revising) { body.revision = draft.revision; if (!draft.pin) delete body.pin; }
      const { data } = serverId ? await api.patch('/v1/storage/collaborations/' + serverId + (revising ? '/revise' : ''), body) : await api.post('/v1/storage/collaborations', body);
      setServerId(data.data._id);
      if (status === 'active') { setCreated(data.data); localStorage.removeItem(key); }
      else toast.success('Draft saved. It is not shared yet.');
    } catch (failure) { setError(apiMessage(failure, 'This link could not be saved.')); } finally { setBusy(false); }
  }
  const edit = (name, value) => setDraft(current => ({ ...current, [name]: value }));
  const goStep = next => {
    if (busy) return;
    if (next > 1 && !draft.assetIds.length) { setError('Choose at least one photograph.'); return; }
    if (next === 3) {
      if (!draft.title.trim()) { setError('Give this link a name.'); setStep(2); return; }
      if (kind === 'preselection' && draft.selectionRule.mode !== 'unlimited' && (!Number.isInteger(Number(draft.selectionRule.count)) || Number(draft.selectionRule.count) < 1 || Number(draft.selectionRule.count) > draft.assetIds.length)) { setError('Set a selection count between 1 and ' + draft.assetIds.length + '.'); setStep(2); return; }
      if (kind === 'preselection' && draft.pin && !/^\d{6}$/.test(draft.pin)) { setError('Use a six-digit PIN or leave it blank.'); setStep(2); return; }
      if (kind === 'editor-handoff' && (draft.password.length < 8 || new TextEncoder().encode(draft.password).length > 72)) { setError('Set an editor password with at least 8 characters.'); setStep(2); return; }
    }
    setError(''); setStep(next);
  };
  return { draft, setDraft, edit, step, setStep: goStep, busy: busy || loadingDraft, error, setError, created, save, folder: location.state?.folder || '' };
}

export function SetupSteps({ step, onStep }) {
  return <nav className="lib-steps" aria-label="Link creation steps">{['Photographs', 'Details', 'Review & share'].map((label, index) => <button type="button" key={label} aria-current={step === index + 1 ? 'step' : undefined} onClick={() => onStep(index + 1)}><span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>{label}</button>)}</nav>;
}

export function UploadIntoShoot({ initialFolder = '' }) {
  const input = useRef(null), [folder, setFolder] = useState(initialFolder || 'Unfiled');
  return <div className="lib-setup-upload"><label>Save new uploads to shoot<input value={folder} maxLength={100} onChange={event => setFolder(event.target.value)} placeholder="Shoot name" /></label><button type="button" className="lib-button" onClick={() => input.current?.click()}><Upload size={16} />Upload photographs</button><input hidden ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,.arw,.cr2,.cr3,.dng,.nef,.nrw,.orf,.rw2,.raf,.pef,.srw,.3fr,.iiq,.mos,.mef,.mrw,.rwl,.x3f" onChange={event => { libraryUploads.add(event.target.files, { folder: folder.trim() || 'Unfiled' }); event.target.value = ''; }} /></div>;
}

export function ShareReceipt({ item, secret, kind }) {
  const selection = kind === 'preselection';
  async function copy(value) { try { await navigator.clipboard.writeText(value); toast.success('Copied.'); } catch { toast.error('Select the text below and copy it.'); } }
  return <section className="lib-share-receipt"><div className="lib-receipt-check"><Check size={26} /></div><p className="lib-eyebrow">LINK READY</p><h2>{item.title}</h2><p>{selection ? 'Send this link to your client when you are ready.' : 'Send this link to your editor when you are ready.'}</p><label>Private link<input readOnly value={collaborationUrl(item)} onFocus={event => event.target.select()} /></label><button type="button" className="lib-button lib-primary" onClick={() => copy(collaborationUrl(item))}><Copy size={17} />Copy link</button>{secret && <><label>{selection ? 'Six-digit PIN' : 'Editor password'}<input readOnly value={secret} onFocus={event => event.target.select()} /></label><button type="button" className="lib-button" onClick={() => copy(secret)}><Copy size={15} />Copy {selection ? 'PIN' : 'password'}</button><small>Share the access detail separately from the link.</small></>}<Link className="lib-text-link" to={workflowPath(kind) + '/' + item._id}>Open {selection ? 'selection results' : 'editor job'}<ArrowLeft className="lib-arrow-forward" size={16} /></Link></section>;
}
