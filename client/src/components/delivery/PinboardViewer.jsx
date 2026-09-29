import React, { useEffect, useMemo, useRef, useState } from 'react';
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

function photoUrl(asset, full = false) { return full ? asset?.url || asset?.thumbnailUrl || '' : asset?.thumbnailUrl || asset?.url || ''; }

const TILE_RATIOS = {
  balanced: ['4 / 5', '1 / 1', '3 / 4', '5 / 4', '4 / 5', '1 / 1', '3 / 4', '4 / 3'],
  moments: ['3 / 4', '1 / 1', '4 / 5', '4 / 3', '1 / 1', '3 / 4', '5 / 4', '4 / 5'],
  'colour-flow': ['1 / 1', '4 / 5', '3 / 4', '1 / 1', '5 / 4', '4 / 5', '3 / 4', '1 / 1']
};

function tileRatio(asset, index, layoutId) {
  const requested = (TILE_RATIOS[layoutId] || TILE_RATIOS.balanced)[index % 8];
  const natural = Number(asset?.width) / Number(asset?.height);
  if (natural > 0 && natural < 0.8 && (requested === '5 / 4' || requested === '4 / 3')) return '4 / 5';
  if (natural > 1.7 && requested === '3 / 4') return '1 / 1';
  return requested;
}

