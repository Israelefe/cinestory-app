import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { ArrowLeft, ChevronLeft, ChevronRight, Pointer, Images, LoaderCircle, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import ClientGallery from './ClientGallery.jsx';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import { useDialogFocus } from '../useDialogFocus.js';
import { StoryCaptionContent, StoryCaptionDialog } from './StoryCaption.jsx';
import { revealEndingPhotos, revealPhotos, revealSettings, revealTheme } from '../../utils/photoReveal.js';
import { useSmoothSoundtrackLoop } from '../../utils/smoothSoundtrackLoop.js';
import './DeliveryTypography.css';
import './RevealViewer.css';

const number = value => String(value).padStart(2, '0');
const ease = [.22, 1, .36, 1];
const sizes = '(max-width: 640px) 90vw, (max-width: 1024px) 80vw, 850px';

function RevealImage({ photo, className = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setFailed(false); setAttempt(0); }, [photo?.url]);
  if (!photo) return null;
  return <div className={`rv-image ${className}`}>
    <img key={`${photo.url}-${attempt}`} src={photo.url} srcSet={photo.srcSet} sizes={sizes} alt={photo.alt || ''} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} onLoad={() => setFailed(false)} />
    {failed && <button className="rv-retry" type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}><RotateCcw size={16} />Retry photograph</button>}
  </div>;
}

function RevealIntroduction({ photo, count, onContinue, loading, failed }) {
  const dialog = useRef(null);
  useDialogFocus(true, dialog, onContinue);
  return <motion.main ref={dialog} key="introduction" className="rv-introduction-screen" role="dialog" aria-modal="true" aria-labelledby="rv-introduction-title" aria-describedby="rv-introduction-description" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: .4, ease }}>
    <div className="rv-introduction">
    <div className="rv-introduction-preview" aria-hidden="true">
      <RevealImage photo={photo} eager />
      <div className="rv-introduction-shutters">{[-1, 1].map(side => <motion.i key={side} animate={{ x: ['0%', '0%', `${side * 101}%`, `${side * 101}%`, '0%'] }} transition={{ duration: 5.5, times: [0, .18, .42, .8, 1], repeat: Infinity, ease }} />)}</div>
      <motion.span className="rv-introduction-hand" animate={{ y: [6, 0, 0, 6], scale: [1, .88, 1, 1] }} transition={{ duration: 5.5, times: [0, .18, .3, 1], repeat: Infinity, ease }}><Pointer size={24} strokeWidth={1.5} /></motion.span>
    </div>
    <div><span>{number(count)} PHOTOGRAPHS · YOUR PACE</span><h2 id="rv-introduction-title">A tap reveals the next photo.</h2><p id="rv-introduction-description">Tap anywhere on a photo. Stay with it as long as you like.</p></div>
    <button className="rv-primary" type="button" disabled={loading} onClick={onContinue}>{loading ? <LoaderCircle className="rv-spin" size={18} /> : null}Got it<ChevronRight size={19} /></button>
    {failed && <p className="rv-error" role="alert">The first photograph could not load. Tap “Got it” to try again.</p>}
    </div>
  </motion.main>;
}

function RevealVeil({ closed, style, onComplete }) {
  return <div className="rv-reveal-veil" data-style={style} aria-hidden="true">
    {[-1, 1].map((side, at) => <motion.i className="rv-veil-panel" key={side} initial="closed" animate={closed ? 'closed' : 'open'} onAnimationComplete={at === 1 ? onComplete : undefined} variants={{
      closed: { x: '0%', y: '0%', opacity: 1, transition: { duration: .38, ease: [.65, 0, .35, 1] } },
      open: { x: style === 'curtain' ? `${side * 101}%` : '0%', y: style === 'lift' ? '-101%' : '0%', opacity: style === 'fade' ? 0 : 1, transition: { duration: 1.15, delay: .1 + at * .08, ease } }
    }} />)}
    <motion.span className="rv-veil-seam" initial="closed" animate={closed ? 'closed' : 'open'} variants={{ closed: { opacity: .6, scaleY: 1, transition: { duration: .3 } }, open: { opacity: 0, scaleY: .4, transition: { duration: .45 } } }} />
  </div>;
}

