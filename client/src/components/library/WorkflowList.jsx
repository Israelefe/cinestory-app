import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Check, CheckCheck, ChevronRight, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../../services/api.js';
import { selectAllLibraryItems, deleteLibraryItems } from '../../utils/libraryBulkActions.js';
import { useDialogFocus } from '../useDialogFocus.js';
import LinkActions from './LinkActions.jsx';
import { linkStatus, workflowPath } from './libraryHelpers.js';

export default function WorkflowList({ kind }) {
  const [items, setItems] = useState([]), [page, setPage] = useState(1), [more, setMore] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [selected, setSelected] = useState([]), [selecting, setSelecting] = useState(false), [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [processed, setProcessed] = useState(0);
  const selectionRequest = useRef(null), dialog = useRef(null), stop = useRef(false), generation = useRef(0);
  const path = workflowPath(kind), selection = kind === 'preselection';
  useDialogFocus(confirming, dialog, () => !busy && setConfirming(false));
  async function load(next = 1, quiet = false) {
    const version = ++generation.current; if (!quiet) setLoading(true); setError('');
    try {
      const { data } = await api.get('/v1/storage/collaborations', { params: { kind, page: next } });
      if (version !== generation.current) return;
      setItems(current => next === 1 ? data.data : [...current, ...data.data]); setMore(data.hasMore); setPage(next);
    } catch (failure) { if (version === generation.current) setError(apiMessage(failure, 'These links could not be loaded.')); }
    finally { if (version === generation.current) setLoading(false); }
  }
  useEffect(() => {
    setSelected([]); setConfirming(false); load(); const focus = () => load(1, true); window.addEventListener('focus', focus);
    return () => { window.removeEventListener('focus', focus); generation.current++; selectionRequest.current?.abort(); stop.current = true; };
  }, [kind]);
  async function selectAll() {
    const controller = new AbortController(); selectionRequest.current?.abort(); selectionRequest.current = controller; setSelecting(true);
    try { const ids = await selectAllLibraryItems('/v1/storage/collaborations/selection', { kind }, { signal: controller.signal }); if (!controller.signal.aborted) setSelected(ids); }
    catch (failure) { if (!controller.signal.aborted) toast.error(apiMessage(failure, 'The full selection could not be loaded. Try again.')); }
    finally { if (selectionRequest.current === controller) setSelecting(false); }
  }
  async function remove() {
    if (busy) return; setBusy(true); setProcessed(0); setError(''); stop.current = false;
    try {
      const result = await deleteLibraryItems('/v1/storage/collaborations/delete', selected, { batchSize: 100, extra: { kind }, onProgress: setProcessed, stopped: () => stop.current });
      const removed = new Set(result.removedIds); setSelected(current => current.filter(id => !removed.has(id))); setItems(current => current.filter(item => !removed.has(item._id))); setConfirming(false); load(1, true);
      toast.success(removed.size + ' link' + (removed.size === 1 ? '' : 's') + ' deleted. Stored photographs are kept.');
      if (result.stopped) toast.info('Deletion stopped. Remaining links are still selected.');
    } catch (failure) {
      const removed = new Set(failure.removedIds || []); setSelected(current => current.filter(id => !removed.has(id))); setItems(current => current.filter(item => !removed.has(item._id)));
      const message = apiMessage(failure, 'Some links could not be deleted. Retry to continue.'); setError(message); toast.error(message);
    } finally { setBusy(false); }
  }
  function deleted(id) { setItems(current => current.filter(item => item._id !== id)); setSelected(current => current.filter(value => value !== id)); }
  return <>
    <div className="lib-list-heading"><span>{selection ? 'Selections prepared for your clients' : 'Editing jobs and returned photographs'}</span><button type="button" className="lib-button" disabled={busy || selecting} aria-label="Refresh links" onClick={() => load()}><RefreshCw size={16} /></button></div>
    {items.length > 0 && <div className="lib-list-selection"><strong>{selected.length} selected</strong><div><button type="button" className="lib-text-link" disabled={busy || selecting} onClick={() => setSelected([...new Set([...selected, ...items.map(item => item._id)])])}>Select loaded links</button><button type="button" className="lib-text-link" disabled={busy || selecting} onClick={selectAll}>{selecting ? 'Selecting across all pages…' : 'Select all links'}</button><button type="button" className="lib-text-link" disabled={busy || selecting || !selected.length} onClick={() => setSelected([])}>Clear selection</button></div>{selected.length > 0 && <button type="button" className="lib-button lib-danger" disabled={busy || selecting} onClick={() => { setError(''); setConfirming(true); }}><Trash2 size={16} />Delete {selected.length} selected</button>}</div>}
    {error && !confirming && <div className="lib-error" role="alert">{error}</div>}
    {loading && !items.length ? <div className="lib-empty" role="status">Loading your links…</div> : !items.length ? <div className="lib-empty lib-workflow-empty">{selection ? <CheckCheck size={34} /> : <Send size={34} />}<h2>{selection ? 'Give your client a clear choice.' : 'Send your editor the right originals.'}</h2><p>{selection ? 'Set how many photographs they can choose. Their submitted choices come back as a gallery.' : 'Add an editing brief, share the originals, and review the edits they return.'}</p><Link className="lib-button lib-primary" to={path + '/new'}><Plus size={17} />{selection ? 'New pre-selection' : 'New Editor Link'}</Link></div> : <div className="lib-job-grid">{items.map(item => <article key={item._id} className={'lib-job-card ' + (selected.includes(item._id) ? 'is-selected' : '')}>
      <button type="button" className="lib-job-select" disabled={busy || selecting} aria-label={'Select ' + item.title} aria-pressed={selected.includes(item._id)} onClick={() => setSelected(current => current.includes(item._id) ? current.filter(id => id !== item._id) : [...current, item._id])}>{selected.includes(item._id) && <Check size={18} />}</button>
      <Link className="lib-job-open" to={path + '/' + item._id + (item.status === 'draft' ? '/setup' : '')}><div className="lib-job-covers">{item.covers?.length ? item.covers.map(photo => <img key={photo.id} src={photo.thumbnailUrl || photo.url} alt="" loading="lazy" />) : selection ? <CheckCheck size={30} /> : <Send size={30} />}</div><div className="lib-job-info"><span className={'lib-status ' + (item.status === 'submitted' || item.editorState === 'complete' ? 'is-complete' : '')}>{linkStatus(item)}</span><h2>{item.title}</h2><p>{item.clientName || (selection ? 'Client selection' : 'Editor job')}</p><footer><span>{selection && item.status === 'submitted' ? `${item.selectedAssetIds?.length || 0} chosen` : `${item.assetIds?.length || 0} photographs`}{!selection && item.returnedAssets?.length ? ` · ${item.returnedAssets.length} edits returned` : ''}</span><ChevronRight size={18} /></footer></div></Link><LinkActions item={item} deleteOnly disabled={busy || selecting} onDeleted={deleted} />
    </article>)}</div>}
    {more && <button type="button" className="lib-button lib-more" disabled={loading || busy || selecting} onClick={() => load(page + 1)}>Load more links</button>}
    {confirming && createPortal(<div className="lib-backdrop"><section className="lib-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="lib-bulk-links-title"><header><h2 id="lib-bulk-links-title">Delete {selected.length} {selection ? 'pre-selections' : 'Editor Links'}?</h2><button type="button" aria-label="Cancel bulk deletion" disabled={busy} onClick={() => setConfirming(false)}><X size={20} /></button></header><p>This includes every selected link, including links on other pages. Recipient access will stop. Stored originals, returned edits and accepted photographs are kept in Photo Library.</p>{error && <div className="lib-error" role="alert">{error}</div>}{busy && <p role="status">Processed {processed} of {selected.length} links</p>}<footer><button type="button" className="lib-button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>{busy && <button type="button" className="lib-button" onClick={() => { stop.current = true; }}>Stop after current batch</button>}<button type="button" className="lib-button lib-danger" disabled={busy} onClick={remove}>{busy ? 'Deleting links…' : `Delete ${selected.length} links`}</button></footer></section></div>, document.body)}
  </>;
}
