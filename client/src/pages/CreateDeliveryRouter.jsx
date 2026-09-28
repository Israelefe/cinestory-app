import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api.js';
import CreateDelivery from './CreateDelivery.jsx';
import CreateDeliveryV3 from './CreateDeliveryV3.jsx';

export default function CreateDeliveryRouter({ user }) {
  const [params] = useSearchParams();
  const draftId = params.get('draft');
  const [state, setState] = useState({ loading: Boolean(draftId), delivery: null, error: '' });
  useEffect(() => {
    if (!draftId) { setState({ loading: false, delivery: null, error: '' }); return; }
    let active = true;
    setState({ loading: true, delivery: null, error: '' });
    api.get(`/v1/deliveries/${encodeURIComponent(draftId)}`).then(({ data }) => {
      if (active) setState({ loading: false, delivery: data.data, error: '' });
    }).catch(() => { if (active) setState({ loading: false, delivery: null, error: 'This draft could not be opened.' }); });
    return () => { active = false; };
  }, [draftId]);
  if (state.loading) return <div className="v-page-loading" role="status">Opening your draft…</div>;
  if (state.error) return <div className="v-page-loading" role="alert">{state.error}</div>;
  if (state.delivery && state.delivery.schemaVersion !== 3) return <CreateDelivery user={user} />;
  return <CreateDeliveryV3 key={draftId || 'new'} user={user} initialDelivery={state.delivery} />;
}
