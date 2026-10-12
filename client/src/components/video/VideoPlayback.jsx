import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, RefreshCw, Volume2, VolumeX, Maximize } from 'lucide-react';
import { videoDuration, videoMediaUrl } from '../../services/videoDelivery.js';

// Only the selected film mounts a player or requests a playback session.
export default function VideoPlayback({ item, requestPlayback, endPlayback, portrait = false, original = true, autoPlay = false, muted = true, onMutedChange }) {
  const element = useRef(null); const hls = useRef(null); const session = useRef(null);
  const request = useRef(null); const generation = useRef(0); const renewing = useRef(false); const sourceId = useRef('');
  const sourceUrl = useRef(''); const nextRenewAt = useRef(Infinity); const restoreCleanup = useRef(null);
  const recovery = useRef({ network: 0, media: 0, timer: null });
  const nativeFailures = useRef(0);
  const playIntent = useRef(false); const mediaRecovery = useRef(false);
  const suspended = useRef(false);
  const sourceOpenedAt = useRef(0);
  const progress = useRef({ at: Date.now(), position: 0, buffered: 0 });
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true); const [position, setPosition] = useState(0);
  const installSource = useCallback(async (url, { resumeAt = 0, play = false, generationId } = {}) => {
    const video = element.current; if (!video || generationId !== generation.current) return;
    restoreCleanup.current?.(); clearTimeout(recovery.current.timer);
    recovery.current = { network: 0, media: 0, timer: null };
    mediaRecovery.current = false;
    suspended.current = false;
    sourceOpenedAt.current = Date.now();
    hls.current?.destroy(); hls.current = null;
    const restore = () => {
      if (generationId !== generation.current) return;
      if (resumeAt) video.currentTime = Math.min(resumeAt, video.duration || resumeAt);
    };
    video.addEventListener('loadedmetadata', restore, { once: true });
    restoreCleanup.current = () => video.removeEventListener('loadedmetadata', restore);
    if (!url.includes('.m3u8')) { video.src = url; video.load(); }
    else {
      const { default: Hls } = await import('hls.js');
      if (generationId !== generation.current) { video.removeEventListener('loadedmetadata', restore); return; }
      if (!Hls.isSupported()) {
        if (!video.canPlayType('application/vnd.apple.mpegurl')) throw new Error('This browser cannot play this film. Try a current Safari, Chrome or Firefox browser.');
        video.src = url; video.load();
      } else {
        const player = new Hls({ capLevelToPlayerSize: !original, maxBufferLength: 30, maxMaxBufferLength: 60,
          maxBufferSize: 48 * 1024 ** 2, backBufferLength: 15, startFragPrefetch: true, progressive: true,
          ...(original ? {} : { startLevel: 0 }) });
        hls.current = player;
        player.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal || generationId !== generation.current) return;
          const status = data.response?.code;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && ![401, 403, 404, 410, 429].includes(status) && recovery.current.network < 3) {
            const attempt = ++recovery.current.network;
            setLoading(true);
            recovery.current.timer = setTimeout(() => { if (hls.current === player && generationId === generation.current) player.startLoad(); }, 750 * 2 ** (attempt - 1));
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recovery.current.media++ < 2) { mediaRecovery.current = true; player.recoverMediaError(); return; }
          playIntent.current = false; video.pause(); setLoading(false); setError('The film could not continue. Check your connection and try again.');
        });
        player.on(Hls.Events.FRAG_BUFFERED, () => { if (hls.current === player) recovery.current.network = 0; });
        player.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (hls.current === player && mediaRecovery.current && playIntent.current && !document.hidden) void video.play().catch(() => {});
        });
        player.loadSource(url); player.attachMedia(video);
      }
    }
    sourceId.current = item.id;
    sourceUrl.current = url;
    progress.current = { at: Date.now(), position: resumeAt, buffered: 0 };
    // Calling play starts fetching on browsers that defer metadata until playback.
    if (play) void video.play().catch(failure => {
      if (generationId !== generation.current || failure.name === 'AbortError') return;
      // HLS and native recovery own media/network failures. A rejected initial
      // play promise must not cancel their retry or turn a brief drop into an error.
      if (failure.name !== 'NotAllowedError' && (hls.current || recovery.current.timer)) return;
      setLoading(false); setPaused(true);
      playIntent.current = false;
      mediaRecovery.current = false;
      if (failure.name !== 'NotAllowedError') setError('This film could not start. Check your connection and try again.');
    });
  }, [item.id, original]);
  const start = useCallback(async ({ renew = false, shouldPlay = true, forceReload = false } = {}) => {
    if (shouldPlay) playIntent.current = true;
    if (!renew && !forceReload && sourceId.current === item.id && session.current && new Date(session.current.expiresAt).getTime() > Date.now() + 30_000) {
      element.current?.play().catch(() => setPaused(true)); return;
    }
    if (renewing.current) return;
    renewing.current = true; const generationId = generation.current;
    setError(''); if (!renew || forceReload) { progress.current.at = Date.now(); setLoading(true); }
    const resumeAt = renew || sourceId.current === item.id ? element.current?.currentTime || 0 : 0;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    try {
      let media;
      const previousSession = session.current;
      try { media = await requestPlayback(item, sourceId.current === item.id || renew ? previousSession?.sessionId : undefined, controller.signal); }
      catch (failure) {
        if (!previousSession || failure.response?.data?.code !== 'VIDEO_SESSION_EXPIRED' || generationId !== generation.current) throw failure;
        media = await requestPlayback(item, undefined, controller.signal);
      }
      if (generationId !== generation.current) { if (media.sessionId) void endPlayback?.(media.sessionId)?.catch(() => {}); return; }
      session.current = media;
      const remaining = new Date(media.expiresAt).getTime() - Date.now();
      nextRenewAt.current = Date.now() + Math.max(15_000, Math.min((media.renewAfterSeconds || remaining / 2000) * 1000, remaining - 60_000));
      if (previousSession?.sessionId && previousSession.sessionId !== media.sessionId) void endPlayback?.(previousSession.sessionId)?.catch(() => {});
      if (forceReload || sourceId.current !== item.id || sourceUrl.current !== media.hlsUrl) {
        const continuePlaying = shouldPlay || renew && !element.current?.paused;
        await installSource(media.hlsUrl, { resumeAt: sourceId.current === item.id ? element.current?.currentTime || resumeAt : resumeAt, play: continuePlaying && !document.hidden, generationId });
      } else if (shouldPlay && !document.hidden) { void element.current?.play().catch(() => setPaused(true)); }
      if (generationId === generation.current) setStarted(true);
    } catch (failure) {
      if (!controller.signal.aborted && generationId === generation.current) {
        // A brief renewal outage must not interrupt a still-authorised buffer.
        if (renew && !forceReload && (!failure.response || failure.response.status >= 500) && new Date(session.current?.expiresAt).getTime() > Date.now() + 15_000) {
          nextRenewAt.current = Date.now() + 15_000; return;
        }
        playIntent.current = false; element.current?.pause(); setLoading(false); setError(failure.response?.data?.message || failure.message || 'This film could not be opened. Please try again.');
      }
    } finally { if (generationId === generation.current) renewing.current = false; }
  }, [item, requestPlayback, endPlayback, installSource]);
  useEffect(() => {
    const video = element.current;
    return () => {
      generation.current++; request.current?.abort(); hls.current?.destroy(); video?.pause();
      clearTimeout(recovery.current.timer); restoreCleanup.current?.();
      renewing.current = false; playIntent.current = false; sourceId.current = ''; sourceUrl.current = ''; nextRenewAt.current = Infinity;
      const previousSession = session.current; session.current = null;
      if (video) { video.removeAttribute('src'); video.load(); }
      if (previousSession?.sessionId) void endPlayback?.(previousSession.sessionId)?.catch(() => {});
    };
  }, [endPlayback]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active && autoPlay && !document.hidden) void start(); });
    return () => { active = false; };
  }, [autoPlay, start]);
  useEffect(() => {
    if (!loading) return;
    const received = new WeakMap();
    const timer = setInterval(() => {
      // The fetch loader counts bytes before its 128 KiB demux chunks produce
      // playable frames. Check those counts as well as the video's buffer.
      for (const { frag } of Object.values(hls.current?.inFlightFragments || {})) {
        const stats = frag?.stats;
        if (stats && !stats.aborted && stats.loaded > (received.get(stats) || 0)) {
          received.set(stats, stats.loaded); progress.current.at = Date.now();
        }
      }
      // Native browsers can withhold both progress and stalled events until
      // metadata is complete. Allow that phase the same 120-second ceiling as
      // HLS fragment loading, without imposing any minimum wait before play.
      const video = element.current;
      if (!hls.current && video?.readyState === 0 && video.networkState === 2 && Date.now() - sourceOpenedAt.current < 120_000) return;
      if (Date.now() - progress.current.at < 30_000) return;
      generation.current++; request.current?.abort(); renewing.current = false; sourceId.current = '';
      playIntent.current = false; mediaRecovery.current = false;
      sourceUrl.current = ''; clearTimeout(recovery.current.timer); restoreCleanup.current?.();
      hls.current?.destroy(); hls.current = null;
      element.current?.pause(); setLoading(false);
      setError('The film is taking too long to load. Check your connection and try again.');
    }, 1000);
    return () => clearInterval(timer);
  }, [loading]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!element.current?.paused && !document.hidden && session.current?.sessionId && Date.now() >= nextRenewAt.current) void start({ renew: true, shouldPlay: false });
    }, 15_000);
    const hidden = () => { if (document.hidden) { playIntent.current = false; mediaRecovery.current = false; clearTimeout(recovery.current.timer); hls.current?.stopLoad(); suspended.current = Boolean(hls.current); element.current?.pause(); setLoading(false); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hidden); };
  }, [start]);
  const noteProgress = () => {
    const video = element.current; if (!video) return;
    const buffered = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
    if (video.currentTime !== progress.current.position || buffered > progress.current.buffered) {
      progress.current = { at: Date.now(), position: video.currentTime, buffered };
    }
  };
  const toggle = () => { if (element.current?.paused) void start(); else { playIntent.current = false; mediaRecovery.current = false; element.current?.pause(); } };
  const mediaError = () => {
    if (hls.current || !element.current?.getAttribute('src')) return;
    const code = element.current.error?.code;
    if ([2, 4].includes(code) && nativeFailures.current < 3 && playIntent.current && !document.hidden) {
      const attempt = ++nativeFailures.current; const generationId = generation.current;
      clearTimeout(recovery.current.timer); progress.current.at = Date.now(); setLoading(true);
      recovery.current.timer = setTimeout(() => { if (generationId === generation.current && playIntent.current) void start({ renew: Boolean(session.current), forceReload: true }); }, 750 * 2 ** (attempt - 1));
      return;
    }
    playIntent.current = false; setLoading(false); setError(original && code === 4 ? 'This browser cannot play the original format. Ask your photographer for a compatible MP4 or adaptive playback.' : 'This film could not play. Check your connection and try again.');
  };
  return <div className={'vv-playback' + (portrait ? ' is-vertical' : '')}>
    <video ref={element} controls={started && !portrait} controlsList="nodownload" playsInline preload="auto" muted={muted} poster={videoMediaUrl(item.posterUrl)} aria-label={item.title}
      onClick={portrait ? toggle : undefined} onWaiting={() => { if (!error) { if (!loading) progress.current.at = Date.now(); setLoading(true); } }} onCanPlay={() => setLoading(false)} onProgress={() => { progress.current.at = Date.now(); noteProgress(); }}
      onPlaying={() => { mediaRecovery.current = false; nativeFailures.current = 0; setLoading(false); setError(''); setPaused(false); }} onPause={() => { if (!mediaRecovery.current && !element.current?.error) { playIntent.current = false; setLoading(false); } setPaused(true); }}
      onVolumeChange={() => onMutedChange?.(Boolean(element.current?.muted))}
      onTimeUpdate={() => { noteProgress(); setPosition(element.current?.currentTime || 0); }} onEnded={() => { playIntent.current = false; setPaused(true); setLoading(false); }}
      onPlay={() => { playIntent.current = true; if (suspended.current) { suspended.current = false; hls.current?.startLoad(); } setPaused(false); if (session.current?.sessionId && Date.now() >= nextRenewAt.current) void start({ renew: true, shouldPlay: false }); }}
      onError={mediaError} />
    {(!started || (portrait && paused)) && !loading && !error && <button className="vv-play" type="button" onClick={() => start()} aria-label={started ? 'Resume film' : 'Play film'}><span><Play size={26} fill="currentColor" /></span>{!portrait && <small>{started ? 'Resume film' : 'Play film'}</small>}</button>}
    {loading && <span className="vv-buffer" role="status"><RefreshCw className="v-spin" size={20} />{started ? 'Loading film…' : 'Opening film…'}</span>}
    {error && <div className="vv-error" role="alert"><p>{error}</p><button type="button" onClick={() => { void start({ renew: Boolean(session.current), forceReload: true }); }}><RefreshCw size={16} />Try again</button></div>}
    {item.hasAudio !== false && muted && started && <button className="vv-sound" type="button" onClick={() => { if (element.current) { element.current.muted = false; void element.current.play().catch(() => setPaused(true)); } onMutedChange?.(false); }}><VolumeX size={16} />Enable sound</button>}
    {portrait && started && <div className="vv-reel-controls">
      <input className="vv-seek" type="range" min="0" max={item.duration || 1} step="0.1" value={Math.min(position, item.duration || 1)} aria-label="Seek video" onChange={event => { if (element.current) element.current.currentTime = Number(event.target.value); setPosition(Number(event.target.value)); }} />
      <div><button type="button" onClick={toggle} aria-label={paused ? 'Play video' : 'Pause video'}>{paused ? <Play size={19} /> : <Pause size={19} />}</button><span>{videoDuration(position)} / {videoDuration(item.duration)}</span>{item.hasAudio !== false && <button type="button" onClick={() => { if (element.current) element.current.muted = !muted; onMutedChange?.(!muted); }} aria-label={muted ? 'Unmute video' : 'Mute video'}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>}<button type="button" aria-label="Full screen" onClick={() => { const video = element.current; if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen(); else void video?.requestFullscreen?.()?.catch(() => {}); }}><Maximize size={18} /></button></div>
    </div>}
  </div>;
}
