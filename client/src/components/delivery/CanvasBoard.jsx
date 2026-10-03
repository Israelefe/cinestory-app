import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, ChevronLeft, ChevronRight, Images, List, RefreshCw, X } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';
import { useDialogFocus } from '../useDialogFocus.js';
import ClientGallery from './ClientGallery.jsx';
import { DemoHeader, getFormatThemeStyles } from './formatShared.jsx';
import { usePresentation, useReadyPhotos, ImageWaiting } from './PresentationShell.jsx';
import { canvasCheckpoints } from '../../utils/canvas.js';
import { CANVAS_DEMO_DELIVERY } from '../../constants/canvasDemo.js';
import './CanvasBoard.css';

const number = value => String(value).padStart(2, '0');
const arrival = reduced => ({ initial: reduced ? false : { opacity: 0, y: 22 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .12 }, transition: { duration: reduced ? 0 : .55, ease: [.22, 1, .36, 1] } });

function BoardPhoto({ photo, eager, ...props }) {
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  return <><Photo key={attempt} url={photo.url} thumbnailUrl={photo.thumbnailUrl} srcSet={photo.srcSet} alt={photo.alt} eager={eager} onError={() => setFailed(true)} {...props} />{failed && <span className="cv-photo-error"><span>Photo could not load.</span><button type="button" onClick={event => { event.stopPropagation(); setFailed(false); setAttempt(value => value + 1); }}><RefreshCw size={16} />Retry photo</button></span>}</>;
}

function Bookend({ delivery, kind, photos, reduced, onContinue, onGallery }) {
  if (delivery.schemaVersion !== 3) return null;
  const opening = kind === 'opening', photo = photos.find(photo => photo.assetId === delivery.v3?.[opening ? 'openingAssetId' : 'closingAssetId']) || (opening ? photos[0] : photos.at(-1));
  return <section className={`cv-bookend is-${kind}`}>
    {photo && <div className="cv-bookend-image"><BoardPhoto photo={photo} eager={opening} sizes="(max-width: 767px) 100vw, 50vw" style={{ objectPosition: photo.focalPoint || '50% 50%' }} /></div>}
    <motion.div className="cv-bookend-copy" {...arrival(reduced)}><span>{opening ? 'YOUR PHOTOGRAPHS / CANVAS' : 'THE COMPLETE COLLECTION'}</span><h1>{opening ? delivery.creativeDirection?.title || delivery.title || delivery.clientName : 'Yours to keep.'}</h1><p>{delivery.creativeDirection?.[opening ? 'openingLine' : 'closingLine']}</p><button type="button" onClick={opening ? onContinue : onGallery}>{opening ? <><ArrowDown size={18} />Explore the canvas</> : <><Images size={18} />View full gallery</>}</button></motion.div>
  </section>;
}

