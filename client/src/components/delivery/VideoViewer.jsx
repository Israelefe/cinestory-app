import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Download, Film, ArrowUpRight, ArrowLeft, ChevronDown } from 'lucide-react';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { videoBytes, videoDuration, videoMediaUrl } from '../../services/videoDelivery.js';
import VideoPlayback from '../video/VideoPlayback.jsx';
import './VideoViewer.css';

const isPortrait = item => item.height > item.width;
function Photographer({ branding }) {
  const image = branding.avatarUrl || branding.logoUrl;
  return <div className="vv-photographer"><span className="vv-avatar">{image ? <img src={image} alt="" /> : <Film size={21} />}</span><span><small>BY YOUR PHOTOGRAPHER</small><strong>{branding.name || 'Your photographer'}</strong></span></div>;
}
function OriginalDownload({ item, downloadUrl, compact = false }) {
  return item.allowDownload && downloadUrl ? <a className={'vv-download' + (compact ? ' is-compact' : '')} href={downloadUrl(item)} download aria-label={`Download ${item.title}`}><Download size={19} /><span>Download{!compact && <small>Original / {videoBytes(item.bytes)}</small>}</span></a> : null;
}
export default function VideoViewer({ delivery, requestPlayback, endPlayback, downloadUrl, demo = false }) {
  const reduced = useVeyloReducedMotion();
  const initial = delivery.items.find(item => item.id === delivery.featuredAssetId) || delivery.items[0];
  const [selected, setSelected] = useState(initial?.id || ''); const [autoPlay, setAutoPlay] = useState(false);
  const item = delivery.items.find(video => video.id === selected) || initial;
  const vertical = item && isPortrait(item);
  const portraitItems = delivery.items.filter(isPortrait); const wideItems = delivery.items.filter(video => !isPortrait(video));
  const branding = delivery.branding || {}; const feed = useRef(null); const interacted = useRef(false); const activeId = useRef(selected);
  activeId.current = item?.id;
  const started = useCallback(() => { interacted.current = true; }, []);
  const select = useCallback((id, autoplay = false) => { setAutoPlay(autoplay); setSelected(id); }, []);
  useEffect(() => {
    if (!vertical || !feed.current) return;
    const root = feed.current;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= .65 && entry.target.dataset.videoId !== activeId.current) select(entry.target.dataset.videoId, interacted.current);
        if (entry.target.dataset.videoId === activeId.current && entry.intersectionRatio < .2) entry.target.querySelector('video')?.pause();
      }
    }, { root, threshold: [0, .2, .65, 1] });
    root.querySelectorAll('[data-video-id]').forEach(node => observer.observe(node));
    const target = Array.from(root.children).find(node => node.dataset.videoId === activeId.current);
    if (target) root.scrollTop = target.offsetTop;
    return () => observer.disconnect();
  }, [vertical, select, delivery.items]);
  const player = item && <VideoPlayback key={item.id} item={item} portrait={vertical} autoPlay={autoPlay} onStarted={started} requestPlayback={requestPlayback} endPlayback={endPlayback} />;
  if (!item) return <div className="vv-state"><Film /><h1>No videos are ready yet.</h1><p>Finish preparing a video before opening this preview.</p></div>;
  if (vertical) return <main className="vv-page vv-vertical-page">
    <div className="vv-feed" ref={feed} role="region" aria-label="Vertical videos" tabIndex={0} onKeyDown={event => {
      if (event.target !== event.currentTarget || !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const index = portraitItems.findIndex(video => video.id === item.id);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? portraitItems.length - 1 : Math.max(0, Math.min(portraitItems.length - 1, index + (['ArrowDown', 'PageDown'].includes(event.key) ? 1 : -1)));
      feed.current.scrollTo({ top: feed.current.children[next].offsetTop, behavior: 'smooth' });
    }}>
      {portraitItems.map((video, index) => <article className={'vv-reel' + (item.id === video.id ? ' is-active' : '')} data-video-id={video.id} key={video.id} aria-label={video.title}>
        <div className="vv-screen is-portrait">{item.id === video.id ? player : video.posterUrl && <img className="vv-reel-poster" src={videoMediaUrl(video.posterUrl)} alt="" loading="lazy" />}</div>
        <header className="vv-brand vv-reel-brand"><Photographer branding={branding} /><span className="vv-reel-count">{index + 1} / {portraitItems.length}</span></header>
        {wideItems.length > 0 && <button type="button" className="vv-all-films" onClick={() => select(wideItems[0].id)}><ArrowLeft size={15} />All films</button>}
        <div className="vv-reel-caption"><p>{delivery.title}{demo ? ' / DEMO' : ''}</p><h1>{video.title}</h1>{(video.description || delivery.introduction) && <details className="vv-reel-description"><summary>About this film<ChevronDown size={14} /></summary><div>{video.description}{delivery.introduction && <p className="vv-reel-message">{delivery.introduction}</p>}</div></details>}</div>
        <div className="vv-reel-actions"><OriginalDownload item={video} downloadUrl={downloadUrl} compact />{/^https?:\/\//.test(branding.website || '') && <a href={branding.website} target="_blank" rel="noreferrer" aria-label="Visit the photographer's website"><ArrowUpRight size={21} /><span>Studio</span></a>}</div>
        <a className="vv-reel-credit" href="/product">Delivered with Veylo</a>
      </article>)}
    </div>
  </main>;
  return <main className="vv-page vv-wide-page">
    <header className="vv-brand"><Photographer branding={branding} />{demo && <span className="vv-demo-label">CLIENT DEMO</span>}</header>
    <motion.section className="vv-heading" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }}><p>{delivery.items.length === 1 ? 'YOUR FILM' : `${delivery.items.length} FILMS`}</p><h1>{delivery.title}</h1>{delivery.introduction && <div className="vv-introduction">{delivery.introduction}</div>}</motion.section>
    <div className={'vv-layout' + (delivery.items.length === 1 ? ' is-single' : '')}>
      <section className="vv-film" aria-label={item.title}>
        <div className="vv-screen">{player}</div>
        <div className="vv-film-caption"><div><p>{videoDuration(item.duration)} / Original audio</p><h2>{item.title}</h2></div><OriginalDownload item={item} downloadUrl={downloadUrl} /></div>
        {item.description && <div className="vv-description">{item.description}</div>}
      </section>
      {delivery.items.length > 1 && <aside className="vv-playlist" aria-label="Films in this delivery"><div className="vv-playlist-title"><span>IN THIS DELIVERY</span><small>{delivery.items.length} films</small></div>{delivery.items.map((video, index) => <button type="button" key={video.id} aria-pressed={video.id === item.id} className={'vv-playlist-item' + (video.id === item.id ? ' is-current' : '')} onClick={() => select(video.id)}><span className="vv-playlist-image">{video.posterUrl ? <img src={videoMediaUrl(video.posterUrl)} alt="" loading="lazy" /> : <Film size={24} />}<i>{videoDuration(video.duration)}</i></span><span className="vv-playlist-copy"><strong>{video.title}</strong><small>{isPortrait(video) ? 'Vertical video' : `Film ${String(index + 1).padStart(2, '0')}`}{video.id === item.id ? ' / Selected' : ''}</small></span><Play size={15} /></button>)}</aside>}
    </div>
    <footer className="vv-footer"><span>Delivered by <strong>{branding.name || 'Your photographer'}</strong></span>{/^https?:\/\//.test(branding.website || '') && <a href={branding.website} target="_blank" rel="noreferrer">Visit the studio<ArrowUpRight size={14} /></a>}<a href="/product">Delivered with Veylo</a></footer>
  </main>;
}
