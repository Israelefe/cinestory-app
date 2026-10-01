import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus, AlertCircle, ArrowLeft, ArrowRight, AudioLines, Check, ChevronLeft, ChevronRight, Clock3, ExternalLink, Image, LoaderCircle, Mail, Mic2, Music2, Pause, Play, QrCode, RefreshCw, RotateCcw, Search, Share2, Trash2, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { API_BASE_URL } from '../config/env.js';
import { uploadDeliverySoundtrack } from '../utils/deliveryUpload.js';
import { creationPreviewBranding, mergeDeliveryDraft } from '../utils/deliveryDraft.js';
import { localDeliveryExpiry } from '../utils/deliveryAccess.js';
import { recoverPublishedDelivery } from '../utils/deliveryPublishV3.js';
import { uploadDeliveryPhotosV3 } from '../utils/deliveryUploadV3.js';
import { SHOOT_TYPES } from '../constants/shootTypes.js';
import { NARRATION_VOICES, DEFAULT_NARRATION_VOICE_ID } from '../constants/narrationVoices.js';
import { DELIVERY_FORMATS } from '../constants/deliveryFormats.js';
import DeliveryFormatVisual from '../components/DeliveryFormatVisual.jsx';
import NarrationVoicePicker from '../components/delivery/NarrationVoicePicker.jsx';
import ShowcasePhotoPicker from '../components/delivery/ShowcasePhotoPicker.jsx';
import { ClientPreviewPhoneFrame } from '../components/delivery/PhonePresentation.jsx';
import './CreateDeliveryV3.css';

