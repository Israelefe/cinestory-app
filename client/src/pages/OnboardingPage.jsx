import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Camera, Check, Image, MapPin, Users } from 'lucide-react';
import { Page, Reveal } from '../components/PublicDesign.jsx';
import api, { apiMessage } from '../services/api.js';

const workTypes = ['Portraits', 'Weddings', 'Birthdays', 'Fashion and editorial', 'Commercial and branding', 'Maternity', 'Graduation', 'Events', 'Other'];
const sources = ['Instagram', 'TikTok', 'YouTube', 'Google Search', 'WhatsApp', 'Another photographer', 'Friend or colleague', 'Event or workshop', 'Other', 'Prefer not to say'];

export default function OnboardingPage({ user, onAuthenticated }) {
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const initialStep = Math.min(3, Math.max(1, user?.onboardingStep || 1));
  const params = new URLSearchParams(window.location.search);
  const [step, setStep] = useState(initialStep);
  const [studio, setStudio] = useState({ studioName: user?.studio?.name || '', businessType: user?.studio?.businessType || '', city: user?.studio?.city || '', state: user?.studio?.state || '' });
  const [work, setWork] = useState({ specialties: user?.studio?.specialties || [], instagram: user?.studio?.instagram || '', whatsapp: user?.studio?.whatsapp || '' });
  const [discovery, setDiscovery] = useState({ source: user?.acquisition?.source || '', otherSource: user?.acquisition?.otherSource || '', utmSource: (params.get('utm_source') || sessionStorage.getItem('veylo_utm_source') || '').slice(0, 120), utmCampaign: (params.get('utm_campaign') || sessionStorage.getItem('veylo_utm_campaign') || '').slice(0, 120), referrer: (sessionStorage.getItem('veylo_referrer') || '').slice(0, 500) });
  const [logo, setLogo] = useState(user?.studio?.logoUrl || '');
  const [status, setStatus] = useState({ loading: false, error: '', upload: false });

  useEffect(() => {
    if (user?.onboardingComplete) navigate('/dashboard', { replace: true });
  }, [navigate, user?.onboardingComplete]);

  function toggleSpecialty(value) {
    setWork(current => ({ ...current, specialties: current.specialties.includes(value) ? current.specialties.filter(item => item !== value) : [...current.specialties, value] }));
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return setStatus({ loading: false, upload: false, error: 'Choose a JPEG, PNG or WebP image no larger than 5 MB.' });
    setLogo(URL.createObjectURL(file));
    setStatus({ loading: false, upload: true, error: '' });
    try {
      const body = new FormData();
      body.append('logo', file);
      const { data } = await api.post('/v1/onboarding/logo', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      setLogo(data.url);
      onAuthenticated(data.user);
      setStatus({ loading: false, upload: false, error: '' });
    } catch (error) { setStatus({ loading: false, upload: false, error: apiMessage(error, 'We could not upload that image.') }); }
  }

  async function next(event) {
    event.preventDefault();
    const data = step === 1 ? studio : step === 2 ? work : discovery;
    setStatus(current => ({ ...current, loading: true, error: '' }));
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
    } catch (error) { setStatus(current => ({ ...current, loading: false, error: apiMessage(error, 'We could not save this step.') })); }
  }

  return <Page className="v-onboarding-page"><section className="v-wrap v-onboarding-wrap"><Reveal className="v-onboarding-heading"><p className="v-eyebrow">Your studio / {step} of 3</p><h1>{step === 1 ? 'Tell us what clients call your studio.' : step === 2 ? 'What kind of work do you photograph?' : 'One last question.'}</h1><p>{step === 1 ? 'This is the name and location Veylo will use around your account.' : step === 2 ? 'Choose the work you regularly deliver. You can change this later.' : 'How did you first hear about Veylo?'}</p><div className="v-onboarding-progress" aria-label={`Step ${step} of 3`}><i className={step >= 1 ? 'is-done' : ''} /><i className={step >= 2 ? 'is-done' : ''} /><i className={step >= 3 ? 'is-done' : ''} /></div></Reveal><Reveal className="v-onboarding-card" delay={.08}><form className="v-form" onSubmit={next}>
    {step === 1 && <><button type="button" className="v-logo-picker" onClick={() => fileInput.current?.click()}><span>{logo ? <img src={logo} alt="Studio profile preview" /> : <Image size={23} />}</span><div><strong>{status.upload ? 'Uploading your image…' : logo ? 'Change studio image' : 'Add a studio image'}</strong><small>Optional · JPEG, PNG or WebP · 5 MB maximum</small></div><ArrowRight size={17} /></button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadLogo} hidden /><div className="v-field"><label htmlFor="studio-name">Public studio name</label><input id="studio-name" required minLength={2} maxLength={100} value={studio.studioName} onChange={event => setStudio(current => ({ ...current, studioName: event.target.value }))} placeholder="For example, Veylo Media" /></div><fieldset className="v-choice-field"><legend>How do you work?</legend><div className="v-choice-pair"><label className={studio.businessType === 'individual' ? 'is-selected' : ''}><input type="radio" name="businessType" value="individual" checked={studio.businessType === 'individual'} onChange={event => setStudio(current => ({ ...current, businessType: event.target.value }))} /><Camera size={19} /><span><strong>Independent photographer</strong><small>I work under my own name or brand.</small></span></label><label className={studio.businessType === 'studio' ? 'is-selected' : ''}><input type="radio" name="businessType" value="studio" checked={studio.businessType === 'studio'} onChange={event => setStudio(current => ({ ...current, businessType: event.target.value }))} /><Users size={19} /><span><strong>Studio team</strong><small>More than one person works from this account.</small></span></label></div></fieldset><div className="v-form-row"><div className="v-field"><label htmlFor="studio-city">City</label><input id="studio-city" required minLength={2} maxLength={80} value={studio.city} onChange={event => setStudio(current => ({ ...current, city: event.target.value }))} placeholder="Lagos" /></div><div className="v-field"><label htmlFor="studio-state">State</label><input id="studio-state" required minLength={2} maxLength={80} value={studio.state} onChange={event => setStudio(current => ({ ...current, state: event.target.value }))} placeholder="Lagos" /></div></div></>}
    {step === 2 && <><fieldset className="v-choice-field"><legend>Choose all that apply</legend><div className="v-chip-grid">{workTypes.map(item => <label key={item} className={work.specialties.includes(item) ? 'is-selected' : ''}><input type="checkbox" checked={work.specialties.includes(item)} onChange={() => toggleSpecialty(item)} /><span>{work.specialties.includes(item) && <Check size={14} />}{item}</span></label>)}</div></fieldset><div className="v-form-row"><div className="v-field"><label htmlFor="studio-instagram">Instagram <small>Optional</small></label><input id="studio-instagram" maxLength={80} value={work.instagram} onChange={event => setWork(current => ({ ...current, instagram: event.target.value }))} placeholder="@yourstudio" /></div><div className="v-field"><label htmlFor="studio-whatsapp">WhatsApp business number <small>Optional</small></label><input id="studio-whatsapp" inputMode="tel" maxLength={30} value={work.whatsapp} onChange={event => setWork(current => ({ ...current, whatsapp: event.target.value }))} placeholder="+234" /></div></div></>}
    {step === 3 && <><fieldset className="v-choice-field"><legend>Choose one</legend><div className="v-source-grid">{sources.map(item => <label key={item} className={discovery.source === item ? 'is-selected' : ''}><input type="radio" name="source" checked={discovery.source === item} onChange={() => setDiscovery(current => ({ ...current, source: item }))} /><span>{item}</span></label>)}</div></fieldset>{discovery.source === 'Other' && <div className="v-field"><label htmlFor="other-source">Where did you hear about us?</label><input id="other-source" required maxLength={120} value={discovery.otherSource} onChange={event => setDiscovery(current => ({ ...current, otherSource: event.target.value }))} /></div>}</>}
    {status.error && <p className="v-form-status" role="alert">{status.error}</p>}<div className="v-onboarding-actions">{step > 1 && <button type="button" className="v-auth-text-button" onClick={() => setStep(value => value - 1)}><ArrowLeft size={16} />Back</button>}<button className="v-button" disabled={status.loading || status.upload}>{status.loading ? 'Saving…' : step === 3 ? 'Finish setting up' : 'Continue'}<ArrowRight size={18} /></button></div>
  </form></Reveal></section></Page>;
}
