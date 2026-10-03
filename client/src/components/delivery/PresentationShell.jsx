import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Images, LoaderCircle, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import ClientGallery from './ClientGallery.jsx';
import { Photo } from '../PublicDesign.jsx';
import { DemoHeader, getFormatThemeStyles, normalizeDeliveryPhotos } from './formatShared.jsx';
import './PresentationShell.css';

export const presentationEase = [.22, 1, .36, 1];
export function CollectionGallery({ context, delivery, selection, onClose, singlePhoto = false }) {
  return <ClientGallery photos={context.all} title={delivery.title} delivery={delivery} initialIndex={selection === 'all' ? null : context.all.findIndex(photo => photo.assetId === selection)} singlePhoto={singlePhoto} onClose={onClose} {...context.galleryProps} />;
}

export function Arrival({ children, className, index = 0, ...props }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={reduced ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: reduced ? 0 : .45, delay: reduced ? 0 : Math.min(index % 6 * .045, .225), ease: presentationEase }} {...props}>{children}</motion.div>;
}
export function usePresentation(delivery, galleryProps = {}, demo = false) {
  const photos = useMemo(() => normalizeDeliveryPhotos(delivery, []), [delivery]);
  const all = useMemo(() => normalizeDeliveryPhotos(delivery, [], true), [delivery]);
  const [liked, setLiked] = useState(new Set());
  const props = demo ? { liked, onLike: id => setLiked(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }), onDownload: id => { const photo = all.find(item => item.assetId === id); if (!photo) return; const link = document.createElement('a'); link.href = photo.url; link.download = photo.originalFilename || 'sample-photo.webp'; link.click(); }, onDownloadAll: () => toast.info('These are sample files. Open a photograph to download a sample.'), ...galleryProps } : galleryProps;
  const opening = all.find(photo => photo.assetId === delivery?.v3?.openingAssetId) || photos[0];
  const closing = all.find(photo => photo.assetId === delivery?.v3?.closingAssetId) || photos.at(-1);
  const theme = getFormatThemeStyles(delivery, { bg: '#10100f', surface: '#20201c', text: '#f8f3e8', accent: '#d0b483' });
  const structure = JSON.stringify([delivery?.format, (delivery?.creativeDirection?.sections || []).map(section => [section.id, section.assetIds, section.layout]), (delivery?.formatConfig?.album?.spreads || []).map(spread => [spread.id, spread.assetIds, spread.layout])]);
  const identity = `${delivery?.publicId || delivery?._id || 'preview'}:${delivery?.v3?.revision || 0}:${photos.map(photo => photo.assetId).join('|')}:${structure}`;
  return { photos, all, opening, closing, theme, identity, galleryProps: props };
}
export function PresentationShell({ delivery, format, theme, onGallery, children, className = '', audioState, toggleAudio, hideSoundtrack = false }) {
  return <div className={`fd-page pv-viewer ${className}`} style={theme}><DemoHeader format={format} client={delivery?.title || delivery?.clientName || 'Your photographs'} sectionId={delivery?.format} delivery={delivery} onGallery={onGallery} audioState={audioState} toggleAudio={toggleAudio} hideSoundtrack={hideSoundtrack} />{children}</div>;
}
export function PresentationEnding({ delivery, photo, closingRef, unlocked = true, onGallery, children }) {
  return <footer ref={closingRef} className="pv-ending"><div className="pv-ending-copy"><span className="pv-eyebrow">THE COMPLETE COLLECTION</span><h2>{delivery?.creativeDirection?.closingLine || 'Your finished photographs are ready to keep.'}</h2>{unlocked && <button type="button" onClick={onGallery}><Images size={18} />Open full gallery<ArrowRight size={18} /></button>}{children}</div>{photo && <figure><Photo url={photo.thumbnailUrl || photo.url} alt={photo.alt || 'Closing photograph'} /></figure>}</footer>;
}
export function PhotoCard({ photo, index, onOpen, caption = true, eager = false, className = '', compactCaption = false }) {
  const [expanded, setExpanded] = useState(false);
  if (!photo) return null;
  return <figure className={`pv-photo-card ${className}`} style={photo.width > 0 && photo.height > 0 ? { '--pv-photo-ratio': `${photo.width} / ${photo.height}` } : undefined}><button type="button" onClick={() => onOpen?.(photo)} aria-label={`Open photograph ${index + 1}`}><Photo url={photo.url} thumbnailUrl={photo.thumbnailUrl} srcSet={photo.srcSet} alt={photo.alt || photo.caption || 'Finished photograph'} eager={eager} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 38vw" /><span className="pv-photo-number">{String(index + 1).padStart(2, '0')}</span></button>{caption && photo.caption && <figcaption className={compactCaption && !expanded ? 'pv-caption-compact' : ''}>{photo.caption}</figcaption>}{compactCaption && photo.caption?.length > 80 && <button className="pv-caption-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Read less' : 'Read more'}</button>}</figure>;
}

