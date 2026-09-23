import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, LogOut, ChevronDown, Clapperboard, Copy, Download, Film, Image as ImageIcon, Layers3, Loader2, Mic2, Music2, Plus, RefreshCw, Settings2, Upload, Volume2, X, AlertCircle, Camera, Monitor, FolderOpen } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../content-studio/api.js';
import '../content-studio/studio.css';

const Preview = lazy(() => import('../content-studio/Preview.jsx'));
const BASE = '/v1/admin/content-studio';
const defaults = { title: 'New Veylo campaign', goal: 'signups', notes: '', duration: 30, formats: ['video', 'portrait', 'carousel'], generateImages: true, narration: true, music: true, soundDesign: true };
const formats = [{ id: 'video', label: 'Vertical video', detail: 'Reels · TikTok · Shorts', icon: Film }, { id: 'portrait', label: 'Portrait post', detail: '1080 × 1350', icon: ImageIcon }, { id: 'carousel', label: 'Carousel', detail: 'A connected set of slides', icon: Layers3 }, { id: 'square', label: 'Square post', detail: '1080 × 1080', icon: ImageIcon }, { id: 'story', label: 'Story graphic', detail: '1080 × 1920', icon: ImageIcon }];
const statusText = { idle: 'Draft', queued: 'Queued', running: 'Creating', ready: 'Ready to post', needs_assets: 'Images needed', failed: 'Needs a retry', cancelled: 'Cancelled' };
const busyStatus = status => ['running', 'queued'].includes(status);
function errorText(error) { return error.response?.data?.message || 'Content Studio could not complete this request. Please check your connection and try again.'; }
function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function Status({ value }) { return <span className={`cs-status cs-status-${value}`}><span />{statusText[value] || value}</span>; }
function Toggle({ checked, onChange, icon: Icon, title, detail, disabled }) {
  return <label className="cs-toggle"><span className="cs-toggle-icon"><Icon size={18} /></span><span className="cs-toggle-copy"><strong>{title}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} /><span className="cs-switch" aria-hidden="true" /></label>;
}

