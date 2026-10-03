import React, { useRef, useState } from 'react';
import { Check, Send } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';

export default function PortfolioEnquiryForm({ handle, context = {}, preview = false }) {
  const [values, setValues] = useState({ name: '', replyMethod: 'whatsapp', replyTo: '', shootType: '', message: '', date: '', location: '', budget: '', website: '', permission: false });
  const [state, setState] = useState('idle'), [error, setError] = useState('');
  const attempt = useRef(null);
  const field = (key, value) => { setValues(current => ({ ...current, [key]: value })); };
  async function submit(event) {
    event.preventDefault();
    if (preview || state === 'sending') return;
    const payload = { ...values, projectId: context.projectId || '', categoryId: context.categoryId || '', serviceId: context.serviceId || '' };
    const fingerprint = JSON.stringify(payload);
    // Retrying unchanged details reuses the same id, including a lost success response.
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, requestId: crypto.randomUUID() };
    setState('sending'); setError('');
    try {
      await api.post(`/v1/portfolios/public/${encodeURIComponent(handle)}/enquiries`, { ...payload, requestId: attempt.current.requestId });
      setState('sent');
    } catch (err) { setState('idle'); setError(apiMessage(err, 'Your enquiry could not be sent. Your details are still here; try again.')); }
  }
  if (state === 'sent') return <div className="vpc-enquiry-success" role="status"><Check size={24} /><h3>Your enquiry has been received.</h3><p>The photographer will reply using the details you provided. This does not reserve a date or confirm a booking.</p><button type="button" onClick={() => { setState('idle'); setValues({ ...values, message: '', permission: false }); attempt.current = null; }}>Send another enquiry</button></div>;
  return <form className="vpc-enquiry-form" onSubmit={submit}><fieldset disabled={state === 'sending'}>
    <h3>Tell us about your shoot</h3>{context.label && <p className="vpc-enquiry-context">Enquiring about {context.label}</p>}
    <div className="vpc-field-grid">
      <label>Your name<input autoComplete="name" required minLength={2} maxLength={100} value={values.name} onChange={event => field('name', event.target.value)} /></label>
      <label>How should we reply?<select value={values.replyMethod} onChange={event => field('replyMethod', event.target.value)}><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
      <label>{values.replyMethod === 'email' ? 'Email address' : 'WhatsApp number'}<input type={values.replyMethod === 'email' ? 'email' : 'tel'} autoComplete={values.replyMethod === 'email' ? 'email' : 'tel'} required minLength={5} maxLength={254} placeholder={values.replyMethod === 'whatsapp' ? '08012345678 or +234…' : ''} value={values.replyTo} onChange={event => field('replyTo', event.target.value)} /></label>
      <label>What are you planning?<input required minLength={2} maxLength={100} placeholder="Traditional wedding, portraits, lookbook…" value={values.shootType} onChange={event => field('shootType', event.target.value)} /></label>
      <label>Date, if decided<input type="date" value={values.date} onChange={event => field('date', event.target.value)} /><small>Leave this empty if you have not chosen a date.</small></label>
      <label>Location (optional)<input maxLength={120} value={values.location} onChange={event => field('location', event.target.value)} /></label>
      <label>Budget (optional)<input maxLength={100} placeholder="Your budget or range in ₦" value={values.budget} onChange={event => field('budget', event.target.value)} /></label>
    </div>
    <label>Anything else we should know?<textarea required minLength={10} maxLength={2000} rows={5} value={values.message} onChange={event => field('message', event.target.value)} /></label>
    <label className="vpc-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={values.website} onChange={event => field('website', event.target.value)} /></label>
    <label className="vpc-consent"><input type="checkbox" required checked={values.permission} onChange={event => field('permission', event.target.checked)} /><span>I agree to share these details with this photographer so they can reply to my enquiry.</span></label>
    {error && <p role="alert">{error}</p>}
    {preview && <p>This form is a private preview. It does not send an enquiry.</p>}
    <button className="vpc-primary" type="submit" disabled={preview || state === 'sending'}><Send size={17} />{state === 'sending' ? 'Sending…' : 'Send enquiry'}</button>
    <p className="vpc-enquiry-note">Sending an enquiry does not reserve a date. Please arrange any booking directly with the photographer.</p>
  </fieldset></form>;
}
