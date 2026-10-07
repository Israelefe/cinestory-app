import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import {
  ArrowRight,
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  MoveHorizontal,
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
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const [deckRegion, setDeckRegion] = useState(null);
  const [deckSize, setDeckSize] = useState(null);
  const [photoRatios, setPhotoRatios] = useState(() => new Map());
  const titleId = useId();
  const mountedRef = useRef(true);
  const audioRef = useRef(null);
  const soundtrackAttemptRef = useRef(null);
  const advanceLockRef = useRef(false);
  const navigationPhaseRef = useRef('idle');
  const queuedKeyboardNavigationRef = useRef(null);
  const pointerGestureRef = useRef(null);
  const pendingArrivalRef = useRef(null);
  const imageReadinessRef = useRef(new Map());
  const cardElementRef = useRef(null);
  const viewerElementRef = useRef(null);
  const reduced = useVeyloReducedMotion();

  /* The active photo and its swipe animation share one horizontal position. */
  const cardOffset = useMotionValue(0);
  const cardRotation = useTransform(cardOffset, [-340, 0, 340], [-17, 0, 17]);
  const cardScale = useTransform(cardOffset, [-340, 0, 340], [0.97, 1, 0.97]);

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
      const photoWidth = Math.min(availableWidth - 12, photoRatio < 1 ? 500 : 800, (Math.min(availableHeight, 680) - 12) * photoRatio);
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
    return () => { mountedRef.current = false; cardOffset.stop(); advanceLockRef.current = false; };
  }, [cardOffset]);

  useEffect(() => { setPhotoFailed(false); setPhotoAttempt(0); }, [currentIndex]);

  const ensurePhotoReady = useCallback(asset => {
    const source = mediaUrl(photoUrl(asset));
    if (!source) return Promise.resolve(false);
    const readinessKey = source + '\n' + (asset?.srcSet || '');

    const cached = imageReadinessRef.current.get(readinessKey);
    if (cached) return cached;

    const image = new window.Image();
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.sizes = '(max-width: 640px) 92vw, (max-width: 1024px) 500px, 460px';
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
    const step = swipeDirection < 0 ? 1 : -1;
    const nextIndex = currentIndex + step;
    if (nextIndex < 0 || nextIndex > assets.length) return false;

    advanceLockRef.current = true;
    navigationPhaseRef.current = 'loading';
    setIsAdvancing(true);
    const cardNode = cardElementRef.current;
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
      navigationPhaseRef.current = 'exiting';
      animate(cardOffset, exitX, {
        type: 'spring',
        stiffness: reduced ? 500 : 420,
        damping: reduced ? 46 : 38,
        velocity: launchVelocity,
        restDelta: 2,
        onComplete: () => {
          if (nextIndex >= assets.length) {
            advanceLockRef.current = false;
            navigationPhaseRef.current = 'idle';
            setIsAdvancing(false);
            setCurrentIndex(nextIndex);
            return;
          }

          const incomingOffset = swipeDirection < 0 ? 56 : -56;
          navigationPhaseRef.current = 'arriving';
          pendingArrivalRef.current = incomingOffset;
          setCurrentIndex(nextIndex);
        }
      });
    });
    return true;
  }, [assets, currentIndex, reduced, cardOffset, ensurePhotoReady]);

  useLayoutEffect(() => {
    const incomingOffset = pendingArrivalRef.current;
    if (incomingOffset === null || isEnd) return;
    pendingArrivalRef.current = null;
    cardOffset.set(incomingOffset);
    animate(cardOffset, 0, {
      type: 'spring',
      damping: 38,
      stiffness: 420,
      restDelta: 0.5,
      onComplete: () => {
        advanceLockRef.current = false;
        navigationPhaseRef.current = 'idle';
        setIsAdvancing(false);
      }
    });
  }, [currentIndex, isEnd, reduced, cardOffset]);

  const snapCardToCenter = useCallback(() => {
    animate(cardOffset, 0, { type: 'spring', damping: 28, stiffness: 300 });
  }, [cardOffset]);

  const handleCardPointerDown = useCallback(event => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // A new gesture can take over from the incoming print's spring animation.
    if (navigationPhaseRef.current === 'arriving') {
      cardOffset.stop();
      advanceLockRef.current = false;
      navigationPhaseRef.current = 'idle';
      queuedKeyboardNavigationRef.current = null;
      setIsAdvancing(false);
    }
    if (advanceLockRef.current) return;
    pointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: event.timeStamp,
      axis: null,
      width: event.currentTarget.getBoundingClientRect().width
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in a few embedded webviews.
    }
    requestSoundtrack(true);
  }, [requestSoundtrack, cardOffset]);

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
    cardOffset.set(deltaX);
  }, [cardOffset]);

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
    pendingArrivalRef.current = null;
    cardOffset.set(0);
    advanceLockRef.current = false;
    navigationPhaseRef.current = 'idle';
    queuedKeyboardNavigationRef.current = null;
    setIsAdvancing(false);
    setCurrentIndex(0);
  }, [cardOffset]);

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
  const remainingAssets = assets.slice(currentIndex + 1, currentIndex + 3);

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
            {hasStarted && <button type="button" className="ps-tool-button ps-gallery-button" onClick={() => setGalleryOpen(true)} aria-label="Open full gallery" title="Open full gallery"><Grid2X2 size={17} /><span>Gallery</span></button>}
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
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              <div className="ps-deck" style={deckSize || undefined}>
                {remainingAssets.slice().reverse().map((asset, reverseIndex) => {
                  const depth = remainingAssets.length - reverseIndex;
                  return <div key={asset.assetId} className={'ps-print-behind ' + (depth === 1 ? 'ps-print-second' : 'ps-print-third')} aria-hidden="true">
                    <img src={mediaUrl(asset.thumbnailUrl || photoUrl(asset))} alt="" draggable="false" />
                  </div>;
                })}
                {currentAsset && (
                    <motion.article
                      ref={cardElementRef}
                      className="ps-photo-card ps-card-front ps-print-top"
                      style={{
                        x: cardOffset,
                        rotate: cardRotation,
                        scale: cardScale
                      }}
                      onPointerDown={handleCardPointerDown}
                      onPointerMove={handleCardPointerMove}
                      onPointerUp={handleCardPointerUp}
                      onPointerCancel={handleCardPointerCancel}
                      onLostPointerCapture={handleCardPointerCancel}
                      role="group"
                      aria-roledescription="photograph"
                      aria-label={'Photo ' + (currentIndex + 1) + ' of ' + assets.length}
                      tabIndex={0}
                    >
                      {/* Full-bleed Photo */}
                      <img
                        key={currentAsset.assetId + ':' + photoAttempt}
                        className="ps-card-photo"
                        src={mediaUrl(photoUrl(currentAsset))}
                        srcSet={currentAsset.srcSet || undefined}
                        sizes="(max-width: 640px) 92vw, (max-width: 1024px) 500px, 460px"
                        alt={currentAsset.alt || currentAsset.caption || 'Photograph ' + (currentIndex + 1)}
                        fetchPriority="high"
                        decoding="async"
                        draggable="false"
                        onError={() => setPhotoFailed(true)}
                        onLoad={event => {
                          setPhotoFailed(false);
                          const image = event.currentTarget;
                          if (image.naturalWidth && image.naturalHeight) {
                            const ratio = image.naturalWidth / image.naturalHeight;
                            setPhotoRatios(current => current.get(currentAsset.assetId) === ratio ? current : new Map(current).set(currentAsset.assetId, ratio));
                          }
                        }}
                      />
                      {photoFailed && <div className="ps-photo-error" role="status" onPointerDown={event => event.stopPropagation()}><ImageIcon size={26} /><p>This photo couldn’t load.</p><button type="button" className="ps-secondary-button" onClick={() => { setPhotoFailed(false); setPhotoAttempt(attempt => attempt + 1); }}>Try again</button></div>}
                    </motion.article>
                )}
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
              <span className="ps-gesture-hint"><MoveHorizontal size={14} /> Swipe left for next, right to go back</span>
            </div>
            <div className="ps-photo-controls" role="group" aria-label="Photo actions">
              <button type="button" className="ps-nav-button" onClick={() => navigateAdjacent(1)} disabled={isAdvancing || currentIndex === 0} aria-label="Previous photograph"><ChevronLeft size={20} /><span>Back</span></button>
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
              <button type="button" className="ps-nav-button ps-next-button" onClick={() => navigateAdjacent(-1)} disabled={isAdvancing} aria-label={currentIndex === assets.length - 1 ? 'Finish collection' : 'Next photograph'}><span>{currentIndex === assets.length - 1 ? 'Finish' : 'Next'}</span>{isAdvancing ? <LoaderCircle size={19} className="ps-spin" /> : <ChevronRight size={20} />}</button>
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
