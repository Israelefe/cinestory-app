import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound } from 'lucide-react';
import TurnstileCheck from '../components/TurnstileCheck.jsx';
import { Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const challengeRef = useRef(null);
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [status, setStatus] = useState({ loading: false, error: '' });
  async function submit(event) {
    event.preventDefault();
    setStatus({ loading: true, error: '' });
    try {
      await api.post('/v1/auth/password/forgot', { email, turnstileToken });
      sessionStorage.setItem('veylo_reset_email', email.trim().toLowerCase());
      navigate('/reset-password', { state: { email: email.trim().toLowerCase() } });
    } catch (error) {
      challengeRef.current?.reset();
      setTurnstileToken('');
      setStatus({ loading: false, error: apiMessage(error, 'We could not send a reset code.') });
    }
  }
  return <Page className="v-auth-flow-page"><section className="v-wrap v-auth-flow-wrap"><Reveal className="v-auth-flow-card"><span className="v-auth-flow-icon"><KeyRound size={24} /></span><p className="v-eyebrow">Password help</p><h1>Reset your password.</h1><p className="v-copy">Enter the email connected to your Veylo account. If we find a matching account, we’ll send a six-digit code.</p><form className="v-form" onSubmit={submit}><div className="v-field"><label htmlFor="reset-email">Email address</label><input id="reset-email" type="email" inputMode="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></div><TurnstileCheck ref={challengeRef} action="forgot_password" onVerify={setTurnstileToken} />{status.error && <p className="v-form-status" role="alert">{status.error}</p>}<button className="v-button" disabled={status.loading || !turnstileToken}>{status.loading ? 'Sending the code…' : !turnstileToken ? 'Completing security check…' : 'Send reset code'}<ArrowRight size={18} /></button></form><p className="v-signup-login"><Link to="/signin">Return to Sign In</Link></p></Reveal></section></Page>;
}
