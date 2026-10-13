import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Download, FileImage, Send, Upload, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import PrivateLinkAccess from '../components/library/PrivateLinkAccess.jsx';
import PhotoViewer from '../components/library/PhotoViewer.jsx';
import EditorReturnMatching from '../components/library/EditorReturnMatching.jsx';
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
  useEffect(() => {
    const refresh = event => { if (event.detail.publicId === publicId) access.reload().catch(failure => { if ([401, 403, 410].includes(failure.response?.status)) access.relock(); }); };
    window.addEventListener('veylo:editor-photo-added', refresh); return () => window.removeEventListener('veylo:editor-photo-added', refresh);
  }, [publicId, token]);
  useEffect(() => { const focus = () => access.reload().catch(failure => { if ([401, 403, 410].includes(failure.response?.status)) access.relock(); }); const interval = setInterval(() => { if (document.visibilityState === 'visible') focus(); }, 30000); window.addEventListener('focus', focus); return () => { clearInterval(interval); window.removeEventListener('focus', focus); }; }, [publicId, token]);
  const returnedSources = new Set((content.returned || []).map(item => item.sourceAssetId));
  async function download(ids) {
    setBusy(true); setError('');
    try { const { data } = await api.post(access.endpoint + '/archive', { assetIds: ids }, { headers: { Authorization: 'Bearer ' + token } }); window.location.assign(downloadUrl(data.data.url)); }
    catch (failure) { const message = apiMessage(failure, 'These originals could not be prepared.'); setError(message); toast.error(message); } finally { setBusy(false); }
  }
  async function downloadOne(photo) {
    window.location.assign(downloadUrl(publicMedia(publicId, photo.id, token).replace('/media/', '/download/')));
  }
  function chooseReturns(files) {
    if (!files?.length) return;
    const seen = new Set();
    setMapping(matchEditorReturns(files, content.assets).map(item => { const alternative = item.sourceAssetId && seen.has(item.sourceAssetId); seen.add(item.sourceAssetId); return { ...item, variationId: alternative ? crypto.randomUUID() : 'main', variationName: alternative ? 'Alternative edit' : 'Main edit' }; })); setError('');
  }
  function uploadMapped() {
    if (mapping.some(item => !item.sourceAssetId || !item.variationName.trim())) { toast.error('Match every edit and name each alternative first.'); return; }
    for (const item of mapping) libraryUploads.add([item.file], { scope, sourceAssetId: item.sourceAssetId, variationId: item.variationId, variationName: item.variationName.trim(), publicId, token });
    setMapping([]);
  }
  async function sendForReview() {
    if (!window.confirm('Send the returned edits for review? The photographer will see that this batch is ready.')) return;
    setBusy(true); setError('');
    try { const { data } = await api.post(access.endpoint + '/edits/submit', {}, { headers: { Authorization: 'Bearer ' + token } }); access.setContent(current => ({ ...current, editorState: data.data.editorState })); toast.success('Edits sent for review.'); if (data.data.notification?.status === 'queued') toast.info('The notification email is queued for another attempt.'); }
    catch (failure) { const message = apiMessage(failure, 'These edits could not be sent for review.'); setError(message); toast.error(message); } finally { setBusy(false); }
  }
  return <main className="lib-public-page"><UploadTray scope={scope} /><div className="editor-workspace"><header className="editor-workspace-head"><div className="lib-public-brand"><img src="/veylo/veylo-mark.svg" alt="Veylo" width="26" height="26" /><span>{content.photographerName}</span></div><p className="lib-eyebrow">EDITOR LINK</p><h1>{content.title}</h1><p>{content.clientName ? 'Prepared for ' + content.clientName + '. ' : ''}Download the originals and return your edits here.</p><div className="lib-editor-job-facts"><span>{content.assets.length} source photographs</span><span>{returnedSources.size} with returned edits</span>{content.dueAt && <span>Due {new Date(content.dueAt).toLocaleDateString()}</span>}</div></header>{content.note && <blockquote className="lib-brief"><strong>Editing brief</strong>{content.note}</blockquote>}{error && <div className="lib-error" role="alert">{error}</div>}{content.editorState === 'ready-for-review' && <div className="lib-notice"><Check size={18} />Your returned edits have been sent for review.</div>}{content.editorState === 'complete' && <div className="lib-notice"><Check size={18} />The photographer has accepted edits for every source photograph. Accepted edits are marked below.</div>}{content.editorState === 'changes-requested' && <div className="lib-notice">The photographer has requested corrections. See the notes on your returned photographs below.</div>}
    <section className="editor-source-section"><div className="lib-section-label"><h2>Source photographs</h2><button type="button" onClick={() => setSelected(selected.length ? [] : content.assets.map(photo => photo.id))}>{selected.length ? 'Clear selection' : 'Select all sources'}</button></div><div className="lib-bulk"><button type="button" disabled={busy} onClick={() => download(selected.length ? selected : content.assets.map(photo => photo.id))}><Download size={17} />{selected.length ? `Download ${selected.length} selected` : 'Download all originals'}</button><button type="button" onClick={() => input.current?.click()}><Upload size={17} />Upload returned edits</button><span>JPEG, PNG or WebP · Up to 100 MB each</span></div><input ref={input} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={event => { chooseReturns(event.target.files); event.target.value = ''; }} /><div className="lib-photo-grid editor-source-grid">{content.assets.map(photo => { const chosen = selected.includes(photo.id); return <article key={photo.id} className={'editor-source-card ' + (chosen ? 'is-selected' : '')}><div className="lib-photo"><button type="button" className="lib-photo-open" aria-label={'Open source ' + photo.originalFilename} onClick={() => setViewer({ ...photo, url: publicMedia(publicId, photo.id, token) })}><img src={publicMedia(publicId, photo.id, token, { size: 'thumb' })} alt={photo.originalFilename} loading="lazy" /></button><button type="button" className="lib-check" aria-label={'Select source ' + photo.originalFilename} aria-pressed={chosen} onClick={() => setSelected(current => chosen ? current.filter(id => id !== photo.id) : [...current, photo.id])}>{chosen && <Check size={16} />}</button></div><div><h3>{photo.originalFilename}</h3><p>{formatBytes(photo.sourceBytes || photo.bytes)} · {photo.rawOriginal ? 'Camera original' : photo.format?.toUpperCase()}</p><button type="button" className="lib-text-link" onClick={() => downloadOne(photo)}><Download size={14} />Download original</button>{returnedSources.has(photo.id) && <span className="lib-return-count"><Check size={13} />{content.returned.filter(item => item.sourceAssetId === photo.id).length} version(s) returned</span>}</div></article>; })}</div></section>
    <section className="editor-returns-section"><div className="lib-section-label"><h2>Returned edits</h2><span>{content.returned?.length || 0} versions</span></div>{content.returned?.length ? <><div className="lib-photo-grid editor-return-grid">{content.returned.map((item, index) => <article key={item.assetId} className="editor-return-card"><button type="button" className="lib-photo" onClick={() => setViewer({ originalFilename: item.filename, url: publicMedia(publicId, item.assetId, token, { returned: true }) })}><img src={publicMedia(publicId, item.assetId, token, { returned: true })} alt={item.filename} loading="lazy" /></button><div><strong>{item.variationName || 'Main edit'}</strong><small>{item.filename}</small><span>{item.reviewStatus === 'accepted' ? 'Accepted' : item.reviewStatus === 'changes-requested' ? 'Changes requested' : 'Awaiting review'}</span><small>Source: {content.assets.find(photo => photo.id === item.sourceAssetId)?.originalFilename || 'Original photograph'}</small>{item.uploadedAt && <small>Uploaded {new Date(item.uploadedAt).toLocaleString()}</small>}{item.reviewNote && <blockquote>{item.reviewNote}</blockquote>}</div></article>)}</div><div className="lib-editor-submit"><p>{returnedSources.size} of {content.assets.length} sources have returned edits. Partial batches are welcome. You can add alternate edits for the same original; the job is complete when every source has an accepted edit and no latest alternatives await review.</p><button type="button" className="lib-button lib-primary" disabled={busy || pending || content.editorState === 'ready-for-review' || content.editorState === 'complete'} onClick={sendForReview}><Send size={17} />{pending ? 'Wait for uploads to finish' : 'Send edits for review'}</button></div></> : <div className="lib-empty"><FileImage size={30} /><h2>Your returned edits will appear here.</h2><p>Upload a batch, match each file to its original, then send it for review.</p></div>}</section>
    {viewer && <PhotoViewer photos={[viewer]} onClose={() => setViewer(null)} />}{mapping.length > 0 && <EditorReturnMatching mapping={mapping} setMapping={setMapping} assets={content.assets} returned={content.returned || []} media={(id, size) => publicMedia(publicId, id, token, { size })} onUpload={uploadMapped} onClose={() => setMapping([])} />}
    <footer className="sel-footer">Shared privately with Veylo</footer>
  </div></main>;
}

export default function EditorWorkspace() {
  const { publicId } = useParams(), access = usePrivateLibraryLink(publicId, 'editor-handoff');
  return access.content ? <EditorJob publicId={publicId} access={access} /> : <PrivateLinkAccess access={access} kind="editor-handoff" />;
}
