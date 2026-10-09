import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, LockKeyhole, LogOut } from 'lucide-react';
import api from '../services/api.js';
import './AdminWorkspace.css';

export default function AdminMfaGate({ admin, onVerified, onLogout }) {
  const [setup, setSetup] = useState(null), [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  const start = async () => { setBusy(true); setError(''); try { const response = await api.post('/v1/admin/security/2fa/setup'); setSetup(response.data.data); } catch (failure) { setError(failure.response?.data?.message || 'Could not start authenticator setup.'); } finally { setBusy(false); } };
  const verify = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.post(admin.twoFactorEnabled ? '/v1/admin/auth/verify-2fa' : '/v1/admin/security/2fa/enable', { code }); const response = await api.get('/v1/admin/auth/me'); onVerified(response.data.admin); }
    catch (failure) { setError(failure.response?.data?.message || 'Could not verify your authenticator.'); }
    finally { setBusy(false); }
  };
  return <div className="aw-workspace aw-mfa"><motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}><LockKeyhole size={26} /><p className="aw-eyebrow">Administrator security</p><h1>{admin.twoFactorEnabled ? 'Verify this session.' : 'Protect your admin access.'}</h1><p>{admin.twoFactorEnabled ? 'Enter the current six-digit code from your authenticator app.' : 'Admin access includes private customer records. Add Veylo to an authenticator app before opening the workspace.'}</p>{!admin.twoFactorEnabled && !setup && <button className="aw-mfa-primary" type="button" disabled={busy} onClick={start}>{busy ? 'Preparing…' : 'Set up authenticator'}</button>}{setup && <div className="aw-mfa-secret"><p>Add an account manually in your authenticator. Choose a time-based key, name it Veylo ({admin.username}), and use this setup key:</p><code>{setup.secret}</code><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(setup.secret); setCopied(true); } catch { setError('Select and copy the setup key manually.'); } }}><Copy size={14} />{copied ? 'Copied' : 'Copy setup key'}</button></div>}{(setup || admin.twoFactorEnabled) && <form onSubmit={verify}><label htmlFor="admin-mfa-code">Authenticator code</label><input id="admin-mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required autoFocus /><button className="aw-mfa-primary" disabled={busy || code.length !== 6} type="submit">{busy ? 'Verifying…' : 'Verify and continue'}</button></form>}{error && <p className="aw-inline-error" role="alert">{error}</p>}<button className="aw-mfa-logout" type="button" onClick={onLogout}><LogOut size={14} />Sign out</button></motion.section></div>;
}
