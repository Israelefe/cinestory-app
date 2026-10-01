import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Image as ImageIcon, Search, X } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { mediaUrl } from '../services/portfolio.js';
import { useDialogFocus } from './useDialogFocus.js';
export default function PortfolioPhotoPicker({
  items,
  onAdd,
  onClose,
  triggerRef
}) {
  const ref = useRef(null);
  const requestRef = useRef(0);
  const [kind, setKind] = useState('deliveries');
  const [delivery, setDelivery] = useState(null);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState([]);
  const known = new Set(items.map(item => item.publicId));
  useDialogFocus(true, ref, onClose, triggerRef);
  useEffect(() => {
    const controller = new AbortController();
    const request = ++requestRef.current;
    setRows([]);
    setCursor(null);
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const {
          data
        } = await api.get('/v1/portfolios/sources', {
          signal: controller.signal,
          params: {
            kind: delivery ? 'delivery' : kind,
            sourceId: delivery?.sourceId,
            query
          }
        });
        if (request === requestRef.current) {
          setRows(data.data || []);
          setCursor(data.nextCursor || null);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(apiMessage(err, 'We could not load these photographs. Try again.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
      requestRef.current += 1;
    };
  }, [kind, delivery, query, retry]);
  async function more() {
    const request = requestRef.current;
    setLoading(true);
    setError('');
    try {
      const {
        data
      } = await api.get('/v1/portfolios/sources', {
        params: {
          kind: delivery ? 'delivery' : kind,
          sourceId: delivery?.sourceId,
          query,
          cursor
        }
      });
      if (request === requestRef.current) {
        setRows(previous => [...previous, ...(data.data || [])]);
        setCursor(data.nextCursor || null);
      }
    } catch (err) {
      if (request === requestRef.current) setError(apiMessage(err, 'We could not load more work. Try again.'));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }
  return <div className="v-pedit-picker" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}><section ref={ref} role="dialog" aria-modal="true" aria-labelledby="portfolio-picker-title" tabIndex={-1}>
    <header><div><p>YOUR FINISHED WORK</p><h2 id="portfolio-picker-title">Add photographs</h2><span>Only the photographs you choose will appear in your public portfolio.</span></div><button onClick={onClose} aria-label="Close photograph picker"><X size={20} /></button></header>
    <div className="v-pedit-picker-filters"><nav aria-label="Photo source">{[['deliveries', 'Deliveries'], ['library', 'Library']].map(([value, label]) => <button key={value} aria-pressed={kind === value} onClick={() => {
            setKind(value);
            setDelivery(null);
            setQuery('');
          }}>{label}</button>)}</nav>{delivery && <button onClick={() => {
          setDelivery(null);
          setQuery('');
        }}><ArrowLeft size={16} />Back to deliveries</button>}<label><Search size={17} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={delivery ? 'Search file names' : 'Search finished work'} aria-label="Search portfolio photographs" /></label></div>
    <div className="v-pedit-picker-scroll"><div className="v-pedit-source-grid">{rows.map(row => kind === 'deliveries' && !delivery ? <button key={row.sourceId} onClick={() => {
            setDelivery(row);
            setQuery('');
          }}>{row.thumbnailUrl && <img src={mediaUrl(row.thumbnailUrl)} alt="" loading="lazy" />}<strong>{row.title}</strong><small>{row.photoCount} photographs</small></button> : <button key={row.publicId} disabled={known.has(row.publicId) || !selected.some(item => item.publicId === row.publicId) && items.length + selected.length >= 50} aria-pressed={selected.some(item => item.publicId === row.publicId)} onClick={() => setSelected(previous => previous.some(item => item.publicId === row.publicId) ? previous.filter(item => item.publicId !== row.publicId) : [...previous, {
            ...row,
            title: '',
            thumbnailUrl: mediaUrl(row.thumbnailUrl),
            url: mediaUrl(row.thumbnailUrl)
          }])}><img src={mediaUrl(row.thumbnailUrl)} alt={row.filename || 'Finished photograph'} loading="lazy" /><span className="v-pedit-source-check">{known.has(row.publicId) || selected.some(item => item.publicId === row.publicId) ? <Check size={16} /> : ''}</span><small>{known.has(row.publicId) ? 'Already in your portfolio' : row.filename || 'Finished photograph'}</small></button>)}</div>{!rows.length && !loading && !error && <div className="v-pedit-empty"><ImageIcon size={28} /><h3>No work here yet</h3><p>{kind === 'deliveries' && !query ? 'Publish a finished delivery, or choose photographs from your library.' : 'Try a different search or photo source.'}</p></div>}{error && <div className="v-pedit-notice" role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Try again</button></div>}{loading && <p role="status" className="v-pedit-loading">Loading finished work…</p>}{cursor && <button className="v-pedit-more" disabled={loading} onClick={more}>Load more</button>}</div>
    <footer><span>{selected.length} chosen · {50 - items.length - selected.length} spaces left</span><div><button onClick={onClose}>Cancel</button><button className="v-pedit-primary" disabled={!selected.length} onClick={() => {
            onAdd(selected);
            onClose();
          }}>Add selected photographs</button></div></footer>
  </section></div>;
}
