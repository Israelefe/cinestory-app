import { ProPrice } from '../components/ProPricing.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BadgeCheck, Camera, CreditCard, Images, Save, ShieldCheck, Trash2, Upload, UserRound, MapPin, MessageCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import GoogleSignIn from '../components/GoogleSignIn.jsx';
import { Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';
import StudioBrandField from '../components/StudioBrandField.jsx';
import { uploadProfileImage } from '../utils/profileUpload.js';
import useStudioNameAvailability, { cleanBrandName } from '../hooks/useStudioNameAvailability.js';
import './StudioWorkspace.css';

const profileSpecialties = ['Portraits', 'Weddings', 'Birthdays', 'Fashion and editorial', 'Commercial and branding', 'Maternity', 'Graduation', 'Events', 'Other'];

function profileFromUser(user) {
  return {
    name: user?.name || '',
    studioName: user?.studio?.name || '',
    businessType: user?.studio?.businessType || 'individual',
    city: user?.studio?.city || '',
    state: user?.studio?.state || '',
    specialties: Array.isArray(user?.studio?.specialties) ? user.studio.specialties : [],
    instagram: user?.studio?.instagram || '',
    whatsapp: user?.studio?.whatsapp || ''
  };
}

function changeDate(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value)); } catch { return ''; }
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
  const studioNameLocked = Boolean(user?.profileChangePolicy?.studioNameNextChangeAt);
  const nameAvailability = useStudioNameAvailability(profileForm.studioName, user?.studio?.name);
  const nameChanged = Boolean(user?.studio?.name) && cleanBrandName(profileForm.studioName) !== cleanBrandName(user.studio.name);
  const isPro = ['pro', 'studio'].includes(user?.plan);

  useEffect(() => {
    setProfileForm(profileFromUser(user));
  }, [user?.id, user?._id]);

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
    if (profileStatus.saving || profileStatus.uploading || !nameAvailability.canSubmit) return;
    setProfileStatus({ saving: true, uploading: false, error: '' });
    try {
      const { data } = await api.patch('/v1/auth/profile', profileForm);
      onUserUpdated?.(data.user);
      setProfileForm(profileFromUser(data.user));
      toast.success('Your account details were saved.');
    } catch (error) {
      if (error.response?.data?.code === 'STUDIO_NAME_TAKEN') nameAvailability.reject(error.response.data.message);
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
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setProfileStatus({ saving: false, uploading: false, error: 'Choose a JPEG, PNG or WebP image up to 5 MB.' });
      return;
    }
    setProfileStatus({ saving: false, uploading: true, error: '' });
    try {
      const { data } = await uploadProfileImage(file);
      onUserUpdated?.(data.user);
      toast.success('Studio image updated.');
    } catch (error) {
      setProfileStatus({ saving: false, uploading: false, error: apiMessage(error, 'We could not update your studio image. Please try again.') });
      return;
    }
    setProfileStatus({ saving: false, uploading: false, error: '' });
  }

  return <Page className="v-account-page v-studio-ui" footer={false}>
    <section className="v-wrap v-account-wrap">
      <Reveal className="v-account-heading">
        <Link to="/dashboard" className="v-auth-text-button"><ArrowLeft size={16} />Back to my deliveries</Link>
        <p className="v-eyebrow">YOUR ACCOUNT</p>
        <h1>Account settings<span>.</span></h1>
        <p>Your brand, contact details, and account, in one place.</p>
      </Reveal>

      <div className="v-account-layout">
      <aside className="v-account-sidebar">
      <Reveal className="v-account-summary" delay={.06}>
        <span className="v-account-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : <Camera size={23} />}</span>
        <div><small>ACCOUNT</small><strong>{user?.studio?.name || user?.name}</strong><p>{user?.email}</p></div>
        <span className="v-account-plan"><BadgeCheck size={15} />Veylo {isPro ? 'Pro' : 'Free'}</span>
      </Reveal>
      <nav className="v-account-section-nav" aria-label="Account settings sections"><a href="#account-profile"><Camera size={17} />Brand & profile</a><a href="#account-tools"><Images size={17} />Your work</a><a href="#account-plan"><CreditCard size={17} />Plan & billing</a><a href="#account-delete"><ShieldCheck size={17} />Account controls</a></nav>
      <p className="v-account-sidebar-note">Keep your Studio or Brand name consistent with the name you use when clients book a shoot.</p>
      </aside>
      <div className="v-account-content">

      <Reveal id="account-profile" className="v-account-profile" delay={.08}>
        <header className="v-account-profile-head">
          <div><p>BRAND & PROFILE</p><h2>The name behind your work.</h2><span>These details appear on your portfolio and supported client delivery pages.</span></div>
        </header>
        <form className="v-profile-form" onSubmit={saveProfile}>
          <fieldset className="v-account-form-section" disabled={profileStatus.saving || profileStatus.uploading}>
          <legend><Camera size={18} />Your brand</legend>
          <button type="button" className="v-profile-image-button" onClick={() => logoInputRef.current?.click()} disabled={profileStatus.uploading || profileStatus.saving}>
            <span className="v-profile-image-preview">{user?.avatar ? <img src={user.avatar} alt="" /> : <Camera size={20} />}</span>
            <span><strong>{profileStatus.uploading ? 'Uploading…' : 'Change studio image'}</strong><small>JPEG, PNG or WebP · 5 MB max</small></span>
            <Upload size={16} />
          </button>
          <input ref={logoInputRef} className="v-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadLogo} />
          <StudioBrandField id="profile-studio-name" value={profileForm.studioName} onChange={value => updateProfileField('studioName', value)} availability={nameAvailability} lockedUntil={studioNameLocked ? changeDate(user.profileChangePolicy.studioNameNextChangeAt) : ''} />
          {!studioNameLocked && <p className="v-profile-help v-brand-policy">{nameChanged ? 'Saving will change the name on your public pages. You can change it again after 30 days.' : 'You can change your Studio or Brand name once every 30 days.'}</p>}
          </fieldset>
          <fieldset className="v-account-form-section" disabled={profileStatus.saving || profileStatus.uploading}>
          <legend><UserRound size={18} />Account owner</legend>
          <div className="v-profile-grid">
            <div className="v-field"><label htmlFor="profile-name">Your name</label><input id="profile-name" value={profileForm.name} onChange={event => updateProfileField('name', event.target.value)} maxLength={100} autoComplete="name" required /></div>
            <div className="v-field"><label htmlFor="profile-email">Email address</label><input id="profile-email" value={user?.email || ''} readOnly disabled /><small className="v-profile-help">Email changes need a separate verification step, so contact support if you need to change it.</small></div>
          </div>
          </fieldset>
          <fieldset className="v-account-form-section" disabled={profileStatus.saving || profileStatus.uploading}>
          <legend><MapPin size={18} />Location & work</legend>
          <div className="v-profile-grid">
            <div className="v-field"><label htmlFor="profile-business-type">How you work</label><select id="profile-business-type" value={profileForm.businessType} onChange={event => updateProfileField('businessType', event.target.value)}><option value="individual">I work on my own</option><option value="studio">I run a studio or team</option></select></div>
            <div className="v-field"><label htmlFor="profile-city">City</label><input id="profile-city" value={profileForm.city} onChange={event => updateProfileField('city', event.target.value)} maxLength={80} autoComplete="address-level2" required /></div>
            <div className="v-field"><label htmlFor="profile-state">State</label><input id="profile-state" value={profileForm.state} onChange={event => updateProfileField('state', event.target.value)} maxLength={80} autoComplete="address-level1" required /></div>
          </div>
          <fieldset className="v-profile-specialties"><legend>What do you photograph?</legend><div>{profileSpecialties.map(specialty => <label key={specialty} className={profileForm.specialties.includes(specialty) ? 'is-selected' : ''}><input type="checkbox" checked={profileForm.specialties.includes(specialty)} onChange={() => toggleSpecialty(specialty)} /><span>{specialty}</span></label>)}</div></fieldset>
          </fieldset>
          <fieldset className="v-account-form-section" disabled={profileStatus.saving || profileStatus.uploading}>
          <legend><MessageCircle size={18} />Client contact</legend>
          <div className="v-profile-grid v-profile-contact-grid">
            <div className="v-field"><label htmlFor="profile-instagram">Instagram username <small>Optional</small></label><input id="profile-instagram" value={profileForm.instagram} onChange={event => updateProfileField('instagram', event.target.value.replace(/^@/, ''))} maxLength={80} autoComplete="off" placeholder="yourstudio" /></div>
            <div className="v-field"><label htmlFor="profile-whatsapp">WhatsApp number <small>Optional</small></label><input id="profile-whatsapp" value={profileForm.whatsapp} onChange={event => updateProfileField('whatsapp', event.target.value.replace(/[^0-9+]/g, ''))} maxLength={30} autoComplete="tel" placeholder="234…" /></div>
          </div>
          </fieldset>
          {profileStatus.error && <p className="v-form-status" role="alert">{profileStatus.error}</p>}
          <div className="v-profile-actions"><span>Changes are saved when you press Save.</span><button type="submit" disabled={profileStatus.saving || profileStatus.uploading || profileForm.specialties.length === 0 || !nameAvailability.canSubmit}><Save size={16} />{profileStatus.saving ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      </Reveal>

      <Reveal id="account-tools" className="v-account-tools" delay={.1}>
        <header><div><p>STUDIO TOOLS</p><span>Keep the parts of your studio you use between deliveries in one place.</span></div></header>
        <div className="v-account-tool-grid">
          <Link to="/library"><span className="v-account-tool-icon"><Images size={19} /></span><span><strong>Image library</strong><small>Store originals, prepare client selections, and exchange edits with your editor.</small></span><ArrowRight size={17} /></Link>
          <Link to="/portfolio/manage"><span className="v-account-tool-icon"><Camera size={19} /></span><span><strong>Studio portfolio</strong><small>Choose the work prospective clients can see.</small></span><ArrowRight size={17} /></Link>
        </div>
      </Reveal>

      <Reveal id="account-plan" className="v-account-billing" delay={.12}>
        <span><CreditCard size={20} /></span>
        <div><small>PLAN AND BILLING</small><strong>Manage {isPro ? 'your Pro subscription' : 'your Veylo plan'}</strong><p>See plan limits, payment history, and monthly subscription controls. New Pro subscriptions: <ProPrice /> / month.</p></div>
        <Link to="/billing">Open billing</Link>
      </Reveal>

      <Reveal id="account-delete" className="v-delete-account" delay={.14}>
        <header><span><Trash2 size={20} /></span><div><p className="v-eyebrow">Permanent deletion</p><h2>Delete this account</h2></div></header>
        <p>This removes your profile, studio details, deliveries, account sessions, and Veylo-hosted files connected to this account. Published client links will stop working. This cannot be undone.</p>
        <p>Renewals must stop before deletion completes. A restricted payment and refund record is kept for up to six years after deletion for billing disputes and accounting. See our <Link to="/privacy">Privacy Policy</Link>.</p>
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
      </div>
      </div>
    </section>
  </Page>;
}
