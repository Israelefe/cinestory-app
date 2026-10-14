import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Copy, ExternalLink, Mail, MessageCircle, Share2, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../../services/api.js';
import { useDialogFocus } from '../useDialogFocus.js';
import { workflowPath } from './libraryHelpers.js';

export function collaborationUrl(item) { return window.location.origin + (item.kind === 'preselection' ? '/select/' : '/edit/') + item.publicId; }

export default function LinkActions({ item, onChange = () => {}, sharingOnly = false, deleteOnly = false, disabled = false, onDeleted }) {
  const navigate = useNavigate(), dialog = useRef(null), requestKey = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false), [action, setAction] = useState(''), [email, setEmail] = useState(item.recipientEmail || ''), [error, setError] = useState('');
  const closed = ['revoked', 'deleted', 'draft'].includes(item.status) || new Date(item.expiresAt) <= new Date();
  const url = collaborationUrl(item);
  const message = `${item.title}\n${item.kind === 'preselection' ? 'Open your photographs and choose the ones you would like edited.' : 'Download the originals and return your edits here.'}\n${url}`;
  useDialogFocus(Boolean(action), dialog, () => !busy && setAction(''));
  async function copy() { try { await navigator.clipboard.writeText(url); toast.success('Link copied.'); } catch { toast.error('Select the private link below and copy it.'); } }
  async function run(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (action === 'email') {
        const { data } = await api.post('/v1/storage/collaborations/' + item._id + '/invite', { email: email.trim(), requestKey: requestKey.current });
        requestKey.current = crypto.randomUUID();
        onChange(current => ({ ...current, recipientEmail: email.trim() }));
        toast[data.notification?.status === 'queued' ? 'info' : 'success'](data.notification?.status === 'queued' ? 'Email queued. We will retry the delivery.' : 'Email invitation sent.');
      } else if (action === 'delete') {
        await api.delete('/v1/storage/collaborations/' + item._id + '/remove');
        toast.success('Link deleted. Your stored photographs are kept.');
        if (onDeleted) onDeleted(item._id); else navigate(workflowPath(item.kind));
      } else {
        const { data } = await api.delete('/v1/storage/collaborations/' + item._id);
        onChange(current => ({ ...current, ...data.data })); toast.success('Link closed. Recipient access has stopped.');
      }
      setAction('');
    } catch (failure) { const text = apiMessage(failure, 'This action could not be completed. Please try again.'); setError(text); toast.error(text); }
    finally { setBusy(false); }
  }
  return <div className="lib-link-actions">
    {!closed && !deleteOnly && <><button type="button" className="lib-button" onClick={copy}><Copy size={16} />Copy link</button>
      <a className="lib-button" href={'https://wa.me/?text=' + encodeURIComponent(message)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />WhatsApp</a>
      <button type="button" className="lib-button" onClick={() => { setError(''); setAction('email'); }}><Mail size={16} />Email</button>
      {typeof navigator.share === 'function' && <button type="button" className="lib-button" onClick={() => navigator.share({ title: item.title, text: message, url }).catch(failure => { if (failure.name !== 'AbortError') toast.error('Sharing could not open. Copy the link instead.'); })}><Share2 size={16} />Share</button>}
      <a className="lib-button" href={url} target="_blank" rel="noreferrer"><ExternalLink size={16} />Open link</a>
      <input aria-label="Private link" readOnly value={url} onFocus={event => event.target.select()} /></>}
    {!sharingOnly && <>{!closed && !deleteOnly && <button type="button" className="lib-button" onClick={() => { setError(''); setAction('close'); }}><X size={16} />Close link</button>}<button type="button" className="lib-button lib-danger" disabled={disabled || busy} onClick={() => { setError(''); setAction('delete'); }}><Trash2 size={16} />Delete {item.kind === 'preselection' ? 'pre-selection' : 'Editor Link'}</button></>}
    {action && createPortal(<div className="lib-backdrop"><section ref={dialog} className="lib-dialog" role="dialog" aria-modal="true" aria-labelledby="lib-link-action-title"><header><h2 id="lib-link-action-title">{action === 'email' ? 'Send a private link' : action === 'delete' ? 'Delete this link?' : 'Close this link?'}</h2><button type="button" aria-label="Close link action" disabled={busy} onClick={() => setAction('')}><X size={20} /></button></header>
      <form onSubmit={run}>{action === 'email' ? <><p>Send {item.title} directly from Veylo. Share the PIN or password separately.</p><label>Recipient email<input required type="email" maxLength={254} value={email} onChange={event => { setEmail(event.target.value); requestKey.current = crypto.randomUUID(); }} /></label><small>{item.kind === 'editor-handoff' ? 'Correction emails for this job will also go to this address.' : 'Your client will receive the link to make their choices.'}</small></> : <p>{action === 'delete' ? 'This removes the link from your dashboard and stops recipient access. Originals, returned photographs and accepted edits stay in Photo Library.' : 'The recipient will no longer be able to open photographs or upload edits. This job remains on your dashboard.'}</p>}
      {error && <div className="lib-error" role="alert">{error}</div>}<footer><button type="button" className="lib-button" disabled={busy} onClick={() => setAction('')}>Cancel</button><button type="submit" className={'lib-button ' + (action === 'delete' ? 'lib-danger' : 'lib-primary')} disabled={busy}>{busy ? 'Please wait…' : action === 'email' ? 'Send email invitation' : action === 'delete' ? 'Delete link' : 'Close link'}</button></footer></form>
    </section></div>, document.body)}
  </div>;
}
