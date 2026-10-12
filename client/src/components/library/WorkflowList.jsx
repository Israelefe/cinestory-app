import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCheck, ChevronRight, Plus, RefreshCw, Send } from 'lucide-react';
import api, { apiMessage } from '../../services/api.js';
import { linkStatus, workflowPath } from './libraryHelpers.js';

export default function WorkflowList({ kind }) {
  const [items, setItems] = useState([]), [page, setPage] = useState(1), [more, setMore] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const path = workflowPath(kind), selection = kind === 'preselection';
  async function load(next = 1, quiet = false) {
    if (!quiet) setLoading(true); setError('');
    try { const { data } = await api.get('/v1/storage/collaborations', { params: { kind, page: next } }); setItems(current => next === 1 ? data.data : [...current, ...data.data]); setMore(data.hasMore); setPage(next); }
    catch (failure) { setError(apiMessage(failure, 'These links could not be loaded.')); } finally { setLoading(false); }
  }
  useEffect(() => { load(); const focus = () => load(1, true); window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus); }, [kind]);
  return <><div className="lib-list-heading"><span>{selection ? 'Selections prepared for your clients' : 'Editing jobs and returned photographs'}</span><button type="button" className="lib-button" aria-label="Refresh links" onClick={() => load()}><RefreshCw size={16} /></button></div>{error && <div className="lib-error" role="alert">{error}</div>}{loading && !items.length ? <div className="lib-empty" role="status">Loading your links…</div> : !items.length ? <div className="lib-empty lib-workflow-empty">{selection ? <CheckCheck size={34} /> : <Send size={34} />}<h2>{selection ? 'Give your client a clear choice.' : 'Send your editor the right originals.'}</h2><p>{selection ? 'Set how many photographs they can choose. Their submitted choices come back as a gallery.' : 'Add an editing brief, share the originals, and review the edits they return.'}</p><Link className="lib-button lib-primary" to={path + '/new'}><Plus size={17} />{selection ? 'New pre-selection' : 'New Editor Link'}</Link></div> : <div className="lib-job-grid">{items.map(item => <Link key={item._id} className="lib-job-card" to={path + '/' + item._id + (item.status === 'draft' ? '/setup' : '')}><div className="lib-job-covers">{item.covers?.length ? item.covers.map(photo => <img key={photo.id} src={photo.thumbnailUrl || photo.url} alt="" loading="lazy" />) : selection ? <CheckCheck size={30} /> : <Send size={30} />}</div><div className="lib-job-info"><span className={'lib-status ' + (item.status === 'submitted' || item.editorState === 'complete' ? 'is-complete' : '')}>{linkStatus(item)}</span><h2>{item.title}</h2><p>{item.clientName || (selection ? 'Client selection' : 'Editor job')}</p><footer><span>{selection && item.status === 'submitted' ? `${item.selectedAssetIds?.length || 0} chosen` : `${item.assetIds?.length || 0} photographs`}{!selection && item.returnedAssets?.length ? ` · ${item.returnedAssets.length} edits returned` : ''}</span><ChevronRight size={18} /></footer></div></Link>)}</div>}{more && <button type="button" className="lib-button lib-more" disabled={loading} onClick={() => load(page + 1)}>Load more links</button>}</>;
}
