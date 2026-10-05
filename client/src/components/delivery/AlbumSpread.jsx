import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Images, Maximize2 } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';

const folio = number => String(number).padStart(2, '0');

function MountedPhoto({ photo, onPhoto, decorative = false }) {
  if (!photo) return null;
  const image = <Photo name={photo.name} url={photo.url} thumbnailUrl={photo.thumbnailUrl} srcSet={photo.srcSet} alt={decorative ? '' : photo.alt || 'Photograph from this album'} eager sizes="(max-width: 767px) 88vw, (max-width: 1024px) 43vw, 520px" />;
  return <figure className="album-mount">{decorative ? <div className="album-photo-button">{image}</div> : <button className="album-photo-button" type="button" onClick={() => onPhoto?.(photo)} aria-label={`Open ${photo.alt || 'photograph'}`}>
    {image}<span className="album-photo-hint"><Maximize2 size={15} />View photo</span>
  </button>}</figure>;
}

function AlbumNote({ spread, onGallery, isLast, decorative }) {
  return <div className="album-note">
    {spread.label && <span className="album-eyebrow">{spread.label}</span>}
    {spread.title && <h2>{spread.title}</h2>}
    {spread.copy && <p>{spread.copy}</p>}
    {isLast && !decorative && (onGallery ? <button className="album-gallery-link" type="button" onClick={onGallery}><Images size={17} />View full gallery</button> : <p className="album-completion-note">Your full gallery opens after you’ve viewed every page.</p>)}
  </div>;
}

function AlbumLeaf({ spread, index, side, onPhoto, onGallery, isLast, decorative }) {
  const photos = spread.photos || [spread.photo1, spread.photo2].filter(Boolean);
  const leafPhotos = side === 'left' ? photos.slice(0, 1) : photos.slice(1);
  return <article className={`album-paper album-paper-${side} ${leafPhotos.length ? 'has-photo' : 'is-note-page'}`}>
    {leafPhotos.length > 0 && <div className={`album-mounts ${leafPhotos.length > 1 ? 'is-pair' : ''}`}>{leafPhotos.map((photo, at) => <MountedPhoto key={photo.assetId || photo.name || at} photo={photo} onPhoto={onPhoto} decorative={decorative} />)}</div>}
    {side === 'right' && <AlbumNote spread={spread} onGallery={onGallery} isLast={isLast} decorative={decorative} />}
    <div className="album-folio" aria-hidden="true"><span>{side === 'left' ? spread.footer || 'Photographs' : 'Album'}</span><b><span className="album-mobile-only">{folio(index + 1)}</span><span className="album-desktop-only">{folio(index * 2 + (side === 'left' ? 1 : 2))}</span></b></div>
  </article>;
}

export default function AlbumSpread({ spread, index, onGallery, onViewed, onPhoto, isLast = false }) {
  useEffect(() => { const frame = requestAnimationFrame(() => onViewed?.(index)); return () => cancelAnimationFrame(frame); }, [index, onViewed]);
  const layout = spread.layout || 'single';
  if (layout === 'wide') return <section className={`fd-album-spread album-wide-spread ${index === 0 ? 'is-opening' : ''} ${isLast ? 'is-finale' : ''}`} data-layout={layout} aria-label={`Album page ${index + 1}`}>
    <article className="album-paper album-wide-paper"><div className="album-mounts"><MountedPhoto photo={spread.photo1} onPhoto={onPhoto} /></div><AlbumNote spread={spread} onGallery={onGallery} isLast={isLast} /><div className="album-folio" aria-hidden="true"><span>{spread.footer || 'Photographs'}</span><b>{folio(index * 2 + 1)} / {folio(index * 2 + 2)}</b></div></article>
    <i className="fd-album-spine" aria-hidden="true" />
  </section>;
  return <section className={`fd-album-spread ${index === 0 ? 'is-opening' : ''} ${isLast ? 'is-finale' : ''}`} data-layout={layout} aria-label={`Album page ${index + 1}`}>
    <AlbumLeaf spread={spread} index={index} side="left" onPhoto={onPhoto} />
    <AlbumLeaf spread={spread} index={index} side="right" onPhoto={onPhoto} onGallery={onGallery} isLast={isLast} />
    <i className="fd-album-spine" aria-hidden="true" />
  </section>;
}

// Both faces turn together around the binding. This visual copy has no controls.
export function AlbumPageTurn({ from, to, direction, onComplete }) {
  const forward = direction > 0;
  return <><motion.div className={`album-turn-stationary ${forward ? 'stationary-left' : 'stationary-right'}`} aria-hidden="true" initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }} transition={{ duration: .76, times: [0, .48, .52] }}><AlbumLeaf spread={from.spread} index={from.index} side={forward ? 'left' : 'right'} decorative /></motion.div><motion.div className={`album-turn-leaf ${forward ? 'turn-forward' : 'turn-backward'}`} aria-hidden="true"
    initial={{ rotateY: 0 }} animate={{ rotateY: forward ? -180 : 180 }}
    transition={{ duration: .76, ease: [.32, .08, .2, 1] }} onAnimationComplete={onComplete}>
    <div className="album-turn-face album-turn-front"><AlbumLeaf spread={from.spread} index={from.index} side={forward ? 'right' : 'left'} decorative /></div>
    <div className="album-turn-face album-turn-back"><AlbumLeaf spread={to.spread} index={to.index} side={forward ? 'left' : 'right'} decorative /></div>
  </motion.div></>;
}
