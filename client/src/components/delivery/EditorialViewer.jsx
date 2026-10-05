import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { ArrowUpRight, List, Monitor, Pause, Play, RotateCcw, Smartphone, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useDialogFocus } from '../useDialogFocus.js';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import ClientGallery from './ClientGallery.jsx';
import EditorialArtwork, { editorialArtworkKind } from './EditorialArtwork.jsx';
import { editorialFromDelivery, editorialPhotos, editorialReadingSections, editorialTheme } from '../../utils/editorial.js';
import { useClosingGallery } from '../../utils/useClosingGallery.js';
import './EditorialViewer.css';

const number = value => String(value).padStart(2, '0');
const ease = [.22, 1, .36, 1];

function EditorialImage({ photo, index, onOpen, eager = false, cover = false, showCaption = !cover, nextPhoto, slant = 2.2, delay = 0, motionPaused = false }) {
  const reduced = useVeyloReducedMotion();
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const currentSource = useRef(photo?.url);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const photoStill = photo?.motion === 'still';
  const animated = !reduced && !motionPaused && !photoStill;
  const side = slant < 0 ? 1 : -1;
  const depth = useTransform(scrollYProgress, [0, 1], [-10 * side, 10 * side]);
  const y = useSpring(depth, { stiffness: 100, damping: 30, mass: .7 });
  useEffect(() => { currentSource.current = photo?.url; setReady(false); setFailed(false); }, [photo?.url]);
  useEffect(() => {
    if (!ref.current || !nextPhoto?.url || !('IntersectionObserver' in window)) return undefined;
    let pending;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      pending = new window.Image();
      if (nextPhoto.srcSet) pending.srcset = nextPhoto.srcSet;
      pending.sizes = '(max-width: 767px) 92vw, (max-width: 1024px) 46vw, 560px';
      pending.src = nextPhoto.url;
      pending.decode?.().catch(() => {});
      observer.disconnect();
    }, { rootMargin: '100% 0px' });
    observer.observe(ref.current);
    return () => { observer.disconnect(); if (pending) { pending.onload = null; pending.onerror = null; } };
  }, [nextPhoto?.url, nextPhoto?.srcSet]);
  if (!photo) return null;
  const ratio = photo.width && photo.height ? Math.max(.55, Math.min(2.2, photo.width / photo.height)) : 2 / 3;
  const fit = photo.imageFit || 'contain';
  return <motion.figure ref={ref} className={`ed-photo ${cover ? 'is-cover' : ''}`} data-asset-id={photo.assetId} data-orientation={ratio > 1.1 ? 'landscape' : 'portrait'} data-photo-motion={photoStill ? 'still' : animated ? 'active' : 'paused'} style={{ '--ed-photo-slant': `${slant}deg` }} initial={animated ? { opacity: 0, x: side * 24, y: 28 } : false} whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: animated ? .7 : 0, delay: animated ? delay : 0, ease }}>
    <div className="ed-photo-art">
    <motion.div className="ed-photo-depth" style={{ y: animated ? y : 0 }}>
    <div className="ed-photo-mount">
    <motion.div className="ed-photo-arrival" initial={animated ? { rotate: -slant * 1.3 } : false} whileInView={{ rotate: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: animated ? .85 : 0, delay: animated ? delay : 0, ease }}>
    <div className="ed-photo-frame">
    <div className="ed-image-wrap" style={{ aspectRatio: fit === 'cover' ? ratio > 1 ? 1.5 : .8 : ratio }}>
      <button type="button" className="ed-image-button" onClick={() => onOpen(photo.assetId)} aria-label={`View photograph ${index + 1}`}>
        <img className="ed-image-thumbnail" src={photo.thumbnailUrl || photo.url} alt="" aria-hidden="true" loading={eager ? 'eager' : 'lazy'} style={{ objectFit: fit, objectPosition: photo.focalPoint || '50% 50%' }} />
        <motion.img key={`${photo.url}-${attempt}`} className="ed-image-main" src={photo.url} srcSet={photo.srcSet} sizes={cover ? '(max-width: 767px) 92vw, 48vw' : '(max-width: 767px) 92vw, (max-width: 1024px) 46vw, 680px'} alt={photo.alt} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" animate={{ opacity: ready ? 1 : 0 }} transition={{ duration: animated ? .55 : 0, ease }} style={{ objectFit: fit, objectPosition: photo.focalPoint || '50% 50%' }} onLoad={async event => { const img = event.currentTarget; const source = photo.url; try { await img.decode(); } catch { /* A loaded image can still be displayed. */ } if (currentSource.current === source) setReady(true); }} onError={() => setFailed(true)} />
        <span className="ed-image-open" aria-hidden="true"><ArrowUpRight size={20} /></span>
      </button>
      {failed && <button type="button" className="ed-image-retry" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}><RotateCcw size={16} />Retry photograph</button>}
    </div>
    </div>
    </motion.div>
    </div>
    </motion.div>
    </div>
    {showCaption && <figcaption><span className="ed-photo-number">{number(index + 1)}</span><div>{photo.headline && <strong>{photo.headline}</strong>}{photo.caption && <p>{photo.caption}</p>}</div></figcaption>}
  </motion.figure>;
}

