import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { ArrowDown, ArrowUp, Image as ImageIcon, Plus, Trash2, Upload } from 'lucide-react';
import PortfolioPhotoPicker from './PortfolioPhotoPicker.jsx';
import { PORTFOLIO_LIMITS, normalizePortfolioContent, normalizeProjectDetails } from '../services/portfolioContent.mjs';
import { mediaUrl } from '../services/portfolio.js';
import { uploadLibraryPhotos } from '../utils/storageUpload.js';
import { apiMessage } from '../services/api.js';
import './PortfolioContentEditor.css';
const contentOf = form => normalizePortfolioContent(form.content, form.categories);
const changeContent = (setForm, patch) => setForm(current => ({ ...current, content: { ...contentOf(current), ...patch } }));

export function PortfolioStudioExtras({ form, setForm, Field }) {
  const content = contentOf(form), [choosing, setChoosing] = useState(''), [uploading, setUploading] = useState(''), [error, setError] = useState('');
  const input = useRef(null), trigger = useRef(null), uploadRole = useRef('');
  const profile = (key, value) => setForm(current => ({ ...current, content: { ...contentOf(current), profile: { ...contentOf(current).profile, [key]: value } } }));
  const assign = (role, photo) => setForm(current => {
    const next = contentOf(current), previousId = next.profile[role];
    const otherId = next.profile[role === 'portraitId' ? 'logoId' : 'portraitId'];
    const media = current.profileMedia.filter(item => item.id !== previousId || item.id === otherId);
    return { ...current, profileMedia: [...media.filter(item => item.id !== photo.id), photo], content: { ...next, profile: { ...next.profile, [role]: photo.id } } };
  });
  async function upload(event) {
    const file = event.target.files?.[0], role = uploadRole.current;
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return setError('Use a JPEG, PNG or WebP image no larger than 5 MB.');
    setUploading(role); setError('');
    try {
      const [asset] = await uploadLibraryPhotos([file], { folder: 'Portfolio profile' });
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(asset.publicId));
      const id = `p-${Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24)}`;
      assign(role, { id, publicId: asset.publicId, alt: '', url: mediaUrl(`/api/v1/portfolios/mine/source-media?publicId=${encodeURIComponent(asset.publicId)}`), thumbnailUrl: mediaUrl(`/api/v1/portfolios/mine/source-media?publicId=${encodeURIComponent(asset.publicId)}`), width: asset.width, height: asset.height, title: '', category: 'Selected work', featured: true, crop: 'fit', focalX: 50, focalY: 50 });
    } catch (err) { setError(apiMessage(err, 'The profile image could not be uploaded. Try again.')); }
    finally { setUploading(''); }
  }
  return <section className="v-pcontent-section"><h2>The photographer behind the work</h2><p>Give visitors a clear introduction. Only your published version appears on the public page.</p><div className="v-pedit-form-grid">
    <div><Field label="Photography specialties" value={content.profile.specialties} onChange={value => profile('specialties', value)} maxLength={140} placeholder="Traditional weddings, birthdays and portraits" />
      <Field label="About the photographer or team" value={content.profile.about} onChange={value => profile('about', value)} maxLength={1200} multiline rows={6} hint="Describe how you work and what clients can expect. Use your own words." />
      <Field label="Service areas" value={content.profile.serviceAreas} onChange={value => profile('serviceAreas', value)} maxLength={180} placeholder="Lagos, Abuja and across Nigeria" />
      <Field label="Travel information" value={content.profile.travel} onChange={value => profile('travel', value)} maxLength={240} multiline rows={3} placeholder="Explain travel availability and any extra costs." /></div>
    <div className="v-pcontent-media">{[['portraitId', 'Photographer or team portrait'], ['logoId', 'Studio logo']].map(([role, label]) => {
      const photo = form.profileMedia.find(item => item.id === content.profile[role]);
      return <article key={role}><h3>{label}</h3>{photo ? <img className={role === 'logoId' ? 'is-logo' : ''} src={photo.thumbnailUrl || photo.url} alt={photo.alt || label} /> : <div className="v-pcontent-media-empty"><ImageIcon size={24} /><span>Optional</span></div>}
        <div className="v-pcontent-actions"><button type="button" ref={choosing === role ? trigger : undefined} onClick={event => { trigger.current = event.currentTarget; setChoosing(role); }}><ImageIcon size={16} />Choose image</button><button type="button" disabled={Boolean(uploading)} onClick={() => { uploadRole.current = role; input.current?.click(); }}><Upload size={16} />{uploading === role ? 'Uploading…' : 'Upload image'}</button>{photo && <button type="button" onClick={() => { profile(role, ''); setForm(current => ({ ...current, profileMedia: current.profileMedia.filter(item => item.id !== photo.id || item.id === contentOf(current).profile[role === 'portraitId' ? 'logoId' : 'portraitId']) })); }}>Remove image</button>}</div>
        {photo && <Field label={`${label} description`} value={photo.alt} onChange={alt => setForm(current => ({ ...current, profileMedia: current.profileMedia.map(item => item.id === photo.id ? { ...item, alt } : item) }))} maxLength={180} />}</article>;
    })}<small>A portrait and logo have their own two-image allowance. Uploads are saved in your library; they become public only when you publish.</small><Link to="/library">Open your image library</Link></div>
  </div><input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={upload} />{error && <p role="alert" className="v-pedit-error">{error}</p>}
    {choosing && <PortfolioPhotoPicker title={choosing === 'portraitId' ? 'Choose a portrait' : 'Choose a logo'} items={[]} maxPhotos={1} triggerRef={trigger} onClose={() => setChoosing('')} onAdd={photos => { if (photos[0]) assign(choosing, photos[0]); }} />}
    <details className="v-pedit-disclosure" open={content.process.some(step => !step.title || !step.description) || undefined}><summary>How working with you works <span>Optional</span></summary><PortfolioCollectionEditor form={form} setForm={setForm} Field={Field} kind="process" /></details>
  </section>;
}

