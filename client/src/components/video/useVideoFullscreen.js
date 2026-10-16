import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../useDialogFocus.js';

export function useVideoFullscreen(container, video, trigger, item, onUnavailable) {
  const [mode, setMode] = useState('');
  const [orientation, setOrientation] = useState('');
  const currentMode = useRef('');
  const orientationOwned = useRef(false);
  const orientationRequest = useRef(0);
  const releaseOrientation = useCallback(() => {
    orientationRequest.current++;
    if (!orientationOwned.current) return;
    orientationOwned.current = false;
    try { window.screen.orientation?.unlock?.(); } catch { /* The browser may already have released its lock. */ }
  }, []);
  const closeOverlay = useCallback(() => {
    const node = container.current;
    if (currentMode.current !== 'overlay') return;
    currentMode.current = '';
    try { node?.hidePopover(); } catch { /* A removed player is already closed. */ }
    node?.removeAttribute('popover');
    setMode(''); setOrientation('');
  }, [container]);
  useDialogFocus(mode === 'overlay', container, closeOverlay, trigger);

  useEffect(() => {
    const node = container.current;
    const media = video.current;
    const reset = () => { currentMode.current = ''; setMode(''); setOrientation(''); releaseOrientation(); };
    const changed = () => {
      if (document.fullscreenElement === node) { currentMode.current = 'browser'; setMode('browser'); }
      else if (currentMode.current === 'browser') reset();
    };
    const nativeOpened = () => { currentMode.current = 'native'; setMode('native'); };
    const overlayChanged = event => {
      if (event.target === node && event.newState === 'closed' && currentMode.current === 'overlay') {
        node.removeAttribute('popover'); reset();
      }
    };
    document.addEventListener('fullscreenchange', changed);
    media?.addEventListener('webkitbeginfullscreen', nativeOpened);
    media?.addEventListener('webkitendfullscreen', reset);
    node?.addEventListener('toggle', overlayChanged);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      media?.removeEventListener('webkitbeginfullscreen', nativeOpened);
      media?.removeEventListener('webkitendfullscreen', reset);
      node?.removeEventListener('toggle', overlayChanged);
      releaseOrientation();
    };
  }, [container, video, releaseOrientation]);

  const toggle = async () => {
    const node = container.current;
    const media = video.current;
    if (!node || !media) return;
    try {
      if (currentMode.current === 'overlay') { closeOverlay(); return; }
      if (document.fullscreenElement === node) { await document.exitFullscreen(); return; }
      if (currentMode.current === 'native') { media.webkitExitFullscreen?.(); return; }
      const width = media.videoWidth || item.width;
      const height = media.videoHeight || item.height;
      const preferred = window.matchMedia('(any-pointer: coarse)').matches && width && height
        ? width > height ? 'landscape' : width < height ? 'portrait' : '' : '';
      setOrientation(preferred);
      if (node.requestFullscreen && document.fullscreenEnabled !== false) {
        try {
          await node.requestFullscreen();
          if (!node.isConnected || document.fullscreenElement !== node) return;
          if (preferred && typeof window.screen.orientation?.lock === 'function') {
            const ticket = ++orientationRequest.current;
            orientationOwned.current = true;
            try { await window.screen.orientation.lock(preferred); }
            catch { if (ticket === orientationRequest.current) orientationOwned.current = false; }
          }
          return;
        } catch { /* Keep the same video in a top-layer player when browser fullscreen is unavailable. */ }
      }
      if (node.showPopover) {
        node.setAttribute('popover', 'manual');
        node.showPopover();
        currentMode.current = 'overlay'; setMode('overlay');
      } else if (media.webkitEnterFullscreen) media.webkitEnterFullscreen();
      else { setOrientation(''); onUnavailable('Full screen is unavailable in this browser.'); }
    } catch { node.removeAttribute('popover'); setOrientation(''); onUnavailable('Full screen is unavailable in this browser.'); }
  };
  return { fullscreen: Boolean(mode), overlay: mode === 'overlay', orientation, toggle };
}
