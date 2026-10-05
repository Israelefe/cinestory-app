import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { Check, LoaderCircle, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../../services/api.js';
import { useDialogFocus } from '../useDialogFocus.js';
import './DeliveryDownloadSettings.css';

export default function DeliveryDownloadSettings({ deliveryId, onClose, onSaved }) {
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
    api.get(`/v1/deliveries/${deliveryId}`, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setDelivery(data.data);
      setAccess({ allowIndividualDownloads: data.data.access?.allowIndividualDownloads !== false, allowDownloadAll: data.data.access?.allowDownloadAll !== false });
    }).catch(error => {
      if (!controller.signal.aborted) setError(apiMessage(error, 'We could not open download settings. Try again.'));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [deliveryId, attempt]);

  async function save(event) {
    event.preventDefault();
    if (!access || saving) return;
    setSaving(true); setError('');
    try {
      const { data } = await api.patch(`/v1/deliveries/${deliveryId}/download-settings`, access);
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
          <label className="delivery-settings-switch"><span><strong>Allow individual downloads</strong><small>Clients can save one photograph at a time.</small></span><input type="checkbox" checked={access.allowIndividualDownloads} onChange={event => setAccess(current => ({ ...current, allowIndividualDownloads: event.target.checked }))} /></label>
          <label className="delivery-settings-switch"><span><strong>Allow full gallery downloads</strong><small>Clients can save the complete set.</small></span><input type="checkbox" checked={access.allowDownloadAll} onChange={event => setAccess(current => ({ ...current, allowDownloadAll: event.target.checked }))} /></label>
        </fieldset>
        {!access.allowIndividualDownloads && !access.allowDownloadAll && <p className="delivery-settings-help">Both download options are off. Clients can view photos, but cannot download them.</p>}
        {error && <p className="delivery-settings-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={close} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving ? <LoaderCircle className="v-spin" size={17} /> : <Check size={17} />}{saving ? 'Saving…' : 'Save settings'}</button></footer>
      </form> : <div className="delivery-settings-error" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(current => current + 1)}>Try again</button></div>}
    </motion.section>
  </motion.div>, document.body);
}
