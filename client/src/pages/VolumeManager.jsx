import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, Folder, Image, LoaderCircle, Plus, Send, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import './VolumeManager.css';

export default function VolumeManager({ user }) {
  const [jobs, setJobs] = useState([]);
  const [active, setActive] = useState(null);
  const [library, setLibrary] = useState([]);
  const [subjectId, setSubjectId] = useState('');
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [form, setForm] = useState({ title: '', organisation: '', category: 'school' });
  const [rows, setRows] = useState('');
  const [busy, setBusy] = useState('loading');
  const [error, setError] = useState('');
  const isPro = ['pro', 'studio'].includes(user?.plan);

  async function loadJobs() {
    setBusy('loading'); setError('');
    try { const response = await api.get('/v1/volume-jobs'); setJobs(response.data.data || []); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not open your volume deliveries.')); }
    finally { setBusy(''); }
  }

  useEffect(() => { loadJobs(); }, []);

  async function openJob(id) {
    setBusy('job'); setError('');
    try {
      const [jobResponse, libraryResponse] = await Promise.all([api.get(`/v1/volume-jobs/${id}`), api.get('/v1/storage')]);
      setActive(jobResponse.data.data); setLibrary(libraryResponse.data.data || []); setSubjectId(''); setSelectedAssets([]);
    } catch (requestError) { setError(apiMessage(requestError, 'We could not open that volume delivery.')); }
    finally { setBusy(''); }
  }

  async function createJob(event) {
    event.preventDefault(); setBusy('create'); setError('');
    try { const response = await api.post('/v1/volume-jobs', form); setJobs(current => [response.data.data, ...current]); setForm({ title: '', organisation: '', category: 'school' }); await openJob(response.data.data._id); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not start that volume delivery.')); setBusy(''); }
  }

  const parsedRows = useMemo(() => rows.split(/\r?\n/).map(line => line.split(',').map(value => value.trim())).filter(parts => parts.some(Boolean)), [rows]);
  async function importRecipients() {
    const subjects = parsedRows.map(parts => ({ recipientCode: parts[0] || '', displayName: parts[1] || '', email: parts[2] || '' }));
    if (!subjects.length) return setError('Add at least one recipient row.');
    setBusy('subjects'); setError('');
    try { await api.post(`/v1/volume-jobs/${active._id}/subjects`, { subjects }); setRows(''); await openJob(active._id); toast.success(`${subjects.length} recipient${subjects.length === 1 ? '' : 's'} added.`); }
    catch (requestError) { setError(apiMessage(requestError, 'Check the recipient rows and try again.')); setBusy(''); }
  }

  function chooseSubject(id) {
    setSubjectId(id);
    const subject = active.subjects.find(item => item._id === id);
    setSelectedAssets(subject?.assetIds || []);
  }

  async function saveAssignment() {
    if (!subjectId) return;
    setBusy('assign'); setError('');
    try { await api.put(`/v1/volume-jobs/${active._id}/subjects/${subjectId}/assets`, { assetIds: selectedAssets }); await openJob(active._id); toast.success('Recipient gallery updated.'); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not assign those photographs.')); setBusy(''); }
  }

  async function publish() {
    setBusy('publish'); setError('');
    try { const response = await api.post(`/v1/volume-jobs/${active._id}/publish`); await navigator.clipboard.writeText(response.data.data.url); toast.success('Published. The recipient link was copied.'); await loadJobs(); setActive(null); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not publish this volume delivery.')); setBusy(''); }
  }

  if (!isPro) return <main className="vm-page"><section className="vm-upgrade"><Users size={29} /><span>VOLUME DELIVERY BETA</span><h1>Private galleries for schools, teams, and large groups.</h1><p>Each recipient uses their code and email to receive a short-lived access code. Face recognition is not used.</p><a href="/billing">View Veylo Pro<ArrowRight size={17} /></a></section></main>;

  return <main className="vm-page"><header><span>VOLUME DELIVERY / PRO BETA</span><h1>One shoot.<br />Many private recipients.</h1><p>Set up as many as 1,000 recipient galleries and 5,000 photo assignments. Use codes supplied by the school, team, or organiser.</p></header>{error && <div className="vm-error" role="alert">{error}</div>}{active ? <section className="vm-workspace"><button className="vm-back" type="button" onClick={() => setActive(null)}>Back to volume deliveries</button><div className="vm-job-head"><div><span>{active.organisation}</span><h2>{active.title}</h2><p>{active.subjectCount} recipients · {active.assignedPhotoCount} assignments</p></div><button type="button" onClick={publish} disabled={Boolean(busy) || active.status !== 'draft'}><Send size={16} />Publish and copy link</button></div><div className="vm-steps"><article><span>01 / RECIPIENTS</span><h3>Add the private galleries.</h3><p>Use one row per person: recipient code, full name, email address.</p><textarea value={rows} onChange={event => setRows(event.target.value)} rows={7} placeholder={'STU-1042, Amaka Okoro, amaka@example.com\nSTU-1043, Tunde Bello, tunde@example.com'} /><footer><small>{parsedRows.length} rows ready</small><button type="button" onClick={importRecipients} disabled={busy === 'subjects'}>{busy === 'subjects' ? <LoaderCircle className="v-spin" size={16} /> : <Plus size={16} />}Add recipients</button></footer></article><article><span>02 / ASSIGNMENT</span><h3>Choose a recipient, then their photos.</h3>{active.subjects?.length ? <select value={subjectId} onChange={event => chooseSubject(event.target.value)}><option value="">Choose recipient</option>{active.subjects.map(subject => <option key={subject._id} value={subject._id}>{subject.recipientCode} — {subject.displayName} ({subject.assetIds.length})</option>)}</select> : <p className="vm-note">Add recipients before assigning photographs.</p>}{subjectId && <><div className="vm-library">{library.map(asset => { const selected = selectedAssets.includes(asset.assetId); return <button type="button" key={asset.assetId} className={selected ? 'is-selected' : ''} onClick={() => setSelectedAssets(current => selected ? current.filter(id => id !== asset.assetId) : [...current, asset.assetId])}><img src={asset.thumbnailUrl || asset.url} alt="" loading="lazy" />{selected && <i><Check size={14} /></i>}</button>; })}</div><footer><small>{selectedAssets.length} photographs selected</small><button type="button" onClick={saveAssignment} disabled={busy === 'assign'}>Save recipient gallery</button></footer></>}</article></div></section> : <section className="vm-index"><form onSubmit={createJob}><span>START A VOLUME DELIVERY</span><h2>Name the job.</h2><label>Delivery title<input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} required minLength={3} maxLength={120} placeholder="2026 graduation portraits" /></label><label>School, team, or organisation<input value={form.organisation} onChange={event => setForm(current => ({ ...current, organisation: event.target.value }))} required minLength={2} maxLength={120} placeholder="Queens College Lagos" /></label><label>Job type<select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}><option value="school">School</option><option value="sports">Sports</option><option value="corporate">Corporate</option><option value="other">Other</option></select></label><button disabled={busy === 'create'}>{busy === 'create' ? <LoaderCircle className="v-spin" size={17} /> : <Plus size={17} />}Create draft</button></form><div className="vm-jobs"><header><Folder size={19} /><h2>Current jobs</h2></header>{busy === 'loading' ? <p>Opening your jobs…</p> : jobs.length ? jobs.map(job => <button type="button" key={job._id} onClick={() => openJob(job._id)}><span><strong>{job.title}</strong><small>{job.organisation} · {job.subjectCount} recipients</small></span><ArrowRight size={17} /></button>) : <p>No volume deliveries yet.</p>}</div></section>}</main>;
}
