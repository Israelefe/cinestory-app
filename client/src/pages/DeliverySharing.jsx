import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, Image, Link2, LoaderCircle, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import './DeliverySharing.css';
import './DeliverySharingV2.css';

const INITIAL_FORM = {
  role: 'organizer',
  label: '',
  recipientEmail: '',
  allowIndividualDownloads: true,
  allowDownloadAll: false,
  usageTerms: '',
  assetIds: [],
  sectionIds: [],
  expiresAt: ''
};

export default function DeliverySharing() {
  const [params] = useSearchParams();
  const deliveryId = params.get('delivery');
  const [delivery, setDelivery] = useState(null);
  const [grants, setGrants] = useState([]);
  const [createdUrl, setCreatedUrl] = useState('');
  const [createdMessage, setCreatedMessage] = useState('');
  const [form, setForm] = useState(INITIAL_FORM);
  const [photoScope, setPhotoScope] = useState('all');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const photographs = useMemo(
    () => (delivery?.assets || []).filter(asset => asset.resourceType !== 'video'),
    [delivery]
  );
  const scenes = useMemo(() => (delivery?.creativeDirection?.sections || []).filter(section => section.assetIds?.length), [delivery]);

  async function load() {
    if (!deliveryId) {
      setError('Choose a delivery from your dashboard.');
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const [deliveryResponse, grantsResponse] = await Promise.all([
        api.get(`/v1/deliveries/${deliveryId}`),
        api.get(`/v1/deliveries/${deliveryId}/share-grants`)
      ]);
      setDelivery(deliveryResponse.data.data);
      setGrants(grantsResponse.data.data || []);
    } catch (requestError) {
      setError(apiMessage(requestError, 'We could not open the sharing settings.'));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, [deliveryId]);

  function chooseScope(scope) {
    setPhotoScope(scope);
    if (scope === 'all') setForm(current => ({ ...current, assetIds: [], sectionIds: [] }));
    if (scope === 'scenes') setForm(current => ({ ...current, assetIds: [] }));
    if (scope === 'selected') setForm(current => ({ ...current, sectionIds: [] }));
  }

  function toggleScene(sectionId) {
    setForm(current => ({ ...current, sectionIds: current.sectionIds.includes(sectionId) ? current.sectionIds.filter(id => id !== sectionId) : [...current.sectionIds, sectionId] }));
  }

  function togglePhotograph(assetId) {
    setForm(current => ({
      ...current,
      assetIds: current.assetIds.includes(assetId)
        ? current.assetIds.filter(id => id !== assetId)
        : [...current.assetIds, assetId]
    }));
  }

  async function create(event) {
    event.preventDefault();
    if ((photoScope === 'selected' && !form.assetIds.length) || (photoScope === 'scenes' && !form.sectionIds.length)) {
      setError(photoScope === 'scenes' ? 'Choose at least one event scene for this link.' : 'Choose at least one photograph for this link.');
      return;
    }
    setBusy(true);
    setError('');
    setCreatedUrl('');
    setCreatedMessage('');
    try {
      const response = await api.post(`/v1/deliveries/${deliveryId}/share-grants`, {
        ...form,
        assetIds: photoScope === 'selected' ? form.assetIds : [],
        sectionIds: photoScope === 'scenes' ? form.sectionIds : [],
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : ''
      });
      setCreatedUrl(response.data.data.url);
      setCreatedMessage(response.data.message || 'The private role link was created.');
      setForm(current => ({ ...current, label: '', recipientEmail: '', usageTerms: '' }));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, 'We could not create that role link.'));
      setBusy(false);
    }
  }

  async function revoke(id) {
    try {
      await api.delete(`/v1/deliveries/${deliveryId}/share-grants/${id}`);
      setGrants(current => current.filter(grant => grant._id !== id));
      toast.success('Sharing link closed.');
    } catch (requestError) {
      toast.error(apiMessage(requestError, 'We could not close that link.'));
    }
  }

  async function copyCreatedLink() {
    try {
      await navigator.clipboard.writeText(createdUrl);
      toast.success('Role link copied.');
    } catch {
      toast.error('Your browser blocked copying. Select the link and copy it manually.');
    }
  }

  if (busy && !delivery) {
    return <main className="ds-page"><div className="ds-state"><LoaderCircle className="v-spin" size={26} />Opening sharing settings…</div></main>;
  }

  return (
    <main className="ds-page">
      <div className="ds-wrap">
        <Link className="ds-back" to="/dashboard"><ArrowLeft size={16} />Back to deliveries</Link>
        <header>
          <span><Users size={15} /> ROLE-BASED SHARING</span>
          <h1>Decide what each person can see and use.</h1>
          <p>{delivery ? `${delivery.title} · ${delivery.clientName}` : 'Event and campaign access'}</p>
        </header>

        {error && <div className="ds-error" role="alert">{error}</div>}

        {delivery && <div className="ds-layout">
          <form onSubmit={create}>
            <span>NEW ROLE LINK</span>
            <h2>Set the permission once.</h2>

            <label>Who is this for?
              <select value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))}>
                <option value="organizer">Organizer</option>
                <option value="vendor">Vendor</option>
                <option value="guest">Guest</option>
              </select>
            </label>

            <label>Link label
              <input value={form.label} onChange={event => setForm(current => ({ ...current, label: event.target.value }))} minLength={2} maxLength={100} required placeholder="Venue social media team" />
            </label>

            <label>Recipient email <span className="ds-optional">Optional</span>
              <input type="email" value={form.recipientEmail} onChange={event => setForm(current => ({ ...current, recipientEmail: event.target.value }))} maxLength={254} placeholder="vendor@example.com" />
              <small className="ds-field-help">Add an email and Veylo will send the private link for you. Leave it blank if you only want to copy the link.</small>
            </label>

            <fieldset className="ds-scope">
              <legend>Which photographs can they see?</legend>
              <div className="ds-scope-options">
                <label><input type="radio" name="photo-scope" checked={photoScope === 'all'} onChange={() => chooseScope('all')} />Every photograph</label>
                {scenes.length > 0 && <label><input type="radio" name="photo-scope" checked={photoScope === 'scenes'} onChange={() => chooseScope('scenes')} />Selected event scenes</label>}
                <label><input type="radio" name="photo-scope" checked={photoScope === 'selected'} onChange={() => chooseScope('selected')} />Selected photographs</label>
              </div>
              {photoScope === 'scenes' && <div className="ds-scene-picker">{scenes.map((scene, index) => { const selected = form.sectionIds.includes(scene.id); return <button type="button" key={scene.id} className={selected ? 'is-selected' : ''} onClick={() => toggleScene(scene.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{scene.title}</strong><small>{scene.assetIds.length} photographs</small>{selected && <Check size={15} />}</button>; })}</div>}
              {photoScope === 'selected' && <div className="ds-photo-picker">
                <div className="ds-photo-picker-head">
                  <span>{form.assetIds.length} of {photographs.length} selected</span>
                  <div>
                    <button type="button" onClick={() => setForm(current => ({ ...current, assetIds: photographs.map(asset => asset.assetId) }))}>Select all</button>
                    <button type="button" onClick={() => setForm(current => ({ ...current, assetIds: [] }))}>Clear</button>
                  </div>
                </div>
                <div className="ds-photo-grid">
                  {photographs.map(asset => {
                    const selected = form.assetIds.includes(asset.assetId);
                    return <button type="button" key={asset.assetId} className={selected ? 'is-selected' : ''} onClick={() => togglePhotograph(asset.assetId)} aria-pressed={selected} aria-label={`${selected ? 'Remove' : 'Include'} ${asset.originalFilename || 'photograph'}`}>
                      <img src={asset.thumbnailUrl || asset.url} alt="" loading="lazy" />
                      <span>{selected ? <Check size={15} /> : <Image size={15} />}</span>
                    </button>;
                  })}
                </div>
              </div>}
            </fieldset>

            <label>Usage terms
              <textarea value={form.usageTerms} onChange={event => setForm(current => ({ ...current, usageTerms: event.target.value }))} maxLength={1000} rows={5} placeholder="For the agreed event recap only. Credit the photographer when posting." />
            </label>

            <label>Expiry date
              <input type="date" value={form.expiresAt} onChange={event => setForm(current => ({ ...current, expiresAt: event.target.value }))} />
            </label>

            <div className="ds-checks">
              <label><input type="checkbox" checked={form.allowIndividualDownloads} onChange={event => setForm(current => ({ ...current, allowIndividualDownloads: event.target.checked }))} />Individual downloads</label>
              <label><input type="checkbox" checked={form.allowDownloadAll} onChange={event => setForm(current => ({ ...current, allowDownloadAll: event.target.checked }))} />Download every permitted photograph</label>
            </div>

            <button disabled={busy}><Link2 size={16} />{busy ? 'Creating link…' : 'Create private role link'}</button>
            {createdUrl && <div className="ds-created" aria-live="polite">
              <ShieldCheck size={18} />
              <p>{createdMessage || 'The private role link was created.'}<br />Copy it before leaving this page; the token is shown once.</p>
              <button type="button" onClick={copyCreatedLink}><Copy size={15} />Copy link</button>
            </div>}
          </form>

          <section className="ds-existing">
            <span>ACTIVE LINKS</span>
            <h2>{grants.length} role link{grants.length === 1 ? '' : 's'}</h2>
            {grants.length ? grants.map(grant => <article key={grant._id}>
              <div>
                <strong>{grant.label}</strong>
                <span>{grant.role} · {grant.sectionIds?.length ? `${grant.sectionIds.length} selected scene${grant.sectionIds.length === 1 ? '' : 's'}` : grant.assetIds?.length ? `${grant.assetIds.length} selected photographs` : 'every photograph'}</span>
                <span>{grant.allowDownloadAll ? 'permitted gallery download' : grant.allowIndividualDownloads ? 'individual downloads' : 'view only'}</span>
                {grant.recipientEmail && <small>{grant.recipientEmail}</small>}
                {grant.expiresAt && <small>Expires {new Date(grant.expiresAt).toLocaleDateString('en-NG')}</small>}
              </div>
              <button type="button" onClick={() => revoke(grant._id)} aria-label={`Close ${grant.label} link`}><Trash2 size={16} /></button>
            </article>) : <p>No role links have been created.</p>}
          </section>
        </div>}
      </div>
    </main>
  );
}
