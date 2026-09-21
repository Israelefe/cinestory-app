import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Camera, CreditCard, Images, Save, ShieldCheck, Trash2, Upload } from 'lucide-react';
import GoogleSignIn from '../components/GoogleSignIn.jsx';
import { Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

const profileSpecialties = ['Portraits', 'Weddings', 'Birthdays', 'Fashion and editorial', 'Commercial and branding', 'Maternity', 'Graduation', 'Events', 'Other'];

function profileFromUser(user) {
  return {
    name: user?.name || '',
    studioName: user?.studio?.name || user?.name || '',
    businessType: user?.studio?.businessType || 'individual',
    city: user?.studio?.city || '',
    state: user?.studio?.state || '',
    specialties: Array.isArray(user?.studio?.specialties) ? user.studio.specialties : [],
    instagram: user?.studio?.instagram || '',
    whatsapp: user?.studio?.whatsapp || ''
  };
}

export default function AccountSettings({ user, onAccountDeleted, onUserUpdated }) {
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState({ loading: false, error: '' });
  const [profileForm, setProfileForm] = useState(() => profileFromUser(user));
  const [profileStatus, setProfileStatus] = useState({ saving: false, uploading: false, error: '' });
  const logoInputRef = useRef(null);
  const usesPassword = user?.providers?.includes('password');
  const emailMatches = confirmation.trim().toLowerCase() === user?.email?.toLowerCase();

  useEffect(() => {
    setProfileForm(profileFromUser(user));
  }, [user]);

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

  function updateProfileField(field, value) {
    setProfileForm(current => ({ ...current, [field]: value }));
  }

  function toggleSpecialty(specialty) {
    setProfileForm(current => ({
      ...current,
      specialties: current.specialties.includes(specialty)
        ? current.specialties.filter(item => item !== specialty)
        : [...current.specialties, specialty]
    }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (profileStatus.saving || profileStatus.uploading) return;
    setProfileStatus({ saving: true, uploading: false, error: '' });
    try {
      const { data } = await api.patch('/v1/auth/profile', profileForm);
      onUserUpdated?.(data.user);
      setProfileForm(profileFromUser(data.user));
      toast.success('Your account details were saved.');
    } catch (error) {
      const message = apiMessage(error, 'We could not save your account details. Please try again.');
      setProfileStatus({ saving: false, uploading: false, error: message });
      return;
    }
    setProfileStatus({ saving: false, uploading: false, error: '' });
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setProfileStatus({ saving: false, uploading: true, error: '' });
    try {
      const body = new FormData();
      body.append('logo', file);
      const { data } = await api.post('/v1/onboarding/logo', body, { timeout: 90000 });
      onUserUpdated?.(data.user);
      toast.success('Studio image updated.');
    } catch (error) {
      setProfileStatus({ saving: false, uploading: false, error: apiMessage(error, 'We could not update your studio image. Please try again.') });
      return;
    }
    setProfileStatus({ saving: false, uploading: false, error: '' });
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

      <Reveal className="v-account-profile" delay={.08}>
        <header className="v-account-profile-head">
          <div><p>PROFILE AND STUDIO</p><h2>Keep your details current.</h2><span>This is the information Veylo uses across your studio, portfolio, and client-facing pages.</span></div>
          <button type="button" className="v-profile-image-button" onClick={() => logoInputRef.current?.click()} disabled={profileStatus.uploading}>
            <span className="v-profile-image-preview">{user?.avatar ? <img src={user.avatar} alt="" /> : <Camera size={20} />}</span>
            <span><strong>{profileStatus.uploading ? 'Uploading…' : 'Change studio image'}</strong><small>JPEG, PNG or WebP · 5 MB max</small></span>
            <Upload size={16} />
          </button>
          <input ref={logoInputRef} className="v-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadLogo} />
        </header>
        <form className="v-profile-form" onSubmit={saveProfile}>
          <div className="v-profile-grid">
            <div className="v-field"><label htmlFor="profile-name">Your name</label><input id="profile-name" value={profileForm.name} onChange={event => updateProfileField('name', event.target.value)} maxLength={100} autoComplete="name" required /></div>
            <div className="v-field"><label htmlFor="profile-email">Email address</label><input id="profile-email" value={user?.email || ''} readOnly disabled /><small className="v-profile-help">Email changes need a separate verification step, so contact support if you need to change it.</small></div>
            <div className="v-field"><label htmlFor="profile-studio-name">Studio name</label><input id="profile-studio-name" value={profileForm.studioName} onChange={event => updateProfileField('studioName', event.target.value)} maxLength={100} autoComplete="organization" required /></div>
            <div className="v-field"><label htmlFor="profile-business-type">How you work</label><select id="profile-business-type" value={profileForm.businessType} onChange={event => updateProfileField('businessType', event.target.value)}><option value="individual">I work on my own</option><option value="studio">I run a studio or team</option></select></div>
            <div className="v-field"><label htmlFor="profile-city">City</label><input id="profile-city" value={profileForm.city} onChange={event => updateProfileField('city', event.target.value)} maxLength={80} autoComplete="address-level2" required /></div>
            <div className="v-field"><label htmlFor="profile-state">State</label><input id="profile-state" value={profileForm.state} onChange={event => updateProfileField('state', event.target.value)} maxLength={80} autoComplete="address-level1" required /></div>
          </div>
          <fieldset className="v-profile-specialties"><legend>What do you photograph?</legend><div>{profileSpecialties.map(specialty => <label key={specialty} className={profileForm.specialties.includes(specialty) ? 'is-selected' : ''}><input type="checkbox" checked={profileForm.specialties.includes(specialty)} onChange={() => toggleSpecialty(specialty)} /><span>{specialty}</span></label>)}</div></fieldset>
          <div className="v-profile-grid v-profile-contact-grid">
            <div className="v-field"><label htmlFor="profile-instagram">Instagram username <small>Optional</small></label><input id="profile-instagram" value={profileForm.instagram} onChange={event => updateProfileField('instagram', event.target.value.replace(/^@/, ''))} maxLength={80} autoComplete="off" placeholder="yourstudio" /></div>
            <div className="v-field"><label htmlFor="profile-whatsapp">WhatsApp number <small>Optional</small></label><input id="profile-whatsapp" value={profileForm.whatsapp} onChange={event => updateProfileField('whatsapp', event.target.value.replace(/[^0-9+]/g, ''))} maxLength={30} autoComplete="tel" placeholder="234…" /></div>
          </div>
          {profileStatus.error && <p className="v-form-status" role="alert">{profileStatus.error}</p>}
          <div className="v-profile-actions"><span>{profileForm.specialties.length ? `${profileForm.specialties.length} kind${profileForm.specialties.length === 1 ? '' : 's'} of work selected` : 'Choose at least one kind of work.'}</span><button type="submit" disabled={profileStatus.saving || profileStatus.uploading || profileForm.specialties.length === 0}><Save size={16} />{profileStatus.saving ? 'Saving…' : 'Save account details'}</button></div>
        </form>
      </Reveal>

      <Reveal className="v-account-tools" delay={.1}>
        <header><div><p>STUDIO TOOLS</p><span>Keep the parts of your studio you use between deliveries in one place.</span></div></header>
        <div className="v-account-tool-grid">
          <Link to="/library"><span className="v-account-tool-icon"><Images size={19} /></span><span><strong>Image library</strong><small>Reuse photographs you have already stored.</small></span><ArrowRight size={17} /></Link>
          <Link to="/portfolio/manage"><span className="v-account-tool-icon"><Camera size={19} /></span><span><strong>Studio portfolio</strong><small>Choose the work prospective clients can see.</small></span><ArrowRight size={17} /></Link>
        </div>
      </Reveal>

      <Reveal className="v-account-billing" delay={.12}>
        <span><CreditCard size={20} /></span>
        <div><small>PLAN AND BILLING</small><strong>Manage {user?.plan === 'pro' ? 'your Pro subscription' : 'your Veylo plan'}</strong><p>See plan limits, payment history, and monthly subscription controls.</p></div>
        <Link to="/billing">Open billing</Link>
      </Reveal>

      <Reveal className="v-delete-account" delay={.14}>
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
