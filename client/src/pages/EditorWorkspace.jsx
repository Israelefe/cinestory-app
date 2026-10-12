import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Download, FileImage, Send, Upload, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import PrivateLinkAccess from '../components/library/PrivateLinkAccess.jsx';
import PhotoViewer from '../components/library/PhotoViewer.jsx';
import UploadTray from '../components/library/UploadTray.jsx';
import { usePrivateLibraryLink } from '../components/library/usePrivateLibraryLink.js';
import { useDialogFocus } from '../components/useDialogFocus.js';
import { downloadUrl, formatBytes, publicMedia } from '../components/library/libraryHelpers.js';
import { libraryUploads } from '../utils/libraryUploadQueue.js';
import { matchEditorReturns } from '../utils/clientSelection.js';

function EditorJob({ publicId, access }) {
  const { content, token } = access;
  const [selected, setSelected] = useState([]), [mapping, setMapping] = useState([]), [viewer, setViewer] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const input = useRef(null), dialog = useRef(null);
  const scope = 'editor:' + publicId;
  useEffect(() => { libraryUploads.authorize(scope, token); }, [scope, token]);
  const uploads = useSyncExternalStore(libraryUploads.subscribe, libraryUploads.getSnapshot);
  const pending = uploads.entries.some(entry => entry.scope === scope && !['added', 'failed', 'cancelled'].includes(entry.state));
  useDialogFocus(mapping.length > 0, dialog, () => setMapping([]));
  useEffect(() => {
    const refresh = event => { if (event.detail.publicId === publicId) access.reload().catch(failure => { if ([401, 403, 410].includes(failure.response?.status)) access.relock(); }); };
    window.addEventListener('veylo:editor-photo-added', refresh); return () => window.removeEventListener('veylo:editor-photo-added', refresh);
  }, [publicId, token]);
  useEffect(() => { const focus = () => access.reload().catch(failure => { if ([401, 403, 410].includes(failure.response?.status)) access.relock(); }); const interval = setInterval(() => { if (document.visibilityState === 'visible') focus(); }, 30000); window.addEventListener('focus', focus); return () => { clearInterval(interval); window.removeEventListener('focus', focus); }; }, [publicId, token]);
  const returnedSources = new Set((content.returned || []).map(item => item.sourceAssetId));
  async function download(ids) {
    setBusy(true); setError('');
    try { const { data } = await api.post(access.endpoint + '/archive', { assetIds: ids }, { headers: { Authorization: 'Bearer ' + token } }); window.location.assign(downloadUrl(data.data.url)); }
    catch (failure) { setError(apiMessage(failure, 'These originals could not be prepared.')); } finally { setBusy(false); }
  }
  async function downloadOne(photo) {
    window.location.assign(downloadUrl(publicMedia(publicId, photo.id, token).replace('/media/', '/download/')));
  }
  function chooseReturns(files) { if (files?.length) { setMapping(matchEditorReturns(files, content.assets)); setError(''); } }
  function uploadMapped() {
    if (mapping.some(item => !item.sourceAssetId)) return;
    for (const item of mapping) libraryUploads.add([item.file], { scope, sourceAssetId: item.sourceAssetId, publicId, token });
    setMapping([]);
  }
  async function sendForReview() {
    if (!window.confirm('Send the returned edits for review? The photographer will see that this batch is ready.')) return;
    setBusy(true); setError('');
    try { const { data } = await api.post(access.endpoint + '/edits/submit', {}, { headers: { Authorization: 'Bearer ' + token } }); access.setContent(current => ({ ...current, editorState: data.data.editorState })); toast.success('Edits sent for review.'); }
    catch (failure) { setError(apiMessage(failure, 'These edits could not be sent for review.')); } finally { setBusy(false); }
  }
  return <main className="lib-public-page"><UploadTray scope={scope} /><div className="editor-workspace"><header className="editor-workspace-head"><div className="lib-public-brand"><img src="/veylo/veylo-mark.svg" alt="Veylo" width="26" height="26" /><span>{content.photographerName}</span></div><p className="lib-eyebrow">EDITOR LINK</p><h1>{content.title}</h1><p>{content.clientName ? 'Prepared for ' + content.clientName + '. ' : ''}Download the originals and return your edits here.</p><div className="lib-editor-job-facts"><span>{content.assets.length} source photographs</span><span>{returnedSources.size} with returned edits</span>{content.dueAt && <span>Due {new Date(content.dueAt).toLocaleDateString()}</span>}</div></header>{content.note && <blockquote className="lib-brief"><strong>Editing brief</strong>{content.note}</blockquote>}{error && <div className="lib-error" role="alert">{error}</div>}{content.editorState === 'ready-for-review' && <div className="lib-notice"><Check size={18} />Your returned edits have been sent for review.</div>}{content.editorState === 'complete' && <div className="lib-notice"><Check size={18} />The photographer has accepted the latest edits for this job.</div>}{content.editorState === 'changes-requested' && <div className="lib-notice">The photographer has requested corrections. See the notes on your returned photographs below.</div>}
    <section className="editor-source-section"><div className="lib-section-label"><h2>Source photographs</h2><button type="button" onClick={() => setSelected(selected.length ? [] : content.assets.map(photo => photo.id))}>{selected.length ? 'Clear selection' : 'Select all sources'}</button></div><div className="lib-bulk"><button type="button" disabled={busy} onClick={() => download(selected.length ? selected : content.assets.map(photo => photo.id))}><Download size={17} />{selected.length ? `Download ${selected.length} selected` : 'Download all originals'}</button><button type="button" onClick={() => input.current?.click()}><Upload size={17} />Upload returned edits</button><span>JPEG, PNG or WebP · Up to 100 MB each</span></div><input ref={input} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={event => { chooseReturns(event.target.files); event.target.value = ''; }} /><div className="lib-photo-grid editor-source-grid">{content.assets.map(photo => { const chosen = selected.includes(photo.id); return <article key={photo.id} className={'editor-source-card ' + (chosen ? 'is-selected' : '')}><div className="lib-photo"><button type="button" className="lib-photo-open" aria-label={'Open source ' + photo.originalFilename} onClick={() => setViewer({ ...photo, url: publicMedia(publicId, photo.id, token) })}><img src={publicMedia(publicId, photo.id, token, { size: 'thumb' })} alt={photo.originalFilename} loading="lazy" /></button><button type="button" className="lib-check" aria-label={'Select source ' + photo.originalFilename} aria-pressed={chosen} onClick={() => setSelected(current => chosen ? current.filter(id => id !== photo.id) : [...current, photo.id])}>{chosen && <Check size={16} />}</button></div><div><h3>{photo.originalFilename}</h3><p>{formatBytes(photo.sourceBytes || photo.bytes)} · {photo.rawOriginal ? 'Camera original' : photo.format?.toUpperCase()}</p><button type="button" className="lib-text-link" onClick={() => downloadOne(photo)}><Download size={14} />Download original</button>{returnedSources.has(photo.id) && <span className="lib-return-count"><Check size={13} />{content.returned.filter(item => item.sourceAssetId === photo.id).length} version(s) returned</span>}</div></article>; })}</div></section>
    <section className="editor-returns-section"><div className="lib-section-label"><h2>Returned edits</h2><span>{content.returned?.length || 0} versions</span></div>{content.returned?.length ? <><div className="lib-photo-grid editor-return-grid">{content.returned.map((item, index) => <article key={item.assetId} className="editor-return-card"><button type="button" className="lib-photo" onClick={() => setViewer({ originalFilename: item.filename, url: publicMedia(publicId, item.assetId, token, { returned: true }) })}><img src={publicMedia(publicId, item.assetId, token, { returned: true })} alt={item.filename} loading="lazy" /></button><div><strong>{item.filename}</strong><span>{item.reviewStatus === 'accepted' ? 'Accepted' : item.reviewStatus === 'changes-requested' ? 'Changes requested' : 'Awaiting review'}</span><small>Source: {content.assets.find(photo => photo.id === item.sourceAssetId)?.originalFilename || 'Original photograph'}</small>{item.uploadedAt && <small>Uploaded {new Date(item.uploadedAt).toLocaleString()}</small>}{item.reviewNote && <blockquote>{item.reviewNote}</blockquote>}</div></article>)}</div><div className="lib-editor-submit"><p>{returnedSources.size} of {content.assets.length} sources have returned edits. Each upload keeps its previous versions.</p><button type="button" className="lib-button lib-primary" disabled={busy || pending || content.editorState === 'ready-for-review' || content.editorState === 'complete'} onClick={sendForReview}><Send size={17} />{pending ? 'Wait for uploads to finish' : 'Send edits for review'}</button></div></> : <div className="lib-empty"><FileImage size={30} /><h2>Your returned edits will appear here.</h2><p>Upload a batch, match each file to its original, then send it for review.</p></div>}</section>
    {viewer && <PhotoViewer photos={[viewer]} onClose={() => setViewer(null)} />}{mapping.length > 0 && <div className="lib-backdrop"><section ref={dialog} className="lib-dialog lib-mapping-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-mapping-title"><header><div><p className="lib-eyebrow">RETURN EDITS</p><h2 id="editor-mapping-title">Match edits to their originals</h2></div><button type="button" aria-label="Close file matching" onClick={() => setMapping([])}><X size={20} /></button></header><p>Check every match before uploading. A new upload adds a version; it does not replace the original.</p><ul className="lib-file-mapping">{mapping.map(item => <li key={item.id}><FileImage size={19} /><div><strong>{item.file.name}</strong><span>{formatBytes(item.file.size)}</span></div><label>Source photograph<select aria-label={'Source for ' + item.file.name} value={item.sourceAssetId} onChange={event => setMapping(current => current.map(row => row.id === item.id ? { ...row, sourceAssetId: event.target.value } : row))}><option value="">Choose the original…</option>{content.assets.map(photo => <option key={photo.id} value={photo.id}>{photo.originalFilename}</option>)}</select></label><button type="button" aria-label={'Remove ' + item.file.name + ' from batch'} onClick={() => setMapping(current => current.filter(row => row.id !== item.id))}><X size={17} /></button></li>)}</ul><footer><span>{mapping.filter(item => item.sourceAssetId).length} of {mapping.length} matched</span><button type="button" className="lib-button lib-primary" disabled={mapping.some(item => !item.sourceAssetId)} onClick={uploadMapped}><Upload size={17} />Upload {mapping.length} edits</button></footer></section></div>}
    <footer className="sel-footer">Shared privately with Veylo</footer>
  </div></main>;
}

export default function EditorWorkspace() {
  const { publicId } = useParams(), access = usePrivateLibraryLink(publicId, 'editor-handoff');
  return access.content ? <EditorJob publicId={publicId} access={access} /> : <PrivateLinkAccess access={access} kind="editor-handoff" />;
}
