import React, { useEffect, useId, useRef, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import './DownloadLockNotice.css';

export function downloadLockMessage(access) {
  return access?.downloadLockNote?.trim() || 'Your photographer has locked downloads. You can still view your photos. Contact them to request access to download.';
}

export function DownloadLockMessage({ access, className = '' }) {
  return <div className={`delivery-download-note ${className}`}>
    <LockKeyhole size={18} aria-hidden="true" />
    <div><strong>Downloads locked</strong><p>{downloadLockMessage(access)}</p></div>
  </div>;
}

export default function DownloadLockButton({ access, placement = 'below' }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const button = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <span ref={root} className={`delivery-download-lock is-${placement}`} onKeyDown={event => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); }
  }}>
    <button ref={button} type="button" className="delivery-download-lock-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(current => !current)}>
      <LockKeyhole size={16} aria-hidden="true" /><span>Downloads locked</span>
    </button>
    {open && <div id={id} className="delivery-download-lock-popover" role="status"><DownloadLockMessage access={access} /></div>}
  </span>;
}
