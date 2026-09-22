import React, { useCallback, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, Eye, EyeOff, Folder, ShieldCheck } from 'lucide-react';
import GoogleSignIn from '../components/GoogleSignIn.jsx';
import TurnstileCheck from '../components/TurnstileCheck.jsx';
import { Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

export default function SigninPage({ onAuthenticated }) {
  const navigate = useNavigate();
  const location = useLocation();
  const challengeRef = useRef(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [turnstileToken, setTurnstileToken] = useState('');
  const [status, setStatus] = useState({ loading: false, error: '' });
  const requestedDestination = location.state?.from;
  const destination = typeof requestedDestination === 'string' && requestedDestination.startsWith('/') && !requestedDestination.startsWith('//') ? requestedDestination : '/dashboard';

  async function submit(event) {
    event.preventDefault();
    if (!turnstileToken) return setStatus(current => ({ ...current, error: 'Complete the security check before signing in.' }));
    setStatus(current => ({ ...current, loading: true, error: '' }));
    try {
      const { data } = await api.post('/v1/auth/login', { email: form.email, password: form.password, remember: form.remember, turnstileToken });
      onAuthenticated(data.user);
      navigate(data.user.onboardingComplete ? destination : '/onboarding', { replace: true });
    } catch (error) {
      const response = error.response?.data;
      if (response?.code === 'EMAIL_NOT_VERIFIED') {
        sessionStorage.setItem('veylo_pending_email', response.email || form.email);
        navigate('/verify-email', { state: { email: response.email || form.email } });
        return;
      }
      challengeRef.current?.reset();
      setTurnstileToken('');
      setStatus({ loading: false, error: apiMessage(error, 'We could not sign you in. Please check your credentials and try again.') });
    }
  }

  const google = useCallback(async credential => {
    setStatus(current => ({ ...current, loading: true, error: '' }));
    try {
      const { data } = await api.post('/v1/auth/google', { credential });
      onAuthenticated(data.user);
      navigate(data.user.onboardingComplete ? destination : '/onboarding', { replace: true });
    } catch (error) {
      if (error.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        const pendingEmail = error.response.data.email;
        sessionStorage.setItem('veylo_pending_email', pendingEmail);
        navigate('/verify-email', { state: { email: pendingEmail } });
        return;
      }
      setStatus(current => ({ ...current, loading: false, error: apiMessage(error, 'Google sign-in could not be completed.') }));
    }
  }, [destination, navigate, onAuthenticated]);

  return <Page className="v-auth-page" footer={false}>
    <section className="v-auth-stage v-auth-stage-signin">
      <Reveal className="v-auth-visual v-auth-visual-signin">
        <img src="/veylo/pv-photographer.jpeg" alt="A photographer returning to her Veylo studio" loading="eager" fetchPriority="high" decoding="async" />
        <div className="v-auth-visual-shade" />
        <div className="v-auth-visual-copy"><p><Folder size={15} />Your studio is ready</p><h1>Pick up where<br /><em>you stopped.</em></h1><span>Your deliveries, client links, and studio details are waiting.</span></div>
        <div className="v-auth-visual-note"><ShieldCheck size={17} /><span><strong>Private by default</strong>Your account stays behind secure sign-in</span></div>
      </Reveal>

      <Reveal className="v-auth-panel" delay={.06}>
        <header className="v-auth-panel-head">
          <p className="v-eyebrow"><Camera size={14} />Photographer sign in</p>
          <h2>Welcome back.</h2>
          <p className="v-auth-panel-subhead">New to Veylo? <Link to="/signup">Create an account</Link></p>
        </header>
        <p className="v-auth-panel-copy">Use the email address connected to your photographer or studio account.</p>
        <GoogleSignIn onCredential={google} onUnavailable={message => setStatus(current => ({ ...current, loading: false, error: message || 'Google sign-in is not available right now. Use your email to continue.' }))} />
        <div className="v-auth-divider"><span>or sign in with email</span></div>
        <form className="v-form" onSubmit={submit}>
          <div className="v-field"><label htmlFor="signin-email">Email address</label><input id="signin-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></div>
          <div className="v-field"><div className="v-auth-label-row"><label htmlFor="signin-password">Password</label><Link to="/forgot-password">Forgot password?</Link></div><div className="v-password-input"><input id="signin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
          <label className="v-auth-consent"><input type="checkbox" checked={form.remember} onChange={event => setForm(current => ({ ...current, remember: event.target.checked }))} /><span>Keep me signed in on this device</span></label>
          <TurnstileCheck ref={challengeRef} action="login" onVerify={setTurnstileToken} />
          {status.error && <p className="v-form-status" role="alert">{status.error}</p>}
          <button type="submit" className="v-button v-auth-submit" disabled={status.loading || !turnstileToken}>{status.loading ? 'Signing you in…' : !turnstileToken ? 'Complete the security check' : 'Sign in'}<ArrowRight size={18} /></button>
        </form>
        <p className="v-auth-privacy">Google and email sign-in open the same Veylo account when the verified email address matches.</p>
      </Reveal>
    </section>
  </Page>;
}
