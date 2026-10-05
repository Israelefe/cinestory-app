import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useInView } from 'framer-motion';
import { ArrowUpRight, Camera, Download, FileCheck2, Images, Pause, Play } from 'lucide-react';
import { DELIVERY_DEMO_DIMENSIONS } from '../../constants/deliveryDemoMetadata.js';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { useClosingGallery } from '../../utils/useClosingGallery.js';
import { Photo } from '../PublicDesign.jsx';
import { DemoGallery, DemoHeader, campaignPhotos, formatFrameAttributes, formatFrameStyle, frameMotionTransition, frameMotionValues, getFormatThemeStyles, normalizeDeliveryPhotos } from '../../pages/FormatDemo.jsx';
import './CampaignDelivery.css';

const reveal = {
  initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: .12 }, transition: { duration: .6, ease: [.22, 1, .36, 1] }
};

function PhotoMotion({ photo, index = 0, paused, children }) {
  const ref = useRef(null);
  const visible = useInView(ref);
  const controls = useAnimationControls();
  const reduced = useVeyloReducedMotion();
  const motionName = photo?.motion;
  useEffect(() => {
    if (reduced || motionName === 'still') controls.set({ scale: 1, x: 0, y: 0 });
    else if (visible && !paused) controls.start({ ...frameMotionValues({ motion: motionName }), transition: frameMotionTransition({ motion: motionName }, index) });
    else controls.stop();
    return () => controls.stop();
  }, [controls, visible, paused, reduced, motionName, index]);
  return <motion.div ref={ref} className="vec-frame-motion" initial={false} animate={controls}>{children}</motion.div>;
}

function PhotoCard({ photo, index, paused, onOpen, label, sizes }) {
  return <motion.button type="button" className="vec-campaign-photo" {...formatFrameAttributes(photo)} style={formatFrameStyle(photo)} onClick={() => onOpen(photo)} aria-label={label}
    {...reveal} transition={{ ...reveal.transition, delay: Math.min(index * .06, .18) }}>
    <div className="vec-campaign-photo-image">
      <PhotoMotion photo={photo} index={index} paused={paused}>
        <Photo name={photo.name} url={photo.url} srcSet={photo.srcSet} alt={photo.alt || ''} style={photo.focalPoint ? { objectPosition: photo.focalPoint } : undefined} sizes={sizes} />
      </PhotoMotion>
      <span className="vec-campaign-photo-open" aria-hidden="true"><ArrowUpRight size={18} /></span>
    </div>
    <div className="vec-campaign-photo-copy"><span>{photo.headline || photo.assetType || `Photograph ${String(index + 1).padStart(2, '0')}`}</span>{photo.caption && <p>{photo.caption}</p>}</div>
  </motion.button>;
}

