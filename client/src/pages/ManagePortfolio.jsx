import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown, ArrowUp, Camera, Check, Clapperboard, Copy, Eye, ExternalLink,
  Image as ImageIcon, Instagram, LayoutGrid, LoaderCircle, MapPin, Maximize2, MessageCircle,
  Monitor, Palette, Plus, Save, Send, Smartphone, Star, Tablet, Trash2, Type, X
} from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { APP_URL } from '../config/env.js';
import PortfolioCanvas from './PortfolioCanvas.jsx';
import { useDialogFocus } from '../components/useDialogFocus.js';
import './ManagePortfolio.css';

const directionDefaults = {
  background: 'ink', accent: '#ff9b8e', typeStyle: 'editorial', rhythm: 'measured', layout: 'editorial', motion: 'subtle',
  showBio: true, showLocation: true, showCategories: true, showPhotoTitles: true, showContact: true
};
const empty = {
  handle: '', studioName: '', bio: '', headline: '', introLine: '', location: '', contactLabel: 'Ask about a shoot',
  instagram: '', whatsapp: '', heroPublicId: '', items: [], direction: directionDefaults
};
const sections = [
  { id: 'studio', number: '01', label: 'Studio', icon: Camera },
  { id: 'work', number: '02', label: 'Photographs', icon: ImageIcon },
  { id: 'design', number: '03', label: 'Design', icon: Palette },
  { id: 'contact', number: '04', label: 'Contact', icon: Instagram },
  { id: 'review', number: '05', label: 'Review', icon: Eye }
];
const backgrounds = [
  { value: 'ink', label: 'Ink', detail: 'Deep black, crisp white', color: '#08080b', foreground: '#f4eee8' },
  { value: 'warm-black', label: 'Warm black', detail: 'Brown-black, soft white', color: '#120e0c', foreground: '#f1e9df' },
  { value: 'ivory', label: 'Ivory', detail: 'Warm paper, dark type', color: '#eee8de', foreground: '#191613' }
];
const layouts = [
  { value: 'editorial', label: 'Editorial', detail: 'A lead photograph, then an arranged spread', icon: 'editorial' },
  { value: 'grid', label: 'Gallery grid', detail: 'Even frames that make the full set easy to scan', icon: 'grid' },
  { value: 'masonry', label: 'Masonry', detail: 'A flowing wall that keeps each photo’s shape', icon: 'masonry' }
];
const typeStyles = [
  { value: 'editorial', label: 'Editorial', detail: 'Calm, with a clear serif accent', sample: 'Ag' },
  { value: 'modern', label: 'Modern', detail: 'Bold letters and a tighter voice', sample: 'AG' },
  { value: 'classic', label: 'Classic', detail: 'A traditional display face', sample: 'Ag' }
];
const accents = [
  { value: '#ff9b8e', label: 'Coral' }, { value: '#d9ad70', label: 'Brass' },
  { value: '#8198b7', label: 'Slate blue' }, { value: '#a0a984', label: 'Olive' },
  { value: '#c58eaa', label: 'Rose' }
];
const spacingOptions = [
  { value: 'quiet', label: 'Airy', detail: 'More room between photographs' },
  { value: 'measured', label: 'Balanced', detail: 'A steady pace through the work' },
  { value: 'bold', label: 'Close', detail: 'A compact, image-led gallery' }
];
const previewSizes = [
  { value: 'mobile', label: 'Phone', icon: Smartphone },
  { value: 'tablet', label: 'Tablet', icon: Tablet },
  { value: 'desktop', label: 'Desktop', icon: Monitor }
];

function portfolioUrl(handle) {
  const origin = typeof window !== 'undefined' ? window.location.origin : APP_URL;
  return `${origin.replace(/\/$/, '')}/@${encodeURIComponent(handle || '')}`;
}

function brandHandle(value) {
  const slug = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return slug.length >= 3 ? slug : `${slug || 'my'}-studio`.slice(0, 40);
}

function normalizePortfolio(value = {}) {
  return {
    ...Object.fromEntries(Object.keys(empty).filter(key => key !== 'items' && key !== 'direction').map(key => [key, value[key] ?? empty[key]])),
    items: Array.isArray(value.items) ? value.items : [],
    direction: { ...directionDefaults, ...(value.direction || {}) }
  };
}

function changeDate(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value)); } catch { return ''; }
}

function SectionHeading({ eyebrow, title, description, action }) {
  return <div className="v-pedit-heading">
    <div><p>{eyebrow}</p><h2>{title}</h2>{description && <span>{description}</span>}</div>
    {action}
  </div>;
}

function Toggle({ label, detail, checked, onChange }) {
  return <button type="button" className={`v-pedit-toggle${checked ? ' is-on' : ''}`} aria-pressed={checked} onClick={() => onChange(!checked)}>
    <span className="v-pedit-toggle-copy"><strong>{label}</strong><small>{detail}</small></span>
    <span className="v-pedit-switch" aria-hidden="true"><i /></span>
  </button>;
}

function LayoutMark({ kind }) {
  return <span className={`v-pedit-layout-mark is-${kind}`} aria-hidden="true"><i /><i /><i /><i /><i /></span>;
}

