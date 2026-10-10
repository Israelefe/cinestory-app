import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, MessageCircle, RefreshCw } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import './PortfolioEnquiries.css';

export default function PortfolioEnquiries({ embedded = false, onCountsChange }) {
  const [status, setStatus] = useState(''), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState('');
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    api.get('/v1/portfolios/mine/enquiries', { params: { status, page } }).then(({ data: next }) => { if (active) { setData(next); onCountsChange?.(next.counts || {}); } }).catch(err => { if (active) setError(apiMessage(err, 'We could not open your inbox. Try again.')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, page, retry, onCountsChange]);
  async function update(id, nextStatus) {
    setSaving(id); setError('');
    try { await api.patch(`/v1/portfolios/mine/enquiries/${id}`, { status: nextStatus }); setRetry(value => value + 1); }
    catch (err) { setError(apiMessage(err, 'We could not update this enquiry.')); }
    finally { setSaving(''); }
  }
  const Heading = embedded ? 'h2' : 'h1';
  return <motion.div className={`v-enquiries ${embedded ? 'is-embedded' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    {!embedded && <Link className="v-enquiries-back" to="/portfolio/manage"><ArrowLeft size={16} />Back to your portfolio</Link>}
    <header><Heading>Enquiries</Heading><p>Reply by WhatsApp or email, then update the status here. An enquiry does not confirm a booking.</p><Link to="/portfolio/manage?section=Studio">Manage contact options</Link></header>
    <div className="v-enquiries-filters" aria-label="Filter enquiries">{[['', 'All'], ['new', 'New'], ['replied', 'Replied'], ['closed', 'Closed']].map(([key, label]) => <button key={key} aria-pressed={status === key} onClick={() => { setStatus(key); setPage(1); }}>{label}{key && data?.counts?.[key] ? ` (${data.counts[key]})` : ''}</button>)}<button aria-label="Refresh enquiries" onClick={() => setRetry(value => value + 1)}><RefreshCw size={17} /></button></div>
    {error && <p className="v-enquiries-error" role="alert">{error}<button onClick={() => setRetry(value => value + 1)}>Try again</button></p>}
    {loading ? <p role="status">Opening enquiries…</p> : !error && !data?.data.length ? <div className="v-enquiries-empty"><Mail size={26} /><h3>{status ? 'No enquiries with this status.' : 'No enquiries here yet.'}</h3><p>You can enable the enquiry form in Studio details. Direct WhatsApp and email messages stay in those apps.</p></div> : !loading && data?.data.map(row => <article key={row._id} className="v-enquiry-card">
      <header><div><span>{new Date(row.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span><h2>{row.name}</h2><p>{row.shootType}</p></div><label>Status<select aria-label={`Status for ${row.name}`} disabled={saving === row._id} value={row.status} onChange={event => update(row._id, event.target.value)}><option value="new">New</option><option value="replied">Replied</option><option value="closed">Closed</option></select></label></header>
      {row.sourceLabel && <p className="v-enquiry-source">From: {row.sourceLabel}</p>}
      <dl>{[['Date', row.date || 'Not decided yet'], ['Location', row.location], ['Budget', row.budget]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="v-enquiry-message">{row.message}</p>
      <a className="v-enquiry-reply" href={row.replyMethod === 'email' ? `mailto:${encodeURIComponent(row.replyTo)}` : `https://wa.me/${row.replyTo}`} target={row.replyMethod === 'email' ? undefined : '_blank'} rel="noopener noreferrer">{row.replyMethod === 'email' ? <Mail size={18} /> : <MessageCircle size={18} />}Reply to {row.replyTo}</a>
    </article>)}
    {(page > 1 || data?.hasMore) && <nav className="v-enquiries-pagination" aria-label="Enquiry pages"><button disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page}</span><button disabled={!data?.hasMore || loading} onClick={() => setPage(value => value + 1)}>Next</button></nav>}
  </motion.div>;
}
