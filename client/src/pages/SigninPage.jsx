import React, { useCallback, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, Eye, EyeOff } from 'lucide-react';
import GoogleSignIn from '../components/GoogleSignIn.jsx';
import TurnstileCheck from '../components/TurnstileCheck.jsx';
import TypedHeading from '../components/TypedHeading.jsx';
import { Eyebrow, Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

export default function SigninPage({ onAuthenticated }) {
  const navigate = useNavigate();
  const location = useLocation();
  const challengeRef = useRef(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [turnstileToken, setTurnstileToken] = useState('');
  const [status, setStatus] = useState({ loading: false, error: '', challenge: false });
  const requestedDestination = location.state?.from;
  const destination = typeof requestedDestination === 'string' && requestedDestination.startsWith('/') && !requestedDestination.startsWith('//') ? requestedDestination : '/dashboard';

  async function submit(event) {
    event.preventDefault();
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
      setStatus({ loading: false, error: apiMessage(error, 'We could not sign you in. Please try again.'), challenge: Boolean(response?.requiresChallenge || response?.code === 'CHALLENGE_REQUIRED') });
    }
  }

  const google = useCallback(async credential => {
    setStatus(current => ({ ...current, loading: true, error: '' }));
    try {
      const { data } = await api.post('/v1/auth/google', { credential });
      onAuthenticated(data.user);
      navigate(data.user.onboardingComplete ? destination : '/onboarding', { replace: true });
    } catch (error) {
      setStatus(current => ({ ...current, loading: false, error: apiMessage(error, 'Google sign-in could not be completed.') }));
    }
  }, [destination, navigate, onAuthenticated]);

  return <Page className="v-signup-page v-signin-page">
    <section className="v-wrap v-signup-grid">
      <Reveal className="v-signup-intro">
        <Eyebrow><Camera size={15} />Your studio / Veylo</Eyebrow>
        <TypedHeading lines={[{ text: 'Welcome back.' }, { text: 'Your work is waiting.', accent: true }]} />
        <p>Sign in to prepare a finished shoot, check your deliveries, or continue where you stopped.</p>
        <div className="v-signup-photo"><img src="/veylo/pv-photographer.jpeg" alt="A photographer standing in the studio with a camera" loading="eager" fetchPriority="high" decoding="async" /><div><span>BACK TO YOUR STUDIO</span><strong>Your deliveries, all in one place.</strong></div></div>
      </Reveal>
      <Reveal className="v-signup-card" delay={.08}>
        <div className="v-signup-card-head"><Camera size={22} /><div><span>PHOTOGRAPHER SIGN IN</span><strong>Continue to your account</strong></div></div>
        <h2>Sign in to Veylo</h2>
        <p className="v-copy">Use the email address connected to your photographer or studio account.</p>
        <GoogleSignIn onCredential={google} onUnavailable={() => setStatus(current => ({ ...current, error: 'Google sign-in is not available right now. Use your email to continue.' }))} />
        <div className="v-auth-divider"><span>or sign in with email</span></div>
        <form className="v-form" onSubmit={submit}>
          <div className="v-field"><label htmlFor="signin-email">Email address</label><input id="signin-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></div>
          <div className="v-field"><div className="v-auth-label-row"><label htmlFor="signin-password">Password</label><Link to="/forgot-password">Forgot password?</Link></div><div className="v-password-input"><input id="signin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
          <label className="v-auth-consent"><input type="checkbox" checked={form.remember} onChange={event => setForm(current => ({ ...current, remember: event.target.checked }))} /><span>Keep me signed in on this device</span></label>
          <div className={status.challenge ? 'v-challenge-visible' : ''}><TurnstileCheck ref={challengeRef} action="login" onVerify={setTurnstileToken} /></div>
          {status.error && <p className="v-form-status" role="alert">{status.error}</p>}
          <button type="submit" className="v-button" disabled={status.loading || (status.challenge && !turnstileToken)}>{status.loading ? 'Signing you in…' : status.challenge && !turnstileToken ? 'Complete the security check' : 'Sign in'}<ArrowRight size={18} /></button>
        </form>
        <p className="v-signup-login">New to Veylo? <Link to="/signup">Create an account</Link></p>
        <p className="v-fine">By continuing, you agree to the <Link to="/terms">terms of use</Link> and acknowledge the <Link to="/privacy">privacy policy</Link>.</p>
      </Reveal>
    </section>
  </Page>;
}
