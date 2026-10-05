import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { ArrowDownToLine, Check, Heart, Info, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import { API_BASE_URL } from '../../config/env.js';
import { deliveryFontStyles } from '../../utils/deliveryTypography.js';
import { useSmoothSoundtrackLoop } from '../../utils/smoothSoundtrackLoop.js';
import './PhotoSwapViewer.css';
import './DeliveryTypography.css';

const SWIPE_VELOCITY = 280;

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
  const [direction, setDirection] = useState(1);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [localLiked, setLocalLiked] = useState(() => new Set());
  const [showCaption, setShowCaption] = useState(false);
  const [doubleTapHeart, setDoubleTapHeart] = useState(false);
  const lastTapRef = useRef(0);
  const audioRef = useRef(null);
  const reduced = useVeyloReducedMotion();

  /* ── Tinder-style swipe rotation: card tilts as you drag ── */
  const stackOffset = useMotionValue(0);
  const cardRotation = useTransform(stackOffset, [-400, 0, 400], [-18, 0, 18]);
  const backScale = useMotionValue(0.92);
  const backRotate = useMotionValue(2.8);
  useMotionValueEvent(stackOffset, 'change', value => {
    const progress = Math.min(1, Math.abs(value) / 320);
    backScale.set(0.92 + progress * 0.06);
    backRotate.set(2.8 - progress * 2.2);
  });

  const isEnd = currentIndex >= assets.length;
  const currentAsset = isEnd ? null : assets[currentIndex];
  const nextAsset = assets[currentIndex + 1];
  const secondAsset = assets[currentIndex + 2];
  const soundtrackUrl = delivery?.soundtrack?.url ? mediaUrl(delivery.soundtrack.url) : '';
  const studioName = delivery?.branding?.name || 'Your photographer';
  const title = delivery?.title || (delivery?.clientName ? delivery.clientName + "'s photographs" : 'Your photographs');
  const shootType = delivery?.shootType || 'Portraits';
  const fontStyles = useMemo(
    () => deliveryFontStyles(delivery?.photoswap?.typography),
    [delivery?.photoswap?.typography]
  );
  const glow = dominantColor(currentAsset) || '#30202b';
  const stageStyle = { ...fontStyles, '--ps-photo-glow': glow };

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

  const advance = useCallback((swipeSide = -1) => {
    if (currentIndex >= assets.length) return;
    setHasInteracted(true);
    setShowCaption(false);
    setDirection(swipeSide < 0 ? 1 : -1);
    setCurrentIndex(index => Math.min(assets.length, index + 1));
  }, [assets.length, currentIndex]);

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

  /* ── Double-tap to like (Tinder / Instagram pattern) ── */
  const handleDoubleTap = useCallback(() => {
    if (!currentAsset || !canLike) return;
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      // Double tap detected — compute liked status inline to avoid stale closure
      const isLiked = galleryProps?.liked instanceof Set
        ? galleryProps.liked.has(currentAsset.assetId)
        : Array.isArray(galleryProps?.liked)
          ? galleryProps.liked.includes(currentAsset.assetId)
          : localLiked.has(currentAsset.assetId);
      if (!isLiked) {
        toggleLike();
      }
      setDoubleTapHeart(true);
      setTimeout(() => setDoubleTapHeart(false), 800);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [currentAsset, canLike, toggleLike, galleryProps?.liked, localLiked]);

  useEffect(() => {
    const handleKey = event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        advance(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [advance]);

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
        {/* ── Minimal top bar ── */}
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

        {/* ── Segmented progress bar ── */}
        <div className="ps-segments" aria-hidden="true">
          {assets.map((_, i) => (
            <span key={i} className={'ps-segment' + (i < currentIndex ? ' is-done' : i === currentIndex && !isEnd ? ' is-active' : '')} />
          ))}
        </div>

        {/* ── Tinder-style card deck ── */}
        <section className="ps-deck-region" aria-label="Swipe through the photographs">
          {!isEnd && !hasInteracted && (
            <motion.p className="ps-swipe-hint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: reduced ? 0.12 : 0.32 }}>
              Swipe to see the next photo
            </motion.p>
          )}
          <div className="ps-deck">
            {/* Back card (3rd in stack) */}
            {!isEnd && secondAsset && (
              <motion.div className="ps-photo-card ps-card-back" style={{ scale: backScale, rotate: backRotate }} aria-hidden="true">
                <img src={mediaUrl(photoUrl(secondAsset))} alt="" loading="lazy" decoding="async" />
              </motion.div>
            )}
            {/* Middle card (2nd in stack) */}
            {!isEnd && nextAsset && (
              <div className="ps-photo-card ps-card-middle" aria-hidden="true">
                <img src={mediaUrl(photoUrl(nextAsset))} alt="" loading="eager" decoding="async" />
              </div>
            )}
            {/* Front card — the active swipeable card */}
            <AnimatePresence initial={false} custom={direction} mode="sync">
              {!isEnd && currentAsset ? (
                <motion.article
                  key={currentAsset.assetId}
                  className="ps-photo-card ps-card-front"
                  style={{ x: stackOffset, rotate: cardRotation }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.9}
                  dragMomentum={false}
                  onDragStart={requestSoundtrack}
                  onDrag={(_, info) => stackOffset.set(info.offset.x)}
                  onDragEnd={(_, info) => {
                    animate(stackOffset, 0, { type: 'spring', damping: 22, stiffness: 260 });
                    const threshold = Math.max(48, window.innerWidth * 0.16);
                    if (Math.abs(info.offset.x) >= threshold || Math.abs(info.velocity.x) >= SWIPE_VELOCITY) advance(info.offset.x < 0 ? -1 : 1);
                  }}
                  onTap={handleDoubleTap}
                  initial={{ opacity: 0.6, scale: 0.92, x: direction > 0 ? 90 : -90, rotate: direction > 0 ? 6 : -6 }}
                  animate={{ opacity: 1, scale: 1, x: 0, rotate: 0, transition: { type: 'spring', damping: 22, stiffness: reduced ? 210 : 260 } }}
                  exit={{ opacity: 0, x: direction > 0 ? -window.innerWidth : window.innerWidth, rotate: direction > 0 ? -14 : 14, transition: { duration: reduced ? 0.16 : 0.32, ease: [0.32, 0, 0.67, 0] } }}
                  role="group"
                  aria-roledescription="photograph"
                  aria-label={'Photo ' + (currentIndex + 1) + ' of ' + assets.length}
                >
                  {/* Full-bleed photo */}
                  <img
                    className="ps-card-photo"
                    src={mediaUrl(photoUrl(currentAsset))}
                    srcSet={currentAsset.srcSet || undefined}
                    sizes="(max-width: 640px) 92vw, (max-width: 1024px) 500px, 460px"
                    alt={currentAsset.alt || currentAsset.caption || 'Finished photograph ' + (currentIndex + 1)}
                    fetchPriority="high"
                    decoding="async"
                    draggable="false"
                  />

                  {/* Double-tap heart burst */}
                  <AnimatePresence>
                    {doubleTapHeart && (
                      <motion.span
                        className="ps-doubletap-heart"
                        initial={{ opacity: 0, scale: 0.3 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.6 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        aria-hidden="true"
                      >
                        <Heart size={62} fill="#ff5a47" strokeWidth={0} />
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {/* Bottom gradient overlay with caption (Tinder style) */}
                  <div className={'ps-card-overlay' + (showCaption ? ' is-expanded' : '')}>
                    <div className="ps-overlay-top">
                      <div className="ps-overlay-info">
                        <h2>{title}</h2>
                        <span className="ps-overlay-type">{shootType} <i aria-hidden="true">/</i> {photoNumber} of {totalNumber}</span>
                      </div>
                      <button type="button" className="ps-info-toggle" onClick={(e) => { e.stopPropagation(); setShowCaption(v => !v); }} aria-label={showCaption ? 'Hide caption' : 'Show caption'}>
                        <Info size={20} />
                      </button>
                    </div>
                    <AnimatePresence>
                      {showCaption && (
                        <motion.p
                          className="ps-overlay-caption"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {currentAsset.caption || 'A finished photograph from ' + title + '.'}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.article>
              ) : (
                /* ── Completion card ── */
                <motion.section
                  key="complete"
                  className="ps-complete-card"
                  initial={{ opacity: 0.65, y: 14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 25, stiffness: reduced ? 230 : 270 }}
                  aria-labelledby="ps-complete-title"
                >
                  <span className="ps-complete-brand"><DeliveryBrandMark branding={delivery?.branding} /></span>
                  <span className="ps-complete-mark"><Check size={24} strokeWidth={2.4} /></span>
                  <p className="ps-complete-label">ALL PHOTOS VIEWED</p>
                  <h1 id="ps-complete-title">You've seen every photo.</h1>
                  <p className="ps-complete-copy">{title} <span>·</span> {assets.length} photographs</p>
                  <button type="button" className="ps-restart-button" onClick={() => { setDirection(-1); setCurrentIndex(0); setHasInteracted(true); }}>
                    <RotateCcw size={16} /> Start again
                  </button>
                  {demo && <p className="ps-demo-note">You're looking at a live demo.</p>}
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* ── Tinder-style round action buttons ── */}
        {!isEnd && currentAsset && (
          <footer className="ps-action-area">
            <div className="ps-tinder-actions" role="toolbar" aria-label="Photo actions">
              {canDownloadPhoto && (
                <button
                  type="button"
                  className="ps-tinder-btn ps-btn-download"
                  onClick={() => galleryProps.onDownload(currentAsset.assetId, currentIndex)}
                  disabled={galleryProps?.busy === currentAsset.assetId}
                  aria-label="Download this photo"
                >
                  <ArrowDownToLine size={22} />
                </button>
              )}
              {canLike && (
                <button
                  type="button"
                  className={'ps-tinder-btn ps-btn-like' + (liked ? ' is-liked' : '')}
                  onClick={toggleLike}
                  aria-pressed={Boolean(liked)}
                  aria-label={liked ? 'Unlike this photo' : 'Like this photo'}
                >
                  <Heart size={26} fill={liked ? 'currentColor' : 'none'} strokeWidth={liked ? 2.2 : 1.8} />
                </button>
              )}
            </div>
            <p className="ps-control-hint">{hasInteracted ? 'Swipe to see the next photo' : 'Double-tap to like · Swipe to continue'}</p>
          </footer>
        )}
      </main>
      <span className="ps-sr-only" aria-live="polite">{isEnd ? 'All ' + assets.length + ' photos viewed' : 'Photo ' + (currentIndex + 1) + ' of ' + assets.length}</span>
    </div>
  );
}
