import { useCallback, useEffect, useRef, useState } from 'react';
import api, { apiMessage } from '../../services/api.js';
import { photoId, shootName } from './libraryHelpers.js';

export function useLibraryPhotos({ folder = '', search = '', type = '' } = {}) {
  const [state, setState] = useState({ assets: [], shoots: [], folders: [], access: 'loading', usage: {}, total: 0, libraryTotal: 0, hasMore: false, page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const pending = useRef(null);
  const load = useCallback(async (page = 1) => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const version = ++generation.current;
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/v1/storage', { params: { page, ...(folder ? { folder } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(type ? { type } : {}) }, signal: controller.signal });
      if (version !== generation.current) return;
      setState(current => ({ ...data, assets: page === 1 ? data.data || [] : [...new Map([...current.assets, ...(data.data || [])].map(asset => [photoId(asset), asset])).values()], shoots: data.shoots || (data.folders || []).map(name => ({ name: shootName(name) })), page }));
    } catch (failure) { if (!controller.signal.aborted) setError(apiMessage(failure, 'Your photographs could not be loaded. Try again.')); }
    finally { if (version === generation.current) setLoading(false); }
  }, [folder, search, type]);
  useEffect(() => {
    const timer = setTimeout(() => load(1), search ? 250 : 0);
    return () => { clearTimeout(timer); generation.current++; pending.current?.abort(); };
  }, [load]);
  useEffect(() => {
    const onAdded = event => {
      const { asset, usage } = event.detail;
      if (!asset) return;
      setState(current => {
        if (current.assets.some(item => photoId(item) === photoId(asset))) return current;
        const match = (!folder || folder === 'All photographs' || shootName(asset.folder) === folder) && (!search.trim() || `${asset.originalFilename} ${(asset.tags || []).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())) && (!type || (type === 'raw') === Boolean(asset.rawPublicId));
        const name = shootName(asset.folder);
        const shoots = current.shoots.some(item => item.name === name) ? current.shoots.map(item => item.name === name ? { ...item, count: (item.count || 0) + 1 } : item) : [...current.shoots, { name, count: 1 }];
        return { ...current, assets: match ? [asset, ...current.assets] : current.assets, shoots, total: current.total + (match ? 1 : 0), libraryTotal: current.libraryTotal + 1, usage: usage ? { ...current.usage, ...usage } : { ...current.usage, usedBytes: (current.usage.usedBytes || 0) + asset.bytes } };
      });
    };
    window.addEventListener('veylo:library-photo-added', onAdded);
    const settled = () => {
      const version = generation.current;
      api.get('/v1/storage', { params: { ...(folder ? { folder } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(type ? { type } : {}) } }).then(({ data }) => {
        if (version === generation.current) setState(current => ({ ...current, usage: data.usage, shoots: data.shoots, total: data.total, libraryTotal: data.libraryTotal }));
      }).catch(() => {});
    };
    window.addEventListener('veylo:library-uploads-settled', settled);
    return () => { window.removeEventListener('veylo:library-photo-added', onAdded); window.removeEventListener('veylo:library-uploads-settled', settled); };
  }, [folder, search, type]);
  return { ...state, loading, error, reload: () => load(1), loadMore: () => load(state.page + 1), setState };
}
