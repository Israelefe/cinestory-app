import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useAnimationControls, useMotionValue, useTransform } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import {
  ArrowRight,
  ArrowDownToLine,
  Check,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  MoveHorizontal,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX
} from 'lucide-react';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import ClientGallery from './ClientGallery.jsx';
import { API_BASE_URL } from '../../config/env.js';
import { deliveryFontStyles } from '../../utils/deliveryTypography.js';
import './PhotoSwapViewer.css';
import './DeliveryTypography.css';

const SWIPE_VELOCITY = 560;
const SWIPE_DISTANCE_RATIO = 0.2;
const PHOTO_SIZES = '(max-width: 640px) 92vw, (max-width: 1024px) 500px, 800px';
const PRINT_DESIGNS = ['paper', 'ink', 'folio', 'linen', 'edge', 'portrait'];
const PRINT_TILTS = [-3, 2.4, -2.6, 2.8, -2.1, 3];

function mediaUrl(value) {
  return typeof value === 'string' && value.startsWith('/api/')
    ? API_BASE_URL.replace(/\/$/, '') + value.slice(4)
    : value;
}

function photoUrl(asset) {
  return asset?.url || asset?.thumbnailUrl || '';
}

function dominantColor(asset) {
  const value = asset?.dominantColor || asset?.photoColors?.[0] || asset?.analysis?.colors?.[0];
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function printSignature(asset, index) {
  return Array.from(String(asset.assetId || index)).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, index + 1);
}

function PhotoSwapPrint({ asset, index, depth, registerActiveCard, onPhotoRatio, pointerHandlers, motionEnabled }) {
  const element = useRef(null);
  const offset = useMotionValue(0);
  const signature = printSignature(asset, index);
  const restingTilt = Math.max(-3, Math.min(3, PRINT_TILTS[index % PRINT_TILTS.length] + (signature % 51 - 25) / 100));
  const tilt = useMotionValue(restingTilt + (depth === 1 ? 3 : depth === 2 ? -4 : 0));
  const rotation = useTransform([offset, tilt], ([x, angle]) => angle + Math.max(-17, Math.min(17, x / 22)));
  const photoControls = useAnimationControls();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = depth === 0;
  const visible = depth < 3;

  useLayoutEffect(() => {
    if (!active) { offset.stop(); offset.set(0); return undefined; }
    const card = { offset, element: element.current };
    registerActiveCard(card);
    return () => registerActiveCard(null, card);
  }, [active, offset, registerActiveCard]);

  useLayoutEffect(() => {
    const movement = animate(tilt, restingTilt + (depth === 1 ? 3 : depth === 2 ? -4 : 0), { type: 'spring', stiffness: 240, damping: 30 });
    return () => movement.stop();
  }, [depth, restingTilt, tilt]);

  useEffect(() => {
    if (!motionEnabled || !active || failed) { photoControls.stop(); return undefined; }
    photoControls.start({
      x: [0, -2, 2, 0], y: [0, 2, -2, 0], scale: [0.985, 1, 0.985],
      transition: { duration: 12 + index % 4 * 2, repeat: Infinity, ease: 'easeInOut' }
    });
    return () => photoControls.stop();
  }, [active, failed, index, motionEnabled, photoControls]);

  useEffect(() => () => offset.stop(), [offset]);

  return <motion.article
    ref={element}
    className={'ps-photo-card ps-design-' + PRINT_DESIGNS[index % PRINT_DESIGNS.length] + (active ? ' ps-card-front ps-print-top' : depth === 1 ? ' ps-print-behind ps-print-second' : depth === 2 ? ' ps-print-behind ps-print-third' : ' ps-print-behind ps-print-hidden')}
    data-asset-id={asset.assetId}
    style={{ x: offset, rotate: rotation, zIndex: active ? 3 : visible ? 3 - depth : 0, '--ps-card-tone': dominantColor(asset) || `hsl(${24 + signature % 20} 24% 34%)`, '--ps-paper-tone': `hsl(${28 + signature % 18} ${18 + signature % 15}% ${86 + signature % 6}%)` }}
    initial={false}
    animate={{ scale: active ? 1 : 1 - Math.min(depth, 2) * 0.035, y: active ? 0 : Math.min(depth, 2) * 6, opacity: visible ? 1 : 0 }}
    transition={{ type: 'spring', stiffness: 240, damping: 30 }}
    {...(active ? pointerHandlers : {})}
    aria-hidden={active ? undefined : true}
    role={active ? 'group' : undefined}
    aria-roledescription={active ? 'photograph' : undefined}
    aria-label={active ? pointerHandlers['aria-label'] : undefined}
    tabIndex={active ? 0 : -1}
  >
    <motion.div className="ps-print-photo-window" initial={{ scale: 0.985 }} animate={photoControls}>
      <img
        key={attempt}
        className="ps-card-photo"
        src={mediaUrl(photoUrl(asset))}
        srcSet={asset.srcSet || undefined}
        sizes={PHOTO_SIZES}
        alt={asset.alt || asset.caption || 'Photograph ' + (index + 1)}
        fetchPriority={active ? 'high' : 'low'}
        decoding="async"
        draggable="false"
        onError={() => setFailed(true)}
        onLoad={event => {
          setFailed(false);
          const image = event.currentTarget;
          if (image.naturalWidth && image.naturalHeight) onPhotoRatio(asset.assetId, image.naturalWidth / image.naturalHeight);
        }}
      />
    </motion.div>
    {failed && active && <div className="ps-photo-error" role="status" onPointerDown={event => event.stopPropagation()}>
      <ImageIcon size={26} /><p>This photo couldn’t load.</p>
      <button type="button" className="ps-secondary-button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Try again</button>
    </div>}
  </motion.article>;
}

