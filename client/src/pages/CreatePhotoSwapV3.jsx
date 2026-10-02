import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BadgeCheck, Check, CircleHelp, Clock3, Copy, Download, Eye, Image, Layers3, LoaderCircle, LockKeyhole, MessageCircle, Music2, Pause, Play, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../config/env.js';
import api, { apiMessage } from '../services/api.js';
import { uploadDeliveryPhotosV3 } from '../utils/deliveryUploadV3.js';
import { uploadDeliverySoundtrack } from '../utils/deliveryUpload.js';
import { creationPreviewBranding, mergeDeliveryDraft } from '../utils/deliveryDraft.js';
import { useDialogFocus } from '../components/useDialogFocus.js';
import { localDeliveryExpiry } from '../utils/deliveryAccess.js';
import { recoverPublishedDelivery } from '../utils/deliveryPublishV3.js';
import { ClientPreviewPhoneFrame } from '../components/delivery/PhonePresentation.jsx';
import './CreatePhotoSwapV3.css';

const FONTS = ['Playfair Display', 'Outfit', 'Plus Jakarta Sans', 'Cormorant Garamond', 'DM Sans', 'Libre Baskerville', 'Manrope'];
const DEFAULT_ACCESS = { allowIndividualDownloads: true, allowDownloadAll: true, allowLikes: false, expiresAt: '' };
const STEPS = [{ id: 'details', label: 'Details' }, { id: 'photos', label: 'Photos' }, { id: 'style', label: 'Style' }, { id: 'access', label: 'Access' }, { id: 'publish', label: 'Publish' }];
function mediaUrl(value) { return typeof value === 'string' && value.startsWith('/api/') ? `${API_BASE_URL.replace(/\/$/, '')}${value.slice(4)}` : value; }

function errorText(error) {
  if (error?.response?.status === 401) return 'Your session expired. Sign in again to continue.';
  if (error?.response?.status === 403 && error?.response?.data?.code === 'MONTHLY_DELIVERY_LIMIT_REACHED') return error.response.data.message;
  return apiMessage(error, error?.message || 'This step could not finish. Check your connection and try again.');
}
function quotaMessage(data) { return `You have published all ${data?.limits?.deliveriesPerMonth || 3} Free deliveries this month. Start another next month, or move to Pro.`; }
function reachedQuota(data) { return data?.plan === 'free' && data?.usage?.deliveriesRemaining === 0; }
function initialStage(delivery) {
  if (delivery?.status === 'published') return 'published';
  const step = delivery?.v3?.step;
  if (step === 'access') return delivery?.reviewApprovedAt ? 'publish' : 'access';
  if (step === 'photoswap' || delivery?.photoswap?.backgroundMode) return 'style';
  return delivery?._id ? 'photos' : 'details';
}

function Toggle({ checked, onChange, children }) {
  return <label className="pb-toggle"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span aria-hidden="true" /><span>{children}</span></label>;
}

