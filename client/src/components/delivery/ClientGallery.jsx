import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Heart, LoaderCircle, X } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';
import { useDialogFocus } from '../useDialogFocus.js';
import './ClientGallery.css';

const photoKey = (photo, index) => photo?.assetId || photo?.id || photo?.name || index;
const imageUrl = (photo, width = 1440) => photo?.url || (typeof photo === 'string' && (photo.startsWith('http') || photo.startsWith('/')) ? photo : `/veylo/web/${photo?.name || photo}-${width}.webp`);

export default function ClientGallery({ photos = [], title = 'Your photographs', eyebrow = 'The complete collection', onClose, initialIndex = null, liked, onLike, onDownload, onDownloadAll, busy, downloading = null, allDownloading = false, delivery, demoId }) {
  const reduced = useReducedMotion();
  const panel = useRef(null);
  const [selected, setSelected] = useState(initialIndex);
  useDialogFocus(true, panel, onClose);

  const allowDownloadAll = delivery ? delivery.access?.allowDownloadAll !== false : Boolean(onDownloadAll);
  const allowIndividualDownloads = delivery ? delivery.access?.allowIndividualDownloads !== false : Boolean(onDownload);
  const allowLikes = delivery ? Boolean(delivery.access?.allowLikes && onLike) : Boolean(onLike);
  const resolvedPhotos = useMemo(() => photos.map((photo, index) => demoId ? { ...photo, name: `demo-${demoId}-${index + 1}`, url: `/veylo/web/demo-${demoId}-${index + 1}-1440.webp`, thumbnailUrl: `/veylo/web/demo-${demoId}-${index + 1}-480.webp` } : photo), [photos, demoId]);
  const activePhoto = selected === null ? null : resolvedPhotos[selected];
  const activeKey = selected === null ? null : photoKey(activePhoto, selected);
  const resolvedBusy = busy ?? (allDownloading ? 'all' : downloading === null ? null : photoKey(resolvedPhotos[downloading], downloading));

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape' && selected !== null) { event.preventDefault(); setSelected(null); return; }
      if (selected === null) return;
      if (event.key === 'ArrowLeft') setSelected(value => Math.max(0, value - 1));
      if (event.key === 'ArrowRight') setSelected(value => Math.min(photos.length - 1, value + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, selected]);

  const runDownload = (photo, index) => onDownload?.(photoKey(photo, index), index);
  const runLike = (photo, index) => onLike?.(photoKey(photo, index), index);

  return <motion.div className="client-gallery-overlay" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
    <motion.section ref={panel} className="client-gallery" role="dialog" aria-modal="true" aria-labelledby="client-gallery-title" tabIndex={-1} initial={reduced ? false : { opacity: 0, y: 24, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }} transition={reduced ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 270 }}>
      <header className="client-gallery-header">
        <div><p>{eyebrow} · {photos.length} {photos.length === 1 ? 'photograph' : 'photographs'}</p><h2 id="client-gallery-title">{selected === null ? title : `Photograph ${selected + 1}`}</h2></div>
        <div className="client-gallery-header-actions">
          {selected === null && allowDownloadAll && onDownloadAll && <button className="client-gallery-download-all" type="button" onClick={onDownloadAll} disabled={Boolean(resolvedBusy)}>{resolvedBusy === 'all' ? <LoaderCircle className="client-gallery-spin" size={16} /> : <Download size={16} />}<span>{resolvedBusy === 'all' ? 'Preparing…' : 'Download all'}</span></button>}
          <button className="client-gallery-icon" type="button" onClick={onClose} aria-label="Close gallery"><X size={21} /></button>
        </div>
      </header>

      {selected === null ? <div className="client-gallery-grid">{resolvedPhotos.map((photo, index) => {
        const key = photoKey(photo, index);
        const isLiked = liked?.has(key);
        return <motion.figure key={key} initial={reduced ? false : { opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }} transition={{ delay: reduced ? 0 : Math.min(index * .025, .2) }}>
          <button className="client-gallery-photo" type="button" onClick={() => setSelected(index)} aria-label={`Open photograph ${index + 1}`}><Photo name={photo.name} url={photo.thumbnailUrl || photo.url} srcSet={photo.srcSet} alt={photo.alt || photo.caption || `Photograph ${index + 1}`} sizes="(max-width: 640px) 48vw, (max-width: 1024px) 31vw, 24vw" /></button>
          <figcaption><span>{String(index + 1).padStart(2, '0')}</span><p>{photo.caption || `A finished moment from ${title}.`}</p><div>
            {allowLikes && <button className={isLiked ? 'is-liked' : ''} type="button" onClick={() => runLike(photo, index)} aria-label={isLiked ? 'Remove from favourites' : 'Add to favourites'}><Heart size={16} fill={isLiked ? 'currentColor' : 'none'} /></button>}
            {allowIndividualDownloads && <button type="button" onClick={() => runDownload(photo, index)} disabled={resolvedBusy === key || resolvedBusy === 'all'} aria-label={`Download photograph ${index + 1}`}>{resolvedBusy === key ? <LoaderCircle className="client-gallery-spin" size={16} /> : <Download size={16} />}</button>}
          </div></figcaption>
        </motion.figure>;
      })}</div> : <div className="client-gallery-lightbox">
        <AnimatePresence mode="wait"><motion.img key={activeKey} src={imageUrl(activePhoto)} alt={activePhoto?.alt || activePhoto?.caption || `Photograph ${selected + 1}`} initial={reduced ? false : { opacity: 0, scale: .99 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .24 }} /></AnimatePresence>
        <div className="client-gallery-lightbox-actions">
          <button className="client-gallery-icon" type="button" onClick={() => setSelected(value => Math.max(0, value - 1))} disabled={selected === 0} aria-label="Previous photograph"><ChevronLeft size={21} /></button>
          <button className="client-gallery-back" type="button" onClick={() => setSelected(null)}><ArrowLeft size={16} /><span>All photographs</span></button>
          {allowLikes && <button className={`client-gallery-icon ${liked?.has(activeKey) ? 'is-liked' : ''}`} type="button" onClick={() => runLike(activePhoto, selected)} aria-label={liked?.has(activeKey) ? 'Remove from favourites' : 'Add to favourites'}><Heart size={17} fill={liked?.has(activeKey) ? 'currentColor' : 'none'} /></button>}
          {allowIndividualDownloads && <button className="client-gallery-download-one" type="button" onClick={() => runDownload(activePhoto, selected)} disabled={resolvedBusy === activeKey || resolvedBusy === 'all'}>{resolvedBusy === activeKey ? <LoaderCircle className="client-gallery-spin" size={16} /> : <Download size={16} />}<span>{resolvedBusy === activeKey ? 'Preparing…' : 'Download'}</span></button>}
          <button className="client-gallery-icon" type="button" onClick={() => setSelected(value => Math.min(photos.length - 1, value + 1))} disabled={selected === photos.length - 1} aria-label="Next photograph"><ChevronRight size={21} /></button>
        </div>
      </div>}
    </motion.section>
  </motion.div>;
}