const BOUNDS = { 'photo-story': [5, 10], editorial: [6, 14], 'photo-reveal': [5, 12], canvas: [8, 18], chapters: [8, 20], album: [6, 16], 'event-coverage': [10, 24], campaign: [6, 16] };
const MUSIC = new Set(['photo-story', 'photo-reveal', 'album']);
const FONTS = ['Playfair Display', 'Outfit', 'Plus Jakarta Sans', 'Cormorant Garamond', 'DM Sans', 'Libre Baskerville', 'Manrope'];
const STEPS = [{ id: 'details', label: 'Shoot' }, { id: 'format', label: 'Format' }, { id: 'upload', label: 'Photos' }, { id: 'preparing', label: 'Preparing' }, { id: 'showcase', label: 'Showcase' }, { id: 'narration', label: 'Narration' }, { id: 'music', label: 'Music' }, { id: 'design', label: 'Design' }, { id: 'access', label: 'Publish' }];
const DEFAULT_ACCESS = { allowIndividualDownloads: true, allowDownloadAll: true, allowLikes: true, expiresAt: '', usageTerms: '' };
const defaultPalette = { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' };
function contrastRatio(first, second) {
  const luminance = value => {
    const channels = String(value || '').slice(1).match(/../g)?.map(part => parseInt(part, 16) / 255);
    if (!channels || channels.length !== 3 || channels.some(channel => !Number.isFinite(channel))) return 0;
    const [red, green, blue] = channels.map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return red * .2126 + green * .7152 + blue * .0722;
  };
  const left = luminance(first); const right = luminance(second);
  return (Math.max(left, right) + .05) / (Math.min(left, right) + .05);
}
function themeReadability(palette) {
  const background = contrastRatio(palette.background, palette.text);
  const surface = contrastRatio(palette.surface, palette.text);
  const weak = [background < 4.5 ? 'background' : null, surface < 4.5 ? 'panels' : null].filter(Boolean);
  return { background, surface, valid: weak.length === 0, message: weak.length ? `Text is hard to read on the ${weak.join(' and ')}. Change the text colour or use Fix text contrast.` : '' };
}
function readablePalette(palette) {
  const choices = ['#fffaf6', '#ffffff', '#101010', '#000000'];
  const text = choices.find(color => contrastRatio(color, palette.background) >= 4.5 && contrastRatio(color, palette.surface) >= 4.5);
  if (text) return { ...palette, text };
  const best = [...choices].sort((a, b) => contrastRatio(b, palette.background) - contrastRatio(a, palette.background))[0];
  return { ...palette, surface: palette.background, text: best };
}
function message(error) {
  const status = error?.response?.status;
  const serverCode = error?.response?.data?.code;
  const serverText = error?.response?.data?.message || '';
  const contrastFailure = serverCode === 'V3_THEME_CONTRAST' || /text needs more contrast/i.test(serverText);
  const fallbacks = {
    400: 'Check the fields on this step and try again.',
    401: 'Your session expired. Sign in again to continue this draft.',
    403: 'This account cannot complete the step. Check your plan in Billing.',
    404: 'This draft could not be found. Return to your dashboard and reopen it.',
    409: 'This draft changed while you were working. Reload it and review this step again.',
    429: 'Too many requests right now. Wait a moment, then try again.'
  };
  const fallback = status ? fallbacks[status] || 'This step did not finish. Please try again.' : error?.isAxiosError ? 'The connection failed. Check your internet and try again.' : error?.message || 'This step did not finish. Please try again.';
  const text = contrastFailure ? 'Text is hard to read on the background or panels. Change the text colour or use Fix text contrast.' : status === 404 ? fallback : apiMessage(error, fallback);
  return { text, code: status >= 500 || status === 429 ? serverCode || `V3_REQUEST_${status}` : !status && error?.isAxiosError ? 'V3_CONNECTION' : '', fix: contrastFailure ? 'contrast' : '' };
}
function withMediaUrl(value) { return String(value || '').startsWith('/api/') ? API_BASE_URL.replace(/\/$/, '') + value.slice(4) : value; }
function nextAfterShowcase(format) { return format === 'photo-story' ? 'narration' : MUSIC.has(format) ? 'music' : 'design'; }
function freeMonthlyLimitReached(entitlements) { return entitlements?.plan === 'free' && entitlements?.usage?.deliveriesRemaining === 0; }
function freeMonthlyLimitMessage(entitlements) { return `You've published all ${entitlements?.limits?.deliveriesPerMonth || 3} Free deliveries this month. You can create another next month, or move to Pro.`; }
function formatTrackTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function categoryLabel(value) {
  return String(value || 'Soundtrack').split(/[\s-]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function StepButton({ children, onClick, disabled, secondary = false, type = 'button' }) {
  return <button type={type} className={'v3-button' + (secondary ? ' is-secondary' : '')} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Head({ eyebrow, title, children }) {
  return <header className="v3-head"><span>{eyebrow}</span><h1>{title}</h1>{children && <p>{children}</p>}</header>;
}

function FormatCard({ item, selected, onSelect }) {
  return <article className={'v3-format-card' + (selected ? ' is-selected' : '')}>
    <button type="button" className="v3-format-select" onClick={onSelect} aria-pressed={selected}>
      <div className="v3-format-art" aria-hidden="true" inert=""><DeliveryFormatVisual format={item} compact paused /></div>
      <span>{item.name}</span><small>{item.line}</small><b>{BOUNDS[item.value][0]}–{BOUNDS[item.value][1]} showcase photos</b>
      {selected && <Check size={19} aria-hidden="true" />}
    </button>
    <Link to={'/demo/' + (item.value === 'photo-reveal' ? 'reveal' : item.value)} target="_blank" rel="noopener noreferrer">Preview demo <ExternalLink size={14} /></Link>
  </article>;
}

export default function CreateDeliveryV3({ user, initialDelivery }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState(initialDelivery || null);
  const [entitlements, setEntitlements] = useState(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [stage, setStage] = useState(initialDelivery?.generationJob?.type === 'v3-narrate' && ['queued', 'running'].includes(initialDelivery?.generationJob?.status) ? 'narration-job' : initialDelivery?.v3?.step === 'preview' ? 'design' : initialDelivery?.v3?.step || 'details');
  const [clientName, setClientName] = useState(initialDelivery?.clientName || '');
  const [shootType, setShootType] = useState(initialDelivery?.shootType && !SHOOT_TYPES.includes(initialDelivery.shootType) ? 'Other' : initialDelivery?.shootType || '');
  const [customShoot, setCustomShoot] = useState(SHOOT_TYPES.includes(initialDelivery?.shootType) ? '' : initialDelivery?.shootType || '');
  const [purpose, setPurpose] = useState(initialDelivery?.brief || '');
  const [originalPurpose, setOriginalPurpose] = useState(initialDelivery?.v3?.originalPurpose || '');
  const [purposeFeedback, setPurposeFeedback] = useState('');
  const purposeRevision = useRef(0);
  const purposeRequest = useRef(null);
  const purposePending = useRef(false);
  useEffect(() => () => purposeRequest.current?.abort(), []);
  const [recommendation, setRecommendation] = useState(null);
  const [format, setFormat] = useState(initialDelivery?.format || '');
  const [uploads, setUploads] = useState({});
  const [failedFiles, setFailedFiles] = useState([]);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [job, setJob] = useState(initialDelivery?.generationJob || null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [photoPicker, setPhotoPicker] = useState(null);
  const [captionError, setCaptionError] = useState(null);
  const captionPending = useRef(false);
  const captionRequest = useRef(null);
  useEffect(() => () => captionRequest.current?.abort(), []);
  const [selected, setSelected] = useState(initialDelivery?.curatedAssetIds || []);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [captions, setCaptions] = useState(Object.fromEntries((initialDelivery?.creativeDirection?.frames || []).map(frame => [frame.assetId, frame.caption])));
  const [headlines, setHeadlines] = useState(Object.fromEntries((initialDelivery?.creativeDirection?.frames || []).map(frame => [frame.assetId, frame.headline || ''])));
  const [title, setTitle] = useState(initialDelivery?.creativeDirection?.title || '');
  const [openingLine, setOpeningLine] = useState(initialDelivery?.creativeDirection?.openingLine || '');
  const [closingLine, setClosingLine] = useState(initialDelivery?.creativeDirection?.closingLine || '');
  const [openingAssetId, setOpeningAssetId] = useState(initialDelivery?.v3?.openingAssetId || '');
  const [closingAssetId, setClosingAssetId] = useState(initialDelivery?.v3?.closingAssetId || '');
  const [narrationVoiceId, setNarrationVoiceId] = useState(initialDelivery?.generationJob?.input?.voiceId || initialDelivery?.v3?.narrationVoiceId || initialDelivery?.narration?.voiceId || DEFAULT_NARRATION_VOICE_ID);
  const selectedVoiceName = NARRATION_VOICES.find(voice => voice.id === narrationVoiceId)?.name || 'Hannah';
  const [instructions, setInstructions] = useState({});
  const [tracks, setTracks] = useState([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [activeTrack, setActiveTrack] = useState('');
  const [musicSearch, setMusicSearch] = useState('');
  const [musicCategory, setMusicCategory] = useState('all');
  const [musicTab, setMusicTab] = useState('curated');
  const [trackTime, setTrackTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const audioRef = useRef(null);
  const [palette, setPalette] = useState(initialDelivery?.creativeDirection?.palette || defaultPalette);
  const themeStatus = themeReadability(palette);
  const [typography, setTypography] = useState(initialDelivery?.creativeDirection?.typography || { display: 'Playfair Display', body: 'Outfit' });
  const [access, setAccess] = useState({ ...DEFAULT_ACCESS, ...initialDelivery?.access, usageTerms: initialDelivery?.formatConfig?.usageTerms || '', expiresAt: localDeliveryExpiry(initialDelivery?.access?.expiresAt) });
  const [pin, setPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [published, setPublished] = useState(initialDelivery?.status === 'published' ? { publicId: initialDelivery.publicId, url: window.location.origin + '/d/' + initialDelivery.publicId } : null);
  const [clientEmail, setClientEmail] = useState('');
  const actualShootType = shootType === 'Other' ? customShoot.trim() : shootType;
  const proFallback = user?.plan === 'pro' || user?.plan === 'studio';
  const limits = entitlements?.limits?.photosPerDelivery || (proFallback ? 500 : 100);
  const planName = entitlements?.plan === 'pro' || (!entitlements && proFallback) ? 'Pro' : 'Free';
  const quotaReached = freeMonthlyLimitReached(entitlements);
  const previewBranding = creationPreviewBranding(user, entitlements);
  const designPreviewDelivery = useMemo(() => {
    if (!draft) return null;
    const savedFrames = new Map((draft.creativeDirection?.frames || []).map(frame => [frame.assetId, frame]));
    const frames = selected.map(assetId => ({
      ...(savedFrames.get(assetId) || {}),
      assetId,
      headline: headlines[assetId] ?? savedFrames.get(assetId)?.headline ?? '',
      caption: captions[assetId] ?? savedFrames.get(assetId)?.caption ?? '',
      textAnimation: savedFrames.get(assetId)?.textAnimation || (format === 'photo-story' ? 'typewriter' : undefined)
    }));
    return {
      ...draft,
      branding: previewBranding,
      curatedAssetIds: selected,
      creativeDirection: {
        ...draft.creativeDirection,
        title,
        openingLine,
        closingLine,
        frames,
        assetOrder: selected,
        palette,
        typography
      },
      v3: { ...draft.v3, openingAssetId, closingAssetId }
    };
  }, [draft, previewBranding.type, previewBranding.name, previewBranding.logoUrl, selected, headlines, captions, title, openingLine, closingLine, format, palette, typography, openingAssetId, closingAssetId]);
  const bounds = BOUNDS[format] || [5, 10];
  const recommendedFormat = DELIVERY_FORMATS.find(item => item.value === recommendation?.format);
  const assets = draft?.assets || [];
  const assetById = useMemo(() => new Map(assets.map(asset => [asset.assetId, asset])), [assets]);
  const unselected = assets.filter(asset => !selected.includes(asset.assetId));
  const activeShowcaseIndex = Math.min(activePhotoIndex, Math.max(0, selected.length - 1));
  const activeShowcaseId = selected[activeShowcaseIndex];
  const visibleSteps = STEPS.filter(item => item.id !== 'narration' || format === 'photo-story').filter(item => item.id !== 'music' || MUSIC.has(format));
  const currentProgressId = stage === 'narration-job' ? 'narration' : stage;
  const currentIndex = visibleSteps.findIndex(item => item.id === currentProgressId);
  const statusProgress = Math.max(0, Math.round(((currentIndex + 1) / visibleSteps.length) * 100));
  const selectedFormat = DELIVERY_FORMATS.find(item => item.value === format);

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
    setHeadlines(Object.fromEntries((next.creativeDirection?.frames || []).map(frame => [frame.assetId, frame.headline || ''])));
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
    try { return await task(); } catch (failure) {
      if (label === 'publish') {
        const result = await recoverPublishedDelivery(draft?._id);
        if (result) { setPublished(result); setStage('published'); return result; }
      }
      setError(message(failure)); return null;
    } finally { setBusy(''); }
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
        if (next.generationJob?.status === 'failed') { setError(['NARRATION_CAPTION_TOO_LONG', 'NARRATION_FITTING_FAILED'].includes(next.generationJob.errorCode) ? 'Retry to prepare the opening and closing voice, or choose Skip voice to continue with text.' : next.generationJob.errorMessage || 'This step failed. Retry it.'); return; }
        if (stage === 'preparing' && next.v3?.step === 'showcase') { syncShowcase(next); setStage('showcase'); }
        if (stage === 'narration-job' && next.v3?.step === 'music' && next.v3?.narrationChoice === 'voice') setStage('music');
      } catch (failure) { if (active) setError(message(failure)); }
    };
    poll();
    const timer = window.setInterval(poll, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [draft?._id, stage]);
  useEffect(() => {
    if (stage !== 'music' || tracks.length) return;
    setMusicLoading(true);
    api.get('/v1/deliveries/soundtracks').then(({ data }) => setTracks(data.data || [])).catch(failure => setError(message(failure))).finally(() => setMusicLoading(false));
  }, [stage, tracks.length]);
  useEffect(() => {
    if (stage !== 'format' || recommendation || !actualShootType) return;
    let active = true;
    api.post('/v1/deliveries/v3/assist', { mode: 'recommend', purpose, shootType: actualShootType }).then(({ data }) => {
      if (active) { setRecommendation(data.data); setFormat(current => current || data.data.format); }
    }).catch(failure => { if (active) setError(message(failure)); });
    return () => { active = false; };
  }, [stage, recommendation, actualShootType, purpose]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); }, [stage, reduced]);
  useEffect(() => {
    if (!error || !['narration', 'narration-job'].includes(stage)) return;
    const frame = window.requestAnimationFrame(() => document.querySelector('.v3-narration-error')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }));
    return () => window.cancelAnimationFrame(frame);
  }, [error, stage, reduced]);
  useEffect(() => { setActivePhotoIndex(current => Math.min(current, Math.max(0, selected.length - 1))); }, [selected.length]);

  async function improve() {
    if (busy || purposePending.current) return;
    if (!purpose.trim() || !actualShootType) { setError('Enter the shoot type and purpose first.'); return; }
    const source = purpose.trim();
    const revision = purposeRevision.current;
    const request = new AbortController();
    purposePending.current = true;
    purposeRequest.current = request;
    setPurposeFeedback('');
    await action('improve', async () => {
      try {
        const { data } = await api.post('/v1/deliveries/v3/assist', { mode: 'improve', purpose: source, shootType: actualShootType }, { signal: request.signal });
        if (request.signal.aborted) return;
        if (revision !== purposeRevision.current) { setPurposeFeedback('You edited the text while Veylo was working. Your latest words have been kept.'); return; }
        const suggestion = data.data;
        const improved = typeof suggestion?.improved === 'string' ? suggestion.improved.trim() : '';
        if (!improved || suggestion.sourcePurpose !== source || suggestion.meaningPreserved !== true) throw new Error('Veylo could not check that suggestion against your words. Your text has been kept. Please try again.');
        if (improved === source) { setPurposeFeedback('No wording changes were suggested. Your text is unchanged.'); return; }
        setOriginalPurpose(current => current || purpose); setPurpose(improved); setPurposeFeedback('Wording improved. Your original is saved so you can restore it.');
      } catch (failure) {
        if (!request.signal.aborted) throw failure;
      } finally {
        purposePending.current = false;
        if (purposeRequest.current === request) purposeRequest.current = null;
      }
    });
  }
  async function detailsNext() {
    if (!draft && quotaReached) { setError(freeMonthlyLimitMessage(entitlements)); return; }
    if (clientName.trim().length < 2) { setError('Enter the client name before continuing.'); return; }
    if (actualShootType.length < 2) { setError(shootType === 'Other' ? 'Name the type of shoot before continuing.' : 'Choose a type of shoot before continuing.'); return; }
    if (!purpose.trim()) { setError('Write why this shoot was taken before continuing.'); return; }
    await action('details', async () => {
      const { data: rec } = await api.post('/v1/deliveries/v3/assist', { mode: 'recommend', purpose, shootType: actualShootType });
      setRecommendation(rec.data); if (!format) setFormat(rec.data.format);
      const body = { clientName: clientName.trim(), shootType: actualShootType, purpose: purpose.trim(), originalPurpose, clarificationAnswers: [] };
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
  async function chooseShowcasePhoto(id, signal) {
    if (!assetById.has(id)) throw new Error('This photo is no longer in the gallery. Choose another photo.');
    if (photoPicker.mode === 'opening') { setOpeningAssetId(id); return; }
    if (photoPicker.mode === 'closing') { setClosingAssetId(id); return; }
    if (selected.includes(id) || captionPending.current || busy) throw new Error('Choose a photo that is not already in the showcase.');
    if (photoPicker.mode === 'add' && selected.length >= bounds[1]) throw new Error('The showcase already has its maximum number of photos.');
    captionPending.current = true;
    setBusy('caption-' + id); setCaptionError(null);
    try {
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/v3/captions/' + id + '/regenerate', { instruction: instructions[id] || '', previous: { headline: (headlines[id] || '').slice(0, 70), caption: (captions[id] || '').slice(0, 180) } }, { signal });
      if (signal.aborted) return;
      setHeadlines(current => ({ ...current, [id]: data.data.headline }));
      setCaptions(current => ({ ...current, [id]: data.data.caption }));
      if (photoPicker.mode === 'replace') {
        setSelected(current => current.map((value, at) => at === photoPicker.index ? id : value));
        setActivePhotoIndex(photoPicker.index);
      } else {
        setSelected(current => [...current, id]);
        setActivePhotoIndex(selected.length);
      }
    } catch (failure) { throw new Error(message(failure).text); }
    finally { captionPending.current = false; setBusy(''); }
  }
  function moveSelected(index, offset) {
    if (index + offset < 0 || index + offset >= selected.length) return;
    setSelected(current => { const next = [...current]; const other = index + offset; if (other < 0 || other >= next.length) return current; [next[index], next[other]] = [next[other], next[index]]; return next; });
    setActivePhotoIndex(index + offset);
  }
  async function regenerate(id) {
    if (busy || captionPending.current) return;
    captionPending.current = true;
    setBusy('caption-' + id); setCaptionError(null);
    const controller = new AbortController();
    captionRequest.current = controller;
    try {
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/v3/captions/' + id + '/regenerate', { instruction: instructions[id] || '', previous: { headline: (headlines[id] || '').slice(0, 70), caption: (captions[id] || '').slice(0, 180) } }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setHeadlines(current => ({ ...current, [id]: data.data.headline }));
      setCaptions(current => ({ ...current, [id]: data.data.caption }));
    } catch (failure) { if (!controller.signal.aborted) setCaptionError({ assetId: id, text: message(failure).text }); }
    finally { captionPending.current = false; setBusy(''); }
  }
  async function saveShowcase() {
    if (selected.length < bounds[0] || selected.length > bounds[1]) { setError(`Choose between ${bounds[0]} and ${bounds[1]} showcase photos before continuing.`); return; }
    if (title.trim().length < 2) { setError('Give this delivery a title with at least two characters.'); return; }
    if (openingLine.trim().length < 5) { setError('Write an opening message with at least five characters.'); return; }
    if (closingLine.trim().length < 5) { setError('Write a closing message with at least five characters.'); return; }
    if (!assetById.has(openingAssetId) || !assetById.has(closingAssetId)) { setError('Choose a photo for both the opening and the closing.'); return; }
    const missingHeadline = selected.findIndex(id => (headlines[id]?.trim().length || 0) < 2);
    if (missingHeadline >= 0) {
      setActivePhotoIndex(missingHeadline);
      setError(`Add a headline for showcase photo ${missingHeadline + 1}, or regenerate its headline and caption.`);
      window.requestAnimationFrame(() => document.querySelector('.v3-showcase-headline')?.focus());
      return;
    }
    const missingCaption = selected.findIndex(id => (captions[id]?.trim().length || 0) < 5);
    if (missingCaption >= 0) {
      setActivePhotoIndex(missingCaption);
      setError(`Write a caption for showcase photo ${missingCaption + 1}, or regenerate its words.`);
      window.requestAnimationFrame(() => document.querySelector('.v3-showcase-item textarea')?.focus());
      return;
    }
    await action('showcase', async () => {
      const body = { assetIds: selected, frames: selected.map(assetId => ({ assetId, headline: headlines[assetId].trim(), caption: captions[assetId].trim() })), title: title.trim(), openingLine: openingLine.trim(), closingLine: closingLine.trim(), openingAssetId, closingAssetId };
      await api.patch('/v1/deliveries/' + draft._id + '/v3/showcase', body);
      const next = await refresh();
      setStage(nextAfterShowcase(next.format));
    });
  }
  async function generateNarration() {
    await action('narrate', async () => {
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/v3/narrate', { voiceId: narrationVoiceId });
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
  async function repickPalette() {
    await action('palette', async () => {
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/v3/theme/repick');
      const next = data.data;
      setDraft(current => mergeDeliveryDraft(current, next));
      setPalette(next.creativeDirection?.palette || defaultPalette);
    });
  }
  async function approveDesign() {
    if (!themeStatus.valid) { setError({ text: themeStatus.message, fix: 'contrast' }); return; }
    await action('approve', async () => {
      await api.patch('/v1/deliveries/' + draft._id + '/v3/theme', { palette, typography });
      await api.post('/v1/deliveries/' + draft._id + '/v3/approve');
      const next = await refresh(); syncShowcase(next); setStage('access');
    });
  }
  async function saveAccess() {
    if (pin && pin.length !== 6) { setError('A PIN needs six digits. Finish entering it, or clear the field to leave the delivery without a PIN.'); return; }
    if (access.expiresAt && new Date(access.expiresAt) <= new Date()) { setError('Choose a future expiry date, or clear the field for a link that does not expire.'); return; }
    await action('access', async () => {
      const body = { ...access, expiresAt: access.expiresAt ? new Date(access.expiresAt).toISOString() : '' };
      if (pin) body.pin = pin; else if (removePin) body.pin = '';
      const { data } = await api.patch('/v1/deliveries/' + draft._id + '/v3/access', body);
      setDraft(current => ({ ...current, ...data.data }));
      setPin(''); setRemovePin(false);
      toast.success('Access settings saved.');
    });
  }
  async function publish() {
    if (pin && pin.length !== 6) { setError('A PIN needs six digits. Finish entering it, or clear the field to publish without one.'); return; }
    if (access.expiresAt && new Date(access.expiresAt) <= new Date()) { setError('Choose a future expiry date, or clear the field for a link that does not expire.'); return; }
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
  const musicCategories = ['all', 'afrobeat', 'amapiano', ...new Set(tracks.flatMap(track => [track.category, track.genre]).filter(Boolean).map(value => String(value).trim().toLowerCase()))].filter((value, index, all) => all.indexOf(value) === index);
  const filteredTracks = tracks.filter(track => {
    const haystack = [track.title, track.creator, track.genre, track.category, track.mood, track.storyFunction, ...(track.tags || []), ...(track.bestFor || [])].join(' ').toLowerCase();
    const categoryMatch = musicCategory === 'all' || [track.category, track.genre, ...(track.tags || [])].some(value => String(value || '').toLowerCase().includes(musicCategory));
    return categoryMatch && haystack.includes(musicSearch.trim().toLowerCase());
  }).sort((a, b) => {
    const rank = track => /amapiano/i.test([track.title, track.genre, track.category, ...(track.tags || [])].join(' ')) ? 0 : /afrobeats?/i.test([track.title, track.genre, track.category, ...(track.tags || [])].join(' ')) ? 1 : 2;
    return rank(a) - rank(b);
  });
  const currentPreviewTrack = tracks.find(track => track.id === activeTrack);
  const selectedCatalogTrack = tracks.find(track => track.id === draft?.soundtrack?.catalogId);
  const featureTrack = currentPreviewTrack || selectedCatalogTrack || draft?.soundtrack || null;

  function toggleTrack(track) {
    const audio = audioRef.current;
    if (!audio) return;
    if (activeTrack === track.id) {
      audio.pause();
      setActiveTrack('');
      return;
    }
    setActiveTrack(track.id);
    setTrackTime(0);
    setTrackDuration(0);
    audio.src = withMediaUrl(track.previewUrl);
    audio.play().catch(() => { setActiveTrack(''); setError('This preview could not play. Try another track.'); });
  }
  function seekTrack(event) {
    const nextTime = Number(event.target.value);
    if (audioRef.current && Number.isFinite(nextTime)) {
      audioRef.current.currentTime = nextTime;
      setTrackTime(nextTime);
    }
  }

  return <div className={'v3-create' + (stage === 'design' ? ' is-designing' : '')}>
    <div className="v3-shell">
      {!published && <section className="v3-progress" aria-label="Creation progress">
        <div className="v3-progress-copy">
          <div><span>DELIVERY CREATION</span><strong>{visibleSteps[currentIndex]?.label || 'Shoot details'}</strong></div>
          <small>{visibleSteps[currentIndex + 1] ? `Next: ${visibleSteps[currentIndex + 1].label}` : 'Ready to publish'}</small>
        </div>
        <div className="v3-progress-meter" role="progressbar" aria-valuemin={0} aria-valuemax={visibleSteps.length} aria-valuenow={Math.max(0, currentIndex + 1)} aria-label="Delivery creation progress" aria-valuetext={`Step ${Math.max(1, currentIndex + 1)} of ${visibleSteps.length}`}><span style={{ transform: 'scaleX(' + statusProgress / 100 + ')' }} /></div>
        <ol className="v3-stepper">
          {visibleSteps.map((item, index) => <li key={item.id} aria-label={item.label} className={index === currentIndex ? 'is-current' : index < currentIndex ? 'is-complete' : ''} aria-current={index === currentIndex ? 'step' : undefined}>
            <span>{index < currentIndex ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</span><small>{item.label}</small>
          </li>)}
        </ol>
      </section>}
      {error && !['narration', 'narration-job'].includes(stage) && <div className="v3-error" role="alert"><AlertCircle size={20} aria-hidden="true" /><div><strong>{typeof error === 'string' ? error : error.text}</strong>{typeof error === 'object' && error.fix === 'contrast' && <button type="button" className="v3-error-fix" onClick={() => { setPalette(current => readablePalette(current)); setError(''); }}>Fix text contrast</button>}{typeof error === 'object' && error.code && <small>Support reference: {error.code}</small>}</div><button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {quotaReached && (stage === 'access' || stage === 'details' && !draft) && <div className="v3-quota-note" role="status"><Clock3 size={18} /><span>{freeMonthlyLimitMessage(entitlements)}</span><Link to="/billing">View Pro</Link></div>}
      <div className="v3-workspace">
      <AnimatePresence mode="wait"><motion.main key={stage} className={'v3-main' + (stage === 'design' ? ' is-designing' : '')} initial={reduced ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? {} : { opacity: 0, x: -12 }} transition={{ duration: reduced ? 0 : .3 }}>
        {stage === 'details' && <>
          <Head eyebrow="01 / THE SHOOT" title="Tell us what this delivery is for.">Add the client, type of shoot, and the reason these photos were taken.</Head>
          <div className="v3-details-grid">
            <section className="v3-panel v3-shoot-fields">
              <div className="v3-panel-heading"><span>01</span><div><h2>Who is this delivery for?</h2><p>Set the client and shoot type.</p></div></div>
              <label>Client name<input maxLength={100} value={clientName} onChange={event => setClientName(event.target.value)} placeholder="Ada" /></label>
              <label>Type of shoot<select value={shootType} onChange={event => { purposeRevision.current += 1; setShootType(event.target.value); setRecommendation(null); setFormat(''); }}><option value="">Choose a shoot type</option>{SHOOT_TYPES.map(value => <option key={value}>{value}</option>)}</select></label>
              {shootType === 'Other' && <label>What type of shoot?<input maxLength={80} value={customShoot} onChange={event => { purposeRevision.current += 1; setCustomShoot(event.target.value); }} placeholder="e.g. bridal shower" /></label>}
            </section>
            <section className="v3-panel v3-purpose-panel">
              <div className="v3-panel-heading"><span>02</span><div><h2>What was the shoot for?</h2><p>Use your own words. A short, plain description is enough.</p></div></div>
              <label className="v3-purpose-label"><span>Purpose of the shoot</span><textarea rows={8} maxLength={3000} value={purpose} onChange={event => { purposeRevision.current += 1; setPurpose(event.target.value); setOriginalPurpose(''); setPurposeFeedback(''); }} placeholder="These photos were taken for Ada's 25th birthday celebration…" /><small>Include names and the occasion if they matter to the story.</small></label>
              <div className="v3-assist"><button type="button" onClick={improve} disabled={!!busy}>{busy === 'improve' ? <LoaderCircle className="v3-spin" size={16} /> : <RefreshCw size={16} />} Improve my wording</button>{originalPurpose && <button type="button" className="is-quiet" disabled={!!busy} onClick={() => { purposeRevision.current += 1; setPurpose(originalPurpose); setOriginalPurpose(''); setPurposeFeedback('Your original wording is back.'); }}><RotateCcw size={16} /> Revert to my words</button>}<p aria-live="polite">{purposeFeedback || 'Keeps your meaning and details. Your original wording is saved so you can restore it.'}</p></div>
            </section>
          </div>
          <div className="v3-actions"><StepButton onClick={detailsNext} disabled={!!busy || billingLoading || !draft && quotaReached}>{busy ? <LoaderCircle className="v3-spin" size={17} /> : <ArrowRight size={17} />} Continue to formats</StepButton></div>
        </>}
        {stage === 'format' && <>
          <Head eyebrow="02 / THE FORMAT" title="Choose how they first see the work.">Pick the format that fits this shoot. The recommendation is a starting point; you can choose any of the eight.</Head>
          {recommendedFormat && <section className="v3-featured-format" aria-label="Recommended format">
            <div className="v3-featured-art" aria-hidden="true" inert=""><DeliveryFormatVisual format={recommendedFormat} compact paused /></div>
            <div className="v3-featured-copy">
              <span>Recommended for this delivery</span>
              <h2>{recommendedFormat.name}</h2>
              <p>{recommendation.reason || recommendedFormat.line}</p>
              <small>{BOUNDS[recommendedFormat.value][0]}–{BOUNDS[recommendedFormat.value][1]} showcase photos</small>
              <div className="v3-featured-actions"><button type="button" onClick={() => setFormat(recommendedFormat.value)} aria-pressed={format === recommendedFormat.value}>{format === recommendedFormat.value ? <><Check size={16} /> Selected</> : 'Choose this format'}</button><Link to={'/demo/' + (recommendedFormat.value === 'photo-reveal' ? 'reveal' : recommendedFormat.value)} target="_blank" rel="noopener noreferrer">Preview demo <ExternalLink size={15} /></Link></div>
            </div>
          </section>}
          {recommendedFormat && <div className="v3-format-section"><h2>Other formats</h2><p>Choose a different way to introduce the gallery.</p></div>}
          <div className="v3-format-grid">{DELIVERY_FORMATS.filter(item => item.value !== recommendedFormat?.value).map(item => <FormatCard key={item.value} item={item} selected={format === item.value} onSelect={() => setFormat(item.value)} />)}</div>
          <div className="v3-actions"><StepButton secondary onClick={() => setStage('details')}><ArrowLeft size={17} /> Back</StepButton><StepButton onClick={chooseFormat} disabled={!!busy}>{busy ? <LoaderCircle className="v3-spin" size={17} /> : <ArrowRight size={17} />} Continue to photos</StepButton></div>
        </>}
        {stage === 'upload' && <>
          <Head eyebrow="03 / THE PHOTOGRAPHS" title="Add the finished photographs.">The complete upload goes into the client's gallery. We will select {bounds[0]}–{bounds[1]} photos for the {selectedFormat?.name || 'showcase'}.</Head>
          <div className="v3-upload-heading">
            <div className="v3-upload-total"><span>PHOTOS IN THIS DELIVERY</span><strong>{assets.length}<small> / {limits}</small></strong><p>{planName} plan · every uploaded photo stays in the full gallery</p></div>
            <div className="v3-upload-specs"><span>JPEG, PNG or WebP</span><span>Up to 50 MB per photo</span><span>{bounds[0]}–{bounds[1]} photos in the showcase</span></div>
          </div>
          <div className="v3-upload-workspace">
            <label className="v3-drop"><span className="v3-drop-icon"><Upload size={25} /></span><strong>Add finished photographs</strong><span>Choose as many as you need, up to {limits} total.</span><b>Browse photos</b><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { uploadFiles(event.target.files); event.target.value = ''; }} disabled={!!busy} /></label>
            <div className="v3-upload-side-note"><span>YOUR ORIGINALS STAY INTACT</span><h2>Full gallery and showcase are separate.</h2><p>Every photo you upload remains available to the client. The smaller showcase is selected after all photos have been reviewed.</p><div><Image size={17} /><span>Only finished JPEG, PNG or WebP photos</span></div></div>
          </div>
          {busy === 'upload' && <div className="v3-upload-progress" role="status"><span>Uploading photographs · {uploadPercent}%</span><div><i style={{ transform: 'scaleX(' + uploadPercent / 100 + ')' }} /></div></div>}
          {failedFiles.length > 0 && <StepButton secondary onClick={() => uploadFiles(failedFiles)} disabled={!!busy}><RefreshCw size={16} /> Retry {failedFiles.length} failed photo{failedFiles.length > 1 ? 's' : ''}</StepButton>}
          {assets.length > 0 ? <div className="v3-photo-grid">{assets.map((asset, index) => <article key={asset.assetId}><button type="button" className="v3-photo-open" onClick={() => window.open(asset.url, '_blank', 'noopener,noreferrer')} aria-label={'Preview photo ' + (index + 1)}><img src={asset.thumbnailUrl || asset.url} alt={asset.originalFilename || 'Uploaded photograph'} loading="lazy" /></button><div><span>{index + 1}. {asset.originalFilename || 'Photograph'}</span><button type="button" onClick={() => deletePhoto(asset.assetId)} disabled={!!busy} aria-label={'Delete ' + (asset.originalFilename || 'photo')}><Trash2 size={16} /></button></div></article>)}</div> : <div className="v3-gallery-empty"><Image size={28} /><div><strong>Your gallery will appear here.</strong><span>You can add more photos any time before analysis.</span></div></div>}
          <div className="v3-actions"><StepButton secondary onClick={() => setStage('format')}><ArrowLeft size={17} /> Back to formats</StepButton><StepButton onClick={prepare} disabled={!!busy || assets.length < bounds[0]}><ArrowRight size={17} /> Review {assets.length} photos</StepButton></div>
        </>}
        {stage === 'preparing' && <div className="v3-working" role="status"><div className="v3-working-mark"><Image size={30} /></div><Head eyebrow="ANALYSING THE PHOTOGRAPHS" title="Choosing the showcase.">We are reviewing every uploaded photo, then writing captions for the selected set. Your full gallery will keep them all.</Head><strong>{job?.progress || 0}%</strong><div className="v3-upload-progress"><div><i style={{ transform: 'scaleX(' + (job?.progress || 0) / 100 + ')' }} /></div></div><p>{job?.stage === 'analysing-photos' ? 'Reviewing every photograph' : job?.stage === 'writing-showcase' ? 'Writing the showcase and captions' : 'Preparing your delivery'}</p>{job?.status === 'failed' && <StepButton onClick={prepare}><RefreshCw size={16} /> Retry analysis</StepButton>}</div>}
        {stage === 'showcase' && <>
          <Head eyebrow="04 / THE SHOWCASE" title="Make the selection yours.">Choose the photographs the client sees first. All {assets.length} uploaded photos remain in the full gallery.</Head>
          <div className="v3-showcase-count"><div><strong>{selected.length} chosen</strong><span>photos in the showcase</span></div><small>{bounds[0]} minimum · {bounds[1]} maximum</small></div>
          <div className="v3-showcase-settings">
            <section className="v3-panel v3-showcase-words">
              <div className="v3-panel-heading"><span>01</span><div><h2>Opening and closing words</h2><p>These messages frame the showcase for your client.</p></div></div>
              <label>Delivery title<input maxLength={80} value={title} onChange={event => setTitle(event.target.value)} /></label>
              <label>Opening message<textarea value={openingLine} maxLength={140} rows={3} onChange={event => setOpeningLine(event.target.value)} /></label>
              <label>Closing message<textarea value={closingLine} maxLength={160} rows={3} onChange={event => setClosingLine(event.target.value)} /></label>
            </section>
            <div className="v3-bookends">
              <article className="v3-bookend-card">
                <div className="v3-bookend-image">{assetById.get(openingAssetId) ? <img src={assetById.get(openingAssetId)?.thumbnailUrl || assetById.get(openingAssetId)?.url} alt={assetById.get(openingAssetId)?.originalFilename || 'Opening photograph'} /> : <Image size={26} />}</div>
                <div className="v3-bookend-choice"><span>Opening photograph</span><small>Shown before the showcase begins.</small><button type="button" className="v3-photo-choice-button" disabled={!!busy} onClick={() => setPhotoPicker({ mode: 'opening', currentId: openingAssetId, title: 'Choose the opening photograph' })}><Image size={18} /> Choose opening photo</button></div>
              </article>
              <article className="v3-bookend-card">
                <div className="v3-bookend-image">{assetById.get(closingAssetId) ? <img src={assetById.get(closingAssetId)?.thumbnailUrl || assetById.get(closingAssetId)?.url} alt={assetById.get(closingAssetId)?.originalFilename || 'Closing photograph'} /> : <Image size={26} />}</div>
                <div className="v3-bookend-choice"><span>Closing photograph</span><small>Shown after the final showcase photo.</small><button type="button" className="v3-photo-choice-button" disabled={!!busy} onClick={() => setPhotoPicker({ mode: 'closing', currentId: closingAssetId, title: 'Choose the closing photograph' })}><Image size={18} /> Choose closing photo</button></div>
              </article>
            </div>
          </div>
          <div className="v3-showcase-section-heading"><div><span>02 / THE SHOWCASE PHOTOS</span><h2>Review each photo and its caption.</h2></div><p>Drag-free ordering: use the arrows to change the sequence.</p></div>
          <div className="v3-showcase-editor">
            <div className="v3-showcase-nav" aria-label="Showcase photographs">
              {selected.map((id, index) => <button type="button" key={id} className={activeShowcaseIndex === index ? 'is-active' : ''} aria-current={activeShowcaseIndex === index ? 'true' : undefined} onClick={() => setActivePhotoIndex(index)} aria-label={'Edit showcase photo ' + (index + 1)}>
                <img src={assetById.get(id)?.thumbnailUrl || assetById.get(id)?.url} alt="" loading="lazy" />
                <span>{String(index + 1).padStart(2, '0')}</span>
              </button>)}
            </div>
            {activeShowcaseId && <article className="v3-showcase-item">
              <img src={assetById.get(activeShowcaseId)?.thumbnailUrl || assetById.get(activeShowcaseId)?.url} alt={assetById.get(activeShowcaseId)?.originalFilename || 'Selected photograph'} />
              <div className="v3-showcase-controls">
                <div className="v3-showcase-toolbar"><strong>PHOTO {String(activeShowcaseIndex + 1).padStart(2, '0')} OF {String(selected.length).padStart(2, '0')}</strong><button type="button" onClick={() => moveSelected(activeShowcaseIndex, -1)} disabled={!!busy || activeShowcaseIndex === 0} aria-label="Move earlier"><ChevronLeft size={18} /></button><button type="button" onClick={() => moveSelected(activeShowcaseIndex, 1)} disabled={!!busy || activeShowcaseIndex === selected.length - 1} aria-label="Move later"><ChevronRight size={18} /></button><button type="button" onClick={() => setSelected(current => current.filter(value => value !== activeShowcaseId))} disabled={!!busy || selected.length <= bounds[0]} aria-label="Remove from showcase"><Trash2 size={17} /></button></div>
                <label>Headline<textarea className="v3-showcase-headline" disabled={busy === 'caption-' + activeShowcaseId} rows={2} maxLength={70} value={headlines[activeShowcaseId] || ''} onChange={event => setHeadlines(current => ({ ...current, [activeShowcaseId]: event.target.value }))} /><small>{(headlines[activeShowcaseId] || '').length} / 70 · A short title for this photograph</small></label>
                <label>Caption<textarea disabled={busy === 'caption-' + activeShowcaseId} rows={format === 'photo-story' ? 4 : 5} maxLength={format === 'photo-story' ? 150 : 180} value={captions[activeShowcaseId] || ''} onChange={event => setCaptions(current => ({ ...current, [activeShowcaseId]: event.target.value }))} /><small>{(captions[activeShowcaseId] || '').length} / {format === 'photo-story' ? 150 : 180}{format === 'photo-story' ? ' · Check the caption in your client preview' : ''}</small></label>
                <div className="v3-caption-assist"><input disabled={busy === 'caption-' + activeShowcaseId} value={instructions[activeShowcaseId] || ''} maxLength={400} onChange={event => setInstructions(current => ({ ...current, [activeShowcaseId]: event.target.value }))} placeholder="Tell Veylo what to emphasize (optional)" aria-label={'Instruction for photo ' + (activeShowcaseIndex + 1)} /><button type="button" onClick={() => regenerate(activeShowcaseId)} disabled={!!busy}>{busy === 'caption-' + activeShowcaseId ? <LoaderCircle className="v3-spin" size={15} /> : <RefreshCw size={15} />} Regenerate headline and caption</button></div>
                {captionError?.assetId === activeShowcaseId && <p className="v3-caption-error" role="alert"><AlertCircle size={18} />{captionError.text} Your current headline and caption have been kept. Try again.</p>}
                <button type="button" className="v3-photo-choice-button" disabled={!!busy || !unselected.length} onClick={() => setPhotoPicker({ mode: 'replace', index: activeShowcaseIndex, title: 'Replace this showcase photo' })}><Image size={18} /> Replace this photo</button>
                <div className="v3-showcase-pager"><button type="button" onClick={() => setActivePhotoIndex(activeShowcaseIndex - 1)} disabled={activeShowcaseIndex === 0}><ArrowLeft size={16} /> Previous photo</button><button type="button" onClick={() => setActivePhotoIndex(activeShowcaseIndex + 1)} disabled={activeShowcaseIndex === selected.length - 1}>Next photo <ArrowRight size={16} /></button></div>
              </div>
            </article>}
          </div>
          {selected.length < bounds[1] && unselected.length > 0 && <div className="v3-add-photo"><button type="button" className="v3-photo-choice-button" disabled={!!busy} onClick={() => setPhotoPicker({ mode: 'add', title: 'Add a showcase photo' })}><Plus size={18} /> Add another showcase photo</button></div>}
          <div className="v3-actions"><StepButton secondary onClick={() => { captionRequest.current?.abort(); setStage('upload'); }}><ArrowLeft size={17} /> Back to photos</StepButton><StepButton onClick={saveShowcase} disabled={!!busy}><ArrowRight size={17} /> Continue</StepButton></div>
        </>}
        {(stage === 'narration' || stage === 'narration-job') && <>
          <Head eyebrow="05 / OPTIONAL PHOTO STORY VOICE" title="Choose a voice for your story.">Add a voice to the opening and closing messages. Photo captions stay on screen.</Head>
          <NarrationVoicePicker value={narrationVoiceId} onChange={setNarrationVoiceId} disabled={!!busy || stage === 'narration-job' && job?.status !== 'failed'} />
          <div className="v3-narration-layout">
            <section className="v3-panel v3-narration-choice">
              <div className="v3-narration-mark"><Mic2 size={26} /></div><span>SELECTED VOICE</span><h2>{selectedVoiceName}</h2><p>{selectedVoiceName} reads the opening and closing messages. The photo captions remain written, and each photo still shows for six seconds.</p>
              <div className="v3-narration-facts"><span>Text stays on screen</span><span>Six seconds per photo</span><span>Music lowers under speech</span></div>
            </section>
            <div className="v3-narration-messages">
              <article><span>OPENING MESSAGE</span><p>{openingLine}</p></article>
              <article><span>CLOSING MESSAGE</span><p>{closingLine}</p></article>
            </div>
          </div>
          {stage === 'narration-job' && job?.status !== 'failed' && <div className="v3-upload-progress" role="status"><span>Preparing opening and closing voice · {job?.progress || 0}%</span><div><i style={{ transform: 'scaleX(' + (job?.progress || 0) / 100 + ')' }} /></div></div>}
          {error && <div className="v3-narration-error" role="alert"><AlertCircle size={22} aria-hidden="true" /><div><strong>The voice isn’t ready yet.</strong><p>{typeof error === 'string' ? error : error.text}</p><small>Your messages and captions are saved. Retry below, or choose Skip voice to continue with text.</small></div></div>}
          <div className="v3-actions v3-narration-actions"><StepButton secondary onClick={() => setStage('showcase')}><ArrowLeft size={17} /> Back to showcase</StepButton><StepButton secondary onClick={skipNarration} disabled={!!busy}>Skip voice</StepButton><StepButton onClick={generateNarration} disabled={!!busy || stage === 'narration-job' && job?.status !== 'failed'}>{job?.status === 'failed' ? <><RefreshCw size={16} /> Retry selected voice</> : <><Mic2 size={17} /> Generate selected voice</>}</StepButton></div>
        </>}
        {stage === 'music' && <>
          <Head eyebrow="06 / MUSIC" title="Find the right soundtrack.">Preview the music, check how it fits the delivery, then choose a track. Afrobeat and Amapiano are listed first.</Head>
          <section className="v3-music-layout" aria-label="Soundtrack library">
            <div className="v3-music-library">
              <div className="v3-music-tabs" role="tablist" aria-label="Music source">
                <button type="button" className={musicTab === 'curated' ? 'is-active' : ''} role="tab" aria-selected={musicTab === 'curated'} onClick={() => setMusicTab('curated')}><Music2 size={17} /> Curated music <span>{tracks.length}</span></button>
                <button type="button" className={musicTab === 'custom' ? 'is-active' : ''} role="tab" aria-selected={musicTab === 'custom'} onClick={() => setMusicTab('custom')}><Upload size={17} /> Upload your own</button>
              </div>
              {musicTab === 'curated' ? <>
                <div className="v3-music-tools">
                  <label className="v3-music-search"><Search size={18} /><input value={musicSearch} onChange={event => setMusicSearch(event.target.value)} placeholder="Search title, mood, genre or artist" aria-label="Search music" /></label>
                  <div className="v3-music-categories" role="group" aria-label="Filter music by style">
                    {musicCategories.map(category => <button type="button" key={category} className={musicCategory === category ? 'is-active' : ''} aria-pressed={musicCategory === category} onClick={() => setMusicCategory(category)}>{category === 'all' ? 'All music' : category.split(/[\s-]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</button>)}
                  </div>
                </div>
                <div className="v3-music-results-head"><div><span>THE MUSIC LIBRARY</span><strong>{musicCategory === 'all' ? 'Afrobeat & Amapiano first' : categoryLabel(musicCategory)}</strong></div><small>{filteredTracks.length} {filteredTracks.length === 1 ? 'track' : 'tracks'}</small></div>
                {musicLoading ? <div className="v3-music-empty" role="status"><LoaderCircle className="v3-spin" size={22} /><strong>Loading the music library</strong><span>This should only take a moment.</span></div> : filteredTracks.length ? <div className="v3-track-list">
                  {filteredTracks.map((track, index) => {
                    const isPlaying = activeTrack === track.id;
                    const isSelected = draft?.soundtrack?.catalogId === track.id;
                    return <article key={track.id} className={(isPlaying ? 'is-playing ' : '') + (isSelected ? 'is-selected' : '')}>
                      <div className="v3-track-index"><span>{String(index + 1).padStart(2, '0')}</span><AudioLines size={23} /></div>
                      <button type="button" className="v3-track-play" onClick={() => toggleTrack(track)} aria-label={(isPlaying ? 'Pause ' : 'Play ') + track.title} aria-pressed={isPlaying}>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
                      <div className="v3-track-copy">
                        <div className="v3-track-title"><strong>{track.title}</strong>{isSelected && <span><Check size={13} /> Selected</span>}</div>
                        <small>{track.creator || 'Instrumental'}{track.genre || track.category ? ` · ${track.genre || categoryLabel(track.category)}` : ''}</small>
                        {track.storyFunction && <p>{track.storyFunction}</p>}
                        <div className="v3-track-tags"><span>{track.mood || track.genre || track.category || 'Soundtrack'}</span><small>{formatTrackTime(track.durationSec)}</small>{track.contentIdRegistered && <span>Content ID registered</span>}</div>
                        {(track.bestFor?.length || track.avoidFor?.length || track.instrumentationCue || track.editingPace || track.narrationFit) && <details className="v3-track-notes"><summary>Track notes</summary><div>{track.bestFor?.length > 0 && <p><strong>Best for</strong>{track.bestFor.join(' · ')}</p>}{track.avoidFor?.length > 0 && <p><strong>Avoid for</strong>{track.avoidFor.join(' · ')}</p>}{(track.instrumentationCue || track.editingPace) && <p><strong>Sound</strong>{[track.instrumentationCue, track.editingPace].filter(Boolean).join(' · ')}</p>}{track.narrationFit && <p><strong>Narration</strong>{track.narrationFit} fit</p>}</div></details>}
                      </div>
                      <StepButton secondary onClick={() => selectTrack(track)} disabled={!!busy}>{isSelected ? 'Selected' : 'Use track'}</StepButton>
                    </article>;
                  })}
                </div> : <div className="v3-music-empty"><Music2 size={22} /><strong>{tracks.length ? 'No tracks match this search.' : 'The music library is empty.'}</strong><span>{tracks.length ? 'Try another style or search term.' : 'Try again in a moment, or upload a track you have permission to use.'}</span></div>}
              </> : <div className="v3-custom-music">
                <div className="v3-custom-music-icon"><Upload size={24} /></div><span>YOUR OWN AUDIO</span><h2>Use a track from your studio.</h2><p>Choose audio you have permission to use in this client's delivery. We will attach it to this delivery and continue to design.</p>
                <label className="v3-custom-music-picker"><Upload size={18} /><span>{busy === 'music' ? 'Adding your track…' : 'Choose an audio file'}</span><small>MP3, WAV, M4A, OGG or AAC</small><input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac" onChange={event => { customTrack(event.target.files?.[0]); event.target.value = ''; }} disabled={!!busy} /></label>
              </div>}
            </div>
            <aside className="v3-music-player" aria-label="Track preview">
              <div className="v3-player-art"><AudioLines size={42} /><span>VEYLO SOUNDTRACKS</span></div>
              <div className="v3-player-state">{currentPreviewTrack ? 'NOW PREVIEWING' : draft?.soundtrack ? 'CURRENTLY SELECTED' : 'TRACK PREVIEW'}</div>
              <h2>{featureTrack?.title || 'Choose a track to preview'}</h2>
              <p>{featureTrack ? [featureTrack.creator || 'Instrumental', featureTrack.genre || featureTrack.category].filter(Boolean).join(' · ') : 'Listen before adding music to the delivery.'}</p>
              <div className="v3-player-progress"><input type="range" min="0" max={Math.max(trackDuration, 1)} value={Math.min(trackTime, trackDuration || 1)} onChange={seekTrack} disabled={!activeTrack || !trackDuration} aria-label="Seek track preview" /><div><small>{formatTrackTime(trackTime)}</small><small>{formatTrackTime(trackDuration || featureTrack?.durationSec)}</small></div></div>
              <div className="v3-player-actions">
                {featureTrack?.previewUrl && <button type="button" className="v3-player-play" onClick={() => toggleTrack(featureTrack)} aria-label={(activeTrack === featureTrack.id ? 'Pause ' : 'Play ') + featureTrack.title}>{activeTrack === featureTrack.id ? <Pause size={18} /> : <Play size={18} />}</button>}
                {featureTrack?.id && <StepButton onClick={() => selectTrack(featureTrack)} disabled={!!busy}>{draft?.soundtrack?.catalogId === featureTrack.id ? <><Check size={16} /> Selected</> : 'Use this track'}</StepButton>}
              </div>
              {draft?.soundtrack && <div className="v3-player-current"><Check size={15} /><span>Added to this delivery: <strong>{draft.soundtrack.title}</strong></span></div>}
            </aside>
          </section>
          <audio ref={audioRef} onTimeUpdate={event => setTrackTime(event.currentTarget.currentTime || 0)} onLoadedMetadata={event => setTrackDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onEnded={() => { setActiveTrack(''); setTrackTime(0); }} />
          <div className="v3-actions"><StepButton secondary onClick={() => { audioRef.current?.pause(); setActiveTrack(''); setStage(format === 'photo-story' ? 'narration' : 'showcase'); }}><ArrowLeft size={17} /> Back</StepButton>{draft?.soundtrack && <StepButton onClick={() => { audioRef.current?.pause(); setActiveTrack(''); setStage('design'); }}><ArrowRight size={17} /> Continue to design</StepButton>}</div>
        </>}
        {stage === 'design' && <>
          <Head eyebrow={String(currentIndex + 1).padStart(2, '0') + ' / DESIGN'} title="See how your delivery will look.">These colours and fonts change the opening and photo showcase. The full gallery and its controls keep Veylo's standard design.</Head>
          <div className="v3-design-grid">
            <div className="v3-panel v3-design-controls">
              <div className="v3-design-colour-heading"><div className="v3-panel-heading"><span>01</span><div><h2>Colours from your photographs</h2><p>Choose another set until it feels right.</p></div></div><StepButton secondary onClick={repickPalette} disabled={!!busy}><RefreshCw size={15} className={busy === 'palette' ? 'v3-spin' : ''} />{busy === 'palette' ? 'Choosing colours…' : 'Choose another palette'}</StepButton></div>
              <div className="v3-palette-grid" aria-label="Selected colour palette">
                {Object.keys(defaultPalette).map(role => <div className="v3-palette-swatch" key={role}><span style={{ background: palette[role] || defaultPalette[role] }} aria-hidden="true" /><div><strong>{{ background: 'Opening background', surface: 'Showcase panels', text: 'Showcase text', accent: 'Highlight colour' }[role]}</strong></div></div>)}
              </div>
              {!themeStatus.valid && <div className="v3-contrast" aria-live="polite"><strong>Some text may be hard to read.</strong><p>{themeStatus.message}</p><button type="button" className="v3-contrast-fix" onClick={() => { setPalette(current => readablePalette(current)); setError(''); }}>Fix text contrast</button></div>}
              <div className="v3-type-controls"><div className="v3-panel-heading"><span>02</span><div><h2>Typography</h2><p>Choose a pair that suits the delivery.</p></div></div>
                {['display', 'body'].map(role => <label className="v3-font" key={role}>{role === 'display' ? 'Headings and titles' : 'Captions and supporting text'}<select value={typography[role]} onChange={event => setTypography(current => ({ ...current, [role]: event.target.value }))}>{FONTS.map(font => <option key={font}>{font}</option>)}</select></label>)}
              </div>
            </div>
            <div className="v3-design-preview"><ClientPreviewPhoneFrame delivery={designPreviewDelivery} narrationEnabled={false} access={access} isolate /></div>
          </div>
          <div className="v3-actions"><StepButton secondary onClick={() => setStage(MUSIC.has(format) ? 'music' : 'showcase')}><ArrowLeft size={17} /> Back</StepButton><StepButton onClick={approveDesign} disabled={!!busy}>{busy === 'approve' ? <LoaderCircle className="v3-spin" size={17} /> : <Check size={17} />} Approve and set access</StepButton></div>
        </>}
        {stage === 'access' && <>
          <Head eyebrow={String(currentIndex + 1).padStart(2, '0') + ' / ACCESS & PUBLISH'} title="Set the rules for this link.">Choose the access and download rules, then publish when everything is ready.</Head>
          <div className="v3-access-layout">
            <section className="v3-panel v3-access-security">
              <div className="v3-panel-heading"><span>01</span><div><h2>Link security</h2><p>Set an optional PIN or expiry date.</p></div></div>
              <label>Six-digit PIN (optional)<input inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={event => { const value = event.target.value.replace(/\D/g, '').slice(0, 6); setPin(value); if (value) setRemovePin(false); }} placeholder={draft?.hasPin ? 'PIN already set — leave blank to keep it' : 'Leave blank for no PIN'} /></label>
              {draft?.hasPin && <label className="v3-check"><input type="checkbox" checked={removePin} onChange={event => { setRemovePin(event.target.checked); if (event.target.checked) setPin(''); }} /> Remove the current PIN</label>}
              <label>Expiry date (optional)<input type="datetime-local" value={access.expiresAt} onChange={event => setAccess(current => ({ ...current, expiresAt: event.target.value }))} /></label>
            </section>
            <section className="v3-panel v3-access-permissions">
              <div className="v3-panel-heading"><span>02</span><div><h2>Downloads and reactions</h2><p>Choose what the client can do with the gallery.</p></div></div>
              {[
                ['allowIndividualDownloads', 'Allow individual downloads', 'Clients can save one photo at a time.'],
                ['allowDownloadAll', 'Allow full gallery download', 'Clients can download the complete set.'],
                ['allowLikes', 'Allow photo likes', 'Clients can mark the photos they love.'],
              ].map(([key, label, description]) => <label className="v3-permission" key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={Boolean(access[key])} onChange={event => setAccess(current => ({ ...current, [key]: event.target.checked }))} /></label>)}
            </section>
            {format === 'campaign' && <section className="v3-panel v3-campaign-terms"><div className="v3-panel-heading"><span>03</span><div><h2>Campaign usage terms</h2><p>Tell the client how these final files may be used.</p></div></div><textarea rows={4} maxLength={1000} value={access.usageTerms} onChange={event => setAccess(current => ({ ...current, usageTerms: event.target.value }))} placeholder="Add usage terms (optional)" /></section>}
          </div>
          <div className="v3-actions"><StepButton secondary onClick={() => setStage('design')}><ArrowLeft size={17} /> Back to design preview</StepButton><StepButton secondary onClick={saveAccess} disabled={!!busy}>Save settings</StepButton><StepButton onClick={publish} disabled={!!busy || billingLoading || quotaReached}><Check size={17} /> Publish delivery</StepButton></div>
        </>}
        {stage === 'published' && <div className="v3-published"><span><Check size={30} /></span><Head eyebrow="DELIVERY PUBLISHED" title="Your delivery is ready.">Send the link to your client on WhatsApp, Instagram, or wherever you speak with them.</Head><div className="v3-share-link"><input readOnly value={published?.url || ''} aria-label="Delivery link" /><StepButton onClick={() => navigator.clipboard.writeText(published?.url || '').then(() => toast.success('Link copied.'))}>Copy link</StepButton></div><div className="v3-actions"><a className="v3-button is-secondary" href={'https://wa.me/?text=' + encodeURIComponent('Your photos are ready: ' + (published?.url || ''))} target="_blank" rel="noopener noreferrer">Share on WhatsApp <ExternalLink size={16} /></a><Link className="v3-button" to="/dashboard">Back to dashboard <ArrowRight size={16} /></Link></div></div>}
      </motion.main></AnimatePresence>
      </div>
      {published && <section className="v3-published-extra"><div className="v3-actions"><a className="v3-button is-secondary" href={published.url} target="_blank" rel="noopener noreferrer">Open client view <ExternalLink size={16} /></a><StepButton secondary onClick={shareDelivery}><Share2 size={16} /> Open share menu</StepButton><StepButton secondary onClick={downloadQr} disabled={!!busy}><QrCode size={16} /> Download QR</StepButton></div><form onSubmit={sendEmail}><label><Mail size={17} /><input type="email" required maxLength={254} value={clientEmail} onChange={event => setClientEmail(event.target.value)} placeholder="Client email address" aria-label="Client email address" /></label><StepButton type="submit" disabled={!!busy}>{busy === 'email' ? 'Sending…' : 'Send by email'}</StepButton></form></section>}
      {photoPicker && <ShowcasePhotoPicker title={photoPicker.title} assets={['replace', 'add'].includes(photoPicker.mode) ? unselected : assets} currentId={photoPicker.currentId} mediaUrl={withMediaUrl} onSelect={chooseShowcasePhoto} onClose={() => setPhotoPicker(null)} />}
    </div>
  </div>;
}