function CanvasFocus({ all, selection, setSelection, onClose, triggerRef, reduced, onNavigate }) {
  const panel = useRef(null), gesture = useRef(null);
  useDialogFocus(true, panel, onClose, triggerRef);
  const photos = selection.scope ? all.filter(photo => selection.scope.includes(photo.assetId)) : all;
  const index = Math.max(0, photos.findIndex(photo => photo.assetId === selection.id));
  const next = offset => { const photo = photos[index + offset]; if (photo) { setSelection(current => ({ ...current, id: photo.assetId })); onNavigate?.(photo.assetId); } };
  const limitedConnection = navigator.connection?.saveData || /2g/.test(navigator.connection?.effectiveType || '');
  const state = useReadyPhotos([photos[index]], limitedConnection ? [] : [photos[index + 1], photos[index - 1], photos[index + 2]]);
  const readyPhoto = state.photos[0] || photos[index];
  const shown = { ...(photos.find(photo => photo.assetId === readyPhoto.assetId) || readyPhoto), url: readyPhoto.url, srcSet: readyPhoto.srcSet };
  const shownIndex = photos.findIndex(photo => photo.assetId === shown.assetId);
  useEffect(() => {
    const key = event => { if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return; if (event.key === 'ArrowRight') { event.preventDefault(); next(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); next(-1); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [index, selection.scope, all]);
  const pointerStart = event => {
    if (event.target.closest('button,a,input,select,textarea')) return;
    if (!event.isPrimary || event.button !== 0) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerEnd = event => {
    const start = gesture.current; gesture.current = null;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    if (Math.abs(x) > 48 && Math.abs(x) > Math.abs(y) * 1.25) next(x < 0 ? 1 : -1);
  };
  return <motion.div className="fd-canvas-focus cv-focus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .18 }} onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section ref={panel} role="dialog" aria-modal="true" aria-label="Canvas photograph" tabIndex={-1} initial={reduced ? false : { y: 14, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={reduced ? undefined : { y: 10, scale: .98 }}>
      <header className="cv-focus-header"><div><span>{selection.scope ? selection.title || 'Photo group' : 'The whole canvas'}</span><small aria-live="polite">{number(index + 1)} / {number(photos.length)}{!state.ready && ' · Loading'}</small></div>{selection.scope && <button type="button" onClick={() => setSelection(current => ({ ...current, scope: null }))}>Browse all {all.length} photos</button>}<button className="fd-canvas-focus-close" type="button" onClick={onClose} aria-label="Return to canvas"><X size={20} /></button></header>
      <div className="cv-focus-layout"><div className="cv-focus-image" onPointerDown={pointerStart} onPointerUp={pointerEnd} onPointerCancel={() => { gesture.current = null; }} onLostPointerCapture={() => { gesture.current = null; }}>
        {shown && <motion.figure layoutId={`canvas-photo-${shown.assetId}`} transition={{ duration: reduced ? 0 : .3 }}><Photo key={shown.assetId} url={state.photos.length ? shown.url : shown.thumbnailUrl || shown.url} srcSet={state.photos.length ? shown.srcSet : undefined} alt={shown.alt} eager draggable={false} sizes="(max-width: 640px) 94vw, (max-width: 1024px) 80vw, 1100px" /></motion.figure>}
        <ImageWaiting state={state} onSkip={index < photos.length - 1 ? () => next(1) : undefined} skipLabel="Next photo" />
      </div><div className="fd-canvas-focus-copy cv-focus-copy"><div>{shown && <><span>PHOTOGRAPH {number(shownIndex + 1)}</span>{shown.headline && <h2>{shown.headline}</h2>}<p>{shown.caption}</p></>}</div><nav aria-label="Photograph navigation"><button type="button" disabled={index === 0} onClick={() => next(-1)}><ChevronLeft size={18} />Previous</button><button type="button" disabled={index === photos.length - 1} onClick={() => next(1)}>Next<ChevronRight size={18} /></button></nav></div></div>
    </motion.section>
  </motion.div>;
}

export default function CanvasBoard({ delivery: supplied, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const delivery = supplied || CANVAS_DEMO_DELIVERY, reduced = useReducedMotion();
  const pathPrefix = useId();
  const context = usePresentation(delivery, galleryProps, !supplied);
  const { photos, all } = context;
  const points = useMemo(() => canvasCheckpoints(delivery, photos.map(photo => photo.assetId)), [delivery, photos]);
  const byId = useMemo(() => new Map(photos.map(photo => [photo.assetId, photo])), [photos]);
  const board = useRef(null), nodes = useRef(new Map()), trigger = useRef(null);
  const [paths, setPaths] = useState([]), [active, setActive] = useState(points[0]?.id), [visited, setVisited] = useState(new Set());
  const [selection, setSelection] = useState(null), [gallery, setGallery] = useState(false), [directory, setDirectory] = useState(false), [jumped, setJumped] = useState(null);
  const [boardVisible, setBoardVisible] = useState(false);
  const theme = getFormatThemeStyles(delivery, { bg: '#d8cbb8', surface: '#eee5d8', text: '#19130f', accent: '#764831' });
  const order = points.flatMap(point => point.assetIds), orderedPhotos = order.map(id => byId.get(id)).filter(Boolean);
  const signature = points.map(point => `${point.id}:${point.assetIds.join(',')}`).join('|');
  useEffect(() => { setSelection(null); setVisited(new Set()); setActive(current => points.some(point => point.id === current) ? current : points[0]?.id); }, [signature]);
  useLayoutEffect(() => {
    if (!board.current) return;
    let frame, disposed = false;
    const measure = () => {
      if (disposed || !board.current) return;
      cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
        if (disposed || !board.current) return;
        const base = board.current.getBoundingClientRect();
        const next = points.slice(0, -1).flatMap((point, index) => {
          const row = nodes.current.get(point.id), following = nodes.current.get(points[index + 1].id);
          const first = row?.querySelector('.cv-point-marker')?.getBoundingClientRect(), last = following?.querySelector('.cv-point-marker')?.getBoundingClientRect();
          if (!first || !last) return [];
          const x = first.left + first.width / 2 - base.left, y = first.top + first.height / 2 - base.top;
          const nx = last.left + last.width / 2 - base.left, ny = last.top + last.height / 2 - base.top;
          const corridor = (row.getBoundingClientRect().bottom + following.getBoundingClientRect().top) / 2 - base.top;
          return [{ id: point.id, next: points[index + 1].id, d: Math.abs(x - nx) < 1 ? `M ${x} ${y} C ${x + 12} ${y + (ny-y)/3}, ${nx - 12} ${ny - (ny-y)/3}, ${nx} ${ny}` : `M ${x} ${y} L ${x} ${corridor - 16} Q ${x} ${corridor} ${x + (nx > x ? 16 : -16)} ${corridor} L ${nx + (nx > x ? -16 : 16)} ${corridor} Q ${nx} ${corridor} ${nx} ${corridor + 16} L ${nx} ${ny}` }];
        });
        setPaths(next);
      });
    };
    const observer = new ResizeObserver(measure); observer.observe(board.current); nodes.current.forEach(node => observer.observe(node)); measure();
    document.fonts?.ready.then(measure);
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); };
  }, [signature]);
  useEffect(() => {
    const visible = new Map();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { visible.set(entry.target.id, entry.isIntersecting); if (entry.isIntersecting) setVisited(current => new Set([...current, entry.target.dataset.point])); });
      const current = points.find(point => visible.get(`cv-${point.id}`));
      if (current) setActive(current.id);
      else if (board.current?.getBoundingClientRect().top > innerHeight * .55) setActive(points[0]?.id);
    }, { rootMargin: '-18% 0px -45% 0px', threshold: 0 });
    const presence = new IntersectionObserver(entries => setBoardVisible(entries[0].isIntersecting));
    if (board.current) presence.observe(board.current);
    nodes.current.forEach(node => observer.observe(node)); return () => { observer.disconnect(); presence.disconnect(); };
  }, [signature]);
  useEffect(() => { if (!jumped) return; const timer = setTimeout(() => setJumped(null), 1600); return () => clearTimeout(timer); }, [jumped]);
  const jump = id => { setDirectory(false); setJumped(id); setActive(id); nodes.current.get(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); };
  const open = (photo, point, event) => { trigger.current = event.currentTarget; setSelection({ id: photo.assetId, scope: null, title: '' }); onNarrationNavigate?.(photo.assetId); };
  const groupOpen = (point, event) => { trigger.current = event.currentTarget; setSelection({ id: point.assetIds[0], scope: point.assetIds, title: point.title }); };
  const settings = delivery.formatConfig?.canvas || {};
  return <div className="fd-page fd-canvas cv-board" style={theme} data-arrangement={settings.arrangement || 'spatial'}>
    <DemoHeader format="Canvas" client={delivery.clientName || delivery.title} sectionId="canvas" delivery={supplied} onGallery={() => setGallery(true)} audioState={audioState} toggleAudio={toggleAudio} />
    <Bookend delivery={delivery} kind="opening" photos={all} reduced={reduced} onContinue={() => jump(points[0]?.id)} />
    <main className="cv-main"><motion.header className="cv-intro" {...arrival(reduced)}><span>{delivery.clientName || 'YOUR PHOTOGRAPHS'} / CANVAS</span><h2>{delivery.schemaVersion === 3 ? 'Follow the photographs.' : delivery.creativeDirection?.title || delivery.title || 'Your canvas'}</h2><p>Scroll through the board. Open any photograph for a closer look.</p><small>{photos.length} on the canvas · {all.length} in the full gallery</small></motion.header>
      <LayoutGroup id={`canvas-${delivery.publicId || delivery._id || 'demo'}`}><div className="cv-path-board" ref={board}>
        <svg className="fd-wall-paths cv-paths" aria-hidden="true"><defs>{paths.map((path, index) => <mask key={path.id} id={`${pathPrefix}-line-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%"><motion.path d={path.d} stroke="white" strokeWidth="5" fill="none" pathLength={1} style={{ strokeDasharray: 'var(--cv-line-length, 0) 1', strokeDashoffset: 0 }} initial={false} animate={{ '--cv-line-length': reduced || visited.has(path.next) || visited.has(path.id) ? 1 : 0 }} transition={{ duration: reduced ? 0 : .7, ease: 'easeOut' }} /></mask>)}</defs>{paths.map((path, index) => <path key={path.id} d={path.d} mask={`url(#${pathPrefix}-line-${index})`} />)}</svg>
        {points.map((point, at) => <section key={point.id} id={`cv-${point.id}`} data-point={point.id} data-type={point.type} ref={node => { if (node) nodes.current.set(point.id, node); else nodes.current.delete(point.id); }} className={`cv-checkpoint ${point.type === 'group' ? 'is-group' : 'is-single'} ${at % 2 ? 'is-right' : 'is-left'} ${active === point.id ? 'is-current' : ''} ${jumped === point.id ? 'is-jumped' : ''}`}>
          <div className="cv-point-marker" aria-label={`Checkpoint ${at + 1}`}><span>{number(at + 1)}</span></div>
          <div className="cv-checkpoint-content">{point.type === 'group' && <motion.header className="cv-group-heading" {...arrival(reduced)}><div><span>GROUP / {point.assetIds.length} PHOTOS</span><h3>{point.title}</h3>{settings.showGroupNotes !== false && point.note && <p>{point.note}</p>}</div><button type="button" onClick={event => groupOpen(point, event)} aria-label={`Open ${point.title || 'photo group'}`}>View group<ChevronRight size={17} /></button></motion.header>}
            <div className="cv-photo-composition">{point.assetIds.map((id, place) => {
              const photo = byId.get(id), index = order.indexOf(id); if (!photo) return null;
              return <motion.figure className={`cv-frame ${photo.width > photo.height ? 'is-landscape' : ''}`} key={id} {...arrival(reduced)} style={{ '--cv-ratio': photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 4', '--cv-tilt': `${(index % 3 - 1) * 1.2}deg` }}>
                <motion.div layoutId={`canvas-photo-${id}`} className="cv-frame-surface"><button type="button" className="fd-wall-card cv-photo-open" onClick={event => open(photo, point, event)} aria-label={`Open photograph ${index + 1}`}><Photo url={photo.url} thumbnailUrl={photo.thumbnailUrl} srcSet={photo.srcSet} alt={photo.alt} eager={index < 2} style={{ objectPosition: photo.focalPoint || '50% 50%' }} sizes="(max-width: 640px) 86vw, (max-width: 1024px) 42vw, 520px" onError={event => { event.currentTarget.closest('.cv-frame').classList.add('has-error'); }} /></button><button type="button" className="cv-frame-retry" onClick={event => { const frame = event.currentTarget.closest('.cv-frame'), image = frame.querySelector('img'); frame.classList.remove('has-error'); image.src = photo.url; image.srcset = photo.srcSet || ''; }}><RefreshCw size={16} />Retry photo</button></motion.div>
                <figcaption className="cv-frame-label"><span>{number(index + 1)}</span>{photo.headline && <strong>{photo.headline}</strong>}</figcaption>
              </motion.figure>;
            })}</div>
          </div>
        </section>)}
      </div><AnimatePresence>{selection && byId.has(selection.id) && (!selection.scope || selection.scope.some(id => byId.has(id))) && <CanvasFocus all={orderedPhotos} selection={selection} setSelection={setSelection} onClose={() => setSelection(null)} triggerRef={trigger} reduced={reduced} onNavigate={onNarrationNavigate} />}</AnimatePresence></LayoutGroup>
    </main>
    <Bookend delivery={delivery} kind="closing" photos={all} reduced={reduced} onGallery={() => setGallery(true)} />
    {boardVisible && <aside className={`cv-directory ${directory ? 'is-open' : ''}`} aria-label="Canvas checkpoints"><button type="button" className="cv-directory-toggle" aria-expanded={directory} onClick={() => setDirectory(value => !value)}><List size={18} /><span>Checkpoints</span><small>{number(Math.max(0, points.findIndex(point => point.id === active)) + 1)} / {number(points.length)}</small></button>{directory && <motion.nav initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .2 }}>{points.map((point, index) => <button type="button" key={point.id} aria-current={point.id === active ? 'location' : undefined} onClick={() => jump(point.id)}><span>{number(index + 1)}</span><strong>{point.title || byId.get(point.assetIds[0])?.headline || `Photograph ${number(order.indexOf(point.assetIds[0]) + 1)}`}</strong><small>{point.assetIds.length} {point.type === 'group' ? 'photos' : 'photo'}</small></button>)}</motion.nav>}</aside>}
    <AnimatePresence>{gallery && <ClientGallery photos={all} delivery={delivery} title={delivery.title || delivery.clientName} fontStyles={theme} onClose={() => setGallery(false)} {...context.galleryProps} />}</AnimatePresence>
  </div>;
}
