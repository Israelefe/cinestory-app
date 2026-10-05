import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import {
  ArrowRight,
  ArrowDownToLine,
  Check,
  Heart,
  MoveHorizontal,
  RotateCcw,
  Volume2,
  VolumeX
} from 'lucide-react';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import { API_BASE_URL } from '../../config/env.js';
import { deliveryFontStyles } from '../../utils/deliveryTypography.js';
import './PhotoSwapViewer.css';
import './DeliveryTypography.css';

const SWIPE_VELOCITY = 560;
const SWIPE_DISTANCE_RATIO = 0.2;
const CARD_MOTION_VARIANTS = {
  enter: custom => {
    const direction = custom?.direction ?? 1;
    const reduced = Boolean(custom?.reduced);
    return {
      opacity: 0.5,
      x: direction < 0 ? 88 : -88,
      transition: { duration: reduced ? 0.12 : 0.18 }
    };
  },
  visible: custom => ({
    opacity: 1,
    x: 0,
    transition: { type: 'spring', damping: 24, stiffness: custom?.reduced ? 220 : 280 }
  }),
  exit: custom => {
    const direction = custom?.direction ?? 1;
    const reduced = Boolean(custom?.reduced);
    return {
      opacity: 0,
      x: direction < 0 ? -window.innerWidth * 1.05 : window.innerWidth * 1.05,
      transition: { duration: reduced ? 0.15 : 0.28, ease: [0.32, 0, 0.67, 0] }
    };
  }
};

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

/* ── Palette variations tailored to each image ── */
const CARD_PALETTES = [
  { id: 'cobalt', glow: '#173b70', accent: '#60a5fa', border: 'rgba(96, 165, 250, 0.25)' },
  { id: 'amethyst', glow: '#2b1a3d', accent: '#c084fc', border: 'rgba(192, 132, 252, 0.25)' },
  { id: 'emerald', glow: '#163328', accent: '#34d399', border: 'rgba(52, 211, 153, 0.25)' },
  { id: 'amber', glow: '#3d2014', accent: '#fb923c', border: 'rgba(251, 146, 60, 0.25)' },
  { id: 'coral', glow: '#3a191b', accent: '#fb7185', border: 'rgba(251, 113, 133, 0.25)' },
  { id: 'teal', glow: '#123130', accent: '#2dd4bf', border: 'rgba(45, 212, 191, 0.25)' },
  { id: 'rose', glow: '#351b2b', accent: '#f472b6', border: 'rgba(244, 114, 182, 0.25)' },
  { id: 'ochre', glow: '#352d15', accent: '#eab308', border: 'rgba(234, 179, 8, 0.25)' }
];
const CARD_DESIGNS = ['bleed', 'matte', 'paper', 'editorial'];

function getCardPalette(asset, index) {
  const fallback = CARD_PALETTES[index % CARD_PALETTES.length];
  const glow = dominantColor(asset) || fallback.glow;
  const designIndex = (index + Math.floor(index / CARD_PALETTES.length)) % CARD_DESIGNS.length;
  return {
    glow,
    accent: fallback.accent,
    border: fallback.border,
    design: CARD_DESIGNS[designIndex]
  };
}

