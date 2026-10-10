import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, Check, ChevronRight, Copy, ExternalLink, GripVertical, Image as ImageIcon, Inbox, Monitor, Palette, Plus, Settings, Smartphone, Tablet, Trash2, UserRound, X } from 'lucide-react';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { KeyboardSensor, PointerSensor, PointerActivationConstraints } from '@dnd-kit/dom';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import api, { apiMessage } from '../services/api.js';
import { contactErrors } from '../services/portfolio.js';
import { usePortfolioDraft } from '../hooks/usePortfolioDraft.js';
import { useAssistantWorkflow } from '../components/AssistantContext.jsx';
import { useDialogFocus } from '../components/useDialogFocus.js';
import PortfolioPhotoPicker from '../components/PortfolioPhotoPicker.jsx';
import PortfolioDesignPicker from '../components/PortfolioDesignPicker.jsx';
import PortfolioCategories, { PortfolioCategoryField } from '../components/PortfolioCategories.jsx';
import { portfolioCategories, hasPortfolioCategory } from '../services/portfolioCategories.js';
import { portfolioDesigns, findPortfolioDesign } from '../components/portfolioDesigns.js';
import PortfolioCanvas from './PortfolioCanvas.jsx';
import { PortfolioStudioExtras, PortfolioCollectionEditor, PortfolioProjectExtras } from '../components/PortfolioContentEditor.jsx';
import { PortfolioContactSettings, PortfolioHomeArrangement, PortfolioSectionSettings, PortfolioShareSettings } from '../components/PortfolioWorkspaceSettings.jsx';
import PortfolioEnquiries from './PortfolioEnquiries.jsx';
import { contentReadiness, repairPortfolioReferences } from '../services/portfolioContent.mjs';
import { APP_URL } from '../config/env.js';
import './ManagePortfolio.css';
import './PortfolioWorkspace.css';
const sensors = [PointerSensor.configure({
  activationConstraints: event => event.pointerType === 'touch' ? [new PointerActivationConstraints.Delay({
    value: 250,
    tolerance: 5
  })] : [new PointerActivationConstraints.Distance({
    value: 5
  })]
}), KeyboardSensor];
const destinations = [
  { name: 'Work', icon: ImageIcon, tabs: ['Work', 'Projects', 'Categories'] },
  { name: 'Studio details', icon: UserRound, tabs: ['Studio', 'Services', 'Client feedback', 'FAQs'] },
  { name: 'Design', icon: Palette, tabs: ['Design'] },
  { name: 'Enquiries', icon: Inbox, tabs: ['Enquiries'] },
  { name: 'Activity', icon: BarChart3, tabs: ['Activity'] }
];
function Sheet({
  title,
  children,
  onClose,
  wide = false,
  className = ''
}) {
  const ref = useRef(null);
  useDialogFocus(true, ref, onClose);
  return <div className="v-pedit-overlay" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}><section className={`v-pedit-sheet ${wide ? 'v-pedit-sheet-wide' : ''} ${className}`} ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><header><h2>{title}</h2><button aria-label={`Close ${title}`} onClick={onClose}><X size={20} /></button></header>{children}</section></div>;
}
function PhotoTile({
  photo,
  index,
  selected,
  cover,
  onSelect,
  onEdit,
  onMove,
  count
}) {
  const reduced = useVeyloReducedMotion();
  const {
    ref,
    handleRef,
    isDragging
  } = useSortable({
    id: photo.id,
    index,
    transition: reduced ? null : undefined
  });
  return <article ref={ref} className={`v-pedit-photo ${isDragging ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''}`}><button className="v-pedit-photo-image" onClick={onEdit} aria-label={`Edit photograph ${index + 1}`}><img src={photo.thumbnailUrl || photo.url} alt={photo.alt || photo.title || `Photograph ${index + 1}`} loading="lazy" />{cover && <span>Cover</span>}{!photo.featured && <span>Off main gallery</span>}</button><div className="v-pedit-photo-info"><button className="v-pedit-photo-caption" onClick={onEdit}><strong>{photo.title || `Photograph ${index + 1}`}</strong><small>{photo.category}</small></button></div><div className="v-pedit-photo-controls"><button className="v-pedit-checkbox" aria-label={`Select photograph ${index + 1}`} aria-pressed={selected} onClick={onSelect}>{selected && <Check size={15} />}</button><div className="v-pedit-photo-order"><button onClick={() => onMove(index - 1)} disabled={index === 0} aria-label={`Move photograph ${index + 1} earlier`}><ArrowUp size={14} /></button><button onClick={() => onMove(index + 1)} disabled={index === count - 1} aria-label={`Move photograph ${index + 1} later`}><ArrowDown size={14} /></button><button ref={handleRef} aria-label={`Drag photograph ${index + 1} to reorder`} className="v-pedit-grip"><GripVertical size={18} /></button></div></div></article>;
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
  hint,
  error,
  ...rest
}) {
  const Input = multiline ? 'textarea' : 'input';
  return <label className="v-pedit-field"><span>{label}</span><Input aria-label={label} value={value || ''} onChange={event => onChange(event.target.value)} {...rest} />{hint && <small>{hint}</small>}{error && <small role="alert" className="v-pedit-error">{error}</small>}</label>;
}
function Preview({
  form,
  onClose,
  initialDesign = '',
  onUseDesign
}) {
  const [device, setDevice] = useState('phone');
  const [designId, setDesignId] = useState(initialDesign || form.direction.template);
  const design = findPortfolioDesign(designId);
  const direction = design.id === form.direction.template ? form.direction : { ...form.direction, ...design.defaults, template: design.id };
  const widths = {
    phone: 390,
    tablet: 834,
    desktop: 1440
  };
  const ref = useRef(null);
  const [available, setAvailable] = useState(390);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, available / widths[device]);
  return <Sheet title="Preview your portfolio" onClose={onClose} wide className="v-pedit-preview-sheet"><div className="v-pedit-preview-tools"><p>Private draft · {scale < 1 ? `${Math.round(scale * 100)}% scale` : 'Actual size'}</p><nav aria-label="Preview screen size">{[['phone', Smartphone, 'Phone'], ['tablet', Tablet, 'Tablet'], ['desktop', Monitor, 'Desktop']].map(([key, Icon, name]) => <button key={key} aria-pressed={device === key} onClick={() => setDevice(key)}><Icon size={16} />{name}</button>)}</nav><label><span className="v-pedit-sr-only">Preview design</span><select aria-label="Preview design" value={design.id} onChange={event => setDesignId(event.target.value)}>{portfolioDesigns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{design.id !== form.direction.template && onUseDesign && <button className="v-pedit-primary" onClick={() => { onUseDesign(direction); onClose(); }}>Use {design.name}</button>}</div><div className="v-pedit-preview-scroll" data-portfolio-scroll ref={ref}><div style={{
        width: widths[device],
        zoom: scale
      }}><PortfolioCanvas key={design.id} portfolio={{ ...form, direction }} preview /></div></div></Sheet>;
}
export default function ManagePortfolio() {
  const draft = usePortfolioDraft();
  const {
    form,
    setForm,
    profile
  } = draft;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('section');
  const tab = [...destinations.flatMap(item => item.tabs), 'Settings'].includes(requestedTab) ? requestedTab : 'Work';
  function setTab(value) { setSearchParams(value === 'Work' ? {} : { section: value }, { replace: true }); setSelected([]); }
  const [picker, setPicker] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewDesign, setPreviewDesign] = useState('');
  const [detail, setDetail] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [newProject, setNewProject] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [availability, setAvailability] = useState(null);
  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState('');
  const [activityRetry, setActivityRetry] = useState(0);
  const [enquiryCounts, setEnquiryCounts] = useState({});
  const [job, setJob] = useState(null);
  const [undo, setUndo] = useState(null);
  const addRef = useRef(null);
  const undoTimer = useRef(null);
  const aiUndo = useRef(null);
  const photo = form.items.find(item => item.id === detail);
  useAssistantWorkflow({ kind: 'portfolio', step: tab === 'Settings' ? 'publishing' : tab === 'Enquiries' ? 'studio' : tab === 'Activity' ? 'published' : tab.toLowerCase().replaceAll(' ', '-'), unsaved: Boolean(draft.dirty), busy: draft.loading || draft.saveState === 'saving' || Boolean(busy), hasError: Boolean(draft.error || actionError), previewOpen: preview }, {
    'portfolio-intro': proposal => { setForm(current => ({ ...current, bio: proposal.text })); return 'Introduction added to your private Portfolio form. Check the save status before publishing.'; }
  });
  const project = newProject || form.projects.find(item => item.id === projectId);
  const categories = portfolioCategories(form);
  const errors = contactErrors(form);
  const visibleIds = new Set([...form.items.filter(item => item.featured || (form.direction.showCategories && hasPortfolioCategory(item.category))).map(item => item.id), ...form.projects.flatMap(item => item.photoIds)]);
  const readiness = [
    !form.studioName.trim() && { message: 'Set your studio name in account settings.', tab: 'Studio' },
    (form.handle !== profile?.persistedHandle && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.handle) || form.handle.length < 3 || form.handle.length > 40)) && { message: 'Choose an address with 3–40 letters, numbers or single hyphens.', tab: 'Settings' },
    !form.bio.trim() && { message: 'Write a short studio introduction.', tab: 'Studio' },
    visibleIds.size < 4 && { message: 'Choose at least four public photographs.', tab: 'Work' },
    !form.items.some(item => item.publicId === form.heroPublicId && visibleIds.has(item.id)) && { message: 'Choose a public cover photograph.', tab: 'Work' },
    ...Object.values(errors).map(message => ({ message, tab: 'Studio' })),
    ...contentReadiness(form.content).map(message => ({ message, tab: /service|price/.test(message) ? 'Services' : /feedback|testimonial/.test(message) ? 'Client feedback' : /question/.test(message) ? 'FAQs' : 'Studio' })),
    form.content.share.coverId && !visibleIds.has(form.content.share.coverId) && { message: 'Choose a sharing photograph from your public work.', tab: 'Settings' },
    ...form.projects.flatMap(item => [!item.title.trim() && { message: 'Give this project a title.', tab: 'Projects', projectId: item.id }, !item.photoIds.length && { message: `Add photographs to ${item.title || 'your untitled project'}.`, tab: 'Projects', projectId: item.id }])
  ].filter(Boolean);
  const destination = destinations.find(item => item.tabs.includes(tab));
  const unpublished = Boolean(profile?.hasUnpublishedChanges || draft.dirty);
  function fixReadiness(item) {
    setConfirmation(null);
    setTab(item.tab);
    if (/process step/.test(item.message)) setShowAbout(true);
    if (item.projectId) setProjectId(item.projectId);
  }
  function readinessLinks() { return <ul className="v-pedit-readiness">{readiness.map((item, index) => <li key={`${item.message}-${index}`}><button onClick={() => fixReadiness(item)}>{item.message}<ChevronRight size={16} /></button></li>)}</ul>; }
  const canEdit = profile?.access === 'public';
  useEffect(() => {
    if (profile?.latestJob) setJob(profile.latestJob);
  }, [profile?.latestJob]);
  useEffect(() => {
    if (!profile || !canEdit) return;
    const controller = new AbortController();
    setActivityError('');
    api.get('/v1/portfolios/mine/activity', {
      signal: controller.signal
    }).then(({
      data
    }) => setActivity(data.data)).catch(err => { if (!controller.signal.aborted) setActivityError(apiMessage(err, 'Activity could not be loaded. Try again.')); });
    return () => controller.abort();
  }, [canEdit, profile?.publishedRevision, activityRetry]);
  useEffect(() => {
    if (!canEdit) return;
    const controller = new AbortController();
    api.get('/v1/portfolios/mine/enquiries', { params: { page: 1 }, signal: controller.signal }).then(({ data }) => setEnquiryCounts(data.counts || {})).catch(() => {});
    return () => controller.abort();
  }, [canEdit]);
  useEffect(() => {
    if (!canEdit || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.handle) || form.handle.length < 3) {
      setAvailability(null);
      return;
    }
    const controller = new AbortController();
    setAvailability(null);
    const timer = setTimeout(() => api.get(`/v1/portfolios/handles/${form.handle}/availability`, {
      signal: controller.signal
    }).then(({
      data
    }) => setAvailability(data)).catch(() => {}), 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.handle, canEdit]);
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    const controller = new AbortController();
    const timer = setInterval(() => api.get(`/v1/portfolios/mine/jobs/${job.id || job._id}`, {
      signal: controller.signal
    }).then(({
      data
    }) => setJob(data.data)).catch(() => {}), 2500);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [job?.id, job?._id, job?.status]);
  useEffect(() => () => clearTimeout(undoTimer.current), []);
  function update(key, value) {
    setForm(current => ({
      ...current,
      [key]: value
    }));
  }
  function patchPhoto(id, changes) {
    setForm(current => {
      const items = current.items.map(item => item.id === id ? {
        ...item,
        ...changes
      } : item);
      const removedCover = changes.featured === false && current.items.some(item => item.id === id && item.publicId === current.heroPublicId);
      return { ...current, items, heroPublicId: removedCover ? items.find(item => item.featured)?.publicId || '' : current.heroPublicId };
    });
  }
  function patchProject(changes) {
    if (newProject) {
      const next = { ...newProject, ...changes };
      setForm(current => ({ ...current, projects: [...current.projects, next] }));
      setProjectId(next.id);
      setNewProject(null);
      return;
    }
    setForm(current => ({
      ...current,
      projects: current.projects.map(item => item.id === projectId ? {
        ...item,
        ...changes
      } : item)
    }));
  }
  function closeProject() { setNewProject(null); setProjectId(null); }
  async function copyPublicLink() {
    try { await navigator.clipboard.writeText(`${APP_URL.replace(/\/$/, '')}/@${profile.live?.handle || form.handle}`); setNotice('Portfolio link copied.'); }
    catch { setActionError('Copy the portfolio address shown above.'); }
  }
  function reorder(from, to) {
    if (to < 0 || to >= form.items.length || from === to) return;
    setForm(current => {
      const items = [...current.items];
      items.splice(to, 0, items.splice(from, 1)[0]);
      return {
        ...current,
        items
      };
    });
  }
  function remove(ids) {
    const removed = form.items.filter(item => ids.includes(item.id));
    const prior = form;
    setForm(current => {
      const items = current.items.filter(item => !ids.includes(item.id));
      const projects = current.projects.map(item => {
        const photoIds = item.photoIds.filter(id => !ids.includes(id));
        return {
          ...item,
          photoIds,
          coverId: photoIds.includes(item.coverId) ? item.coverId : photoIds[0] || ''
        };
      });
      return repairPortfolioReferences({
        ...current,
        items,
        projects,
        heroPublicId: removed.some(item => item.publicId === current.heroPublicId) ? items.find(item => item.featured)?.publicId || '' : current.heroPublicId
      });
    });
    setSelected([]);
    setDetail(null);
    clearTimeout(undoTimer.current);
    setUndo({
      prior,
      removed,
      autoHero: removed.some(item => item.publicId === prior.heroPublicId) ? prior.items.find(item => !ids.includes(item.id) && item.featured)?.publicId || '' : prior.heroPublicId
    });
    undoTimer.current = setTimeout(() => setUndo(null), 10000);
  }
  function undoRemoval() {
    setForm(current => ({
      ...current,
      items: undo.prior.items.map(item => current.items.find(photo => photo.id === item.id) || item).concat(current.items.filter(item => !undo.prior.items.some(photo => photo.id === item.id))),
      projects: current.projects.map(item => {
        const before = undo.prior.projects.find(old => old.id === item.id);
        return before ? {
          ...item,
          photoIds: [...new Set([...before.photoIds, ...item.photoIds])],
          coverId: undo.removed.some(photo => photo.id === before.coverId) && item.coverId === (before.photoIds.find(id => !undo.removed.some(photo => photo.id === id)) || '') ? before.coverId : item.coverId || before.coverId
        } : item;
      }),
      content: {
        ...current.content,
        categoryDetails: current.content.categoryDetails.map(detail => {
          const before = undo.prior.content.categoryDetails.find(old => old.id === detail.id);
          return !detail.coverId && before && undo.removed.some(photo => photo.id === before.coverId && photo.category === detail.name) ? { ...detail, coverId: before.coverId } : detail;
        }),
        share: {
          ...current.content.share,
          coverId: !current.content.share.coverId && undo.removed.some(photo => photo.id === undo.prior.content.share.coverId) ? undo.prior.content.share.coverId : current.content.share.coverId
        }
      },
      heroPublicId: current.heroPublicId === undo.autoHero ? undo.prior.heroPublicId : current.heroPublicId
    }));
    setUndo(null);
  }
  async function run(action) {
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await action();
    } catch (err) {
      setActionError(apiMessage(err, err.message || 'We could not complete that action. Try again.'));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    await run(async () => {
      const revision = await draft.flush();
      const {
        data
      } = await api.post('/v1/portfolios/mine/publish', {
        expectedDraftRevision: revision,
        publicationConfirmed: permission
      });
      draft.applyProfile(data);
      setConfirmation(null);
      setNotice('Your portfolio is published. Your link is ready to share.');
    });
  }
  async function unpublish() {
    await run(async () => {
      const revision = await draft.flush();
      const {
        data
      } = await api.post('/v1/portfolios/mine/unpublish', {
        expectedDraftRevision: revision
      });
      draft.applyProfile(data);
      setConfirmation(null);
      setNotice('Your portfolio is private. Your saved work is still here.');
    });
  }
  async function direct() {
    await run(async () => {
      const revision = await draft.flush();
      const {
        data
      } = await api.post('/v1/portfolios/mine/direct', {
        expectedDraftRevision: revision
      });
      setJob(data.data);
    });
  }
  async function review(accept) {
    await run(async () => {
      const revision = await draft.flush();
      const {
        data
      } = await api.post(`/v1/portfolios/mine/jobs/${job.id || job._id}/review`, {
        decision: accept ? 'accepted' : 'dismissed',
        expectedDraftRevision: revision
      });
      if (accept) {
        const result = job.result || {};
        const proposal = result.direction || result;
        const patch = {
          headline: proposal.headline,
          introLine: proposal.introLine,
          heroPublicId: proposal.heroPublicId,
          direction: Object.fromEntries(['background', 'accent', 'typeStyle', 'rhythm', 'layout'].filter(key => proposal[key] !== undefined).map(key => [key, proposal[key]]))
        };
        const before = form;
        const order = proposal.orderedPublicIds;
        aiUndo.current = {
          before,
          patch,
          order
        };
        setForm(current => ({
          ...current,
          ...Object.fromEntries(['headline', 'introLine', 'heroPublicId'].filter(key => typeof patch[key] === 'string').map(key => [key, patch[key]])),
          direction: {
            ...current.direction,
            ...(patch.direction || {})
          },
          items: order ? [...order.map(id => current.items.find(item => item.publicId === id || item.id === id)).filter(Boolean), ...current.items.filter(item => !order.includes(item.publicId) && !order.includes(item.id))] : current.items
        }));
        setNotice('The suggestions are in your private draft. Review them before publishing.');
      }
      setJob(data.data || {
        ...job,
        reviewDecision: accept ? 'accepted' : 'dismissed'
      });
    });
  }
  function undoDirection() {
    const saved = aiUndo.current;
    if (!saved) return;
    setForm(current => {
      const changes = {};
      for (const key of ['headline', 'introLine', 'heroPublicId']) if (current[key] === saved.patch[key]) changes[key] = saved.before[key];
      const direction = {
        ...current.direction
      };
      for (const [key, value] of Object.entries(saved.patch.direction || {})) if (direction[key] === value) direction[key] = saved.before.direction[key];
      const orderUnchanged = saved.order && current.items.every((item, index) => item.publicId === saved.order[index] || item.id === saved.order[index]);
      return {
        ...current,
        ...changes,
        direction,
        items: orderUnchanged ? saved.before.items.map(before => current.items.find(item => item.id === before.id)).filter(Boolean) : current.items
      };
    });
    aiUndo.current = null;
    setNotice('The suggestions were undone. Later edits were kept.');
  }
  if (draft.loading) return <main className="v-pedit"><p role="status">Opening your portfolio…</p></main>;
  if (draft.error) return <main className="v-pedit"><h1>Your portfolio</h1><p role="alert">{draft.error}</p><button onClick={draft.load}>Try again</button></main>;
  return <main className="v-pedit">
    <header className="v-pedit-header">
      <div><Link to="/dashboard" className="v-pedit-back"><ArrowLeft size={16} />Studio dashboard</Link><h1>Portfolio</h1>
        <div className="v-pedit-status"><span className={`v-pedit-dot ${profile.status === 'published' ? 'live' : ''}`} /><strong>{profile.status === 'published' ? 'Live' : 'Private'}</strong><span className={`v-pedit-save ${draft.saveState}`} role="status">{draft.saveState === 'saving' ? 'Saving…' : draft.saveState === 'failed' ? 'Changes not saved' : draft.dirty ? 'Unsaved changes' : unpublished ? 'Draft saved · not published' : profile.status === 'published' ? 'All changes published' : 'Private draft saved'}</span></div>
      </div>
      <div className="v-pedit-header-actions"><button onClick={() => setPreview(true)}><Monitor size={16} />Preview</button>{canEdit && <button className="v-pedit-primary" onClick={() => { setPermission(false); setConfirmation('publish'); }} disabled={busy || Boolean(draft.conflict) || (profile.status === 'published' && !unpublished)}>{profile.status === 'published' ? 'Publish changes' : 'Publish portfolio'}</button>}</div>
      {profile.status === 'published' && <div className="v-pedit-link-row"><a href={`/@${profile.live?.handle || form.handle}`} target="_blank" rel="noreferrer">{APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')}/@{profile.live?.handle || form.handle}<ExternalLink size={14} /></a><button aria-label="Copy portfolio link" onClick={copyPublicLink}><Copy size={15} />Copy link</button></div>}
    </header>
    {!canEdit && <div className="v-pedit-notice"><h2>{profile.access === 'private' ? 'Your portfolio is saved privately' : 'Portfolio publishing is included with Pro'}</h2><p>{profile.access === 'private' ? 'Your public link is closed. Upgrade to edit and publish your saved work again.' : 'Choose Pro to build and publish your studio portfolio.'}</p><Link to="/settings">View your plan</Link></div>}
    {draft.recovery && <div className="v-pedit-notice"><p>This browser has changes that were not saved. Restore them to review, or keep the server draft.</p><button onClick={draft.restoreRecovery}>Restore browser changes</button><button onClick={draft.dismissRecovery}>Keep saved draft</button></div>}
    {draft.conflict && <div className="v-pedit-notice" role="alert"><h2>Review your draft before saving</h2><p>{draft.conflict.recovery ? 'Your restored changes are ready to review.' : 'This draft changed in another tab. Saving your version will replace those changes.'}</p><button onClick={draft.keepChanges}>Save my version</button><button onClick={draft.load}>Reload saved draft</button></div>}
    {draft.saveError && !draft.conflict && <div className="v-pedit-notice" role="alert"><p>{draft.saveError}</p><button onClick={() => void draft.flush().catch(() => {})}>Retry save</button></div>}
    {(actionError || notice || profile.mediaNotice) && <div className="v-pedit-notice" role={actionError ? 'alert' : 'status'}><p>{actionError || notice || profile.mediaNotice}</p>{aiUndo.current && <button onClick={undoDirection}>Undo suggestions</button>}</div>}
    <div className="v-pedit-workspace">
      <aside className="v-pedit-sidebar">
        <label className="v-pedit-section-select"><span>Portfolio section</span><select aria-label="Portfolio section" value={destination?.tabs[0] || 'Settings'} onChange={event => setTab(event.target.value)}>{destinations.map(item => <option key={item.name} value={item.tabs[0]}>{item.name}{item.name === 'Enquiries' && enquiryCounts.new ? ` (${enquiryCounts.new} new)` : ''}</option>)}<option value="Settings">Portfolio settings</option></select></label>
        <nav className="v-pedit-destinations" aria-label="Portfolio editor">{destinations.map(({ name, icon: Icon, tabs }) => <button key={name} aria-pressed={tabs.includes(tab)} onClick={() => setTab(tabs[0])}><Icon size={18} /><span>{name}</span>{name === 'Enquiries' && enquiryCounts.new > 0 && <small>{enquiryCounts.new}</small>}</button>)}<button className="v-pedit-settings-link" aria-pressed={tab === 'Settings'} onClick={() => setTab('Settings')}><Settings size={18} /><span>Settings</span></button></nav>
      </aside>
      <div className="v-pedit-panel">
        {destination?.tabs.length > 1 && <nav className="v-pedit-tabs" aria-label={`${destination.name} sections`}>{destination.tabs.map(name => <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name === 'Work' ? 'Photographs' : name === 'Studio' ? 'Basics & contact' : name}{name === 'Work' && <span>{form.items.length}/50</span>}</button>)}</nav>}
        {readiness.length > 0 && canEdit && <details className="v-pedit-publish-check"><summary>{readiness.length} {readiness.length === 1 ? 'thing' : 'things'} to finish before publishing</summary>{readinessLinks()}</details>}
        <fieldset className="v-pedit-content" disabled={!canEdit || busy}>
      {tab === 'Enquiries' && canEdit && <PortfolioEnquiries embedded onCountsChange={setEnquiryCounts} />}
      {tab === 'Activity' && canEdit && <section><div className="v-pedit-section-head"><div><h2>Portfolio activity</h2><p>How visitors have used your portfolio over the last 30 days.</p></div><button onClick={() => setActivityRetry(value => value + 1)}>Refresh activity</button></div>{activityError && <p role="alert">{activityError}</p>}{!activity && !activityError && <p role="status">Loading activity…</p>}
    {activity && <div className="v-pedit-activity" aria-label="Portfolio activity over the last 30 days">{[['views', 'Visits'], ['uniqueVisitors', 'Visitors'], ['projectOpens', 'Project opens'], ['contactClicks', 'Contact clicks'], ['enquiries', 'Submitted enquiries']].map(([key, label]) => <div key={key}><strong>{activity[key] || 0}</strong><span>{label}</span></div>)}<small>Last 30 days · Enquiry links are clicks, not confirmed bookings.</small></div>}
    {activity && <details className="v-pedit-activity-details"><summary>Browse and contact activity</summary><dl>{[['categoryOpens', 'Category selections'], ['serviceOpens', 'Service enquiry clicks'], ['whatsappClicks', 'WhatsApp clicks'], ['instagramClicks', 'Instagram clicks'], ['emailClicks', 'Email clicks']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{activity[key] || 0}</dd></div>)}</dl><p>Counts cover the last 30 days. Common crawlers and repeats within 15 seconds are excluded where identified. A contact click does not confirm a message or booking.</p></details>}

      </section>}
      {tab === 'Services' && <PortfolioCollectionEditor form={form} setForm={setForm} Field={Field} kind="services" />}
      {tab === 'Client feedback' && <PortfolioCollectionEditor form={form} setForm={setForm} Field={Field} kind="testimonials" />}
      {tab === 'FAQs' && <PortfolioCollectionEditor form={form} setForm={setForm} Field={Field} kind="faqs" />}
      {tab === 'Settings' && <><h2>Portfolio settings</h2><Field label="Portfolio address" value={form.handle} onChange={value => update('handle', value.toLowerCase())} maxLength={40} hint={`${APP_URL.replace(/\/$/, '')}/@${form.handle || 'your-studio'}${availability ? availability.available ? ' · Address available' : ' · This address is unavailable' : ''}`} /><PortfolioShareSettings form={form} setForm={setForm} Field={Field} />{profile.status === 'published' && <section className="v-pedit-privacy"><h3>Public access</h3><p>Making your portfolio private closes its public and project links. Your saved work stays here.</p><button onClick={() => setConfirmation('unpublish')}>Make private</button></section>}</>}
      {tab === 'Categories' && <PortfolioCategories form={form} setForm={setForm} Sheet={Sheet} />}
      {tab === 'Work' && <><div className="v-pedit-section-head v-pedit-work-head"><h2>Your photographs</h2><button ref={addRef} aria-label="Add photographs" onClick={() => setPicker(true)} disabled={form.items.length >= 50}><Plus size={17} />Add photos</button></div><p className="v-pedit-work-help">Choose up to 50 photographs. Drag or use the arrows to set their order.</p><PortfolioHomeArrangement form={form} setForm={setForm} />{selected.length > 0 && <div className="v-pedit-bulk"><span>{selected.length} selected</span><select value={bulkCategory} onChange={event => setBulkCategory(event.target.value)} aria-label="Category for selected photographs"><option value="">Choose a category</option><option value="Selected work">No category</option>{categories.map(name => <option key={name} value={name}>{name}</option>)}</select><button disabled={!bulkCategory} onClick={() => {
            setForm(current => ({
              ...current,
              items: current.items.map(item => selected.includes(item.id) ? {
                ...item,
                category: bulkCategory.trim()
              } : item)
            }));
            setSelected([]);
            setBulkCategory('');
          }}>Apply category</button><button onClick={() => setConfirmation('remove')}>Remove selected</button><button onClick={() => setSelected([])}>Clear</button></div>}{form.items.length ? <DragDropProvider sensors={sensors} onDragEnd={event => {
          if (event.canceled) return;
          const source = event.operation.source;
          if (source && typeof source.initialIndex === 'number' && typeof source.index === 'number') reorder(source.initialIndex, source.index);
        }}><div className="v-pedit-photo-grid">{form.items.map((item, index) => <PhotoTile key={item.id} photo={item} index={index} count={form.items.length} selected={selected.includes(item.id)} cover={form.heroPublicId === item.publicId} onEdit={() => setDetail(item.id)} onSelect={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} onMove={to => reorder(index, to)} />)}</div></DragDropProvider> : <div className="v-pedit-empty"><ImageIcon size={32} /><h3>Start with four photographs you are proud of</h3><p>Choose finished work from your deliveries or library. Private delivery links and passwords stay private.</p><button onClick={() => setPicker(true)}>Choose photographs</button></div>}</>}
      {tab === 'Projects' && <><div className="v-pedit-section-head"><div><h2>Show a complete set</h2><p>A project can share photographs with your selected work. Each photograph counts once.</p></div><button disabled={profile.redesignEnabled === false} onClick={() => {
            setNewProject({ id: crypto.randomUUID(), title: '', description: '', category: 'Selected work', photoIds: [], coverId: '' });
            setProjectId(null);
          }}><Plus size={17} />Add project</button></div>{profile.redesignEnabled === false && <p>Projects are not available on this deployment yet.</p>}<div className="v-pedit-project-grid">{form.projects.map(item => {
            const cover = form.items.find(photo => photo.id === item.coverId);
            return <button key={item.id} className="v-pedit-project-card" onClick={() => setProjectId(item.id)}>{cover ? <img src={cover.thumbnailUrl || cover.url} alt="" loading="lazy" /> : <div><ImageIcon size={28} /></div>}<strong>{item.title || 'Untitled project'}</strong><span>{item.photoIds.length} photographs<ChevronRight size={16} /></span>{(!item.title.trim() || !item.photoIds.length) && <small className="v-pedit-project-incomplete">Finish this project before publishing</small>}</button>;
          })}</div>{!form.projects.length && <div className="v-pedit-empty"><h3>Projects are optional</h3><p>Give a wedding, portrait session or lookbook its own page and share that link with a new client.</p></div>}</>}
      {tab === 'Studio' && <>
        <div className="v-pedit-form-grid"><section><h2>Your studio</h2><Field label="Studio name" value={form.studioName} onChange={() => {}} readOnly hint="This name is shared with your studio account." /><Link to="/settings">Change studio name</Link><Field label="Short studio introduction" value={form.bio} onChange={value => update('bio', value)} multiline maxLength={600} rows={3} hint="What you photograph and where you work. A longer biography is optional below." /><Field label="Location" value={form.location} onChange={value => update('location', value)} maxLength={120} placeholder="Lagos, Nigeria" /><Field label="Headline" value={form.headline} onChange={value => update('headline', value)} maxLength={100} placeholder="Wedding and portrait photography" /><Field label="Opening line" value={form.introLine} onChange={value => update('introLine', value)} maxLength={240} /></section>
        <section><h2>Contact</h2><Field label="WhatsApp number" value={form.whatsapp} onChange={value => update('whatsapp', value)} maxLength={30} inputMode="tel" placeholder="08012345678" error={errors.whatsapp} /><Field label="Instagram" value={form.instagram} onChange={value => update('instagram', value)} maxLength={100} placeholder="@yourstudio or your profile link" error={errors.instagram} /><Field label="WhatsApp button label" value={form.contactLabel} onChange={value => update('contactLabel', value)} maxLength={50} /><PortfolioContactSettings form={form} setForm={setForm} Field={Field} /></section></div>
        <details className="v-pedit-disclosure" open={showAbout} onToggle={event => setShowAbout(event.currentTarget.open)}><summary>About, portrait and studio logo <span>Optional</span></summary><PortfolioStudioExtras form={form} setForm={setForm} Field={Field} /></details>
      </>}
      {tab === 'Design' && <><PortfolioDesignPicker form={form} onChange={design => setForm(current => ({ ...current, direction: { ...current.direction, ...design.defaults, template: design.id } }))} onPreview={id => { setPreviewDesign(id); setPreview(true); }} /><details className="v-pedit-disclosure"><summary>Adjust colours, type and motion</summary><div className="v-pedit-form-grid"><section><h2>Fine-tune this design</h2>{[['background', 'Background', [['ink', 'Ink'], ['warm-black', 'Warm black'], ['ivory', 'Ivory']]], ['typeStyle', 'Headings', [['editorial', 'Editorial'], ['modern', 'Modern'], ['classic', 'Classic']]], ['rhythm', 'Spacing', [['measured', 'Measured'], ['quiet', 'More space'], ['bold', 'Less space']]], ['motion', 'Motion', [['expressive', 'Expressive'], ['subtle', 'Subtle'], ['still', 'Still']]]].map(([key, label, options]) => <label className="v-pedit-field" key={key}><span>{label}</span><select value={form.direction[key]} onChange={event => update('direction', {
                ...form.direction,
                [key]: event.target.value
              })}>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>)}<Field label="Accent colour" type="color" value={form.direction.accent} onChange={value => update('direction', {
              ...form.direction,
              accent: value
            })} hint="Text contrast is adjusted automatically." /><p className="v-pedit-design-hint">Expressive adds longer reveals and photo transitions. Subtle keeps movement short. Still removes animation. Your chosen motion applies to the public portfolio. Visitors can still control the photo viewer.</p></section><section><h2>What visitors see</h2><label className="v-pedit-field"><span>Gallery arrangement</span><select aria-label="Gallery arrangement" value={form.content.galleryArrangement} onChange={event => setForm(current => ({ ...current, content: { ...current.content, galleryArrangement: event.target.value } }))}><option value="design">Design default</option><option value="grid">Even grid</option><option value="columns">Columns</option></select><small>Cinema keeps its horizontal photo strips.</small></label>{[['showBio', 'Studio introduction'], ['showLocation', 'Location'], ['showCategories', 'Category filters'], ['showPhotoTitles', 'Photo captions']].map(([key, label]) => <label className="v-pedit-toggle" key={key}><input type="checkbox" checked={form.direction[key]} onChange={event => update('direction', {
                ...form.direction,
                [key]: event.target.checked
              })} />{label}</label>)}<PortfolioSectionSettings form={form} setForm={setForm} /><details className="v-pedit-disclosure v-pedit-ai"><summary>Get arrangement suggestions <span>Optional</span></summary><p>Receive suggestions for your introduction and photo order. Your photographs stay unchanged, and nothing is published automatically.</p><button onClick={direct} disabled={form.items.length < 4 || ['queued', 'running'].includes(job?.status)}>Suggest an arrangement</button>{job && <p role="status">{['queued', 'running'].includes(job.status) ? `Working on your saved draft${job.progress ? ` · ${Math.round(job.progress)}%` : '…'}` : job.status === 'review' ? 'Your suggestions are ready to review.' : job.status === 'failed' ? 'The suggestions could not be completed. You can try again.' : job.status === 'cancelled' ? 'The job was cancelled. Your draft is unchanged.' : ''}</p>}{['queued', 'running'].includes(job?.status) && <button onClick={() => run(async () => {
                const {
                  data
                } = await api.post(`/v1/portfolios/mine/jobs/${job.id || job._id}/cancel`);
                setJob(data.data);
              })}>Cancel job</button>}{job?.status === 'review' && !job.reviewDecision && <><div className="v-pedit-ai-review"><h3>{job.result?.direction?.headline}</h3><p>{job.result?.direction?.introLine}</p><p>{job.result?.direction?.designReason}</p><p>Proposed photo order and cover</p><div className="v-pedit-ai-order">{(job.result?.direction?.orderedPublicIds || []).map((id, index) => {
                      const photo = form.items.find(item => item.publicId === id);
                      return photo ? <figure key={id}><img src={photo.thumbnailUrl || photo.url} alt={photo.alt || photo.title || `Photograph ${index + 1}`} loading="lazy" /><figcaption>{job.result.direction.heroPublicId === id ? 'Cover' : index + 1}</figcaption></figure> : null;
                    })}</div></div><p>Check these changes before adding them to your draft.</p><button onClick={() => review(true)}>Use these suggestions</button><button onClick={() => review(false)}>Dismiss</button></>}</details></section></div></details></>}
    </fieldset>
      </div>
    </div>
    {undo && <div className="v-pedit-undo" role="status"><span>{undo.removed.length} photograph{undo.removed.length === 1 ? '' : 's'} removed from this draft.</span><button onClick={undoRemoval}>Undo</button></div>}
    {picker && <PortfolioPhotoPicker items={form.items} triggerRef={addRef} onClose={() => setPicker(false)} onAdd={items => setForm(current => {
      const added = items.filter(item => !current.items.some(photo => photo.publicId === item.publicId)).slice(0, 50 - current.items.length).map(item => ({
        ...item,
        title: '',
        category: 'Selected work',
        alt: '',
        featured: true,
        crop: 'fit',
        focalX: 50,
        focalY: 50
      }));
      return {
        ...current,
        items: [...current.items, ...added],
        heroPublicId: current.heroPublicId || added[0]?.publicId || ''
      };
    })} />}
    {photo && <Sheet title="Photograph details" onClose={() => setDetail(null)}><div className="v-pedit-detail-photo"><img src={photo.url || photo.thumbnailUrl} alt={photo.alt || photo.title || 'Selected photograph'} style={{
          objectFit: photo.crop === 'fill' ? 'cover' : 'contain',
          objectPosition: `${photo.focalX}% ${photo.focalY}%`
        }} /></div><Field label="Caption" value={photo.title} onChange={value => patchPhoto(photo.id, {
        title: value
      })} maxLength={100} hint="Optional. File names are never used as new captions." /><PortfolioCategoryField categories={categories} value={photo.category} onChange={value => patchPhoto(photo.id, {
        category: value
      })} /><Field label="Image description" value={photo.alt} onChange={value => patchPhoto(photo.id, {
        alt: value
      })} maxLength={180} hint="Describe what is in the photograph for people using a screen reader." /><label className="v-pedit-toggle"><input type="checkbox" checked={photo.featured} onChange={event => patchPhoto(photo.id, {
          featured: event.target.checked
        })} />Show in main gallery</label><small className="v-pcategories-note">Category membership is separate. Turn this off to keep the photograph out of your main gallery.</small><label className="v-pedit-field"><span>Image fit</span><select value={photo.crop} onChange={event => patchPhoto(photo.id, {
          crop: event.target.value
        })}><option value="fit">Show the whole photograph</option><option value="fill">Fill the frame</option></select></label>{photo.crop === 'fill' && <><Field label="Horizontal focus" type="range" min="0" max="100" value={photo.focalX} onChange={value => patchPhoto(photo.id, {
          focalX: Number(value)
        })} /><Field label="Vertical focus" type="range" min="0" max="100" value={photo.focalY} onChange={value => patchPhoto(photo.id, {
          focalY: Number(value)
        })} /></>}<div className="v-pedit-sheet-actions"><button disabled={!photo.featured} onClick={() => update('heroPublicId', photo.publicId)}>{photo.publicId === form.heroPublicId ? 'Cover photograph' : 'Use as cover'}</button><button onClick={() => {
          setSelected([photo.id]);
          setConfirmation('remove');
        }}><Trash2 size={16} />Remove photograph</button><button className="v-pedit-primary" onClick={() => setDetail(null)}>Done</button></div></Sheet>}
    {project && <Sheet title={newProject ? 'New project' : 'Project details'} onClose={closeProject}>
      <fieldset className="v-pedit-project-fields" disabled={!canEdit || busy}>
        <Field label="Project title" value={project.title} onChange={title => patchProject({ title })} maxLength={100} placeholder="A traditional wedding in Lagos" />
        <h3>Photographs</h3><p>Choose photos, then set their cover and order. Only select work you have permission to show publicly.</p>
        <div className="v-pedit-project-photos">{form.items.map((item, index) => <button key={item.id} aria-label={`Include ${item.title || `photograph ${index + 1}`} in project`} aria-pressed={project.photoIds.includes(item.id)} onClick={() => {
          const photoIds = project.photoIds.includes(item.id) ? project.photoIds.filter(id => id !== item.id) : [...project.photoIds, item.id];
          patchProject({ photoIds, coverId: photoIds.includes(project.coverId) ? project.coverId : photoIds[0] || '' });
        }}><img src={item.thumbnailUrl || item.url} alt={item.alt || item.title || `Photograph ${index + 1}`} loading="lazy" />{project.photoIds.includes(item.id) && <span><Check size={16} /></span>}</button>)}</div>
        {!form.items.length && <p>Add photographs in Work first.</p>}
        <ol className="v-pedit-project-order">{project.photoIds.map((id, index) => {
          const item = form.items.find(photo => photo.id === id);
          const move = offset => { const photoIds = [...project.photoIds]; [photoIds[index], photoIds[index + offset]] = [photoIds[index + offset], photoIds[index]]; patchProject({ photoIds }); };
          return <li key={id}><span>{item?.title || `Photograph ${form.items.indexOf(item) + 1}`}</span><button onClick={() => patchProject({ coverId: id })}>{project.coverId === id ? 'Cover' : 'Use as cover'}</button><button aria-label={`Move project photograph ${index + 1} earlier`} disabled={!index} onClick={() => move(-1)}><ArrowUp size={15} /></button><button aria-label={`Move project photograph ${index + 1} later`} disabled={index === project.photoIds.length - 1} onClick={() => move(1)}><ArrowDown size={15} /></button></li>;
        })}</ol>
        <details className="v-pedit-disclosure"><summary>Introduction and shoot details <span>Optional</span></summary><Field label="Project introduction" value={project.description} onChange={description => patchProject({ description })} maxLength={400} multiline rows={3} /><PortfolioCategoryField categories={categories} value={project.category} onChange={category => patchProject({ category })} /><PortfolioProjectExtras project={project} projects={form.projects} patchProject={patchProject} Field={Field} /></details>
        {!newProject && (!project.title.trim() || !project.photoIds.length) && <p className="v-pedit-error">This project is saved privately. Add a title and photographs before publishing.</p>}
        <div className="v-pedit-sheet-actions v-pedit-project-actions">{!newProject && <button onClick={() => setConfirmation('project-remove')}><Trash2 size={16} />Remove project</button>}<button className="v-pedit-primary" onClick={closeProject}>{newProject ? 'Cancel' : 'Done'}</button></div>
      </fieldset>
    </Sheet>}
    {confirmation && <Sheet title={confirmation === 'publish' ? 'Publish your portfolio' : confirmation === 'unpublish' ? 'Make your portfolio private?' : 'Remove from your draft?'} onClose={() => {
      if (!busy) setConfirmation(null);
    }}>{confirmation === 'publish' ? <><p>Visitors will see this saved version of your selected work, projects, studio details and contact links.</p>{profile.live?.handle && profile.live.handle !== form.handle && <p>Your address will change. The previous address redirects for 90 days. Address changes have a 90-day cooldown.</p>}{readiness.length ? readinessLinks() : <p>{visibleIds.size} unique photographs are ready to publish.</p>}<label className="v-pedit-toggle"><input type="checkbox" checked={permission} onChange={event => setPermission(event.target.checked)} />I have permission to show these photographs publicly.</label><div className="v-pedit-sheet-actions"><button onClick={() => setConfirmation(null)} disabled={busy}>Keep editing</button><button className="v-pedit-primary" onClick={publish} disabled={busy || !permission || readiness.length > 0}>{busy ? 'Preparing and publishing…' : 'Publish now'}</button></div></> : confirmation === 'unpublish' ? <><p>Your public portfolio and project links will close. Your private draft will stay saved.</p><div className="v-pedit-sheet-actions"><button onClick={() => setConfirmation(null)} disabled={busy}>Keep published</button><button onClick={unpublish} disabled={busy}>Make private</button></div></> : <><p>{confirmation === 'project-remove' ? 'This removes the project from your draft. Its photographs stay in your portfolio.' : 'This removes the selected photographs from your work and projects. The original files stay in your library or delivery.'} Publish later to update what visitors see.</p><div className="v-pedit-sheet-actions"><button onClick={() => setConfirmation(null)}>Keep it</button><button onClick={() => {
            if (confirmation === 'project-remove') {
              setForm(current => repairPortfolioReferences({
                ...current,
                projects: current.projects.filter(item => item.id !== projectId)
              }));
              setProjectId(null);
            } else remove(selected);
            setConfirmation(null);
          }}>Remove</button></div></>}{actionError && <p role="alert" className="v-pedit-error">{actionError}</p>}</Sheet>}
    {preview && <Preview form={form} initialDesign={previewDesign} onClose={() => { setPreview(false); setPreviewDesign(''); }} onUseDesign={canEdit ? direction => update('direction', direction) : undefined} />}
  </main>;
}
