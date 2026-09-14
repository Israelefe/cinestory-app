import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Download, Expand, Grid3X3, Heart, Image, LoaderCircle, LockKeyhole, Maximize2, Move, Music2, Pause, Play, Share2, Volume2, VolumeX, X, ZoomIn, ZoomOut } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { toast } from 'react-toastify';
import './DeliveryViewer.css';

function accessHeaders(publicId) {
  const token = sessionStorage.getItem(`veylo_delivery_${publicId}`);
  return token ? { 'X-Delivery-Access': token } : {};
}

function motionClass(value) { return `is-${value || 'slow-push'}`; }

function Brand({ branding }) {
  return <div className="vd-brand">{branding?.logoUrl && <img src={branding.logoUrl} alt="" />}<span><small>PRESENTED BY</small><strong>{branding?.name || 'Veylo'}</strong></span></div>;
}

function PhotoImage({ asset, frame, className = '', eager = false }) {
  return <img className={`vd-photo ${motionClass(frame?.motion)} ${className}`} src={asset.url} alt={frame?.caption || ''} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" />;
}

function ViewerShell({ delivery, children, onGallery }) {
  const [playing, setPlaying] = useState('');
  const narrationRef = useRef(null);
  const soundtrackRef = useRef(null);
  async function toggleAudio(kind) {
    const selected = kind === 'narration' ? narrationRef.current : soundtrackRef.current;
    const other = kind === 'narration' ? soundtrackRef.current : narrationRef.current;
    if (!selected) return;
    if (playing === kind) { selected.pause(); setPlaying(''); return; }
    other?.pause();
    try { await selected.play(); setPlaying(kind); } catch { toast.info('Tap again to play the audio.'); }
  }
  return <div className={`vd-viewer vd-${delivery.format}`} style={{ '--vd-bg': delivery.creativeDirection?.palette?.background || '#070709', '--vd-surface': delivery.creativeDirection?.palette?.surface || '#0c0c10', '--vd-text': delivery.creativeDirection?.palette?.text || '#f3ece6', '--vd-accent': delivery.creativeDirection?.palette?.accent || '#ff9b8e' }}>
    <header className="vd-top"><Brand branding={delivery.branding} /><div>{delivery.soundtrack?.url && <><audio ref={soundtrackRef} src={delivery.soundtrack.url} preload="metadata" loop onEnded={() => setPlaying('')} /><button type="button" className={playing === 'soundtrack' ? 'is-playing' : ''} onClick={() => toggleAudio('soundtrack')} aria-label={playing === 'soundtrack' ? 'Pause soundtrack' : `Play ${delivery.soundtrack.title || 'soundtrack'}`}><Music2 size={17} /></button></>}{delivery.narration?.url && <><audio ref={narrationRef} src={delivery.narration.url} preload="metadata" onEnded={() => setPlaying('')} /><button type="button" className={playing === 'narration' ? 'is-playing' : ''} onClick={() => toggleAudio('narration')} aria-label={playing === 'narration' ? 'Pause narration' : 'Play narration'}>{playing === 'narration' ? <VolumeX size={17} /> : <Volume2 size={17} />}</button></>}<button type="button" onClick={onGallery}><Grid3X3 size={17} /><span>Full gallery</span></button></div></header>
    {children}
  </div>;
}

