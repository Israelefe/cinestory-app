import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, RefreshCw, Volume2, VolumeX, Maximize, WifiOff, Info, X } from 'lucide-react';
import { videoDuration, videoMediaUrl } from '../../services/videoDelivery.js';
import { qualityLabel } from '../../utils/videoQuality.js';

// Only the selected film mounts a player or requests a playback session.
export default function VideoPlayback({ item, requestPlayback, endPlayback, portrait = false, original = true, autoPlay = false, muted = true, onMutedChange, onEnded, onPlaybackStart }) {
  const element = useRef(null); const hls = useRef(null); const session = useRef(null);
  const request = useRef(null); const generation = useRef(0); const renewing = useRef(false); const sourceId = useRef('');
  const sourceUrl = useRef(''); const nextRenewAt = useRef(Infinity); const restoreCleanup = useRef(null);
  const recovery = useRef({ network: 0, media: 0, timer: null });
  const nativeFailures = useRef(0);
  const playIntent = useRef(false); const mediaRecovery = useRef(false);
  const suspended = useRef(false);
  const sourceOpenedAt = useRef(0);
  const bufferHold = useRef({ active: false, target: 0, count: 0, at: 0 });
  const progress = useRef({ at: Date.now(), position: 0, buffered: 0 });
  const qualityChoice = useRef('auto'); const knownQualities = useRef(item.qualities || []);
  const reconnectIntent = useRef(false); const loadingSince = useRef(0);
  const hasPlayed = useRef(false);
  const [quality, setQuality] = useState('auto'); const [levels, setLevels] = useState([]); const [activeQuality, setActiveQuality] = useState('');
  const [connection, setConnection] = useState(''); const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true); const [position, setPosition] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [ended, setEnded] = useState(false);
  const installSource = useCallback(async (url, { resumeAt = 0, play = false, generationId } = {}) => {
    const video = element.current; if (!video || generationId !== generation.current) return;
    restoreCleanup.current?.(); clearTimeout(recovery.current.timer);
    recovery.current = { network: 0, media: 0, timer: null };
    mediaRecovery.current = false;
    suspended.current = false;
    sourceOpenedAt.current = Date.now();
    hasPlayed.current = false;
    setEnded(false);
    bufferHold.current.active = false; setBuffering(false);
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
        const choices = knownQualities.current.map((level, index) => ({ ...level, index, height: level.height || Math.min(level.width, level.displayHeight) }));
        setLevels(choices);
        const selected = choices.find(level => level.name === qualityChoice.current);
        video.src = selected && /^q\d{1,4}$/.test(selected.name) ? new URL(`${selected.name}/index.m3u8`, url).href : url; video.load();
      } else {
        const player = new Hls({ capLevelToPlayerSize: false, maxBufferLength: 30, maxMaxBufferLength: 60,
          maxBufferSize: 48 * 1024 ** 2, backBufferLength: 15, startFragPrefetch: true, progressive: true,
          abrEwmaFastVoD: 2, abrEwmaSlowVoD: 6, abrBandWidthFactor: .8, abrBandWidthUpFactor: .65,
          ...(original ? {} : { startLevel: 0 }) });
        hls.current = player;
        player.on(Hls.Events.MANIFEST_PARSED, () => {
          if (hls.current !== player) return;
          const choices = player.levels.map((level, index) => ({ index, name: `q${Math.min(level.width, level.height)}`, height: Math.min(level.width, level.height) }));
          const allowed = choices.some(level => level.height >= 720) ? choices.filter(level => level.height >= 720) : choices;
          setLevels(allowed);
          if (allowed.length && !original) player.config.minAutoBitrate = player.levels[allowed[0].index].bitrate;
          const selected = allowed.find(level => level.name === qualityChoice.current);
          if (selected) player.nextLevel = selected.index;
        });
        player.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
          if (hls.current !== player) return;
          const level = player.levels[data.level]; if (level) setActiveQuality(qualityLabel(Math.min(level.width, level.height)));
        });
        player.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal || generationId !== generation.current) return;
          const status = data.response?.code;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && ![401, 403, 404, 410, 429].includes(status) && recovery.current.network < 3) {
            const attempt = ++recovery.current.network;
            setLoading(true);
            recovery.current.timer = setTimeout(() => { if (hls.current === player && generationId === generation.current) player.startLoad(); }, 750 * 2 ** (attempt - 1));
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recovery.current.media++ < 2) {
            if (qualityChoice.current === 'auto' && player.currentLevel > player.minAutoLevel) { player.autoLevelCapping = Math.max(player.minAutoLevel, player.currentLevel - 1); player.nextAutoLevel = player.autoLevelCapping; }
            mediaRecovery.current = true; player.recoverMediaError(); return;
          }
          bufferHold.current.active = false; setBuffering(false);
          reconnectIntent.current = !navigator.onLine && playIntent.current && !status;
          if (status) setConnection('');
          playIntent.current = false; video.pause(); setLoading(false);
          setError([401, 403, 410].includes(status) ? 'This video link is no longer available. Reopen the delivery or contact your photographer.' : status === 429 ? 'Playback is temporarily unavailable. Contact your photographer.' : status >= 500 || data.type === Hls.ErrorTypes.MEDIA_ERROR ? 'Veylo could not play this video. Please try again.' : !navigator.onLine ? 'Your device appears offline. Reconnect to continue watching.' : 'Video data stopped arriving. Please try again.');
        });
        player.on(Hls.Events.FRAG_BUFFERED, () => { if (hls.current === player) recovery.current.network = 0; });
        player.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (hls.current === player && mediaRecovery.current && playIntent.current && !bufferHold.current.active && !document.hidden) void video.play().catch(() => {});
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
      knownQualities.current = media.qualities || item.qualities || [];
      const remaining = new Date(media.expiresAt).getTime() - Date.now();
      nextRenewAt.current = Date.now() + Math.max(15_000, Math.min((media.renewAfterSeconds || remaining / 2000) * 1000, remaining - 60_000));
      if (previousSession?.sessionId && previousSession.sessionId !== media.sessionId) void endPlayback?.(previousSession.sessionId)?.catch(() => {});
      if (forceReload || sourceId.current !== item.id || sourceUrl.current !== media.hlsUrl) {
        const continuePlaying = shouldPlay || renew && playIntent.current;
        await installSource(media.hlsUrl, { resumeAt: sourceId.current === item.id ? element.current?.currentTime || resumeAt : resumeAt, play: continuePlaying && !document.hidden, generationId });
      } else if (shouldPlay && !document.hidden) { void element.current?.play().catch(() => setPaused(true)); }
      if (generationId === generation.current) setStarted(true);
    } catch (failure) {
      if (!controller.signal.aborted && generationId === generation.current) {
        // A brief renewal outage must not interrupt a still-authorised buffer.
        if (renew && !forceReload && (!failure.response || failure.response.status >= 500) && new Date(session.current?.expiresAt).getTime() > Date.now() + 15_000) {
          nextRenewAt.current = Date.now() + 15_000; return;
        }
        reconnectIntent.current = !failure.response && !navigator.onLine && playIntent.current;
        bufferHold.current.active = false; setBuffering(false);
        playIntent.current = false; element.current?.pause(); setLoading(false); setError(failure.response?.data?.message || failure.message || 'This film could not be opened. Please try again.');
        if (reconnectIntent.current) setError('Your device appears offline. Reconnect to continue watching.');
      }
    } finally { if (generationId === generation.current) renewing.current = false; }
  }, [item, requestPlayback, endPlayback, installSource]);
  useEffect(() => {
    const lost = () => { setOffline(true); setConnection('Your device appears offline. Reconnect to continue watching.'); };
    const restored = () => {
      setOffline(false); setConnection('Connection restored.');
      if (reconnectIntent.current && !document.hidden) { reconnectIntent.current = false; void start({ renew: Boolean(session.current), forceReload: true }); }
    };
    window.addEventListener('offline', lost); window.addEventListener('online', restored);
    if (!navigator.onLine) lost();
    return () => { window.removeEventListener('offline', lost); window.removeEventListener('online', restored); };
  }, [start]);
  useEffect(() => {
    if (connection !== 'Connection restored.') return;
    const timer = setTimeout(() => setConnection(''), 4000); return () => clearTimeout(timer);
  }, [connection]);
  const chooseQuality = value => {
    qualityChoice.current = value; setQuality(value);
    const player = hls.current; const video = element.current;
    if (player) {
      if (value === 'auto') player.loadLevel = -1;
      else player.currentLevel = levels.find(level => level.name === value)?.index ?? -1;
    }
    else if (video && sourceUrl.current?.includes('.m3u8')) void installSource(sourceUrl.current, { resumeAt: video.currentTime, play: playIntent.current && !document.hidden, generationId: generation.current });
    if (value === 'auto') setConnection('');
    if (error && value === 'auto') void start({ renew: Boolean(session.current), forceReload: true });
  };
  useEffect(() => {
    const video = element.current;
    return () => {
      generation.current++; bufferHold.current.active = false; request.current?.abort(); hls.current?.destroy(); video?.pause();
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
    if (!buffering) return;
    const generationId = generation.current;
    const timer = setInterval(() => {
      const video = element.current; const hold = bufferHold.current;
      if (!video || !hold.active || !playIntent.current || document.hidden || generationId !== generation.current) return;
      let ahead = 0;
      for (let index = 0; index < video.buffered.length; index++) {
        if (video.buffered.start(index) <= video.currentTime && video.buffered.end(index) > video.currentTime) {
          ahead = video.buffered.end(index) - video.currentTime; break;
        }
      }
      const remaining = Number.isFinite(video.duration) ? video.duration - video.currentTime : Infinity;
      if (video.readyState < 3 || ahead + .1 < Math.min(hold.target, remaining)) return;
      hold.active = false; setBuffering(false);
      void video.play().catch(failure => {
        if (generationId !== generation.current || failure.name === 'AbortError' || video.error) return;
        playIntent.current = false; setLoading(false); setPaused(true);
      });
    }, 250);
    return () => clearInterval(timer);
  }, [buffering]);
  useEffect(() => {
    if (!loading) return;
    loadingSince.current = Date.now();
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
      if (hls.current && playIntent.current && Date.now() - loadingSince.current > 4000 && navigator.onLine) {
        setConnection(qualityChoice.current === 'auto' ? 'Video is arriving slowly. Auto is adjusting playback quality.' : 'Video is arriving slowly at this quality. Switch to Auto for smoother playback.');
      }
      if (!hls.current && video?.readyState === 0 && video.networkState === 2 && Date.now() - sourceOpenedAt.current < 120_000) return;
      if (Date.now() - progress.current.at < 30_000) return;
      generation.current++; request.current?.abort(); renewing.current = false; sourceId.current = '';
      bufferHold.current.active = false; setBuffering(false);
      playIntent.current = false; mediaRecovery.current = false;
      sourceUrl.current = ''; clearTimeout(recovery.current.timer); restoreCleanup.current?.();
      hls.current?.destroy(); hls.current = null;
      element.current?.pause(); setLoading(false);
      reconnectIntent.current = !navigator.onLine;
      setError(!navigator.onLine ? 'Your device appears offline. Reconnect to continue watching.' : 'Video data stopped arriving. Try again or check your connection.');
    }, 1000);
    return () => clearInterval(timer);
  }, [loading]);
  useEffect(() => {
    const timer = setInterval(() => {
      if ((!element.current?.paused || bufferHold.current.active) && playIntent.current && !document.hidden && session.current?.sessionId && Date.now() >= nextRenewAt.current) void start({ renew: true, shouldPlay: false });
    }, 15_000);
    const hidden = () => { if (document.hidden) { bufferHold.current.active = false; setBuffering(false); playIntent.current = false; mediaRecovery.current = false; clearTimeout(recovery.current.timer); hls.current?.stopLoad(); suspended.current = Boolean(hls.current); element.current?.pause(); setPaused(true); setLoading(false); } };
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
  const waiting = () => {
    const video = element.current;
    if (error || !video) return;
    if (!loading) progress.current.at = Date.now();
    setLoading(true);
    // Keep the fast first-frame path. After a real HLS underrun, retain play
    // intent while filling a short reserve rather than restarting on each chunk.
    // Native preload can stop while paused, so its browser owns rebuffering.
    if (!hls.current || !playIntent.current || video.paused || !hasPlayed.current || bufferHold.current.active) return;
    const hold = bufferHold.current;
    hold.count = Date.now() - hold.at < 30_000 ? Math.min(hold.count + 1, 3) : 1;
    if (hold.count > 1 && navigator.onLine) setConnection('Your connection to the video appears unstable. Auto can help reduce interruptions.');
    hold.at = Date.now(); hold.target = (original ? 3 : 1.5) * hold.count;
    hold.active = true; setBuffering(true); video.pause();
  };
  const toggle = () => {
    reconnectIntent.current = false;
    if (bufferHold.current.active) { bufferHold.current.active = false; setBuffering(false); playIntent.current = false; mediaRecovery.current = false; hls.current?.stopLoad(); suspended.current = Boolean(hls.current); setPaused(true); setLoading(false); }
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
    reconnectIntent.current = !navigator.onLine && playIntent.current;
    playIntent.current = false; setLoading(false); setError(code === 4 ? 'This playback format is not supported by your browser. Try a current Safari, Chrome or Firefox browser.' : !navigator.onLine ? 'Your device appears offline. Reconnect to continue watching.' : 'This video could not play. Please try again.');
  };
  const qualityControl = levels.length > 0 && <label className="vv-quality-control"><span>Quality</span><select aria-label="Playback quality" value={quality} onChange={event => chooseQuality(event.target.value)}><option value="auto">Auto{activeQuality ? ` (${activeQuality})` : ''}</option>{levels.map(level => <option key={level.index} value={level.name}>{qualityLabel(level.height)}</option>)}</select></label>;
  return <div className={'vv-playback' + (portrait ? ' is-vertical' : '')}>
    <video ref={element} controls={started && !portrait && !buffering} controlsList="nodownload" playsInline preload="auto" muted={muted} poster={videoMediaUrl(item.posterUrl)} aria-label={item.title}
      onClick={portrait ? toggle : undefined} onWaiting={waiting} onCanPlay={() => { if (!bufferHold.current.active) setLoading(false); }} onProgress={() => { progress.current.at = Date.now(); noteProgress(); }}
      onPlaying={() => { if (bufferHold.current.active) return; hasPlayed.current = true; mediaRecovery.current = false; nativeFailures.current = 0; setLoading(false); setError(''); setPaused(false); if (navigator.onLine) setConnection(''); const video = element.current; if (video) setActiveQuality(qualityLabel(Math.min(video.videoWidth, video.videoHeight))); }} onPause={() => { if (bufferHold.current.active) return; if (!mediaRecovery.current && !element.current?.error) { playIntent.current = false; setLoading(false); } setPaused(true); }}
      onVolumeChange={() => onMutedChange?.(Boolean(element.current?.muted))}
      onResize={() => { const video = element.current; if (video) setActiveQuality(qualityLabel(Math.min(video.videoWidth, video.videoHeight))); }}
      onTimeUpdate={() => { noteProgress(); setPosition(element.current?.currentTime || 0); }} onEnded={() => { playIntent.current = false; setEnded(true); setPaused(true); setLoading(false); onEnded?.(); }}
      onPlay={() => { setEnded(false); onPlaybackStart?.(); bufferHold.current.active = false; setBuffering(false); playIntent.current = true; if (suspended.current) { suspended.current = false; hls.current?.startLoad(); } setPaused(false); if (session.current?.sessionId && Date.now() >= nextRenewAt.current) void start({ renew: true, shouldPlay: false }); }}
      onError={mediaError} />
    {started && !portrait && <div className="vv-wide-quality">{qualityControl}</div>}
    {connection && (started || offline) && <div className="vv-connection" role="status">{offline ? <WifiOff size={16} /> : <Info size={16} />}<span>{connection}</span>{quality !== 'auto' && !offline && <button type="button" onClick={() => chooseQuality('auto')}>Switch to Auto</button>}<button type="button" aria-label="Dismiss connection message" onClick={() => setConnection('')}><X size={15} /></button></div>}
    {(!started || (portrait && paused && !ended)) && !loading && !error && <button className="vv-play" type="button" onClick={() => start()} aria-label={started ? 'Resume film' : 'Play film'}><span><Play size={26} fill="currentColor" /></span>{!portrait && <small>{started ? 'Resume film' : 'Play film'}</small>}</button>}
    {loading && <div className="vv-buffer" role="status"><RefreshCw className="v-spin" size={20} /><span>{started ? 'Loading film…' : 'Opening film…'}</span>{buffering && <button type="button" onClick={toggle} aria-label="Pause buffering" title="Pause buffering"><Pause size={16} /></button>}</div>}
    {error && <div className="vv-error" role="alert"><p>{error}</p><button type="button" onClick={() => { void start({ renew: Boolean(session.current), forceReload: true }); }}><RefreshCw size={16} />Try again</button></div>}
    {item.hasAudio !== false && muted && started && <button className="vv-sound" type="button" onClick={() => { if (element.current) { element.current.muted = false; if (!bufferHold.current.active) void element.current.play().catch(() => setPaused(true)); } onMutedChange?.(false); }}><VolumeX size={16} />Enable sound</button>}
    {portrait && started && <div className="vv-reel-controls">
      {qualityControl}
      <input className="vv-seek" type="range" min="0" max={item.duration || 1} step="0.1" value={Math.min(position, item.duration || 1)} aria-label="Seek video" onChange={event => { if (element.current) element.current.currentTime = Number(event.target.value); setPosition(Number(event.target.value)); }} />
      <div><button type="button" onClick={toggle} aria-label={paused ? 'Play video' : 'Pause video'}>{paused ? <Play size={19} /> : <Pause size={19} />}</button><span>{videoDuration(position)} / {videoDuration(item.duration)}</span>{item.hasAudio !== false && <button type="button" onClick={() => { if (element.current) element.current.muted = !muted; onMutedChange?.(!muted); }} aria-label={muted ? 'Unmute video' : 'Mute video'}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>}<button type="button" aria-label="Full screen" onClick={() => { const video = element.current; if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen(); else void video?.requestFullscreen?.()?.catch(() => {}); }}><Maximize size={18} /></button></div>
    </div>}
  </div>;
}
