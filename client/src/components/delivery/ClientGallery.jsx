import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink, Heart, Image as ImageIcon, LoaderCircle, X } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';
import { useDialogFocus } from '../useDialogFocus.js';
import { trackEvent } from '../../services/analytics.js';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import { deliveryFontStyles } from '../../utils/deliveryTypography.js';
import './ClientGallery.css';
import './DeliveryTypography.css';

const photoKey = (photo, index) => photo?.assetId || photo?.id || photo?.name || index;
const imageUrl = (photo, width = 1440) => {
  if (photo?.url) return photo.url;
  const name = typeof photo === 'string' ? photo : photo?.name;
  if (!name) return '';
  if (name.startsWith('/') || /^https?:\/\//i.test(name)) return name;
  return `/veylo/web/${name}-${width}.webp`;
};

function LightboxPhoto({ photo, sourceUrl, alt }) {
  const [source, setSource] = useState('responsive');
  const [failed, setFailed] = useState(false);
  const fallback = photo?.thumbnailUrl;
  const handleError = () => {
    if (source === 'responsive' && photo?.srcSet) setSource('delivery');
    else if (source !== 'thumbnail' && fallback && fallback !== photo?.url) setSource('thumbnail');
    else setFailed(true);
  };

  if (failed) return <div className="client-gallery-photo-error" role="img" aria-label={`${alt}. Photo could not be loaded.`}><ImageIcon size={24} /><span>This photo could not be loaded. Please try again.</span></div>;
  return <img className="client-gallery-lightbox-main" src={source === 'thumbnail' ? fallback : photo?.url || sourceUrl} srcSet={source === 'responsive' ? photo?.srcSet : undefined} sizes="(max-width: 640px) 94vw, (max-width: 1024px) 86vw, 1080px" alt={alt} draggable="false" onError={handleError} />;
}

export default function ClientGallery({ photos: collectionPhotos = [], singlePhoto = false, title = 'Your photographs', eyebrow = 'The complete collection', onClose, initialIndex = null, liked, onLike, onDownload, onOpenOriginal, onDownloadAll, busy, downloading = null, allDownloading = false, downloadNotice = '', downloadProgress = null, delivery, demoId, fontStyles }) {
  const photos = useMemo(() => singlePhoto ? collectionPhotos.slice(initialIndex, initialIndex + 1) : collectionPhotos, [collectionPhotos, singlePhoto, initialIndex]);
  const originalIndex = index => singlePhoto ? initialIndex : index;
  const photographNumber = index => originalIndex(index) + 1;
  const reduced = useVeyloReducedMotion();
  const galleryId = useId();
  const panel = useRef(null);
  const collection = useRef(null);
  const photoButtons = useRef(new Map());
  const gridScroll = useRef(0);
  const previousSelected = useRef(null);
  const navigation = useRef(null);
  const lightboxBack = useRef(null);
  const [selected, setSelected] = useState(() => singlePhoto ? 0 : Number.isInteger(initialIndex) && initialIndex >= 0 && initialIndex < photos.length ? initialIndex : null);
  const [swipeDirection, setSwipeDirection] = useState(1);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [groupId, setGroupId] = useState('all');
  const [ratios, setRatios] = useState({});
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [originalNotice, setOriginalNotice] = useState('');
  useDialogFocus(true, panel, () => singlePhoto || selected === null ? onClose?.() : setSelected(null));
  useEffect(() => {
    navigation.current = null;
    setSelected(singlePhoto ? 0 : Number.isInteger(initialIndex) && initialIndex >= 0 && initialIndex < photos.length ? initialIndex : null);
  }, [singlePhoto, initialIndex]);

  const allowDownloadAll = !singlePhoto && (delivery ? delivery.access?.allowDownloadAll !== false : Boolean(onDownloadAll));
  const allowIndividualDownloads = Boolean(onDownload) && (!delivery || delivery.access?.allowIndividualDownloads !== false);
  const allowLikes = delivery ? Boolean(delivery.access?.allowLikes && onLike) : Boolean(onLike);
  const resolvedPhotos = useMemo(() => photos.map((photo, index) => demoId ? { ...photo, name: `demo-${demoId}-${photographNumber(index)}`, url: `/veylo/web/demo-${demoId}-${photographNumber(index)}-1440.webp`, thumbnailUrl: `/veylo/web/demo-${demoId}-${photographNumber(index)}-480.webp` } : photo), [photos, demoId, singlePhoto, initialIndex]);
  const fonts = deliveryFontStyles(delivery?.kind === 'pinboard' ? delivery?.pinboard?.typography : delivery?.kind === 'photoswap' ? delivery?.photoswap?.typography : delivery?.creativeDirection?.typography, { display: fontStyles?.['--delivery-font-heading'], body: fontStyles?.['--delivery-font-caption'] });
  const galleryTheme = { ...fonts, '--gallery-display': fonts['--delivery-font-heading'], '--gallery-body': fonts['--delivery-font-caption'] };
  const favouriteCount = resolvedPhotos.filter((photo, index) => liked?.has(photoKey(photo, index))).length;
  const savedGroups = ['canvas', 'chapters', 'event-coverage', 'campaign'].includes(delivery?.format) ? delivery?.format === 'campaign' && delivery?.formatConfig?.campaign?.fileSets?.length ? delivery.formatConfig.campaign.fileSets : delivery?.creativeDirection?.sections || [] : [];
  const groups = savedGroups.filter(group => group.assetIds?.some(id => resolvedPhotos.some(photo => photo.assetId === id)));
  const activeGroup = groups.find(group => group.id === groupId);
  const visibleIndexes = resolvedPhotos.map((_, index) => index).filter(index => (!activeGroup || activeGroup.assetIds.includes(resolvedPhotos[index].assetId)) && (!allowLikes || !favouritesOnly || liked?.has(photoKey(resolvedPhotos[index], index))));
  const activePhoto = selected === null ? null : resolvedPhotos[selected];
  const activeKey = selected === null ? null : photoKey(activePhoto, selected);
  const activeImageUrl = activePhoto ? imageUrl(activePhoto) : '';
  const suggestedTone = activePhoto?.dominantColor || activePhoto?.analysis?.colors?.[0];
  const photoTone = typeof suggestedTone === 'string' && /^#[0-9a-f]{6}$/i.test(suggestedTone) ? suggestedTone : '#08080b';
  const resolvedBusy = busy ?? (allDownloading ? 'all' : downloading === null ? null : photoKey(resolvedPhotos[downloading], downloading));
  const navigationIndexes = navigation.current || resolvedPhotos.map((_, index) => index);
  const navigationPosition = navigationIndexes.indexOf(selected);
  const atStart = navigationPosition <= 0;
  const atEnd = navigationPosition >= navigationIndexes.length - 1;

  function openPhoto(index) {
    gridScroll.current = collection.current?.scrollTop || 0;
    navigation.current = visibleIndexes;
    setSwipeDirection(1);
    setSelected(index);
  }

  function navigatePhoto(step) {
    if (selected === null) return;
    const nextPosition = Math.max(0, Math.min(navigationIndexes.length - 1, navigationPosition + step));
    const next = navigationIndexes[nextPosition];
    if (next !== undefined && next !== selected) { setSwipeDirection(step); setSelected(next); }
  }

  function finishPhotoSwipe(_, info) {
    const movement = Math.abs(info.offset.x) > 12 ? info.offset.x : info.velocity.x;
    if (Math.abs(info.offset.x) > 55 || Math.abs(info.velocity.x) > 450) navigatePhoto(movement < 0 ? 1 : -1);
  }

  useEffect(() => {
    trackEvent('client.gallery.opened', { demo: Boolean(demoId), count: resolvedPhotos.length }, { format: delivery?.format || 'photo-story', status: 'opened', count: resolvedPhotos.length });
  }, []);

  useEffect(() => {
    if (selected === null || !activePhoto) return;
    trackEvent('client.photo.opened', { index: selected + 1 }, { format: delivery?.format || 'photo-story', status: 'opened', count: 1 });
    if (activePhoto.caption) trackEvent('client.caption.viewed', { index: selected + 1 }, { format: delivery?.format || 'photo-story', status: 'viewed', count: 1 });
  }, [activePhoto, delivery?.format, selected]);

  useEffect(() => {
    const previous = previousSelected.current;
    previousSelected.current = selected;
    const frame = requestAnimationFrame(() => {
      if (selected === null && previous !== null) {
        if (collection.current) collection.current.scrollTop = gridScroll.current;
        (photoButtons.current.get(previous) || panel.current)?.focus({ preventScroll: true });
      } else if (selected !== null && previous === null) lightboxBack.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);

  useEffect(() => {
    const onKey = event => {
      if (selected === null || event.target?.closest('input, textarea, select')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); navigatePhoto(event.key === 'ArrowRight' ? 1 : -1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resolvedPhotos.length, selected]);

  useEffect(() => {
    if (selected === null) return;
    const neighbours = [navigationIndexes[navigationPosition - 1], navigationIndexes[navigationPosition + 1]];
    const images = neighbours.filter(index => index !== undefined).map(index => {
      const img = new window.Image();
      if (resolvedPhotos[index]?.srcSet) img.srcset = resolvedPhotos[index].srcSet;
      img.sizes = '(max-width: 640px) 94vw, (max-width: 1024px) 86vw, 1080px';
      img.src = imageUrl(resolvedPhotos[index]);
      return img;
    });
    return () => images.forEach(img => { img.onload = null; img.onerror = null; });
  }, [selected, resolvedPhotos]);

  useEffect(() => {
    if (selected !== null && !resolvedPhotos[selected]) setSelected(null);
  }, [resolvedPhotos, selected]);

  const runDownload = (photo, index) => onDownload?.(photoKey(photo, originalIndex(index)), originalIndex(index));
  const runLike = (photo, index) => onLike?.(photoKey(photo, originalIndex(index)), originalIndex(index));
  async function openOriginal(photo, index) {
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      setOriginalNotice('Allow pop-ups to open the full-size photograph.');
      return;
    }
    tab.opener = null;
    tab.document.title = 'Opening photograph';
    tab.document.body.style.cssText = 'margin:0;display:grid;min-height:100vh;place-items:center;background:#08080b;color:#f7f3ef;font:14px system-ui,sans-serif';
    tab.document.body.textContent = 'Opening the full-size photograph…';
    setOpeningOriginal(true);
    setOriginalNotice('');
    try {
      const url = await onOpenOriginal?.(photoKey(photo, index), originalIndex(index));
      if (!url) throw new Error('The original image link was empty.');
      tab.location.replace(url);
    } catch {
      tab.close();
      setOriginalNotice('We could not open this photograph. Please try again.');
    } finally {
      setOpeningOriginal(false);
    }
  }
  const layoutId = key => `${galleryId}-photograph-${key}`;
  const canOpenOriginal = allowIndividualDownloads && Boolean(onOpenOriginal);
  const sceneTransition = { duration: reduced ? 0 : .32, ease: [.22, 1, .36, 1] };

  return createPortal(<LayoutGroup id={galleryId}><motion.div className="client-gallery-overlay" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
    <motion.section ref={panel} className={`client-gallery ${selected === null ? 'is-collection' : 'is-lightbox'}`} style={galleryTheme} role="dialog" aria-modal="true" aria-labelledby={`${galleryId}-title`} tabIndex={-1} initial={reduced ? false : { opacity: 0, y: 28, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: 18 }} transition={reduced ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 270 }}>
      <header className="client-gallery-header">
        <div className="client-gallery-heading"><p>{selected === null ? eyebrow : singlePhoto ? title : `${title} · ${selected + 1} of ${photos.length}`}</p><h2 id={`${galleryId}-title`}>{selected === null ? title : `Photograph ${photographNumber(selected)}`}</h2><span className="client-gallery-count">{selected === null ? `${photos.length} ${photos.length === 1 ? 'photograph' : 'photographs'}` : singlePhoto ? 'The photograph you opened' : 'Your complete collection'}</span></div>
        <div className="client-gallery-header-actions">
          {selected === null && allowDownloadAll && onDownloadAll && <button className="client-gallery-download-all" type="button" onClick={onDownloadAll} disabled={Boolean(resolvedBusy)}>{resolvedBusy === 'all' ? <LoaderCircle className="client-gallery-spin" size={16} /> : <Download size={16} />}<span>{resolvedBusy === 'all' && downloadProgress ? `Starting ${downloadProgress.current}/${downloadProgress.total}` : resolvedBusy === 'all' ? 'Starting…' : 'Download all photos'}</span></button>}
          <button className="client-gallery-icon" type="button" onClick={onClose} aria-label="Close gallery"><X size={21} /></button>
        </div>
        {!singlePhoto && groups.length > 0 && <label className="client-gallery-group-filter">{delivery?.format === 'campaign' ? 'File set' : delivery?.format === 'chapters' ? 'Chapter' : 'Photo group'}<select aria-label={delivery?.format === 'campaign' ? 'File set' : delivery?.format === 'chapters' ? 'Chapter' : 'Photo group'} value={groupId} onChange={event => { setGroupId(event.target.value); gridScroll.current = 0; collection.current?.scrollTo(0, 0); }}><option value="all">All photographs</option>{groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}</select></label>}
      </header>
      {downloadNotice && <p className="client-gallery-download-tip" role="status">{downloadNotice}</p>}
      {!singlePhoto && <div ref={collection} className="client-gallery-collection" hidden={selected !== null}>
        <div className="client-gallery-collection-top">
          {delivery?.branding?.type === 'studio' && <div className="client-gallery-studio"><DeliveryBrandMark branding={delivery.branding} /><div><span>Photographed by</span><strong>{delivery.branding.name}</strong></div></div>}
          {allowLikes && <div className="client-gallery-filters" role="group" aria-label="Filter photographs"><button type="button" className={!favouritesOnly ? 'is-active' : ''} aria-pressed={!favouritesOnly} onClick={() => { setFavouritesOnly(false); gridScroll.current = 0; collection.current?.scrollTo(0, 0); }}><ImageIcon size={15} />All photos<span>{photos.length}</span></button><button type="button" className={favouritesOnly ? 'is-active' : ''} aria-pressed={favouritesOnly} onClick={() => { setFavouritesOnly(true); gridScroll.current = 0; collection.current?.scrollTo(0, 0); }}><Heart size={15} />Favourites<span>{favouriteCount}</span></button></div>}
        </div>
        {demoId && allowLikes && <p className="client-gallery-demo-note">Favourites stay in this demo preview.</p>}
        {visibleIndexes.length ? <div className="client-gallery-grid">{visibleIndexes.map((index, order) => {
          const photo = resolvedPhotos[index];
          const key = photoKey(photo, index);
          const isLiked = liked?.has(key);
          const ratio = ratios[key] || (photo.width && photo.height ? photo.width / photo.height : .8);
          return <motion.figure key={key} initial={reduced ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }} transition={{ duration: reduced ? 0 : .35, delay: reduced ? 0 : Math.min(order * .025, .12) }}>
            <motion.button ref={element => { if (element) photoButtons.current.set(index, element); else photoButtons.current.delete(index); }} layoutId={reduced ? undefined : layoutId(key)} className="client-gallery-photo" style={{ aspectRatio: Math.max(.55, Math.min(2.2, ratio)), borderRadius: 6 }} transition={sceneTransition} type="button" onClick={() => openPhoto(index)} aria-label={`Open photograph ${index + 1}`} onLoadCapture={event => { const img = event.target; if (img.naturalWidth && img.naturalHeight) setRatios(current => current[key] ? current : { ...current, [key]: img.naturalWidth / img.naturalHeight }); }}><Photo name={photo.name} url={photo.thumbnailUrl || photo.url} srcSet={photo.srcSet} alt={photo.alt || photo.caption || `Photograph ${index + 1}`} sizes="(max-width: 640px) 44vw, (max-width: 1024px) 29vw, 24vw" /></motion.button>
            <figcaption><span>{String(index + 1).padStart(2, '0')}</span><div>
              {allowLikes && <button className={isLiked ? 'is-liked' : ''} type="button" onClick={() => runLike(photo, index)} aria-pressed={Boolean(isLiked)} aria-label={isLiked ? 'Remove from favourites' : 'Add to favourites'}><Heart size={17} fill={isLiked ? 'currentColor' : 'none'} /></button>}
              {allowIndividualDownloads && <button type="button" onClick={() => runDownload(photo, index)} disabled={resolvedBusy === key || resolvedBusy === 'all'} aria-label={`Download photograph ${index + 1}`}>{resolvedBusy === key ? <LoaderCircle className="client-gallery-spin" size={17} /> : <Download size={17} />}</button>}
            </div></figcaption>
          </motion.figure>;
        })}</div> : <div className="client-gallery-empty"><Heart size={28} /><h3>No favourites yet.</h3><p>Tap the heart on a photograph to keep it here.</p><button type="button" onClick={() => setFavouritesOnly(false)}>View all photos</button></div>}
      </div>}
      <AnimatePresence>{selected !== null && activePhoto && <motion.div className="client-gallery-lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .15 }}>
        <div className="client-gallery-lightbox-photo" style={{ backgroundColor: photoTone }}>
          <img className="client-gallery-lightbox-ambient" src={activeImageUrl} alt="" aria-hidden="true" draggable="false" />
          <AnimatePresence mode="sync" custom={swipeDirection}><motion.div className="client-gallery-lightbox-frame" layoutId={reduced ? undefined : layoutId(activeKey)} key={activeKey} style={{ borderRadius: 6 }} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={.2} dragMomentum={false} onDragEnd={finishPhotoSwipe} initial={reduced ? false : { opacity: 0, x: swipeDirection * 36 }} animate={{ opacity: 1, x: 0 }} variants={{ departing: direction => ({ opacity: 0, x: -direction * 36 }) }} exit="departing" transition={sceneTransition}><LightboxPhoto key={activeKey} photo={activePhoto} sourceUrl={activeImageUrl} alt={activePhoto.alt || activePhoto.caption || `Photograph ${selected + 1}`} /></motion.div></AnimatePresence>
        </div>
        {activePhoto.caption && <p className="client-gallery-lightbox-caption">{activePhoto.caption}</p>}
        <div className="client-gallery-lightbox-actions">
          {!singlePhoto && <button className="client-gallery-icon" type="button" onClick={() => navigatePhoto(-1)} disabled={atStart} aria-label="Previous photograph"><ChevronLeft size={21} /></button>}
          <button ref={lightboxBack} className="client-gallery-back" type="button" onClick={() => singlePhoto ? onClose?.() : setSelected(null)} aria-label={singlePhoto ? 'Return to presentation' : 'All photographs'}><ArrowLeft size={16} /><span>{singlePhoto ? 'Return to presentation' : 'All photographs'}</span></button>
          {allowLikes && <button className={`client-gallery-icon ${liked?.has(activeKey) ? 'is-liked' : ''}`} type="button" onClick={() => runLike(activePhoto, selected)} aria-pressed={Boolean(liked?.has(activeKey))} aria-label={liked?.has(activeKey) ? 'Remove from favourites' : 'Add to favourites'}><Heart size={17} fill={liked?.has(activeKey) ? 'currentColor' : 'none'} /></button>}
          {allowIndividualDownloads && <button className="client-gallery-download-one" type="button" aria-label="Download photograph" onClick={() => runDownload(activePhoto, selected)} disabled={resolvedBusy === activeKey || resolvedBusy === 'all'}>{resolvedBusy === activeKey ? <LoaderCircle className="client-gallery-spin" size={16} /> : <Download size={16} />}<span>{resolvedBusy === activeKey ? 'Preparing…' : 'Download'}</span></button>}
          {canOpenOriginal && <button className="client-gallery-open-original" type="button" aria-label="Open full-size photograph in a new tab" onClick={() => openOriginal(activePhoto, selected)} disabled={openingOriginal}>{openingOriginal ? <LoaderCircle className="client-gallery-spin" size={16} /> : <ExternalLink size={16} />}<span>{openingOriginal ? 'Opening…' : 'Full size'}</span></button>}
          {!singlePhoto && <button className="client-gallery-icon" type="button" onClick={() => navigatePhoto(1)} disabled={atEnd} aria-label="Next photograph"><ChevronRight size={21} /></button>}
        </div>
        {originalNotice && <p className="client-gallery-original-notice" role="status">{originalNotice}</p>}
      </motion.div>}</AnimatePresence>
    </motion.section>
  </motion.div></LayoutGroup>, document.body);
}
