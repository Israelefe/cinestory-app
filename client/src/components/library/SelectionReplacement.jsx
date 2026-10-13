import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useDialogFocus } from '../useDialogFocus.js';

export default function SelectionReplacement({ incomingId, photos, media, onReplace, onClose }) {
  const dialog = useRef(null); useDialogFocus(true, dialog, onClose);
  return <div className="lib-backdrop"><section ref={dialog} className="lib-dialog" role="dialog" aria-modal="true" aria-labelledby="sel-replace-title"><header><h2 id="sel-replace-title">Which choice should this replace?</h2><button type="button" aria-label="Cancel replacement" onClick={onClose}><X size={20} /></button></header><p>You have chosen {photos.length} photographs. Choose one below to replace. You can undo this change.</p><div className="lib-replacement-incoming"><img src={media(incomingId, 'thumb')} alt="New choice" /><span>Your new choice</span></div><div className="lib-photo-grid">{photos.map(photo => <button type="button" key={photo.id} className="lib-photo" aria-label={'Replace ' + photo.originalFilename} onClick={() => onReplace(photo.id)}><img src={media(photo.id, 'thumb')} alt={photo.originalFilename} /><span>Replace this photograph</span></button>)}</div><footer><button type="button" className="lib-button" onClick={onClose}>Keep current choices</button></footer></section></div>;
}
