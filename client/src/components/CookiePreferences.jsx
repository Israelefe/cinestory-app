import React, { useEffect, useRef, useState } from 'react';
import { Check, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDialogFocus } from './useDialogFocus.js';

const STORAGE_KEY = 'veylo_cookie_preferences_v1';
const OPEN_EVENT = 'veylo:open-cookie-settings';

function hasSavedChoice() {
  try { return Boolean(localStorage.getItem(STORAGE_KEY)); } catch { return false; }
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

  function acceptNecessary() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ necessary: true, version: 1, savedAt: new Date().toISOString() })); } catch {}
    setAcknowledged(true);
    setOpen(false);
  }

  return <>
    {!acknowledged && <aside className="v-cookie-banner" aria-label="Cookie notice"><span><ShieldCheck size={20} /></span><div><strong>Veylo uses necessary cookies.</strong><p>They keep accounts signed in, protect forms, and remember this choice. Veylo does not currently use advertising or analytics cookies.</p></div><div className="v-cookie-actions"><button type="button" onClick={() => setOpen(true)}>View details</button><button type="button" onClick={acceptNecessary}>Okay, continue<Check size={15} /></button></div></aside>}
    {open && <div className="v-cookie-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}><section ref={dialogRef} className="v-cookie-dialog" role="dialog" aria-modal="true" aria-labelledby="cookie-title" tabIndex={-1}><header><span><SlidersHorizontal size={20} /></span><div><p>COOKIE SETTINGS</p><h2 id="cookie-title">What Veylo stores in your browser</h2></div><button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close cookie settings"><X size={20} /></button></header><div className="v-cookie-category"><div><ShieldCheck size={18} /><span><strong>Strictly necessary</strong><small>Always active</small></span></div><p>Authentication and CSRF cookies keep your account signed in and stop other websites from sending account actions as you. Google sign-in and Cloudflare Turnstile may use limited storage when those services are shown.</p></div><div className="v-cookie-category is-inactive"><div><SlidersHorizontal size={18} /><span><strong>Analytics and advertising</strong><small>Not used</small></span></div><p>Veylo does not currently place analytics or advertising cookies. If that changes, these settings will ask before optional tracking starts.</p></div><p className="v-cookie-more">Read the <Link to="/privacy" onClick={() => setOpen(false)}>privacy policy</Link> for the services involved and how to contact us.</p><button type="button" className="v-button" onClick={acceptNecessary}>Save and continue<Check size={16} /></button></section></div>}
  </>;
}
