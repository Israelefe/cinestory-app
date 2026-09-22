import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Check, Image, LoaderCircle, Mic2, Music2, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { API_BASE_URL } from '../config/env.js';
import { trackEvent } from '../services/analytics.js';
import { DeliveryFormatViewer } from '../components/delivery/viewerRegistry.jsx';
import DeliveryBrandMark from '../components/delivery/DeliveryBrandMark.jsx';
import { getDeliveryCapabilities } from '../constants/deliveryCapabilities.js';
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

function downloadFilename(asset, index, clientName = 'photographs') {
  const original = String(asset?.originalFilename || '').trim();
  if (original && original.includes('.')) return original.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180);
  const base = String(clientName || 'photographs').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || 'photographs';
  return `${base}-${String(index + 1).padStart(2, '0')}.jpg`;
}

function startBrowserDownload(url, filename) {
  if (!url) throw new Error('The download link was empty.');
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  if (!String(url).startsWith('blob:')) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function prepareShareFile(item) {
  const response = await fetch(item.url, { credentials: 'omit', cache: 'force-cache' });
  if (!response.ok) throw new Error(`Photograph returned ${response.status}.`);
  const blob = await response.blob();
  if (!blob.size) throw new Error('The photograph was empty.');
  return new File([blob], item.filename, { type: blob.type || 'image/jpeg' });
}

function canShareFiles(files) {
  return typeof File !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files });
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
  const capabilities = getDeliveryCapabilities(delivery?.format);
  const sortedAssets = [...(delivery.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const mediaKey = [
    delivery.publicId || delivery._id || 'draft',
    delivery.format || '',
    capabilities.music ? delivery.soundtrack?.url || '' : '',
    capabilities.narration ? delivery.narration?.url || '' : '',
    ...sortedAssets.map(asset => `${asset.assetId}:${asset.url || ''}`)
  ].join('|');
  const totals = {
    photo: sortedAssets.length,
    soundtrack: capabilities.music && delivery.soundtrack?.url ? 1 : 0,
    narration: capabilities.narration && delivery.narration?.url ? 1 : 0
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
    trackEvent('client.preloader.started', { photos: totals.photo, soundtrack: Boolean(totals.soundtrack), narration: Boolean(totals.narration) }, { format: delivery.format, status: 'started', count: total });
    const tasks = [
      ...(totals.soundtrack ? [{ kind: 'soundtrack', label: 'Soundtrack', run: () => preloadAudio(apiMediaUrl(delivery.soundtrack.url), cleanup) }] : []),
      ...(totals.narration ? [{ kind: 'narration', label: 'Narration', run: () => preloadAudio(apiMediaUrl(delivery.narration.url), cleanup) }] : []),
      ...sortedAssets.map((asset, index) => ({ kind: 'photo', key: asset.assetId, label: asset.originalFilename || asset.filename || `Photograph ${index + 1}`, run: () => preloadImage(apiMediaUrl(asset.url), cleanup) }))
    ];

    if (!tasks.length) {
      const readyTimer = window.setTimeout(() => { transferred = true; trackEvent('client.preloader.completed', { photos: totals.photo }, { format: delivery.format, status: 'completed', count: total }); open(); }, 250);
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
          trackEvent('client.preloader.failed', { failedFiles: failed }, { format: delivery.format, status: 'failed', errorCode: 'MEDIA_PRELOAD_FAILED', count: failed });
          return;
        }
        const readyTimer = window.setTimeout(() => { transferred = true; trackEvent('client.preloader.completed', { photos: totals.photo }, { format: delivery.format, status: 'completed', count: total }); open(); }, 350);
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
      <DeliveryBrandMark branding={delivery.branding} />
      <p>{delivery.branding?.name || 'Veylo'} · PRIVATE DELIVERY</p>
      <h1>Preparing {delivery.clientName ? `${delivery.clientName}’s` : 'your'} photographs.</h1>
      <span>{totals.soundtrack && totals.narration ? 'We’re preparing every photograph, the music, and the narration before the experience begins.' : totals.soundtrack ? 'We’re preparing every photograph and the selected music before the experience begins.' : totals.narration ? 'We’re preparing every photograph and the narration before the experience begins.' : 'We’re preparing every photograph before the experience begins.'}</span>
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
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [downloadNotice, setDownloadNotice] = useState('');
  const [experienceReady, setExperienceReady] = useState(false);
  const [preloadedMedia, setPreloadedMedia] = useState({ assets: {}, soundtrack: '', narration: '' });

  const [audioState, setAudioState] = useState({ playing: '', loading: '' });
  const [narrationCue, setNarrationCue] = useState(null);
  const soundtrackRef = useRef(null);
  const narrationRef = useRef(null);

  const toggleAudio = async kind => {
    const capabilities = getDeliveryCapabilities(delivery?.format);
    if ((kind === 'soundtrack' && !capabilities.music) || (kind === 'narration' && !capabilities.narration)) return;
    const selected = kind === 'narration' ? narrationRef.current : soundtrackRef.current;
    const other = kind === 'narration' ? soundtrackRef.current : narrationRef.current;
    if (!selected) return;
    if (audioState.playing === kind || audioState.loading === kind) {
      selected.pause();
      trackEvent(kind === 'narration' ? 'client.narration.paused' : 'client.music.paused', { format: delivery?.format }, { format: delivery?.format, status: 'paused' });
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
      const resuming = Number(selected.currentTime || 0) > 0.2;
      await selected.play();
      setAudioState({ playing: kind, loading: '' });
      trackEvent(resuming ? (kind === 'narration' ? 'client.narration.resumed' : 'client.music.started') : (kind === 'narration' ? 'client.narration.started' : 'client.music.started'), { format: delivery?.format }, { format: delivery?.format, status: resuming ? 'resumed' : 'started' });
    } catch {
      setAudioState({ playing: '', loading: '' });
      trackEvent(kind === 'narration' ? 'client.narration.failed' : 'client.music.failed', { format: delivery?.format }, { format: delivery?.format, status: 'failed', errorCode: 'AUDIO_PLAY_FAILED' });
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
        trackEvent('client.delivery.opened', { access: 'link' }, { format: current.format, status: 'opened' });
        document.title = `${response.data.data.title} · Veylo`;
      }
    } catch (requestError) {
      setError(apiMessage(requestError, 'This delivery is not available.'));
      trackEvent('client.delivery.load.failed', {}, { status: 'failed', errorCode: requestError.response?.data?.code || 'DELIVERY_LOAD_FAILED' });
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
    if (!experienceReady || !delivery?.format) return;
    trackEvent('client.format.opened', { format: delivery.format }, { format: delivery.format, status: 'opened' });
    trackEvent('client.first.photo.shown', { format: delivery.format }, { format: delivery.format, status: 'shown', count: 1 });
  }, [delivery?.format, experienceReady]);

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
      trackEvent('client.pin.succeeded', {}, { status: 'succeeded' });
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, 'That PIN is not correct.'));
      trackEvent('client.pin.failed', {}, { status: 'failed', errorCode: requestError.response?.data?.code || 'PIN_INVALID' });
      setLoading(false);
    }
  }

  const handleAudioWaiting = kind => {
    setAudioState(current => (
      current.playing === kind || current.loading === kind
        ? { ...current, loading: kind }
        : current
    ));
    trackEvent(kind === 'narration' ? 'client.narration.started' : 'client.music.started', { phase: 'buffering' }, { status: 'loading' });
  };

  const handleAudioPlaying = kind => {
    setAudioState({ playing: kind, loading: '' });
    trackEvent(kind === 'narration' ? 'client.narration.started' : 'client.music.started', {}, { status: 'playing' });
  };

  const handleAudioError = kind => {
    setAudioState(current => (
      current.playing === kind || current.loading === kind
        ? { playing: '', loading: '' }
        : current
    ));
    trackEvent(kind === 'narration' ? 'client.narration.failed' : 'client.music.failed', {}, { status: 'failed', errorCode: 'AUDIO_LOAD_FAILED' });
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
    const count = Array.isArray(assetIds) ? assetIds.length : 1;
    trackEvent('client.photo.reveal.advanced', { format: delivery?.format, count }, { format: delivery?.format, status: 'advanced', count });
    if (delivery?.format === 'chapters') trackEvent('client.chapter.opened', { count }, { format: delivery.format, status: 'opened', count });
    if (delivery?.format === 'album') trackEvent('client.album.page.turned', { count }, { format: delivery.format, status: 'turned', count });
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
      trackEvent(response.data.data.liked ? 'client.like.added' : 'client.like.removed', { assetCount: 1 }, { format: delivery?.format, status: response.data.data.liked ? 'added' : 'removed', count: 1 });
    } catch (err) {
      toast.error(apiMessage(err, 'We could not update that photograph.'));
    }
  }

  const deliveryAssets = [...(delivery?.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));

  async function requestPhotoDownload(asset, index) {
    const assetId = asset?.assetId;
    if (!assetId) throw new Error('Photograph not found.');
    const response = await api.get(
      `/v1/deliveries/public/${delivery.publicId}/photos/${assetId}/download`,
      { headers: accessHeaders(delivery.publicId) }
    );
    return { assetId, url: response.data?.data?.url, filename: downloadFilename(asset, index, delivery.clientName) };
  }

  async function recordPhotoDownload(assetId) {
    if (!assetId) return;
    await api.post(
      `/v1/deliveries/public/${delivery.publicId}/photos/${encodeURIComponent(assetId)}/downloaded`,
      {},
      { headers: accessHeaders(delivery.publicId) }
    ).catch(() => {});
  }

  async function handleDownload(assetId, index = 0) {
    const asset = deliveryAssets.find(item => String(item.assetId) === String(assetId)) || deliveryAssets[index];
    setBusy(assetId);
    setDownloadNotice('The photograph is downloading on its own. On iPhone or iPad, use Share then Save to Files if Safari opens it instead.');
    try {
      const prepared = await requestPhotoDownload(asset, deliveryAssets.indexOf(asset) >= 0 ? deliveryAssets.indexOf(asset) : index);
      startBrowserDownload(prepared.url, prepared.filename);
      void recordPhotoDownload(prepared.assetId);
      trackEvent('client.photo.download.started', { downloadType: 'individual' }, { format: delivery?.format, status: 'completed', count: 1 });
      toast.info('Download started. Check your Downloads or Files app.');
    } catch (err) {
      trackEvent('client.photo.download.failed', { downloadType: 'individual' }, { format: delivery?.format, status: 'failed', errorCode: err.response?.data?.code || 'DOWNLOAD_FAILED' });
      toast.error(apiMessage(err, 'We could not prepare that download.'));
    } finally {
      setBusy('');
    }
  }

  async function handleDownloadAll() {
    if (busy === 'all' || downloadProgress) return;
    const assets = deliveryAssets;
    if (!assets.length) return;
    let failed = 0;
    setBusy('all');
    trackEvent('client.download.all.started', { count: assets.length }, { format: delivery?.format, status: 'started', count: assets.length });
    setDownloadProgress({ current: 0, total: assets.length, failed: 0 });
    setDownloadNotice('Each photograph downloads separately. Android may ask you to allow multiple downloads. On iPhone or iPad, Safari may stop after one; use the individual Download buttons if that happens.');
    try {
      const prepared = [];
      for (let index = 0; index < assets.length; index += 1) {
        try {
          prepared.push(await requestPhotoDownload(assets[index], index));
        } catch {
          failed += 1;
        }
        setDownloadProgress({ current: index + 1, total: assets.length, failed });
      }
      let shared = false;
      let shareFiles = null;
      if (prepared.length && prepared.length <= 40) {
        try {
          const files = [];
          for (let index = 0; index < prepared.length; index += 1) {
            files.push(await prepareShareFile(prepared[index]));
            setDownloadProgress({ current: Math.min(assets.length, index + 1), total: assets.length, failed });
          }
          shareFiles = files;
          if (canShareFiles(files)) {
            await navigator.share({ title: `${delivery.clientName || 'Client'} photographs`, files });
            prepared.forEach(item => { void recordPhotoDownload(item.assetId); });
            shared = true;
            setDownloadNotice('Choose Save to Files or Photos in the share sheet to keep every photograph.');
          }
        } catch (shareError) {
          if (shareError?.name === 'AbortError') {
            setDownloadNotice('The share sheet was closed. Nothing was counted as downloaded.');
            return;
          }
        }
      }
      if (!shared) {
        for (let index = 0; index < prepared.length; index += 1) {
          const item = prepared[index];
          try {
            const file = shareFiles?.[index];
            const browserUrl = file ? URL.createObjectURL(file) : item.url;
            startBrowserDownload(browserUrl, item.filename);
            if (file) window.setTimeout(() => URL.revokeObjectURL(browserUrl), 30000);
            void recordPhotoDownload(item.assetId);
          } catch {
            failed += 1;
          }
          setDownloadProgress({ current: Math.min(assets.length, index + 1), total: assets.length, failed });
          if (index < prepared.length - 1) await new Promise(resolve => window.setTimeout(resolve, 250));
        }
      }
      const started = assets.length - failed;
      setDownloadNotice(shared && !failed
        ? 'Choose Save to Files or Photos in the share sheet to keep every photograph.'
        : failed
          ? `${started} download${started === 1 ? '' : 's'} started. ${failed} need another tap.`
          : 'Downloads started one at a time. Check your Downloads or Files app.');
      toast.info(shared ? 'All photographs are ready in the share sheet.' : failed ? `${started} downloads started. Try the remaining photographs individually.` : 'Downloads started one at a time. Check your Downloads or Files app.');
      trackEvent(failed ? 'client.download.all.partial_failed' : 'client.photo.download.started', { downloadType: 'all', count: started }, { format: delivery?.format, status: failed ? 'partial_failure' : 'completed', count: started });
    } finally {
      setBusy('');
      setDownloadProgress(null);
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
        <DeliveryBrandMark branding={lockedBrand} />
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
    return <DeliveryReadiness delivery={delivery} onReady={media => { setPreloadedMedia(media); setExperienceReady(true); trackEvent('client.experience.started', { format: delivery.format }, { format: delivery.format, status: 'started' }); }} />;
  }

  const format = delivery.format || 'photo-story';
  const capabilities = getDeliveryCapabilities(format);
  const playbackDelivery = {
    ...delivery,
    assets: (delivery.assets || []).map(asset => {
      const url = preloadedMedia.assets?.[asset.assetId] || asset.url;
      return { ...asset, url, thumbnailUrl: url, srcSet: undefined };
    }),
    soundtrack: capabilities.music && delivery.soundtrack?.url ? { ...delivery.soundtrack, url: preloadedMedia.soundtrack || delivery.soundtrack.url } : undefined,
    narration: capabilities.narration && delivery.narration?.url ? { ...delivery.narration, url: preloadedMedia.narration || apiMediaUrl(delivery.narration.url) } : undefined
  };
  const galleryProps = {
    liked,
    onLike: handleLike,
    onDownload: handleDownload,
    onDownloadAll: handleDownloadAll,
    busy,
    downloadNotice,
    downloadProgress
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
      {playbackDelivery.soundtrack?.url && capabilities.soundtrackOwner === 'viewer' && (
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
      {playbackDelivery.narration?.url && capabilities.narrationOwner === 'viewer' && (
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
      {capabilities.narration && audioState.playing === 'narration' && narrationCue?.text && <aside className="vd-narration-cue" aria-live="polite"><span>READING THE APPROVED CAPTION</span><p>{narrationCue.text}</p></aside>}
      {content}
    </>
  );
}
