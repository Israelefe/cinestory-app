import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Film, LockKeyhole, Eye, Play, Upload, ChevronUp, ChevronDown, Trash2, Copy, ExternalLink, MessageCircle, X, Crown } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { useAssistantWorkflow } from '../components/AssistantContext.jsx';
import VideoUploadQueue from '../components/video/VideoUploadQueue.jsx';
import VideoActivity, { VideoBusyIcon } from '../components/video/VideoActivity.jsx';
import VideoPreparation from '../components/video/VideoPreparation.jsx';
import { playbackReady, previewReady } from '../utils/videoQuality.js';
import VideoViewer from '../components/delivery/VideoViewer.jsx';
import { videoBytes, videoDuration, videoMediaUrl } from '../services/videoDelivery.js';
import './CreateVideoDelivery.css';
import '../components/video/VideoCreatorDetails.css';

const empty = { clientName: '', brief: '', presentation: { title: '', introduction: '', items: [], allowDownloads: true, playbackMode: 'adaptive', featuredAssetId: null } };
const complete = delivery => Boolean(delivery?.publishedAt || delivery?.video?.published || delivery?.status === 'published');
const formOf = delivery => delivery ? { clientName: delivery.clientName || '', brief: delivery.brief || '', presentation: { ...delivery.video.draft, playbackMode: delivery.status === 'published' ? delivery.video.draft.playbackMode || 'original' : 'adaptive', featuredAssetId: delivery.video.draft.featuredAssetId || null, items: delivery.video.draft.items.map(item => ({ assetId: String(item.assetId), title: item.title || '', description: item.description || '', posterSeconds: item.posterSeconds || 0, allowDownload: item.allowDownload ?? null })) } } : structuredClone(empty);
function VideoPreview({ deliveryId, onClose }) {
  const dialog = useRef(null); const [data, setData] = useState(null); const [error, setError] = useState(''); const [size, setSize] = useState('desktop'); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    dialog.current?.showModal(); const controller = new AbortController(); setError('');
    api.get(`/v1/videos/deliveries/${deliveryId}/preview`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setData(data.data); }).catch(failure => { if (!controller.signal.aborted) setError(apiMessage(failure, 'The preview could not be opened.')); });
    return () => controller.abort();
  }, [deliveryId, attempt]);
  const playback = useCallback(async (item, sessionId, signal) => (await api.post(`/v1/videos/deliveries/${deliveryId}/assets/${item.id}/playback`, sessionId ? { sessionId } : {}, { signal })).data.data, [deliveryId]);
  const endPlayback = useCallback(sessionId => api.post(`/v1/videos/deliveries/${deliveryId}/playback/end`, { sessionId }), [deliveryId]);
  return <dialog ref={dialog} className="vc-preview-dialog" onCancel={onClose}><div className="vc-preview-top"><div role="group" aria-label="Preview screen size">{['phone', 'tablet', 'desktop'].map(value => <button type="button" key={value} aria-pressed={size === value} onClick={() => setSize(value)}>{value}</button>)}</div><button type="button" onClick={onClose} aria-label="Close preview"><X size={20} /></button></div><p className="vc-preview-note">Your preview uses the same playback allowance as client viewing.</p><div className={'vc-preview-frame is-' + size}>{data ? <VideoViewer delivery={data} requestPlayback={playback} endPlayback={endPlayback} downloadUrl={item => videoMediaUrl(`/api/v1/videos/assets/${item.id}/download`)} /> : error ? <div className="vc-preview-note" role="alert"><p>{error}</p><button type="button" className="vc-subtle" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : <VideoActivity title="Opening preview..." detail="Loading the client view." />}</div></dialog>;
}
export default function CreateVideoDelivery({ user, initialDelivery }) {
  const reduced = useVeyloReducedMotion();
  const [uploadFacts, setUploadFacts] = useState({ uploading: false, failedUploads: 0 });
  const [delivery, setDelivery] = useState(initialDelivery || null); const [form, setForm] = useState(() => formOf(initialDelivery)); const [step, setStep] = useState(0); const [config, setConfig] = useState(null); const [entitlements, setEntitlements] = useState(null); const [status, setStatus] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [busyLabel, setBusyLabel] = useState(''); const [preview, setPreview] = useState(false); const [library, setLibrary] = useState(null); const [pin, setPin] = useState(''); const [changePin, setChangePin] = useState(false); const [expiry, setExpiry] = useState(initialDelivery?.access?.expiresAt?.slice(0, 10) || ''); const [accessDirty, setAccessDirty] = useState(false);
  const heading = useRef(null); const previousStep = useRef(0); const [refreshError, setRefreshError] = useState('');
  const current = useRef(form); const record = useRef(initialDelivery || null); const revision = useRef(initialDelivery?.video?.revision || 0); const saved = useRef(JSON.stringify(form)); const chain = useRef(Promise.resolve()); const creating = useRef(null); const mounted = useRef(true); const dragging = useRef(null);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const target = heading.current;
    target?.querySelector('h2')?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [step]);
  current.current = form;
  useAssistantWorkflow({ deliveryId: delivery?._id, kind: 'video', step: ['details', 'presentation', 'publish'][step], unsaved: JSON.stringify(form) !== saved.current, ...uploadFacts, busy, hasError: Boolean(error) });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { Promise.all([api.get('/v1/videos/config'), api.get('/v1/billing/status')]).then(([settings, account]) => { setConfig(settings.data.data); setEntitlements(account.data.data); }).catch(failure => setError(apiMessage(failure, 'We could not check video availability.'))); }, []);
  const serialize = useCallback(work => { const result = chain.current.catch(() => {}).then(work); chain.current = result; return result; }, []);
  const ensure = useCallback(async () => {
    if (record.current) return record.current;
    if (!creating.current) creating.current = api.post('/v1/videos/deliveries', {}).then(({ data }) => { record.current = data.data; revision.current = data.data.video.revision; if (mounted.current) setDelivery(data.data); window.history.replaceState(window.history.state, '', `/create?draft=${data.data._id}`); return data.data; }).catch(failure => { creating.current = null; throw failure; });
    return creating.current;
  }, []);
  const saveNow = useCallback(async () => {
    if (complete(record.current)) return record.current;
    const value = current.current; const content = JSON.stringify(value);
    if (content === saved.current && record.current) return record.current;
    const target = await ensure(); setStatus('Saving…');
    const { data } = await api.patch(`/v1/videos/deliveries/${target._id}`, { ...value, revision: revision.current });
    record.current = data.data; revision.current = data.data.video.revision; saved.current = content;
    if (mounted.current) { setDelivery(data.data); setStatus('Saved'); }
    return data.data;
  }, [ensure]);
  const save = useCallback(() => serialize(saveNow), [serialize, saveNow]);
  const refresh = useCallback(() => serialize(async () => {
    if (!record.current) return;
    const { data } = await api.get(`/v1/videos/deliveries/${record.current._id}`);
    const serverForm = formOf(data.data);
    if (JSON.stringify(current.current) === saved.current) { current.current = serverForm; saved.current = JSON.stringify(serverForm); if (mounted.current) setForm(serverForm); }
    else if (revision.current !== data.data.video.revision) throw new Error('This draft changed while you were editing. Reload it before saving your latest changes.');
    revision.current = data.data.video.revision; record.current = data.data; if (mounted.current) setDelivery(data.data);
  }), [serialize]);
  useEffect(() => {
    if (complete(delivery) || JSON.stringify(form) === saved.current || !config?.writeAvailable || entitlements?.plan !== 'pro' || busy) return;
    const timer = setTimeout(() => { void save().catch(failure => { if (mounted.current) { setStatus('Not saved'); setError(apiMessage(failure, 'Your latest changes could not be saved.')); } }); }, 1800);
    return () => clearTimeout(timer);
  }, [form, save, config, entitlements, busy, delivery?.status]);
  useEffect(() => {
    if (!delivery?._id || !delivery.assets?.some(asset => ['uploading', 'queued', 'verifying', 'processing', 'deleting', 'reserved'].includes(asset.state) || ['queued', 'running'].includes(asset.cover?.state) || ['queued', 'running'].includes(asset.adaptive?.state) || asset.state === 'ready' && !playbackReady(asset) && asset.adaptive?.state !== 'failed')) return;
    let stopped = false; let timer;
    const poll = async () => {
      try { await refresh(); if (!stopped) setRefreshError(''); }
      catch { if (!stopped) setRefreshError('Preparation status could not refresh. Your uploaded files are safe. Check your connection and try again.'); }
      if (!stopped) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [delivery, refresh]);
  useEffect(() => { const leave = event => { if (!complete(record.current) && JSON.stringify(current.current) !== saved.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, []);
  const initialize = useCallback(input => serialize(async () => {
    const target = await saveNow(); const { data } = await api.post(`/v1/videos/deliveries/${target._id}/uploads`, input);
    const updated = (await api.get(`/v1/videos/deliveries/${target._id}`)).data.data;
    revision.current = updated.video.revision; record.current = updated;
    const added = updated.video.draft.items.find(item => String(item.assetId) === data.data.assetId);
    if (added && !current.current.presentation.items.some(item => item.assetId === data.data.assetId)) {
      const next = { ...current.current, presentation: { ...current.current.presentation, items: [...current.current.presentation.items, { ...added, assetId: String(added.assetId) }] } };
      current.current = next; setForm(next); saved.current = JSON.stringify(formOf(updated));
    }
    setDelivery(updated); return { upload: data.data, deliveryId: target._id };
  }), [serialize, saveNow]);
  const removeUploadAsset = useCallback(assetId => serialize(async () => {
    const next = { ...current.current, presentation: { ...current.current.presentation, items: current.current.presentation.items.filter(item => item.assetId !== assetId), featuredAssetId: current.current.presentation.featuredAssetId === assetId ? null : current.current.presentation.featuredAssetId } };
    current.current = next; if (mounted.current) setForm(next); await saveNow();
  }), [serialize, saveNow]);
  function edit(patch) { setForm(value => ({ ...value, ...patch })); setError(''); }
  function present(patch) { setForm(value => ({ ...value, presentation: { ...value.presentation, ...patch } })); setError(''); }
  function editItem(assetId, patch) { setForm(value => ({ ...value, presentation: { ...value.presentation, items: value.presentation.items.map(item => item.assetId === assetId ? { ...item, ...patch } : item) } })); }
  function reorder(from, to) { if (to < 0 || to >= form.presentation.items.length || from === to) return; const items = [...form.presentation.items]; const [item] = items.splice(from, 1); items.splice(to, 0, item); present({ items }); }
  async function action(work, label = 'Saving changes...') { setBusy(true); setBusyLabel(label); setError(''); try { await work(); } catch (failure) { setStatus('Not saved'); setError(apiMessage(failure, 'This change could not be completed.')); } finally { setBusy(false); setBusyLabel(''); } }
  async function saveAccess() { if (!accessDirty) return; const target = await ensure(); const { data } = await api.patch(`/v1/videos/deliveries/${target._id}/access`, { ...(changePin ? { pin } : {}), expiresAt: expiry ? new Date(expiry + 'T23:59:59+01:00').toISOString() : null }); record.current = data.data; setDelivery(data.data); setAccessDirty(false); setChangePin(false); setPin(''); }
  const assets = new Map((delivery?.assets || []).map(asset => [asset.id, asset]));
  const activePro = entitlements?.plan === 'pro';
  const canWrite = activePro && config?.writeAvailable;
  const selected = form.presentation.items;
  function uploadRequirement() {
    if (!config || !entitlements) return 'Checking video availability…';
    if (!canWrite) return 'An active Pro plan and available video uploads are required.';
    if (uploadFacts.failedUploads) return 'Resume or remove the stopped uploads before continuing.';
    if (uploadFacts.uploading) return 'Keep this tab open until every upload finishes.';
    if (!selected.length) return 'Upload at least one video or choose one from your library.';
    if (selected.length > 10) return 'Choose up to 10 videos for this delivery.';
    if (selected.some(item => assets.get(item.assetId)?.state === 'failed')) return 'A video needs attention. Retry preparation or remove it before continuing.';
    if (selected.some(item => assets.get(item.assetId)?.state !== 'ready')) return 'Wait for video checks and cover preparation to finish. This page updates automatically.';
    return '';
  }
  const uploadIssue = uploadRequirement();
  const ready = !uploadIssue && selected.every(item => !['queued', 'running'].includes(assets.get(item.assetId)?.cover?.state) && playbackReady(assets.get(item.assetId)));
  const canPreview = !uploadIssue && selected.every(item => previewReady(assets.get(item.assetId)));
  function detailsRequirement() {
    if (uploadIssue) return uploadIssue;
    if (!form.presentation.title.trim()) return 'Add a delivery title before continuing.';
    if (selected.some(item => !item.title.trim())) return 'Give every video a title before continuing.';
    if (changePin && pin.length !== 6 && (pin.length > 0 || !delivery?.access?.hasPin)) return delivery?.access?.hasPin ? 'Enter all six PIN digits, or leave the PIN empty to remove it.' : 'Enter six PIN digits, or turn off PIN protection before continuing.';
    const expiryTime = new Date(expiry + 'T23:59:59+01:00').getTime();
    if (expiry && (!Number.isFinite(expiryTime) || expiryTime <= Date.now())) return 'Choose a link expiry date that has not passed.';
    if (selected.some(item => item.posterSeconds > (assets.get(item.assetId)?.duration || 10800))) return 'Choose cover frames within each video’s duration.';
    if (selected.some(item => assets.get(item.assetId)?.cover?.state === 'failed' && !assets.get(item.assetId)?.posterUrl)) return 'This video has no cover. Remove it and add it again in Upload.';
    return '';
  }
  const detailsIssue = detailsRequirement();
  const stepIssue = step === 0 ? uploadIssue : detailsIssue;
  async function goToStep(target) {
    if (complete(delivery) || busy || target === step) return;
    if (target < step) { setStep(target); return; }
    const issue = target === 2 ? detailsIssue : target === 1 ? uploadIssue : '';
    if (issue) { setError(issue); return; }
    await action(async () => { await save(); if (step === 1 || target === 2) await saveAccess(); setStep(target); }, 'Opening next step...');
  }
  const shareUrl = delivery?.publicId ? `${window.location.origin}/v/${delivery.publicId}` : '';
  const steps = [['Upload', Upload], ['Details', Film], ['Preview & send', Eye]];
  const preparedCount = form.presentation.items.filter(item => playbackReady(assets.get(item.assetId))).length;
  const retry = assetId => action(async () => { await api.post(`/v1/videos/assets/${assetId}/retry`, {}); await refresh(); });
  if (complete(delivery)) return <main className="vc-page vc-completed"><motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }} className="vc-complete-card">
    <span className="vc-complete-check"><Check size={30} /></span><p>VIDEO DELIVERY</p><h1>{delivery.status === 'published' ? 'Your delivery is ready.' : 'This delivery has been created.'}</h1><p>{delivery.video.published?.title || form.presentation.title}</p><span className="vc-complete-detail">{delivery.status === 'published' ? 'Your client link is ready to share. Manage this delivery from your dashboard.' : 'This client link is closed. Return to your dashboard to manage the delivery.'}</span>
    {delivery.status === 'published' && <><a className="vc-open-client" href={shareUrl} target="_blank" rel="noreferrer">Open delivery<ExternalLink size={18} /></a>
    <div className="vc-complete-share"><button type="button" onClick={() => action(async () => { await navigator.clipboard.writeText(shareUrl); setStatus('Client link copied'); })}><Copy size={17} />Copy link</button><a href={'https://wa.me/?text=' + encodeURIComponent(`Your videos are ready: ${shareUrl}`)} target="_blank" rel="noreferrer"><MessageCircle size={17} />Share on WhatsApp</a></div></>}
    {status === 'Client link copied' && <p role="status">Client link copied</p>}{error && <p role="alert">{error}</p>}
    <Link className="vc-primary vc-dashboard-return" to="/dashboard" replace><ArrowLeft size={17} />Back to dashboard</Link>
  </motion.section></main>;
  return <main className="vc-page vc-simple">
    <header className="vc-top"><Link to="/dashboard"><ArrowLeft size={17} />Dashboard</Link><span><Film size={17} />VIDEO DELIVERY</span><div role="status">{(status === 'Saving…') && <VideoBusyIcon />}{status || (delivery ? 'Saved draft' : 'New draft')}</div></header>
    <div className="vc-shell"><aside className="vc-sidebar"><p>YOUR FINISHED VIDEOS</p><h1>Your video delivery.</h1><nav className="vc-steps" aria-label="Video creation steps">{steps.map(([label, Icon], index) => <button type="button" key={label} className={step === index ? 'is-active' : ''} aria-current={step === index ? 'step' : undefined} disabled={busy || (index > step && Boolean(index === 2 ? detailsIssue : uploadIssue))} onClick={() => void goToStep(index)}><span>{(index === 0 && !uploadIssue) || (index === 1 && !detailsIssue) ? <Check size={16} /> : <Icon size={16} />}</span><strong>{label}</strong><small>{index + 1}</small></button>)}</nav><div className="vc-limits"><span>10 videos per delivery</span><span>Up to 5 GB each</span><Link to="/videos/library">Your video library<ArrowRight size={14} /></Link></div></aside>
    <section className="vc-workspace">
      {busy && <VideoActivity title={busyLabel} />}
      {refreshError && <div className="vc-status-refresh" role="alert"><p>{refreshError}</p><button type="button" className="vc-subtle" disabled={busy} onClick={() => action(async () => { await refresh(); setRefreshError(''); })}>Refresh status</button></div>}
      {error && <div className="vc-error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={17} /></button></div>}
      {config && (!activePro || !config.writeAvailable) && <div className="vc-availability"><Crown size={23} /><h2>{!activePro ? 'Video delivery is included in Pro.' : 'Video uploads are temporarily unavailable.'}</h2><p>{!activePro ? 'Upload finished videos and send your client a private link with Pro.' : 'Your saved draft is safe. Please try again shortly.'}</p>{!activePro && <Link to="/billing">View Pro<ArrowRight size={16} /></Link>}</div>}
      <motion.div key={step} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }}>
      {step === 0 && <>
        <div className="vc-section-heading" ref={heading}><p>STEP 1 OF 3</p><h2 tabIndex={-1}>Add your finished videos.</h2><span>Upload from your device or choose a video you have already stored.</span></div>
        <VideoUploadQueue deliveryId={delivery?._id} assets={delivery?.assets?.filter(asset => selected.some(item => item.assetId === asset.id))} selectedCount={selected.length} initialize={initialize} onRefresh={refresh} onRemoveAsset={removeUploadAsset} onState={setUploadFacts} disabled={!canWrite} maxBytes={config?.maxFileBytes} accountTransfers={config?.accountTransfers} statusUnavailable={Boolean(refreshError)} />
        <button type="button" className="vc-subtle" disabled={busy} onClick={() => action(async () => { await save(); setLibrary((await api.get('/v1/videos/assets')).data.data); }, 'Opening your video library...')}><Film size={17} />Choose from your video library</button>
        {library && <div className="vc-library-picker"><div><h3>Your ready videos</h3><button type="button" onClick={() => setLibrary(null)} aria-label="Close video library"><X size={18} /></button></div>{library.assets.filter(asset => asset.state === 'ready').map(asset => <button type="button" key={asset.id} disabled={form.presentation.items.some(item => item.assetId === asset.id) || form.presentation.items.length >= 10} onClick={() => present({ items: [...form.presentation.items, { assetId: asset.id, title: asset.filename.replace(/\.[^.]+$/, '').slice(0, 100), description: '', posterSeconds: 0, allowDownload: null }] })}><Film size={18} /><span>{asset.filename}<small>{videoDuration(asset.duration)} / {videoBytes(asset.bytes)}</small></span><span>{form.presentation.items.some(item => item.assetId === asset.id) ? 'Added' : 'Add'}</span></button>)}{!library.assets.some(asset => asset.state === 'ready') && <p>No ready videos in your library yet.</p>}{library.nextCursor && <button type="button" onClick={() => action(async () => { const next = (await api.get('/v1/videos/assets', { params: { cursor: library.nextCursor } })).data.data; setLibrary(current => ({ ...next, assets: [...current.assets, ...next.assets] })); })}>Load more videos</button>}</div>}
        <div className="vc-upload-guide"><strong>Playback is prepared automatically.</strong><p>After uploading, Veylo checks each video, creates its cover and prepares its playback qualities, up to your uploaded resolution. Add your delivery details while preparation runs. Your original stays unchanged.</p></div>
      </>}
      {step === 1 && <>
        <div className="vc-section-heading" ref={heading}><p>STEP 2 OF 3</p><h2 tabIndex={-1}>A few details for your client.</h2><span>Name the delivery, check the video order and choose what your client can download.</span></div>
        <div className="vc-fields"><label className="is-wide">Delivery title<input maxLength={120} value={form.presentation.title} onChange={event => present({ title: event.target.value })} placeholder="Ada & Emeka - the wedding films" /></label><label className="is-wide">A message for your client <small>Optional</small><textarea rows={3} maxLength={1500} value={form.presentation.introduction} onChange={event => present({ introduction: event.target.value })} placeholder="Your wedding films are ready. We hope you enjoy watching them." /></label></div>
        <section className="vc-quality"><h3>Playback prepares itself.</h3><p>Clients start on Auto. The player chooses a suitable quality for their connection, and they can select a quality themselves. Veylo prepares 720p, 1080p, 2K and 4K where supported by your upload.</p><div className="vc-preparation-summary" role="status"><Check size={17} /><span>{preparedCount} of {selected.length} videos ready{preparedCount < selected.length ? ' · Preparation continues while you add details' : ' · All playback qualities prepared'}</span></div></section>
        <div className="vc-list-heading"><h3>Your videos</h3><span>{form.presentation.items.length} / 10</span></div>
        {!form.presentation.items.length && <p className="vc-empty">Add a video in the Upload step first.</p>}
        <div className="vc-video-list">{form.presentation.items.map((item, index) => { const asset = assets.get(item.assetId); return <article className="vc-video-card" key={item.assetId} draggable onDragStart={() => { dragging.current = index; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); reorder(dragging.current, index); dragging.current = null; }}>
          <div className="vc-video-poster">{asset?.posterUrl && asset.state === 'ready' ? <img src={videoMediaUrl(asset.posterUrl)} alt="" /> : <Film size={30} />}<span>{asset?.state === 'ready' ? videoDuration(asset.duration) : asset?.state === 'failed' ? 'Needs attention' : 'Preparing video'}</span></div>
          <div className="vc-video-edit"><div className="vc-video-tools"><small>VIDEO {index + 1}{form.presentation.featuredAssetId === item.assetId || (!form.presentation.featuredAssetId && index === 0) ? ' / OPENS FIRST' : ''}</small><div><button type="button" disabled={index === 0} onClick={() => reorder(index, index - 1)} aria-label={`Move video ${index + 1} up`}><ChevronUp size={17} /></button><button type="button" disabled={index === form.presentation.items.length - 1} onClick={() => reorder(index, index + 1)} aria-label={`Move video ${index + 1} down`}><ChevronDown size={17} /></button><button type="button" onClick={() => present({ items: form.presentation.items.filter(row => row.assetId !== item.assetId), featuredAssetId: form.presentation.featuredAssetId === item.assetId ? null : form.presentation.featuredAssetId })} aria-label={`Remove video ${index + 1} from this delivery`}><Trash2 size={15} /></button></div></div>
            <label>Video title<input value={item.title} maxLength={100} onChange={event => editItem(item.assetId, { title: event.target.value })} /></label>
            <label>Description <small>Optional</small><textarea rows={2} value={item.description} maxLength={2000} onChange={event => editItem(item.assetId, { description: event.target.value })} placeholder="What should your client know about this video?" /></label>
            <VideoPreparation asset={asset} statusUnavailable={Boolean(refreshError)} disabled={busy} onRetry={() => action(async () => { await save(); await api.post(`/v1/videos/assets/${item.assetId}/adaptive`, {}); await refresh(); })} />
            {asset?.cover?.state === 'failed' && asset.posterUrl && <p className="vc-step-note">The cover change could not finish. The existing cover will be used.</p>}
            {asset?.errorMessage && <div className="vc-error"><p>{asset.errorMessage}</p><button type="button" disabled={busy} onClick={() => retry(item.assetId)}>Retry preparation</button></div>}
            <button type="button" className="vc-opening" aria-pressed={form.presentation.featuredAssetId === item.assetId || (!form.presentation.featuredAssetId && index === 0)} onClick={() => present({ featuredAssetId: item.assetId })}>{form.presentation.featuredAssetId === item.assetId || (!form.presentation.featuredAssetId && index === 0) ? <Check size={17} /> : <Play size={17} />}<span>{form.presentation.featuredAssetId === item.assetId || (!form.presentation.featuredAssetId && index === 0) ? 'Opens first' : 'Open this video first'}</span></button>
              <label>Download for this video<select value={item.allowDownload === null ? 'default' : item.allowDownload ? 'allow' : 'deny'} onChange={event => editItem(item.assetId, { allowDownload: event.target.value === 'default' ? null : event.target.value === 'allow' })}><option value="default">Use delivery setting</option><option value="allow">Allow download</option><option value="deny">Playback only</option></select></label>
          </div></article>; })}</div>
        <section className="vc-sharing"><h3>Downloads & privacy</h3><label className="vc-check"><input type="checkbox" checked={form.presentation.allowDownloads} onChange={event => present({ allowDownloads: event.target.checked })} /><span>Let your client download the original videos<small>Turn this off if you want playback only.</small></span></label>
          <details className="vc-options"><summary><LockKeyhole size={15} />PIN & link expiry <small>Optional</small><ChevronDown size={15} /></summary><div className="vc-options-body"><label className="vc-check"><input type="checkbox" checked={changePin} onChange={event => { setChangePin(event.target.checked); setAccessDirty(true); }} /><span>{delivery?.access?.hasPin ? 'Change or remove the current PIN' : 'Protect this link with a PIN'}</span></label>{changePin && <label>Six-digit PIN <small>{delivery?.access?.hasPin ? "Leave empty to remove the PIN" : "Enter six digits to protect this link"}</small><input type="password" autoComplete="new-password" inputMode="numeric" maxLength={6} value={pin} onChange={event => { setPin(event.target.value.replace(/\D/g, '')); setAccessDirty(true); }} /></label>}<label>Link expiry <small>Optional</small><input type="date" value={expiry} min={new Date().toISOString().slice(0, 10)} onChange={event => { setExpiry(event.target.value); setAccessDirty(true); }} /></label>{delivery?.status === 'published' && <p className="vc-private-note">PIN and expiry changes take effect on the current link when you continue.</p>}</div></details>
        </section>
        <details className="vc-options"><summary>Private notes<ChevronDown size={15} /></summary><div className="vc-options-body vc-fields"><label>Client name<input maxLength={100} value={form.clientName} onChange={event => edit({ clientName: event.target.value })} /></label><label>Notes for this delivery<textarea rows={3} maxLength={3000} value={form.brief} onChange={event => edit({ brief: event.target.value })} /></label><p className="vc-private-note">Only you can see these notes.</p></div></details>
      </>}
      {step === 2 && <>
        <div className="vc-section-heading" ref={heading}><p>STEP 3 OF 3</p><h2 tabIndex={-1}>Take a look. Then send it.</h2><span>Check the client view before creating your link.</span></div>
        <div className="vc-publish-summary"><Film size={28} /><h3>{form.presentation.title || 'Add a delivery title in Details'}</h3><p>{form.presentation.items.length} {form.presentation.items.length === 1 ? 'video' : 'videos'} / {ready ? 'Ready for playback' : `${preparedCount} ready`}</p><div><span>{delivery?.access?.hasPin ? 'PIN protected' : 'Anyone with the link'}</span><span>{form.presentation.allowDownloads ? 'Downloads enabled' : 'Playback only'}</span><span>Auto quality</span>{expiry && <span>Expires {expiry}</span>}</div>
          {!ready && <p className="vc-step-note">{!form.presentation.items.length ? 'Add a video in Upload first.' : form.presentation.items.some(item => assets.get(item.assetId)?.state === 'failed') ? 'A video needs attention. Return to Upload to retry preparation.' : 'Playback qualities are still being prepared. This page updates automatically.'}</p>}
          {!form.presentation.title.trim() && <p className="vc-step-note">Add a delivery title in Details before sending.</p>}
          {form.presentation.items.some(item => !item.title.trim()) && <p className="vc-step-note">Give each video a title in Details before sending.</p>}
          <button type="button" className="vc-subtle" disabled={Boolean(detailsIssue) || !canPreview || busy} onClick={() => action(async () => { if (detailsIssue || !canPreview) return; const value = await save(); await saveAccess(); if (value) setPreview(true); }, 'Opening preview...')}><Eye size={17} />Preview client view</button>
          <button type="button" className="vc-primary" disabled={Boolean(detailsIssue) || !ready || busy} onClick={() => action(async () => { if (detailsIssue || !ready) return; const value = await save(); await saveAccess(); const { data } = await api.post(`/v1/videos/deliveries/${value._id}/publish`, { revision: revision.current }); record.current = data.data; revision.current = data.data.video.revision; setDelivery(data.data); setStatus('Client link ready'); }, 'Creating client link...')}>{busy && <VideoBusyIcon />}{busy ? busyLabel : !ready ? 'Preparing playback qualities...' : 'Create client link'}<ArrowRight size={17} /></button>
        </div>
      </>}
      </motion.div>
      {stepIssue && <p id="vc-step-requirement" className="vc-step-requirement" role="status">{stepIssue}</p>}
      <footer className="vc-bottom"><button type="button" disabled={busy} className="vc-subtle" onClick={() => action(async () => { await save(); await saveAccess(); })}>{busy ? <VideoBusyIcon /> : <Check size={16} />}Save draft</button><div>{step > 0 && <button type="button" className="vc-subtle" disabled={busy} onClick={() => void goToStep(step - 1)}><ArrowLeft size={16} />Back</button>}{step < 2 && <button type="button" className="vc-primary" disabled={busy || Boolean(stepIssue)} aria-describedby={stepIssue ? 'vc-step-requirement' : undefined} onClick={() => void goToStep(step + 1)}>{step === 0 ? 'Add details' : 'Preview & send'}{busy ? <VideoBusyIcon /> : <ArrowRight size={16} />}</button>}</div></footer>
    </section></div>{preview && delivery && <VideoPreview deliveryId={delivery._id} onClose={() => setPreview(false)} />}
  </main>;
}
