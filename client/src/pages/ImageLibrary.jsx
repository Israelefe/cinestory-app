import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Download, FolderOpen, HardDrive, Image, MessageSquareText, Search, Tag, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { uploadLibraryPhotos } from '../utils/storageUpload.js';
import './ImageLibrary.css';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

function bytes(value) {
  if (!value) return '0 GB';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export default function ImageLibrary() {
  const reduced = useReducedMotion();
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
  const [active, setActive] = useState(null);
  const [activeFolder, setActiveFolder] = useState('');
  const [activeTags, setActiveTags] = useState('');
  const [activeCaption, setActiveCaption] = useState('');
  const [serverFolders, setServerFolders] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

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
    const invalid = incoming.find(file => !ALLOWED.has(file.type) || file.size > MAX_FILE_BYTES);
    if (invalid) return toast.error(`${invalid.name} must be a JPEG, PNG, or WebP no larger than 50 MB.`);
    if (incoming.reduce((total, file) => total + file.size, usage.usedBytes) > usage.limitBytes) return toast.error('These files would take your library above 50 GB.');
    try {
      setUploading(true); setProgress(0);
      const saved = await uploadLibraryPhotos(incoming, { folder: uploadFolder.trim() || 'All photographs', onProgress: setProgress });
      setAssets(current => [...saved, ...current]);
      setUsage(current => ({ ...current, usedBytes: current.usedBytes + saved.reduce((total, item) => total + item.bytes, 0) }));
      toast.success(`${saved.length} photograph${saved.length === 1 ? '' : 's'} added to your library.`);
    } catch (error) { toast.error(apiMessage(error, error.message || 'The upload did not finish.')); }
    finally { setUploading(false); }
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
        <div><p>VEYLO PRO · PERSONAL STORAGE</p><h1>Your finished work,<br /><em>ready when you need it.</em></h1><span>Keep selected photographs here, then reuse them in a delivery or your portfolio without uploading them again.</span></div>
        <aside><HardDrive size={20} /><div><strong>{bytes(usage.usedBytes)} used</strong><span>of 50 GB</span></div><i><b style={{ transform: `scaleX(${percent / 100})` }} /></i></aside>
      </motion.header>

      {access === 'read-only' && <div className="v-library-notice"><HardDrive size={18} /><p><strong>Your library is being kept for 30 days.</strong><span>You can download or remove photographs now. Renew Pro to upload and organise them again.</span></p></div>}
      {access === 'unavailable' && !loading && <section className="v-library-locked"><HardDrive size={28} /><p>PERSONAL IMAGE STORAGE</p><h2>50 GB for the work<br />you want close by.</h2><span>The personal image library is included with Veylo Pro. Client delivery hosting stays separate and does not use this space.</span><a className="v-button" href="/billing">See Veylo Pro</a></section>}

      {access !== 'unavailable' && <>
        <section className="v-library-tools">
          <label className="v-library-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search filenames or tags" aria-label="Search image library" /></label>
          {access === 'read-write' && <div className="v-library-upload-controls"><input value={uploadFolder} onChange={event => setUploadFolder(event.target.value)} maxLength={100} aria-label="Folder for new uploads" placeholder="Folder name" /><button className="v-button" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}><Upload size={16} />{uploading ? `${progress}% uploaded` : 'Add photographs'}</button><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={chooseFiles} /></div>}
        </section>
        <nav className="v-library-folders" aria-label="Library folders">{folders.map(name => <button type="button" className={folder === name ? 'is-active' : ''} onClick={() => setFolder(name)} key={name}><FolderOpen size={14} />{name}</button>)}</nav>
        {loading && page === 1 ? <div className="v-library-state"><span className="v-library-loader" /><strong>Opening your library…</strong></div> : visible.length === 0 ? <div className="v-library-state"><Image size={28} /><strong>{search || folder !== 'All photographs' ? 'No photographs match that view.' : 'Your library is ready for its first photograph.'}</strong><span>{access === 'read-write' ? 'Add finished work you expect to use again.' : 'There are no retained photographs here.'}</span></div> : <><motion.section className="v-library-grid" initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: reduced ? 0 : .035 } } }}>{visible.map(asset => <motion.button type="button" key={asset._id} className="v-library-card" onClick={() => openAsset(asset)} variants={{ hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0 } }}><img src={asset.thumbnailUrl || asset.url} alt={asset.originalFilename || 'Stored photograph'} loading="lazy" decoding="async" /><i /><span>{asset.folder}</span><small>{bytes(asset.bytes)}</small></motion.button>)}</motion.section>{hasMore && folder === 'All photographs' && !search && <button type="button" className="v-library-more" onClick={() => load(page + 1)} disabled={loading}>{loading ? 'Loading…' : 'Load more photographs'}</button>}</>}
      </>}
    </div>

    <AnimatePresence>{active && <motion.div className="v-library-lightbox" role="presentation" onMouseDown={event => event.target === event.currentTarget && setActive(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section role="dialog" aria-modal="true" aria-label={active.originalFilename || 'Stored photograph'} initial={reduced ? false : { opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}><button className="v-library-close" type="button" aria-label="Close photograph" onClick={() => setActive(null)}><X size={18} /></button><div className="v-library-preview"><img src={active.url} alt={active.originalFilename || 'Stored photograph'} /></div><aside><p>{active.folder}</p><h2>{active.originalFilename || 'Stored photograph'}</h2><span>{active.width} × {active.height} · {bytes(active.bytes)}</span>{active.caption && <blockquote className="v-library-caption">{active.caption}</blockquote>}{access === 'read-write' && <div className="v-library-details"><label><FolderOpen size={14} /><input value={activeFolder} onChange={event => setActiveFolder(event.target.value)} maxLength={100} placeholder="Folder" /></label><label><Tag size={14} /><input value={activeTags} onChange={event => setActiveTags(event.target.value)} maxLength={500} placeholder="Tags, separated by commas" /></label><label><MessageSquareText size={14} /><textarea value={activeCaption} onChange={event => setActiveCaption(event.target.value)} maxLength={180} rows={3} placeholder="Caption used in recipient galleries" /></label><button type="button" onClick={saveAssetDetails}>Save folder, tags, and caption</button></div>}<div><button type="button" onClick={() => download(active)}><Download size={16} />Download original</button><button type="button" onClick={() => remove(active)}><Trash2 size={16} />Remove</button></div></aside></motion.section></motion.div>}</AnimatePresence>
  </div>;
}
