import { ProPrice } from '../components/ProPricing.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { Check, Clipboard, Download, FolderOpen, HardDrive, Image, LockKeyhole, MessageSquareText, RotateCcw, Search, ShieldCheck, Tag, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { isRawPhoto, uploadLibraryPhotos } from '../utils/storageUpload.js';
import './ImageLibrary.css';

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

function bytes(value) {
  if (!value) return '0 GB';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export default function ImageLibrary() {
  const reduced = useVeyloReducedMotion();
  const inputRef = useRef(null);
  const [assets, setAssets] = useState([]);
  const [usage, setUsage] = useState({ usedBytes: 0, limitBytes: 50 * 1024 ** 3 });
  const [access, setAccess] = useState('unavailable');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('All photographs');
  const [uploadFolder, setUploadFolder] = useState('All photographs');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [active, setActive] = useState(null);
  const [activeFolder, setActiveFolder] = useState('');
  const [activeTags, setActiveTags] = useState('');
  const [activeCaption, setActiveCaption] = useState('');
  const [serverFolders, setServerFolders] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [panel, setPanel] = useState('photos');
  const [collaborations, setCollaborations] = useState([]);
  const [compose, setCompose] = useState(null);
  const [draft, setDraft] = useState({ title: '', clientName: '', note: '', expiresInDays: 30, pin: '', password: '' });
  const [pickerAssets, setPickerAssets] = useState([]);
  const [pickerPage, setPickerPage] = useState(1);
  const [pickerHasMore, setPickerHasMore] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [createdCollaboration, setCreatedCollaboration] = useState(null);

  async function load(nextPage = 1) {
    try {
      setLoading(true);
      const { data } = await api.get('/v1/storage', { params: { page: nextPage } });
      setAssets(current => nextPage === 1 ? (data.data || []) : [...current, ...(data.data || [])]);
      setServerFolders(data.folders || []); setPage(nextPage); setHasMore(Boolean(data.hasMore));
      setUsage(data.usage || usage);
      setAccess(data.access || 'unavailable');
    } catch (error) {
      toast.error(apiMessage(error, 'We could not open your image library.'));
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (access !== 'unavailable') api.get('/v1/storage/collaborations').then(({ data }) => setCollaborations(data.data || [])).catch(() => {});
  }, [access]);

  async function loadPicker(nextPage = 1) {
    try {
      setPickerLoading(true);
      const { data } = await api.get('/v1/storage', { params: { page: nextPage } });
      setPickerAssets(current => nextPage === 1 ? (data.data || []) : [...current, ...(data.data || [])]);
      setPickerPage(nextPage);
      setPickerHasMore(Boolean(data.hasMore));
    } catch (error) { toast.error(apiMessage(error, 'We could not load your photographs.')); }
    finally { setPickerLoading(false); }
  }

  function openComposer(kind) {
    setCompose(kind); setCreatedCollaboration(null); setSelectedIds([]);
    setDraft({ title: '', clientName: '', note: '', expiresInDays: 30, pin: '', password: '' });
    loadPicker(1);
  }

  function closeComposer() {
    setCompose(null); setCreatedCollaboration(null);
    setDraft(current => ({ ...current, pin: '', password: '' }));
  }

  async function createCollaboration(event) {
    event.preventDefault();
    if (!selectedIds.length) return toast.error('Choose at least one photograph.');
    try {
      const body = { ...draft, kind: compose, assetIds: selectedIds, expiresInDays: Number(draft.expiresInDays) };
      if (compose === 'preselection') delete body.password;
      else delete body.pin;
      const { data } = await api.post('/v1/storage/collaborations', body);
      setCreatedCollaboration(data.data);
      setCollaborations(current => [data.data, ...current]);
      toast.success(compose === 'preselection' ? 'Client selection link created.' : 'Editor link created.');
    } catch (error) { toast.error(apiMessage(error, 'We could not create that sharing link.')); }
  }

  function collaborationUrl(item) {
    return `${window.location.origin}/${item.kind === 'preselection' ? 'select' : 'edit'}/${item.publicId}`;
  }

  async function copyCollaboration(item) {
    try { await navigator.clipboard.writeText(collaborationUrl(item)); toast.success('Link copied.'); }
    catch { toast.error('Copy the link from your browser address bar.'); }
  }

  async function copyAccessSecret() {
    const value = compose === 'preselection' ? draft.pin : draft.password;
    try { await navigator.clipboard.writeText(value); toast.success(compose === 'preselection' ? 'PIN copied.' : 'Password copied.'); }
    catch { toast.error('Select and copy the access detail from the field.'); }
  }

  async function revokeCollaboration(item) {
    if (!window.confirm(`Close the ${item.kind === 'preselection' ? 'client selection' : 'editor'} link for “${item.title}”?`)) return;
    try {
      const { data } = await api.delete(`/v1/storage/collaborations/${item._id}`);
      setCollaborations(current => current.map(row => row._id === item._id ? data.data : row));
      toast.success('Sharing link closed.');
    } catch (error) { toast.error(apiMessage(error, 'We could not close that link.')); }
  }

  async function reopenCollaboration(item) {
    try {
      const { data } = await api.patch(`/v1/storage/collaborations/${item._id}/reopen`);
      setCollaborations(current => current.map(row => row._id === item._id ? { ...row, ...data.data, selectedFilenames: [] } : row));
      toast.success('The client can choose again from the same link.');
    } catch (error) { toast.error(apiMessage(error, 'We could not reopen that selection.')); }
  }

  const folders = useMemo(() => ['All photographs', ...new Set([...serverFolders, ...assets.map(asset => asset.folder)].filter(name => name && name !== 'All photographs'))], [assets, serverFolders]);
  const visible = useMemo(() => assets.filter(asset => {
    const inFolder = folder === 'All photographs' || asset.folder === folder;
    const words = `${asset.originalFilename || ''} ${(asset.tags || []).join(' ')}`.toLowerCase();
    return inFolder && words.includes(search.trim().toLowerCase());
  }), [assets, folder, search]);

  async function chooseFiles(event) {
    const incoming = [...(event.target.files || [])];
    event.target.value = '';
    if (!incoming.length) return;
    const invalid = incoming.find(file => (!ALLOWED.has(file.type) && !isRawPhoto(file)) || file.size > MAX_FILE_BYTES);
    if (invalid) return toast.error('Choose a JPEG, PNG, WebP, or supported camera RAW file that is 100 MB or smaller.');
    if (incoming.reduce((total, file) => total + file.size, usage.usedBytes) > usage.limitBytes) return toast.error('These files would take your library above 50 GB.');
    try {
      setUploading(true); setProgress(0);
      const saved = await uploadLibraryPhotos(incoming, { folder: uploadFolder.trim() || 'All photographs', onProgress: (value, label) => { setProgress(value); setProgressLabel(label || ''); } });
      setAssets(current => [...saved, ...current]);
      setUsage(current => ({ ...current, usedBytes: current.usedBytes + saved.reduce((total, item) => total + item.bytes, 0) }));
      toast.success(`${saved.length} photograph${saved.length === 1 ? '' : 's'} added to your library.`);
    } catch (error) {
      if (error.completed?.length) {
        setAssets(current => [...error.completed, ...current]);
        setUsage(current => ({ ...current, usedBytes: current.usedBytes + error.completed.reduce((total, item) => total + item.bytes, 0) }));
        toast.warning(`${error.completed.length} photograph${error.completed.length === 1 ? '' : 's'} saved. The remaining uploads stopped: ${apiMessage(error, error.message || 'upload failed')}`);
      } else toast.error(apiMessage(error, error.message || 'The upload did not finish.'));
    }
    finally { setUploading(false); setProgressLabel(''); }
  }

  async function download(asset) {
    try {
      const { data } = await api.get(`/v1/storage/${asset._id}/download`);
      window.location.assign(data.data.url);
    } catch (error) { toast.error(apiMessage(error, 'We could not prepare that download.')); }
  }

  async function remove(asset) {
    if (!window.confirm(`Remove ${asset.originalFilename || 'this photograph'} from your Veylo library?`)) return;
    try {
      await api.delete(`/v1/storage/${asset._id}`);
      setAssets(current => current.filter(item => item._id !== asset._id));
      setUsage(current => ({ ...current, usedBytes: Math.max(0, current.usedBytes - asset.bytes) }));
      setActive(null);
      toast.success('Photograph removed.');
    } catch (error) { toast.error(apiMessage(error, 'We could not remove that photograph.')); }
  }

  function openAsset(asset) { setActive(asset); setActiveFolder(asset.folder || 'All photographs'); setActiveTags((asset.tags || []).join(', ')); setActiveCaption(asset.caption || ''); }

  async function saveAssetDetails() {
    try {
      const tags = activeTags.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 12);
      const { data } = await api.patch(`/v1/storage/${active._id}`, { folder: activeFolder.trim() || 'All photographs', tags, caption: activeCaption.trim() });
      setAssets(current => current.map(item => item._id === active._id ? data.data : item)); setActive(data.data); toast.success('Photograph details saved.');
    } catch (error) { toast.error(apiMessage(error, 'We could not save those details.')); }
  }

  const percent = Math.min(100, (usage.usedBytes / usage.limitBytes) * 100 || 0);
  return <div className="v-library-page">
    <div className="v-library-glow" aria-hidden="true" />
    <div className="v-library-wrap">
      <motion.header className="v-library-head" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div><p>VEYLO PRO · PERSONAL STORAGE</p><h1>Your photographs,<br /><em>ready when you need them.</em></h1><span>Keep client shoots in one place. Reuse photographs in a delivery, ask clients to choose their edits, or send camera originals to your editor.</span></div>
        <aside><HardDrive size={20} /><div><strong>{bytes(usage.usedBytes)} used</strong><span>of 50 GB</span></div><i><b style={{ transform: `scaleX(${percent / 100})` }} /></i></aside>
      </motion.header>

      {access === 'read-only' && <div className="v-library-notice"><HardDrive size={18} /><p><strong>Your library is being kept for 30 days.</strong><span>You can download or remove photographs now. Renew Pro to upload and organise them again.</span></p></div>}
      {access === 'unavailable' && !loading && <section className="v-library-locked"><HardDrive size={28} /><p>PERSONAL IMAGE STORAGE</p><h2>50 GB for the work<br />you want close by.</h2><span>Veylo Pro includes the Image Library for camera originals, previews, and returned edits. Send clients a private link to choose photos, or give your editor a password-protected link to return finished edits. Published client delivery hosting stays separate and does not use this 50 GB.</span><a className="v-button" href="/billing">Pro · <ProPrice /> / month</a></section>}

      {access !== 'unavailable' && <>
        <nav className="v-library-panels" aria-label="Image library sections">
          <button type="button" className={panel === 'photos' ? 'is-active' : ''} onClick={() => setPanel('photos')}><Image size={16} />Photographs</button>
          <button type="button" className={panel === 'sharing' ? 'is-active' : ''} onClick={() => setPanel('sharing')}><Clipboard size={16} />Client and editor links<span>{collaborations.length}</span></button>
        </nav>
        {panel === 'photos' ? <>
        <section className="v-library-tools">
          <label className="v-library-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search filenames or tags" aria-label="Search image library" /></label>
          {access === 'read-write' && <div className="v-library-upload-controls"><input value={uploadFolder} onChange={event => setUploadFolder(event.target.value)} maxLength={100} aria-label="Folder for new uploads" placeholder="Folder name" /><button className="v-button" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}><Upload size={16} />{uploading ? progressLabel.startsWith('Preparing') ? 'Preparing photo…' : `${progress}% uploaded` : 'Add photographs'}</button><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp,.arw,.cr2,.cr3,.dng,.nef,.nrw,.orf,.rw2,.raf,.pef,.srw,.3fr,.iiq,.mos,.mef,.mrw,.rwl,.x3f" multiple onChange={chooseFiles} /></div>}
          {access === 'read-write' && <p className="v-library-upload-note">JPEG, PNG, WebP, and supported camera RAW files up to 100 MB each. RAW originals stay unchanged; their paired JPEG previews also use library storage.</p>}
        </section>
        <nav className="v-library-folders" aria-label="Library folders">{folders.map(name => <button type="button" className={folder === name ? 'is-active' : ''} onClick={() => setFolder(name)} key={name}><FolderOpen size={14} />{name}</button>)}</nav>
        {loading && page === 1 ? <div className="v-library-state"><span className="v-library-loader" /><strong>Opening your library…</strong></div> : visible.length === 0 ? <div className="v-library-state"><Image size={28} /><strong>{search || folder !== 'All photographs' ? 'No photographs match that view.' : 'Your library is ready for its first photograph.'}</strong><span>{access === 'read-write' ? 'Add client shoot photographs or camera originals you want to keep close.' : 'There are no retained photographs here.'}</span></div> : <><motion.section className="v-library-grid" initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: reduced ? 0 : .035 } } }}>{visible.map(asset => <motion.button type="button" key={asset._id} className="v-library-card" onClick={() => openAsset(asset)} variants={{ hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0 } }}><img src={asset.thumbnailUrl || asset.url} alt={asset.originalFilename || 'Stored photograph'} loading="lazy" decoding="async" /><i /><span>{asset.folder}</span><small>{bytes(asset.bytes)}</small></motion.button>)}</motion.section>{hasMore && folder === 'All photographs' && !search && <button type="button" className="v-library-more" onClick={() => load(page + 1)} disabled={loading}>{loading ? 'Loading…' : 'Load more photographs'}</button>}</>}
        </> : <section className="v-library-sharing">
          <header><div><p>PRIVATE LINKS</p><h2>Work with clients and editors.</h2><span>Links use the storage in this library. They close when they expire, are revoked, or your Pro access ends.</span></div>{access === 'read-write' && <div className="v-library-share-actions"><button type="button" onClick={() => openComposer('preselection')}><Check size={16} />Client preselection</button><button type="button" onClick={() => openComposer('editor-handoff')}><LockKeyhole size={16} />Editor handoff</button></div>}</header>
          {collaborations.length === 0 ? <div className="v-library-state"><Clipboard size={26} /><strong>No sharing links yet.</strong><span>Create a selection link for a client or a password-protected handoff for your editor.</span></div> : <div className="v-library-share-list">{collaborations.map(item => {
            const expired = new Date(item.expiresAt) <= new Date();
            const closed = item.status === 'revoked' || expired;
            const isSelection = item.kind === 'preselection';
            return <article className="v-library-share-card" key={item._id}>
              <div className="v-library-share-card-main"><p>{isSelection ? 'CLIENT PRESELECTION' : 'EDITOR HANDOFF'}<span className={closed ? 'is-closed' : item.status === 'submitted' ? 'is-submitted' : 'is-open'}>{item.status === 'revoked' ? 'Closed' : expired ? 'Expired' : item.status === 'submitted' ? 'Selection sent' : 'Open'}</span></p><h3>{item.title}</h3><span>{item.clientName || 'No client name'} · {item.assetIds?.length || 0} photographs · expires {new Date(item.expiresAt).toLocaleDateString()}</span></div>
              {isSelection && item.status === 'submitted' && <div className="v-library-share-result"><strong>{item.selectedAssetIds?.length || 0} selected</strong><span>{(item.selectedFilenames || []).join(', ')}</span></div>}
              {!isSelection && item.returned?.length > 0 && <div className="v-library-share-result"><strong>{item.returned.length} edited {item.returned.length === 1 ? 'photo' : 'photos'} returned</strong><span>{item.returned.map(file => `${file.sourceFilename}: ${file.filename}`).join(' · ')}</span></div>}
              <div className="v-library-share-card-actions">{!closed && <button type="button" onClick={() => copyCollaboration(item)}><Clipboard size={15} />Copy link</button>}{isSelection && item.status === 'submitted' && !closed && access === 'read-write' && <button type="button" onClick={() => reopenCollaboration(item)}><RotateCcw size={15} />Ask them to choose again</button>}{!closed && <button type="button" className="is-close" onClick={() => revokeCollaboration(item)}><X size={15} />Close link</button>}</div>
            </article>;
          })}</div>}
          {access === 'read-only' && <p className="v-library-sharing-note">Your library is read-only until Pro is active again. Sharing links are paused; renew Pro to create or reopen them.</p>}
        </section>}
      </>}
    </div>

    <AnimatePresence>{active && <motion.div className="v-library-lightbox" role="presentation" onMouseDown={event => event.target === event.currentTarget && setActive(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section role="dialog" aria-modal="true" aria-label={active.originalFilename || 'Stored photograph'} initial={reduced ? false : { opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}><button className="v-library-close" type="button" aria-label="Close photograph" onClick={() => setActive(null)}><X size={18} /></button><div className="v-library-preview"><img src={active.url} alt={active.originalFilename || 'Stored photograph'} /></div><aside><p>{active.folder}</p><h2>{active.originalFilename || 'Stored photograph'}</h2><span>{active.width} × {active.height} · {bytes(active.bytes)}</span>{active.rawPublicId && <small className="v-library-raw-note">Camera original ({active.rawFormat?.toUpperCase()}) is stored with a full-size JPEG preview. Editor downloads include the camera original.</small>}{active.caption && <blockquote className="v-library-caption">{active.caption}</blockquote>}{access === 'read-write' && <div className="v-library-details"><label><FolderOpen size={14} /><input value={activeFolder} onChange={event => setActiveFolder(event.target.value)} maxLength={100} placeholder="Folder for organising this photograph" /></label><label><Tag size={14} /><input value={activeTags} onChange={event => setActiveTags(event.target.value)} maxLength={500} placeholder="Tags for search and delivery context" /></label><label><MessageSquareText size={14} /><textarea value={activeCaption} onChange={event => setActiveCaption(event.target.value)} maxLength={180} rows={3} placeholder="Caption note for future deliveries" /></label><small className="v-library-details-help">Saved tags and caption notes are carried into the Creative Director when you reuse this photograph. The final client caption is still checked in delivery review.</small><button type="button" onClick={saveAssetDetails}>Save folder, tags, and caption note</button></div>}<div><button type="button" onClick={() => download(active)}><Download size={16} />Download original</button><button type="button" onClick={() => remove(active)}><Trash2 size={16} />Remove</button></div></aside></motion.section></motion.div>}</AnimatePresence>

    <AnimatePresence>{compose && <motion.div className="v-library-compose-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && closeComposer()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="v-library-compose" role="dialog" aria-modal="true" aria-labelledby="v-library-compose-title" initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
        <button className="v-library-close" type="button" aria-label="Close sharing setup" onClick={closeComposer}><X size={18} /></button>
        {createdCollaboration ? <div className="v-library-created">
          <ShieldCheck size={25} /><p>LINK READY</p><h2 id="v-library-compose-title">{createdCollaboration.title}</h2><span>Send this private link to {createdCollaboration.clientName || (compose === 'preselection' ? 'your client' : 'your editor')}.</span>
          <label>Private link<input readOnly value={collaborationUrl(createdCollaboration)} onFocus={event => event.target.select()} /></label>
          <button type="button" className="v-button" onClick={() => copyCollaboration(createdCollaboration)}><Clipboard size={16} />Copy link</button>
          {compose === 'preselection' && draft.pin && <><label>Six-digit PIN<input readOnly value={draft.pin} onFocus={event => event.target.select()} /></label><button type="button" className="v-library-secret-copy" onClick={copyAccessSecret}>Copy PIN</button><small>Send the PIN separately from the link.</small></>}
          {compose === 'editor-handoff' && <><label>Editor password<input readOnly value={draft.password} onFocus={event => event.target.select()} /></label><button type="button" className="v-library-secret-copy" onClick={copyAccessSecret}>Copy password</button><small>Share the password separately from the link. The editor can download originals and return edits through this page.</small></>}
        </div> : <form onSubmit={createCollaboration}>
          <div className="v-library-compose-heading"><p>{compose === 'preselection' ? 'CLIENT PRESELECTION' : 'EDITOR HANDOFF'}</p><h2 id="v-library-compose-title">{compose === 'preselection' ? 'Let your client choose.' : 'Send photographs to your editor.'}</h2><span>{compose === 'preselection' ? 'They can review marked previews and send one selection. The page has no download controls.' : 'Your editor can download the camera originals, then upload the finished edits to this link.'}</span></div>
          <div className="v-library-compose-fields"><label>Link name<input required maxLength={100} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="For example, Ada’s introduction shoot" /></label><label>Client or editor name<input maxLength={100} value={draft.clientName} onChange={event => setDraft(current => ({ ...current, clientName: event.target.value }))} placeholder={compose === 'preselection' ? 'Client name' : 'Editor name'} /></label><label className="is-wide">Note for them<textarea rows={2} maxLength={500} value={draft.note} onChange={event => setDraft(current => ({ ...current, note: event.target.value }))} placeholder="A short note about what you need" /></label>
            {compose === 'preselection' ? <label>Optional six-digit PIN<input inputMode="numeric" autoComplete="off" maxLength={6} value={draft.pin} onChange={event => setDraft(current => ({ ...current, pin: event.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="Leave blank for no PIN" /></label> : <label>Link password<input required type="password" autoComplete="new-password" minLength={8} maxLength={72} value={draft.password} onChange={event => setDraft(current => ({ ...current, password: event.target.value }))} placeholder="At least 8 characters" /></label>}
            <label>Link expires<select value={draft.expiresInDays} onChange={event => setDraft(current => ({ ...current, expiresInDays: event.target.value }))}><option value={7}>After 7 days</option><option value={14}>After 14 days</option><option value={30}>After 30 days</option><option value={60}>After 60 days</option><option value={90}>After 90 days</option></select></label>
          </div>
          <div className="v-library-picker-heading"><div><strong>Choose photographs</strong><span>{selectedIds.length} selected</span></div><small>Up to 500 photographs per link</small></div>
          {pickerLoading && pickerAssets.length === 0 ? <div className="v-library-picker-state">Loading your library…</div> : pickerAssets.length === 0 ? <div className="v-library-picker-state">Add photographs to your library before creating a link.</div> : <div className="v-library-picker-grid">{pickerAssets.map(asset => {
            const chosen = selectedIds.includes(asset._id);
            const disabled = !chosen && selectedIds.length >= 500;
            return <button type="button" key={asset._id} aria-pressed={chosen} disabled={disabled} className={chosen ? 'is-selected' : ''} onClick={() => setSelectedIds(current => chosen ? current.filter(id => id !== asset._id) : [...current, asset._id])}><img src={asset.thumbnailUrl || asset.url} alt="" loading="lazy" /><span>{chosen && <Check size={14} />}{asset.originalFilename || 'Photograph'}</span></button>;
          })}</div>}
          {pickerHasMore && <button type="button" className="v-library-picker-more" disabled={pickerLoading} onClick={() => loadPicker(pickerPage + 1)}>{pickerLoading ? 'Loading photographs…' : 'Load more photographs'}</button>}
          <footer><span>Uploads and returned edits count toward your 50 GB library.</span><button type="submit" className="v-button" disabled={!selectedIds.length || pickerLoading}>{compose === 'preselection' ? 'Create client link' : 'Create editor link'}<Check size={16} /></button></footer>
        </form>}
      </motion.section>
    </motion.div>}</AnimatePresence>
  </div>;
}
