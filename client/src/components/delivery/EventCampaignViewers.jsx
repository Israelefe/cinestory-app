import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BriefcaseBusiness, CalendarRange, Download, FileCheck2, Images, MapPin, Users } from 'lucide-react';
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
  return `event-scene-${slug || index + 1}`;
}

function campaignAnchorId(section, index) {
  const slug = String(section?.id || section?.title || `set-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `campaign-set-${slug || index + 1}`;
}

function OpeningPhoto({ photo, alt }) {
  return <Photo name={photo?.name} url={photo?.url} srcSet={photo?.srcSet} alt={photo?.alt || alt} style={photo?.focalPoint ? { objectPosition: photo.focalPoint } : undefined} eager sizes="100vw" />;
}

export function EventCoverageViewer({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const reduced = useReducedMotion();
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const photos = useMemo(() => normalizeDeliveryPhotos(delivery, eventCoveragePhotos), [delivery]);
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
    setGalleryIndex(Math.max(0, photos.indexOf(photo)));
    setGallery(true);
    onNarrationNavigate?.(photo.assetId);
  };

  return <div className="fd-page vec-viewer vec-event" data-composition={styles['--fd-composition']} data-accent-placement={styles['--fd-accent-placement']} data-pace={styles['--fd-pace']} style={styles}>
    <DemoHeader format="Event Coverage" client={title} sectionId="event-coverage" onGallery={() => { setGalleryIndex(null); setGallery(true); }} delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    <main>
      <section className="vec-event-hero">
        <motion.figure {...formatFrameAttributes(photos[0])} style={formatFrameStyle(photos[0])} initial={reduced ? false : { opacity: 0, scale: 1.035 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : 1.05, ease: [.22, 1, .36, 1] }}>
          <motion.div className="vec-frame-motion" animate={frameMotionValues(photos[0], reduced)} transition={frameMotionTransition(photos[0], 0, reduced)}><OpeningPhoto photo={photos[0]} alt="Event opening photograph" /></motion.div>
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
        <div><Images size={19} /><strong>{photos.length}</strong><span>finished photographs</span></div>
        <div><Users size={19} /><strong>{sections.length}</strong><span>event scenes</span></div>
        <div><MapPin size={19} /><strong>{delivery?.shootType || 'Conference'}</strong><span>coverage type</span></div>
      </section>

      <section className="vec-event-tools" aria-label="Event navigation and actions">
        <div className="vec-event-tools-head">
          <div><span>FIND A MOMENT</span><strong>Go straight to a scene or open every photograph.</strong></div>
          <div className="vec-event-tools-actions">
            <button type="button" onClick={() => { setGalleryIndex(null); setGallery(true); }}><Images size={15} />Full gallery</button>
            {galleryProps?.onDownloadAll && delivery?.access?.allowDownloadAll !== false && <button type="button" onClick={galleryProps.onDownloadAll} disabled={Boolean(galleryProps.busy)}><Download size={15} />{galleryProps.busy === 'all' ? 'Preparing…' : 'Download all'}</button>}
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

      <footer className="vec-event-close"><span>{studio}</span><h2>The whole day, in one place.</h2><button type="button" onClick={() => { setGalleryIndex(null); setGallery(true); }}>Open all {photos.length} photographs<Images size={18} /></button></footer>
    </main>
    <AnimatePresence>{gallery && <DemoGallery photos={photos} title={title} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={delivery} {...galleryProps} />}</AnimatePresence>
  </div>;
}

export function CampaignDeliveryViewer({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const reduced = useReducedMotion();
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const photos = useMemo(() => normalizeDeliveryPhotos(delivery, campaignPhotos), [delivery]);
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
  const heroPhoto = photos.find(photo => photo.campaignType === 'hero') || photos[0];
  const statement = delivery?.creativeDirection?.openingLine || delivery?.brief || 'A clear campaign presentation first, followed by an organised handoff that makes the right file easy to find and use.';
  const usage = delivery?.formatConfig?.usageTerms || 'Usage terms are supplied by the photographer. Contact the studio before any use outside the agreed brief.';
  const styles = getFormatThemeStyles(delivery, { bg: '#090908', surface: '#141411', text: '#f3f0e8', accent: '#d9c270', fontDisplay: "'Playfair Display', Georgia, serif" });

  const openPhoto = photo => {
    setGalleryIndex(Math.max(0, photos.indexOf(photo)));
    setGallery(true);
    onNarrationNavigate?.(photo.assetId);
  };

  return <div className="fd-page vec-viewer vec-campaign" data-composition={styles['--fd-composition']} data-accent-placement={styles['--fd-accent-placement']} data-pace={styles['--fd-pace']} style={styles}>
    <DemoHeader format="Campaign Delivery" client={title} sectionId="campaign" onGallery={() => { setGalleryIndex(null); setGallery(true); }} light delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
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
            <button type="button" onClick={() => { setGalleryIndex(null); setGallery(true); }}><Images size={15} />Full gallery</button>
            {galleryProps?.onDownloadAll && delivery?.access?.allowDownloadAll !== false && <button type="button" onClick={galleryProps.onDownloadAll} disabled={Boolean(galleryProps.busy)}><Download size={15} />{galleryProps.busy === 'all' ? 'Preparing…' : 'Download all'}</button>}
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

      <section className="vec-campaign-handoff">
        <div><span>03 / HANDOFF</span><h2>Ready for the team.</h2><p>{photos.length} final photographs are available in the complete gallery, with the campaign sets kept in the order they are meant to be used.</p>{galleryProps?.onDownloadAll && delivery?.access?.allowDownloadAll !== false && <button type="button" onClick={galleryProps.onDownloadAll} disabled={Boolean(galleryProps.busy)}>{galleryProps.busy === 'all' ? 'Starting downloads...' : 'Download all photos'}<Download size={17} /></button>}</div>
        <aside><FileCheck2 size={23} /><span>USAGE TERMS</span><p>{usage}</p><div className="vec-handoff-notes"><span>MASTER</span><span>WEB CROP</span><span>SOCIAL CROP</span></div></aside>
      </section>

      <footer className="vec-campaign-close"><span>04 / COMPLETE COLLECTION</span><h2>See every approved photograph.</h2><button type="button" onClick={() => { setGalleryIndex(null); setGallery(true); }}>Open the full gallery<Images size={18} /></button></footer>
    </main>
    <AnimatePresence>{gallery && <DemoGallery photos={photos} title={title} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={delivery} {...galleryProps} />}</AnimatePresence>
  </div>;
}