function Story({ delivery, onGallery }) {
  const reduced = useReducedMotion();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const assets = delivery.assets;
  const frames = delivery.creativeDirection.frames;
  useEffect(() => {
    if (!started || paused || reduced) return undefined;
    const timer = setTimeout(() => index < assets.length - 1 ? setIndex(value => value + 1) : onGallery(), (frames[index]?.duration || 5) * 1000);
    return () => clearTimeout(timer);
  }, [assets.length, frames, index, onGallery, paused, reduced, started]);
  if (!started) return <ViewerShell delivery={delivery} onGallery={onGallery}><button className="vd-story-intro" type="button" onClick={() => setStarted(true)}><PhotoImage asset={assets[0]} frame={frames[0]} eager /><i /><div><span>{delivery.clientName}</span><h1>{delivery.creativeDirection.title}</h1><p>{delivery.creativeDirection.openingLine}</p><b><Play size={18} />Begin Photo Story</b></div></button></ViewerShell>;
  const asset = assets[index]; const frame = frames.find(item => item.assetId === asset.assetId) || frames[index];
  return <ViewerShell delivery={delivery} onGallery={onGallery}><main className="vd-story-stage"><AnimatePresence mode="wait"><motion.div className="vd-story-frame" key={asset.assetId} initial={reduced ? false : { opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .82 }}><PhotoImage asset={asset} frame={frame} eager /><i /><div><small>{frame?.headline}</small><p>{frame?.caption}</p></div></motion.div></AnimatePresence><div className="vd-story-progress">{assets.map((_, itemIndex) => <i key={itemIndex} className={itemIndex <= index ? 'is-active' : ''} />)}</div><footer><button onClick={() => setIndex(value => Math.max(0, value - 1))} disabled={index === 0}><ChevronLeft /></button><button onClick={() => setPaused(value => !value)}>{paused ? <Play /> : <Pause />}</button><button onClick={() => index === assets.length - 1 ? onGallery() : setIndex(value => value + 1)}>{index === assets.length - 1 ? <Grid3X3 /> : <ChevronRight />}</button></footer></main></ViewerShell>;
}

function Editorial({ delivery, onGallery }) {
  const frames = new Map(delivery.creativeDirection.frames.map(frame => [frame.assetId, frame]));
  return <ViewerShell delivery={delivery} onGallery={onGallery}><main className="vd-editorial-main"><header><span>{delivery.shootType}</span><h1>{delivery.creativeDirection.title}</h1><p>{delivery.creativeDirection.openingLine}</p></header>{delivery.creativeDirection.sections.map((section, sectionIndex) => <section key={section.id} className={`vd-editorial-section layout-${section.layout}`}><div className="vd-editorial-section-copy"><span>{String(sectionIndex + 1).padStart(2, '0')}</span><h2>{section.title}</h2><p>{section.subtitle}</p></div><div>{section.assetIds.map((assetId, index) => { const asset = delivery.assets.find(item => item.assetId === assetId); const frame = frames.get(assetId); return asset && <motion.figure key={assetId} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }} transition={{ duration: .7, delay: Math.min(index * .06, .25) }}><div><PhotoImage asset={asset} frame={frame} eager={sectionIndex === 0 && index < 2} /></div>{(frame?.headline || frame?.caption) && <figcaption><strong>{frame.headline}</strong><p>{frame.caption}</p></figcaption>}</motion.figure>; })}</div></section>)}<footer className="vd-editorial-end"><p>{delivery.creativeDirection.closingLine}</p><button onClick={onGallery}>View the full gallery<ArrowRight size={17} /></button></footer></main></ViewerShell>;
}

function Reveal({ delivery, onGallery }) {
  const reduced = useReducedMotion();
  const [begun, setBegun] = useState(false);
  const [index, setIndex] = useState(0);
  const asset = delivery.assets[index];
  const frame = delivery.creativeDirection.frames.find(item => item.assetId === asset?.assetId);
  if (!begun) return <ViewerShell delivery={delivery} onGallery={onGallery}><main className="vd-reveal-door"><div><span>{delivery.clientName}</span><h1>Your photographs<br />are ready.</h1><p>{delivery.creativeDirection.openingLine}</p><button onClick={() => setBegun(true)}>Begin Reveal<ArrowRight size={17} /></button></div></main></ViewerShell>;
  return <ViewerShell delivery={delivery} onGallery={onGallery}><main className="vd-reveal-stage"><div className="vd-reveal-number"><span>{String(index + 1).padStart(2, '0')}</span><small>OF {String(delivery.assets.length).padStart(2, '0')}</small></div><AnimatePresence mode="wait"><motion.figure key={asset.assetId} initial={reduced ? false : { clipPath: 'inset(0 50% 0 50%)', opacity: .35 }} animate={{ clipPath: 'inset(0 0% 0 0%)', opacity: 1 }} exit={{ opacity: 0, scale: .98 }} transition={{ duration: reduced ? 0 : 1, ease: [.22, 1, .36, 1] }}><PhotoImage asset={asset} frame={frame} eager /><figcaption><strong>{frame?.headline}</strong><p>{frame?.caption}</p></figcaption></motion.figure></AnimatePresence><button className="vd-reveal-prev" onClick={() => setIndex(value => Math.max(0, value - 1))} disabled={index === 0}><ChevronLeft /></button><button className="vd-reveal-next" onClick={() => index === delivery.assets.length - 1 ? onGallery() : setIndex(value => value + 1)}>{index === delivery.assets.length - 1 ? <><span>Open gallery</span><Grid3X3 /></> : <><span>Reveal next</span><ChevronRight /></>}</button></main></ViewerShell>;
}

