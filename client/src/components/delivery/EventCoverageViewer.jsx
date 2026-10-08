import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useInView, useMotionValue, useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowRight, ChevronDown, Images, Maximize2, Pause, Play, SlidersHorizontal } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
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
const demoBranding = { type: 'studio', name: 'Mayflower Visuals', logoUrl: '' };

function EventBrandIdentity({ branding }) {
  const [failedLogo, setFailedLogo] = useState('');
  const studio = branding?.type === 'studio';
  const name = branding?.name || (studio ? 'Your photographer' : 'Veylo');
  const logoUrl = branding?.logoUrl || '';
  const mark = { ...branding, name, logoUrl: failedLogo === logoUrl ? '' : logoUrl };
  return <motion.div className="ec-brand" data-brand-type={studio ? 'studio' : 'veylo'} {...reveal} onErrorCapture={event => {
    if (studio && event.target.tagName === 'IMG') setFailedLogo(logoUrl);
  }}>
    <DeliveryBrandMark branding={mark} className="ec-brand-mark" />
    <div className="ec-brand-copy"><span>{studio ? 'Photography by' : 'Delivered with'}</span><strong>{name}</strong></div>
  </motion.div>;
}

function EditorialHeading({ title }) {
  const words = title.trim().split(/\s+/);
  if (words.length < 2 || title.length > 35) return title;
  return <><span className="ec-heading-prefix">{words.slice(0, -1).join(' ')} </span><span className="ec-heading-word">{words.at(-1)}</span></>;
}

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

