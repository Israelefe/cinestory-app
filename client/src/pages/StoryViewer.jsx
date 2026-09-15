import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, Download, Share2, X, Grid, RotateCcw, ChevronLeft, ChevronRight, ArrowUpRight, Film, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../services/api.js';
import { DEMO_PRESETS } from '../constants/demoStories.js';
import { useDialogFocus } from '../components/useDialogFocus.js';
export { DEMO_PRESETS } from '../constants/demoStories.js';

function getFontFamily(type, fallback = "'Playfair Display', Georgia, serif") {
  switch (type) {
    case 'editorial-serif':
      return "'Playfair Display', Georgia, serif";
    case 'soft-serif':
      return "'Cormorant Garamond', 'Playfair Display', Georgia, serif";
    case 'condensed-sans':
      return "'Outfit', 'Plus Jakarta Sans', sans-serif";
    case 'clean-sans':
      return "'Plus Jakarta Sans', system-ui, sans-serif";
    default:
      return fallback;
  }
}

function mediaUrl(value) {
 if (typeof value !== 'string' || !value) return '';
 try { const url = new URL(value, window.location.origin); return url.protocol === 'https:' || (url.origin === window.location.origin && url.protocol === 'http:') ? url.href : ''; } catch { return ''; }
}
function GalleryDialog({ photos, clientName, demoId, onClose, onDownload, downloading, onDownloadAll, allDownloading }) {
 const panel = useRef(null);
 const [selected, setSelected] = useState(null);
 useDialogFocus(true, panel, onClose);
 return <motion.div className="v-gallery-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="v-gallery-dialog" ref={panel} role="dialog" aria-modal="true" aria-labelledby="gallery-title" tabIndex={-1}><header className="v-gallery-header"><div><p className="v-eyebrow">{clientName}</p><h2 id="gallery-title">{selected === null ? 'The photographs.' : 'A closer look.'}</h2></div><button className="v-view-icon" onClick={onClose} aria-label="Close gallery"><X size={21} /></button></header>{selected === null ? <><div className="v-gallery-grid">{photos.map((photo, i) => <div key={photo.id || i}><button className="v-gallery-image" onClick={() => setSelected(i)} aria-label={'View photograph ' + (i + 1)}><img src={demoId ? '/veylo/web/demo-' + demoId + '-' + (i + 1) + '-480.webp' : mediaUrl(photo.thumbnailUrl || photo.url)} alt={photo.caption || 'Photograph ' + (i + 1)} loading="lazy" decoding="async" /></button><button className="v-gallery-download" onClick={() => onDownload(i)} disabled={downloading === i || allDownloading}><span>{String(i + 1).padStart(2, '0')}</span>{downloading === i ? 'Preparing…' : 'Download'}<Download size={14} /></button></div>)}</div><footer className="v-gallery-footer"><p>Download the uploaded photographs.<br /><span>Your browser may ask you to allow multiple downloads.</span></p><button className="v-button" onClick={onDownloadAll} disabled={allDownloading || downloading !== null}>{allDownloading ? 'Preparing downloads…' : 'Download all'}<Download size={17} /></button></footer></> : <div className="v-lightbox"><img src={mediaUrl(photos[selected].url)} alt={photos[selected].caption || 'Photograph ' + (selected + 1)} /><div className="v-lightbox-controls"><button className="v-view-icon" onClick={() => setSelected(Math.max(0, selected - 1))} disabled={selected === 0} aria-label="Previous photograph"><ChevronLeft size={20} /></button><button className="v-gallery-download" onClick={() => setSelected(null)}>Back to gallery</button><button className="v-view-icon" onClick={() => setSelected(Math.min(photos.length - 1, selected + 1))} disabled={selected === photos.length - 1} aria-label="Next photograph"><ChevronRight size={20} /></button></div></div>}</div></motion.div>;
}

const STORY_LAYOUTS = ['cinema', 'poster', 'split', 'collage'];
const TEXT_STYLES = ['typewriter', 'editorial_quote', 'neon_pop', 'cinematic_drift', 'minimal_clean', 'bold_banner'];
const TEXT_BACKGROUNDS = ['frosted_glass', 'solid_dark', 'neon_pill', 'transparent_shadow', 'vogue_bordered'];
const CAPTION_POSITIONS = ['top', 'middle', 'bottom', 'left', 'right'];
const safeChoice = (value, choices, fallback) => choices.includes(value) ? value : fallback;
const sceneLayout = (photo, index) => safeChoice(photo?.sceneLayout || photo?.layout, STORY_LAYOUTS, STORY_LAYOUTS[index % STORY_LAYOUTS.length]);

