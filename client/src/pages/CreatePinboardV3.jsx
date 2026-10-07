import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { ArrowLeft, ArrowRight, BadgeCheck, Check, ChevronDown, ChevronUp, CircleHelp, Clock3, Copy, Download, Eye, Grid2X2, Image, LoaderCircle, LockKeyhole, MessageCircle, Music2, Palette, Pause, Play, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../config/env.js';
import api, { apiMessage } from '../services/api.js';
import { uploadDeliveryPhotosV3 } from '../utils/deliveryUploadV3.js';
import UploadConnectionStatus from '../components/UploadConnectionStatus.jsx';
import { uploadDeliverySoundtrack } from '../utils/deliveryUpload.js';
import { creationPreviewBranding, mergeDeliveryDraft } from '../utils/deliveryDraft.js';
import { useDialogFocus } from '../components/useDialogFocus.js';
import { localDeliveryExpiry } from '../utils/deliveryAccess.js';
import { recoverPublishedDelivery } from '../utils/deliveryPublishV3.js';
import { ClientPreviewPhoneFrame } from '../components/delivery/PhonePresentation.jsx';
import { resolvedGridboardPalette, readableGridboardPalette, gridboardPaletteContrast, gridboardAccentInk } from '../utils/gridboardPalette.js';
import './CreatePinboardV3.css';
import './GridboardPreview.css';

const FONTS = ['Playfair Display', 'Outfit', 'Plus Jakarta Sans', 'Cormorant Garamond', 'DM Sans', 'Libre Baskerville', 'Manrope'];
const DEFAULT_ACCESS = { allowIndividualDownloads: true, allowDownloadAll: true, allowLikes: false, expiresAt: '' };
const STEPS = [{ id: 'details', label: 'Details' }, { id: 'photos', label: 'Photos' }, { id: 'design', label: 'Board' }, { id: 'access', label: 'Access' }, { id: 'publish', label: 'Publish' }];
function mediaUrl(value) { return typeof value === 'string' && value.startsWith('/api/') ? `${API_BASE_URL.replace(/\/$/, '')}${value.slice(4)}` : value; }
function photoHue(asset) {
  const hex = String(asset?.analysis?.colors?.[0] || asset?.photoColors?.[0] || asset?.dominantColor || '').match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return null;
  const [r, g, b] = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min;
  if (!delta) return null;
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}

function errorText(error) {
  if (error?.response?.status === 401) return 'Your session expired. Sign in again to continue.';
  if (error?.response?.status === 403 && error?.response?.data?.code === 'MONTHLY_DELIVERY_LIMIT_REACHED') return error.response.data.message;
  return apiMessage(error, error?.message || 'This step could not finish. Check your connection and try again.');
}
function quotaMessage(data) { return `You have published all ${data?.limits?.deliveriesPerMonth || 3} Free deliveries this month. Start another next month, or move to Pro.`; }
function reachedQuota(data) { return data?.plan === 'free' && data?.usage?.deliveriesRemaining === 0; }
function fallbackLayouts(assets) {
  const ordered = [...assets].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const portrait = ordered.filter(asset => Number(asset.height || 0) >= Number(asset.width || 0));
  const landscape = ordered.filter(asset => Number(asset.width || 0) > Number(asset.height || 0));
  const balanced = [];
  while (portrait.length || landscape.length) { if (portrait.length) balanced.push(portrait.shift()); if (landscape.length) balanced.push(landscape.shift()); }
  const tagGroups = new Map();
  ordered.forEach(asset => {
    const tag = (asset.analysis?.momentTags || [])[0];
    if (!tag) return;
    const key = String(tag).toLowerCase();
    if (!tagGroups.has(key)) tagGroups.set(key, []);
    tagGroups.get(key).push(asset);
  });
  const grouped = [...tagGroups.values()].filter(group => group.length > 1).flat();
  const groupedIds = [...new Set([...grouped, ...ordered.filter(asset => !grouped.includes(asset))].map(asset => asset.assetId))];
  const colourOrdered = [...ordered].sort((a, b) => {
    const first = photoHue(a); const second = photoHue(b);
    if (first == null) return second == null ? 0 : 1;
    if (second == null) return -1;
    return first - second;
  });
  return [
    { id: 'balanced', title: 'Balanced arrangement', description: 'Alternates portrait and landscape photos where the set allows it.', assetOrder: balanced.map(asset => asset.assetId) },
    { id: 'moments', title: 'Scenes together', description: 'Groups photos by scene when analysis is available; otherwise keeps upload order.', assetOrder: groupedIds },
    { id: 'colour-flow', title: 'Colour-led order', description: 'Orders by dominant photo colour when available. Every photo stays in the gallery.', assetOrder: colourOrdered.map(asset => asset.assetId) }
  ];
}
function initialStage(delivery) {
  if (delivery?.status === 'published') return 'published';
  const step = delivery?.v3?.step;
  if (step === 'preparing' || delivery?.status === 'analyzing') return 'preparing';
  if (step === 'access') return delivery?.reviewApprovedAt ? 'publish' : 'access';
  if (step === 'pinboard' || delivery?.pinboard?.layouts?.length) return 'design';
  return delivery?._id ? 'photos' : 'details';
}

function Toggle({ checked, onChange, children }) {
  return <label className="pb-toggle"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span aria-hidden="true" /><span>{children}</span></label>;
}

export default function CreatePinboardV3({ user, initialDelivery }) {
  const navigate = useNavigate();
  const reduced = useVeyloReducedMotion();
  const [draft, setDraft] = useState(initialDelivery || null);
  const [stage, setStage] = useState(() => initialStage(initialDelivery));
  const [clientName, setClientName] = useState(initialDelivery?.clientName || '');
  const [title, setTitle] = useState(initialDelivery?.pinboard?.title || initialDelivery?.title || '');
  const [entitlements, setEntitlements] = useState(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [job, setJob] = useState(initialDelivery?.generationJob || null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadBatch, setUploadBatch] = useState(null);
  const [failedFiles, setFailedFiles] = useState([]);
  const [description, setDescription] = useState(initialDelivery?.pinboard?.description || '');
  const descriptionDirty = !!draft && description.trim() !== (draft.pinboard?.description || '');
  useEffect(() => {
    if (!descriptionDirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    const leave = event => { const anchor = event.target.closest('a[href]'); if (!anchor || anchor.target === '_blank' || event.ctrlKey || event.metaKey) return; const target = new URL(anchor.href, location.href); if (target.pathname === location.pathname && target.search === location.search) return; if (!window.confirm('You have an unsaved gallery introduction. Leave this page?')) { event.preventDefault(); event.stopPropagation(); } };
    window.addEventListener('beforeunload', warn); document.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', leave, true); };
  }, [descriptionDirty]);
  const [boardReady, setBoardReady] = useState(Boolean(initialDelivery?.pinboard?.layouts?.length));
  const [useStandardBoard, setUseStandardBoard] = useState(initialDelivery?.pinboard?.analysisStatus === 'standard');
  const [layouts, setLayouts] = useState(initialDelivery?.pinboard?.layouts || []);
  const [selectedLayoutId, setSelectedLayoutId] = useState(initialDelivery?.pinboard?.selectedLayoutId || 'balanced');
  const [moments, setMoments] = useState(initialDelivery?.pinboard?.moments || []);
  const [palette, setPalette] = useState(() => resolvedGridboardPalette(initialDelivery?.pinboard?.palette, initialDelivery?.assets || []));
  const [typography, setTypography] = useState(initialDelivery?.pinboard?.typography || { display: 'Cormorant Garamond', body: 'Outfit' });
  const [grid, setGrid] = useState(initialDelivery?.pinboard?.grid || { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' });
  const [animation, setAnimation] = useState(initialDelivery?.pinboard?.animation || 'soft-fade');
  const [soundtracks, setSoundtracks] = useState(null);
  const [previewingTrackId, setPreviewingTrackId] = useState('');
  const [musicCategory, setMusicCategory] = useState('all');
  const [musicSearch, setMusicSearch] = useState('');
  const [musicTab, setMusicTab] = useState('library');
  const [paletteNotice, setPaletteNotice] = useState('');
  const [paletteVersion, setPaletteVersion] = useState(0);
  const soundtrackPreviewRef = useRef(null);
  const [access, setAccess] = useState({ ...DEFAULT_ACCESS, ...initialDelivery?.access, expiresAt: localDeliveryExpiry(initialDelivery?.access?.expiresAt) });
  const [pin, setPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [showDesktopPreview, setShowDesktopPreview] = useState(false);
  const previewDialog = useRef(null);
  const previewTrigger = useRef(null);
  useDialogFocus(showDesktopPreview, previewDialog, () => setShowDesktopPreview(false), previewTrigger);
  function openPreview(event) { previewTrigger.current = event.currentTarget; setShowDesktopPreview(true); }
  const [published, setPublished] = useState(initialDelivery?.status === 'published' ? { publicId: initialDelivery.publicId, url: `${window.location.origin}/d/${initialDelivery.publicId}` } : null);
  const assets = draft?.assets || [];
  const maxPhotos = entitlements?.limits?.photosPerDelivery || (user?.plan === 'pro' || user?.plan === 'studio' ? 500 : 100);
  const quotaReached = reachedQuota(entitlements);
  const previewBranding = creationPreviewBranding(user, entitlements);
  const musicCategories = ['all', 'afrobeat', 'amapiano', ...new Set((soundtracks || []).flatMap(track => [track.category, track.genre]).filter(Boolean).map(value => String(value).toLowerCase().trim()))].filter((value, index, all) => all.indexOf(value) === index);
  const filteredSoundtracks = (soundtracks || []).filter(track => {
    const metadata = [track.title, track.creator, track.genre, track.category, track.mood, ...(track.tags || [])].join(' ').toLowerCase();
    return (musicCategory === 'all' || metadata.includes(musicCategory)) && metadata.includes(musicSearch.trim().toLowerCase());
  }).sort((first, second) => {
    const rank = track => /afrobeats?/i.test([track.genre, track.category, track.title, ...(track.tags || [])].join(' ')) ? 0 : /amapiano/i.test([track.genre, track.category, track.title, ...(track.tags || [])].join(' ')) ? 1 : 2;
    return rank(first) - rank(second);
  });
  const paletteContrast = gridboardPaletteContrast(palette);
  const activeStep = stage === 'preparing' ? 'photos' : ['published', 'publish'].includes(stage) ? 'publish' : stage;
  const currentIndex = STEPS.findIndex(item => item.id === activeStep);
  const previewBoard = useMemo(() => ({
    ...(draft || {}), kind: 'pinboard', title: title || `${clientName || 'Client'}'s photographs`, clientName, assets,
    branding: previewBranding,
    galleryOrder: layouts.find(item => item.id === selectedLayoutId)?.assetOrder || assets.map(asset => asset.assetId),
    pinboard: { description, title: title || `${clientName || 'Client'}'s photographs`, layouts: layouts.length ? layouts : fallbackLayouts(assets), selectedLayoutId, moments, palette, typography, grid, animation, analysisStatus: useStandardBoard ? 'standard' : 'ready' }
  }), [draft, title, description, clientName, assets, layouts, selectedLayoutId, moments, palette, typography, grid, animation, useStandardBoard, previewBranding.type, previewBranding.name, previewBranding.logoUrl]);

  async function refresh() {
    if (!draft?._id) return null;
    const { data } = await api.get('/v1/deliveries/' + draft._id);
    const next = data.data; setDraft(next); setJob(next.generationJob || null);
    return next;
  }
  async function action(label, task) {
    setBusy(label); setError('');
    try { return await task(); } catch (failure) {
      if (label === 'publish') {
        const result = await recoverPublishedDelivery(draft?._id);
        if (result) { setPublished(result); setStage('published'); return result; }
      }
      setError(errorText(failure)); return null;
    } finally { setBusy(''); }
  }

  useEffect(() => {
    let active = true;
    api.get('/v1/billing/status').then(({ data }) => { if (active) setEntitlements(data.data); }).catch(failure => { if (active) setError(errorText(failure)); }).finally(() => { if (active) setBillingLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); }, [stage, reduced]);
  useEffect(() => {
    if (!draft?._id || stage !== 'preparing') return undefined;
    let active = true;
    const poll = async () => {
      try {
        const { data } = await api.get('/v1/deliveries/' + draft._id);
        if (!active) return;
        const next = data.data; setDraft(next); setJob(next.generationJob || null);
        if (next.generationJob?.status === 'failed') { setError(next.generationJob.errorMessage || 'The photo analysis did not finish. Retry it or use a standard board.'); return; }
        if (next.v3?.step === 'pinboard' && next.pinboard?.layouts?.length) {
          setLayouts(next.pinboard.layouts); setSelectedLayoutId(next.pinboard.selectedLayoutId || 'balanced'); setMoments(next.pinboard.moments || []); setPalette(resolvedGridboardPalette(next.pinboard.palette, next.assets || [])); setTypography(next.pinboard.typography || { display: 'Cormorant Garamond', body: 'Outfit' }); setGrid(next.pinboard.grid || { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' }); setAnimation(next.pinboard.animation || 'soft-fade'); setTitle(next.pinboard.title || next.title || ''); setDescription(next.pinboard.description || ''); setBoardReady(true); setUseStandardBoard(next.pinboard.analysisStatus === 'standard'); setStage('design');
        }
      } catch (failure) { if (active) setError(errorText(failure)); }
    };
    poll(); const timer = window.setInterval(poll, 2300);
    return () => { active = false; window.clearInterval(timer); };
  }, [draft?._id, stage]);

  useEffect(() => {
    if (stage !== 'design' || !draft?._id || soundtracks !== null) return undefined;
    let active = true;
    api.get('/v1/deliveries/soundtracks').then(({ data }) => { if (active) setSoundtracks(Array.isArray(data.data) ? data.data : []); }).catch(failure => { if (active) { setError(errorText(failure)); setSoundtracks([]); } });
    return () => { active = false; };
  }, [stage, draft?._id, soundtracks]);

  useEffect(() => () => soundtrackPreviewRef.current?.pause(), []);
  useEffect(() => {
    if (stage === 'design') return;
    soundtrackPreviewRef.current?.pause();
    if (soundtrackPreviewRef.current) soundtrackPreviewRef.current.currentTime = 0;
    setPreviewingTrackId('');
  }, [stage]);

  async function previewSoundtrack(track) {
    const audio = soundtrackPreviewRef.current;
    if (!audio) return;
    if (previewingTrackId === track.id) { audio.pause(); audio.currentTime = 0; setPreviewingTrackId(''); return; }
    audio.pause(); audio.src = mediaUrl(track.previewUrl); audio.load();
    try { await audio.play(); setPreviewingTrackId(track.id); }
    catch { setError('This music preview could not start. Check your connection and try again.'); setPreviewingTrackId(''); }
  }

  async function chooseSoundtrack(trackId) {
    soundtrackPreviewRef.current?.pause(); setPreviewingTrackId('');
    await action('soundtrack', async () => {
      await api.post(`/v1/deliveries/${draft._id}/soundtrack/select`, { trackId });
      await refresh();
    });
  }

  async function clearSoundtrack() {
    soundtrackPreviewRef.current?.pause(); setPreviewingTrackId('');
    await action('soundtrack', async () => { await api.delete(`/v1/deliveries/${draft._id}/soundtrack`); await refresh(); });
  }
  async function customSoundtrack(file) {
    if (!file) return;
    if (!['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'audio/aac'].includes(file.type)) { setError('Choose an MP3, WAV, M4A, OGG or AAC audio file.'); return; }
    await action('soundtrack', async () => {
      await uploadDeliverySoundtrack(draft._id, file, file.name.replace(/\.[^.]+$/, ''));
      await refresh(); setMusicTab('library');
      toast.success('Your track is selected for the slideshow.');
    });
  }

  async function continueDetails(event) {
    event?.preventDefault();
    if (!draft && quotaReached) { setError(quotaMessage(entitlements)); return; }
    if (clientName.trim().length < 2) { setError('Enter the client name before continuing.'); return; }
    if (title.trim().length < 2) { setError('Give this gallery a title before continuing.'); return; }
    await action('details', async () => {
      const body = { kind: 'pinboard', clientName: clientName.trim(), title: title.trim(), shootType: '', purpose: '', originalPurpose: '', clarificationAnswers: [] };
      if (draft?._id) await api.patch(`/v1/deliveries/${draft._id}/v3/details`, body);
      else {
        const { data } = await api.post('/v1/deliveries/v3', body); setDraft(data.data); navigate('/create?draft=' + data.data._id, { replace: true });
      }
      setStage('photos');
    });
  }
  async function uploadFiles(list) {
    const files = Array.from(list || []); if (!files.length) return;
    const invalid = files.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20_000_000);
    if (invalid) { setError('Use JPEG, PNG, or WebP photographs no larger than 20 MB each.'); return; }
    if (assets.length + files.length > maxPhotos) { setError(`${entitlements?.planName || 'Your plan'} allows up to ${maxPhotos} photos in one delivery.`); return; }
    await action('upload', async () => {
      setUploadPercent(0); setUploadBatch(null); setFailedFiles([]);
      const result = await uploadDeliveryPhotosV3(draft._id, files, (percent, item) => { setUploadPercent(percent); if (item?.batch) setUploadBatch(item.batch); });
      setFailedFiles(result.errors.map(item => item.file)); await refresh(); setBoardReady(false); setLayouts([]); setMoments([]);
      if (result.errors.length) setError(`${result.errors.length} photo${result.errors.length === 1 ? '' : 's'} did not upload. Retry those files.`);
    });
  }
  async function deletePhoto(assetId) {
    await action('delete', async () => { await api.delete(`/v1/deliveries/${draft._id}/assets/${assetId}`); await refresh(); setBoardReady(false); setLayouts([]); setMoments([]); });
  }
  async function prepare() {
    if (!assets.length) { setError('Add at least one finished photograph first.'); return; }
    await action('prepare', async () => { const { data } = await api.post(`/v1/deliveries/${draft._id}/v3/prepare`); setJob(data.data); setStage('preparing'); setError(''); });
  }
  async function useStandard() {
    if (!assets.length) return;
    const basicLayouts = fallbackLayouts(assets);
    const body = { title: title.trim() || `${clientName || 'Client'}'s photographs`, useStandardBoard: true, selectedLayoutId: 'balanced', layouts: basicLayouts, moments: [], palette, typography, grid, animation };
    await action('standard', async () => {
      const { data } = await api.patch(`/v1/deliveries/${draft._id}/v3/pinboard`, body);
      setDraft(current => mergeDeliveryDraft(current, data.data)); setLayouts(basicLayouts); setSelectedLayoutId('balanced'); setMoments([]); setUseStandardBoard(true); setBoardReady(true); setStage('design');
    });
  }
  function updateMoment(index, changes) { setMoments(current => current.map((moment, at) => at === index ? { ...moment, ...changes } : moment)); }
  function moveMoment(index, offset) { setMoments(current => { const next = [...current]; const target = index + offset; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; }); }
  function mergeMoment(index) {
    setMoments(current => { if (index < 0 || index >= current.length - 1) return current; const next = [...current]; next[index] = { ...next[index], assetIds: [...new Set([...next[index].assetIds, ...next[index + 1].assetIds])] }; next.splice(index + 1, 1); return next; });
  }
  async function repickPalette() {
    setPaletteNotice('Choosing another palette from your photographs…');
    const chosen = await action('palette', async () => {
      const { data } = await api.post(`/v1/deliveries/${draft._id}/v3/theme/repick`);
      const nextPalette = data.data?.pinboard?.palette;
      if (!nextPalette) throw new Error('No new palette was returned. Try again.');
      const safe = readableGridboardPalette(nextPalette);
      setPalette(safe);
      setPaletteVersion(value => value + 1);
      setPaletteNotice('New colours are showing in the client preview.');
      setDraft(current => mergeDeliveryDraft(current, data.data));
      return safe;
    });
    if (!chosen) setPaletteNotice('No new colours were applied. See the error above and try again.');
  }
  function changePalette(key, value) {
    setPalette(current => readableGridboardPalette({ ...current, [key]: value }, key));
    setPaletteNotice('Colour updated in the client preview.');
  }
  async function saveBoard() {
    if (title.trim().length < 2) { setError('Give this gallery a title with at least two characters.'); return; }
    if (!boardReady || layouts.length !== 3) { setError('Choose a generated or standard board before continuing.'); return; }
    await action('board', async () => {
      const body = { title: title.trim(), description: description.trim(), useStandardBoard, selectedLayoutId, layouts, moments, palette, typography, grid, animation };
      const { data } = await api.patch(`/v1/deliveries/${draft._id}/v3/pinboard`, body); setDraft(current => mergeDeliveryDraft(current, data.data)); setStage('access');
    });
  }
  async function approve() {
    if (pin && pin.length !== 6) { setError('A PIN needs six digits. Finish entering it or clear the field.'); return; }
    if (access.expiresAt && new Date(access.expiresAt) <= new Date()) { setError('Choose a future expiry date, or clear the field for a link that does not expire.'); return; }
    await action('approve', async () => {
      const body = { ...access, expiresAt: access.expiresAt ? new Date(access.expiresAt).toISOString() : '' };
      if (pin) body.pin = pin; else if (removePin) body.pin = '';
      await api.patch(`/v1/deliveries/${draft._id}/v3/access`, body);
      await api.post(`/v1/deliveries/${draft._id}/v3/approve`); await refresh(); setPin(''); setRemovePin(false); setStage('publish');
    });
  }
  async function publish() {
    await action('publish', async () => {
      const { data: status } = await api.get('/v1/billing/status'); setEntitlements(status.data);
      if (!status.data) throw new Error('We could not check your plan. Try publishing again.');
      if (reachedQuota(status.data)) { setError(quotaMessage(status.data)); return; }
      const { data } = await api.post(`/v1/deliveries/${draft._id}/v3/publish`);
      setPublished(data.data); setStage('published');
    });
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(published?.url || `${window.location.origin}/d/${published?.publicId}`); toast.success('Private link copied.'); }
    catch { setError('The link could not be copied. Select and copy it below.'); }
  }

  const steps = STEPS.map((item, index) => ({ ...item, number: String(index + 1).padStart(2, '0'), done: index < currentIndex }));
  const content = <>
    <div className="pb-create-top"><Link to="/dashboard" aria-label="Back to dashboard">Veylo <span>·</span> Create delivery</Link><div className="pb-create-top-actions"><span>GRIDBOARD DELIVERY</span>{['design', 'access', 'publish'].includes(stage) && <button type="button" onClick={openPreview}><Eye size={14} /> View client preview</button>}</div></div>
    <nav className="pb-create-steps" aria-label="Creation progress">{steps.map((item, index) => <div key={item.id} className={(activeStep === item.id ? 'is-active ' : '') + (item.done ? 'is-done' : '')}><span>{item.done ? <Check size={14} /> : item.number}</span><strong>{item.label}</strong>{index < steps.length - 1 && <i />}</div>)}</nav>
    {quotaReached && !draft && <div className="pb-create-quota"><Clock3 size={17} />{quotaMessage(entitlements)} <Link to="/billing">View Pro</Link></div>}
    <AnimatePresence initial={false} mode="wait">
      <motion.section key={stage} className="pb-create-stage" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -8 }} transition={{ duration: .22 }}>
        {!!error && <div className="pb-create-error" role="alert"><CircleHelp size={18} /><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}

        {stage === 'details' && <div className="pb-create-form-card"><span className="pb-create-eyebrow">01 / DELIVERY DETAILS</span><h1>Start with the gallery.</h1><p>Give it a client name and a title they will recognise when it arrives.</p><form onSubmit={continueDetails}><label>Client name<input value={clientName} onChange={event => setClientName(event.target.value)} autoComplete="name" maxLength={100} placeholder="e.g. Lora Ade" /></label><label>Gallery title<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="e.g. Lora's 25th birthday" /></label><div className="pb-create-note"><Grid2X2 size={18} /><span>GridBoard shows the complete gallery first. You can change the board layout and colours after adding photos.</span></div><div className="pb-create-actions"><Link to="/create" className="pb-create-back"><ArrowLeft size={17} /> Choose a delivery type</Link><button type="submit" disabled={busy === 'details' || billingLoading || !draft && quotaReached}>{busy === 'details' ? <LoaderCircle className="pb-spin" size={17} /> : null}Continue to photos<ArrowRight size={17} /></button></div></form></div>}

        {stage === 'photos' && <div className="pb-create-content"><div className="pb-create-title"><span className="pb-create-eyebrow">02 / FINISHED PHOTOS</span><h1>Add the complete gallery.</h1><p>Every photo you add stays in this GridBoard. Veylo will suggest ways to arrange them, then you can choose what feels right.</p></div><div className="pb-upload-row"><div><strong>{assets.length} / {maxPhotos}</strong><span>{entitlements?.planName || (maxPhotos > 100 ? 'Pro' : 'Free')} photo limit · JPEG, PNG, or WebP · Up to 20 MB each</span></div><label className="pb-upload-button"><Upload size={18} />Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!!busy} onChange={event => { void uploadFiles(event.target.files); event.target.value = ''; }} /></label></div>{busy === 'upload' && <div className="pb-upload-progress" role="status"><span style={{ transform: `scaleX(${uploadPercent / 100})` }} /><strong>Uploading photos · {uploadPercent}%</strong></div>}{busy === 'upload' && <UploadConnectionStatus batch={uploadBatch} />}{failedFiles.length > 0 && <div className="pb-upload-retry"><p>{failedFiles.length} photo{failedFiles.length > 1 ? 's' : ''} still need uploading.</p><button type="button" onClick={() => void uploadFiles(failedFiles)} disabled={!!busy}><RefreshCw size={15} />Retry failed photos</button></div>}<div className="pb-upload-grid">{assets.map((asset, index) => <article key={asset.assetId}><img src={asset.thumbnailUrl || asset.url} alt={asset.originalFilename || `Uploaded photo ${index + 1}`} loading={index < 12 ? 'eager' : 'lazy'} /><span>{String(index + 1).padStart(2, '0')}</span><button type="button" onClick={() => void deletePhoto(asset.assetId)} disabled={!!busy} aria-label={`Remove photo ${index + 1}`}><Trash2 size={15} /></button></article>)}{!assets.length && <div className="pb-upload-empty"><Image size={28} /><strong>Start with the finished photos.</strong><span>You can add more or remove individual photos before publishing.</span></div>}</div><div className="pb-create-actions"><button type="button" className="pb-create-back" onClick={() => setStage('details')}><ArrowLeft size={17} />Back to details</button><button type="button" onClick={() => void prepare()} disabled={!assets.length || !!busy}>Arrange the GridBoard<ArrowRight size={17} /></button></div></div>}

        {stage === 'preparing' && <div className="pb-preparing"><div className="pb-preparing-icon"><LoaderCircle className="pb-spin" size={30} /></div><span className="pb-create-eyebrow">PREPARING YOUR BOARD</span><h1>Arranging your board.</h1><p>Veylo is looking at image shape, colour, and visible details to suggest three layouts and useful groups. Every finished photo stays in the gallery.</p><div className="pb-preparing-progress"><span style={{ width: `${Math.max(8, Math.min(96, job?.progress || 8))}%` }} /><b>{Math.max(8, Math.min(96, job?.progress || 8))}%</b></div><div className="pb-preparing-meta"><span>{assets.length} photos in this delivery</span><span>{job?.stage === 'designing-pinboard' ? 'Building board layouts' : 'Analysing photographs'}</span></div>{job?.status === 'failed' && <div className="pb-analysis-recovery"><strong>The analysis did not finish.</strong><span>Your uploaded photos are safe. Try again, or continue with a standard board and retry analysis later.</span><div><button type="button" className="pb-secondary" onClick={() => void prepare()} disabled={!!busy}><RefreshCw size={16} />Retry analysis</button><button type="button" onClick={() => void useStandard()} disabled={!!busy}>Use a standard board<ArrowRight size={16} /></button></div></div>}<button className="pb-create-back" type="button" onClick={() => setStage('photos')}><ArrowLeft size={17} />Back to photos</button></div>}

        {['design', 'access', 'publish'].includes(stage) && <div className="pb-create-workspace"><div className="pb-create-editor">
          {stage === 'design' && <><div className="pb-create-title"><span className="pb-create-eyebrow">03 / BOARD DESIGN</span><h1>Choose how it reads.</h1><p>Try the three arrangements. They all keep the complete gallery and original files.</p></div>{useStandardBoard && <div className="pb-standard-note"><Image size={17} /><span>This board uses a standard arrangement because photo analysis did not finish.</span><button type="button" onClick={() => void prepare()} disabled={!!busy}>Retry AI analysis</button></div>}<label className="pb-create-field">Gallery title<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} /></label><section className="pb-layout-section"><div className="pb-section-heading"><div><span>BOARD LAYOUT</span><p>Each option arranges the same full set of photos in a different way.</p></div><button type="button" onClick={() => void prepare()} disabled={!!busy}><RefreshCw size={15} />Try layouts again</button></div><div className="pb-layout-options">{(layouts.length ? layouts : fallbackLayouts(assets)).map(layout => <button type="button" key={layout.id} className={selectedLayoutId === layout.id ? 'is-selected' : ''} onClick={() => setSelectedLayoutId(layout.id)} aria-pressed={selectedLayoutId === layout.id}><span className="pb-layout-art" aria-hidden="true">{layout.assetOrder.slice(0, 6).map(id => { const asset = assets.find(item => item.assetId === id); return asset ? <img key={id} src={asset.thumbnailUrl || asset.url} alt="" loading="lazy" /> : null; })}</span><strong>{layout.title}</strong><small>{layout.description}</small>{selectedLayoutId === layout.id && <Check size={17} />}</button>)}</div></section><section className="pb-moment-editor"><div className="pb-section-heading"><div><span>FIND A MOMENT</span><p>Rename, reorder, combine, or hide suggested groups.</p></div><span>{moments.filter(item => !item.hidden).length} shown</span></div>{moments.length ? moments.map((moment, index) => <div className={'pb-moment-edit' + (moment.hidden ? ' is-hidden' : '')} key={moment.id}><label><span>GROUP {String(index + 1).padStart(2, '0')}</span><input maxLength={40} value={moment.title} onChange={event => updateMoment(index, { title: event.target.value })} aria-label={`Moment group ${index + 1} title`} /></label><small>{moment.assetIds.length} photographs</small><div><button type="button" onClick={() => moveMoment(index, -1)} disabled={index === 0} aria-label="Move group up"><ChevronUp size={16} /></button><button type="button" onClick={() => moveMoment(index, 1)} disabled={index === moments.length - 1} aria-label="Move group down"><ChevronDown size={16} /></button><button type="button" onClick={() => updateMoment(index, { hidden: !moment.hidden })}>{moment.hidden ? 'Show' : 'Hide'}</button>{index < moments.length - 1 && <button type="button" onClick={() => mergeMoment(index)}>Merge next</button>}</div></div>) : <p className="pb-no-moments">No groups were suggested. The board still includes every photo and can be published as a standard gallery.</p>}</section><section className="pb-design-section"><div className="pb-section-heading"><div><span>COLOUR AND TYPE</span><p>Change the palette or ask Veylo to choose another from the photos.</p></div><button type="button" onClick={() => void repickPalette()} disabled={!!busy || !assets.some(asset => asset.analysis?.colors?.length || asset.photoColors?.length || asset.dominantColor)}><RefreshCw size={15} className={busy === 'palette' ? 'pb-spin' : ''} />{busy === 'palette' ? 'Choosing colours…' : 'Pick new colours'}</button></div><div className="pb-palette-row">{Object.entries(palette).map(([key, value]) => <label key={key}><span>{key === 'surface' ? 'Panels' : key[0].toUpperCase() + key.slice(1)}</span><input type="color" value={value} onChange={event => changePalette(key, event.target.value)} aria-label={`${key} colour`} /><code>{value}</code></label>)}</div><div className="pb-colour-feedback" role="status"><span className="pb-palette-preview" key={paletteVersion} style={{ background: palette.background, color: palette.text, borderColor: palette.accent }}><i style={{ background: palette.surface }}>Your gallery text</i><b style={{ background: palette.accent, color: gridboardAccentInk(palette.accent) }}>PHOTO GRID</b></span><span>{paletteNotice || 'The preview shows these colours as your client will see them.'}<small>Text contrast: {paletteContrast.background >= 4.5 && paletteContrast.surface >= 4.5 ? 'Readable on the background and panels' : 'Please adjust the text colour'}</small></span></div><div className="pb-font-row"><label>Display font<select value={typography.display} onChange={event => setTypography(current => ({ ...current, display: event.target.value }))}>{FONTS.map(font => <option key={font}>{font}</option>)}</select></label><label>Body font<select value={typography.body} onChange={event => setTypography(current => ({ ...current, body: event.target.value }))}>{FONTS.map(font => <option key={font}>{font}</option>)}</select></label></div></section><section className="pb-design-section"><div className="pb-section-heading"><div><span>GRID AND MOTION</span><p>Set the spacing and number of columns by screen size.</p></div></div><div className="pb-grid-settings"><label>Phone columns<select value={grid.mobileColumns} onChange={event => setGrid(current => ({ ...current, mobileColumns: Number(event.target.value) }))}><option value="1">1 column</option><option value="2">2 columns</option></select></label><label>Tablet columns<select value={grid.tabletColumns} onChange={event => setGrid(current => ({ ...current, tabletColumns: Number(event.target.value) }))}><option value="2">2 columns</option><option value="3">3 columns</option></select></label><label>Desktop columns<select value={grid.desktopColumns} onChange={event => setGrid(current => ({ ...current, desktopColumns: Number(event.target.value) }))}><option value="3">3 columns</option><option value="4">4 columns</option><option value="5">5 columns</option></select></label><label className="pb-description-editor">Gallery introduction<textarea maxLength={240} rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="A short note for your client." /><small role="status">{descriptionDirty ? 'Unsaved introduction · saved when you continue' : 'Introduction saved'}</small></label><label>Photo spacing<select value={grid.gap} onChange={event => setGrid(current => ({ ...current, gap: event.target.value }))}><option value="compact">Compact</option><option value="regular">Regular</option><option value="spacious">Spacious</option></select></label><label>Entrance motion<select value={animation} onChange={event => setAnimation(event.target.value)}><option value="soft-fade">Soft fade</option><option value="staggered">Gentle stagger</option><option value="none">None</option></select></label></div></section><section className="pb-design-section pb-soundtrack-editor">
              <div className="pb-section-heading"><div><span>MUSIC FOR THE SLIDESHOW · OPTIONAL</span><p>The board opens quietly. Music plays only when the client starts a slideshow.</p></div>{draft?.soundtrack && <button type="button" onClick={() => void clearSoundtrack()} disabled={busy === 'soundtrack'}>Remove music</button>}</div>
              {draft?.soundtrack && <div className="pb-soundtrack-selected"><Music2 size={17} /><span><small>SELECTED SOUNDTRACK</small><strong>{draft.soundtrack.title}</strong></span><Check size={16} /></div>}
              <div className="pb-music-tabs" role="tablist" aria-label="Music source"><button type="button" role="tab" aria-selected={musicTab === 'library'} className={musicTab === 'library' ? 'is-active' : ''} onClick={() => setMusicTab('library')}><Music2 size={16} />Music library</button><button type="button" role="tab" aria-selected={musicTab === 'own'} className={musicTab === 'own' ? 'is-active' : ''} onClick={() => setMusicTab('own')}><Upload size={16} />Upload your own</button></div>
              {musicTab === 'library' ? <>
                <label className="pb-music-search">Find a track<input value={musicSearch} onChange={event => setMusicSearch(event.target.value)} placeholder="Search title, mood, genre or artist" /></label>
                <div className="pb-music-categories" role="group" aria-label="Filter music by style">{musicCategories.map(category => <button type="button" key={category} aria-pressed={musicCategory === category} className={musicCategory === category ? 'is-active' : ''} onClick={() => setMusicCategory(category)}>{category === 'all' ? 'All music' : category.split(/[\s-]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</button>)}</div>
                <div className="pb-soundtrack-list" aria-label="Soundtrack library">{soundtracks === null ? <p className="pb-soundtrack-empty">Loading soundtrack choices…</p> : filteredSoundtracks.length ? filteredSoundtracks.map(track => { const selected = draft?.soundtrack?.catalogId === track.id; return <article key={track.id} className={selected ? 'is-selected' : ''}><div><strong>{track.title}</strong><small>{[track.creator, track.mood, track.genre, track.durationSec ? Math.round(track.durationSec / 60) + ' min' : ''].filter(Boolean).join(' · ')}</small></div><div><button type="button" className="pb-track-preview" onClick={() => void previewSoundtrack(track)} aria-label={(previewingTrackId === track.id ? 'Stop ' : 'Preview ') + track.title}><span>{previewingTrackId === track.id ? <Pause size={14} /> : <Play size={14} />}</span>{previewingTrackId === track.id ? 'Stop' : 'Preview'}</button><button type="button" className="pb-track-select" onClick={() => void chooseSoundtrack(track.id)} disabled={selected || busy === 'soundtrack'}>{selected ? <><Check size={14} />Selected</> : 'Use this track'}</button></div></article>; }) : <p className="pb-soundtrack-empty">{soundtracks.length ? 'No tracks match this search. Try another style.' : 'Music choices are unavailable. You can still upload your own track.'}</p>}</div>
              </> : <div className="pb-own-music"><Upload size={23} /><h3>Use a track you own.</h3><p>Choose audio you have permission to use in this client delivery. It plays only during the slideshow.</p><label><Upload size={16} />{busy === 'soundtrack' ? 'Uploading your track…' : 'Choose an audio file'}<input type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/aac" disabled={!!busy} onChange={event => { void customSoundtrack(event.target.files?.[0]); event.target.value = ''; }} /></label><small>MP3, WAV, M4A, OGG or AAC.</small></div>}
              <audio ref={soundtrackPreviewRef} className="pb-sr-only" preload="none" onEnded={() => setPreviewingTrackId('')} onError={() => { if (previewingTrackId) { setError('This music preview could not load. Check your connection and try again.'); setPreviewingTrackId(''); } }} />
            </section><div className="pb-create-actions"><button type="button" className="pb-create-back" onClick={() => setStage('photos')}><ArrowLeft size={17} />Back to photos</button><button type="button" onClick={() => void saveBoard()} disabled={!!busy || !boardReady}>{busy === 'board' ? <LoaderCircle className="pb-spin" size={17} /> : null}Save design and set access<ArrowRight size={17} /></button></div></>}

          {stage === 'access' && <><div className="pb-create-title"><span className="pb-create-eyebrow">04 / CLIENT ACCESS</span><h1>Set up the private link.</h1><p>Choose how your client opens and downloads the finished photos.</p></div><section className="pb-access-card"><label className="pb-create-field">Six-digit PIN <span className="pb-field-help">Optional</span><input inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={event => { const value = event.target.value.replace(/\D/g, '').slice(0, 6); setPin(value); if (value) setRemovePin(false); }} placeholder={draft?.hasPin ? 'PIN already set · enter a new one to change' : 'Leave blank for no PIN'} /></label>{draft?.hasPin && <Toggle checked={removePin} onChange={value => { setRemovePin(value); if (value) setPin(''); }}>Remove the current PIN</Toggle>}<label className="pb-create-field">Link expiry <span className="pb-field-help">Optional</span><input type="datetime-local" value={access.expiresAt} onChange={event => setAccess(current => ({ ...current, expiresAt: event.target.value }))} /></label><div className="pb-access-toggles"><Toggle checked={access.allowIndividualDownloads} onChange={value => setAccess(current => ({ ...current, allowIndividualDownloads: value }))}>Allow individual photo downloads</Toggle><Toggle checked={access.allowDownloadAll} onChange={value => setAccess(current => ({ ...current, allowDownloadAll: value }))}>Allow the complete gallery download</Toggle></div><div className="pb-create-note"><LockKeyhole size={17} /><span>PIN and expiry rules also apply to shared photo and moment links. Original files are never changed by the board or Status card.</span></div></section><div className="pb-create-actions"><button type="button" className="pb-create-back" onClick={() => setStage('design')}><ArrowLeft size={17} />Back to the board</button><button type="button" onClick={() => void approve()} disabled={!!busy}>{busy === 'approve' ? <LoaderCircle className="pb-spin" size={17} /> : <Check size={17} />}Approve preview<ArrowRight size={17} /></button></div></>}

          {stage === 'publish' && <><div className="pb-create-title"><span className="pb-create-eyebrow">05 / READY TO PUBLISH</span><h1>Send the gallery when you are ready.</h1><p>Review the client view on the right. Publishing makes the private link available to your client.</p></div><div className="pb-publish-summary"><div><span>DELIVERY</span><strong>{title || `${clientName}'s photographs`}</strong></div><div><span>PHOTOS</span><strong>{assets.length} finished photos</strong></div><div><span>BOARD</span><strong>{layouts.find(item => item.id === selectedLayoutId)?.title || 'Standard board'}</strong></div><div><span>LINK</span><strong>{access.expiresAt ? `Expires ${new Date(access.expiresAt).toLocaleString()}` : 'Does not expire'}</strong></div></div><div className="pb-create-actions"><button type="button" className="pb-create-back" onClick={() => setStage('access')}><ArrowLeft size={17} />Back to access</button><button type="button" onClick={() => void publish()} disabled={!!busy || billingLoading || quotaReached}>{busy === 'publish' ? <LoaderCircle className="pb-spin" size={17} /> : <Check size={17} />}Publish GridBoard</button></div></>}


        </div>
        {['design', 'access', 'publish'].includes(stage) && <aside className="pb-create-preview"><div className="pb-preview-label"><span>CLIENT VIEW</span><button type="button" onClick={openPreview}><Eye size={14} /> Open larger preview</button></div><ClientPreviewPhoneFrame delivery={previewBoard} access={access} accessPin="" /></aside>}
        </div>}
         {stage === 'published' && <div className="pb-published-card"><div className="pb-published-mark"><BadgeCheck size={27} /></div><span className="pb-create-eyebrow">DELIVERY PUBLISHED</span><h1>Your GridBoard is ready.</h1><p>Send this private link to {clientName || 'your client'} when you are ready.</p><label>Private gallery link<input readOnly value={published?.url || `${window.location.origin}/d/${published?.publicId || draft?.publicId}`} /></label><div className="pb-published-actions"><button type="button" onClick={() => void copyLink()}><Copy size={16} />Copy private link</button><a href={published?.url || `/d/${published?.publicId || draft?.publicId}`} target="_blank" rel="noreferrer"><Eye size={16} />Open client view</a><Link to="/dashboard">Back to dashboard<ArrowRight size={16} /></Link></div><div className="pb-create-note"><MessageCircle size={17} /><span>For WhatsApp, paste the private link into your chat with the client. They will see this board after opening it.</span></div></div>}
      </motion.section>
    </AnimatePresence>
  </>;

  return <main className="pb-create-shell"><div className="pb-create-container">{content}</div>{showDesktopPreview && <div ref={previewDialog} className="pb-full-preview" tabIndex={-1} role="dialog" aria-modal="true" aria-label="GridBoard client preview"><div className="pb-full-preview-bar"><span>GRIDBOARD CLIENT VIEW</span><button type="button" autoFocus onClick={() => setShowDesktopPreview(false)}><X size={18} />Close preview</button></div><div className="pb-full-preview-scroll"><ClientPreviewPhoneFrame delivery={previewBoard} access={access} accessPin="" /></div></div>}</main>;
}
