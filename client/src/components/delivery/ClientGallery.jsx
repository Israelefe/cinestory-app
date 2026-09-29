import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Heart, LoaderCircle, X } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';
import { useDialogFocus } from '../useDialogFocus.js';
import { trackEvent } from '../../services/analytics.js';
import './ClientGallery.css';

const photoKey = (photo, index) => photo?.assetId || photo?.id || photo?.name || index;
const imageUrl = (photo, width = 1440) => photo?.url || (typeof photo === 'string' && (photo.startsWith('http') || photo.startsWith('/')) ? photo : `/veylo/web/${photo?.name || photo}-${width}.webp`);

export default function ClientGallery({ photos = [], title = 'Your photographs', eyebrow = 'The complete collection', onClose, initialIndex = null, liked, onLike, onDownload, onDownloadAll, busy, downloading = null, allDownloading = false, downloadNotice = '', downloadProgress = null, delivery, demoId }) {
  const reduced = useReducedMotion();
  const panel = useRef(null);
  const [selected, setSelected] = useState(initialIndex);
  const [swipeDirection, setSwipeDirection] = useState(1);
  useDialogFocus(true, panel, onClose);

  const isLocked = Boolean(delivery?.access?.downloadsLocked);
  const allowDownloadAll = delivery ? (delivery.access?.allowDownloadAll !== false && !isLocked) : Boolean(onDownloadAll);
  const allowIndividualDownloads = Boolean(onDownload) && (!delivery || (delivery.access?.allowIndividualDownloads !== false && !isLocked));
  const allowLikes = delivery ? Boolean(delivery.access?.allowLikes && onLike) : Boolean(onLike);
  const resolvedPhotos = useMemo(() => photos.map((photo, index) => demoId ? { ...photo, name: `demo-${demoId}-${index + 1}`, url: `/veylo/web/demo-${demoId}-${index + 1}-1440.webp`, thumbnailUrl: `/veylo/web/demo-${demoId}-${index + 1}-480.webp` } : photo), [photos, demoId]);
  const direction = delivery?.creativeDirection || {};
  const typography = direction.typography || {};
  const allowedFonts = new Set(['Playfair Display', 'Outfit', 'Plus Jakarta Sans', 'Cormorant Garamond', 'DM Sans', 'Libre Baskerville', 'Manrope']);
  const displayFont = allowedFonts.has(typography.display) ? `'${typography.display}', Georgia, serif`
    : typography.display === 'soft-serif' ? "'Cormorant Garamond', 'Playfair Display', Georgia, serif"
    : typography.display === 'condensed-sans' ? "'Outfit', 'Plus Jakarta Sans', sans-serif"
      : typography.display === 'clean-sans' ? "'Plus Jakarta Sans', system-ui, sans-serif"
        : "'Playfair Display', Georgia, serif";
  const bodyFont = allowedFonts.has(typography.body) ? `'${typography.body}', system-ui, sans-serif`
    : typography.body === 'editorial-serif' ? "'Playfair Display', Georgia, serif" : "'Plus Jakarta Sans', system-ui, sans-serif";
  const galleryTheme = {
    '--gallery-display': displayFont,
    '--gallery-body': bodyFont,
    '--fd-caption-weight': direction.variation?.captionTreatment === 'bold' ? '650' : direction.variation?.captionTreatment === 'quiet' ? '400' : '500'
  };
  const activePhoto = selected === null ? null : resolvedPhotos[selected];
  const activeKey = selected === null ? null : photoKey(activePhoto, selected);
  const activeImageUrl = activePhoto ? imageUrl(activePhoto) : '';
  const suggestedTone = activePhoto?.dominantColor || activePhoto?.analysis?.colors?.[0];
  const photoTone = typeof suggestedTone === 'string' && /^#[0-9a-f]{6}$/i.test(suggestedTone) ? suggestedTone : direction.palette?.background || '#08080b';
  const resolvedBusy = busy ?? (allDownloading ? 'all' : downloading === null ? null : photoKey(resolvedPhotos[downloading], downloading));

  function navigatePhoto(step) {
    if (selected === null) return;
    const next = Math.max(0, Math.min(resolvedPhotos.length - 1, selected + step));
    if (next !== selected) { setSwipeDirection(step); setSelected(next); }
  }

  function finishPhotoSwipe(_, info) {
    const movement = Math.abs(info.offset.x) > 12 ? info.offset.x : info.velocity.x;
    if (Math.abs(info.offset.x) > 55 || Math.abs(info.velocity.x) > 450) navigatePhoto(movement < 0 ? 1 : -1);
  }

  useEffect(() => {
    trackEvent('client.gallery.opened', { demo: Boolean(demoId), count: resolvedPhotos.length }, { format: delivery?.format || 'photo-story', status: 'opened', count: resolvedPhotos.length });
  }, []);

  useEffect(() => {
    if (selected === null || !activePhoto) return;
    trackEvent('client.photo.opened', { index: selected + 1 }, { format: delivery?.format || 'photo-story', status: 'opened', count: 1 });
    if (activePhoto.caption) trackEvent('client.caption.viewed', { index: selected + 1 }, { format: delivery?.format || 'photo-story', status: 'viewed', count: 1 });
  }, [activePhoto, delivery?.format, selected]);

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape' && selected !== null) { event.preventDefault(); setSelected(null); return; }
      if (selected === null) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); navigatePhoto(event.key === 'ArrowRight' ? 1 : -1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resolvedPhotos.length, selected]);

  const runDownload = (photo, index) => onDownload?.(photoKey(photo, index), index);
  const runLike = (photo, index) => onLike?.(photoKey(photo, index), index);

  return createPortal(<motion.div className="client-gallery-overlay" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
    <motion.section ref={panel} className="client-gallery" style={galleryTheme} role="dialog" aria-modal="true" aria-labelledby="client-gallery-title" tabIndex={-1} initial={reduced ? false : { opacity: 0, y: 24, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }} transition={reduced ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 270 }}>
      <header className="client-gallery-header">
        <div><p>{eyebrow} · {photos.length} {photos.length === 1 ? 'photograph' : 'photographs'}</p><h2 id="client-gallery-title">{selected === null ? title : `Photograph ${selected + 1}`}</h2></div>
        <div className="client-gallery-header-actions">
          {selected === null && allowDownloadAll && onDownloadAll && <button className="client-gallery-download-all" type="button" onClick={onDownloadAll} disabled={Boolean(resolvedBusy)}>{resolvedBusy === 'all' ? <LoaderCircle className="client-gallery-spin" size={16} /> : <Download size={16} />}<span>{resolvedBusy === 'all' && downloadProgress ? `Starting ${downloadProgress.current}/${downloadProgress.total}` : resolvedBusy === 'all' ? 'Starting...' : 'Download all photos'}</span></button>}
          <button className="client-gallery-icon" type="button" onClick={onClose} aria-label="Close gallery"><X size={21} /></button>
        </div>
      </header>
      {isLocked && (
        <div style={{ margin: '12px 24px 0', padding: '10px 16px', background: 'rgba(255, 90, 71, 0.08)', border: '1px solid rgba(255, 90, 71, 0.2)', borderRadius: '6px', fontSize: '13px', color: '#ff9b8e', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{delivery.access?.downloadLockNote || 'Downloads are locked for this delivery. Contact your photographer to unlock.'}</span>
        </div>
      )}
      {downloadNotice && <p className="client-gallery-download-tip" role="status">{downloadNotice}</p>}

      {selected === null ? <div className="client-gallery-grid">{resolvedPhotos.map((photo, index) => {
        const key = photoKey(photo, index);
        const isLiked = liked?.has(key);
        return <motion.figure key={key} data-frame-layout={photo.layout || undefined} data-caption-position={photo.captionPosition || undefined} data-text-background={photo.textBackground || undefined} data-type-style={photo.typographyStyle || undefined} style={photo.colorAccent ? { '--frame-accent': photo.colorAccent } : undefined} initial={reduced ? false : { opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }} transition={{ delay: reduced ? 0 : Math.min(index * .025, .2) }}>
          <button className="client-gallery-photo" type="button" onClick={() => setSelected(index)} aria-label={`Open photograph ${index + 1}`}><Photo name={photo.name} url={photo.thumbnailUrl || photo.url} srcSet={photo.srcSet} alt={photo.alt || photo.caption || `Photograph ${index + 1}`} sizes="(max-width: 640px) 48vw, (max-width: 1024px) 31vw, 24vw" /></button>
          <figcaption data-text-animation={photo.textAnimation || undefined}><span>{String(index + 1).padStart(2, '0')}</span><p>{photo.caption || ''}</p><div>
            {allowLikes && <button className={isLiked ? 'is-liked' : ''} type="button" onClick={() => runLike(photo, index)} aria-label={isLiked ? 'Remove from favourites' : 'Add to favourites'}><Heart size={16} fill={isLiked ? 'currentColor' : 'none'} /></button>}
            {allowIndividualDownloads && <button type="button" onClick={() => runDownload(photo, index)} disabled={resolvedBusy === key || resolvedBusy === 'all'} aria-label={`Download photograph ${index + 1}`}>{resolvedBusy === key ? <LoaderCircle className="client-gallery-spin" size={16} /> : <Download size={16} />}</button>}
          </div></figcaption>
        </motion.figure>;
      })}</div> : <div className="client-gallery-lightbox">
        <div className="client-gallery-lightbox-photo" style={{ backgroundColor: photoTone }}>
          <img className="client-gallery-lightbox-ambient" src={activeImageUrl} alt="" aria-hidden="true" draggable="false" />
          <AnimatePresence mode="wait"><motion.div className="client-gallery-lightbox-frame" key={activeKey} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={.28} dragMomentum={false} onDragEnd={finishPhotoSwipe} initial={reduced ? false : { opacity: 0, x: swipeDirection * 56, scale: .98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, x: -swipeDirection * 56, scale: .98 }} transition={{ duration: reduced ? 0 : .27, ease: [.16, 1, .3, 1] }}><img className="client-gallery-lightbox-main" src={activeImageUrl} alt={activePhoto?.alt || activePhoto?.caption || `Photograph ${selected + 1}`} data-frame-motion={activePhoto?.motion || undefined} data-frame-transition={activePhoto?.transition || undefined} draggable="false" /></motion.div></AnimatePresence>
        </div>
        <p className="client-gallery-lightbox-caption" data-caption-position={activePhoto?.captionPosition || undefined} data-text-background={activePhoto?.textBackground || undefined} data-type-style={activePhoto?.typographyStyle || undefined} style={activePhoto?.colorAccent ? { '--frame-accent': activePhoto.colorAccent } : undefined}>{activePhoto?.caption || ''}</p>
        <div className="client-gallery-lightbox-actions">
          <button className="client-gallery-icon" type="button" onClick={() => navigatePhoto(-1)} disabled={selected === 0} aria-label="Previous photograph"><ChevronLeft size={21} /></button>
          <button className="client-gallery-back" type="button" onClick={() => setSelected(null)}><ArrowLeft size={16} /><span>All photographs</span></button>
          {allowLikes && <button className={`client-gallery-icon ${liked?.has(activeKey) ? 'is-liked' : ''}`} type="button" onClick={() => runLike(activePhoto, selected)} aria-label={liked?.has(activeKey) ? 'Remove from favourites' : 'Add to favourites'}><Heart size={17} fill={liked?.has(activeKey) ? 'currentColor' : 'none'} /></button>}
          {allowIndividualDownloads && <button className="client-gallery-download-one" type="button" onClick={() => runDownload(activePhoto, selected)} disabled={resolvedBusy === activeKey || resolvedBusy === 'all'}>{resolvedBusy === activeKey ? <LoaderCircle className="client-gallery-spin" size={16} /> : <Download size={16} />}<span>{resolvedBusy === activeKey ? 'Preparing…' : 'Download'}</span></button>}
          <button className="client-gallery-icon" type="button" onClick={() => navigatePhoto(1)} disabled={selected === photos.length - 1} aria-label="Next photograph"><ChevronRight size={21} /></button>
        </div>
      </div>}
    </motion.section>
  </motion.div>, document.body);
}
