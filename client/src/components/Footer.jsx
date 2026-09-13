import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Copy, Mail } from 'lucide-react';
import { openCookieSettings } from './CookiePreferences.jsx';

const emailAddress = 'info@veylo.com.ng';

const groups = [
  ['Explore', [['Delivery formats', '/formats'], ['Veylo Portfolio', '/portfolio'], ['Client experience', '/client-experience'], ['Plans and pricing', '/pricing']]],
  ['Your kind of work', [['Portraits', '/for/portrait-photographers'], ['Weddings', '/for/wedding-studios'], ['Birthdays', '/for/birthday-shoots'], ['Commercial', '/for/media-companies']]],
  ['Veylo', [['About us', '/about'], ['Privacy', '/privacy'], ['Terms of use', '/terms'], ['Fair use', '/fair-use']]]
];

function copyWithFallback(value) {
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(field);
  if (!copied) throw new Error('Copy failed');
}

export default function Footer() {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const copyEmail = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(emailAddress);
      else copyWithFallback(emailAddress);
    } catch {
      copyWithFallback(emailAddress);
    }

    setCopied(true);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 2400);
  };

  return (
    <footer className="v-footer">
      <div className="v-wrap">
        <div className="v-footer-main">
          <div className="v-footer-brand">
            <Link to="/" className="v-logo" aria-label="Veylo home">
              <img src="/veylo/veylo-mark.svg" alt="" width="27" height="27" />
              veylo<span className="text-[#ff9b8e]">.</span>
            </Link>
            <p className="v-copy">One finished shoot.<br />Six ways to deliver it.</p>
            <div className="v-footer-email-row">
              <button type="button" className="v-footer-email" onClick={copyEmail} aria-label={`Copy ${emailAddress}`}>
                <span>{emailAddress}</span>
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              </button>
              <a className="v-footer-compose" href={`mailto:${emailAddress}`} aria-label={`Open your email app to write to ${emailAddress}`} title="Open email app">
                <Mail size={16} aria-hidden="true" />
              </a>
            </div>
            <span className="v-footer-email-status" role="status" aria-live="polite">{copied ? 'Email copied' : ''}</span>
          </div>
          <nav className="v-footer-links" aria-label="Footer">
            {groups.map(([heading, items]) => (
              <div key={heading}>
                <h2>{heading}</h2>
                {items.map(([label, path]) => <Link key={path} to={path}>{label}</Link>)}
              </div>
            ))}
          </nav>
        </div>
        <div className="v-footer-wordmark" aria-hidden="true">veylo.</div>
        <div className="v-footer-bottom">
          <p>© {new Date().getFullYear()} Veylo. A product of Tech-City Technology.</p>
          <span>Built in Nigeria. Made for your next delivery.</span>
          <div className="v-footer-socials">
            <button type="button" onClick={openCookieSettings}>Cookie settings</button>
            <a href="https://www.instagram.com/veylo_com_ng/" target="_blank" rel="noopener noreferrer">Instagram <ArrowUpRight size={12} /></a>
            <a href="https://www.tiktok.com/@veylo.com.ng" target="_blank" rel="noopener noreferrer">TikTok <ArrowUpRight size={12} /></a>
            <a href="https://www.youtube.com/@veylophotographydelivery" target="_blank" rel="noopener noreferrer">YouTube <ArrowUpRight size={12} /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
