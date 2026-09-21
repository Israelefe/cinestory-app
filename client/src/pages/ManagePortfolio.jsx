import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Clapperboard, Eye, Image, Instagram, LoaderCircle, MapPin, Plus, Save, Send, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { APP_URL } from '../config/env.js';
import './ManagePortfolio.css';

const empty = { handle: '', studioName: '', bio: '', headline: '', introLine: '', location: '', contactLabel: 'Ask about a shoot', instagram: '', whatsapp: '', items: [], direction: { background: 'ink', accent: '#ff9b8e', typeStyle: 'editorial', rhythm: 'measured' } };
function portfolioUrl(handle) {
  const origin = typeof window !== 'undefined' ? window.location.origin : APP_URL;
  return `${origin.replace(/\/$/, '')}/@${encodeURIComponent(handle || '')}`;
}
function changeDate(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value)); } catch { return ''; }
}

export default function ManagePortfolio() {
  const reduced = useReducedMotion();
  const [form, setForm] = useState(empty);
  const [sources, setSources] = useState([]);
  const [status, setStatus] = useState('draft');
  const [access, setAccess] = useState('unavailable');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const [directing, setDirecting] = useState(false);
  const [changePolicy, setChangePolicy] = useState({ studioNameNextChangeAt: null, handleNextChangeAt: null });
  const [savedIdentity, setSavedIdentity] = useState({ studioName: '', handle: '' });

  useEffect(() => {
    Promise.allSettled([api.get('/v1/portfolios/mine'), api.get('/v1/portfolios/sources')]).then(([profile, sourceList]) => {
      if (profile.status === 'fulfilled') { const next = { ...empty, ...profile.value.data.data }; setForm(next); setSavedIdentity({ studioName: next.studioName, handle: next.handle }); setChangePolicy(profile.value.data.changePolicy || { studioNameNextChangeAt: null, handleNextChangeAt: null }); setStatus(profile.value.data.status); setAccess(profile.value.data.access); }
      else toast.error(apiMessage(profile.reason, 'We could not open your portfolio.'));
      if (sourceList.status === 'fulfilled') setSources(sourceList.value.data.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const chosen = useMemo(() => new Set(form.items.map(item => item.publicId)), [form.items]);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const setDirection = (key, value) => setForm(current => ({ ...current, direction: { ...current.direction, [key]: value } }));
  const add = source => setForm(current => current.items.length >= 50 || current.items.some(item => item.publicId === source.publicId) ? current : ({ ...current, items: [...current.items, { publicId: source.publicId, title: source.title || '', category: 'Selected work', thumbnailUrl: source.thumbnailUrl }] }));
  const remove = publicId => setForm(current => ({ ...current, items: current.items.filter(item => item.publicId !== publicId) }));
  const studioNameLocked = Boolean(changePolicy.studioNameNextChangeAt);
  const handleLocked = Boolean(changePolicy.handleNextChangeAt);

  async function save(showMessage = true) {
    try {
      setSaving(true);
      const studioNameChanged = Boolean(savedIdentity.studioName) && form.studioName.trim() !== savedIdentity.studioName.trim();
      const handleChanged = Boolean(savedIdentity.handle) && form.handle !== savedIdentity.handle;
      if ((studioNameChanged || handleChanged) && typeof window !== 'undefined' && !window.confirm('This changes information clients use to find your studio. Your old portfolio address will redirect for 90 days. Continue?')) return false;
      const payload = { ...form, items: form.items.map(({ publicId, title, category }) => ({ publicId, title, category })) };
      const { data } = await api.put('/v1/portfolios/mine', payload);
      const next = { ...form, ...data.data };
      setForm(current => ({ ...current, ...data.data }));
      setSavedIdentity({ studioName: next.studioName, handle: next.handle });
      setChangePolicy(data.changePolicy || changePolicy);
      if (showMessage) toast.success('Portfolio changes saved.');
      return true;
    } catch (error) { toast.error(apiMessage(error, 'We could not save your portfolio.')); return false; }
    finally { setSaving(false); }
  }

  async function publish() {
    if (!await save(false)) return;
    try { const { data } = await api.post('/v1/portfolios/mine/publish'); setStatus(data.status); toast.success('Your portfolio is live.'); }
    catch (error) { toast.error(apiMessage(error, 'We could not publish your portfolio.')); }
  }

  async function unpublish() {
    try { await api.post('/v1/portfolios/mine/unpublish'); setStatus('draft'); toast.success('Your portfolio is private.'); }
    catch (error) { toast.error(apiMessage(error, 'We could not make your portfolio private.')); }
  }

  async function directPortfolio() {
    if (!await save(false)) return;
    try {
      setDirecting(true);
      const response = await api.post('/v1/portfolios/mine/direct');
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const { data } = await api.get(`/v1/portfolios/mine/jobs/${response.data.data._id}`);
        if (data.data.status === 'review') { const fresh = await api.get('/v1/portfolios/mine'); const next = { ...empty, ...fresh.data.data }; setForm(next); setSavedIdentity({ studioName: next.studioName, handle: next.handle }); setChangePolicy(fresh.data.changePolicy || changePolicy); toast.success('Your portfolio direction is ready to review.'); return; }
        if (data.data.status === 'failed') throw new Error(data.data.errorMessage || 'Veylo could not direct this portfolio.');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      throw new Error('This is taking longer than expected. Your work is saved, so you can return later.');
    } catch (error) { toast.error(apiMessage(error, error.message || 'Veylo could not direct this portfolio.')); }
    finally { setDirecting(false); }
  }

  if (loading) return <div className="v-portfolio-manage-state">Opening your portfolio…</div>;
  if (access !== 'public') return <div className="v-portfolio-manage-page"><section className="v-portfolio-manage-locked"><Image size={28} /><p>VEYLO PORTFOLIO</p><h1>{access === 'private' ? 'Your portfolio is private while your Pro work is retained.' : 'Give your strongest work one public address.'}</h1><span>{access === 'private' ? 'Renew Pro during the 30-day retention window to edit and publish it again.' : 'Veylo Portfolio is included with Pro.'}</span><a className="v-button" href="/billing">See Veylo Pro</a></section></div>;

  return <div className="v-portfolio-manage-page"><div className="v-portfolio-manage-wrap">
    <motion.header initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="v-portfolio-manage-head"><div><p>VEYLO PORTFOLIO</p><h1>Put your best work<br /><em>in one place.</em></h1><span>Choose the photographs, check the words, and publish one address you can send when someone asks to see your work.</span></div><aside><span className={status === 'published' ? 'is-live' : ''}><i />{status === 'published' ? 'Live' : 'Private draft'}</span><strong>{portfolioUrl(form.handle)}</strong>{status === 'published' && <a href={portfolioUrl(form.handle)} target="_blank" rel="noreferrer"><Eye size={15} />Open portfolio</a>}</aside></motion.header>

    <div className="v-portfolio-manage-grid"><section className="v-portfolio-manage-form">
      <div className="v-pmanage-section"><p>01 · STUDIO DETAILS</p><div className="v-pmanage-two"><label><span>Studio name</span><input value={form.studioName} onChange={e => set('studioName', e.target.value)} maxLength={100} disabled={studioNameLocked} /></label><label><span>Portfolio address</span><div className="v-pmanage-handle"><b>@</b><input value={form.handle} onChange={e => set('handle', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} maxLength={40} disabled={handleLocked} /></div></label></div>{(studioNameLocked || handleLocked) && <p className="v-pmanage-identity-note">{studioNameLocked && `Your studio name can change again on ${changeDate(changePolicy.studioNameNextChangeAt)}.`}{studioNameLocked && handleLocked && ' '} {handleLocked && `Your portfolio address can change again on ${changeDate(changePolicy.handleNextChangeAt)}.`}</p>}<label><span>Short bio</span><textarea value={form.bio} onChange={e => set('bio', e.target.value)} maxLength={600} placeholder="Tell a potential client what you photograph and where you work." /></label><div className="v-pmanage-two"><label><span><MapPin size={13} />Location</span><input value={form.location} onChange={e => set('location', e.target.value)} maxLength={120} /></label><label><span>Contact button</span><input value={form.contactLabel} onChange={e => set('contactLabel', e.target.value)} maxLength={50} /></label><label><span><Instagram size={13} />Instagram username</span><input value={form.instagram} onChange={e => set('instagram', e.target.value.replace(/^@/, ''))} maxLength={80} /></label><label><span>WhatsApp number</span><input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value.replace(/[^0-9+]/g, ''))} maxLength={30} placeholder="234…" /></label></div></div>
      <div className="v-pmanage-section"><div className="v-pmanage-section-head"><div><p>02 · SELECTED WORK</p><h2>{form.items.length} of 50 photographs</h2></div><button type="button" onClick={() => setPicker(true)}><Plus size={15} />Choose photographs</button></div>{form.items.length === 0 ? <div className="v-pmanage-empty"><Image size={24} /><span>Add work from a published delivery or your image library.</span></div> : <div className="v-pmanage-selected">{form.items.map((item, index) => <article key={item.publicId}><img src={item.thumbnailUrl} alt="" /><button type="button" onClick={() => remove(item.publicId)} aria-label="Remove photograph"><X size={14} /></button><small>{String(index + 1).padStart(2, '0')}</small><input value={item.title} onChange={e => setForm(current => ({ ...current, items: current.items.map(value => value.publicId === item.publicId ? { ...value, title: e.target.value } : value) }))} placeholder="Photograph title" maxLength={100} /><input value={item.category} onChange={e => setForm(current => ({ ...current, items: current.items.map(value => value.publicId === item.publicId ? { ...value, category: e.target.value } : value) }))} placeholder="Category" maxLength={50} /></article>)}</div>}</div>
      <div className="v-pmanage-section"><div className="v-pmanage-direction-head"><div><p>03 · VISUAL DIRECTION</p><span>Veylo can study the selected work and propose the order, headline, colour, typography, and image rhythm. You still approve every choice.</span></div><button type="button" onClick={directPortfolio} disabled={directing || saving}><Clapperboard size={15} />{directing ? 'Directing…' : 'Direct my portfolio'}</button></div>{directing && <div className="v-pmanage-directing"><LoaderCircle size={17} />Reading the selected work…</div>}<div className="v-pmanage-two"><label><span>Opening headline</span><input value={form.headline} onChange={e => set('headline', e.target.value)} maxLength={100} placeholder="A clear line about the work you want to show." /></label><label><span>Introduction</span><input value={form.introLine} onChange={e => set('introLine', e.target.value)} maxLength={240} placeholder="One short line to support the opening." /></label></div><div className="v-pmanage-choice"><label><span>Canvas</span><select value={form.direction.background} onChange={e => setDirection('background', e.target.value)}><option value="ink">Ink black</option><option value="warm-black">Warm black</option><option value="ivory">Ivory</option></select></label><label><span>Typography</span><select value={form.direction.typeStyle} onChange={e => setDirection('typeStyle', e.target.value)}><option value="editorial">Editorial</option><option value="modern">Modern</option><option value="classic">Classic</option></select></label><label><span>Image rhythm</span><select value={form.direction.rhythm} onChange={e => setDirection('rhythm', e.target.value)}><option value="measured">Measured</option><option value="bold">Bold</option><option value="quiet">Quiet</option></select></label><label><span>Accent colour</span><input type="color" value={form.direction.accent} onChange={e => setDirection('accent', e.target.value)} /></label></div></div>
      <div className="v-pmanage-actions"><button type="button" onClick={() => save()} disabled={saving}><Save size={16} />{saving ? 'Saving…' : 'Save changes'}</button>{status === 'published' ? <button type="button" onClick={unpublish}>Make private</button> : <button type="button" className="is-primary" onClick={publish}><Send size={16} />Publish portfolio</button>}</div>
    </section>
    <aside className={`v-pmanage-preview is-${form.direction.background} type-${form.direction.typeStyle}`} style={{ '--portfolio-accent': form.direction.accent }}><header><span>{form.studioName || 'Your studio'}</span><small>{form.location || 'Nigeria'}</small></header><div><p>SELECTED WORK</p><h2>{form.headline || `${form.studioName || 'Your work'}, in its own space.`}</h2><span>{form.introLine || form.bio || 'Your studio introduction will appear here.'}</span></div><div className={`v-pmanage-preview-grid rhythm-${form.direction.rhythm}`}>{form.items.slice(0, 5).map((item, index) => <figure key={item.publicId} className={`is-${index + 1}`}><img src={item.thumbnailUrl} alt="" /></figure>)}</div></aside></div>
  </div>
  {picker && <div className="v-pmanage-picker" role="presentation" onMouseDown={e => e.target === e.currentTarget && setPicker(false)}><section role="dialog" aria-modal="true" aria-label="Choose portfolio photographs"><header><div><p>YOUR FINISHED WORK</p><h2>Choose photographs</h2></div><button type="button" onClick={() => setPicker(false)}><X size={18} /></button></header>{sources.length ? <div>{sources.map(source => <button type="button" key={source.publicId} className={chosen.has(source.publicId) ? 'is-selected' : ''} onClick={() => chosen.has(source.publicId) ? remove(source.publicId) : add(source)}><img src={source.thumbnailUrl} alt={source.title || 'Available photograph'} loading="lazy" /><span>{chosen.has(source.publicId) ? <Check size={15} /> : <Plus size={15} />}</span></button>)}</div> : <p className="v-pmanage-picker-empty">Publish a delivery or add photographs to your Pro library first.</p>}<footer><span>{form.items.length} selected</span><button type="button" onClick={() => setPicker(false)}>Done</button></footer></section></div>}
  </div>;
}