function accentInk(hex) {
  const parts = String(hex || '').match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!parts) return '#fff';
  const rgb = parts.slice(1).map(part => parseInt(part, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.36 ? '#201b18' : '#fff';
}

export default function PinboardViewer({ delivery, preview = false, demo = false, galleryProps = {} }) {
  const location = useLocation();
  const [activeMoment, setActiveMoment] = useState('');
  const [activePhoto, setActivePhoto] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusSelection, setStatusSelection] = useState([]);
  const [statusPage, setStatusPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [photoDirection, setPhotoDirection] = useState(1);
  const touchStart = useRef(null);
  const boardRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === 'undefined' ? 390 : window.innerWidth);
  const board = delivery?.pinboard || {};
  const assets = useMemo(() => [...(delivery?.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)), [delivery?.assets]);
  const assetById = useMemo(() => new Map(assets.map(asset => [String(asset.assetId), asset])), [assets]);
  const moments = useMemo(() => (board.moments || []).filter(moment => !moment.hidden && moment.assetIds?.some(id => assetById.has(String(id)))), [board.moments, assetById]);
  const selectedLayout = (board.layouts || []).find(layout => layout.id === board.selectedLayoutId);
  const orderedIds = [...new Set([...(selectedLayout?.assetOrder || delivery?.galleryOrder || []), ...assets.map(asset => asset.assetId)].map(String))];
  const ordered = orderedIds.map(id => assetById.get(id)).filter(Boolean);
  const visible = activeMoment ? ordered.filter(asset => moments.find(moment => moment.id === activeMoment)?.assetIds?.includes(asset.assetId)) : ordered;
  const palette = board.palette || {};
  const typography = board.typography || {};
  const fonts = { display: typography.display || 'Cormorant Garamond', body: typography.body || 'Outfit' };
  const grid = board.grid || {};
  const columnCount = Math.max(1, Math.min(5, Number(viewportWidth <= 640 ? grid.mobileColumns || 2 : viewportWidth <= 1024 ? grid.tabletColumns || 3 : grid.desktopColumns || 4)));
  const masonryColumns = Array.from({ length: columnCount }, () => []);
  const columnHeights = Array.from({ length: columnCount }, () => 0);
  visible.forEach((asset, index) => {
    const ratio = tileRatio(asset, index, board.selectedLayoutId);
    const [width, height] = ratio.split('/').map(Number);
    const shortest = columnHeights.indexOf(Math.min(...columnHeights));
    masonryColumns[shortest].push({ asset, index, ratio });
    columnHeights[shortest] += height / width + 0.07;
  });
  const style = {
    '--pb-background': palette.background || '#13110f',
    '--pb-surface': palette.surface || '#211b18',
    '--pb-text': palette.text || '#fff6ec',
    '--pb-accent': palette.accent || '#efa57c',
    '--pb-on-accent': accentInk(palette.accent || '#efa57c'),
    '--pb-display': `'${fonts.display}', Georgia, serif`,
    '--pb-body': `'${fonts.body}', Arial, sans-serif`,
    '--pb-gap': grid.gap === 'compact' ? '8px' : grid.gap === 'spacious' ? '22px' : '14px',
    '--pb-active-columns': columnCount,
    '--pb-animation-duration': board.animation === 'staggered' ? '.76s' : '.58s'
  };

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const tiles = boardRef.current?.querySelectorAll('.pb-tile.is-revealing');
    if (!tiles?.length) return undefined;
    if (!('IntersectionObserver' in window)) {
      tiles.forEach(tile => tile.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px 90px 0px', threshold: 0.04 });
    tiles.forEach(tile => observer.observe(tile));
    return () => observer.disconnect();
  }, [activeMoment, columnCount, assets.length, board.animation]);

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
        event.preventDefault();
        navigatePhoto(event.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePhoto, visible]);

  function navigatePhoto(direction) {
    const current = visible.findIndex(asset => asset.assetId === activePhoto);
    const next = visible[current + direction];
    if (next) { setPhotoDirection(direction); setActivePhoto(next.assetId); }
  }

  function onPhotoTouchStart(event) {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function onPhotoTouchMove(event) {
    if (!touchStart.current || board.animation === 'none' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 8) return;
    const image = event.currentTarget.querySelector('.pb-lightbox-photo-main');
    if (image) image.style.transform = `translate3d(${Math.max(-120, Math.min(120, dx * .7))}px, 0, 0) scale(.98)`;
  }

  function onPhotoTouchEnd(event) {
    if (!touchStart.current) return;
    const image = event.currentTarget.querySelector('.pb-lightbox-photo-main');
    if (image) image.style.transform = '';
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.25) navigatePhoto(dx < 0 ? 1 : -1);
  }

  function privateLink(kind, id) {
    const url = new URL(`/d/${encodeURIComponent(delivery.publicId)}`, window.location.origin);
    if (kind) url.searchParams.set(kind, id);
    const grant = sessionStorage.getItem(`veylo_delivery_grant_${delivery.publicId}`) || '';
    if (/^[A-Za-z0-9_-]{30,100}$/.test(grant)) url.searchParams.set('share', grant);
    return url.toString();
  }
  function openWhatsApp(kind, id, label) {
    if (preview || (!demo && !delivery?.publicId)) return;
    const link = demo ? new URL(`/demo/gridboard?${kind}=${encodeURIComponent(id)}`, window.location.origin).toString() : privateLink(kind, id);
    const text = `${label}\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }
  function toggleStatusPhoto(id) {
    setStatusSelection(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 4 ? [...current, id] : current);
  }
  async function createStatusCard() {
    if (statusSelection.length < 1 || statusSelection.length > 4) return;
    if (demo) { setStatusOpen(false); setMessage('Status cards are available on published galleries.'); return; }
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
  const suggestedTone = modalAsset?.dominantColor || modalAsset?.analysis?.colors?.[0];
  const modalTone = typeof suggestedTone === 'string' && /^#[0-9a-f]{6}$/i.test(suggestedTone) ? suggestedTone : palette.surface || '#211b18';
  const canDownload = !preview && !delivery?.access?.downloadsLocked && (delivery?.access?.allowIndividualDownloads || delivery?.access?.allowDownloadAll);
  function downloadPhoto(asset, index) {
    if (demo) {
      const anchor = document.createElement('a');
      anchor.href = photoUrl(asset, true);
      anchor.download = `veylo-gridboard-demo-${index + 1}.webp`;
      anchor.click();
      return;
    }
    galleryProps.onDownload?.(asset.assetId, index);
  }
  const statusPageSize = 18;
  const statusPageCount = Math.ceil(assets.length / statusPageSize);
  const statusPageAssets = assets.slice(statusPage * statusPageSize, (statusPage + 1) * statusPageSize);

  return <main className={'pb-viewer' + (preview ? ' is-preview' : '') + (board.animation === 'none' ? '' : ' is-animated')} style={style}>
    <div className="pb-wrap">
      <header className="pb-header">
        <div className="pb-brand"><span className="pb-brand-mark">{delivery?.branding?.logoUrl ? <img src={delivery.branding.logoUrl} alt="" /> : <Image size={18} />}</span><span>{delivery?.branding?.name || 'Veylo'}<small>GRIDBOARD</small></span></div>
        {!preview && <div className="pb-header-actions">{delivery.access?.allowDownloadAll && !delivery.access?.downloadsLocked && <button type="button" aria-label="Download all photos" onClick={() => demo ? setMessage('Download all is available on published galleries.') : galleryProps.onDownloadAll?.()}><ArrowDownToLine size={17} /> Download all</button>}{canDownload && <button type="button" aria-label="Make a WhatsApp Status card" className="pb-status-open" onClick={() => { setStatusSelection([]); setStatusPage(0); setStatusOpen(true); }}><MessageCircle size={17} /> Make a Status card</button>}</div>}
      </header>
      <section className="pb-intro">
        <span className="pb-kicker">GRIDBOARD DELIVERY</span>
        <h1>{board.title || delivery?.title || `${delivery?.clientName || 'Your'}'s photographs`}</h1>
        <p>{board.description || (preview ? 'Every finished photograph from this shoot.' : `Made for ${delivery?.clientName || 'you'}. Explore the whole set or find a moment below.`)}</p>
        <div className="pb-intro-meta"><span>{assets.length} photographs</span><i aria-hidden="true" />{!preview && <span>{delivery?.viewer?.label || 'Private gallery'}</span>}</div>
      </section>
      {!!moments.length && <nav className="pb-moments" aria-label="Find a moment">
        <div className="pb-moments-head"><span>FIND A MOMENT</span>{activeMoment && <button type="button" onClick={() => setActiveMoment('')}>Show all photos</button>}</div>
        <div className="pb-moment-list">{moments.map((moment, momentIndex) => {
          const cover = moment.assetIds.map(id => assetById.get(String(id))).find(Boolean);
          return <div className={'pb-moment-chip-wrap' + (activeMoment === moment.id ? ' is-active' : '')} id={`pb-moment-${moment.id}`} key={moment.id} style={{ animationDelay: `${Math.min(momentIndex * 65, 390)}ms` }}>
            {cover && <img src={photoUrl(cover)} alt="" loading="lazy" />}
            <button type="button" aria-pressed={activeMoment === moment.id} onClick={() => setActiveMoment(current => current === moment.id ? '' : moment.id)}><strong>{moment.title}</strong><span>{moment.assetIds.filter(id => assetById.has(String(id))).length} photos</span></button>
            {!preview && <button type="button" className="pb-chip-share" aria-label={`Share ${moment.title} on WhatsApp`} onClick={() => openWhatsApp('moment', moment.id, `${moment.title} · ${delivery?.title || 'Photo gallery'}`)}><MessageCircle size={15} /></button>}
          </div>;
        })}</div>
      </nav>}
      <div className="pb-board-top"><span>{activeMoment ? moments.find(moment => moment.id === activeMoment)?.title : 'All photos'}</span><span>{visible.length} PHOTOS</span></div>
      <section className="pb-board" ref={boardRef} key={activeMoment || 'all'} aria-label="Photographs" aria-live="polite">
        {masonryColumns.map((column, columnIndex) => <div className="pb-board-column" key={columnIndex}>{column.map(({ asset, index, ratio }) => <article className={'pb-tile' + (board.animation === 'none' ? '' : ' is-revealing')} id={`pb-photo-${asset.assetId}`} key={asset.assetId} style={{ '--pb-tile-ratio': ratio, '--pb-reveal-delay': board.animation === 'staggered' ? `${(index % 5) * 65}ms` : '0ms' }}>
          <button type="button" className="pb-tile-open" onClick={() => setActivePhoto(asset.assetId)} aria-label={`Open photograph ${index + 1}`}><img loading={index < 6 ? 'eager' : 'lazy'} src={photoUrl(asset)} alt={asset.alt || `Finished photograph ${index + 1}`} /><span className="pb-tile-view">View photo</span></button>
          {!preview && <div className="pb-tile-tools"><button type="button" onClick={() => openWhatsApp('photo', asset.assetId, `${delivery?.title || 'Photo gallery'} · Photograph ${index + 1}`)} aria-label="Share this photo on WhatsApp"><MessageCircle size={16} /></button>{canDownload && <button type="button" onClick={() => downloadPhoto(asset, index)} aria-label="Download this photo"><Download size={16} /></button>}</div>}
        </article>)}</div>)}
      </section>
      <footer className="pb-footer"><span>That’s the whole gallery.</span><span>{assets.length} photographs</span></footer>
    </div>

    {modalAsset && <div className="pb-lightbox" role="dialog" aria-modal="true" aria-label="Photograph" onMouseDown={event => { if (event.target === event.currentTarget) setActivePhoto(''); }}>
      <button type="button" className="pb-lightbox-close" onClick={() => setActivePhoto('')} aria-label="Close photograph"><X size={23} /></button>
      <button type="button" className="pb-lightbox-nav is-left" onClick={() => navigatePhoto(-1)} disabled={modalIndex <= 0} aria-label="Previous photograph"><ChevronLeft size={26} /></button>
      <figure onTouchStart={onPhotoTouchStart} onTouchMove={onPhotoTouchMove} onTouchEnd={onPhotoTouchEnd}>
        <div className="pb-lightbox-photo" style={{ backgroundColor: modalTone }}>
          <img className="pb-lightbox-photo-ambient" src={photoUrl(modalAsset, true)} alt="" aria-hidden="true" draggable="false" />
          <img key={modalAsset.assetId} className={'pb-lightbox-photo-main ' + (photoDirection > 0 ? 'is-next' : 'is-previous')} src={photoUrl(modalAsset, true)} alt={modalAsset.alt || 'Finished photograph'} draggable="false" />
        </div>
        <figcaption>Photograph {modalIndex + 1} of {visible.length}{visible.length > 1 && <span className="pb-swipe-hint"> · Swipe to browse</span>}</figcaption>
      </figure>
      <button type="button" className="pb-lightbox-nav is-right" onClick={() => navigatePhoto(1)} disabled={modalIndex >= visible.length - 1} aria-label="Next photograph"><ChevronRight size={26} /></button>
      <div className="pb-lightbox-actions">{!preview && <button type="button" onClick={() => openWhatsApp('photo', modalAsset.assetId, delivery?.title || 'Photo gallery')}><MessageCircle size={17} /> Share on WhatsApp</button>}{canDownload && <button type="button" onClick={() => downloadPhoto(modalAsset, modalIndex)}><Download size={17} /> Download photo</button>}</div>
    </div>}

    {statusOpen && <div className="pb-status-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setStatusOpen(false); }}><section className="pb-status-dialog" role="dialog" aria-modal="true" aria-labelledby="pb-status-title"><button type="button" className="pb-dialog-close" onClick={() => setStatusOpen(false)} aria-label="Close"><X size={20} /></button><span className="pb-kicker">WHATSAPP SHARING</span><h2 id="pb-status-title">Make a Status card</h2><p>Choose up to four finished photos. Veylo makes a 9:16 card with a private link back to the gallery.</p><div className="pb-status-photos">{statusPageAssets.map((asset, index) => { const photoIndex = statusPage * statusPageSize + index; return <label key={asset.assetId} className={statusSelection.includes(asset.assetId) ? 'is-selected' : ''}><input type="checkbox" checked={statusSelection.includes(asset.assetId)} onChange={() => toggleStatusPhoto(asset.assetId)} disabled={!statusSelection.includes(asset.assetId) && statusSelection.length >= 4} /><img src={photoUrl(asset)} alt={`Select photo ${photoIndex + 1}`} loading="lazy" /><span>{statusSelection.includes(asset.assetId) && <Check size={15} />}{photoIndex + 1}</span></label>; })}</div>{statusPageCount > 1 && <div className="pb-status-pagination"><button type="button" onClick={() => setStatusPage(page => Math.max(0, page - 1))} disabled={statusPage === 0}>Previous photos</button><span>{statusPage + 1} / {statusPageCount}</span><button type="button" onClick={() => setStatusPage(page => Math.min(statusPageCount - 1, page + 1))} disabled={statusPage >= statusPageCount - 1}>More photos</button></div>}<div className="pb-status-bottom"><span>{statusSelection.length} of 4 selected</span><button type="button" disabled={!statusSelection.length || busy} onClick={createStatusCard}>{busy ? 'Preparing card…' : 'Prepare Status card'}<ExternalLink size={16} /></button></div>{message && <p className="pb-status-message" role="status">{message}</p>}</section></div>}
    {!statusOpen && message && <div className="pb-toast" role="status">{message}<button type="button" onClick={() => setMessage('')} aria-label="Dismiss"><X size={15} /></button></div>}
  </main>;
}
