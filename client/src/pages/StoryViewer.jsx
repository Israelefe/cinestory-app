import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { storyFrameDurationSeconds } from '../utils/storyPacing';
import { Play, Pause, Volume2, VolumeX, Download, Share2, X, Grid, RotateCcw, ChevronLeft, ChevronRight, ArrowUpRight, Film, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../services/api.js';
import { API_BASE_URL } from '../config/env.js';
import { trackEvent } from '../services/analytics.js';
import { DEMO_PRESETS } from '../constants/demoStories.js';
import { useDialogFocus } from '../components/useDialogFocus.js';
import ClientGallery from '../components/delivery/ClientGallery.jsx';
import DeliveryBrandMark from '../components/delivery/DeliveryBrandMark.jsx';
import './StoryV3.css';
export { DEMO_PRESETS } from '../constants/demoStories.js';

const EMPTY_NARRATION_SEGMENTS = Object.freeze([]);

function getFontFamily(type, fallback = "'Playfair Display', Georgia, serif") {
  if (['Playfair Display', 'Outfit', 'Plus Jakarta Sans', 'Cormorant Garamond', 'DM Sans', 'Libre Baskerville', 'Manrope'].includes(type)) return "'" + type + "', Georgia, sans-serif";
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
 try {
  const url = new URL(value, window.location.origin);
  const apiOrigin = new URL(API_BASE_URL, window.location.origin).origin;
  return url.protocol === 'blob:' || url.protocol === 'https:' || (url.protocol === 'http:' && (url.origin === window.location.origin || (import.meta.env.DEV && url.origin === apiOrigin))) ? url.href : '';
 } catch { return ''; }
}

async function prepareStoryShareFile(photo, index, clientName) {
 const url = mediaUrl(photo?.url);
 if (!url) throw new Error('Invalid image');
 const response = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
 if (!response.ok) throw new Error(`Photograph returned ${response.status}.`);
 const blob = await response.blob();
 if (!blob.size || !blob.type.startsWith('image/')) throw new Error('Unsupported photograph');
 const extension = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' })[blob.type] || 'jpg';
 const base = String(clientName || 'Veylo').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || 'Veylo';
 return new File([blob], `${base}-${String(index + 1).padStart(2, '0')}.${extension}`, { type: blob.type });
}

function canShareStoryFiles(files) {
 return typeof File !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files });
}

const volumeRamps = new WeakMap();
function fadeAudioVolume(element, target, duration = 420, onComplete) {
 if (!element) return;
 const previousFrame = volumeRamps.get(element);
 if (previousFrame) cancelAnimationFrame(previousFrame);
 const from = Number.isFinite(element.volume) ? element.volume : 1;
 const startedAt = performance.now();
 const tick = now => {
  const progress = Math.min(1, (now - startedAt) / duration);
  const eased = 1 - Math.pow(1 - progress, 3);
  element.volume = Math.max(0, Math.min(1, from + (target - from) * eased));
  if (progress < 1) volumeRamps.set(element, requestAnimationFrame(tick));
  else { volumeRamps.delete(element); onComplete?.(); }
 };
 volumeRamps.set(element, requestAnimationFrame(tick));
}
function LegacyGalleryDialog({ photos, clientName, demoId, onClose, onDownload, downloading, onDownloadAll, allDownloading }) {
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
const storyMotion = value => ({
 'slow-push': 'zoom_in',
 'slow-pull': 'zoom_out',
 'pan-left': 'pan_left',
 'pan-right': 'pan_right',
 'float': 'pan_up',
 still: 'still'
 }[value] || value || 'zoom_in');
const storyTransition = value => ({
 crossfade: 'fade',
 wipe: 'slide_left',
 slide: 'slide_left',
 reveal: 'rise',
 cut: 'cut',
 fade: 'fade'
 }[value] || 'fade');

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
   const delay = Math.min(letterIndex++, 60) * .06;
   return <motion.span className="v-story-type-character" key={letterIndex} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .06, delay }}>{character}</motion.span>;
  })}{wordIndex < words.length - 1 ? '\u00a0' : ''}</span>)}</h2>;
 }
 const letterVariants = { hidden: starts[effect] || starts.word_fade_up, visible: { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, filter: 'blur(0px)', transition: { type: 'spring', damping: 22, stiffness: 190 } } };
 const words = text.trim().split(/\s+/);
 if (effect === 'letter_drift') {
  return <motion.h2 initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: .055, delayChildren: .12 } } }}>{words.map((word, wordIndex) => <React.Fragment key={wordIndex}><motion.span className="v-story-letter-word" variants={{ visible: { transition: { staggerChildren: .018 } } }}>{[...word].map((letter, letterIndex) => <motion.span className="v-story-letter" key={letterIndex} variants={letterVariants}>{letter}</motion.span>)}</motion.span>{wordIndex < words.length - 1 ? ' ' : ''}</React.Fragment>)}</motion.h2>;
 }
 return <motion.h2 initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: .055, delayChildren: .12 } } }}>{words.map((word, i) => <motion.span className="v-story-word" key={i} variants={letterVariants}>{word}{i < words.length - 1 ? '\u00a0' : ''}</motion.span>)}</motion.h2>;
}

