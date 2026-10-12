import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../../services/api.js';

export function useOwnerLink(id) {
  const [item, setItem] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const previous = useRef(null);
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { data } = await api.get('/v1/storage/collaborations/' + id);
      if (previous.current && (previous.current.status !== 'submitted' && data.data.status === 'submitted' || previous.current.editorState !== 'ready-for-review' && data.data.editorState === 'ready-for-review')) toast.success(data.data.kind === 'preselection' ? 'Your client has submitted their choices.' : 'Your editor has sent edits for review.');
      previous.current = data.data; setItem(data.data); setError('');
    } catch (failure) { setError(apiMessage(failure, 'This link could not be opened.')); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); const refresh = () => { if (document.visibilityState === 'visible') load(true); }; const interval = setInterval(refresh, 20000); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh); return () => { clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); }; }, [load]);
  return { item, setItem, loading, error, load };
}
