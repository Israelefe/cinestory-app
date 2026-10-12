import React, { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import './LibraryWorkspace.css';

export default function PrivateLinkAccess({ access, kind }) {
  const [secret, setSecret] = useState('');
  const selection = kind === 'preselection';
  return <main className="lib-public-page"><section className="lib-private-access"><img className="lib-brand-mark" src="/veylo/veylo-mark.svg" alt="Veylo" width="30" height="30" /><p className="lib-eyebrow">{selection ? 'PHOTO PRE-SELECTION' : 'EDITOR LINK'}</p><h1>{access.loading ? 'Opening your link…' : access.info?.title || 'This link is unavailable.'}</h1>{!access.loading && access.info && <><p>{selection ? 'Choose the photographs you would like edited.' : 'Download the originals, read the brief, and return your edits here.'}</p>{access.info.clientName && <span>Prepared for {access.info.clientName}</span>}<form onSubmit={event => { event.preventDefault(); access.open(secret); }}>{access.info.requiresSecret && <label>{selection ? 'Six-digit PIN' : 'Editor password'}<span><LockKeyhole size={17} /><input autoComplete="off" type={selection ? 'text' : 'password'} inputMode={selection ? 'numeric' : undefined} maxLength={selection ? 6 : 72} value={secret} onChange={event => setSecret(selection ? event.target.value.replace(/\D/g, '').slice(0, 6) : event.target.value)} /></span></label>}<button type="submit" className="lib-button lib-primary" disabled={access.working || access.info.requiresSecret && !secret}>{access.working ? 'Opening…' : selection ? 'Open photographs' : 'Open editor job'}<ArrowRight size={17} /></button></form></>}{access.error && <div className="lib-error" role="alert">{access.error}</div>}<small>Shared privately by a Veylo photographer.</small></section></main>;
}
