import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronUp, Clapperboard, Eye, Film, Image, LayoutTemplate, ListChecks, ListTree, LoaderCircle, LockKeyhole, Mail, Move, Music2, Newspaper, Play, QrCode, RefreshCw, Share2, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { APP_URL } from '../config/env.js';
import { uploadDeliveryPhotos, uploadDeliverySoundtrack } from '../utils/deliveryUpload.js';
import './CreateDelivery.css';

const formats = [
  { id: 'photo-story', name: 'Photo Story', verb: 'Watch', icon: Film, copy: 'A paced sequence with a clear opening, rhythm, and ending.' },
  { id: 'editorial', name: 'Editorial Page', verb: 'Explore', icon: Newspaper, copy: 'A scrollable publication built around the character of the shoot.' },
  { id: 'photo-reveal', name: 'Photo Reveal', verb: 'Discover', icon: Eye, copy: 'A first viewing that moves only when the client is ready.' },
  { id: 'canvas', name: 'Canvas', verb: 'Move through', icon: Move, copy: 'A spatial arrangement the client can explore freely.' },
  { id: 'chapters', name: 'Chapters', verb: 'Choose', icon: ListTree, copy: 'Natural parts of a large shoot, ready to open in any order.' },
  { id: 'album', name: 'Album', verb: 'Turn through', icon: BookOpen, copy: 'Deliberate page turns and spreads composed from the photographs.' }
];

const steps = ['Tell us about the shoot', 'Add finished photos', 'Choose the format', 'Review every detail', 'Publish and share'];

function formatName(id) { return formats.find(item => item.id === id)?.name || 'Delivery'; }

function Stage({ children }) {
  const reduced = useReducedMotion();
  return <motion.section className="v-create-stage" initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? {} : { opacity: 0, y: -10 }} transition={{ duration: reduced ? 0 : .42, ease: [.22, 1, .36, 1] }}>{children}</motion.section>;
}

function StageHead({ eyebrow, title, copy }) {
  return <header className="v-create-stage-head"><p>{eyebrow}</p><h1>{title}</h1><span>{copy}</span></header>;
}

function Progress({ value, label }) {
  return <div className="v-create-progress" role="status"><div><LoaderCircle className="v-spin" size={17} /><span>{label}</span><strong>{value}%</strong></div><i><b style={{ transform: `scaleX(${Math.max(0, Math.min(100, value)) / 100})` }} /></i></div>;
}