export default function RevealViewer({ delivery, demo = false, galleryProps = {} }) {
  const [searchParams] = useSearchParams();
  const embeddedPhone = searchParams.get('phoneView') === '1';
  const reduced = useVeyloReducedMotion();
  const photos = useMemo(() => revealPhotos(delivery), [delivery]);
  const allPhotos = useMemo(() => revealPhotos(delivery, true), [delivery]);
  const settings = revealSettings(delivery);
  const theme = revealTheme(delivery);
  const direction = delivery?.creativeDirection || {};
  const cover = allPhotos.find(photo => photo.assetId === delivery?.v3?.openingAssetId) || photos[0];
  const closing = allPhotos.find(photo => photo.assetId === delivery?.v3?.closingAssetId) || photos.at(-1);
  const ending = revealEndingPhotos(photos, closing, settings.ending);
  const [phase, setPhase] = useState('opening');
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState(new Set());
  const [tray, setTray] = useState(false);
  const [gallery, setGallery] = useState(null);
  const [pending, setPending] = useState(null);
  const [failed, setFailed] = useState(null);
  const [resume, setResume] = useState(null);
  const [navigationDirection, setNavigationDirection] = useState(1);
  const [tapPressed, setTapPressed] = useState(false);
  const [revealStage, setRevealStage] = useState('idle');
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [veilClosed, setVeilClosed] = useState(true);
  const veilWait = useRef(null);
  const navigating = useRef(false);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [muted, setMuted] = useState(false);
  const [musicStarted, setMusicStarted] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [demoLiked, setDemoLiked] = useState(new Set());
  const [demoBusy, setDemoBusy] = useState(null);
  const audio = useRef(null);
  const region = useRef(null);
  const regionObserver = useRef(null);
  const observeRegion = useCallback(element => {
    regionObserver.current?.disconnect();
    region.current = element;
    if (!element) return;
    const update = () => { const { width, height } = element.getBoundingClientRect(); setFrameSize(current => current.width === width && current.height === height ? current : { width, height }); };
    update(); regionObserver.current = new ResizeObserver(update); regionObserver.current.observe(element);
  }, []);
  const tapStart = useRef(null);
  const suppressTap = useRef(false);
  const cache = useRef(new Map());
  const request = useRef(0);
  const mounted = useRef(true);
  const heading = useRef(null);
  const focusAfterNavigation = useRef(false);
  const introductionsSeen = useRef(new Set());
  const attachHeading = useCallback(element => {
    heading.current = element;
    if (element && focusAfterNavigation.current) { element.focus({ preventScroll: true }); focusAfterNavigation.current = false; }
  }, []);
  const track = delivery?.soundtrack?.url || '';
  const identity = delivery?.publicId || delivery?._id || 'preview';
  const orderKey = photos.map(photo => `${photo.assetId}:${photo.url}`).join('|');
  const storageKey = !demo && delivery?.publicId ? `veylo:reveal:${delivery.publicId}` : null;
  const active = photos[index];
  const onLike = demo ? assetId => setDemoLiked(current => { const next = new Set(current); next.has(assetId) ? next.delete(assetId) : next.add(assetId); return next; }) : galleryProps.onLike;
  useSmoothSoundtrackLoop(audio, track);

  function cancelVeil() {
    veilWait.current?.resolve();
    veilWait.current = null;
  }

  function finishVeil(animation) {
    if (!mounted.current) return;
    if (animation === 'closed' && veilWait.current?.token === request.current) {
      const waiting = veilWait.current;
      veilWait.current = null;
      waiting.resolve();
    } else if (animation === 'open' && phase === 'reveal' && revealStage === 'uncovering') {
      navigating.current = false; setRevealStage('idle'); setPending(null);
    }
  }

  function load(photo, priority = 'low') {
    if (!photo?.url) return Promise.reject(new Error('Missing photograph'));
    const key = `${photo.url}|${photo.srcSet || ''}`;
    const existing = cache.current.get(key);
    if (existing) { if (priority === 'high') existing.image.fetchPriority = 'high'; return existing.promise; }
    const image = new window.Image();
    image.decoding = 'async'; image.fetchPriority = priority;
    const entry = { image };
    entry.promise = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => { cache.current.delete(key); reject(new Error('Photograph took too long')); }, 20000);
      image.onload = async () => {
        window.clearTimeout(timeout);
        try { await image.decode?.(); } catch { /* A loaded photograph can still be displayed. */ }
        entry.ratio = image.naturalWidth / image.naturalHeight || 2 / 3;
        resolve(entry);
      };
      image.onerror = () => { window.clearTimeout(timeout); cache.current.delete(key); reject(new Error('Photograph could not load')); };
      if (photo.srcSet) image.srcset = photo.srcSet;
      image.sizes = sizes; image.src = photo.url;
    });
    cache.current.set(key, entry);
    // Keep a small working set; the browser retains downloaded image bytes.
    if (cache.current.size > 5) cache.current.delete(cache.current.keys().next().value);
    return entry.promise;
  }

  function playMusic() {
    if (!audio.current || !track) return;
    setAudioLoading(true); setAudioFailed(false);
    audio.current.volume = .45;
    audio.current.play().catch(() => { if (mounted.current) { setAudioLoading(false); setAudioFailed(true); } });
  }

  function beginReveal() {
    const key = `veylo:reveal:introduction:${identity}`;
    let introduced = introductionsSeen.current.has(identity);
    try { introduced ||= sessionStorage.getItem(key) === 'seen'; } catch { /* The in-memory flag still covers replays when storage is unavailable. */ }
    if (introduced) navigate(0, true);
    else setPhase('introduction');
  }

  function finishIntroduction() {
    introductionsSeen.current.add(identity);
    try { sessionStorage.setItem(`veylo:reveal:introduction:${identity}`, 'seen'); } catch { /* Storage is optional. */ }
    navigate(0, true);
  }

  async function navigate(target, beginning = false) {
    if (!photos[target] || navigating.current || captionExpanded) return;
    navigating.current = true;
    const token = ++request.current;
    setPending(target); setFailed(null);
    if (beginning && track && !muted) { setMusicStarted(true); playMusic(); }
    try {
      await load(photos[target], 'high');
      if (!mounted.current || token !== request.current) return;
      if (!beginning && phase === 'reveal') {
        setRevealStage('covering');
        await new Promise(resolve => { veilWait.current = { token, resolve }; setVeilClosed(true); });
        if (!mounted.current || token !== request.current) return;
      }
      setNavigationDirection(target < index ? -1 : 1);
      setIndex(target); setPhase('reveal'); setTray(false); setRevealStage('uncovering'); setVeilClosed(false);
      setSeen(current => new Set([...current, ...Array.from({ length: beginning ? target + 1 : 0 }, (_, at) => photos[at].assetId), photos[target].assetId]));
      focusAfterNavigation.current = beginning || tray;
    } catch {
      if (mounted.current && token === request.current) { navigating.current = false; setPending(null); setFailed(target); setRevealStage('idle'); }
    }
  }
  function next() {
    if (navigating.current || captionExpanded) return;
    if (index < photos.length - 1) navigate(index + 1);
    else { setPhase('closing'); setTray(false); if (storageKey) try { localStorage.removeItem(storageKey); } catch { /* Storage is optional. */ } }
  }
  function restart() {
    request.current += 1; cancelVeil(); navigating.current = false; setVeilClosed(true); setCaptionExpanded(false); setRevealStage('idle'); setPending(null); setFailed(null); setPhase('opening'); setIndex(0); setSeen(new Set()); setResume(null); setTray(false); setMusicStarted(false);
    if (audio.current) { audio.current.pause(); audio.current.currentTime = 0; }
    if (storageKey) try { localStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
  }
  function openGallery(initialIndex = null) {
    if (phase !== 'closing') return;
    setGallery({ initialIndex });
  }
  function openPhoto(photo) {
    const at = allPhotos.findIndex(item => item.assetId === photo.assetId);
    openGallery(at >= 0 ? at : null);
  }
  function toggleSound() {
    if (audioFailed || muted) { setMuted(false); setMusicStarted(true); playMusic(); }
    else { setMuted(true); audio.current?.pause(); setAudioLoading(false); }
  }
  async function downloadDemo(assetId) {
    const photo = allPhotos.find(item => item.assetId === assetId);
    if (!photo) return;
    const response = await fetch(photo.url);
    if (!response.ok) throw new Error('Download failed');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = `sharon-${allPhotos.indexOf(photo) + 1}.webp`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function runDemoDownload(assetId) {
    setDemoBusy(assetId || 'all');
    try { for (const photo of assetId ? allPhotos.filter(item => item.assetId === assetId) : allPhotos) await downloadDemo(photo.assetId); }
    catch { toast.error('This photograph could not download. Please try again.'); }
    finally { setDemoBusy(null); }
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current += 1; cancelVeil(); audio.current?.pause(); regionObserver.current?.disconnect(); };
  }, []);
  useEffect(() => {
    request.current += 1; cancelVeil(); navigating.current = false; setVeilClosed(true); setCaptionExpanded(false); setRevealStage('idle'); setPhase('opening'); setIndex(0); setSeen(new Set()); setGallery(null); setTray(false); setPending(null); setFailed(null); setResume(null); cache.current.clear();
    if (storageKey) try { const saved = localStorage.getItem(storageKey); const at = photos.findIndex(photo => photo.assetId === saved); if (at > 0) setResume(at); } catch { /* Private browsing can disable storage. */ }
  }, [identity, orderKey]);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (phase === 'reveal' && storageKey && active) try { localStorage.setItem(storageKey, active.assetId); } catch { /* Storage is optional. */ }
    const toLoad = phase === 'opening' || phase === 'introduction' ? [photos[0]] : [photos[index + 1], photos[index - 1], ...(index >= photos.length - 2 ? [closing] : [])];
    toLoad.filter(Boolean).forEach(photo => load(photo).catch(() => {}));
  }, [phase, index, orderKey, storageKey]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [phase]);
  useEffect(() => {
    const player = audio.current;
    if (!player) return undefined;
    if (gallery || captionExpanded || hidden || muted || !musicStarted || phase === 'opening' || phase === 'introduction') { player.pause(); return undefined; }
    if (phase === 'reveal') { playMusic(); return undefined; }
    let frame;
    const from = player.volume, start = performance.now();
    const fade = now => { player.volume = Math.max(0, from * (1 - Math.min(1, (now - start) / 900))); if (now - start < 900) frame = requestAnimationFrame(fade); else player.pause(); };
    frame = requestAnimationFrame(fade);
    return () => cancelAnimationFrame(frame);
  }, [phase, Boolean(gallery), captionExpanded, hidden, muted, musicStarted, track]);
  useEffect(() => {
    const onKey = event => {
      if (phase !== 'reveal' || gallery || captionExpanded || pending !== null || event.target?.closest('input, textarea, select, [role="dialog"]')) return;
      if (event.key === 'ArrowRight' || (event.key === ' ' && !event.target?.closest('button, a'))) { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); navigate(index - 1); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [phase, gallery, captionExpanded, index, pending, photos]);

  if (!photos.length) return <div className="fd-page rv-viewer" style={theme}><main className="rv-empty"><h1>Your photographs are being prepared.</h1><p>Please try opening this delivery again in a moment.</p></main></div>;
  const cached = cache.current.get(`${active.url}|${active.srcSet || ''}`);
  const ratio = cached?.ratio || (active.width && active.height ? active.width / active.height : 2 / 3);
  const width = Math.min(Math.max(1, frameSize.width - 20), Math.max(1, frameSize.height - 40) * ratio);
  const revealMotion = reduced ? {} : { initial: { opacity: settings.style === 'curtain' ? 1 : 0, y: settings.style === 'lift' ? navigationDirection * 18 : 0 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: .5, ease } };
  const title = direction.title || delivery?.title || `${delivery?.clientName || 'Your'} photographs`;
  const galleryActions = demo ? { liked: demoLiked, onLike, onDownload: runDemoDownload, onDownloadAll: () => runDemoDownload(), busy: demoBusy } : galleryProps;
  const loading = pending !== null;
  const moving = !reduced && settings.movement && !motionPaused && !gallery && !captionExpanded && !hidden;
  return <div className="fd-page rv-viewer" style={theme} data-reveal-style={settings.style} data-phase={phase} data-reveal-stage={revealStage}>
    {track && <audio ref={audio} src={track} crossOrigin="anonymous" loop preload="metadata" onWaiting={() => setAudioLoading(true)} onPlaying={() => { setAudioLoading(false); setAudioFailed(false); }} onPause={() => setAudioLoading(false)} onError={() => { setAudioLoading(false); setAudioFailed(true); }} />}
    <header className="rv-header">
      <div className="rv-brand"><DeliveryBrandMark branding={delivery.branding} /><div><span>{delivery.branding?.type === 'studio' ? 'Photographed by' : 'Photo Reveal'}</span><strong>{delivery.branding?.name || 'Veylo'}</strong></div></div>
      <div className="rv-header-actions">
        {demo && !embeddedPhone && <Link className="rv-icon rv-demo-back" to="/formats#photo-reveal" aria-label="Back to formats"><ArrowLeft size={18} /></Link>}
        {phase === 'reveal' && settings.movement && <button type="button" className="rv-icon" onClick={() => setMotionPaused(value => !value)} aria-label={motionPaused ? 'Resume photo movement' : 'Pause photo movement'} aria-pressed={motionPaused}>{motionPaused ? <Play size={17} /> : <Pause size={17} />}</button>}
        {track && <button type="button" className="rv-icon" onClick={toggleSound} aria-label={audioFailed ? 'Try soundtrack again' : muted ? 'Turn soundtrack on' : 'Mute soundtrack'} aria-busy={audioLoading}>{audioLoading ? <LoaderCircle className="rv-spin" size={18} /> : muted || audioFailed ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>}
        {phase === 'closing' && <button className="rv-gallery-button" type="button" onClick={() => openGallery()} aria-label="Open full gallery"><Images size={18} /><span>Full gallery</span></button>}
      </div>
    </header>
    <AnimatePresence mode="wait">
      {phase === 'opening' ? <motion.main key="opening" className="rv-opening" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .35 }}>
        <motion.div className="rv-cover-photo" initial={reduced ? false : { scale: 1.035 }} animate={{ scale: 1 }} transition={{ duration: reduced ? 0 : 2.5, ease }}><RevealImage photo={cover} eager /></motion.div>
        <div className="rv-opening-copy">
          <motion.span className="rv-eyebrow" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>A PRIVATE PHOTO REVEAL <i /></motion.span>
          <motion.h1 initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .65, delay: reduced ? 0 : .1, ease }}>{title}</motion.h1>
          <p>{direction.openingLine || 'Take your time. Reveal each photograph when you are ready.'}</p>
          <div className="rv-opening-actions"><button className="rv-primary" type="button" disabled={loading} onClick={beginReveal}>{loading ? <LoaderCircle className="rv-spin" size={18} /> : null}Begin reveal<ChevronRight size={19} /></button>{resume !== null && <button className="rv-secondary" type="button" disabled={loading} onClick={() => navigate(resume, true)}>Continue from {number(resume + 1)}<ChevronRight size={17} /></button>}</div>
          {failed !== null && <p className="rv-error" role="alert">The first photograph could not load. <button type="button" onClick={() => navigate(failed, true)}>Try again</button></p>}
        </div>
      </motion.main> : phase === 'introduction' ? <RevealIntroduction key="introduction" photo={cover} count={photos.length} onContinue={finishIntroduction} loading={loading} failed={failed !== null} /> : phase === 'reveal' ? <motion.main key="reveal" className="rv-room" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .3 }}>
        <div className="rv-photo-region" style={{ '--rv-ratio': ratio }} ref={observeRegion}>
          <motion.div className="rv-photo-frame" style={{ width, height: width / ratio }} data-moving={moving} animate={{ y: moving ? [0, -10, 0, 7, 0] : 0, rotate: moving ? [0, -.4, 0, .4, 0] : 0, scale: !reduced && tapPressed ? .975 : 1 }} transition={{ y: { duration: moving ? 6.5 : 0, repeat: moving ? Infinity : 0, ease: 'easeInOut' }, rotate: { duration: moving ? 9 : 0, repeat: moving ? Infinity : 0, ease: 'easeInOut' }, scale: { type: 'spring', damping: 24, stiffness: 260 } }}>
            <AnimatePresence initial={false}>{<motion.figure key={active.assetId} {...revealMotion} className="rv-photo" data-asset-id={active.assetId}>
              <motion.div className="rv-photo-content" initial={!reduced && settings.movement ? { scale: .92, y: 24 } : false} animate={{ scale: 1, y: 0 }} transition={{ duration: 1.55, delay: .1, ease }}><RevealImage photo={active} eager /></motion.div>
            </motion.figure>}</AnimatePresence>
            <div className="rv-corners" aria-hidden="true"><i /><i /><i /><i /></div>
            <RevealVeil closed={veilClosed} style={settings.style} onComplete={finishVeil} />
          </motion.div>
          <div className="rv-photo-hit-area" style={{ width, height: width / ratio }}>
            <button className="rv-tap-target" type="button" disabled={loading || captionExpanded} aria-label={index === photos.length - 1 ? 'Complete reveal' : 'Reveal next photo'}
              onPointerDown={event => { if (!event.isPrimary || event.button !== 0) return; tapStart.current = { x: event.clientX, y: event.clientY }; suppressTap.current = false; setTapPressed(true); event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={event => { const start = tapStart.current; if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) suppressTap.current = true; }}
              onPointerUp={event => { const start = tapStart.current; tapStart.current = null; setTapPressed(false); if (event.isPrimary && start && !suppressTap.current && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 12) next(); }}
              onPointerCancel={() => { tapStart.current = null; suppressTap.current = true; setTapPressed(false); }}
              onClick={event => { if (event.detail === 0) next(); }} />
            {index > 0 && <button className="rv-icon rv-photo-previous" type="button" disabled={loading} onClick={() => navigate(index - 1)} aria-label="Previous photograph"><ChevronLeft size={21} /></button>}
          </div>
        </div>
        <aside className="rv-details"><div className="rv-detail-top"><div className="rv-position fd-reveal-position" aria-label={`Photograph ${index + 1} of ${photos.length}`}><span>{number(index + 1)}</span><div role="progressbar" aria-label="Reveal progress" aria-valuemin={0} aria-valuemax={photos.length} aria-valuenow={seen.size}><motion.i animate={{ scaleX: seen.size / photos.length }} transition={{ duration: reduced ? 0 : .4, ease }} /></div><span>{number(photos.length)}</span></div>
          <div className="rv-photo-actions"><button type="button" className="rv-icon rv-seen-button" onClick={() => setTray(value => !value)} aria-label="Revisit photos" title="Revisit photos" aria-expanded={tray} aria-controls="rv-seen"><Images size={18} /></button></div>
          </div>
          <AnimatePresence mode="wait"><motion.div className="rv-caption fd-reveal-caption" key={active.assetId} initial={reduced ? false : { opacity: 0, y: navigationDirection * 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .4, delay: reduced ? 0 : .5, ease }}>
            <StoryCaptionContent text={`${active.headline || ''}:${active.caption || ''}`} selector="h2, p" onRead={() => setCaptionExpanded(true)}>
              <h2 ref={attachHeading} tabIndex={-1}>{active.headline || `Photograph ${number(index + 1)}`}</h2>{active.caption && <p>{active.caption}</p>}
            </StoryCaptionContent>
          </motion.div></AnimatePresence>
          {tray && <motion.nav className="rv-seen" id="rv-seen" aria-label="Seen photographs" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .2 }}>{photos.map((photo, at) => seen.has(photo.assetId) ? <button key={photo.assetId} type="button" onClick={() => navigate(at)} disabled={loading} aria-label={`Revisit photograph ${at + 1}`} aria-current={at === index ? 'true' : undefined}><img src={photo.thumbnailUrl || photo.url} alt="" /><span>{number(at + 1)}</span></button> : null)}</motion.nav>}
          <div className="rv-loading-status" role="status" aria-live="polite">{loading && revealStage === 'idle' ? 'Loading the next photograph…' : ''}</div>{failed !== null && <p className="rv-error" role="alert">This photograph could not load. <button type="button" onClick={() => navigate(failed)}>Retry photograph</button></p>}
        </aside>
      </motion.main> : <motion.main key="closing" className="rv-closing" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : .45 }}>
        <div className={`rv-ending-photos ${ending.length === 1 ? 'is-single' : ''}`}>{ending.map((photo, at) => <motion.figure key={photo.assetId} className={photo.assetId === closing?.assetId ? 'is-leading' : ''} initial={reduced ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .65, delay: reduced ? 0 : at * .1, ease }}><button type="button" onClick={() => openPhoto(photo)} aria-label={`View closing photograph ${at + 1}`}><RevealImage photo={photo} eager /></button></motion.figure>)}</div>
        <div className="rv-closing-copy"><span className="rv-eyebrow">ALL {number(photos.length)} REVEALED <i /></span><h1>{delivery.clientName ? `${delivery.clientName}, these are yours.` : 'These photographs are yours.'}</h1><p>{direction.closingLine || 'Your complete gallery is ready to view and download.'}</p><div className="rv-ending-actions"><button type="button" className="rv-primary" onClick={() => openGallery()}>View full gallery<Images size={18} /></button><button type="button" className="rv-secondary" onClick={restart}><RotateCcw size={17} />Start again</button></div></div>
      </motion.main>}
    </AnimatePresence>
    <AnimatePresence>{captionExpanded && <StoryCaptionDialog title={active.headline || `Photograph ${number(index + 1)}`} text={active.caption || ''} fontStyles={theme} className="rv-caption-reading" pauseLabel="Take your time" backLabel="Back to the photos" onClose={() => setCaptionExpanded(false)} />}</AnimatePresence>
    <AnimatePresence>{phase === 'closing' && gallery && <ClientGallery key="reveal-gallery" photos={allPhotos} title={delivery.clientName ? `${delivery.clientName}’s photographs` : 'Your photographs'} initialIndex={gallery.initialIndex} onClose={() => setGallery(null)} delivery={delivery} fontStyles={theme} {...galleryActions} />}</AnimatePresence>
  </div>;
}
