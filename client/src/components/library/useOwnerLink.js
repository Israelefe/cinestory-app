import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../../services/api.js';

export function useOwnerLink(id) {
  const [item, updateItem] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const previous = useRef(null), request = useRef(0);
  const setItem = useCallback(value => updateItem(current => {
    const incoming = typeof value === 'function' ? value(current) : value;
    if (current && incoming && current._id === incoming._id && (Number(current.editorVersion || 0) > Number(incoming.editorVersion || 0) || Number(current.revision || 1) > Number(incoming.revision || 1) || new Date(current.updatedAt || 0) > new Date(incoming.updatedAt || 0))) return current;
    previous.current = incoming; return incoming;
  }), []);
  const load = useCallback(async (quiet = false) => {
    const generation = ++request.current;
    if (!quiet) setLoading(true);
    try {
      const { data } = await api.get('/v1/storage/collaborations/' + id);
      if (generation !== request.current) return;
      if (previous.current && (previous.current.status !== 'submitted' && data.data.status === 'submitted' || previous.current.editorState !== 'ready-for-review' && data.data.editorState === 'ready-for-review')) toast.success(data.data.kind === 'preselection' ? 'Your client has submitted their choices.' : 'Your editor has sent edits for review.');
      setItem(data.data); setError('');
    } catch (failure) { if (generation === request.current) setError(apiMessage(failure, 'This link could not be opened.')); } finally { if (generation === request.current) setLoading(false); }
  }, [id]);
  useEffect(() => { load(); const refresh = () => { if (document.visibilityState === 'visible') load(true); }; const interval = setInterval(refresh, 20000); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh); return () => { clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); }; }, [load]);
  return { item, setItem, loading, error, load };
}
