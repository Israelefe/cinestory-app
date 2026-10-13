import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, CheckCheck, Grid2X2, Plus, Undo2, X } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { usePrivateLibraryLink } from '../components/library/usePrivateLibraryLink.js';
import { useSelectionSession } from '../components/library/useSelectionSession.js';
import PrivateLinkAccess from '../components/library/PrivateLinkAccess.jsx';
import PhotoViewer from '../components/library/PhotoViewer.jsx';
import SelectionReplacement from '../components/library/SelectionReplacement.jsx';
import { toast } from 'react-toastify';
import SwipePhotoCard from '../components/library/SwipePhotoCard.jsx';
import { useDialogFocus } from '../components/useDialogFocus.js';
import { publicMedia, selectionInstruction } from '../components/library/libraryHelpers.js';
import { decidePhoto, undoDecision } from '../utils/clientSelection.js';

function SelectionExperience({ publicId, access }) {
  const { content, token } = access;
  const session = useSelectionSession(publicId, access);
  const { choices, setChoices, error, setError, saveState, saveNow, conflict } = session;
  const [mode, setMode] = useState('deck'), [direction, setDirection] = useState(1), [viewer, setViewer] = useState(null), [confirming, setConfirming] = useState(false), [sending, setSending] = useState(false), [ready, setReady] = useState(() => new Set()), [failed, setFailed] = useState(''), [retry, setRetry] = useState(0);
  const [replacement, setReplacement] = useState(null);
  const dialog = useRef(null); useDialogFocus(confirming, dialog, () => { if (!sending) { setConfirming(false); setReplacement(null); } });
  const stage = useRef(null), [stageHeight, setStageHeight] = useState(null);
  useLayoutEffect(() => {
    if (!stage.current) return;
    const fit = () => { if (stage.current) setStageHeight(Math.max(210, Math.min(860, window.innerHeight - (stage.current.getBoundingClientRect().top + window.scrollY) - 142))); };
    fit(); const observer = new ResizeObserver(fit);
    document.querySelectorAll('.sel-header, .sel-progress, .sel-modes').forEach(element => observer.observe(element));
    window.addEventListener('resize', fit); return () => { observer.disconnect(); window.removeEventListener('resize', fit); };
  }, [mode, error, conflict]);

  const submitted = content.status === 'submitted';
  const rule = content.selectionRule || { mode: 'unlimited' }, maximum = rule.mode === 'unlimited' ? Infinity : rule.count;
  const current = content.assets[choices.cursor];
  const chosenPhotos = content.assets.filter(photo => choices.selected.includes(photo.id));
  const displayPhotos = submitted || mode === 'review' ? chosenPhotos : content.assets;
  const instruction = selectionInstruction(rule);
  const validCount = choices.selected.length > 0 && (rule.mode === 'exactly' ? choices.selected.length === maximum : choices.selected.length <= maximum);
  const media = (id, size = '') => publicMedia(publicId, id, token, { size });

  useEffect(() => { if (!current) return; const next = content.assets.slice(choices.cursor + 1, choices.cursor + 3); next.forEach(photo => { const image = new window.Image(); image.src = media(photo.id, 'small'); }); }, [choices.cursor, token]);
  function decide(id, choose, advance = false, replaceId) {
    if (submitted || sending || conflict) return false;
    const next = decidePhoto(choices, id, choose, advance ? Math.min(content.assets.length, choices.cursor + 1) : choices.cursor, maximum, replaceId);
    if (next === choices) { setReplacement({ id, choose, advance }); return false; }
    if (choose && !choices.selected.includes(id) && choices.selected.length >= maximum) toast.info('Choice replaced. Use Undo to restore your previous selection.');
    setDirection(choose ? 1 : -1); setChoices(next); setError('');
    setReplacement(null);
    return true;
  }
  useEffect(() => {
    const key = event => {
      if (mode !== 'deck' || viewer || confirming || replacement || submitted || !current || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)) return;
      if (event.key === 'ArrowRight' && ready.has(current.id)) { event.preventDefault(); decide(current.id, true, true); }
      if (event.key === 'ArrowLeft' && ready.has(current.id)) { event.preventDefault(); decide(current.id, false, true); }
      if (event.key === 'Backspace') { event.preventDefault(); setChoices(undoDecision(choices)); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [mode, viewer, confirming, submitted, current, ready, choices, conflict, replacement]);
  async function submit() {
    setSending(true); setError('');
    try {
      await saveNow();
      await api.post(access.endpoint + '/selections', { assetIds: choices.selected, revision: content.revision || 1, version: session.version.current }, { headers: { Authorization: 'Bearer ' + token } });
      access.setContent(value => ({ ...value, status: 'submitted', submitted: true, selectedAssetIds: choices.selected })); setConfirming(false); setMode('review');
    } catch (failure) { setError(apiMessage(failure, failure.message || 'Your selection was not sent. Your choices are still here.')); setConfirming(false); if (failure.response?.status === 409) session.setConflict(true); if (failure.response?.status === 401) access.relock(); }
    finally { setSending(false); }
  }
  function inspect(photo) { setViewer({ ...photo, url: media(photo.id) }); }
  return <main className="lib-public-page selection-page"><div className="selection-experience"><header className="sel-header"><div><img src="/veylo/veylo-mark.svg" alt="Veylo" width="24" height="24" /><span>{content.photographerName}</span></div><p className="lib-eyebrow">PHOTO PRE-SELECTION</p><h1>{content.title}</h1><p>{submitted ? 'Your choices have been sent.' : instruction + '.'}</p>{content.note && <details><summary>A note from your photographer</summary><p>{content.note}</p></details>}</header>
    <div className="sel-progress"><strong>{choices.selected.length}{maximum !== Infinity ? ' of ' + maximum : ''} chosen</strong><span>{choices.reviewed.length} of {content.assets.length} reviewed</span>{!submitted && <small role="status">{saveState}</small>}</div>
    {error && <div className="lib-error" role="alert">{error}{!conflict && !submitted && <button type="button" onClick={() => saveNow().catch(() => {})}>Try saving again</button>}</div>}{conflict && <div className="lib-notice"><p>Choices changed in another window. Decide which set you want to continue with.</p><div className="lib-inline-actions"><button type="button" className="lib-button" onClick={() => session.resolveConflict(false)}>Load saved choices</button><button type="button" className="lib-button" onClick={() => session.resolveConflict(true)}>Keep this device’s choices</button></div></div>}
    {submitted && <div className="sel-receipt"><CheckCheck size={25} /><div><strong>{choices.selected.length} photographs sent to {content.photographerName}</strong><span>Your selected photographs are below. Ask your photographer if you need to change them.</span></div></div>}
    {!submitted && <nav className="sel-modes" aria-label="Selection views"><button type="button" aria-pressed={mode === 'deck'} onClick={() => { if (choices.cursor >= content.assets.length) setChoices(current => ({ ...current, cursor: 0 })); setMode('deck'); }}>Swipe</button><button type="button" aria-pressed={mode === 'review'} onClick={() => setMode('review')}>Your choices <span>{choices.selected.length}</span></button><button type="button" aria-label="View all photographs" aria-pressed={mode === 'all'} onClick={() => setMode('all')}><Grid2X2 size={18} /><span>All photographs</span></button></nav>}
    {!submitted && mode === 'deck' ? <><div className="sel-stage" ref={stage} style={stageHeight ? { height: stageHeight } : undefined}><AnimatePresence mode="popLayout" custom={direction}>{current ? <SwipePhotoCard key={current.id} photo={current} media={media} ready={ready} setReady={setReady} failed={failed} setFailed={setFailed} retry={retry} setRetry={setRetry} conflict={conflict} direction={direction} onDecision={decide} onInspect={inspect} number={choices.cursor + 1} total={content.assets.length} /> : <div className="lib-empty"><CheckCheck size={30} /><h2>You have reviewed every photograph.</h2><p>Review your choices before sending them.</p><button type="button" className="lib-button lib-primary" onClick={() => setMode('review')}>Review choices</button><button type="button" className="lib-text-link" onClick={() => setChoices(current => ({ ...current, cursor: 0 }))}>Look through again</button></div>}</AnimatePresence></div><div className="sel-deck-controls"><button type="button" className="sel-skip" disabled={!current || !ready.has(current.id) || conflict} onClick={() => decide(current.id, false, true)}><X size={23} /><span>Skip</span></button><button type="button" className="sel-undo" disabled={!choices.history.length || conflict} onClick={() => setChoices(undoDecision(choices))}><Undo2 size={21} /><span>Undo</span></button><button type="button" className="sel-choose" disabled={!current || !ready.has(current.id) || conflict} onClick={() => decide(current.id, true, true)}><Check size={25} /><span>Choose</span></button></div><p className="sel-gesture-hint">Swipe left to skip · Swipe right to choose</p></> : <section className="sel-review"><div className="lib-section-label"><h2>{submitted ? 'Your submitted photographs' : mode === 'all' ? 'All photographs' : 'Your chosen photographs'}</h2>{!submitted && <button type="button" className="lib-text-link" disabled={!choices.history.length || conflict} onClick={() => setChoices(undoDecision(choices))}><Undo2 size={17} />Undo</button>}</div>{displayPhotos.length ? <div className="lib-photo-grid sel-review-grid">{displayPhotos.map(photo => { const chosen = choices.selected.includes(photo.id); return <article className={'lib-photo ' + (chosen ? 'is-selected' : '')} key={photo.id}><button type="button" className="lib-photo-open" aria-label={'Enlarge ' + photo.originalFilename} onClick={() => inspect(photo)}><img src={media(photo.id, 'thumb')} alt={photo.originalFilename} loading="lazy" /><span>{photo.originalFilename}</span></button>{!submitted && <button type="button" className="lib-check" aria-label={(chosen ? 'Remove ' : 'Choose ') + photo.originalFilename} aria-pressed={chosen} onClick={() => decide(photo.id, !chosen)}>{chosen ? <Check size={16} /> : <Plus size={16} />}</button>}</article>; })}</div> : <div className="lib-empty"><h2>No photographs chosen yet.</h2><p>Go back to the photographs and choose the ones you would like edited.</p><button type="button" className="lib-button" onClick={() => setMode('deck')}><ArrowLeft size={16} />Keep choosing</button></div>}{!submitted && <div className="sel-submit-bar"><div><strong>{choices.selected.length} photographs chosen</strong><span>{validCount ? 'Ready to review and send.' : instruction + ' before sending.'}</span></div><button type="button" className="lib-button lib-primary" disabled={!validCount || conflict || sending} onClick={() => setConfirming(true)}>Review & send<Check size={17} /></button></div>}</section>}
    <footer className="sel-footer">Shared privately with Veylo</footer>
    {replacement && <SelectionReplacement incomingId={replacement.id} photos={chosenPhotos} media={media} onReplace={id => decide(replacement.id, true, replacement.advance, id)} onClose={() => setReplacement(null)} />}
    {viewer && <PhotoViewer photos={[viewer]} onClose={() => setViewer(null)} />}{confirming && <div className="lib-backdrop"><section ref={dialog} className="lib-dialog" role="dialog" aria-modal="true" aria-labelledby="sel-confirm-title"><header><h2 id="sel-confirm-title">Send these {chosenPhotos.length} photographs?</h2><button type="button" aria-label="Close selection confirmation" disabled={sending} onClick={() => setConfirming(false)}><X size={20} /></button></header><p>{content.photographerName} will receive these choices. You can change them later if your photographer reopens the selection.</p><div className="lib-review-filmstrip">{chosenPhotos.map(photo => <img key={photo.id} src={media(photo.id, 'thumb')} alt={photo.originalFilename} loading="lazy" />)}</div><footer><button type="button" className="lib-button" disabled={sending} onClick={() => setConfirming(false)}>Keep reviewing</button><button type="button" className="lib-button lib-primary" disabled={sending} onClick={submit}>{sending ? 'Sending…' : 'Send my selection'}<Check size={17} /></button></footer></section></div>}
  </div></main>;
}

export default function ClientPhotoSelection() {
  const { publicId } = useParams(), access = usePrivateLibraryLink(publicId, 'preselection');
  return access.content ? <SelectionExperience key={publicId} publicId={publicId} access={access} /> : <PrivateLinkAccess access={access} kind="preselection" />;
}