const definitions = {
  services: { title: 'Services', introduction: 'Explain the shoots you offer, what is included and how to ask about one.', singular: 'service', fields: [['title', 'Service title', 100], ['description', 'Service description', 600, true], ['coverage', 'Coverage or session length', 180], ['deliverables', 'What the client receives', 300, true], ['turnaround', 'Delivery time', 180]] },
  testimonials: { title: 'Client feedback', introduction: 'Publish real feedback only when you have permission to use it.', singular: 'testimonial', fields: [['quote', 'Client quote', 600, true], ['attribution', 'Approved client attribution', 100], ['context', 'Shoot or context', 100]] },
  faqs: { title: 'Questions clients ask', introduction: 'Answer practical questions about dates, travel, preparation and delivery.', singular: 'FAQ', fields: [['question', 'Question', 180], ['answer', 'Answer', 800, true]] },
  process: { title: 'How working with you works', introduction: 'Explain the real steps from the first enquiry to receiving the finished photographs.', singular: 'process step', fields: [['title', 'Step title', 100], ['description', 'Step description', 400, true]] }
};
export function PortfolioCollectionEditor({ form, setForm, Field, kind }) {
  const content = contentOf(form), config = definitions[kind], rows = content[kind], reduced = useVeyloReducedMotion();
  const patch = (id, changes) => setForm(current => { const next = contentOf(current); return { ...current, content: { ...next, [kind]: next[kind].map(row => row.id === id ? { ...row, ...changes } : row) } }; });
  const add = () => { const row = { id: crypto.randomUUID(), ...Object.fromEntries(config.fields.map(([key]) => [key, ''])), ...(kind === 'services' ? { priceMode: 'hidden', price: 0, priceMax: 0, projectIds: [] } : kind === 'testimonials' ? { projectId: '', permission: false } : {}) }; changeContent(setForm, { [kind]: [...rows, row] }); };
  const move = (index, offset) => { const next = [...rows]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; changeContent(setForm, { [kind]: next }); };
  return <section className="v-pcontent-section"><div className="v-pedit-section-head"><div><h2>{config.title}</h2><p>{config.introduction}</p></div><button type="button" disabled={rows.length >= PORTFOLIO_LIMITS[kind]} onClick={add}><Plus size={16} />Add {config.singular}</button></div>
    <div className="v-pcontent-entries">{rows.map((row, index) => <motion.article key={row.id} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="v-pcontent-entry"><header><h3>{row.title || row.question || row.attribution || `${config.singular} ${index + 1}`}</h3><div><button type="button" aria-label={`Move ${config.singular} ${index + 1} earlier`} disabled={!index} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" aria-label={`Move ${config.singular} ${index + 1} later`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button type="button" aria-label={`Remove ${config.singular} ${index + 1}`} onClick={() => changeContent(setForm, { [kind]: rows.filter(item => item.id !== row.id) })}><Trash2 size={16} /></button></div></header>
      <div className="v-pcontent-fields">{config.fields.map(([key, label, max, multiline]) => <Field key={key} label={`${label} ${index + 1}`} value={row[key]} onChange={value => patch(row.id, { [key]: value })} maxLength={max} multiline={multiline} rows={multiline ? 3 : undefined} />)}</div>
      {kind === 'services' && <><label className="v-pedit-field"><span>Price display</span><select aria-label={`Price display ${index + 1}`} value={row.priceMode} onChange={event => patch(row.id, { priceMode: event.target.value })}><option value="hidden">Do not show a price</option><option value="starting">Starting price</option><option value="range">Price range</option><option value="quote">Request a quote</option></select><small>These are your shoot prices, independent of your Veylo plan.</small></label>{['starting', 'range'].includes(row.priceMode) && <div className="v-pcontent-fields"><Field label={`Starting price in naira ${index + 1}`} type="number" min={0} max={1e9} step={1} value={row.price} onChange={value => patch(row.id, { price: Math.max(0, Math.round(Number(value) || 0)) })} />{row.priceMode === 'range' && <Field label={`Upper price in naira ${index + 1}`} type="number" min={0} max={1e9} step={1} value={row.priceMax} onChange={value => patch(row.id, { priceMax: Math.max(0, Math.round(Number(value) || 0)) })} />}</div>}<fieldset className="v-pcontent-project-links"><legend>Related work</legend>{form.projects.map(project => <label key={project.id}><input type="checkbox" checked={row.projectIds.includes(project.id)} onChange={event => patch(row.id, { projectIds: event.target.checked ? [...row.projectIds, project.id].slice(0, 8) : row.projectIds.filter(id => id !== project.id) })} />{project.title || 'Untitled project'}</label>)}</fieldset></>}
      {kind === 'testimonials' && <><label className="v-pedit-field"><span>Related project</span><select aria-label={`Testimonial project ${index + 1}`} value={row.projectId} onChange={event => patch(row.id, { projectId: event.target.value })}><option value="">No related project</option>{form.projects.map(project => <option value={project.id} key={project.id}>{project.title || 'Untitled project'}</option>)}</select></label><label className="v-pedit-toggle"><input type="checkbox" checked={row.permission} onChange={event => patch(row.id, { permission: event.target.checked })} />I have permission to publish this quote and attribution.</label></>}
    </motion.article>)}</div>{!rows.length && <p className="v-pcontent-empty">Optional. This section stays off your public page until you add content and publish it.</p>}
  </section>;
}

