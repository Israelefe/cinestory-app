import React, { useEffect, useRef, useState } from 'react';
import { Check, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDialogFocus } from './useDialogFocus.js';
import { setAnalyticsConsent } from '../services/analytics.js';

const STORAGE_KEY = 'veylo_cookie_preferences_v1';
const OPEN_EVENT = 'veylo:open-cookie-settings';

function hasSavedChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved?.version === 3;
  } catch { return false; }
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export default function CookiePreferences() {
  const [acknowledged, setAcknowledged] = useState(hasSavedChoice);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useDialogFocus(open, dialogRef, () => setOpen(false), closeRef);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  function acknowledgeNotice() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true, savedAt: new Date().toISOString() }));
    } catch {}
    setAnalyticsConsent(true);
    setAcknowledged(true);
    setOpen(false);
  }

  return <>
    {!acknowledged && <aside className="v-cookie-banner" aria-label="Cookies and browser storage notice">
      <span><ShieldCheck size={20} /></span>
      <div>
        <strong>How Veylo uses browser storage</strong>
        <p>Veylo uses necessary cookies and first-party service analytics to sign you in, protect account actions, measure visits, and improve the platform. We do not use advertising cookies or sell visitor data.</p>
      </div>
      <div className="v-cookie-actions">
        <button type="button" onClick={() => setOpen(true)}>View details</button>
        <button type="button" onClick={acknowledgeNotice}>Got it<Check size={15} /></button>
      </div>
    </aside>}
    {open && <div className="v-cookie-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialogRef} className="v-cookie-dialog" role="dialog" aria-modal="true" aria-labelledby="cookie-title" tabIndex={-1}>
        <header>
          <span><SlidersHorizontal size={20} /></span>
          <div><p>COOKIES &amp; BROWSER STORAGE</p><h2 id="cookie-title">What Veylo stores and why</h2></div>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close cookie details"><X size={20} /></button>
        </header>
        <div className="v-cookie-category">
          <div><ShieldCheck size={18} /><span><strong>Necessary service storage</strong><small>Active</small></span></div>
          <p>Authentication, CSRF protection, private delivery access, security checks, and your notice preference. Without these items, Veylo cannot safely provide the account or delivery you requested.</p>
        </div>
        <div className="v-cookie-category">
          <div><SlidersHorizontal size={18} /><span><strong>First-party service analytics</strong><small>Active by default</small></span></div>
          <p>Veylo measures visits, page paths, device type, delivery opens, downloads, failures, and other product outcomes so the studio and Veylo team can understand what is working. Identifiers are hashed before they reach the database. Veylo does not store passwords, PINs, contact details, captions, photographs, audio, messages, or keystrokes.</p>
        </div>
        <p className="v-cookie-more">Read the <Link to="/privacy" onClick={() => setOpen(false)}>privacy policy</Link> for retention, provider, and data-use details.</p>
        <button type="button" className="v-button" onClick={acknowledgeNotice}>Acknowledge and close<Check size={16} /></button>
      </section>
    </div>}
  </>;
}
