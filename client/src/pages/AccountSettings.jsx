import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, CreditCard, ShieldCheck, Trash2 } from 'lucide-react';
import GoogleSignIn from '../components/GoogleSignIn.jsx';
import { Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

export default function AccountSettings({ user, onAccountDeleted }) {
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState({ loading: false, error: '' });
  const usesPassword = user?.providers?.includes('password');
  const emailMatches = confirmation.trim().toLowerCase() === user?.email?.toLowerCase();

  const removeAccount = useCallback(async payload => {
    setStatus({ loading: true, error: '' });
    try {
      await api.delete('/v1/auth/account', { data: { confirmation: confirmation.trim(), ...payload } });
      sessionStorage.clear();
      onAccountDeleted();
    } catch (error) {
      setStatus({ loading: false, error: apiMessage(error, 'We could not delete your account. Please try again.') });
    }
  }, [confirmation, onAccountDeleted]);

  function submitPassword(event) {
    event.preventDefault();
    if (!emailMatches || !password || status.loading) return;
    removeAccount({ password });
  }

  return <Page className="v-account-page" footer={false}>
    <section className="v-wrap v-account-wrap">
      <Reveal className="v-account-heading">
        <Link to="/dashboard" className="v-auth-text-button"><ArrowLeft size={16} />Back to my deliveries</Link>
        <p className="v-eyebrow"><Camera size={15} />Your Veylo account</p>
        <h1>Account settings.</h1>
        <p>Review the account connected to your studio and permanently remove it when you no longer want Veylo to hold your data.</p>
      </Reveal>

      <Reveal className="v-account-summary" delay={.06}>
        <span className="v-account-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : <Camera size={23} />}</span>
        <div><small>ACCOUNT</small><strong>{user?.studio?.name || user?.name}</strong><p>{user?.email}</p></div>
        <span className="v-account-plan"><ShieldCheck size={15} />Veylo {user?.plan === 'pro' ? 'Pro' : 'Free'}</span>
      </Reveal>

      <Reveal className="v-account-billing" delay={.08}>
        <span><CreditCard size={20} /></span>
        <div><small>PLAN AND BILLING</small><strong>Manage {user?.plan === 'pro' ? 'your Pro subscription' : 'your Veylo plan'}</strong><p>See plan limits, payment history, and monthly subscription controls.</p></div>
        <Link to="/billing">Open billing</Link>
      </Reveal>

      <Reveal className="v-delete-account" delay={.1}>
        <header><span><Trash2 size={20} /></span><div><p className="v-eyebrow">Permanent deletion</p><h2>Delete this account</h2></div></header>
        <p>This removes your profile, studio details, deliveries, account sessions, and Veylo-hosted files connected to this account. Published client links will stop working. This cannot be undone.</p>
        <div className="v-delete-list"><span>Account and studio profile</span><span>Every delivery and client link</span><span>Sessions, verification codes, and reset records</span><span>Veylo-hosted profile and delivery files</span></div>
        <div className="v-field"><label htmlFor="delete-confirmation">Type your email address to continue</label><input id="delete-confirmation" type="email" autoComplete="email" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder={user?.email} disabled={status.loading} /></div>
        {usesPassword ? <form className="v-form" onSubmit={submitPassword}>
          <div className="v-field"><label htmlFor="delete-password">Current password</label><input id="delete-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={status.loading} /></div>
          {status.error && <p className="v-form-status" role="alert">{status.error}</p>}
          <button className="v-delete-button" disabled={!emailMatches || !password || status.loading}><Trash2 size={17} />{status.loading ? 'Deleting your account…' : 'Delete my account permanently'}</button>
        </form> : <div className="v-google-delete">
          <p>Confirm with the Google account connected to this email address.</p>
          {status.error && <p className="v-form-status" role="alert">{status.error}</p>}
          {emailMatches ? <GoogleSignIn onCredential={credential => removeAccount({ googleCredential: credential })} onUnavailable={message => setStatus({ loading: false, error: message || 'Google confirmation is not available right now.' })} /> : <button className="v-delete-button" disabled><Trash2 size={17} />Type your email to continue</button>}
        </div>}
      </Reveal>
    </section>
  </Page>;
}