export default function PhotoSwapViewer({ delivery, galleryProps = {}, demo = false, preview = false }) {
  const assets = useMemo(
    () => [...(delivery?.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
    [delivery?.assets]
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [localLiked, setLocalLiked] = useState(() => new Set());
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [peekDirection, setPeekDirection] = useState(-1);
  const [deckRegion, setDeckRegion] = useState(null);
  const [deckSize, setDeckSize] = useState(null);
  const [photoRatios, setPhotoRatios] = useState(() => new Map());
  const titleId = useId();
  const mountedRef = useRef(true);
  const audioRef = useRef(null);
  const soundtrackAttemptRef = useRef(null);
  const advanceLockRef = useRef(false);
  const queuedKeyboardNavigationRef = useRef(null);
  const pointerGestureRef = useRef(null);
  const imageReadinessRef = useRef(new Map());
  const activeCardRef = useRef(null);
  const viewerElementRef = useRef(null);
  const reduced = useVeyloReducedMotion();

  const registerActiveCard = useCallback((card, departingCard) => {
    if (!card) {
      if (activeCardRef.current === departingCard) activeCardRef.current = null;
      return;
    }
    activeCardRef.current = card;
    if (document.activeElement?.closest('.ps-photo-card')) card.element?.focus({ preventScroll: true });
  }, []);

  const onPhotoRatio = useCallback((assetId, ratio) => {
    setPhotoRatios(current => current.get(assetId) === ratio ? current : new Map(current).set(assetId, ratio));
  }, []);

  const isEnd = currentIndex >= assets.length;
  const currentAsset = isEnd ? null : assets[currentIndex];
  const photoRatio = photoRatios.get(currentAsset?.assetId)
    || (currentAsset?.width > 0 && currentAsset?.height > 0 ? currentAsset.width / currentAsset.height : 0.75);

  useLayoutEffect(() => {
    if (!deckRegion) return undefined;
    const fitPrint = () => {
      const padding = getComputedStyle(deckRegion);
      const availableWidth = Math.max(1, deckRegion.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight));
      const availableHeight = Math.max(1, deckRegion.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom));
      const angle = 3 * Math.PI / 180;
      const widthLimit = availableWidth / (Math.cos(angle) + Math.sin(angle) / photoRatio);
      const heightLimit = Math.min(availableHeight, 680) / (Math.sin(angle) + Math.cos(angle) / photoRatio);
      const photoWidth = Math.min(widthLimit - 12, photoRatio < 1 ? 500 : 800, (heightLimit - 12) * photoRatio);
      const size = { width: Math.max(1, photoWidth + 12), height: Math.max(1, photoWidth / photoRatio + 12) };
      setDeckSize(current => current && Math.abs(current.width - size.width) < 1 && Math.abs(current.height - size.height) < 1 ? current : size);
    };
    fitPrint();
    const observer = new ResizeObserver(fitPrint);
    observer.observe(deckRegion);
    return () => observer.disconnect();
  }, [deckRegion, photoRatio]);

  const glow = delivery?.photoswap?.backgroundMode === 'dark' ? '#070709' : dominantColor(currentAsset || assets[0]) || '#31231f';

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; activeCardRef.current?.offset.stop(); advanceLockRef.current = false; };
  }, []);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  const ensurePhotoReady = useCallback(asset => {
    const source = mediaUrl(photoUrl(asset));
    if (!source) return Promise.resolve(false);
    const readinessKey = source + '\n' + (asset?.srcSet || '');

    const cached = imageReadinessRef.current.get(readinessKey);
    if (cached) return cached;

    const image = new window.Image();
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.sizes = PHOTO_SIZES;
    if (asset?.srcSet) image.srcset = asset.srcSet;

    const readiness = new Promise(resolve => {
      let settled = false;
      const timeout = window.setTimeout(() => finish(false), 8000);
      const finish = async loaded => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (loaded && typeof image.decode === 'function') {
          try {
            await image.decode();
          } catch {
            // A loaded image can still be displayed if explicit decoding is unavailable.
          }
        }
        resolve(loaded);
      };

      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = source;
      if (image.complete) finish(image.naturalWidth > 0);
    });

    imageReadinessRef.current.set(readinessKey, readiness);
    readiness.then(loaded => {
      if (!loaded && imageReadinessRef.current.get(readinessKey) === readiness) {
        imageReadinessRef.current.delete(readinessKey);
      }
    });
    return readiness;
  }, []);

  const soundtrackUrl = delivery?.soundtrack?.url ? mediaUrl(delivery.soundtrack.url) : '';
  const studioName = delivery?.branding?.name || 'Your photographer';
  const title = delivery?.title || (delivery?.clientName ? delivery.clientName + "'s photographs" : 'Your photographs');
  const fontStyles = useMemo(
    () => deliveryFontStyles(delivery?.photoswap?.typography),
    [delivery?.photoswap?.typography]
  );
  const stageStyle = {
    ...fontStyles,
    '--ps-photo-glow': glow
  };

  const canLike = delivery?.access?.allowLikes !== false
    && (typeof galleryProps?.onLike === 'function' || demo || preview);
  const canDownloadPhoto = delivery?.access?.allowIndividualDownloads !== false
    && typeof galleryProps?.onDownload === 'function';
  const canDownloadAll = delivery?.access?.allowDownloadAll === true
    && typeof galleryProps?.onDownloadAll === 'function';

  const requestSoundtrack = useCallback((fromGesture = false) => {
    const audio = audioRef.current;
    if (!audio || !soundtrackUrl || muted) return;
    if (!audio.paused && !fromGesture) return;
    if (!fromGesture && soundtrackAttemptRef.current) return soundtrackAttemptRef.current;
    try {
      audio.muted = false;
      const playback = audio.play();
      if (!playback?.then) {
        setSoundBlocked(false);
        return;
      }
      let attempt;
      attempt = playback
        .then(() => {
          if (soundtrackAttemptRef.current === attempt) setSoundBlocked(false);
        })
        .catch(() => {
          if (soundtrackAttemptRef.current === attempt) setSoundBlocked(true);
        })
        .finally(() => {
          if (soundtrackAttemptRef.current === attempt) soundtrackAttemptRef.current = null;
        });
      soundtrackAttemptRef.current = attempt;
      return attempt;
    } catch {
      setSoundBlocked(true);
    }
  }, [muted, soundtrackUrl]);

  const beginExperience = useCallback(() => {
    requestSoundtrack(true);
    setHasStarted(true);
  }, [requestSoundtrack]);

  useEffect(() => {
    if (!soundtrackUrl || !hasStarted) return undefined;
    const handleVisibility = () => {
      if (document.hidden) audioRef.current?.pause();
      else requestSoundtrack();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [hasStarted, requestSoundtrack, soundtrackUrl]);

  useEffect(() => {
    if (!assets.length) return undefined;
    const nextAsset = assets[currentIndex + 1];
    if (nextAsset) ensurePhotoReady(nextAsset);
    return undefined;
  }, [assets, currentIndex, ensurePhotoReady]);

  /* Left advances; right returns to the previous photograph. */
  const navigateAdjacent = useCallback((swipeDirection, cardWidth, releaseVelocity = 0) => {
    if (currentIndex >= assets.length || advanceLockRef.current) return false;
    const card = activeCardRef.current;
    if (!card) return false;
    const step = swipeDirection < 0 ? 1 : -1;
    const nextIndex = currentIndex + step;
    if (nextIndex < 0 || nextIndex > assets.length) return false;

    advanceLockRef.current = true;
    setIsAdvancing(true);
    setPeekDirection(swipeDirection);
    const cardNode = card.element;
    const width = cardWidth || cardNode?.offsetWidth || window.innerWidth;
    const height = cardNode?.offsetHeight || width;
    const stageWidth = viewerElementRef.current?.clientWidth || window.innerWidth;
    const exitX = (swipeDirection < 0 ? -1 : 1)
      * ((stageWidth + width) / 2 + height * 0.2 + 24);
    const launchVelocity = Math.sign(releaseVelocity) === Math.sign(swipeDirection)
      ? Math.max(-1800, Math.min(1800, releaseVelocity))
      : 0;
    // Keep the current photograph on screen while a slow connection loads the next.
    const ready = nextIndex < assets.length ? ensurePhotoReady(assets[nextIndex]) : Promise.resolve(true);
    ready.then(() => {
      if (!mountedRef.current || !advanceLockRef.current) return;
      animate(card.offset, exitX, {
        type: 'spring',
        stiffness: reduced ? 500 : 420,
        damping: reduced ? 46 : 38,
        velocity: launchVelocity,
        restDelta: 2,
        onComplete: () => {
          if (!mountedRef.current) return;
          advanceLockRef.current = false;
          setCurrentIndex(nextIndex);
          setIsAdvancing(false);
        }
      });
    });
    return true;
  }, [assets, currentIndex, reduced, ensurePhotoReady]);

  const snapCardToCenter = useCallback(() => {
    const offset = activeCardRef.current?.offset;
    if (offset) animate(offset, 0, { type: 'spring', damping: 28, stiffness: 300 });
  }, []);

  const handleCardPointerDown = useCallback(event => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (advanceLockRef.current) return;
    activeCardRef.current?.offset.stop();
    pointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: event.timeStamp,
      axis: null,
      offset: activeCardRef.current?.offset,
      width: event.currentTarget.getBoundingClientRect().width
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in a few embedded webviews.
    }
    requestSoundtrack(true);
  }, [requestSoundtrack]);

  const handleCardPointerMove = useCallback(event => {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.axis) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
    }
    if (gesture.axis !== 'x') return;

    event.preventDefault();
    const direction = deltaX > 0 ? 1 : -1;
    setPeekDirection(current => current === direction ? current : direction);
    gesture.offset?.set(deltaX);
  }, []);

  const handleCardPointerUp = useCallback(event => {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    pointerGestureRef.current = null;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const elapsed = Math.max(1, event.timeStamp - gesture.startedAt);
    const velocityX = (deltaX / elapsed) * 1000;
    const horizontal = gesture.axis === 'x'
      || (!gesture.axis && Math.abs(deltaX) >= 8 && Math.abs(deltaX) > Math.abs(deltaY));
    const threshold = Math.max(64, gesture.width * SWIPE_DISTANCE_RATIO);
    const passed = Math.abs(deltaX) >= threshold
      || (Math.abs(deltaX) >= 32 && Math.abs(velocityX) >= SWIPE_VELOCITY);

    if (horizontal && passed && navigateAdjacent(Math.sign(deltaX || velocityX), gesture.width, velocityX)) return;
    snapCardToCenter();
  }, [navigateAdjacent, snapCardToCenter]);

  const handleCardPointerCancel = useCallback(event => {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    pointerGestureRef.current = null;
    snapCardToCenter();
  }, [snapCardToCenter]);

  const handleRestart = useCallback(() => {
    pointerGestureRef.current = null;
    activeCardRef.current?.offset.stop();
    activeCardRef.current?.offset.set(0);
    advanceLockRef.current = false;
    queuedKeyboardNavigationRef.current = null;
    setIsAdvancing(false);
    setPeekDirection(-1);
    setCurrentIndex(0);
  }, []);

  const toggleSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (muted || soundBlocked) {
      setMuted(false);
      audio.muted = false;
      try {
        audio.play().then(() => setSoundBlocked(false)).catch(() => setSoundBlocked(true));
      } catch {
        setSoundBlocked(true);
      }
      return;
    }
    audio.muted = true;
    setMuted(true);
  }, [muted, soundBlocked]);

  const toggleAssetLike = useCallback(assetId => {
    if (!assetId || !canLike) return;
    if (typeof galleryProps?.onLike === 'function') {
      galleryProps.onLike(assetId);
    } else {
      setLocalLiked(current => {
        const next = new Set(current);
        if (next.has(assetId)) next.delete(assetId);
        else next.add(assetId);
        return next;
      });
    }
  }, [canLike, galleryProps]);

  useEffect(() => {
    if (isAdvancing || galleryOpen) return;
    const direction = queuedKeyboardNavigationRef.current;
    queuedKeyboardNavigationRef.current = null;
    if (direction !== null) navigateAdjacent(direction);
  }, [isAdvancing, galleryOpen, navigateAdjacent]);

  /* Keyboard users can move in either direction through the photo set. */
  useEffect(() => {
    const handleKey = event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (target instanceof HTMLElement && target.tagName === 'BUTTON' && !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      if (!hasStarted || galleryOpen) return;
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (advanceLockRef.current) queuedKeyboardNavigationRef.current = -1;
        else navigateAdjacent(-1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (advanceLockRef.current) queuedKeyboardNavigationRef.current = 1;
        else navigateAdjacent(1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hasStarted, galleryOpen, navigateAdjacent]);

  if (!assets.length) {
    return (
      <main className="ps-viewer ps-empty" style={stageStyle}>
        <div className="ps-empty-card">
          <div className="ps-empty-mark"><DeliveryBrandMark branding={delivery?.branding} /></div>
          <p>PHOTO SWAP</p>
          <h1>Your photos will show up here.</h1>
          <span>This set is still being prepared.</span>
        </div>
      </main>
    );
  }

  const photoNumber = String(Math.min(currentIndex + 1, assets.length)).padStart(2, '0');
  const totalNumber = String(assets.length).padStart(2, '0');
  const resolvedLiked = galleryProps?.liked instanceof Set ? galleryProps.liked
    : Array.isArray(galleryProps?.liked) ? new Set(galleryProps.liked) : localLiked;
  const liked = currentAsset && resolvedLiked.has(currentAsset.assetId);
  const firstPrint = Math.max(0, currentIndex - 1);
  const prints = assets.slice(firstPrint, currentIndex + 3);
  const peekPrevious = peekDirection > 0 && currentIndex > 0;
  const photoMotionEnabled = pageVisible && !motionPaused && !galleryOpen && !isAdvancing
    && delivery?.photoswap?.photoMotion !== 'still' && currentAsset?.motion !== 'still';

  return (
    <div
      ref={viewerElementRef}
      className={'ps-viewer' + (preview ? ' is-preview' : '')}
      style={stageStyle}
    >
      {soundtrackUrl && (
        <audio
          ref={audioRef}
          src={soundtrackUrl}
          loop
          preload="none"
          playsInline
          muted={muted}
          onPlaying={() => setSoundBlocked(false)}
          onError={() => setSoundBlocked(true)}
        />
      )}
      <div className="ps-ambient" aria-hidden="true" />
      <main className={'ps-stage' + (!hasStarted ? ' is-opening' : isEnd ? ' is-complete' : ' is-browsing')} aria-label="Photo Swap">
        {/* ── Minimal header ── */}
        <header className="ps-header">
          <div className="ps-header-brand">
            <span className="ps-brand-mark"><DeliveryBrandMark branding={delivery?.branding} /></span>
            <span className="ps-header-copy">
              <strong>{studioName}</strong>
              <span>{hasStarted ? title : 'A collection for ' + (delivery?.clientName || 'you')}</span>
            </span>
          </div>
          <div className="ps-header-tools">
            {hasStarted && !isEnd && delivery?.photoswap?.photoMotion !== 'still' && currentAsset?.motion !== 'still' && <button type="button" className="ps-tool-button" onClick={() => setMotionPaused(value => !value)} aria-label={motionPaused ? 'Resume photo motion' : 'Pause photo motion'} title={motionPaused ? 'Resume photo motion' : 'Pause photo motion'} aria-pressed={motionPaused}>{motionPaused ? <Play size={16} /> : <Pause size={16} />}</button>}
            {soundtrackUrl && (
              <button
                type="button"
                className="ps-tool-button ps-sound-button"
                onClick={toggleSound}
                aria-label={muted ? 'Play soundtrack' : soundBlocked ? 'Try soundtrack again' : 'Mute soundtrack'}
                title={muted ? 'Play soundtrack' : soundBlocked ? 'Try soundtrack again' : 'Mute soundtrack'}
                aria-pressed={!muted && !soundBlocked}
              >
                {muted || soundBlocked ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
            )}
          </div>
        </header>

        {/* ── Segmented progress track ── */}
        {hasStarted && !isEnd && (
          <div className="ps-collection-bar">
            <span>PHOTO SWAP</span>
            <div className="ps-segments" aria-hidden="true">
            {assets.length <= 40 ? assets.map((_, i) => (
              <span
                key={i}
                className={'ps-segment' + (i < currentIndex ? ' is-done' : i === currentIndex && !isEnd ? ' is-active' : '')}
              />
            )) : <span className="ps-progress-track"><i style={{ transform: `scaleX(${(currentIndex + 1) / assets.length})` }} /></span>}
            </div>
            <span className="ps-progress-copy" aria-label={'Photo ' + (currentIndex + 1) + ' of ' + assets.length}><strong>{photoNumber}</strong> / {totalNumber}</span>
          </div>
        )}

        {/* ── Main View (Deck vs Completion View) with clean mode="wait" transition ── */}
        <AnimatePresence mode="wait" initial={false}>
          {!hasStarted ? (
            <motion.section
              key="ps-start-screen"
              className="ps-start-screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: reduced ? 0.2 : 0.3, ease: [0.22, 1, 0.36, 1] }}
              aria-labelledby={titleId + '-start'}
            >
              <div className="ps-start-stack" aria-hidden="true">
                {assets[2] && <div className="ps-start-card ps-start-third"><img src={mediaUrl(assets[2].thumbnailUrl || photoUrl(assets[2]))} alt="" /></div>}
                {assets[1] && (
                  <div className="ps-start-card ps-start-back">
                    <img src={mediaUrl(assets[1].thumbnailUrl || photoUrl(assets[1]))} alt="" />
                  </div>
                )}
                <motion.div
                  className="ps-start-card ps-start-front"
                  initial={{ rotate: -5, y: 16, opacity: 0 }}
                  animate={{ rotate: -3, y: 0, opacity: 1 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 100 }}
                >
                  <img src={mediaUrl(photoUrl(assets[0]))} srcSet={assets[0].srcSet || undefined} sizes="(max-width: 767px) 280px, 350px" alt="" />
                </motion.div>
                <div className="ps-cover-stamp"><span>THE COLLECTION</span><strong>{totalNumber}</strong><span>PHOTOGRAPHS</span></div>
              </div>
              <div className="ps-start-copy">
                <span className="ps-start-eyebrow">{delivery?.shootType || 'YOUR PHOTO COLLECTION'}</span>
                <h1 id={titleId + '-start'}>{title}</h1>
                <p>{delivery?.clientMessage || 'Take your time. Every photograph has its own place here.'}</p>
                <button type="button" className="ps-start-button" onClick={beginExperience}>
                  Swipe photographs <ArrowRight size={18} />
                </button>
                <span className="ps-start-note">{soundtrackUrl ? <><Volume2 size={14} /> A soundtrack accompanies your photos</> : <><MoveHorizontal size={14} /> Swipe through at your own pace</>}</span>
              </div>
            </motion.section>
          ) : isEnd ? (
            /* Collection handoff. */
            <motion.section
              key="ps-complete"
              className="ps-complete-card"
              initial={{ opacity: 0, scale: 0.92, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -18 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              aria-labelledby={titleId + '-complete'}
            >
              <div className="ps-finale-stack" aria-hidden="true">{assets.slice(0, 3).map(asset => <img key={asset.assetId} src={mediaUrl(asset.thumbnailUrl || photoUrl(asset))} alt="" />)}</div>
              <p className="ps-complete-label"><Check size={14} /> THE COMPLETE COLLECTION</p>
              <h1 id={titleId + '-complete'}>Your photographs.<br />All together.</h1>
              <p className="ps-complete-copy">
                {assets.length} photographs from {studioName}.<br />Return to a favourite whenever you like.
              </p>
              <div className="ps-complete-actions">
                <button type="button" className="ps-start-button" onClick={() => setGalleryOpen(true)}><Grid2X2 size={17} /> View full gallery</button>
                {canDownloadAll && <button type="button" className="ps-secondary-button" onClick={galleryProps.onDownloadAll} disabled={galleryProps.busy === 'all'}>{galleryProps.busy === 'all' ? <LoaderCircle size={17} className="ps-spin" /> : <ArrowDownToLine size={17} />} Download all photos</button>}
              </div>
              <button
                type="button"
                className="ps-restart-button"
                onClick={handleRestart}
              >
                <RotateCcw size={16} /> Start again
              </button>
              {demo && <p className="ps-demo-note">You’re looking at a live preview.</p>}
            </motion.section>
          ) : (
            /* ── Single-photo swipe viewer ── */
            <motion.section
              key="ps-deck-active"
              ref={setDeckRegion}
              className="ps-deck-region"
              aria-label="Photograph viewer"
              aria-busy={isAdvancing}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              <div className="ps-deck" style={deckSize || undefined}>
                {prints.map((asset, index) => {
                  const photoIndex = firstPrint + index;
                  const depth = photoIndex === currentIndex ? 0 : photoIndex < currentIndex ? peekPrevious ? 1 : 3 : photoIndex - currentIndex + (peekPrevious ? 1 : 0);
                  return <PhotoSwapPrint
                    key={asset.assetId}
                    asset={asset}
                    index={photoIndex}
                    depth={depth}
                    registerActiveCard={registerActiveCard}
                    onPhotoRatio={onPhotoRatio}
                    motionEnabled={photoMotionEnabled}
                    pointerHandlers={{
                      onPointerDown: handleCardPointerDown,
                      onPointerMove: handleCardPointerMove,
                      onPointerUp: handleCardPointerUp,
                      onPointerCancel: handleCardPointerCancel,
                      onLostPointerCapture: handleCardPointerCancel,
                      'aria-label': 'Photo ' + (currentIndex + 1) + ' of ' + assets.length
                    }}
                  />;
                })}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Photo Actions ── */}
        {hasStarted && !isEnd && currentAsset && (
          <footer
            className="ps-action-area"
          >
            <div className="ps-caption-area">
              {currentAsset.caption && <p className="ps-overlay-caption">{currentAsset.caption}</p>}
            </div>
            <div className="ps-photo-controls" role="group" aria-label="Photo actions">
              <div className="ps-save-actions">
              {/* Like Button */}
              {canLike && (
                <button
                  type="button"
                  className={'ps-photo-action ps-btn-like' + (liked ? ' is-liked' : '')}
                  onClick={() => toggleAssetLike(currentAsset.assetId)}
                  disabled={isAdvancing}
                  aria-pressed={Boolean(liked)}
                  aria-label={liked ? 'Unlike this photo' : 'Like this photo'}
                  title={liked ? 'Liked' : 'Like'}
                >
                  <Heart size={19} fill={liked ? 'currentColor' : 'none'} strokeWidth={1.8} /><span>{liked ? 'Liked' : 'Like'}</span>
                </button>
              )}

              {/* Download Photo Button */}
              {canDownloadPhoto && (
                <button
                  type="button"
                  className="ps-photo-action ps-btn-download"
                  onClick={() => galleryProps.onDownload(currentAsset.assetId, currentIndex)}
                  disabled={isAdvancing || galleryProps?.busy === currentAsset.assetId}
                  aria-label="Download this photo"
                  title="Download photo"
                >
                  {galleryProps?.busy === currentAsset.assetId ? <LoaderCircle size={19} className="ps-spin" /> : <ArrowDownToLine size={19} strokeWidth={1.8} />}<span>Save</span>
                </button>
              )}
              </div>
            </div>
            {galleryProps.downloadNotice && <p className="ps-download-notice" role="status">{galleryProps.downloadNotice}</p>}
          </footer>
        )}
      </main>
      <span className="ps-sr-only" aria-live="polite">
        {isEnd ? 'All ' + assets.length + ' photos viewed' : 'Photo ' + (currentIndex + 1) + ' of ' + assets.length}
      </span>
      {galleryOpen && <ClientGallery
        photos={assets}
        title={title}
        delivery={delivery}
        fontStyles={fontStyles}
        demoId={demo ? 'photoswap' : undefined}
        {...galleryProps}
        liked={resolvedLiked}
        onLike={canLike ? toggleAssetLike : undefined}
        onDownload={canDownloadPhoto ? galleryProps.onDownload : undefined}
        onDownloadAll={canDownloadAll ? galleryProps.onDownloadAll : undefined}
        onClose={() => setGalleryOpen(false)}
      />}
    </div>
  );
}
