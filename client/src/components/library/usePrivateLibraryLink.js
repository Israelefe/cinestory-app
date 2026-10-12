import { useCallback, useEffect, useState } from 'react';
import api, { apiMessage } from '../../services/api.js';

export function usePrivateLibraryLink(publicId, kind) {
  const [info, setInfo] = useState(null), [content, setContent] = useState(null), [token, setToken] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState(''), [working, setWorking] = useState(false);
  const endpoint = '/v1/storage/public/' + encodeURIComponent(publicId);
  const loadContent = useCallback(async accessToken => {
    const { data } = await api.get(endpoint + '/content', { headers: { Authorization: 'Bearer ' + accessToken } });
    if (data.data.kind !== kind) throw new Error('This link is for a different kind of work.');
    setContent(data.data); setToken(accessToken); return data.data;
  }, [endpoint, kind]);
  const unlock = useCallback(async secret => {
    const { data } = await api.post(endpoint + '/unlock', { secret });
    try { sessionStorage.setItem('veylo_library_access:' + publicId, data.data.token); } catch { /* Access remains in memory. */ }
    return loadContent(data.data.token);
  }, [endpoint, publicId, loadContent]);
  useEffect(() => {
    let current = true;
    (async () => {
      setLoading(true); setError(''); setContent(null);
      try {
        const { data } = await api.get(endpoint); if (!current) return;
        if (data.data.kind !== kind) throw new Error('This link is for a different kind of work.');
        setInfo(data.data);
        let remembered = ''; try { remembered = sessionStorage.getItem('veylo_library_access:' + publicId) || ''; } catch { /* Optional storage. */ }
        if (remembered) { try { await loadContent(remembered); return; } catch { try { sessionStorage.removeItem('veylo_library_access:' + publicId); } catch {} } }
        if (!data.data.requiresSecret) await unlock('');
      } catch (failure) { if (current) setError(apiMessage(failure, failure.message || 'This private link could not be opened.')); }
      finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [endpoint, kind, publicId, loadContent, unlock]);
  async function open(secret) { setWorking(true); setError(''); try { await unlock(secret); } catch (failure) { setError(apiMessage(failure, 'That access detail did not match.')); } finally { setWorking(false); } }
  return { info, content, setContent, token, loading, error, working, open, reload: () => loadContent(token), relock: () => { setContent(null); setToken(''); setError('Open the link again to continue. Your saved choices are kept.'); }, endpoint };
}
