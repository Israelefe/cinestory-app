import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  GripVertical,
  Image,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Music2,
  MoveDown,
  MoveUp,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Type,
  Upload,
  X
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../config/env.js';
import api, { apiMessage } from '../services/api.js';
import { uploadDeliveryPhotosV3 } from '../utils/deliveryUploadV3.js';
import UploadConnectionStatus from '../components/UploadConnectionStatus.jsx';
import { uploadDeliverySoundtrack } from '../utils/deliveryUpload.js';
import { SHOOT_TYPES } from '../constants/shootTypes.js';
import { creationPreviewBranding, mergeDeliveryDraft } from '../utils/deliveryDraft.js';
import { useDialogFocus } from '../components/useDialogFocus.js';
import { localDeliveryExpiry } from '../utils/deliveryAccess.js';
import { recoverPublishedDelivery } from '../utils/deliveryPublishV3.js';
import { ClientPreviewPhoneFrame } from '../components/delivery/PhonePresentation.jsx';
import './CreatePhotoSwapV3.css';

const FONTS = ['Cormorant Garamond', 'Playfair Display', 'Libre Baskerville', 'Outfit', 'Plus Jakarta Sans', 'DM Sans', 'Manrope'];
const PHOTO_PAGE_SIZE = 36;
const DEFAULT_ACCESS = { allowIndividualDownloads: true, allowDownloadAll: false, allowLikes: true, expiresAt: '' };
const STEPS = [
  { id: 'details', label: 'Details' },
  { id: 'photos', label: 'Photos' },
  { id: 'captions', label: 'Captions' },
  { id: 'style', label: 'Style' },
  { id: 'access', label: 'Access' },
  { id: 'publish', label: 'Publish' }
];

function mediaUrl(value) {
  return typeof value === 'string' && value.startsWith('/api/')
    ? API_BASE_URL.replace(/\/$/, '') + value.slice(4)
    : value;
}

function errorText(error) {
  if (error?.response?.status === 401) return 'Your session expired. Sign in again to continue.';
  if (error?.response?.status === 403 && error?.response?.data?.code === 'MONTHLY_DELIVERY_LIMIT_REACHED') return error.response.data.message;
  return apiMessage(error, error?.message || 'This step could not finish. Check your connection and try again.');
}

function quotaMessage(data) {
  return 'You have published all ' + (data?.limits?.deliveriesPerMonth || 3) + ' Free deliveries this month. Start another next month, or move to Pro.';
}

function reachedQuota(data) {
  return data?.plan === 'free' && data?.usage?.deliveriesRemaining === 0;
}

function initialStage(delivery) {
  if (delivery?.status === 'published') return 'published';
  const step = delivery?.v3?.step;
  const missingCaptions = delivery?.kind === 'photoswap' && (delivery.assets || []).some(asset => String(asset.caption || '').trim().length < 5);
  if (delivery?.kind === 'photoswap' && (delivery.status === 'analyzing' || step === 'preparing')) return 'captions';
  if (missingCaptions) return 'photos';
  if (step === 'captions') return 'captions';
  if (step === 'access') return delivery?.reviewApprovedAt ? 'publish' : 'access';
  if (step === 'photoswap' || delivery?.photoswap?.backgroundMode) return 'style';
  return delivery?._id ? 'photos' : 'details';
}

function canonicalShootType(value) {
  return SHOOT_TYPES.find(option => option.toLocaleLowerCase() === String(value || '').trim().toLocaleLowerCase()) || '';
}

function Toggle({ checked, onChange, children }) {
  return (
    <label className="ps-toggle">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span className="ps-toggle-track" aria-hidden="true"><i /></span>
      <span className="ps-toggle-copy">{children}</span>
    </label>
  );
}

function SectionHeading({ number, title, children }) {
  return (
    <div className="ps-form-heading">
      <span>{number}</span>
      <div><h2 id="ps-step-title">{title}</h2>{children && <p>{children}</p>}</div>
    </div>
  );
}

