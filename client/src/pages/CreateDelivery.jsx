import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Copy, ExternalLink, Film, Image, LoaderCircle, Mic2, PencilLine, Plus, RefreshCw, Upload, X } from 'lucide-react';
import api from '../services/api.js';
import { API_BASE_URL } from '../config/env.js';
import { transferDeliveryPhotos } from '../utils/deliveryTransfer.js';
import { FORMAT_REGISTRY, formatName } from '../constants/formatRegistry.jsx';
import { SHOOT_TYPES } from '../constants/shootTypes.js';
import { getDeliveryCapabilities } from '../constants/deliveryCapabilities.js';
import PresentationViewer from '../components/delivery/PresentationViewer.jsx';
import './CreateDeliveryV3.css';

const Legacy = lazy(() => import('./LegacyCreateDelivery.jsx'));
const detailsOf = d => ({ clientName: d.clientName || '', shootType: d.shootType || '', brief: d.brief || '' });
const editOf = d => ({ revisionId: d.draftRevisionId, title: d.title || '', openingLine: d.creativeDirection?.openingLine || '', closingLine: d.creativeDirection?.closingLine || '', frames: (d.creativeDirection?.frames || []).map(f => ({ assetId: f.assetId, caption: f.caption || '', durationSec: f.durationSec || 4.2 })), soundtrackId: d.soundtrack?.catalogId || null, usageTerms: d.formatConfig?.usageTerms || '' });
const safeError = e => e.response?.data?.message || 'Your saved work is unchanged. Check your connection and try again.';
const audioUrl = value => value?.startsWith('/api/') ? `${API_BASE_URL.replace(/\/$/, '')}${value.slice(4)}` : value;

export default function CreateDelivery(props) {
  const [params] = useSearchParams();
  const draft = params.get('draft');
  const [initial, setInitial] = useState(null);
  const [version, setVersion] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    (draft ? api.get(`/v1/deliveries/${draft}`) : api.get('/v1/deliveries/configuration')).then(response => {
      if (!active) return;
      if (draft) { setInitial(response.data.data); setVersion(response.data.data.schemaVersion || 2); }
      else setVersion(response.data.data.pipelineVersion);
    }).catch(e => { if (active) setError(safeError(e)); });
    return () => { active = false; };
  }, [draft]);
  if (error) return <main className="dc-page"><p role="alert">{error}</p><Link to="/dashboard">Back to deliveries</Link></main>;
  if (!version) return <main className="dc-page"><p role="status">Opening your delivery…</p></main>;
  if (version < 3) return <Suspense fallback={<p>Opening your draft…</p>}><Legacy {...props} /></Suspense>;
  return <DeliveryWorkspace initial={initial} />;
}

