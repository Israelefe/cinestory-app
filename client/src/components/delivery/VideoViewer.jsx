import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Download, Film, ArrowUpRight, ArrowLeft, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { videoBytes, videoDuration, videoMediaUrl } from '../../services/videoDelivery.js';
import VideoPlayback from '../video/VideoPlayback.jsx';
import { DesktopPhoneFrame, useDesktopPhoneMode } from './DesktopPhoneFrame.jsx';
import './VideoViewer.css';

const videoRatio = item => Number.isFinite(item?.width) && Number.isFinite(item?.height) && item.width > 0 && item.height > 0 ? item.width / item.height : 16 / 9;
const isPortrait = item => videoRatio(item) < 1;
const isSquare = item => Math.abs(videoRatio(item) - 1) < .01;
function Photographer({ branding }) {
  const image = branding.avatarUrl || branding.logoUrl;
  return <div className="vv-photographer"><span className="vv-avatar">{image ? <img src={image} alt="" /> : <Film size={21} />}</span><span><small>BY YOUR PHOTOGRAPHER</small><strong>{branding.name || 'Your photographer'}</strong></span></div>;
}
function OriginalDownload({ item, downloadUrl, compact = false }) {
  return item.allowDownload && downloadUrl ? <a className={'vv-download' + (compact ? ' is-compact' : '')} href={downloadUrl(item)} download aria-label={`Download ${item.title}`}><Download size={19} /><span>Download{!compact && <small>Original / {videoBytes(item.bytes)}</small>}</span></a> : null;
}
export default function VideoViewer({ delivery, requestPlayback, endPlayback, downloadUrl, demo = false }) {
  const reduced = useVeyloReducedMotion(); const desktop = useDesktopPhoneMode(); const [muted, setMuted] = useState(true);
  const orderedItems = useMemo(() => {
    const opening = delivery.items.find(video => video.id === delivery.featuredAssetId);
    return opening ? [opening, ...delivery.items.filter(video => video.id !== opening.id)] : delivery.items;
  }, [delivery.items, delivery.featuredAssetId]);
  const initial = orderedItems[0];
  const [selected, setSelected] = useState(initial?.id || '');
  const [endedId, setEndedId] = useState('');
  const item = delivery.items.find(video => video.id === selected) || initial;
  const vertical = item && isPortrait(item);
  const portraitItems = orderedItems.filter(isPortrait); const wideItems = orderedItems.filter(video => !isPortrait(video));
  const branding = delivery.branding || {}; const feed = useRef(null); const activeId = useRef(selected);
  activeId.current = item?.id;
  const select = useCallback(id => setSelected(id), []);
  useLayoutEffect(() => {
    if (!vertical || !feed.current) return;
    const root = feed.current;
    let observing = true;
    const target = Array.from(root.children).find(node => node.dataset.videoId === activeId.current);
    if (target) root.scrollTop += target.getBoundingClientRect().top - root.getBoundingClientRect().top;
    const observer = new IntersectionObserver(entries => {
      if (!observing) return;
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= .65 && entry.target.dataset.videoId !== activeId.current) select(entry.target.dataset.videoId);
        if (entry.target.dataset.videoId === activeId.current && entry.intersectionRatio < .2) entry.target.querySelector('video')?.pause();
      }
    }, { root, threshold: [0, .2, .65, 1] });
    root.querySelectorAll('[data-video-id]').forEach(node => observer.observe(node));
    return () => { observing = false; observer.disconnect(); };
  }, [vertical, desktop, select, orderedItems]);
  const player = item && <VideoPlayback key={item.id} item={item} portrait={vertical} original={!item.autoPlayback && delivery.playbackMode !== 'adaptive'} autoPlay muted={muted} onMutedChange={setMuted} onEnded={() => setEndedId(item.id)} onPlaybackStart={() => setEndedId('')} requestPlayback={requestPlayback} endPlayback={endPlayback} />;
  if (!item) return <div className="vv-state"><Film /><h1>No videos are ready yet.</h1><p>Finish preparing a video before opening this preview.</p></div>;
  if (vertical) { const portraitView = <main className="vv-page vv-vertical-page">
    <div className="vv-feed" ref={feed} role="region" aria-label="Vertical videos" tabIndex={0} onKeyDown={event => {
      if (event.target !== event.currentTarget || !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const index = portraitItems.findIndex(video => video.id === item.id);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? portraitItems.length - 1 : Math.max(0, Math.min(portraitItems.length - 1, index + (['ArrowDown', 'PageDown'].includes(event.key) ? 1 : -1)));
      feed.current.scrollTo({ top: feed.current.scrollTop + feed.current.children[next].getBoundingClientRect().top - feed.current.getBoundingClientRect().top, behavior: 'smooth' });
    }}>
      {portraitItems.map((video, index) => <article className={'vv-reel' + (item.id === video.id ? ' is-active' : '')} data-video-id={video.id} key={video.id} aria-label={video.title}>
        <div className="vv-screen is-portrait">{item.id === video.id ? player : video.posterUrl && <img className="vv-reel-poster" src={videoMediaUrl(video.posterUrl)} alt="" loading="lazy" />}</div>
        <header className="vv-brand vv-reel-brand"><Photographer branding={branding} /><span className="vv-reel-count">{index + 1} / {portraitItems.length}</span></header>
        {wideItems.length > 0 && <button type="button" className="vv-all-films" onClick={() => select(wideItems[0].id)}><ArrowLeft size={15} />All films</button>}
        <div className="vv-reel-caption"><p>{delivery.title}{demo ? ' / DEMO' : ''}</p><h1>{video.title}</h1>{(video.description || delivery.introduction) && <details className="vv-reel-description"><summary>About this film<ChevronDown size={14} /></summary><div>{video.description}{delivery.introduction && <p className="vv-reel-message">{delivery.introduction}</p>}</div></details>}
          {item.id === video.id && <div className="vv-discovery">
            {endedId === video.id && index < portraitItems.length - 1 && <motion.button type="button" className="vv-next-reel" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} onClick={() => { setEndedId(''); feed.current?.scrollTo({ top: feed.current.scrollTop + feed.current.children[index + 1].getBoundingClientRect().top - feed.current.getBoundingClientRect().top, behavior: 'smooth' }); }}><motion.span animate={{ y: [3, -3, 3] }} transition={{ duration: .9, repeat: 2 }}><ChevronUp size={20} /></motion.span><span>Swipe up for the next video<small>{portraitItems[index + 1].title}</small></span></motion.button>}
            {wideItems.length > 0 && <button type="button" className="vv-other-films" onClick={() => select(wideItems[0].id)}><Film size={17} /><span>Other films<small>{wideItems.length} {wideItems.length === 1 ? 'film' : 'films'} in other formats</small></span><ArrowRight size={17} /></button>}
          </div>}
        </div>
        <div className="vv-reel-actions"><OriginalDownload item={video} downloadUrl={demo ? undefined : downloadUrl} compact />{/^https?:\/\//.test(branding.website || '') && <a href={branding.website} target="_blank" rel="noreferrer" aria-label="Visit the photographer's website"><ArrowUpRight size={21} /><span>Studio</span></a>}</div>
      </article>)}
    </div>
  </main>;
    return desktop ? <div className="vv-desktop-device"><DesktopPhoneFrame title="Video delivery">{portraitView}</DesktopPhoneFrame></div> : portraitView;
  }
  return <main className="vv-page vv-wide-page">
    <header className="vv-brand"><Photographer branding={branding} />{demo && <span className="vv-demo-label">CLIENT DEMO</span>}</header>
    <motion.section className="vv-heading" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }}><p>{delivery.items.length === 1 ? 'YOUR FILM' : `${delivery.items.length} FILMS`}</p><h1>{delivery.title}</h1>{delivery.introduction && <div className="vv-introduction">{delivery.introduction}</div>}</motion.section>
    <div className={'vv-layout' + (delivery.items.length === 1 ? ' is-single' : '')} style={{ '--vv-aspect-ratio': videoRatio(item) }}>
      <section className="vv-film" aria-label={item.title}>
        <div className="vv-screen">{player}</div>
        <div className="vv-film-caption"><div><p>{videoDuration(item.duration)} / {item.autoPlayback || delivery.playbackMode === 'adaptive' ? 'Auto quality' : 'Original quality'}</p><h2>{item.title}</h2></div><OriginalDownload item={item} downloadUrl={demo ? undefined : downloadUrl} /></div>
        {item.description && <div className="vv-description">{item.description}</div>}
      </section>
      {delivery.items.length > 1 && <aside className="vv-playlist" aria-label="Films in this delivery"><div className="vv-playlist-title"><span>IN THIS DELIVERY</span><small>{delivery.items.length} films</small></div>{orderedItems.map((video, index) => <button type="button" key={video.id} aria-pressed={video.id === item.id} className={'vv-playlist-item' + (video.id === item.id ? ' is-current' : '')} onClick={() => select(video.id)}><span className="vv-playlist-image">{video.posterUrl ? <img src={videoMediaUrl(video.posterUrl)} alt="" loading="lazy" /> : <Film size={24} />}<i>{videoDuration(video.duration)}</i></span><span className="vv-playlist-copy"><strong>{video.title}</strong><small>{isPortrait(video) ? 'Vertical video' : isSquare(video) ? 'Square video' : `Film ${String(index + 1).padStart(2, '0')}`}{video.id === item.id ? ' / Selected' : ''}</small></span><Play size={15} /></button>)}</aside>}
    </div>
    <footer className="vv-footer"><span>Delivered by <strong>{branding.name || 'Your photographer'}</strong></span>{/^https?:\/\//.test(branding.website || '') && <a href={branding.website} target="_blank" rel="noreferrer">Visit the studio<ArrowUpRight size={14} /></a>}</footer>
  </main>;
}
