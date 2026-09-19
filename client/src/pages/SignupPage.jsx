import React, { useCallback, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Check, Eye, EyeOff, Image, ShieldCheck } from 'lucide-react';
import TurnstileCheck from '../components/TurnstileCheck.jsx';
import GoogleSignIn from '../components/GoogleSignIn.jsx';
import { Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

const included = ['Three client deliveries every month', 'All eight delivery formats', 'Full galleries and downloads'];

function PasswordField({ id, name, label, shown, value, onChange }) {
  return <div className="v-field"><label htmlFor={id}>{label}</label><input id={id} name={name} type={shown ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} value={value} onChange={onChange} /></div>;
}

export default function SignupPage({ onAuthenticated }) {
  const navigate = useNavigate();
  const location = useLocation();
  const challengeRef = useRef(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', accepted: false });
  const [turnstileToken, setTurnstileToken] = useState('');
  const [status, setStatus] = useState({ loading: false, error: '' });
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  async function submit(event) {
    event.preventDefault();
    if (!form.accepted) return setStatus({ loading: false, error: 'Agree to the terms and privacy policy to continue.' });
    if (form.password !== form.confirmPassword) return setStatus({ loading: false, error: 'The passwords do not match.' });
    if (!turnstileToken) return setStatus({ loading: false, error: 'Complete the security check to create your account.' });
    setStatus({ loading: true, error: '' });
    try {
      const { data } = await api.post('/v1/auth/register', { ...form, turnstileToken });
      sessionStorage.setItem('veylo_pending_email', data.email);
      const plan = new URLSearchParams(location.search).get('plan');
      if (plan) sessionStorage.setItem('veylo_selected_plan', plan);
      navigate('/verify-email', { state: { email: data.email } });
    } catch (error) {
      if (error.response?.data?.code === 'RESEND_WAIT' && error.response.data.email) {
        sessionStorage.setItem('veylo_pending_email', error.response.data.email);
        navigate('/verify-email', { state: { email: error.response.data.email } });
        return;
      }
      challengeRef.current?.reset();
      setTurnstileToken('');
      setStatus({ loading: false, error: apiMessage(error, 'We could not create your account. Please try again.') });
    }
  }

  const google = useCallback(async credential => {
    setStatus({ loading: true, error: '' });
    try {
      const { data } = await api.post('/v1/auth/google', { credential });
      onAuthenticated(data.user);
      navigate(data.next || '/onboarding', { replace: true });
    } catch (error) {
      if (error.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        const pendingEmail = error.response.data.email;
        sessionStorage.setItem('veylo_pending_email', pendingEmail);
        navigate('/verify-email', { state: { email: pendingEmail } });
        return;
      }
      setStatus({ loading: false, error: apiMessage(error, 'Google sign-in could not be completed.') });
    }
  }, [navigate, onAuthenticated]);

  return <Page className="v-auth-page" footer={false}>
    <section className="v-auth-stage">
      <Reveal className="v-auth-visual">
        <img src="/veylo/pv-green-portrait.jpeg" alt="A finished studio portrait ready for client delivery" loading="eager" fetchPriority="high" decoding="async" />
        <div className="v-auth-visual-shade" />
        <div className="v-auth-visual-copy">
          <p><Image size={15} />The photographs are ready</p>
          <h1>Give the reveal<br /><em>the same care.</em></h1>
          <span>Your client remembers how the photographs arrived.</span>
        </div>
        <div className="v-auth-visual-note"><BadgeCheck size={17} /><span><strong>Veylo Free</strong>No payment card needed</span></div>
      </Reveal>

      <Reveal className="v-auth-panel" delay={.06}>
        <header className="v-auth-panel-head">
          <div><p className="v-eyebrow"><ShieldCheck size={14} />Create your photographer account</p><h2>Start with Veylo Free.</h2></div>
          <p>Already registered? <Link to="/signin">Sign in</Link></p>
        </header>
        <div className="v-auth-included">{included.map(item => <span key={item}><Check size={14} />{item}</span>)}</div>
        <GoogleSignIn context="signup" onCredential={google} onUnavailable={message => setStatus({ loading: false, error: message || 'Google sign-in is not available right now. Use your email to continue.' })} />
        <div className="v-auth-divider"><span>or continue with email</span></div>
        <form className="v-form" onSubmit={submit}>
          <div className="v-auth-two"><div className="v-field"><label htmlFor="signup-name">Your name</label><input id="signup-name" name="name" autoComplete="name" required minLength={2} maxLength={100} value={form.name} onChange={update} /></div><div className="v-field"><label htmlFor="signup-email">Email address</label><input id="signup-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} value={form.email} onChange={update} /></div></div>
          <div className="v-auth-two"><PasswordField id="signup-password" name="password" label="Create a password" shown={showPasswords} value={form.password} onChange={update} /><PasswordField id="signup-confirm-password" name="confirmPassword" label="Confirm password" shown={showPasswords} value={form.confirmPassword} onChange={update} /></div>
          <label className="v-password-toggle"><input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} /><span>{showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}Show passwords</span></label>
          <label className="v-auth-consent"><input name="accepted" type="checkbox" checked={form.accepted} onChange={update} /><span>I agree to Veylo’s <Link to="/terms">terms of use</Link> and <Link to="/privacy">privacy policy</Link>.</span></label>
          <TurnstileCheck ref={challengeRef} action="register" onVerify={setTurnstileToken} />
          {status.error && <p className="v-form-status" role="alert">{status.error}</p>}
          <button type="submit" className="v-button v-auth-submit" disabled={status.loading || !turnstileToken || !form.accepted}>{status.loading ? 'Creating your account…' : !turnstileToken ? 'Complete the security check' : 'Create free account'}<ArrowRight size={18} /></button>
        </form>
        <p className="v-auth-privacy">We will email a six-digit code before your account can be used.</p>
      </Reveal>
    </section>
  </Page>;
}
