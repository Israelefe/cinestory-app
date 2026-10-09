import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, FileImage, LoaderCircle, Send, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { apiMessage } from '../services/api.js';
import '../styles/support-inbox.css';

export const SUPPORT_SUBJECTS = ['Delivery support', 'Upload problem', 'Delivery formats', 'Veylo Portfolio', 'Veylo Pro', 'Account help', 'Privacy or deletion request', 'Something else'];
export const REFUND_LABELS = { 'change-of-mind': 'Changed my mind after my first payment', 'duplicate-charge': 'I was charged twice', 'charged-after-cancellation': 'I was charged after cancellation was confirmed', 'paid-access-missing': 'I paid but did not receive Pro access', 'service-failure': 'A service problem prevented me from using Pro', other: 'Another payment problem' };
export const supportMoney = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format((value || 0) / 100);
export const supportDate = value => value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(value)) : '—';
export default function SupportComposer({ user, draft = {}, onSent, compact = false, onCancel, onOpenInbox }) {
  const [account, setAccount] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [sent, setSent] = useState(null);
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', subject: draft.subject || 'Delivery support', message: draft.message || '', deliveryPublicId: '', expected: '', startedAt: '', includeDiagnostics: true, paymentId: draft.paymentId || '', refundReason: '', ...draft });
  const [files, setFiles] = useState([]);
  const requestKey = useRef(crypto.randomUUID()), lock = useRef(false);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    api.get('/v1/support/context', { signal: controller.signal }).then(response => setAccount(response.data.data)).catch(error => { if (!controller.signal.aborted) setError(apiMessage(error, 'Account details could not load. You can still describe the problem.')); });
    return () => controller.abort();
  }, [user?.id, user?._id]);
  const change = event => { setForm(current => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value, ...(event.target.name === 'subject' && event.target.value !== 'Veylo Pro' ? { paymentId: '', refundReason: '' } : {}) })); requestKey.current = crypto.randomUUID(); };
  async function submit(event) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const payload = { subject: form.subject, message: form.message.trim(), channel: draft.channel || 'web', requestKey: requestKey.current,
        includeDiagnostics: form.includeDiagnostics, expected: form.expected, startedAt: form.startedAt,
        ...(user ? {} : { name: form.name, email: form.email }),
        ...(form.deliveryPublicId ? { deliveryPublicId: form.deliveryPublicId } : {}),
        ...(draft.deliveryId ? { deliveryId: draft.deliveryId } : {}),
        ...(draft.context && form.includeDiagnostics ? { context: { ...draft.context, capturedAt: Date.now() } } : {}),
        ...(form.paymentId ? { paymentId: form.paymentId } : {}), ...(form.refundReason ? { refundReason: form.refundReason } : {}) };
      const response = await api.post('/v1/support/tickets', payload);
      const ticket = response.data.data;
      let attachmentError = '';
      for (const file of files) {
        try { const data = new FormData(); data.append('screenshot', file); await api.post(`/v1/support/tickets/${ticket.id}/attachments`, data); }
        catch { attachmentError = 'Your message was saved, but a screenshot did not upload. Open the conversation to attach it again.'; }
      }
      setSent(ticket); setError(attachmentError); onSent?.(ticket);
    } catch (error) { setError(apiMessage(error, 'We could not confirm this request. Try sending again; the same request will not be created twice.')); }
    finally { lock.current = false; setBusy(false); }
  }
  if (sent) return <div className="vs-sent" role="status"><span className="vs-sent-icon"><Check size={25} /></span><p className="vs-kicker">Message received · {sent.ticketNumber}</p><h3>A person will take it from here.</h3><p>{sent.signedIn ? 'Your message is in your support inbox. Replies will appear there and be sent to your account email.' : `The team will reply to ${form.email}. Keep your reference if you need to follow up.`}</p>{error && <p role="alert">{error}</p>}{sent.signedIn && <Link className="vs-primary" to={`/contact?ticket=${sent.id}`} onClick={onOpenInbox}>Open conversation<ArrowUpRight size={17} /></Link>}</div>;
  return <form className={`vs-compose${compact ? ' is-compact' : ''}`} onSubmit={submit}>
    {draft.channel === 'assistant' && <div className="vs-assistant-note"><ShieldCheck size={18} /><p>Prepared with Veylo Assistant. Check the wording before sending. Only this message and the context shown below will be shared.</p></div>}
    {user ? <div className="vs-identity"><span className="vs-avatar">{(account?.name || user.name || 'V').slice(0, 1)}</span><div><strong>{account?.name || user.name || 'Your account'}</strong><span>{account?.email || user.email || 'Your verified account email'}</span></div><Check size={17} /></div> : <div className="vs-form-grid"><label>Your name<input name="name" autoComplete="name" required minLength={2} maxLength={100} value={form.name} onChange={change} /></label><label>Reply email<input name="email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={change} /></label></div>}
    <label>What do you need help with?<span className="vs-select"><select name="subject" value={form.subject} onChange={change}>{SUPPORT_SUBJECTS.map(subject => <option key={subject}>{subject}</option>)}</select><ChevronDown size={16} /></span></label>
    {form.subject === 'Veylo Pro' && user && <div className="vs-billing-fields"><label>Related payment <small>Optional unless requesting a refund</small><select name="paymentId" value={form.paymentId} onChange={change}><option value="">Choose a payment</option>{account?.payments?.map(payment => <option value={payment._id} key={payment._id}>{supportMoney(payment.amountKobo)} · {supportDate(payment.paidAt)} · {payment.reference}</option>)}</select></label><label>Do you want a refund review?<select name="refundReason" value={form.refundReason} onChange={change}><option value="">No, I need payment or subscription help</option>{Object.entries(REFUND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{form.refundReason && <p>A person will review this against the <Link to="/refund-policy">refund policy</Link>. Sending a request does not approve a refund or stop renewal.</p>}</div>}
    <label>Your message<textarea name="message" aria-label="Your message" required minLength={10} maxLength={4000} rows={compact ? 5 : 7} value={form.message} onChange={change} placeholder="Tell us what happened and what you need help with." /><small className="vs-count" aria-hidden="true">{form.message.length.toLocaleString()} / 4,000</small></label>
    <details className="vs-extra"><summary>Add details that could help <span>Optional</span></summary><div className="vs-extra-fields"><label>What did you expect?<textarea name="expected" rows={2} maxLength={1000} value={form.expected} onChange={change} /></label><div className="vs-form-grid"><label>When did it start?<input name="startedAt" maxLength={120} value={form.startedAt} onChange={change} placeholder="For example, this morning" /></label><label>Delivery link or ID<input name="deliveryPublicId" maxLength={200} value={form.deliveryPublicId} onChange={change} placeholder="If this concerns a delivery" /></label></div>{user && <label className="vs-file"><FileImage size={20} /><span>Add screenshots <small>JPG, PNG or WebP · up to 4 MB each · 3 at a time</small></span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { const chosen = [...event.target.files].slice(0, 3); if (chosen.some(file => file.size > 4 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setError('Choose JPG, PNG or WebP files up to 4 MB each.'); return; } setFiles(chosen); setError(''); }} /></label>}{files.map((file, index) => <div className="vs-file-name" key={`${file.name}-${index}`}><span>{file.name}</span><button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}><X size={15} /></button></div>)}</div></details>
    <div className="vs-diagnostics"><label><input type="checkbox" name="includeDiagnostics" checked={form.includeDiagnostics} onChange={change} /><span>Include useful technical details</span></label><p>{user ? 'Your account plan, browser and device' : 'Your browser and device'}{draft.context ? ', current page and recent workflow steps' : ''}. Typed fields, passwords and private photo links are excluded from automatic context.</p>{draft.context && <details><summary>Review page context</summary><p>Page: {draft.context.page}</p><p>{Object.entries(draft.context.workflow || {}).filter(([key]) => key !== 'deliveryId').map(([key, value]) => `${key}: ${value}`).join(' · ') || 'No additional workflow details.'}</p><p>Recent steps: {(draft.context.recent || []).slice(-5).map(item => item.event.replaceAll('-', ' ')).join(', ') || 'None'}</p></details>}</div>
    {error && <p className="vs-error" role="alert">{error}</p>}
    <div className="vs-submit"><button className="vs-primary" type="submit" disabled={busy || Boolean(form.refundReason && !form.paymentId)}>{busy ? <LoaderCircle size={18} className="vs-spin" /> : <Send size={17} />}{busy ? 'Sending…' : 'Send to a person'}</button>{onCancel && <button type="button" className="vs-secondary" onClick={onCancel}>Close</button>}</div>
    <p className="vs-private-note">Leave out passwords, access codes, card details and private client photographs.</p>
  </form>;
}
