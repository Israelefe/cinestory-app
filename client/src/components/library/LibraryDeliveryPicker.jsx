import React, { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FolderOpen, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../../services/api.js';
import PhotoPicker from './PhotoPicker.jsx';
import { useDialogFocus } from '../useDialogFocus.js';
import './LibraryWorkspace.css';

export default function LibraryDeliveryPicker({ deliveryId, disabled, onAdded, maxPhotos, existingCount, onBusyChange = () => {} }) {
  const location = useLocation(), dialog = useRef(null), lock = useRef(false);
  const [open, setOpen] = useState(false), [selected, setSelected] = useState(location.state?.libraryAssetIds || []);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const remaining = Math.max(0, maxPhotos - existingCount);
  useDialogFocus(open, dialog, () => !lock.current && setOpen(false));
  async function add() {
    if (lock.current) return;
    if (!selected.length || selected.length > remaining) { const message = remaining ? `Choose between 1 and ${remaining} photographs for this delivery.` : 'This delivery has reached your plan’s photo limit.'; setError(message); toast.error(message); return; }
    lock.current = true; setBusy(true); onBusyChange(true); setError('');
    let imported = 0;
    try {
      for (let index = 0; index < selected.length; index += 20) {
        setProgress(`Adding photographs ${index + 1}–${Math.min(index + 20, selected.length)} of ${selected.length}…`);
        await api.post(`/v1/deliveries/${deliveryId}/uploads/from-library`, { assetIds: selected.slice(index, index + 20) });
        imported = Math.min(index + 20, selected.length);
      }
      await onAdded(); setOpen(false); setSelected([]); toast.success('Photographs added to this delivery.');
    } catch (failure) {
      if (imported) await onAdded().catch(() => {});
      const message = apiMessage(failure, 'Some photographs could not be added. Retry to continue with this draft.');
      setError(message); toast.error(message);
      if (imported) setSelected(selected.slice(imported));
    } finally { lock.current = false; setBusy(false); onBusyChange(false); }
  }
  return <div className="lib-delivery-picker"><button type="button" className="lib-button" disabled={disabled || !deliveryId} onClick={() => { setError(''); setOpen(true); }}><FolderOpen size={18} />Choose from Photo Library</button><p>Use a folder or choose individual finished photographs. JPEG, PNG or WebP, up to 20 MB each.</p>
    {open && <div className="lib-backdrop"><section className="lib-dialog lib-delivery-picker-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="library-delivery-title"><header><div><p className="lib-eyebrow">PHOTO LIBRARY</p><h2 id="library-delivery-title">Add photographs to this delivery</h2></div><button type="button" aria-label="Close Photo Library picker" disabled={busy} onClick={() => setOpen(false)}><X size={20} /></button></header><p>Choose a folder to find a session, then select the photographs you want. Camera originals need a finished export before delivery.</p>{error && <div className="lib-error" role="alert">{error}</div>}<fieldset disabled={busy} className="lib-picker-fieldset"><PhotoPicker selected={selected} onChange={setSelected} initialFolder={location.state?.libraryFolder || ''} limit={remaining} finishedOnly /></fieldset><footer><span role="status">{busy ? progress : `${remaining} spaces available`}</span><button type="button" className="lib-button lib-primary" disabled={busy} onClick={add}>{busy ? 'Adding photographs…' : `Add ${selected.length} photographs`}</button></footer></section></div>}
  </div>;
}