function Contents({ items, active, theme, onClose, onChoose, motionPaused, onToggleMotion }) {
  const reduced = useVeyloReducedMotion();
  const ref = useRef(null);
  useDialogFocus(true, ref, onClose);
  return createPortal(<motion.div className="ed-contents-backdrop" style={theme} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section ref={ref} role="dialog" aria-modal="true" aria-labelledby="ed-contents-title" tabIndex={-1} className="ed-contents-dialog" initial={reduced ? false : { x: 48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={reduced ? { opacity: 0 } : { x: 48, opacity: 0 }} transition={reduced ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 280 }}>
      <header><div><span>THE FEATURE</span><h2 id="ed-contents-title">Contents</h2></div><button type="button" onClick={onClose} aria-label="Close contents"><X size={22} /></button></header>
      <div className="ed-motion-control"><button type="button" aria-pressed={motionPaused} onClick={onToggleMotion}>{motionPaused ? <Play size={18} /> : <Pause size={18} />}{motionPaused ? 'Resume photo motion' : 'Pause photo motion'}</button><p>{motionPaused ? 'Photo motion is paused.' : 'Photos move gently as you scroll.'}</p></div>
      <nav aria-label="Editorial contents">{items.map((item, index) => <button type="button" key={item.id} aria-current={active === item.id ? 'location' : undefined} onClick={() => onChoose(item.id)}><span>{number(index + 1)}</span><strong>{item.title}</strong><ArrowUpRight size={18} /></button>)}</nav>
      <p>Take your time with the photographs.</p>
    </motion.section>
  </motion.div>, document.body);
}

export default function EditorialViewer({ delivery, galleryProps = {}, demo = false }) {
  const reduced = useVeyloReducedMotion();
  const location = useLocation();
  const navigate = useNavigate();
  const embeddedPhone = new URLSearchParams(location.search).get('phoneView') === '1';
  const [gallery, setGallery] = useState(null);
  const [contents, setContents] = useState(false);
  const [active, setActive] = useState('editorial-cover');
  const [demoLikes, setDemoLikes] = useState(new Set());
  const [motionPaused, setMotionPaused] = useState(() => { try { return sessionStorage.getItem('veylo:editorial-photo-motion') === 'paused'; } catch { return false; } });
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  useEffect(() => { try { sessionStorage.setItem('veylo:editorial-photo-motion', motionPaused ? 'paused' : 'playing'); } catch { /* The control also works when storage is unavailable. */ } }, [motionPaused]);
  useEffect(() => { const update = () => setPageVisible(!document.hidden); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);
  const pausePhotos = motionPaused || !pageVisible;
  const artworkKind = editorialArtworkKind(delivery.shootType);
  const readingPosition = useRef(0);
  const { scrollYProgress } = useScroll();
  const theme = useMemo(() => editorialTheme(delivery), [delivery]);
  const editorial = useMemo(() => editorialFromDelivery(delivery), [delivery]);
  const photos = useMemo(() => editorialPhotos(delivery), [delivery]);
  const allPhotos = useMemo(() => editorialPhotos(delivery, true), [delivery]);
  const byId = useMemo(() => new Map(allPhotos.map(photo => [photo.assetId, photo])), [allPhotos]);
  const order = useMemo(() => new Map(photos.map((photo, index) => [photo.assetId, index])), [photos]);
  const direction = delivery.creativeDirection || {};
  const cover = byId.get(delivery.v3?.openingAssetId) || photos[0];
  const closing = byId.get(delivery.v3?.closingAssetId) || photos.at(-1);
  const sections = useMemo(() => editorialReadingSections(editorial.sections, photos.map(photo => photo.assetId), [cover?.assetId, closing?.assetId]), [editorial, photos, cover?.assetId, closing?.assetId]);
  const featurePhotos = useMemo(() => sections.flatMap(section => section.assetIds.map(id => byId.get(id))), [sections, byId]);
  const showClosingPhoto = closing && closing.assetId !== cover?.assetId;
  const { galleryUnlocked, closingRef } = useClosingGallery(`${delivery.publicId || delivery._id || 'editorial-demo'}:${photos.map(photo => photo.assetId).join('|')}`);
  const title = direction.title || delivery.title || 'Your photographs';
  const titleBreak = title.lastIndexOf(' ');
  const titleSize = title.length > 45 ? 'long' : title.length > 24 ? 'medium' : 'short';
  const items = useMemo(() => [{ id: 'editorial-cover', title: 'Cover' }, ...sections.map(section => ({ id: `ed-${section.id}`, title: section.title || 'Selected photographs' })), ...(editorial.note || editorial.credits.length ? [{ id: 'editorial-notes', title: 'Notes and credits' }] : []), { id: 'editorial-close', title: 'The full collection' }], [editorial, sections]);
  const reveal = delay => reduced ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .15 }, transition: { duration: .55, delay: delay || 0, ease } };
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); }), { rootMargin: '-90px 0px -55% 0px', threshold: 0 });
    items.forEach(item => { const element = document.getElementById(item.id); if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, [items]);
  useEffect(() => {
    const id = location.hash.slice(1);
    if (items.some(item => item.id === id)) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, [location.hash, items]);
  const goTo = id => {
    setContents(false); setActive(id);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }));
  };
  const openGallery = index => { if (index === null && !galleryUnlocked) return; readingPosition.current = window.scrollY; setGallery({ index }); };
  const openPhoto = id => { const index = allPhotos.findIndex(photo => photo.assetId === id); if (index >= 0) openGallery(index); };
  const inPreview = location.pathname === '/__phone-preview';
  let hostWindow = window;
  try { if (window.parent.location.origin === window.location.origin) hostWindow = window.parent; } catch { /* External embeds keep navigation inside this delivery. */ }
  const parentDesktop = hostWindow !== window && hostWindow.innerWidth >= 1025;
  const wide = new URLSearchParams(location.search).get('publicationView') === 'editorial';
  function toggleReadingView() {
    const url = new URL(hostWindow.location.href);
    if (wide) { url.searchParams.delete('publicationView'); url.searchParams.delete('phoneView'); }
    else { url.searchParams.set('publicationView', 'editorial'); url.searchParams.delete('phoneView'); }
    url.hash = active;
    if (hostWindow !== window) hostWindow.location.assign(url.href);
    else navigate(url.pathname + url.search + url.hash);
  }
  const demoGalleryProps = demo ? { demoId: 'ada', liked: demoLikes, onLike: id => setDemoLikes(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }), onDownload: () => toast.info('This is a sample. Photo downloads are available on published client deliveries.'), onDownloadAll: () => toast.info('This is a sample. Photo downloads are available on published client deliveries.') } : {};
  return <div className="fd-page fd-editorial ed-publication" style={theme} data-treatment={editorial.treatment} data-motion-paused={motionPaused}>
    <header className="ed-nav">
      <div className="ed-brand"><DeliveryBrandMark branding={delivery.branding} /><div><span>Photographed by</span><strong>{delivery.branding?.name || 'Your photographer'}</strong></div></div>
      <div className="ed-nav-title"><span>EDITORIAL</span><strong>{delivery.clientName || title}</strong></div>
      <nav aria-label="Publication controls">
        {!inPreview && (parentDesktop || wide) && <button type="button" className="ed-reader-switch" onClick={toggleReadingView} aria-label={wide ? 'Show phone view' : 'Read Editorial at full width'}>{wide ? <Smartphone size={19} /> : <Monitor size={19} />}<span>{wide ? 'Phone view' : 'Read Editorial'}</span></button>}
        <button type="button" onClick={() => setContents(true)} aria-label="Open contents"><List size={20} /><span>Contents</span></button>
      </nav>
    </header>
    <motion.div className="ed-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
    <main>
      <section id="editorial-cover" className="fd-ed-cover ed-cover" data-title-size={titleSize}>
        <motion.div className="ed-masthead" {...reveal()}><span>A PHOTOGRAPHIC FEATURE</span>{editorial.issue && <span>{editorial.issue}</span>}</motion.div>
        <div className="ed-cover-grid">
          <div className="ed-cover-copy"><motion.p className="ed-eyebrow" {...reveal(.06)}>{delivery.shootType || 'The finished photographs'}</motion.p><motion.h1 {...reveal(.12)}>{titleBreak > 0 ? <>{title.slice(0, titleBreak)} <em>{title.slice(titleBreak + 1)}</em></> : title}</motion.h1><div className="ed-cover-note"><motion.p className="ed-deck" {...reveal(.2)}>{direction.openingLine}</motion.p><EditorialArtwork kind={artworkKind} className="ed-cover-illustration" paused={pausePhotos} /></div></div>
          <div className="ed-cover-art"><EditorialImage photo={cover} index={order.get(cover?.assetId) ?? 0} onOpen={openPhoto} eager cover showCaption slant={-2.6} motionPaused={pausePhotos} nextPhoto={featurePhotos[0] || (showClosingPhoto ? closing : undefined)} /></div>
        </div>
        <motion.div className="ed-cover-footer" {...reveal(.25)}><span>{number(photos.length)} selected photographs</span></motion.div>
      </section>
      {editorial.introduction && <motion.section className="ed-introduction" {...reveal()}><span className="ed-eyebrow">ABOUT THE FEATURE</span><p>{editorial.introduction}</p></motion.section>}
      {sections.map((section, sectionIndex) => {
        const sectionPhotos = section.assetIds.map(id => byId.get(id)).filter(Boolean);
        const layout = sectionPhotos.length === 1 ? sectionPhotos[0].width > sectionPhotos[0].height ? 'wide' : 'hero' : section.layout === 'auto' || (section.layout === 'triptych' && sectionPhotos.length !== 3) ? sectionPhotos.length === 3 ? 'triptych' : 'pair' : section.layout;
        const pullLine = section.pullLine && [section.body, ...sectionPhotos.map(photo => photo.caption || '')].some(text => text.replace(/\s+/g, ' ').includes(section.pullLine.replace(/\s+/g, ' '))) ? section.pullLine : '';
        return <section key={section.id} id={`ed-${section.id}`} className="fd-ed-spread ed-section" data-section-layout={layout} data-flow={sectionIndex % 2 ? 'image-right' : 'image-left'}>
          <div className="ed-section-copy">
          <motion.header className="ed-section-heading" {...reveal()}><div><span className="ed-eyebrow">{number(sectionIndex + 1)} / THE FEATURE</span><h2>{section.title || sectionPhotos[0]?.headline || 'Selected photographs'}</h2></div>{section.body && <p>{section.body}</p>}</motion.header>
          {pullLine && <motion.aside className="ed-pull-line" {...reveal(.05)}>{pullLine}</motion.aside>}
          {section.mergedCopy.map(copy => <motion.div key={copy.id} className="ed-merged-copy" {...reveal()}>{copy.title && <h3>{copy.title}</h3>}<p>{copy.body}</p></motion.div>)}
          <EditorialArtwork kind={artworkKind} className={`ed-section-illustration ${sectionIndex % 2 ? 'is-reversed' : ''}`} paused={pausePhotos} />
          </div>
          {sectionPhotos.length > 0 && <div className="ed-section-grid" data-layout={layout}>{sectionPhotos.map((photo, photoIndex) => <EditorialImage key={photo.assetId} photo={photo} index={order.get(photo.assetId) ?? 0} onOpen={openPhoto} slant={photoIndex % 2 ? 2.8 : -2.3} delay={(photoIndex % 3) * .12} motionPaused={pausePhotos} nextPhoto={featurePhotos[featurePhotos.indexOf(photo) + 1] || (showClosingPhoto ? closing : undefined)} />)}</div>}
        </section>;
      })}
      {(editorial.note || editorial.credits.length > 0) && <motion.section id="editorial-notes" className="ed-notes" {...reveal()}>{editorial.note && <div><span className="ed-eyebrow">FROM THE PHOTOGRAPHER</span><h2>A note from {delivery.branding?.name || 'your photographer'}</h2><p>{editorial.note}</p></div>}{editorial.credits.length > 0 && <div className="ed-credits"><span className="ed-eyebrow">CREDITS</span><dl>{editorial.credits.map((credit, index) => <div key={index}><dt>{credit.role}</dt><dd>{credit.name}</dd></div>)}</dl></div>}</motion.section>}
      <section ref={closingRef} id="editorial-close" className="ed-closing"><div className={`ed-closing-grid${showClosingPhoto ? '' : ' is-text-only'}`}>{showClosingPhoto && <EditorialImage photo={closing} index={order.get(closing?.assetId) ?? photos.length - 1} onOpen={openPhoto} cover showCaption slant={2.4} motionPaused={pausePhotos} />}<motion.div className="ed-closing-copy" {...reveal()}><h2>The last page.<em>Your full collection.</em></h2><EditorialArtwork kind={artworkKind} className="ed-closing-illustration" paused={pausePhotos} /><p>{direction.closingLine}</p><button type="button" className="ed-gallery-cta" disabled={!galleryUnlocked} onClick={() => openGallery(null)}>View full gallery<ArrowUpRight size={20} /></button></motion.div></div><footer><span>{delivery.branding?.name || 'Your photographer'}</span>{demo && !embeddedPhone && <Link to={location.state?.returnTo || (new URLSearchParams(location.search).get('from') === 'formats' ? '/formats#editorial-page' : '/#editorial-page')}>Leave the demo</Link>}<button type="button" onClick={() => goTo('editorial-cover')}>Back to the cover<ArrowUpRight size={16} /></button></footer></section>
    </main>
    <AnimatePresence>{contents && <Contents items={items} active={active} theme={theme} onClose={() => setContents(false)} onChoose={goTo} motionPaused={motionPaused} onToggleMotion={() => setMotionPaused(value => !value)} />}</AnimatePresence>
    <AnimatePresence onExitComplete={() => window.scrollTo({ top: readingPosition.current, behavior: 'instant' })}>{gallery && <ClientGallery photos={allPhotos} title={delivery.clientName || title} initialIndex={gallery.index} onClose={() => setGallery(null)} delivery={delivery} fontStyles={theme} {...demoGalleryProps} {...galleryProps} singlePhoto={!galleryUnlocked} />}</AnimatePresence>
  </div>;
}