function StoryScene({ demo, demoId, photos, photo, index, mode, started, finished, reduced, displaySrc, displaySet, motionForPhoto, accent, pace = 'warm', v3CloserSrc = '' }) {
 const adjacentIndex = index < photos.length - 1 ? index + 1 : Math.max(0, index - 1);
 const adjacentSrc = demo ? '/veylo/web/demo-' + demoId + '-' + (adjacentIndex + 1) + '-960.webp' : mediaUrl(photos[adjacentIndex]?.url);
 const finaleIndexes = [...new Set([0, Math.floor((photos.length - 1) / 2), photos.length - 1])];
 const finaleSource = i => demo ? '/veylo/web/demo-' + demoId + '-' + (i + 1) + '-960.webp' : mediaUrl(photos[i]?.thumbnailUrl || photos[i]?.url);
 const duration = storyFrameDurationSeconds(photo, pace);
 const focus = photo?.focalPoint || photo?.visualAnalysis?.focalPoint || '50% 50%';
 const adjacentFocus = photos[adjacentIndex]?.focalPoint || photos[adjacentIndex]?.visualAnalysis?.focalPoint || '50% 50%';
 const photoTransition = { duration: reduced ? 0 : Math.max(3.8, duration * .85), ease: 'easeInOut', repeat: reduced ? 0 : Infinity, repeatType: 'mirror' };
 const photoMotionStart = Object.fromEntries(Object.entries(motionForPhoto).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
 const photoMotionEnd = Object.fromEntries(Object.entries(motionForPhoto).map(([key, value]) => [key, Array.isArray(value) ? value.at(-1) : value]));
 const adjacentMotion = reduced ? { scale: 1, x: 0, y: 0 } : index % 2 === 0 ? { scale: [1.04, 1.13], x: ['2%', '-2%'] } : { scale: [1.13, 1.04], y: ['-2%', '2%'] };

 if (!started) return <div className="v-story-scene is-cover"><img className="v-story-scene-backdrop v-story-cover-backdrop" src={displaySrc} alt="" aria-hidden="true" /><motion.div className="v-story-cover-photo" initial={reduced ? false : { opacity: .35, filter: 'blur(10px) brightness(.65)' }} animate={{ opacity: 1, filter: 'blur(0px) brightness(1)' }} transition={{ duration: reduced ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}><motion.img src={displaySrc} srcSet={displaySet} sizes="(max-width: 767px) 100vw, 58vw" style={{ objectPosition: focus }} alt={photo?.caption || 'Opening photograph'} initial={reduced ? false : photoMotionStart} animate={photoMotionEnd} transition={{ duration: reduced ? 0 : Math.max(8, duration * 1.4), ease: 'easeInOut', repeat: reduced ? 0 : Infinity, repeatType: 'mirror' }} draggable="false" /></motion.div><motion.i className="v-story-cover-line" initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0 : 1.1, delay: reduced ? 0 : .3, ease: [0.22, 1, 0.36, 1] }} /></div>;

 if (finished) return <motion.div className="v-story-scene v-story-finale" initial={reduced ? false : { opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : .7, ease: [0.22, 1, 0.36, 1] }}>
  <div className="v-story-finale-number" aria-hidden="true">END</div>
<div className="v-story-finale-photos">{finaleIndexes.map((photoIndex, i) => <motion.figure key={photoIndex} initial={reduced ? false : { opacity: 0, y: 42, rotate: (i - 1) * 7 }} animate={{ opacity: 1, y: 0, rotate: (i - 1) * 4 }} transition={{ type: 'spring', damping: 24, stiffness: 150, delay: reduced ? 0 : i * .1 }}><motion.img src={i === 1 && v3CloserSrc ? v3CloserSrc : finaleSource(photoIndex)} alt="" animate={reduced ? { scale: 1 } : { scale: i === 1 ? [1.03, 1.11] : [1.11, 1.03], x: i === 0 ? ['2%', '-2%'] : i === 2 ? ['-2%', '2%'] : 0 }} transition={{ duration: reduced ? 0 : 8 + i, ease: 'easeInOut', repeat: reduced ? 0 : Infinity, repeatType: 'mirror' }} /></motion.figure>)}</div>
 </motion.div>;

 const transitionKind = ['cut', 'fade', 'slide_left', 'rise', 'scale'].includes(photo?.transition) ? photo.transition : 'fade';
 const sceneEntrance = transitionKind === 'slide_left' ? { opacity: .55, x: '5%', scale: 1.035 } : transitionKind === 'rise' ? { opacity: .55, y: '4%', scale: 1.035 } : transitionKind === 'scale' ? { opacity: .5, scale: 1.08 } : { opacity: .55, scale: 1.025 };
 return <AnimatePresence mode="wait"><motion.div key={demoId + ':' + index} className={'v-story-scene is-' + mode + ' transition-' + transitionKind + (index === 0 ? ' is-opening-frame' : '')} initial={reduced ? false : sceneEntrance} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} exit={{ opacity: 0, scale: .985 }} transition={{ duration: reduced ? 0 : .58, ease: [0.22, 1, 0.36, 1] }}>
  {mode === 'cinema' && <><img className="v-story-scene-backdrop v-story-cinema-backdrop" src={displaySrc} alt="" aria-hidden="true" /><motion.div className="v-story-cinema-photo" initial={reduced ? false : { clipPath: 'inset(0 0 100% 0)', scale: 1.06 }} animate={{ clipPath: 'inset(0 0 0% 0)', scale: 1 }} transition={{ duration: reduced ? 0 : .85, ease: [0.22, 1, 0.36, 1] }}><motion.img src={displaySrc} srcSet={displaySet} sizes="(max-width: 767px) 100vw, 52vw" style={{ objectPosition: focus }} alt={photo?.caption || 'Photograph ' + (index + 1)} initial={reduced ? false : photoMotionStart} animate={photoMotionEnd} transition={photoTransition} draggable="false" /></motion.div><span className="v-story-cinema-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="v-story-cinema-label">{index === 0 ? 'Opening frame' : 'Story frame'}</span><motion.i className="v-story-cinema-sweep" initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0 : .9, delay: reduced ? 0 : .2, ease: [0.22, 1, 0.36, 1] }} /></>}
  {mode === 'poster' && <><img className="v-story-scene-backdrop" src={displaySrc} alt="" aria-hidden="true" /><motion.figure className="v-story-poster-card" initial={reduced ? false : { y: 70, rotate: 5, scale: .86 }} animate={{ y: 0, rotate: -2, scale: 1 }} transition={{ type: 'spring', damping: 23, stiffness: 125 }}><motion.img src={displaySrc} srcSet={displaySet} style={{ objectPosition: focus }} alt={photo?.caption || 'Photograph ' + (index + 1)} initial={reduced ? false : photoMotionStart} animate={photoMotionEnd} transition={photoTransition} draggable="false" /></motion.figure><span className="v-story-scene-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></>}
  {mode === 'split' && <><motion.div className="v-story-split-photo" initial={reduced ? false : { x: '-22%', scale: 1.08 }} animate={{ x: 0, scale: 1 }} transition={{ duration: reduced ? 0 : .7, ease: [0.22, 1, 0.36, 1] }}><motion.img src={displaySrc} srcSet={displaySet} style={{ objectPosition: focus }} alt={photo?.caption || 'Photograph ' + (index + 1)} initial={reduced ? false : photoMotionStart} animate={photoMotionEnd} transition={photoTransition} draggable="false" /></motion.div><motion.div className="v-story-split-panel" initial={reduced ? false : { y: '100%' }} animate={{ y: 0 }} transition={{ duration: reduced ? 0 : .65, ease: [0.22, 1, 0.36, 1] }}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></motion.div></>}
  {mode === 'collage' && <><div className="v-story-collage-backdrop" /><motion.figure className="v-story-collage-main" initial={reduced ? false : { x: '-35%', rotate: -9, scale: .84 }} animate={{ x: 0, rotate: -3, scale: 1 }} transition={{ type: 'spring', damping: 22, stiffness: 120 }}><motion.img src={displaySrc} style={{ objectPosition: focus }} alt={photo?.caption || 'Photograph ' + (index + 1)} initial={reduced ? false : photoMotionStart} animate={photoMotionEnd} transition={photoTransition} draggable="false" /></motion.figure><motion.figure className="v-story-collage-side" initial={reduced ? false : { x: '45%', rotate: 10, opacity: 0 }} animate={{ x: 0, rotate: 4, opacity: 1 }} transition={{ type: 'spring', damping: 24, stiffness: 125, delay: reduced ? 0 : .12 }}><motion.img src={adjacentSrc} style={{ objectPosition: adjacentFocus }} alt="" aria-hidden="true" animate={adjacentMotion} transition={photoTransition} draggable="false" /></motion.figure><span className="v-story-scene-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></>}
  <SceneTransition kind={transitionKind} accent={accent} reduced={reduced} />
 </motion.div></AnimatePresence>;
}
export default function StoryViewer({ demoMode = false, delivery: deliveryProp = null, galleryProps = null }) {
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
 const [audioLoading, setAudioLoading] = useState(false);
 const [narrationPlaying, setNarrationPlaying] = useState(false);
 const [narrationLoading, setNarrationLoading] = useState(false);
 const [captions, setCaptions] = useState(true);
 const [gallery, setGallery] = useState(false);
  const [holding, setHolding] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [allDownloading, setAllDownloading] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(null);
 const [hidden, setHidden] = useState(document.hidden);
 const audio = useRef(null);
 const audioPlayPending = useRef(false);
 const narrationRef = useRef(null);
 const v3OpeningRef = useRef(null);
 const v3ClosingRef = useRef(null);
 const v3OpeningPlayed = useRef(false);
 const v3ClosingStarted = useRef(false);
 const v3FinalFadeTimer = useRef(null);
 const [v3OpeningNarrating, setV3OpeningNarrating] = useState(false);
 const narrationLeadTimer = useRef(null);
 const narrationLeadRef = useRef(false);
 const progress = useRef(null);
 const elapsed = useRef(0);
 const touch = useRef(null);
 const stage = useRef(null);
 const photos = story?.photos || [];
 const galleryPhotos = story?.galleryPhotos || photos;
 const photo = photos[index];
 const running = started && !paused && !finished && !gallery && !holding && !hidden;
 const captionNarration = deliveryProp?.schemaVersion === 3 ? deliveryProp?.narration?.captions : deliveryProp?.narration;
 const captionNarrationUrl = captionNarration?.url || (deliveryProp?.schemaVersion !== 3 ? deliveryProp?.narration?.url : '');
 const narrationSegments = captionNarration?.segments || (deliveryProp?.schemaVersion !== 3 ? deliveryProp?.narration?.segments : null) || EMPTY_NARRATION_SEGMENTS;
 const hasNarration = Boolean(captionNarrationUrl);
 const clearV3FinalFade = () => {
  if (v3FinalFadeTimer.current) window.clearTimeout(v3FinalFadeTimer.current);
  v3FinalFadeTimer.current = null;
 };
 const fadeV3FinaleMusic = (delay = 800) => {
  clearV3FinalFade();
  v3FinalFadeTimer.current = window.setTimeout(() => fadeAudioVolume(audio.current, 0, 2100, () => {
   if (audio.current && finished) {
    audio.current.pause();
    setAudioPlaying(false);
   }
  }), delay);
 };
 const finishV3ClosingNarration = () => {
  if (audio.current) fadeAudioVolume(audio.current, 1, 800, () => fadeV3FinaleMusic(900));
  else fadeV3FinaleMusic(0);
 };
 const startStorySoundtrack = onStarted => {
  const element = audio.current;
  if (!element || muted || audioPlayPending.current) return;
  if (!element.paused) {
   setAudioLoading(false);
   setAudioPlaying(true);
   onStarted?.();
   return;
  }
  audioPlayPending.current = true;
  setAudioLoading(true);
  let playback;
  try { playback = element.play(); }
  catch {
   audioPlayPending.current = false;
   setAudioPlaying(false);
   setAudioLoading(false);
   return;
  }
  if (!playback?.then) {
   audioPlayPending.current = false;
   setAudioLoading(false);
   setAudioPlaying(!element.paused);
   if (!element.paused) onStarted?.();
   return;
  }
  playback.then(() => {
   audioPlayPending.current = false;
   if (!element.paused && !element.muted) {
    setAudioLoading(false);
    setAudioPlaying(true);
    onStarted?.();
   } else {
    setAudioLoading(false);
   }
  }).catch(() => {
   audioPlayPending.current = false;
   setAudioPlaying(false);
   setAudioLoading(false);
  });
 };

 useEffect(() => {
  const visibility = () => setHidden(document.hidden);
  document.addEventListener('visibilitychange', visibility);
  return () => document.removeEventListener('visibilitychange', visibility);
 }, []);

 useEffect(() => {
  let active = true;
  if (narrationLeadTimer.current) window.clearTimeout(narrationLeadTimer.current);
  narrationLeadRef.current = false;
  setStarted(false); setIndex(0); setPaused(false); setFinished(false); setGallery(false); setError(''); setLoading(true); elapsed.current = 0;
  v3OpeningPlayed.current = false; setV3OpeningNarrating(false);
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
        srcSet: asset.srcSet,
        dominantColor: asset.dominantColor,
        originalFilename: asset.originalFilename,
        caption: frame.caption || frame.headline || '',
        chapterTitle: frame.headline || '',
        duration: deliveryProp.schemaVersion === 3 ? 6 : storyFrameDurationSeconds(frame),
        motion: storyMotion(frame.motion),
        sceneLayout: frame.layout || STORY_LAYOUTS[i % STORY_LAYOUTS.length],
        typographyStyle: deliveryProp.schemaVersion === 3 ? 'typewriter' : frame.typographyStyle || 'cinematic_drift',
        textBackground: frame.textBackground || 'transparent_shadow',
        captionPosition: frame.captionPosition || 'bottom',
        textAnimation: deliveryProp.schemaVersion === 3 ? 'typewriter' : frame.textAnimation || undefined,
        transition: storyTransition(frame.transition),
        focalPoint: frame.focalPoint || '50% 50%',
        colorAccent: frame.colorAccent || palette.accent || '#ff5a47'
      };
    });
    const mappedById = new Map(mappedPhotos.map(photo => [String(photo.id), photo]));
    const selectedIds = deliveryProp.curatedAssetIds?.length
      ? deliveryProp.curatedAssetIds
      : (cd.frames || []).map(frame => frame.assetId);
    const presentationPhotos = selectedIds.length
      ? selectedIds.map(id => mappedById.get(String(id))).filter(Boolean)
      : mappedPhotos;
    const derived = {
      title: deliveryProp.title,
      clientName: deliveryProp.clientName,
      studioName: deliveryProp.branding?.name || 'Veylo Studio',
      branding: deliveryProp.branding,
      occasion: deliveryProp.shootType || 'Finished photographs',
      photos: presentationPhotos.length ? presentationPhotos : mappedPhotos,
      galleryPhotos: mappedPhotos,
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
        bodyFont: getFontFamily(typography.body, "'Plus Jakarta Sans', system-ui, sans-serif"),
        pace: deliveryProp.schemaVersion === 3 ? 'warm' : cd.pace || 'warm'
      }
    };
    setStory(derived);
    setLoading(false);
    return () => { active = false; if (narrationLeadTimer.current) window.clearTimeout(narrationLeadTimer.current); narrationLeadRef.current = false; };
  }
  if (demo) { setStory(DEMO_PRESETS.find(p => p.id === demoId)); setLoading(false); }
  else api.get('/v1/stories/public/' + encodeURIComponent(storyId)).then(res => {
   if (!active) return;
   if (!res.data?.success || !Array.isArray(res.data.data?.photos) || !res.data.data.photos.length) throw new Error('Story not found');
   setStory(res.data.data); setLoading(false); trackEvent('client.delivery.opened', { format: 'photo-story' }, { format: 'photo-story', status: 'opened' });
  }).catch(() => { trackEvent('client.delivery.load.failed', {}, { format: 'photo-story', status: 'failed', errorCode: 'PHOTO_STORY_LOAD_FAILED' }); if (active) { setError('This story could not be opened. Check the link with the photographer.'); setLoading(false); } });
  return () => { active = false; if (narrationLeadTimer.current) window.clearTimeout(narrationLeadTimer.current); };
 }, [demo, demoId, storyId, deliveryProp]);
 const go = useCallback(direction => {
  elapsed.current = 0; setFinished(false); setIndex(current => {
   const nextIndex = Math.max(0, Math.min(photos.length - 1, current + direction));
   const assetId = photos[nextIndex]?.id;
   const segment = narrationSegments.find(item => (item.assetIds || []).some(id => String(id) === String(assetId)));
   if (deliveryProp?.schemaVersion !== 3 && narrationRef.current && segment) {
    narrationRef.current.currentTime = Number(segment.startSec || 0);
    if (!muted && (narrationPlaying || narrationLoading)) narrationRef.current.play().catch(() => {});
   }
   return nextIndex;
  });
  if (progress.current) progress.current.style.transform = 'scaleX(0)';
  trackEvent('client.photo.reveal.advanced', { direction }, { format: 'photo-story', status: 'advanced' });
 }, [photos, narrationSegments, muted, narrationPlaying, narrationLoading, deliveryProp?.schemaVersion]);
 useEffect(() => {
  if (!running) return;
  if (deliveryProp?.schemaVersion !== 3 && (audioLoading || (hasNarration && (narrationPlaying || narrationLoading)))) return;
  let frame; let previous = performance.now();
  const duration = (deliveryProp?.schemaVersion === 3 ? 6 : storyFrameDurationSeconds(photo, story?.theme?.pace)) * 1000;
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
 }, [running, index, photo?.duration, photo?.caption, photos.length, hasNarration, narrationPlaying, narrationLoading, audioLoading, deliveryProp?.schemaVersion]);
 useEffect(() => {
  if (deliveryProp?.schemaVersion !== 3 || !finished) {
   clearV3FinalFade();
   v3ClosingStarted.current = false;
   return;
  }
  if (muted) return;
  if (v3ClosingRef.current && !v3ClosingStarted.current) {
   v3ClosingStarted.current = true;
   if (audio.current) fadeAudioVolume(audio.current, .16, 450);
   v3ClosingRef.current.currentTime = 0;
   v3ClosingRef.current.play().catch(finishV3ClosingNarration);
   return;
  }
  if (!v3ClosingRef.current) fadeV3FinaleMusic(250);
 }, [finished, muted, deliveryProp?.schemaVersion]);
 useEffect(() => {
  if (v3OpeningRef.current) v3OpeningRef.current.muted = muted;
  if (v3ClosingRef.current) v3ClosingRef.current.muted = muted;
 }, [muted]);
 useEffect(() => {
  const element = audio.current;
  if (!element) return;
  element.muted = muted;
  const v3SoundtrackDuringBookend = deliveryProp?.schemaVersion === 3 && !gallery && !muted && (v3OpeningNarrating || (started && finished));
  if ((running || v3SoundtrackDuringBookend) && !muted) {
   startStorySoundtrack();
  } else {
   element.pause();
   audioPlayPending.current = false;
   setAudioPlaying(false);
   setAudioLoading(false);
  }
 }, [running, muted, story, v3OpeningNarrating, finished, gallery, deliveryProp?.schemaVersion]);
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

 const handleNarrationEnded = () => {
    if (narrationLeadTimer.current) window.clearTimeout(narrationLeadTimer.current);
    narrationLeadRef.current = false;
    setNarrationPlaying(false);
    setNarrationLoading(false);
    if (deliveryProp?.schemaVersion === 3) {
      fadeAudioVolume(audio.current, 1, 600);
      return;
    }
    if (progress.current) progress.current.style.transform = 'scaleX(1)';
    setFinished(true);
    fadeAudioVolume(audio.current, 1);
  };

  useEffect(() => {
    const narrationEl = narrationRef.current;
    if (!narrationEl || !hasNarration) return;
    narrationEl.muted = muted;
    if (muted) {
      if (narrationLeadTimer.current) window.clearTimeout(narrationLeadTimer.current);
      narrationLeadRef.current = false;
    }
    if (running && !muted && (narrationPlaying || narrationLoading)) {
      narrationEl.play().catch(() => {});
    } else {
      narrationEl.pause();
    }
  }, [running, muted, narrationPlaying, narrationLoading, hasNarration]);

  useEffect(() => {
    const narration = narrationRef.current;
    const segments = narrationSegments;
    if (!narration || !hasNarration || !segments.length) return;
    const onTimeUpdate = () => {
      if (narrationLeadRef.current) return;
      const time = narration.currentTime;
      if (deliveryProp?.schemaVersion === 3) {
        const activeAssetId = photos[index]?.id;
        const activeSegment = segments.find(segment => (segment.assetIds || []).some(id => String(id) === String(activeAssetId)));
        if (activeSegment && time >= Number(activeSegment.endSec || 0)) {
          narration.pause();
          fadeAudioVolume(audio.current, 1, 600);
        }
        return;
      }
      const segmentIndex = segments.findIndex(segment => time >= Number(segment.startSec || 0) && time < Number(segment.endSec || 0));
      if (segmentIndex < 0) {
        const previousSegment = [...segments].reverse().find(segment => time >= Number(segment.endSec || 0));
        if (progress.current) progress.current.style.transform = previousSegment ? 'scaleX(1)' : 'scaleX(0)';
        return;
      }
      const segment = segments[segmentIndex];
      const referencedIndex = (segment.assetIds || []).map(assetId => photos.findIndex(item => String(item.id) === String(assetId))).find(value => value >= 0);
      const nextIndex = referencedIndex >= 0 ? referencedIndex : Math.min(photos.length - 1, Math.floor((segmentIndex / Math.max(1, segments.length)) * photos.length));
      const start = Number(segment.startSec || 0);
      const end = Number(segment.endSec || start);
      const fraction = end > start ? Math.max(0, Math.min(1, (time - start) / (end - start))) : 1;
      if (progress.current) progress.current.style.transform = `scaleX(${fraction})`;
      setFinished(false);
      setIndex(current => current === nextIndex ? current : nextIndex);
    };
    narration.addEventListener('timeupdate', onTimeUpdate);
    return () => narration.removeEventListener('timeupdate', onTimeUpdate);
  }, [narrationSegments, hasNarration, photos, index, deliveryProp?.schemaVersion]);

  useEffect(() => {
    if (deliveryProp?.schemaVersion !== 3 || !hasNarration || !running || muted) return;
    const narration = narrationRef.current;
    const assetId = photos[index]?.id;
    const segment = narrationSegments.find(item => (item.assetIds || []).some(id => String(id) === String(assetId)));
    if (!narration || !segment) return;
    const segmentStart = Number(segment.startSec || 0);
    const segmentEnd = Number(segment.endSec || 0);
    const insideCurrentCaption = narration.currentTime >= segmentStart && narration.currentTime < segmentEnd;
    if (insideCurrentCaption && !narration.paused) return;
    if (!insideCurrentCaption) narration.currentTime = segmentStart;
    narration.play().then(() => {
      setNarrationPlaying(true);
      setNarrationLoading(false);
      fadeAudioVolume(audio.current, .16, 450);
    }).catch(() => {
      setNarrationPlaying(false);
      setNarrationLoading(false);
      fadeAudioVolume(audio.current, 1, 600);
    });
  }, [deliveryProp?.schemaVersion, hasNarration, running, muted, photos, index, narrationSegments]);

  const download = async (i, quiet = false) => {
   setDownloading(i);
   let downloadSucceeded = false;
   try {
    if (deliveryProp?.publicId) {
      const assetId = galleryPhotos[i]?.id || galleryPhotos[i]?.assetId;
      if (!assetId) throw new Error('Photograph not found');
      const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`veylo_delivery_${deliveryProp.publicId}`) : null;
      const grant = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`veylo_delivery_grant_${deliveryProp.publicId}`) : null;
      const headers = { ...(token ? { 'X-Delivery-Access': token } : {}), ...(grant ? { 'X-Delivery-Grant': grant } : {}) };
      const response = await api.get(`/v1/deliveries/public/${deliveryProp.publicId}/photos/${encodeURIComponent(assetId)}/download`, { headers });
      const original = String(galleryPhotos[i]?.originalFilename || '').trim();
      const filename = original && original.includes('.')
        ? original.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180)
        : `${(story.clientName || 'photographs').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || 'photographs'}-${String(i + 1).padStart(2, '0')}.jpg`;
      const link = document.createElement('a');
      link.href = response.data?.data?.url;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link); link.click(); link.remove();
      api.post(`/v1/deliveries/public/${deliveryProp.publicId}/photos/${encodeURIComponent(assetId)}/downloaded`, {}, { headers }).catch(() => {});
      trackEvent('client.photo.download.started', { downloadType: 'individual' }, { format: 'photo-story', status: 'completed', count: 1 });
      if (!quiet) { setDownloadNotice('On iPhone or iPad, use Share then Save to Files if Safari opens the photograph instead.'); toast.info('Download started. Check your Downloads or Files app.'); }
      downloadSucceeded = true;
      return true;
    }
    const url = mediaUrl(galleryPhotos[i].url); if (!url) throw new Error('Invalid image');
    const response = await fetch(url); if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob(); if (!blob.type.startsWith('image/')) throw new Error('Unsupported file');
    const extension = ({'image/png':'png','image/webp':'webp','image/jpeg':'jpg'})[blob.type] || 'jpg';
    const object = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = object; a.download = (story.clientName || 'Veylo').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) + '-' + (i + 1) + '.' + extension;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(object), 30000);
    if (!demo && storyId) api.post('/v1/stories/public/' + encodeURIComponent(storyId) + '/track-download').catch(() => {});
    trackEvent('client.photo.download.started', { downloadType: 'individual' }, { format: 'photo-story', status: 'completed', count: 1 });
    if (!quiet) { toast.success('Download requested. Check your browser’s downloads.'); }
    downloadSucceeded = true;
    return true;
   } catch { toast.error('Couldn’t download this photograph. Please try again.'); return false; }
   finally { if (!downloadSucceeded) trackEvent('client.photo.download.failed', { downloadType: 'individual' }, { format: 'photo-story', status: 'failed', errorCode: 'DOWNLOAD_FAILED' }); setDownloading(null); }
  };
  const downloadAll = async () => {
   if (allDownloading) return;
   setAllDownloading(true);
   setDownloadNotice(deliveryProp?.publicId
     ? 'Each photograph downloads separately. Android may ask you to allow multiple downloads. On iPhone or iPad, Safari may stop after one; use the individual Download buttons if that happens.'
     : 'Each photograph downloads separately. Your browser may ask you to allow multiple downloads.');
   setDownloadProgress({ current: 0, total: galleryPhotos.length, failed: 0 });
   trackEvent('client.download.all.started', { count: galleryPhotos.length }, { format: 'photo-story', status: 'started', count: galleryPhotos.length });
   let failed = 0;
   try {
     if (!deliveryProp?.publicId && galleryPhotos.length <= 40) {
      try {
       const files = [];
       for (let i = 0; i < galleryPhotos.length; i += 1) {
        files.push(await prepareStoryShareFile(galleryPhotos[i], i, story.clientName));
        setDownloadProgress({ current: i + 1, total: galleryPhotos.length, failed });
       }
       if (canShareStoryFiles(files)) {
        await navigator.share({ title: `${story.clientName || 'Client'} photographs`, files });
        if (!demo && storyId) files.forEach(() => api.post('/v1/stories/public/' + encodeURIComponent(storyId) + '/track-download').catch(() => {}));
        setDownloadNotice('Choose Save to Files or Photos in the share sheet to keep every photograph.');
        trackEvent('client.photo.download.started', { downloadType: 'all', count: files.length }, { format: 'photo-story', status: 'completed', count: files.length });
        toast.success('All photographs are ready in the share sheet.');
        return;
       }
      } catch (shareError) {
       if (shareError?.name === 'AbortError') {
        setDownloadNotice('The share sheet was closed. Nothing was counted as downloaded.');
        return;
       }
      }
     }
     for (let i = 0; i < galleryPhotos.length; i++) {
       if (!await download(i, true)) failed += 1;
       setDownloadProgress({ current: i + 1, total: galleryPhotos.length, failed });
       await new Promise(r => setTimeout(r, 250));
     }
     const started = galleryPhotos.length - failed;
     trackEvent(failed ? 'client.download.all.partial_failed' : 'client.photo.download.started', { downloadType: 'all', count: started }, { format: 'photo-story', status: failed ? 'partial_failure' : 'completed', count: started });
     setDownloadNotice(failed ? `${started} download${started === 1 ? '' : 's'} started. ${failed} need another tap.` : 'Downloads started one at a time. Check your Downloads or Files app.');
     toast.success(failed ? `${started} downloads started. Try the remaining photographs individually.` : 'Downloads started. Check your Downloads or Files app.');
   } finally {
     setAllDownloading(false);
     setDownloadProgress(null);
   }
  };
 const beginFrames = (preserveSoundtrack = false) => {
    if (narrationLeadTimer.current) window.clearTimeout(narrationLeadTimer.current);
    setV3OpeningNarrating(false); setStarted(true); setPaused(false); setFinished(false); setIndex(0); elapsed.current = 0;
    trackEvent('client.experience.started', { format: 'photo-story' }, { format: 'photo-story', status: 'started' });
    if (audio.current) {
      if (!preserveSoundtrack) {
        audio.current.currentTime = 0;
        audio.current.volume = 1;
      }
      if (!muted) {
        startStorySoundtrack(deliveryProp?.schemaVersion === 3 && hasNarration
          ? () => fadeAudioVolume(audio.current, .16, preserveSoundtrack ? 0 : 450)
          : preserveSoundtrack
            ? () => fadeAudioVolume(audio.current, 1, 800)
            : undefined);
      }
    }
    if (narrationRef.current && hasNarration) {
      const firstAssetId = photos[0]?.id;
      const firstSegment = narrationSegments.find(segment => (segment.assetIds || []).some(id => String(id) === String(firstAssetId)));
      const v3CaptionVoice = deliveryProp?.schemaVersion === 3;
      narrationRef.current.currentTime = v3CaptionVoice ? Number(firstSegment?.startSec || 0) : 0;
      narrationRef.current.volume = v3CaptionVoice ? 1 : 0;
      if (!muted) {
        narrationLeadRef.current = !v3CaptionVoice;
        setNarrationLoading(true);
        narrationRef.current.play().then(() => {
          setNarrationPlaying(true);
          setNarrationLoading(false);
          if (v3CaptionVoice) {
            fadeAudioVolume(audio.current, .16, 450);
          } else {
            // Prime legacy narration inside the same user gesture as the music.
            // Restart after its short musical lead-in so the browser allows playback.
            narrationLeadTimer.current = window.setTimeout(() => {
              const narration = narrationRef.current;
              if (!narration || narration.muted) return;
              narrationLeadRef.current = false;
              narration.currentTime = 0;
              fadeAudioVolume(narration, 1, 180);
              fadeAudioVolume(audio.current, .16, 520);
            }, reduced ? 0 : 1400);
          }
        }).catch(() => { narrationLeadRef.current = false; setNarrationPlaying(false); setNarrationLoading(false); });
      }
    }
  };
  const start = () => {
    clearV3FinalFade();
    if (finished && deliveryProp?.schemaVersion === 3) {
      v3OpeningPlayed.current = false;
      v3ClosingStarted.current = false;
      elapsed.current = 0;
      if (narrationLeadTimer.current) window.clearTimeout(narrationLeadTimer.current);
      narrationLeadRef.current = false;
      setStarted(false); setIndex(0); setPaused(false); setFinished(false); setGallery(false); setHolding(false); setV3OpeningNarrating(false);
      setNarrationPlaying(false); setNarrationLoading(false);
      if (narrationRef.current) { narrationRef.current.pause(); narrationRef.current.currentTime = 0; }
      if (v3ClosingRef.current) { v3ClosingRef.current.pause(); v3ClosingRef.current.currentTime = 0; }
      if (v3OpeningRef.current) { v3OpeningRef.current.pause(); v3OpeningRef.current.currentTime = 0; }
      if (audio.current) { audio.current.pause(); audio.current.currentTime = 0; audio.current.volume = 1; }
      return;
    }
    if (finished) { v3OpeningPlayed.current = false; v3ClosingStarted.current = false; }
    if (deliveryProp?.schemaVersion === 3 && v3OpeningRef.current && !muted && !v3OpeningPlayed.current) {
      v3OpeningPlayed.current = true;
      setV3OpeningNarrating(true);
      v3OpeningRef.current.currentTime = 0;
      if (audio.current) {
        audio.current.currentTime = 0;
        audio.current.volume = 0;
        startStorySoundtrack(() => fadeAudioVolume(audio.current, .16, 450));
      }
      v3OpeningRef.current.play().catch(() => beginFrames(true));
      return;
    }
    beginFrames();
  };
  const share = async () => {
   const url = window.location.href;
   try { if (navigator.share) await navigator.share({ title: story.title || 'A Veylo Photo Story', url }); else { await navigator.clipboard.writeText(url); toast.success('Story link copied.'); } } catch (e) { if (e.name !== 'AbortError') toast.info('Copy the link from your browser’s address bar to share this story.'); }
  };
  if (loading) return <div className="v-page-loading" role="status">Opening your Photo Story…</div>;
  if (error || !story) return <div className="v-public v-view-error"><Film size={30} /><h1>This story isn’t available.</h1><p>{error}</p><Link className="v-button" to={backDestination}>Back to Veylo<ArrowUpRight size={17} /></Link></div>;
  const v3OpeningAsset = deliveryProp?.schemaVersion === 3 ? deliveryProp.assets?.find(asset => asset.assetId === deliveryProp.v3?.openingAssetId) : null;
  const v3ClosingAsset = deliveryProp?.schemaVersion === 3 ? deliveryProp.assets?.find(asset => asset.assetId === deliveryProp.v3?.closingAssetId) : null;
  const displaySrc = demo ? '/veylo/web/demo-' + demoId + '-' + (index + 1) + '-960.webp' : mediaUrl(!started && v3OpeningAsset ? v3OpeningAsset.url : photo?.url);
  const displaySet = demo ? [480, 960, 1440].map(w => '/veylo/web/demo-' + demoId + '-' + (index + 1) + '-' + w + '.webp ' + w + 'w').join(', ') : photo?.srcSet;
  const motionName = String(photo?.motion || photo?.zoomEffect || 'zoom_in').replaceAll('_', '-');
 const motionForPhoto = reduced ? { scale: 1, x: 0, y: 0 } : motionName === 'pan-down' ? { scale: 1.16, y: ['-4%', '4%'] } : motionName === 'pan-up' ? { scale: 1.16, y: ['4%', '-4%'] } : motionName === 'pan-right' ? { scale: 1.16, x: ['-4%', '4%'] } : motionName === 'pan-left' ? { scale: 1.16, x: ['4%', '-4%'] } : motionName === 'zoom-out' ? { scale: [1.18, 1.03] } : { scale: [1.02, 1.16] };
  const layoutMode = sceneLayout(photo, index);
  const textStyle = safeChoice(photo?.typographyStyle, TEXT_STYLES, 'cinematic_drift');
  const textBackground = safeChoice(photo?.textBackground, TEXT_BACKGROUNDS, 'transparent_shadow');
  const captionPosition = safeChoice(photo?.captionPosition, CAPTION_POSITIONS, 'bottom');
  const opening = story.opening || {};
  const finale = story.finale || {};
  return <div className={'v-public v-story-shell' + (deliveryProp?.schemaVersion === 3 ? ' is-v3' : '')} style={{ '--story-accent': photo?.colorAccent || story.theme?.accentColor || '#ff5a47', '--story-glow': photo?.glowColor || story.theme?.glowColor || 'rgba(255,90,71,.35)', '--story-secondary': photo?.secondaryColor || story.theme?.secondaryColor || '#151518', '--story-bg': story.theme?.backgroundColor || '#050506', '--story-text': story.theme?.textColor || '#ffffff', '--story-font-display': story.theme?.displayFont || "'Playfair Display', Georgia, serif", '--story-font-body': story.theme?.bodyFont || "'Plus Jakarta Sans', system-ui, sans-serif" }}>
  <div className="v-story-ambient" aria-hidden="true"><img src={displaySrc} alt="" /></div>
  <main className={'v-story-canvas ' + (!started ? 'is-cover-state' : finished ? 'is-finale-state' : 'is-playing-state')} id="main-content" ref={stage} onPointerDown={e => { if (e.pointerType !== 'mouse') touch.current = { x: e.clientX, y: e.clientY }; if (started) setHolding(true); }} onPointerUp={e => { setHolding(false); if (touch.current) { const dx = e.clientX - touch.current.x; const dy = e.clientY - touch.current.y; if (started && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1); touch.current = null; } }} onPointerCancel={() => { setHolding(false); touch.current = null; }} onPointerLeave={() => setHolding(false)}>
   <StoryScene demo={demo} demoId={demoId} photos={photos} photo={photo} index={index} mode={layoutMode} started={started} finished={finished} reduced={reduced} displaySrc={displaySrc} displaySet={!started && v3OpeningAsset ? v3OpeningAsset.srcSet : displaySet} motionForPhoto={motionForPhoto} accent={photo?.colorAccent || story.theme?.accentColor || '#ff5a47'} pace={story.theme?.pace} v3CloserSrc={mediaUrl(v3ClosingAsset?.url)} />
   <div className="v-story-shade" aria-hidden="true" />
   <div className="v-story-progress" role="progressbar" aria-label="Photo Story progress" aria-valuemin={1} aria-valuemax={photos.length} aria-valuenow={index + 1}>{photos.map((_, i) => <span key={i} className={i < index ? 'is-done' : i === index ? 'is-current' : ''}><i ref={i === index ? progress : null} /></span>)}</div>
   <header className="v-story-top"><div className="v-story-studio"><Link to={backDestination} onClick={handleBack} className="v-story-mark" aria-label={demo ? (isFromFormats ? 'Back to Photo Story on the formats page' : isFromNiche ? 'Back to the page you opened this story from' : 'Back to the Photo Story section on the homepage') : `${story.studioName || 'Studio'} home`}><DeliveryBrandMark branding={story.branding} /></Link><div><strong style={{ fontFamily: 'var(--story-font-display)' }}>{story.clientName || story.title}</strong><span style={{ fontFamily: 'var(--story-font-body)' }}>{story.studioName || story.occasion}</span></div></div><div className="v-story-top-actions"><button onClick={() => setMuted(value => !value)} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><button onClick={share} aria-label="Share story"><Share2 size={17} /></button></div></header>
   {!started ? <section className="v-story-cover"><p className="v-story-kicker">{opening.eyebrow || (demo ? 'A Veylo Photo Story' : 'Your photographs are ready')}</p><h1 style={{ fontFamily: 'var(--story-font-display)' }}>{opening.headline || story.clientName || story.title}</h1><p className="v-story-cover-occasion">{story.occasion}</p><p className="v-story-summary">{opening.copy || story.storySummary || 'Your finished photographs, brought together for you.'}</p><button className="v-story-primary" onClick={start} disabled={v3OpeningNarrating}><Play size={18} fill="currentColor" />{v3OpeningNarrating ? 'Reading the introduction…' : opening.buttonLabel || 'Begin the story'}</button><p className="v-story-hint">{opening.hint || 'Turn your sound on. Tap either side to move through the story.'}</p></section> : <>
    <button className="v-story-tap v-story-tap-left" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photograph" />
    <button className="v-story-tap v-story-tap-right" onClick={() => go(1)} disabled={index === photos.length - 1} aria-label="Next photograph" />
    <section key={finished ? 'finale' : 'caption-' + index} className={'v-story-caption is-' + layoutMode + ' is-type-' + textStyle + ' has-' + textBackground + ' position-' + captionPosition + ' ' + (!captions ? 'is-hidden ' : '') + (finished ? 'is-finale' : '')} style={captions ? undefined : { display: 'none', visibility: 'hidden', opacity: 0, pointerEvents: 'none' }} aria-live={paused || finished ? 'polite' : 'off'}>{finished ? <><motion.p className="v-story-kicker" initial={reduced ? false : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduced ? 0 : .18 }}>{finale.eyebrow || 'That’s the story'}</motion.p><AnimatedStoryText text={finale.headline || 'The full gallery is ready.'} mode="poster" animation={finale.textAnimation || 'word_fade_up'} reduced={reduced} /><motion.p initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : .5 }}>{finale.copy || 'Take your time with every photograph. Save one, or keep the whole set.'}</motion.p><motion.button className="v-story-gallery-cta" onClick={() => setGallery(true)} initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : .65 }}>{finale.buttonLabel || 'Open your gallery'}<Grid size={16} /></motion.button></> : <><motion.p className="v-story-kicker" initial={reduced ? false : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduced ? 0 : .08 }}>{photo?.chapterTitle || (deliveryProp?.schemaVersion === 3 ? '' : 'The photographs')}</motion.p><AnimatedStoryText text={photo?.caption || 'One more moment from the day.'} mode={layoutMode} animation={photo?.textAnimation} reduced={reduced} /></>}</section>
    <div className={'v-story-controls ' + (finished ? 'is-finished' : '')}><button onClick={() => setCaptions(value => !value)} aria-label={captions ? 'Hide captions' : 'Show captions'}>{captions ? <Eye size={17} /> : <EyeOff size={17} />}</button><button className="v-story-play" onClick={finished ? start : () => setPaused(value => !value)} aria-label={finished ? 'Replay story' : paused ? 'Resume story' : 'Pause story'}>{finished ? <RotateCcw size={18} /> : paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}</button>{!finished && <button onClick={() => setGallery(true)} aria-label="Open gallery"><Grid size={17} /></button>}</div>
   </>}
   {(story.soundtrack?.audioUrl || hasNarration) && <div className={`v-story-sound ${audioLoading || narrationLoading ? 'is-loading' : ''}`} role="status" aria-live="polite"><span className={audioLoading || narrationLoading ? 'is-loading' : audioPlaying || narrationPlaying ? 'is-playing' : ''} /><p>{audioLoading && narrationLoading ? 'Loading music and narration…' : narrationLoading ? 'Loading narration…' : audioLoading ? 'Loading soundtrack…' : audioPlaying ? `Now playing · ${story.soundtrack?.title || 'Selected track'}` : narrationPlaying ? 'Narration playing' : muted ? 'Sound off' : `Soundtrack · ${story.soundtrack?.title || 'Selected track'}`}</p></div>}
  </main>
  {story.soundtrack?.audioUrl && <audio ref={audio} src={mediaUrl(story.soundtrack.audioUrl)} loop preload="metadata" onWaiting={() => { if (started && !muted) setAudioLoading(true); }} onStalled={() => { if (started && !muted) setAudioLoading(true); }} onPlaying={() => { audioPlayPending.current = false; setAudioLoading(false); setAudioPlaying(true); }} onPause={() => { audioPlayPending.current = false; setAudioLoading(false); }} onError={() => { audioPlayPending.current = false; setAudioPlaying(false); setAudioLoading(false); toast.info('The soundtrack could not load. The story will continue without it.'); }} />}
  {captionNarrationUrl && <audio ref={narrationRef} src={mediaUrl(captionNarrationUrl)} preload="metadata" onWaiting={() => { if (started && !muted) setNarrationLoading(true); }} onStalled={() => { if (started && !muted) setNarrationLoading(true); }} onPlaying={() => { setNarrationLoading(false); setNarrationPlaying(true); if (deliveryProp?.schemaVersion === 3) fadeAudioVolume(audio.current, .16, 450); }} onPause={() => { if (deliveryProp?.schemaVersion === 3) { setNarrationPlaying(false); setNarrationLoading(false); fadeAudioVolume(audio.current, 1, 600); } }} onEnded={handleNarrationEnded} onError={() => { setNarrationPlaying(false); setNarrationLoading(false); fadeAudioVolume(audio.current, 1); toast.info('The narration could not load. The story will continue without it.'); }} />}
  {deliveryProp?.schemaVersion === 3 && deliveryProp?.narration?.opening?.url && <audio ref={v3OpeningRef} src={mediaUrl(deliveryProp.narration.opening.url)} preload="metadata" onEnded={() => beginFrames(true)} onError={() => { if (v3OpeningPlayed.current) beginFrames(true); }} />}
  {deliveryProp?.schemaVersion === 3 && deliveryProp?.narration?.closing?.url && <audio ref={v3ClosingRef} src={mediaUrl(deliveryProp.narration.closing.url)} preload="metadata" onEnded={finishV3ClosingNarration} onError={finishV3ClosingNarration} />}
  <AnimatePresence>{gallery && <ClientGallery photos={galleryPhotos} title={story.clientName || story.title} demoId={demo ? demoId : null} delivery={deliveryProp} onClose={() => setGallery(false)} liked={galleryProps?.liked} onLike={galleryProps?.onLike} onDownload={galleryProps?.onDownload || ((_key, photoIndex) => download(photoIndex))} busy={galleryProps?.busy} downloading={downloading} onDownloadAll={galleryProps?.onDownloadAll || downloadAll} allDownloading={allDownloading} downloadNotice={galleryProps?.downloadNotice || downloadNotice} downloadProgress={galleryProps?.downloadProgress || downloadProgress} />}</AnimatePresence>
  </div>;
}