export default function CreatePhotoSwapV3({ user, initialDelivery }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState(initialDelivery || null);
  const [stage, setStage] = useState(() => initialStage(initialDelivery));
  const [clientName, setClientName] = useState(initialDelivery?.clientName || '');
  const [title, setTitle] = useState(initialDelivery?.title || '');
  const [entitlements, setEntitlements] = useState(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [failedFiles, setFailedFiles] = useState([]);
  const [backgroundMode, setBackgroundMode] = useState(initialDelivery?.photoswap?.backgroundMode || 'auto');
  const [typography, setTypography] = useState(initialDelivery?.photoswap?.typography || { display: 'Cormorant Garamond', body: 'Outfit' });
  const [soundtracks, setSoundtracks] = useState(null);
  const [previewingTrackId, setPreviewingTrackId] = useState('');
  const [musicCategory, setMusicCategory] = useState('all');
  const [musicSearch, setMusicSearch] = useState('');
  const [musicTab, setMusicTab] = useState('library');
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
  const activeStep = ['published', 'publish'].includes(stage) ? 'publish' : stage;
  const currentIndex = STEPS.findIndex(item => item.id === activeStep);
  const previewDelivery = useMemo(() => ({
    ...(draft || {}), kind: 'photoswap', title: title || `${clientName || 'Client'}'s photos`, clientName, assets,
    branding: previewBranding,
    photoswap: { backgroundMode, typography }
  }), [draft, title, clientName, assets, backgroundMode, typography, previewBranding.type, previewBranding.name, previewBranding.logoUrl]);

  async function refresh() {
    if (!draft?._id) return null;
    const { data } = await api.get('/v1/deliveries/' + draft._id);
    const next = data.data; setDraft(next);
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
    if (stage !== 'style' || !draft?._id || soundtracks !== null) return undefined;
    let active = true;
    api.get('/v1/deliveries/soundtracks').then(({ data }) => { if (active) setSoundtracks(Array.isArray(data.data) ? data.data : []); }).catch(failure => { if (active) { setError(errorText(failure)); setSoundtracks([]); } });
    return () => { active = false; };
  }, [stage, draft?._id, soundtracks]);

  useEffect(() => () => soundtrackPreviewRef.current?.pause(), []);
  useEffect(() => {
    if (stage === 'style') return;
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
      toast.success('Your track is selected.');
    });
  }

  async function continueDetails(event) {
    event?.preventDefault();
    if (!draft && quotaReached) { setError(quotaMessage(entitlements)); return; }
    if (clientName.trim().length < 2) { setError('Enter the client name before continuing.'); return; }
    if (title.trim().length < 2) { setError('Give this Photo Swap a title before continuing.'); return; }
    await action('details', async () => {
      const body = { kind: 'photoswap', clientName: clientName.trim(), title: title.trim(), shootType: '', purpose: '', originalPurpose: '', clarificationAnswers: [] };
      if (draft?._id) await api.patch(`/v1/deliveries/${draft._id}/v3/details`, body);
      else {
        const { data } = await api.post('/v1/deliveries/v3', body); setDraft(data.data); navigate('/create?draft=' + data.data._id, { replace: true });
      }
      setStage('photos');
    });
  }
  async function uploadFiles(list) {
    const files = Array.from(list || []); if (!files.length) return;
    const invalid = files.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 50 * 1024 * 1024);
    if (invalid) { setError('Use JPEG, PNG, or WebP photographs no larger than 50 MB each.'); return; }
    if (assets.length + files.length > maxPhotos) { setError(`${entitlements?.planName || 'Your plan'} allows up to ${maxPhotos} photos in one delivery.`); return; }
    await action('upload', async () => {
      setUploadPercent(0); setFailedFiles([]);
      const result = await uploadDeliveryPhotosV3(draft._id, files, percent => setUploadPercent(percent));
      setFailedFiles(result.errors.map(item => item.file)); await refresh();
      if (result.errors.length) setError(`${result.errors.length} photo${result.errors.length === 1 ? '' : 's'} did not upload. Retry those files.`);
    });
  }
  async function deletePhoto(assetId) {
    await action('delete', async () => { await api.delete(`/v1/deliveries/${draft._id}/assets/${assetId}`); await refresh(); });
  }

  async function saveStyle() {
    if (!assets.length) { setError('Add at least one finished photograph first.'); return; }
    await action('style', async () => {
      const body = { backgroundMode, typography };
      const { data } = await api.patch(`/v1/deliveries/${draft._id}/v3/photoswap`, body);
      setDraft(current => mergeDeliveryDraft(current, data.data)); setStage('access');
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
    <div className="pb-create-top"><Link to="/dashboard" aria-label="Back to dashboard">Veylo <span>·</span> Create delivery</Link><div className="pb-create-top-actions"><span>PHOTO SWAP</span>{['style', 'access', 'publish'].includes(stage) && <button type="button" onClick={openPreview}><Eye size={14} /> View client preview</button>}</div></div>
    <nav className="pb-create-steps" aria-label="Creation progress">{steps.map((item, index) => <div key={item.id} className={(activeStep === item.id ? 'is-active ' : '') + (item.done ? 'is-done' : '')}><span>{item.done ? <Check size={14} /> : item.number}</span><strong>{item.label}</strong>{index < steps.length - 1 && <i />}</div>)}</nav>
    {quotaReached && !draft && <div className="pb-create-quota"><Clock3 size={17} />{quotaMessage(entitlements)} <Link to="/billing">View Pro</Link></div>}
    <AnimatePresence initial={false} mode="wait">
      <motion.section key={stage} className="pb-create-stage" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -8 }} transition={{ duration: .22 }}>
        {!!error && <div className="pb-create-error" role="alert"><CircleHelp size={18} /><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}

        {stage === 'details' && <div className="pb-create-form-card"><span className="pb-create-eyebrow">01 / DELIVERY DETAILS</span><h1>Start your Photo Swap.</h1><p>Give it a client name and a title. The client swipes through one photo at a time.</p><form onSubmit={continueDetails}><label>Client name<input value={clientName} onChange={event => setClientName(event.target.value)} autoComplete="name" maxLength={100} placeholder="e.g. Lora Ade" /></label><label>Title<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="e.g. Lora's 25th birthday" /></label><div className="pb-create-note"><Layers3 size={18} /><span>Photo Swap shows one photo at a time. The client swipes through the set like a stack of prints. No AI direction — you control the order.</span></div><div className="pb-create-actions"><Link to="/create" className="pb-create-back"><ArrowLeft size={17} /> Choose a delivery type</Link><button type="submit" disabled={busy === 'details' || billingLoading || !draft && quotaReached}>{busy === 'details' ? <LoaderCircle className="pb-spin" size={17} /> : null}Continue to photos<ArrowRight size={17} /></button></div></form></div>}

        {stage === 'photos' && <div className="pb-create-content"><div className="pb-create-title"><span className="pb-create-eyebrow">02 / FINISHED PHOTOS</span><h1>Add the photographs.</h1><p>Upload the finished set. The client sees them in this order — drag to rearrange later if needed.</p></div><div className="pb-upload-row"><div><strong>{assets.length} / {maxPhotos}</strong><span>{entitlements?.planName || (maxPhotos > 100 ? 'Pro' : 'Free')} photo limit · JPEG, PNG, or WebP · Up to 50 MB each</span></div><label className="pb-upload-button"><Upload size={18} />Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!!busy} onChange={event => { void uploadFiles(event.target.files); event.target.value = ''; }} /></label></div>{busy === 'upload' && <div className="pb-upload-progress" role="status"><span style={{ width: `${uploadPercent}%` }} /><strong>Uploading photos · {uploadPercent}%</strong></div>}{failedFiles.length > 0 && <div className="pb-upload-retry"><p>{failedFiles.length} photo{failedFiles.length > 1 ? 's' : ''} still need uploading.</p><button type="button" onClick={() => void uploadFiles(failedFiles)} disabled={!!busy}><RefreshCw size={15} />Retry failed photos</button></div>}<div className="pb-upload-grid">{assets.map((asset, index) => <article key={asset.assetId}><img src={asset.thumbnailUrl || asset.url} alt={asset.originalFilename || `Uploaded photo ${index + 1}`} loading={index < 12 ? 'eager' : 'lazy'} /><span>{String(index + 1).padStart(2, '0')}</span><button type="button" onClick={() => void deletePhoto(asset.assetId)} disabled={!!busy} aria-label={`Remove photo ${index + 1}`}><Trash2 size={15} /></button></article>)}{!assets.length && <div className="pb-upload-empty"><Image size={28} /><strong>Start with the finished photos.</strong><span>Upload the final set your client will swipe through.</span></div>}</div><div className="pb-create-actions"><button type="button" className="pb-create-back" onClick={() => setStage('details')}><ArrowLeft size={17} />Back to details</button><button type="button" onClick={() => { if (!assets.length) { setError('Add at least one finished photograph first.'); return; } setStage('style'); }} disabled={!assets.length || !!busy}>Choose a style<ArrowRight size={17} /></button></div></div>}

        {['style', 'access', 'publish'].includes(stage) && <div className="pb-create-workspace"><div className="pb-create-editor">
          {stage === 'style' && <><div className="pb-create-title"><span className="pb-create-eyebrow">03 / STYLE</span><h1>Set the look.</h1><p>Choose how the background behaves and pick fonts for the end screen.</p></div><section className="pb-design-section"><div className="pb-section-heading"><div><span>BACKGROUND</span><p>The background sits behind each photo card.</p></div></div><div className="pb-layout-options">{[{ id: 'auto', title: 'Photo colour', desc: 'A soft glow drawn from the current photo\'s dominant colour.' }, { id: 'dark', title: 'Solid dark', desc: 'A consistent dark background behind every card.' }].map(option => <button type="button" key={option.id} className={backgroundMode === option.id ? 'is-selected' : ''} onClick={() => setBackgroundMode(option.id)} aria-pressed={backgroundMode === option.id}><strong>{option.title}</strong><small>{option.desc}</small>{backgroundMode === option.id && <Check size={17} />}</button>)}</div></section><section className="pb-design-section"><div className="pb-section-heading"><div><span>TYPOGRAPHY</span><p>These fonts appear on the end screen and any branding.</p></div></div><div className="pb-font-row"><label>Display font<select value={typography.display} onChange={event => setTypography(current => ({ ...current, display: event.target.value }))}>{FONTS.map(font => <option key={font}>{font}</option>)}</select></label><label>Body font<select value={typography.body} onChange={event => setTypography(current => ({ ...current, body: event.target.value }))}>{FONTS.map(font => <option key={font}>{font}</option>)}</select></label></div></section><section className="pb-design-section pb-soundtrack-editor">
              <div className="pb-section-heading"><div><span>SOUNDTRACK · OPTIONAL</span><p>Music plays in the background while the client swipes through the photos.</p></div>{draft?.soundtrack && <button type="button" onClick={() => void clearSoundtrack()} disabled={busy === 'soundtrack'}>Remove music</button>}</div>
              {draft?.soundtrack && <div className="pb-soundtrack-selected"><Music2 size={17} /><span><small>SELECTED SOUNDTRACK</small><strong>{draft.soundtrack.title}</strong></span><Check size={16} /></div>}
              <div className="pb-music-tabs" role="tablist" aria-label="Music source"><button type="button" role="tab" aria-selected={musicTab === 'library'} className={musicTab === 'library' ? 'is-active' : ''} onClick={() => setMusicTab('library')}><Music2 size={16} />Music library</button><button type="button" role="tab" aria-selected={musicTab === 'own'} className={musicTab === 'own' ? 'is-active' : ''} onClick={() => setMusicTab('own')}><Upload size={16} />Upload your own</button></div>
              {musicTab === 'library' ? <>
                <label className="pb-music-search">Find a track<input value={musicSearch} onChange={event => setMusicSearch(event.target.value)} placeholder="Search title, mood, genre or artist" /></label>
                <div className="pb-music-categories" role="group" aria-label="Filter music by style">{musicCategories.map(category => <button type="button" key={category} aria-pressed={musicCategory === category} className={musicCategory === category ? 'is-active' : ''} onClick={() => setMusicCategory(category)}>{category === 'all' ? 'All music' : category.split(/[\s-]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</button>)}</div>
                <div className="pb-soundtrack-list" aria-label="Soundtrack library">{soundtracks === null ? <p className="pb-soundtrack-empty">Loading soundtrack choices…</p> : filteredSoundtracks.length ? filteredSoundtracks.map(track => { const selected = draft?.soundtrack?.catalogId === track.id; return <article key={track.id} className={selected ? 'is-selected' : ''}><div><strong>{track.title}</strong><small>{[track.creator, track.mood, track.genre, track.durationSec ? Math.round(track.durationSec / 60) + ' min' : ''].filter(Boolean).join(' · ')}</small></div><div><button type="button" className="pb-track-preview" onClick={() => void previewSoundtrack(track)} aria-label={(previewingTrackId === track.id ? 'Stop ' : 'Preview ') + track.title}><span>{previewingTrackId === track.id ? <Pause size={14} /> : <Play size={14} />}</span>{previewingTrackId === track.id ? 'Stop' : 'Preview'}</button><button type="button" className="pb-track-select" onClick={() => void chooseSoundtrack(track.id)} disabled={selected || busy === 'soundtrack'}>{selected ? <><Check size={14} />Selected</> : 'Use this track'}</button></div></article>; }) : <p className="pb-soundtrack-empty">{soundtracks.length ? 'No tracks match this search. Try another style.' : 'Music choices are unavailable. You can still upload your own track.'}</p>}</div>
              </> : <div className="pb-own-music"><Upload size={23} /><h3>Use a track you own.</h3><p>Choose audio you have permission to use in this client delivery.</p><label><Upload size={16} />{busy === 'soundtrack' ? 'Uploading your track…' : 'Choose an audio file'}<input type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/aac" disabled={!!busy} onChange={event => { void customSoundtrack(event.target.files?.[0]); event.target.value = ''; }} /></label><small>MP3, WAV, M4A, OGG or AAC.</small></div>}
              <audio ref={soundtrackPreviewRef} className="pb-sr-only" preload="none" onEnded={() => setPreviewingTrackId('')} onError={() => { if (previewingTrackId) { setError('This music preview could not load. Check your connection and try again.'); setPreviewingTrackId(''); } }} />
            </section><div className="pb-create-actions"><button type="button" className="pb-create-back" onClick={() => setStage('photos')}><ArrowLeft size={17} />Back to photos</button><button type="button" onClick={() => void saveStyle()} disabled={!!busy || !assets.length}>{busy === 'style' ? <LoaderCircle className="pb-spin" size={17} /> : null}Save style and set access<ArrowRight size={17} /></button></div></>}

          {stage === 'access' && <><div className="pb-create-title"><span className="pb-create-eyebrow">04 / CLIENT ACCESS</span><h1>Set up the private link.</h1><p>Choose how your client opens and downloads the finished photos.</p></div><section className="pb-access-card"><label className="pb-create-field">Six-digit PIN <span className="pb-field-help">Optional</span><input inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={event => { const value = event.target.value.replace(/\D/g, '').slice(0, 6); setPin(value); if (value) setRemovePin(false); }} placeholder={draft?.hasPin ? 'PIN already set · enter a new one to change' : 'Leave blank for no PIN'} /></label>{draft?.hasPin && <Toggle checked={removePin} onChange={value => { setRemovePin(value); if (value) setPin(''); }}>Remove the current PIN</Toggle>}<label className="pb-create-field">Link expiry <span className="pb-field-help">Optional</span><input type="datetime-local" value={access.expiresAt} onChange={event => setAccess(current => ({ ...current, expiresAt: event.target.value }))} /></label><div className="pb-access-toggles"><Toggle checked={access.allowIndividualDownloads} onChange={value => setAccess(current => ({ ...current, allowIndividualDownloads: value }))}>Allow individual photo downloads</Toggle><Toggle checked={access.allowDownloadAll} onChange={value => setAccess(current => ({ ...current, allowDownloadAll: value }))}>Allow the complete gallery download</Toggle></div><div className="pb-create-note"><LockKeyhole size={17} /><span>PIN and expiry rules also apply to shared photo links. Original files are never changed.</span></div></section><div className="pb-create-actions"><button type="button" className="pb-create-back" onClick={() => setStage('style')}><ArrowLeft size={17} />Back to style</button><button type="button" onClick={() => void approve()} disabled={!!busy}>{busy === 'approve' ? <LoaderCircle className="pb-spin" size={17} /> : <Check size={17} />}Approve preview<ArrowRight size={17} /></button></div></>}

          {stage === 'publish' && <><div className="pb-create-title"><span className="pb-create-eyebrow">05 / READY TO PUBLISH</span><h1>Send the Photo Swap when you are ready.</h1><p>Review the client view on the right. Publishing makes the private link available to your client.</p></div><div className="pb-publish-summary"><div><span>DELIVERY</span><strong>{title || `${clientName}'s photos`}</strong></div><div><span>PHOTOS</span><strong>{assets.length} finished photos</strong></div><div><span>BACKGROUND</span><strong>{backgroundMode === 'auto' ? 'Photo colour glow' : 'Solid dark'}</strong></div><div><span>LINK</span><strong>{access.expiresAt ? `Expires ${new Date(access.expiresAt).toLocaleString()}` : 'Does not expire'}</strong></div></div><div className="pb-create-actions"><button type="button" className="pb-create-back" onClick={() => setStage('access')}><ArrowLeft size={17} />Back to access</button><button type="button" onClick={() => void publish()} disabled={!!busy || billingLoading || quotaReached}>{busy === 'publish' ? <LoaderCircle className="pb-spin" size={17} /> : <Check size={17} />}Publish Photo Swap</button></div></>}


        </div>
        {['style', 'access', 'publish'].includes(stage) && <aside className="pb-create-preview"><div className="pb-preview-label"><span>CLIENT VIEW</span><button type="button" onClick={openPreview}><Eye size={14} /> Open larger preview</button></div><ClientPreviewPhoneFrame delivery={previewDelivery} access={access} accessPin="" /></aside>}
        </div>}
         {stage === 'published' && <div className="pb-published-card"><div className="pb-published-mark"><BadgeCheck size={27} /></div><span className="pb-create-eyebrow">DELIVERY PUBLISHED</span><h1>Your Photo Swap is ready.</h1><p>Send this private link to {clientName || 'your client'} when you are ready.</p><label>Private link<input readOnly value={published?.url || `${window.location.origin}/d/${published?.publicId || draft?.publicId}`} /></label><div className="pb-published-actions"><button type="button" onClick={() => void copyLink()}><Copy size={16} />Copy private link</button><a href={published?.url || `/d/${published?.publicId || draft?.publicId}`} target="_blank" rel="noreferrer"><Eye size={16} />Open client view</a><Link to="/dashboard">Back to dashboard<ArrowRight size={16} /></Link></div><div className="pb-create-note"><MessageCircle size={17} /><span>For WhatsApp, paste the private link into your chat with the client. They will swipe through the set after opening it.</span></div></div>}
      </motion.section>
    </AnimatePresence>
  </>;

  return <main className="pb-create-shell"><div className="pb-create-container">{content}</div>{showDesktopPreview && <div ref={previewDialog} className="pb-full-preview" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Photo Swap client preview"><div className="pb-full-preview-bar"><span>PHOTO SWAP CLIENT VIEW</span><button type="button" autoFocus onClick={() => setShowDesktopPreview(false)}><X size={18} />Close preview</button></div><div className="pb-full-preview-scroll"><ClientPreviewPhoneFrame delivery={previewDelivery} access={access} accessPin="" /></div></div>}</main>;
}
