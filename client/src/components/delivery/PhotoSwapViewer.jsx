import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { ArrowDownToLine, Check, Heart, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import { API_BASE_URL } from '../../config/env.js';
import { deliveryFontStyles } from '../../utils/deliveryTypography.js';
import { useSmoothSoundtrackLoop } from '../../utils/smoothSoundtrackLoop.js';
import './PhotoSwapViewer.css';
import './DeliveryTypography.css';

const SWIPE_VELOCITY = 300;

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
  const audioRef = useRef(null);
  const reduced = useVeyloReducedMotion();
  const stackOffset = useMotionValue(0);
  const backScale = useMotionValue(.93);
  const backRotate = useMotionValue(3.3);
  useMotionValueEvent(stackOffset, 'change', value => {
    backScale.set(.93 + Math.min(1, Math.abs(value) / 360) * .045);
    backRotate.set(3.3 - Math.min(1, Math.abs(value) / 360) * 1.1);
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
        <header className="ps-header">
          <div className="ps-header-brand">
            <span className="ps-brand-mark"><DeliveryBrandMark branding={delivery?.branding} /></span>
            <span className="ps-header-copy">
              <small>PHOTO SWAP</small>
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
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
          </div>
          <div className="ps-progress-track" aria-hidden="true"><i style={{ width: (isEnd ? 100 : ((currentIndex + 1) / assets.length) * 100) + '%' }} /></div>
        </header>

        <section className="ps-deck-region" aria-label="Swipe through the photographs">
          {!isEnd && !hasInteracted && (
            <motion.p className="ps-swipe-hint" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .24, duration: reduced ? .12 : .28 }}>
              Swipe either way to continue
            </motion.p>
          )}
          <div className="ps-deck">
            {!isEnd && secondAsset && (
              <motion.div className="ps-photo-card ps-card-back" style={{ scale: backScale, rotate: backRotate }} aria-hidden="true">
                <img src={mediaUrl(photoUrl(secondAsset))} alt="" loading="lazy" decoding="async" />
              </motion.div>
            )}
            {!isEnd && nextAsset && (
              <div className="ps-photo-card ps-card-middle" aria-hidden="true">
                <img src={mediaUrl(photoUrl(nextAsset))} alt="" loading="eager" decoding="async" />
              </div>
            )}
            <AnimatePresence initial={false} custom={direction} mode="sync">
              {!isEnd && currentAsset ? (
                <motion.article
                  key={currentAsset.assetId}
                  className="ps-photo-card ps-card-front"
                  style={{ x: stackOffset }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={.84}
                  dragMomentum={false}
                  onDragStart={requestSoundtrack}
                  onDrag={(_, info) => stackOffset.set(info.offset.x)}
                  onDragEnd={(_, info) => {
                    animate(stackOffset, 0, { type: 'spring', damping: 25, stiffness: 280 });
                    const threshold = Math.max(52, window.innerWidth * .18);
                    if (Math.abs(info.offset.x) >= threshold || Math.abs(info.velocity.x) >= SWIPE_VELOCITY) advance(info.offset.x < 0 ? -1 : 1);
                  }}
                  initial={{ opacity: .7, scale: .94, x: direction > 0 ? 84 : -84, rotate: direction > 0 ? 4 : -4 }}
                  animate={{ opacity: 1, scale: 1, x: 0, rotate: 0, transition: { type: 'spring', damping: 25, stiffness: reduced ? 230 : 280 } }}
                  exit={{ opacity: 0, x: direction > 0 ? -window.innerWidth * .9 : window.innerWidth * .9, rotate: direction > 0 ? -10 : 10, transition: { duration: reduced ? .18 : .28, ease: [.32, 0, .67, 0] } }}
                  role="group"
                  aria-roledescription="photograph"
                  aria-label={'Photo ' + (currentIndex + 1) + ' of ' + assets.length}
                >
                  <div className="ps-photo-image">
                    <img src={mediaUrl(photoUrl(currentAsset))} srcSet={currentAsset.srcSet || undefined} sizes="(max-width: 640px) 88vw, (max-width: 1024px) 500px, 460px" alt={currentAsset.alt || currentAsset.caption || 'Finished photograph ' + (currentIndex + 1)} fetchPriority="high" decoding="async" draggable="false" />
                    <span className="ps-image-index">{photoNumber}<i> / {totalNumber}</i></span>
                  </div>
                  <div className="ps-card-caption">
                    <span>{shootType} <i aria-hidden="true">/</i> {photoNumber} of {totalNumber}</span>
                    <p>{currentAsset.caption || 'A finished photograph from ' + title + '.'}</p>
                  </div>
                </motion.article>
              ) : (
                <motion.section
                  key="complete"
                  className="ps-complete-card"
                  initial={{ opacity: .65, y: 14, scale: .96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 25, stiffness: reduced ? 230 : 270 }}
                  aria-labelledby="ps-complete-title"
                >
                  <span className="ps-complete-mark"><Check size={21} strokeWidth={2.3} /></span>
                  <p className="ps-complete-label">PHOTO SWAP COMPLETE</p>
                  <h1 id="ps-complete-title">You’ve seen every photo.</h1>
                  <p className="ps-complete-copy">{title} <span>·</span> {assets.length} photographs</p>
                  <button type="button" className="ps-restart-button" onClick={() => { setDirection(-1); setCurrentIndex(0); setHasInteracted(true); }}>
                    <RotateCcw size={16} /> Start again
                  </button>
                  {demo && <p className="ps-demo-note">You’re looking at a live demo.</p>}
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </section>

        {!isEnd && currentAsset && (
          <footer className="ps-action-area">
            <div className="ps-photo-actions" role="toolbar" aria-label="Photo actions">
              {canLike && (
                <button type="button" className={'ps-photo-action ps-like-button' + (liked ? ' is-liked' : '')} onClick={toggleLike} aria-pressed={Boolean(liked)} aria-label={liked ? 'Unlike this photo' : 'Like this photo'}>
                  <span className="ps-action-icon"><Heart size={21} fill={liked ? 'currentColor' : 'none'} strokeWidth={liked ? 2.2 : 1.8} /></span>
                  <span>{liked ? 'Liked' : 'Like'}</span>
                </button>
              )}
              {canDownloadPhoto && (
                <button
                  type="button"
                  className="ps-photo-action ps-download-button"
                  onClick={() => galleryProps.onDownload(currentAsset.assetId, currentIndex)}
                  disabled={galleryProps?.busy === currentAsset.assetId}
                  aria-label="Download this photo"
                >
                  <span className="ps-action-icon"><ArrowDownToLine size={20} /></span>
                  <span>{galleryProps?.busy === currentAsset.assetId ? 'Saving' : 'Download'}</span>
                </button>
              )}
            </div>
            <p className="ps-control-hint">{hasInteracted ? 'Keep swiping to see the rest.' : 'The full photograph stays in view as you swipe.'}</p>
          </footer>
        )}
      </main>
      <span className="ps-sr-only" aria-live="polite">{isEnd ? 'All ' + assets.length + ' photos viewed' : 'Photo ' + (currentIndex + 1) + ' of ' + assets.length}</span>
    </div>
  );
}
