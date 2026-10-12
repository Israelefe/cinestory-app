import { useEffect, useState } from 'react';
import api, { apiMessage } from '../../services/api.js';

export function useResolvedPhotos(assetIds, enabled = true) {
  const [state, setState] = useState({ photos: [], loading: false, error: '' });
  useEffect(() => {
    if (!enabled) return;
    if (!assetIds.length) { setState({ photos: [], loading: false, error: '' }); return; }
    const controller = new AbortController();
    setState({ photos: [], loading: true, error: '' });
    api.post('/v1/storage/photos/resolve', { assetIds }, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setState({ photos: data.data, loading: false, error: '' });
    }).catch(failure => { if (!controller.signal.aborted) setState({ photos: [], loading: false, error: apiMessage(failure, 'These photographs could not be loaded. Return to Photographs and check your selection.') }); });
    return () => controller.abort();
  }, [assetIds, enabled]);
  return state;
}
