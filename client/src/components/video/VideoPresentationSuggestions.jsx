import React, { useEffect, useState } from 'react';
import { FileText, Check } from 'lucide-react';
import api, { apiMessage } from '../../services/api.js';

export default function VideoPresentationSuggestions({ deliveryId, enabled, save, onApply }) {
  const [useNotes, setUseNotes] = useState(false); const [job, setJob] = useState(null); const [jobId, setJobId] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!jobId || ['done', 'failed'].includes(job?.state)) return;
    let active = true;
    const read = async () => { try { const { data } = await api.get(`/v1/videos/presentations/${jobId}`); if (active) setJob(data.data); } catch (failure) { if (active) setError(apiMessage(failure, 'Suggestions could not be checked.')); } };
    void read(); const timer = setInterval(read, 4000); return () => { active = false; clearInterval(timer); };
  }, [jobId, job?.state]);
  return <section className="vc-presentation-suggest"><FileText size={20} /><div><h3>Bring the delivery together.</h3><p>After each film has footage suggestions, request a delivery title, introduction, opening film and order. Your saved writing stays unchanged until you choose to apply them.</p><label className="vc-check"><input type="checkbox" checked={useNotes} onChange={event => setUseNotes(event.target.checked)} /><span>Use my private delivery notes as context<small>Check the result for private details before using it.</small></span></label><button type="button" className="vc-subtle" disabled={!enabled || busy || ['queued', 'running'].includes(job?.state)} onClick={async () => { setBusy(true); setError(''); try { const delivery = await save(); const { data } = await api.post(`/v1/videos/deliveries/${delivery?._id || deliveryId}/suggest`, { useNotes }); setJob({ state: 'queued' }); setJobId(data.data.jobId); } catch (failure) { setError(apiMessage(failure, 'Presentation suggestions could not be requested.')); } finally { setBusy(false); } }}>{busy || ['queued', 'running'].includes(job?.state) ? 'Preparing suggestions…' : 'Suggest the presentation'}</button>{error && <p role="alert" className="vc-error">{error}</p>}{job?.state === 'failed' && <p role="alert" className="vc-error">The presentation suggestions could not be completed. Your writing is unchanged.</p>}{job?.state === 'done' && job.result && <div className="vc-suggestion"><p>REVIEW THE FULL PRESENTATION</p><h3>{job.result.title}</h3><div>{job.result.introduction}</div><small>{job.result.reason}</small><button type="button" onClick={() => { onApply(job.result); setJob(null); setJobId(''); }}><Check size={15} />Use title, introduction & order</button></div>}</div></section>;
}
