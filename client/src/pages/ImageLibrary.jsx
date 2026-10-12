import React, { useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCheck, Download, FolderOpen, HardDrive, Image, Plus, Search, Send, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { useAssistantWorkflow } from '../components/AssistantContext.jsx';
import { useDialogFocus } from '../components/useDialogFocus.js';
import LibraryShell from '../components/library/LibraryShell.jsx';
import PhotoViewer from '../components/library/PhotoViewer.jsx';
import { useLibraryPhotos } from '../components/library/useLibraryPhotos.js';
import { downloadUrl, formatBytes, photoId, shootName } from '../components/library/libraryHelpers.js';
import { libraryUploads } from '../utils/libraryUploadQueue.js';
import { ProPrice } from '../components/ProPricing.jsx';

function PhotoDetails({ photo, onSaved, onRemove, readOnly }) {
  const [folder, setFolder] = useState(shootName(photo.folder));
  const [tags, setTags] = useState((photo.tags || []).join(', '));
  const [caption, setCaption] = useState(photo.caption || '');
  const [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault(); setBusy(true);
    try { const { data } = await api.patch('/v1/storage/' + photoId(photo), { folder: folder.trim() || 'Unfiled', tags: tags.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 12), caption: caption.trim() }); onSaved(data.data); toast.success('Details saved.'); }
    catch (error) { toast.error(apiMessage(error, 'These details could not be saved.')); } finally { setBusy(false); }
  }
  return <><p className="lib-eyebrow">{shootName(photo.folder)}</p><h2>Photograph details</h2><p>{photo.rawPublicId ? photo.rawFormat?.toUpperCase() + ' original + JPEG preview' : (photo.format?.toUpperCase() || 'Image') + ' photograph'}</p>{photo.rawPublicId && <small>Download original keeps the camera file unchanged.</small>}<details><summary>Organise and add notes</summary><form onSubmit={save}><label>Shoot<input value={folder} maxLength={100} disabled={readOnly} onChange={event => setFolder(event.target.value)} /></label><label>Tags<input value={tags} maxLength={500} disabled={readOnly} onChange={event => setTags(event.target.value)} placeholder="Separate tags with commas" /></label><label>Internal caption note<textarea value={caption} rows={3} maxLength={180} disabled={readOnly} onChange={event => setCaption(event.target.value)} /></label><small>For your future deliveries. Review the final client caption before publishing.</small>{!readOnly && <button type="submit" className="lib-button" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>}</form></details><button type="button" className="lib-button lib-danger" onClick={() => onRemove([photoId(photo)])}><Trash2 size={16} />Remove photograph</button></>;
}

function AddPhotos({ shoots, initialFolder, onClose }) {
  const dialog = useRef(null), input = useRef(null);
  const [folder, setFolder] = useState(initialFolder || 'Unfiled');
  const [custom, setCustom] = useState('');
  const [dragging, setDragging] = useState(false);
  useDialogFocus(true, dialog, onClose);
  function add(files) {
    if (!files?.length) return;
    if (folder === '__new' && !custom.trim()) return toast.error('Give this shoot a name first.');
    libraryUploads.add(files, { folder: folder === '__new' ? custom.trim() : folder });
    onClose();
  }
  return <div className="lib-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><motion.section ref={dialog} className="lib-dialog" role="dialog" aria-modal="true" aria-labelledby="lib-upload-title" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}><header><div><p className="lib-eyebrow">PHOTO LIBRARY</p><h2 id="lib-upload-title">Add photographs</h2></div><button type="button" aria-label="Close upload setup" onClick={onClose}><X size={20} /></button></header><label>Add to shoot<select value={folder} onChange={event => setFolder(event.target.value)}><option value="Unfiled">Unfiled</option>{shoots.filter(shoot => shoot.name !== 'Unfiled').map(shoot => <option key={shoot.name} value={shoot.name}>{shoot.name}</option>)}<option value="__new">New shoot…</option></select></label>{folder === '__new' && <label>Shoot name<input maxLength={100} value={custom} onChange={event => setCustom(event.target.value)} placeholder="For example, Ada at 30" /></label>}<button type="button" className={'lib-dropzone ' + (dragging ? 'is-dragging' : '')} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); add(event.dataTransfer.files); }} onClick={() => input.current?.click()}><Upload size={30} /><strong>Choose photographs</strong><span>Or drop your files here</span></button><input ref={input} hidden type="file" multiple accept="image/jpeg,image/png,image/webp,.arw,.cr2,.cr3,.dng,.nef,.nrw,.orf,.rw2,.raf,.pef,.srw,.3fr,.iiq,.mos,.mef,.mrw,.rwl,.x3f" onChange={event => add(event.target.files)} /><p className="lib-fine">JPEG, PNG, WebP and supported camera RAW files. Up to 100 MB each. Camera originals keep a separate JPEG preview; both use storage.</p></motion.section></div>;
}

