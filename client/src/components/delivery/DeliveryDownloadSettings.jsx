import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { Check, LoaderCircle, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../../services/api.js';
import { useDialogFocus } from '../useDialogFocus.js';
import './DeliveryDownloadSettings.css';

export default function DeliveryDownloadSettings({ deliveryId, kind, onClose, onSaved }) {
  const video = kind === 'video';
  const endpoint = video ? `/v1/videos/deliveries/${deliveryId}/download-settings` : `/v1/deliveries/${deliveryId}`;
  const panel = useRef(null);
  const reduced = useVeyloReducedMotion();
  const [delivery, setDelivery] = useState(null);
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const close = () => { if (!saving) onClose(); };
  useDialogFocus(true, panel, close);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get(endpoint, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setDelivery(data.data);
      setAccess(video ? { revision: data.data.revision, allowDownloads: data.data.allowDownloads, items: data.data.items.map(({ assetId, allowDownload }) => ({ assetId, allowDownload })) } : { allowIndividualDownloads: data.data.access?.allowIndividualDownloads !== false, allowDownloadAll: data.data.access?.allowDownloadAll !== false });
    }).catch(error => {
      if (!controller.signal.aborted) setError(apiMessage(error, 'We could not open download settings. Try again.'));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, video, attempt]);

  async function save(event) {
    event.preventDefault();
    if (!access || saving) return;
    setSaving(true); setError('');
    try {
      const { data } = await api.patch(video ? endpoint : `${endpoint}/download-settings`, access);
      onSaved(data.data);
      toast.success('Download settings saved.');
    } catch (error) {
      setError(apiMessage(error, 'We could not save download settings. Your changes have not been applied. Try again.'));
    } finally { setSaving(false); }
  }

  return createPortal(<motion.div className="delivery-settings-overlay" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <motion.section ref={panel} className="delivery-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="delivery-settings-title" tabIndex={-1} initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 270 }}>
      <header><div><span>CLIENT DELIVERY</span><h2 id="delivery-settings-title">Download settings</h2></div><button type="button" className="delivery-settings-close" onClick={close} disabled={saving} aria-label="Close download settings"><X size={20} /></button></header>
      {loading ? <p className="delivery-settings-loading" role="status"><LoaderCircle className="v-spin" size={20} />Opening settings…</p> : access ? <form onSubmit={save}>
        <p className="delivery-settings-intro">{delivery.title || delivery.clientName}<small>Changes apply to the existing client link. Clients who already have it open will need to refresh.</small></p>
        <fieldset disabled={saving}>
          {video ? <>
            <label className="delivery-settings-switch"><span><strong>Allow original video downloads</strong><small>The default for this delivery. Clients save the original uploaded files.</small></span><input type="checkbox" checked={access.allowDownloads} onChange={event => setAccess(current => ({ ...current, allowDownloads: event.target.checked }))} /></label>
            <p className="delivery-settings-help">You can make an exception for any video below.</p>
            {delivery.items.map((item, index) => <label className="delivery-settings-field" key={item.assetId}>{item.title || `Video ${index + 1}`}
              <select value={access.items[index].allowDownload === null ? 'inherit' : String(access.items[index].allowDownload)} onChange={event => { const value = event.target.value; setAccess(current => ({ ...current, items: current.items.map((choice, i) => i === index ? { ...choice, allowDownload: value === 'inherit' ? null : value === 'true' } : choice) })); }}>
                <option value="inherit">Use delivery setting ({access.allowDownloads ? 'allowed' : 'off'})</option><option value="true">Allow download</option><option value="false">Turn off download</option>
              </select>
            </label>)}
          </> : <>
          <label className="delivery-settings-switch"><span><strong>Allow individual downloads</strong><small>Clients can save one photograph at a time.</small></span><input type="checkbox" checked={access.allowIndividualDownloads} onChange={event => setAccess(current => ({ ...current, allowIndividualDownloads: event.target.checked }))} /></label>
          <label className="delivery-settings-switch"><span><strong>Allow full gallery downloads</strong><small>Clients can save the complete set.</small></span><input type="checkbox" checked={access.allowDownloadAll} onChange={event => setAccess(current => ({ ...current, allowDownloadAll: event.target.checked }))} /></label>
          </>}
        </fieldset>
        {video ? !access.items.some(item => item.allowDownload ?? access.allowDownloads) && <p className="delivery-settings-help">Downloads are off for every video. Clients can still watch them.</p> : !access.allowIndividualDownloads && !access.allowDownloadAll && <p className="delivery-settings-help">Both download options are off. Clients can view photos, but cannot download them.</p>}
        {error && <p className="delivery-settings-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={close} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving ? <LoaderCircle className="v-spin" size={17} /> : <Check size={17} />}{saving ? 'Saving…' : 'Save settings'}</button></footer>
      </form> : <div className="delivery-settings-error" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(current => current + 1)}>Try again</button></div>}
    </motion.section>
  </motion.div>, document.body);
}
