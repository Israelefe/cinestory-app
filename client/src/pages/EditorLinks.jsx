import React, { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clapperboard, Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import LibraryShell from '../components/library/LibraryShell.jsx';
import WorkflowList from '../components/library/WorkflowList.jsx';
import LinkActions from '../components/library/LinkActions.jsx';
import PhotoViewer from '../components/library/PhotoViewer.jsx';
import { useOwnerLink } from '../components/library/useOwnerLink.js';
import { linkStatus } from '../components/library/libraryHelpers.js';
import EditorLinkSetup from './EditorLinkSetup.jsx';

function ReturnedEdit({ source, versions, onReview, busy, onView }) {
  const [version, setVersion] = useState(''), [note, setNote] = useState('');
  const current = versions.find(item => String(item.assetId) === version) || versions.at(-1);
  return <article className="lib-edit-review"><header><h3>{source.originalFilename}</h3><span className="lib-status">{current?.reviewStatus === 'accepted' ? 'Accepted' : current?.reviewStatus === 'changes-requested' ? 'Changes requested' : current ? 'Awaiting review' : 'Awaiting edit'}</span></header><div className="lib-compare"><button type="button" onClick={() => onView([source, ...(current?.photo ? [current.photo] : [])], 0)}><img src={source.thumbnailUrl || source.url} alt={'Original ' + source.originalFilename} loading="lazy" /><span>Original</span></button>{current?.photo ? <button type="button" onClick={() => onView([source, current.photo], 1)}><img src={current.photo.thumbnailUrl || current.photo.url} alt={'Returned edit ' + current.photo.originalFilename} loading="lazy" /><span>Returned edit</span></button> : <div className="lib-awaiting-edit">No edit returned yet</div>}</div>{current && <div className="lib-edit-review-controls"><label>Returned version<select aria-label={'Version for ' + source.originalFilename} value={current.assetId} onChange={event => { setVersion(event.target.value); setNote(''); }}>{versions.map((item, index) => <option key={item.assetId} value={item.assetId}>Version {index + 1} · {new Date(item.uploadedAt).toLocaleDateString()}</option>)}</select></label>{current.reviewNote && <blockquote>{current.reviewNote}</blockquote>}<label>Review note<textarea rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Describe any correction your editor should make." /></label><div><button type="button" className="lib-button lib-primary" disabled={busy || !current.photo} onClick={() => onReview(current.assetId, 'accepted', note)}><Check size={16} />Accept edit</button><button type="button" className="lib-button" disabled={busy || !note.trim()} onClick={() => onReview(current.assetId, 'changes-requested', note)}>Request changes</button></div></div>}</article>;
}

function EditorReview() {
  const { id } = useParams(), navigate = useNavigate();
  const { item, setItem, loading, error } = useOwnerLink(id);
  const [busy, setBusy] = useState(false), [viewer, setViewer] = useState(null);
  async function review(assetId, status, note) {
    setBusy(true); try { const { data } = await api.patch('/v1/storage/collaborations/' + id + '/returns/' + assetId, { status, note }); setItem(data.data); toast.success(status === 'accepted' ? 'Edit accepted.' : 'Correction saved for your editor.'); } catch (failure) { toast.error(apiMessage(failure, 'This review could not be saved.')); } finally { setBusy(false); }
  }
  return <LibraryShell title={item?.title || 'Editor job'} description="Review the returned photographs before delivery." action={<Link className="lib-text-link" to="/editor-links"><ArrowLeft size={16} />All Editor Links</Link>}>
    {error && <div className="lib-error" role="alert">{error}</div>}{loading && !item ? <div className="lib-empty" role="status">Opening this editor job…</div> : item && item.kind !== 'editor-handoff' ? <div className="lib-error">This is a Photo Pre-selection. <Link to={'/pre-selection/' + id}>Open its results</Link></div> : item && <><div className="lib-detail-heading"><div><span className="lib-status">{linkStatus(item)}</span><h2>{item.clientName || 'Editor job'}</h2><p>{item.assets.length} source photographs · {item.returned.length} returned versions</p>{item.dueAt && <small>Edits due {new Date(item.dueAt).toLocaleDateString()}</small>}</div><div className="lib-detail-stats"><strong>{item.approvedAssetIds.length}</strong><span>approved photographs</span></div></div><LinkActions item={item} onChange={setItem} />{item.note && <blockquote className="lib-brief"><strong>Editing brief</strong>{item.note}</blockquote>}{item.approvedAssetIds.length > 0 && <div className="lib-approved-delivery"><div><h3>Approved edits are ready for delivery.</h3><p>Only your accepted versions will be added. You will review the delivery before publishing.</p></div><button type="button" className="lib-button lib-primary" onClick={() => navigate('/create', { state: { libraryAssetIds: item.approvedAssetIds, libraryTitle: item.title, libraryClientName: '' } })}><Clapperboard size={16} />Create a delivery</button></div>}<div className="lib-edit-review-grid">{item.assets.map(source => <ReturnedEdit key={source.id} source={source} versions={item.returned.filter(entry => String(entry.sourceAssetId) === source.id)} onReview={review} busy={busy} onView={(photos, index) => setViewer({ photos, index })} />)}</div></>}{viewer && <PhotoViewer photos={viewer.photos} initialIndex={viewer.index} onClose={() => setViewer(null)} title="Compare original and returned edit" />}
  </LibraryShell>;
}

export default function EditorLinks({ user }) {
  return <Routes><Route index element={<LibraryShell title="Editor Links" description="Send originals, receive edits, and review the finished work." action={<Link className="lib-button lib-primary" to="/editor-links/new"><Plus size={17} />New Editor Link</Link>}><WorkflowList kind="editor-handoff" /></LibraryShell>} /><Route path="new" element={<EditorLinkSetup user={user} />} /><Route path=":id/setup" element={<EditorLinkSetup user={user} />} /><Route path=":id" element={<EditorReview />} /></Routes>;
}
