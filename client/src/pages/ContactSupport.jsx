import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Mail } from 'lucide-react';
import { Eyebrow, Intro, Page, Photo, Reveal, TextLink } from '../components/PublicDesign.jsx';

const subjects = ['Delivery support', 'Delivery formats', 'Veylo Portfolio', 'Veylo Pro', 'Account help', 'Privacy or deletion request', 'Something else'];

export default function ContactSupport() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', subject: subjects.includes(params.get('subject')) ? params.get('subject') : subjects[0], message: '' });
  const [prepared, setPrepared] = useState(false);
  const update = event => { setPrepared(false); setForm({ ...form, [event.target.name]: event.target.value }); };
  const submit = event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const subject = 'Veylo: ' + form.subject;
    const body = 'Name: ' + form.name.trim() + '\nReply email: ' + form.email.trim() + '\n\n' + form.message.trim();
    window.location.href = 'mailto:info@veylo.com.ng?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    setPrepared(true);
  };

  return <Page><Intro eyebrow="Get in touch" title="Let’s talk about" accent="your next delivery." description="A question about a format, a problem with a delivery, or an idea from your studio. We’d like to hear it." /><section className="v-wrap v-contact-grid"><Reveal className="v-contact-info"><Eyebrow><Mail size={16} />The studio inbox</Eyebrow><a href="mailto:info@veylo.com.ng">info@veylo.com.ng</a><p className="v-copy">If you need help with a delivery, include its link and tell us what happened. Please leave out passwords, card details, and confidential client information.</p><div className="v-contact-image"><Photo name="editorial" alt="A portrait from the Veylo sample collection" /></div><div className="mt-6"><TextLink to="/client-experience">New here? See how delivery works</TextLink></div></Reveal><Reveal><form className="v-form" onSubmit={submit}><div className="v-form-row"><div className="v-field"><label htmlFor="contact-name">Your name</label><input id="contact-name" name="name" autoComplete="name" required maxLength={100} value={form.name} onChange={update} placeholder="Your name" /></div><div className="v-field"><label htmlFor="contact-email">Email address</label><input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={update} placeholder="you@yourstudio.com" /></div></div><div className="v-field"><label htmlFor="contact-subject">What can we help with?</label><select id="contact-subject" name="subject" value={form.subject} onChange={update}>{subjects.map(item => <option key={item}>{item}</option>)}</select></div><div className="v-field"><label htmlFor="contact-message">Your message</label><textarea id="contact-message" name="message" required minLength={10} maxLength={2000} value={form.message} onChange={update} placeholder="Tell us a little about it…" rows={6} /></div><button className="v-button" type="submit">Open email draft<ArrowUpRight size={18} /></button><p className="v-form-note">This opens your email app with the message filled in. You review it and press send there.</p>{prepared && <p className="v-form-status" role="status">Your email app should open with a draft. Nothing has been sent by this page. If it did not open, email info@veylo.com.ng directly.</p>}</form></Reveal></section></Page>;
}
