import React, { useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Plus, RotateCcw, Send, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import LibraryShell from '../components/library/LibraryShell.jsx';
import LibraryWorkflowAccess from '../components/library/LibraryWorkflowAccess.jsx';
import WorkflowList from '../components/library/WorkflowList.jsx';
import LinkActions from '../components/library/LinkActions.jsx';
import PhotoViewer from '../components/library/PhotoViewer.jsx';
import { useOwnerLink } from '../components/library/useOwnerLink.js';
import { useDialogFocus } from '../components/useDialogFocus.js';
import { downloadUrl, linkStatus, selectionInstruction } from '../components/library/libraryHelpers.js';
import SelectionSetup from './SelectionSetup.jsx';

function SelectionResults({ canCreate }) {
  const { id } = useParams(), navigate = useNavigate();
  const { item, setItem, loading, error, load } = useOwnerLink(id);
  const [tab, setTab] = useState('selected'), [viewer, setViewer] = useState(null), [reopen, setReopen] = useState(false), [startOver, setStartOver] = useState(false), [busy, setBusy] = useState(false);
  const dialog = useRef(null); useDialogFocus(reopen, dialog, () => setReopen(false));
  const reviewed = new Set(item?.selectionDraft?.reviewedAssetIds || []);
  const chosen = new Set(item?.status === 'submitted' ? item.selectedAssetIds : item?.selectionDraft?.selectedAssetIds || []);
  const photos = !item ? [] : tab === 'skipped' ? item.assets.filter(photo => reviewed.has(photo.id) && !chosen.has(photo.id)) : tab === 'unreviewed' ? item.assets.filter(photo => !reviewed.has(photo.id)) : tab === 'all' ? item.assets : tab.startsWith('revision:') ? item.submissions.find(entry => String(entry.revision) === tab.split(':')[1])?.photos || [] : item.selectedPhotos;
  async function archive() { try { const { data } = await api.post('/v1/storage/photos/archive', { assetIds: photos.map(photo => photo._id) }); window.location.assign(downloadUrl(data.data.url)); } catch (failure) { toast.error(apiMessage(failure, 'These originals could not be prepared.')); } }
  function exportNames() {
    const csv = ['Filename', ...photos.map(photo => '"' + (/^[=+\-@]/.test(photo.originalFilename) ? "'" : '') + photo.originalFilename.replaceAll('"', '""') + '"')].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'selected-photographs.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reopenSelection() {
    setBusy(true); try { await api.patch('/v1/storage/collaborations/' + id + '/reopen', { startOver }); setReopen(false); await load(); toast.success('The client can choose again. Their previous submission is kept.'); } catch (failure) { toast.error(apiMessage(failure, 'This selection could not be reopened.')); } finally { setBusy(false); }
  }
  return <LibraryShell title={item?.title || 'Selection results'} description="Your client’s chosen photographs, together." action={<Link to="/pre-selection" className="lib-text-link"><ArrowLeft size={16} />All pre-selections</Link>}>
    {error && <div className="lib-error" role="alert">{error}<button type="button" onClick={() => load()}>Try again</button></div>}{loading && !item ? <div className="lib-empty" role="status">Opening this selection…</div> : item && item.kind !== 'preselection' ? <div className="lib-error">This is an Editor Link. <Link to={'/editor-links/' + id}>Open the editor job</Link></div> : item && <><div className="lib-detail-heading"><div><span className="lib-status">{linkStatus(item)}</span><h2>{item.clientName || 'Client selection'}</h2><p>{item.assets.length} photographs shared · {selectionInstruction(item.selectionRule)}</p>{item.submittedAt && <small>Submitted {new Date(item.submittedAt).toLocaleString()} · Revision {item.revision}</small>}</div><div className="lib-detail-stats"><strong>{item.selectedPhotos.length}</strong><span>photographs chosen</span></div></div><LinkActions item={item} onChange={setItem} deleteOnly={!canCreate} />{canCreate && ['active', 'submitted'].includes(item.status) && <Link className="lib-text-link" to={'/pre-selection/' + id + '/revise'}>Change photographs or allowance</Link>}{item.note && <blockquote className="lib-brief">{item.note}</blockquote>}<div className="lib-results-tools"><div className="lib-segment"><button type="button" aria-pressed={tab === 'selected'} onClick={() => setTab('selected')}>Chosen photographs</button><button type="button" aria-pressed={tab === 'all'} onClick={() => setTab('all')}>All shared</button>{item.selectionDraft?.updatedAt && <><button type="button" aria-pressed={tab === 'skipped'} onClick={() => setTab('skipped')}>Skipped</button><button type="button" aria-pressed={tab === 'unreviewed'} onClick={() => setTab('unreviewed')}>Not reviewed</button></>}</div>{item.submissions.length > 0 && <select aria-label="Selection history" value={tab.startsWith('revision:') ? tab : ''} onChange={event => setTab(event.target.value || 'selected')}><option value="">Current selection</option>{item.submissions.map(entry => <option key={entry.revision} value={'revision:' + entry.revision}>Revision {entry.revision} · {entry.photos.length} chosen</option>)}</select>}</div>
      {photos.length ? <><div className="lib-bulk"><strong>{photos.length} photographs</strong><button type="button" onClick={archive}><Download size={16} />Download originals</button><button type="button" onClick={exportNames}><FileText size={16} />Export filenames</button>{canCreate && <button type="button" onClick={() => navigate('/editor-links/new', { state: { assetIds: photos.map(photo => photo._id) } })}><Send size={16} />Create Editor Link</button>}</div><div className="lib-photo-grid lib-result-grid">{photos.map((photo, index) => <button type="button" className="lib-photo" key={photo.id} onClick={() => setViewer(index)}><img src={photo.thumbnailUrl || photo.url} alt={photo.originalFilename} loading="lazy" /><span>{photo.originalFilename}</span></button>)}</div></> : <div className="lib-empty"><h2>{tab === 'skipped' ? 'No photographs skipped yet.' : tab === 'unreviewed' ? 'Every photograph has been reviewed.' : item.status === 'submitted' ? 'The selected photographs are unavailable.' : 'Their choices will appear here.'}</h2><p>{item.status === 'submitted' ? 'Check the stored photographs for this selection.' : item.selectionDraft?.updatedAt ? `${item.selectionDraft.reviewedAssetIds?.length || 0} photographs reviewed so far. The client has not submitted yet.` : 'Share the link with your client. You can return here while they choose.'}</p></div>}
      {canCreate && item.status === 'submitted' && new Date(item.expiresAt) > new Date() && <div className="lib-reopen"><div><h3>Need a different selection?</h3><p>Let your client revise their choices. Previous submissions stay in the history.</p></div><button type="button" className="lib-button" onClick={() => setReopen(true)}><RotateCcw size={16} />Reopen selection</button></div>}
    </>}
    {viewer !== null && <PhotoViewer photos={photos} initialIndex={viewer} onClose={() => setViewer(null)} />}{reopen && <div className="lib-backdrop"><section ref={dialog} className="lib-dialog" role="dialog" aria-modal="true" aria-labelledby="selection-reopen-title"><header><h2 id="selection-reopen-title">Let your client choose again</h2><button type="button" aria-label="Close reopen selection" onClick={() => setReopen(false)}><X size={20} /></button></header><p>The current submission is saved in history. The same private link will open a new revision.</p><label className="lib-checkbox"><input type="checkbox" checked={startOver} onChange={event => setStartOver(event.target.checked)} />Start with no photographs chosen</label><small>{startOver ? 'Your client will start again.' : 'Your client will continue from their previous choices.'}</small><footer><button type="button" className="lib-button" onClick={() => setReopen(false)}>Cancel</button><button type="button" className="lib-button lib-primary" disabled={busy} onClick={reopenSelection}>{busy ? 'Reopening…' : 'Reopen selection'}</button></footer></section></div>}
  </LibraryShell>;
}

export default function PhotoPreselection({ user }) {
  const protect = (children, showHistory = false) => <LibraryWorkflowAccess user={user} kind="preselection" showHistory={showHistory}>{children}</LibraryWorkflowAccess>;
  return <Routes>
    <Route index element={protect(<LibraryShell title="Photo Pre-selection" description="Let your clients choose the photographs they want edited." action={<Link className="lib-button lib-primary" to="/pre-selection/new"><Plus size={17} />New pre-selection</Link>}><WorkflowList kind="preselection" /></LibraryShell>, true)} />
    <Route path="new" element={protect(<SelectionSetup user={user} />)} />
    <Route path=":id/revise" element={protect(<SelectionSetup user={user} revising />)} />
    <Route path=":id/setup" element={protect(<SelectionSetup user={user} />)} />
    <Route path=":id" element={<LibraryWorkflowAccess user={user} kind="preselection" allowReadOnly>{canCreate => <SelectionResults canCreate={canCreate} />}</LibraryWorkflowAccess>} />
  </Routes>;
}
