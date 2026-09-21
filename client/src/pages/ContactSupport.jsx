import React, { useState } from 'react';
import { AlertCircle, ArrowUpRight, Check, Mail, Send } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Eyebrow, Intro, Page, Photo, Reveal, TextLink } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

const subjects = ['Delivery support', 'Upload problem', 'Delivery formats', 'Veylo Portfolio', 'Veylo Pro', 'Account help', 'Privacy or deletion request', 'Something else'];

export default function ContactSupport() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', subject: subjects.includes(params.get('subject')) ? params.get('subject') : subjects[0], deliveryPublicId: '', message: '' });
  const [state, setState] = useState({ submitting: false, success: '', error: '' });
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setState({ submitting: true, success: '', error: '' });
    try {
      const response = await api.post('/v1/support/tickets', { ...form, deliveryPublicId: form.deliveryPublicId.trim() || undefined });
      setState({ submitting: false, success: `Request ${response.data?.data?.ticketNumber || ''} is with the Veylo team. We will reply to ${form.email.trim()}.`, error: '' });
      setForm(current => ({ ...current, message: '', deliveryPublicId: '' }));
    } catch (error) {
      setState({ submitting: false, success: '', error: apiMessage(error, 'We could not send this request. Email info@veylo.com.ng if the problem continues.') });
    }
  };

  return <Page><Intro eyebrow="Get in touch" title="Let’s talk about" accent="your next delivery." description="A question about a format, a problem with a delivery, or an idea from your studio. The support form creates a trackable request for the Veylo team." /><section className="v-wrap v-contact-grid"><Reveal className="v-contact-info"><Eyebrow><Mail size={16} />The studio inbox</Eyebrow><a href="mailto:info@veylo.com.ng">info@veylo.com.ng</a><p className="v-copy">If you need help with a delivery, include its public link or ID and tell us what happened. Leave out passwords, card details, and confidential client information.</p><div className="v-contact-image"><Photo name="editorial" alt="A portrait from the Veylo sample collection" /></div><div className="mt-6"><TextLink to="/client-experience">New here? See how delivery works</TextLink></div></Reveal><Reveal><form className="v-form" onSubmit={submit}><div className="v-form-row"><div className="v-field"><label htmlFor="contact-name">Your name</label><input id="contact-name" name="name" autoComplete="name" required maxLength={100} value={form.name} onChange={update} placeholder="Your name" /></div><div className="v-field"><label htmlFor="contact-email">Email address</label><input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={update} placeholder="you@yourstudio.com" /></div></div><div className="v-field"><label htmlFor="contact-subject">What can we help with?</label><select id="contact-subject" name="subject" value={form.subject} onChange={update}>{subjects.map(item => <option key={item}>{item}</option>)}</select></div><div className="v-field"><label htmlFor="contact-delivery">Delivery link or ID <small>Optional</small></label><input id="contact-delivery" name="deliveryPublicId" maxLength={120} value={form.deliveryPublicId} onChange={update} placeholder="Paste the link if this is about one delivery" /></div><div className="v-field"><label htmlFor="contact-message">Your message</label><textarea id="contact-message" name="message" required minLength={10} maxLength={4000} value={form.message} onChange={update} placeholder="Tell us a little about it…" rows={7} /></div><button className="v-button" type="submit" disabled={state.submitting}>{state.submitting ? <><Send size={18} className="animate-pulse" />Sending request…</> : <>Send to support<ArrowUpRight size={18} /></>}</button>{state.success && <p className="v-form-status" role="status"><Check size={16} />{state.success}</p>}{state.error && <p className="v-form-status" role="alert"><AlertCircle size={16} />{state.error}</p>}<p className="v-form-note">We keep this request with your name, reply email, subject, and message so the team can follow it through. Never send a password or payment-card details.</p></form></Reveal></section></Page>;
}
