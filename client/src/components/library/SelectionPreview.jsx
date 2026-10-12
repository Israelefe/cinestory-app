import React, { useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Check, RotateCcw, Undo2, X } from 'lucide-react';
import { useDialogFocus } from '../useDialogFocus.js';
import SwipePhotoCard from './SwipePhotoCard.jsx';
import PhotoViewer from './PhotoViewer.jsx';
import { decidePhoto, undoDecision } from '../../utils/clientSelection.js';
import { photoId, selectionInstruction } from './libraryHelpers.js';

export default function SelectionPreview({ photos, rule, onClose }) {
  const dialog = useRef(null); useDialogFocus(true, dialog, onClose);
  const [choices, setChoices] = useState({ selected: [], reviewed: [], cursor: 0, history: [] });
  const [ready, setReady] = useState(() => new Set()), [failed, setFailed] = useState(''), [retry, setRetry] = useState(0), [direction, setDirection] = useState(1), [viewer, setViewer] = useState(null);
  const current = photos[choices.cursor], maximum = rule.mode === 'unlimited' ? Infinity : Number(rule.count);
  const media = id => photos.find(photo => photoId(photo) === id)?.url || '';
  function decide(id, choose) { const next = decidePhoto(choices, id, choose, choices.cursor + 1, maximum); if (next === choices) return false; setDirection(choose ? 1 : -1); setChoices(next); return true; }
  return <div className="lib-backdrop"><section className="lib-dialog lib-selection-preview" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="selection-preview-title"><header><div><p className="lib-eyebrow">CLIENT PREVIEW</p><h2 id="selection-preview-title">{selectionInstruction(rule)}</h2></div><button type="button" aria-label="Close client preview" onClick={onClose}><X size={20} /></button></header><p>Try choosing and skipping. These preview choices are not saved. Shared previews include a Veylo pre-selection mark.</p><div className="sel-progress"><strong>{choices.selected.length}{maximum !== Infinity ? ' of ' + maximum : ''} chosen</strong><span>{choices.reviewed.length} of {photos.length} reviewed</span></div>
    <div className="sel-stage"><AnimatePresence mode="popLayout" custom={direction}>{current ? <SwipePhotoCard key={photoId(current)} photo={{ ...current, id: photoId(current) }} media={media} ready={ready} setReady={setReady} failed={failed} setFailed={setFailed} retry={retry} setRetry={setRetry} direction={direction} onDecision={decide} onInspect={setViewer} number={choices.cursor + 1} total={photos.length} /> : <div className="lib-empty"><Check size={24} /><h2>Preview finished</h2><p>The client reviews their chosen photographs before submitting.</p><button type="button" className="lib-button" onClick={() => setChoices({ selected: [], reviewed: [], cursor: 0, history: [] })}><RotateCcw size={16} />Start again</button></div>}</AnimatePresence></div>
    <div className="sel-deck-controls"><button type="button" className="sel-skip" disabled={!current || !ready.has(photoId(current))} onClick={() => decide(photoId(current), false)}><X size={22} /><span>Skip</span></button><button type="button" className="sel-undo" disabled={!choices.history.length} onClick={() => setChoices(undoDecision(choices))}><Undo2 size={20} /><span>Undo</span></button><button type="button" className="sel-choose" disabled={!current || !ready.has(photoId(current)) || choices.selected.length >= maximum} onClick={() => decide(photoId(current), true)}><Check size={22} /><span>Choose</span></button></div>
    {choices.selected.length >= maximum && <p className="lib-fine">Selection allowance reached. The client can review or replace a choice before sending.</p>}
  </section>{viewer && <PhotoViewer photos={[viewer]} onClose={() => setViewer(null)} />}</div>;
}