function DeliveryWorkspace({ initial }) {
  const [, setParams] = useSearchParams();
  const [delivery, setDelivery] = useState(initial);
  const [details, setDetails] = useState(initial ? detailsOf(initial) : detailsOf({}));
  const [step, setStep] = useState(initial?.creativeDirection ? 'review' : 'shoot');
  const [format, setFormat] = useState(initial?.format || '');
  const [recommendation, setRecommendation] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [enhancement, setEnhancement] = useState('');
  const [customDetail, setCustomDetail] = useState('');
  const [busy, setBusy] = useState('');
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('');
  const [upload, setUpload] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState([]);
  const [preparation, setPreparation] = useState(null);
  const [editor, setEditor] = useState(initial?.creativeDirection ? editOf(initial) : null);
  const [dirty, setDirty] = useState(false);
  const [panel, setPanel] = useState('preview');
  const [tracks, setTracks] = useState([]);
  const [library, setLibrary] = useState(null);
  const [access, setAccess] = useState({ expiresAt: '', allowIndividualDownloads: true, allowDownloadAll: true, allowLikes: true, downloadsLocked: false, downloadLockNote: '', watermarkEnabled: false, watermarkText: '', narration: Boolean(initial?.narration), ...initial?.access });
  const [shareUrl, setShareUrl] = useState('');
  const [reviewedRevision, setReviewedRevision] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const current = useRef(initial), dirtyRef = useRef(false), pendingSave = useRef(null), fileInput = useRef(null), assessmentKey = useRef(''), detailRef = useRef(details);
  detailRef.current = details;
  const readyDetails = details.clientName.trim().length >= 2 && details.shootType && details.brief.trim();
  const setCurrent = data => { current.current = data; setDelivery(data); if (!dirtyRef.current) setEditor(data.creativeDirection ? editOf(data) : null); };
  const refresh = async () => {
    if (!current.current?._id) return null;
    const data = (await api.get(`/v1/deliveries/${current.current._id}`)).data.data;
    setCurrent(data); return data;
  };
  const saveDetails = async () => {
    if (pendingSave.current) await pendingSave.current;
    const values = { ...detailRef.current };
    if (values.clientName.trim().length < 2 || !values.shootType || !values.brief.trim()) return null;
    if (current.current && JSON.stringify(detailsOf(current.current)) === JSON.stringify(values)) return current.current;
    setSaveState('Saving…');
    const promise = (async () => {
      const response = current.current ? await api.patch(`/v1/deliveries/${current.current._id}/details`, values) : await api.post('/v1/deliveries', values);
      const data = response.data.data; setCurrent(data); setParams({ draft: data._id }, { replace: true }); setSaveState('Saved'); return data;
    })();
    pendingSave.current = promise;
    try { return await promise; } finally { if (pendingSave.current === promise) pendingSave.current = null; }
  };
  useEffect(() => {
    if (!readyDetails) return;
    const timer = setTimeout(() => saveDetails().catch(e => { setSaveState('Not saved'); setError(safeError(e)); }), 900);
    return () => clearTimeout(timer);
  }, [details.clientName, details.shootType, details.brief]);
  useEffect(() => {
    if (!delivery?._id) return;
    let active = true, timer;
    const poll = async () => {
      try {
        const status = (await api.get(`/v1/deliveries/${delivery._id}/preparation`)).data.data;
        if (!active) return;
        setPreparation(status);
        if (status.state !== 'uploading') {
          const data = (await api.get(`/v1/deliveries/${delivery._id}`)).data.data;
          if (active) {
            const changed = String(current.current?.draftRevisionId) !== String(data.draftRevisionId);
            current.current = data; setDelivery(data);
            if (!dirtyRef.current && data.creativeDirection && changed) setEditor(editOf(data));
          }
        }
      } catch { /* Recover automatically on the next poll; retain the saved preview. */ }
      finally { if (active) timer = setTimeout(poll, document.hidden ? 10000 : 2000); }
    };
    poll(); return () => { active = false; clearTimeout(timer); };
  }, [delivery?._id]);
  useEffect(() => { api.get('/v1/deliveries/soundtracks').then(r => setTracks(r.data.data)).catch(() => {}); }, []);
  useEffect(() => {
    const beforeUnload = e => { if (dirtyRef.current || uploading) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [uploading]);
  const act = async (name, task) => { setBusy(name); setError(''); try { return await task(); } catch (e) { setError(safeError(e)); return null; } finally { setBusy(''); } };
  const assist = async mode => {
    const task = async () => {
    const source = { ...detailRef.current };
    const result = (await api.post('/v1/deliveries/brief/direction', { ...source, mode })).data.data;
    if (JSON.stringify(source) !== JSON.stringify(detailRef.current)) return;
    if (mode === 'enhance') setEnhancement(result.suggestedBrief);
    else { setAdvice(result); setRecommendation(result.recommendedFormat); assessmentKey.current = JSON.stringify(source); }
    };
    if (mode === 'enhance') return act(mode, task);
    setAssessing(true);
    try { await task(); } catch { /* Brief advice is optional; upload and preparation remain available. */ }
    finally { setAssessing(false); }
  };
  const checkBrief = () => { if (readyDetails && !assessing && assessmentKey.current !== JSON.stringify(details)) assist('assess'); };
  const appendDetail = value => { setDetails(d => ({ ...d, brief: `${d.brief.trim()}\n${value.trim()}`.slice(0, 3000) })); setAdvice(null); setCustomDetail(''); };
  const uploadFiles = async fileList => {
    const files = [...fileList].filter(f => /\.(jpe?g|png|webp)$/i.test(f.name) && f.size <= 50 * 1024 * 1024);
    if (files.length !== fileList.length) setError('Use JPEG, PNG or WebP files, up to 50 MB each. Other files were not added.');
    if (!files.length) return;
    setUploading(true);
    try {
      const draft = await saveDetails();
      if (!draft) { setError('Add the client name, shoot type and brief before uploading.'); return; }
      const startOrder = Math.max(-1, ...draft.assets.map(a => a.sortOrder)) + 1;
      const failures = await transferDeliveryPhotos(draft._id, files, { startOrder, onProgress: setUpload, onConfirmed: asset => {
        const data = current.current;
        if (data && !data.assets.some(a => a.assetId === asset.assetId)) setCurrent({ ...data, assets: [...data.assets, asset].sort((a, b) => a.sortOrder - b.sortOrder) });
      } });
      setFailed(failures); await refresh();
    } catch (e) { setError(safeError(e)); } finally { setUploading(false); }
  };
  const prepare = () => act('prepare', async () => {
    const draft = await saveDetails(); if (!draft || !format) return;
    await api.post(`/v1/deliveries/${draft._id}/prepare`, { format, revisionId: draft.draftRevisionId || null });
    dirtyRef.current = false; setDirty(false);
    const data = await refresh(); setEditor(editOf(data)); setStep('review'); setPanel('preview');
    setPreparation({ state: 'working', kind: 'prepare', message: 'Preparing your presentation. You can leave this page and come back.' });
  });
  const changeEditor = next => { setEditor(next); setDirty(true); dirtyRef.current = true; };
  const saveEditor = async () => {
    if (!editor) return null;
    if (!dirtyRef.current) return { ...current.current, draftRevisionId: editor.revisionId };
    await api.patch(`/v1/deliveries/${delivery._id}/presentation`, editor);
    dirtyRef.current = false; setDirty(false); return refresh();
  };
  const reviewForSharing = () => act('review-save', async () => {
    const data = await saveEditor(); setReviewedRevision(data.draftRevisionId); setStep('share');
  });
  const regenerate = assetId => act(`caption:${assetId}`, async () => {
    const data = await saveEditor();
    await api.post(`/v1/deliveries/${data._id}/presentation/caption`, { revisionId: data.draftRevisionId, assetId });
    setPreparation({ state: 'working', kind: 'caption', message: 'Writing a new caption. Your current caption stays here until it is ready.' });
  });
  const narrate = () => act('narration', async () => {
    const data = await saveEditor();
    await api.post(`/v1/deliveries/${data._id}/presentation/narration`, { revisionId: data.draftRevisionId });
    setPreparation({ state: 'working', kind: 'narration', message: 'Recording the approved story text.' });
  });
  const publish = () => act('publish', async () => {
    const data = await saveEditor();
    const { pin, expiresAt = '', allowIndividualDownloads, allowDownloadAll, allowLikes, downloadsLocked, downloadLockNote = '', watermarkEnabled, watermarkText = '', narration } = access;
    const response = await api.post(`/v1/deliveries/${data._id}/presentation/publish`, { revisionId: reviewedRevision || data.draftRevisionId, pin, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : '', allowIndividualDownloads, allowDownloadAll, allowLikes, downloadsLocked, downloadLockNote, watermarkEnabled, watermarkText, narration });
    setShareUrl(response.data.data.url); setStep('shared'); await refresh();
  });
  const loadLibrary = () => act('library', async () => setLibrary((await api.get('/v1/storage')).data.data || []));
  const addLibrary = id => act('library-add', async () => {
    const data = await saveDetails(); if (!data) return;
    await api.post(`/v1/deliveries/${data._id}/uploads/from-library`, { assetIds: [id] }); await refresh(); setLibrary(items => items.filter(item => item._id !== id));
  });
  const assets = delivery?.assets || [];
  const narrationText = editor && [editor.openingLine, editor.closingLine, ...editor.frames.map(frame => frame.caption)].some(text => text?.trim().length >= 8);
  const working = preparation?.state === 'working';
  const capabilities = getDeliveryCapabilities(format || delivery?.format);
  const chosenTrack = tracks.find(t => t.id === editor?.soundtrackId);
  const preview = editor && delivery ? { ...delivery, title: editor.title, narration: access.narration ? delivery.narration : null,
    soundtrack: editor.soundtrackId ? delivery.soundtrack?.catalogId === editor.soundtrackId ? delivery.soundtrack : { ...chosenTrack, url: chosenTrack?.previewUrl } : null,
    presentationOrder: editor.frames.map(f => f.assetId), creativeDirection: { ...delivery.creativeDirection, ...editor, frames: editor.frames.map(f => ({ ...delivery.creativeDirection?.frames?.find(old => old.assetId === f.assetId), ...f })) } } : delivery;

  return <main className="dc-page">
    <header className="dc-top"><Link to="/dashboard"><ArrowLeft size={18} />Deliveries</Link><span role="status">{saveState || (delivery ? 'Draft saved' : 'New delivery')}</span></header>
    <nav className="dc-steps" aria-label="Create delivery">
      <button aria-current={step === 'shoot' ? 'step' : undefined} onClick={() => setStep('shoot')}>01 <span>Shoot & photographs</span></button>
      <button disabled={!editor} aria-current={step === 'review' ? 'step' : undefined} onClick={() => setStep('review')}>02 <span>Review</span></button>
      <button disabled={!editor || Boolean(busy)} aria-current={step === 'share' || step === 'shared' ? 'step' : undefined} onClick={() => shareUrl ? setStep('shared') : reviewForSharing()}>03 <span>Share</span></button>
    </nav>
    {error && <div className="dc-notice" role="alert"><p>{error}</p><button onClick={() => setError('')} aria-label="Dismiss message"><X size={18} /></button></div>}
    {step === 'shoot' && <>
      <div className="dc-heading"><p>THE FINISHED SHOOT</p><h1>Make the first viewing count.</h1><span>Tell us what this shoot is about. Add the photographs your client is ready to receive.</span></div>
      <div className="dc-compose">
        <section className="dc-card dc-brief">
          <label>Client or project name<input value={details.clientName} maxLength={100} placeholder="Ada" onChange={e => setDetails({ ...details, clientName: e.target.value })} /></label>
          <label>Type of shoot<select value={details.shootType} onChange={e => setDetails({ ...details, shootType: e.target.value })}><option value="">Choose a shoot type</option>{SHOOT_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
          <label>The brief<textarea aria-label="The brief" rows={5} maxLength={3000} value={details.brief} placeholder="Ada’s 30th birthday shoot. A personal celebration of turning 30, with a warm, confident tone." onChange={e => { setDetails({ ...details, brief: e.target.value }); setEnhancement(''); }} onBlur={checkBrief} /></label>
          <div className="dc-brief-actions"><button disabled={!readyDetails || Boolean(busy)} onClick={() => assist('enhance')}>{busy === 'enhance' ? <LoaderCircle className="dc-spin" size={17} /> : <PencilLine size={17} />}Enhance brief</button><small>Your meaning stays at the centre.</small></div>
          {enhancement && <div className="dc-assist"><h3>Enhanced brief</h3><p>{enhancement}</p><div className="dc-inline"><button onClick={() => { setDetails({ ...details, brief: enhancement }); setEnhancement(''); }}>Use this brief <Check size={16} /></button><button onClick={() => setEnhancement('')}>Keep original</button></div></div>}
          {advice && !advice.ready && <div className="dc-assist"><h3>A little more direction</h3><p>{advice.reason}</p><div className="dc-choices">{advice.choices.map(choice => <button key={choice} onClick={() => appendDetail(choice)}>{choice}<Plus size={17} /></button>)}</div><label>Add your own detail<input maxLength={300} value={customDetail} onChange={e => setCustomDetail(e.target.value)} placeholder="Something else you want the presentation to say" /></label><div className="dc-inline"><button disabled={!customDetail.trim()} onClick={() => appendDetail(customDetail)}>Add detail</button><button onClick={() => setAdvice(null)}>Use my brief as written</button></div></div>}
        </section>
        <section className="dc-card dc-upload" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!uploading && readyDetails) uploadFiles(e.dataTransfer.files); }}>
          <div className="dc-upload-heading"><Image size={24} /><h2>Finished photographs</h2><p>The full collection stays available in the gallery. The showcase uses a shorter selection.</p></div>
          <input ref={fileInput} hidden type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e => { uploadFiles(e.target.files); e.target.value = ''; }} />
          <button className="dc-primary" disabled={!readyDetails || uploading} onClick={() => fileInput.current?.click()}><Upload size={18} />{uploading ? 'Uploading photographs…' : 'Add photographs'}</button>
          <button className="dc-text-button" disabled={!readyDetails || Boolean(busy)} onClick={loadLibrary}>Choose from your library</button><small>JPEG, PNG or WebP · Up to 50 MB each</small>
          {upload && <div className="dc-upload-progress" role="status"><div><span>{upload.completed} of {upload.total} uploaded</span><span>{upload.percent}%</span></div><progress value={upload.percent} max="100" /><p>{uploading ? 'Keep this tab open until uploads finish. Preparation starts as photographs arrive.' : `${assets.length} photographs saved.`}</p></div>}
          {failed.length > 0 && <div className="dc-assist"><p>{failed.length} photographs have not finished uploading.</p><button disabled={uploading} onClick={() => uploadFiles(failed.map(item => item.file))}>Retry unfinished uploads</button><button onClick={() => setFailed([])}>Continue with {assets.length} uploaded photos</button></div>}
          {assets.length > 0 && <div className="dc-contact-sheet">{assets.slice(0, 12).map(a => <img key={a.assetId} src={a.thumbnailUrl || a.url} alt={a.originalFilename || 'Uploaded photograph'} />)}<span>{assets.length} photographs</span></div>}
          {assets.length > 0 && <button className="dc-text-button" onClick={() => setShowCollection(value => !value)}>{showCollection ? 'Close collection' : 'Manage photographs'}</button>}
          {showCollection && <div className="dc-manage-photos">{assets.map((asset, index) => <div key={asset.assetId}><img loading="lazy" src={asset.thumbnailUrl || asset.url} alt={asset.originalFilename || `Photograph ${index + 1}`} /><span>{asset.originalFilename || `Photograph ${index + 1}`}</span><button disabled={Boolean(busy) || uploading} aria-label={`Remove photograph ${index + 1} from delivery`} onClick={() => act('remove-photo', async () => { await api.delete(`/v1/deliveries/${delivery._id}/assets/${asset.assetId}`); await refresh(); })}><X size={18} /></button></div>)}</div>}
          {library && <div className="dc-library"><div className="dc-inline"><h3>Your library</h3><button onClick={() => setLibrary(null)} aria-label="Close library"><X size={17} /></button></div>{library.length ? library.map(a => <button disabled={Boolean(busy)} key={a._id} onClick={() => addLibrary(a._id)}><img src={a.thumbnailUrl || a.url} alt="" /><span>{a.originalFilename}</span><Plus size={16} /></button>) : <p>Your library has no photographs to add.</p>}</div>}
        </section>
      </div>
      <section className="dc-formats"><div className="dc-section-head"><div><p>THE PRESENTATION</p><h2>How should they see the shoot?</h2></div>{!recommendation && <button disabled={!readyDetails || Boolean(busy)} onClick={() => assist('assess')}>Recommend a format <Film size={17} /></button>}</div>
        <div className="dc-format-grid">{FORMAT_REGISTRY.map(item => <button key={item.id} className={format === item.id ? 'is-selected' : ''} onClick={() => setFormat(item.id)} aria-pressed={format === item.id}><item.icon size={23} /><span>{item.name}</span><p>{item.line}</p>{recommendation === item.id && <small>Recommended for your brief</small>}</button>)}</div>
      </section>
      <footer className="dc-action-bar"><span>{assets.length ? `${assets.length} photographs · ${format ? formatName(format) : 'Choose a format'}` : 'Add your photographs to continue.'}</span><button className="dc-primary" disabled={!assets.length || !format || uploading || failed.length > 0 || Boolean(busy)} onClick={prepare}>Prepare presentation <ArrowRight size={18} /></button></footer>
    </>}
    {step === 'review' && editor && <>
      <div className="dc-heading"><p>THE FIRST VIEWING</p><h1>{formatName(delivery.format)}</h1><span>{editor.frames.length} photographs in the presentation · {assets.length} in the gallery{delivery.format === 'photo-story' ? ` · About ${Math.round(editor.frames.reduce((n, f) => n + f.durationSec, 0))} seconds` : ''}</span></div>
      {preparation && <div className="dc-preparation" role="status"><div>{working ? <LoaderCircle className="dc-spin" size={20} /> : <Check size={20} />}<p>{preparation.message}</p></div>{preparation.photographs?.total > 0 && <small>{preparation.photographs.completed} of {preparation.photographs.total} photographs understood</small>}{working && <button onClick={() => act('cancel', async () => { await api.post(`/v1/deliveries/${delivery._id}/preparation/cancel`); await refresh(); })}>Keep current presentation</button>}{preparation.state === 'available' && preparation.kind === 'prepare' && <button disabled={Boolean(busy)} onClick={prepare}>Try AI writing again</button>}</div>}
      <div className="dc-review-tabs"><button aria-pressed={panel === 'preview'} onClick={() => setPanel('preview')}>Client preview</button><button aria-pressed={panel === 'edit'} onClick={() => setPanel('edit')}>Photographs & text</button><span>{dirty ? 'Unsaved changes' : 'Saved'}</span></div>
      {panel === 'preview' ? <div className="dc-preview"><PresentationViewer delivery={preview} /></div> : <section className="dc-editor">
        <div className="dc-card dc-editor-intro"><label>Title<input value={editor.title} maxLength={120} onChange={e => changeEditor({ ...editor, title: e.target.value })} /></label><label>Opening line (optional)<textarea rows={2} value={editor.openingLine} maxLength={180} onChange={e => changeEditor({ ...editor, openingLine: e.target.value })} /></label><label>Closing line (optional)<textarea rows={2} value={editor.closingLine} maxLength={180} onChange={e => changeEditor({ ...editor, closingLine: e.target.value })} /></label>{delivery.format === 'campaign' && <label>Usage terms<textarea value={editor.usageTerms} maxLength={1000} onChange={e => changeEditor({ ...editor, usageTerms: e.target.value })} /></label>}</div>
        <div className="dc-frame-list">{editor.frames.map((frame, index) => {
          const asset = assets.find(a => a.assetId === frame.assetId); if (!asset) return null;
          const move = offset => { const frames = [...editor.frames]; [frames[index], frames[index + offset]] = [frames[index + offset], frames[index]]; changeEditor({ ...editor, frames }); };
          return <article key={frame.assetId} className="dc-frame"><img src={asset.thumbnailUrl || asset.url} alt={asset.alt || `Photograph ${index + 1}`} /><div><label>Caption {index + 1} <small>Optional</small><textarea rows={3} maxLength={180} value={frame.caption} placeholder="Let the photograph stand on its own, or add a line about the shoot." onChange={e => changeEditor({ ...editor, frames: editor.frames.map(f => f.assetId === frame.assetId ? { ...f, caption: e.target.value } : f) })} /></label><div className="dc-frame-actions"><button disabled={Boolean(busy) || working} onClick={() => regenerate(frame.assetId)}><RefreshCw size={16} />Regenerate</button><button disabled={index === 0} onClick={() => move(-1)} aria-label={`Move photograph ${index + 1} earlier`}><ChevronUp size={18} /></button><button disabled={index === editor.frames.length - 1} onClick={() => move(1)} aria-label={`Move photograph ${index + 1} later`}><ChevronDown size={18} /></button><button disabled={editor.frames.length === 1} onClick={() => changeEditor({ ...editor, frames: editor.frames.filter(f => f.assetId !== frame.assetId) })}>Remove from presentation</button></div></div></article>;
        })}</div>
        {editor.frames.length < 30 && <label className="dc-add-frame">Add a photograph to the presentation<select value="" onChange={e => { if (e.target.value) changeEditor({ ...editor, frames: [...editor.frames, { assetId: e.target.value, caption: '', durationSec: 4.2 }] }); }}><option value="">Choose a photograph</option>{assets.filter(a => !editor.frames.some(f => f.assetId === a.assetId)).map(a => <option key={a.assetId} value={a.assetId}>{a.originalFilename || `Photograph ${a.sortOrder + 1}`}</option>)}</select></label>}
      </section>}
      {capabilities.music && <section className="dc-card dc-audio"><label>Music<select value={editor.soundtrackId || ''} onChange={e => changeEditor({ ...editor, soundtrackId: e.target.value || null })}><option value="">No soundtrack</option>{tracks.map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</select></label>{editor.soundtrackId && tracks.find(t => t.id === editor.soundtrackId)?.previewUrl && <audio controls preload="none" src={audioUrl(tracks.find(t => t.id === editor.soundtrackId).previewUrl)} />}{capabilities.narration && <div><h3>Narration</h3><p>Read the approved story text aloud.</p><button disabled={Boolean(busy) || working || !narrationText} onClick={narrate}><Mic2 size={17} />{delivery.narration ? 'Record again' : 'Record narration'}</button>{delivery.narration && <label className="dc-checkbox"><input type="checkbox" checked={access.narration} onChange={e => setAccess({ ...access, narration: e.target.checked })} />Include narration</label>}</div>}</section>}
      <footer className="dc-action-bar"><button disabled={!dirty || Boolean(busy)} onClick={() => act('save', saveEditor)}>Save changes</button><button className="dc-primary" disabled={Boolean(busy)} onClick={reviewForSharing}>Share this presentation <ArrowRight size={18} /></button></footer>
    </>}
    {step === 'share' && <>
      <div className="dc-heading"><p>READY FOR YOUR CLIENT</p><h1>Send a private link.</h1><span>Choose access and download settings, then publish the version you reviewed.</span></div>
      <section className="dc-card dc-access"><label>Six-digit PIN (optional)<input type="text" inputMode="numeric" maxLength={6} autoComplete="off" value={access.pin || ''} placeholder={delivery.hasPin && access.pin === undefined ? 'Existing PIN will stay' : 'No PIN'} onChange={e => setAccess({ ...access, pin: e.target.value.replace(/\D/g, '') })} /></label>{delivery.hasPin && access.pin === undefined && <button onClick={() => setAccess({ ...access, pin: '' })}>Remove existing PIN</button>}<label>Link expiry (optional)<input type="datetime-local" value={access.expiresAt ? String(access.expiresAt).slice(0, 16) : ''} onChange={e => setAccess({ ...access, expiresAt: e.target.value })} /></label>
        {[['allowIndividualDownloads', 'Allow individual downloads'], ['allowDownloadAll', 'Allow downloading the full collection'], ['allowLikes', 'Allow favourites'], ['downloadsLocked', 'Lock downloads until you release them'], ['watermarkEnabled', 'Watermark previews while downloads are locked']].map(([key, label]) => <label className="dc-checkbox" key={key}><input type="checkbox" checked={Boolean(access[key])} onChange={e => setAccess({ ...access, [key]: e.target.checked })} />{label}</label>)}
        {access.downloadsLocked && <label>Message for your client<input value={access.downloadLockNote || ''} maxLength={200} onChange={e => setAccess({ ...access, downloadLockNote: e.target.value })} /></label>}
        {access.watermarkEnabled && <label>Watermark text<input value={access.watermarkText || ''} maxLength={40} onChange={e => setAccess({ ...access, watermarkText: e.target.value })} /></label>}
      </section><footer className="dc-action-bar"><button onClick={() => setStep('review')}>Back to preview</button><button className="dc-primary" disabled={Boolean(busy) || Boolean(access.pin && access.pin.length !== 6)} onClick={publish}>{busy === 'publish' ? 'Publishing…' : 'Publish this version'}<ArrowRight size={18} /></button></footer>
    </>}
    {step === 'shared' && <section className="dc-shared"><Check size={30} /><p>READY TO SEND</p><h1>Your delivery is published.</h1><span>Share the link with your client on WhatsApp, Instagram, or email.</span><div className="dc-share-link"><input readOnly value={shareUrl} aria-label="Client delivery link" /><button onClick={() => act('copy', async () => { await navigator.clipboard.writeText(shareUrl); setCopied(true); })}><Copy size={18} />{copied ? 'Copied' : 'Copy link'}</button></div><a className="dc-primary" href={shareUrl} target="_blank" rel="noreferrer">Open client delivery <ExternalLink size={18} /></a><Link to={`/sharing?delivery=${delivery?._id}`}>Manage sharing</Link></section>}
  </main>;
}
