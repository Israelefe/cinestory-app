import React, { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Camera, Check, Download, Film, Info, ListVideo, Play, X } from 'lucide-react';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { videoBytes, videoDuration, videoMediaUrl } from '../../services/videoDelivery.js';
import { useDialogFocus } from '../useDialogFocus.js';
import VideoPlayback from '../video/VideoPlayback.jsx';
import { DesktopPhoneFrame, useDesktopPhoneMode } from './DesktopPhoneFrame.jsx';
import './VideoViewer.css';

const videoRatio = item => Number.isFinite(item?.width) && Number.isFinite(item?.height) && item.width > 0 && item.height > 0 ? item.width / item.height : 16 / 9;
const filmShape = item => videoRatio(item) < 1 ? 'Portrait' : Math.abs(videoRatio(item) - 1) < .01 ? 'Square' : 'Landscape';

function Photographer({ branding }) {
  const image = branding.avatarUrl || branding.logoUrl;
  return <div className="vv-photographer">
    <span className="vv-avatar">{image ? <img src={image} alt="" /> : <Camera size={20} />}</span>
    <span><small>A FILM DELIVERY BY</small><strong>{branding.name || 'Your photographer'}</strong></span>
  </div>;
}

function FilmList({ films, selected, onSelect }) {
  return <div className="vv-film-list">{films.map((film, index) => <button
    type="button" className={'vv-playlist-item' + (film.id === selected ? ' is-current' : '')}
    key={film.id} onClick={() => onSelect(film.id)} aria-pressed={film.id === selected}
  >
    <span className="vv-playlist-image">{film.posterUrl ? <img src={videoMediaUrl(film.posterUrl)} alt="" loading="lazy" /> : <Film size={23} />}</span>
    <span className="vv-playlist-copy"><small>{String(index + 1).padStart(2, '0')} / {filmShape(film)} · {videoDuration(film.duration)}</small><strong>{film.title}</strong></span>
    {film.id === selected ? <Check size={17} aria-label="Selected film" /> : <Play size={15} aria-hidden="true" />}
  </button>)}</div>;
}

function DeliveryPanel({ mode, titleId, films, item, delivery, demo, downloadUrl, onSelect, onClose }) {
  const dialog = useRef(null);
  const present = useIsPresent();
  useDialogFocus(present, dialog, onClose);
  const studioUrl = /^https?:\/\//.test(delivery.branding?.website || '') ? delivery.branding.website : null;
  return <motion.div className="vv-panel-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    style={{ pointerEvents: present ? 'auto' : 'none' }} aria-hidden={!present || undefined} {...(!present ? { inert: '' } : {})}
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section ref={dialog} className="vv-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      initial={{ y: 24 }} animate={{ y: 0 }} exit={{ y: 24 }} transition={{ type: 'spring', damping: 25, stiffness: 280 }}>
      <header><div><span>{mode === 'films' ? films.length + ' FILMS' : 'FILM DETAILS'}</span><h2 id={titleId}>{mode === 'films' ? 'Choose a film' : item.title}</h2></div>
        <button type="button" className="vv-icon-button" aria-label={mode === 'films' ? 'Close film list' : 'Close film details'} onClick={onClose}><X size={20} /></button>
      </header>
      <div className="vv-panel-body">
        {mode === 'films' ? <FilmList films={films} selected={item.id} onSelect={onSelect} /> : <>
          <div className="vv-film-facts"><span>{filmShape(item)}</span><span>{videoDuration(item.duration)}</span>{item.bytes > 0 && <span>{videoBytes(item.bytes)}</span>}</div>
          {item.description && <section className="vv-details-copy"><h3>About this film</h3><p>{item.description}</p></section>}
          {delivery.introduction && <section className="vv-details-copy"><h3>{delivery.title || 'Your delivery'}</h3><p>{delivery.introduction}</p></section>}
          {!item.description && !delivery.introduction && <p className="vv-details-empty">Your finished film, delivered by {delivery.branding?.name || 'your photographer'}.</p>}
          {!demo && item.allowDownload && downloadUrl && <a className="vv-download" href={downloadUrl(item)} download aria-label={'Download ' + item.title}>
            <Download size={19} /><span>Download original<small>{videoBytes(item.bytes)} · Uploaded file</small></span><ArrowRight size={18} />
          </a>}
          {studioUrl && <a className="vv-studio-link" href={studioUrl} target="_blank" rel="noreferrer">Visit {delivery.branding.name || 'your photographer'}<ArrowUpRight size={16} /></a>}
          {demo && <p className="vv-sample-note">Sample footage. Downloads are available on client deliveries when the photographer allows them.</p>}
        </>}
      </div>
    </motion.section>
  </motion.div>;
}