export default function ImageLibrary() {
  const navigate = useNavigate();
  const [folder, setFolder] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState(null);
  const [actionValue, setActionValue] = useState('');
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef(null);
  const library = useLibraryPhotos({ folder, search, type });
  const uploads = useSyncExternalStore(libraryUploads.subscribe, libraryUploads.getSnapshot);
  const uploading = uploads.entries.some(entry => entry.scope === 'library' && !['added', 'failed', 'cancelled'].includes(entry.state));
  useAssistantWorkflow({ uploading, busy: uploading || library.loading });
  useDialogFocus(Boolean(action), confirmRef, () => !busy && setAction(null));
  const writable = library.access === 'read-write';
  const usage = library.usage || {};
  const count = library.libraryTotal || library.assets.length;
  function switchFolder(value) { setFolder(value); setSelected([]); }
  async function download(ids) {
    try { const { data } = await api.post('/v1/storage/photos/archive', { assetIds: ids }); window.location.assign(downloadUrl(data.data.url)); }
    catch (error) { toast.error(apiMessage(error, 'The download could not be prepared.')); }
  }
  async function downloadPhoto(photo) {
    try { const { data } = await api.get('/v1/storage/' + photoId(photo) + '/download'); window.location.assign(downloadUrl(data.data.url)); }
    catch (error) { toast.error(apiMessage(error, 'The original could not be downloaded.')); }
  }
  async function runAction(event) {
    event.preventDefault(); setBusy(true);
    try {
      if (action.kind === 'new-shoot') { await api.post('/v1/storage/shoots', { name: actionValue.trim() }); setFolder(actionValue.trim()); }
      if (action.kind === 'move') { await api.patch('/v1/storage/photos/move', { assetIds: action.ids, folder: actionValue.trim() || 'Unfiled' }); toast.success('Photographs moved.'); setSelected([]); }
      if (action.kind === 'delete') {
        const failed = []; let removed = 0;
        for (const id of action.ids) { try { await api.delete('/v1/storage/' + id); removed++; } catch (error) { failed.push({ id, message: apiMessage(error, 'This photograph could not be removed.') }); } }
        setSelected(failed.map(item => item.id)); setViewer(null);
        if (removed) toast.success(removed + ' photograph' + (removed === 1 ? '' : 's') + ' removed.');
        if (failed.length) toast.error(failed[0].message, { autoClose: 10000 });
      }
      setAction(null); library.reload();
    } catch (error) { toast.error(apiMessage(error, 'This change could not be saved.')); } finally { setBusy(false); }
  }
  function startWorkflow(kind) { navigate(kind === 'preselection' ? '/pre-selection/new' : '/editor-links/new', { state: { assetIds: selected, folder } }); }
  return <LibraryShell compact title="Photo Library" description="Your shoots, originals and finished edits." action={writable && <button type="button" className="lib-button lib-primary" aria-label="Add photographs" onClick={() => setAdding(true)}><Plus size={18} /><span>Add photographs</span></button>}>
    <div className="lib-storage"><HardDrive size={16} /><span><strong>{formatBytes(usage.usedBytes)}</strong> of {formatBytes(usage.limitBytes || 100 * 1024 ** 3)} used</span><div className="lib-progress"><i style={{ transform: 'scaleX(' + Math.min(1, (usage.usedBytes || 0) / (usage.limitBytes || 1)) + ')' }} /></div><Link to="/videos/library">Shared with video originals</Link></div>
    {library.access === 'read-only' && <div className="lib-notice">Your library is read-only during its retention period. Download or remove photographs, or <Link to="/billing">renew Pro</Link> to upload and organise.</div>}
    {library.access === 'unavailable' ? <section className="lib-empty lib-locked"><HardDrive size={32} /><h2>Keep your shoots in your Library.</h2><p>Pro includes 100 GB for photographs and video originals, Photo Pre-selection, and Editor Links.</p><Link to="/billing" className="lib-button lib-primary">Pro · <ProPrice /> / month</Link></section> : <div className="lib-browser"><aside className="lib-shoots"><div><strong>Shoots</strong>{writable && <button type="button" aria-label="Create shoot" onClick={() => { setAction({ kind: 'new-shoot' }); setActionValue(''); }}><Plus size={17} /></button>}</div><button type="button" className={!folder ? 'is-active' : ''} onClick={() => switchFolder('')}><Image size={17} /><span>All photographs</span><small>{count}</small></button>{library.shoots.map(shoot => <button type="button" key={shoot.name} className={folder === shoot.name ? 'is-active' : ''} onClick={() => switchFolder(shoot.name)}><FolderOpen size={17} /><span>{shoot.name}</span><small>{shoot.count || 0}</small></button>)}</aside><section className="lib-browser-main"><div className="lib-mobile-shoots"><select aria-label="Filter by shoot" value={folder} onChange={event => switchFolder(event.target.value)}><option value="">All photographs</option>{library.shoots.map(shoot => <option key={shoot.name} value={shoot.name}>{shoot.name}</option>)}</select>{writable && <button type="button" className="lib-button" aria-label="Create shoot" onClick={() => { setAction({ kind: 'new-shoot' }); setActionValue(''); }}><Plus size={18} /></button>}</div><div className="lib-toolbar"><label className="lib-search"><Search size={17} /><input aria-label="Search photo library" placeholder="Search filenames or tags" value={search} onChange={event => { setSearch(event.target.value); setSelected([]); }} /></label><select aria-label="Filter file type" value={type} onChange={event => { setType(event.target.value); setSelected([]); }}><option value="">All file types</option><option value="raw">Camera originals</option><option value="image">JPEG, PNG &amp; WebP</option></select></div><div className="lib-section-label"><h2>{folder || 'All photographs'}</h2><span>{library.total || 0} photograph{library.total === 1 ? '' : 's'}</span>{library.assets.length > 0 && <button type="button" onClick={() => setSelected(selected.length ? [] : library.assets.map(photoId).slice(0, 500))}>{selected.length ? 'Clear selection' : 'Select loaded photos'}</button>}</div>
    {selected.length > 0 && <div className="lib-bulk" aria-label="Selected photograph actions"><strong>{selected.length} selected</strong>{writable && <><button type="button" onClick={() => startWorkflow('preselection')}><CheckCheck size={16} />Pre-selection</button><button type="button" onClick={() => startWorkflow('editor-handoff')}><Send size={16} />Editor Link</button><button type="button" onClick={() => { setAction({ kind: 'move', ids: selected }); setActionValue(folder || 'Unfiled'); }}><FolderOpen size={16} />Move</button></>}<button type="button" onClick={() => download(selected)}><Download size={16} />Download</button><button type="button" className="lib-danger" onClick={() => setAction({ kind: 'delete', ids: selected })}><Trash2 size={16} />Remove</button></div>}
    {library.error ? <div className="lib-error" role="alert">{library.error}<button type="button" onClick={library.reload}>Try again</button></div> : library.loading && !library.assets.length ? <div className="lib-empty" role="status"><span className="lib-loader" />Opening your photographs…</div> : !library.assets.length ? <div className="lib-empty"><Image size={34} /><h2>{search || folder || type ? 'No photographs in this view.' : 'Start with a shoot.'}</h2><p>{search || folder || type ? 'Try another search or add photographs to this shoot.' : 'Add your photographs, then choose what to do with them.'}</p>{writable && <button type="button" className="lib-button lib-primary" onClick={() => setAdding(true)}><Upload size={17} />Add photographs</button>}</div> : <div className="lib-photo-grid">{library.assets.map((photo, index) => { const id = photoId(photo), chosen = selected.includes(id); return <motion.article className={'lib-photo ' + (chosen ? 'is-selected' : '')} key={id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><button type="button" className="lib-photo-open" aria-label={'Open ' + photo.originalFilename} onClick={() => setViewer(index)}><img src={photo.thumbnailUrl || photo.url} alt={photo.originalFilename || 'Photograph'} loading="lazy" decoding="async" /><span>{photo.originalFilename}</span></button><button type="button" className="lib-check" aria-label={'Select ' + photo.originalFilename} aria-pressed={chosen} onClick={() => setSelected(current => chosen ? current.filter(value => value !== id) : current.length < 500 ? [...current, id] : current)}>{chosen && <Check size={16} />}</button>{photo.rawPublicId && <small className="lib-file-badge">{photo.rawFormat?.toUpperCase()}</small>}</motion.article>; })}</div>}{library.hasMore && <button type="button" className="lib-button lib-more" disabled={library.loading} onClick={library.loadMore}>{library.loading ? 'Loading…' : 'Load more photographs'}</button>}</section></div>}
    <AnimatePresence>{adding && <AddPhotos shoots={library.shoots} initialFolder={folder} onClose={() => setAdding(false)} />}{viewer !== null && <PhotoViewer photos={library.assets} initialIndex={viewer} onClose={() => setViewer(null)} onDownload={downloadPhoto} details={photo => <PhotoDetails photo={photo} readOnly={!writable} onSaved={() => { setViewer(null); library.reload(); }} onRemove={ids => setAction({ kind: 'delete', ids })} />} />}{action && <div className="lib-backdrop"><section ref={confirmRef} className="lib-dialog" role="dialog" aria-modal="true" aria-labelledby="lib-action-title"><header><h2 id="lib-action-title">{action.kind === 'delete' ? 'Remove ' + action.ids.length + ' photograph' + (action.ids.length === 1 ? '' : 's') + '?' : action.kind === 'move' ? 'Move photographs' : 'Create a shoot'}</h2><button type="button" aria-label="Close confirmation" disabled={busy} onClick={() => setAction(null)}><X size={20} /></button></header><form onSubmit={runAction}>{action.kind === 'delete' ? <p>This removes the stored originals and previews. Photos used in a live link must be kept until that link is closed.</p> : <label>Shoot name<input autoFocus required maxLength={100} value={actionValue} onChange={event => setActionValue(event.target.value)} placeholder="For example, Ada at 30" /></label>}<footer><button type="button" className="lib-button" disabled={busy} onClick={() => setAction(null)}>Cancel</button><button type="submit" className={'lib-button ' + (action.kind === 'delete' ? 'lib-danger' : 'lib-primary')} disabled={busy}>{busy ? 'Saving…' : action.kind === 'delete' ? 'Remove photographs' : action.kind === 'move' ? 'Move photographs' : 'Create shoot'}</button></footer></form></section></div>}</AnimatePresence>
  </LibraryShell>;
}