function SceneTransition({ kind, accent, reduced }) {
 if (reduced) return null;
 const transitionKind = ['cut', 'fade', 'slide_left', 'rise', 'scale'].includes(kind) ? kind : 'fade';
 return <div className={'v-story-transition is-' + transitionKind} style={{ '--transition-accent': accent }} aria-hidden="true">
  {transitionKind === 'cut' && <><motion.i className="v-story-transition-flash" initial={{ opacity: .82 }} animate={{ opacity: 0 }} transition={{ duration: .34, ease: 'easeOut' }} /><motion.i className="v-story-transition-cutline" initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: 1, opacity: 0 }} transition={{ scaleX: { duration: .38, ease: [0.22, 1, 0.36, 1] }, opacity: { delay: .3, duration: .14 } }} /></>}
  {transitionKind === 'fade' && <motion.i className="v-story-transition-veil" initial={{ opacity: 1, scale: 1.08 }} animate={{ opacity: 0, scale: 1 }} transition={{ duration: .72, ease: [0.22, 1, 0.36, 1] }} />}
  {transitionKind === 'slide_left' && <><motion.i className="v-story-transition-panel is-one" initial={{ x: '0%' }} animate={{ x: '-104%' }} transition={{ duration: .72, ease: [0.76, 0, 0.24, 1] }} /><motion.i className="v-story-transition-panel is-two" initial={{ x: '0%' }} animate={{ x: '104%' }} transition={{ duration: .78, delay: .06, ease: [0.76, 0, 0.24, 1] }} /></>}
  {transitionKind === 'rise' && <><motion.i className="v-story-transition-rise is-one" initial={{ y: '0%' }} animate={{ y: '-104%' }} transition={{ duration: .76, ease: [0.76, 0, 0.24, 1] }} /><motion.i className="v-story-transition-rise is-two" initial={{ y: '0%' }} animate={{ y: '104%' }} transition={{ duration: .76, delay: .08, ease: [0.76, 0, 0.24, 1] }} /></>}
  {transitionKind === 'scale' && <motion.i className="v-story-transition-iris" initial={{ clipPath: 'circle(145% at 50% 50%)' }} animate={{ clipPath: 'circle(0% at 50% 50%)' }} transition={{ duration: .84, ease: [0.76, 0, 0.24, 1] }} />}
 </div>;
}

function AnimatedStoryText({ text, mode, animation, reduced }) {
 const effect = animation || ({ cinema: 'word_fade_up', poster: 'scale_pop', split: 'smooth_slide', collage: 'letter_drift' }[mode]);
 const starts = {
  word_fade_up: { opacity: 0, y: 24 },
  scale_pop: { opacity: 0, scale: .72, rotate: -2 },
  smooth_slide: { opacity: 0, x: 24 },
  blur_reveal: { opacity: 0, y: 12, filter: 'blur(9px)' },
  letter_drift: { opacity: 0, y: -14, rotate: 2 }
 };
 if (reduced) return <h2>{text}</h2>;
 if (effect === 'typewriter') {
  let letterIndex = 0;
  return <h2 className="v-story-typewriter">{text.split(/\s+/).map((word, wordIndex, words) => <span className="v-story-type-word" key={wordIndex}>{[...word].map(character => {
   const delay = Math.min(letterIndex++, 54) * .026;
   return <motion.span className="v-story-type-character" key={letterIndex} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .06, delay }}>{character}</motion.span>;
  })}{wordIndex < words.length - 1 ? '\u00a0' : ''}</span>)}</h2>;
 }
 const byLetter = effect === 'letter_drift';
 const units = byLetter ? [...text] : text.split(/\s+/);
 return <motion.h2 initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: byLetter ? .018 : .055, delayChildren: .12 } } }}>{units.map((unit, i) => <motion.span className="v-story-word" key={i} variants={{ hidden: starts[effect] || starts.word_fade_up, visible: { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, filter: 'blur(0px)', transition: { type: 'spring', damping: 22, stiffness: 190 } } }}>{unit === ' ' ? '\u00a0' : unit}{!byLetter && i < units.length - 1 ? '\u00a0' : ''}</motion.span>)}</motion.h2>;
}

