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
  const originalFile = useRef({ controller: null, url: '' });
  const originalBuffer = useRef({ active: false, intercept: false, at: 0 });
  const progress = useRef({ at: Date.now(), position: 0, buffered: 0 });
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true); const [position, setPosition] = useState(0);
  const [preparingOriginal, setPreparingOriginal] = useState(false);
  const [originalPercent, setOriginalPercent] = useState(null);
  const releaseOriginal = useCallback(() => {
    originalFile.current.controller?.abort();
    if (originalFile.current.url) URL.revokeObjectURL(originalFile.current.url);
    originalFile.current = { controller: null, url: '' };
  }, []);
  const installSource = useCallback(async (url, { resumeAt = 0, play = false, generationId } = {}) => {
    const video = element.current; if (!video || generationId !== generation.current) return;
    restoreCleanup.current?.(); clearTimeout(recovery.current.timer);
    recovery.current = { network: 0, media: 0, timer: null };
    mediaRecovery.current = false;
    suspended.current = false;
    releaseOriginal();
    // Short, high-bitrate originals need a runway before autoplay. Estimate how
    // much from actual buffering speed instead of playing a few frames at a time.
    const playlist = url.includes('.m3u8');
    const prepare = play && original && item.duration > 0 && item.duration <= 30 && item.bytes * 8 / item.duration > 8_000_000 && (playlist || item.bytes <= 120 * 1024 ** 2);
    originalBuffer.current = { active: prepare, intercept: prepare, at: Date.now() };
    setPreparingOriginal(prepare); setOriginalPercent(null);
    hls.current?.destroy(); hls.current = null;
    const restore = () => {
      if (generationId !== generation.current) return;
      if (resumeAt) video.currentTime = Math.min(resumeAt, video.duration || resumeAt);
    };
    video.addEventListener('loadedmetadata', restore, { once: true });
    restoreCleanup.current = () => video.removeEventListener('loadedmetadata', restore);
    let downloading = false;
    if (!playlist && prepare) {
      // Native preload may stop while paused, even before the runway is ready.
      // Fetch a bounded short original once and play the identical bytes locally.
      downloading = true; setPaused(false);
      video.removeAttribute('src'); video.load();
      const controller = new AbortController(); originalFile.current.controller = controller;
      void (async () => {
        try {
          const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
          if (!response.ok || response.status !== 200 || !response.body || Number(response.headers.get('Content-Length')) > 128 * 1024 ** 2) throw new Error('Original download failed.');
          const total = Number(response.headers.get('Content-Length'));
          let bytes = 0; let percent = -1;
          const stream = response.body.pipeThrough(new TransformStream({ transform(chunk, output) {
            bytes += chunk.byteLength;
            if (bytes > 128 * 1024 ** 2) throw new Error('Original is too large to buffer.');
            if (total > 0) {
              const next = Math.min(99, Math.floor(bytes * 100 / total));
              if (next !== percent) { percent = next; setOriginalPercent(next); }
            }
            progress.current.at = Date.now(); output.enqueue(chunk);
          } }));
          const blob = await new Response(stream, { headers: { 'Content-Type': response.headers.get('Content-Type') || 'video/mp4' } }).blob();
          if (controller.signal.aborted || generationId !== generation.current || originalFile.current.controller !== controller) return;
          originalFile.current = { controller: null, url: URL.createObjectURL(blob) };
          originalBuffer.current.active = false; setPreparingOriginal(false);
          video.src = originalFile.current.url; video.load();
          if (playIntent.current && !document.hidden) void video.play().catch(() => { playIntent.current = false; setLoading(false); setPaused(true); });
        } catch {
          if (controller.signal.aborted || generationId !== generation.current || originalFile.current.controller !== controller) return;
          releaseOriginal(); originalBuffer.current.active = false; setPreparingOriginal(false);
          playIntent.current = false; sourceId.current = ''; setLoading(false); setPaused(true);
          setError('The film could not be buffered. Check your connection and try again.');
        }
      })();
    } else if (!playlist) { video.src = url; video.load(); }
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
          originalBuffer.current.active = false; setPreparingOriginal(false);
          playIntent.current = false; video.pause(); setLoading(false); setError('The film could not continue. Check your connection and try again.');
        });
        player.on(Hls.Events.FRAG_BUFFERED, () => { if (hls.current === player) recovery.current.network = 0; });
        player.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (hls.current === player && mediaRecovery.current && playIntent.current && !originalBuffer.current.active && !document.hidden) void video.play().catch(() => {});
        });
        player.loadSource(url); player.attachMedia(video);
      }
    }
    sourceId.current = item.id;
    sourceUrl.current = url;
    progress.current = { at: Date.now(), position: resumeAt, buffered: 0 };
    // Calling play starts fetching on browsers that defer metadata until playback.
    if (play && !downloading) void video.play().catch(failure => {
      if (generationId !== generation.current || failure.name === 'AbortError') return;
      // HLS and native recovery own media/network failures. A rejected initial
      // play promise must not cancel their retry or turn a brief drop into an error.
      if (failure.name !== 'NotAllowedError' && (hls.current || recovery.current.timer)) return;
      setLoading(false); setPaused(true);
      originalBuffer.current.active = false; setPreparingOriginal(false);
      playIntent.current = false;
      mediaRecovery.current = false;
      if (failure.name !== 'NotAllowedError') setError('This film could not start. Check your connection and try again.');
    });
  }, [item.id, item.duration, item.bytes, original, releaseOriginal]);
  const start = useCallback(async ({ renew = false, shouldPlay = true, forceReload = false } = {}) => {
    if (shouldPlay) playIntent.current = true;
    if (!renew && !forceReload && sourceId.current === item.id && session.current && new Date(session.current.expiresAt).getTime() > Date.now() + 30_000) {
      if (originalFile.current.controller) return;
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
      } else if (shouldPlay && !document.hidden && !originalFile.current.controller) { void element.current?.play().catch(() => setPaused(true)); }
      if (generationId === generation.current) setStarted(true);
    } catch (failure) {
      if (!controller.signal.aborted && generationId === generation.current) {
        // A brief renewal outage must not interrupt a still-authorised buffer.
        if (renew && !forceReload && (!failure.response || failure.response.status >= 500) && new Date(session.current?.expiresAt).getTime() > Date.now() + 15_000) {
          nextRenewAt.current = Date.now() + 15_000; return;
        }
        originalBuffer.current.active = false; setPreparingOriginal(false);
        releaseOriginal();
        playIntent.current = false; element.current?.pause(); setLoading(false); setError(failure.response?.data?.message || failure.message || 'This film could not be opened. Please try again.');
      }
    } finally { if (generationId === generation.current) renewing.current = false; }
  }, [item, requestPlayback, endPlayback, installSource, releaseOriginal]);
  useEffect(() => {
    const video = element.current;
    return () => {
      generation.current++; request.current?.abort(); hls.current?.destroy(); video?.pause();
      clearTimeout(recovery.current.timer); restoreCleanup.current?.();
      renewing.current = false; playIntent.current = false; sourceId.current = ''; sourceUrl.current = ''; nextRenewAt.current = Infinity;
      originalBuffer.current.active = false;
      releaseOriginal();
      const previousSession = session.current; session.current = null;
      if (video) { video.removeAttribute('src'); video.load(); }
      if (previousSession?.sessionId) void endPlayback?.(previousSession.sessionId)?.catch(() => {});
    };
  }, [endPlayback, releaseOriginal]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active && autoPlay && !document.hidden) void start(); });
    return () => { active = false; };
  }, [autoPlay, start]);
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => {
      if (Date.now() - progress.current.at < 30_000) return;
      generation.current++; request.current?.abort(); renewing.current = false; sourceId.current = '';
      playIntent.current = false; mediaRecovery.current = false;
      originalBuffer.current.active = false; setPreparingOriginal(false);
      releaseOriginal();
      sourceUrl.current = ''; clearTimeout(recovery.current.timer); restoreCleanup.current?.();
      hls.current?.destroy(); hls.current = null;
      element.current?.pause(); setLoading(false);
      setError('The film is taking too long to load. Check your connection and try again.');
    }, 1000);
    return () => clearInterval(timer);
  }, [loading, releaseOriginal]);
  useEffect(() => {
    const timer = setInterval(() => {
      if ((!element.current?.paused || originalBuffer.current.active) && !document.hidden && session.current?.sessionId && Date.now() >= nextRenewAt.current) void start({ renew: true, shouldPlay: false });
    }, 15_000);
    const hidden = () => { if (document.hidden) { if (originalFile.current.controller) { releaseOriginal(); sourceId.current = ''; } originalBuffer.current.active = false; setPreparingOriginal(false); playIntent.current = false; mediaRecovery.current = false; clearTimeout(recovery.current.timer); hls.current?.stopLoad(); suspended.current = Boolean(hls.current); element.current?.pause(); setLoading(false); setPaused(true); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hidden); };
  }, [start, releaseOriginal]);
  const noteProgress = () => {
    const video = element.current; if (!video) return;
    const buffered = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
    if (video.currentTime !== progress.current.position || buffered > progress.current.buffered) {
      progress.current = { at: Date.now(), position: video.currentTime, buffered };
    }
    if (originalBuffer.current.active && playIntent.current && !document.hidden && video.buffered.length) {
      const position = video.currentTime; let ahead = 0; let begin = position;
      // Remuxed audio/video can begin a fraction after zero. A paused player
      // cannot rely on the usual playing-time gap correction to cross that gap.
      for (let index = 0; index < video.buffered.length; index++) if (video.buffered.start(index) <= position + .5 && video.buffered.end(index) > position) { begin = Math.max(position, video.buffered.start(index)); ahead = video.buffered.end(index) - begin; break; }
      const remaining = Math.max(0, Math.min(video.duration || item.duration, item.duration) - begin);
      const rate = ahead / Math.max(.1, (Date.now() - originalBuffer.current.at) / 1000);
      const target = Math.min(remaining, Math.max(3, remaining * Math.max(0, 1 - rate) + 1.5));
      if (ahead + .1 >= target) {
        originalBuffer.current.active = false; setPreparingOriginal(false); mediaRecovery.current = false;
        if (begin > position) video.currentTime = begin;
        void video.play().catch(() => { playIntent.current = false; setLoading(false); setPaused(true); });
      }
    }
  };
  const toggle = () => {
    if (originalBuffer.current.active) { if (originalFile.current.controller) { releaseOriginal(); sourceId.current = ''; } originalBuffer.current.active = false; setPreparingOriginal(false); playIntent.current = false; mediaRecovery.current = false; element.current?.pause(); setPaused(true); setLoading(false); }
    else if (element.current?.paused) void start();
    else { playIntent.current = false; mediaRecovery.current = false; element.current?.pause(); }
  };
  const mediaError = () => {
    if (hls.current || !element.current?.getAttribute('src')) return;
    const code = element.current.error?.code;
    if ([2, 4].includes(code) && nativeFailures.current < 3 && playIntent.current && !document.hidden) {
      const attempt = ++nativeFailures.current; const generationId = generation.current;
      clearTimeout(recovery.current.timer); progress.current.at = Date.now(); setLoading(true);
      recovery.current.timer = setTimeout(() => { if (generationId === generation.current && playIntent.current) void start({ renew: Boolean(session.current), forceReload: true }); }, 750 * 2 ** (attempt - 1));
      return;
    }
    originalBuffer.current.active = false; setPreparingOriginal(false);
    playIntent.current = false; setLoading(false); setError(original && code === 4 ? 'This browser cannot play the original format. Ask your photographer for a compatible MP4 or adaptive playback.' : 'This film could not play. Check your connection and try again.');
  };
  return <div className={'vv-playback' + (portrait ? ' is-vertical' : '')}>
    <video ref={element} controls={started && !portrait && !preparingOriginal && sourceId.current === item.id} controlsList="nodownload" playsInline preload="auto" muted={muted} poster={videoMediaUrl(item.posterUrl)} aria-label={item.title}
      onClick={portrait ? toggle : undefined} onWaiting={() => { if (!error) { if (!loading) progress.current.at = Date.now(); setLoading(true); } }} onCanPlay={() => { noteProgress(); if (!originalBuffer.current.active) setLoading(false); }} onProgress={noteProgress}
      onPlaying={() => { if (originalBuffer.current.active) return; mediaRecovery.current = false; nativeFailures.current = 0; setLoading(false); setError(''); setPaused(false); }} onPause={() => { if (originalBuffer.current.active) { setPaused(false); return; } if (!mediaRecovery.current && !element.current?.error) { playIntent.current = false; setLoading(false); } setPaused(true); }}
      onVolumeChange={() => onMutedChange?.(Boolean(element.current?.muted))}
      onTimeUpdate={() => { noteProgress(); setPosition(element.current?.currentTime || 0); }} onEnded={() => { playIntent.current = false; setPaused(true); setLoading(false); }}
      onPlay={() => { playIntent.current = true; if (originalBuffer.current.active && originalBuffer.current.intercept) { originalBuffer.current.intercept = false; element.current?.pause(); setLoading(true); return; } if (originalBuffer.current.active) { originalBuffer.current.active = false; setPreparingOriginal(false); } if (suspended.current) { suspended.current = false; hls.current?.startLoad(); } setPaused(false); if (session.current?.sessionId && Date.now() >= nextRenewAt.current) void start({ renew: true, shouldPlay: false }); }}
      onError={mediaError} />
    {(!started || (paused && (portrait || !sourceId.current))) && !loading && !error && <button className="vv-play" type="button" onClick={() => start()} aria-label={started ? 'Resume film' : 'Play film'}><span><Play size={26} fill="currentColor" /></span>{!portrait && <small>{started ? 'Resume film' : 'Play film'}</small>}</button>}
    {loading && <div className="vv-buffer" role="status"><RefreshCw className="v-spin" size={20} /><span>{preparingOriginal ? `Buffering original quality…${originalPercent === null ? '' : ` ${originalPercent}%`}` : started ? 'Loading film…' : 'Opening film…'}</span>{preparingOriginal && <button type="button" onClick={toggle} aria-label="Pause buffering" title="Pause buffering"><Pause size={16} /></button>}</div>}
    {error && <div className="vv-error" role="alert"><p>{error}</p><button type="button" onClick={() => { void start({ renew: Boolean(session.current), forceReload: true }); }}><RefreshCw size={16} />Try again</button></div>}
    {item.hasAudio !== false && muted && started && !preparingOriginal && sourceId.current === item.id && <button className="vv-sound" type="button" onClick={() => { if (element.current) { element.current.muted = false; if (!originalBuffer.current.active) void element.current.play().catch(() => setPaused(true)); } onMutedChange?.(false); }}><VolumeX size={16} />Enable sound</button>}
    {portrait && started && <div className="vv-reel-controls">
      <input className="vv-seek" type="range" min="0" max={item.duration || 1} step="0.1" value={Math.min(position, item.duration || 1)} aria-label="Seek video" onChange={event => { if (element.current) element.current.currentTime = Number(event.target.value); setPosition(Number(event.target.value)); }} />
      <div><button type="button" onClick={toggle} aria-label={paused ? 'Play video' : 'Pause video'}>{paused ? <Play size={19} /> : <Pause size={19} />}</button><span>{videoDuration(position)} / {videoDuration(item.duration)}</span>{item.hasAudio !== false && <button type="button" onClick={() => { if (element.current) element.current.muted = !muted; onMutedChange?.(!muted); }} aria-label={muted ? 'Unmute video' : 'Mute video'}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>}<button type="button" aria-label="Full screen" onClick={() => { const video = element.current; if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen(); else void video?.requestFullscreen?.()?.catch(() => {}); }}><Maximize size={18} /></button></div>
    </div>}
  </div>;
}
