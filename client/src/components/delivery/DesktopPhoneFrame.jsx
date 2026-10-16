import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './PhonePresentation.css';

const DESKTOP_QUERY = '(min-width: 1025px)';
const PREVIEW_READY = 'veylo:phone-preview-ready';
const PREVIEW_DATA = 'veylo:phone-preview-data';
const PHONE_FRAME_WIDTH = 436;
const PHONE_FRAME_HEIGHT = 894;

export function useDesktopPhoneMode() {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const update = event => setDesktop(event.matches);
    setDesktop(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return desktop;
}

export function DesktopPhoneFrame({ src, title, message, device = true, children }) {
  const frame = useRef(null);
  const phoneDevice = useRef(null);
  const ready = useRef(false);
  const [phoneScale, setPhoneScale] = useState(1);
  const messageRef = useRef(message);
  messageRef.current = message;

  useLayoutEffect(() => {
    if (!device || !phoneDevice.current) return undefined;
    const element = phoneDevice.current;
    const updateScale = () => {
      const inCreation = Boolean(element.closest('.v3-create, .pb-create-shell, .ps-create-shell'));
      // Creation previews can start below the fold, then become sticky or
      // scroll into view. Their initial page position must not shrink them.
      const pageTop = Math.max(0, element.getBoundingClientRect().top);
      const top = inCreation ? Math.min(pageTop, 32) : pageTop;
      const bottomSpace = children ? 66 : 30;
      const availableHeight = Math.max(1, window.innerHeight - top - bottomSpace);
      const availableWidth = Math.max(1, (element.parentElement?.getBoundingClientRect().width || window.innerWidth) - 32);
      const nextScale = Math.min(1.05, availableHeight / PHONE_FRAME_HEIGHT, availableWidth / PHONE_FRAME_WIDTH);
      setPhoneScale(current => Math.abs(current - nextScale) < .002 ? current : nextScale);
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScale);
    if (element.parentElement) observer?.observe(element.parentElement);
    return () => {
      window.removeEventListener('resize', updateScale);
      observer?.disconnect();
    };
  }, [device]);

  useEffect(() => {
    const send = () => {
      if (!ready.current || !frame.current?.contentWindow || messageRef.current === undefined) return;
      frame.current.contentWindow.postMessage({ type: PREVIEW_DATA, payload: messageRef.current }, window.location.origin);
    };
    const onMessage = event => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== PREVIEW_READY) return;
      ready.current = true;
      send();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (ready.current && message !== undefined) frame.current?.contentWindow?.postMessage({ type: PREVIEW_DATA, payload: message }, window.location.origin);
  }, [message]);

  const phoneStyle = device ? { width: `${PHONE_FRAME_WIDTH * phoneScale}px`, height: `${PHONE_FRAME_HEIGHT * phoneScale}px`, '--phone-scale': phoneScale } : undefined;

  return <main className={'v-phone-presentation' + (!device ? ' is-inline' : '')} aria-label={title}>
    <section ref={phoneDevice} className="v-phone-device" style={phoneStyle} aria-label={`${title}, shown at mobile size`}>
      <div className="v-phone-device-scale">
        <div className="v-phone-hardware" aria-hidden="true">
          <span className="v-phone-button is-action" />
          <span className="v-phone-button is-volume-up" />
          <span className="v-phone-button is-volume-down" />
          <span className="v-phone-button is-power" />
          <span className="v-phone-button is-camera" />
        </div>
        <div className="v-phone-display">
          <div className="v-phone-status" aria-hidden="true">
            <strong>9:41</strong>
            <span className="v-phone-island" />
            <span className="v-phone-status-icons">
              <svg width="20" height="14" viewBox="0 0 20 14" fill="currentColor" focusable="false">
                <rect x="1" y="9" width="3" height="4" rx=".8" />
                <rect x="6" y="6.5" width="3" height="6.5" rx=".8" />
                <rect x="11" y="3.5" width="3" height="9.5" rx=".8" />
                <rect x="16" y="1" width="3" height="12" rx=".8" />
              </svg>
              <svg width="20" height="14" viewBox="0 0 20 14" fill="currentColor" focusable="false">
                <path d="M.8 3.5C6-1.1 14-1.1 19.2 3.5L16.9 5.8C13 2.4 7 2.4 3.1 5.8Z" />
                <path d="M4.5 7.2C7.6 4.5 12.4 4.5 15.5 7.2L13.2 9.5C11.4 8 8.6 8 6.8 9.5Z" />
                <path d="M8.1 10.9C9.2 10 10.8 10 11.9 10.9L10.4 12.5Q10 12.9 9.6 12.5Z" />
              </svg>
              <svg width="28" height="14" viewBox="0 0 28 14" fill="currentColor" focusable="false">
                <rect x=".5" y="1" width="24" height="12" rx="3.5" fill="none" stroke="currentColor" strokeOpacity=".45" />
                <rect x="2.5" y="3" width="20" height="8" rx="1.6" />
                <path d="M26 4.5C28 4.5 28 9.5 26 9.5Z" opacity=".45" />
              </svg>
            </span>
          </div>
          <div className="v-phone-screen">{children || <iframe ref={frame} src={src} title={title} allow="autoplay; clipboard-read; clipboard-write; fullscreen; web-share" onLoad={() => { ready.current = true; if (messageRef.current !== undefined) frame.current?.contentWindow?.postMessage({ type: PREVIEW_DATA, payload: messageRef.current }, window.location.origin); }} />}</div>
          <div className="v-phone-home" aria-hidden="true"><span /></div>
        </div>
      </div>
    </section>
  </main>;
}
