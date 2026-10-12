import React, { useState } from 'react';
import { Copy, ExternalLink, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../../services/api.js';

export function collaborationUrl(item) { return window.location.origin + (item.kind === 'preselection' ? '/select/' : '/edit/') + item.publicId; }
export default function LinkActions({ item, onChange }) {
  const [busy, setBusy] = useState(false);
  const closed = item.status === 'revoked' || new Date(item.expiresAt) <= new Date();
  async function copy() { try { await navigator.clipboard.writeText(collaborationUrl(item)); toast.success('Link copied.'); } catch { toast.error('Copy the private link shown below.'); } }
  async function close() {
    if (!window.confirm('Close this link? The recipient will no longer be able to open its photographs or upload edits.')) return;
    setBusy(true); try { const { data } = await api.delete('/v1/storage/collaborations/' + item._id); onChange(current => ({ ...current, ...data.data })); } catch (error) { toast.error(apiMessage(error, 'This link could not be closed.')); } finally { setBusy(false); }
  }
  return <div className="lib-link-actions">{!closed && <><button type="button" className="lib-button" onClick={copy}><Copy size={16} />Copy link</button><a className="lib-button" href={collaborationUrl(item)} target="_blank" rel="noreferrer"><ExternalLink size={16} />Open link</a><button type="button" className="lib-button lib-danger" disabled={busy} onClick={close}><X size={16} />Close link</button><input aria-label="Private link" readOnly value={collaborationUrl(item)} onFocus={event => event.target.select()} /></>}</div>;
}
