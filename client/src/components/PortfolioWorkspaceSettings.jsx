import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { APP_URL } from '../config/env.js';

const sectionNames = { about: 'About', services: 'Services', testimonials: 'Client feedback', process: 'Working process', faqs: 'FAQs' };
const contentPatch = (setForm, changes) => setForm(current => ({ ...current, content: { ...current.content, ...changes } }));

export function PortfolioContactSettings({ form, setForm, Field }) {
  const { contact } = form.content;
  const update = (key, value) => setForm(current => ({ ...current, content: { ...current.content, contact: { ...current.content.contact, [key]: value } } }));
  const enabled = form.direction.showContact && !contact.showcaseOnly;
  const hasRoute = form.whatsapp || form.instagram || contact.email || contact.formEnabled;
  return <section className="v-pcontent-section">
    <h3>Enquiry options</h3>
    <Field label="Public email address" type="email" value={contact.email} maxLength={254} onChange={value => update('email', value)} hint="Optional. This address appears on your published portfolio." />
    <label className="v-pedit-toggle"><input type="checkbox" checked={enabled} onChange={event => {
      const checked = event.target.checked;
      setForm(current => ({ ...current, direction: { ...current.direction, showContact: checked }, content: { ...current.content, contact: { ...current.content.contact, showcaseOnly: !checked } } }));
    }} />Let visitors contact me from my portfolio</label>
    {!enabled && <p>Your portfolio is set to showcase only. Your contact details stay saved.</p>}
    <label className="v-pedit-toggle"><input type="checkbox" checked={contact.formEnabled} onChange={event => update('formEnabled', event.target.checked)} />Accept enquiries through a short form</label>
    <p className="v-pedit-help">Form enquiries go to your private inbox. WhatsApp and email conversations stay in those apps.</p>
    <label className="v-pedit-toggle"><input type="checkbox" checked={form.content.mobileEnquiry} onChange={event => contentPatch(setForm, { mobileEnquiry: event.target.checked })} />Keep an enquiry shortcut visible while browsing on phones</label>
    <Field label="Response note" value={contact.responseNote} maxLength={240} multiline rows={3} onChange={value => update('responseNote', value)} placeholder="For example, when clients can expect a reply." />
    {enabled && !hasRoute && <p className="v-pedit-error">Add WhatsApp, Instagram, email or the enquiry form so visitors can reach you.</p>}
  </section>;
}

export function PortfolioHomeArrangement({ form, setForm }) {
  return <details className="v-pedit-disclosure v-pedit-home-mode"><summary>Homepage · {form.content.homeMode === 'projects' ? 'Projects first' : 'Photographs first'} <span>Change</span></summary><label className="v-pedit-field"><span>What opens your homepage?</span><select aria-label="Homepage presentation" value={form.content.homeMode} onChange={event => contentPatch(setForm, { homeMode: event.target.value })}>
    <option value="gallery">Photographs first</option><option value="projects">Projects first</option>
  </select><small>Projects first gives your collections priority. A photograph appears once; excluded photos stay excluded.</small></label></details>;
}

export function PortfolioSectionSettings({ form, setForm }) {
  const sections = form.content.sections;
  const move = (index, offset) => {
    const next = [...sections];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    contentPatch(setForm, { sections: next });
  };
  return <section><h3>Supporting sections</h3><p>Choose what appears after your work, then arrange its order.</p><ol className="v-pcontent-section-order">{sections.map((section, index) => <li key={section.id}>
    <label><input type="checkbox" checked={section.visible} onChange={event => contentPatch(setForm, { sections: sections.map(item => item.id === section.id ? { ...item, visible: event.target.checked } : item) })} />{sectionNames[section.id]}</label>
    <div><button type="button" disabled={!index} aria-label={`Move ${sectionNames[section.id]} section earlier`} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" disabled={index === sections.length - 1} aria-label={`Move ${sectionNames[section.id]} section later`} onClick={() => move(index, 1)}><ArrowDown size={16} /></button></div>
  </li>)}</ol></section>;
}

export function PortfolioShareSettings({ form, setForm, Field }) {
  const { share } = form.content;
  const update = (key, value) => setForm(current => ({ ...current, content: { ...current.content, share: { ...current.content.share, [key]: value } } }));
  const photo = form.items.find(item => item.id === share.coverId) || form.items.find(item => item.publicId === form.heroPublicId);
  return <section className="v-pcontent-section"><h2>Link preview</h2><p>The title, description and photograph shown when you share your portfolio link.</p><div className="v-pedit-form-grid"><div>
    <Field label="Sharing title" value={share.title} maxLength={100} onChange={value => update('title', value)} placeholder={`${form.studioName || 'Your studio'} — Portfolio`} />
    <Field label="Sharing description" value={share.description} maxLength={240} multiline rows={3} onChange={value => update('description', value)} placeholder={form.introLine || form.bio} />
    <label className="v-pedit-field"><span>Sharing photograph</span><select aria-label="Sharing photograph" value={share.coverId} onChange={event => update('coverId', event.target.value)}><option value="">Use the opening photograph</option>{form.items.filter(item => item.featured || form.direction.showCategories && item.category !== 'Selected work' || form.projects.some(project => project.photoIds.includes(item.id))).map((item, index) => <option value={item.id} key={item.id}>{item.title || `Photograph ${index + 1}`}</option>)}</select></label>
  </div><div className="v-pcontent-share-preview">{photo && <img src={photo.thumbnailUrl || photo.url} alt="Sharing photograph preview" />}<strong>{share.title || `${form.studioName || 'Your studio'} — Portfolio`}</strong><p>{share.description || form.introLine || form.bio}</p><small>{new URL(APP_URL).host}/@{form.handle || 'your-studio'}</small></div></div></section>;
}