function Toggle({ icon: Icon, label, copy, checked, onChange, children }) {
  return <article className="v-publish-toggle"><Icon size={20} /><div><strong>{label}</strong><small>{copy}</small>{children}</div><button type="button" className={checked ? 'is-on' : ''} onClick={() => onChange(!checked)} aria-pressed={checked} aria-label={`${checked ? 'Turn off' : 'Turn on'} ${label}`}><i /></button></article>;
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
  const [step, setStep] = useState(1);
  const [delivery, setDelivery] = useState(null);
  const [limits, setLimits] = useState({ photosPerDelivery: user?.plan === 'pro' ? 500 : 100 });
  const [brief, setBrief] = useState({ clientName: '', shootType: '', brief: '' });
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState({ value: 0, stage: '' });
  const [error, setError] = useState('');
  const [failedJob, setFailedJob] = useState(null);
  const [reviewPage, setReviewPage] = useState(0);
  const [access, setAccess] = useState({ pinEnabled: false, pin: '', expiresAt: '', allowIndividualDownloads: true, allowDownloadAll: true, allowLikes: true, narration: false });
  const [audioRights, setAudioRights] = useState(false);
  const [audioTitle, setAudioTitle] = useState('');
  const [revisionIds, setRevisionIds] = useState([]);
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [libraryPicker, setLibraryPicker] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [librarySelection, setLibrarySelection] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const draftId = params.get('draft');
  useEffect(() => {
    api.get('/v1/billing/status').then(response => setLimits(response.data.data.limits)).catch(() => {});
  }, []);
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

  async function refreshDelivery(id = delivery?._id) {
    const response = await api.get(`/v1/deliveries/${id}`);
    setDelivery(response.data.data);
    return response.data.data;
  }

  async function startDraft(event) {
    event.preventDefault();
    setBusy('draft'); setError('');
    try {
      const response = delivery
        ? await api.patch(`/v1/deliveries/${delivery._id}/details`, brief)
        : await api.post('/v1/deliveries', brief);
      setDelivery(response.data.data);
      setParams({ draft: response.data.data._id }, { replace: true });
      setStep(2);
    } catch (requestError) { setError(apiMessage(requestError, 'We could not start this delivery.')); }
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
    setBusy('upload'); setError(''); setProgress({ value: 0, stage: `Uploading ${valid.length} finished photograph${valid.length === 1 ? '' : 's'}…` });
    try {
      await uploadDeliveryPhotos(delivery._id, valid, value => setProgress(current => ({ ...current, value })));
      const current = await refreshDelivery();
      toast.success(`${valid.length} photograph${valid.length === 1 ? '' : 's'} added`);
      setProgress({ value: 100, stage: `${current.assets.length} photographs ready` });
    } catch (requestError) { setError(apiMessage(requestError, requestError.message || 'We could not upload those photographs.')); }
    finally { setBusy(''); if (inputRef.current) inputRef.current.value = ''; }
  }

  async function analyzeShoot() {
    setBusy('analyze'); setError(''); setFailedJob(null); setProgress({ value: 2, stage: 'Preparing the photographs…' });
    try {
      const response = await api.post(`/v1/deliveries/${delivery._id}/analyze`);
      await waitForJob(delivery._id, response.data.data._id, job => setProgress({ value: job.progress, stage: job.stage === 'reading-photographs' ? 'Reading the complete shoot…' : 'Comparing the six delivery formats…' }));
      await refreshDelivery(); setStep(3);
    } catch (requestError) { setError(requestError.message || apiMessage(requestError, 'Veylo could not analyze this shoot.')); if (requestError.jobId) setFailedJob({ id: requestError.jobId, type: requestError.jobType }); }
    finally { setBusy(''); }
  }

  async function chooseFormat(format) {
    setBusy('direct'); setError(''); setFailedJob(null); setProgress({ value: 2, stage: `Directing the ${formatName(format)}…` });
    try {
      const response = await api.post(`/v1/deliveries/${delivery._id}/direct`, { format });
      await waitForJob(delivery._id, response.data.data._id, job => setProgress({ value: job.progress, stage: job.stage === 'setting-direction' ? 'Setting the colors, type, and structure…' : 'Directing every photograph…' }));
      await refreshDelivery(); setStep(4);
    } catch (requestError) { setError(requestError.message || apiMessage(requestError, 'Veylo could not direct this format.')); if (requestError.jobId) setFailedJob({ id: requestError.jobId, type: requestError.jobType }); }
    finally { setBusy(''); }
  }

  function editDirection(field, value) {
    setDelivery(current => ({ ...current, creativeDirection: { ...current.creativeDirection, [field]: value }, ...(field === 'title' ? { title: value } : {}) }));
  }

  function editFrame(assetId, field, value) {
    setDelivery(current => ({ ...current, creativeDirection: { ...current.creativeDirection, frames: current.creativeDirection.frames.map(frame => frame.assetId === assetId ? { ...frame, [field]: value } : frame) } }));
  }

  function movePhoto(assetId, offset) {
    setDelivery(current => {
      const assets = [...current.assets].sort((a, b) => a.sortOrder - b.sortOrder);
      const index = assets.findIndex(asset => asset.assetId === assetId);
      const target = index + offset;
      if (target < 0 || target >= assets.length) return current;
      [assets[index], assets[target]] = [assets[target], assets[index]];
      return { ...current, assets: assets.map((asset, sortOrder) => ({ ...asset, sortOrder })) };
    });
  }

  async function saveReview() {
    setBusy('save'); setError('');
    try {
      const ordered = [...delivery.assets].sort((a, b) => a.sortOrder - b.sortOrder);
      const response = await api.patch(`/v1/deliveries/${delivery._id}/review`, { title: delivery.creativeDirection.title, openingLine: delivery.creativeDirection.openingLine, closingLine: delivery.creativeDirection.closingLine, frames: delivery.creativeDirection.frames.map(({ assetId, headline, caption }) => ({ assetId, headline: headline || '', caption: caption || '' })), assetOrder: ordered.map(asset => asset.assetId) });
      setDelivery(response.data.data); setStep(5); toast.success('Delivery review saved');
    } catch (requestError) { setError(apiMessage(requestError, 'We could not save these edits.')); }
    finally { setBusy(''); }
  }

  async function publish() {
    if (access.pinEnabled && !/^\d{6}$/.test(access.pin)) return setError('Enter a six-digit PIN or turn the PIN off.');
    setBusy('publish'); setError(''); setFailedJob(null);
    try {
      if (access.narration && ['photo-story', 'chapters'].includes(delivery.format) && !delivery.narration) {
        setProgress({ value: 5, stage: 'Recording the approved narration…' });
        const narration = await api.post(`/v1/deliveries/${delivery._id}/narrate`);
        await waitForJob(delivery._id, narration.data.data._id, job => setProgress({ value: job.progress, stage: 'Recording the approved narration…' }));
      }
      const response = await api.post(`/v1/deliveries/${delivery._id}/publish`, { pin: access.pinEnabled ? access.pin : '', expiresAt: access.expiresAt ? new Date(access.expiresAt).toISOString() : '', allowIndividualDownloads: access.allowIndividualDownloads, allowDownloadAll: access.allowDownloadAll, allowLikes: access.allowLikes });
      setDelivery(current => ({ ...current, status: 'published', publishedUrl: response.data.data.url }));
      setParams({}, { replace: true }); toast.success('Client delivery published');
    } catch (requestError) { setError(apiMessage(requestError, requestError.message || 'We could not publish this delivery.')); if (requestError.jobId) setFailedJob({ id: requestError.jobId, type: requestError.jobType }); }
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
      if (!audioTitle) setAudioTitle(soundtrack.title || '');
      toast.success('Soundtrack added.');
    } catch (requestError) { setError(apiMessage(requestError, requestError.message || 'We could not add that soundtrack.')); }
    finally { setBusy(''); if (audioInputRef.current) audioInputRef.current.value = ''; }
  }

  async function removeSoundtrack() {
    setBusy('soundtrack');
    try { await api.delete(`/v1/deliveries/${delivery._id}/soundtrack`); setDelivery(current => ({ ...current, soundtrack: null })); toast.success('Soundtrack removed.'); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not remove that soundtrack.')); }
    finally { setBusy(''); }
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
  const orderedAssets = useMemo(() => [...(delivery?.assets || [])].sort((a, b) => a.sortOrder - b.sortOrder), [delivery]);
  const frameMap = useMemo(() => new Map((delivery?.creativeDirection?.frames || []).map(frame => [frame.assetId, frame])), [delivery]);
  const pageAssets = orderedAssets.slice(reviewPage * 18, reviewPage * 18 + 18);
  const publishedUrl = delivery?.publishedUrl || (delivery?.status === 'published' ? `${APP_URL}/d/${delivery.publicId}` : '');

  return <div className="v-create-page">
    <div className="v-create-glow" aria-hidden="true" />
    <header className="v-create-top"><div><Link to="/dashboard"><ArrowLeft size={16} />Back to deliveries</Link><span>{delivery ? `${brief.clientName} · ${brief.shootType}` : 'New client delivery'}</span></div><small>{limits.photosPerDelivery} photos per delivery · Veylo {user?.plan === 'pro' ? 'Pro' : 'Free'}</small></header>
    <div className="v-create-layout">
      <aside className="v-create-steps" aria-label="Creation progress">{steps.map((label, index) => <button key={label} type="button" className={`${step === index + 1 ? 'is-current' : ''} ${step > index + 1 ? 'is-complete' : ''}`} onClick={() => { if (index + 1 < step) setStep(index + 1); }} disabled={index + 1 > step}><span>{step > index + 1 ? <Check size={14} /> : String(index + 1).padStart(2, '0')}</span><small>{label}</small></button>)}</aside>
      <main className="v-create-workspace">
        {error && <div className="v-create-error" role="alert"><span>{error}{failedJob && <button type="button" className="v-create-retry" onClick={retryFailedJob} disabled={Boolean(busy)}><RefreshCw size={14} />Retry this step</button>}</span><button type="button" onClick={() => { setError(''); setFailedJob(null); }}><X size={16} /></button></div>}
        <AnimatePresence mode="wait">
          {busy === 'loading' ? <Stage key="loading"><div className="v-create-loading"><LoaderCircle className="v-spin" size={25} /><strong>Opening your draft…</strong></div></Stage> : step === 1 ? <Stage key="brief">
            <StageHead eyebrow="01 / The photographer’s context" title="Tell Veylo what this shoot is about." copy="Give the Creative Director facts it cannot learn from the photographs alone. This is where the personal details come from." />
            <form className="v-create-form" onSubmit={startDraft}><label>Client name<input value={brief.clientName} onChange={event => setBrief(current => ({ ...current, clientName: event.target.value }))} maxLength={100} required placeholder="Ada" /></label><label>Type of shoot<input value={brief.shootType} onChange={event => setBrief(current => ({ ...current, shootType: event.target.value }))} maxLength={80} required placeholder="Fashion editorial" /></label><label className="is-wide">What should Veylo know?<textarea value={brief.brief} onChange={event => setBrief(current => ({ ...current, brief: event.target.value }))} minLength={20} maxLength={2000} required rows={7} placeholder="Tell us what the shoot was for, who it celebrates, the mood on set, outfits or moments that matter, and anything the client should feel when they open it." /><small>{brief.brief.length} / 2,000</small></label><button className="v-create-primary" disabled={Boolean(busy)}>Add the finished photographs<ArrowRight size={17} /></button></form>
          </Stage> : step === 2 ? <Stage key="upload">
            <StageHead eyebrow="02 / Finished photographs" title="Add the files your client will receive." copy={`Upload the final edited photographs. Veylo will study the complete set without changing your retouching or colour grade.`} />
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event => addPhotos(event.target.files)} />
            <button type="button" className="v-create-drop" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}><span><Upload size={25} /></span><strong>{busy === 'upload' ? progress.stage : 'Choose finished photographs'}</strong><small>JPEG, PNG, or WebP · up to 50 MB each · {delivery?.assets?.length || 0} of {limits.photosPerDelivery}</small>{busy === 'upload' && <i><b style={{ transform: `scaleX(${progress.value / 100})` }} /></i>}</button>
            {limits.personalStorageBytes > 0 && <button type="button" className="v-create-library-open" onClick={openLibrary} disabled={Boolean(busy)}><Image size={17} /><span><strong>Choose from your Pro library</strong><small>Reuse finished photographs without uploading them from your device again.</small></span><ArrowRight size={16} /></button>}
            {orderedAssets.length > 0 && <div className="v-create-thumbs">{orderedAssets.slice(0, 24).map((asset, index) => <div key={asset.assetId}><img src={asset.thumbnailUrl || asset.url} alt="" /><span>{String(index + 1).padStart(2, '0')}</span><button type="button" onClick={() => removePhoto(asset.assetId)} disabled={Boolean(busy)} aria-label={`Remove photograph ${index + 1}`}><Trash2 size={13} /></button></div>)}{orderedAssets.length > 24 && <div className="v-create-more">+{orderedAssets.length - 24}</div>}</div>}
            <div className="v-create-footer"><button type="button" onClick={() => setStep(1)}><ArrowLeft size={16} />Edit shoot details</button><button type="button" className="v-create-primary" onClick={analyzeShoot} disabled={!orderedAssets.length || Boolean(busy)}>{busy === 'analyze' ? progress.stage : 'Analyze the complete shoot'}{busy === 'analyze' ? <LoaderCircle className="v-spin" size={17} /> : <ArrowRight size={17} />}</button></div>
            {busy === 'analyze' && <Progress value={progress.value} label={progress.stage} />}
          </Stage> : step === 3 ? <Stage key="format">
            <StageHead eyebrow="03 / Format recommendation" title="The shoot has a direction." copy={delivery?.collectionAnalysis?.summary || 'Veylo has read the complete set. Choose the experience you want the client to receive.'} />
            <div className="v-format-recommendations">{recommendations.map((recommendation, index) => { const item = formats.find(format => format.id === recommendation.format); const Icon = item?.icon || LayoutTemplate; return <button type="button" key={recommendation.format} onClick={() => chooseFormat(recommendation.format)} disabled={Boolean(busy)} className={index === 0 ? 'is-recommended' : ''}><span className="v-format-rank">{String(index + 1).padStart(2, '0')}</span><Icon size={22} /><div><small>{index === 0 ? 'VEYLO RECOMMENDS' : item?.verb}</small><strong>{item?.name}</strong><p>{recommendation.reason}</p></div><b>{recommendation.score}</b></button>; })}</div>
            {busy === 'direct' && <Progress value={progress.value} label={progress.stage} />}
            <div className="v-create-footer"><button type="button" onClick={() => setStep(2)}><ArrowLeft size={16} />Back to photographs</button></div>
          </Stage> : step === 4 ? <Stage key="review">
            <StageHead eyebrow={`04 / Review the ${formatName(delivery?.format)}`} title="Check the order. Read every line." copy="Veylo proposes the direction. You decide what reaches your client. Edit any line and move any photograph before you publish." />
            <div className="v-review-opening"><label>Delivery title<input value={delivery?.creativeDirection?.title || ''} onChange={event => editDirection('title', event.target.value)} maxLength={80} /></label><label>Opening line<textarea value={delivery?.creativeDirection?.openingLine || ''} onChange={event => editDirection('openingLine', event.target.value)} maxLength={140} rows={3} /></label><label>Closing line<textarea value={delivery?.creativeDirection?.closingLine || ''} onChange={event => editDirection('closingLine', event.target.value)} maxLength={160} rows={3} /></label></div>
            <div className="v-review-revision"><div><ListChecks size={19} /><span><strong>Ask for another direction</strong><small>Choose photographs below for a focused change, or ask Veylo to rethink the complete delivery.</small></span></div><textarea value={revisionInstruction} onChange={event => setRevisionInstruction(event.target.value)} maxLength={600} placeholder="For example: make these captions warmer and keep the focus on her confidence in the second look." /><footer><span>{revisionIds.length} photograph{revisionIds.length === 1 ? '' : 's'} selected</span><button type="button" onClick={() => requestRevision('selected')} disabled={Boolean(busy) || !revisionIds.length}>Revise selected</button><button type="button" onClick={() => requestRevision('full')} disabled={Boolean(busy)}>Rethink full direction</button></footer>{busy === 'revise' && <Progress value={progress.value} label={progress.stage} />}</div>
            <div className="v-review-grid">{pageAssets.map((asset, localIndex) => { const index = reviewPage * 18 + localIndex; const frame = frameMap.get(asset.assetId) || {}; return <article key={asset.assetId}><button type="button" className={`v-review-select ${revisionIds.includes(asset.assetId) ? 'is-selected' : ''}`} onClick={() => toggleRevisionAsset(asset.assetId)}><Check size={13} />{revisionIds.includes(asset.assetId) ? 'Selected for revision' : 'Select for revision'}</button><div><img src={asset.thumbnailUrl || asset.url} alt="" /><span>{String(index + 1).padStart(2, '0')}</span><div><button type="button" onClick={() => movePhoto(asset.assetId, -1)} disabled={index === 0} aria-label="Move photograph earlier"><ChevronUp size={15} /></button><button type="button" onClick={() => movePhoto(asset.assetId, 1)} disabled={index === orderedAssets.length - 1} aria-label="Move photograph later"><ChevronDown size={15} /></button></div></div><label>Heading<input value={frame.headline || ''} onChange={event => editFrame(asset.assetId, 'headline', event.target.value)} maxLength={70} /></label><label>Caption<textarea value={frame.caption || ''} onChange={event => editFrame(asset.assetId, 'caption', event.target.value)} maxLength={180} rows={4} /></label><small>{frame.motion?.replaceAll('-', ' ')} · {frame.transition}</small></article>; })}</div>
            {orderedAssets.length > 18 && <div className="v-review-pages"><button onClick={() => setReviewPage(value => Math.max(0, value - 1))} disabled={reviewPage === 0}>Previous</button><span>{reviewPage + 1} / {Math.ceil(orderedAssets.length / 18)}</span><button onClick={() => setReviewPage(value => Math.min(Math.ceil(orderedAssets.length / 18) - 1, value + 1))} disabled={reviewPage >= Math.ceil(orderedAssets.length / 18) - 1}>Next</button></div>}
            <div className="v-create-footer"><button type="button" onClick={() => setStep(3)}><RefreshCw size={15} />Choose another format</button><button type="button" className="v-create-primary" onClick={saveReview} disabled={Boolean(busy)}>{busy === 'save' ? 'Saving your edits…' : 'Approve this direction'}<Check size={17} /></button></div>
          </Stage> : <Stage key="publish">
            {publishedUrl ? <div className="v-published"><span><Check size={25} /></span><p>CLIENT DELIVERY READY</p><h1>{delivery.title}</h1><small>Send one private link. Your client can open it on their phone without creating an account.</small><div><a className="v-create-primary" href={publishedUrl} target="_blank" rel="noreferrer">Open client view<ArrowRight size={17} /></a><button type="button" onClick={() => navigator.clipboard.writeText(publishedUrl).then(() => toast.success('Client link copied'))}>Copy client link</button><a href={`https://wa.me/?text=${encodeURIComponent(`Hello ${delivery.clientName}, your photographs are ready. Open your private delivery here:\n${publishedUrl}`)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a><button type="button" onClick={shareDelivery}><Share2 size={15} />Open share menu</button><button type="button" onClick={downloadQr}><QrCode size={15} />Download QR code</button></div><form className="v-published-email" onSubmit={sendDeliveryEmail}><label><Mail size={15} /><input type="email" value={clientEmail} onChange={event => setClientEmail(event.target.value)} required maxLength={254} placeholder="Client email address" /></label><button type="submit" disabled={busy === 'email'}>{busy === 'email' ? 'Sending…' : 'Send by email'}</button></form><Link to="/dashboard">Return to my deliveries</Link></div> : <>
              <StageHead eyebrow="05 / Client access" title="Choose what happens after you share." copy="Set privacy and download controls, then publish one link for your client." />
              <div className="v-publish-audio"><header><Music2 size={20} /><div><strong>Soundtrack</strong><span>{delivery?.creativeDirection?.music ? `The direction calls for ${delivery.creativeDirection.music.mood.toLowerCase()} ${delivery.creativeDirection.music.genre.toLowerCase()} at a ${delivery.creativeDirection.music.tempo} pace.` : 'Add a track that fits the approved direction.'}</span></div></header>{delivery?.soundtrack ? <div className="v-publish-track"><span><Music2 size={15} /><strong>{delivery.soundtrack.title}</strong><small>Added by you</small></span><button type="button" onClick={removeSoundtrack} disabled={busy === 'soundtrack'}><Trash2 size={15} />Remove</button></div> : <><label className="v-publish-rights"><input type="checkbox" checked={audioRights} onChange={event => setAudioRights(event.target.checked)} /><span>I own this track or have permission to use it in this client delivery.</span></label><div className="v-publish-track-form"><input value={audioTitle} onChange={event => setAudioTitle(event.target.value)} placeholder="Track title (optional)" maxLength={100} /><button type="button" onClick={() => audioInputRef.current?.click()} disabled={!audioRights || Boolean(busy)}><Upload size={15} />{busy === 'soundtrack' ? 'Adding track…' : 'Choose audio'}</button><input ref={audioInputRef} type="file" hidden accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac" onChange={event => addSoundtrack(event.target.files?.[0])} /></div></>}</div>
              <div className="v-publish-settings"><Toggle icon={LockKeyhole} label="Six-digit PIN" copy="Ask for a PIN before showing the client name, title, or photographs." checked={access.pinEnabled} onChange={value => setAccess(current => ({ ...current, pinEnabled: value }))}>{access.pinEnabled && <input value={access.pin} onChange={event => setAccess(current => ({ ...current, pin: event.target.value.replace(/\D/g, '').slice(0, 6) }))} inputMode="numeric" placeholder="000000" aria-label="Six-digit delivery PIN" />}</Toggle><label className="v-publish-expiry"><span>Link expiry</span><small>Leave empty when the delivery should stay open.</small><input type="date" value={access.expiresAt} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={event => setAccess(current => ({ ...current, expiresAt: event.target.value }))} /></label><Toggle icon={Image} label="Individual photo downloads" copy="Let the client download one photograph at a time." checked={access.allowIndividualDownloads} onChange={value => setAccess(current => ({ ...current, allowIndividualDownloads: value }))} /><Toggle icon={Clapperboard} label="Download the full gallery" copy="Let the client download every delivered photograph together." checked={access.allowDownloadAll} onChange={value => setAccess(current => ({ ...current, allowDownloadAll: value }))} /><Toggle icon={Check} label="Photo likes" copy="Let the client mark the photographs they love." checked={access.allowLikes} onChange={value => setAccess(current => ({ ...current, allowLikes: value }))} />{['photo-story', 'chapters'].includes(delivery?.format) && <Toggle icon={Play} label="Optional narration" copy="Use Deepgram to read the approved story lines in the delivery." checked={access.narration} onChange={value => setAccess(current => ({ ...current, narration: value }))} />}</div>
              {busy === 'publish' && progress.stage && <Progress value={progress.value} label={progress.stage} />}
              <div className="v-create-footer"><button type="button" onClick={() => setStep(4)}><ArrowLeft size={16} />Back to review</button><button type="button" className="v-create-primary" onClick={publish} disabled={Boolean(busy)}>{busy === 'publish' ? 'Preparing the client link…' : 'Publish client delivery'}<ArrowRight size={17} /></button></div>
            </>}
          </Stage>}
        </AnimatePresence>
      </main>
    </div>
    {libraryPicker && <div className="v-create-library-picker" role="presentation" onMouseDown={event => event.target === event.currentTarget && setLibraryPicker(false)}><section role="dialog" aria-modal="true" aria-label="Choose photographs from your library"><header><div><p>YOUR PRO LIBRARY</p><h2>Choose finished photographs</h2></div><button type="button" onClick={() => setLibraryPicker(false)}><X size={18} /></button></header>{libraryLoading ? <div className="v-create-library-state"><LoaderCircle className="v-spin" size={22} />Opening your library…</div> : libraryAssets.length ? <div className="v-create-library-grid">{libraryAssets.map(asset => <button type="button" key={asset._id} className={librarySelection.includes(asset._id) ? 'is-selected' : ''} onClick={() => toggleLibraryAsset(asset._id)}><img src={asset.thumbnailUrl || asset.url} alt={asset.originalFilename || 'Library photograph'} loading="lazy" /><span>{librarySelection.includes(asset._id) ? <Check size={15} /> : <Image size={15} />}</span></button>)}</div> : <div className="v-create-library-state"><Image size={22} />Your personal library is empty.</div>}<footer><span>{librarySelection.length} selected</span><button type="button" onClick={addFromLibrary} disabled={!librarySelection.length || busy === 'library'}>{busy === 'library' ? 'Adding photographs…' : 'Add to this delivery'}</button></footer></section></div>}
  </div>;
}
