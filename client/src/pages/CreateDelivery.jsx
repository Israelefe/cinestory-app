import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Clapperboard, ExternalLink, Image, LayoutTemplate, ListChecks, LoaderCircle, LockKeyhole, Mail, Music2, Pause, Play, QrCode, RefreshCw, Search, Share2, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { API_BASE_URL, APP_URL } from '../config/env.js';
import { uploadDeliveryPhotos, uploadDeliverySoundtrack } from '../utils/deliveryUpload.js';
import { SHOOT_TYPES } from '../constants/shootTypes.js';
import { FORMAT_REGISTRY, formatName } from '../constants/formatRegistry.jsx';
import { DEFAULT_NARRATION_VOICE_ID } from '../constants/narrationVoices.js';
import { trackEvent } from '../services/analytics.js';
import DeliveryDirectionStudio from '../components/delivery/DeliveryDirectionStudio.jsx';
import ClientDeliveryPreview from '../components/delivery/ClientDeliveryPreview.jsx';
import './CreateDelivery.css';
import './CreateDeliveryNarration.css';
import './CreateDeliveryMusicV2.css';

const formats = FORMAT_REGISTRY.map(format => ({ ...format, copy: format.line }));
const NARRATION_RENDER_VERSION = 'flux-hannah-biography-v2';

const steps = ['Tell us about the shoot', 'Add finished photos', 'Choose the format', 'Review every detail', 'Publish and share'];

function Stage({ children }) {
  const reduced = useReducedMotion();
  return <motion.section className="v-create-stage" initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? {} : { opacity: 0, y: -10 }} transition={{ duration: reduced ? 0 : .42, ease: [.22, 1, .36, 1] }}>{children}</motion.section>;
}

function StageHead({ eyebrow, title, copy }) {
  return <header className="v-create-stage-head"><p>{eyebrow}</p><h1>{title}</h1><span>{copy}</span></header>;
}