export default function ContentStudioPage({ admin, onLogout }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const [projects, setProjects] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [project, setProject] = useState(null);
  const [brief, setBrief] = useState(defaults);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [assetKind, setAssetKind] = useState('photo');
  const [view, setView] = useState('direction');
  const [versionId, setVersionId] = useState('');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [previewFormat, setPreviewFormat] = useState('video');
  const [revision, setRevision] = useState('');
  const [revisionScope, setRevisionScope] = useState('all');
  const [captionPlatform, setCaptionPlatform] = useState('instagram');
  const input = useRef(null);
  const activeSlotRef = useRef(null);
  const activeVersionRef = useRef('');
  const currentRoute = useRef(projectId);
  currentRoute.current = projectId;
  const busy = busyStatus(project?.job?.status);
  const locked = busy || Boolean(acting);
  const allowed = ['admin', 'superadmin', 'operations'].includes(admin?.role);
  const version = project?.versions.find(value => value.id === versionId) || project?.versions.find(value => value.id === project.activeVersionId) || project?.versions.at(-1);
  const versionPlan = version?.plan;
  const active = version?.id === project?.activeVersionId;
  const updateBrief = (key, value) => setBrief(previous => ({ ...previous, [key]: value }));

  const applyProject = useCallback(value => {
    if (currentRoute.current && value.id !== currentRoute.current) return;
    setProject(value);
    if (activeVersionRef.current !== value.activeVersionId) {
      activeVersionRef.current = value.activeVersionId;
      setVersionId(value.activeVersionId || '');
      setSceneIndex(0);
    } else setVersionId(previous => value.versions.some(version => version.id === previous) ? previous : value.activeVersionId || '');
  }, []);
  const loadStatus = useCallback(async () => {
    try { const { data } = await api.get(`${BASE}/status`); setStatus(data); } catch { /* Campaign errors carry the actionable message. */ }
  }, []);
  const loadList = useCallback(async (nextPage = 0) => {
    const { data } = await api.get(`${BASE}/projects?page=${nextPage}`);
    setProjects(previous => nextPage ? [...previous, ...data.projects] : data.projects); setHasMore(data.hasMore); setPage(nextPage);
  }, []);
  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    let live = true;
    setError(''); setLoading(true); setProject(null); setVersionId(''); setSceneIndex(0);
    loadStatus();
    const request = projectId ? api.get(`${BASE}/projects/${projectId}`).then(({ data }) => {
      if (!live) return;
      setProject(data.project); setBrief(data.project.brief); setVersionId(data.project.activeVersionId || ''); activeVersionRef.current = data.project.activeVersionId;
    }) : loadList();
    request.catch(error => { if (live) setError(errorText(error)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [projectId, allowed, loadList, loadStatus]);
  useEffect(() => {
    if (!projectId || !busy) return;
    let live = true; let timer;
    const poll = async () => {
      try {
        const { data } = await api.get(`${BASE}/projects/${projectId}`);
        if (!live) return;
        applyProject(data.project);
        if (!busyStatus(data.project.job.status)) { loadStatus(); return; }
      } catch (error) { if (live) setError(errorText(error)); }
      if (live) timer = setTimeout(poll, 4500);
    };
    timer = setTimeout(poll, 2500);
    return () => { live = false; clearTimeout(timer); };
  }, [projectId, busy, applyProject, loadStatus]);

  async function perform(label, fn) {
    if (acting) return;
    setActing(label); setError('');
    try { await fn(); } catch (error) { setError(errorText(error)); } finally { setActing(''); }
  }
  const create = () => perform('Creating campaign', async () => {
    const { data } = await api.post(`${BASE}/projects`, defaults);
    navigate(`/content-studio/${data.project.id}`);
  });
  async function saveBrief() {
    const { data } = await api.patch(`${BASE}/projects/${project.id}`, brief);
    applyProject(data.project);
    return data.project;
  }
  const generate = () => perform('Starting campaign', async () => {
    if (!brief.formats.length) throw { response: { data: { message: 'Choose at least one output format.' } } };
    await saveBrief();
    const { data } = await api.post(`${BASE}/projects/${project.id}/jobs`, { kind: 'generate' });
    setVersionId(''); applyProject(data.project);
  });
  const revise = () => perform('Starting revision', async () => {
    const { data } = await api.post(`${BASE}/projects/${project.id}/jobs`, { kind: 'revise', instruction: revision, ...(revisionScope !== 'all' ? { sceneId: revisionScope } : {}) });
    setVersionId(''); applyProject(data.project); setRevision('');
  });
  const jobAction = (actionName) => perform(actionName, async () => {
    const { data } = await api.post(`${BASE}/projects/${project.id}/${actionName}`);
    applyProject(data.project);
  });
  async function uploadImages(files, targetSlotId = null) {
    const items = Array.from(files || []);
    if (!items.length || locked) return;
    const invalid = items.find(file => {
      const isImg = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      const isVid = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
      const isAud = ['audio/mpeg', 'audio/wav', 'audio/mp3'].includes(file.type);
      return (!isImg && !isVid && !isAud) || file.size > 100 * 1024 * 1024;
    });
    if (invalid) { setError('Files must be supported photos (JPEG, PNG, WebP), videos (MP4, WebM), or music (MP3, WAV) up to 100 MB each.'); return; }
    if (items.length + project.assets.length > 24) { setError('A campaign can hold up to 24 assets.'); return; }
    const currentSlot = targetSlotId || activeSlotRef.current;
    activeSlotRef.current = null;

    await perform('Uploading media', async () => {
      for (let index = 0; index < items.length; index++) {
        const file = items[index];
        const isVid = file.type.startsWith('video/');
        const isAud = file.type.startsWith('audio/');
        const kind = isVid ? 'video' : isAud ? 'music' : assetKind;
        const form = new FormData();
        form.append('media', file);
        form.append('kind', kind);
        if (currentSlot) form.append('slotId', currentSlot);
        setUploadProgress(`${index + 1} of ${items.length}`);
        const { data } = await api.post(`${BASE}/projects/${project.id}/assets`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
        applyProject(data.project);
      }
      setUploadProgress('');
    });
    if (input.current) input.current.value = '';
  }
  const removeAsset = id => perform('Removing image', async () => { const { data } = await api.delete(`${BASE}/projects/${project.id}/assets/${id}`); applyProject(data.project); });
  const download = output => perform('Preparing download', async () => {
    const { data } = await api.get(`${BASE}/projects/${project.id}/download/${version.id}/${output.id}`);
    const anchor = document.createElement('a'); anchor.href = data.url; anchor.rel = 'noopener'; anchor.download = `veylo-${output.id}`; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  });
  const caption = versionPlan ? `${versionPlan.captions[captionPlatform]}\n\n${versionPlan.hashtags.join(' ')}` : '';
  const copyCaption = () => perform('Copying caption', async () => { await navigator.clipboard.writeText(caption); toast.success('Caption copied.'); });
  const copyGoogleVidsPrompt = () => perform('Copying script', async () => {
    if (!versionPlan?.googleVidsPrompt) return;
    await navigator.clipboard.writeText(versionPlan.googleVidsPrompt);
    toast.success('Google Vids prompt copied.');
  });
  const uploadForSlot = slotId => {
    activeSlotRef.current = slotId;
    input.current?.click();
  };
  const triggerRender = () => perform('Starting render', async () => {
    const { data } = await api.post(`${BASE}/projects/${project.id}/jobs`, { kind: 'render' });
    applyProject(data.project);
  });
  const reveal = reducedMotion ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } };

  if (!allowed) return <main className="cs-page"><div className="cs-container cs-empty"><Clapperboard size={32} /><h1>Content Studio</h1><p>Content Studio is available to superadmins and operations administrators.</p><Link className="cs-button" to="/">Back to admin</Link></div></main>;
  return <div className="cs-page">
    <header className="cs-header"><div className="cs-container cs-header-inner"><Link to="/content-studio" className="cs-brand" aria-label="Content Studio campaigns"><img src="/veylo/veylo-mark.svg" alt="" /><span>veylo</span><span className="cs-admin-label">Admin</span></Link><div className="cs-header-links"><Link to="/content-studio" className="cs-back"><FolderOpen size={15} /><span>Campaigns</span></Link><button onClick={onLogout} className="cs-back" aria-label="Sign out of Content Studio"><LogOut size={16} /><span>Sign out</span></button><span className="cs-avatar" title={admin?.name || admin?.username}>{(admin?.name || admin?.username || 'A').slice(0, 1).toUpperCase()}</span></div></div></header>
    <main className="cs-container cs-main">
      <div className="cs-heading-row"><div><div className="cs-eyebrow"><Clapperboard size={15} />Veylo marketing</div><h1>{projectId ? 'Make something worth posting.' : 'Content Studio'}</h1><p>{projectId ? 'Your photographs. A clear idea. A finished Veylo promotion.' : 'Create the next reason a photographer chooses Veylo.'}</p></div>{projectId ? <Link to="/content-studio" className="cs-button cs-secondary"><FolderOpen size={16} />All campaigns</Link> : <button onClick={create} disabled={Boolean(acting)} className="cs-button cs-primary"><Plus size={17} />New campaign</button>}</div>
      {error && <div className="cs-message cs-error" role="alert"><AlertCircle size={19} /><p>{error}</p><button aria-label="Dismiss error" onClick={() => setError('')}><X size={17} /></button></div>}
      {status && (!status.workerOnline || !status.providers.ai || !status.providers.storage) && <div className="cs-message"><Settings2 size={18} /><p>{!status.providers.ai || !status.providers.storage ? 'Generation needs the creative service and media storage configured on the server.' : 'The content worker is offline. You can prepare campaigns now; queued jobs will start when it reconnects.'}</p><button onClick={loadStatus} aria-label="Check availability"><RefreshCw size={16} /></button></div>}
      {loading ? <div className="cs-loading" role="status"><Loader2 className="cs-spin" size={24} /><span>Opening Content Studio</span></div> : !projectId ? <>
        <motion.section {...reveal} className="cs-intro"><div className="cs-intro-copy"><span className="cs-kicker">From images to your next post</span><h2>Let the work<br /><em>do the talking.</em></h2><p>Add photographs or screenshots. Veylo finds the angle, writes the words, and designs the video and graphics for you.</p><button className="cs-button cs-primary" onClick={create} disabled={Boolean(acting)}>Create a campaign<ArrowRight size={17} /></button><div className="cs-intro-note"><Camera size={15} />Only still images needed</div></div><div className="cs-intro-art" aria-hidden="true"><div className="cs-art-frame cs-art-back"><span>VEYLO / SOCIAL</span><div className="cs-art-lines" /><small>A better first look.</small></div><div className="cs-art-frame cs-art-front"><span>veylo.</span><div className="cs-art-photo"><div className="cs-art-orbit" /><ImageIcon size={34} strokeWidth={1} /></div><strong>The edit is finished.<br />Give the delivery<br />the same care.</strong><small>veylo.com.ng<ArrowRight size={14} /></small></div><div className="cs-art-label"><Film size={15} />Motion. Type. Sound.</div></div></motion.section>
        <div className="cs-section-heading"><div><span className="cs-kicker">Your work in progress</span><h2>Campaigns</h2></div>{status?.allowance && <span className="cs-allowance" title="A daily limit on generation work, not a currency estimate. Resets at 00:00 UTC.">{Math.max(0, status.allowance.limit - status.allowance.used)} generation units left today</span>}</div>
        {projects.length ? <div className="cs-campaign-grid">{projects.map((item, index) => <motion.div key={item.id} {...reveal} transition={{ duration: 0.3, delay: reducedMotion ? 0 : Math.min(index, 5) * 0.04 }}><Link className="cs-campaign-card" to={`/content-studio/${item.id}`}><div className="cs-card-top"><Clapperboard size={22} /><Status value={item.status} /></div><h3>{item.title}</h3><p>{item.formats.map(format => formats.find(value => value.id === format)?.label).join(' · ')}</p><div className="cs-card-bottom"><span>{new Date(item.updatedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span><ArrowRight size={18} /></div></Link></motion.div>)}</div> : <div className="cs-empty-list"><FolderOpen size={25} /><div><h3>Your campaigns will live here.</h3><p>Start one to turn your images into content promoting Veylo.</p></div></div>}
        {hasMore && <button className="cs-button cs-secondary cs-load-more" disabled={Boolean(acting)} onClick={() => perform('Loading campaigns', () => loadList(page + 1))}>Load more campaigns</button>}
      </> : project ? <>
        <div className="cs-project-bar"><div><h2>{project.title}</h2><Status value={project.job.status} /></div><span>{project.assets.length} / 24 media assets</span></div>
        {busy && <section className="cs-job" aria-live="polite"><div><Loader2 size={19} className="cs-spin" /><div><strong>{project.job.stage}</strong><span>{project.job.status === 'queued' ? 'You can leave this page. Your campaign is saved.' : 'Working in the background. You can come back when it is ready.'}</span></div><button onClick={() => jobAction('cancel')} disabled={Boolean(acting) || project.job.cancelRequested} className="cs-button cs-secondary">{project.job.cancelRequested ? 'Cancelling…' : 'Cancel'}</button></div><progress max="100" value={project.job.progress || 0} aria-label="Campaign progress" /></section>}
        {project.job.status === 'failed' && <div className="cs-message cs-error" role="alert"><AlertCircle size={19} /><p>{project.job.error}</p><button className="cs-text-button" onClick={() => jobAction('retry')} disabled={Boolean(acting)}>Retry</button></div>}
        {project.job.status === 'cancelled' && <div className="cs-message"><p>This job was cancelled. Its completed steps are saved.</p><button className="cs-text-button" onClick={() => jobAction('retry')} disabled={Boolean(acting)}>Resume</button></div>}
        {project.job.status === 'needs_assets' && (
          <section className="cs-needs-assets">
            <div>
              <Clapperboard size={20} />
              <div>
                <h3>Commercial Concept & Shot List Ready</h3>
                <p>The Creative Director has prepared your 4-beat commercial arc. Review the shot list below, upload footage or photos for the slots, and click Render commercial on PC.</p>
              </div>
            </div>
            <button className="cs-button cs-primary" disabled={locked} onClick={triggerRender}>
              <Film size={16} />
              Render commercial on PC
            </button>
          </section>
        )}
        <div className="cs-workspace">
          <aside className="cs-inputs">
            {/* 01 / The Brief & Direction */}
            <section className="cs-panel">
              <div className="cs-panel-heading">
                <div>
                  <span className="cs-step">01 / Creative Brief</span>
                  <h3>Direction & Goal</h3>
                </div>
                <Clapperboard size={19} />
              </div>
              <p className="cs-description">Direct the commercial. The AI Creative Director plans the 4-beat concept, script, and shot list first.</p>
              <label className="cs-label">
                Marketing goal
                <select value={brief.goal} disabled={locked} onChange={event => updateBrief('goal', event.target.value)}>
                  <option value="signups">Get photographers to try Veylo</option>
                  <option value="awareness">Introduce Veylo</option>
                  <option value="feature">Explain client delivery & WhatsApp sharing</option>
                  <option value="pro">Promote Veylo Pro (₦25,000/mo)</option>
                </select>
              </label>
              <label className="cs-label">
                Creative angle or notes <span>Optional</span>
                <textarea rows={3} maxLength={1600} value={brief.notes} disabled={locked} onChange={event => updateBrief('notes', event.target.value)} placeholder="e.g. Lagos wedding photographer delivering an owambe session with private WhatsApp links." />
              </label>
              <div className="cs-output-options">
                <span className="cs-label">Output formats</span>
                {formats.map(({ id, label, detail, icon: Icon }) => (
                  <label className="cs-format" key={id}>
                    <input type="checkbox" checked={brief.formats.includes(id)} disabled={locked} onChange={event => updateBrief('formats', event.target.checked ? [...brief.formats, id] : brief.formats.filter(value => value !== id))} />
                    <span className="cs-check"><Check size={13} /></span>
                    <Icon size={17} />
                    <span><strong>{label}</strong><small>{detail}</small></span>
                  </label>
                ))}
              </div>
              <details className="cs-settings">
                <summary><Settings2 size={16} />Video length & audio settings<ChevronDown size={15} /></summary>
                <div>
                  {brief.formats.includes('video') && (
                    <label className="cs-label">
                      Target video length
                      <select value={brief.duration} disabled={locked} onChange={event => updateBrief('duration', Number(event.target.value))}>
                        {[15, 30, 45, 60].map(value => <option key={value} value={value}>{value} seconds</option>)}
                      </select>
                      <small className="cs-field-note">Duration follows the spoken script and pacing.</small>
                    </label>
                  )}
                  <Toggle icon={ImageIcon} checked={brief.generateImages} onChange={value => updateBrief('generateImages', value)} disabled={locked} title="Supporting imagery" detail="Generate extra visuals when the concept needs them" />
                  {brief.formats.includes('video') && (
                    <>
                      <Toggle icon={Mic2} checked={brief.narration} onChange={value => updateBrief('narration', value)} disabled={locked} title="Voice-over" detail="Deepgram Flux narration with timed subtitles" />
                      <Toggle icon={Music2} checked={brief.music} onChange={value => updateBrief('music', value)} disabled={locked} title="Instrumental score" detail="44.1kHz warm harmonic bed or custom uploaded track" />
                      <Toggle icon={Volume2} checked={brief.soundDesign} onChange={value => updateBrief('soundDesign', value)} disabled={locked} title="Sound design" detail="Studio camera shutter and message chimes" />
                    </>
                  )}
                </div>
              </details>
              <button className="cs-button cs-primary cs-generate" onClick={generate} disabled={locked || !brief.formats.length}>
                {locked ? <Loader2 size={17} className="cs-spin" /> : <Clapperboard size={17} />}
                {version ? 'Develop new direction' : 'Direct commercial concept'}
                <ArrowRight size={16} />
              </button>
              <button className="cs-save" disabled={locked} onClick={() => perform('Saving brief', async () => { await saveBrief(); toast.success('Brief saved.'); })}>
                Save brief for later
              </button>
            </section>

            {/* 02 / Shot List & Media */}
            <section className="cs-panel">
              <div className="cs-panel-heading">
                <div>
                  <span className="cs-step">02 / Visual Assets</span>
                  <h3>Shot List & Media</h3>
                </div>
                <Film size={19} />
              </div>
              <p className="cs-description">Upload your video clips, screen recordings, photos, or custom audio bed.</p>

              {/* Multi-Media Shot List from AI Creative Director */}
              {versionPlan?.shotList?.length > 0 && (
                <div className="cs-shot-list">
                  <div className="cs-shot-list-head">
                    <div>
                      <span className="cs-kicker">Director's Shot List</span>
                      <h4>Assets needed for this edit</h4>
                    </div>
                    <span className="cs-shot-count">{versionPlan.shotList.length} shots</span>
                  </div>
                  {versionPlan.shotList.map((slot, sIdx) => {
                    const assignedAsset = project.assets.find(a => a.slotId === slot.id);
                    return (
                      <div key={slot.id || sIdx} className={`cs-slot-card ${assignedAsset ? 'cs-slot-filled' : ''}`}>
                        <div className="cs-slot-header">
                          <div className="cs-slot-title">
                            <span className="cs-slot-num">{String(sIdx + 1).padStart(2, '0')}</span>
                            <strong>{slot.label}</strong>
                          </div>
                          <div className="cs-slot-badges">
                            <span className={`cs-badge cs-badge-${slot.mediaType}`}>
                              {slot.mediaType === 'video' ? <Film size={11} /> : slot.mediaType === 'screen_recording' ? <Monitor size={11} /> : <Camera size={11} />}
                              {slot.mediaType === 'video' ? 'Video' : slot.mediaType === 'screen_recording' ? 'Screen record' : 'Photo'}
                              {slot.duration ? ` · ${slot.duration}s` : ''}
                            </span>
                            {slot.required && <span className="cs-badge cs-badge-req">Required</span>}
                          </div>
                        </div>
                        <p className="cs-slot-desc">{slot.description}</p>
                        {assignedAsset ? (
                          <div className="cs-slot-asset">
                            <div className="cs-slot-asset-preview">
                              {assignedAsset.kind === 'video' ? <Film size={15} /> : assignedAsset.kind === 'music' ? <Music2 size={15} /> : <img src={assignedAsset.url} alt="" />}
                              <span>{assignedAsset.name}</span>
                            </div>
                            <button className="cs-slot-replace-btn" onClick={() => uploadForSlot(slot.id)} disabled={locked}>Replace</button>
                          </div>
                        ) : (
                          <button className="cs-slot-upload-btn" onClick={() => uploadForSlot(slot.id)} disabled={locked}>
                            <Upload size={13} />
                            <span>Upload {slot.mediaType === 'video' ? 'video clip (MP4/WebM)' : 'media'} for this shot</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Google Vids Avatar Script (Optional) */}
              {versionPlan?.googleVidsPrompt && (
                <div className="cs-vids-card">
                  <div className="cs-vids-header">
                    <div className="cs-vids-title">
                      <Camera size={15} />
                      <strong>Google Vids Avatar Script</strong>
                    </div>
                    <button className="cs-vids-copy-btn" onClick={copyGoogleVidsPrompt} type="button">
                      <Copy size={12} />
                      <span>Copy script</span>
                    </button>
                  </div>
                  <p className="cs-vids-desc">
                    Optional AI Presenter: If you'd like an avatar host for this video, copy this prompt into Google Vids, download your video, and upload it to Shot 1.
                  </p>
                  <pre className="cs-vids-pre">{versionPlan.googleVidsPrompt}</pre>
                </div>
              )}

              {/* Media Library Upload */}
              <div className="cs-general-upload">
                <span className="cs-kicker">Library & Uploads</span>
                <div className="cs-segmented" aria-label="Upload type">
                  <button onClick={() => setAssetKind('photo')} aria-pressed={assetKind === 'photo'} disabled={locked}><Camera size={14} />Photos</button>
                  <button onClick={() => setAssetKind('video')} aria-pressed={assetKind === 'video'} disabled={locked}><Film size={14} />Footage</button>
                  <button onClick={() => setAssetKind('music')} aria-pressed={assetKind === 'music'} disabled={locked}><Music2 size={14} />Music</button>
                  <button onClick={() => setAssetKind('screenshot')} aria-pressed={assetKind === 'screenshot'} disabled={locked}><Monitor size={14} />Screenshots</button>
                </div>
                <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/mp3" multiple className="cs-file-input" onChange={event => uploadImages(event.target.files)} disabled={locked} aria-label="Upload campaign media" />
                <button className="cs-dropzone" disabled={locked || project.assets.length >= 24} onClick={() => { activeSlotRef.current = null; input.current?.click(); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); uploadImages(event.dataTransfer.files); }}>
                  <span className="cs-upload-icon">{acting === 'Uploading media' ? <Loader2 size={22} className="cs-spin" /> : <Upload size={22} />}</span>
                  <strong>{acting === 'Uploading media' ? `Uploading ${uploadProgress}` : 'Add media files'}</strong>
                  <span>Drop MP4 footage, photos, or custom MP3 music</span>
                  <small>MP4, WebM, JPEG, PNG, MP3 · Up to 100 MB each</small>
                </button>
                {project.assets.length > 0 && (
                  <div className="cs-assets">
                    {project.assets.map(asset => (
                      <div key={asset.id} className="cs-asset">
                        {asset.kind === 'video' ? (
                          <div className="cs-asset-media-preview cs-asset-video">
                            <Film size={20} />
                            <span className="cs-asset-name">{asset.name}</span>
                          </div>
                        ) : asset.kind === 'music' ? (
                          <div className="cs-asset-media-preview cs-asset-music">
                            <Music2 size={20} />
                            <span className="cs-asset-name">{asset.name}</span>
                          </div>
                        ) : (
                          <img src={asset.url} alt={asset.name} loading="lazy" />
                        )}
                        <span className="cs-asset-badge">
                          {asset.kind === 'video' ? <Film size={11} /> : asset.kind === 'music' ? <Music2 size={11} /> : asset.kind === 'screenshot' ? <Monitor size={11} /> : <Camera size={11} />}
                          {asset.slotId ? 'Shot' : asset.kind}
                        </span>
                        <button disabled={locked} onClick={() => removeAsset(asset.id)} aria-label={`Remove ${asset.name}`}><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {version && (
                <div className="cs-render-action">
                  <button className="cs-button cs-primary cs-render-btn" disabled={locked} onClick={triggerRender}>
                    <Film size={16} />
                    Render commercial on PC
                  </button>
                </div>
              )}
            </section>
          </aside>
          <div className="cs-results"><section className="cs-preview-panel"><div className="cs-preview-top"><div><span className="cs-step">03 / The finished direction</span><h3>{version ? 'Your campaign' : 'The next post starts here.'}</h3></div>{project.versions.length > 0 && <label className="cs-version"><span className="sr-only">Campaign version</span><select value={version?.id || ''} onChange={event => { setVersionId(event.target.value); setSceneIndex(0); }}>{project.versions.map((value, index) => <option key={value.id} value={value.id}>Version {index + 1}</option>)}</select></label>}</div>
            {version ? <><div className="cs-preview-formats">{['video', 'portrait', 'square', 'story', 'carousel'].map(format => <button key={format} aria-pressed={previewFormat === format} onClick={() => setPreviewFormat(format)}>{format === 'video' ? 'Video' : format === 'portrait' ? '4:5' : format === 'square' ? '1:1' : format === 'carousel' ? 'Carousel' : '9:16 still'}</button>)}</div><Suspense fallback={<div className="cs-loading"><Loader2 className="cs-spin" size={22} /><span>Loading preview</span></div>}><Preview version={version} format={previewFormat} sceneIndex={sceneIndex} reducedMotion={Boolean(reducedMotion)} /></Suspense><div className="cs-scene-strip" aria-label="Campaign scenes">{versionPlan.scenes.map((scene, index) => <button key={scene.id} onClick={() => { setSceneIndex(index); if (previewFormat === 'video') setPreviewFormat('carousel'); }} aria-pressed={sceneIndex === index}><span>{String(index + 1).padStart(2, '0')}</span><strong>{scene.headline}</strong><small>{scene.layout}</small></button>)}</div></> : <div className="cs-preview-empty"><div className="cs-empty-frame"><span>veylo.</span><div><ImageIcon size={35} strokeWidth={1} /><p>Your images,<br /><em>with a purpose.</em></p></div><small>MADE FOR THE FINISHED WORK</small></div><p>Add your images and generate content.<br />Your concept, preview and exports will appear here.</p></div>}
          </section>
          {version && <section className="cs-panel cs-detail-panel"><div className="cs-tabs" role="tablist" aria-label="Campaign details">{[{ id: 'direction', label: 'Direction' }, { id: 'script', label: 'Script' }, { id: 'captions', label: 'Captions' }, { id: 'exports', label: 'Downloads' }].map(tab => <button role="tab" id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`} aria-selected={view === tab.id} key={tab.id} onClick={() => setView(tab.id)}>{tab.label}{tab.id === 'exports' && version.outputs.length > 0 && <span>{version.outputs.length}</span>}</button>)}</div>
            <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`} className="cs-tab-content">
              {view === 'direction' && <><span className="cs-kicker">The idea</span><h3 className="cs-angle">{versionPlan.angle}</h3><p className="cs-description">{versionPlan.artDirection}</p><div className="cs-direction-meta"><div><span>Who it speaks to</span><p>{versionPlan.audience}</p></div><div><span>The next step</span><p>{versionPlan.cta}</p></div></div></>}
              {view === 'script' && <div className="cs-script">{versionPlan.scenes.map((scene, index) => <article key={scene.id}><span className="cs-script-number">{String(index + 1).padStart(2, '0')}</span><div><h4>{scene.headline}</h4>{scene.body && <p>{scene.body}</p>}<div className="cs-narration"><Mic2 size={15} /><p>{scene.narration || 'No spoken line in this scene.'}</p></div></div></article>)}</div>}
              {view === 'captions' && <><div className="cs-caption-actions"><label className="cs-label"><span className="sr-only">Platform</span><select value={captionPlatform} onChange={event => setCaptionPlatform(event.target.value)}><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="youtube">YouTube Shorts</option></select></label><button className="cs-button cs-secondary" onClick={copyCaption}><Copy size={15} />Copy</button></div><p className="cs-caption-text">{caption}</p><button className="cs-text-button" onClick={() => downloadText(`veylo-${captionPlatform}-caption.txt`, caption)}><Download size={15} />Download caption</button></>}
              {view === 'exports' && <>{version.outputs.length ? <div className="cs-exports">{version.outputs.map(output => <div className="cs-export" key={output.id}><span className="cs-export-icon">{output.format === 'video' ? <Film size={19} /> : <ImageIcon size={19} />}</span><div><strong>{output.cover ? 'Video cover' : output.format === 'carousel' ? `Carousel · Slide ${output.slide + 1}` : formats.find(value => value.id === output.format)?.label}</strong><small>{output.width} × {output.height} · {output.format === 'video' ? `MP4 · ${Math.round(output.duration || 0)}s` : 'PNG'}</small>{output.filename && <small className="block text-[#ffb7aa]/80 text-[11px] font-mono mt-0.5">Saved to PC: {output.filename}</small>}</div>{output.url ? <button className="cs-icon-button" disabled={Boolean(acting)} onClick={() => download(output)} aria-label={`Download ${output.cover ? 'cover' : output.id}`}><Download size={18} /></button> : <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ff9b8e]/10 border border-[#ff9b8e]/20 text-[11px] font-medium text-[#ffb7aa]"><Check size={12} /><span>Saved on PC</span></div>}</div>)}</div> : <div className="cs-no-exports"><Download size={24} /><p>{busy ? 'Finished files will appear on your PC as they render.' : 'This version has no finished exports yet.'}</p>{active && !busy && !versionPlan.requiredAssets.length && <button className="cs-button cs-secondary" disabled={Boolean(acting)} onClick={() => perform('Queuing export', async () => { const { data } = await api.post(`${BASE}/projects/${project.id}/jobs`, { kind: 'render' }); applyProject(data.project); })}>Render exports on PC</button>}</div>}<button className="cs-text-button" onClick={() => downloadText('veylo-campaign-copy.txt', Object.entries(versionPlan.captions).map(([platform, text]) => `${platform.toUpperCase()}\n\n${text}\n\n${versionPlan.hashtags.join(' ')}`).join('\n\n----------------\n\n'))}><Download size={15} />Download all posting copy</button></>}
            </div>
            <div className="cs-revision"><h4>Want to change something?</h4><p>Give a short direction. The engine will create a new version.</p><label className="cs-label"><span className="sr-only">Revision scope</span><select value={revisionScope} onChange={event => setRevisionScope(event.target.value)} disabled={locked || !active}><option value="all">The whole campaign</option>{versionPlan.scenes.map((scene, index) => <option value={scene.id} key={scene.id}>Scene {index + 1}: {scene.headline}</option>)}</select></label><label className="cs-label"><span className="sr-only">Revision instructions</span><textarea value={revision} maxLength={1200} rows={2} disabled={locked || !active} onChange={event => setRevision(event.target.value)} placeholder="For example: make the opening shorter and focus on private delivery links." /></label><button className="cs-button cs-secondary" disabled={locked || !active || revision.trim().length < 3} onClick={revise}><RefreshCw size={15} />Create revised version</button>{!active && <small>Choose the latest version to request changes.</small>}</div>
          </section>}
          </div>
        </div>
      </> : !error && <div className="cs-empty-list">Campaign not found.</div>}
      <footer className="cs-footer"><span>Veylo Content Studio</span><span>Don’t just deliver photos. Showcase them.</span></footer>
    </main>
  </div>;
}
