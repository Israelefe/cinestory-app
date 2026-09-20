import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Check, Image, LoaderCircle, Mic2, Music2, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { API_BASE_URL } from '../config/env.js';
import { DeliveryFormatViewer } from '../components/delivery/viewerRegistry.jsx';
import '../styles/format-demos.css';
import './DeliveryViewer.css';
import './DeliveryViewerRole.css';

function accessHeaders(publicId) {
  const token = sessionStorage.getItem(`veylo_delivery_${publicId}`);
  const grant = sessionStorage.getItem(`veylo_delivery_grant_${publicId}`);
  return { ...(token ? { 'X-Delivery-Access': token } : {}), ...(grant ? { 'X-Delivery-Grant': grant } : {}) };
}

const volumeRamps = new WeakMap();
export function apiMediaUrl(value) {
  if (typeof value !== 'string') return value;
  return value.startsWith('/api/') ? `${API_BASE_URL.replace(/\/$/, '')}${value.slice(4)}` : value;
}
function fadeAudioVolume(element, target, duration = 420) {
  if (!element) return;
  const previousFrame = volumeRamps.get(element);
  if (previousFrame) cancelAnimationFrame(previousFrame);
  const from = Number.isFinite(element.volume) ? element.volume : 1;
  const startedAt = performance.now();
  const tick = now => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.volume = Math.max(0, Math.min(1, from + (target - from) * eased));
    if (progress < 1) volumeRamps.set(element, requestAnimationFrame(tick));
    else volumeRamps.delete(element);
  };
  volumeRamps.set(element, requestAnimationFrame(tick));
}

