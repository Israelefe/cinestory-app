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
    {!acknowledged && <aside className="v-cookie-banner" aria-label="Cookie notice"><span><ShieldCheck size={20} /></span><div><strong>A quick note about cookies</strong><p>Veylo uses essential cookies to keep your account signed in and protect it from unauthorised actions. We do not currently use advertising or analytics cookies.</p></div><div className="v-cookie-actions"><button type="button" onClick={() => setOpen(true)}>See cookie details</button><button type="button" onClick={acceptNecessary}>Continue<Check size={15} /></button></div></aside>}
    {open && <div className="v-cookie-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}><section ref={dialogRef} className="v-cookie-dialog" role="dialog" aria-modal="true" aria-labelledby="cookie-title" tabIndex={-1}><header><span><SlidersHorizontal size={20} /></span><div><p>COOKIE SETTINGS</p><h2 id="cookie-title">The cookies Veylo needs</h2></div><button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close cookie settings"><X size={20} /></button></header><div className="v-cookie-category"><div><ShieldCheck size={18} /><span><strong>Essential cookies</strong><small>Always active</small></span></div><p>These cookies keep you signed in and protect account actions. Google sign-in and Cloudflare Turnstile may also use limited browser storage while their security checks are displayed.</p></div><div className="v-cookie-category is-inactive"><div><SlidersHorizontal size={18} /><span><strong>Analytics and advertising</strong><small>Not used</small></span></div><p>Veylo does not currently use analytics or advertising cookies. If that changes, Veylo will ask before optional tracking begins.</p></div><p className="v-cookie-more">Read the <Link to="/privacy" onClick={() => setOpen(false)}>privacy policy</Link> for more information.</p><button type="button" className="v-button" onClick={acceptNecessary}>Continue<Check size={16} /></button></section></div>}
  </>;
}
