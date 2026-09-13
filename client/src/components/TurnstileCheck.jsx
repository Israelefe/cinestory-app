import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { TURNSTILE_SITE_KEY } from '../config/env.js';

let turnstileScript;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScript) return turnstileScript;
  turnstileScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return turnstileScript;
}

const TurnstileCheck = forwardRef(function TurnstileCheck({ onVerify, action }, ref) {
  const container = useRef(null);
  const widget = useRef(null);
  useImperativeHandle(ref, () => ({ reset() { if (widget.current !== null && window.turnstile) window.turnstile.reset(widget.current); } }), []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) { onVerify(''); return; }
    let active = true;
    loadTurnstile().then(() => {
      if (!active || !container.current || widget.current !== null) return;
      widget.current = window.turnstile.render(container.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        size: window.innerWidth < 390 ? 'compact' : 'flexible',
        appearance: 'interaction-only',
        action,
        callback: onVerify,
        'expired-callback': () => onVerify(''),
        'error-callback': () => onVerify('')
      });
    }).catch(() => onVerify(''));
    return () => {
      active = false;
      if (widget.current !== null && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [action, onVerify]);

  return <div ref={container} className="v-turnstile" aria-label="Security check" />;
});

export default TurnstileCheck;
