import React, { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID } from '../config/env.js';
import GoogleMark from './GoogleMark.jsx';

let googleScript;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScript) return googleScript;
  googleScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return googleScript;
}

export default function GoogleSignIn({ onCredential, onUnavailable }) {
  const holder = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let active = true;
    loadGoogle().then(() => {
      if (!active || !holder.current) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: response => onCredential(response.credential) });
      window.google.accounts.id.renderButton(holder.current, { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'continue_with', width: Math.min(400, holder.current.clientWidth) });
      setReady(true);
    }).catch(() => setReady(false));
    return () => { active = false; };
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) return <button type="button" className="v-google-button" onClick={onUnavailable}><GoogleMark /><span>Continue with Google</span></button>;
  return <div className={`v-google-official ${ready ? 'is-ready' : ''}`}><div ref={holder} />{!ready && <span>Loading Google sign-in…</span>}</div>;
}
