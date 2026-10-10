import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Download, Film, RefreshCw, ArrowUpRight, Volume2 } from 'lucide-react';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { videoBytes, videoDuration, videoMediaUrl } from '../../services/videoDelivery.js';
import './VideoViewer.css';

export default function VideoViewer({ delivery, requestPlayback, endPlayback, downloadUrl, demo = false }) {
  const reduced = useVeyloReducedMotion();
  const initial = delivery.items.find(item => item.id === delivery.featuredAssetId) || delivery.items[0];
  const [selected, setSelected] = useState(initial?.id || '');
  const item = delivery.items.find(video => video.id === selected) || delivery.items[0];
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [started, setStarted] = useState(false);
  const element = useRef(null); const hls = useRef(null); const session = useRef(null); const request = useRef(null); const generation = useRef(0); const renewing = useRef(false); const sourceId = useRef('');
  const installSource = useCallback(async (url, { resumeAt = 0, play = false, generationId } = {}) => {
    const video = element.current; if (!video || generationId !== generation.current) return;
    hls.current?.destroy(); hls.current = null;
    const restore = () => { if (generationId !== generation.current) return; if (resumeAt) video.currentTime = Math.min(resumeAt, video.duration || resumeAt); if (play) video.play().catch(() => { setLoading(false); setError('Tap the play control on the film to start.'); }); };
    video.addEventListener('loadedmetadata', restore, { once: true });
    if (video.canPlayType('application/vnd.apple.mpegurl') || !url.includes('.m3u8')) { video.src = url; video.load(); }
    else {
      const { default: Hls } = await import('hls.js');
      if (generationId !== generation.current) { video.removeEventListener('loadedmetadata', restore); return; }
      if (!Hls.isSupported()) { video.removeEventListener('loadedmetadata', restore); throw new Error('This browser cannot play this film. Try a current Safari, Chrome or Firefox browser.'); }
      const player = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 20, maxMaxBufferLength: 40, backBufferLength: 15, autoStartLoad: true });
      hls.current = player;
      player.on(Hls.Events.ERROR, (_, data) => { if (data.fatal && generationId === generation.current) { setLoading(false); setError('The film could not continue. Check your connection and try again.'); } });
      player.loadSource(url); player.attachMedia(video);
    }
    sourceId.current = item?.id;
  }, [item?.id]);
  const start = useCallback(async ({ renew = false, shouldPlay = true } = {}) => {
    if (!item || renewing.current) return;
    if (!renew && sourceId.current === item.id && session.current && new Date(session.current.expiresAt).getTime() > Date.now() + 30_000) {
      element.current?.play().catch(() => setError('Tap the play control on the film to start.')); return;
    }
    renewing.current = true; const generationId = generation.current;
    setError(''); if (!renew) setLoading(true);
    const resumeAt = renew || sourceId.current === item.id ? element.current?.currentTime || 0 : 0;
    request.current?.abort(); request.current = new AbortController();
    try {
      let media;
      try { media = await requestPlayback(item, renew ? session.current?.sessionId : undefined, request.current.signal); }
      catch (failure) {
        if (!renew || failure.response?.data?.code !== 'VIDEO_SESSION_EXPIRED' || generationId !== generation.current) throw failure;
        media = await requestPlayback(item, undefined, request.current.signal);
      }
      if (generationId !== generation.current) return;
      session.current = media;
      await installSource(media.hlsUrl, { resumeAt, play: shouldPlay, generationId });
      setStarted(true);
    } catch (failure) { if (!request.current?.signal.aborted && generationId === generation.current) { element.current?.pause(); setError(failure.response?.data?.message || failure.message || 'This film could not be opened. Please try again.'); } }
    finally { if (generationId === generation.current) { renewing.current = false; setLoading(false); } }
  }, [item, requestPlayback, installSource]);
  useEffect(() => {
    generation.current += 1; request.current?.abort(); hls.current?.destroy(); hls.current = null;
    session.current = null; sourceId.current = ''; renewing.current = false; setStarted(false); setError(''); setLoading(false);
    const video = element.current; video?.pause(); if (video) { video.removeAttribute('src'); video.load(); }
    return () => { generation.current += 1; request.current?.abort(); hls.current?.destroy(); video?.pause(); if (session.current?.sessionId) void endPlayback?.(session.current.sessionId)?.catch(() => {}); };
  }, [item?.id, endPlayback]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!element.current?.paused && !document.hidden && session.current && Date.now() > new Date(session.current.expiresAt).getTime() - 300_000) void start({ renew: true });
    }, 15_000);
    const hidden = () => { if (document.hidden) element.current?.pause(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hidden); };
  }, [start]);
  if (!item) return <div className="vv-state"><Film /><h1>No videos are ready yet.</h1><p>Finish preparing a video before opening this preview.</p></div>;
  const branding = delivery.branding || {};
  return <main className="vv-page">
    <header className="vv-brand"><div>{branding.logoUrl ? <img src={branding.logoUrl} alt="" /> : <Film size={24} />}<span><small>A FILM DELIVERY BY</small><strong>{branding.name || 'Your photographer'}</strong></span></div>{demo && <span className="vv-demo-label">PLAYBACK DEMO</span>}</header>
    <motion.section className="vv-heading" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4 }}><p>{delivery.items.length === 1 ? 'YOUR FILM' : `${delivery.items.length} FILMS`}</p><h1>{delivery.title}</h1>{delivery.introduction && <div className="vv-introduction">{delivery.introduction}</div>}</motion.section>
    <div className={'vv-layout' + (delivery.items.length === 1 ? ' is-single' : '')}>
      <section className="vv-film" aria-label={item.title}>
        <div className={'vv-screen' + (item.height > item.width ? ' is-portrait' : '')}>
          <video ref={element} controls={started} controlsList="nodownload" playsInline preload="none" poster={videoMediaUrl(item.posterUrl)} aria-label={item.title} onWaiting={() => setLoading(true)} onCanPlay={() => setLoading(false)} onPlaying={() => { setLoading(false); setError(''); }} onPlay={() => { if (session.current && new Date(session.current.expiresAt).getTime() < Date.now() + 60_000) void start({ renew: true }); }} onError={() => { if (started && !renewing.current) { setLoading(false); setError('This film could not play. Check your connection and try again.'); } }} />
          {!started && !loading && <button className="vv-play" type="button" onClick={() => start()}><span><Play size={26} fill="currentColor" /></span>Play film</button>}
          {loading && <span className="vv-buffer" role="status"><RefreshCw className="v-spin" size={22} />{started ? 'Loading film…' : 'Opening film…'}</span>}
        </div>
        {error && <div className="vv-error" role="alert"><p>{error}</p><button type="button" onClick={() => { session.current = null; sourceId.current = ''; void start({ renew: started }); }}><RefreshCw size={16} />Try again</button></div>}
        <div className="vv-film-caption"><div><p><span>{videoDuration(item.duration)}</span><span><Volume2 size={13} />Original audio</span></p><h2>{item.title}</h2>{item.description && <div className="vv-description">{item.description}</div>}</div>{item.allowDownload && downloadUrl && <a className="vv-download" href={downloadUrl(item)}><Download size={17} /><span>Download original<small>{videoBytes(item.bytes)}</small></span></a>}</div>
      </section>
      {delivery.items.length > 1 && <aside className="vv-playlist" aria-label="Films in this delivery"><div className="vv-playlist-title"><span>IN THIS DELIVERY</span><small>Choose a film</small></div>{delivery.items.map((video, index) => <button type="button" key={video.id} aria-pressed={video.id === item.id} className={'vv-playlist-item' + (video.id === item.id ? ' is-current' : '')} onClick={() => setSelected(video.id)}><span className="vv-playlist-image">{video.posterUrl ? <img src={videoMediaUrl(video.posterUrl)} alt="" loading="lazy" /> : <Film size={24} />}<i>{String(index + 1).padStart(2, '0')}</i></span><span className="vv-playlist-copy"><strong>{video.title}</strong><small>{videoDuration(video.duration)}{video.id === item.id ? ' · Selected' : ''}</small></span><Play size={15} /></button>)}</aside>}
    </div>
    <footer className="vv-footer"><span>Delivered by <strong>{branding.name || 'Your photographer'}</strong></span>{/^https?:\/\//.test(branding.website || '') && <a href={branding.website} target="_blank" rel="noreferrer">Visit the studio<ArrowUpRight size={14} /></a>}<a href="/product">Delivered with Veylo</a></footer>
  </main>;
}
