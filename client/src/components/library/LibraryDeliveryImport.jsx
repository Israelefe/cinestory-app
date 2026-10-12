import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clapperboard } from 'lucide-react';
import api, { apiMessage } from '../../services/api.js';
import LibraryShell from './LibraryShell.jsx';
import { DELIVERY_FORMATS } from '../../constants/deliveryFormats.js';

const formats = DELIVERY_FORMATS.map(item => [item.value, item.name]);

export default function LibraryDeliveryImport({ source, user }) {
  const navigate = useNavigate(), lock = useRef(false);
  const storageKey = 'veylo_library_delivery:' + (user?.id || user?._id) + ':' + source.libraryAssetIds.join(',');
  const [photos, setPhotos] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [kind, setKind] = useState('showcase'), [format, setFormat] = useState('photo-story');
  const [clientName, setClientName] = useState(source.libraryClientName || ''), [shootType, setShootType] = useState('Studio portraits'), [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState('');
  const draftId = useRef('');
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await api.post('/v1/storage/photos/resolve', { assetIds: source.libraryAssetIds });
        if (!active) return;
        setPhotos(data.data);
        try { draftId.current = sessionStorage.getItem(storageKey) || ''; } catch {}
        if (draftId.current) {
          const { data: saved } = await api.get('/v1/deliveries/' + draftId.current);
          if (!active) return;
          setKind(saved.data.kind); setFormat(saved.data.format || 'photo-story');
          setClientName(saved.data.clientName || ''); setShootType(saved.data.shootType || ''); setPurpose(saved.data.brief || '');
        }
      } catch (failure) { if (active) setError(apiMessage(failure, 'These photographs or the saved draft could not be opened.')); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [storageKey]);
  const ineligible = photos.filter(photo => photo.rawPublicId || Number(photo.bytes) > 20_000_000);
  async function create(event) {
    event.preventDefault(); if (lock.current || loading || ineligible.length || !photos.length) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (!draftId.current) {
        const { data } = await api.post('/v1/deliveries/v3', { kind, clientName, shootType, purpose, title: source.libraryTitle || '' });
        draftId.current = data.data._id;
        try { sessionStorage.setItem(storageKey, draftId.current); } catch {}
      }
      const { data: existing } = await api.get('/v1/deliveries/' + draftId.current);
      if (existing.data.kind === 'showcase' && !existing.data.format) await api.patch('/v1/deliveries/' + draftId.current + '/v3/format', { format });
      for (let index = 0; index < source.libraryAssetIds.length; index += 20) {
        setProgress('Adding photographs ' + (index + 1) + '–' + Math.min(index + 20, photos.length) + ' of ' + photos.length + '…');
        await api.post('/v1/deliveries/' + draftId.current + '/uploads/from-library', { assetIds: source.libraryAssetIds.slice(index, index + 20) });
      }
      try { sessionStorage.removeItem(storageKey); } catch {}
      navigate('/create?draft=' + draftId.current, { replace: true, state: null });
    } catch (failure) { setError(apiMessage(failure, 'The photographs could not all be added. Retry to continue with the same draft.')); }
    finally { lock.current = false; setBusy(false); }
  }
  return <LibraryShell title="Create a delivery" description="Start with these finished photographs from your Library."><form className="lib-setup" onSubmit={create}>
    <div className="lib-step-intro"><p className="lib-eyebrow">FINISHED PHOTOGRAPHS</p><h2>{source.libraryTitle || 'Prepare your delivery'}</h2><p>{photos.length} photographs. You will review the complete delivery before publishing.</p></div>
    {error && <div className="lib-error" role="alert">{error}{draftId.current && <a className="lib-text-link" href={'/create?draft=' + draftId.current}>Open the saved draft</a>}</div>}
    {loading ? <p role="status">Loading photographs…</p> : <div className="lib-review-filmstrip">{photos.map(photo => <img key={photo._id} src={photo.thumbnailUrl || photo.url} alt={photo.originalFilename} loading="lazy" />)}</div>}
    {ineligible.length > 0 && <div className="lib-error" role="alert"><strong>{ineligible.length} photographs need a finished export.</strong><p>Use finished JPEG, PNG or WebP files up to 20 MB each. Camera originals and their previews are for editing.</p>{ineligible.map(photo => <p key={photo._id}>{photo.originalFilename}</p>)}</div>}
    <fieldset disabled={busy || Boolean(draftId.current)} className="lib-form-grid"><label>Client name<input required minLength={2} maxLength={100} value={clientName} onChange={event => setClientName(event.target.value)} /></label><label>Delivery type<select value={kind} onChange={event => setKind(event.target.value)}><option value="showcase">Showcase</option><option value="pinboard">GridBoard</option><option value="photoswap">Photo Swap</option></select></label>{kind === 'showcase' && <label>Showcase format<select value={format} onChange={event => setFormat(event.target.value)}>{formats.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}<label>Shoot type<input required minLength={2} maxLength={80} value={shootType} onChange={event => setShootType(event.target.value)} /></label><label className="is-wide">What was this shoot for?<textarea required={kind !== 'pinboard'} maxLength={3000} rows={3} value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="Tell us about the people, occasion, and what this delivery should say." /></label></fieldset>
    {busy && <p role="status">{progress || 'Creating your draft…'}</p>}<footer className="lib-setup-footer"><button type="button" className="lib-button" disabled={busy} onClick={() => navigate(-1)}>Back</button><button type="submit" className="lib-button lib-primary" disabled={busy || loading || !photos.length || ineligible.length > 0}><Clapperboard size={17} />{busy ? 'Adding photographs…' : draftId.current ? 'Retry adding photographs' : 'Create delivery draft'}<ArrowRight size={16} /></button></footer>
  </form></LibraryShell>;
}
