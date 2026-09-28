import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BatteryFull, Signal, Wifi } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import ClientDeliveryPreview from './ClientDeliveryPreview.jsx';
import './PhonePresentation.css';

const DESKTOP_QUERY = '(min-width: 1025px)';
const PREVIEW_READY = 'veylo:phone-preview-ready';
const PREVIEW_DATA = 'veylo:phone-preview-data';

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
  if (!desktop || embedded) return children;

  const params = new URLSearchParams(location.search);
  params.set('phoneView', '1');
  const src = `${location.pathname}?${params.toString()}${location.hash || ''}`;
  return <DesktopPhoneFrame src={src} title={title} />;
}

export function DesktopPhoneFrame({ src, title, message, device = true }) {
  const frame = useRef(null);
  const ready = useRef(false);
  const messageRef = useRef(message);
  messageRef.current = message;

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

  return <main className={'v-phone-presentation' + (!device ? ' is-inline' : '')} aria-label={title}>
    <section className="v-phone-device" aria-label={`${title}, shown at mobile size`}>
      <div className="v-phone-status" aria-hidden="true"><strong>9:41</strong><span className="v-phone-island" /><span className="v-phone-status-icons"><Signal size={14} /><Wifi size={15} /><BatteryFull size={18} /></span></div>
      <div className="v-phone-screen"><iframe ref={frame} src={src} title={title} allow="autoplay; clipboard-read; clipboard-write; fullscreen; web-share" /></div>
    </section>
    <p className="v-phone-caption"><strong>Mobile client view</strong><span>360 × 800 px</span></p>
  </main>;
}

export function ClientPreviewPhoneFrame({ delivery, narrationEnabled = false, access = {}, accessPin = '', isolate = false }) {
  const desktop = useDesktopPhoneMode();
  const message = useMemo(() => ({ delivery, narrationEnabled, access, accessPin }), [delivery, narrationEnabled, access, accessPin]);
  if (!desktop && !isolate) return <ClientDeliveryPreview delivery={delivery} narrationEnabled={narrationEnabled} access={access} accessPin={accessPin} />;
  return <DesktopPhoneFrame src="/__phone-preview" title="Mobile client delivery preview" message={message} device={desktop} />;
}