export function PortfolioProjectExtras({ project, projects, patchProject, Field }) {
  const details = normalizeProjectDetails(project);
  return <section className="v-pcontent-project-details"><h3>Context for this shoot</h3>{[['shootType', 'Shoot type', 100], ['location', 'Shoot city', 120], ['venue', 'Venue, if approved', 120], ['brief', 'What the client wanted', 600, true], ['approach', 'Your approach to the shoot', 800, true], ['credits', 'Credits', 300, true]].map(([key, label, maxLength, multiline]) => <Field key={key} label={label} value={details[key]} maxLength={maxLength} multiline={multiline} rows={multiline ? 3 : undefined} onChange={value => patchProject({ [key]: value })} />)}<p>These details are public when published. Do not copy private client notes or addresses here.</p>
    <h3>Project notes</h3>{details.narrative.map((block, index) => <div className="v-pcontent-entry" key={block.id}><Field label={`Project note heading ${index + 1}`} value={block.title} maxLength={100} onChange={title => patchProject({ narrative: details.narrative.map(item => item.id === block.id ? { ...item, title } : item) })} /><Field label={`Project note ${index + 1}`} value={block.text} maxLength={800} multiline rows={4} onChange={text => patchProject({ narrative: details.narrative.map(item => item.id === block.id ? { ...item, text } : item) })} /><button type="button" onClick={() => patchProject({ narrative: details.narrative.filter(item => item.id !== block.id) })}>Remove note</button></div>)}<button type="button" disabled={details.narrative.length >= 6} onClick={() => patchProject({ narrative: [...details.narrative, { id: crypto.randomUUID(), title: '', text: '' }] })}><Plus size={16} />Add project note</button>
    <fieldset className="v-pcontent-project-links"><legend>Related projects</legend>{projects.filter(item => item.id !== project.id).map(item => <label key={item.id}><input type="checkbox" checked={details.relatedIds.includes(item.id)} onChange={event => patchProject({ relatedIds: event.target.checked ? [...details.relatedIds, item.id].slice(0, 8) : details.relatedIds.filter(id => id !== item.id) })} />{item.title || 'Untitled project'}</label>)}</fieldset>
  </section>;
}
