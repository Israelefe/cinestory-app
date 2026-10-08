import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, ExternalLink, GripVertical, Image as ImageIcon, Monitor, Plus, Smartphone, Tablet, Trash2, X } from 'lucide-react';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { KeyboardSensor, PointerSensor, PointerActivationConstraints } from '@dnd-kit/dom';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import api, { apiMessage } from '../services/api.js';
import { contactErrors } from '../services/portfolio.js';
import { usePortfolioDraft } from '../hooks/usePortfolioDraft.js';
import { useAssistantWorkflow } from '../components/AssistantContext.jsx';
import AssistantEntry from '../components/AssistantEntry.jsx';
import { useDialogFocus } from '../components/useDialogFocus.js';
import PortfolioPhotoPicker from '../components/PortfolioPhotoPicker.jsx';
import PortfolioDesignPicker from '../components/PortfolioDesignPicker.jsx';
import PortfolioCategories, { PortfolioCategoryField } from '../components/PortfolioCategories.jsx';
import { portfolioCategories, hasPortfolioCategory } from '../services/portfolioCategories.js';
import { portfolioDesigns, findPortfolioDesign } from '../components/portfolioDesigns.js';
import PortfolioCanvas from './PortfolioCanvas.jsx';
import { PortfolioStudioExtras, PortfolioCollectionEditor, PortfolioPublishing, PortfolioProjectExtras } from '../components/PortfolioContentEditor.jsx';
import { contentReadiness, repairPortfolioReferences } from '../services/portfolioContent.mjs';
import { APP_URL } from '../config/env.js';
import './ManagePortfolio.css';
const sensors = [PointerSensor.configure({
  activationConstraints: event => event.pointerType === 'touch' ? [new PointerActivationConstraints.Delay({
    value: 250,
    tolerance: 5
  })] : [new PointerActivationConstraints.Distance({
    value: 5
  })]
}), KeyboardSensor];
const tabs = ['Work', 'Categories', 'Projects', 'Studio', 'Services', 'Client feedback', 'FAQs', 'Design', 'Publishing'];
function Sheet({
  title,
  children,
  onClose,
  wide = false
}) {
  const ref = useRef(null);
  useDialogFocus(true, ref, onClose);
  return <div className="v-pedit-overlay" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}><section className={`v-pedit-sheet ${wide ? 'v-pedit-sheet-wide' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><header><h2>{title}</h2><button aria-label={`Close ${title}`} onClick={onClose}><X size={20} /></button></header>{children}</section></div>;
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
  return <article ref={ref} className={`v-pedit-photo ${isDragging ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''}`}><button className="v-pedit-photo-image" onClick={onEdit} aria-label={`Edit photograph ${index + 1}`}><img src={photo.thumbnailUrl || photo.url} alt={photo.alt || photo.title || `Photograph ${index + 1}`} loading="lazy" />{cover && <span>Cover</span>}{!photo.featured && <span>Off main gallery</span>}</button><div className="v-pedit-photo-info"><button className="v-pedit-checkbox" aria-label={`Select photograph ${index + 1}`} aria-pressed={selected} onClick={onSelect}>{selected && <Check size={15} />}</button><button onClick={onEdit}><strong>{photo.title || `Photograph ${index + 1}`}</strong><small>{photo.category}</small></button><button ref={handleRef} aria-label={`Drag photograph ${index + 1} to reorder`} className="v-pedit-grip"><GripVertical size={18} /></button></div><div className="v-pedit-photo-order"><button onClick={() => onMove(index - 1)} disabled={index === 0} aria-label={`Move photograph ${index + 1} earlier`}><ArrowUp size={14} /></button><button onClick={() => onMove(index + 1)} disabled={index === count - 1} aria-label={`Move photograph ${index + 1} later`}><ArrowDown size={14} /></button></div></article>;
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
  return <Sheet title="Preview your portfolio" onClose={onClose} wide><div className="v-pedit-preview-tools"><p>This is your private draft. Visitors see your last published version.</p><nav aria-label="Preview screen size">{[['phone', Smartphone, 'Phone'], ['tablet', Tablet, 'Tablet'], ['desktop', Monitor, 'Desktop']].map(([key, Icon, name]) => <button key={key} aria-pressed={device === key} onClick={() => setDevice(key)}><Icon size={16} />{name}</button>)}</nav></div><div className="v-pedit-preview-design"><label><span>Preview design</span><select value={design.id} onChange={event => setDesignId(event.target.value)}>{portfolioDesigns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p>{design.mobile}</p>{design.id !== form.direction.template && onUseDesign && <button className="v-pedit-primary" onClick={() => { onUseDesign(direction); onClose(); }}>Use {design.name} design</button>}</div><div className="v-pedit-preview-scroll" data-portfolio-scroll ref={ref}><div style={{
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
  const [tab, setTab] = useState('Work');
  const [picker, setPicker] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewDesign, setPreviewDesign] = useState('');
  const [detail, setDetail] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [availability, setAvailability] = useState(null);
  const [activity, setActivity] = useState(null);
  const [job, setJob] = useState(null);
  const [undo, setUndo] = useState(null);
  const addRef = useRef(null);
  const undoTimer = useRef(null);
  const aiUndo = useRef(null);
  const photo = form.items.find(item => item.id === detail);
  useAssistantWorkflow({ kind: 'portfolio', step: tab.toLowerCase().replaceAll(' ', '-'), unsaved: Boolean(draft.dirty), busy: draft.loading || draft.saveState === 'saving' || Boolean(busy), hasError: Boolean(draft.error || actionError), previewOpen: preview }, {
    'portfolio-intro': proposal => { setForm(current => ({ ...current, bio: proposal.text })); return 'Introduction added to your private Portfolio form. Check the save status before publishing.'; }
  });
  const project = form.projects.find(item => item.id === projectId);
  const categories = portfolioCategories(form);
  const errors = contactErrors(form);
  const visibleIds = new Set([...form.items.filter(item => item.featured || (form.direction.showCategories && hasPortfolioCategory(item.category))).map(item => item.id), ...form.projects.flatMap(item => item.photoIds)]);
  const readiness = [!form.studioName.trim() && 'Set your studio name in account settings.', (form.handle !== profile?.persistedHandle && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.handle) || form.handle.length < 3 || form.handle.length > 40)) && 'Choose a portfolio address with 3–40 letters, numbers or single hyphens.', !form.bio.trim() && 'Write a short studio introduction.', visibleIds.size < 4 && 'Choose at least four public photographs.', !form.items.some(item => item.publicId === form.heroPublicId && visibleIds.has(item.id)) && 'Choose a public cover photograph.', ...Object.values(errors), ...contentReadiness(form.content), form.content.share.coverId && !visibleIds.has(form.content.share.coverId) && 'Choose a sharing cover that appears in your public work.', ...form.projects.flatMap(item => [!item.title.trim() && 'Give each project a title.', !item.photoIds.length && 'Add photographs to each project.'])].filter(Boolean);
  const canEdit = profile?.access === 'public';
  useEffect(() => {
    if (profile?.latestJob) setJob(profile.latestJob);
  }, [profile?.latestJob]);
  useEffect(() => {
    if (!profile || !canEdit) return;
    const controller = new AbortController();
    api.get('/v1/portfolios/mine/activity', {
      signal: controller.signal
    }).then(({
      data
    }) => setActivity(data.data)).catch(() => {});
    return () => controller.abort();
  }, [canEdit, profile?.publishedRevision]);
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
    setForm(current => ({
      ...current,
      projects: current.projects.map(item => item.id === projectId ? {
        ...item,
        ...changes
      } : item)
    }));
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
  return <main className="v-pedit"><header className="v-pedit-header"><div><Link to="/dashboard" className="v-pedit-back"><ArrowLeft size={16} />Studio dashboard</Link><p className="v-pedit-eyebrow">YOUR PUBLIC WORK</p><h1>Portfolio</h1><p>A place for new clients to see your work and ask about a shoot.</p></div><div className="v-pedit-header-actions"><span className={`v-pedit-save ${draft.saveState}`} role="status">{draft.saveState === 'saving' ? 'Saving private draft…' : draft.saveState === 'failed' ? 'Changes not saved' : draft.dirty ? 'Unsaved changes' : 'Private draft saved'}</span><AssistantEntry /><button onClick={() => setPreview(true)}><Monitor size={16} />Preview</button>{canEdit && <button className="v-pedit-primary" onClick={() => {
          setPermission(false);
          setConfirmation('publish');
        }} disabled={busy || Boolean(draft.conflict)}>Publish{profile.status === 'published' ? ' changes' : ' portfolio'}</button>}</div></header>
    {!canEdit && <div className="v-pedit-notice"><h2>{profile.access === 'private' ? 'Your portfolio is saved privately' : 'Portfolio publishing is included with Pro'}</h2><p>{profile.access === 'private' ? 'Your public link is closed. Upgrade to edit and publish your saved work again.' : 'Choose Pro to build and publish your studio portfolio.'}</p><Link to="/settings">View your plan</Link></div>}
    {draft.recovery && <div className="v-pedit-notice"><p>This browser has changes that were not saved. Restore them to review, or keep the server draft.</p><button onClick={draft.restoreRecovery}>Restore browser changes</button><button onClick={draft.dismissRecovery}>Keep saved draft</button></div>}
    {draft.conflict && <div className="v-pedit-notice" role="alert"><h2>Review your draft before saving</h2><p>{draft.conflict.recovery ? 'Your restored changes are ready to review.' : 'This draft changed in another tab. Saving your version will replace those changes.'}</p><button onClick={draft.keepChanges}>Save my version</button><button onClick={draft.load}>Reload saved draft</button></div>}
    {draft.saveError && !draft.conflict && <div className="v-pedit-notice" role="alert"><p>{draft.saveError}</p><button onClick={() => void draft.flush().catch(() => {})}>Retry save</button></div>}
    {(actionError || notice || profile.mediaNotice) && <div className="v-pedit-notice" role={actionError ? 'alert' : 'status'}><p>{actionError || notice || profile.mediaNotice}</p>{aiUndo.current && <button onClick={undoDirection}>Undo suggestions</button>}</div>}
    <section className="v-pedit-publication"><div><span className={`v-pedit-dot ${profile.status === 'published' ? 'live' : ''}`} /><strong>{profile.status === 'published' ? 'Published' : 'Private'}</strong><span>{profile.hasUnpublishedChanges || draft.dirty ? 'Changes are waiting to be published.' : profile.status === 'published' ? 'Your latest published version is live.' : 'Only you can see this draft.'}</span></div>{profile.status === 'published' && <div><a href={`/@${profile.live?.handle || form.handle}`} target="_blank" rel="noreferrer">Open public portfolio<ExternalLink size={15} /></a><button onClick={() => setConfirmation('unpublish')} disabled={busy}>Make private</button></div>}</section>
    {activity && <div className="v-pedit-activity" aria-label="Portfolio activity over the last 30 days">{[['views', 'Visits'], ['uniqueVisitors', 'Visitors'], ['projectOpens', 'Project opens'], ['contactClicks', 'Contact clicks'], ['enquiries', 'Submitted enquiries']].map(([key, label]) => <div key={key}><strong>{activity[key] || 0}</strong><span>{label}</span></div>)}<small>Last 30 days · Enquiry links are clicks, not confirmed bookings.</small></div>}
    {activity && <details className="v-pedit-activity-details"><summary>Browse and contact activity</summary><dl>{[['categoryOpens', 'Category selections'], ['serviceOpens', 'Service enquiry clicks'], ['whatsappClicks', 'WhatsApp clicks'], ['instagramClicks', 'Instagram clicks'], ['emailClicks', 'Email clicks']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{activity[key] || 0}</dd></div>)}</dl><p>Counts cover the last 30 days. Common crawlers and repeats within 15 seconds are excluded where identified. A contact click does not confirm a message or booking.</p></details>}
    <nav className="v-pedit-tabs" aria-label="Portfolio editor">{tabs.map(name => <button key={name} aria-pressed={tab === name} onClick={() => {
        setTab(name);
        setSelected([]);
      }}>{name}{name === 'Work' && <span>{form.items.length}/50</span>}</button>)}</nav>
    <fieldset className="v-pedit-content" disabled={!canEdit || busy}>
      {tab === 'Services' && <PortfolioCollectionEditor form={form} setForm={setForm} Field={Field} kind="services" />}
      {tab === 'Client feedback' && <PortfolioCollectionEditor form={form} setForm={setForm} Field={Field} kind="testimonials" />}
      {tab === 'FAQs' && <PortfolioCollectionEditor form={form} setForm={setForm} Field={Field} kind="faqs" />}
      {tab === 'Publishing' && <PortfolioPublishing form={form} setForm={setForm} Field={Field} />}
      {tab === 'Studio' && <PortfolioStudioExtras form={form} setForm={setForm} Field={Field} />}
      {tab === 'Categories' && <PortfolioCategories form={form} setForm={setForm} Sheet={Sheet} />}
      {tab === 'Work' && <><div className="v-pedit-section-head"><div><h2>Choose the work clients see</h2><p>Drag to reorder, or use the arrows. Add a caption only when it helps.</p><button onClick={() => setTab('Categories')}>Manage categories</button></div><button ref={addRef} onClick={() => setPicker(true)} disabled={form.items.length >= 50}><Plus size={17} />Add photographs</button></div>{selected.length > 0 && <div className="v-pedit-bulk"><span>{selected.length} selected</span><select value={bulkCategory} onChange={event => setBulkCategory(event.target.value)} aria-label="Category for selected photographs"><option value="">Choose a category</option><option value="Selected work">No category</option>{categories.map(name => <option key={name} value={name}>{name}</option>)}</select><button disabled={!bulkCategory} onClick={() => {
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
            const id = crypto.randomUUID();
            setForm(current => ({
              ...current,
              projects: [...current.projects, {
                id,
                title: '',
                description: '',
                category: 'Selected work',
                photoIds: [],
                coverId: ''
              }]
            }));
            setProjectId(id);
          }}><Plus size={17} />Add project</button></div>{profile.redesignEnabled === false && <p>Projects are not available on this deployment yet.</p>}<div className="v-pedit-project-grid">{form.projects.map(item => {
            const cover = form.items.find(photo => photo.id === item.coverId);
            return <button key={item.id} className="v-pedit-project-card" onClick={() => setProjectId(item.id)}>{cover ? <img src={cover.thumbnailUrl || cover.url} alt="" loading="lazy" /> : <div><ImageIcon size={28} /></div>}<strong>{item.title || 'Untitled project'}</strong><span>{item.photoIds.length} photographs<ChevronRight size={16} /></span></button>;
          })}</div>{!form.projects.length && <div className="v-pedit-empty"><h3>Projects are optional</h3><p>Give a wedding, portrait session or lookbook its own page and share that link with a new client.</p></div>}</>}
      {tab === 'Studio' && <div className="v-pedit-form-grid"><section><h2>Your studio</h2><Field label="Studio name" value={form.studioName} onChange={() => {}} readOnly hint="This name is shared with your studio account." /><Link to="/settings">Change your studio name in settings</Link><Field label="Portfolio address" value={form.handle} onChange={value => update('handle', value.toLowerCase())} maxLength={40} hint={`${APP_URL.replace(/\/$/, '')}/@${form.handle || 'your-studio'}${availability ? availability.available ? ' · Address available' : ' · This address is unavailable' : ''}`} /><Field label="About your studio" value={form.bio} onChange={value => update('bio', value)} multiline maxLength={600} rows={5} hint="Tell clients what you photograph and where you work." /><Field label="Location" value={form.location} onChange={value => update('location', value)} maxLength={120} placeholder="Lagos, Nigeria" /></section><section><h2>Contact and introduction</h2><Field label="Headline" value={form.headline} onChange={value => update('headline', value)} maxLength={100} placeholder="Wedding and portrait photography" /><Field label="Opening line" value={form.introLine} onChange={value => update('introLine', value)} maxLength={240} /><Field label="WhatsApp number" value={form.whatsapp} onChange={value => update('whatsapp', value)} maxLength={30} inputMode="tel" placeholder="08012345678" error={errors.whatsapp} /><Field label="Instagram" value={form.instagram} onChange={value => update('instagram', value)} maxLength={100} placeholder="@yourstudio or your profile link" error={errors.instagram} /><Field label="Contact button" value={form.contactLabel} onChange={value => update('contactLabel', value)} maxLength={50} hint="This label is used for WhatsApp. It does not send a booking request." /></section></div>}
      {tab === 'Design' && <><PortfolioDesignPicker form={form} onChange={design => setForm(current => ({ ...current, direction: { ...current.direction, ...design.defaults, template: design.id } }))} onPreview={id => { setPreviewDesign(id); setPreview(true); }} /><div className="v-pedit-form-grid"><section><h2>Fine-tune this design</h2>{[['background', 'Background', [['ink', 'Ink'], ['warm-black', 'Warm black'], ['ivory', 'Ivory']]], ['typeStyle', 'Headings', [['editorial', 'Editorial'], ['modern', 'Modern'], ['classic', 'Classic']]], ['rhythm', 'Spacing', [['measured', 'Measured'], ['quiet', 'More space'], ['bold', 'Less space']]], ['motion', 'Motion', [['expressive', 'Expressive'], ['subtle', 'Subtle'], ['still', 'Still']]]].map(([key, label, options]) => <label className="v-pedit-field" key={key}><span>{label}</span><select value={form.direction[key]} onChange={event => update('direction', {
                ...form.direction,
                [key]: event.target.value
              })}>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>)}<Field label="Accent colour" type="color" value={form.direction.accent} onChange={value => update('direction', {
              ...form.direction,
              accent: value
            })} hint="Text contrast is adjusted automatically." /><p className="v-pedit-design-hint">Expressive adds longer reveals and photo transitions. Subtle keeps movement short. Still removes animation. Your visitors’ reduced-motion setting is always respected.</p></section><section><h2>What visitors see</h2><label className="v-pedit-field"><span>Gallery arrangement</span><select aria-label="Gallery arrangement" value={form.content.galleryArrangement} onChange={event => setForm(current => ({ ...current, content: { ...current.content, galleryArrangement: event.target.value } }))}><option value="design">Design default</option><option value="grid">Even grid</option><option value="columns">Columns</option></select><small>Cinema keeps its horizontal photo strips.</small></label>{[['showBio', 'Studio introduction'], ['showLocation', 'Location'], ['showCategories', 'Category filters'], ['showPhotoTitles', 'Photo captions'], ['showContact', 'Contact links']].map(([key, label]) => <label className="v-pedit-toggle" key={key}><input type="checkbox" checked={form.direction[key]} onChange={event => update('direction', {
                ...form.direction,
                [key]: event.target.checked
              })} />{label}</label>)}<div className="v-pedit-ai"><h3>Get a second look</h3><p>Receive suggestions for your introduction and photo order. Your photographs stay unchanged, and nothing is published automatically.</p><button onClick={direct} disabled={form.items.length < 4 || ['queued', 'running'].includes(job?.status)}>Suggest an arrangement</button>{job && <p role="status">{['queued', 'running'].includes(job.status) ? `Working on your saved draft${job.progress ? ` · ${Math.round(job.progress)}%` : '…'}` : job.status === 'review' ? 'Your suggestions are ready to review.' : job.status === 'failed' ? 'The suggestions could not be completed. You can try again.' : job.status === 'cancelled' ? 'The job was cancelled. Your draft is unchanged.' : ''}</p>}{['queued', 'running'].includes(job?.status) && <button onClick={() => run(async () => {
                const {
                  data
                } = await api.post(`/v1/portfolios/mine/jobs/${job.id || job._id}/cancel`);
                setJob(data.data);
              })}>Cancel job</button>}{job?.status === 'review' && !job.reviewDecision && <><div className="v-pedit-ai-review"><h3>{job.result?.direction?.headline}</h3><p>{job.result?.direction?.introLine}</p><p>{job.result?.direction?.designReason}</p><p>Proposed photo order and cover</p><div className="v-pedit-ai-order">{(job.result?.direction?.orderedPublicIds || []).map((id, index) => {
                      const photo = form.items.find(item => item.publicId === id);
                      return photo ? <figure key={id}><img src={photo.thumbnailUrl || photo.url} alt={photo.alt || photo.title || `Photograph ${index + 1}`} loading="lazy" /><figcaption>{job.result.direction.heroPublicId === id ? 'Cover' : index + 1}</figcaption></figure> : null;
                    })}</div></div><p>Check these changes before adding them to your draft.</p><button onClick={() => review(true)}>Use these suggestions</button><button onClick={() => review(false)}>Dismiss</button></>}</div></section></div></>}
    </fieldset>
    <Link to="/portfolio/enquiries">Open your enquiry inbox</Link>
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
    {project && <Sheet title="Project details" onClose={() => setProjectId(null)}><Field label="Project title" value={project.title} onChange={title => patchProject({
        title
      })} maxLength={100} placeholder="A traditional wedding in Lagos" /><Field label="Introduction" value={project.description} onChange={description => patchProject({
        description
      })} maxLength={400} multiline rows={3} /><PortfolioCategoryField categories={categories} value={project.category} onChange={category => patchProject({
        category
      })} /><PortfolioProjectExtras project={project} projects={form.projects} patchProject={patchProject} Field={Field} /><p>Choose only the photographs you have permission to show publicly.</p><div className="v-pedit-project-photos">{form.items.map(item => <button key={item.id} aria-pressed={project.photoIds.includes(item.id)} onClick={() => {
          const photoIds = project.photoIds.includes(item.id) ? project.photoIds.filter(id => id !== item.id) : [...project.photoIds, item.id];
          patchProject({
            photoIds,
            coverId: photoIds.includes(project.coverId) ? project.coverId : photoIds[0] || ''
          });
        }}><img src={item.thumbnailUrl || item.url} alt={item.alt || item.title || 'Portfolio photograph'} loading="lazy" />{project.photoIds.includes(item.id) && <span><Check size={16} /></span>}</button>)}</div>{!form.items.length && <p>Add photographs in Work first.</p>}<ol className="v-pedit-project-order">{project.photoIds.map((id, index) => {
          const item = form.items.find(photo => photo.id === id);
          return <li key={id}><span>{item?.title || `Photograph ${form.items.indexOf(item) + 1}`}</span><button onClick={() => patchProject({
              coverId: id
            })}>{project.coverId === id ? 'Cover' : 'Use as cover'}</button><button aria-label={`Move project photograph ${index + 1} earlier`} disabled={index === 0} onClick={() => {
              const photoIds = [...project.photoIds];
              [photoIds[index - 1], photoIds[index]] = [photoIds[index], photoIds[index - 1]];
              patchProject({
                photoIds
              });
            }}><ArrowUp size={15} /></button></li>;
        })}</ol><div className="v-pedit-sheet-actions"><button onClick={() => setConfirmation('project-remove')}><Trash2 size={16} />Remove project</button><button className="v-pedit-primary" onClick={() => setProjectId(null)}>Done</button></div></Sheet>}
    {confirmation && <Sheet title={confirmation === 'publish' ? 'Publish your portfolio' : confirmation === 'unpublish' ? 'Make your portfolio private?' : 'Remove from your draft?'} onClose={() => {
      if (!busy) setConfirmation(null);
    }}>{confirmation === 'publish' ? <><p>Visitors will see this saved version of your selected work, projects, studio details and contact links.</p>{profile.live?.handle && profile.live.handle !== form.handle && <p>Your address will change. The previous address redirects for 90 days. Address changes have a 90-day cooldown.</p>}{readiness.length ? <ul className="v-pedit-readiness">{readiness.map(message => <li key={message}>{message}</li>)}</ul> : <p>{visibleIds.size} unique photographs are ready to publish.</p>}<label className="v-pedit-toggle"><input type="checkbox" checked={permission} onChange={event => setPermission(event.target.checked)} />I have permission to show these photographs publicly.</label><div className="v-pedit-sheet-actions"><button onClick={() => setConfirmation(null)} disabled={busy}>Keep editing</button><button className="v-pedit-primary" onClick={publish} disabled={busy || !permission || readiness.length > 0}>{busy ? 'Preparing and publishing…' : 'Publish now'}</button></div></> : confirmation === 'unpublish' ? <><p>Your public portfolio and project links will close. Your private draft will stay saved.</p><div className="v-pedit-sheet-actions"><button onClick={() => setConfirmation(null)} disabled={busy}>Keep published</button><button onClick={unpublish} disabled={busy}>Make private</button></div></> : <><p>{confirmation === 'project-remove' ? 'This removes the project from your draft. Its photographs stay in your portfolio.' : 'This removes the selected photographs from your work and projects. The original files stay in your library or delivery.'} Publish later to update what visitors see.</p><div className="v-pedit-sheet-actions"><button onClick={() => setConfirmation(null)}>Keep it</button><button onClick={() => {
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
