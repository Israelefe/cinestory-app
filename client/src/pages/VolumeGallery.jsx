import React, { useEffect, useState } from 'react';
import { ArrowRight, Image, LoaderCircle, LockKeyhole, Images } from 'lucide-react';
import { useParams } from 'react-router-dom';
import api, { apiMessage } from '../services/api.js';
import ClientGallery from '../components/delivery/ClientGallery.jsx';
import './VolumeGallery.css';

export default function VolumeGallery() {
  const { publicId } = useParams();
  const [details, setDetails] = useState({ recipientCode: '', email: '', code: '' });
  const [step, setStep] = useState('identify');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gallery, setGallery] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem(`veylo_volume_${publicId}`);
    if (!token) return;
    api.get(`/v1/volume-jobs/public/${publicId}/gallery`, { headers: { 'X-Volume-Access': token } }).then(response => { setGallery(response.data.data); setStep('gallery'); }).catch(() => sessionStorage.removeItem(`veylo_volume_${publicId}`));
  }, [publicId]);

  async function requestCode(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api.post(`/v1/volume-jobs/public/${publicId}/request-code`, { recipientCode: details.recipientCode, email: details.email });
      setStep('verify');
    } catch (requestError) { setError(apiMessage(requestError, 'We could not send the access code.')); }
    finally { setBusy(false); }
  }

  async function verifyCode(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await api.post(`/v1/volume-jobs/public/${publicId}/verify-code`, details);
      const token = response.data.data.accessToken;
      sessionStorage.setItem(`veylo_volume_${publicId}`, token);
      const galleryResponse = await api.get(`/v1/volume-jobs/public/${publicId}/gallery`, { headers: { 'X-Volume-Access': token } });
      setGallery(galleryResponse.data.data); setStep('gallery');
    } catch (requestError) { setError(apiMessage(requestError, 'That code did not work.')); }
    finally { setBusy(false); }
  }

  if (step !== 'gallery') return <main className="vg-gate"><section><img src="/veylo/veylo-mark.svg" alt="Veylo" /><span><LockKeyhole size={15} /> PRIVATE RECIPIENT GALLERY</span><h1>{step === 'identify' ? 'Find your photographs.' : 'Check your email.'}</h1><p>{step === 'identify' ? 'Enter the recipient code and email address registered by the photographer.' : 'Enter the six-digit code we sent. It expires in 10 minutes.'}</p><form onSubmit={step === 'identify' ? requestCode : verifyCode}>{step === 'identify' ? <><label>Recipient code<input value={details.recipientCode} onChange={event => setDetails(current => ({ ...current, recipientCode: event.target.value.replace(/[^a-z0-9_-]/gi, '').toUpperCase() }))} required maxLength={40} autoComplete="off" /></label><label>Email address<input type="email" value={details.email} onChange={event => setDetails(current => ({ ...current, email: event.target.value }))} required maxLength={254} autoComplete="email" /></label></> : <label>Six-digit code<input className="vg-code" value={details.code} onChange={event => setDetails(current => ({ ...current, code: event.target.value.replace(/\D/g, '').slice(0, 6) }))} required inputMode="numeric" autoComplete="one-time-code" placeholder="000000" /></label>}<button disabled={busy || (step === 'verify' && details.code.length !== 6)}>{busy ? <LoaderCircle className="v-spin" size={18} /> : null}{step === 'identify' ? 'Send access code' : 'Open my gallery'}<ArrowRight size={17} /></button></form>{step === 'verify' && <button className="vg-back" type="button" onClick={() => { setStep('identify'); setError(''); }}>Use different details</button>}{error && <small role="alert">{error}</small>}</section></main>;

  const downloadPhoto = (_, index) => {
    const photo = gallery.photos[index];
    if (!photo) return;
    const link = document.createElement('a');
    link.href = photo.downloadUrl || photo.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = `${gallery.recipientName || 'photograph'}-${String(index + 1).padStart(2, '0')}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return <main className="vg-page"><header><div><span>{gallery.organisation}</span><h1>{gallery.title}</h1><p>Prepared for {gallery.recipientName} by {gallery.studio}</p></div><div className="vg-header-actions"><b>{gallery.photos.length} photograph{gallery.photos.length === 1 ? '' : 's'}</b><button type="button" onClick={() => setGalleryOpen(true)}><Images size={16} />Open gallery</button></div></header>{gallery.photos.length ? <section className="vg-gallery-summary"><Image size={22} /><div><strong>Your private gallery is ready.</strong><p>Open the shared Photo Story gallery to read captions, move through every photograph, and download the files your photographer provided.</p></div></section> : <div className="vg-empty"><Image size={28} /><h2>No photographs have been assigned yet.</h2><p>Ask the photographer to check this recipient gallery.</p></div>}{galleryOpen && gallery.photos.length > 0 && <ClientGallery photos={gallery.photos} title={gallery.title} eyebrow={`${gallery.organisation} · ${gallery.recipientName}`} delivery={{ access: { allowIndividualDownloads: true, allowDownloadAll: false, allowLikes: false } }} onClose={() => setGalleryOpen(false)} onDownload={downloadPhoto} />}</main>;
}