export default function VideoViewer({ delivery, requestPlayback, endPlayback, downloadUrl, demo = false }) {
  const reduced = useVeyloReducedMotion();
  const desktop = useDesktopPhoneMode();
  const titleId = useId();
  const [muted, setMuted] = useState(true);
  const [panel, setPanel] = useState(null);
  const [endedId, setEndedId] = useState('');
  const orderedItems = useMemo(() => {
    const films = delivery.items || [];
    const opening = films.find(film => film.id === delivery.featuredAssetId);
    return opening ? [opening, ...films.filter(film => film.id !== opening.id)] : films;
  }, [delivery.items, delivery.featuredAssetId]);
  const [selected, setSelected] = useState(() => orderedItems[0]?.id || '');
  const item = orderedItems.find(film => film.id === selected) || orderedItems[0];
  // Mixed deliveries keep their opening presentation when the client changes films.
  const portraitPresentation = videoRatio(orderedItems[0]) < 1;
  const phone = desktop && portraitPresentation;
  const feed = useRef(null);
  const activeId = useRef(item?.id);
  activeId.current = item?.id;

  const closePanel = useCallback(() => setPanel(null), []);
  const select = useCallback(id => {
    const root = feed.current;
    const target = Array.from(root?.children || []).find(node => node.dataset.videoId === id);
    if (!target) return;
    setEndedId('');
    setSelected(id);
    setPanel(null);
    root.scrollTo({ top: target.offsetTop, behavior: 'instant' });
  }, []);

  useLayoutEffect(() => {
    const root = feed.current;
    if (!root) return undefined;
    const align = () => {
      for (const article of root.children) {
        const caption = article.querySelector('.vv-film-caption');
        article.style.setProperty('--vv-stage-height', Math.max(1, root.clientHeight - (caption?.clientHeight || 0)) + 'px');
        article.style.setProperty('--vv-stage-width', root.clientWidth + 'px');
      }
      const target = Array.from(root.children).find(node => node.dataset.videoId === activeId.current);
      if (target) root.scrollTop = target.offsetTop;
    };
    align();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= .65 && entry.target.dataset.videoId !== activeId.current) {
          setSelected(entry.target.dataset.videoId);
          setEndedId('');
        }
      }
    }, { root, threshold: [.2, .65, 1] });
    root.querySelectorAll('[data-video-id]').forEach(node => observer.observe(node));
    const resize = new ResizeObserver(align);
    resize.observe(root);
    return () => { observer.disconnect(); resize.disconnect(); };
  }, [phone, orderedItems]);

  if (!item) return <div className="vv-state"><Film size={28} /><h1>No videos are ready yet.</h1><p>Finish preparing a video before opening this preview.</p></div>;

  const content = <main className={'vv-page ' + (portraitPresentation ? 'vv-vertical-page' : 'vv-wide-page') + (orderedItems.length === 1 ? ' is-single' : '')}>
    <motion.header className="vv-brand" {...(panel ? { inert: '', 'aria-hidden': true } : {})} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
      <Photographer branding={delivery.branding || {}} />
      {orderedItems.length > 1 ? <button type="button" className="vv-choose-films" onClick={() => setPanel('films')} aria-label="Choose a film" aria-haspopup="dialog">
        <ListVideo size={18} /><span>Films</span><small>{orderedItems.length}</small>
      </button> : demo && <span className="vv-demo-label">Sample</span>}
    </motion.header>

    <div className="vv-workspace vv-layout" {...(panel ? { inert: '', 'aria-hidden': true } : {})}>
      <section className="vv-viewer" aria-label="Film player">
        <div className="vv-feed" ref={feed} role="region" aria-label="Delivery films" tabIndex={0} onKeyDown={event => {
          if (event.target !== event.currentTarget || !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const index = orderedItems.findIndex(film => film.id === activeId.current);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? orderedItems.length - 1 : Math.max(0, Math.min(orderedItems.length - 1, index + (['ArrowDown', 'PageDown'].includes(event.key) ? 1 : -1)));
          select(orderedItems[next].id);
        }}>
          {orderedItems.map((film, index) => {
            const active = item.id === film.id;
            const next = orderedItems[index + 1];
            return <article className={'vv-reel vv-film' + (active ? ' is-active' : '')} data-video-id={film.id} key={film.id}
              aria-label={film.title} aria-hidden={!active || undefined} {...(!active ? { inert: '' } : {})} style={{ '--vv-aspect-ratio': videoRatio(film) }}>
              <div className={'vv-screen' + (videoRatio(film) < 1 ? ' is-portrait' : '')}>
                {active ? <VideoPlayback key={film.id} item={film} portrait={videoRatio(film) < 1} original={!film.autoPlayback && delivery.playbackMode !== 'adaptive'}
                  autoPlay muted={muted} onMutedChange={setMuted} pausedForPanel={Boolean(panel)} onEnded={() => setEndedId(film.id)} onPlaybackStart={() => setEndedId('')}
                  requestPlayback={requestPlayback} endPlayback={endPlayback} />
                  : film.posterUrl && <img className="vv-reel-poster" src={videoMediaUrl(film.posterUrl)} alt="" loading="lazy" />}
                {active && endedId === film.id && next && <div className="vv-next-film-overlay"><motion.button type="button" className="vv-next-reel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => select(next.id)} aria-label={'Play next film: ' + next.title}><span>Next film<small>{next.title}</small></span><ArrowRight size={18} /></motion.button></div>}
              </div>
              <footer className="vv-film-caption vv-reel-caption">
                <div className="vv-film-title"><span aria-label={'Film ' + (index + 1) + ' of ' + orderedItems.length}>{String(index + 1).padStart(2, '0')} / {String(orderedItems.length).padStart(2, '0')}</span><h1>{film.title}</h1></div>
                <div className="vv-film-actions">
                  {!demo && film.allowDownload && downloadUrl && <a className="vv-caption-download" href={downloadUrl(film)} download aria-label={'Download ' + film.title}><Download size={17} /><span>Download original</span></a>}
                  <button type="button" className="vv-details-button" onClick={() => setPanel('details')} aria-label="Open film details" aria-haspopup="dialog"><Info size={17} /><span>Details</span></button>
                </div>
              </footer>
            </article>;
          })}
        </div>
      </section>

      {orderedItems.length > 1 && <aside className="vv-playlist" aria-label="Films in this delivery">
        <header><div><span>YOUR FILMS</span><h2>{delivery.title || 'The complete delivery'}</h2></div><small>{orderedItems.length}</small></header>
        <FilmList films={orderedItems} selected={item.id} onSelect={select} />
        {demo && <p className="vv-sample-note">Sample delivery</p>}
      </aside>}
    </div>

    <AnimatePresence>{panel && <DeliveryPanel key={panel} mode={panel} titleId={titleId} films={orderedItems} item={item} delivery={delivery} demo={demo}
      downloadUrl={downloadUrl} onSelect={select} onClose={closePanel} />}</AnimatePresence>
  </main>;

  return phone ? <div className="vv-desktop-device"><DesktopPhoneFrame title="Video delivery">{content}</DesktopPhoneFrame></div> : content;
}