function Canvas({ delivery, onGallery }) {
  const boardRef = useRef(null); const drag = useRef(null);
  const [view, setView] = useState({ x: 20, y: 40, scale: .72 });
  const frames = new Map(delivery.creativeDirection.frames.map(frame => [frame.assetId, frame]));
  function down(event) { drag.current = { x: event.clientX, y: event.clientY, originX: view.x, originY: view.y }; event.currentTarget.setPointerCapture(event.pointerId); }
  function move(event) { if (!drag.current) return; setView(current => ({ ...current, x: drag.current.originX + event.clientX - drag.current.x, y: drag.current.originY + event.clientY - drag.current.y })); }
  function focus(index) { const x = (index * 347) % 1450; const y = (Math.floor(index / 4) * 430) + ((index % 3) * 75); setView(current => ({ ...current, x: Math.max(-1300, 30 - x * current.scale), y: Math.max(-1200, 70 - y * current.scale) })); }
  return <ViewerShell delivery={delivery} onGallery={onGallery}><main className="vd-canvas-main"><div className="vd-canvas-copy"><span>MOVE THROUGH THE SHOOT</span><h1>{delivery.creativeDirection.title}</h1><p>{delivery.creativeDirection.openingLine}</p></div><div className="vd-canvas-window" ref={boardRef} onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><div className="vd-canvas-board" style={{ transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>{delivery.assets.map((asset, index) => { const frame = frames.get(asset.assetId); return <figure key={asset.assetId} style={{ left: `${(index * 347) % 1450}px`, top: `${Math.floor(index / 4) * 430 + ((index % 3) * 75)}px`, width: `${index % 5 === 0 ? 370 : 285}px` }}><PhotoImage asset={asset} frame={frame} eager={index < 5} /><figcaption><span>{String(index + 1).padStart(2, '0')}</span><strong>{frame?.headline}</strong></figcaption></figure>; })}</div><div className="vd-canvas-controls"><button onClick={() => setView(current => ({ ...current, scale: Math.max(.35, current.scale - .1) }))}><ZoomOut /></button><button onClick={() => setView({ x: 20, y: 40, scale: .72 })}><Maximize2 /></button><button onClick={() => setView(current => ({ ...current, scale: Math.min(1.3, current.scale + .1) }))}><ZoomIn /></button></div></div><div className="vd-canvas-rail">{delivery.assets.map((asset, index) => <button key={asset.assetId} onClick={() => focus(index)}><img src={asset.thumbnailUrl || asset.url} alt="" /><span>{index + 1}</span></button>)}</div></main></ViewerShell>;
}

function Chapters({ delivery, onGallery }) {
  const [chapter, setChapter] = useState(null);
  const frames = new Map(delivery.creativeDirection.frames.map(frame => [frame.assetId, frame]));
  if (!chapter) return <ViewerShell delivery={delivery} onGallery={onGallery}><main className="vd-chapters-home"><header><span>{delivery.clientName}</span><h1>{delivery.creativeDirection.title}</h1><p>{delivery.creativeDirection.openingLine}</p></header><div>{delivery.creativeDirection.sections.map((section, index) => { const cover = delivery.assets.find(asset => asset.assetId === section.assetIds[0]); return <button key={section.id} onClick={() => setChapter(section)}><PhotoImage asset={cover} frame={frames.get(cover?.assetId)} eager={index < 3} /><i /><span>{String(index + 1).padStart(2, '0')}</span><div><small>OPEN CHAPTER</small><strong>{section.title}</strong><p>{section.subtitle}</p></div></button>; })}</div></main></ViewerShell>;
  return <ViewerShell delivery={delivery} onGallery={onGallery}><main className="vd-chapter-open"><button onClick={() => setChapter(null)}><ArrowLeft />All chapters</button><header><span>CHAPTER</span><h1>{chapter.title}</h1><p>{chapter.subtitle}</p></header><div>{chapter.assetIds.map((id, index) => { const asset = delivery.assets.find(item => item.assetId === id); const frame = frames.get(id); return <motion.figure key={id} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }}><PhotoImage asset={asset} frame={frame} eager={index < 2} /><figcaption><strong>{frame?.headline}</strong><p>{frame?.caption}</p></figcaption></motion.figure>; })}</div><footer><button onClick={() => setChapter(null)}>Choose another chapter</button><button onClick={onGallery}>Open full gallery</button></footer></main></ViewerShell>;
}

