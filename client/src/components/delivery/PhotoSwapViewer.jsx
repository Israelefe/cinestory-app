import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import {
  ArrowDownToLine,
  Camera,
  Check,
  ChevronRight,
  Film,
  Heart,
  Image as ImageIcon,
  RotateCcw,
  Undo2,
  Volume2,
  VolumeX
} from 'lucide-react';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import { API_BASE_URL } from '../../config/env.js';
import { deliveryFontStyles } from '../../utils/deliveryTypography.js';
import { useSmoothSoundtrackLoop } from '../../utils/smoothSoundtrackLoop.js';
import './PhotoSwapViewer.css';
import './DeliveryTypography.css';

const SWIPE_VELOCITY = 260;

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

/* ── Unique card aesthetic per image ── */
const CARD_THEMES = [
  {
    id: 'cobalt-sapphire',
    className: 'ps-card-theme-cobalt',
    defaultGlow: '#173b70',
    accentColor: '#60a5fa',
    tagSuffix: 'EDITORIAL LOOK',
    filmStamp: '35mm · Studio Cobalt',
    Icon: Camera
  },
  {
    id: 'amethyst-noir',
    className: 'ps-card-theme-amethyst',
    defaultGlow: '#2d1a40',
    accentColor: '#c084fc',
    tagSuffix: 'INTIMATE FRAME',
    filmStamp: '50mm · Deep Violet',
    Icon: Film
  },
  {
    id: 'emerald-slate',
    className: 'ps-card-theme-emerald',
    defaultGlow: '#143328',
    accentColor: '#34d399',
    tagSuffix: 'COMPOSITION STUDY',
    filmStamp: '85mm · Velvet Slate',
    Icon: ImageIcon
  },
  {
    id: 'amber-bronze',
    className: 'ps-card-theme-amber',
    defaultGlow: '#3d2212',
    accentColor: '#fb923c',
    tagSuffix: 'SIGNATURE CLOSE',
    filmStamp: '105mm · Amber Glow',
    Icon: Camera
  }
];

function getCardTheme(asset, index) {
  const base = CARD_THEMES[index % CARD_THEMES.length];
  const glow = dominantColor(asset) || base.defaultGlow;
  return {
    ...base,
    glow,
    tagLabel: `${String(index + 1).padStart(2, '0')} // ${base.tagSuffix}`
  };
}