export default function CreatePhotoSwapV3({ user, initialDelivery }) {
  const navigate = useNavigate();
  const veyloMotion = useVeyloReducedMotion();
  const initialKnownShootType = canonicalShootType(initialDelivery?.shootType);
  const [draft, setDraft] = useState(initialDelivery || null);
  const [stage, setStage] = useState(() => initialStage(initialDelivery));
  const [clientName, setClientName] = useState(initialDelivery?.clientName || '');
  const [title, setTitle] = useState(initialDelivery?.title || '');
  const [shootType, setShootType] = useState(initialKnownShootType || (initialDelivery?.shootType ? 'Other' : ''));
  const [customShoot, setCustomShoot] = useState(initialKnownShootType ? '' : initialDelivery?.shootType || '');
  const [purpose, setPurpose] = useState(initialDelivery?.brief === 'Photo Swap delivery' ? '' : initialDelivery?.brief || '');
  const [captions, setCaptions] = useState(() => Object.fromEntries((initialDelivery?.assets || []).map(asset => [asset.assetId, asset.caption || ''])));
  const [captionInstructions, setCaptionInstructions] = useState({});
  const [captionPreparing, setCaptionPreparing] = useState(initialDelivery?.status === 'analyzing' || initialDelivery?.v3?.step === 'preparing');
  const [captionJob, setCaptionJob] = useState(initialDelivery?.generationJob || null);
  const [entitlements, setEntitlements] = useState(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadBatch, setUploadBatch] = useState(null);
  const [failedFiles, setFailedFiles] = useState([]);
  const [backgroundMode, setBackgroundMode] = useState(initialDelivery?.photoswap?.backgroundMode || 'auto');
  const [typography, setTypography] = useState(initialDelivery?.photoswap?.typography || { display: 'Cormorant Garamond', body: 'Outfit' });
  const [soundtracks, setSoundtracks] = useState(null);
  const [previewingTrackId, setPreviewingTrackId] = useState('');
  const [musicCategory, setMusicCategory] = useState('all');
  const [musicSearch, setMusicSearch] = useState('');
  const [musicTab, setMusicTab] = useState('library');
  const [photoOrder, setPhotoOrder] = useState(() => (initialDelivery?.assets || []).slice().sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)).map(asset => asset.assetId));
  const [photoPage, setPhotoPage] = useState(0);
  const [draggedPhotoId, setDraggedPhotoId] = useState('');
  const soundtrackPreviewRef = useRef(null);
  const [access, setAccess] = useState({ ...DEFAULT_ACCESS, ...initialDelivery?.access, expiresAt: localDeliveryExpiry(initialDelivery?.access?.expiresAt) });
  const [pin, setPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [showDesktopPreview, setShowDesktopPreview] = useState(false);
  const previewDialog = useRef(null);
  const previewTrigger = useRef(null);
  useDialogFocus(showDesktopPreview, previewDialog, () => setShowDesktopPreview(false), previewTrigger);
  const [published, setPublished] = useState(initialDelivery?.status === 'published'
    ? { publicId: initialDelivery.publicId, url: window.location.origin + '/d/' + initialDelivery.publicId }
    : null);

  const assets = useMemo(
    () => [...(draft?.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
    [draft?.assets]
  );
  const assetIdentity = assets.map(asset => asset.assetId).join('|');
  const captionIdentity = assets.map(asset => `${asset.assetId}:${asset.caption || ''}`).join('|');
  const actualShootType = shootType === 'Other' ? customShoot.trim() : shootType;
  useEffect(() => {
    const available = new Set(assets.map(asset => asset.assetId));
    setPhotoOrder(current => {
      const kept = current.filter(id => available.has(id));
      return [...kept, ...assets.map(asset => asset.assetId).filter(id => !kept.includes(id))];
    });
  }, [assetIdentity]);
  useEffect(() => {
    setCaptions(current => Object.fromEntries(assets.map(asset => [asset.assetId, current[asset.assetId] ?? asset.caption ?? ''])));
  }, [captionIdentity]);

  const assetsById = useMemo(() => new Map(assets.map(asset => [asset.assetId, asset])), [assets]);
  const orderedAssets = useMemo(
    () => photoOrder.map(id => assetsById.get(id)).filter(Boolean),
    [photoOrder, assetsById]
  );
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
  const currentStep = Math.max(0, STEPS.findIndex(item => item.id === (stage === 'published' ? 'publish' : stage)));
  const currentPhotosPageCount = Math.max(1, Math.ceil(orderedAssets.length / PHOTO_PAGE_SIZE));
  const safePhotoPage = Math.min(photoPage, currentPhotosPageCount - 1);
  const visibleAssets = orderedAssets.slice(safePhotoPage * PHOTO_PAGE_SIZE, (safePhotoPage + 1) * PHOTO_PAGE_SIZE);
  const previewDelivery = useMemo(() => ({
    ...(draft || {}),
    kind: 'photoswap',
    title: title || (clientName || 'Client') + '\'s photographs',
    clientName,
    shootType: actualShootType,
    brief: purpose,
    assets: orderedAssets.map(asset => ({ ...asset, caption: captions[asset.assetId] ?? asset.caption ?? '' })),
    branding: previewBranding,
    photoswap: { backgroundMode, typography }
  }), [draft, title, clientName, actualShootType, purpose, captions, orderedAssets, previewBranding.type, previewBranding.name, previewBranding.logoUrl, backgroundMode, typography]);

  async function refresh() {
    if (!draft?._id) return null;
    const { data } = await api.get('/v1/deliveries/' + draft._id);
    setDraft(data.data);
    return data.data;
  }

  async function action(label, task) {
    setBusy(label);
    setError('');
    try {
      return await task();
    } catch (failure) {
      if (label === 'publish') {
        const recovered = await recoverPublishedDelivery(draft?._id);
        if (recovered) {
          setPublished(recovered);
          setStage('published');
          return recovered;
        }
      }
      setError(errorText(failure));
      return null;
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    let active = true;
    api.get('/v1/billing/status')
      .then(({ data }) => { if (active) setEntitlements(data.data); })
      .catch(failure => { if (active) setError(errorText(failure)); })
      .finally(() => { if (active) setBillingLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draft?._id || stage !== 'captions' || !captionPreparing) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const { data } = await api.get('/v1/deliveries/' + draft._id);
        if (!active) return;
        const next = data.data;
        setDraft(next);
        setCaptionJob(next.generationJob || null);
        if (next.generationJob?.status === 'failed') {
          setCaptionPreparing(false);
          setError(next.generationJob.errorMessage || 'Caption preparation failed. You can try again.');
          return;
        }
        if (next.status === 'review' && next.v3?.step === 'captions') {
          setCaptions(Object.fromEntries((next.assets || []).map(asset => [asset.assetId, asset.caption || ''])));
          setCaptionPreparing(false);
        }
      } catch (failure) {
        if (active) setError(errorText(failure));
      }
    };
    void poll();
    const timer = window.setInterval(poll, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [draft?._id, stage, captionPreparing]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [stage]);

  useEffect(() => {
    if (stage !== 'style' || !draft?._id || soundtracks !== null) return undefined;
    let active = true;
    api.get('/v1/deliveries/soundtracks')
      .then(({ data }) => { if (active) setSoundtracks(Array.isArray(data.data) ? data.data : []); })
      .catch(failure => { if (active) { setError(errorText(failure)); setSoundtracks([]); } });
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
    if (previewingTrackId === track.id) {
      audio.pause();
      audio.currentTime = 0;
      setPreviewingTrackId('');
      return;
    }
    audio.pause();
    audio.src = mediaUrl(track.previewUrl);
    audio.load();
    try {
      await audio.play();
      setPreviewingTrackId(track.id);
    } catch {
      setError('This music preview could not start. Check your connection and try again.');
      setPreviewingTrackId('');
    }
  }

  async function chooseSoundtrack(trackId) {
    soundtrackPreviewRef.current?.pause();
    setPreviewingTrackId('');
    await action('soundtrack', async () => {
      await api.post('/v1/deliveries/' + draft._id + '/soundtrack/select', { trackId });
      await refresh();
    });
  }

  async function clearSoundtrack() {
    soundtrackPreviewRef.current?.pause();
    setPreviewingTrackId('');
    await action('soundtrack', async () => {
      await api.delete('/v1/deliveries/' + draft._id + '/soundtrack');
      await refresh();
    });
  }

  async function customSoundtrack(file) {
    if (!file) return;
    if (!['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'audio/aac'].includes(file.type)) {
      setError('Choose an MP3, WAV, M4A, OGG or AAC audio file.');
      return;
    }
    await action('soundtrack', async () => {
      await uploadDeliverySoundtrack(draft._id, file, file.name.replace(/\.[^.]+$/, ''));
      await refresh();
      setMusicTab('library');
      toast.success('Your track is selected.');
    });
  }

  async function continueDetails(event) {
    event?.preventDefault();
    if (!draft && quotaReached) {
      setError(quotaMessage(entitlements));
      return;
    }
    if (clientName.trim().length < 2) {
      setError('Enter the client name before continuing.');
      return;
    }
    if (title.trim().length < 2) {
      setError('Give this Photo Swap a title before continuing.');
      return;
    }
    if (actualShootType.length < 2) {
      setError(shootType === 'Other' ? 'Name the type of shoot before continuing.' : 'Choose a type of shoot before continuing.');
      return;
    }
    if (!purpose.trim()) {
      setError('Write why the shoot was taken before continuing.');
      return;
    }
    await action('details', async () => {
      const body = {
        kind: 'photoswap',
        clientName: clientName.trim(),
        title: title.trim(),
        shootType: actualShootType,
        purpose: purpose.trim(),
        originalPurpose: purpose.trim(),
        clarificationAnswers: []
      };
      if (draft?._id) {
        await api.patch('/v1/deliveries/' + draft._id + '/v3/details', body);
        await refresh();
      } else {
        const { data } = await api.post('/v1/deliveries/v3', body);
        setDraft(data.data);
        navigate('/create?draft=' + data.data._id, { replace: true });
      }
      setStage('photos');
    });
  }

  async function uploadFiles(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    const invalid = files.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20_000_000);
    if (invalid) {
      setError('Use JPEG, PNG, or WebP photographs no larger than 20 MB each.');
      return;
    }
    if (assets.length + files.length > maxPhotos) {
      setError((entitlements?.planName || 'Your plan') + ' allows up to ' + maxPhotos + ' photos in one delivery.');
      return;
    }
    await action('upload', async () => {
      setUploadPercent(0);
      setUploadBatch(null);
      setFailedFiles([]);
      const result = await uploadDeliveryPhotosV3(draft._id, files, (percent, item) => { setUploadPercent(percent); if (item?.batch) setUploadBatch(item.batch); });
      setFailedFiles(result.errors.map(item => item.file));
      await refresh();
      setPhotoPage(0);
      if (result.errors.length) {
        setError(result.errors.length + ' photo' + (result.errors.length === 1 ? '' : 's') + ' did not upload. Retry those files.');
      }
    });
  }

  async function deletePhoto(assetId) {
    await action('delete', async () => {
      await api.delete('/v1/deliveries/' + draft._id + '/assets/' + assetId);
      await refresh();
    });
  }

  function movePhoto(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const next = photoOrder.slice();
    const fromIndex = next.indexOf(fromId);
    const toIndex = next.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return;
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, fromId);
    setPhotoOrder(next);
    setPhotoPage(Math.floor(toIndex / PHOTO_PAGE_SIZE));
  }

  function moveBy(assetId, amount) {
    const index = photoOrder.indexOf(assetId);
    const nextIndex = Math.max(0, Math.min(photoOrder.length - 1, index + amount));
    if (nextIndex === index) return;
    movePhoto(assetId, photoOrder[nextIndex]);
  }

  async function saveOrder() {
    if (!orderedAssets.length) {
      setError('Add at least one finished photograph first.');
      return;
    }
    await action('order', async () => {
      const { data } = await api.patch('/v1/deliveries/' + draft._id + '/v3/photoswap', { assetOrder: photoOrder });
      setDraft(current => mergeDeliveryDraft(current, data.data));
      const hasCaptions = orderedAssets.every(asset => String(captions[asset.assetId] ?? asset.caption ?? '').trim().length >= 5);
      if (hasCaptions) {
        setStage('captions');
        return;
      }
      const prepared = await api.post('/v1/deliveries/' + draft._id + '/v3/prepare');
      setCaptionJob(prepared.data.data);
      setCaptionPreparing(true);
      setStage('captions');
    });
  }

  async function retryCaptions() {
    await action('prepare-captions', async () => {
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/v3/prepare');
      setCaptionJob(data.data);
      setCaptionPreparing(true);
    });
  }

  async function regenerateCaption(assetId) {
    const current = String(captions[assetId] || '').slice(0, 180);
    await action('caption-' + assetId, async () => {
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/v3/captions/' + assetId + '/regenerate', {
        instruction: String(captionInstructions[assetId] || '').trim(),
        previous: { headline: 'Photo caption', caption: current }
      });
      setCaptions(value => ({ ...value, [assetId]: data.data.caption }));
    });
  }

  async function saveCaptions() {
    const values = orderedAssets.map(asset => ({ assetId: asset.assetId, caption: String(captions[asset.assetId] || '').trim() }));
    if (values.some(item => item.caption.length < 5 || item.caption.length > 180)) {
      setError('Add a caption of 5 to 180 characters for every photograph.');
      return;
    }
    await action('save-captions', async () => {
      const { data } = await api.patch('/v1/deliveries/' + draft._id + '/v3/photoswap', { captions: values, assetOrder: photoOrder });
      setDraft(current => mergeDeliveryDraft(current, data.data));
      setStage('style');
    });
  }

  async function saveStyle() {
    if (!orderedAssets.length) {
      setError('Add at least one finished photograph first.');
      return;
    }
    await action('style', async () => {
      const { data } = await api.patch('/v1/deliveries/' + draft._id + '/v3/photoswap', {
        backgroundMode,
        typography,
        assetOrder: photoOrder
      });
      setDraft(current => mergeDeliveryDraft(current, data.data));
      setStage('access');
    });
  }

  async function approve() {
    if (pin && pin.length !== 6) {
      setError('A PIN needs six digits. Finish entering it or clear the field.');
      return;
    }
    if (access.expiresAt && new Date(access.expiresAt) <= new Date()) {
      setError('Choose a future expiry date, or clear the field for a link that does not expire.');
      return;
    }
    await action('approve', async () => {
      const body = { ...access, expiresAt: access.expiresAt ? new Date(access.expiresAt).toISOString() : '' };
      if (pin) body.pin = pin;
      else if (removePin) body.pin = '';
      await api.patch('/v1/deliveries/' + draft._id + '/v3/access', body);
      await api.post('/v1/deliveries/' + draft._id + '/v3/approve');
      await refresh();
      setPin('');
      setRemovePin(false);
      setStage('publish');
    });
  }

  async function publish() {
    await action('publish', async () => {
      const { data: status } = await api.get('/v1/billing/status');
      setEntitlements(status.data);
      if (!status.data) throw new Error('We could not check your plan. Try publishing again.');
      if (reachedQuota(status.data)) {
        setError(quotaMessage(status.data));
        return;
      }
      const { data } = await api.post('/v1/deliveries/' + draft._id + '/v3/publish');
      setPublished(data.data);
      setStage('published');
    });
  }

  async function copyLink() {
    const value = published?.url || window.location.origin + '/d/' + published?.publicId;
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Private link copied.');
    } catch {
      setError('The link could not be copied. Select and copy it below.');
    }
  }

  function showPreview(event) {
    previewTrigger.current = event.currentTarget;
    setShowDesktopPreview(true);
  }

  const getPageAssetIndex = assetId => orderedAssets.findIndex(asset => asset.assetId === assetId);
  const pageTitle = {
    details: 'Give this set a name.',
    photos: 'Choose the order.',
    captions: 'Put words to the photos.',
    style: 'Set the mood.',
    access: 'Choose how clients open it.',
    publish: 'Review before you send it.'
  }[stage] || '';

  if (stage === 'published') {
    const publishedUrl = published?.url || window.location.origin + '/d/' + (published?.publicId || draft?.publicId || '');
    return (
      <main className="ps-create-shell">
        <div className="ps-create-top"><Link to="/dashboard" className="ps-create-brand">veylo<span>.</span></Link><span>PHOTO SWAP</span></div>
        <section className="ps-published">
          <div className="ps-published-check"><BadgeCheck size={28} /></div>
          <p className="ps-create-kicker">DELIVERY PUBLISHED</p>
          <h1>Your Photo Swap is ready.</h1>
          <p className="ps-published-copy">Send the private link to {clientName || 'your client'} on WhatsApp or wherever you usually share finished work.</p>
          <label className="ps-published-link">PRIVATE LINK<input readOnly value={publishedUrl} onFocus={event => event.target.select()} /></label>
          <div className="ps-published-actions">
            <button type="button" className="ps-create-primary" onClick={() => void copyLink()}><Copy size={16} /> Copy private link</button>
            <a href={publishedUrl} target="_blank" rel="noreferrer"><Eye size={16} /> Open client view</a>
            <Link to="/dashboard">Back to dashboard <ArrowRight size={16} /></Link>
          </div>
          <p className="ps-published-note"><MessageCircle size={16} /> The client can swipe through every photo in the order you chose.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ps-create-shell">
      <div className="ps-create-top">
        <Link to="/dashboard" className="ps-create-brand" aria-label="Back to dashboard">veylo<span>.</span></Link>
        <div className="ps-create-top-meta">
          <span>NEW DELIVERY</span>
          <i />
          <strong>PHOTO SWAP</strong>
        </div>
        {['style', 'access', 'publish'].includes(stage) && (
          <button type="button" className="ps-top-preview" onClick={showPreview}><Eye size={15} /> Preview</button>
        )}
      </div>

      <div className="ps-create-wrap">
        <header className="ps-create-intro">
          <div>
            <p className="ps-create-kicker">PHOTO SWAP <span>·</span> {String(currentStep + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}</p>
            <h1>{pageTitle}</h1>
          </div>
          <p className="ps-create-subtitle">A full-screen photo stack your client can swipe through at their own pace.</p>
        </header>

        <nav className="ps-step-nav" aria-label="Photo Swap setup">
          {STEPS.map((item, index) => {
            const done = index < currentStep;
            return (
              <button
                type="button"
                key={item.id}
                className={(index === currentStep ? 'is-current ' : '') + (done ? 'is-done' : '')}
                onClick={() => { if (done && !busy && !captionPreparing) setStage(item.id); }}
                disabled={captionPreparing || (!done && index !== currentStep)}
                aria-current={index === currentStep ? 'step' : undefined}
              >
                <span>{done ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</span>
                <strong>{item.label}</strong>
              </button>
            );
          })}
        </nav>

        {quotaReached && !draft && (
          <div className="ps-quota-note"><Clock3 size={17} /><span>{quotaMessage(entitlements)}</span><Link to="/billing">View Pro</Link></div>
        )}

        {!!error && (
          <div className="ps-create-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={17} /></button>
          </div>
        )}

        <div className="ps-create-layout">
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={stage}
              className="ps-step-panel"
              initial={veyloMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              aria-labelledby="ps-step-title"
            >
              {stage === 'details' && (
                <form className="ps-step-card" onSubmit={continueDetails}>
                  <SectionHeading number="01" title="Start with the shoot." >
                    Add enough detail for your client to recognise the delivery.
                  </SectionHeading>
                  <div className="ps-fields">
                    <label>Client name
                      <input value={clientName} onChange={event => setClientName(event.target.value)} autoComplete="name" maxLength={100} placeholder="e.g. Lora Ade" />
                    </label>
                    <label>Delivery title
                      <input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="e.g. Lora’s 25th birthday" />
                    </label>
                    <label>Type of shoot
                      <select value={shootType} onChange={event => setShootType(event.target.value)}>
                        <option value="">Choose a shoot type</option>
                        {SHOOT_TYPES.map(value => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                    {shootType === 'Other' && <label>What type of shoot?
                      <input value={customShoot} onChange={event => setCustomShoot(event.target.value)} maxLength={80} placeholder="e.g. naming ceremony" />
                    </label>}
                    <label>Purpose of the shoot
                      <textarea value={purpose} onChange={event => setPurpose(event.target.value)} maxLength={3000} rows={4} placeholder="These photos were taken for Sharon’s studio portrait session…" />
                      <small>{purpose.length} / 3,000. This helps write captions; it is not shown to your client.</small>
                    </label>
                  </div>
                  <div className="ps-step-note"><Layers3 size={18} /><p>Every finished photo stays in the delivery. You choose the order your client swipes through.</p></div>
                  <div className="ps-step-actions">
                    <Link to="/create" className="ps-back-link"><ArrowLeft size={16} /> Choose a delivery type</Link>
                    <button type="submit" className="ps-create-primary" disabled={busy === 'details' || billingLoading || (!draft && quotaReached)}>
                      {busy === 'details' ? <LoaderCircle className="ps-spin" size={17} /> : null}
                      Continue to photos <ArrowRight size={17} />
                    </button>
                  </div>
                </form>
              )}

              {stage === 'photos' && (
                <div className="ps-step-card ps-photo-step">
                  <SectionHeading number="02" title="Set the viewing order.">
                    The first photo opens the delivery. Your client swipes through the rest in this order.
                  </SectionHeading>
                  <div className="ps-upload-bar">
                    <div><strong>{orderedAssets.length}<i> / </i>{maxPhotos}</strong><span>{entitlements?.planName || (maxPhotos > 100 ? 'Pro' : 'Free')} photo limit · JPEG, PNG, WebP · 20 MB max each</span></div>
                    <label className="ps-upload-button">
                      <Upload size={17} /> Add photos
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!!busy} onChange={event => { void uploadFiles(event.target.files); event.target.value = ''; }} />
                    </label>
                  </div>
                  {busy === 'upload' && (
                    <div className="ps-upload-progress" role="status">
                      <span style={{ transform: `scaleX(${uploadPercent / 100})` }} />
                      <strong>Uploading photos · {uploadPercent}%</strong>
                    </div>
                  )}
                  {busy === 'upload' && <UploadConnectionStatus batch={uploadBatch} />}
                  {failedFiles.length > 0 && (
                    <div className="ps-retry-row">
                      <p>{failedFiles.length} photo{failedFiles.length === 1 ? '' : 's'} still need uploading.</p>
                      <button type="button" onClick={() => void uploadFiles(failedFiles)} disabled={!!busy}><RefreshCw size={15} /> Retry upload</button>
                    </div>
                  )}
                  {orderedAssets.length ? (
                    <>
                      <div className="ps-photo-grid">
                        {visibleAssets.map((asset, localIndex) => {
                          const index = getPageAssetIndex(asset.assetId);
                          return (
                            <article
                              key={asset.assetId}
                              className={draggedPhotoId === asset.assetId ? 'ps-photo-tile is-dragging' : 'ps-photo-tile'}
                              draggable={!busy}
                              onDragStart={() => setDraggedPhotoId(asset.assetId)}
                              onDragOver={event => event.preventDefault()}
                              onDrop={event => { event.preventDefault(); movePhoto(draggedPhotoId, asset.assetId); setDraggedPhotoId(''); }}
                              onDragEnd={() => setDraggedPhotoId('')}
                            >
                              <div className="ps-photo-thumb">
                                <img src={mediaUrl(asset.thumbnailUrl || asset.url)} alt={asset.originalFilename || 'Uploaded finished photograph'} loading={localIndex < 8 ? 'eager' : 'lazy'} decoding="async" />
                                <span className="ps-photo-index">{String(index + 1).padStart(2, '0')}</span>
                                <span className="ps-photo-grip" aria-hidden="true"><GripVertical size={16} /></span>
                              </div>
                              <div className="ps-photo-tile-actions">
                                <button type="button" onClick={() => moveBy(asset.assetId, -1)} disabled={index === 0 || !!busy} aria-label={'Move photo ' + (index + 1) + ' earlier'} title="Move earlier"><MoveUp size={15} /></button>
                                <button type="button" onClick={() => moveBy(asset.assetId, 1)} disabled={index === orderedAssets.length - 1 || !!busy} aria-label={'Move photo ' + (index + 1) + ' later'} title="Move later"><MoveDown size={15} /></button>
                                <button type="button" onClick={() => void deletePhoto(asset.assetId)} disabled={!!busy} aria-label={'Remove photo ' + (index + 1)} title="Remove photo"><Trash2 size={15} /></button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                      {currentPhotosPageCount > 1 && (
                        <div className="ps-photo-pagination">
                          <button type="button" onClick={() => setPhotoPage(Math.max(0, safePhotoPage - 1))} disabled={safePhotoPage === 0}><ChevronLeft size={16} /> Previous</button>
                          <span>Showing {safePhotoPage * PHOTO_PAGE_SIZE + 1}–{Math.min((safePhotoPage + 1) * PHOTO_PAGE_SIZE, orderedAssets.length)} of {orderedAssets.length}</span>
                          <button type="button" onClick={() => setPhotoPage(Math.min(currentPhotosPageCount - 1, safePhotoPage + 1))} disabled={safePhotoPage >= currentPhotosPageCount - 1}>Next <ChevronRight size={16} /></button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="ps-photo-empty"><Image size={27} /><strong>Start with the finished photos.</strong><span>Upload the final set you want your client to swipe through.</span></div>
                  )}
                  <div className="ps-step-actions">
                    <button type="button" className="ps-back-link" onClick={() => setStage('details')}><ArrowLeft size={16} /> Back to details</button>
                    <button type="button" className="ps-create-primary" onClick={() => void saveOrder()} disabled={!orderedAssets.length || !!busy}>
                      {busy === 'order' ? <LoaderCircle className="ps-spin" size={17} /> : null}
                      Save order and write captions <ArrowRight size={17} />
                    </button>
                  </div>
                </div>
              )}

              {stage === 'captions' && (
                <div className="ps-step-card ps-caption-step">
                  <SectionHeading number="03" title="Review the captions.">
                    Veylo uses the shoot details and each photograph to draft a short caption. Edit any line before the client sees it.
                  </SectionHeading>
                  {captionPreparing ? (
                    <div className="ps-caption-progress" role="status" aria-live="polite">
                      <span className="ps-caption-progress-icon"><Type size={21} /></span>
                      <div><strong>{captionJob?.stage === 'writing-captions' ? 'Writing a caption for each photo' : 'Reviewing your photographs'}</strong><p>We’re using the same photo analysis and writing rules as Showcase.</p></div>
                      <span className="ps-caption-progress-value">{captionJob?.progress || 0}%</span>
                      <div className="ps-caption-progress-track"><i style={{ transform: 'scaleX(' + (captionJob?.progress || 0) / 100 + ')' }} /></div>
                    </div>
                  ) : (
                    <>
                      {captionJob?.status === 'failed' && <div className="ps-caption-failed" role="status"><strong>We couldn’t finish the captions.</strong><span>Your photos and order are saved. You can try again or write the captions yourself.</span><button type="button" onClick={() => void retryCaptions()} disabled={!!busy}><RefreshCw size={15} /> Try again</button></div>}
                      <div className="ps-caption-list">
                        {visibleAssets.map(asset => {
                          const index = getPageAssetIndex(asset.assetId);
                          const caption = captions[asset.assetId] ?? asset.caption ?? '';
                          const regenerating = busy === 'caption-' + asset.assetId;
                          return (
                            <article className="ps-caption-row" key={asset.assetId}>
                              <div className="ps-caption-photo">
                                <img src={mediaUrl(asset.thumbnailUrl || asset.url)} alt={asset.originalFilename || 'Finished photograph'} loading={index < 8 ? 'eager' : 'lazy'} decoding="async" />
                                <span>{String(index + 1).padStart(2, '0')}</span>
                              </div>
                              <div className="ps-caption-fields">
                                <label htmlFor={'ps-caption-' + asset.assetId}>Caption for photo {index + 1}</label>
                                <textarea id={'ps-caption-' + asset.assetId} value={caption} onChange={event => setCaptions(current => ({ ...current, [asset.assetId]: event.target.value.slice(0, 180) }))} maxLength={180} rows={3} placeholder="Add a short caption for this photograph." />
                                <div className="ps-caption-tools">
                                  <input value={captionInstructions[asset.assetId] || ''} onChange={event => setCaptionInstructions(current => ({ ...current, [asset.assetId]: event.target.value.slice(0, 400) }))} maxLength={400} placeholder="Optional: ask for a different emphasis" aria-label={'Caption rewrite instruction for photo ' + (index + 1)} />
                                  <span>{caption.length} / 180</span>
                                  <button type="button" onClick={() => void regenerateCaption(asset.assetId)} disabled={!!busy || captionJob?.status === 'failed'}>
                                    {regenerating ? <LoaderCircle className="ps-spin" size={15} /> : <RefreshCw size={15} />}
                                    {regenerating ? 'Rewriting' : 'Rewrite'}
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {!captionPreparing && currentPhotosPageCount > 1 && (
                    <div className="ps-caption-pagination">
                      <button type="button" onClick={() => setPhotoPage(Math.max(0, safePhotoPage - 1))} disabled={safePhotoPage === 0}><ChevronLeft size={16} /> Previous photos</button>
                      <span>Showing {safePhotoPage * PHOTO_PAGE_SIZE + 1}–{Math.min((safePhotoPage + 1) * PHOTO_PAGE_SIZE, orderedAssets.length)} of {orderedAssets.length}</span>
                      <button type="button" onClick={() => setPhotoPage(Math.min(currentPhotosPageCount - 1, safePhotoPage + 1))} disabled={safePhotoPage >= currentPhotosPageCount - 1}>More photos <ChevronRight size={16} /></button>
                    </div>
                  )}
                  <div className="ps-step-actions">
                    <button type="button" className="ps-back-link" onClick={() => setStage('photos')} disabled={captionPreparing}><ArrowLeft size={16} /> Back to photos</button>
                    <button type="button" className="ps-create-primary" onClick={() => void saveCaptions()} disabled={captionPreparing || !orderedAssets.length || !!busy}>
                      {busy === 'save-captions' ? <LoaderCircle className="ps-spin" size={17} /> : null}
                      Save captions <ArrowRight size={17} />
                    </button>
                  </div>
                </div>
              )}

              {stage === 'style' && (
                <div className="ps-step-card ps-style-step">
                  <SectionHeading number="04" title="Choose how the stack feels.">
                    Keep the controls quiet and let the photographs carry the experience.
                  </SectionHeading>
                  <section className="ps-form-section">
                    <div className="ps-form-section-heading"><strong>BACKGROUND</strong><span>Behind the photo stack</span></div>
                    <div className="ps-background-options">
                      <button type="button" className={backgroundMode === 'auto' ? 'is-selected' : ''} onClick={() => setBackgroundMode('auto')} aria-pressed={backgroundMode === 'auto'}>
                        <span className="ps-background-swatch is-glow"><i /><b /></span><strong>Photo colour</strong><small>A soft glow follows each photo.</small>
                      </button>
                      <button type="button" className={backgroundMode === 'dark' ? 'is-selected' : ''} onClick={() => setBackgroundMode('dark')} aria-pressed={backgroundMode === 'dark'}>
                        <span className="ps-background-swatch is-dark"><i /><b /></span><strong>Solid dark</strong><small>A steady, clean backdrop.</small>
                      </button>
                    </div>
                  </section>
                  <section className="ps-form-section">
                    <div className="ps-form-section-heading"><strong>TYPE</strong><span>Used for the captions and finishing screen</span></div>
                    <div className="ps-font-selects">
                      <label>Display
                        <select value={typography.display} onChange={event => setTypography(current => ({ ...current, display: event.target.value }))}>
                          {FONTS.map(font => <option key={font} value={font}>{font}</option>)}
                        </select>
                      </label>
                      <label>Body
                        <select value={typography.body} onChange={event => setTypography(current => ({ ...current, body: event.target.value }))}>
                          {FONTS.map(font => <option key={font} value={font}>{font}</option>)}
                        </select>
                      </label>
                    </div>
                  </section>
                  <section className="ps-form-section ps-music-section">
                    <div className="ps-form-section-heading">
                      <div><strong>SOUNDTRACK <i>OPTIONAL</i></strong><span>It starts automatically when the client opens the set, where their browser allows it.</span></div>
                      {draft?.soundtrack && <button type="button" className="ps-text-button" onClick={() => void clearSoundtrack()} disabled={busy === 'soundtrack'}>Remove track</button>}
                    </div>
                    {draft?.soundtrack && (
                      <div className="ps-selected-track"><Music2 size={17} /><span><small>SELECTED</small><strong>{draft.soundtrack.title}</strong></span><Check size={16} /></div>
                    )}
                    <div className="ps-music-tabs" role="tablist" aria-label="Choose a soundtrack source">
                      <button type="button" role="tab" aria-selected={musicTab === 'library'} className={musicTab === 'library' ? 'is-active' : ''} onClick={() => setMusicTab('library')}>Music library</button>
                      <button type="button" role="tab" aria-selected={musicTab === 'own'} className={musicTab === 'own' ? 'is-active' : ''} onClick={() => setMusicTab('own')}>Upload a track</button>
                    </div>
                    {musicTab === 'library' ? (
                      <>
                        <label className="ps-music-search">Search the library<input value={musicSearch} onChange={event => setMusicSearch(event.target.value)} placeholder="Title, mood, genre or artist" /></label>
                        <div className="ps-music-categories" aria-label="Filter music">
                          {musicCategories.slice(0, 7).map(category => (
                            <button type="button" key={category} onClick={() => setMusicCategory(category)} aria-pressed={musicCategory === category}>
                              {category === 'all' ? 'All music' : category.split(/[\s-]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                            </button>
                          ))}
                        </div>
                        <div className="ps-track-list">
                          {soundtracks === null ? <p className="ps-music-empty">Loading soundtrack choices…</p>
                            : filteredSoundtracks.length ? filteredSoundtracks.map(track => {
                              const selected = draft?.soundtrack?.catalogId === track.id;
                              const playing = previewingTrackId === track.id;
                              return (
                                <article key={track.id} className={selected ? 'is-selected' : ''}>
                                  <button type="button" className="ps-track-play" onClick={() => void previewSoundtrack(track)} aria-label={(playing ? 'Stop preview: ' : 'Preview ') + track.title}>
                                    {playing ? <Pause size={14} /> : <Play size={14} />}
                                  </button>
                                  <span className="ps-track-copy"><strong>{track.title}</strong><small>{[track.creator, track.mood, track.genre, track.durationSec ? Math.round(track.durationSec / 60) + ' min' : ''].filter(Boolean).join(' · ')}</small></span>
                                  <button type="button" className="ps-track-select" onClick={() => void chooseSoundtrack(track.id)} disabled={selected || busy === 'soundtrack'}>
                                    {selected ? <><Check size={14} /> Selected</> : 'Use track'}
                                  </button>
                                </article>
                              );
                            }) : <p className="ps-music-empty">{soundtracks?.length ? 'No tracks match. Try another search.' : 'Music choices are unavailable. You can upload a track instead.'}</p>}
                        </div>
                      </>
                    ) : (
                      <div className="ps-upload-track">
                        <Music2 size={21} />
                        <div><strong>Use music you have permission to share.</strong><span>MP3, WAV, M4A, OGG or AAC.</span></div>
                        <label className="ps-upload-button">
                          {busy === 'soundtrack' ? 'Uploading…' : 'Choose audio'}
                          <input type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/aac" disabled={!!busy} onChange={event => { void customSoundtrack(event.target.files?.[0]); event.target.value = ''; }} />
                        </label>
                      </div>
                    )}
                    <audio ref={soundtrackPreviewRef} className="ps-sr-only" preload="none" onEnded={() => setPreviewingTrackId('')} onError={() => { if (previewingTrackId) { setError('This music preview could not load. Check your connection and try again.'); setPreviewingTrackId(''); } }} />
                  </section>
                  <div className="ps-step-actions">
                    <button type="button" className="ps-back-link" onClick={() => setStage('photos')}><ArrowLeft size={16} /> Back to photos</button>
                    <button type="button" className="ps-create-primary" onClick={() => void saveStyle()} disabled={!!busy || !orderedAssets.length}>
                      {busy === 'style' ? <LoaderCircle className="ps-spin" size={17} /> : null}
                      Save style <ArrowRight size={17} />
                    </button>
                  </div>
                </div>
              )}

              {stage === 'access' && (
                <div className="ps-step-card">
                  <SectionHeading number="05" title="Set up the private link.">
                    Choose who can open the delivery and what they can download.
                  </SectionHeading>
                  <div className="ps-access-panel">
                    <label className="ps-field-label">Six-digit PIN <span>OPTIONAL</span>
                      <input inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={event => { const value = event.target.value.replace(/\D/g, '').slice(0, 6); setPin(value); if (value) setRemovePin(false); }} placeholder={draft?.hasPin ? 'PIN already set · enter a new one to change' : 'Leave blank for no PIN'} />
                    </label>
                    {draft?.hasPin && <Toggle checked={removePin} onChange={value => { setRemovePin(value); if (value) setPin(''); }}>Remove the current PIN</Toggle>}
                    <label className="ps-field-label">Link expiry <span>OPTIONAL</span>
                      <input type="datetime-local" value={access.expiresAt} onChange={event => setAccess(current => ({ ...current, expiresAt: event.target.value }))} />
                    </label>
                    <div className="ps-download-settings">
                      <p>PHOTO ACTIONS</p>
                      <Toggle checked={access.allowIndividualDownloads} onChange={value => setAccess(current => ({ ...current, allowIndividualDownloads: value }))}>Allow individual photo downloads</Toggle>
                      <Toggle checked={access.allowLikes} onChange={value => setAccess(current => ({ ...current, allowLikes: value }))}>Allow clients to like photos</Toggle>
                    </div>
                    <div className="ps-access-note"><LockKeyhole size={17} /><span>The PIN and expiry apply to the private link. Your original files stay unchanged.</span></div>
                  </div>
                  <div className="ps-step-actions">
                    <button type="button" className="ps-back-link" onClick={() => setStage('style')}><ArrowLeft size={16} /> Back to style</button>
                    <button type="button" className="ps-create-primary" onClick={() => void approve()} disabled={!!busy}>
                      {busy === 'approve' ? <LoaderCircle className="ps-spin" size={17} /> : <Check size={17} />}
                      Approve preview <ArrowRight size={17} />
                    </button>
                  </div>
                </div>
              )}

              {stage === 'publish' && (
                <div className="ps-step-card">
                  <SectionHeading number="06" title="Ready when you are.">
                    Check the details, then publish the private link for your client.
                  </SectionHeading>
                  <div className="ps-publish-details">
                    <div><span>DELIVERY</span><strong>{title || (clientName || 'Client') + '\'s photos'}</strong></div>
                    <div><span>PHOTOGRAPHS</span><strong>{orderedAssets.length} finished photos</strong></div>
                    <div><span>BACKGROUND</span><strong>{backgroundMode === 'auto' ? 'Photo colour' : 'Solid dark'}</strong></div>
                    <div><span>SOUNDTRACK</span><strong>{draft?.soundtrack?.title || 'No soundtrack'}</strong></div>
                    <div><span>LINK</span><strong>{access.expiresAt ? 'Expires ' + new Date(access.expiresAt).toLocaleString() : 'No expiry'}</strong></div>
                  </div>
                  <div className="ps-publish-note"><Eye size={17} /><span>The preview beside this panel uses the same swipe experience your client will see.</span></div>
                  <div className="ps-step-actions">
                    <button type="button" className="ps-back-link" onClick={() => setStage('access')}><ArrowLeft size={16} /> Back to access</button>
                    <button type="button" className="ps-create-primary" onClick={() => void publish()} disabled={!!busy || billingLoading || quotaReached}>
                      {busy === 'publish' ? <LoaderCircle className="ps-spin" size={17} /> : <Check size={17} />}
                      Publish Photo Swap
                    </button>
                  </div>
                </div>
              )}
            </motion.section>
          </AnimatePresence>

          <aside className="ps-preview-column">
            <div className="ps-preview-heading">
              <span>CLIENT PREVIEW</span>
              <button type="button" onClick={showPreview} ref={previewTrigger}><Eye size={14} /> Open larger</button>
            </div>
            <ClientPreviewPhoneFrame delivery={previewDelivery} access={access} accessPin="" />
            <p className="ps-preview-caption">The client opens on your first photo, then swipes through your photos and captions in order.</p>
          </aside>
        </div>
      </div>

      {showDesktopPreview && (
        <div ref={previewDialog} className="ps-preview-modal" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Photo Swap client preview">
          <div className="ps-preview-modal-bar"><span>CLIENT VIEW <i>·</i> PHOTO SWAP</span><button type="button" onClick={() => setShowDesktopPreview(false)}><X size={17} /> Close preview</button></div>
          <div className="ps-preview-modal-body"><ClientPreviewPhoneFrame delivery={previewDelivery} access={access} accessPin="" /></div>
        </div>
      )}
    </main>
  );
}