function PhotoCard({ photo, index = 0, position, paused, onOpen, label, eager = false, className = '', showCaption = true, sizes, lead = false, entrance = 'down', slant = 0 }) {
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
  return <motion.figure className={`ec-photo-card ${className}`} data-photo-id={eventPhotoKey(photo)} data-orientation={ratio < 1 ? 'portrait' : 'landscape'} {...formatFrameAttributes(photo)} style={{ ...formatFrameStyle(photo), '--ec-photo-ratio': ratio, rotate: slant }} onLoadCapture={readDimensions} initial={{ opacity: 0, y: photo.motion === 'still' ? 0 : lead ? 36 : 20, scale: photo.motion === 'still' ? 1 : lead ? .985 : 1 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={reveal.viewport} transition={{ duration: lead ? .95 : .7, ease, delay: Math.min(index % 3, 2) * .09 }}>
    <button type="button" className="ec-photo-button" onClick={() => onOpen(photo)} aria-label={label}>
      <PhotoMotion photo={photo} index={index} paused={paused}>
        <Photo name={photo.name} url={photo.url} srcSet={photo.srcSet} alt={photo.alt || photo.caption || ''} eager={eager} sizes={sizes} style={photo.focalPoint ? { objectPosition: photo.focalPoint } : undefined} />
      </PhotoMotion>
      {lead && entrance !== 'fade' && photo.motion !== 'still' && <motion.span className="ec-photo-reveal" aria-hidden="true" style={{ transformOrigin: entrance === 'across' ? 'left' : entrance === 'up' ? 'bottom' : 'top' }} initial={entrance === 'across' ? { scaleX: 1 } : { scaleY: 1 }} whileInView={entrance === 'across' ? { scaleX: 0 } : { scaleY: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: .9, ease }} />}
      <span className="ec-photo-open" aria-hidden="true"><Maximize2 size={16} /></span>
    </button>
    {showCaption && photo.caption && <figcaption className="vec-photo-caption">{position && <span className="ec-photo-index" aria-hidden="true">{String(position).padStart(2, '0')}</span>}<span>{photo.caption}</span></figcaption>}
  </motion.figure>;
}

function SceneSpread({ section, paused, onOpen, photoPositions, showNotes, register }) {
  const leadRef = useRef(null);
  const depth = useMotionValue(0);
  const { scrollYProgress } = useScroll({ target: leadRef, offset: ['start end', 'end start'] });
  const visible = useInView(leadRef);
  const [leadPhoto, ...support] = section.photos;
  const design = ['arrival', 'feature', 'conversation', 'contact', 'essay', 'panorama'][section.sceneIndex % 6];
  const moving = design !== 'contact' && leadPhoto.motion !== 'still';
  useMotionValueEvent(scrollYProgress, 'change', value => {
    if (moving && visible && !paused) depth.set((.5 - value) * 40);
  });
  useEffect(() => { if (!moving) depth.set(0); }, [moving, depth]);
  const heading = <motion.header className="ec-scene-copy" {...reveal}>
    <span className="ec-scene-number" aria-hidden="true">{String(section.sceneIndex + 1).padStart(2, '0')}</span>
    <div className="ec-scene-heading"><h2 id={`${section.anchorId}-title`}><EditorialHeading title={section.title} /></h2></div>
    {showNotes && section.copy && <p>{section.copy}</p>}
  </motion.header>;
  const lead = <motion.div ref={leadRef} className="ec-scene-lead-wrap" style={{ y: depth }}>
    <PhotoCard photo={leadPhoto} position={photoPositions.get(eventPhotoKey(leadPhoto))} paused={paused} onOpen={onOpen} lead={design !== 'contact'} slant={design === 'conversation' ? -1.25 : 0} entrance={design === 'arrival' ? 'across' : design === 'feature' ? 'up' : 'fade'} label={`Open ${section.title} photograph 1`} className="ec-scene-lead" sizes={design === 'contact' ? '(max-width: 639px) 92vw, 46vw' : '(max-width: 767px) 100vw, (max-width: 1279px) 92vw, 1200px'} />
  </motion.div>;
  const supportingPhotos = support.map((photo, index) => <PhotoCard key={eventPhotoKey(photo)} photo={photo} index={index + 1} position={photoPositions.get(eventPhotoKey(photo))} paused={paused} onOpen={onOpen} slant={design === 'conversation' && index === 0 ? 1.25 : 0} label={`Open ${section.title} photograph ${index + 2}`} sizes="(max-width: 639px) 92vw, (max-width: 1023px) 44vw, 46vw" />);
  const supportingSpread = support.length > 0 && <div className="ec-scene-support" data-count={support.length}>{supportingPhotos}</div>;
  let spread;
  if (design === 'conversation') spread = <div className="ec-conversation-layout" data-count={section.photos.length}>{lead}{heading}{supportingPhotos}</div>;
  else if (design === 'contact') spread = <>{heading}<div className="ec-contact-sheet" data-count={section.photos.length}>{lead}{supportingPhotos}</div></>;
  else if (design === 'feature') spread = <><div className="ec-scene-opening">{lead}{heading}</div>{supportingSpread}</>;
  else spread = <><div className="ec-scene-opening">{heading}{lead}</div>{supportingSpread}</>;
  return <article id={section.anchorId} ref={register} tabIndex={-1} aria-labelledby={`${section.anchorId}-title`} className="ec-scene" data-design={design} data-layout={section.layout} data-scene-index={section.sceneIndex} data-treatment={design === 'feature' ? 'feature' : design === 'conversation' ? 'interlude' : 'dark'} data-single-photo={support.length === 0} data-long-title={section.title.length > 35} style={section.accent ? { '--ec-scene-accent': section.accent } : undefined}>
    <div className="ec-scene-grid" data-count={section.photos.length}>{spread}</div>
  </article>;
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
  const { scrollYProgress } = useScroll({ target: viewerRef, offset: ['start start', 'end end'] });
  const toolsRef = useRef(null);
  const filterRef = useRef(null);
  const scenesMenuRef = useRef(null);
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
  const branding = delivery ? delivery.branding : demoBranding;
  const opening = delivery?.creativeDirection?.openingLine || delivery?.brief || (delivery ? '' : 'The programme, the conversations, and everyone who was there.');
  const closing = delivery?.creativeDirection?.closingLine || 'Your photographs are ready to keep.';
  const styles = getFormatThemeStyles(delivery, { bg: '#070709', surface: '#0c0c10', text: '#f4efe8', accent: '#ff9b8e', fontDisplay: "'Cormorant Garamond', Georgia, serif", fontBody: "'Manrope', sans-serif" });
  const eventDate = dateLabel(settings.eventDate);
  const titleWords = title.trim().split(/\s+/);
  const accentTitle = titleWords.length >= 4 && title.length < 70;
  const serifHeading = styles['--delivery-font-heading'].includes('Georgia');
  const photoPositions = useMemo(() => new Map(galleryPhotos.map((photo, index) => [eventPhotoKey(photo), index + 1])), [galleryPhotos]);

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
      const inset = parseFloat(getComputedStyle(tools).top) || 0;
      const offset = Math.ceil(inset + tools.getBoundingClientRect().height + 24);
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
    const closeOutside = event => {
      for (const menu of [filterRef.current, scenesMenuRef.current]) if (menu && !menu.contains(event.target)) menu.open = false;
    };
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
    event.preventDefault();
    scenesMenuRef.current.open = false;
    scrollToScene(anchorId, true);
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
  return <div ref={viewerRef} className="fd-page vec-event ec-viewer" data-motion-paused={motionPaused} data-composition={styles['--fd-composition']} data-heading-kind={serifHeading ? 'serif' : 'sans'} style={styles}>
    <div className="ec-masthead">
      <EventBrandIdentity branding={branding} />
      <DemoHeader format="Event Coverage" client={title} sectionId="event-coverage" delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    </div>
    <main>
      <section className="ec-cover" data-design="cover" data-title-size={title.length > 70 ? 'long' : title.length > 45 ? 'medium' : 'short'} data-has-photo={Boolean(openingPhoto)} aria-labelledby={`${instance}-title`}>
        <div className="ec-cover-stage">
          <PhotoCard photo={openingPhoto} position={photoPositions.get(eventPhotoKey(openingPhoto))} paused={pausePhotos} onOpen={openPhoto} eager lead label="Open the cover photograph" className="ec-cover-photo" showCaption={false} sizes="(max-width: 1480px) 100vw, 1480px" />
          <motion.div className="ec-cover-copy" initial={reduced ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: .9, ease, delay: .15 }}>
            <span className="ec-eyebrow">Event Coverage</span>
            <h1 id={`${instance}-title`}>{accentTitle ? <><motion.span className="ec-title-main" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={reveal.viewport} transition={{ duration: .8, ease }}>{titleWords.slice(0, -1).join(' ')} </motion.span><motion.span className="ec-title-accent" initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={reveal.viewport} transition={{ duration: .9, ease, delay: .12 }}>{titleWords.at(-1)}</motion.span></> : title}</h1>
            {openingPhoto?.caption && openingPhoto.caption !== opening && <p className="ec-cover-caption vec-photo-caption"><span className="ec-photo-index" aria-hidden="true">{String(photoPositions.get(eventPhotoKey(openingPhoto))).padStart(2, '0')}</span><span>{openingPhoto.caption}</span></p>}
          </motion.div>
        </div>
        <motion.div className="ec-cover-details" {...reveal}>
          {opening && <p className="ec-opening">{opening}</p>}
          <div className="ec-event-meta">{eventDate && <time dateTime={settings.eventDate}>{eventDate}</time>}{settings.venue && <span>{settings.venue}</span>}<span>{galleryPhotos.length} {galleryPhotos.length === 1 ? 'photograph' : 'photographs'}</span></div>
        </motion.div>
      </section>

      {(sections.length > 0 || hasPhotoMotion) && <section ref={toolsRef} className="ec-tools" aria-label="Event navigation and actions">
        <div className="ec-tools-inner">
          {visibleSections.length > 0 && <details ref={scenesMenuRef} className="ec-scenes-menu" onToggle={event => { if (event.currentTarget.open && filterRef.current) filterRef.current.open = false; }} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); } }}>
            <summary aria-label="Browse event scenes"><span className="ec-current-number" aria-hidden="true">{String(visibleSections[activePosition].sceneIndex + 1).padStart(2, '0')}</span><span className="ec-current-title">{visibleSections[activePosition].title}</span><ChevronDown size={15} aria-hidden="true" /></summary>
            <nav className="ec-scene-nav" aria-label="Event scenes">{visibleSections.map(section => <a key={section.anchorId} href={`#${section.anchorId}`} onClick={event => browseScene(event, section.anchorId)} aria-current={activeScene === section.anchorId ? 'location' : undefined}><span className="ec-nav-number" aria-hidden="true">{String(section.sceneIndex + 1).padStart(2, '0')}</span><span>{section.title}</span><small>{section.photos.length} {section.photos.length === 1 ? 'photo' : 'photos'}</small></a>)}</nav>
          </details>}
          <div className="ec-tools-actions">
            {availableFilters.length > 2 && <details ref={filterRef} className="ec-filter" onToggle={event => { if (event.currentTarget.open && scenesMenuRef.current) scenesMenuRef.current.open = false; }} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); } }}>
              <summary aria-label="Filter photographs" className={activeFilter !== 'all' ? 'is-filtered' : ''}><SlidersHorizontal size={17} /><span>{activeFilter === 'all' ? 'Filter' : filters.find(([value]) => value === activeFilter)?.[1]}</span></summary>
              <div className="ec-filter-options" role="group" aria-label="Filter event photographs">{availableFilters.map(([value, label]) => <button type="button" key={value} aria-pressed={activeFilter === value} onClick={() => chooseFilter(value)}>{label}<i aria-hidden="true" /></button>)}</div>
            </details>}
            {hasPhotoMotion && <button className="ec-motion-toggle" type="button" onClick={() => setMotionPaused(value => !value)} aria-label={motionPaused ? 'Resume photo motion' : 'Pause photo motion'} aria-pressed={motionPaused}>{motionPaused ? <Play size={16} /> : <Pause size={16} />}</button>}
          </div>
        </div>
        <motion.div className="ec-reading-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
        <p className="ec-sr-only" role="status" aria-live="polite">{visiblePhotoCount} {visiblePhotoCount === 1 ? 'photograph' : 'photographs'} across {visibleSections.length} {visibleSections.length === 1 ? 'scene' : 'scenes'}{activeFilter !== 'all' ? `, filtered by ${filters.find(([value]) => value === activeFilter)?.[1]}` : ''}</p>
      </section>}

      <section className="ec-scenes" aria-label="The event photographs">
        {!visibleSections.length && sections.length > 0 && <div className="ec-empty"><p>No photographs in this view.</p><button type="button" onClick={() => setActiveFilter('all')}>Show all moments<ArrowRight size={16} /></button></div>}
        {visibleSections.map(section => <SceneSpread key={section.anchorId} section={section} paused={pausePhotos} onOpen={openPhoto} photoPositions={photoPositions} showNotes={settings.showSceneNotes !== false} register={element => { if (element) sceneRefs.current.set(section.anchorId, element); else sceneRefs.current.delete(section.anchorId); }} />)}
      </section>

      <footer ref={closingRef} className={`ec-ending${closingPhoto ? ' has-photo' : ''}`} data-design="colophon">
        {closingPhoto && <PhotoCard photo={closingPhoto} position={photoPositions.get(eventPhotoKey(closingPhoto))} paused={pausePhotos} onOpen={openPhoto} label="Open the closing photograph" showCaption={closingPhoto.caption !== closing} sizes="(max-width: 767px) 92vw, 52vw" />}
        <motion.div className="ec-ending-copy" data-long-copy={closing.length > 80} {...reveal}>
          <h2>{closing}</h2>
          {galleryPhotos.length > 0 && <button className="ec-gallery-link" type="button" disabled={!galleryUnlocked} onClick={openGallery} aria-label={galleryUnlocked ? 'Open full gallery' : 'View gallery after the presentation'}><Images size={19} /><span>View {galleryPhotos.length === 1 ? 'the photograph' : `all ${galleryPhotos.length} photographs`}</span><span className="ec-action-arrow" aria-hidden="true"><ArrowRight size={20} /></span></button>}
          <EventBrandIdentity branding={branding} />
        </motion.div>
      </footer>
    </main>
    <AnimatePresence>{gallery && <DemoGallery {...galleryProps} photos={galleryPhotos} title={title} initialIndex={galleryIndex} onClose={closeGallery} delivery={delivery} fontStyles={styles} singlePhoto={galleryIndex !== null} />}</AnimatePresence>
  </div>;
}