export default function ManagePortfolio() {
  const reduced = useReducedMotion();
  const [form, setForm] = useState(empty);
  const [sources, setSources] = useState([]);
  const [sourceGroups, setSourceGroups] = useState([]);
  const [sourceCursor, setSourceCursor] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [status, setStatus] = useState('draft');
  const [liveHandle, setLiveHandle] = useState('');
  const [access, setAccess] = useState('unavailable');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerKind, setPickerKind] = useState('delivery');
  const [pickerDelivery, setPickerDelivery] = useState(null);
  const [bulkSelected, setBulkSelected] = useState([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [draftAhead, setDraftAhead] = useState(false);
  const [directing, setDirecting] = useState(false);
  const [previewSize, setPreviewSize] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640 ? 'mobile' : typeof window !== 'undefined' && window.innerWidth < 1024 ? 'tablet' : 'desktop');
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1440);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [handleAvailability, setHandleAvailability] = useState(null);
  const [directionNote, setDirectionNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [changePolicy, setChangePolicy] = useState({ studioNameNextChangeAt: null, handleNextChangeAt: null });
  const previewDialogRef = useRef(null);
  const pickerRef = useRef(null);
  const pickerTriggerRef = useRef(null);
  const suggestionBackupRef = useRef(null);
  const savedFormRef = useRef(empty);
  useDialogFocus(picker, pickerRef, () => setPicker(false), pickerTriggerRef);
  useEffect(() => { const update = () => setViewportWidth(window.innerWidth); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([api.get('/v1/portfolios/mine')]).then(([profile]) => {
      if (!active) return;
      if (profile.status === 'fulfilled') {
        const next = normalizePortfolio(profile.value.data.data);
        setForm(next);
        savedFormRef.current = next;
        setDraftAhead(Boolean(profile.value.data.hasUnpublishedChanges));
        setChangePolicy(profile.value.data.changePolicy || { studioNameNextChangeAt: null, handleNextChangeAt: null });
        setStatus(profile.value.data.status || 'draft');
        setLiveHandle(profile.value.data.live?.handle || '');
        setAccess(profile.value.data.access || 'unavailable');
      } else toast.error(apiMessage(profile.reason, 'We could not open your portfolio.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!picker) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setSourceLoading(true);
      setSourceError('');
      setSources([]);
      setSourceGroups([]);
      try {
        const kind = pickerKind === 'delivery' ? pickerDelivery ? 'delivery' : 'deliveries' : 'library';
        const { data } = await api.get('/v1/portfolios/sources', { params: { kind, sourceId: pickerDelivery?.sourceId, query: pickerQuery } });
        if (!active) return;
        if (kind === 'deliveries') setSourceGroups(data.data || []);
        else setSources(data.data || []);
        setSourceCursor(data.nextCursor || null);
      } catch (error) { if (active) setSourceError(apiMessage(error, 'We could not load this work. Try again.')); }
      finally { if (active) setSourceLoading(false); }
    }, pickerQuery ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [picker, pickerKind, pickerDelivery, pickerQuery]);

  useEffect(() => {
    if (access !== 'public' || form.handle.length < 3) { setHandleAvailability(null); return undefined; }
    let active = true;
    setHandleAvailability(null);
    const timer = window.setTimeout(() => {
      api.get(`/v1/portfolios/handles/${encodeURIComponent(form.handle)}/availability`).then(({ data }) => { if (active) setHandleAvailability(data.available); }).catch(() => { if (active) setHandleAvailability(null); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [access, form.handle]);

  useEffect(() => {
    const dialog = previewDialogRef.current;
    if (!dialog) return;
    if (previewExpanded && !dialog.open) dialog.showModal();
    if (!previewExpanded && dialog.open) dialog.close();
  }, [previewExpanded]);

  const chosen = useMemo(() => new Set(form.items.map(item => item.publicId)), [form.items]);
  const previewFrameWidth = { mobile: 390, tablet: 768, desktop: 1024 }[previewSize];
  const previewScale = Math.min(1, (viewportWidth - 24) / previewFrameWidth);
  const unsaved = JSON.stringify(form) !== JSON.stringify(savedFormRef.current);
  const publishChecks = [
    { label: 'Studio or Brand name', ready: form.studioName.trim().length >= 2, step: 0 },
    { label: 'Portfolio address', ready: /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(form.handle) && form.handle.length >= 3 && handleAvailability !== false, step: 0 },
    { label: 'Short studio bio', ready: Boolean(form.bio.trim()), step: 0 },
    { label: 'At least four photographs', ready: form.items.length >= 4, step: 1 }
  ];
  const canPublish = publishChecks.every(check => check.ready);
  const visibleSources = sources;
  const studioNameLocked = Boolean(changePolicy.studioNameNextChangeAt);
  const handleLocked = Boolean(changePolicy.handleNextChangeAt);
  const generatedHandle = brandHandle(form.studioName);

  function setField(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function openPicker(event) {
    pickerTriggerRef.current = event.currentTarget;
    setPicker(true);
  }

  async function loadMoreSources() {
    if (!sourceCursor || sourceLoading) return;
    setSourceLoading(true);
    setSourceError('');
    try {
      const kind = pickerKind === 'delivery' ? pickerDelivery ? 'delivery' : 'deliveries' : 'library';
      const { data } = await api.get('/v1/portfolios/sources', { params: { kind, sourceId: pickerDelivery?.sourceId, query: pickerQuery, cursor: sourceCursor } });
      if (kind === 'deliveries') setSourceGroups(current => [...current, ...(data.data || [])]);
      else setSources(current => [...current, ...(data.data || [])]);
      setSourceCursor(data.nextCursor || null);
    } catch (error) { setSourceError(apiMessage(error, 'We could not load more photographs. Try again.')); }
    finally { setSourceLoading(false); }
  }

  function goToStep(index) {
    setActiveStep(index);
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  function setDirection(key, value) {
    setDirectionNote('');
    setForm(current => ({ ...current, direction: { ...current.direction, [key]: value } }));
  }

  function useBrandName() {
    if (generatedHandle.length < 3) {
      toast.error('Use a studio name with at least three letters or numbers for the address.');
      return;
    }
    setField('handle', generatedHandle);
  }

  function updateHandle(value) {
    const next = value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    setField('handle', next);
  }

  function addPhoto(source) {
    setForm(current => {
      if (current.items.length >= 50 || current.items.some(item => item.publicId === source.publicId)) return current;
      const items = [...current.items, { publicId: source.publicId, title: source.title || '', category: 'Selected work', thumbnailUrl: source.thumbnailUrl }];
      return { ...current, items, heroPublicId: current.heroPublicId || source.publicId };
    });
  }

  function removePhoto(publicId) {
    setForm(current => {
      const items = current.items.filter(item => item.publicId !== publicId);
      return { ...current, items, heroPublicId: current.heroPublicId === publicId ? (items[0]?.publicId || '') : current.heroPublicId };
    });
  }

  function movePhoto(publicId, offset) {
    setForm(current => {
      const from = current.items.findIndex(item => item.publicId === publicId);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= current.items.length) return current;
      const items = [...current.items];
      [items[from], items[to]] = [items[to], items[from]];
      return { ...current, items };
    });
  }

  function movePhotoTo(publicId, position) {
    setForm(current => {
      const items = [...current.items];
      const from = items.findIndex(item => item.publicId === publicId);
      if (from < 0 || position < 0 || position >= items.length) return current;
      const [item] = items.splice(from, 1);
      items.splice(position, 0, item);
      return { ...current, items };
    });
  }

  function applyBulkCategory() {
    const next = bulkCategory.trim().slice(0, 50);
    if (!next || !bulkSelected.length) return;
    const selected = new Set(bulkSelected);
    setForm(current => ({ ...current, items: current.items.map(item => selected.has(item.publicId) ? { ...item, category: next } : item) }));
    setBulkSelected([]);
    setBulkCategory('');
  }

  async function save(showMessage = true) {
    if (form.studioName.trim().length < 2) {
      toast.error('Add your Studio or Brand name in Account settings.');
      return false;
    }
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(form.handle) || form.handle.length < 3) {
      toast.error('Use a portfolio address with 3–40 letters, numbers, or single hyphens.');
      return false;
    }
    try {
      setSaving(true);
      const snapshot = form;
      const payload = {
        handle: snapshot.handle,
        studioName: snapshot.studioName,
        bio: snapshot.bio,
        headline: snapshot.headline,
        introLine: snapshot.introLine,
        location: snapshot.location,
        contactLabel: snapshot.contactLabel,
        instagram: snapshot.instagram,
        whatsapp: snapshot.whatsapp,
        heroPublicId: snapshot.heroPublicId,
        direction: snapshot.direction,
        items: snapshot.items.map(({ publicId, title, category }) => ({ publicId, title, category: category.trim() || 'Selected work' }))
      };
      const { data } = await api.put('/v1/portfolios/mine', payload);
      const next = normalizePortfolio(data.data);
      setForm(current => JSON.stringify(current) === JSON.stringify(snapshot) ? next : current);
      savedFormRef.current = next;
      setDraftAhead(Boolean(data.hasUnpublishedChanges));
      setChangePolicy(data.changePolicy || changePolicy);
      if (showMessage) toast.success('Your portfolio changes are saved.');
      return true;
    } catch (error) {
      toast.error(apiMessage(error, 'We could not save your portfolio.'));
      return false;
    } finally { setSaving(false); }
  }

  async function publish() {
    if (form.items.length < 4 || !form.bio.trim()) {
      toast.error('Add a short studio bio and at least four photographs before publishing.');
      return;
    }
    if (status === 'published' && liveHandle && form.handle !== liveHandle && !window.confirm('Publishing will change your public portfolio address. The old address will redirect for 90 days. Continue?')) return;
    if (unsaved && !await save(false)) return;
    try {
      const { data } = await api.post('/v1/portfolios/mine/publish');
      setStatus(data.status);
      setLiveHandle(data.data.handle);
      setDraftAhead(false);
      setChangePolicy(data.changePolicy || changePolicy);
      toast.success('Your portfolio is live.');
    } catch (error) { toast.error(apiMessage(error, 'We could not publish your portfolio.')); }
  }

  async function unpublish() {
    try {
      await api.post('/v1/portfolios/mine/unpublish');
      setStatus('draft');
      toast.success('Your portfolio is private.');
    } catch (error) { toast.error(apiMessage(error, 'We could not make your portfolio private.')); }
  }

  function applyDirectionSuggestion(suggestion) {
    if (!suggestion) throw new Error('Veylo did not return a portfolio direction.');
    setDirectionNote(suggestion.designReason || 'The suggested order and style are ready to review.');
    setForm(current => {
      suggestionBackupRef.current = current;
      const byId = new Map(current.items.map(item => [item.publicId, item]));
      const ordered = (suggestion.orderedPublicIds || []).map(id => byId.get(id)).filter(Boolean);
      const orderedIds = new Set(ordered.map(item => item.publicId));
      const items = [...ordered, ...current.items.filter(item => !orderedIds.has(item.publicId))];
      return {
        ...current,
        headline: suggestion.headline || current.headline,
        introLine: suggestion.introLine || current.introLine,
        heroPublicId: suggestion.heroPublicId || current.heroPublicId,
        items,
        direction: {
          ...current.direction,
          background: suggestion.background || current.direction.background,
          accent: suggestion.accent || current.direction.accent,
          typeStyle: suggestion.typeStyle || current.direction.typeStyle,
          rhythm: suggestion.rhythm || current.direction.rhythm,
          layout: suggestion.layout || current.direction.layout
        }
      };
    });
  }

  async function directPortfolio() {
    if (form.items.length < 4 || !form.bio.trim()) {
      toast.error('Add a short studio bio and at least four photographs before asking for a direction.');
      return;
    }
    if (!await save(false)) return;
    try {
      setDirecting(true);
      const response = await api.post('/v1/portfolios/mine/direct');
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const { data } = await api.get(`/v1/portfolios/mine/jobs/${response.data.data._id}`);
        if (data.data.status === 'review') {
          applyDirectionSuggestion(data.data.result?.direction);
          toast.success('The direction is in your preview. Edit it, then save when it feels right.');
          return;
        }
        if (data.data.status === 'failed') throw new Error(data.data.errorMessage || 'Veylo could not direct this portfolio.');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      throw new Error('This is taking longer than expected. Your work is saved, so you can return later.');
    } catch (error) { toast.error(apiMessage(error, error.message || 'Veylo could not direct this portfolio.')); }
    finally { setDirecting(false); }
  }

  async function copyPortfolioLink() {
    try {
      await navigator.clipboard.writeText(portfolioUrl(liveHandle));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { toast.error('We could not copy the portfolio link. You can select and copy it instead.'); }
  }

  if (loading) return <div className="v-portfolio-manage-state" role="status">Opening your portfolio…</div>;
  if (access !== 'public') return <div className="v-portfolio-manage-page"><section className="v-portfolio-manage-locked"><ImageIcon size={28} /><p>VEYLO PORTFOLIO</p><h1>{access === 'private' ? 'Your portfolio is private while your Pro work is retained.' : 'Give your strongest work one public address.'}</h1><span>{access === 'private' ? 'Renew Pro during the 30-day retention window to edit and publish it again.' : 'Veylo Portfolio is included with Pro.'}</span><a className="v-button" href="/billing">See Veylo Pro</a></section></div>;

  return <div className="v-portfolio-manage-page">
    <div className="v-pedit-wrap">
      <motion.header className="v-pedit-top" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="v-pedit-intro"><p>YOUR STUDIO / PORTFOLIO</p><h1>Build the page<br /><em>that carries your name.</em></h1><span>Choose the work, set the look, and check the page clients will open.</span></div>
        <aside className="v-pedit-link-card">
          <div className={`v-pedit-status${status === 'published' ? ' is-live' : ''}`}><i />{status === 'published' ? 'Published' : 'Draft'}</div>
          <strong>{form.studioName || 'Your studio'}</strong>
          <span className="v-pedit-url">{status === 'published' ? portfolioUrl(liveHandle) : 'Your address will be ready when you publish.'}</span>
          <div className="v-pedit-link-actions">
            <button type="button" onClick={copyPortfolioLink} disabled={status !== 'published' || !liveHandle}><Copy size={15} />{copied ? 'Copied' : 'Copy link'}</button>
            {status === 'published' && <a href={portfolioUrl(liveHandle)} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open live page</a>}
          </div>
        </aside>
      </motion.header>

      <nav className="v-pedit-steps" aria-label="Portfolio steps">{sections.map(({ id, number, label, icon: Icon }, index) => <button type="button" key={id} className={activeStep === index ? 'is-active' : ''} aria-current={activeStep === index ? 'step' : undefined} onClick={() => goToStep(index)}><span>{number}</span><Icon size={15} />{label}</button>)}</nav>

      <div className="v-pedit-layout">
        <main className="v-pedit-form">
          <section id="pedit-studio" className="v-pedit-section" hidden={activeStep !== 0}>
            <SectionHeading eyebrow="01 / Your name and story" title="Studio details" description="Give clients a clear introduction before they get to the photographs." />
            <div className="v-pedit-fields v-pedit-fields-two">
              <div className="v-pedit-field"><span>Studio or Brand name</span><strong className="v-pedit-shared-name">{form.studioName || 'Add your Studio or Brand name in Settings'}</strong><small>This name belongs to your account. <a href="/settings">Change it in Account settings</a>.</small></div>
              <div className="v-pedit-field"><span>Portfolio link</span><div className={`v-pedit-handle${handleLocked ? ' is-locked' : ''}`}><b>@</b><input value={form.handle} onChange={event => updateHandle(event.target.value)} maxLength={40} disabled={handleLocked} autoCapitalize="none" autoComplete="off" aria-invalid={form.handle.length < 3 || handleAvailability === false} /><button type="button" onClick={useBrandName} disabled={handleLocked || generatedHandle.length < 3} title={handleLocked ? `This address can change again on ${changeDate(changePolicy.handleNextChangeAt)}` : 'Set the address from your studio name'}>Use brand name</button></div><small className="v-pedit-address-hint" aria-live="polite">{form.handle.length < 3 ? 'Use at least three letters or numbers.' : handleAvailability === false ? 'That address is already in use or reserved.' : handleAvailability === true ? 'Available now. We will check again when you publish.' : 'Checking this address…'} {handleLocked && `You can change it again on ${changeDate(changePolicy.handleNextChangeAt)}.`}</small></div>
            </div>
            {(studioNameLocked || handleLocked) && <p className="v-pedit-policy">{studioNameLocked && `You can change your Studio or Brand name again on ${changeDate(changePolicy.studioNameNextChangeAt)}.`} {handleLocked && `Portfolio address changes open again ${changeDate(changePolicy.handleNextChangeAt)}.`}</p>}
            <label className="v-pedit-field"><span>Short studio bio</span><textarea value={form.bio} onChange={event => setField('bio', event.target.value)} maxLength={600} rows={4} placeholder="What do you photograph, and what should a client know before enquiring?" /><small>{form.bio.length}/600 characters</small></label>
            <div className="v-pedit-fields v-pedit-fields-two v-pedit-copy-fields">
              <label className="v-pedit-field"><span>Opening headline</span><input value={form.headline} onChange={event => setField('headline', event.target.value)} maxLength={100} placeholder={form.studioName || 'A line that sounds like your studio'} /><small>Leave it empty to use your studio name.</small></label>
              <label className="v-pedit-field"><span>Line under your headline</span><textarea value={form.introLine} onChange={event => setField('introLine', event.target.value)} maxLength={240} rows={2} placeholder="A short note about the work you want clients to see." /><small>{form.introLine.length}/240 characters</small></label>
            </div>
          </section>

          <section id="pedit-work" className="v-pedit-section" hidden={activeStep !== 1}>
            <SectionHeading eyebrow="02 / Choose and arrange" title="Photographs" description="Choose a cover photo, then move the rest into the order clients should see." action={<button type="button" className="v-pedit-secondary" onClick={openPicker}><Plus size={16} />Add photographs</button>} />
            <div className="v-pedit-count-row"><span><strong>{form.items.length}</strong> selected</span><small>Choose up to 50 photographs</small></div>
            {form.items.length > 1 && <div className="v-pedit-bulk-tools"><label><input type="checkbox" checked={bulkSelected.length === form.items.length} onChange={event => setBulkSelected(event.target.checked ? form.items.map(item => item.publicId) : [])} />Select all</label><input value={bulkCategory} onChange={event => setBulkCategory(event.target.value)} maxLength={50} placeholder="Category for selected photos" aria-label="Category for selected photos" /><button type="button" onClick={applyBulkCategory} disabled={!bulkSelected.length || !bulkCategory.trim()}>Apply to {bulkSelected.length} selected</button></div>}
            {!form.items.length ? <button type="button" className="v-pedit-empty-work" onClick={openPicker}><ImageIcon size={25} /><strong>Choose finished photographs</strong><span>Add work from a published delivery or your image library.</span></button> : <div className="v-pedit-selected-work">
              {form.items.map((item, index) => <article key={item.publicId} className={item.publicId === form.heroPublicId ? 'is-cover' : ''}>
                <div className="v-pedit-thumb"><img src={item.thumbnailUrl} alt={item.title || `Selected portfolio photograph ${index + 1}`} loading="lazy" /><span>{String(index + 1).padStart(2, '0')}</span>{item.publicId === form.heroPublicId && <b><Star size={12} fill="currentColor" />Cover</b>}</div>
                <div className="v-pedit-photo-fields"><label className="v-pedit-bulk-mark"><input type="checkbox" checked={bulkSelected.includes(item.publicId)} onChange={event => setBulkSelected(current => event.target.checked ? [...current, item.publicId] : current.filter(id => id !== item.publicId))} />Select for category edit</label><label><span>Photo title</span><input value={item.title} onChange={event => setForm(current => ({ ...current, items: current.items.map(photo => photo.publicId === item.publicId ? { ...photo, title: event.target.value } : photo) }))} maxLength={100} placeholder="Optional title" /></label><label><span>Category</span><input value={item.category} onChange={event => setForm(current => ({ ...current, items: current.items.map(photo => photo.publicId === item.publicId ? { ...photo, category: event.target.value } : photo) }))} maxLength={50} placeholder="e.g. Traditional wedding" /></label></div>
                <div className="v-pedit-photo-actions"><button type="button" onClick={() => setField('heroPublicId', item.publicId)} aria-pressed={item.publicId === form.heroPublicId} disabled={item.publicId === form.heroPublicId}><Star size={14} />{item.publicId === form.heroPublicId ? 'Cover photo' : 'Make cover'}</button><label className="v-pedit-move-to">Position <select value={index} onChange={event => movePhotoTo(item.publicId, Number(event.target.value))} aria-label={`Move photograph ${index + 1} to position`}>{form.items.map((_, target) => <option key={target} value={target}>{target + 1}</option>)}</select></label><div><button type="button" onClick={() => movePhoto(item.publicId, -1)} disabled={index === 0} aria-label={`Move photograph ${index + 1} earlier`}><ArrowUp size={15} /></button><button type="button" onClick={() => movePhoto(item.publicId, 1)} disabled={index === form.items.length - 1} aria-label={`Move photograph ${index + 1} later`}><ArrowDown size={15} /></button><button type="button" onClick={() => removePhoto(item.publicId)} aria-label={`Remove photograph ${index + 1}`}><Trash2 size={15} /></button></div></div>
              </article>)}
            </div>}
          </section>

          <section id="pedit-design" className="v-pedit-section" hidden={activeStep !== 2}>
            <SectionHeading eyebrow="03 / Make it yours" title="Page design" description="Every choice below appears in your draft preview. Your photographs stay untouched." />
            <div className="v-pedit-ai-card"><div className="v-pedit-ai-copy"><span><Clapperboard size={16} />Direction from your photographs</span><p>Veylo can suggest an opening, photo order, colour and layout. Review it before saving or publishing.</p>{directionNote && <blockquote>{directionNote}</blockquote>}</div><button type="button" onClick={directPortfolio} disabled={directing || saving || form.items.length < 4 || !form.bio.trim()}>{directing ? <LoaderCircle className="v-pedit-spin" size={16} /> : <Eye size={16} />}{directing ? 'Reading your work…' : 'Suggest a direction'}</button>{suggestionBackupRef.current && <button type="button" onClick={() => { setForm(suggestionBackupRef.current); suggestionBackupRef.current = null; setDirectionNote(''); }}>Undo suggestion</button>}</div>
            <div className="v-pedit-control-group"><div className="v-pedit-control-title"><Palette size={16} /><div><strong>Page colour</strong><small>Choose the surface clients will read against.</small></div></div><div className="v-pedit-color-choices">{backgrounds.map(choice => <button type="button" key={choice.value} className={form.direction.background === choice.value ? 'is-selected' : ''} onClick={() => setDirection('background', choice.value)} aria-pressed={form.direction.background === choice.value}><span style={{ background: choice.color, color: choice.foreground }}><i>Ag</i></span><strong>{choice.label}</strong><small>{choice.detail}</small></button>)}</div></div>
            <div className="v-pedit-control-group"><div className="v-pedit-control-title"><LayoutGrid size={16} /><div><strong>Photo layout</strong><small>Set the pace and shape of the gallery.</small></div></div><div className="v-pedit-layout-choices">{layouts.map(choice => <button type="button" key={choice.value} className={form.direction.layout === choice.value ? 'is-selected' : ''} onClick={() => setDirection('layout', choice.value)} aria-pressed={form.direction.layout === choice.value}><LayoutMark kind={choice.icon} /><strong>{choice.label}</strong><small>{choice.detail}</small></button>)}</div></div>
            <div className="v-pedit-fields v-pedit-fields-two">
              <div className="v-pedit-control-group"><div className="v-pedit-control-title"><Type size={16} /><div><strong>Typography</strong><small>Pick the voice of your page headings.</small></div></div><div className="v-pedit-type-choices">{typeStyles.map(choice => <button type="button" key={choice.value} className={`${form.direction.typeStyle === choice.value ? 'is-selected' : ''} is-${choice.value}`} onClick={() => setDirection('typeStyle', choice.value)} aria-pressed={form.direction.typeStyle === choice.value}><span>{choice.sample}</span><strong>{choice.label}</strong><small>{choice.detail}</small></button>)}</div></div>
              <div className="v-pedit-control-group"><div className="v-pedit-control-title"><Palette size={16} /><div><strong>Accent colour</strong><small>Used for small details and the contact button.</small></div></div><div className="v-pedit-accent-row"><div className="v-pedit-swatches">{accents.map(choice => <button type="button" key={choice.value} title={choice.label} aria-label={`${choice.label} accent`} aria-pressed={form.direction.accent.toLowerCase() === choice.value} className={form.direction.accent.toLowerCase() === choice.value ? 'is-selected' : ''} style={{ '--swatch': choice.value }} onClick={() => setDirection('accent', choice.value)} />)}</div><label><span>Custom</span><input type="color" value={form.direction.accent} onChange={event => setDirection('accent', event.target.value)} aria-label="Choose a custom accent colour" /></label></div></div>
            </div>
            <div className="v-pedit-control-group"><div className="v-pedit-control-title"><ImageIcon size={16} /><div><strong>Space between photos</strong><small>Control how tightly the gallery is arranged.</small></div></div><div className="v-pedit-spacing-choices">{spacingOptions.map(choice => <button type="button" key={choice.value} className={form.direction.rhythm === choice.value ? 'is-selected' : ''} onClick={() => setDirection('rhythm', choice.value)} aria-pressed={form.direction.rhythm === choice.value}><i className={`is-${choice.value}`} /><strong>{choice.label}</strong><small>{choice.detail}</small></button>)}</div></div>
            <div className="v-pedit-control-group"><div className="v-pedit-control-title"><Eye size={16} /><div><strong>Page movement</strong><small>Choose how photographs enter as clients scroll.</small></div></div><div className="v-pedit-motion-choices"><button type="button" className={form.direction.motion === 'subtle' ? 'is-selected' : ''} onClick={() => setDirection('motion', 'subtle')} aria-pressed={form.direction.motion === 'subtle'}><span className="v-pedit-motion-sample is-subtle" /><strong>Soft reveal</strong><small>A small fade as each image comes into view.</small></button><button type="button" className={form.direction.motion === 'still' ? 'is-selected' : ''} onClick={() => setDirection('motion', 'still')} aria-pressed={form.direction.motion === 'still'}><span className="v-pedit-motion-sample is-still" /><strong>Still</strong><small>No entrance movement. The photographs stay put.</small></button></div></div>
            <div className="v-pedit-control-group"><div className="v-pedit-control-title"><Eye size={16} /><div><strong>What appears on the page</strong><small>Keep only the details you want clients to see.</small></div></div><div className="v-pedit-toggles">
              <Toggle label="Studio bio" detail="Show your introduction below the headline" checked={form.direction.showBio} onChange={value => setDirection('showBio', value)} />
              <Toggle label="Location" detail="Show your city or state" checked={form.direction.showLocation} onChange={value => setDirection('showLocation', value)} />
              <Toggle label="Category filters" detail="Let visitors browse by shoot type" checked={form.direction.showCategories} onChange={value => setDirection('showCategories', value)} />
              <Toggle label="Photo titles" detail="Show titles and category labels under photographs" checked={form.direction.showPhotoTitles} onChange={value => setDirection('showPhotoTitles', value)} />
              <Toggle label="Contact section" detail="Show your WhatsApp and Instagram links" checked={form.direction.showContact} onChange={value => setDirection('showContact', value)} />
            </div></div>
          </section>

          <section id="pedit-contact" className="v-pedit-section" hidden={activeStep !== 3}>
            <SectionHeading eyebrow="04 / Help clients reach you" title="Contact details" description="These details appear on the public page only when you include the contact section." />
            <div className="v-pedit-fields v-pedit-fields-two">
              <label className="v-pedit-field"><span><MapPin size={14} />City or state</span><input value={form.location} onChange={event => setField('location', event.target.value)} maxLength={120} placeholder="Lagos, Nigeria" /></label>
              <label className="v-pedit-field"><span><MessageCircle size={14} />WhatsApp number</span><input value={form.whatsapp} onChange={event => setField('whatsapp', event.target.value.replace(/[^0-9+]/g, ''))} maxLength={30} inputMode="tel" placeholder="2348012345678" /><small>Include the country code. For Nigeria, start with 234.</small></label>
              <label className="v-pedit-field"><span><Instagram size={14} />Instagram username</span><div className="v-pedit-input-prefix"><b>@</b><input value={form.instagram} onChange={event => setField('instagram', event.target.value.replace(/^@/, '').replace(/\s/g, ''))} maxLength={80} placeholder="yourstudio" /></div></label>
              <label className="v-pedit-field"><span>WhatsApp button label</span><input value={form.contactLabel} onChange={event => setField('contactLabel', event.target.value)} maxLength={50} placeholder="Ask about a shoot" /></label>
            </div>
            {!form.whatsapp && !form.instagram && <p className="v-pedit-contact-note">Add WhatsApp or Instagram to give visitors a way to enquire. Your contact section will stay hidden until at least one is added.</p>}
          </section>
          <section id="pedit-review" className="v-pedit-section" hidden={activeStep !== 4}>
            <SectionHeading eyebrow="05 / Before your page goes live" title="Review and publish" description="Check the page on each screen size, then publish when it is ready." />
            <div className="v-pedit-readiness">{publishChecks.map(check => <button type="button" key={check.label} onClick={() => goToStep(check.step)} className={check.ready ? 'is-ready' : ''}><Check size={16} /><span>{check.label}</span><strong>{check.ready ? 'Ready' : 'Needed'}</strong></button>)}</div>
            {form.direction.showContact && !form.whatsapp && !form.instagram && <p className="v-pedit-contact-note">There is no WhatsApp or Instagram contact on this page. Visitors will see your work but will not have a way to enquire here.</p>}
            {status === 'published' && <p className="v-pedit-contact-note">Your current page stays live until you publish these changes. <a href={portfolioUrl(liveHandle)} target="_blank" rel="noreferrer">Open the live page</a>.</p>}
            {status === 'published' && !draftAhead && !unsaved && <p className="v-pedit-contact-note">Everything in this draft is already live.</p>}
            <button type="button" className="v-pedit-secondary" onClick={() => setPreviewExpanded(true)}><Maximize2 size={16} />Open full preview</button>
          </section>
          <div className="v-pedit-step-actions">{activeStep > 0 && <button type="button" onClick={() => goToStep(activeStep - 1)}>Back</button>}{activeStep < sections.length - 1 && <button type="button" onClick={() => goToStep(activeStep + 1)}>Continue to {sections[activeStep + 1].label}</button>}</div>
        </main>

        <aside className={`v-pedit-preview-panel${activeStep === 4 ? ' is-review' : ''}`} aria-label="Portfolio draft preview">
          <div className="v-pedit-preview-heading"><div><p>QUICK PREVIEW</p><strong>What clients will see after publishing</strong></div><div className="v-pedit-preview-tools"><span><i />Updates as you edit</span><button type="button" onClick={() => setPreviewExpanded(true)} aria-label="Open a full-screen portfolio preview"><Maximize2 size={15} /></button></div></div>
          <div className="v-pedit-preview-device"><div className="v-pedit-preview-scroll"><PortfolioCanvas portfolio={form} preview="compact" /></div></div>
          <p className="v-pedit-preview-note">Open the full preview to check phone, tablet, and desktop widths.</p>
        </aside>
      </div>

      <dialog ref={previewDialogRef} className="v-pedit-preview-modal" aria-label="Full-screen portfolio preview" onClose={() => setPreviewExpanded(false)}>
        <header><div><p>DRAFT PORTFOLIO PREVIEW</p><strong>{form.studioName || 'Your studio'}</strong></div><div className="v-pedit-preview-tabs" role="group" aria-label="Preview screen size">{previewSizes.map(({ value, label, icon: Icon }) => <button type="button" key={value} className={previewSize === value ? 'is-active' : ''} aria-pressed={previewSize === value} onClick={() => setPreviewSize(value)}><Icon size={15} />{label}</button>)}</div><button type="button" className="v-pedit-preview-close" onClick={() => setPreviewExpanded(false)} aria-label="Close full-screen preview"><X size={19} /></button></header>
        <div className={`v-pedit-preview-device is-${previewSize} is-scaled`} style={{ width: previewFrameWidth * previewScale, maxWidth: 'none', '--preview-frame-width': `${previewFrameWidth}px`, '--preview-scale': previewScale }}><div className="v-pedit-preview-scroll"><PortfolioCanvas portfolio={form} preview /></div></div>
      </dialog>

      <div className="v-pedit-publish-bar"><div><span className={`v-pedit-status${status === 'published' ? ' is-live' : ''}`}><i />{status === 'published' ? 'Live page' : 'Private draft'}</span><small>{unsaved ? 'Unsaved changes' : draftAhead ? 'Saved draft awaiting publication' : `${form.items.length} photographs`}</small></div><div className="v-pedit-publish-actions"><button type="button" className="v-pedit-save" onClick={() => save()} disabled={saving || directing || !unsaved}><Save size={16} />{saving ? 'Saving…' : 'Save draft'}</button>{activeStep === 4 && <button type="button" className="v-pedit-publish" onClick={publish} disabled={saving || directing || !canPublish || (status === 'published' && !draftAhead && !unsaved)}><Send size={16} />{status === 'published' ? 'Publish changes' : 'Publish portfolio'}</button>}{status === 'published' && activeStep === 4 && <button type="button" className="v-pedit-unpublish" onClick={unpublish} disabled={saving || directing}>Make private</button>}</div></div>
    </div>

    {picker && <div className="v-pedit-picker" role="presentation" onMouseDown={event => event.target === event.currentTarget && setPicker(false)}>
      <section ref={pickerRef} role="dialog" aria-modal="true" aria-labelledby="v-pedit-picker-title" tabIndex={-1}>
        <header><div><p>YOUR FINISHED WORK</p><h2 id="v-pedit-picker-title">Add photographs</h2><span>Choose photographs from published deliveries and your library.</span></div><button type="button" onClick={() => setPicker(false)} aria-label="Close photograph picker"><X size={19} /></button></header>
        <div className="v-pedit-picker-filters">{pickerDelivery && <button type="button" onClick={() => { setPickerDelivery(null); setPickerQuery(''); }}>Back to deliveries</button>}<input type="search" value={pickerQuery} onChange={event => setPickerQuery(event.target.value)} placeholder={pickerDelivery ? 'Search file names in this delivery' : 'Search finished work'} aria-label="Search portfolio photographs" /><div role="group" aria-label="Photo source">{[['delivery','Deliveries'],['library','Library']].map(([kind,label]) => <button type="button" key={kind} className={pickerKind === kind ? 'is-active' : ''} onClick={() => { setPickerKind(kind); setPickerDelivery(null); setPickerQuery(''); }}>{label}</button>)}</div></div>
        {pickerKind === 'delivery' && !pickerDelivery ? <div className="v-pedit-source-grid v-pedit-source-groups">{sourceGroups.map(group => <button type="button" key={group.sourceId} onClick={() => { setPickerDelivery(group); setPickerQuery(''); }}>{group.thumbnailUrl && <img src={group.thumbnailUrl} alt="" loading="lazy" />}<strong>{group.title}</strong><small>{group.photoCount} finished photographs</small></button>)}{!sourceGroups.length && !sourceLoading && <p>There are no published deliveries here yet.</p>}</div> : visibleSources.length ? <div className="v-pedit-source-grid">{visibleSources.map(source => <button type="button" key={source.publicId} className={chosen.has(source.publicId) ? 'is-selected' : ''} aria-pressed={chosen.has(source.publicId)} onClick={() => chosen.has(source.publicId) ? removePhoto(source.publicId) : addPhoto(source)} disabled={!chosen.has(source.publicId) && form.items.length >= 50}>
          <img src={source.thumbnailUrl} alt={source.title || 'Finished photograph'} loading="lazy" /><span className="v-pedit-source-check">{chosen.has(source.publicId) ? <Check size={15} /> : <Plus size={15} />}</span><small>{source.title || 'Finished photograph'}</small>
        </button>)}</div> : !sourceLoading && <div className="v-pedit-picker-empty"><ImageIcon size={24} /><strong>No photographs here</strong><span>Try another search, delivery, or your image library.</span></div>}
        {sourceError && <p className="v-pedit-source-error" role="alert">{sourceError}</p>}
        {sourceCursor && <button type="button" className="v-pedit-source-more" onClick={loadMoreSources} disabled={sourceLoading}>Load more {pickerKind === 'delivery' && !pickerDelivery ? 'deliveries' : 'photographs'}</button>}
        {sourceLoading && <p className="v-pedit-source-loading" role="status">Loading finished work…</p>}
        <footer><span>{form.items.length} of 50 selected</span><button type="button" onClick={() => setPicker(false)}>Done</button></footer>
      </section>
    </div>}
  </div>;
}
