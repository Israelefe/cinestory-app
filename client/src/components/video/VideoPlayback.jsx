import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, RefreshCw, Volume2, VolumeX, Maximize } from 'lucide-react';
import { videoDuration, videoMediaUrl } from '../../services/videoDelivery.js';

// Only the selected film mounts a player or requests a playback session.
export default function VideoPlayback({ item, requestPlayback, endPlayback, portrait = false, original = true, autoPlay = false, muted = true, onMutedChange }) {
  const element = useRef(null); const hls = useRef(null); const session = useRef(null);
  const request = useRef(null); const generation = useRef(0); const renewing = useRef(false); const sourceId = useRef('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true); const [position, setPosition] = useState(0);
  const installSource = useCallback(async (url, { resumeAt = 0, play = false, generationId } = {}) => {
    const video = element.current; if (!video || generationId !== generation.current) return;
    hls.current?.destroy(); hls.current = null;
    const restore = () => {
      if (generationId !== generation.current) return;
      if (resumeAt) video.currentTime = Math.min(resumeAt, video.duration || resumeAt);
      if (play) video.play().catch(() => { setLoading(false); setPaused(true); });
    };
    video.addEventListener('loadedmetadata', restore, { once: true });
    if (video.canPlayType('application/vnd.apple.mpegurl') || !url.includes('.m3u8')) { video.src = url; video.load(); }
    else {
      const { default: Hls } = await import('hls.js');
      if (generationId !== generation.current) { video.removeEventListener('loadedmetadata', restore); return; }
      if (!Hls.isSupported()) throw new Error('This browser cannot play this film. Try a current Safari, Chrome or Firefox browser.');
      const player = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 20, maxMaxBufferLength: 40, backBufferLength: 15 });
      hls.current = player;
      player.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal && generationId === generation.current) { setLoading(false); setError('The film could not continue. Check your connection and try again.'); }
      });
      player.loadSource(url); player.attachMedia(video);
    }
    sourceId.current = item.id;
  }, [item.id]);
  const start = useCallback(async ({ renew = false, shouldPlay = true } = {}) => {
    if (renewing.current) return;
    if (!renew && sourceId.current === item.id && session.current && new Date(session.current.expiresAt).getTime() > Date.now() + 30_000) {
      element.current?.play().catch(() => setPaused(true)); return;
    }
    renewing.current = true; const generationId = generation.current;
    setError(''); if (!renew) setLoading(true);
    const resumeAt = renew || sourceId.current === item.id ? element.current?.currentTime || 0 : 0;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    try {
      let media;
      try { media = await requestPlayback(item, renew ? session.current?.sessionId : undefined, controller.signal); }
      catch (failure) {
        if (!renew || failure.response?.data?.code !== 'VIDEO_SESSION_EXPIRED' || generationId !== generation.current) throw failure;
        media = await requestPlayback(item, undefined, controller.signal);
      }
      if (generationId !== generation.current) { if (media.sessionId) void endPlayback?.(media.sessionId)?.catch(() => {}); return; }
      session.current = media;
      await installSource(media.hlsUrl, { resumeAt, play: shouldPlay, generationId });
      if (generationId === generation.current) setStarted(true);
    } catch (failure) {
      if (!controller.signal.aborted && generationId === generation.current) {
        element.current?.pause(); setError(failure.response?.data?.message || failure.message || 'This film could not be opened. Please try again.');
      }
    } finally { if (generationId === generation.current) { renewing.current = false; setLoading(false); } }
  }, [item, requestPlayback, endPlayback, installSource]);
  useEffect(() => {
    const video = element.current;
    return () => {
      generation.current++; request.current?.abort(); hls.current?.destroy(); video?.pause();
      renewing.current = false; sourceId.current = '';
      const previousSession = session.current; session.current = null;
      if (video) { video.removeAttribute('src'); video.load(); }
      if (previousSession?.sessionId) void endPlayback?.(previousSession.sessionId)?.catch(() => {});
    };
  }, [endPlayback]);
  useEffect(() => { if (autoPlay && !document.hidden) void start(); }, [autoPlay, start]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!element.current?.paused && !document.hidden && session.current && Date.now() > new Date(session.current.expiresAt).getTime() - 300_000) void start({ renew: true });
    }, 15_000);
    const hidden = () => { if (document.hidden) element.current?.pause(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hidden); };
  }, [start]);
  const toggle = () => { if (element.current?.paused) void start(); else element.current?.pause(); };
  return <div className={'vv-playback' + (portrait ? ' is-vertical' : '')}>
    <video ref={element} controls={started && !portrait} controlsList="nodownload" playsInline preload="none" muted={muted} poster={videoMediaUrl(item.posterUrl)} aria-label={item.title}
      onClick={portrait ? toggle : undefined} onWaiting={() => setLoading(true)} onCanPlay={() => setLoading(false)}
      onPlaying={() => { setLoading(false); setError(''); setPaused(false); }} onPause={() => setPaused(true)}
      onVolumeChange={() => onMutedChange?.(Boolean(element.current?.muted))}
      onTimeUpdate={() => setPosition(element.current?.currentTime || 0)}
      onPlay={() => { setPaused(false); if (session.current && new Date(session.current.expiresAt).getTime() < Date.now() + 60_000) void start({ renew: true }); }}
      onError={() => { if (started && !renewing.current) { setLoading(false); setError(original && element.current?.error?.code === 4 ? 'This browser cannot play the original format. Ask your photographer for a compatible MP4 or adaptive playback.' : 'This film could not play. Check your connection and try again.'); } }} />
    {(!started || (portrait && paused)) && !loading && !error && <button className="vv-play" type="button" onClick={() => start()} aria-label={started ? 'Resume film' : 'Play film'}><span><Play size={26} fill="currentColor" /></span>{!portrait && <small>{started ? 'Resume film' : 'Play film'}</small>}</button>}
    {loading && <span className="vv-buffer" role="status"><RefreshCw className="v-spin" size={20} />{started ? 'Loading film…' : 'Opening film…'}</span>}
    {error && <div className="vv-error" role="alert"><p>{error}</p><button type="button" onClick={() => { sourceId.current = ''; void start({ renew: Boolean(session.current) }); }}><RefreshCw size={16} />Try again</button></div>}
    {item.hasAudio !== false && muted && started && <button className="vv-sound" type="button" onClick={() => { if (element.current) { element.current.muted = false; void element.current.play().catch(() => setPaused(true)); } onMutedChange?.(false); }}><VolumeX size={16} />Enable sound</button>}
    {portrait && started && <div className="vv-reel-controls">
      <input className="vv-seek" type="range" min="0" max={item.duration || 1} step="0.1" value={Math.min(position, item.duration || 1)} aria-label="Seek video" onChange={event => { if (element.current) element.current.currentTime = Number(event.target.value); setPosition(Number(event.target.value)); }} />
      <div><button type="button" onClick={toggle} aria-label={paused ? 'Play video' : 'Pause video'}>{paused ? <Play size={19} /> : <Pause size={19} />}</button><span>{videoDuration(position)} / {videoDuration(item.duration)}</span>{item.hasAudio !== false && <button type="button" onClick={() => { if (element.current) element.current.muted = !muted; onMutedChange?.(!muted); }} aria-label={muted ? 'Unmute video' : 'Mute video'}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>}<button type="button" aria-label="Full screen" onClick={() => { const video = element.current; if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen(); else void video?.requestFullscreen?.()?.catch(() => {}); }}><Maximize size={18} /></button></div>
    </div>}
  </div>;
}
