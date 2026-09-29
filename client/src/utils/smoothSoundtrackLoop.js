import { useEffect } from 'react';

const audioGraphs = new WeakMap();

// Keep the format's existing audio element as its transport and volume control.
// A second player carries the beginning of the track over the end of each loop.
export function attachSmoothSoundtrackLoop(player) {
  const volumeProperty = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  if (!volumeProperty || !player) return () => {};
  const incoming = new Audio();
  incoming.crossOrigin = player.crossOrigin;
  incoming.preload = 'none';
  incoming.src = player.currentSrc || player.src;
  incoming.playbackRate = player.playbackRate;
  const originalLoop = player.loop;
  const ownVolume = Object.getOwnPropertyDescriptor(player, 'volume');
  let volume = player.volume;
  let primaryShare = 1;
  let incomingShare = 0;
  let blend = null;
  let frame = 0;
  let disposed = false;
  let internalSeek = false;
  let primed = false;
  let generation = 0;
  let graph = null;
  let incomingSource = null;
  let incomingGain = null;
  let graphPending = false;
  player.loop = false;

  const applyVolume = () => {
    if (graph) {
      // Gain nodes also work on phones that ignore HTML audio volume changes.
      const master = player.muted ? 0 : volume;
      graph.gain.gain.setValueAtTime(master * primaryShare, graph.context.currentTime);
      incomingGain.gain.setValueAtTime(master * incomingShare, graph.context.currentTime);
      volumeProperty.set.call(player, 1); incoming.volume = 1;
    } else {
      volumeProperty.set.call(player, volume * primaryShare);
      incoming.volume = volume * incomingShare;
    }
    incoming.muted = player.muted;
  };
  const enableAudioGraph = () => {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context || graph || graphPending) return;
    // A remote media source needs CORS permission before it can enter Web Audio.
    if (!player.crossOrigin && new URL(player.currentSrc || player.src, location.href).origin !== location.origin) return;
    let existing = audioGraphs.get(player);
    let context;
    try { context = existing?.context || new Context(); } catch { return; }
    graphPending = true;
    context.resume().then(() => {
      if (disposed) { if (!existing) void context.close(); return; }
      if (!existing) {
        const source = context.createMediaElementSource(player);
        const gain = context.createGain();
        source.connect(gain); gain.connect(context.destination);
        existing = { context, gain };
        audioGraphs.set(player, existing);
      }
      incomingSource = context.createMediaElementSource(incoming);
      incomingGain = context.createGain();
      incomingSource.connect(incomingGain); incomingGain.connect(context.destination);
      graph = existing;
      applyVolume();
    }).catch(() => { if (!existing) void context.close(); }).finally(() => { graphPending = false; });
  };
  // Format fades and narration ducking set the master volume, independently of the loop blend.
  Object.defineProperty(player, 'volume', { configurable: true,
    get: () => volume,
    set: value => {
      const next = Number(value);
      if (!Number.isFinite(next) || next < 0 || next > 1) throw new RangeError('Audio volume must be between 0 and 1.');
      volume = next; applyVolume();
    }
  });
  const resetBlend = () => {
    generation += 1;
    blend = null;
    primaryShare = 1; incomingShare = 0;
    incoming.pause();
    applyVolume();
  };
  const beginBlend = () => {
    const token = ++generation;
    blend = { start: player.currentTime, duration: Math.max(.1, player.duration - player.currentTime), ready: false };
    incoming.currentTime = 0;
    incomingShare = 0; applyVolume();
    incoming.play().then(() => {
      if (disposed) { incoming.pause(); return; }
      if (token !== generation) { if (!blend) incoming.pause(); return; }
      blend.ready = true;
      if (player.paused && !player.ended) incoming.pause();
    }).catch(() => { if (token === generation) resetBlend(); });
  };
  const tick = () => {
    frame = 0;
    if (disposed || player.paused) return;
    const duration = player.duration;
    const windowSeconds = Math.min(1.6, duration / 4);
    if (!blend && Number.isFinite(duration) && duration > .5 && duration - player.currentTime <= windowSeconds) beginBlend();
    if (blend?.handoff) {
      const progress = Math.min(1, (performance.now() - blend.handoff) / 160);
      primaryShare = progress; incomingShare = 1 - progress;
      applyVolume();
      if (progress === 1) resetBlend();
    } else if (blend?.ready) {
      const progress = Math.min(1, Math.max(0, (player.currentTime - blend.start) / blend.duration));
      primaryShare = 1 - progress; incomingShare = progress;
      applyVolume();
    }
    frame = window.requestAnimationFrame(tick);
  };
  const schedule = () => { if (!frame && !disposed) frame = window.requestAnimationFrame(tick); };
  const onPlay = () => {
    incoming.preload = 'auto';
    enableAudioGraph();
    if (blend?.handoffPausedAt) { blend.handoff += performance.now() - blend.handoffPausedAt; delete blend.handoffPausedAt; }
    if (blend?.ready && incoming.paused) incoming.play().catch(resetBlend);
    if (!primed) {
      primed = true;
      // Unlock the second player in the same interaction as the first, without audible playback.
      incoming.volume = 0;
      const token = generation;
      incoming.play().then(() => {
        if (disposed) incoming.pause();
        else if (token === generation && !blend) { incoming.pause(); incoming.currentTime = 0; }
      }).catch(() => {});
    }
    schedule();
  };
  const onPause = () => {
    window.cancelAnimationFrame(frame); frame = 0;
    if (blend?.handoff) blend.handoffPausedAt = performance.now();
    if (!player.ended) incoming.pause();
  };
  const onSeek = () => { if (internalSeek) internalSeek = false; else resetBlend(); };
  const onEnded = () => {
    if (disposed) return;
    const carry = blend?.ready && !incoming.paused;
    internalSeek = true;
    player.currentTime = carry ? incoming.currentTime : 0;
    if (carry) { primaryShare = 0; incomingShare = 1; applyVolume(); }
    else resetBlend();
    const token = generation;
    player.play().then(() => {
      if (disposed || token !== generation) return;
      if (carry && blend) blend.handoff = performance.now();
      schedule();
    }).catch(() => { if (!disposed) resetBlend(); });
  };
  const onRate = () => { incoming.playbackRate = player.playbackRate; };
  player.addEventListener('play', onPlay);
  player.addEventListener('pause', onPause);
  player.addEventListener('seeking', onSeek);
  player.addEventListener('ended', onEnded);
  player.addEventListener('volumechange', applyVolume);
  player.addEventListener('ratechange', onRate);
  if (!player.paused) onPlay();

  return () => {
    disposed = true; generation += 1;
    window.cancelAnimationFrame(frame);
    player.removeEventListener('play', onPlay);
    player.removeEventListener('pause', onPause);
    player.removeEventListener('seeking', onSeek);
    player.removeEventListener('ended', onEnded);
    player.removeEventListener('volumechange', applyVolume);
    player.removeEventListener('ratechange', onRate);
    incoming.pause(); incoming.removeAttribute('src'); incoming.load();
    incomingSource?.disconnect(); incomingGain?.disconnect();
    if (graph) {
      graph.gain.gain.setValueAtTime(1, graph.context.currentTime);
      // A changed source reuses its graph; an unmounted player releases its context.
      window.setTimeout(() => {
        if (!player.isConnected && audioGraphs.get(player) === graph) {
          audioGraphs.delete(player); void graph.context.close();
        }
      }, 0);
    }
    if (ownVolume) Object.defineProperty(player, 'volume', ownVolume); else delete player.volume;
    volumeProperty.set.call(player, volume);
    player.loop = originalLoop;
  };
}

export function useSmoothSoundtrackLoop(ref, source) {
  useEffect(() => {
    if (!source || !ref.current) return undefined;
    return attachSmoothSoundtrackLoop(ref.current);
  }, [ref, source]);
}
