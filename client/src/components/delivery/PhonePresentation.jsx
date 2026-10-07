import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BatteryFull, Signal, Wifi } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import ClientDeliveryPreview from './ClientDeliveryPreview.jsx';
import './PhonePresentation.css';

const DESKTOP_QUERY = '(min-width: 1025px)';
const PREVIEW_READY = 'veylo:phone-preview-ready';
const PREVIEW_DATA = 'veylo:phone-preview-data';
const PHONE_FRAME_WIDTH = 444;
const PHONE_FRAME_HEIGHT = 851;

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

export function PhonePresentationRoute({ children, title = 'Mobile client delivery' }) {
  const location = useLocation();
  const desktop = useDesktopPhoneMode();
  const embedded = new URLSearchParams(location.search).get('phoneView') === '1';
  const publication = new URLSearchParams(location.search).get('publicationView') === 'editorial';
  if (!desktop || embedded || publication) return children;

  const params = new URLSearchParams(location.search);
  params.set('phoneView', '1');
  const src = `${location.pathname}?${params.toString()}${location.hash || ''}`;
  return <DesktopPhoneFrame src={src} title={title} />;
}

export function DesktopPhoneFrame({ src, title, message, device = true }) {
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
      const top = inCreation ? Math.min(pageTop, 96) : pageTop;
      const bottomSpace = inCreation ? 18 : 30;
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
        <div className="v-phone-status" aria-hidden="true"><strong>9:41</strong><span className="v-phone-island" /><span className="v-phone-status-icons"><Signal size={14} /><Wifi size={15} /><BatteryFull size={18} /></span></div>
        <div className="v-phone-screen"><iframe ref={frame} src={src} title={title} allow="autoplay; clipboard-read; clipboard-write; fullscreen; web-share" onLoad={() => { ready.current = true; if (messageRef.current !== undefined) frame.current?.contentWindow?.postMessage({ type: PREVIEW_DATA, payload: messageRef.current }, window.location.origin); }} /></div>
      </div>
    </section>
    <p className="v-phone-caption"><strong>Mobile client view</strong><span>420 × 800 px</span></p>
  </main>;
}

export function ClientPreviewPhoneFrame({ delivery, narrationEnabled = false, access = {}, accessPin = '', isolate = false }) {
  const desktop = useDesktopPhoneMode();
  const message = useMemo(() => ({ delivery, narrationEnabled, access, accessPin }), [delivery, narrationEnabled, access, accessPin]);
  if (!desktop && !isolate) return <ClientDeliveryPreview delivery={delivery} narrationEnabled={narrationEnabled} access={access} accessPin={accessPin} />;
  return <DesktopPhoneFrame src="/__phone-preview" title="Mobile client delivery preview" message={message} device={desktop} />;
}
