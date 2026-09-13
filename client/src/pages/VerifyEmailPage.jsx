import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, MailCheck } from 'lucide-react';
import OtpInput from '../components/OtpInput.jsx';
import TurnstileCheck from '../components/TurnstileCheck.jsx';
import { Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

export default function VerifyEmailPage({ onAuthenticated }) {
  const location = useLocation();
  const navigate = useNavigate();
  const challengeRef = useRef(null);
  const [email, setEmail] = useState(location.state?.email || sessionStorage.getItem('veylo_pending_email') || '');
  const [code, setCode] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [seconds, setSeconds] = useState(60);
  const [status, setStatus] = useState({ loading: false, error: '', note: '' });
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  async function verify(event) {
    event.preventDefault();
    if (code.length !== 6) return setStatus({ loading: false, error: 'Enter all six digits from the email.', note: '' });
    setStatus({ loading: true, error: '', note: '' });
    try {
      const { data } = await api.post('/v1/auth/verify-email', { email, code });
      sessionStorage.removeItem('veylo_pending_email');
      onAuthenticated(data.user);
      navigate(data.next || '/onboarding', { replace: true });
    } catch (error) {
      setStatus({ loading: false, error: apiMessage(error, 'That code could not be verified.'), note: '' });
    }
  }

  async function resend() {
    setStatus({ loading: true, error: '', note: '' });
    try {
      const { data } = await api.post('/v1/auth/resend-verification', { email, turnstileToken });
      setCode('');
      setSeconds(60);
      challengeRef.current?.reset();
      setTurnstileToken('');
      setStatus({ loading: false, error: '', note: data.message });
    } catch (error) {
      const wait = error.response?.data?.retryAfter;
      if (wait) setSeconds(wait);
      setStatus({ loading: false, error: apiMessage(error, 'We could not send another code.'), note: '' });
    }
  }

  return <Page className="v-auth-flow-page"><section className="v-wrap v-auth-flow-wrap"><Reveal className="v-auth-flow-card"><span className="v-auth-flow-icon"><MailCheck size={24} /></span><p className="v-eyebrow">Confirm your email</p><h1>Check your inbox.</h1><p className="v-copy">We sent a six-digit code to <strong>{email || 'your email address'}</strong>. Enter it here within ten minutes.</p>{!location.state?.email && !sessionStorage.getItem('veylo_pending_email') && <div className="v-field"><label htmlFor="verify-email">Email address</label><input id="verify-email" type="email" value={email} onChange={event => setEmail(event.target.value)} /></div>}<form className="v-form" onSubmit={verify}><OtpInput value={code} onChange={setCode} disabled={status.loading} /><TurnstileCheck ref={challengeRef} action="resend_verification" onVerify={setTurnstileToken} />{status.error && <p className="v-form-status" role="alert">{status.error}</p>}{status.note && <p className="v-form-success" role="status">{status.note}</p>}<button className="v-button" disabled={status.loading || code.length !== 6}>{status.loading ? 'Checking the code…' : 'Verify email'}<ArrowRight size={18} /></button></form><button type="button" className="v-auth-text-button" onClick={resend} disabled={status.loading || seconds > 0 || !turnstileToken}>{seconds > 0 ? `Send another code in ${seconds}s` : !turnstileToken ? 'Completing security check…' : 'Send another code'}</button><p className="v-signup-login">Wrong email? <Link to="/signup">Return to Create Account</Link></p></Reveal></section></Page>;
}
