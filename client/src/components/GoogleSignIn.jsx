import React, { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID } from '../config/env.js';
import GoogleMark from './GoogleMark.jsx';

let googleScript;
let initializedClientId = '';
let activeCredentialHandler = null;

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

function isEmbeddedBrowser() {
  const agent = navigator.userAgent || '';
  return /Instagram|FBAN|FBAV|TikTok|Snapchat|\bwv\b|; wv\)/i.test(agent);
}

export default function GoogleSignIn({ onCredential, onUnavailable, context = 'signin' }) {
  const holder = useRef(null);
  const attempt = useRef(false);
  const recoveryTimer = useRef(null);
  const unavailableHandler = useRef(onUnavailable);
  const [ready, setReady] = useState(false);
  const embedded = typeof navigator !== 'undefined' && isEmbeddedBrowser();
  unavailableHandler.current = onUnavailable;

  useEffect(() => {
    activeCredentialHandler = credential => {
      attempt.current = false;
      window.clearTimeout(recoveryTimer.current);
      onCredential(credential);
    };
    return () => {
      activeCredentialHandler = null;
      window.clearTimeout(recoveryTimer.current);
    };
  }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || embedded) return;
    let active = true;
    loadGoogle().then(() => {
      if (!active || !holder.current) return;
      if (initializedClientId !== GOOGLE_CLIENT_ID) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: response => activeCredentialHandler?.(response.credential),
          context,
          itp_support: true,
          use_fedcm_for_button: true
        });
        initializedClientId = GOOGLE_CLIENT_ID;
      }
      window.google.accounts.id.renderButton(holder.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        width: Math.min(400, holder.current.clientWidth),
        click_listener: () => {
          attempt.current = true;
          window.clearTimeout(recoveryTimer.current);
          recoveryTimer.current = window.setTimeout(() => {
            if (!attempt.current) return;
            attempt.current = false;
            unavailableHandler.current?.('Google sign-in took too long to return. Open Veylo in Chrome or Safari and try again.');
          }, 60000);
        }
      });
      setReady(true);
    }).catch(() => {
      if (!active) return;
      setReady(false);
      unavailableHandler.current?.('Google sign-in could not load. Check your connection and try again.');
    });
    return () => { active = false; };
  }, [context, embedded]);

  useEffect(() => {
    if (embedded) return;
    const recover = () => {
      if (!attempt.current) return;
      window.clearTimeout(recoveryTimer.current);
      recoveryTimer.current = window.setTimeout(() => {
        if (!attempt.current) return;
        attempt.current = false;
        unavailableHandler.current?.('Google did not return to Veylo. Please try again, or open this page directly in Chrome or Safari.');
      }, 5000);
    };
    window.addEventListener('focus', recover);
    return () => window.removeEventListener('focus', recover);
  }, [embedded]);

  if (!GOOGLE_CLIENT_ID) return <button type="button" className="v-google-button" onClick={() => onUnavailable?.('Google sign-in is not available right now. Use your email to continue.')}><GoogleMark /><span>Continue with Google</span></button>;
  if (embedded) return <button type="button" className="v-google-button" onClick={() => onUnavailable?.('Google sign-in cannot finish inside this app’s browser. Open Veylo in Chrome or Safari, then try again.')}><GoogleMark /><span>Continue with Google</span></button>;
  return <div className={`v-google-official ${ready ? 'is-ready' : ''}`}><div ref={holder} />{!ready && <span>Loading Google sign-in…</span>}</div>;
}
