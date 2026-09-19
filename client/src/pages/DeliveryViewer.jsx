import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Check, Image, LoaderCircle, Mic2, Music2 } from 'lucide-react';
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
function apiMediaUrl(value) {
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

function preloadImage(url, cleanup) {
  return new Promise(resolve => {
    if (!url) return resolve(false);
    const image = new window.Image();
    let settled = false;
    const finish = async ok => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (ok && image.decode) await image.decode().catch(() => {});
      resolve(ok);
    };
    const timeout = window.setTimeout(() => finish(false), 15000);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.decoding = 'async';
    image.src = url;
    cleanup.push(() => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      image.src = '';
    });
  });
}

function preloadAudio(url, cleanup) {
  return new Promise(resolve => {
    if (!url) return resolve(false);
    const audio = new Audio();
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      audio.oncanplay = null;
      audio.oncanplaythrough = null;
      audio.onerror = null;
      resolve(ok);
    };
    const timeout = window.setTimeout(() => finish(false), 15000);
    audio.preload = 'auto';
    audio.oncanplay = () => finish(true);
    audio.oncanplaythrough = () => finish(true);
    audio.onerror = () => finish(false);
    audio.src = url;
    audio.load();
    cleanup.push(() => {
      window.clearTimeout(timeout);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    });
  });
}

function DeliveryReadiness({ delivery, onReady }) {
  const sortedAssets = [...(delivery.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const openingAssets = sortedAssets.slice(0, 4);
  const totals = {
    photo: openingAssets.length,
    soundtrack: delivery.soundtrack?.url ? 1 : 0,
    narration: delivery.narration?.url ? 1 : 0
  };
  const total = Math.max(1, totals.photo + totals.soundtrack + totals.narration);
  const [loaded, setLoaded] = useState({ photo: 0, soundtrack: 0, narration: 0, total: 0, failed: 0 });
  const [slow, setSlow] = useState(false);
  const openedRef = useRef(false);

  const open = () => {
    if (openedRef.current) return;
    openedRef.current = true;
    onReady();
  };

  useEffect(() => {
    const cleanup = [];
    let active = true;
    const slowTimer = window.setTimeout(() => { if (active) setSlow(true); }, 9000);
    const tasks = [
      ...openingAssets.map(asset => ({ kind: 'photo', run: () => preloadImage(displayAssetUrl(asset), cleanup) })),
      ...(delivery.soundtrack?.url ? [{ kind: 'soundtrack', run: () => preloadAudio(delivery.soundtrack.url, cleanup) }] : []),
      ...(delivery.narration?.url ? [{ kind: 'narration', run: () => preloadAudio(apiMediaUrl(delivery.narration.url), cleanup) }] : [])
    ];

    if (!tasks.length) {
      const readyTimer = window.setTimeout(open, 250);
      cleanup.push(() => window.clearTimeout(readyTimer));
    } else {
      Promise.all(tasks.map(async task => {
        const ok = await task.run();
        if (!active) return;
        setLoaded(current => ({
          ...current,
          [task.kind]: current[task.kind] + 1,
          total: current.total + 1,
          failed: current.failed + (ok ? 0 : 1)
        }));
      })).then(() => {
        if (!active) return;
        window.clearTimeout(slowTimer);
        const readyTimer = window.setTimeout(open, 350);
        cleanup.push(() => window.clearTimeout(readyTimer));
      });
    }

    return () => {
      active = false;
      window.clearTimeout(slowTimer);
      cleanup.forEach(dispose => dispose());
    };
  }, [delivery.publicId]);

  const percent = Math.min(100, Math.round((loaded.total / total) * 100));
  const stage = loaded.photo < totals.photo
    ? 'Preparing the opening photographs'
    : loaded.soundtrack < totals.soundtrack
      ? 'Buffering the soundtrack'
      : loaded.narration < totals.narration
        ? 'Preparing the narration'
        : loaded.failed
          ? 'Finishing the delivery'
          : 'Your delivery is ready';

  return <main className="vd-readiness" role="status" aria-live="polite">
    <div className="vd-readiness-ambient" aria-hidden="true" />
    <section>
      <img src={delivery.branding?.logoUrl || '/veylo/veylo-mark.svg'} alt="" />
      <p>{delivery.branding?.name || 'Veylo'} · PRIVATE DELIVERY</p>
      <h1>Preparing {delivery.clientName ? `${delivery.clientName}’s` : 'your'} photographs.</h1>
      <span>We’re getting the opening photographs, music, and narration ready before the experience begins.</span>
      <div className="vd-readiness-progress" aria-label={`${percent}% prepared`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent} role="progressbar"><i style={{ transform: `scaleX(${percent / 100})` }} /></div>
      <div className="vd-readiness-stage"><LoaderCircle className="v-spin" size={17} /><strong>{stage}</strong><b>{percent}%</b></div>
      <ul>
        <li className={loaded.photo >= totals.photo ? 'is-ready' : ''}>{loaded.photo >= totals.photo ? <Check size={15} /> : <Image size={15} />}<span>Opening photographs</span></li>
        {Boolean(totals.soundtrack) && <li className={loaded.soundtrack >= totals.soundtrack ? 'is-ready' : ''}>{loaded.soundtrack >= totals.soundtrack ? <Check size={15} /> : <Music2 size={15} />}<span>Soundtrack</span></li>}
        {Boolean(totals.narration) && <li className={loaded.narration >= totals.narration ? 'is-ready' : ''}>{loaded.narration >= totals.narration ? <Check size={15} /> : <Mic2 size={15} />}<span>Narration</span></li>}
      </ul>
      {slow && <div className="vd-readiness-slow"><p>This connection is taking a little longer. You can keep waiting for the smoothest opening, or open the delivery while the remaining files load.</p><button type="button" onClick={open}>Open delivery<ArrowRight size={16} /></button></div>}
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

  const [audioState, setAudioState] = useState({ playing: '', loading: '' });
  const soundtrackRef = useRef(null);
  const narrationRef = useRef(null);

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

  if (!experienceReady) {
    return <DeliveryReadiness delivery={delivery} onReady={() => setExperienceReady(true)} />;
  }

  const format = delivery.format || 'photo-story';
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
    toggleAudio
  };

  const content = <DeliveryFormatViewer format={format} {...sharedProps} />;

  return (
    <>
      {delivery.soundtrack?.url && !['photo-reveal', 'album', 'photo-story'].includes(format) && (
        <audio
          ref={soundtrackRef}
          src={delivery.soundtrack.url}
          preload="metadata"
          loop
          onWaiting={() => handleAudioWaiting('soundtrack')}
          onStalled={() => handleAudioWaiting('soundtrack')}
          onPlaying={() => handleAudioPlaying('soundtrack')}
          onError={() => handleAudioError('soundtrack')}
          onEnded={() => setAudioState({ playing: '', loading: '' })}
        />
      )}
      {delivery.narration?.url && !['photo-story'].includes(format) && (
        <audio
          ref={narrationRef}
          src={delivery.narration.url}
          preload="metadata"
          onWaiting={() => handleAudioWaiting('narration')}
          onStalled={() => handleAudioWaiting('narration')}
          onPlaying={() => handleAudioPlaying('narration')}
          onError={() => handleAudioError('narration')}
          onEnded={() => {
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
      {content}
    </>
  );
}
