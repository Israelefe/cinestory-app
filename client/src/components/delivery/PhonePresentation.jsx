import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import ClientDeliveryPreview from './ClientDeliveryPreview.jsx';
import { DesktopPhoneFrame, useDesktopPhoneMode } from './DesktopPhoneFrame.jsx';
export { DesktopPhoneFrame, useDesktopPhoneMode } from './DesktopPhoneFrame.jsx';

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

export function ClientPreviewPhoneFrame({ delivery, narrationEnabled = false, access = {}, accessPin = '', isolate = false }) {
  const desktop = useDesktopPhoneMode();
  const message = useMemo(() => ({ delivery, narrationEnabled, access, accessPin }), [delivery, narrationEnabled, access, accessPin]);
  if (!desktop && !isolate) return <ClientDeliveryPreview delivery={delivery} narrationEnabled={narrationEnabled} access={access} accessPin={accessPin} />;
  return <DesktopPhoneFrame src="/__phone-preview" title="Mobile client delivery preview" message={message} device={desktop} />;
}
