import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BriefcaseBusiness, CalendarRange, Download, FileCheck2, Images, MapPin, Users } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';
import {
  DemoGallery,
  DemoHeader,
  editorialPhotos,
  getFormatThemeStyles,
  normalizeDeliveryPhotos,
  weddingPhotos
} from '../../pages/FormatDemo.jsx';
import './EventCampaignViewers.css';

function splitIntoGroups(photos, wantedGroups) {
  const count = Math.max(1, Math.min(wantedGroups, photos.length));
  const groups = Array.from({ length: count }, () => []);
  photos.forEach((photo, index) => groups[index % count].push(photo));
  return groups.filter(group => group.length);
}

function resolveSections(delivery, photos, fallbackTitles) {
  const source = delivery?.creativeDirection?.sections || delivery?.formatConfig?.sections || [];
  const byId = new Map(photos.map(photo => [String(photo.assetId || photo.name), photo]));
  const generated = source.map((section, index) => {
    const assigned = (section.assetIds || section.photoIds || []).map(id => byId.get(String(id))).filter(Boolean);
    return {
      id: section.id || `section-${index + 1}`,
      title: section.title || section.name || section.headline || fallbackTitles[index % fallbackTitles.length],
      copy: section.copy || section.caption || section.description || '',
      photos: assigned
    };
  }).filter(section => section.photos.length);

  if (generated.length) return generated;
  return splitIntoGroups(photos, Math.min(fallbackTitles.length, 4)).map((group, index) => ({
    id: `section-${index + 1}`,
    title: fallbackTitles[index % fallbackTitles.length],
    copy: '',
    photos: group
  }));
}

function OpeningPhoto({ photo, alt }) {
  return <Photo name={photo?.name} url={photo?.url} srcSet={photo?.srcSet} alt={photo?.alt || alt} eager sizes="100vw" />;
}

export function EventCoverageViewer({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const reduced = useReducedMotion();
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const photos = useMemo(() => normalizeDeliveryPhotos(delivery, weddingPhotos), [delivery]);
  const sections = useMemo(() => resolveSections(delivery, photos, ['Arrivals', 'The gathering', 'On stage', 'People and details']), [delivery, photos]);
  const title = delivery?.title || delivery?.clientName || 'The day, as it happened';
  const studio = delivery?.branding?.name || 'Veylo Studio';
  const opening = delivery?.creativeDirection?.openingLine || delivery?.brief || 'A clear record of the people, atmosphere, and moments that shaped the event.';
  const styles = getFormatThemeStyles(delivery, { bg: '#080b0d', surface: '#101417', text: '#f4efe8', accent: '#dba56f', fontDisplay: "'Outfit', sans-serif" });

  const openPhoto = photo => {
    setGalleryIndex(Math.max(0, photos.indexOf(photo)));
    setGallery(true);
    onNarrationNavigate?.(photo.assetId);
  };

  return <div className="fd-page vec-viewer vec-event" data-composition={styles['--fd-composition']} data-accent-placement={styles['--fd-accent-placement']} style={styles}>
    <DemoHeader format="Event Coverage" client={title} sectionId="event-coverage" onGallery={() => { setGalleryIndex(null); setGallery(true); }} delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    <main>
      <section className="vec-event-hero">
        <motion.figure initial={reduced ? false : { opacity: 0, scale: 1.035 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : 1.05, ease: [.22, 1, .36, 1] }}>
          <OpeningPhoto photo={photos[0]} alt="Event opening photograph" />
          <i />
        </motion.figure>
        <motion.div initial={reduced ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .18 }}>
          <span><CalendarRange size={14} /> EVENT COVERAGE</span>
          <h1>{title}</h1>
          <p>{opening}</p>
          <button type="button" onClick={() => document.getElementById('event-scenes')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })}>Browse the scenes<ArrowRight size={17} /></button>
        </motion.div>
      </section>

      <section className="vec-event-summary" aria-label="Event summary">
        <div><Images size={19} /><strong>{photos.length}</strong><span>finished photographs</span></div>
        <div><Users size={19} /><strong>{sections.length}</strong><span>event scenes</span></div>
        <div><MapPin size={19} /><strong>{delivery?.shootType || 'Event'}</strong><span>coverage type</span></div>
      </section>

      <section id="event-scenes" className="vec-event-scenes">
        <header><span>THE COMPLETE EVENT</span><h2>Move through the day by scene.</h2></header>
        {sections.map((section, sectionIndex) => <motion.article key={section.id} initial={reduced ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }} transition={{ duration: reduced ? 0 : .6 }}>
          <div className="vec-scene-copy"><span>{String(sectionIndex + 1).padStart(2, '0')}</span><div><h3>{section.title}</h3>{section.copy && <p>{section.copy}</p>}</div><b>{section.photos.length} photos</b></div>
          <div className={`vec-scene-grid is-count-${Math.min(section.photos.length, 4)}`}>
            {section.photos.slice(0, 4).map((photo, index) => <button type="button" key={photo.assetId || photo.name || index} onClick={() => openPhoto(photo)} aria-label={`Open ${section.title} photograph ${index + 1}`}>
              <Photo name={photo.name} url={photo.url} srcSet={photo.srcSet} alt={photo.alt || photo.caption || ''} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 31vw" />
              <small className="vec-photo-caption">{photo.caption}</small>
              {index === 3 && section.photos.length > 4 && <span>+{section.photos.length - 4} more</span>}
            </button>)}
          </div>
        </motion.article>)}
      </section>

      <footer className="vec-event-close"><span>{studio}</span><h2>Every scene is here.</h2><button type="button" onClick={() => { setGalleryIndex(null); setGallery(true); }}>Open all {photos.length} photographs<Images size={18} /></button></footer>
    </main>
    <AnimatePresence>{gallery && <DemoGallery photos={photos} title={title} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={delivery} {...galleryProps} />}</AnimatePresence>
  </div>;
}