function Album({ delivery, onGallery }) {
  const reduced = useReducedMotion(); const [page, setPage] = useState(0);
  const spreads = useMemo(() => { const result = []; for (let i = 0; i < delivery.assets.length; i += 2) result.push(delivery.assets.slice(i, i + 2)); return result; }, [delivery.assets]);
  const frames = new Map(delivery.creativeDirection.frames.map(frame => [frame.assetId, frame]));
  const spread = spreads[page];
  return <ViewerShell delivery={delivery} onGallery={onGallery}><main className="vd-album-main"><header><span>{delivery.clientName}</span><h1>{delivery.creativeDirection.title}</h1><p>{page === 0 ? delivery.creativeDirection.openingLine : `Spread ${page + 1} of ${spreads.length}`}</p></header><div className="vd-album-table"><AnimatePresence mode="wait"><motion.div className="vd-album-spread" key={page} initial={reduced ? false : { rotateY: page ? -12 : 12, opacity: 0, scale: .98 }} animate={{ rotateY: 0, opacity: 1, scale: 1 }} exit={{ rotateY: 10, opacity: 0 }} transition={{ duration: reduced ? 0 : .7, ease: [.22, 1, .36, 1] }}>{spread.map((asset, index) => { const frame = frames.get(asset.assetId); return <figure key={asset.assetId}><PhotoImage asset={asset} frame={frame} eager /><figcaption><span>{String(page * 2 + index + 1).padStart(2, '0')}</span><strong>{frame?.headline}</strong><p>{frame?.caption}</p></figcaption></figure>; })}{spread.length === 1 && <div className="vd-album-note"><p>{delivery.creativeDirection.closingLine}</p></div>}</motion.div></AnimatePresence></div><footer><button onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page === 0}><ChevronLeft />Previous spread</button><span>{page + 1} / {spreads.length}</span><button onClick={() => page === spreads.length - 1 ? onGallery() : setPage(value => value + 1)}>{page === spreads.length - 1 ? 'Full gallery' : 'Next spread'}<ChevronRight /></button></footer></main></ViewerShell>;
}