export default function PhotoSwapViewer({ delivery, galleryProps = {}, demo = false, preview = false }) {
  const assets = useMemo(
    () => [...(delivery?.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
    [delivery?.assets]
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [localLiked, setLocalLiked] = useState(() => new Set());
  const [doubleTapHeart, setDoubleTapHeart] = useState(false);
  const lastTapRef = useRef(0);
  const audioRef = useRef(null);
  const reduced = useVeyloReducedMotion();

  /* ── 3D Card Stack Physics with Dynamic Tinder Rotation & Depth ── */
  const stackOffset = useMotionValue(0);
  const cardRotation = useTransform(stackOffset, [-340, 0, 340], [-17, 0, 17]);
  const cardScale = useTransform(stackOffset, [-340, 0, 340], [0.97, 1, 0.97]);

  /* Dynamic swipe stamp opacities */
  const stampNextOpacity = useTransform(stackOffset, [-140, -35], [1, 0]);
  const stampPrevOpacity = useTransform(stackOffset, [35, 140], [0, 1]);

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

  const currentTheme = useMemo(
    () => (currentAsset ? getCardTheme(currentAsset, currentIndex) : CARD_THEMES[0]),
    [currentAsset, currentIndex]
  );
  const nextTheme = useMemo(
    () => (nextAsset ? getCardTheme(nextAsset, currentIndex + 1) : null),
    [nextAsset, currentIndex]
  );
  const secondTheme = useMemo(
    () => (secondAsset ? getCardTheme(secondAsset, currentIndex + 2) : null),
    [secondAsset, currentIndex]
  );

  const soundtrackUrl = delivery?.soundtrack?.url ? mediaUrl(delivery.soundtrack.url) : '';
  const studioName = delivery?.branding?.name || 'Your photographer';
  const title = delivery?.title || (delivery?.clientName ? delivery.clientName + "'s photographs" : 'Your photographs');
  const shootType = delivery?.shootType || 'Portraits';
  const fontStyles = useMemo(
    () => deliveryFontStyles(delivery?.photoswap?.typography),
    [delivery?.photoswap?.typography]
  );
  const stageStyle = {
    ...fontStyles,
    '--ps-photo-glow': currentTheme.glow,
    '--ps-accent-color': currentTheme.accentColor
  };

  const canLike = delivery?.access?.allowLikes !== false
    && (typeof galleryProps?.onLike === 'function' || demo || preview);
  const canDownloadPhoto = delivery?.access?.allowIndividualDownloads !== false
    && typeof galleryProps?.onDownload === 'function';

  useSmoothSoundtrackLoop(audioRef, soundtrackUrl);

  const requestSoundtrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !soundtrackUrl || muted) return;
    try {
      audio.muted = false;
      const playback = audio.play();
      playback?.then(() => setSoundBlocked(false)).catch(() => setSoundBlocked(true));
    } catch {
      setSoundBlocked(true);
    }
  }, [muted, soundtrackUrl]);

  useEffect(() => {
    if (!soundtrackUrl) return undefined;
    const audio = audioRef.current;
    if (!audio) return undefined;
    audio.muted = false;
    try {
      audio.play().then(() => setSoundBlocked(false)).catch(() => setSoundBlocked(true));
    } catch {
      setSoundBlocked(true);
    }
    return undefined;
  }, [soundtrackUrl]);

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

  /* ── Bi-directional Navigation ── */
  const goNext = useCallback((source = 'swipe') => {
    if (currentIndex >= assets.length) return;
    setHasInteracted(true);
    setDirection(1);
    stackOffset.set(0);
    setCurrentIndex(i => Math.min(assets.length, i + 1));
  }, [assets.length, currentIndex, stackOffset]);

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return;
    setHasInteracted(true);
    setDirection(-1);
    stackOffset.set(0);
    setCurrentIndex(i => Math.max(0, i - 1));
  }, [currentIndex, stackOffset]);

  const handleRestart = useCallback(() => {
    setDirection(1);
    stackOffset.set(0);
    setCurrentIndex(0);
    setHasInteracted(true);
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

  /* ── Double-tap to like ── */
  const handleDoubleTap = useCallback(() => {
    if (!currentAsset || !canLike) return;
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      const isLiked = galleryProps?.liked instanceof Set
        ? galleryProps.liked.has(currentAsset.assetId)
        : Array.isArray(galleryProps?.liked)
          ? galleryProps.liked.includes(currentAsset.assetId)
          : localLiked.has(currentAsset.assetId);
      if (!isLiked) {
        toggleLike();
      }
      setDoubleTapHeart(true);
      setTimeout(() => setDoubleTapHeart(false), 750);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [currentAsset, canLike, toggleLike, galleryProps?.liked, localLiked]);

  /* Keyboard controls: Right = Next, Left = Prev */
  useEffect(() => {
    const handleKey = event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext('keyboard');
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev]);

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
      onPointerDownCapture={requestSoundtrack}
      onKeyDownCapture={requestSoundtrack}
    >
      {soundtrackUrl && <audio ref={audioRef} src={soundtrackUrl} loop preload="auto" muted={muted} />}
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
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
            )}
          </div>
        </header>

        {/* ── Segmented progress track ── */}
        <div className="ps-segments" aria-hidden="true">
          {assets.map((_, i) => (
            <span
              key={i}
              className={'ps-segment' + (i < currentIndex ? ' is-done' : i === currentIndex && !isEnd ? ' is-active' : '')}
            />
          ))}
        </div>

        {/* ── Main View (Deck vs Completion View) with clean mode="wait" transition ── */}
        <AnimatePresence mode="wait" initial={false}>
          {isEnd ? (
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
              aria-label="Swipe through the photographs"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              {!hasInteracted && (
                <motion.p
                  className="ps-swipe-hint"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: reduced ? 0.12 : 0.3 }}
                >
                  Swipe left for next · Swipe right for previous
                </motion.p>
              )}

              <div className="ps-deck">
                {/* 3rd Card in stack (Back) */}
                {secondAsset && secondTheme && (
                  <motion.div
                    className={'ps-photo-card ps-card-back ' + secondTheme.className}
                    style={{ scale: backScale, rotate: backRotate, y: backY }}
                    aria-hidden="true"
                  >
                    <img src={mediaUrl(photoUrl(secondAsset))} alt="" loading="lazy" decoding="async" />
                  </motion.div>
                )}

                {/* 2nd Card in stack (Middle) */}
                {nextAsset && nextTheme && (
                  <motion.div
                    className={'ps-photo-card ps-card-middle ' + nextTheme.className}
                    style={{ scale: middleScale, rotate: middleRotate, y: middleY }}
                    aria-hidden="true"
                  >
                    <img src={mediaUrl(photoUrl(nextAsset))} alt="" loading="eager" decoding="async" />
                  </motion.div>
                )}

                {/* Active Front Card */}
                <AnimatePresence initial={false} custom={direction} mode="sync">
                  {currentAsset && (
                    <motion.article
                      key={currentAsset.assetId}
                      className={'ps-photo-card ps-card-front ' + currentTheme.className}
                      style={{
                        x: stackOffset,
                        rotate: cardRotation,
                        scale: cardScale,
                        '--card-glow': currentTheme.glow,
                        '--card-accent': currentTheme.accentColor
                      }}
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.88}
                      dragMomentum={false}
                      onDragStart={requestSoundtrack}
                      onDrag={(_, info) => stackOffset.set(info.offset.x)}
                      onDragEnd={(_, info) => {
                        const threshold = Math.max(48, window.innerWidth * 0.15);
                        const velocityThreshold = SWIPE_VELOCITY;
                        if (info.offset.x <= -threshold || info.velocity.x <= -velocityThreshold) {
                          // Swiped LEFT -> Next
                          goNext('swipe');
                        } else if (info.offset.x >= threshold || info.velocity.x >= velocityThreshold) {
                          // Swiped RIGHT -> Previous
                          if (currentIndex > 0) {
                            goPrev();
                          } else {
                            animate(stackOffset, 0, { type: 'spring', damping: 24, stiffness: 280 });
                          }
                        } else {
                          animate(stackOffset, 0, { type: 'spring', damping: 24, stiffness: 280 });
                        }
                      }}
                      onTap={handleDoubleTap}
                      initial={{
                        opacity: 0.5,
                        scale: 0.92,
                        x: direction > 0 ? 88 : -88,
                        rotate: direction > 0 ? 5 : -5
                      }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        x: 0,
                        rotate: 0,
                        transition: { type: 'spring', damping: 24, stiffness: reduced ? 220 : 280 }
                      }}
                      exit={{
                        opacity: 0,
                        x: direction > 0 ? -window.innerWidth * 1.05 : window.innerWidth * 1.05,
                        rotate: direction > 0 ? -16 : 16,
                        transition: { duration: reduced ? 0.15 : 0.28, ease: [0.32, 0, 0.67, 0] }
                      }}
                      role="group"
                      aria-roledescription="photograph"
                      aria-label={'Photo ' + (currentIndex + 1) + ' of ' + assets.length}
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

                      {/* Unique Card Corner Frame Accents */}
                      <span className="ps-card-corner ps-corner-tl" aria-hidden="true" />
                      <span className="ps-card-corner ps-corner-tr" aria-hidden="true" />

                      {/* Tinder Swipe Stamp Badges */}
                      <motion.div
                        className="ps-card-stamp ps-stamp-next"
                        style={{ opacity: stampNextOpacity, rotate: 12 }}
                        aria-hidden="true"
                      >
                        NEXT
                      </motion.div>
                      {currentIndex > 0 && (
                        <motion.div
                          className="ps-card-stamp ps-stamp-prev"
                          style={{ opacity: stampPrevOpacity, rotate: -12 }}
                          aria-hidden="true"
                        >
                          BACK
                        </motion.div>
                      )}

                      {/* Double-tap heart explosion */}
                      <AnimatePresence>
                        {doubleTapHeart && (
                          <motion.span
                            className="ps-doubletap-heart"
                            initial={{ opacity: 0, scale: 0.3 }}
                            animate={{ opacity: 1, scale: 1.15 }}
                            exit={{ opacity: 0, scale: 1.6 }}
                            transition={{ duration: 0.38, ease: 'easeOut' }}
                            aria-hidden="true"
                          >
                            <Heart size={68} fill="#ff5a47" strokeWidth={0} />
                          </motion.span>
                        )}
                      </AnimatePresence>

                      {/* Top metadata pill (unique design per image) */}
                      <div className="ps-card-topbar">
                        <span className="ps-card-editorial-badge">
                          <currentTheme.Icon size={11} strokeWidth={2.4} />
                          <strong>{currentTheme.tagLabel}</strong>
                        </span>
                        <span className="ps-card-film-stamp">{currentTheme.filmStamp}</span>
                      </div>

                      {/* Bottom Gradient Overlay with ALWAYS VISIBLE Caption */}
                      <div className="ps-card-overlay">
                        <div className="ps-overlay-head">
                          <span className="ps-overlay-shoot-badge">{shootType}</span>
                          <span className="ps-overlay-counter">{photoNumber} of {totalNumber}</span>
                        </div>
                        <h2 className="ps-overlay-title">{title}</h2>
                        <p className="ps-overlay-caption">
                          {currentAsset.caption || 'A finished photograph from ' + title + '.'}
                        </p>
                      </div>
                    </motion.article>
                  )}
                </AnimatePresence>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Round Action Buttons (Tinder Style) ── */}
        {!isEnd && currentAsset && (
          <footer className="ps-action-area">
            <div className="ps-tinder-actions" role="toolbar" aria-label="Photo actions">
              {/* Rewind / Go Back Button */}
              <button
                type="button"
                className="ps-tinder-btn ps-btn-rewind"
                onClick={goPrev}
                disabled={currentIndex === 0}
                aria-label="Previous photograph"
                title={currentIndex === 0 ? 'At first photograph' : 'Previous photograph'}
              >
                <Undo2 size={20} strokeWidth={2.2} />
              </button>

              {/* Next / Advance Button */}
              <button
                type="button"
                className="ps-tinder-btn ps-btn-next"
                onClick={() => goNext('button')}
                aria-label="Next photograph"
                title="Next photograph"
              >
                <ChevronRight size={24} strokeWidth={2.2} />
              </button>

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
            <p className="ps-control-hint">
              {currentIndex > 0
                ? 'Swipe left for next · Swipe right for previous'
                : 'Swipe left to begin · Double-tap to like'}
            </p>
          </footer>
        )}
      </main>
      <span className="ps-sr-only" aria-live="polite">
        {isEnd ? 'All ' + assets.length + ' photos viewed' : 'Photo ' + (currentIndex + 1) + ' of ' + assets.length}
      </span>
    </div>
  );
}