function anchorId(set) {
  return `campaign-set-${String(set.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function CampaignDeliveryViewer({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [activeSet, setActiveSet] = useState(null);
  const [motionPaused, setMotionPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const navigationRef = useRef(null);
  const photos = useMemo(() => normalizeDeliveryPhotos(delivery, campaignPhotos), [delivery]);
  const galleryPhotos = useMemo(() => delivery?.schemaVersion === 3 ? normalizeDeliveryPhotos(delivery, campaignPhotos, true) : photos, [delivery, photos]);
  const { galleryUnlocked, closingRef } = useClosingGallery(`${delivery?.publicId || delivery?._id || 'campaign-demo'}:${photos.map(photo => photo.assetId || photo.name).join('|')}`);
  const sets = useMemo(() => resolveCampaignSets(delivery, photos), [delivery, photos]);
  const highlights = useMemo(() => {
    const ids = delivery?.formatConfig?.campaign?.highlightAssetIds || [];
    const byId = new Map(photos.map(photo => [String(photo.assetId), photo]));
    const selected = ids.map(id => byId.get(String(id))).filter(Boolean);
    return selected.length ? selected : photos.slice(0, 4);
  }, [delivery, photos]);
  const title = delivery?.title || delivery?.clientName || 'Carry it forward';
  const client = delivery?.clientName || 'Campaign team';
  const heroPhoto = delivery?.schemaVersion === 3 ? galleryPhotos.find(photo => photo.assetId === delivery.v3?.openingAssetId) || photos[0] : photos.find(photo => photo.campaignType === 'hero') || photos[0];
  const heroDimensions = heroPhoto?.width && heroPhoto?.height ? heroPhoto : DELIVERY_DEMO_DIMENSIONS[heroPhoto?.name];
  const hasPhotoMotion = [heroPhoto, ...photos].some(photo => photo && photo.motion !== 'still');
  const pausePhotos = motionPaused || !pageVisible || gallery;
  const closingPhoto = delivery?.schemaVersion === 3 ? galleryPhotos.find(photo => photo.assetId === delivery.v3?.closingAssetId) : null;
  const statement = delivery?.creativeDirection?.openingLine || delivery?.brief || 'Your finished campaign photographs, organised into sets. Take a look through the work, then open the complete gallery.';
  const usage = delivery?.formatConfig?.usageTerms || 'Contact the studio to confirm the agreed uses before publishing these photographs.';
  const styles = getFormatThemeStyles(delivery, { bg: '#070709', surface: '#0c0c10', text: '#f3f0e8', accent: '#ff9b8e', fontDisplay: "'Playfair Display', Georgia, serif" });
  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    setActiveSet(sets[0]?.id || null);
    if (!('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(entries => {
      const entry = entries.filter(item => item.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (entry) setActiveSet(entry.target.dataset.setId);
    }, { rootMargin: '-20% 0px -45% 0px', threshold: 0 });
    sets.forEach(set => {
      const element = document.getElementById(anchorId(set));
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [sets]);

  useEffect(() => {
    const nav = navigationRef.current;
    const link = nav?.querySelector('[aria-current="location"]');
    if (!link) return;
    // Reveal the active link horizontally without changing the page position.
    nav.scrollTo({ left: Math.max(0, link.offsetLeft - nav.clientWidth / 2 + link.offsetWidth / 2), behavior: 'smooth' });
  }, [activeSet]);

  const openGallery = () => { if (!galleryUnlocked) return; setGalleryIndex(null); setGallery(true); };
  const openPhoto = photo => {
    setGalleryIndex(Math.max(0, galleryPhotos.findIndex(item => item.assetId ? item.assetId === photo.assetId : item.name === photo.name)));
    setGallery(true);
    onNarrationNavigate?.(photo.assetId);
  };
  const canDownloadAll = galleryUnlocked && galleryProps?.onDownloadAll && delivery?.access?.allowDownloadAll !== false;
  const downloadAll = () => { if (canDownloadAll && !galleryProps.busy) galleryProps.onDownloadAll(); };

  return <div className="fd-page vec-viewer vec-campaign" data-photo-motion-paused={pausePhotos} data-composition={styles['--fd-composition']} data-accent-placement={styles['--fd-accent-placement']} data-pace={styles['--fd-pace']} style={styles}>
    <DemoHeader format="Campaign Delivery" client={title} sectionId="campaign" delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    <main>
      <section className="vec-campaign-hero">
        <div className="vec-campaign-number">01 <span>/ THE CAMPAIGN</span></div>
        <motion.div className="vec-campaign-intro" {...formatFrameAttributes(heroPhoto)} style={formatFrameStyle(heroPhoto)} initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .75, ease: [.22, 1, .36, 1] }}>
          <span>CAMPAIGN DELIVERY</span><h1>{title}</h1><p>{statement}</p><small>Prepared for {client}</small>
        </motion.div>
        <motion.figure {...formatFrameAttributes(heroPhoto)} style={formatFrameStyle(heroPhoto)} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .9, delay: .12, ease: [.22, 1, .36, 1] }}>
          <div className="vec-campaign-hero-image" style={heroDimensions ? { aspectRatio: `${heroDimensions.width} / ${heroDimensions.height}` } : undefined}><PhotoMotion photo={heroPhoto} paused={pausePhotos}><Photo name={heroPhoto?.name} url={heroPhoto?.url} srcSet={heroPhoto?.srcSet} alt={heroPhoto?.alt || 'Campaign lead photograph'} style={heroPhoto?.focalPoint ? { objectPosition: heroPhoto.focalPoint } : undefined} eager sizes="(max-width: 767px) 92vw, 48vw" /></PhotoMotion></div>
          <figcaption><span>{heroPhoto?.headline || 'Lead photograph'}</span></figcaption>
        </motion.figure>
      </section>

      <section className="vec-campaign-summary" aria-label="Campaign summary">
        <div><Images size={19} aria-hidden="true" /><p><strong>{galleryPhotos.length}</strong><span>finished photographs</span></p></div>
        <div><FileCheck2 size={19} aria-hidden="true" /><p><strong>{sets.length}</strong><span>photo {sets.length === 1 ? 'set' : 'sets'}</span></p></div>
        <div><Camera size={19} aria-hidden="true" /><p><strong>{delivery?.branding?.name || 'Veylo Studio'}</strong><span>photographed by</span></p></div>
      </section>

      <section className="vec-campaign-tools" aria-label="Campaign set navigation">
        <div className="vec-campaign-tools-head">
          <div><span>THE COLLECTION</span><strong>Find your photo set</strong></div>
        </div>
        <nav ref={navigationRef} className="vec-campaign-set-nav" aria-label="Campaign asset sets">
          {sets.map(set => <a key={set.id} href={`#${anchorId(set)}`} aria-current={activeSet === set.id ? 'location' : undefined} onClick={event => { event.preventDefault(); setActiveSet(set.id); document.getElementById(anchorId(set))?.scrollIntoView({ behavior: 'smooth' }); }}><span>{String(sets.findIndex(item => item.id === set.id) + 1).padStart(2, '0')}</span>{set.title}</a>)}
        </nav>
      </section>

      <section className="vec-campaign-highlights" aria-label="Campaign highlights">
        <motion.header {...reveal}><span>A FIRST LOOK</span><h2>A few frames to start with.</h2><p>Open any photograph for a closer look.</p>{hasPhotoMotion && <button className="vec-campaign-motion-toggle" type="button" onClick={() => setMotionPaused(value => !value)} aria-pressed={motionPaused}>{motionPaused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}{motionPaused ? 'Resume photo motion' : 'Pause photo motion'}</button>}</motion.header>
        <div className="vec-campaign-highlight-grid">
          {highlights.map((photo, index) => <PhotoCard key={photo.assetId || photo.name || index} photo={photo} index={index} paused={pausePhotos} onOpen={openPhoto} label={`Open campaign highlight ${index + 1}`} sizes="(max-width: 640px) 82vw, (max-width: 1024px) 44vw, 22vw" />)}
        </div>
      </section>

      <section id="campaign-sets" className="vec-campaign-sets">
        <motion.header {...reveal}><span>02 / THE PHOTO SETS</span><h2>The work, in detail.</h2><p>Browse the photographs by set. Your complete gallery follows at the end.</p></motion.header>
        <div className="vec-campaign-set-list">{sets.map((set, setIndex) => <motion.article id={anchorId(set)} data-set-id={set.id} data-layout={set.layout || 'grid'} key={set.id} style={set.accent ? { '--section-accent': set.accent } : undefined} {...reveal}>
          <button className="vec-campaign-set-lead" type="button" {...formatFrameAttributes(set.photos[0])} style={formatFrameStyle(set.photos[0])} onClick={() => openPhoto(set.photos[0])} aria-label={`Open ${set.title}`}><PhotoMotion photo={set.photos[0]} index={setIndex} paused={pausePhotos}><Photo name={set.photos[0].name} url={set.photos[0].url} srcSet={set.photos[0].srcSet} alt={set.photos[0].alt || ''} style={set.photos[0].focalPoint ? { objectPosition: set.photos[0].focalPoint } : undefined} sizes="(max-width: 767px) 92vw, 46vw" /></PhotoMotion><span>{String(sets.findIndex(item => item.id === set.id) + 1).padStart(2, '0')}</span><small>View photograph<ArrowUpRight size={16} aria-hidden="true" /></small></button>
          <div className="vec-campaign-set-copy" {...formatFrameAttributes(set.photos[0])} style={formatFrameStyle(set.photos[0])}>{set.label && <small className="vec-set-label">{set.label}</small>}<h3>{set.title}</h3>{set.copy && <p>{set.copy}</p>}{set.photos[0].caption && <p className="vec-photo-caption">{set.photos[0].caption}</p>}<span>{set.photos.length} {set.photos.length === 1 ? 'photograph' : 'photographs'}</span></div>
          {set.photos.length > 1 && <div className="vec-campaign-set-support" aria-label={`${set.title} supporting photographs`}>
            {set.photos.slice(1).map((photo, index) => <PhotoCard key={photo.assetId || photo.name || index} photo={photo} index={index} paused={pausePhotos} onOpen={openPhoto} label={`Open ${set.title} supporting photograph ${index + 1}`} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 44vw, 30vw" />)}
          </div>}
        </motion.article>)}</div>
      </section>

      <section ref={closingRef} className="vec-campaign-handoff">
        <motion.div {...reveal}><span>03 / YOUR FILES</span><h2>Ready for the team.</h2><p>Browse every photograph in the complete gallery, with the campaign sets kept in order.</p><button type="button" onClick={openGallery} disabled={!galleryUnlocked}>Open the full gallery<Images size={17} aria-hidden="true" /></button>{canDownloadAll && <button type="button" onClick={downloadAll} disabled={Boolean(galleryProps.busy)} aria-busy={galleryProps.busy === 'all'}>{galleryProps.busy === 'all' ? 'Starting downloads...' : 'Download all photos'}<Download size={17} aria-hidden="true" /></button>}</motion.div>
        <motion.aside {...reveal}><FileCheck2 size={23} aria-hidden="true" /><span>USAGE TERMS</span><p>{usage}</p></motion.aside>
      </section>

      <footer className="vec-campaign-close">{closingPhoto && <img className="vec-v3-bookend-photo" src={closingPhoto.url} alt="" loading="lazy" />}<motion.div {...reveal}><span>04 / COMPLETE COLLECTION</span><h2>{delivery?.creativeDirection?.closingLine || 'Every photograph, together.'}</h2></motion.div></footer>
    </main>
    <AnimatePresence>{gallery && <DemoGallery photos={galleryPhotos} title={title} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={delivery} fontStyles={styles} {...galleryProps} singlePhoto={!galleryUnlocked} />}</AnimatePresence>
  </div>;
}

// Sections remain in the photographer's order. Legacy deliveries keep their
// existing grouping, and explicit file sets can also drive the presentation.
function resolveCampaignSets(delivery, photos) {
  const byId = new Map(photos.map(photo => [String(photo.assetId || photo.name), photo]));
  const source = delivery?.creativeDirection?.sections || delivery?.formatConfig?.sections || [];
  const fileSets = delivery?.formatConfig?.campaign?.fileSets || [];
  const assigned = (source.length ? source : fileSets).map((set, index) => ({
    id: set.id || `set-${index + 1}`, title: set.title || set.name || set.headline || `Photo set ${index + 1}`,
    copy: set.copy || set.subtitle || set.body || set.caption || set.description || '', label: set.label || set.eyebrow || '',
    layout: set.layout || 'grid', accent: set.accent || '',
    photos: (set.assetIds || set.photoIds || []).map(id => byId.get(String(id))).filter(Boolean)
  })).filter(set => set.photos.length);
  if (assigned.length) return assigned;
  if (!delivery) return [
    ['hero', 'Lead photographs', 'The lead photograph introduces the collection.'],
    ['detail', 'Craft and detail', 'A closer look at the stitching, material, and finish.'],
    ['lifestyle', 'In use', 'The bag photographed in everyday settings.'],
    ['kit', 'The collection', 'The pieces, packaging, and supporting photographs.'],
    ['context', 'Around the day', 'More photographs from the campaign.']
  ].map(([type, title, copy]) => ({ id: `campaign-${type}`, title, copy, photos: photos.filter(photo => photo.campaignType === type) })).filter(set => set.photos.length);
  const types = [...new Set(photos.map(photo => photo.campaignType).filter(Boolean))];
  if (types.length) return [...types.map(type => ({ id: `campaign-${type}`, title: `${type[0].toUpperCase()}${type.slice(1)} photographs`, photos: photos.filter(photo => photo.campaignType === type) })), { id: 'campaign-more', title: 'More photographs', photos: photos.filter(photo => !photo.campaignType) }].filter(set => set.photos.length);
  const groups = Array.from({ length: Math.max(1, Math.min(3, photos.length)) }, () => []);
  photos.forEach((photo, index) => groups[index % groups.length].push(photo));
  return groups.filter(group => group.length).map((group, index) => ({ id: `set-${index + 1}`, title: `Photo set ${index + 1}`, photos: group }));
}
