import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useInView } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { ArrowRight, BriefcaseBusiness, CalendarRange, Download, FileCheck2, Images, Maximize2, Pause, Play } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';
import {
  DemoGallery,
  DemoHeader,
  campaignPhotos,
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

function resolveCampaignSets(delivery, photos, fallbackSections) {
  const source = delivery?.creativeDirection?.sections || delivery?.formatConfig?.sections || [];
  if (source.length) return resolveSections(delivery, photos, fallbackSections);

  const byType = new Map(fallbackSections.map(section => [section.campaignType, section]));
  const orderedTypes = ['hero', 'detail', 'lifestyle', 'kit', 'context'];
  const typedSets = orderedTypes.map(type => {
    const group = photos.filter(photo => photo.campaignType === type);
    const fallback = byType.get(type) || {};
    return group.length ? {
      id: `campaign-${type}`,
      title: fallback.title || `${type[0].toUpperCase()}${type.slice(1)} assets`,
      copy: fallback.copy || '',
      label: fallback.label || '',
      delivery: fallback.delivery || '',
      photos: group
    } : null;
  }).filter(Boolean);
  return typedSets.length ? typedSets : resolveSections(delivery, photos, fallbackSections);
}

function sceneAnchorId(section, index) {
  const slug = String(section?.id || section?.title || `scene-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `event-scene-${slug || 'scene'}-${index + 1}`;
}

function campaignAnchorId(section, index) {
  const slug = String(section?.id || section?.title || `set-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `campaign-set-${slug || index + 1}`;
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

export function CampaignDeliveryViewer({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const reduced = useVeyloReducedMotion();
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const openGallery = () => { if (!galleryUnlocked) return; setGalleryIndex(null); setGallery(true); };
  const photos = useMemo(() => normalizeDeliveryPhotos(delivery, campaignPhotos), [delivery]);
  const galleryPhotos = useMemo(() => delivery?.schemaVersion === 3 ? normalizeDeliveryPhotos(delivery, campaignPhotos, true) : photos, [delivery, photos]);
  const { galleryUnlocked, closingRef } = useClosingGallery(`${delivery?.publicId || delivery?._id || 'campaign-demo'}:${photos.map(photo => photo.assetId || photo.name).join('|')}`);
  const fallbackSets = useMemo(() => [
    { campaignType: 'hero', title: 'Hero campaign', copy: 'The lead frame establishes the product, the palette, and the first impression.', label: '01 / MASTER', delivery: 'WEB + HERO' },
    { campaignType: 'detail', title: 'Craft and detail', copy: 'Close frames make the material, construction, and finish easy to inspect.', label: '02 / DETAIL', delivery: 'DETAIL CROP' },
    { campaignType: 'lifestyle', title: 'In use', copy: 'Natural context frames show where the product belongs beyond the studio set.', label: '03 / LIFESTYLE', delivery: 'SOCIAL + WEB' },
    { campaignType: 'kit', title: 'Complete kit', copy: 'The supporting pieces are grouped together for a clean catalogue or retail handoff.', label: '04 / KIT', delivery: 'CATALOG + RETAIL' },
    { campaignType: 'context', title: 'Quiet context', copy: 'A flexible frame gives the campaign room to breathe across a feed or landing page.', label: '05 / CONTEXT', delivery: 'SOCIAL / 1:1' }
  ], []);
  const sets = useMemo(() => resolveCampaignSets(delivery, photos, fallbackSets), [delivery, photos, fallbackSets]);
  const filterOptions = [
    ['all', 'All assets'],
    ['hero', 'Hero'],
    ['detail', 'Detail'],
    ['lifestyle', 'In use'],
    ['kit', 'Kit'],
    ['context', 'Context']
  ];
  const hasCampaignTypes = photos.some(photo => photo.campaignType);
  const visibleSets = sets.map(set => ({
    ...set,
    photos: !hasCampaignTypes || activeFilter === 'all' ? set.photos : set.photos.filter(photo => photo.campaignType === activeFilter)
  })).filter(set => set.photos.length);
  const highlights = photos.slice(0, 4);
  const title = delivery?.title || delivery?.clientName || 'Carry it forward';
  const client = delivery?.clientName || 'Campaign team';
  const heroPhoto = delivery?.schemaVersion === 3 ? galleryPhotos.find(photo => photo.assetId === delivery.v3?.openingAssetId) || photos[0] : photos.find(photo => photo.campaignType === 'hero') || photos[0];
  const closingPhoto = delivery?.schemaVersion === 3 ? galleryPhotos.find(photo => photo.assetId === delivery.v3?.closingAssetId) : null;
  const statement = delivery?.creativeDirection?.openingLine || delivery?.brief || 'A clear campaign presentation first, followed by an organised handoff that makes the right file easy to find and use.';
  const usage = delivery?.formatConfig?.usageTerms || (delivery?.schemaVersion === 3 ? 'Contact the studio to confirm usage terms before using these files.' : 'Usage terms are supplied by the photographer. Contact the studio before any use outside the agreed brief.');
  const styles = getFormatThemeStyles(delivery, { bg: '#090908', surface: '#141411', text: '#f3f0e8', accent: '#d9c270', fontDisplay: "'Playfair Display', Georgia, serif" });

  const openPhoto = photo => {
    setGalleryIndex(Math.max(0, galleryPhotos.findIndex(item => item.assetId ? item.assetId === photo.assetId : item.name === photo.name)));
    setGallery(true);
    onNarrationNavigate?.(photo.assetId);
  };

  return <div className="fd-page vec-viewer vec-campaign" data-composition={styles['--fd-composition']} data-accent-placement={styles['--fd-accent-placement']} data-pace={styles['--fd-pace']} style={styles}>
    <DemoHeader format="Campaign Delivery" client={title} sectionId="campaign" onGallery={galleryUnlocked ? openGallery : undefined} light delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    <main>
      <section className="vec-campaign-hero">
        <div className="vec-campaign-number">01 <span>/ CAMPAIGN</span></div>
        <motion.div {...formatFrameAttributes(heroPhoto)} style={formatFrameStyle(heroPhoto)} initial={reduced ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .75 }}><span>FINAL ASSET DELIVERY</span><h1>{title}</h1><p>{statement}</p><small>Prepared for {client}</small><button className="vec-campaign-hero-cta" type="button" onClick={() => document.getElementById('campaign-sets')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })}>View approved sets<ArrowRight size={17} /></button></motion.div>
        <motion.figure {...formatFrameAttributes(heroPhoto)} style={formatFrameStyle(heroPhoto)} initial={reduced ? false : { opacity: 0, clipPath: 'inset(0 0 12% 0)' }} animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: reduced ? 0 : .9, delay: reduced ? 0 : .14 }}><motion.div className="vec-frame-motion" animate={frameMotionValues(heroPhoto, reduced)} transition={frameMotionTransition(heroPhoto, 0, reduced)}><OpeningPhoto photo={heroPhoto} alt="Campaign lead photograph" /></motion.div></motion.figure>
      </section>

      <section className="vec-campaign-note"><BriefcaseBusiness size={21} /><p>{delivery?.creativeDirection?.closingLine || 'Review the campaign first. The organised files and photographer-supplied terms follow below.'}</p></section>

      <section className="vec-campaign-tools" aria-label="Campaign navigation and actions">
        <div className="vec-campaign-tools-head">
          <div><span>FIND AN APPROVED ASSET</span><strong>Start with a set, inspect the supporting files, or open everything.</strong></div>
          <div className="vec-campaign-tools-actions">
            {galleryUnlocked && <button type="button" onClick={openGallery}><Images size={15} />Full gallery</button>}
            {galleryUnlocked && galleryProps?.onDownloadAll && delivery?.access?.allowDownloadAll !== false && <button type="button" onClick={() => { if (galleryUnlocked) galleryProps.onDownloadAll(); }} disabled={Boolean(galleryProps.busy)}><Download size={15} />{galleryProps.busy === 'all' ? 'Preparing…' : 'Download all'}</button>}
          </div>
        </div>
        <nav className="vec-campaign-set-nav" aria-label="Campaign asset sets">
          {visibleSets.map((set, index) => <a key={set.id} href={`#${campaignAnchorId(set, index)}`}><span>{String(index + 1).padStart(2, '0')}</span>{set.title}</a>)}
        </nav>
      </section>

      <section className="vec-campaign-highlights" aria-label="Campaign highlights">
        <header><span>START HERE</span><h2>The approved frames that carry the campaign.</h2></header>
        <div className="vec-campaign-highlight-grid">
          {highlights.map((photo, index) => <button type="button" key={photo.assetId || photo.name || index} {...formatFrameAttributes(photo)} style={formatFrameStyle(photo)} onClick={() => openPhoto(photo)} aria-label={`Open campaign highlight ${index + 1}`}>
            <motion.div className="vec-frame-motion" animate={frameMotionValues(photo, reduced)} transition={frameMotionTransition(photo, index, reduced)}><Photo name={photo.name} url={photo.url} srcSet={photo.srcSet} alt={photo.alt || `Campaign highlight ${index + 1}`} sizes="(max-width: 640px) 78vw, 23vw" /></motion.div>
            <span>{photo.caption || `Approved asset ${String(index + 1).padStart(2, '0')}`}</span>
          </button>)}
        </div>
      </section>

      <section id="campaign-sets" className="vec-campaign-sets">
        <header><span>02 / APPROVED WORK</span><h2>Asset sets</h2><p>Each set keeps a job together: the lead image, the detail, the context, and the crops the team will actually use.</p></header>
        {hasCampaignTypes && <div className="vec-campaign-filters" role="group" aria-label="Filter campaign assets">
          {filterOptions.map(([value, label]) => <button type="button" key={value} className={activeFilter === value ? 'is-active' : ''} onClick={() => setActiveFilter(value)} aria-pressed={activeFilter === value}>{label}</button>)}
        </div>}
        <div>{visibleSets.map((set, setIndex) => <motion.article id={campaignAnchorId(set, setIndex)} data-layout={set.layout || 'grid'} key={set.id} style={set.accent ? { '--section-accent': set.accent } : undefined} initial={reduced ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .14 }} transition={{ duration: reduced ? 0 : .55, delay: reduced ? 0 : setIndex * .04 }}>
          <button type="button" {...formatFrameAttributes(set.photos[0])} style={formatFrameStyle(set.photos[0])} onClick={() => openPhoto(set.photos[0])} aria-label={`Open ${set.title}`}><motion.span className="vec-frame-motion" animate={frameMotionValues(set.photos[0] || {}, reduced)} transition={frameMotionTransition(set.photos[0] || {}, setIndex, reduced)}><Photo name={set.photos[0]?.name} url={set.photos[0]?.url} srcSet={set.photos[0]?.srcSet} alt={set.photos[0]?.alt || ''} style={set.photos[0]?.focalPoint ? { objectPosition: set.photos[0].focalPoint } : undefined} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 31vw" /></motion.span><span>{String(setIndex + 1).padStart(2, '0')}</span><small>{set.delivery || `${set.photos.length} approved files`}</small></button>
          <div className="vec-campaign-set-copy" {...formatFrameAttributes(set.photos[0])} style={formatFrameStyle(set.photos[0])}>{set.label && <small className="vec-set-label">{set.label}</small>}<h3>{set.title}</h3>{set.copy && <p>{set.copy}</p>}<p className="vec-photo-caption">{set.photos[0]?.caption}</p><span>{set.photos.length} approved {set.photos.length === 1 ? 'file' : 'files'}</span></div>
          {set.photos.length > 1 && <div className="vec-campaign-set-support" aria-label={`${set.title} supporting photographs`}>
            {set.photos.slice(1).map((photo, index) => <button type="button" key={photo.assetId || photo.name || index} {...formatFrameAttributes(photo)} style={formatFrameStyle(photo)} onClick={() => openPhoto(photo)} aria-label={`Open ${set.title} supporting photograph ${index + 1}`}><motion.div className="vec-frame-motion" animate={frameMotionValues(photo, reduced)} transition={frameMotionTransition(photo, index, reduced)}><Photo name={photo.name} url={photo.url} srcSet={photo.srcSet} alt={photo.alt || photo.caption || ''} style={photo.focalPoint ? { objectPosition: photo.focalPoint } : undefined} sizes="(max-width: 640px) 44vw, (max-width: 1024px) 22vw, 18vw" /></motion.div><span>{photo.caption || photo.deliveryLabel || 'Supporting asset'}</span></button>)}
          </div>}
        </motion.article>)}</div>
      </section>

      <section ref={closingRef} className="vec-campaign-handoff">
        <div><span>03 / HANDOFF</span><h2>Ready for the team.</h2><p>{galleryPhotos.length} final photographs are available in the complete gallery, with the campaign sets kept in the order they are meant to be used.</p>{galleryUnlocked && galleryProps?.onDownloadAll && delivery?.access?.allowDownloadAll !== false && <button type="button" onClick={() => { if (galleryUnlocked) galleryProps.onDownloadAll(); }} disabled={Boolean(galleryProps.busy)}>{galleryProps.busy === 'all' ? 'Starting downloads...' : 'Download all photos'}<Download size={17} /></button>}</div>
        <aside><FileCheck2 size={23} /><span>USAGE TERMS</span><p>{usage}</p><div className="vec-handoff-notes"><span>MASTER</span><span>WEB CROP</span><span>SOCIAL CROP</span></div></aside>
      </section>

      <footer className="vec-campaign-close">{closingPhoto && <img className="vec-v3-bookend-photo" src={closingPhoto.url} alt="" />}<span>04 / COMPLETE COLLECTION</span><h2>{delivery?.schemaVersion === 3 ? delivery?.creativeDirection?.closingLine : 'See every approved photograph.'}</h2><button type="button" disabled={!galleryUnlocked} onClick={openGallery}>Open the full gallery<Images size={18} /></button></footer>
    </main>
    <AnimatePresence>{gallery && <DemoGallery photos={galleryPhotos} title={title} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={delivery} fontStyles={styles} {...galleryProps} singlePhoto={!galleryUnlocked} />}</AnimatePresence>
  </div>;
}
