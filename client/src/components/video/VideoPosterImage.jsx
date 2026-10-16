import React, { useEffect, useRef, useState } from 'react';
import { Film, LoaderCircle } from 'lucide-react';
import api from '../../services/api.js';
import { API_BASE_URL } from '../../config/env.js';
import { videoMediaUrl } from '../../services/videoDelivery.js';
import './VideoPosterImage.css';

const RETRY_DELAYS = [400, 1200, 3000];

function ownerPosterPath(url) {
  const base = new URL(API_BASE_URL, window.location.href);
  const image = new URL(url, window.location.href);
  const prefix = base.pathname.replace(/\/$/, '');
  const path = image.pathname.slice(prefix.length);
  return image.origin === base.origin && image.pathname.startsWith(prefix + '/') && /^\/v1\/videos\/assets\/[a-f\d]{24}\/poster$/i.test(path)
    ? path + image.search : null;
}

function decodePosterResponse(data, headers) {
  // Axios must see JSON authentication errors even though a successful response
  // is an image, so its existing sign-in refresh can recover this request.
  if (String(headers['content-type'] || '').includes('application/json')) {
    try { return JSON.parse(new TextDecoder().decode(data)); } catch { return null; }
  }
  return data;
}

function PosterSource({ url, alt, loading, retryable, onRetry }) {
  const [source, setSource] = useState(url);
  const [status, setStatus] = useState(url ? 'loading' : 'unavailable');
  const [attempt, setAttempt] = useState(0);
  const attempts = useRef(0);
  const recover = () => {
    if (attempts.current >= RETRY_DELAYS.length) { setStatus('unavailable'); return; }
    setStatus('recovering');
    setAttempt(++attempts.current);
  };

  useEffect(() => {
    if (!attempt || !url) return undefined;
    const controller = new AbortController();
    let objectUrl;
    const timer = window.setTimeout(async () => {
      try {
        const path = ownerPosterPath(url);
        if (path) {
          const response = await api.get(path, {
            signal: controller.signal, timeout: 15000, responseType: 'arraybuffer',
            params: { coverRetry: `${Date.now()}-${attempt}` }, transformResponse: [decodePosterResponse]
          });
          if (controller.signal.aborted) return;
          const type = String(response.headers['content-type'] || '').split(';')[0];
          if (!(response.data instanceof ArrayBuffer) || !response.data.byteLength || response.data.byteLength > 2_000_000 || !/^image\/(webp|jpeg|png|avif)$/i.test(type)) throw new Error('The video cover could not be loaded.');
          objectUrl = URL.createObjectURL(new Blob([response.data], { type }));
          setSource(objectUrl);
        } else {
          const next = new URL(url, window.location.href);
          if (next.origin === window.location.origin) next.searchParams.set('coverRetry', `${Date.now()}-${attempt}`);
          setSource(next.href);
        }
        setStatus('loading');
      } catch {
        if (!controller.signal.aborted) recover();
      }
    }, RETRY_DELAYS[attempt - 1]);
    return () => { window.clearTimeout(timer); controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attempt, url]);

  useEffect(() => {
    if (status !== 'unavailable' || !url) return undefined;
    const retry = () => onRetry();
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    return () => { window.removeEventListener('online', retry); window.removeEventListener('focus', retry); };
  }, [status, url, onRetry]);

  return <>
    {source && status !== 'recovering' && status !== 'unavailable' && <img src={source} alt={alt} loading={loading} draggable={false}
      style={{ opacity: status === 'ready' ? 1 : 0 }} onLoad={() => setStatus('ready')} onError={recover} />}
    {status !== 'ready' && <span className="vc-poster-placeholder">
      {status === 'recovering' ? <LoaderCircle size={22} className="v-spin" /> : <Film size={26} />}
      {status === 'unavailable' && <small>Cover unavailable</small>}
      {status === 'unavailable' && retryable && url && <button type="button" onClick={onRetry}>Retry cover</button>}
    </span>}
  </>;
}

export default function VideoPosterImage({ src, alt = '', loading, retryable = false }) {
  const [cycle, setCycle] = useState(0);
  const wrapper = useRef(null);
  const url = videoMediaUrl(src) || '';
  return <span ref={wrapper} className="vc-poster-image" tabIndex={-1} role="group" aria-label="Video cover">
    <PosterSource key={`${url}:${cycle}`} url={url} alt={alt} loading={loading} retryable={retryable}
      onRetry={event => { if (event) wrapper.current?.focus({ preventScroll: true }); setCycle(value => value + 1); }} />
  </span>;
}
