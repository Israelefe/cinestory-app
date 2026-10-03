import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../useDialogFocus.js';
import { presentationSections, presentationSettings, numberLabel } from '../../utils/deliveryPresentation.js';
import { Photo } from '../PublicDesign.jsx';
import { CollectionGallery, Arrival, ImageWaiting, PhotoCard, PresentationEnding, PresentationShell, usePresentation, useReadyPhotos } from './PresentationShell.jsx';
import './CollectionViewers.css';

import './CanvasViewer.css';
function CanvasFocus({ context, delivery, index, onSelect, onClose }) {
  const panel = useRef(null), reduced = useReducedMotion();
  useDialogFocus(true, panel, onClose);
  const photo = context.photos[index];
  const ready = useReadyPhotos([photo], [context.photos[index + 1], context.photos[index - 1]]);
  useEffect(() => { const key = event => { if (event.target.closest('input,textarea,select')) return; if (event.key === 'ArrowRight' && index < context.photos.length - 1) onSelect(index + 1); if (event.key === 'ArrowLeft' && index > 0) onSelect(index - 1); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [index, onSelect, context.photos.length]);
  const shown = ready.photos[0] || { ...photo, url: photo.thumbnailUrl || photo.url };
  return createPortal(<div className="pv-focus-backdrop" style={context.theme}><motion.section role="dialog" aria-modal="true" aria-label="Photograph focus" ref={panel} className="pv-focus" initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : 10 }} transition={{ duration: reduced ? 0 : .2 }}>
    <header><span>{numberLabel(index + 1)} / {numberLabel(context.photos.length)}</span><button onClick={onClose} aria-label="Close photograph"><X /></button></header>
    <div className="pv-focus-image" aria-busy={!ready.ready}>{shown && <Photo key={shown.assetId} url={shown.url} alt={shown.alt} eager />}<ImageWaiting state={ready} /></div>
    <p>{shown?.caption}</p><nav><button disabled={index === 0} onClick={() => onSelect(index - 1)}><ChevronLeft />Previous</button><button onClick={() => context.galleryProps.onLike?.(photo.assetId)} disabled={!ready.ready || !delivery.access?.allowLikes || !context.galleryProps.onLike}>{context.galleryProps.liked?.has(photo.assetId) ? 'Favourited' : 'Favourite'}</button><button disabled={index === context.photos.length - 1} onClick={() => onSelect(index + 1)}>Next<ChevronRight /></button></nav>
    <div className="pv-focus-strip">{context.photos.map((item, at) => <button key={item.assetId} aria-label={`Photograph ${at + 1}`} aria-current={at === index ? 'true' : undefined} onClick={() => onSelect(at)}><Photo url={item.thumbnailUrl || item.url} alt="" /><span>{numberLabel(at + 1)}</span></button>)}</div>
  </motion.section></div>, document.body);
}
export function CanvasViewer({ delivery = {}, galleryProps, demo = false }) {
  const context = usePresentation(delivery, galleryProps, demo), [gallery, setGallery] = useState(null), [focus, setFocus] = useState(null);
  const settings = presentationSettings(delivery, context.photos.map(photo => photo.assetId));
  const sections = presentationSections(delivery, context.photos.map(photo => photo.assetId));
  return <PresentationShell delivery={delivery} format="Canvas" theme={context.theme} onGallery={() => setGallery('all')} className="pv-canvas">
    <main className="pv-main"><Arrival className="pv-intro"><span className="pv-eyebrow">CANVAS / {numberLabel(context.photos.length)} SHOWCASE PHOTOS</span><h1>{delivery.title}</h1><p>{delivery.creativeDirection?.openingLine}</p><small>{context.all.length} photographs in the full collection</small><a className="pv-primary" href="#canvas-groups">Explore the canvas<ArrowRight size={18} /></a></Arrival>
      <nav className="pv-rail" id="canvas-groups" aria-label="Photo groups"><a href="#canvas-groups">All groups</a>{sections.map((section, index) => <a href={`#canvas-${section.id}`} key={section.id}>{numberLabel(index + 1)}<span>{section.title}</span></a>)}</nav>
      {sections.map((section, index) => <section id={`canvas-${section.id}`} className={`pv-canvas-group arrangement-${settings.arrangement} layout-${section.layout}`} key={section.id}><Arrival className="pv-section-heading"><span>{numberLabel(index + 1)}</span><div><h2>{section.title}</h2>{settings.showGroupNotes && section.body && <p>{section.body}</p>}</div></Arrival><div className="pv-canvas-wall">{[section.coverAssetId, ...section.assetIds.filter(id => id !== section.coverAssetId)].filter(Boolean).map((id, at) => { const photoIndex = context.photos.findIndex(photo => photo.assetId === id); return <Arrival key={id} index={at} className={`pv-canvas-tile ${at === 0 ? 'is-lead' : ''}`}><PhotoCard compactCaption photo={context.photos[photoIndex]} index={photoIndex} onOpen={() => setFocus(photoIndex)} eager={index === 0}  /></Arrival>; })}</div></section>)}
      <PresentationEnding delivery={delivery} photo={context.closing} onGallery={() => setGallery('all')} />
    </main><AnimatePresence>{focus !== null && <CanvasFocus context={context} delivery={delivery} index={focus} onSelect={setFocus} onClose={() => setFocus(null)} />}</AnimatePresence>{gallery && <CollectionGallery context={context} delivery={delivery} selection={gallery} onClose={() => setGallery(null)} />}
  </PresentationShell>;
}

export default CanvasViewer;
