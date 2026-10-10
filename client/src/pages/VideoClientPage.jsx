import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Film, LockKeyhole, RefreshCw } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { videoMediaUrl } from '../services/videoDelivery.js';
import VideoViewer from '../components/delivery/VideoViewer.jsx';
import './CreateVideoDelivery.css';

export default function VideoClientPage() {
  const { publicId } = useParams(); const [delivery, setDelivery] = useState(null); const [error, setError] = useState(''); const [pin, setPin] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setBusy(true); setError(''); try { const { data } = await api.get(`/v1/videos/public/${encodeURIComponent(publicId)}`); setDelivery(data.data); } catch (failure) { setError(apiMessage(failure, 'This video delivery could not be opened.')); } finally { setBusy(false); } }, [publicId]);
  useEffect(() => { setDelivery(null); void load(); }, [load]);
  const requestPlayback = useCallback(async (item, sessionId, signal) => { const { data } = await api.post(`/v1/videos/public/${encodeURIComponent(publicId)}/assets/${item.id}/playback`, sessionId ? { sessionId } : {}, { signal }); return data.data; }, [publicId]);
  const endPlayback = useCallback(sessionId => api.post(`/v1/videos/public/${encodeURIComponent(publicId)}/playback/end`, { sessionId }), [publicId]);
  if (delivery?.requiresPin) return <main className="vv-state vv-access"><LockKeyhole size={28} /><p>{delivery.branding?.name}</p><h1>Your films are private.</h1><p>Enter the six-digit PIN your photographer sent you.</p><form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const { data } = await api.post(`/v1/videos/public/${encodeURIComponent(publicId)}/unlock`, { pin }); setDelivery(data.data); } catch (failure) { setError(apiMessage(failure, 'That PIN could not be checked.')); } finally { setBusy(false); } }}><label htmlFor="video-access-pin">Access PIN</label><input id="video-access-pin" type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} required /><button type="submit" disabled={busy || pin.length !== 6}>{busy ? 'Checking PIN…' : 'Open films'}</button></form>{error && <p role="alert">{error}</p>}</main>;
  if (!delivery) return <main className="vv-state"><Film size={28} /><h1>{busy ? 'Opening your films…' : 'This link could not be opened.'}</h1>{error && <><p role="alert">{error}</p><button className="vv-retry" type="button" onClick={load}><RefreshCw size={16} />Try again</button></>}</main>;
  return <VideoViewer delivery={delivery} requestPlayback={requestPlayback} endPlayback={endPlayback} downloadUrl={item => videoMediaUrl(`/api/v1/videos/public/${publicId}/assets/${item.id}/download`)} />;
}
