import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FolderOpen, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../../services/api.js';
import { useDialogFocus } from '../useDialogFocus.js';

export default function FolderManager({ folders, initialNames = [], uploadingFolders, onDeleted, onClose }) {
  const dialog = useRef(null); const [selected, setSelected] = useState(initialNames), [confirming, setConfirming] = useState(Boolean(initialNames.length)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useDialogFocus(true, dialog, () => !busy && onClose());
  const available = folders.filter(folder => !['Unfiled', 'All photographs'].includes(folder.name));
  async function remove() {
    if (selected.some(name => uploadingFolders.includes(name))) { setError('Wait for uploads to these folders to finish, or cancel those uploads first.'); toast.info('Finish or cancel uploads before deleting their folder.'); return; }
    setBusy(true); setError(''); let removed = [];
    try {
      for (let index = 0; index < selected.length; index += 100) {
        const { data } = await api.post('/v1/storage/shoots/delete', { names: selected.slice(index, index + 100) }); removed.push(...data.data.removedNames);
      }
      toast.success(removed.length + ' folder' + (removed.length === 1 ? '' : 's') + ' deleted. The photographs are kept.'); onDeleted(removed); onClose();
    } catch (failure) { if (removed.length) { onDeleted(removed); setSelected(current => current.filter(name => !removed.includes(name))); } const message = apiMessage(failure, 'These folders could not all be deleted. Try again.'); setError(message); toast.error(message); }
    finally { setBusy(false); }
  }
  return createPortal(<div className="lib-backdrop"><section className="lib-dialog lib-folder-manager" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="lib-folders-title"><header><div><p className="lib-eyebrow">PHOTO LIBRARY</p><h2 id="lib-folders-title">{confirming ? `Delete ${selected.length === 1 ? 'this folder' : selected.length + ' folders'}?` : 'Manage folders'}</h2></div><button type="button" aria-label="Close folder manager" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    {confirming ? <><p>All photographs in these folders will move to “Not in a folder”. Their originals, edits, delivery copies and shared links are kept.</p><ul className="lib-folder-delete-names">{selected.map(name => <li key={name}><FolderOpen size={17} /><span>{name}</span></li>)}</ul></> : <><p>Choose individual folders or select every folder. “Not in a folder” stays available for your photographs.</p><div className="lib-list-selection"><strong>{selected.length} selected</strong><button type="button" className="lib-text-link" disabled={!available.length} onClick={() => setSelected(available.map(folder => folder.name))}>Select all folders</button><button type="button" className="lib-text-link" disabled={!selected.length} onClick={() => setSelected([])}>Clear</button></div><div className="lib-folder-choices">{available.map(folder => <button type="button" key={folder.name} aria-pressed={selected.includes(folder.name)} onClick={() => setSelected(current => current.includes(folder.name) ? current.filter(name => name !== folder.name) : [...current, folder.name])}><span className="lib-folder-checkbox">{selected.includes(folder.name) && <Check size={16} />}</span><FolderOpen size={18} /><span>{folder.name}</span><small>{folder.count || 0} photos</small></button>)}</div>{!available.length && <p>No folders to delete yet.</p>}</>}
    {error && <div className="lib-error" role="alert">{error}</div>}<footer><button type="button" className="lib-button" disabled={busy} onClick={() => confirming ? setConfirming(false) : onClose()}>{confirming ? 'Back' : 'Cancel'}</button><button type="button" className="lib-button lib-danger" disabled={busy || !selected.length} onClick={() => confirming ? remove() : setConfirming(true)}><Trash2 size={16} />{busy ? 'Deleting folders…' : confirming ? 'Delete folders' : `Delete ${selected.length} selected`}</button></footer>
  </section></div>, document.body);
}
