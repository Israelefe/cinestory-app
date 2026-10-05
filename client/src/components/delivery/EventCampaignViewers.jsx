import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { ArrowRight, CalendarRange, Download, Images, MapPin, Users } from 'lucide-react';
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
      copy: section.copy || section.subtitle || section.caption || section.description || fallback.copy || '',
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
  return `event-scene-${slug || index + 1}`;
}

function OpeningPhoto({ photo, alt }) {
  return <Photo name={photo?.name} url={photo?.url} srcSet={photo?.srcSet} alt={photo?.alt || alt} style={photo?.focalPoint ? { objectPosition: photo.focalPoint } : undefined} eager sizes="100vw" />;
}

export function EventCoverageViewer({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const reduced = useVeyloReducedMotion();
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const openGallery = () => { if (!galleryUnlocked) return; setGalleryIndex(null); setGallery(true); };
  const photos = useMemo(() => normalizeDeliveryPhotos(delivery, eventCoveragePhotos), [delivery]);
  const galleryPhotos = useMemo(() => delivery?.schemaVersion === 3 ? normalizeDeliveryPhotos(delivery, eventCoveragePhotos, true) : photos, [delivery, photos]);
  const { galleryUnlocked, closingRef } = useClosingGallery(`${delivery?.publicId || delivery?._id || 'event-demo'}:${photos.map(photo => photo.assetId || photo.name).join('|')}`);
  const openingPhoto = delivery?.schemaVersion === 3 ? galleryPhotos.find(photo => photo.assetId === delivery.v3?.openingAssetId) || photos[0] : photos[0];
  const closingPhoto = delivery?.schemaVersion === 3 ? galleryPhotos.find(photo => photo.assetId === delivery.v3?.closingAssetId) : null;
  const sections = useMemo(() => resolveSections(delivery, photos, [
    { title: 'Arrivals and check-in', copy: 'The room takes shape as people arrive, find their bearings, and start the first conversations.', label: 'OPENING SCENE', delivery: 'WELCOME' },
    { title: 'The main programme', copy: 'A shared point of focus: the speaker, the audience, and the room listening together.', label: 'PROGRAMME', delivery: 'KEY MOMENTS' },
    { title: 'Between sessions', copy: 'The useful exchanges happen in the pauses, away from the stage and close to the people.', label: 'IN BETWEEN', delivery: 'CANDIDS' },
    { title: 'On stage', copy: 'The programme lifts the room and everyone becomes part of the record.', label: 'THE ROOM MOVES', delivery: 'HIGHLIGHTS' },
    { title: 'Details and atmosphere', copy: 'Badges, tables, light, and the small preparations that make the gathering feel complete.', label: 'THE DETAILS', delivery: 'ATMOSPHERE' }
  ]), [delivery, photos]);
  const title = delivery?.title || delivery?.clientName || 'A day in the room';
  const studio = delivery?.branding?.name || 'Veylo Studio';
  const opening = delivery?.creativeDirection?.openingLine || delivery?.brief || 'A complete record of the people, programme, and small moments that made the gathering feel like itself.';
  const styles = getFormatThemeStyles(delivery, { bg: '#080b0d', surface: '#101417', text: '#f4efe8', accent: '#dba56f', fontDisplay: "'Outfit', sans-serif" });
  const filterOptions = [
    ['all', 'All moments'],
    ['people', 'People'],
    ['programme', 'Programme'],
    ['networking', 'Networking'],
    ['details', 'Details']
  ];
  const hasEventTypes = photos.some(photo => photo.eventType);
  const visibleSections = sections
    .map(section => ({
      ...section,
      photos: !hasEventTypes || activeFilter === 'all'
        ? section.photos
        : section.photos.filter(photo => photo.eventType === activeFilter)
    }))
    .filter(section => section.photos.length);
  const highlights = photos.slice(0, 4);

  const openPhoto = photo => {
    setGalleryIndex(Math.max(0, galleryPhotos.findIndex(item => item.assetId ? item.assetId === photo.assetId : item.name === photo.name)));
    setGallery(true);
    onNarrationNavigate?.(photo.assetId);
  };

  return <div className="fd-page vec-viewer vec-event" data-composition={styles['--fd-composition']} data-accent-placement={styles['--fd-accent-placement']} data-pace={styles['--fd-pace']} style={styles}>
    <DemoHeader format="Event Coverage" client={title} sectionId="event-coverage" onGallery={galleryUnlocked ? openGallery : undefined} delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    <main>
      <section className="vec-event-hero">
        <motion.figure {...formatFrameAttributes(openingPhoto)} style={formatFrameStyle(openingPhoto)} initial={reduced ? false : { opacity: 0, scale: 1.035 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : 1.05, ease: [.22, 1, .36, 1] }}>
          <motion.div className="vec-frame-motion" animate={frameMotionValues(openingPhoto, reduced)} transition={frameMotionTransition(openingPhoto, 0, reduced)}><OpeningPhoto photo={openingPhoto} alt="Event opening photograph" /></motion.div>
          <i />
        </motion.figure>
        <motion.div {...formatFrameAttributes(photos[0])} style={formatFrameStyle(photos[0])} initial={reduced ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .18 }}>
          <span><CalendarRange size={14} /> EVENT COVERAGE</span>
          <h1>{title}</h1>
          <p>{opening}</p>
          <button type="button" onClick={() => document.getElementById('event-scenes')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })}>Browse the scenes<ArrowRight size={17} /></button>
        </motion.div>
      </section>

      <section className="vec-event-summary" aria-label="Event summary">
        <div><Images size={19} /><strong>{galleryPhotos.length}</strong><span>finished photographs</span></div>
        <div><Users size={19} /><strong>{sections.length}</strong><span>event scenes</span></div>
        <div><MapPin size={19} /><strong>{delivery?.shootType || 'Conference'}</strong><span>coverage type</span></div>
      </section>

      <section className="vec-event-tools" aria-label="Event navigation and actions">
        <div className="vec-event-tools-head">
          <div><span>FIND A MOMENT</span><strong>Choose a scene. Your full gallery follows the presentation.</strong></div>
          <div className="vec-event-tools-actions">
            {galleryUnlocked && <button type="button" onClick={openGallery}><Images size={15} />Full gallery</button>}
            {galleryUnlocked && galleryProps?.onDownloadAll && delivery?.access?.allowDownloadAll !== false && <button type="button" onClick={() => { if (galleryUnlocked) galleryProps.onDownloadAll(); }} disabled={Boolean(galleryProps.busy)}><Download size={15} />{galleryProps.busy === 'all' ? 'Preparing…' : 'Download all'}</button>}
          </div>
        </div>
        <nav className="vec-event-scene-nav" aria-label="Event scenes">
          {sections.map((section, index) => <a key={section.id} href={`#${sceneAnchorId(section, index)}`}><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</a>)}
        </nav>
      </section>

      <section className="vec-event-highlights" aria-label="Event highlights">
        <header><span>START HERE</span><h2>The moments that set the day in motion.</h2></header>
        <div className="vec-event-highlight-grid">
          {highlights.map((photo, index) => <button type="button" key={photo.assetId || photo.name || index} {...formatFrameAttributes(photo)} style={formatFrameStyle(photo)} onClick={() => openPhoto(photo)} aria-label={`Open highlight ${index + 1}`}>
            <motion.div className="vec-frame-motion" animate={frameMotionValues(photo, reduced)} transition={frameMotionTransition(photo, index, reduced)}><Photo name={photo.name} url={photo.url} srcSet={photo.srcSet} alt={photo.alt || `Event highlight ${index + 1}`} sizes="(max-width: 640px) 78vw, 23vw" /></motion.div>
            <span>{photo.caption || `Highlight ${String(index + 1).padStart(2, '0')}`}</span>
          </button>)}
        </div>
      </section>

      <section className="vec-event-manifesto" aria-label="Event coverage approach">
        <div><span>ONE EVENT / MANY PERSPECTIVES</span><h2>Nothing important gets lost in the crowd.</h2></div>
        <p>Event Coverage keeps the people, programme, atmosphere, and details together so guests can find the moment they came for without turning the delivery into one long, loose grid.</p>
      </section>

      <section id="event-scenes" className="vec-event-scenes">
        <header><span>THE COMPLETE EVENT</span><h2>Move through the day by scene.</h2></header>
        {hasEventTypes && <div className="vec-event-filters" role="group" aria-label="Filter event photographs">
          {filterOptions.map(([value, label]) => <button type="button" key={value} className={activeFilter === value ? 'is-active' : ''} onClick={() => setActiveFilter(value)} aria-pressed={activeFilter === value}>{label}</button>)}
        </div>}
        {visibleSections.map((section, sectionIndex) => <motion.article id={sceneAnchorId(section, sectionIndex)} data-layout={section.layout || 'grid'} key={section.id} style={section.accent ? { '--section-accent': section.accent } : undefined} initial={reduced ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }} transition={{ duration: reduced ? 0 : .6 }}>
          <div className="vec-scene-copy"><span>{String(sectionIndex + 1).padStart(2, '0')}</span><div>{section.label && <small>{section.label}</small>}<h3>{section.title}</h3>{section.copy && <p>{section.copy}</p>}</div><b>{section.photos.length} photos</b></div>
          <div className={`vec-scene-grid is-count-${Math.min(section.photos.length, 4)}`}>
            {section.photos.map((photo, index) => <button type="button" key={photo.assetId || photo.name || index} {...formatFrameAttributes(photo)} style={formatFrameStyle(photo)} onClick={() => openPhoto(photo)} aria-label={`Open ${section.title} photograph ${index + 1}`}>
              <motion.span className="vec-scene-image vec-frame-motion" animate={frameMotionValues(photo, reduced)} transition={frameMotionTransition(photo, index, reduced)}><Photo name={photo.name} url={photo.url} srcSet={photo.srcSet} alt={photo.alt || photo.caption || ''} style={photo.focalPoint ? { objectPosition: photo.focalPoint } : undefined} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 31vw" /></motion.span>
              <small className="vec-photo-caption">{photo.caption}</small>
            </button>)}
          </div>
        </motion.article>)}
      </section>

      <footer ref={closingRef} className="vec-event-close">{closingPhoto && <img className="vec-v3-bookend-photo" src={closingPhoto.url} alt="" />}<span>{studio}</span><h2>{delivery?.schemaVersion === 3 ? delivery?.creativeDirection?.closingLine : 'The whole day, in one place.'}</h2><button type="button" disabled={!galleryUnlocked} onClick={openGallery}>Open all {galleryPhotos.length} photographs<Images size={18} /></button></footer>
    </main>
    <AnimatePresence>{gallery && <DemoGallery photos={galleryPhotos} title={title} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={delivery} fontStyles={styles} {...galleryProps} singlePhoto={!galleryUnlocked} />}</AnimatePresence>
  </div>;
}

export { CampaignDeliveryViewer } from './CampaignDeliveryViewer.jsx';
