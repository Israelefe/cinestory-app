import { useEffect, useRef, useState } from 'react';

// Decode the next responsive photograph before the scene transition begins.
// The previous scene stays visible while a requested photograph is still loading.
export function usePreparedStoryPhotos(photos, index, resolveUrl, { enabled = true, closingPhoto } = {}) {
  const cache = useRef(new Map());
  const [presented, setPresented] = useState(null);
  const [, refresh] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const sizes = '(max-width: 767px) 100vw, 52vw';
  const keyFor = photo => photo?.url ? `${resolveUrl(photo.url)}|${photo.srcSet || ''}|${sizes}` : '';
  const requestedKey = keyFor(photos[index]);
  const current = cache.current.get(requestedKey);
  const ready = current?.status === 'ready';
  const closingKey = keyFor(closingPhoto);
  const closing = cache.current.get(closingKey);
  const hasPrevious = presented?.photos === photos;
  const shownIndex = ready ? index : hasPrevious ? presented.index : index;

  useEffect(() => {
    if (!enabled || !requestedKey) return undefined;
    let active = true;
    function prepare(photo, priority) {
      const key = keyFor(photo);
      if (!key) return Promise.resolve(false);
      const existing = cache.current.get(key);
      if (existing) {
        if (priority === 'high') existing.image.fetchPriority = 'high';
        return existing.promise;
      }
      const image = new window.Image();
      const entry = { image, status: 'loading', promise: null };
      entry.promise = new Promise(resolve => {
        const settle = success => {
          image.onload = null;
          image.onerror = null;
          entry.status = success ? 'ready' : 'error';
          resolve(success);
        };
        image.onload = async () => {
          try { await image.decode?.(); } catch { /* A loaded photograph can still be shown if decode is unavailable. */ }
          settle(image.naturalWidth > 0);
        };
        image.onerror = () => settle(false);
        image.decoding = 'async';
        image.fetchPriority = priority;
        image.sizes = sizes;
        if (photo.srcSet) image.srcset = photo.srcSet;
        image.src = resolveUrl(photo.url);
      });
      cache.current.set(key, entry);
      return entry.promise;
    }
    prepare(photos[index], 'high').then(success => {
      if (!active) return;
      if (success) {
        setPresented({ photos, index });
        // Fetch one upcoming photograph, not the full collection.
        prepare(photos[index + 1] || closingPhoto, 'low').then(() => { if (active) refresh(value => value + 1); });
        if (cache.current.size > 8) {
          const keep = new Set([requestedKey, keyFor(photos[index - 1]), keyFor(photos[index + 1]), keyFor(closingPhoto)]);
          for (const [key, entry] of cache.current) if (!keep.has(key) && entry.status !== 'loading') cache.current.delete(key);
        }
      }
      refresh(value => value + 1);
    });
    return () => { active = false; };
  }, [photos, index, requestedKey, enabled, closingPhoto, attempt]);

  return {
    shownIndex,
    hasShownPhoto: ready || hasPrevious,
    waiting: Boolean(requestedKey && !ready),
    failed: current?.status === 'error',
    closingReady: !closingKey || closing?.status === 'ready',
    closingFailed: closing?.status === 'error',
    retry: () => { cache.current.delete(requestedKey); setAttempt(value => value + 1); },
    retryClosing: () => { cache.current.delete(closingKey); setAttempt(value => value + 1); }
  };
}
