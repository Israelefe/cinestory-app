import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Check, ChevronLeft, ChevronRight, Download, ExternalLink, Image, MessageCircle, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import api from '../../services/api.js';
import './PinboardViewer.css';

function accessHeaders(publicId) {
  const headers = {};
  const pin = sessionStorage.getItem(`veylo_delivery_${publicId}`);
  const grant = sessionStorage.getItem(`veylo_delivery_grant_${publicId}`);
  if (pin) headers['x-delivery-access'] = pin;
  if (grant) headers['x-delivery-grant'] = grant;
  return headers;
}

function photoUrl(asset) { return asset?.thumbnailUrl || asset?.url || ''; }

export default function PinboardViewer({ delivery, preview = false, galleryProps = {} }) {
  const location = useLocation();
  const [activeMoment, setActiveMoment] = useState('');
  const [activePhoto, setActivePhoto] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusSelection, setStatusSelection] = useState([]);
  const [statusPage, setStatusPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const board = delivery?.pinboard || {};
  const assets = useMemo(() => [...(delivery?.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)), [delivery?.assets]);
  const assetById = useMemo(() => new Map(assets.map(asset => [String(asset.assetId), asset])), [assets]);
  const moments = useMemo(() => (board.moments || []).filter(moment => !moment.hidden && moment.assetIds?.some(id => assetById.has(String(id)))), [board.moments, assetById]);
  const selectedLayout = (board.layouts || []).find(layout => layout.id === board.selectedLayoutId);
  const ordered = (selectedLayout?.assetOrder || delivery?.galleryOrder || assets.map(asset => asset.assetId)).map(id => assetById.get(String(id))).filter(Boolean);
  const visible = activeMoment ? ordered.filter(asset => moments.find(moment => moment.id === activeMoment)?.assetIds?.includes(asset.assetId)) : ordered;
  const palette = board.palette || {};
  const typography = board.typography || {};
  const fonts = { display: typography.display || 'Playfair Display', body: typography.body || 'Outfit' };
  const grid = board.grid || {};
  const style = {
    '--pb-background': palette.background || '#0c0c10',
    '--pb-surface': palette.surface || '#17171c',
    '--pb-text': palette.text || '#fffaf6',
    '--pb-accent': palette.accent || '#ff5a47',
    '--pb-display': `'${fonts.display}', Georgia, serif`,
    '--pb-body': `'${fonts.body}', Arial, sans-serif`,
    '--pb-gap': grid.gap === 'compact' ? '8px' : grid.gap === 'spacious' ? '22px' : '14px',
    '--pb-mobile-columns': grid.mobileColumns || 2,
    '--pb-tablet-columns': grid.tabletColumns || 3,
    '--pb-desktop-columns': grid.desktopColumns || 4,
    '--pb-animation': board.animation === 'none' ? 'none' : board.animation === 'staggered' ? 'pb-arrive .48s both' : 'pb-arrive .34s both'
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const photo = params.get('photo');
    const moment = params.get('moment');
    if (moment && moments.some(item => item.id === moment)) {
      setActiveMoment(moment);
      window.setTimeout(() => document.getElementById(`pb-moment-${moment}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
    if (photo && assetById.has(photo)) {
      window.setTimeout(() => { document.getElementById(`pb-photo-${photo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setActivePhoto(photo); }, 180);
    }
  }, [location.search, assetById, moments]);

  useEffect(() => {
    if (!activePhoto) return undefined;
    const onKey = event => {
      if (event.key === 'Escape') setActivePhoto('');
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const current = visible.findIndex(asset => asset.assetId === activePhoto);
        const next = visible[Math.max(0, Math.min(visible.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)))];
        if (next) setActivePhoto(next.assetId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePhoto, visible]);

  function privateLink(kind, id) {
    const url = new URL(`/d/${encodeURIComponent(delivery.publicId)}`, window.location.origin);
    if (kind) url.searchParams.set(kind, id);
    const grant = sessionStorage.getItem(`veylo_delivery_grant_${delivery.publicId}`) || '';
    if (/^[A-Za-z0-9_-]{30,100}$/.test(grant)) url.searchParams.set('share', grant);
    return url.toString();
  }
  function openWhatsApp(kind, id, label) {
    if (preview || !delivery?.publicId) return;
    const link = privateLink(kind, id);
    const text = `${label}\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }
  function toggleStatusPhoto(id) {
    setStatusSelection(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 4 ? [...current, id] : current);
  }
  async function createStatusCard() {
    if (statusSelection.length < 1 || statusSelection.length > 4) return;
    setBusy(true); setMessage('');
    try {
      const response = await api.post(`/v1/deliveries/public/${delivery.publicId}/pinboard/status-card`, { assetIds: statusSelection }, { headers: accessHeaders(delivery.publicId), responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'veylo-photo-status.png'; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStatusOpen(false); setMessage('Your WhatsApp Status card is ready.');
    } catch (error) {
      const fallback = error?.response?.status === 403 ? 'The photographer has turned off downloads for this gallery.' : 'We could not prepare that Status card. Try again.';
      setMessage(fallback);
    } finally { setBusy(false); }
  }

  const modalAsset = assetById.get(activePhoto);
  const modalIndex = visible.findIndex(asset => asset.assetId === activePhoto);
  const canDownload = !preview && !delivery?.access?.downloadsLocked && (delivery?.access?.allowIndividualDownloads || delivery?.access?.allowDownloadAll);
  const statusPageSize = 18;
  const statusPageCount = Math.ceil(assets.length / statusPageSize);
  const statusPageAssets = assets.slice(statusPage * statusPageSize, (statusPage + 1) * statusPageSize);

  return <main className={'pb-viewer' + (preview ? ' is-preview' : '')} style={style}>
    <div className="pb-wrap">
      <header className="pb-header">
        <div className="pb-brand"><span className="pb-brand-mark">{delivery?.branding?.logoUrl ? <img src={delivery.branding.logoUrl} alt="" /> : <Image size={18} />}</span><span>{delivery?.branding?.name || 'Veylo'}<small>PHOTO GALLERY</small></span></div>
        {!preview && <div className="pb-header-actions">{delivery.access?.allowDownloadAll && !delivery.access?.downloadsLocked && <button type="button" onClick={() => galleryProps.onDownloadAll?.()}><ArrowDownToLine size={17} /> Download all</button>}{canDownload && <button type="button" className="pb-status-open" onClick={() => { setStatusSelection([]); setStatusPage(0); setStatusOpen(true); }}><MessageCircle size={17} /> Make a Status card</button>}</div>}
      </header>
      <section className="pb-intro">
        <span className="pb-kicker">{board.analysisStatus === 'standard' ? 'PINBOARD GALLERY' : 'ARRANGED FOR EASY BROWSING'}</span>
        <h1>{board.title || delivery?.title || `${delivery?.clientName || 'Your'}'s photographs`}</h1>
        <p>{preview ? 'A free-flowing gallery, with every finished photograph in view.' : `A private gallery for ${delivery?.clientName || 'you'}. Browse the photographs or jump to a moment.`}</p>
        <div className="pb-intro-meta"><span>{assets.length} finished photographs</span><i aria-hidden="true" />{!preview && <span>{delivery?.viewer?.label || 'Private link'}</span>}</div>
      </section>
      {!!moments.length && <nav className="pb-moments" aria-label="Find a moment">
        <div className="pb-moments-head"><span>FIND A MOMENT</span><span>{activeMoment ? <button type="button" onClick={() => setActiveMoment('')}>Show all photographs</button> : 'Choose a group to jump in'}</span></div>
        <div className="pb-moment-list">{moments.map(moment => <div className="pb-moment-chip-wrap" id={`pb-moment-${moment.id}`} key={moment.id}><button type="button" className={activeMoment === moment.id ? 'is-active' : ''} onClick={() => setActiveMoment(current => current === moment.id ? '' : moment.id)}>{moment.title}<span>{moment.assetIds.filter(id => assetById.has(String(id))).length}</span></button>{!preview && <button type="button" className="pb-chip-share" aria-label={`Share ${moment.title} on WhatsApp`} onClick={() => openWhatsApp('moment', moment.id, `${moment.title} · ${delivery?.title || 'Photo gallery'}`)}><MessageCircle size={15} /></button>}</div>)}</div>
      </nav>}
      <div className="pb-board-top"><span>{activeMoment ? moments.find(moment => moment.id === activeMoment)?.title : selectedLayout?.title || 'All photographs'}</span><span>{visible.length} PHOTOS</span></div>
      <section className="pb-board" aria-label="Photographs">
        {visible.map((asset, index) => <article className="pb-tile" id={`pb-photo-${asset.assetId}`} key={asset.assetId} style={{ animationDelay: board.animation === 'staggered' ? `${Math.min(index * 35, 520)}ms` : '0ms' }}>
          <button type="button" className="pb-tile-open" onClick={() => setActivePhoto(asset.assetId)} aria-label={`Open photograph ${index + 1}`}><img loading={index < 6 ? 'eager' : 'lazy'} src={photoUrl(asset)} alt={asset.alt || `Finished photograph ${index + 1}`} /></button>
          {!preview && <div className="pb-tile-tools"><button type="button" onClick={() => openWhatsApp('photo', asset.assetId, `${delivery?.title || 'Photo gallery'} · Photograph ${index + 1}`)} aria-label="Share this photo on WhatsApp"><MessageCircle size={15} /></button>{canDownload && <button type="button" onClick={() => galleryProps.onDownload?.(asset.assetId, index)} aria-label="Download this photo"><Download size={15} /></button>}</div>}
        </article>)}
      </section>
      <footer className="pb-footer"><span>End of this board</span><span>{assets.length} photographs · Original files stay unchanged</span></footer>
    </div>

    {modalAsset && <div className="pb-lightbox" role="dialog" aria-modal="true" aria-label="Photograph" onMouseDown={event => { if (event.target === event.currentTarget) setActivePhoto(''); }}><button type="button" className="pb-lightbox-close" onClick={() => setActivePhoto('')} aria-label="Close photograph"><X size={23} /></button><button type="button" className="pb-lightbox-nav is-left" onClick={() => setActivePhoto(visible[Math.max(0, modalIndex - 1)]?.assetId)} disabled={modalIndex <= 0} aria-label="Previous photograph"><ChevronLeft size={26} /></button><figure><img src={photoUrl(modalAsset)} alt={modalAsset.alt || 'Finished photograph'} /><figcaption>Photograph {modalIndex + 1} of {visible.length}</figcaption></figure><button type="button" className="pb-lightbox-nav is-right" onClick={() => setActivePhoto(visible[Math.min(visible.length - 1, modalIndex + 1)]?.assetId)} disabled={modalIndex >= visible.length - 1} aria-label="Next photograph"><ChevronRight size={26} /></button><div className="pb-lightbox-actions">{!preview && <button type="button" onClick={() => openWhatsApp('photo', modalAsset.assetId, delivery?.title || 'Photo gallery')}><MessageCircle size={17} /> Share on WhatsApp</button>}{canDownload && <button type="button" onClick={() => galleryProps.onDownload?.(modalAsset.assetId, modalIndex)}><Download size={17} /> Download photo</button>}</div></div>}

    {statusOpen && <div className="pb-status-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setStatusOpen(false); }}><section className="pb-status-dialog" role="dialog" aria-modal="true" aria-labelledby="pb-status-title"><button type="button" className="pb-dialog-close" onClick={() => setStatusOpen(false)} aria-label="Close"><X size={20} /></button><span className="pb-kicker">WHATSAPP SHARING</span><h2 id="pb-status-title">Make a Status card</h2><p>Choose up to four finished photos. Veylo makes a 9:16 card with a private link back to the gallery.</p><div className="pb-status-photos">{statusPageAssets.map((asset, index) => { const photoIndex = statusPage * statusPageSize + index; return <label key={asset.assetId} className={statusSelection.includes(asset.assetId) ? 'is-selected' : ''}><input type="checkbox" checked={statusSelection.includes(asset.assetId)} onChange={() => toggleStatusPhoto(asset.assetId)} disabled={!statusSelection.includes(asset.assetId) && statusSelection.length >= 4} /><img src={photoUrl(asset)} alt={`Select photo ${photoIndex + 1}`} loading="lazy" /><span>{statusSelection.includes(asset.assetId) && <Check size={15} />}{photoIndex + 1}</span></label>; })}</div>{statusPageCount > 1 && <div className="pb-status-pagination"><button type="button" onClick={() => setStatusPage(page => Math.max(0, page - 1))} disabled={statusPage === 0}>Previous photos</button><span>{statusPage + 1} / {statusPageCount}</span><button type="button" onClick={() => setStatusPage(page => Math.min(statusPageCount - 1, page + 1))} disabled={statusPage >= statusPageCount - 1}>More photos</button></div>}<div className="pb-status-bottom"><span>{statusSelection.length} of 4 selected</span><button type="button" disabled={!statusSelection.length || busy} onClick={createStatusCard}>{busy ? 'Preparing card…' : 'Prepare Status card'}<ExternalLink size={16} /></button></div>{message && <p className="pb-status-message" role="status">{message}</p>}</section></div>}
    {!statusOpen && message && <div className="pb-toast" role="status">{message}<button type="button" onClick={() => setMessage('')} aria-label="Dismiss"><X size={15} /></button></div>}
  </main>;
}