// New album/focus surfaces only. Existing Reveal/gallery/GridBoard slideshow loaders stay intact.
const readyImages = new Map();
function loadImage(photo) {
  const key = `${photo.url}|${photo.srcSet || ''}`;
  if (readyImages.has(key)) return readyImages.get(key);
  const promise = new Promise((resolve, reject) => {
    const image = new window.Image();
    const timeout = window.setTimeout(() => { readyImages.delete(key); reject(new Error('The photograph is taking too long to load.')); }, 15000);
    image.onload = async () => { clearTimeout(timeout); try { await image.decode?.(); } catch { /* Loaded images remain usable. */ } resolve(photo); };
    image.onerror = () => { clearTimeout(timeout); readyImages.delete(key); reject(new Error('This photograph could not load.')); };
    if (photo.srcSet) image.srcset = photo.srcSet;
    image.sizes = '(max-width: 640px) 94vw, (max-width: 1024px) 80vw, 1100px'; image.decoding = 'async'; image.src = photo.url;
  });
  readyImages.set(key, promise);
  if (readyImages.size > 12) readyImages.delete(readyImages.keys().next().value);
  return promise;
}
export function useReadyPhotos(requested, neighbours = []) {
  const [state, setState] = useState({ photos: [], loadedKey: '', ready: false, error: '', showLoading: false });
  const [retry, setRetry] = useState(0);
  const key = requested.map(photo => `${photo.assetId}:${photo.url}`).join('|');
  const neighbourKey = neighbours.map(photo => photo?.url).join('|');
  const version = useRef(0);
  useEffect(() => {
    const token = ++version.current;
    setState(current => ({ ...current, ready: false, error: '', showLoading: false }));
    const timer = setTimeout(() => { if (token === version.current) setState(current => ({ ...current, showLoading: true })); }, 300);
    Promise.all(requested.map(loadImage)).then(photos => { if (token === version.current) setState({ photos, loadedKey: key, ready: true, error: '', showLoading: false }); }).catch(error => { if (token === version.current) setState(current => ({ ...current, error: error.message, showLoading: false })); });
    return () => { clearTimeout(timer); version.current += 1; };
  }, [key, retry]);
  useEffect(() => {
    if (!state.ready) return;
    let cancelled = false;
    const limited = neighbours.filter(Boolean).slice(0, navigator.connection?.saveData || /2g/.test(navigator.connection?.effectiveType || '') ? 1 : 3);
    const preload = async () => { for (let index = 0; index < limited.length && !cancelled; index += 2) await Promise.allSettled(limited.slice(index, index + 2).map(loadImage)); };
    void preload();
    return () => { cancelled = true; };
  }, [state.ready, neighbourKey]);
  return { ...state, ready: state.ready && state.loadedKey === key, retry: () => setRetry(value => value + 1), key };
}
export function ImageWaiting({ state, onSkip, skipLabel = 'Continue without this photo' }) {
  if (!state.showLoading && !state.error) return null;
  return <div className="pv-image-waiting" role={state.error ? 'alert' : 'status'}>{state.error ? <><p>{state.error}</p><button type="button" onClick={state.retry}><RefreshCw size={16} />Retry</button>{onSkip && <button type="button" onClick={onSkip}>{skipLabel}</button>}</> : <><LoaderCircle size={16} className="v-spin" />Loading photograph</>}</div>;
}