function DeliveryProgress({ type, value, stage, clientName, shootType }) {
  const milestoneSteps = [
    { label: 'Photographs checked', min: 0, max: 40 },
    { label: 'Shoot details understood', min: 40, max: 70 },
    { label: 'Presentation prepared', min: 70, max: 100 }
  ];

  const title =
    type === 'analyze' ? 'Preparing the delivery' :
    type === 'direct' ? 'Building the presentation' :
    type === 'revise' ? 'Applying your edits' :
    'Preparing the private link';

  const clampedVal = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

  return (
    <div className="v-delivery-progress-overlay" role="status" aria-live="polite">
      <div className="v-delivery-progress-card">
        <div className="v-delivery-progress-header">
          <div className="v-delivery-progress-icon">
            <Clapperboard size={22} />
          </div>
          <div>
            <small>PREPARING YOUR DELIVERY</small>
            <h3>{title}</h3>
            <p>{clientName ? `${clientName} · ` : ''}{shootType || 'Finished photographs'}</p>
          </div>
          <div className="v-delivery-progress-badge">
            <strong>{clampedVal}%</strong>
          </div>
        </div>

        <div className="v-delivery-progress-track">
          <b style={{ transform: `scaleX(${clampedVal / 100})` }} />
        </div>

        <div className="v-delivery-progress-status">
          <LoaderCircle className="v-spin" size={16} aria-hidden="true" />
          <span>{stage || 'Preparing the files without changing the originals.'}</span>
        </div>

        <div className="v-delivery-progress-milestones">
          {milestoneSteps.map((s, idx) => {
            const isDone = clampedVal >= s.max;
            const isCurrent = clampedVal >= s.min && clampedVal < s.max;
            return (
              <div key={idx} className={`v-milestone ${isDone ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`}>
                <span className="v-milestone-check">
                  {isDone ? <Check size={13} /> : <i>{idx + 1}</i>}
                </span>
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>

        <div className="v-delivery-progress-footer">
          <small>Your original retouching and colour grade stay untouched. Veylo only prepares the presentation around your photographs.</small>
        </div>
      </div>
    </div>
  );
}

function Progress({ value, label }) {
  return <div className="v-create-progress" role="status"><div><LoaderCircle className="v-spin" size={17} /><span>{label}</span><strong>{value}%</strong></div><i><b style={{ transform: `scaleX(${Math.max(0, Math.min(100, value)) / 100})` }} /></i></div>;
}

function Toggle({ icon: Icon, label, copy, checked, onChange, children }) {
  return <article className="v-publish-toggle"><Icon size={20} /><div><strong>{label}</strong><small>{copy}</small>{children}</div><button type="button" className={checked ? 'is-on' : ''} onClick={() => onChange(!checked)} aria-pressed={checked} aria-label={`${checked ? 'Turn off' : 'Turn on'} ${label}`}><i /></button></article>;
}

function CurrentSoundtrackPlayer({ soundtrack }) {
  const audioRef = useRef(null);
  const [state, setState] = useState('');
  const source = typeof soundtrack?.url === 'string' && soundtrack.url.startsWith('/api/')
    ? `${API_BASE_URL.replace(/\/$/, '')}${soundtrack.url.slice(4)}`
    : soundtrack?.url || '';

  useEffect(() => {
    audioRef.current?.pause();
    setState('');
  }, [source]);

  if (!source) return null;

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state === 'playing' || state === 'loading') {
      audio.pause();
      setState('');
      return;
    }
    setState('loading');
    try {
      await audio.play();
      setState('playing');
    } catch {
      setState('');
      toast.info('The current soundtrack could not play in this preview.');
    }
  };

  return <section className="v-review-soundtrack" aria-label="Current soundtrack">
    <div className="v-review-soundtrack-copy">
      <span className="v-review-soundtrack-icon"><Music2 size={17} /></span>
      <div>
        <small>CURRENT SOUNDTRACK</small>
        <strong>{soundtrack.title || 'Selected soundtrack'}</strong>
        <span>{soundtrack.genre || soundtrack.sourceProvider || 'Attached to this delivery'}{soundtrack.creator ? ` · ${soundtrack.creator}` : ''}</span>
      </div>
    </div>
    <button type="button" className="v-review-soundtrack-button" onClick={toggle} aria-label={state === 'playing' ? 'Pause current soundtrack' : 'Play current soundtrack'} aria-busy={state === 'loading'}>
      {state === 'loading' ? <LoaderCircle className="v-spin" size={16} /> : state === 'playing' ? <Pause size={16} /> : <Play size={16} />}
      <span>{state === 'playing' ? 'Pause' : state === 'loading' ? 'Loading' : 'Play current music'}</span>
    </button>
    <audio ref={audioRef} src={source} preload="auto" loop onWaiting={() => setState('loading')} onStalled={() => setState('loading')} onPlaying={() => setState('playing')} onPause={() => setState('')} onError={() => { setState(''); toast.info('The current soundtrack could not load.'); }} />
  </section>;
}

async function waitForJob(deliveryId, jobId, onUpdate) {
  for (let attempt = 0; attempt < 450; attempt += 1) {
    const response = await api.get(`/v1/deliveries/${deliveryId}/jobs/${jobId}`);
    const job = response.data.data;
    onUpdate(job);
    if (job.status === 'review') return job;
    if (job.status === 'failed') throw Object.assign(new Error(job.errorMessage || 'Veylo could not finish this step.'), { jobId, code: job.errorCode, jobType: job.type });
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('This is taking longer than expected. You can leave this page and return to the draft later.');
}

export default function CreateDelivery({ user }) {
  const reduced = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const inputRef = useRef(null);
  const audioInputRef = useRef(null);
  const returnStepRef = useRef(2);
  const [step, setStep] = useState(1);
  const [delivery, setDelivery] = useState(null);
  const [limits, setLimits] = useState({ photosPerDelivery: user?.plan === 'pro' ? 500 : 100 });
  const [previewBranding, setPreviewBranding] = useState(() => user?.plan === 'pro' || user?.plan === 'studio'
    ? { type: 'studio', name: user?.studio?.name || user?.name || 'Studio', logoUrl: user?.studio?.logoUrl || user?.avatar || '' }
    : { type: 'veylo', name: 'Veylo', logoUrl: '/veylo/veylo-mark.svg' });
  const [brief, setBrief] = useState({ clientName: '', shootType: '', brief: '' });
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState({ value: 0, stage: '' });
  const [error, setError] = useState('');
  const [failedJob, setFailedJob] = useState(null);
  const [reviewPage, setReviewPage] = useState(0);
  const [access, setAccess] = useState({ pinEnabled: false, pin: '', expiresAt: '', allowIndividualDownloads: true, allowDownloadAll: true, allowLikes: true, narration: true, narrationVoiceId: DEFAULT_NARRATION_VOICE_ID });
  const [audioRights, setAudioRights] = useState(false);
  const [audioTitle, setAudioTitle] = useState('');
  const [soundtrackTab, setSoundtrackTab] = useState('curated');
  const [curatedSoundtracks, setCuratedSoundtracks] = useState([]);
  const [soundtrackSearch, setSoundtrackSearch] = useState('');
  const [soundtrackCategory, setSoundtrackCategory] = useState('all');
  const [changingSoundtrack, setChangingSoundtrack] = useState(false);
  const [previewTrackId, setPreviewTrackId] = useState(null);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const previewAudioRef = useRef(null);
  const previewRequestedIdRef = useRef(null);
  const narratorAudioRef = useRef(null);
  const [revisionIds, setRevisionIds] = useState([]);
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [libraryPicker, setLibraryPicker] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [librarySelection, setLibrarySelection] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [draggingPhotos, setDraggingPhotos] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);

  const soundtrackCategories = useMemo(() => ['all', ...new Set(curatedSoundtracks.map(track => track.category))], [curatedSoundtracks]);
  const filteredSoundtracks = useMemo(() => {
    const query = soundtrackSearch.trim().toLowerCase();
    return curatedSoundtracks.filter(track => {
      const inCategory = soundtrackCategory === 'all' || track.category === soundtrackCategory;
      const searchable = `${track.title} ${track.creator} ${track.genre} ${track.mood} ${track.storyFunction || ''} ${(track.tags || []).join(' ')} ${(track.bestFor || []).join(' ')}`.toLowerCase();
      return inCategory && (!query || searchable.includes(query));
    });
  }, [curatedSoundtracks, soundtrackCategory, soundtrackSearch]);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.removeAttribute('src');
        previewAudioRef.current.load();
      }
      if (narratorAudioRef.current) {
        narratorAudioRef.current.pause();
        narratorAudioRef.current.removeAttribute('src');
        narratorAudioRef.current.load();
      }
    };
  }, []);

  const draftId = params.get('draft');
  useEffect(() => {
    api.get('/v1/billing/status').then(response => {
      const data = response.data.data;
      setLimits(data.limits);
      setPreviewBranding(data.features?.branding === 'studio'
        ? { type: 'studio', name: user?.studio?.name || user?.name || 'Studio', logoUrl: user?.studio?.logoUrl || user?.avatar || '' }
        : { type: 'veylo', name: 'Veylo', logoUrl: '/veylo/veylo-mark.svg' });
    }).catch(() => {});
    api.get('/v1/deliveries/soundtracks').then(response => setCuratedSoundtracks(response.data.data || [])).catch(() => setError('We could not open the soundtrack catalogue.'));
  }, [user?.plan, user?.name, user?.avatar, user?.studio?.name, user?.studio?.logoUrl]);
  useEffect(() => {
    if (!draftId) return;
    let active = true;
    setBusy('loading');
    api.get(`/v1/deliveries/${draftId}`).then(response => {
      if (!active) return;
      const current = response.data.data;
      setDelivery(current);
      setBrief({ clientName: current.clientName || '', shootType: current.shootType || '', brief: current.brief || '' });
      if (current.status === 'published') setStep(5);
      else if (current.creativeDirection) setStep(current.reviewApprovedAt ? 5 : 4);
      else if (current.formatRecommendations?.length) setStep(3);
      else if (current.assets?.length) setStep(2);
    }).catch(requestError => setError(apiMessage(requestError, 'We could not open this draft.'))).finally(() => setBusy(''));
    return () => { active = false; };
  }, [draftId]);

  useEffect(() => {
    if (!delivery) return;
    trackEvent('delivery.creation.step.viewed', { step, format: delivery.format }, { format: delivery.format, status: 'viewed' });
    if (step === 4) trackEvent('delivery.review.opened', { format: delivery.format }, { format: delivery.format, status: 'opened' });
  }, [delivery?.format, step]);

  async function refreshDelivery(id = delivery?._id) {
    const response = await api.get(`/v1/deliveries/${id}`);
    setDelivery(response.data.data);
    return response.data.data;
  }

  async function startDraft(event) {
    event.preventDefault();
    setBusy('draft'); setError('');
    try {
      const existingDelivery = delivery;
      const detailsChanged = Boolean(existingDelivery) && (
        existingDelivery.clientName !== brief.clientName
        || existingDelivery.shootType !== brief.shootType
        || existingDelivery.brief !== brief.brief
      );
      const response = delivery
        ? await api.patch(`/v1/deliveries/${delivery._id}/details`, brief)
        : await api.post('/v1/deliveries', brief);
      const nextDelivery = existingDelivery && !detailsChanged
        ? { ...response.data.data, assets: existingDelivery.assets, creativeDirection: existingDelivery.creativeDirection || response.data.data.creativeDirection, narration: existingDelivery.narration }
        : response.data.data;
      setDelivery(nextDelivery);
      setParams({ draft: response.data.data._id }, { replace: true });
      setStep(existingDelivery && !detailsChanged ? Math.max(2, returnStepRef.current) : 2);
      trackEvent('delivery.brief.saved', { hasExistingDelivery: Boolean(existingDelivery), detailsChanged }, { status: 'completed' });
    } catch (requestError) { trackEvent('delivery.brief.saved', {}, { status: 'failed', errorCode: requestError.response?.data?.code || 'BRIEF_SAVE_FAILED' }); setError(apiMessage(requestError, 'We could not start this delivery.')); }
    finally { setBusy(''); }
  }

  async function removePhoto(assetId) {
    if (!window.confirm('Remove this photograph from the delivery?')) return;
    setBusy(`remove-${assetId}`); setError('');
    try {
      await api.delete(`/v1/deliveries/${delivery._id}/assets/${assetId}`);
      await refreshDelivery();
      toast.success('Photograph removed');
    } catch (requestError) { setError(apiMessage(requestError, 'We could not remove that photograph.')); }
    finally { setBusy(''); }
  }

  async function addPhotos(files) {
    const valid = [...files].filter(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 50 * 1024 * 1024);
    const remaining = limits.photosPerDelivery - (delivery?.assets?.length || 0);
    if (!valid.length) return toast.error('Choose JPEG, PNG, or WebP photographs up to 50 MB each.');
    if (valid.length > remaining) return toast.error(`You can add ${remaining} more photograph${remaining === 1 ? '' : 's'} to this delivery.`);
    setUploadQueue(valid.map(file => ({ name: file.name, size: file.size, status: 'starting', progress: 0 })));
    trackEvent('upload.started', { surface: 'delivery', files: valid.length }, { count: valid.length, bytes: valid.reduce((sum, file) => sum + file.size, 0), status: 'started' });
    setBusy('upload'); setError(''); setProgress({ value: 0, stage: `Uploading ${valid.length} finished photograph${valid.length === 1 ? '' : 's'}…` });
    try {
      await uploadDeliveryPhotos(delivery._id, valid, (value, meta) => {
        setProgress(current => ({ ...current, value }));
        if (meta?.index === undefined) return;
        setUploadQueue(current => current.map((item, index) => index === meta.index
          ? { ...item, status: meta.status || item.status, progress: meta.total ? Math.round((meta.loaded / meta.total) * 100) : item.progress }
          : item));
      });
      const current = await refreshDelivery();
      toast.success(`${valid.length} photograph${valid.length === 1 ? '' : 's'} added`);
      setProgress({ value: 100, stage: `${current.assets.length} photographs ready` });
      trackEvent('upload.completed', { surface: 'delivery', files: valid.length }, { count: valid.length, bytes: valid.reduce((sum, file) => sum + file.size, 0), status: 'completed' });
    } catch (requestError) {
      setUploadQueue(current => current.map(item => item.status === 'complete' ? item : { ...item, status: 'failed' }));
      setError(apiMessage(requestError, requestError.message || 'We could not upload those photographs.'));
      trackEvent('upload.failed', { surface: 'delivery', files: valid.length }, { count: valid.length, status: 'failed', errorCode: requestError.response?.data?.code || 'DELIVERY_UPLOAD_FAILED' });
    }
    finally { setBusy(''); if (inputRef.current) inputRef.current.value = ''; }
  }

  async function analyzeShoot() {
    setBusy('analyze'); setError(''); setFailedJob(null); setProgress({ value: 2, stage: 'Preparing the photographs…' });
    try {
      const response = await api.post(`/v1/deliveries/${delivery._id}/analyze`);
      await waitForJob(delivery._id, response.data.data._id, job => setProgress({ value: job.progress, stage: job.stage === 'reading-photographs' ? 'Checking every finished photograph…' : 'Finding the right way to present the set…' }));
      await refreshDelivery(); setStep(3);
      trackEvent('delivery.creation.step.completed', { step: 'analysis' }, { status: 'completed' });
    } catch (requestError) { trackEvent('delivery.creation.step.completed', { step: 'analysis' }, { status: 'failed', errorCode: requestError.response?.data?.code || 'ANALYSIS_FAILED' }); setError(requestError.message || apiMessage(requestError, 'Veylo could not analyze this shoot.')); if (requestError.jobId) setFailedJob({ id: requestError.jobId, type: requestError.jobType }); }
    finally { setBusy(''); }
  }

  async function chooseFormat(format) {
    setBusy('direct'); setError(''); setFailedJob(null); setProgress({ value: 2, stage: `Directing the ${formatName(format)}…` });
    try {
      const response = await api.post(`/v1/deliveries/${delivery._id}/direct`, { format });
      await waitForJob(delivery._id, response.data.data._id, job => setProgress({ value: job.progress, stage: job.stage === 'setting-direction' ? 'Choosing the type, colour, and structure…' : 'Placing every photograph in order…' }));
      await refreshDelivery(); setStep(4);
      trackEvent('delivery.format.selected', { format }, { format, status: 'completed' });
      trackEvent('delivery.creation.step.completed', { step: 'direction', format }, { format, status: 'completed' });
    } catch (requestError) { trackEvent('delivery.creation.step.completed', { step: 'direction', format }, { format, status: 'failed', errorCode: requestError.response?.data?.code || 'DIRECTION_FAILED' }); setError(requestError.message || apiMessage(requestError, 'Veylo could not direct this format.')); if (requestError.jobId) setFailedJob({ id: requestError.jobId, type: requestError.jobType }); }
    finally { setBusy(''); }
  }

  function editDirection(field, value) {
    setDelivery(current => ({ ...current, creativeDirection: { ...current.creativeDirection, [field]: value }, ...(field === 'title' ? { title: value } : {}) }));
  }

  function editDirectionSetting(group, field, value) {
    const eventName = group === 'palette' ? 'delivery.colour.changed' : group === 'typography' ? 'delivery.typography.changed' : group === 'variation' ? 'delivery.layout.changed' : '';
    if (eventName) trackEvent(eventName, { group, field }, { format: delivery?.format, status: 'changed' });
    setDelivery(current => ({
      ...current,
      creativeDirection: field
        ? { ...current.creativeDirection, [group]: { ...(current.creativeDirection?.[group] || {}), [field]: value } }
        : { ...current.creativeDirection, [group]: value }
    }));
  }

  function editSection(sectionId, field, value) {
    trackEvent('delivery.section.changed', { field }, { format: delivery?.format, status: 'changed' });
    if (field === 'layout') trackEvent('delivery.layout.changed', { field }, { format: delivery?.format, status: 'changed' });
    setDelivery(current => ({ ...current, creativeDirection: { ...current.creativeDirection, sections: (current.creativeDirection.sections || []).map(section => section.id === sectionId ? { ...section, [field]: value } : section) } }));
  }

  function editFrame(assetId, field, value) {
    setDelivery(current => ({ ...current, ...(field === 'caption' ? { narration: undefined } : {}), creativeDirection: { ...current.creativeDirection, frames: current.creativeDirection.frames.map(frame => frame.assetId === assetId ? { ...frame, [field]: value } : frame) } }));
  }

  function movePhoto(assetId, offset) {
    setDelivery(current => {
      const assets = [...current.assets].sort((a, b) => a.sortOrder - b.sortOrder);
      const index = assets.findIndex(asset => asset.assetId === assetId);
      const target = index + offset;
      if (target < 0 || target >= assets.length) return current;
      [assets[index], assets[target]] = [assets[target], assets[index]];
      trackEvent('delivery.photo.reordered', { direction: offset < 0 ? 'earlier' : 'later' }, { format: current.format, status: 'changed' });
      return { ...current, narration: undefined, assets: assets.map((asset, sortOrder) => ({ ...asset, sortOrder })) };
    });
  }

  function goBackTo(nextStep) {
    trackEvent('delivery.creation.back', { fromStep: step, toStep: nextStep }, { format: delivery?.format, status: 'back' });
    setStep(nextStep);
  }

  async function saveReview() {
    setBusy('save'); setError('');
    try {
      const ordered = [...delivery.assets].sort((a, b) => a.sortOrder - b.sortOrder);
      const missingCaption = delivery.creativeDirection.frames.find(frame => String(frame.caption || '').trim().length < 18);
      if (missingCaption) throw new Error('Every photograph needs a meaningful caption before you approve this delivery.');
    const response = await api.patch(`/v1/deliveries/${delivery._id}/review`, { title: delivery.creativeDirection.title, openingLine: delivery.creativeDirection.openingLine, closingLine: delivery.creativeDirection.closingLine, palette: delivery.creativeDirection.palette, typography: delivery.creativeDirection.typography, pace: delivery.creativeDirection.pace, variation: delivery.creativeDirection.variation, sections: (delivery.creativeDirection.sections || []).map(({ id, title, subtitle, label, delivery: deliveryLabel, layout }) => ({ id, title, subtitle: subtitle || '', label: label || '', delivery: deliveryLabel || '', layout })), frames: delivery.creativeDirection.frames.map(({ assetId, headline, caption, eventType }) => ({ assetId, headline: headline || '', caption: caption.trim(), eventType: eventType || '' })), assetOrder: ordered.map(asset => asset.assetId) });
      setDelivery(response.data.data); setStep(5); toast.success('Delivery review saved');
      trackEvent('delivery.caption.edited', { count: delivery.creativeDirection.frames.length }, { format: delivery.format, status: 'saved', count: delivery.creativeDirection.frames.length });
      trackEvent('delivery.review.approved', { format: delivery.format }, { format: delivery.format, status: 'completed' });
    } catch (requestError) { trackEvent('delivery.review.approved', { format: delivery?.format }, { format: delivery?.format, status: 'failed', errorCode: requestError.response?.data?.code || 'REVIEW_SAVE_FAILED' }); setError(apiMessage(requestError, 'We could not save these edits.')); }
    finally { setBusy(''); }
  }

  async function publish() {
    if (access.pinEnabled && !/^\d{6}$/.test(access.pin)) return setError('Enter a six-digit PIN or turn the PIN off.');
    setBusy('publish'); setError(''); setFailedJob(null);
    try {
      if (access.narration && delivery.narration?.renderVersion !== NARRATION_RENDER_VERSION) {
        setProgress({ value: 5, stage: 'Recording the approved narration…' });
        const narration = await api.post(`/v1/deliveries/${delivery._id}/narrate`, { voiceId: DEFAULT_NARRATION_VOICE_ID });
        await waitForJob(delivery._id, narration.data.data._id, job => setProgress({ value: job.progress, stage: 'Recording the approved narration…' }));
      }
      const response = await api.post(`/v1/deliveries/${delivery._id}/publish`, { pin: access.pinEnabled ? access.pin : '', expiresAt: access.expiresAt ? new Date(access.expiresAt).toISOString() : '', allowIndividualDownloads: access.allowIndividualDownloads, allowDownloadAll: access.allowDownloadAll, allowLikes: access.allowLikes, narration: access.narration });
      setDelivery(current => ({ ...current, status: 'published', publishedUrl: response.data.data.url }));
      setParams({}, { replace: true }); toast.success('Client delivery published');
      trackEvent('delivery.publish.succeeded', { format: delivery.format, narration: access.narration, soundtrack: Boolean(delivery.soundtrack) }, { format: delivery.format, status: 'completed' });
    } catch (requestError) { trackEvent('delivery.publish.failed', { format: delivery?.format }, { format: delivery?.format, status: 'failed', errorCode: requestError.response?.data?.code || 'PUBLISH_FAILED' }); setError(apiMessage(requestError, requestError.message || 'We could not publish this delivery.')); if (requestError.jobId) setFailedJob({ id: requestError.jobId, type: requestError.jobType }); }
    finally { setBusy(''); }
  }

  async function addSoundtrack(file) {
    if (!file) return;
    if (!audioRights) return toast.error('Confirm that you have permission to use this track first.');
    if (file.size > 20 * 1024 * 1024) return toast.error('Choose an audio file no larger than 20 MB.');
    setBusy('soundtrack'); setError('');
    try {
      const soundtrack = await uploadDeliverySoundtrack(delivery._id, file, audioTitle.trim());
      setDelivery(current => ({ ...current, soundtrack }));
      setChangingSoundtrack(false);
      if (!audioTitle) setAudioTitle(soundtrack.title || '');
      toast.success('Soundtrack added.');
      trackEvent('music.uploaded', { source: 'photographer' }, { status: 'completed' });
    } catch (requestError) { trackEvent('music.failed', { source: 'photographer' }, { status: 'failed', errorCode: requestError.response?.data?.code || 'SOUNDTRACK_UPLOAD_FAILED' }); setError(apiMessage(requestError, requestError.message || 'We could not add that soundtrack.')); }
    finally { setBusy(''); if (audioInputRef.current) audioInputRef.current.value = ''; }
  }

  async function removeSoundtrack() {
    setBusy('soundtrack');
    try { await api.delete(`/v1/deliveries/${delivery._id}/soundtrack`); setDelivery(current => ({ ...current, soundtrack: null })); toast.success('Soundtrack removed.'); trackEvent('music.track.replaced', { replacement: 'none' }, { status: 'completed' }); }
    catch (requestError) { trackEvent('music.failed', {}, { status: 'failed', errorCode: requestError.response?.data?.code || 'SOUNDTRACK_REMOVE_FAILED' }); setError(apiMessage(requestError, 'We could not remove that soundtrack.')); }
    finally { setBusy(''); }
  }

  function togglePreviewTrack(track) {
    if (previewTrackId === track.id) {
      previewAudioRef.current?.pause();
      previewRequestedIdRef.current = null;
      setPreviewTrackId(null);
      setPreviewLoadingId(null);
    } else {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio();
        previewAudioRef.current.preload = 'auto';
        previewAudioRef.current.onloadstart = () => {
          if (previewRequestedIdRef.current) setPreviewLoadingId(previewRequestedIdRef.current);
        };
        previewAudioRef.current.onwaiting = () => {
          if (previewRequestedIdRef.current) setPreviewLoadingId(previewRequestedIdRef.current);
        };
        previewAudioRef.current.onplaying = () => setPreviewLoadingId(null);
        previewAudioRef.current.onended = () => {
          previewRequestedIdRef.current = null;
          setPreviewTrackId(null);
          setPreviewLoadingId(null);
        };
        previewAudioRef.current.onerror = () => {
          if (!previewRequestedIdRef.current) return;
          previewRequestedIdRef.current = null;
          setPreviewTrackId(null);
          setPreviewLoadingId(null);
          toast.error('This preview could not load. Check your connection and try again.');
        };
      }
      const source = track.previewUrl || track.url;
      previewAudioRef.current.pause();
      previewRequestedIdRef.current = track.id;
      setPreviewTrackId(track.id);
      setPreviewLoadingId(track.id);
      previewAudioRef.current.src = source?.startsWith('/api/') ? `${API_BASE_URL.replace(/\/$/, '')}${source.slice(4)}` : source;
      previewAudioRef.current.load();
      previewAudioRef.current.play().catch(playError => {
        if (playError?.name === 'AbortError') return;
        if (previewRequestedIdRef.current !== track.id) return;
        previewRequestedIdRef.current = null;
        setPreviewTrackId(null);
        setPreviewLoadingId(null);
        toast.error('This preview could not play. Tap the track to try again.');
      });
      trackEvent('music.preview.started', { trackId: track.id }, { status: 'started' });
    }
  }

  async function selectCuratedTrack(track) {
    setBusy('soundtrack');
    setError('');
    try {
      const response = await api.post(`/v1/deliveries/${delivery._id}/soundtrack/select`, {
        trackId: track.id
      });
      setDelivery(current => ({ ...current, soundtrack: response.data.data }));
      setChangingSoundtrack(false);
      toast.success(`Attached "${track.title}" to delivery.`);
      trackEvent('music.track.selected', { source: 'curated' }, { status: 'completed' });
    } catch (requestError) {
      trackEvent('music.failed', { source: 'curated' }, { status: 'failed', errorCode: requestError.response?.data?.code || 'SOUNDTRACK_SELECT_FAILED' });
      setError(apiMessage(requestError, 'We could not attach that track.'));
    } finally {
      setBusy('');
    }
  }

  async function retryFailedJob() {
    if (!failedJob) return;
    setBusy('retry'); setError('');
    try {
      await api.post(`/v1/deliveries/${delivery._id}/jobs/${failedJob.id}/retry`);
      await waitForJob(delivery._id, failedJob.id, job => setProgress({ value: job.progress, stage: job.type === 'analyze' ? 'Reading the complete shoot…' : job.type === 'direct' ? 'Directing every photograph…' : 'Recording the approved narration…' }));
      await refreshDelivery();
      if (failedJob.type === 'analyze') setStep(3);
      if (failedJob.type === 'direct') setStep(4);
      toast.success(failedJob.type === 'narrate' ? 'Narration is ready. You can publish now.' : 'Veylo finished the direction.');
      setFailedJob(null);
    } catch (requestError) { setError(requestError.message || 'Veylo could not finish that retry.'); }
    finally { setBusy(''); }
  }

  function toggleRevisionAsset(assetId) {
    setRevisionIds(current => current.includes(assetId) ? current.filter(id => id !== assetId) : [...current, assetId]);
  }

  async function requestRevision(scope) {
    if (revisionInstruction.trim().length < 8) return setError('Tell Veylo what you want changed in at least eight characters.');
    if (scope === 'selected' && !revisionIds.length) return setError('Choose at least one photograph to revise.');
    setBusy('revise'); setError(''); setFailedJob(null); setProgress({ value: 2, stage: scope === 'full' ? 'Rethinking the full direction…' : 'Revising the selected photographs…' });
    try {
      const response = await api.post(`/v1/deliveries/${delivery._id}/revise`, { scope, instruction: revisionInstruction.trim(), assetIds: scope === 'selected' ? revisionIds : [] });
      await waitForJob(delivery._id, response.data.data._id, job => setProgress({ value: job.progress, stage: scope === 'full' ? 'Rethinking the full direction…' : 'Revising the selected photographs…' }));
      await refreshDelivery(); setRevisionIds([]); setRevisionInstruction(''); toast.success(scope === 'full' ? 'The full direction is ready to review.' : 'The selected photographs are ready to review.');
    } catch (requestError) { setError(requestError.message || 'Veylo could not finish that revision.'); if (requestError.jobId) setFailedJob({ id: requestError.jobId, type: 'revise' }); }
    finally { setBusy(''); }
  }

  async function sendDeliveryEmail(event) {
    event.preventDefault();
    setBusy('email');
    try { const { data } = await api.post(`/v1/deliveries/${delivery._id}/email`, { email: clientEmail.trim() }); toast.success(data.message); }
    catch (requestError) { setError(apiMessage(requestError, 'The delivery email could not be sent.')); }
    finally { setBusy(''); }
  }

  async function shareDelivery() {
    const data = { title: delivery.title, text: `${delivery.clientName}, your photographs are ready.`, url: publishedUrl };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(publishedUrl); toast.success('Client link copied.'); } }
    catch (error) { if (error.name !== 'AbortError') toast.error('The share menu could not open.'); }
  }

  async function downloadQr() {
    try {
      const { data } = await api.get(`/v1/deliveries/${delivery._id}/qr`);
      const link = document.createElement('a'); link.href = data.data.dataUrl; link.download = data.data.filename; link.click();
    } catch (requestError) { setError(apiMessage(requestError, 'We could not create that QR code.')); }
  }

  async function openLibrary() {
    setLibraryPicker(true); setLibraryLoading(true);
    try { const { data } = await api.get('/v1/storage'); setLibraryAssets(data.data || []); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not open your image library.')); setLibraryPicker(false); }
    finally { setLibraryLoading(false); }
  }

  function toggleLibraryAsset(id) {
    const remaining = limits.photosPerDelivery - orderedAssets.length;
    setLibrarySelection(current => current.includes(id) ? current.filter(value => value !== id) : current.length < remaining ? [...current, id] : current);
  }

  async function addFromLibrary() {
    if (!librarySelection.length) return;
    setBusy('library'); setError('');
    try {
      for (let offset = 0; offset < librarySelection.length; offset += 20) await api.post(`/v1/deliveries/${delivery._id}/uploads/from-library`, { assetIds: librarySelection.slice(offset, offset + 20) });
      await refreshDelivery(); toast.success(`${librarySelection.length} library photograph${librarySelection.length === 1 ? '' : 's'} added.`); setLibrarySelection([]); setLibraryPicker(false);
    } catch (requestError) { setError(apiMessage(requestError, 'We could not add those library photographs.')); }
    finally { setBusy(''); }
  }

  const recommendations = useMemo(() => delivery?.formatRecommendations || [], [delivery]);
  useEffect(() => {
    if (step === 3 && !selectedFormat && recommendations[0]?.format) setSelectedFormat(recommendations[0].format);
  }, [step, selectedFormat, recommendations]);
  const orderedAssets = useMemo(() => [...(delivery?.assets || [])].sort((a, b) => a.sortOrder - b.sortOrder), [delivery]);
  const frameMap = useMemo(() => new Map((delivery?.creativeDirection?.frames || []).map(frame => [frame.assetId, frame])), [delivery]);
  const pageAssets = orderedAssets.slice(reviewPage * 18, reviewPage * 18 + 18);
  const publishedUrl = delivery?.publishedUrl || (delivery?.status === 'published' ? `${APP_URL}/d/${delivery.publicId}` : '');

  return <div className="v-create-page">
    <div className="v-create-glow" aria-hidden="true" />
    <header className="v-create-top"><div><Link to="/dashboard"><ArrowLeft size={16} />Back to deliveries</Link><span>{delivery ? `${brief.clientName} · ${brief.shootType}` : 'New client delivery'}</span></div><small>{limits.photosPerDelivery} photos per delivery · Veylo {user?.plan === 'pro' ? 'Pro' : 'Free'}</small></header>
    <div className="v-create-layout">
       <aside className="v-create-steps" aria-label="Creation progress">{steps.map((label, index) => <button key={label} type="button" className={`${step === index + 1 ? 'is-current' : ''} ${step > index + 1 ? 'is-complete' : ''}`} onClick={() => { if (index + 1 < step) { if (index + 1 === 1) returnStepRef.current = step; goBackTo(index + 1); } }} disabled={index + 1 > step}><span>{step > index + 1 ? <Check size={14} /> : String(index + 1).padStart(2, '0')}</span><small>{label}</small></button>)}</aside>
      <main className="v-create-workspace">
        {error && <div className="v-create-error" role="alert"><span>{error}{failedJob && <button type="button" className="v-create-retry" onClick={retryFailedJob} disabled={Boolean(busy)}><RefreshCw size={14} />Retry this step</button>}</span><button type="button" onClick={() => { setError(''); setFailedJob(null); }}><X size={16} /></button></div>}
        <AnimatePresence mode="wait">
          {busy === 'loading' ? <Stage key="loading"><div className="v-create-loading"><LoaderCircle className="v-spin" size={25} /><strong>Opening your draft…</strong></div></Stage> : step === 1 ? <Stage key="brief">
            <StageHead eyebrow="01 / The photographer's context" title="Tell Veylo what this shoot is about." copy="Give Veylo the facts it cannot learn from the photographs alone. This is where the personal details come from." />
            <form className="v-create-form" onSubmit={startDraft}>
              <label>Client name
                <input value={brief.clientName} onChange={event => setBrief(current => ({ ...current, clientName: event.target.value }))} maxLength={100} required placeholder="Ada" />
              </label>
              <label>Type of shoot
                <select value={brief.shootType} onChange={event => setBrief(current => ({ ...current, shootType: event.target.value }))} required>
                  <option value="" disabled>Choose the type of shoot</option>
                  {SHOOT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <div className="v-create-field is-wide">
                <div className="v-create-field-header">
                  <label htmlFor="shoot-brief">What should Veylo know?</label>
                  <small>Required</small>
                </div>
                <p className="v-create-field-hint">
                  Tell us what the shoot celebrates, outfits or moments that matter, the mood on set, and anything the client should feel when opening their photos.
                </p>
                <textarea
                  id="shoot-brief"
                  value={brief.brief}
                  onChange={event => setBrief(current => ({ ...current, brief: event.target.value }))}
                  required
                  rows={6}
                  placeholder="e.g. Ada’s 30th birthday studio session in Lagos. She wore a tailored green velvet suit. The mood was poised, joyous, and celebratory."
                />
              </div>
              <button className="v-create-primary" disabled={Boolean(busy)}>Add the finished photographs<ArrowRight size={17} /></button>
            </form>
          </Stage> : step === 2 ? <Stage key="upload">
            <StageHead eyebrow="02 / Finished photographs" title="Add the files your client will receive." copy={`Upload the final edited photographs. Veylo will study the complete set without changing your retouching or colour grade.`} />
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event => addPhotos(event.target.files)} />
            <button type="button" className={`v-create-drop${draggingPhotos ? ' is-dragging' : ''}`} onClick={() => inputRef.current?.click()} onDragEnter={event => { event.preventDefault(); setDraggingPhotos(true); }} onDragOver={event => { event.preventDefault(); setDraggingPhotos(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDraggingPhotos(false); }} onDrop={event => { event.preventDefault(); setDraggingPhotos(false); if (!busy) addPhotos(event.dataTransfer.files); }} disabled={Boolean(busy)}><span><Upload size={25} /></span><strong>{busy === 'upload' ? progress.stage : draggingPhotos ? 'Drop the finished photographs here' : 'Choose or drop finished photographs'}</strong><small>JPEG, PNG, or WebP · up to 50 MB each · {delivery?.assets?.length || 0} of {limits.photosPerDelivery}</small>{busy === 'upload' && <i><b style={{ transform: `scaleX(${progress.value / 100})` }} /></i>}</button>
            {busy === 'upload' && uploadQueue.length > 0 && <section className="v-upload-queue" aria-live="polite" aria-label="Upload progress">
              <header><strong>Sending your photographs</strong><span>{uploadQueue.filter(item => item.status === 'complete').length} of {uploadQueue.length} confirmed</span></header>
              <div>{uploadQueue.slice(0, 8).map((item, index) => <article key={`${item.name}-${index}`} className={`is-${item.status}`}><span>{item.status === 'complete' ? <Check size={14} /> : item.status === 'failed' ? <X size={14} /> : <LoaderCircle className="v-spin" size={14} />}</span><div><strong title={item.name}>{item.name}</strong><small>{item.status === 'complete' ? 'Added to this delivery' : item.status === 'failed' ? 'Upload stopped — try again' : item.status === 'starting' ? 'Preparing upload' : `Uploading ${item.progress}%`}</small></div><b>{item.status === 'complete' ? 'Done' : `${item.progress}%`}</b></article>)}</div>
              {uploadQueue.length > 8 && <small className="v-upload-queue-more">Showing the first 8 files while the rest continue.</small>}
            </section>}
            {limits.personalStorageBytes > 0 && <button type="button" className="v-create-library-open" onClick={openLibrary} disabled={Boolean(busy)}><Image size={17} /><span><strong>Choose from your Pro library</strong><small>Reuse finished photographs without uploading them from your device again.</small></span><ArrowRight size={16} /></button>}
            {orderedAssets.length > 0 && <div className="v-create-thumbs">{orderedAssets.slice(0, 24).map((asset, index) => <div key={asset.assetId}><img src={asset.thumbnailUrl || asset.url} alt="" /><span>{String(index + 1).padStart(2, '0')}</span><button type="button" onClick={() => removePhoto(asset.assetId)} disabled={Boolean(busy)} aria-label={`Remove photograph ${index + 1}`}><Trash2 size={13} /></button></div>)}{orderedAssets.length > 24 && <div className="v-create-more">+{orderedAssets.length - 24}</div>}</div>}
            <div className="v-create-footer"><button type="button" onClick={() => goBackTo(1)}><ArrowLeft size={16} />Edit shoot details</button><button type="button" className="v-create-primary" onClick={analyzeShoot} disabled={!orderedAssets.length || Boolean(busy)}>{busy === 'analyze' ? progress.stage : 'Analyze the complete shoot'}{busy === 'analyze' ? <LoaderCircle className="v-spin" size={17} /> : <ArrowRight size={17} />}</button></div>
            {busy === 'analyze' && <Progress value={progress.value} label={progress.stage} />}
          </Stage> : step === 3 ? <Stage key="format">
            <StageHead eyebrow="03 / Format recommendation" title="Choose how the client sees it." copy={delivery?.collectionAnalysis?.summary || 'Veylo has read the complete set. Choose the experience you want the client to receive.'} />
            <div className="v-format-recommendations">{recommendations.map((recommendation, index) => { const item = formats.find(format => format.id === recommendation.format); const Icon = item?.icon || LayoutTemplate; const isSelected = selectedFormat === recommendation.format; return <button type="button" key={recommendation.format} onClick={() => setSelectedFormat(recommendation.format)} disabled={Boolean(busy)} className={`${index === 0 ? 'is-recommended' : ''} ${isSelected ? 'is-selected' : ''}`}><span className="v-format-rank">{String(index + 1).padStart(2, '0')}</span><Icon size={22} /><div><small>{index === 0 ? 'VEYLO RECOMMENDS' : item?.verb}</small><strong>{item?.name}</strong><p>{recommendation.reason}</p></div><b>{recommendation.score}</b>{isSelected && <span className="v-format-check"><Check size={14} /></span>}</button>; })}</div>
            {busy === 'direct' && <Progress value={progress.value} label={progress.stage} />}
            <div className="v-create-footer"><button type="button" onClick={() => goBackTo(2)}><ArrowLeft size={16} />Back to photographs</button><button type="button" className="v-create-primary" onClick={() => chooseFormat(selectedFormat)} disabled={!selectedFormat || Boolean(busy)}>{busy === 'direct' ? progress.stage : selectedFormat ? `Create ${formatName(selectedFormat)}` : 'Choose a format above'}{busy === 'direct' ? <LoaderCircle className="v-spin" size={17} /> : <ArrowRight size={17} />}</button></div>
          </Stage> : step === 4 ? <Stage key="review">
            <StageHead eyebrow={`04 / Review the ${formatName(delivery?.format)}`} title="Check the order. Read every line." copy="Veylo proposes the direction. You decide what reaches your client. Edit any line and move any photograph before you publish." />
            <div className="v-review-opening"><label>Delivery title<input value={delivery?.creativeDirection?.title || ''} onChange={event => editDirection('title', event.target.value)} maxLength={80} /></label><label>Opening line<textarea value={delivery?.creativeDirection?.openingLine || ''} onChange={event => editDirection('openingLine', event.target.value)} maxLength={140} rows={3} /></label><label>Closing line<textarea value={delivery?.creativeDirection?.closingLine || ''} onChange={event => editDirection('closingLine', event.target.value)} maxLength={160} rows={3} /></label></div>
             <DeliveryDirectionStudio delivery={delivery} assets={orderedAssets} frameMap={frameMap} onDirectionChange={editDirectionSetting} onSectionChange={editSection} />
             <CurrentSoundtrackPlayer soundtrack={delivery?.soundtrack} />
             <section className="v-client-format-preview" aria-label="Exact client format preview">
               <header><div><p>EXACT CLIENT VIEW</p><h2>Open the same format your client will receive.</h2><span>This preview uses the selected format, order, captions, colour direction, and typography. It is the final viewer inside the studio.</span></div><span className="v-client-format-preview-badge">{formatName(delivery?.format)}</span></header>
              <div className="v-client-format-preview-frame"><ClientDeliveryPreview delivery={delivery ? { ...delivery, branding: delivery.branding || previewBranding } : delivery} narrationEnabled={access.narration} accessPin={access.pinEnabled ? access.pin : ''} access={access} /></div>
             </section>
            <div className="v-review-revision"><div><ListChecks size={19} /><span><strong>Ask for another direction</strong><small>Choose photographs below for a focused change, or ask Veylo to rethink the complete delivery.</small></span></div><textarea value={revisionInstruction} onChange={event => setRevisionInstruction(event.target.value)} maxLength={600} placeholder="For example: make these captions warmer and keep the focus on her confidence in the second look." /><footer><span>{revisionIds.length} photograph{revisionIds.length === 1 ? '' : 's'} selected</span><button type="button" onClick={() => requestRevision('selected')} disabled={Boolean(busy) || !revisionIds.length}>Revise selected</button><button type="button" onClick={() => requestRevision('full')} disabled={Boolean(busy)}>Rethink full direction</button></footer>{busy === 'revise' && <Progress value={progress.value} label={progress.stage} />}</div>
            <div className="v-review-grid">{pageAssets.map((asset, localIndex) => { const index = reviewPage * 18 + localIndex; const frame = frameMap.get(asset.assetId) || {}; return <article key={asset.assetId}><button type="button" className={`v-review-select ${revisionIds.includes(asset.assetId) ? 'is-selected' : ''}`} onClick={() => toggleRevisionAsset(asset.assetId)}><Check size={13} />{revisionIds.includes(asset.assetId) ? 'Selected for revision' : 'Select for revision'}</button><div><img src={asset.thumbnailUrl || asset.url} alt="" /><span>{String(index + 1).padStart(2, '0')}</span><div><button type="button" onClick={() => movePhoto(asset.assetId, -1)} disabled={index === 0} aria-label="Move photograph earlier"><ChevronUp size={15} /></button><button type="button" onClick={() => movePhoto(asset.assetId, 1)} disabled={index === orderedAssets.length - 1} aria-label="Move photograph later"><ChevronDown size={15} /></button></div></div><label>Heading<input value={frame.headline || ''} onChange={event => editFrame(asset.assetId, 'headline', event.target.value)} maxLength={70} /></label><label>Caption<textarea value={frame.caption || ''} onChange={event => editFrame(asset.assetId, 'caption', event.target.value)} maxLength={180} rows={4} /></label><small>{frame.motion?.replaceAll('-', ' ')} · {frame.transition}</small></article>; })}</div>
            {orderedAssets.length > 18 && <div className="v-review-pages"><button onClick={() => setReviewPage(value => Math.max(0, value - 1))} disabled={reviewPage === 0}>Previous</button><span>{reviewPage + 1} / {Math.ceil(orderedAssets.length / 18)}</span><button onClick={() => setReviewPage(value => Math.min(Math.ceil(orderedAssets.length / 18) - 1, value + 1))} disabled={reviewPage >= Math.ceil(orderedAssets.length / 18) - 1}>Next</button></div>}
            <div className="v-create-footer"><button type="button" onClick={() => goBackTo(3)}><RefreshCw size={15} />Choose another format</button><button type="button" className="v-create-primary" onClick={saveReview} disabled={Boolean(busy)}>{busy === 'save' ? 'Saving your edits…' : 'Approve this direction'}<Check size={17} /></button></div>
          </Stage> : <Stage key="publish">
            {publishedUrl ? <div className="v-published"><span><Check size={25} /></span><p>CLIENT DELIVERY READY</p><h1>{delivery.title}</h1><small>Send one private link. Your client can open it on their phone without creating an account.</small><div><a className="v-create-primary" href={publishedUrl} target="_blank" rel="noreferrer">Open client view<ArrowRight size={17} /></a><button type="button" onClick={() => navigator.clipboard.writeText(publishedUrl).then(() => toast.success('Client link copied'))}>Copy client link</button><a href={`https://wa.me/?text=${encodeURIComponent(`Hello ${delivery.clientName}, your photographs are ready. Open your private delivery here:\n${publishedUrl}`)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a><button type="button" onClick={shareDelivery}><Share2 size={15} />Open share menu</button><button type="button" onClick={downloadQr}><QrCode size={15} />Download QR code</button></div><form className="v-published-email" onSubmit={sendDeliveryEmail}><label><Mail size={15} /><input type="email" value={clientEmail} onChange={event => setClientEmail(event.target.value)} required maxLength={254} placeholder="Client email address" /></label><button type="submit" disabled={busy === 'email'}>{busy === 'email' ? 'Sending…' : 'Send by email'}</button></form><Link to="/dashboard">Return to my deliveries</Link></div> : <>
              <StageHead eyebrow="05 / Client access" title="Choose what happens after you share." copy="Set privacy and download controls, then publish one link for your client." />
              <div className="v-publish-audio">
                <header>
                  <Music2 size={20} />
                  <div>
                    <strong>Soundtrack</strong>
                    <span>{delivery?.creativeDirection?.music ? `The direction calls for ${delivery.creativeDirection.music.mood.toLowerCase()} ${delivery.creativeDirection.music.genre.toLowerCase()} at a ${delivery.creativeDirection.music.tempo} pace.` : 'Add a track that fits the approved direction.'}</span>
                  </div>
                </header>
                {delivery?.soundtrack && !changingSoundtrack ? (
                  <div className="v-publish-track">
                    <span>
                      <Music2 size={15} />
                      <strong>{delivery.soundtrack.title}</strong>
                      <small>{delivery.soundtrack.genre ? `${delivery.soundtrack.genre} · Curated` : 'Added by you'}</small>
                    </span>
                    <div className="v-publish-track-actions"><button type="button" onClick={() => setChangingSoundtrack(true)} disabled={busy === 'soundtrack'}><RefreshCw size={15} />Change</button><button type="button" onClick={removeSoundtrack} disabled={busy === 'soundtrack'}><Trash2 size={15} />Remove</button></div>
                  </div>
                ) : (
                  <div className="v-soundtrack-manager">
                    <div className="v-soundtrack-tabs">
                      <button type="button" className={soundtrackTab === 'curated' ? 'is-active' : ''} onClick={() => setSoundtrackTab('curated')}>
                        Curated soundtracks ({curatedSoundtracks.length})
                      </button>
                      <button type="button" className={soundtrackTab === 'custom' ? 'is-active' : ''} onClick={() => setSoundtrackTab('custom')}>
                        Upload your own audio
                      </button>
                    </div>

                    {soundtrackTab === 'curated' ? (
                      <div className="v-soundtrack-catalogue">
                        <div className="v-soundtrack-catalogue-tools">
                          <label><Search size={15} /><input value={soundtrackSearch} onChange={event => setSoundtrackSearch(event.target.value)} placeholder="Search mood, occasion or creator" /></label>
                          <div role="group" aria-label="Soundtrack categories">
                            {soundtrackCategories.map(category => <button type="button" key={category} className={soundtrackCategory === category ? 'is-active' : ''} onClick={() => setSoundtrackCategory(category)}>{category === 'all' ? 'All' : category.replace('-', ' ')}</button>)}
                          </div>
                        </div>
                        <div className="v-soundtrack-curated-list">
                        {filteredSoundtracks.map(track => {
                          const isLoading = previewLoadingId === track.id;
                          const isPlaying = previewTrackId === track.id && !isLoading;
                          const isActive = previewTrackId === track.id;
                          return (
                            <div key={track.id} className={`v-soundtrack-item ${isLoading ? 'is-loading' : ''}`}>
                              <button type="button" className={`v-soundtrack-play ${isPlaying ? 'is-playing' : ''} ${isLoading ? 'is-loading' : ''}`} onClick={() => togglePreviewTrack(track)} aria-label={isLoading ? 'Cancel loading preview' : isPlaying ? 'Pause preview' : 'Play preview'} aria-busy={isLoading}>
                                {isLoading ? <LoaderCircle className="v-spin" size={15} /> : isPlaying ? <Pause size={14} /> : <Play size={14} />}
                              </button>
                              <div className="v-soundtrack-meta">
                                <strong>{track.title}</strong>
                                <em className={isLoading ? 'is-loading' : ''} aria-live="polite">{isLoading ? 'Loading preview…' : `by ${track.creator} via Pixabay`}</em>
                                <p className="v-soundtrack-fit">{track.storyFunction}</p>
                                <span>
                                  <b>{track.genre}</b>
                                  <i>{track.mood}</i>
                                  {track.contentIdRegistered && <i>Content ID registered</i>}
                                  <small>{Math.floor(track.durationSec / 60)}:{String(track.durationSec % 60).padStart(2, '0')}</small>
                                </span>
                                <details className="v-soundtrack-details"><summary>Track notes</summary><div><p><strong>Best for</strong> {(track.bestFor || []).join(' · ')}</p><p><strong>Avoid for</strong> {(track.avoidFor || []).join(' · ')}</p><p><strong>Sound</strong> {track.instrumentationCue} · {track.editingPace}</p><p><strong>Selection</strong> {track.selectionNote}</p><p><strong>Narration</strong> {track.narrationFit} fit. {track.contentIdGuidance}</p><p><strong>Metadata</strong> {track.metadataConfidence}</p><a href={track.sourcePageUrl} target="_blank" rel="noreferrer">Open Pixabay source <ExternalLink size={13} /></a></div></details>
                              </div>
                              <button type="button" className="v-soundtrack-select-btn" onClick={() => selectCuratedTrack(track)} disabled={Boolean(busy)}>
                                {isActive ? 'Use this track' : 'Use track'}
                              </button>
                            </div>
                          );
                        })}
                        {!filteredSoundtracks.length && <p className="v-soundtrack-empty">No tracks match that search.</p>}
                        </div>
                      </div>
                    ) : (
                      <div className="v-soundtrack-custom">
                        <label className="v-publish-rights">
                          <input type="checkbox" checked={audioRights} onChange={event => setAudioRights(event.target.checked)} />
                          <span>I own this track or have permission to use it in this client delivery.</span>
                        </label>
                        <div className="v-publish-track-form">
                          <input value={audioTitle} onChange={event => setAudioTitle(event.target.value)} placeholder="Track title (optional)" maxLength={100} />
                          <button type="button" onClick={() => audioInputRef.current?.click()} disabled={!audioRights || Boolean(busy)}>
                            <Upload size={15} />{busy === 'soundtrack' ? 'Adding track…' : 'Choose audio'}
                          </button>
                          <input ref={audioInputRef} type="file" hidden accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac" onChange={event => addSoundtrack(event.target.files?.[0])} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="v-publish-settings">
                <Toggle icon={LockKeyhole} label="Six-digit PIN" copy="Ask for a PIN before showing the client name, title, or photographs." checked={access.pinEnabled} onChange={value => setAccess(current => ({ ...current, pinEnabled: value }))}>{access.pinEnabled && <input value={access.pin} onChange={event => setAccess(current => ({ ...current, pin: event.target.value.replace(/\D/g, '').slice(0, 6) }))} inputMode="numeric" placeholder="000000" aria-label="Six-digit delivery PIN" />}</Toggle>
                <label className="v-publish-expiry"><span>Link expiry</span><small>Leave empty when the delivery should stay open.</small><input type="date" value={access.expiresAt} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={event => setAccess(current => ({ ...current, expiresAt: event.target.value }))} /></label>
                <Toggle icon={Image} label="Individual photo downloads" copy="Let the client download one photograph at a time." checked={access.allowIndividualDownloads} onChange={value => setAccess(current => ({ ...current, allowIndividualDownloads: value }))} />
                <Toggle icon={Clapperboard} label="Download all photographs" copy="Let the client start the photographs one by one from the gallery." checked={access.allowDownloadAll} onChange={value => setAccess(current => ({ ...current, allowDownloadAll: value }))} />
                <Toggle icon={Check} label="Photo likes" copy="Let the client mark the photographs they love." checked={access.allowLikes} onChange={value => setAccess(current => ({ ...current, allowLikes: value }))} />
                <Toggle icon={Play} label="Narration with Hannah" copy="On by default. Deepgram Flux reads the approved captions in a calm, measured voice." checked={access.narration} onChange={value => setAccess(current => ({ ...current, narration: value }))}>{access.narration && <small className="v-narration-voice-note">Deepgram Flux · Hannah · captions are read in photograph order.</small>}</Toggle>
              </div>
              {busy === 'publish' && progress.stage && <Progress value={progress.value} label={progress.stage} />}
              <div className="v-create-footer"><button type="button" onClick={() => goBackTo(4)}><ArrowLeft size={16} />Back to review</button><button type="button" className="v-create-primary" onClick={publish} disabled={Boolean(busy)}>{busy === 'publish' ? 'Preparing the client link…' : 'Publish client delivery'}<ArrowRight size={17} /></button></div>
            </>}
          </Stage>}
        </AnimatePresence>
      </main>
    </div>
    {['analyze', 'direct', 'revise', 'publish'].includes(busy) && (
      <DeliveryProgress
        type={busy}
        value={progress.value}
        stage={progress.stage}
        clientName={brief.clientName || delivery?.clientName}
        shootType={brief.shootType || delivery?.shootType}
      />
    )}
    {libraryPicker && <div className="v-create-library-picker" role="presentation" onMouseDown={event => event.target === event.currentTarget && setLibraryPicker(false)}><section role="dialog" aria-modal="true" aria-label="Choose photographs from your library"><header><div><p>YOUR PRO LIBRARY</p><h2>Choose finished photographs</h2></div><button type="button" onClick={() => setLibraryPicker(false)}><X size={18} /></button></header>{libraryLoading ? <div className="v-create-library-state"><LoaderCircle className="v-spin" size={22} />Opening your library…</div> : libraryAssets.length ? <div className="v-create-library-grid">{libraryAssets.map(asset => <button type="button" key={asset._id} className={librarySelection.includes(asset._id) ? 'is-selected' : ''} onClick={() => toggleLibraryAsset(asset._id)}><img src={asset.thumbnailUrl || asset.url} alt={asset.originalFilename || 'Library photograph'} loading="lazy" /><span>{librarySelection.includes(asset._id) ? <Check size={15} /> : <Image size={15} />}</span></button>)}</div> : <div className="v-create-library-state"><Image size={22} />Your personal library is empty.</div>}<footer><span>{librarySelection.length} selected</span><button type="button" onClick={addFromLibrary} disabled={!librarySelection.length || busy === 'library'}>{busy === 'library' ? 'Adding photographs…' : 'Add to this delivery'}</button></footer></section></div>}
  </div>;
}
