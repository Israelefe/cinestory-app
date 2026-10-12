import { useCallback, useEffect, useRef, useState } from 'react';
import api, { apiMessage } from '../../services/api.js';
import { selectionFingerprint, selectionSnapshot } from '../../utils/clientSelection.js';

function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
export function useSelectionSession(publicId, access) {
  const { content } = access;
  const key = 'veylo_selection_choices:' + publicId;
  const revision = content.revision || 1;
  const server = selectionSnapshot(content.selectionDraft);
  const remembered = useRef(read(key));
  const initialLocal = remembered.current?.revision === revision && remembered.current?.dirty;
  const [choices, setChoices] = useState(() => content.status === 'submitted' ? { ...server, selected: content.selectedAssetIds } : initialLocal ? remembered.current.choices : server);
  const [conflict, setConflict] = useState(Boolean(initialLocal && remembered.current.version !== (content.selectionDraft?.version || 0)));
  const [saveState, setSaveState] = useState('Saved');
  const [error, setError] = useState('');
  const version = useRef(content.selectionDraft?.version || 0), current = useRef(choices), chain = useRef(Promise.resolve()), lastSaved = useRef(selectionFingerprint(server)), loadedRevision = useRef(revision);
  current.current = choices;
  const persist = useCallback((dirty, state = current.current) => { try { localStorage.setItem(key, JSON.stringify({ revision, version: version.current, dirty, choices: { ...state, history: [] } })); } catch { /* Server autosave remains available. */ } }, [key, revision]);
  useEffect(() => {
    if (loadedRevision.current === revision) return;
    const fresh = selectionSnapshot(content.selectionDraft);
    version.current = content.selectionDraft?.version || 0; loadedRevision.current = revision; lastSaved.current = selectionFingerprint(fresh); current.current = fresh;
    setChoices(fresh); setConflict(false); setSaveState('Saved'); setError('This is a new selection revision. Your photographer has kept the previous submission.');
  }, [revision, content.selectionDraft]);
  const saveNow = useCallback(() => {
    const task = async () => {
      if (conflict) throw new Error('Load the saved choices or keep this device’s choices before continuing.');
      const state = current.current, fingerprint = selectionFingerprint(state);
      if (fingerprint === lastSaved.current) return;
      if (navigator.onLine === false) { setSaveState('Offline · kept on this device'); persist(true); throw new Error('You are offline. Reconnect to save and send your choices.'); }
      setSaveState('Saving…');
      try {
        const { data } = await api.put(access.endpoint + '/selection-draft', { assetIds: state.selected, reviewedAssetIds: state.reviewed, cursor: state.cursor, version: version.current, revision }, { headers: { Authorization: 'Bearer ' + access.token } });
        version.current = data.data.version; lastSaved.current = fingerprint;
        const unchanged = fingerprint === selectionFingerprint(current.current);
        persist(!unchanged); setSaveState(unchanged ? 'Saved' : 'Waiting to save'); setError('');
      } catch (failure) {
        persist(true); setSaveState('Not saved yet');
        if (failure.response?.status === 409) setConflict(true);
        if (failure.response?.status === 401) access.relock();
        const message = apiMessage(failure, 'Your choices are kept on this device. Try saving again.'); setError(message); throw new Error(message);
      }
    };
    chain.current = chain.current.catch(() => {}).then(task);
    return chain.current;
  }, [access.endpoint, access.token, conflict, revision, persist]);
  useEffect(() => {
    if (content.status === 'submitted') { persist(false); return; }
    if (selectionFingerprint(choices) === lastSaved.current) return;
    persist(true); setSaveState(navigator.onLine === false ? 'Offline · kept on this device' : 'Waiting to save');
    if (conflict) return;
    const timer = setTimeout(() => saveNow().catch(() => {}), 500); return () => clearTimeout(timer);
  }, [choices, content.status, conflict, persist, saveNow]);
  useEffect(() => { const online = () => saveNow().catch(() => {}), offline = () => { setSaveState('Offline · kept on this device'); persist(true); }; window.addEventListener('online', online); window.addEventListener('offline', offline); return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); }; }, [saveNow, persist]);
  async function resolveConflict(keepLocal) {
    try {
      const freshContent = await access.reload();
      const fresh = freshContent.status === 'submitted' ? { ...selectionSnapshot(freshContent.selectionDraft), selected: freshContent.selectedAssetIds } : selectionSnapshot(freshContent.selectionDraft);
      version.current = freshContent.selectionDraft?.version || 0;
      lastSaved.current = selectionFingerprint(fresh);
      if (!keepLocal || freshContent.status === 'submitted' || (freshContent.revision || 1) !== revision) { current.current = fresh; setChoices(fresh); persist(false, fresh); }
      else { setChoices({ ...current.current }); persist(true); }
      setConflict(false); setError('');
    } catch (failure) { setError(apiMessage(failure, 'The saved choices could not be loaded.')); }
  }
  return { choices, setChoices, saveState, error, setError, saveNow, version, conflict, setConflict, resolveConflict };
}
