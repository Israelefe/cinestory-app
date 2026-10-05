import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useInView } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { ArrowRight, CalendarRange, Download, Images, Maximize2, Pause, Play } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';
import {
  DemoGallery,
  DemoHeader,
  eventCoveragePhotos,
  formatFrameAttributes,
  formatFrameStyle,
  frameMotionTransition,
  frameMotionValues,
  getFormatThemeStyles,
  normalizeDeliveryPhotos
} from '../../pages/FormatDemo.jsx';
import { useClosingGallery } from '../../utils/useClosingGallery.js';
import './EventCampaignViewers.css';
import './EventCoverageViewer.css';

const eventEase = [.22, 1, .36, 1];
const eventReveal = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: .15 },
  transition: { duration: .65, ease: eventEase }
};

// Keep saved photograph motion, but stop work while it is out of view or paused.
function EventPhotoMotion({ photo, index = 0, paused, className = '', children }) {
  const ref = useRef(null);
  const visible = useInView(ref);
  const controls = useAnimationControls();
  const reduced = useVeyloReducedMotion();
  const motionName = photo?.motion;
  useEffect(() => {
    if (reduced || motionName === 'still') {
      controls.set({ scale: 1, x: 0, y: 0 });
    } else if (visible && !paused) {
      controls.start({ ...frameMotionValues({ motion: motionName }), transition: frameMotionTransition({ motion: motionName }, index) });
    } else {
      controls.stop();
    }
    return () => controls.stop();
  }, [controls, visible, paused, reduced, motionName, index]);
  return <motion.div ref={ref} className={`vec-frame-motion ${className}`} initial={false} animate={controls}>{children}</motion.div>;
}

function splitIntoGroups(photos, wantedGroups) {
  const count = Math.max(1, Math.min(wantedGroups, photos.length));
  const groups = Array.from({ length: count }, () => []);
  photos.forEach((photo, index) => groups[index % count].push(photo));
  return groups.filter(group => group.length);
}

function resolveSections(delivery, photos, fallbackSections) {
  const fallbacks = fallbackSections.map(section => typeof section === 'string' ? { title: section } : section);
  const source = delivery?.creativeDirection?.sections || delivery?.formatConfig?.sections || [];
  const useDemoFallbacks = !delivery && !source.length;
  const byId = new Map(photos.map(photo => [String(photo.assetId || photo.name), photo]));
  const generated = source.map((section, index) => {
    const assigned = (section.assetIds || section.photoIds || []).map(id => byId.get(String(id))).filter(Boolean);
    const fallback = useDemoFallbacks ? fallbacks[index % fallbacks.length] : {};
    return {
      id: section.id || `section-${index + 1}`,
      title: section.title || section.name || section.headline || fallback.title || `Scene ${String(index + 1).padStart(2, '0')}`,
      copy: section.copy || section.subtitle || (delivery?.format === 'event-coverage' ? section.body : '') || section.caption || section.description || fallback.copy || '',
      label: section.label || section.eyebrow || fallback.label || '',
      delivery: section.delivery || section.output || fallback.delivery || '',
      layout: section.layout || fallback.layout || 'grid',
      accent: section.accent || fallback.accent || '',
      photos: assigned
    };
  }).filter(section => section.photos.length);

  if (generated.length) return generated;
  return splitIntoGroups(photos, Math.min(fallbacks.length, photos.length)).map((group, index) => ({
    id: `section-${index + 1}`,
    title: useDemoFallbacks ? fallbacks[index % fallbacks.length].title : `Scene ${String(index + 1).padStart(2, '0')}`,
    copy: useDemoFallbacks ? fallbacks[index % fallbacks.length].copy || '' : '',
    label: useDemoFallbacks ? fallbacks[index % fallbacks.length].label || '' : '',
    delivery: useDemoFallbacks ? fallbacks[index % fallbacks.length].delivery || '' : '',
    layout: useDemoFallbacks ? fallbacks[index % fallbacks.length].layout || 'grid' : 'grid',
    accent: useDemoFallbacks ? fallbacks[index % fallbacks.length].accent || '' : '',
    photos: group
  }));
}

