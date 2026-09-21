import React, { useEffect, useRef, useState } from 'react';
import { Check, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDialogFocus } from './useDialogFocus.js';
import { getAnalyticsConsent, setAnalyticsConsent, trackEvent } from '../services/analytics.js';

const STORAGE_KEY = 'veylo_cookie_preferences_v1';
const OPEN_EVENT = 'veylo:open-cookie-settings';

function hasSavedChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved?.version === 2;
  } catch { return false; }
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export default function CookiePreferences() {
  const [acknowledged, setAcknowledged] = useState(hasSavedChoice);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(getAnalyticsConsent);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useDialogFocus(open, dialogRef, () => setOpen(false), closeRef);

  useEffect(() => {
    const show = () => { setAnalyticsEnabled(getAnalyticsConsent()); setOpen(true); };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  function savePreferences(allowAnalytics) {
    setAnalyticsConsent(allowAnalytics);
    setAnalyticsEnabled(Boolean(allowAnalytics));
    setAcknowledged(true);
    setOpen(false);
    if (allowAnalytics) window.setTimeout(() => trackEvent('analytics.consent.granted', { source: 'cookie-settings' }), 0);
  }

  return <>
    {!acknowledged && <aside className="v-cookie-banner" aria-label="Cookie notice"><span><ShieldCheck size={20} /></span><div><strong>A quick note about cookies</strong><p>Veylo uses essential cookies for sign-in and security. With your permission, we also collect anonymous product-use events so we can see which parts work and which need fixing. We do not sell this information or use it for advertising.</p></div><div className="v-cookie-actions"><button type="button" onClick={() => savePreferences(false)}>Only necessary</button><button type="button" onClick={() => savePreferences(true)}>Allow product analytics<Check size={15} /></button></div></aside>}
    {open && <div className="v-cookie-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}><section ref={dialogRef} className="v-cookie-dialog" role="dialog" aria-modal="true" aria-labelledby="cookie-title" tabIndex={-1}><header><span><SlidersHorizontal size={20} /></span><div><p>COOKIE SETTINGS</p><h2 id="cookie-title">Choose what Veylo may measure</h2></div><button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close cookie settings"><X size={20} /></button></header><div className="v-cookie-category"><div><ShieldCheck size={18} /><span><strong>Essential cookies</strong><small>Always active</small></span></div><p>These cookies keep you signed in and protect account actions. Google sign-in and Cloudflare Turnstile may also use limited browser storage when their sign-in or security services appear.</p></div><div className="v-cookie-category"><div><SlidersHorizontal size={18} /><span><strong>Anonymous product analytics</strong><small>{analyticsEnabled ? 'Allowed' : 'Off until you choose it'}</small></span><input type="checkbox" checked={analyticsEnabled} onChange={event => setAnalyticsEnabled(event.target.checked)} aria-label="Allow anonymous product analytics" /></div><p>When enabled, Veylo records useful outcomes such as a delivery being published, a viewer loading, or a download failing. It does not record passwords, PINs, contact details, captions, photographs, audio, messages, or keystrokes. You can change this choice here at any time.</p></div><p className="v-cookie-more">Read the <Link to="/privacy" onClick={() => setOpen(false)}>privacy policy</Link> for more information.</p><button type="button" className="v-button" onClick={() => savePreferences(analyticsEnabled)}>{analyticsEnabled ? 'Save and allow analytics' : 'Save necessary only'}<Check size={16} /></button></section></div>}
  </>;
}
