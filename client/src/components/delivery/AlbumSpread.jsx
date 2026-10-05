import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Images, Maximize2, X } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';
import { useDialogFocus } from '../useDialogFocus.js';
import { albumPhotoKey, albumSpreadPhotos } from '../../utils/albumPresentation.js';

const folio = number => String(number).padStart(2, '0');

function MountedPhoto({ photo, onPhoto, decorative = false }) {
  if (!photo) return null;
  const image = <Photo name={photo.name} url={photo.url} thumbnailUrl={photo.thumbnailUrl} srcSet={photo.srcSet}
    width={photo.width || undefined} height={photo.height || undefined} alt={decorative ? '' : photo.alt || 'Photograph from this album'}
    style={{ backgroundSize: 'contain', backgroundRepeat: 'no-repeat' }}
    eager sizes="(max-width: 767px) 88vw, (max-width: 1024px) 43vw, 620px" />;
  return <figure className="album-mount">{decorative ? <div className="album-photo-button">{image}</div> : <button className="album-photo-button" type="button" onClick={() => onPhoto?.(photo)} aria-label={`Open ${photo.alt || 'photograph'}`}>
    {image}<span className="album-photo-hint"><Maximize2 size={15} />View photo</span>
  </button>}</figure>;
}

function AlbumPaper({ photos, side, index, footer, onPhoto, decorative }) {
  return <article className={`album-paper album-paper-${side}`}>
    <div className={`album-mounts ${photos.length > 1 ? 'is-pair' : ''}`}>{photos.map(photo => <MountedPhoto key={albumPhotoKey(photo)} photo={photo} onPhoto={onPhoto} decorative={decorative} />)}</div>
    <div className="album-folio" aria-hidden="true"><span>{footer || 'Photographs'}</span><b>{folio(index + 1)}</b></div>
  </article>;
}

export default function AlbumSpread({ spread, index, onViewed, onPhoto, isLast = false, decorative = false }) {
  useEffect(() => {
    if (decorative) return;
    const frame = requestAnimationFrame(() => onViewed?.(index));
    return () => cancelAnimationFrame(frame);
  }, [index, onViewed, decorative]);
  const photos = albumSpreadPhotos(spread);
  const paired = photos.length > 1;
  return <section className={`fd-album-spread ${paired ? 'album-facing-spread' : 'album-single-spread'} ${index === 0 ? 'is-opening' : ''} ${isLast ? 'is-finale' : ''}`} data-layout={spread.layout || 'single'} aria-label={decorative ? undefined : `Album page ${index + 1}`}>
    <AlbumPaper photos={paired ? photos.slice(0,1) : photos} side="left" index={paired ? index * 2 : index} footer={spread.footer} onPhoto={onPhoto} decorative={decorative} />
    {paired && <AlbumPaper photos={photos.slice(1)} side="right" index={index * 2 + 1} footer={spread.footer} onPhoto={onPhoto} decorative={decorative} />}
    <i className="fd-album-spine" aria-hidden="true" />
  </section>;
}

export function AlbumCaption({ spread, onGallery, isLast, expanded, onExpand, onClose, fontStyles }) {
  const panel = useRef(null);
  useDialogFocus(expanded, panel, onClose);
  const hasNote = Boolean(spread.title || spread.copy);
  return <>
    <div className="album-note">
      <div className="album-note-copy">{spread.title && <h2>{spread.title}</h2>}{spread.copy && <p>{spread.copy}</p>}</div>
      <div className="album-note-actions">{hasNote && <button type="button" className="album-read-note" onClick={onExpand}>Read note</button>}
        {isLast && onGallery && <button className="album-gallery-link" type="button" onClick={onGallery}><Images size={17} />View full gallery</button>}
      </div>
    </div>
    {expanded && createPortal(<motion.div className="album-note-overlay" style={fontStyles} initial={{ opacity: 0 }} animate={{ opacity: 1 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.section ref={panel} className="album-note-dialog" role="dialog" aria-modal="true" aria-labelledby="album-note-title" tabIndex={-1} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 280 }}>
        <header><span>ALBUM NOTE</span><button type="button" onClick={onClose} aria-label="Close album note"><X size={20} /></button></header>
        <div>{spread.label && <span className="album-eyebrow">{spread.label}</span>}<h2 id="album-note-title">{spread.title || 'About this page'}</h2>{spread.copy && <p>{spread.copy}</p>}</div>
      </motion.section>
    </motion.div>, document.body)}
  </>;
}

// The turning faces use the actual outgoing/incoming layouts, including wide photos.
function PageSnapshot({ page, side, compact }) {
  return <div className={`album-page-snapshot ${compact ? 'snapshot-whole' : `snapshot-${side}`}`}><AlbumSpread spread={page.spread} index={page.index} decorative /></div>;
}
export function AlbumPageTurn({ from, to, direction, compact, onComplete }) {
  const forward = direction > 0;
  const wholePage = albumSpreadPhotos(from.spread).length === 1 || albumSpreadPhotos(to.spread).length === 1;
  const wholeTurn = compact || wholePage;
  const duration = compact ? .6 : .76;
  return <>
    {!wholeTurn && <motion.div className={`album-turn-stationary ${forward ? 'stationary-left' : 'stationary-right'}`} aria-hidden="true" initial={{ opacity: 1 }} animate={{ opacity: [1,1,0] }} transition={{ duration, times: [0,.48,.52] }}><PageSnapshot page={from} side={forward ? 'left' : 'right'} /></motion.div>}
    <motion.div className={`album-turn-leaf ${forward ? 'turn-forward' : 'turn-backward'} ${wholeTurn ? 'turn-whole' : ''}`} aria-hidden="true"
      initial={{ rotateY: 0, opacity: 1 }} animate={{ rotateY: (forward ? -1 : 1) * (compact ? 105 : 180), opacity: compact ? [1,1,0] : 1 }}
      transition={{ duration, ease: [.32,.08,.2,1] }} onAnimationComplete={onComplete}>
      <div className="album-turn-face album-turn-front"><PageSnapshot page={from} side={forward ? 'right' : 'left'} compact={wholeTurn} /></div>
      {!compact && <div className="album-turn-face album-turn-back"><PageSnapshot page={to} side={forward ? 'left' : 'right'} compact={wholePage} /></div>}
    </motion.div>
  </>;
}
