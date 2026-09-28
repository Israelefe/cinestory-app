import React, { useEffect, useState } from 'react';
import ClientDeliveryPreview from '../components/delivery/ClientDeliveryPreview.jsx';

const READY = 'veylo:phone-preview-ready';
const DATA = 'veylo:phone-preview-data';

export default function PhonePreviewPage() {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    const receive = event => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== DATA) return;
      setPreview(event.data.payload || null);
    };
    window.addEventListener('message', receive);
    if (window.parent !== window) window.parent.postMessage({ type: READY }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, []);

  if (!preview?.delivery) return <main className="v-client-preview-empty"><strong>Waiting for the preview.</strong><span>Return to the delivery creator and open Preview again.</span></main>;
  return <div className="v-phone-preview-page"><ClientDeliveryPreview delivery={preview.delivery} narrationEnabled={preview.narrationEnabled} access={preview.access} accessPin={preview.accessPin} /></div>;
}
