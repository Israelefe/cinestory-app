import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Clapperboard, Clock3, ExternalLink, Image, LoaderCircle, Mail, Mic2, Music2, Pause, Play, QrCode, RefreshCw, RotateCcw, Share2, Trash2, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { API_BASE_URL } from '../config/env.js';
import { uploadDeliverySoundtrack } from '../utils/deliveryUpload.js';
import { uploadDeliveryPhotosV3 } from '../utils/deliveryUploadV3.js';
import { SHOOT_TYPES } from '../constants/shootTypes.js';
import { DELIVERY_FORMATS } from '../constants/deliveryFormats.js';
import DeliveryFormatVisual from '../components/DeliveryFormatVisual.jsx';
import ClientDeliveryPreview from '../components/delivery/ClientDeliveryPreview.jsx';
import './CreateDeliveryV3.css';

const BOUNDS = { 'photo-story': [5, 10], editorial: [6, 14], 'photo-reveal': [5, 12], canvas: [8, 18], chapters: [8, 20], album: [6, 16], 'event-coverage': [10, 24], campaign: [6, 16] };
const MUSIC = new Set(['photo-story', 'photo-reveal', 'album']);
const FONTS = ['Playfair Display', 'Outfit', 'Plus Jakarta Sans', 'Cormorant Garamond', 'DM Sans', 'Libre Baskerville', 'Manrope'];
const STEPS = [{ id: 'details', label: 'Shoot' }, { id: 'format', label: 'Format' }, { id: 'upload', label: 'Photos' }, { id: 'preparing', label: 'Preparing' }, { id: 'showcase', label: 'Showcase' }, { id: 'narration', label: 'Narration' }, { id: 'music', label: 'Music' }, { id: 'design', label: 'Design' }, { id: 'preview', label: 'Preview' }, { id: 'access', label: 'Publish' }];
const DEFAULT_ACCESS = { allowIndividualDownloads: true, allowDownloadAll: true, allowLikes: true, downloadsLocked: false, downloadLockNote: '', watermarkEnabled: false, watermarkText: '', expiresAt: '', usageTerms: '' };
const defaultPalette = { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' };
function message(error) {
  const code = error?.response?.data?.code || (error?.response?.status ? `HTTP ${error.response.status}` : error?.isAxiosError ? 'CONNECTION_ERROR' : '');
  const fallback = error?.isAxiosError ? 'The connection failed. Check your internet and try again.' : error?.message || 'That step did not finish. Please try again.';
  return { text: apiMessage(error, fallback), code };
}
function withMediaUrl(value) { return String(value || '').startsWith('/api/') ? API_BASE_URL.replace(/\/$/, '') + value.slice(4) : value; }
function nextAfterShowcase(format) { return format === 'photo-story' ? 'narration' : MUSIC.has(format) ? 'music' : 'design'; }
function freeMonthlyLimitReached(entitlements) { return entitlements?.plan === 'free' && entitlements?.usage?.deliveriesRemaining === 0; }
function freeMonthlyLimitMessage(entitlements) { return `You've published all ${entitlements?.limits?.deliveriesPerMonth || 3} Free deliveries this month. You can create another next month, or move to Pro.`; }

function StepButton({ children, onClick, disabled, secondary = false, type = 'button' }) {
  return <button type={type} className={'v3-button' + (secondary ? ' is-secondary' : '')} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Head({ eyebrow, title, children }) {
  return <header className="v3-head"><span>{eyebrow}</span><h1>{title}</h1>{children && <p>{children}</p>}</header>;
}

export default function CreateDeliveryV3({ user, initialDelivery }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState(initialDelivery || null);
  const [entitlements, setEntitlements] = useState(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [stage, setStage] = useState(initialDelivery?.v3?.step || 'details');
  const [clientName, setClientName] = useState(initialDelivery?.clientName || '');
  const [shootType, setShootType] = useState(initialDelivery?.shootType && !SHOOT_TYPES.includes(initialDelivery.shootType) ? 'Other' : initialDelivery?.shootType || '');
  const [customShoot, setCustomShoot] = useState(SHOOT_TYPES.includes(initialDelivery?.shootType) ? '' : initialDelivery?.shootType || '');
  const [purpose, setPurpose] = useState(initialDelivery?.brief || '');
  const [originalPurpose, setOriginalPurpose] = useState(initialDelivery?.v3?.originalPurpose || '');
  const [clarifications, setClarifications] = useState([]);
  const [answers, setAnswers] = useState(initialDelivery?.v3?.clarificationAnswers || []);
  const [questionCheckedFor, setQuestionCheckedFor] = useState('');
  const [recommendation, setRecommendation] = useState(initialDelivery?.formatRecommendations?.[0] || null);
  const [format, setFormat] = useState(initialDelivery?.format || '');
  const [uploads, setUploads] = useState({});
  const [failedFiles, setFailedFiles] = useState([]);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [job, setJob] = useState(initialDelivery?.generationJob || null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(initialDelivery?.curatedAssetIds || []);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [captions, setCaptions] = useState(Object.fromEntries((initialDelivery?.creativeDirection?.frames || []).map(frame => [frame.assetId, frame.caption])));
  const [title, setTitle] = useState(initialDelivery?.creativeDirection?.title || '');
  const [openingLine, setOpeningLine] = useState(initialDelivery?.creativeDirection?.openingLine || '');
  const [closingLine, setClosingLine] = useState(initialDelivery?.creativeDirection?.closingLine || '');
  const [openingAssetId, setOpeningAssetId] = useState(initialDelivery?.v3?.openingAssetId || '');
  const [closingAssetId, setClosingAssetId] = useState(initialDelivery?.v3?.closingAssetId || '');
  const [instructions, setInstructions] = useState({});
  const [tracks, setTracks] = useState([]);
  const [activeTrack, setActiveTrack] = useState('');
  const [musicSearch, setMusicSearch] = useState('');
  const audioRef = useRef(null);
  const [palette, setPalette] = useState(initialDelivery?.creativeDirection?.palette || defaultPalette);
  const [typography, setTypography] = useState(initialDelivery?.creativeDirection?.typography || { display: 'Playfair Display', body: 'Outfit' });
  const [access, setAccess] = useState({ ...DEFAULT_ACCESS, ...initialDelivery?.access, usageTerms: initialDelivery?.formatConfig?.usageTerms || '', expiresAt: initialDelivery?.access?.expiresAt ? new Date(initialDelivery.access.expiresAt).toISOString().slice(0, 16) : '' });
  const [pin, setPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [published, setPublished] = useState(initialDelivery?.status === 'published' ? { publicId: initialDelivery.publicId, url: window.location.origin + '/d/' + initialDelivery.publicId } : null);
  const [clientEmail, setClientEmail] = useState('');
  const actualShootType = shootType === 'Other' ? customShoot.trim() : shootType;
  const proFallback = user?.plan === 'pro' || user?.plan === 'studio';
  const limits = entitlements?.limits?.photosPerDelivery || (proFallback ? 500 : 100);
  const planName = entitlements?.plan === 'pro' || (!entitlements && proFallback) ? 'Pro' : 'Free';
  const quotaReached = freeMonthlyLimitReached(entitlements);
  const previewBranding = entitlements?.features?.branding === 'studio' || (!entitlements && proFallback)
    ? { type: 'studio', name: user?.studio?.name || user?.name || 'Studio', logoUrl: user?.studio?.logoUrl || user?.avatar || '' }
    : { type: 'veylo', name: 'Veylo', logoUrl: '/veylo/veylo-mark.svg' };
  const previewDelivery = useMemo(() => draft && ({ ...draft, branding: previewBranding }), [draft, previewBranding.type, previewBranding.name, previewBranding.logoUrl]);
  const bounds = BOUNDS[format] || [5, 10];
  const assets = draft?.assets || [];
  const assetById = useMemo(() => new Map(assets.map(asset => [asset.assetId, asset])), [assets]);
  const unselected = assets.filter(asset => !selected.includes(asset.assetId));
  const activeShowcaseIndex = Math.min(activePhotoIndex, Math.max(0, selected.length - 1));
  const activeShowcaseId = selected[activeShowcaseIndex];
  const visibleSteps = STEPS.filter(item => item.id !== 'narration' || format === 'photo-story').filter(item => item.id !== 'music' || MUSIC.has(format));
  const currentProgressId = stage === 'narration-job' ? 'narration' : stage;
  const currentIndex = visibleSteps.findIndex(item => item.id === currentProgressId);
  const statusProgress = Math.max(0, Math.round(((currentIndex + 1) / visibleSteps.length) * 100));

  async function refresh() {
    if (!draft?._id) return null;
    const response = await api.get('/v1/deliveries/' + draft._id);
    const next = response.data.data;
    setDraft(next);
    setJob(next.generationJob || null);
    return next;
  }
  function syncShowcase(next) {
    setSelected(next.curatedAssetIds || []);
    setCaptions(Object.fromEntries((next.creativeDirection?.frames || []).map(frame => [frame.assetId, frame.caption])));
    setTitle(next.creativeDirection?.title || '');
    setOpeningLine(next.creativeDirection?.openingLine || '');
    setClosingLine(next.creativeDirection?.closingLine || '');
    setOpeningAssetId(next.v3?.openingAssetId || '');
    setClosingAssetId(next.v3?.closingAssetId || '');
    setPalette(next.creativeDirection?.palette || defaultPalette);
    setTypography(next.creativeDirection?.typography || { display: 'Playfair Display', body: 'Outfit' });
  }
  async function action(label, task) {
    setBusy(label); setError('');
    try { return await task(); } catch (failure) { setError(message(failure)); return null; } finally { setBusy(''); }
  }
  useEffect(() => {
    let active = true;
    api.get('/v1/billing/status').then(({ data }) => { if (active) setEntitlements(data.data); }).catch(failure => { if (active) setError(message(failure)); }).finally(() => { if (active) setBillingLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!draft?._id || !['preparing', 'narration-job'].includes(stage)) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const { data } = await api.get('/v1/deliveries/' + draft._id);
        if (!active) return;
        const next = data.data;
        setDraft(next); setJob(next.generationJob || null);
        if (next.generationJob?.status === 'failed') { setError(next.generationJob.errorMessage || 'This step failed. Retry it.'); return; }
        if (stage === 'preparing' && next.v3?.step === 'showcase') { syncShowcase(next); setStage('showcase'); }
        if (stage === 'narration-job' && next.v3?.step === 'music' && next.narration?.opening?.url) setStage('music');
      } catch (failure) { if (active) setError(message(failure)); }
    };
    poll();
    const timer = window.setInterval(poll, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [draft?._id, stage]);
  useEffect(() => {
    if (stage !== 'music' || tracks.length) return;
    api.get('/v1/deliveries/soundtracks').then(({ data }) => setTracks(data.data || [])).catch(failure => setError(message(failure)));
  }, [stage, tracks.length]);
  useEffect(() => {
    if (stage !== 'format' || recommendation || !actualShootType) return;
    let active = true;
    api.post('/v1/deliveries/v3/assist', { mode: 'recommend', purpose: '', shootType: actualShootType }).then(({ data }) => {
      if (active) { setRecommendation(data.data); setFormat(current => current || data.data.format); }
    }).catch(failure => { if (active) setError(message(failure)); });
    return () => { active = false; };
  }, [stage, recommendation, actualShootType]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  useEffect(() => { setActivePhotoIndex(current => Math.min(current, Math.max(0, selected.length - 1))); }, [selected.length]);

  async function improve() {
    if (!purpose.trim() || !actualShootType) { setError('Enter the shoot type and purpose first.'); return; }
    await action('improve', async () => {
      const { data } = await api.post('/v1/deliveries/v3/assist', { mode: 'improve', purpose, shootType: actualShootType });
      setOriginalPurpose(current => current || purpose); setPurpose(data.data.improved); setQuestionCheckedFor('');
    });
  }
  async function detailsNext() {
    if (!draft && quotaReached) { setError(freeMonthlyLimitMessage(entitlements)); return; }
    if (clientName.trim().length < 2) { setError('Enter the client name before continuing.'); return; }
    if (actualShootType.length < 2) { setError(shootType === 'Other' ? 'Name the type of shoot before continuing.' : 'Choose a type of shoot before continuing.'); return; }
    if (purpose.trim().length < 8) { setError('Write a short purpose for the shoot before continuing.'); return; }
    await action('details', async () => {
      const signature = actualShootType + '\n' + purpose;
      if (questionCheckedFor !== signature) {
        const { data } = await api.post('/v1/deliveries/v3/assist', { mode: 'clarify', purpose, shootType: actualShootType });
        setQuestionCheckedFor(signature);
        if (data.data.questions?.length && !data.data.clear) { setClarifications(data.data.questions); setAnswers(data.data.questions.map(question => ({ question: question.question, answer: '' }))); return; }
      }
      if (clarifications.length && answers.some(item => !item.answer.trim())) { setError('Answer each question or add your own note.'); return; }
      const { data: rec } = await api.post('/v1/deliveries/v3/assist', { mode: 'recommend', purpose: '', shootType: actualShootType });
      setRecommendation(rec.data); if (!format) setFormat(rec.data.format);
      const body = { clientName: clientName.trim(), shootType: actualShootType, purpose: purpose.trim(), originalPurpose, clarificationAnswers: answers.filter(item => item.answer.trim()) };
      if (draft?._id) await api.patch('/v1/deliveries/' + draft._id + '/v3/details', body);
      else {
        const { data } = await api.post('/v1/deliveries/v3', body);
        setDraft(data.data); navigate('/create?draft=' + data.data._id, { replace: true });
      }
      setStage('format');
    });
  }
  async function chooseFormat() {
    if (!format) { setError('Choose a format.'); return; }
    await action('format', async () => {
      await api.patch('/v1/deliveries/' + draft._id + '/v3/format', { format });
      await refresh(); setStage('upload');
    });
  }
  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const invalid = files.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 50 * 1024 * 1024);
    if (invalid) { setError('Use JPEG, PNG, or WebP photos no larger than 50 MB each.'); return; }
    if (assets.length + files.length > limits) { setError('Your plan allows up to ' + limits + ' photographs in one delivery.'); return; }
    await action('upload', async () => {
      setUploadPercent(0);
      const result = await uploadDeliveryPhotosV3(draft._id, files, (percent, item) => {
        setUploadPercent(percent);
        if (item?.file) setUploads(current => ({ ...current, [item.index]: { name: item.file.name, status: item.status, loaded: item.loaded, total: item.total } }));
      });
      setFailedFiles(result.errors.map(item => item.file));
      await refresh();
      if (result.errors.length) setError(result.errors.length + ' photo' + (result.errors.length > 1 ? 's' : '') + ' did not upload. Retry those files.');
    });
  }
  async function deletePhoto(id) {
    await action('delete', async () => {
      await api.delete('/v1/deliveries/' + draft._id + '/assets/' + id);
      await refresh();
    });
  }
  async function prepare() {
    if (assets.length < bounds[0]) { setError('Add at least ' + bounds[0] + ' photos for this format.'); return; }
    await action('prepare', async () => {
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/v3/prepare');
      setJob(data.data); setStage('preparing');
    });
  }
  function replaceSelected(index, id) {
    setSelected(current => current.map((value, at) => at === index ? id : value));
    if (!captions[id]) setCaptions(current => ({ ...current, [id]: '' }));
  }
  function moveSelected(index, offset) {
    if (index + offset < 0 || index + offset >= selected.length) return;
    setSelected(current => { const next = [...current]; const other = index + offset; if (other < 0 || other >= next.length) return current; [next[index], next[other]] = [next[other], next[index]]; return next; });
    setActivePhotoIndex(index + offset);
  }
  async function regenerate(id) {
    await action('caption-' + id, async () => {
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/v3/captions/' + id + '/regenerate', { instruction: instructions[id] || '' });
      setCaptions(current => ({ ...current, [id]: data.data.caption }));
    });
  }
  async function saveShowcase() {
    const missingCaption = selected.findIndex(id => !captions[id]?.trim());
    if (missingCaption >= 0) {
      setActivePhotoIndex(missingCaption);
      setError('Write a caption for every showcase photo.');
      window.requestAnimationFrame(() => document.querySelector('.v3-showcase-item textarea')?.focus());
      return;
    }
    await action('showcase', async () => {
      const body = { assetIds: selected, frames: selected.map(assetId => ({ assetId, caption: captions[assetId].trim() })), title: title.trim(), openingLine: openingLine.trim(), closingLine: closingLine.trim(), openingAssetId, closingAssetId };
      await api.patch('/v1/deliveries/' + draft._id + '/v3/showcase', body);
      const next = await refresh(); setStage(nextAfterShowcase(next.format));
    });
  }
  async function generateNarration() {
    await action('narrate', async () => {
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/v3/narrate');
      setJob(data.data); setStage('narration-job');
    });
  }
  async function skipNarration() {
    await action('skip', async () => { await api.post('/v1/deliveries/' + draft._id + '/v3/narration/skip'); await refresh(); setStage('music'); });
  }
  async function selectTrack(track) {
    await action('music', async () => {
      await api.post('/v1/deliveries/' + draft._id + '/soundtrack/select', { trackId: track.id });
      await refresh(); setStage('design'); audioRef.current?.pause(); setActiveTrack('');
    });
  }
  async function customTrack(file) {
    if (!file) return;
    await action('music', async () => {
      await uploadDeliverySoundtrack(draft._id, file, file.name.replace(/\.[^.]+$/, ''));
      await refresh(); setStage('design');
    });
  }
  async function saveDesign() {
    await action('design', async () => {
      await api.patch('/v1/deliveries/' + draft._id + '/v3/theme', { palette, typography });
      const next = await refresh(); syncShowcase(next); setStage('preview');
    });
  }
  async function approve() {
    await action('approve', async () => {
      await api.post('/v1/deliveries/' + draft._id + '/v3/approve');
      await refresh(); setStage('access');
    });
  }
  async function saveAccess() {
    await action('access', async () => {
      const body = { ...access, expiresAt: access.expiresAt ? new Date(access.expiresAt).toISOString() : '' };
      if (pin) body.pin = pin; else if (removePin) body.pin = '';
      const { data } = await api.patch('/v1/deliveries/' + draft._id + '/v3/access', body);
      setDraft(current => ({ ...current, ...data.data }));
      toast.success('Access settings saved.');
    });
  }
  async function publish() {
    await action('publish', async () => {
      const latestStatus = await api.get('/v1/billing/status');
      if (!latestStatus.data?.data) throw new Error('We could not check your plan. Try publishing again.');
      setEntitlements(latestStatus.data.data);
      if (freeMonthlyLimitReached(latestStatus.data.data)) { setError(freeMonthlyLimitMessage(latestStatus.data.data)); return; }
      const body = { ...access, expiresAt: access.expiresAt ? new Date(access.expiresAt).toISOString() : '' };
      if (pin) body.pin = pin; else if (removePin) body.pin = '';
      await api.patch('/v1/deliveries/' + draft._id + '/v3/access', body);
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/v3/publish');
      setPublished(data.data); setStage('published');
    });
  }
  async function downloadQr() {
    await action('qr', async () => {
      const { data } = await api.get('/v1/deliveries/' + draft._id + '/qr');
      const link = document.createElement('a'); link.href = data.data.dataUrl; link.download = data.data.filename; link.click();
    });
  }
  async function sendEmail(event) {
    event.preventDefault();
    await action('email', async () => {
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/email', { email: clientEmail.trim() });
      toast.success(data.message || 'Delivery email sent.');
    });
  }
  async function shareDelivery() {
    try {
      if (navigator.share) await navigator.share({ title: draft?.title || 'Your photos are ready', text: draft?.clientName + ', your photos are ready.', url: published?.url });
      else { await navigator.clipboard.writeText(published?.url || ''); toast.success('Link copied.'); }
    } catch (failure) { if (failure.name !== 'AbortError') setError('The share menu could not open.'); }
  }
  const filteredTracks = tracks.filter(track => {
    const haystack = [track.title, track.genre, track.category, ...(track.tags || [])].join(' ').toLowerCase();
    return haystack.includes(musicSearch.toLowerCase());
  }).sort((a, b) => {
    const rank = track => /amapiano/i.test([track.title, track.genre, ...(track.tags || [])].join(' ')) ? 0 : track.category === 'afrobeat' ? 1 : 2;
    return rank(a) - rank(b);
  });

  return <div className="v3-create">
    <div className="v3-shell">
      <header className="v3-top"><Link to="/dashboard" className="v3-back"><ArrowLeft size={17} /> Dashboard</Link><div><Clapperboard size={18} /><strong>New delivery</strong></div><span>{draft?._id ? 'Draft in progress' : 'Start here'}</span></header>
      {!published && <section className="v3-progress" aria-label="Creation progress"><div className="v3-progress-copy"><div><span>STEP {String(Math.max(1, currentIndex + 1)).padStart(2, '0')} / {String(visibleSteps.length).padStart(2, '0')}</span><strong>{visibleSteps[currentIndex]?.label || 'Shoot'}</strong></div><small>{visibleSteps[currentIndex + 1] ? `Next: ${visibleSteps[currentIndex + 1].label}` : 'Ready to publish'}</small></div><div className="v3-progress-meter" role="progressbar" aria-valuemin={0} aria-valuemax={visibleSteps.length} aria-valuenow={Math.max(0, currentIndex + 1)} aria-label="Delivery creation progress"><span style={{ transform: 'scaleX(' + statusProgress / 100 + ')' }} /></div></section>}
      {error && <div className="v3-error" role="alert"><AlertCircle size={20} aria-hidden="true" /><div><strong>Check this step</strong><p>{typeof error === 'string' ? error : error.text}</p>{typeof error === 'object' && error.code && <small>Error code: {error.code}</small>}</div><button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {quotaReached && (stage === 'access' || stage === 'details' && !draft) && <div className="v3-quota-note" role="status"><Clock3 size={18} /><span>{freeMonthlyLimitMessage(entitlements)}</span><Link to="/billing">View Pro</Link></div>}
      <AnimatePresence mode="wait"><motion.main key={stage} className="v3-main" initial={reduced ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? {} : { opacity: 0, x: -12 }} transition={{ duration: reduced ? 0 : .3 }}>
        {stage === 'details' && <><Head eyebrow="01 / THE SHOOT" title="Tell us what this delivery is for.">A few real details help the words feel like they belong to these photographs.</Head><div className="v3-panel v3-form">
          <label>Client name<input maxLength={100} value={clientName} onChange={event => setClientName(event.target.value)} placeholder="Ada" /></label>
          <label>Type of shoot<select value={shootType} onChange={event => { setShootType(event.target.value); setQuestionCheckedFor(''); setClarifications([]); setAnswers([]); setRecommendation(null); }}><option value="">Choose a shoot type</option>{SHOOT_TYPES.map(value => <option key={value}>{value}</option>)}</select></label>
          {shootType === 'Other' && <label>What type of shoot?<input maxLength={80} value={customShoot} onChange={event => setCustomShoot(event.target.value)} placeholder="e.g. bridal shower" /></label>}
          <label className="v3-span">Purpose of the shoot<textarea rows={5} maxLength={3000} value={purpose} onChange={event => { setPurpose(event.target.value); setQuestionCheckedFor(''); setClarifications([]); setAnswers([]); }} placeholder="These photos were taken for Ada's 25th birthday celebration…" /><small>Write what you know. Names, occasion, and why this shoot matters are useful.</small></label>
          <div className="v3-assist v3-span"><button type="button" onClick={improve} disabled={!!busy}><RefreshCw size={16} /> Improve my wording</button>{originalPurpose && <button type="button" onClick={() => { setPurpose(originalPurpose); setOriginalPurpose(''); setQuestionCheckedFor(''); }}><RotateCcw size={16} /> Revert to my words</button>}<p>We will keep your facts and intent.</p></div>
          {clarifications.length > 0 && <div className="v3-questions v3-span"><h2>A little more detail would help</h2><p>Choose a close answer or write your own.</p>{clarifications.map((item, index) => <fieldset key={item.question}><legend>{item.question}</legend><div className="v3-options">{item.options.map(option => <button type="button" key={option} className={answers[index]?.answer === option ? 'is-selected' : ''} onClick={() => setAnswers(current => current.map((answer, at) => at === index ? { ...answer, answer: option } : answer))}>{option}</button>)}</div><input aria-label={'Your answer to ' + item.question} value={answers[index]?.answer || ''} onChange={event => setAnswers(current => current.map((answer, at) => at === index ? { ...answer, answer: event.target.value } : answer))} placeholder="Or write your own answer" maxLength={300} /></fieldset>)}</div>}
        </div><div className="v3-actions"><StepButton onClick={detailsNext} disabled={!!busy || billingLoading || !draft && quotaReached}>{busy ? <LoaderCircle className="v3-spin" size={17} /> : <ArrowRight size={17} />} Continue to formats</StepButton></div></>}
        {stage === 'format' && <><Head eyebrow="02 / THE FORMAT" title="Choose how they first see the work.">The recommendation uses your shoot type. You can choose any of the eight formats.</Head>{recommendation && <div className="v3-recommend"><Clapperboard size={17} /><div><strong>Recommended for this delivery: {DELIVERY_FORMATS.find(item => item.value === recommendation.format)?.name}</strong><p>{recommendation.reason}</p></div></div>}<div className="v3-format-grid">{[...DELIVERY_FORMATS].sort((a, b) => a.value === recommendation?.format ? -1 : b.value === recommendation?.format ? 1 : 0).map(item => <article key={item.value} className={'v3-format-card' + (format === item.value ? ' is-selected' : '')}><div className="v3-format-select" role="button" tabIndex={0} onClick={() => setFormat(item.value)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setFormat(item.value); } }} aria-pressed={format === item.value}><div className="v3-format-art" aria-hidden="true" inert=""><DeliveryFormatVisual format={item} compact paused /></div><span>{item.name}</span><small>{item.line}</small><b>{BOUNDS[item.value][0]}–{BOUNDS[item.value][1]} showcase photos</b>{format === item.value && <Check size={19} />}</div><Link to={'/demo/' + (item.value === 'photo-reveal' ? 'reveal' : item.value)} target="_blank" rel="noopener noreferrer">View demo <ExternalLink size={14} /></Link></article>)}</div><div className="v3-actions"><StepButton secondary onClick={() => setStage('details')}><ArrowLeft size={17} /> Back</StepButton><StepButton onClick={chooseFormat} disabled={!!busy}>{busy ? <LoaderCircle className="v3-spin" size={17} /> : <ArrowRight size={17} />} Continue to photos</StepButton></div></>}
        {stage === 'upload' && <><Head eyebrow="03 / THE PHOTOGRAPHS" title="Add the finished photographs.">Every photo stays in the full gallery. We will choose {bounds[0]}–{bounds[1]} for the {DELIVERY_FORMATS.find(item => item.value === format)?.name} showcase.</Head><div className="v3-upload-summary"><strong>{assets.length} / {limits}</strong><span>{planName} plan · JPEG, PNG or WebP · 50 MB each</span></div><label className="v3-drop"><Upload size={30} /><strong>Choose photographs to upload</strong><span>You can add more after these finish.</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { uploadFiles(event.target.files); event.target.value = ''; }} disabled={!!busy} /></label>{busy === 'upload' && <div className="v3-upload-progress" role="status"><span>Uploading photographs · {uploadPercent}%</span><div><i style={{ transform: 'scaleX(' + uploadPercent / 100 + ')' }} /></div></div>}{failedFiles.length > 0 && <StepButton secondary onClick={() => uploadFiles(failedFiles)} disabled={!!busy}><RefreshCw size={16} /> Retry {failedFiles.length} failed photo{failedFiles.length > 1 ? 's' : ''}</StepButton>}<div className="v3-photo-grid">{assets.map((asset, index) => <article key={asset.assetId}><button type="button" className="v3-photo-open" onClick={() => window.open(asset.url, '_blank', 'noopener,noreferrer')} aria-label={'Preview photo ' + (index + 1)}><img src={asset.thumbnailUrl || asset.url} alt={asset.originalFilename || 'Uploaded photograph'} loading="lazy" /></button><div><span>{index + 1}. {asset.originalFilename || 'Photograph'}</span><button type="button" onClick={() => deletePhoto(asset.assetId)} disabled={!!busy} aria-label={'Delete ' + (asset.originalFilename || 'photo')}><Trash2 size={16} /></button></div></article>)}</div><div className="v3-actions"><StepButton secondary onClick={() => setStage('format')}><ArrowLeft size={17} /> Back</StepButton><StepButton onClick={prepare} disabled={!!busy || assets.length < bounds[0]}><ArrowRight size={17} /> Analyse {assets.length} photos</StepButton></div></>}
        {stage === 'preparing' && <div className="v3-working" role="status"><div className="v3-working-mark"><Image size={30} /></div><Head eyebrow="ANALYSING THE PHOTOGRAPHS" title="Choosing the showcase.">We are reviewing every uploaded photo, then writing captions for the selected set. Your full gallery will keep them all.</Head><strong>{job?.progress || 0}%</strong><div className="v3-upload-progress"><div><i style={{ transform: 'scaleX(' + (job?.progress || 0) / 100 + ')' }} /></div></div><p>{job?.stage === 'analysing-photos' ? 'Reviewing every photograph' : job?.stage === 'writing-showcase' ? 'Writing the showcase and captions' : 'Preparing your delivery'}</p>{job?.status === 'failed' && <StepButton onClick={prepare}><RefreshCw size={16} /> Retry analysis</StepButton>}</div>}
        {stage === 'showcase' && <><Head eyebrow="04 / THE SHOWCASE" title="Make the selection yours.">These photos introduce the delivery. The full gallery still includes all {assets.length} photos.</Head><div className="v3-count"><strong>{selected.length} chosen</strong><span>{bounds[0]} minimum · {bounds[1]} maximum</span></div><div className="v3-panel v3-form"><label>Delivery title<input maxLength={80} value={title} onChange={event => setTitle(event.target.value)} /></label><label className="v3-span">Opening message<textarea value={openingLine} maxLength={140} rows={2} onChange={event => setOpeningLine(event.target.value)} /></label><label className="v3-span">Closing message<textarea value={closingLine} maxLength={160} rows={2} onChange={event => setClosingLine(event.target.value)} /></label><label>Opening photograph<select value={openingAssetId} onChange={event => setOpeningAssetId(event.target.value)}>{assets.map((asset, index) => <option key={asset.assetId} value={asset.assetId}>{index + 1}. {asset.originalFilename}</option>)}</select></label><label>Closing photograph<select value={closingAssetId} onChange={event => setClosingAssetId(event.target.value)}>{assets.map((asset, index) => <option key={asset.assetId} value={asset.assetId}>{index + 1}. {asset.originalFilename}</option>)}</select></label></div><div className="v3-showcase-editor">
          <div className="v3-showcase-nav" aria-label="Showcase photographs">
            {selected.map((id, index) => <button type="button" key={id} className={activeShowcaseIndex === index ? 'is-active' : ''} aria-current={activeShowcaseIndex === index ? 'true' : undefined} onClick={() => setActivePhotoIndex(index)} aria-label={'Edit showcase photo ' + (index + 1)}>
              <img src={assetById.get(id)?.thumbnailUrl || assetById.get(id)?.url} alt="" loading="lazy" />
              <span>{String(index + 1).padStart(2, '0')}</span>
            </button>)}
          </div>
          {activeShowcaseId && <article className="v3-showcase-item">
            <img src={assetById.get(activeShowcaseId)?.thumbnailUrl || assetById.get(activeShowcaseId)?.url} alt={assetById.get(activeShowcaseId)?.originalFilename || 'Selected photograph'} />
            <div className="v3-showcase-controls">
              <div className="v3-showcase-toolbar"><strong>{String(activeShowcaseIndex + 1).padStart(2, '0')} / {selected.length}</strong><button type="button" onClick={() => moveSelected(activeShowcaseIndex, -1)} disabled={activeShowcaseIndex === 0} aria-label="Move earlier"><ChevronLeft size={18} /></button><button type="button" onClick={() => moveSelected(activeShowcaseIndex, 1)} disabled={activeShowcaseIndex === selected.length - 1} aria-label="Move later"><ChevronRight size={18} /></button><button type="button" onClick={() => setSelected(current => current.filter(value => value !== activeShowcaseId))} disabled={selected.length <= bounds[0]} aria-label="Remove from showcase"><Trash2 size={17} /></button></div>
              <label>Caption<textarea rows={3} maxLength={format === 'photo-story' ? 60 : 180} value={captions[activeShowcaseId] || ''} onChange={event => setCaptions(current => ({ ...current, [activeShowcaseId]: event.target.value }))} /><small>{(captions[activeShowcaseId] || '').length} / {format === 'photo-story' ? 60 : 180}</small></label>
              <div className="v3-caption-assist"><input value={instructions[activeShowcaseId] || ''} maxLength={400} onChange={event => setInstructions(current => ({ ...current, [activeShowcaseId]: event.target.value }))} placeholder="Tell Veylo what to write (optional)" aria-label={'Instruction for photo ' + (activeShowcaseIndex + 1)} /><button type="button" onClick={() => regenerate(activeShowcaseId)} disabled={!!busy}><RefreshCw size={15} /> Regenerate</button></div>
              <label>Replace with<select value="" onChange={event => replaceSelected(activeShowcaseIndex, event.target.value)}><option value="">Choose another photo</option>{unselected.map(asset => <option key={asset.assetId} value={asset.assetId}>{asset.originalFilename}</option>)}</select></label>
              <div className="v3-showcase-pager"><button type="button" onClick={() => setActivePhotoIndex(activeShowcaseIndex - 1)} disabled={activeShowcaseIndex === 0}><ArrowLeft size={16} /> Previous photo</button><button type="button" onClick={() => setActivePhotoIndex(activeShowcaseIndex + 1)} disabled={activeShowcaseIndex === selected.length - 1}>Next photo <ArrowRight size={16} /></button></div>
            </div>
          </article>}
        </div>{selected.length < bounds[1] && unselected.length > 0 && <label className="v3-add-photo">Add another showcase photo<select value="" onChange={event => { const id = event.target.value; if (id) setSelected(current => [...current, id]); }}><option value="">Choose a photograph</option>{unselected.map(asset => <option key={asset.assetId} value={asset.assetId}>{asset.originalFilename}</option>)}</select></label>}<div className="v3-actions"><StepButton secondary onClick={() => setStage('upload')}><ArrowLeft size={17} /> Back to photos</StepButton><StepButton onClick={saveShowcase} disabled={!!busy}><ArrowRight size={17} /> Continue</StepButton></div></>}
        {(stage === 'narration' || stage === 'narration-job') && <><Head eyebrow="05 / OPTIONAL NARRATION" title="Give the opening and closing a voice.">Hannah will read the opening and closing messages. Photo captions stay on screen. The same words remain visible to the client.</Head><div className="v3-panel v3-narration"><Mic2 size={25} /><div><strong>Opening</strong><p>{openingLine}</p><strong>Closing</strong><p>{closingLine}</p></div></div>{stage === 'narration-job' && <div className="v3-upload-progress" role="status"><span>Recording with Hannah · {job?.progress || 0}%</span><div><i style={{ transform: 'scaleX(' + (job?.progress || 0) / 100 + ')' }} /></div></div>}<div className="v3-actions"><StepButton secondary onClick={skipNarration} disabled={!!busy}>Skip narration</StepButton><StepButton onClick={generateNarration} disabled={!!busy || stage === 'narration-job' && job?.status !== 'failed'}>{job?.status === 'failed' ? 'Retry narration' : 'Generate narration'}</StepButton></div></>}
        {stage === 'music' && <><Head eyebrow="06 / MUSIC" title="Choose the soundtrack.">Afrobeat and Amapiano are shown first. Preview a track before choosing it.</Head>{draft?.soundtrack && <div className="v3-current-track"><Music2 size={17} /> Current choice: <strong>{draft.soundtrack.title}</strong></div>}<input className="v3-search" value={musicSearch} onChange={event => setMusicSearch(event.target.value)} placeholder="Search music" aria-label="Search music" /><div className="v3-track-list">{filteredTracks.map(track => <article key={track.id}><button type="button" onClick={() => { if (activeTrack === track.id) { audioRef.current?.pause(); setActiveTrack(''); } else { setActiveTrack(track.id); if (audioRef.current) { audioRef.current.src = withMediaUrl(track.previewUrl); audioRef.current.play().catch(() => setError('This preview could not play.')); } } }} aria-label={(activeTrack === track.id ? 'Pause ' : 'Play ') + track.title}>{activeTrack === track.id ? <Pause size={17} /> : <Play size={17} />}</button><div><strong>{track.title}</strong><small>{track.genre || track.category} · {track.creator || 'Instrumental'}</small></div><StepButton secondary onClick={() => selectTrack(track)} disabled={!!busy}>{draft?.soundtrack?.catalogId === track.id ? 'Selected' : 'Choose'}</StepButton></article>)}</div><audio ref={audioRef} onEnded={() => setActiveTrack('')} /><label className="v3-custom-track"><Upload size={18} /> Upload your own licensed music<input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac" onChange={event => { customTrack(event.target.files?.[0]); event.target.value = ''; }} disabled={!!busy} /></label><div className="v3-actions"><StepButton secondary onClick={() => setStage(format === 'photo-story' ? 'narration' : 'showcase')}><ArrowLeft size={17} /> Back</StepButton>{draft?.soundtrack && <StepButton onClick={() => setStage('design')}><ArrowRight size={17} /> Continue to design</StepButton>}</div></>}
        {stage === 'design' && <><Head eyebrow="07 / COLOUR & TYPE" title="Set the visual tone.">The first palette comes from the photographs. Adjust each colour and choose two fonts.</Head><div className="v3-design-grid"><div className="v3-panel"><h2>Colour roles</h2>{Object.keys(defaultPalette).map(role => <label className="v3-color" key={role}><span>{role}</span><input type="color" value={palette[role] || defaultPalette[role]} onChange={event => setPalette(current => ({ ...current, [role]: event.target.value }))} /><code>{palette[role]}</code></label>)}<h2>Typography</h2>{['display', 'body'].map(role => <label className="v3-font" key={role}>{role === 'display' ? 'Display font' : 'Body font'}<select value={typography[role]} onChange={event => setTypography(current => ({ ...current, [role]: event.target.value }))}>{FONTS.map(font => <option key={font}>{font}</option>)}</select></label>)}</div><div className="v3-design-preview" style={{ background: palette.background, color: palette.text, borderColor: palette.accent }}><span style={{ color: palette.accent }}>A VEYLO DELIVERY</span><h2 style={{ fontFamily: typography.display }}>{title || draft?.clientName}</h2><p style={{ fontFamily: typography.body }}>{openingLine}</p><div style={{ background: palette.surface }}><img src={assetById.get(openingAssetId)?.thumbnailUrl || assets[0]?.thumbnailUrl} alt="Opening preview" /><small style={{ color: palette.accent }}>THE PHOTOGRAPHS</small></div></div></div><div className="v3-actions"><StepButton secondary onClick={() => setStage(MUSIC.has(format) ? 'music' : 'showcase')}><ArrowLeft size={17} /> Back</StepButton><StepButton onClick={saveDesign} disabled={!!busy}><ArrowRight size={17} /> Preview delivery</StepButton></div></>}
        {stage === 'preview' && <><Head eyebrow="08 / CLIENT PREVIEW" title="See exactly what the client will see.">Open the showcase and full gallery. Check the words, photographs, music, and layout before publishing.</Head><div className="v3-preview-actions"><StepButton secondary onClick={() => setStage('design')}><ArrowLeft size={17} /> Adjust design</StepButton><StepButton onClick={approve} disabled={!!busy}>{busy === 'approve' ? <LoaderCircle className="v3-spin" size={17} /> : <Check size={17} />} Approve and set access</StepButton></div><div className="v3-preview"><ClientDeliveryPreview delivery={previewDelivery} narrationEnabled={false} access={access} /></div></>}
        {stage === 'access' && <><Head eyebrow="09 / ACCESS & PUBLISH" title="Set the rules for this link.">Choose what clients can do, then publish and send the private link.</Head><div className="v3-panel v3-access"><label>Six-digit PIN (optional)<input inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} placeholder={draft?.hasPin ? 'PIN already set — leave blank to keep it' : 'Leave blank for no PIN'} /></label>{draft?.hasPin && <label className="v3-check"><input type="checkbox" checked={removePin} onChange={event => setRemovePin(event.target.checked)} /> Remove current PIN</label>}<label>Expiry date (optional)<input type="datetime-local" value={access.expiresAt} onChange={event => setAccess(current => ({ ...current, expiresAt: event.target.value }))} /></label>{[['allowIndividualDownloads', 'Allow individual downloads'], ['allowDownloadAll', 'Allow full gallery download'], ['allowLikes', 'Allow photo likes'], ['downloadsLocked', 'Lock downloads until ready'], ['watermarkEnabled', 'Show watermark when downloads are locked']].map(([key, label]) => <label className="v3-check" key={key}><input type="checkbox" checked={Boolean(access[key])} onChange={event => setAccess(current => ({ ...current, [key]: event.target.checked }))} /> {label}</label>)}{access.downloadsLocked && <label>Download lock note<input maxLength={200} value={access.downloadLockNote} onChange={event => setAccess(current => ({ ...current, downloadLockNote: event.target.value }))} placeholder="e.g. Downloads open after final balance is paid" /></label>}{access.watermarkEnabled && <label>Watermark text<input maxLength={40} value={access.watermarkText} onChange={event => setAccess(current => ({ ...current, watermarkText: event.target.value }))} placeholder="Studio name" /></label>}{format === 'campaign' && <label className="v3-span">Campaign usage terms (optional)<textarea rows={3} maxLength={1000} value={access.usageTerms} onChange={event => setAccess(current => ({ ...current, usageTerms: event.target.value }))} placeholder="Tell the client how these final files may be used" /></label>}</div><div className="v3-actions"><StepButton secondary onClick={() => setStage('preview')}><ArrowLeft size={17} /> Back to preview</StepButton><StepButton secondary onClick={saveAccess} disabled={!!busy}>Save settings</StepButton><StepButton onClick={publish} disabled={!!busy || billingLoading || quotaReached}><Check size={17} /> Publish delivery</StepButton></div></>}
        {stage === 'published' && <div className="v3-published"><span><Check size={30} /></span><Head eyebrow="DELIVERY PUBLISHED" title="Your delivery is ready.">Send the link to your client on WhatsApp, Instagram, or wherever you speak with them.</Head><div className="v3-share-link"><input readOnly value={published?.url || ''} aria-label="Delivery link" /><StepButton onClick={() => navigator.clipboard.writeText(published?.url || '').then(() => toast.success('Link copied.'))}>Copy link</StepButton></div><div className="v3-actions"><a className="v3-button is-secondary" href={'https://wa.me/?text=' + encodeURIComponent('Your photos are ready: ' + (published?.url || ''))} target="_blank" rel="noopener noreferrer">Share on WhatsApp <ExternalLink size={16} /></a><Link className="v3-button" to="/dashboard">Back to dashboard <ArrowRight size={16} /></Link></div></div>}
      </motion.main></AnimatePresence>
      {published && <section className="v3-published-extra"><div className="v3-actions"><a className="v3-button is-secondary" href={published.url} target="_blank" rel="noopener noreferrer">Open client view <ExternalLink size={16} /></a><StepButton secondary onClick={shareDelivery}><Share2 size={16} /> Open share menu</StepButton><StepButton secondary onClick={downloadQr} disabled={!!busy}><QrCode size={16} /> Download QR</StepButton></div><form onSubmit={sendEmail}><label><Mail size={17} /><input type="email" required maxLength={254} value={clientEmail} onChange={event => setClientEmail(event.target.value)} placeholder="Client email address" aria-label="Client email address" /></label><StepButton type="submit" disabled={!!busy}>{busy === 'email' ? 'Sending…' : 'Send by email'}</StepButton></form></section>}
    </div>
  </div>;
}