export default function PhotoSwapViewer({ delivery, galleryProps = {}, demo = false, preview = false }) {
  const assets = useMemo(
    () => [...(delivery?.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
    [delivery?.assets]
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [hasStarted, setHasStarted] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [localLiked, setLocalLiked] = useState(() => new Set());
  const audioRef = useRef(null);
  const soundtrackAttemptRef = useRef(null);
  const advanceLockRef = useRef(false);
  const reduced = useVeyloReducedMotion();

  /* ── 3D Card Stack Physics with Dynamic Tinder Rotation & Depth ── */
  const stackOffset = useMotionValue(0);
  const cardRotation = useTransform(stackOffset, [-340, 0, 340], [-17, 0, 17]);
  const cardScale = useTransform(stackOffset, [-340, 0, 340], [0.97, 1, 0.97]);

  /* Middle & back card responsive depth */
  const middleScale = useTransform(stackOffset, [-320, 0, 320], [0.985, 0.94, 0.985]);
  const middleRotate = useTransform(stackOffset, [-320, 0, 320], [0, 2.5, 0]);
  const middleY = useTransform(stackOffset, [-320, 0, 320], [0, 6, 0]);

  const backScale = useTransform(stackOffset, [-320, 0, 320], [0.93, 0.88, 0.93]);
  const backRotate = useTransform(stackOffset, [-320, 0, 320], [0, -2.8, 0]);
  const backY = useTransform(stackOffset, [-320, 0, 320], [0, 12, 0]);

  const isEnd = currentIndex >= assets.length;
  const currentAsset = isEnd ? null : assets[currentIndex];
  const nextAsset = assets[currentIndex + 1];
  const secondAsset = assets[currentIndex + 2];

  const currentPalette = useMemo(
    () => (currentAsset ? getCardPalette(currentAsset, currentIndex) : CARD_PALETTES[0]),
    [currentAsset, currentIndex]
  );
  const nextPalette = useMemo(
    () => (nextAsset ? getCardPalette(nextAsset, currentIndex + 1) : null),
    [nextAsset, currentIndex]
  );
  const secondPalette = useMemo(
    () => (secondAsset ? getCardPalette(secondAsset, currentIndex + 2) : null),
    [secondAsset, currentIndex]
  );

  const soundtrackUrl = delivery?.soundtrack?.url ? mediaUrl(delivery.soundtrack.url) : '';
  const studioName = delivery?.branding?.name || 'Your photographer';
  const title = delivery?.title || (delivery?.clientName ? delivery.clientName + "'s photographs" : 'Your photographs');
  const fontStyles = useMemo(
    () => deliveryFontStyles(delivery?.photoswap?.typography),
    [delivery?.photoswap?.typography]
  );
  const stageStyle = {
    ...fontStyles,
    '--ps-photo-glow': currentPalette.glow,
    '--ps-accent-color': currentPalette.accent
  };

  const canLike = delivery?.access?.allowLikes !== false
    && (typeof galleryProps?.onLike === 'function' || demo || preview);
  const canDownloadPhoto = delivery?.access?.allowIndividualDownloads !== false
    && typeof galleryProps?.onDownload === 'function';

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
    if (!soundtrackUrl) return undefined;
    const audio = audioRef.current;
    if (!audio) return undefined;
    requestSoundtrack();
    return undefined;
  }, [requestSoundtrack, soundtrackUrl]);

  useEffect(() => {
    if (!assets.length) return undefined;
    [1, 2].forEach(offset => {
      const source = photoUrl(assets[currentIndex + offset]);
      if (!source) return;
      const image = new window.Image();
      image.decoding = 'async';
      image.src = mediaUrl(source);
    });
    return undefined;
  }, [assets, currentIndex]);

  /* Every horizontal swipe advances the stack, whichever way the card moves. */
  const goNext = useCallback((swipeDirection = 1) => {
    if (currentIndex >= assets.length || advanceLockRef.current) return;
    advanceLockRef.current = true;
    setIsAdvancing(true);
    setDirection(swipeDirection < 0 ? -1 : 1);
    setCurrentIndex(i => Math.min(assets.length, i + 1));
  }, [assets.length, currentIndex]);

  const handleRestart = useCallback(() => {
    setDirection(1);
    stackOffset.set(0);
    advanceLockRef.current = false;
    setIsAdvancing(false);
    setCurrentIndex(0);
  }, [stackOffset]);

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

  const toggleLike = useCallback(() => {
    if (!currentAsset || !canLike) return;
    if (typeof galleryProps?.onLike === 'function') {
      galleryProps.onLike(currentAsset.assetId);
    } else {
      setLocalLiked(current => {
        const next = new Set(current);
        if (next.has(currentAsset.assetId)) next.delete(currentAsset.assetId);
        else next.add(currentAsset.assetId);
        return next;
      });
    }
  }, [canLike, currentAsset, galleryProps]);

  /* Keyboard users can advance the same one-way stack. */
  useEffect(() => {
    const handleKey = event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
      if (!hasStarted) return;
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        goNext(1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, hasStarted]);

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
  const liked = currentAsset && (
    galleryProps?.liked instanceof Set
      ? galleryProps.liked.has(currentAsset.assetId)
      : Array.isArray(galleryProps?.liked)
        ? galleryProps.liked.includes(currentAsset.assetId)
        : localLiked.has(currentAsset.assetId)
  );

  return (
    <div
      className={'ps-viewer' + (preview ? ' is-preview' : '')}
      style={stageStyle}
    >
      {soundtrackUrl && (
        <audio
          ref={audioRef}
          src={soundtrackUrl}
          autoPlay
          loop
          preload="auto"
          playsInline
          muted={muted}
          onPlaying={() => setSoundBlocked(false)}
          onError={() => setSoundBlocked(true)}
        />
      )}
      <div className="ps-ambient" aria-hidden="true" />
      <main className="ps-stage" aria-label="Photo Swap">
        {/* ── Minimal header ── */}
        <header className="ps-header">
          <div className="ps-header-brand">
            <span className="ps-brand-mark"><DeliveryBrandMark branding={delivery?.branding} /></span>
            <span className="ps-header-copy">
              <strong>{studioName}</strong>
              <span>{title}</span>
            </span>
          </div>
          <div className="ps-header-tools">
            <div className="ps-progress-copy" aria-label={isEnd ? 'All photos viewed' : 'Photo ' + (currentIndex + 1) + ' of ' + assets.length}>
              <strong>{isEnd ? 'DONE' : photoNumber}</strong><span>/ {totalNumber}</span>
            </div>
            {soundtrackUrl && (
              <button
                type="button"
                className="ps-sound-button"
                onClick={toggleSound}
                aria-label={muted ? 'Play soundtrack' : soundBlocked ? 'Try soundtrack again' : 'Mute soundtrack'}
                title={muted ? 'Play soundtrack' : soundBlocked ? 'Try soundtrack again' : 'Mute soundtrack'}
              >
                {muted || soundBlocked ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
            )}
          </div>
        </header>

        {/* ── Segmented progress track ── */}
        {hasStarted && (
          <div className="ps-segments" aria-hidden="true">
            {assets.map((_, i) => (
              <span
                key={i}
                className={'ps-segment' + (i < currentIndex ? ' is-done' : i === currentIndex && !isEnd ? ' is-active' : '')}
              />
            ))}
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
              aria-labelledby="ps-start-title"
            >
              <div className="ps-start-stack" aria-hidden="true">
                {assets[1] && (
                  <div className="ps-start-card ps-start-back">
                    <img src={mediaUrl(photoUrl(assets[1]))} alt="" />
                  </div>
                )}
                <motion.div
                  className="ps-start-card ps-start-front"
                  animate={assets.length > 1
                    ? { x: [0, -54, 0, 54, 0], rotate: [0, -4, 0, 4, 0] }
                    : { x: 0, rotate: 0 }}
                  transition={{ duration: reduced ? 3.8 : 3.1, repeat: Infinity, repeatDelay: 0.7, ease: 'easeInOut' }}
                >
                  <img src={mediaUrl(photoUrl(assets[0]))} alt="" />
                  {assets.length > 1 && <span className="ps-start-gesture"><MoveHorizontal size={23} /></span>}
                </motion.div>
              </div>
              <div className="ps-start-copy">
                <span className="ps-start-eyebrow">PHOTO SWAP · {assets.length} PHOTOS</span>
                <h1 id="ps-start-title">One photo at a time.</h1>
                <p>Give every finished photo a closer look.</p>
                <button type="button" className="ps-start-button" onClick={beginExperience}>
                  View the photos <ArrowRight size={17} />
                </button>
              </div>
            </motion.section>
          ) : isEnd ? (
            /* ── Mind-blowing Completion Card (No overlap with deck) ── */
            <motion.section
              key="ps-complete"
              className="ps-complete-card"
              initial={{ opacity: 0, scale: 0.92, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -18 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              aria-labelledby="ps-complete-title"
            >
              <div className="ps-complete-badge">
                <DeliveryBrandMark branding={delivery?.branding} />
              </div>
              <span className="ps-complete-mark"><Check size={26} strokeWidth={2.4} /></span>
              <p className="ps-complete-label">PHOTO SWAP COMPLETE</p>
              <h1 id="ps-complete-title">You’ve seen every photograph.</h1>
              <p className="ps-complete-copy">
                {title} <span>·</span> {assets.length} finished photographs
              </p>
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
            /* ── Tinder-Style Card Deck ── */
            <motion.section
              key="ps-deck-active"
              className="ps-deck-region"
              aria-label="Photograph viewer"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              <div className="ps-deck">
                {/* 3rd Card in stack (Back) */}
                {secondAsset && secondPalette && (
                  <motion.div
                    className={'ps-photo-card ps-card-back ps-design-' + secondPalette.design}
                    style={{
                      scale: backScale,
                      rotate: backRotate,
                      y: backY,
                      borderColor: secondPalette.border,
                      '--ps-card-accent': secondPalette.accent
                    }}
                    aria-hidden="true"
                  >
                    <img src={mediaUrl(photoUrl(secondAsset))} alt="" loading="lazy" decoding="async" />
                  </motion.div>
                )}

                {/* 2nd Card in stack (Middle) */}
                {nextAsset && nextPalette && (
                  <motion.div
                    className={'ps-photo-card ps-card-middle ps-design-' + nextPalette.design}
                    style={{
                      scale: middleScale,
                      rotate: middleRotate,
                      y: middleY,
                      borderColor: nextPalette.border,
                      '--ps-card-accent': nextPalette.accent
                    }}
                    aria-hidden="true"
                  >
                    <img src={mediaUrl(photoUrl(nextAsset))} alt="" loading="eager" decoding="async" />
                  </motion.div>
                )}

                {/* Active Front Card */}
                <AnimatePresence
                  initial={false}
                  custom={{ direction, reduced }}
                  mode="wait"
                  onExitComplete={() => {
                    stackOffset.set(0);
                    advanceLockRef.current = false;
                    setIsAdvancing(false);
                  }}
                >
                  {currentAsset && (
                    <motion.article
                      key={currentAsset.assetId}
                      className={'ps-photo-card ps-card-front ps-design-' + currentPalette.design}
                      variants={CARD_MOTION_VARIANTS}
                      style={{
                        rotate: cardRotation,
                        scale: cardScale,
                        borderColor: currentPalette.design === 'paper' || currentPalette.design === 'editorial'
                          ? undefined
                          : currentPalette.border,
                        '--ps-card-accent': currentPalette.accent,
                        boxShadow: currentPalette.design === 'paper'
                          ? `0 28px 76px -14px color-mix(in srgb, ${currentPalette.glow} 55%, black), 0 4px 18px rgba(0, 0, 0, 0.4), inset 0 0 0 5px rgba(255, 250, 240, 0.92)`
                          : `0 28px 76px -14px color-mix(in srgb, ${currentPalette.glow} 55%, black), 0 4px 18px rgba(0, 0, 0, 0.4)`
                      }}
                      drag={isAdvancing ? false : 'x'}
                      dragConstraints={{ left: -window.innerWidth, right: window.innerWidth }}
                      dragElastic={0.12}
                      dragMomentum={false}
                      initial="enter"
                      animate="visible"
                      exit="exit"
                      onDragStart={() => requestSoundtrack(true)}
                      onDrag={(_, info) => stackOffset.set(info.offset.x)}
                      onDragEnd={(event, info) => {
                        const cardWidth = event.currentTarget?.getBoundingClientRect().width || window.innerWidth;
                        const threshold = Math.max(64, cardWidth * SWIPE_DISTANCE_RATIO);
                        if (Math.abs(info.offset.x) >= threshold || Math.abs(info.velocity.x) >= SWIPE_VELOCITY) {
                          const swipeDirection = Math.sign(info.offset.x || info.velocity.x);
                          goNext(swipeDirection);
                        } else {
                          animate(stackOffset, 0, { type: 'spring', damping: 28, stiffness: 300 });
                        }
                      }}
                      role="group"
                      aria-roledescription="photograph"
                      aria-label={'Photo ' + (currentIndex + 1) + ' of ' + assets.length}
                      tabIndex={0}
                    >
                      {/* Full-bleed Photo */}
                      <img
                        className="ps-card-photo"
                        src={mediaUrl(photoUrl(currentAsset))}
                        srcSet={currentAsset.srcSet || undefined}
                        sizes="(max-width: 640px) 92vw, (max-width: 1024px) 500px, 460px"
                        alt={currentAsset.alt || currentAsset.caption || 'Photograph ' + (currentIndex + 1)}
                        fetchPriority="high"
                        decoding="async"
                        draggable="false"
                      />

                      {/* Clean bottom gradient overlay with ONLY the actual caption and number */}
                      <div className="ps-card-overlay">
                        <span className="ps-overlay-counter">{photoNumber} <i>/</i> {totalNumber}</span>
                        {(currentAsset.caption || currentAsset.alt) && (
                          <p className="ps-overlay-caption">{currentAsset.caption || currentAsset.alt}</p>
                        )}
                      </div>
                    </motion.article>
                  )}
                </AnimatePresence>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Photo Actions ── */}
        {hasStarted && !isEnd && currentAsset && (
          <footer className="ps-action-area">
            <div className="ps-tinder-actions" role="toolbar" aria-label="Photo actions">
              {/* Like Button */}
              {canLike && (
                <button
                  type="button"
                  className={'ps-tinder-btn ps-btn-like' + (liked ? ' is-liked' : '')}
                  onClick={toggleLike}
                  aria-pressed={Boolean(liked)}
                  aria-label={liked ? 'Unlike this photo' : 'Like this photo'}
                  title={liked ? 'Liked' : 'Like'}
                >
                  <Heart size={26} fill={liked ? 'currentColor' : 'none'} strokeWidth={liked ? 2.2 : 1.9} />
                </button>
              )}

              {/* Download Photo Button */}
              {canDownloadPhoto && (
                <button
                  type="button"
                  className="ps-tinder-btn ps-btn-download"
                  onClick={() => galleryProps.onDownload(currentAsset.assetId, currentIndex)}
                  disabled={galleryProps?.busy === currentAsset.assetId}
                  aria-label="Download this photo"
                  title="Download photo"
                >
                  <ArrowDownToLine size={20} strokeWidth={2.1} />
                </button>
              )}
            </div>
          </footer>
        )}
      </main>
      <span className="ps-sr-only" aria-live="polite">
        {isEnd ? 'All ' + assets.length + ' photos viewed' : 'Photo ' + (currentIndex + 1) + ' of ' + assets.length}
      </span>
    </div>
  );
}
