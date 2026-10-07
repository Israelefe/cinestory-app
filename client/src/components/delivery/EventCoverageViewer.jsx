import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useInView } from 'framer-motion';
import { ArrowDown, ArrowRight, ChevronDown, Images, Maximize2, Pause, Play, SlidersHorizontal } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';
import { DELIVERY_DEMO_DIMENSIONS } from '../../constants/deliveryDemoMetadata.js';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { useClosingGallery } from '../../utils/useClosingGallery.js';
import { eventCoveragePresentation, eventPhotoKey, eventSceneAnchor } from '../../utils/eventCoveragePresentation.js';
import { DemoGallery, DemoHeader, eventCoveragePhotos, formatFrameAttributes, formatFrameStyle, frameMotionTransition, frameMotionValues, getFormatThemeStyles, normalizeDeliveryPhotos } from '../../pages/FormatDemo.jsx';
import './EventCoverageViewer.css';

const ease = [.22, 1, .36, 1];
const reveal = {
  initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: .12 }, transition: { duration: .6, ease }
};
const filters = [['all', 'All moments'], ['people', 'People'], ['programme', 'Programme'], ['networking', 'Networking'], ['details', 'Details']];

function PhotoMotion({ photo, index, paused, children }) {
  const ref = useRef(null);
  const visible = useInView(ref);
  const controls = useAnimationControls();
  const reduced = useVeyloReducedMotion();
  const motionName = photo.motion;
  useEffect(() => {
    if (reduced || motionName === 'still') controls.set({ scale: 1, x: 0, y: 0 });
    else if (visible && !paused) controls.start({ ...frameMotionValues({ motion: motionName }), transition: frameMotionTransition({ motion: motionName }, index) });
    else controls.stop();
    return () => controls.stop();
  }, [controls, visible, paused, reduced, motionName, index]);
  return <motion.div ref={ref} className="ec-photo-motion" initial={false} animate={controls}>{children}</motion.div>;
}

function PhotoCard({ photo, index = 0, paused, onOpen, label, eager = false, className = '', showCaption = true, sizes }) {
  const [loadedDimensions, setLoadedDimensions] = useState(null);
  if (!photo) return null;
  const dimensions = photo.width && photo.height ? photo : DELIVERY_DEMO_DIMENSIONS[photo.name] || {};
  const hasDimensions = Number(dimensions.width) > 0 && Number(dimensions.height) > 0;
  const source = photo.url || photo.name;
  const ratio = hasDimensions ? dimensions.width / dimensions.height : loadedDimensions?.source === source ? loadedDimensions.ratio : 3 / 2;
  const readDimensions = event => {
    const image = event.target;
    if (!hasDimensions && image.tagName === 'IMG' && image.naturalWidth > 0 && image.naturalHeight > 0) setLoadedDimensions({ source, ratio: image.naturalWidth / image.naturalHeight });
  };
  return <motion.figure className={`ec-photo-card ${className}`} data-photo-id={eventPhotoKey(photo)} data-orientation={ratio < 1 ? 'portrait' : 'landscape'} {...formatFrameAttributes(photo)} style={{ ...formatFrameStyle(photo), '--ec-photo-ratio': ratio }} onLoadCapture={readDimensions} {...reveal} transition={{ ...reveal.transition, delay: Math.min(index % 3, 2) * .06 }}>
    <button type="button" className="ec-photo-button" onClick={() => onOpen(photo)} aria-label={label}>
      <PhotoMotion photo={photo} index={index} paused={paused}>
        <Photo name={photo.name} url={photo.url} srcSet={photo.srcSet} alt={photo.alt || photo.caption || ''} eager={eager} sizes={sizes} style={photo.focalPoint ? { objectPosition: photo.focalPoint } : undefined} />
      </PhotoMotion>
      <span className="ec-photo-open" aria-hidden="true"><Maximize2 size={16} /></span>
    </button>
    {showCaption && photo.caption && <figcaption className="vec-photo-caption">{photo.caption}</figcaption>}
  </motion.figure>;
}

function dateLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export default function EventCoverageViewer({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const reduced = useVeyloReducedMotion();
  const instance = `event-${useId().replace(/:/g, '')}`;
  const viewerRef = useRef(null);
  const toolsRef = useRef(null);
  const filterRef = useRef(null);
  const sceneRefs = useRef(new Map());
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeScene, setActiveScene] = useState('');
  const [motionPaused, setMotionPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [navigationOffset, setNavigationOffset] = useState(90);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const photos = useMemo(() => normalizeDeliveryPhotos(delivery, delivery ? [] : eventCoveragePhotos), [delivery]);
  const collection = useMemo(() => normalizeDeliveryPhotos(delivery, delivery ? [] : eventCoveragePhotos, true), [delivery]);
  const { openingPhoto, closingPhoto, sections, galleryPhotos } = useMemo(() => eventCoveragePresentation(delivery, photos, collection), [delivery, photos, collection]);
  const identity = `${delivery?.publicId || delivery?._id || 'event-demo'}:${photos.map(eventPhotoKey).join('|')}`;
  const { galleryUnlocked, closingRef } = useClosingGallery(identity);
  const pausePhotos = motionPaused || !pageVisible || gallery;
  const hasPhotoMotion = [openingPhoto, closingPhoto, ...photos].some(photo => photo && photo.motion !== 'still');
  const scenePhotos = useMemo(() => sections.flatMap(section => section.photos), [sections]);
  const availableFilters = filters.filter(([value]) => value === 'all' || scenePhotos.some(photo => photo.eventType === value));
  const visibleSections = useMemo(() => sections.map(section => ({
    ...section, anchorId: `${instance}-${eventSceneAnchor(section)}`,
    photos: activeFilter === 'all' ? section.photos : section.photos.filter(photo => photo.eventType === activeFilter)
  })).filter(section => section.photos.length), [sections, activeFilter, instance]);
  const activePosition = Math.max(0, visibleSections.findIndex(section => section.anchorId === activeScene));
  const visiblePhotoCount = visibleSections.reduce((total, section) => total + section.photos.length, 0);
  const settings = delivery?.formatConfig?.eventCoverage || {};
  const title = delivery?.title || delivery?.clientName || 'A day at the conference';
  const studio = delivery?.branding?.name || 'Veylo Studio';
  const opening = delivery?.creativeDirection?.openingLine || delivery?.brief || (delivery ? '' : 'The programme, the conversations, and everyone who was there.');
  const closing = delivery?.creativeDirection?.closingLine || 'Your photographs are ready to keep.';
  const styles = getFormatThemeStyles(delivery, { bg: '#070709', surface: '#0c0c10', text: '#f4efe8', accent: '#ff9b8e', fontDisplay: "'Cormorant Garamond', Georgia, serif", fontBody: "'Manrope', sans-serif" });
  const eventDate = dateLabel(settings.eventDate);

  useEffect(() => {
    setGallery(false); setGalleryIndex(null); setActiveFilter('all'); setMotionPaused(false);
  }, [identity]);

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    const tools = toolsRef.current;
    if (!tools) return undefined;
    const measure = () => {
      const offset = Math.ceil(tools.getBoundingClientRect().height + 24);
      viewerRef.current?.style.setProperty('--ec-scroll-offset', `${offset}px`);
      setNavigationOffset(offset); setViewportHeight(window.innerHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tools);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useEffect(() => {
    setActiveScene(visibleSections[0]?.anchorId || '');
    const observer = new IntersectionObserver(entries => {
      const current = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (current) setActiveScene(current.target.id);
    }, { rootMargin: `-${navigationOffset}px 0px -${Math.max(0, viewportHeight - navigationOffset - 140)}px 0px`, threshold: 0 });
    visibleSections.forEach(section => {
      const element = sceneRefs.current.get(section.anchorId);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [visibleSections, navigationOffset, viewportHeight]);

  useEffect(() => {
    const nav = toolsRef.current?.querySelector('nav');
    const link = Array.from(nav?.querySelectorAll('a') || []).find(item => item.getAttribute('href') === `#${activeScene}`);
    if (!nav || !link) return;
    const bounds = link.getBoundingClientRect(), container = nav.getBoundingClientRect();
    if (bounds.left < container.left || bounds.right > container.right) nav.scrollTo({ left: nav.scrollLeft + bounds.left - container.left - 12, behavior: 'smooth' });
  }, [activeScene]);

  useEffect(() => {
    const closeOutside = event => { if (filterRef.current && !filterRef.current.contains(event.target)) filterRef.current.open = false; };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  const scrollToScene = (anchorId, focus = false) => {
    const target = sceneRefs.current.get(anchorId);
    if (focus) target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const browseScene = (event, anchorId) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); scrollToScene(anchorId, true);
  };
  const chooseFilter = value => {
    setActiveFilter(value);
    filterRef.current.open = false;
    filterRef.current.querySelector('summary').focus();
  };
  const openPhoto = photo => {
    const index = galleryPhotos.findIndex(item => eventPhotoKey(item) === eventPhotoKey(photo));
    if (index < 0) return;
    setGalleryIndex(index); setGallery(true); onNarrationNavigate?.(photo.assetId);
  };
  const openGallery = () => { if (galleryUnlocked) { setGalleryIndex(null); setGallery(true); } };
  const closeGallery = () => { setGallery(false); setGalleryIndex(null); };
  const begin = () => visibleSections.length
    ? scrollToScene(visibleSections[0].anchorId, true)
    : viewerRef.current?.querySelector('.ec-ending')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return <div ref={viewerRef} className="fd-page vec-event ec-viewer" data-motion-paused={motionPaused} data-composition={styles['--fd-composition']} style={styles}>
    <DemoHeader format="Event Coverage" client={title} sectionId="event-coverage" delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    <main>
      <section className="ec-cover" aria-labelledby={`${instance}-title`}>
        <motion.div className="ec-cover-copy" initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, ease }}>
          <span className="ec-eyebrow"><i aria-hidden="true" />Event Coverage</span>
          <h1 id={`${instance}-title`}>{title}</h1>
          {opening && <p className="ec-opening">{opening}</p>}
          <div className="ec-event-meta">{eventDate && <time dateTime={settings.eventDate}>{eventDate}</time>}{settings.venue && <span>{settings.venue}</span>}<span>{galleryPhotos.length} {galleryPhotos.length === 1 ? 'photograph' : 'photographs'}</span></div>
          {openingPhoto && <button className="ec-begin" type="button" onClick={begin}>View the event<ArrowDown size={17} /></button>}
        </motion.div>
        <PhotoCard photo={openingPhoto} paused={pausePhotos} onOpen={openPhoto} eager label="Open the cover photograph" className="ec-cover-photo" showCaption={openingPhoto?.caption !== opening} sizes="(max-width: 767px) 92vw, (max-width: 1023px) 52vw, 58vw" />
      </section>

      {(sections.length > 0 || hasPhotoMotion) && <section ref={toolsRef} className="ec-tools" aria-label="Event navigation and actions">
        <div className="ec-tools-inner">
          {visibleSections.length > 0 && <span className="ec-scene-progress" aria-label={`Scene ${activePosition + 1} of ${visibleSections.length}`}><b>{String(activePosition + 1).padStart(2, '0')}</b><span>/ {String(visibleSections.length).padStart(2, '0')}</span></span>}
          {visibleSections.length > 0 && <div className="ec-mobile-scenes"><select aria-label="Choose an event scene" value={visibleSections[activePosition].anchorId} onChange={event => { setActiveScene(event.target.value); scrollToScene(event.target.value, true); }}>{visibleSections.map(section => <option key={section.anchorId} value={section.anchorId}>{section.title}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div>}
          <nav className="ec-scene-nav" aria-label="Event scenes">
            {visibleSections.map(section => <a key={section.anchorId} href={`#${section.anchorId}`} onClick={event => browseScene(event, section.anchorId)} aria-current={activeScene === section.anchorId ? 'location' : undefined}>{section.title}</a>)}
          </nav>
          <div className="ec-tools-actions">
            {availableFilters.length > 2 && <details ref={filterRef} className="ec-filter" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); } }}>
              <summary aria-label="Filter photographs" className={activeFilter !== 'all' ? 'is-filtered' : ''}><SlidersHorizontal size={17} /><span>{activeFilter === 'all' ? 'Filter' : filters.find(([value]) => value === activeFilter)?.[1]}</span></summary>
              <div className="ec-filter-options" role="group" aria-label="Filter event photographs">{availableFilters.map(([value, label]) => <button type="button" key={value} aria-pressed={activeFilter === value} onClick={() => chooseFilter(value)}>{label}<i aria-hidden="true" /></button>)}</div>
            </details>}
            {hasPhotoMotion && <button className="ec-motion-toggle" type="button" onClick={() => setMotionPaused(value => !value)} aria-label={motionPaused ? 'Resume photo motion' : 'Pause photo motion'} aria-pressed={motionPaused}>{motionPaused ? <Play size={16} /> : <Pause size={16} />}</button>}
          </div>
        </div>
        <p className="ec-sr-only" role="status" aria-live="polite">{visiblePhotoCount} {visiblePhotoCount === 1 ? 'photograph' : 'photographs'} across {visibleSections.length} {visibleSections.length === 1 ? 'scene' : 'scenes'}{activeFilter !== 'all' ? `, filtered by ${filters.find(([value]) => value === activeFilter)?.[1]}` : ''}</p>
      </section>}

      <section className="ec-scenes" aria-label="The event photographs">
        {!visibleSections.length && sections.length > 0 && <div className="ec-empty"><p>No photographs in this view.</p><button type="button" onClick={() => setActiveFilter('all')}>Show all moments<ArrowRight size={16} /></button></div>}
        {visibleSections.map(section => <article id={section.anchorId} key={section.anchorId} ref={element => { if (element) sceneRefs.current.set(section.anchorId, element); else sceneRefs.current.delete(section.anchorId); }} tabIndex={-1} aria-labelledby={`${section.anchorId}-title`} className="ec-scene" data-layout={section.layout} data-scene-index={section.sceneIndex} style={section.accent ? { '--ec-scene-accent': section.accent } : undefined}>
          <motion.header className="ec-scene-copy" {...reveal}>
            <span className="ec-scene-number">{String(section.sceneIndex + 1).padStart(2, '0')}<i aria-hidden="true" /></span>
            <h2 id={`${section.anchorId}-title`}>{section.title}</h2>
            {settings.showSceneNotes !== false && section.copy && <p>{section.copy}</p>}
          </motion.header>
          <div className="ec-scene-grid" data-count={section.photos.length}>
            {section.photos.map((photo, index) => <PhotoCard key={eventPhotoKey(photo)} photo={photo} index={index} paused={pausePhotos} onOpen={openPhoto} label={`Open ${section.title} photograph ${index + 1}`} sizes={index === 0 && ['hero', 'triptych'].includes(section.layout) ? '(max-width: 767px) 92vw, (max-width: 1023px) 90vw, 68vw' : '(max-width: 767px) 92vw, (max-width: 1023px) 44vw, 34vw'} />)}
          </div>
        </article>)}
      </section>

      <footer ref={closingRef} className={`ec-ending${closingPhoto ? ' has-photo' : ''}`}>
        {closingPhoto && <PhotoCard photo={closingPhoto} paused={pausePhotos} onOpen={openPhoto} label="Open the closing photograph" showCaption={closingPhoto.caption !== closing} sizes="(max-width: 767px) 92vw, 52vw" />}
        <motion.div className="ec-ending-copy" data-long-copy={closing.length > 80} {...reveal}>
          <span className="ec-eyebrow">Photographed by {studio}</span>
          <h2>{closing}</h2>
          {galleryPhotos.length > 0 && <button className="ec-gallery-link" type="button" disabled={!galleryUnlocked} onClick={openGallery} aria-label={galleryUnlocked ? 'Open full gallery' : 'View gallery after the presentation'}><Images size={18} /><span>View photographs</span><ArrowRight size={18} /></button>}
        </motion.div>
      </footer>
    </main>
    <AnimatePresence>{gallery && <DemoGallery {...galleryProps} photos={galleryPhotos} title={title} initialIndex={galleryIndex} onClose={closeGallery} delivery={delivery} fontStyles={styles} singlePhoto={galleryIndex !== null} />}</AnimatePresence>
  </div>;
}