function StoryScene({ demo, demoId, photos, photo, index, mode, started, finished, reduced, displaySrc, displaySet, motionForPhoto, accent }) {
 const adjacentIndex = index < photos.length - 1 ? index + 1 : Math.max(0, index - 1);
 const adjacentSrc = demo ? '/veylo/web/demo-' + demoId + '-' + (adjacentIndex + 1) + '-960.webp' : mediaUrl(photos[adjacentIndex]?.url);
 const finaleIndexes = [...new Set([0, Math.floor((photos.length - 1) / 2), photos.length - 1])];
 const finaleSource = i => demo ? '/veylo/web/demo-' + demoId + '-' + (i + 1) + '-960.webp' : mediaUrl(photos[i]?.thumbnailUrl || photos[i]?.url);
 const duration = Math.max(2, Number(photo?.duration) || 5.5);
 const focus = photo?.focalPoint || photo?.visualAnalysis?.focalPoint || '50% 50%';
 const adjacentFocus = photos[adjacentIndex]?.focalPoint || photos[adjacentIndex]?.visualAnalysis?.focalPoint || '50% 50%';
 const photoTransition = { duration: reduced ? 0 : duration, ease: 'linear' };
 const adjacentMotion = reduced ? { scale: 1, x: 0, y: 0 } : index % 2 === 0 ? { scale: [1.04, 1.13], x: ['2%', '-2%'] } : { scale: [1.13, 1.04], y: ['-2%', '2%'] };

 if (!started) return <div className="v-story-scene is-cover"><img className="v-story-scene-backdrop v-story-cover-backdrop" src={displaySrc} alt="" aria-hidden="true" /><motion.div className="v-story-cover-photo" initial={reduced ? false : { opacity: .35, filter: 'blur(10px) brightness(.65)' }} animate={{ opacity: 1, filter: 'blur(0px) brightness(1)' }} transition={{ duration: reduced ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}><motion.img src={displaySrc} srcSet={displaySet} sizes="(max-width: 767px) 100vw, 58vw" style={{ objectPosition: focus }} alt={photo?.caption || 'Opening photograph'} animate={motionForPhoto} transition={{ duration: reduced ? 0 : Math.max(8, duration * 1.4), ease: 'easeInOut', repeat: reduced ? 0 : Infinity, repeatType: 'mirror' }} draggable="false" /></motion.div><motion.i className="v-story-cover-line" initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0 : 1.1, delay: reduced ? 0 : .3, ease: [0.22, 1, 0.36, 1] }} /></div>;

 if (finished) return <motion.div className="v-story-scene v-story-finale" initial={reduced ? false : { opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : .7, ease: [0.22, 1, 0.36, 1] }}>
  <div className="v-story-finale-number" aria-hidden="true">END</div>
  <div className="v-story-finale-photos">{finaleIndexes.map((photoIndex, i) => <motion.figure key={photoIndex} initial={reduced ? false : { opacity: 0, y: 42, rotate: (i - 1) * 7 }} animate={{ opacity: 1, y: 0, rotate: (i - 1) * 4 }} transition={{ type: 'spring', damping: 24, stiffness: 150, delay: reduced ? 0 : i * .1 }}><motion.img src={finaleSource(photoIndex)} alt="" animate={reduced ? { scale: 1 } : { scale: i === 1 ? [1.03, 1.11] : [1.11, 1.03], x: i === 0 ? ['2%', '-2%'] : i === 2 ? ['-2%', '2%'] : 0 }} transition={{ duration: reduced ? 0 : 8 + i, ease: 'easeInOut', repeat: reduced ? 0 : Infinity, repeatType: 'mirror' }} /></motion.figure>)}</div>
 </motion.div>;

 const transitionKind = ['cut', 'fade', 'slide_left', 'rise', 'scale'].includes(photo?.transition) ? photo.transition : 'fade';
 const sceneEntrance = transitionKind === 'slide_left' ? { opacity: .55, x: '5%', scale: 1.035 } : transitionKind === 'rise' ? { opacity: .55, y: '4%', scale: 1.035 } : transitionKind === 'scale' ? { opacity: .5, scale: 1.08 } : { opacity: .55, scale: 1.025 };
 return <AnimatePresence mode="wait"><motion.div key={demoId + ':' + index} className={'v-story-scene is-' + mode + ' transition-' + transitionKind + (index === 0 ? ' is-opening-frame' : '')} initial={reduced ? false : sceneEntrance} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} exit={{ opacity: 0, scale: .985 }} transition={{ duration: reduced ? 0 : .58, ease: [0.22, 1, 0.36, 1] }}>
  {mode === 'cinema' && <><img className="v-story-scene-backdrop v-story-cinema-backdrop" src={displaySrc} alt="" aria-hidden="true" /><motion.div className="v-story-cinema-photo" initial={reduced ? false : { clipPath: 'inset(0 0 100% 0)', scale: 1.06 }} animate={{ clipPath: 'inset(0 0 0% 0)', scale: 1 }} transition={{ duration: reduced ? 0 : .85, ease: [0.22, 1, 0.36, 1] }}><motion.img src={displaySrc} srcSet={displaySet} sizes="(max-width: 767px) 100vw, 52vw" style={{ objectPosition: focus }} alt={photo?.caption || 'Photograph ' + (index + 1)} animate={motionForPhoto} transition={photoTransition} draggable="false" /></motion.div><span className="v-story-cinema-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="v-story-cinema-label">{index === 0 ? 'Opening frame' : 'Story frame'}</span><motion.i className="v-story-cinema-sweep" initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0 : .9, delay: reduced ? 0 : .2, ease: [0.22, 1, 0.36, 1] }} /></>}
  {mode === 'poster' && <><img className="v-story-scene-backdrop" src={displaySrc} alt="" aria-hidden="true" /><motion.figure className="v-story-poster-card" initial={reduced ? false : { y: 70, rotate: 5, scale: .86 }} animate={{ y: 0, rotate: -2, scale: 1 }} transition={{ type: 'spring', damping: 23, stiffness: 125 }}><motion.img src={displaySrc} srcSet={displaySet} style={{ objectPosition: focus }} alt={photo?.caption || 'Photograph ' + (index + 1)} animate={motionForPhoto} transition={photoTransition} draggable="false" /></motion.figure><span className="v-story-scene-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></>}
  {mode === 'split' && <><motion.div className="v-story-split-photo" initial={reduced ? false : { x: '-22%', scale: 1.08 }} animate={{ x: 0, scale: 1 }} transition={{ duration: reduced ? 0 : .7, ease: [0.22, 1, 0.36, 1] }}><motion.img src={displaySrc} srcSet={displaySet} style={{ objectPosition: focus }} alt={photo?.caption || 'Photograph ' + (index + 1)} animate={motionForPhoto} transition={photoTransition} draggable="false" /></motion.div><motion.div className="v-story-split-panel" initial={reduced ? false : { y: '100%' }} animate={{ y: 0 }} transition={{ duration: reduced ? 0 : .65, ease: [0.22, 1, 0.36, 1] }}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></motion.div></>}
  {mode === 'collage' && <><div className="v-story-collage-backdrop" /><motion.figure className="v-story-collage-main" initial={reduced ? false : { x: '-35%', rotate: -9, scale: .84 }} animate={{ x: 0, rotate: -3, scale: 1 }} transition={{ type: 'spring', damping: 22, stiffness: 120 }}><motion.img src={displaySrc} style={{ objectPosition: focus }} alt={photo?.caption || 'Photograph ' + (index + 1)} animate={motionForPhoto} transition={photoTransition} draggable="false" /></motion.figure><motion.figure className="v-story-collage-side" initial={reduced ? false : { x: '45%', rotate: 10, opacity: 0 }} animate={{ x: 0, rotate: 4, opacity: 1 }} transition={{ type: 'spring', damping: 24, stiffness: 125, delay: reduced ? 0 : .12 }}><motion.img src={adjacentSrc} style={{ objectPosition: adjacentFocus }} alt="" aria-hidden="true" animate={adjacentMotion} transition={photoTransition} draggable="false" /></motion.figure><span className="v-story-scene-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></>}
  <SceneTransition kind={transitionKind} accent={accent} reduced={reduced} />
 </motion.div></AnimatePresence>;
}
export default function StoryViewer({ demoMode = false, delivery: deliveryProp = null }) {
 const { storyId } = useParams();
 const [params] = useSearchParams();
 const location = useLocation();
 const navigate = useNavigate();
 const demo = (demoMode || storyId === 'demo') && !deliveryProp;
 const demoId = DEMO_PRESETS.some(p => p.id === params.get('preset')) ? params.get('preset') : 'ada';

 const isFromFormats =
  location.state?.from === 'formats' ||
  params.get('from') === 'formats' ||
  Boolean(location.state?.returnTo?.includes('/formats'));
 const isFromNiche =
  location.state?.from === 'niche' ||
  Boolean(location.state?.returnTo?.startsWith('/for/'));

 const backDestination = location.state?.returnTo ||
  (isFromFormats ? '/formats#photo-story' : (demo ? '/#photo-story' : '/'));

 const handleBack = (e) => {
  if (window.history.length > 1 && (isFromFormats || isFromNiche)) {
   e.preventDefault();
   navigate(-1);
  }
 };

 const reduced = useReducedMotion();
 const [story, setStory] = useState(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');
 const [started, setStarted] = useState(false);
 const [index, setIndex] = useState(0);
 const [paused, setPaused] = useState(false);
 const [finished, setFinished] = useState(false);
 const [muted, setMuted] = useState(false);
 const [audioPlaying, setAudioPlaying] = useState(false);
 const [narrationPlaying, setNarrationPlaying] = useState(false);
 const [captions, setCaptions] = useState(true);
 const [gallery, setGallery] = useState(false);
 const [holding, setHolding] = useState(false);
 const [downloading, setDownloading] = useState(null);
 const [allDownloading, setAllDownloading] = useState(false);
 const [hidden, setHidden] = useState(document.hidden);
 const audio = useRef(null);
 const narrationRef = useRef(null);
 const progress = useRef(null);
 const elapsed = useRef(0);
 const touch = useRef(null);
 const stage = useRef(null);
 const photos = story?.photos || [];
 const photo = photos[index];
 const running = started && !paused && !finished && !gallery && !holding && !hidden;
 const hasNarration = Boolean(deliveryProp?.narration?.url);

 useEffect(() => {
  const visibility = () => setHidden(document.hidden);
  document.addEventListener('visibilitychange', visibility);
  return () => document.removeEventListener('visibilitychange', visibility);
 }, []);

 useEffect(() => {
  let active = true;
  setStarted(false); setIndex(0); setPaused(false); setFinished(false); setGallery(false); setError(''); setLoading(true); elapsed.current = 0;
  if (deliveryProp) {
    const cd = deliveryProp.creativeDirection || {};
    const palette = cd.palette || {};
    const typography = cd.typography || {};
    const frames = new Map((cd.frames || []).map(f => [f.assetId, f]));
    const mappedPhotos = (deliveryProp.assets || []).map((asset, i) => {
      const frame = frames.get(asset.assetId) || {};
      return {
        id: asset.assetId,
        url: asset.url, // Original photographer upload quality preserved
        thumbnailUrl: asset.thumbnailUrl || asset.url,
        caption: frame.caption || frame.headline || '',
        chapterTitle: frame.headline || '',
        duration: Math.max(2, Number(frame.duration) || 5.5),
        motion: frame.motion || 'zoom_in',
        sceneLayout: frame.layout || STORY_LAYOUTS[i % STORY_LAYOUTS.length],
        typographyStyle: frame.typographyStyle || 'cinematic_drift',
        transition: frame.transition || 'fade',
        focalPoint: frame.focalPoint || '50% 50%'
      };
    });
    const derived = {
      title: deliveryProp.title,
      clientName: deliveryProp.clientName,
      studioName: deliveryProp.branding?.name || 'Veylo Studio',
      occasion: deliveryProp.shootType || 'Finished photographs',
      photos: mappedPhotos,
      soundtrack: deliveryProp.soundtrack?.url ? { audioUrl: deliveryProp.soundtrack.url, title: deliveryProp.soundtrack.title || 'Soundtrack' } : null,
      opening: {
        eyebrow: deliveryProp.branding?.name ? `${deliveryProp.branding.name.toUpperCase()} PRESENTS` : 'A VEYLO PHOTO STORY',
        headline: cd.title || deliveryProp.title,
        copy: cd.openingLine || 'Your finished photographs, brought together for you.',
        buttonLabel: 'Begin the story'
      },
      finale: {
        eyebrow: 'THAT’S THE STORY',
        headline: 'The full gallery is ready.',
        copy: cd.closingLine || 'Take your time with every photograph. Save one, or keep the whole set.',
        buttonLabel: 'Open your gallery'
      },
      theme: {
        accentColor: palette.accent || '#ff5a47',
        backgroundColor: palette.background || '#050506',
        surfaceColor: palette.surface || '#0c0c10',
        textColor: palette.text || '#ffffff',
        displayFont: getFontFamily(typography.display),
        bodyFont: getFontFamily(typography.body, "'Plus Jakarta Sans', system-ui, sans-serif")
      }
    };
    setStory(derived);
    setLoading(false);
    return () => { active = false; };
  }
  if (demo) { setStory(DEMO_PRESETS.find(p => p.id === demoId)); setLoading(false); }
  else api.get('/v1/stories/public/' + encodeURIComponent(storyId)).then(res => {
   if (!active) return;
   if (!res.data?.success || !Array.isArray(res.data.data?.photos) || !res.data.data.photos.length) throw new Error('Story not found');
   setStory(res.data.data); setLoading(false);
  }).catch(() => { if (active) { setError('This story could not be opened. Check the link with the photographer.'); setLoading(false); } });
  return () => { active = false; };
 }, [demo, demoId, storyId, deliveryProp]);
 const go = useCallback(direction => {
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
  elapsed.current = 0; setFinished(false); setIndex(current => Math.max(0, Math.min(photos.length - 1, current + direction)));
  if (progress.current) progress.current.style.transform = 'scaleX(0)';
 }, [photos.length]);
 useEffect(() => {
  if (!running) return;
  let frame; let previous = performance.now();
  const wordCount = (photo?.caption || '').split(/\s+/).filter(Boolean).length;
  const spokenBreathingSeconds = wordCount > 0 ? (wordCount * 0.52 + 1.8) : 5.5;
  const duration = Math.max(2, Math.min(30, Math.max(Number(photo?.duration) || 5.5, spokenBreathingSeconds))) * 1000;
  const tick = now => {
   elapsed.current += now - previous; previous = now;
   if (progress.current) progress.current.style.transform = 'scaleX(' + Math.min(1, elapsed.current / duration) + ')';
   if (elapsed.current >= duration) {
    elapsed.current = 0;
    if (index >= photos.length - 1) setFinished(true); else setIndex(i => i + 1);
    return;
   }
   frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
 }, [running, index, photo?.duration, photo?.caption, photos.length]);
 useEffect(() => {
  const element = audio.current;
  if (!element) return;
  element.muted = muted;
  if (running && !muted) element.play().then(() => setAudioPlaying(true)).catch(() => setAudioPlaying(false));
  else { element.pause(); setAudioPlaying(false); }
 }, [running, muted, story]);
 useEffect(() => {
  const handle = e => {
   if (gallery || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(e.target.tagName)) return;
   if (e.key === 'ArrowRight' && started) { e.preventDefault(); go(1); }
   if (e.key === 'ArrowLeft' && started) { e.preventDefault(); go(-1); }
   if (e.code === 'Space' && started) { e.preventDefault(); setPaused(p => !p); }
  };
  document.addEventListener('keydown', handle); return () => document.removeEventListener('keydown', handle);
 }, [gallery, started, go]);
  useEffect(() => {
    if (!photos.length) return;
    const nextIdx = (index + 1) % photos.length;
    const nextPhoto = photos[nextIdx];
    const src = demo ? `/veylo/web/demo-${demoId}-${nextIdx + 1}-960.webp` : mediaUrl(nextPhoto?.url);
    if (src) {
      const img = new window.Image();
      img.src = src;
    }
  }, [index, photos, demo, demoId]);

  useEffect(() => {
    if (!running || muted) {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      if (audio.current) audio.current.volume = 1.0;
      setNarrationPlaying(false);
      return;
    }

    const textToSpeak = finished
      ? (story?.finale?.headline ? `${story.finale.headline}. ${story.finale.copy || ''}` : '')
      : (photo?.caption || photo?.chapterTitle || '');

    if (!textToSpeak) {
      if (audio.current) audio.current.volume = 1.0;
      setNarrationPlaying(false);
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 0.85; // Unhurried, measured biographical documentary pace
      utterance.pitch = 0.98;

      const pickVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        return (
          voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Hannah') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Serena'))) ||
          voices.find(v => v.lang.startsWith('en')) ||
          null
        );
      };

      const voice = pickVoice();
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        setNarrationPlaying(true);
        if (audio.current) audio.current.volume = 0.20; // Duck soundtrack
      };
      utterance.onend = () => {
        setNarrationPlaying(false);
        if (audio.current) audio.current.volume = 1.0; // Restore soundtrack
      };
      utterance.onerror = () => {
        setNarrationPlaying(false);
        if (audio.current) audio.current.volume = 1.0;
      };

      const timer = setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          if (audio.current) audio.current.volume = 1.0;
        }
      }, 340);

      return () => {
        clearTimeout(timer);
        if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      };
    }
  }, [running, muted, index, finished, photo?.caption, photo?.chapterTitle, story?.finale]);

  const download = async (i, quiet = false) => {
   setDownloading(i);
   try {
    const url = mediaUrl(photos[i].url); if (!url) throw new Error('Invalid image');
    const response = await fetch(url); if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob(); if (!blob.type.startsWith('image/')) throw new Error('Unsupported file');
    const extension = ({'image/png':'png','image/webp':'webp','image/jpeg':'jpg'})[blob.type] || 'jpg';
    const object = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = object; a.download = (story.clientName || 'Veylo').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) + '-' + (i + 1) + '.' + extension;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(object), 30000);
    if (!quiet) { toast.success('Download requested. Check your browser’s downloads.'); if (!demo && storyId) api.post('/v1/stories/public/' + encodeURIComponent(storyId) + '/track-download').catch(() => {}); }
    return true;
   } catch { toast.error('Couldn’t download this photograph. Please try again.'); return false; }
   finally { setDownloading(null); }
  };
  const downloadAll = async () => {
   if (allDownloading) return;
   setAllDownloading(true);
   if (deliveryProp?.publicId) {
     try {
       const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`veylo_delivery_${deliveryProp.publicId}`) : null;
       const response = await api.get(
         `/v1/deliveries/public/${deliveryProp.publicId}/download-all`,
         token ? { headers: { 'X-Delivery-Access': token } } : {}
       );
       const url = response.data.data.url;
       const a = document.createElement('a');
       a.href = url;
       a.target = '_blank';
       a.rel = 'noopener noreferrer';
       a.download = `${(story.clientName || 'gallery').replace(/[^a-z0-9_-]/gi, '_')}-photographs.zip`;
       document.body.appendChild(a);
       a.click();
       a.remove();
       toast.info('Gallery download started. Check your browser downloads.');
     } catch {
       toast.error('We could not prepare the full gallery download.');
     } finally {
       setAllDownloading(false);
     }
     return;
   }
   try {
     for (let i = 0; i < photos.length; i++) {
       if (!await download(i, true)) return;
       await new Promise(r => setTimeout(r, 250));
     }
     toast.success('Downloads requested. Check your browser downloads.');
     if (!demo && storyId) api.post('/v1/stories/public/' + encodeURIComponent(storyId) + '/track-download').catch(() => {});
   } finally {
     setAllDownloading(false);
   }
  };
  const start = () => {
    setStarted(true); setPaused(false); setFinished(false); setIndex(0); elapsed.current = 0;
    if (audio.current) {
      audio.current.currentTime = 0;
      if (!muted) audio.current.play().then(() => setAudioPlaying(true)).catch(() => setAudioPlaying(false));
    }
  };
  const share = async () => {
   const url = window.location.href;
   try { if (navigator.share) await navigator.share({ title: story.title || 'A Veylo Photo Story', url }); else { await navigator.clipboard.writeText(url); toast.success('Story link copied.'); } } catch (e) { if (e.name !== 'AbortError') toast.info('Copy the link from your browser’s address bar to share this story.'); }
  };
  if (loading) return <div className="v-page-loading" role="status">Opening your Photo Story…</div>;
  if (error || !story) return <div className="v-public v-view-error"><Film size={30} /><h1>This story isn’t available.</h1><p>{error}</p><Link className="v-button" to={backDestination}>Back to Veylo<ArrowUpRight size={17} /></Link></div>;
  const displaySrc = demo ? '/veylo/web/demo-' + demoId + '-' + (index + 1) + '-960.webp' : mediaUrl(photo?.url);
  const displaySet = demo ? [480, 960, 1440].map(w => '/veylo/web/demo-' + demoId + '-' + (index + 1) + '-' + w + '.webp ' + w + 'w').join(', ') : undefined;
  const motionName = String(photo?.motion || photo?.zoomEffect || 'zoom_in').replaceAll('_', '-');
  const motionForPhoto = reduced ? { scale: 1, x: 0, y: 0 } : motionName === 'pan-down' ? { scale: 1.16, y: ['-4%', '4%'] } : motionName === 'pan-up' ? { scale: 1.16, y: ['4%', '-4%'] } : motionName === 'pan-right' ? { scale: 1.16, x: ['-4%', '4%'] } : motionName === 'pan-left' ? { scale: 1.16, x: ['4%', '-4%'] } : motionName === 'zoom-out' ? { scale: [1.18, 1.03] } : { scale: [1.02, 1.16] };
  const layoutMode = sceneLayout(photo, index);
  const textStyle = safeChoice(photo?.typographyStyle, TEXT_STYLES, 'cinematic_drift');
  const textBackground = safeChoice(photo?.textBackground, TEXT_BACKGROUNDS, 'transparent_shadow');
  const captionPosition = safeChoice(photo?.captionPosition, CAPTION_POSITIONS, 'bottom');
  const opening = story.opening || {};
  const finale = story.finale || {};
  return <div className="v-public v-story-shell" style={{ '--story-accent': photo?.colorAccent || story.theme?.accentColor || '#ff5a47', '--story-glow': photo?.glowColor || story.theme?.glowColor || 'rgba(255,90,71,.35)', '--story-secondary': photo?.secondaryColor || story.theme?.secondaryColor || '#151518', '--story-bg': story.theme?.backgroundColor || '#050506', '--story-text': story.theme?.textColor || '#ffffff', '--story-font-display': story.theme?.displayFont || "'Playfair Display', Georgia, serif", '--story-font-body': story.theme?.bodyFont || "'Plus Jakarta Sans', system-ui, sans-serif" }}>
  <div className="v-story-ambient" aria-hidden="true"><img src={displaySrc} alt="" /></div>
  <main className="v-story-canvas" id="main-content" ref={stage} onPointerDown={e => { if (e.pointerType !== 'mouse') touch.current = { x: e.clientX, y: e.clientY }; if (started) setHolding(true); }} onPointerUp={e => { setHolding(false); if (touch.current) { const dx = e.clientX - touch.current.x; const dy = e.clientY - touch.current.y; if (started && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1); touch.current = null; } }} onPointerCancel={() => { setHolding(false); touch.current = null; }} onPointerLeave={() => setHolding(false)}>
   <StoryScene demo={demo} demoId={demoId} photos={photos} photo={photo} index={index} mode={layoutMode} started={started} finished={finished} reduced={reduced} displaySrc={displaySrc} displaySet={displaySet} motionForPhoto={motionForPhoto} accent={photo?.colorAccent || story.theme?.accentColor || '#ff5a47'} />
   <div className="v-story-shade" aria-hidden="true" />
   <div className="v-story-progress" role="progressbar" aria-label="Photo Story progress" aria-valuemin={1} aria-valuemax={photos.length} aria-valuenow={index + 1}>{photos.map((_, i) => <span key={i} className={i < index ? 'is-done' : i === index ? 'is-current' : ''}><i ref={i === index ? progress : null} /></span>)}</div>
   <header className="v-story-top"><div className="v-story-studio"><Link to={backDestination} onClick={handleBack} className="v-story-mark" aria-label={demo ? (isFromFormats ? 'Back to Photo Story on the formats page' : isFromNiche ? 'Back to the page you opened this story from' : 'Back to the Photo Story section on the homepage') : 'Veylo home'}><img src="/veylo/veylo-mark.svg" alt="" /></Link><div><strong style={{ fontFamily: 'var(--story-font-display)' }}>{story.clientName || story.title}</strong><span style={{ fontFamily: 'var(--story-font-body)' }}>{story.studioName || story.occasion}</span></div></div><div className="v-story-top-actions"><button onClick={() => setMuted(value => !value)} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><button onClick={share} aria-label="Share story"><Share2 size={17} /></button></div></header>
   {!started ? <section className="v-story-cover"><p className="v-story-kicker">{opening.eyebrow || (demo ? 'A Veylo Photo Story' : 'Your photographs are ready')}</p><h1 style={{ fontFamily: 'var(--story-font-display)' }}>{opening.headline || story.clientName || story.title}</h1><p className="v-story-cover-occasion">{story.occasion}</p><p className="v-story-summary">{opening.copy || story.storySummary || 'Your finished photographs, brought together for you.'}</p><button className="v-story-primary" onClick={start}><Play size={18} fill="currentColor" />{opening.buttonLabel || 'Begin the story'}</button><p className="v-story-hint">{opening.hint || 'Turn your sound on. Tap either side to move through the story.'}</p></section> : <>
    <button className="v-story-tap v-story-tap-left" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photograph" />
    <button className="v-story-tap v-story-tap-right" onClick={() => go(1)} disabled={index === photos.length - 1} aria-label="Next photograph" />
    <section key={finished ? 'finale' : 'caption-' + index} className={'v-story-caption is-' + layoutMode + ' is-type-' + textStyle + ' has-' + textBackground + ' position-' + captionPosition + ' ' + (!captions ? 'is-hidden ' : '') + (finished ? 'is-finale' : '')} style={captions ? undefined : { display: 'none', visibility: 'hidden', opacity: 0, pointerEvents: 'none' }} aria-live={paused || finished ? 'polite' : 'off'}>{finished ? <><motion.p className="v-story-kicker" initial={reduced ? false : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduced ? 0 : .18 }}>{finale.eyebrow || 'That’s the story'}</motion.p><AnimatedStoryText text={finale.headline || 'The full gallery is ready.'} mode="poster" animation={finale.textAnimation || 'word_fade_up'} reduced={reduced} /><motion.p initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : .5 }}>{finale.copy || 'Take your time with every photograph. Save one, or keep the whole set.'}</motion.p><motion.button className="v-story-gallery-cta" onClick={() => setGallery(true)} initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : .65 }}>{finale.buttonLabel || 'Open your gallery'}<Grid size={16} /></motion.button></> : <><motion.p className="v-story-kicker" initial={reduced ? false : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduced ? 0 : .08 }}>{photo?.chapterTitle || 'The photographs'}</motion.p><AnimatedStoryText text={photo?.caption || 'One more moment from the day.'} mode={layoutMode} animation={photo?.textAnimation} reduced={reduced} /></>}</section>
    <div className={'v-story-controls ' + (finished ? 'is-finished' : '')}><button onClick={() => setCaptions(value => !value)} aria-label={captions ? 'Hide captions' : 'Show captions'}>{captions ? <Eye size={17} /> : <EyeOff size={17} />}</button><button className="v-story-play" onClick={finished ? start : () => setPaused(value => !value)} aria-label={finished ? 'Replay story' : paused ? 'Resume story' : 'Pause story'}>{finished ? <RotateCcw size={18} /> : paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}</button>{!finished && <button onClick={() => setGallery(true)} aria-label="Open gallery"><Grid size={17} /></button>}</div>
   </>}
   {story.soundtrack?.audioUrl && <div className="v-story-sound"><span className={audioPlaying ? 'is-playing' : ''} /><p>{audioPlaying ? 'Now playing' : muted ? 'Sound off' : 'Soundtrack'} · {story.soundtrack.title || 'Selected track'}</p></div>}
  </main>
  {story.soundtrack?.audioUrl && <audio ref={audio} src={mediaUrl(story.soundtrack.audioUrl)} loop preload="none" onError={() => setAudioPlaying(false)} />}
  {deliveryProp?.narration?.url && <audio ref={narrationRef} src={mediaUrl(deliveryProp.narration.url)} preload="metadata" onEnded={handleNarrationEnded} />}
  <AnimatePresence>{gallery && <GalleryDialog photos={photos} clientName={story.clientName} demoId={demo ? demoId : null} onClose={() => setGallery(false)} onDownload={download} downloading={downloading} onDownloadAll={downloadAll} allDownloading={allDownloading} />}</AnimatePresence>
  </div>;
}
