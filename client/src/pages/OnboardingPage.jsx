import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Camera, Check, Image, MapPin, Upload, Users } from 'lucide-react';
import { Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

const workTypes = ['Portraits', 'Weddings', 'Birthdays', 'Fashion and editorial', 'Commercial and branding', 'Maternity', 'Graduation', 'Events', 'Other'];
const sources = ['Instagram', 'TikTok', 'YouTube', 'Google Search', 'WhatsApp', 'Another photographer', 'Friend or colleague', 'Event or workshop', 'Other', 'Prefer not to say'];
const stepCopy = [
  { label: 'Studio details', title: 'What do clients call your studio?', text: 'Add the name and location your clients already know.' },
  { label: 'Your work', title: 'What do you usually photograph?', text: 'Choose the shoots you deliver most often. You can change these later.' },
  { label: 'How you found us', title: 'One last question.', text: 'Tell us where you first heard about Veylo.' }
];

export default function OnboardingPage({ user, onAuthenticated }) {
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const previewUrl = useRef('');
  const initialStep = Math.min(3, Math.max(1, user?.onboardingStep || 1));
  const params = new URLSearchParams(window.location.search);
  const [step, setStep] = useState(initialStep);
  const [studio, setStudio] = useState({ studioName: user?.studio?.name || '', businessType: user?.studio?.businessType || '', city: user?.studio?.city || '', state: user?.studio?.state || '' });
  const [work, setWork] = useState({ specialties: user?.studio?.specialties || [], instagram: user?.studio?.instagram || '', whatsapp: user?.studio?.whatsapp || '' });
  const [discovery, setDiscovery] = useState({ source: user?.acquisition?.source || '', otherSource: user?.acquisition?.otherSource || '', utmSource: (params.get('utm_source') || sessionStorage.getItem('veylo_utm_source') || '').slice(0, 120), utmCampaign: (params.get('utm_campaign') || sessionStorage.getItem('veylo_utm_campaign') || '').slice(0, 120), referrer: (sessionStorage.getItem('veylo_referrer') || '').slice(0, 500) });
  const [logo, setLogo] = useState(user?.studio?.logoUrl || '');
  const [status, setStatus] = useState({ loading: false, error: '', upload: false });
  const current = stepCopy[step - 1];

  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  function toggleSpecialty(value) {
    setWork(currentWork => ({ ...currentWork, specialties: currentWork.specialties.includes(value) ? currentWork.specialties.filter(item => item !== value) : [...currentWork.specialties, value] }));
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setStatus({ loading: false, upload: false, error: 'Choose a JPEG, PNG or WebP image.' });
    if (file.size > 5 * 1024 * 1024) return setStatus({ loading: false, upload: false, error: 'That image is larger than 5 MB. Choose a smaller file.' });
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(file);
    setLogo(previewUrl.current);
    setStatus({ loading: false, upload: true, error: '' });
    try {
      const body = new FormData();
      body.append('logo', file, file.name);
      const { data } = await api.post('/v1/onboarding/logo', body, { timeout: 90000 });
      setLogo(data.url);
      onAuthenticated(data.user);
      setStatus({ loading: false, upload: false, error: '' });
    } catch (error) {
      setLogo(user?.studio?.logoUrl || '');
      setStatus({ loading: false, upload: false, error: apiMessage(error, 'We could not upload that image. Your other details are still safe.') });
    }
  }

  async function next(event) {
    event.preventDefault();
    const data = step === 1 ? studio : step === 2 ? work : discovery;
    setStatus(currentStatus => ({ ...currentStatus, loading: true, error: '' }));
    try {
      const saved = await api.patch('/v1/onboarding', { step, data });
      onAuthenticated(saved.data.user);
      if (step < 3) {
        setStep(value => value + 1);
        setStatus({ loading: false, upload: false, error: '' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const completed = await api.post('/v1/onboarding/complete');
      onAuthenticated(completed.data.user);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setStatus(currentStatus => ({ ...currentStatus, loading: false, error: apiMessage(error, 'We could not save this step. Please try again.') }));
    }
  }

  return <Page className="v-onboarding-page" footer={false}>
    <section className="v-onboarding-stage">
      <Reveal className="v-onboarding-guide">
        <p className="v-eyebrow">A short studio setup</p>
        <h1>Make Veylo<br /><em>feel like yours.</em></h1>
        <p>Three short steps, then you can prepare your first client delivery.</p>
        <ol>{stepCopy.map((item, index) => <li key={item.label} className={step === index + 1 ? 'is-current' : step > index + 1 ? 'is-complete' : ''}><span>{step > index + 1 ? <Check size={14} /> : `0${index + 1}`}</span><div><strong>{item.label}</strong><small>{index === 0 ? 'Name, image, and location' : index === 1 ? 'Shoot types and contact details' : 'One quick answer'}</small></div></li>)}</ol>
        <p className="v-onboarding-account">Signed in as <strong>{user?.email}</strong></p>
      </Reveal>

      <Reveal className="v-onboarding-workspace" delay={.06}>
        <header><div><p>STEP {step} OF 3 · {current.label.toUpperCase()}</p><h2>{current.title}</h2><span>{current.text}</span></div><strong>{Math.round((step / 3) * 100)}%</strong></header>
        <div className="v-onboarding-progress" aria-label={`Step ${step} of 3`}><i style={{ transform: `scaleX(${step / 3})` }} /></div>
        <form className="v-form" onSubmit={next}>
          {step === 1 && <>
            <button type="button" className="v-studio-image-picker" onClick={() => !status.upload && fileInput.current?.click()} disabled={status.upload}>
              <span>{logo ? <img src={logo} alt="Studio profile preview" /> : <Image size={25} />}</span>
              <div><strong>{status.upload ? 'Uploading your image…' : logo ? 'Change studio image' : 'Add a studio image'}</strong><small>Optional · JPEG, PNG or WebP · Up to 5 MB</small></div>
              <Upload size={18} />
            </button>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadLogo} hidden />
            <div className="v-field"><label htmlFor="studio-name">Studio or photographer name</label><input id="studio-name" required minLength={2} maxLength={100} value={studio.studioName} onChange={event => setStudio(value => ({ ...value, studioName: event.target.value }))} placeholder="For example, Veylo Media" /></div>
            <fieldset className="v-choice-field"><legend>How do you work?</legend><div className="v-choice-pair">
              <label className={studio.businessType === 'individual' ? 'is-selected' : ''}><input type="radio" name="businessType" value="individual" required checked={studio.businessType === 'individual'} onChange={event => setStudio(value => ({ ...value, businessType: event.target.value }))} /><Camera size={19} /><span><strong>Independent photographer</strong><small>I work under my own name or brand.</small></span></label>
              <label className={studio.businessType === 'studio' ? 'is-selected' : ''}><input type="radio" name="businessType" value="studio" required checked={studio.businessType === 'studio'} onChange={event => setStudio(value => ({ ...value, businessType: event.target.value }))} /><Users size={19} /><span><strong>Studio team</strong><small>More than one person works from this account.</small></span></label>
            </div></fieldset>
            <div className="v-form-row"><div className="v-field"><label htmlFor="studio-city">City</label><div className="v-field-icon"><MapPin size={16} /><input id="studio-city" required minLength={2} maxLength={80} value={studio.city} onChange={event => setStudio(value => ({ ...value, city: event.target.value }))} placeholder="Lagos" /></div></div><div className="v-field"><label htmlFor="studio-state">State</label><input id="studio-state" required minLength={2} maxLength={80} value={studio.state} onChange={event => setStudio(value => ({ ...value, state: event.target.value }))} placeholder="Lagos" /></div></div>
          </>}
          {step === 2 && <>
            <fieldset className="v-choice-field"><legend>Choose all that apply</legend><div className="v-chip-grid">{workTypes.map(item => <label key={item} className={work.specialties.includes(item) ? 'is-selected' : ''}><input type="checkbox" checked={work.specialties.includes(item)} onChange={() => toggleSpecialty(item)} /><span>{work.specialties.includes(item) && <Check size={14} />}{item}</span></label>)}</div></fieldset>
            <div className="v-form-row"><div className="v-field"><label htmlFor="studio-instagram">Instagram <small>Optional</small></label><input id="studio-instagram" maxLength={80} value={work.instagram} onChange={event => setWork(value => ({ ...value, instagram: event.target.value }))} placeholder="@yourstudio" /></div><div className="v-field"><label htmlFor="studio-whatsapp">WhatsApp number <small>Optional</small></label><input id="studio-whatsapp" inputMode="tel" maxLength={30} value={work.whatsapp} onChange={event => setWork(value => ({ ...value, whatsapp: event.target.value }))} placeholder="+234" /></div></div>
          </>}
          {step === 3 && <>
            <fieldset className="v-choice-field"><legend>Choose one</legend><div className="v-source-grid">{sources.map(item => <label key={item} className={discovery.source === item ? 'is-selected' : ''}><input type="radio" name="source" required checked={discovery.source === item} onChange={() => setDiscovery(value => ({ ...value, source: item }))} /><span>{item}</span></label>)}</div></fieldset>
            {discovery.source === 'Other' && <div className="v-field"><label htmlFor="other-source">Where did you hear about Veylo?</label><input id="other-source" required maxLength={120} value={discovery.otherSource} onChange={event => setDiscovery(value => ({ ...value, otherSource: event.target.value }))} /></div>}
          </>}
          {status.error && <p className="v-form-status" role="alert">{status.error}</p>}
          <div className="v-onboarding-actions">{step > 1 && <button type="button" className="v-auth-text-button" onClick={() => setStep(value => value - 1)}><ArrowLeft size={16} />Back</button>}<button className="v-button" disabled={status.loading || status.upload}>{status.loading ? 'Saving…' : step === 3 ? 'Open my dashboard' : 'Save and continue'}<ArrowRight size={18} /></button></div>
        </form>
      </Reveal>
    </section>
  </Page>;
}