export function CampaignDeliveryViewer({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const reduced = useReducedMotion();
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const photos = useMemo(() => normalizeDeliveryPhotos(delivery, editorialPhotos), [delivery]);
  const sets = useMemo(() => resolveSections(delivery, photos, ['Campaign selects', 'Social and web', 'Editorial crops', 'Complete assets']), [delivery, photos]);
  const title = delivery?.title || delivery?.clientName || 'Campaign handoff';
  const client = delivery?.clientName || 'Campaign team';
  const statement = delivery?.creativeDirection?.openingLine || delivery?.brief || 'The approved campaign, presented with the same care as the photographs and organised for the people using them.';
  const usage = delivery?.formatConfig?.usageTerms || 'Usage terms are supplied by the photographer. Contact the studio before any use outside the agreed brief.';
  const styles = getFormatThemeStyles(delivery, { bg: '#090908', surface: '#141411', text: '#f3f0e8', accent: '#d9c270', fontDisplay: "'Playfair Display', Georgia, serif" });

  const openPhoto = photo => {
    setGalleryIndex(Math.max(0, photos.indexOf(photo)));
    setGallery(true);
    onNarrationNavigate?.(photo.assetId);
  };

  return <div className="fd-page vec-viewer vec-campaign" data-composition={styles['--fd-composition']} data-accent-placement={styles['--fd-accent-placement']} style={styles}>
    <DemoHeader format="Campaign Delivery" client={title} sectionId="campaign" onGallery={() => { setGalleryIndex(null); setGallery(true); }} light delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    <main>
      <section className="vec-campaign-hero">
        <div className="vec-campaign-number">01 <span>/ CAMPAIGN</span></div>
        <motion.div initial={reduced ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .75 }}><span>FINAL ASSET DELIVERY</span><h1>{title}</h1><p>{statement}</p><small>Prepared for {client}</small></motion.div>
        <motion.figure initial={reduced ? false : { opacity: 0, clipPath: 'inset(0 0 12% 0)' }} animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: reduced ? 0 : .9, delay: reduced ? 0 : .14 }}><OpeningPhoto photo={photos[0]} alt="Campaign lead photograph" /></motion.figure>
      </section>

      <section className="vec-campaign-note"><BriefcaseBusiness size={21} /><p>{delivery?.creativeDirection?.closingLine || 'Review the campaign first. The organised files and photographer-supplied terms follow below.'}</p></section>

      <section className="vec-campaign-sets">
        <header><span>02 / APPROVED WORK</span><h2>Asset sets</h2><p>Each set keeps related photographs together, so the client can find the right file without searching through a loose folder.</p></header>
        <div>{sets.map((set, setIndex) => <motion.article key={set.id} initial={reduced ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .14 }} transition={{ duration: reduced ? 0 : .55, delay: reduced ? 0 : setIndex * .04 }}>
          <button type="button" onClick={() => openPhoto(set.photos[0])} aria-label={`Open ${set.title}`}><Photo name={set.photos[0]?.name} url={set.photos[0]?.url} srcSet={set.photos[0]?.srcSet} alt={set.photos[0]?.alt || ''} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 31vw" /><span>{String(setIndex + 1).padStart(2, '0')}</span></button>
           <div><h3>{set.title}</h3>{set.copy && <p>{set.copy}</p>}<p className="vec-photo-caption">{set.photos[0]?.caption}</p><span>{set.photos.length} approved files</span></div>
        </motion.article>)}</div>
      </section>

      <section className="vec-campaign-handoff">
        <div><span>03 / HANDOFF</span><h2>Ready for the team.</h2><p>{photos.length} final photographs are available in the complete gallery.</p>{galleryProps?.onDownloadAll && delivery?.access?.allowDownloadAll !== false && <button type="button" onClick={galleryProps.onDownloadAll} disabled={Boolean(galleryProps.busy)}>{galleryProps.busy === 'all' ? 'Starting downloads...' : 'Download all photos'}<Download size={17} /></button>}</div>
        <aside><FileCheck2 size={23} /><span>USAGE TERMS</span><p>{usage}</p></aside>
      </section>

      <footer className="vec-campaign-close"><span>04 / COMPLETE COLLECTION</span><h2>See every approved photograph.</h2><button type="button" onClick={() => { setGalleryIndex(null); setGallery(true); }}>Open the full gallery<Images size={18} /></button></footer>
    </main>
    <AnimatePresence>{gallery && <DemoGallery photos={photos} title={title} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={delivery} {...galleryProps} />}</AnimatePresence>
  </div>;
}