function sceneAnchorId(section, index) {
  const slug = String(section?.id || section?.title || `scene-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `event-scene-${slug || 'scene'}-${index + 1}`;
}

function eventPhotoIdentity(photo) {
  return photo?.assetId != null ? `asset:${photo.assetId}` : photo?.name ? `name:${photo.name}` : '';
}
function OpeningPhoto({ photo, alt }) {
  return <Photo name={photo?.name} url={photo?.url} srcSet={photo?.srcSet} alt={photo?.alt || alt} style={photo?.focalPoint ? { objectPosition: photo.focalPoint } : undefined} eager sizes="100vw" />;
}

export function EventCoverageViewer({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const reduced = useVeyloReducedMotion();
  const viewerRef = useRef(null);
  const toolsRef = useRef(null);
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeScene, setActiveScene] = useState('');
  const [motionPaused, setMotionPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [navigationOffset, setNavigationOffset] = useState(180);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const pausePhotos = motionPaused || !pageVisible || gallery;
  const openGallery = () => { if (!galleryUnlocked) return; setGalleryIndex(null); setGallery(true); };
  const photos = useMemo(() => normalizeDeliveryPhotos(delivery, eventCoveragePhotos), [delivery]);
  const galleryPhotos = useMemo(() => delivery?.schemaVersion === 3 ? normalizeDeliveryPhotos(delivery, eventCoveragePhotos, true) : photos, [delivery, photos]);
  const { galleryUnlocked, closingRef } = useClosingGallery(`${delivery?.publicId || delivery?._id || 'event-demo'}:${photos.map(photo => photo.assetId || photo.name).join('|')}`);
  const openingPhoto = delivery?.schemaVersion === 3 ? galleryPhotos.find(photo => photo.assetId === delivery.v3?.openingAssetId) || photos[0] : photos[0];
  const hasPhotoMotion = [openingPhoto, ...photos].some(photo => photo && photo.motion !== 'still');
  const closingPhotoCandidate = delivery?.schemaVersion === 3 ? galleryPhotos.find(photo => photo.assetId === delivery.v3?.closingAssetId) : null;
  const closingPhoto = eventPhotoIdentity(closingPhotoCandidate) !== eventPhotoIdentity(openingPhoto) ? closingPhotoCandidate : null;
  const sections = useMemo(() => resolveSections(delivery, photos, [
    { title: 'Arrivals and check-in', copy: 'The room takes shape as people arrive, find their bearings, and start the first conversations.', label: 'OPENING SCENE', delivery: 'WELCOME' },
    { title: 'The main programme', copy: 'A shared point of focus: the speaker, the audience, and the room listening together.', label: 'PROGRAMME', delivery: 'KEY MOMENTS' },
    { title: 'Between sessions', copy: 'The useful exchanges happen in the pauses, away from the stage and close to the people.', label: 'IN BETWEEN', delivery: 'CANDIDS' },
    { title: 'On stage', copy: 'The programme lifts the room and everyone becomes part of the record.', label: 'THE ROOM MOVES', delivery: 'HIGHLIGHTS' },
    { title: 'Details and atmosphere', copy: 'Badges, tables, light, and the small preparations that make the gathering feel complete.', label: 'THE DETAILS', delivery: 'ATMOSPHERE' }
  ]), [delivery, photos]);
  const title = delivery?.title || delivery?.clientName || 'A day in the room';
  const studio = delivery?.branding?.name || 'Veylo Studio';
  const opening = delivery?.creativeDirection?.openingLine || delivery?.brief || 'The people, the programme, and the moments in between.';
  const styles = getFormatThemeStyles(delivery, { bg: '#070709', surface: '#0c0c10', text: '#f4efe8', accent: '#ff9b8e', fontDisplay: "'Outfit', sans-serif" });
  const openingIdentity = eventPhotoIdentity(openingPhoto);
  const sceneSource = useMemo(() => sections
    .map(section => ({
      ...section,
      photos: section.photos.filter(photo => !openingIdentity || eventPhotoIdentity(photo) !== openingIdentity)
    }))
    .filter(section => section.photos.length), [sections, openingIdentity]);
  const filterOptions = [
    ['all', 'All moments'],
    ['people', 'People'],
    ['programme', 'Programme'],
    ['networking', 'Networking'],
    ['details', 'Details']
  ];
  const scenePhotos = useMemo(() => sceneSource.flatMap(section => section.photos), [sceneSource]);
  const hasEventTypes = scenePhotos.some(photo => photo.eventType);
  const availableFilters = filterOptions.filter(([value]) => value === 'all' || scenePhotos.some(photo => photo.eventType === value));
  const visibleSections = useMemo(() => sceneSource
    .map((section, index) => ({
      ...section,
      sceneIndex: index,
      anchorId: sceneAnchorId(section, index),
      photos: !hasEventTypes || activeFilter === 'all'
        ? section.photos
        : section.photos.filter(photo => photo.eventType === activeFilter)
    }))
    .filter(section => section.photos.length), [sceneSource, hasEventTypes, activeFilter]);
  const visiblePhotoCount = visibleSections.reduce((count, section) => count + section.photos.length, 0);

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const header = viewer?.querySelector('.fd-header');
    const tools = toolsRef.current;
    if (!header || !tools) return undefined;
    const measure = () => {
      const headerHeight = header.getBoundingClientRect().height;
      const offset = Math.ceil(headerHeight + tools.getBoundingClientRect().height + 24);
      viewer.style.setProperty('--event-header-height', `${headerHeight}px`);
      viewer.style.setProperty('--event-scroll-offset', `${offset}px`);
      setNavigationOffset(offset);
      setViewportHeight(window.innerHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(tools);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useEffect(() => {
    setActiveScene('');
    const observer = new IntersectionObserver(entries => {
      const current = entries.filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (current) setActiveScene(current.target.id);
    }, { rootMargin: `-${navigationOffset}px 0px -${Math.max(0, viewportHeight - navigationOffset - 100)}px 0px`, threshold: 0 });
    visibleSections.forEach(section => {
      const element = document.getElementById(section.anchorId);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [visibleSections, navigationOffset, viewportHeight]);

  useEffect(() => {
    const nav = toolsRef.current?.querySelector('.vec-event-scene-nav');
    const link = Array.from(nav?.querySelectorAll('a') || []).find(item => item.getAttribute('href') === `#${activeScene}`);
    if (!nav || !link) return;
    const bounds = link.getBoundingClientRect();
    const navBounds = nav.getBoundingClientRect();
    if (bounds.left < navBounds.left || bounds.right > navBounds.right) {
      nav.scrollTo({ left: nav.scrollLeft + bounds.left - navBounds.left - 20, behavior: 'smooth' });
    }
  }, [activeScene]);

  const browseScene = (event, anchorId) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const target = document.getElementById(anchorId);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openPhoto = photo => {
    const identity = eventPhotoIdentity(photo);
    const index = galleryPhotos.findIndex(item => identity && eventPhotoIdentity(item) === identity);
    if (index < 0 && !galleryUnlocked) return;
    setGalleryIndex(index >= 0 ? index : null);
    setGallery(true);
    onNarrationNavigate?.(photo.assetId);
  };

  return <div ref={viewerRef} className="fd-page vec-viewer vec-event" data-composition={styles['--fd-composition']} data-accent-placement={styles['--fd-accent-placement']} data-pace={styles['--fd-pace']} data-motion-paused={motionPaused} style={styles}>
    <DemoHeader format="Event Coverage" client={title} sectionId="event-coverage" delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    <main>
      <section className="vec-event-hero">
        <motion.figure {...formatFrameAttributes(openingPhoto)} style={formatFrameStyle(openingPhoto)} initial={reduced ? false : { opacity: 0, scale: 1.035 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : 1.05, ease: [.22, 1, .36, 1] }}>
          <EventPhotoMotion photo={openingPhoto} paused={pausePhotos}><OpeningPhoto photo={openingPhoto} alt="Event opening photograph" /></EventPhotoMotion>
          <i />
        </motion.figure>
        <motion.div className="vec-event-hero-copy" initial={reduced ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .8, delay: reduced ? 0 : .18, ease: eventEase }}>
          <span><CalendarRange size={14} /> EVENT COVERAGE</span>
          <h1>{title}</h1>
          <p>{opening}</p>
        </motion.div>
      </section>

      <section ref={toolsRef} className="vec-event-tools" aria-label="Event navigation and actions">
        {(hasPhotoMotion || galleryUnlocked) && <div className="vec-event-tools-head">
          <div className="vec-event-tools-actions">
            {hasPhotoMotion && <button type="button" className="vec-event-motion-toggle" onClick={() => setMotionPaused(value => !value)} aria-label={motionPaused ? 'Resume photo motion' : 'Pause photo motion'} aria-pressed={motionPaused}>{motionPaused ? <Play size={15} /> : <Pause size={15} />}<span>{motionPaused ? 'Resume motion' : 'Pause motion'}</span></button>}
            {galleryUnlocked && <button type="button" onClick={openGallery}><Images size={15} />Open gallery</button>}
            {galleryUnlocked && galleryProps?.onDownloadAll && delivery?.access?.allowDownloadAll !== false && <button type="button" onClick={() => { if (galleryUnlocked) galleryProps.onDownloadAll(); }} disabled={Boolean(galleryProps.busy)}><Download size={15} />{galleryProps.busy === 'all' ? 'Preparing…' : 'Download all'}</button>}
          </div>
        </div>}
        <nav className="vec-event-scene-nav" aria-label="Event scenes">
          {visibleSections.map(section => <a key={section.anchorId} href={`#${section.anchorId}`} onClick={event => browseScene(event, section.anchorId)} aria-current={activeScene === section.anchorId ? 'location' : undefined}><span>{String(section.sceneIndex + 1).padStart(2, '0')}</span>{section.title}</a>)}
        </nav>
      </section>

      <section id="event-scenes" className="vec-event-scenes">
        <motion.header {...eventReveal}><span>THE COVERAGE</span><h2>From the first arrival to the last photograph.</h2></motion.header>
        {hasEventTypes && <div className="vec-event-filter-bar"><div className="vec-event-filters" role="group" aria-label="Filter event photographs">
          {availableFilters.map(([value, label]) => <motion.button type="button" key={value} className={activeFilter === value ? 'is-active' : ''} onClick={() => setActiveFilter(value)} aria-pressed={activeFilter === value} whileTap={{ scale: .96 }}>{activeFilter === value && <motion.span className="vec-event-filter-selection" layoutId="event-filter-selection" transition={{ type: 'spring', damping: 25, stiffness: 280 }} />}<span>{label}</span></motion.button>)}
        </div><p className="vec-event-filter-status" role="status" aria-live="polite">{visiblePhotoCount} {visiblePhotoCount === 1 ? 'photograph' : 'photographs'} across {visibleSections.length} {visibleSections.length === 1 ? 'scene' : 'scenes'}</p></div>}
        {!visibleSections.length && <div className="vec-event-empty"><p>No photographs in this view.</p><button type="button" onClick={() => setActiveFilter('all')}>Show all moments<ArrowRight size={16} /></button></div>}
        {visibleSections.map(section => <article id={section.anchorId} tabIndex={-1} aria-labelledby={`${section.anchorId}-title`} data-layout={section.layout || 'grid'} key={section.anchorId} style={section.accent ? { '--section-accent': section.accent } : undefined}>
          <motion.div className="vec-scene-copy" {...eventReveal}><span>{String(section.sceneIndex + 1).padStart(2, '0')}</span><div><h3 id={`${section.anchorId}-title`}>{section.title}</h3></div><b>{section.photos.length} {section.photos.length === 1 ? 'photo' : 'photos'}</b></motion.div>
          <div className={`vec-scene-grid is-count-${Math.min(section.photos.length, 4)}`}>
            {section.photos.map((photo, index) => <motion.figure key={`${activeFilter}:${photo.assetId || photo.name || index}`} {...eventReveal} transition={{ ...eventReveal.transition, delay: Math.min(index % 4, 3) * .06 }}>
              <button type="button" {...formatFrameAttributes(photo)} style={formatFrameStyle(photo)} onClick={() => openPhoto(photo)} aria-label={`Open ${section.title} photograph ${index + 1}`}>
                <EventPhotoMotion photo={photo} index={index} paused={pausePhotos} className="vec-scene-image"><Photo name={photo.name} url={photo.url} srcSet={photo.srcSet} alt={photo.alt || photo.caption || ''} style={photo.focalPoint ? { objectPosition: photo.focalPoint } : undefined} sizes="(max-width: 639px) 92vw, (max-width: 1023px) 46vw, 46vw" /></EventPhotoMotion>
                <span className="vec-photo-open" aria-hidden="true"><Maximize2 size={16} /></span>
              </button>
              {photo.caption && <figcaption className="vec-photo-caption">{photo.caption}</figcaption>}
            </motion.figure>)}
          </div>
        </article>)}
      </section>

      <footer ref={closingRef} className="vec-event-close">{closingPhoto && <img className="vec-v3-bookend-photo" src={closingPhoto.url} alt="" loading="lazy" />}<motion.div {...eventReveal}><span>{studio}</span><h2>{delivery?.creativeDirection?.closingLine || 'The whole day, in one place.'}</h2></motion.div></footer>
    </main>
    <AnimatePresence>{gallery && <DemoGallery photos={galleryPhotos} title={title} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={delivery} fontStyles={styles} {...galleryProps} singlePhoto={!galleryUnlocked} />}</AnimatePresence>
  </div>;
}

export { CampaignDeliveryViewer } from './CampaignDeliveryViewer.jsx';