function Gallery({ delivery, onClose }) {
  const [liked, setLiked] = useState(new Set()); const [busy, setBusy] = useState('');
  async function like(assetId) { try { const response = await api.post(`/v1/deliveries/public/${delivery.publicId}/photos/${assetId}/like`, {}, { headers: accessHeaders(delivery.publicId) }); setLiked(current => { const next = new Set(current); response.data.data.liked ? next.add(assetId) : next.delete(assetId); return next; }); } catch (error) { toast.error(apiMessage(error, 'We could not update that photograph.')); } }
  async function download(assetId) { setBusy(assetId); try { const response = await api.get(`/v1/deliveries/public/${delivery.publicId}/photos/${assetId}/download`, { headers: accessHeaders(delivery.publicId) }); window.location.assign(response.data.data.url); } catch (error) { toast.error(apiMessage(error, 'We could not prepare that download.')); } finally { setBusy(''); } }
  async function downloadAll() { setBusy('all'); try { const response = await api.get(`/v1/deliveries/public/${delivery.publicId}/download-all`, { headers: accessHeaders(delivery.publicId) }); window.location.assign(response.data.data.url); } catch (error) { toast.error(apiMessage(error, 'We could not prepare the full gallery.')); } finally { setBusy(''); } }
  return <motion.div className="vd-gallery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><header><div><small>THE COMPLETE GALLERY</small><h1>{delivery.title}</h1><p>{delivery.assets.length} finished photographs</p></div><div>{delivery.access?.allowDownloadAll && <button onClick={downloadAll} disabled={Boolean(busy)}><Download size={16} />{busy === 'all' ? 'Preparing…' : 'Download all'}</button>}<button onClick={onClose} aria-label="Close gallery"><X /></button></div></header><main>{delivery.assets.map((asset, index) => <figure key={asset.assetId}><img src={asset.url} alt="" loading="lazy" decoding="async" /><figcaption><span>{String(index + 1).padStart(2, '0')}</span><div>{delivery.access?.allowLikes && <button onClick={() => like(asset.assetId)} className={liked.has(asset.assetId) ? 'is-liked' : ''}><Heart size={17} fill={liked.has(asset.assetId) ? 'currentColor' : 'none'} /></button>}{delivery.access?.allowIndividualDownloads && <button onClick={() => download(asset.assetId)} disabled={busy === asset.assetId}><Download size={17} /></button>}</div></figcaption></figure>)}</main></motion.div>;
}

export default function DeliveryViewer() {
  const { publicId } = useParams(); const [delivery, setDelivery] = useState(null); const [locked, setLocked] = useState(false); const [lockedBrand, setLockedBrand] = useState(null); const [pin, setPin] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [gallery, setGallery] = useState(false);
  async function load() { setLoading(true); setError(''); try { const response = await api.get(`/v1/deliveries/public/${publicId}`, { headers: accessHeaders(publicId) }); if (response.data.data.locked) { setLocked(true); setLockedBrand(response.data.data.branding); setDelivery(null); } else { setDelivery(response.data.data); setLocked(false); document.title = `${response.data.data.title} · Veylo`; } } catch (requestError) { setError(apiMessage(requestError, 'This delivery is not available.')); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [publicId]);
  async function unlock(event) { event.preventDefault(); setLoading(true); setError(''); try { const response = await api.post(`/v1/deliveries/public/${publicId}/unlock`, { pin }); sessionStorage.setItem(`veylo_delivery_${publicId}`, response.data.data.accessToken); await load(); } catch (requestError) { setError(apiMessage(requestError, 'That PIN is not correct.')); setLoading(false); } }
  if (loading) return <div className="vd-state"><LoaderCircle className="v-spin" /><span>Opening your photographs…</span></div>;
  if (locked) return <div className="vd-gate"><img src={lockedBrand?.logoUrl || '/veylo/veylo-mark.svg'} alt="" /><p>{lockedBrand?.name ? `${lockedBrand.name.toUpperCase()} · PRIVATE DELIVERY` : 'PRIVATE CLIENT DELIVERY'}</p><h1>Enter the six-digit PIN.</h1><span>The photographer protected this delivery. Use the PIN sent with your link.</span><form onSubmit={unlock}><input value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus /><button disabled={pin.length !== 6}>Open delivery<ArrowRight size={17} /></button></form>{error && <small role="alert">{error}</small>}</div>;
  if (error || !delivery) return <div className="vd-state"><Image /><strong>This delivery is not available.</strong><span>{error}</span></div>;
  const props = { delivery, onGallery: () => setGallery(true) };
  const experience = delivery.format === 'editorial' ? <Editorial {...props} /> : delivery.format === 'photo-reveal' ? <Reveal {...props} /> : delivery.format === 'canvas' ? <Canvas {...props} /> : delivery.format === 'chapters' ? <Chapters {...props} /> : delivery.format === 'album' ? <Album {...props} /> : <Story {...props} />;
  return <>{experience}<AnimatePresence>{gallery && <Gallery delivery={delivery} onClose={() => setGallery(false)} />}</AnimatePresence></>;
}
