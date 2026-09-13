import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import OtpInput from '../components/OtpInput.jsx';
import { Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email] = useState(location.state?.email || sessionStorage.getItem('veylo_reset_email') || '');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [passwords, setPasswords] = useState({ password: '', confirmPassword: '' });
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState({ loading: false, error: '' });
  async function verify(event) {
    event.preventDefault();
    setStatus({ loading: true, error: '' });
    try {
      const { data } = await api.post('/v1/auth/password/verify-code', { email, code });
      setResetToken(data.resetToken);
      setStatus({ loading: false, error: '' });
    } catch (error) { setStatus({ loading: false, error: apiMessage(error, 'That code could not be verified.') }); }
  }
  async function reset(event) {
    event.preventDefault();
    if (passwords.password !== passwords.confirmPassword) return setStatus({ loading: false, error: 'The passwords do not match.' });
    setStatus({ loading: true, error: '' });
    try {
      await api.post('/v1/auth/password/reset', { resetToken, ...passwords });
      sessionStorage.removeItem('veylo_reset_email');
      setDone(true);
      setStatus({ loading: false, error: '' });
    } catch (error) { setStatus({ loading: false, error: apiMessage(error, 'We could not change your password.') }); }
  }
  if (!email) return <Page className="v-auth-flow-page"><section className="v-wrap v-auth-flow-wrap"><Reveal className="v-auth-flow-card"><h1>Request a new code.</h1><p className="v-copy">Start with the email address connected to your account.</p><Link className="v-button" to="/forgot-password">Reset password<ArrowRight size={18} /></Link></Reveal></section></Page>;
  if (done) return <Page className="v-auth-flow-page"><section className="v-wrap v-auth-flow-wrap"><Reveal className="v-auth-flow-card"><span className="v-auth-flow-icon"><Check size={24} /></span><p className="v-eyebrow">Password updated</p><h1>You can sign in again.</h1><p className="v-copy">Your old sessions have been closed. Use your new password the next time you sign in.</p><button className="v-button" onClick={() => navigate('/signin', { replace: true })}>Go to Sign In<ArrowRight size={18} /></button></Reveal></section></Page>;
  return <Page className="v-auth-flow-page"><section className="v-wrap v-auth-flow-wrap"><Reveal className="v-auth-flow-card"><span className="v-auth-flow-icon"><KeyRound size={24} /></span><p className="v-eyebrow">Reset your password</p>{!resetToken ? <><h1>Enter the code.</h1><p className="v-copy">Use the six-digit code sent to <strong>{email}</strong>.</p><form className="v-form" onSubmit={verify}><OtpInput value={code} onChange={setCode} disabled={status.loading} />{status.error && <p className="v-form-status" role="alert">{status.error}</p>}<button className="v-button" disabled={status.loading || code.length !== 6}>{status.loading ? 'Checking the code…' : 'Continue'}<ArrowRight size={18} /></button></form><p className="v-signup-login">Code expired? <Link to="/forgot-password">Request another one</Link></p></> : <><h1>Choose a new password.</h1><p className="v-copy">Use at least eight characters that you do not use for another account.</p><form className="v-form" onSubmit={reset}><div className="v-field"><label htmlFor="new-password">New password</label><input id="new-password" type={shown ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} value={passwords.password} onChange={event => setPasswords(current => ({ ...current, password: event.target.value }))} /></div><div className="v-field"><label htmlFor="confirm-new-password">Confirm password</label><input id="confirm-new-password" type={shown ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} value={passwords.confirmPassword} onChange={event => setPasswords(current => ({ ...current, confirmPassword: event.target.value }))} /></div><label className="v-password-toggle"><input type="checkbox" checked={shown} onChange={event => setShown(event.target.checked)} /><span>{shown ? <EyeOff size={16} /> : <Eye size={16} />}Show passwords</span></label>{status.error && <p className="v-form-status" role="alert">{status.error}</p>}<button className="v-button" disabled={status.loading}>{status.loading ? 'Changing your password…' : 'Change password'}<ArrowRight size={18} /></button></form></>}</Reveal></section></Page>;
}