function displayAssetUrl(asset, targetWidth = 960) {
  const candidates = String(asset?.srcSet || '')
    .split(',')
    .map(item => {
      const match = item.trim().match(/^(.*)\s+(\d+)w$/);
      return match ? { url: match[1], width: Number(match[2]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.width - b.width);
  return (candidates.find(candidate => candidate.width >= targetWidth) || candidates.at(-1))?.url || asset?.thumbnailUrl || asset?.url || '';
}

async function preloadBlob(url, cleanup, kind, maxAttempts = 3) {
  if (!url) return { ok: false, url: '' };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), kind === 'audio' ? 120000 : 60000);
    let objectUrl = '';
    try {
      const response = await fetch(url, { cache: attempt ? 'no-store' : 'force-cache', signal: controller.signal });
      if (!response.ok) throw new Error(`Media request returned ${response.status}.`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('The media file was empty.');
      objectUrl = URL.createObjectURL(blob);
      if (kind === 'image') {
        const image = new window.Image();
        image.decoding = 'async';
        image.src = objectUrl;
        if (image.decode) await image.decode();
      } else {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = objectUrl;
        await new Promise((resolve, reject) => {
          const done = () => { audio.oncanplay = null; audio.oncanplaythrough = null; audio.onerror = null; resolve(); };
          audio.oncanplaythrough = done;
          audio.oncanplay = done;
          audio.onerror = reject;
          audio.load();
        });
      }
      cleanup.push(() => URL.revokeObjectURL(objectUrl));
      return { ok: true, url: objectUrl };
    } catch {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (attempt + 1 < maxAttempts) await new Promise(resolve => window.setTimeout(resolve, 450 * (attempt + 1)));
    } finally {
      window.clearTimeout(timeout);
    }
  }
  return { ok: false, url: '' };
}

function preloadImage(url, cleanup) {
  return preloadBlob(url, cleanup, 'image');
}

function preloadAudio(url, cleanup) {
  return preloadBlob(url, cleanup, 'audio');
}

export function DeliveryReadiness({ delivery, onReady }) {
  const sortedAssets = [...(delivery.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const mediaKey = [
    delivery.publicId || delivery._id || 'draft',
    delivery.soundtrack?.url || '',
    delivery.narration?.url || '',
    ...sortedAssets.map(asset => `${asset.assetId}:${asset.url || ''}`)
  ].join('|');
  const totals = {
    photo: sortedAssets.length,
    soundtrack: delivery.soundtrack?.url ? 1 : 0,
    narration: delivery.narration?.url ? 1 : 0
  };
  const total = Math.max(1, totals.photo + totals.soundtrack + totals.narration);
  const [loaded, setLoaded] = useState({ photo: 0, soundtrack: 0, narration: 0, total: 0, failed: 0 });
  const [blocked, setBlocked] = useState(false);
  const [failedItems, setFailedItems] = useState([]);
  const [attempt, setAttempt] = useState(0);
  const openedRef = useRef(false);
  const preloadedRef = useRef({ assets: {}, soundtrack: '', narration: '' });

  const open = () => {
    if (openedRef.current) return;
    openedRef.current = true;
    onReady(preloadedRef.current);
  };

  useEffect(() => {
    const cleanup = [];
    let active = true;
    let transferred = false;
    openedRef.current = false;
    const preloaded = { assets: {}, soundtrack: '', narration: '' };
    preloadedRef.current = preloaded;
    setLoaded({ photo: 0, soundtrack: 0, narration: 0, total: 0, failed: 0 });
    setBlocked(false);
    setFailedItems([]);
    const tasks = [
      ...(delivery.soundtrack?.url ? [{ kind: 'soundtrack', label: 'Soundtrack', run: () => preloadAudio(apiMediaUrl(delivery.soundtrack.url), cleanup) }] : []),
      ...(delivery.narration?.url ? [{ kind: 'narration', label: 'Narration', run: () => preloadAudio(apiMediaUrl(delivery.narration.url), cleanup) }] : []),
      ...sortedAssets.map((asset, index) => ({ kind: 'photo', key: asset.assetId, label: asset.originalFilename || asset.filename || `Photograph ${index + 1}`, run: () => preloadImage(apiMediaUrl(asset.url), cleanup) }))
    ];

    if (!tasks.length) {
      const readyTimer = window.setTimeout(() => { transferred = true; open(); }, 250);
      cleanup.push(() => window.clearTimeout(readyTimer));
    } else {
      const queue = [...tasks];
      const worker = async () => {
        const results = [];
        while (active && queue.length) {
          const task = queue.shift();
          const result = await task.run();
          if (!active) return;
          const ok = Boolean(result?.ok);
          if (ok && task.kind === 'photo') preloaded.assets[task.key] = result.url;
          if (ok && task.kind === 'soundtrack') preloaded.soundtrack = result.url;
          if (ok && task.kind === 'narration') preloaded.narration = result.url;
          if (!ok) setFailedItems(current => [...current.filter(item => item !== task.label), task.label]);
          results.push({ kind: task.kind, ok });
          setLoaded(current => ({ ...current, [task.kind]: current[task.kind] + (ok ? 1 : 0), total: current.total + (ok ? 1 : 0), failed: current.failed + (ok ? 0 : 1) }));
        }
        return results;
      };
      Promise.all(Array.from({ length: Math.min(4, tasks.length) }, worker)).then(workerResults => {
        if (!active) return;
        const failed = workerResults.flat().filter(result => !result.ok).length;
        if (failed) {
          setBlocked(true);
          return;
        }
        const readyTimer = window.setTimeout(() => { transferred = true; open(); }, 350);
        cleanup.push(() => window.clearTimeout(readyTimer));
      });
    }

    return () => {
      active = false;
      if (!transferred) cleanup.forEach(dispose => dispose());
    };
  }, [mediaKey, attempt]);

  const percent = Math.min(100, Math.round((loaded.total / total) * 100));
  const stage = loaded.failed
    ? 'A file needs another try'
    : loaded.photo < totals.photo
      ? `Preparing photograph ${Math.min(loaded.photo + 1, totals.photo)} of ${totals.photo}`
      : loaded.soundtrack < totals.soundtrack
        ? 'Buffering the soundtrack'
        : loaded.narration < totals.narration
          ? 'Preparing the narration'
          : 'Your delivery is ready';

  return <main className="vd-readiness" role="status" aria-live="polite">
    <div className="vd-readiness-ambient" aria-hidden="true" />
    <section>
      <img src={delivery.branding?.logoUrl || '/veylo/veylo-mark.svg'} alt="" />
      <p>{delivery.branding?.name || 'Veylo'} · PRIVATE DELIVERY</p>
      <h1>Preparing {delivery.clientName ? `${delivery.clientName}’s` : 'your'} photographs.</h1>
      <span>We’re preparing every photograph, the music, and the narration before the experience begins.</span>
      <div className="vd-readiness-progress" aria-label={`${percent}% prepared`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent} role="progressbar"><i style={{ transform: `scaleX(${percent / 100})` }} /></div>
      <div className="vd-readiness-stage"><LoaderCircle className="v-spin" size={17} /><strong>{stage}</strong><b>{percent}%</b></div>
      <ul>
        <li className={loaded.photo >= totals.photo ? 'is-ready' : ''}>{loaded.photo >= totals.photo ? <Check size={15} /> : <Image size={15} />}<span>All photographs · {loaded.photo}/{totals.photo}</span></li>
        {Boolean(totals.soundtrack) && <li className={loaded.soundtrack >= totals.soundtrack ? 'is-ready' : ''}>{loaded.soundtrack >= totals.soundtrack ? <Check size={15} /> : <Music2 size={15} />}<span>Soundtrack</span></li>}
        {Boolean(totals.narration) && <li className={loaded.narration >= totals.narration ? 'is-ready' : ''}>{loaded.narration >= totals.narration ? <Check size={15} /> : <Mic2 size={15} />}<span>Narration</span></li>}
      </ul>
      {blocked && <div className="vd-readiness-slow"><p>We could not finish {failedItems.length ? failedItems.join(', ') : 'every file'} yet. Nothing is opened until the complete delivery is ready.</p><button type="button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} />Try loading again</button></div>}
    </section>
  </main>;
}

export default function DeliveryViewer() {
  const { publicId } = useParams();
  const [delivery, setDelivery] = useState(null);
  const [locked, setLocked] = useState(false);
  const [lockedBrand, setLockedBrand] = useState(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liked, setLiked] = useState(new Set());
  const [busy, setBusy] = useState('');
  const [experienceReady, setExperienceReady] = useState(false);
  const [preloadedMedia, setPreloadedMedia] = useState({ assets: {}, soundtrack: '', narration: '' });

  const [audioState, setAudioState] = useState({ playing: '', loading: '' });
  const [narrationCue, setNarrationCue] = useState(null);
  const soundtrackRef = useRef(null);
  const narrationRef = useRef(null);
  const narrationInteractionRef = useRef(false);

  const toggleAudio = async kind => {
    const selected = kind === 'narration' ? narrationRef.current : soundtrackRef.current;
    const other = kind === 'narration' ? soundtrackRef.current : narrationRef.current;
    if (!selected) return;
    if (audioState.playing === kind || audioState.loading === kind) {
      selected.pause();
      if (kind === 'narration' && soundtrackRef.current && !soundtrackRef.current.paused) {
        fadeAudioVolume(soundtrackRef.current, 1);
        setAudioState({ playing: 'soundtrack', loading: '' });
      } else {
        setAudioState({ playing: '', loading: '' });
      }
      return;
    }
    try {
      if (kind === 'narration' && soundtrackRef.current && !soundtrackRef.current.paused) {
        fadeAudioVolume(soundtrackRef.current, .16, 520);
      } else {
        other?.pause();
      }
      setAudioState(current => ({ ...current, loading: kind }));
      await selected.play();
      setAudioState({ playing: kind, loading: '' });
    } catch {
      setAudioState({ playing: '', loading: '' });
      toast.info(`The ${kind === 'narration' ? 'narration' : 'music'} did not load. Check your connection and try again.`);
    }
  };

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/v1/deliveries/public/${publicId}`, {
        headers: accessHeaders(publicId)
      });
      if (response.data.data.locked) {
        setLocked(true);
        setLockedBrand(response.data.data.branding);
        setDelivery(null);
      } else {
        const current = response.data.data;
        setDelivery(current.soundtrack?.url ? { ...current, soundtrack: { ...current.soundtrack, url: apiMediaUrl(current.soundtrack.url) } } : current);
        setPreloadedMedia({ assets: {}, soundtrack: '', narration: '' });
        setExperienceReady(false);
        setLocked(false);
        document.title = `${response.data.data.title} · Veylo`;
      }
    } catch (requestError) {
      setError(apiMessage(requestError, 'This delivery is not available.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const grant = new URLSearchParams(window.location.search).get('share');
    if (grant && /^[A-Za-z0-9_-]{30,100}$/.test(grant)) sessionStorage.setItem(`veylo_delivery_grant_${publicId}`, grant);
    load();
  }, [publicId]);

  useEffect(() => () => {
    Object.values(preloadedMedia.assets || {}).forEach(url => { if (String(url).startsWith('blob:')) URL.revokeObjectURL(url); });
    [preloadedMedia.soundtrack, preloadedMedia.narration].forEach(url => { if (String(url).startsWith('blob:')) URL.revokeObjectURL(url); });
  }, [preloadedMedia]);

  useEffect(() => {
    narrationInteractionRef.current = false;
  }, [delivery?.publicId]);

  useEffect(() => {
    if (!experienceReady || !delivery?.narration?.url || delivery.format === 'photo-story') return undefined;
    const startNarration = event => {
      if (narrationInteractionRef.current || event.target?.closest?.('input, textarea, select')) return;
      narrationInteractionRef.current = true;
      toggleAudio('narration');
      window.removeEventListener('pointerdown', startNarration, { capture: true });
      window.removeEventListener('keydown', startNarration, { capture: true });
    };
    window.addEventListener('pointerdown', startNarration, { capture: true });
    window.addEventListener('keydown', startNarration, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', startNarration, { capture: true });
      window.removeEventListener('keydown', startNarration, { capture: true });
    };
  }, [experienceReady, delivery?.publicId, delivery?.format, delivery?.narration?.url, toggleAudio]);

  useEffect(() => {
    if (!delivery || !experienceReady || !delivery.assets?.length) return undefined;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType)) return undefined;
    const cleanup = [];
    const remaining = [...delivery.assets]
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      .slice(4, 12);
    let cancelled = false;
    let index = 0;
    const loadNext = () => {
      if (cancelled || index >= remaining.length) return;
      const asset = remaining[index++];
      preloadImage(displayAssetUrl(asset), cleanup).finally(() => {
        if (!cancelled) window.setTimeout(loadNext, 80);
      });
    };
    const schedule = window.requestIdleCallback
      ? window.requestIdleCallback(loadNext, { timeout: 1200 })
      : window.setTimeout(loadNext, 500);
    return () => {
      cancelled = true;
      if (window.cancelIdleCallback && typeof schedule === 'number') window.cancelIdleCallback(schedule);
      else window.clearTimeout(schedule);
      cleanup.forEach(dispose => dispose());
    };
  }, [delivery, experienceReady]);

  async function unlock(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`/v1/deliveries/public/${publicId}/unlock`, { pin });
      sessionStorage.setItem(`veylo_delivery_${publicId}`, response.data.data.accessToken);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, 'That PIN is not correct.'));
      setLoading(false);
    }
  }

  const handleAudioWaiting = kind => {
    setAudioState(current => (
      current.playing === kind || current.loading === kind
        ? { ...current, loading: kind }
        : current
    ));
  };

  const handleAudioPlaying = kind => {
    setAudioState({ playing: kind, loading: '' });
  };

  const handleAudioError = kind => {
    setAudioState(current => (
      current.playing === kind || current.loading === kind
        ? { playing: '', loading: '' }
        : current
    ));
  };

  const syncNarrationCue = event => {
    const time = Number(event.currentTarget.currentTime || 0);
    const cue = (delivery?.narration?.segments || []).find(segment => time >= Number(segment.startSec || 0) && time < Number(segment.endSec || 0));
    setNarrationCue(cue || null);
  };

  const seekNarrationToAssets = assetIds => {
    const narration = narrationRef.current;
    const wanted = new Set((Array.isArray(assetIds) ? assetIds : [assetIds]).map(String));
    const segment = (delivery?.narration?.segments || []).find(item => (item.assetIds || []).some(id => wanted.has(String(id))));
    if (!narration || !segment) return;
    narration.currentTime = Number(segment.startSec || 0);
    if (audioState.playing === 'narration') narration.play().catch(() => {});
  };

  async function handleLike(assetId) {
    try {
      const response = await api.post(
        `/v1/deliveries/public/${delivery.publicId}/photos/${assetId}/like`,
        {},
        { headers: accessHeaders(delivery.publicId) }
      );
      setLiked(current => {
        const next = new Set(current);
        response.data.data.liked ? next.add(assetId) : next.delete(assetId);
        return next;
      });
    } catch (err) {
      toast.error(apiMessage(err, 'We could not update that photograph.'));
    }
  }

  async function handleDownload(assetId) {
    setBusy(assetId);
    try {
      const response = await api.get(
        `/v1/deliveries/public/${delivery.publicId}/photos/${assetId}/download`,
        { headers: accessHeaders(delivery.publicId) }
      );
      const url = response.data.data.url;
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = `photo-${assetId}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error(apiMessage(err, 'We could not prepare that download.'));
    } finally {
      setBusy('');
    }
  }

  async function handleDownloadAll() {
    setBusy('all');
    try {
      const response = await api.get(
        `/v1/deliveries/public/${delivery.publicId}/download-all`,
        { headers: accessHeaders(delivery.publicId) }
      );
      const url = response.data.data.url;
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = `${(delivery.clientName || 'gallery').replace(/[^a-z0-9_-]/gi, '_')}-photographs.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.info('Gallery download started. Check your browser downloads.');
    } catch (err) {
      toast.error(apiMessage(err, 'We could not prepare the full gallery.'));
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div className="vd-state">
        <LoaderCircle className="v-spin" size={28} />
        <span>Opening your photographs…</span>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="vd-gate">
        <img src={lockedBrand?.logoUrl || '/veylo/veylo-mark.svg'} alt="" />
        <p>{lockedBrand?.name ? `${lockedBrand.name.toUpperCase()} · PRIVATE DELIVERY` : 'PRIVATE CLIENT DELIVERY'}</p>
        <h1>Enter the six-digit PIN.</h1>
        <span>The photographer protected this delivery. Use the PIN sent with your link.</span>
        <form onSubmit={unlock}>
          <input
            value={pin}
            onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            autoFocus
          />
          <button disabled={pin.length !== 6}>
            Open delivery<ArrowRight size={17} />
          </button>
        </form>
        {error && <small role="alert">{error}</small>}
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="vd-state">
        <Image size={28} />
        <strong>This delivery is not available.</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (!Array.isArray(delivery.assets) || delivery.assets.length === 0) {
    return <div className="vd-state"><Image size={28} /><strong>No photographs are available in this view.</strong><span>The photographer's access link does not include any finished photographs.</span></div>;
  }

  if (!experienceReady) {
    return <DeliveryReadiness delivery={delivery} onReady={media => { setPreloadedMedia(media); setExperienceReady(true); }} />;
  }

  const format = delivery.format || 'photo-story';
  const playbackDelivery = {
    ...delivery,
    assets: (delivery.assets || []).map(asset => {
      const url = preloadedMedia.assets?.[asset.assetId] || asset.url;
      return { ...asset, url, thumbnailUrl: url, srcSet: undefined };
    }),
    soundtrack: delivery.soundtrack?.url ? { ...delivery.soundtrack, url: preloadedMedia.soundtrack || delivery.soundtrack.url } : delivery.soundtrack,
    narration: delivery.narration?.url ? { ...delivery.narration, url: preloadedMedia.narration || apiMediaUrl(delivery.narration.url) } : delivery.narration
  };
  const galleryProps = {
    liked,
    onLike: handleLike,
    onDownload: handleDownload,
    onDownloadAll: handleDownloadAll,
    busy
  };

  const sharedProps = {
    delivery,
    galleryProps,
    audioState,
    toggleAudio,
    narrationRef,
    onNarrationNavigate: seekNarrationToAssets
  };

  const content = <DeliveryFormatViewer format={format} {...sharedProps} delivery={playbackDelivery} />;

  return (
    <>
      {playbackDelivery.soundtrack?.url && !['photo-reveal', 'album', 'photo-story'].includes(format) && (
        <audio
          ref={soundtrackRef}
          src={playbackDelivery.soundtrack.url}
          preload="auto"
          loop
          onWaiting={() => handleAudioWaiting('soundtrack')}
          onStalled={() => handleAudioWaiting('soundtrack')}
          onPlaying={() => handleAudioPlaying('soundtrack')}
          onError={() => handleAudioError('soundtrack')}
          onEnded={() => setAudioState({ playing: '', loading: '' })}
        />
      )}
      {playbackDelivery.narration?.url && !['photo-story'].includes(format) && (
        <audio
          ref={narrationRef}
          src={playbackDelivery.narration.url}
          preload="auto"
          onWaiting={() => handleAudioWaiting('narration')}
          onStalled={() => handleAudioWaiting('narration')}
          onPlaying={() => handleAudioPlaying('narration')}
          onTimeUpdate={syncNarrationCue}
          onError={() => handleAudioError('narration')}
          onEnded={() => {
            setNarrationCue(null);
            if (soundtrackRef.current && !soundtrackRef.current.paused) {
              fadeAudioVolume(soundtrackRef.current, 1);
              setAudioState({ playing: 'soundtrack', loading: '' });
            } else {
              setAudioState({ playing: '', loading: '' });
            }
          }}
        />
      )}

      {delivery.viewer && <aside className="vd-role-notice"><strong>{delivery.viewer.label}</strong><span>{delivery.viewer.role} access</span>{delivery.viewer.usageTerms && <p>{delivery.viewer.usageTerms}</p>}</aside>}
      {format !== 'photo-story' && audioState.playing === 'narration' && narrationCue?.text && <aside className="vd-narration-cue" aria-live="polite"><span>READING THE APPROVED CAPTION</span><p>{narrationCue.text}</p></aside>}
      {content}
    </>
  );
}
