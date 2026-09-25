import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Grid2X2, Pause, Play, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import ClientGallery from './ClientGallery.jsx';
import { API_BASE_URL } from '../../config/env.js';
import './PresentationViewer.css';

const mediaUrl = url => url?.startsWith('/api/') ? `${API_BASE_URL.replace(/\/$/, '')}${url.slice(4)}` : url;
function Photograph({ photo, eager = false, moving = false, paused = false, onReady }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setFailed(false); setAttempt(0); }, [photo?.url]);
  if (!photo) return null;
  if (failed) return <span className="dp-photo-retry" role="status">This photograph hasn’t loaded yet.<button onClick={() => { setAttempt(n => n + 1); setFailed(false); }}>Load photograph</button></span>;
  return <img key={`${photo.assetId}:${attempt}`} className={moving ? 'dp-moving-photo' : ''} style={{ animationPlayState: paused ? 'paused' : 'running' }} src={mediaUrl(photo.url)} srcSet={photo.srcSet} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 85vw, 70vw" alt={photo.alt || 'Finished photograph'} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" onLoad={() => onReady?.(photo.assetId)} onError={() => setFailed(true)} />;
}

function SequentialPresentation({ delivery, photos, mode, openGallery, galleryOpen }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [readyPhoto, setReadyPhoto] = useState(null);
  const soundtrack = useRef(null); const narration = useRef(null);
  const photo = photos[index];
  const segment = delivery.narration?.segments?.find(item => item.assetIds?.includes(photo?.assetId));
  const duration = Math.max(3.5, Math.min(5, Number(photo?.durationSec || 4.2)), segment && !muted ? Number(segment.endSec) - Number(segment.startSec) + .4 : 0);
  const step = direction => { setFinished(false); setIndex(value => Math.max(0, Math.min(photos.length - 1, value + direction))); };
  useEffect(() => {
    if (index >= photos.length) setIndex(0);
    const preloads = photos.slice(index + 1, index + 3).map(next => { const image = new Image(); image.sizes = '(max-width: 640px) 92vw, (max-width: 1024px) 85vw, 70vw'; if (next.srcSet) image.srcset = next.srcSet; image.src = mediaUrl(next.url); return image; });
    return () => preloads.forEach(image => { image.src = ''; });
  }, [index, photos]);
  useEffect(() => {
    if (!playing || mode !== 'photo-story' || readyPhoto !== photo?.assetId) return;
    const timer = setTimeout(() => {
      if (index === photos.length - 1) { setPlaying(false); setFinished(true); }
      else setIndex(value => value + 1);
    }, duration * 1000);
    return () => clearTimeout(timer);
  }, [duration, index, mode, photos.length, playing, readyPhoto, photo?.assetId]);
  useEffect(() => { if (galleryOpen) setPlaying(false); }, [galleryOpen]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, []);
  useEffect(() => {
    const music = soundtrack.current; const speech = narration.current;
    if (music) { music.muted = muted; music.volume = segment && !muted ? .18 : .6; if (playing) music.play().catch(() => setAudioUnavailable(true)); else music.pause(); }
    if (speech) {
      speech.pause();
      if (playing && segment && !muted) { speech.currentTime = segment.startSec; speech.play().catch(() => setAudioUnavailable(true)); }
    }
  }, [index, playing, muted, segment?.startSec]);
  const togglePlay = () => { if (finished) { setIndex(0); setFinished(false); } setPlaying(value => !value); };
  const playAudio = () => { setPlaying(value => !value); };
  return <section className={`dp-sequential dp-${mode}`} aria-label={mode === 'photo-story' ? 'Photo Story' : mode === 'album' ? 'Album' : 'Photo Reveal'} onKeyDown={event => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
  }} tabIndex={0}>
    <div className={`dp-scene ${photo?.caption ? 'dp-has-caption' : ''}`}>
      <AnimatePresence mode="wait"><motion.figure key={photo?.assetId} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .25 }}>
        <Photograph photo={photo} eager moving={mode === 'photo-story' && !reduced} paused={!playing} onReady={setReadyPhoto} />
      </motion.figure></AnimatePresence>
      {photo?.caption && <p className="dp-story-caption" key={`caption-${photo.assetId}`}>{photo.caption}</p>}
    </div>
    <nav className="dp-controls" aria-label="Presentation controls">
      <span aria-live="polite">{index + 1} / {photos.length}</span>
      <div>
        <button onClick={() => step(-1)} disabled={index === 0} aria-label="Previous photograph"><ArrowLeft size={19} /></button>
        {mode === 'photo-story' && <button onClick={togglePlay}>{finished ? <RotateCcw size={18} /> : playing ? <Pause size={18} /> : <Play size={18} />}<span>{finished ? 'Replay' : playing ? 'Pause' : 'Play story'}</span></button>}
        {mode !== 'photo-story' && delivery.soundtrack?.url && <button onClick={playAudio}>{playing ? <Pause size={18} /> : <Play size={18} />}<span>Music</span></button>}
        <button onClick={() => step(1)} disabled={index === photos.length - 1} aria-label="Next photograph"><ArrowRight size={19} /></button>
        {(delivery.soundtrack?.url || delivery.narration?.url) && <button onClick={() => setMuted(value => !value)} aria-label={muted ? 'Unmute audio' : 'Mute audio'}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>}
      </div>
      <button onClick={openGallery}><Grid2X2 size={18} /><span>All photos</span></button>
    </nav>
    {finished && <div className="dp-ending"><p>{delivery.creativeDirection?.closingLine || 'Your photographs are ready to explore.'}</p><button onClick={openGallery}>Open the full gallery <ArrowRight size={18} /></button></div>}
    {audioUnavailable && <p className="dp-audio-note" role="status">Audio is unavailable. You can keep viewing your photographs.</p>}
    {delivery.soundtrack?.url && <audio ref={soundtrack} src={mediaUrl(delivery.soundtrack.url)} preload="none" loop onError={() => setAudioUnavailable(true)} />}
    {delivery.narration?.url && mode === 'photo-story' && <audio ref={narration} src={mediaUrl(delivery.narration.url)} preload="none" onTimeUpdate={event => { if (segment && event.currentTarget.currentTime >= segment.endSec) event.currentTarget.pause(); }} onError={() => setAudioUnavailable(true)} />}
  </section>;
}
function EditorialPresentation({ photos, onOpen }) {
  const reduced = useReducedMotion();
  return <div className="dp-editorial">{photos.map((photo, index) => <motion.figure key={photo.assetId} className={index % 5 === 0 ? 'dp-editorial-wide' : ''} initial={reduced ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }}>
    <button className="dp-photo-button" onClick={() => onOpen(photo.assetId)} aria-label={`Open photograph ${index + 1}`}><Photograph photo={photo} eager={index === 0} /></button>{photo.caption && <figcaption>{photo.caption}</figcaption>}
  </motion.figure>)}</div>;
}
function CanvasPresentation({ photos, onOpen }) {
  return <div className="dp-canvas">{photos.map((photo, index) => <figure key={photo.assetId} className={`dp-canvas-item dp-canvas-item-${index % 4}`}><button className="dp-photo-button" onClick={() => onOpen(photo.assetId)} aria-label={`Open photograph ${index + 1}`}><Photograph photo={photo} eager={index < 2} /></button>{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}</div>;
}
function CollectionPresentation({ delivery, photos, allPhotos, openGroup, onOpen }) {
  const sections = delivery.creativeDirection?.sections || [];
  const assets = new Map(allPhotos.map(photo => [photo.assetId, photo]));
  return <div className={`dp-collection dp-${delivery.format}`}>
    {delivery.format !== 'chapters' && <div className="dp-highlights">{photos.slice(0, 3).map((photo, index) => <button className="dp-photo-button" key={photo.assetId} onClick={() => onOpen(photo.assetId)} aria-label={`Open highlight ${index + 1}`}><Photograph photo={photo} eager={index === 0} /></button>)}</div>}
    {delivery.format === 'campaign' && delivery.formatConfig?.usageTerms && <p className="dp-usage">{delivery.formatConfig.usageTerms}</p>}
    <div className="dp-chapter-grid">{sections.map((section, index) => {
      const items = section.assetIds.map(id => assets.get(id)).filter(Boolean); if (!items.length) return null;
      return <button className="dp-chapter" key={section.id} onClick={() => openGroup(items, section.title)}><Photograph photo={items[0]} eager={index === 0} /><span><strong>{section.title}</strong><small>{items.length} photographs <ArrowRight size={17} /></small></span></button>;
    })}</div>
  </div>;
}
export default function PresentationViewer({ delivery, galleryProps = {} }) {
  const [gallery, setGallery] = useState(null);
  const direction = delivery.creativeDirection || {};
  const { photos, allPhotos } = useMemo(() => {
    const frames = new Map((direction.frames || []).map(frame => [frame.assetId, frame]));
    const allPhotos = (delivery.assets || []).map(asset => ({ ...asset, ...frames.get(asset.assetId) }));
    const byId = new Map(allPhotos.map(photo => [photo.assetId, photo]));
    return { allPhotos, photos: (delivery.presentationOrder || []).map(id => byId.get(id)).filter(Boolean) };
  }, [delivery.assets, delivery.presentationOrder, direction.frames]);
  const openGallery = () => setGallery({ photos: allPhotos, title: 'Your photographs', initialIndex: null });
  const onOpen = id => setGallery({ photos: allPhotos, title: 'Your photographs', initialIndex: Math.max(0, allPhotos.findIndex(photo => photo.assetId === id)) });
  if (!photos.length) return <div className="dp-viewer"><p>No photographs are included in this presentation.</p></div>;
  return <article className="dp-viewer" data-format={delivery.format}>
    <header className="dp-viewer-header"><div><p>{delivery.branding?.name || delivery.clientName}</p><h1>{delivery.title}</h1>{direction.openingLine && <span>{direction.openingLine}</span>}</div><button onClick={openGallery}><Grid2X2 size={18} /><span>Gallery · {allPhotos.length}</span></button></header>
    {['photo-story', 'photo-reveal', 'album'].includes(delivery.format) ? <SequentialPresentation key={`${delivery.format}:${delivery.draftRevisionId || delivery.publishedRevisionId || ''}`} delivery={delivery} photos={photos} mode={delivery.format} openGallery={openGallery} galleryOpen={Boolean(gallery)} />
      : delivery.format === 'editorial' ? <EditorialPresentation photos={photos} onOpen={onOpen} />
        : delivery.format === 'canvas' ? <CanvasPresentation photos={photos} onOpen={onOpen} />
          : <CollectionPresentation delivery={delivery} photos={photos} allPhotos={allPhotos} onOpen={onOpen} openGroup={(items, title) => setGallery({ photos: items, title, initialIndex: null })} />}
    {!['photo-story', 'photo-reveal', 'album'].includes(delivery.format) && <footer className="dp-viewer-footer">{direction.closingLine && <p>{direction.closingLine}</p>}<button onClick={openGallery}>All {allPhotos.length} photographs <ArrowRight size={18} /></button></footer>}
    <AnimatePresence>{gallery && <ClientGallery {...gallery} {...galleryProps} onDownloadAll={gallery.photos.length === allPhotos.length ? galleryProps.onDownloadAll : undefined} delivery={delivery} onClose={() => setGallery(null)} />}</AnimatePresence>
  </article>;
}
