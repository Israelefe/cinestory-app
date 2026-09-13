import React, { useCallback, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import TypedHeading from '../components/TypedHeading.jsx';
import TurnstileCheck from '../components/TurnstileCheck.jsx';
import GoogleSignIn from '../components/GoogleSignIn.jsx';
import { Eyebrow, Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

const reasons = ['3 final photo deliveries each month on Veylo Free', 'The complete client gallery and downloads', 'No payment card needed to create your account'];

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
      setStatus({ loading: false, error: apiMessage(error, 'Google sign-in could not be completed.') });
    }
  }, [navigate, onAuthenticated]);

  return <Page className="v-signup-page">
    <section className="v-wrap v-signup-grid">
      <Reveal className="v-signup-intro">
        <Eyebrow><Camera size={15} />Start with Veylo Free</Eyebrow>
        <TypedHeading lines={[{ text: 'Give your next delivery' }, { text: 'a better first look.', accent: true }]} />
        <p>Create your photographer account and turn a finished shoot into a client experience worth opening.</p>
        <div className="v-signup-photo"><img src="/veylo/pv-green-portrait.jpeg" alt="A finished portrait ready to be delivered with Veylo" loading="eager" fetchPriority="high" decoding="async" /><div><span>YOUR NEXT DELIVERY</span><strong>Ready when the photographs are.</strong></div></div>
      </Reveal>
      <Reveal className="v-signup-card" delay={.08}>
        <div className="v-signup-card-head"><ShieldCheck size={22} /><div><span>VEYLO FREE</span><strong>₦0 / month</strong></div></div>
        <h2>Create your account</h2>
        <p className="v-copy">Start with three final photo deliveries each month. You can move to Pro when your studio needs more.</p>
        <GoogleSignIn onCredential={google} onUnavailable={() => setStatus({ loading: false, error: 'Google sign-in is not available right now. Use your email to continue.' })} />
        <div className="v-auth-divider"><span>or create an account with email</span></div>
        <form className="v-form" onSubmit={submit}>
          <div className="v-field"><label htmlFor="signup-name">Your name</label><input id="signup-name" name="name" autoComplete="name" required minLength={2} maxLength={100} value={form.name} onChange={update} /></div>
          <div className="v-field"><label htmlFor="signup-email">Email address</label><input id="signup-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} value={form.email} onChange={update} /></div>
          <PasswordField id="signup-password" name="password" label="Create a password" shown={showPasswords} value={form.password} onChange={update} />
          <PasswordField id="signup-confirm-password" name="confirmPassword" label="Confirm password" shown={showPasswords} value={form.confirmPassword} onChange={update} />
          <label className="v-password-toggle"><input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} /><span>{showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}Show passwords</span></label>
          <label className="v-auth-consent"><input name="accepted" type="checkbox" checked={form.accepted} onChange={update} /><span>I agree to Veylo’s <Link to="/terms">terms of use</Link> and <Link to="/privacy">privacy policy</Link>.</span></label>
          <TurnstileCheck ref={challengeRef} action="register" onVerify={setTurnstileToken} />
          {status.error && <p className="v-form-status" role="alert">{status.error}</p>}
          <button type="submit" className="v-button" disabled={status.loading || !turnstileToken}>{status.loading ? 'Creating your account…' : !turnstileToken ? 'Completing security check…' : 'Create free account'}<ArrowRight size={18} /></button>
        </form>
        <ul>{reasons.map(reason => <li key={reason}><Check size={15} /><span>{reason}</span></li>)}</ul>
        <p className="v-signup-login">Already have an account? <Link to="/signin">Sign in</Link></p>
      </Reveal>
    </section>
  </Page>;
}
