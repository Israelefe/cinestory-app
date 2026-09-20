import React, { useEffect, useMemo, useState } from 'react';
import { Archive, AlertCircle, ArrowRight, Check, Copy, Download, ExternalLink, FileUp, Folder, LoaderCircle, Plus, Pencil, ScanSearch, Send, Trash2, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import './VolumeManager.css';
import './VolumeManagerV2.css';

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { cells.push(current.trim()); current = ''; }
    else current += character;
  }
  cells.push(current.trim());
  return cells;
}

const emptySubjectEdit = { recipientCode: '', displayName: '', email: '' };

export default function VolumeManager({ user }) {
  const [jobs, setJobs] = useState([]);
  const [active, setActive] = useState(null);
  const [library, setLibrary] = useState([]);
  const [subjectId, setSubjectId] = useState('');
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [form, setForm] = useState({ title: '', organisation: '', category: 'school' });
  const [jobEdit, setJobEdit] = useState(null);
  const [subjectEdit, setSubjectEdit] = useState(null);
  const [rows, setRows] = useState('');
  const [busy, setBusy] = useState('loading');
  const [error, setError] = useState('');
  const [matchReport, setMatchReport] = useState(null);
  const [publishedLink, setPublishedLink] = useState(null);
  const isPro = ['pro', 'studio'].includes(user?.plan);

  async function loadJobs() {
    setBusy('loading'); setError('');
    try { const response = await api.get('/v1/volume-jobs'); setJobs(response.data.data || []); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not open your volume deliveries.')); }
    finally { setBusy(''); }
  }

  useEffect(() => { loadJobs(); }, []);

  async function openJob(id) {
    setBusy('job'); setError(''); setJobEdit(null); setSubjectEdit(null);
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

  const parsedRows = useMemo(() => rows.split(/\r?\n/).map(parseCsvLine).filter(parts => parts.some(Boolean)).filter((parts, index) => !(index === 0 && /code/i.test(parts[0]) && /name/i.test(parts[1] || ''))), [rows]);

  async function readRecipientFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) || file.size > 2 * 1024 * 1024) return setError('Choose a CSV file no larger than 2 MB.');
    try { setRows(await file.text()); setError(''); }
    catch { setError('We could not read that CSV file.'); }
  }

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
    setSubjectEdit(null);
  }

  async function saveAssignment() {
    if (!subjectId) return;
    setBusy('assign'); setError('');
    try { await api.put(`/v1/volume-jobs/${active._id}/subjects/${subjectId}/assets`, { assetIds: selectedAssets }); await openJob(active._id); toast.success('Recipient gallery updated.'); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not assign those photographs.')); setBusy(''); }
  }

  async function autoAssign() {
    setBusy('auto-assign'); setError(''); setMatchReport(null);
    try { const response = await api.post(`/v1/volume-jobs/${active._id}/auto-assign`); setMatchReport(response.data.data); await openJob(active._id); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not match the filenames to recipients.')); setBusy(''); }
  }

  async function saveJobDetails(event) {
    event.preventDefault(); setBusy('job-save'); setError('');
    try { await api.patch(`/v1/volume-jobs/${active._id}`, jobEdit); await openJob(active._id); toast.success('Delivery details saved.'); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not save those job details.')); setBusy(''); }
  }

  async function saveSubjectDetails(event) {
    event.preventDefault(); setBusy('subject-save'); setError('');
    try { await api.patch(`/v1/volume-jobs/${active._id}/subjects/${subjectId}`, subjectEdit); await openJob(active._id); toast.success('Recipient details saved.'); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not update that recipient.')); setBusy(''); }
  }

  async function removeSubject() {
    if (!subjectId || !window.confirm('Remove this recipient and their assigned photographs?')) return;
    setBusy('subject-remove'); setError('');
    try { await api.delete(`/v1/volume-jobs/${active._id}/subjects/${subjectId}`); await openJob(active._id); toast.success('Recipient removed.'); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not remove that recipient.')); setBusy(''); }
  }

  async function exportJob() {
    setBusy('export'); setError('');
    try {
      const response = await api.get(`/v1/volume-jobs/${active._id}/export.csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `${String(active.title || 'volume-delivery').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80)}.csv`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      toast.success('Recipient list downloaded.');
    } catch (requestError) { setError(apiMessage(requestError, 'We could not export this delivery.')); }
    finally { setBusy(''); }
  }

  async function archiveJob() {
    if (!window.confirm('Archive this delivery? Published recipient links will stop working.')) return;
    setBusy('archive'); setError('');
    try { await api.post(`/v1/volume-jobs/${active._id}/archive`); await loadJobs(); setActive(null); toast.success('Volume delivery archived.'); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not archive this delivery.')); setBusy(''); }
  }

  async function deleteJob() {
    if (!window.confirm('Delete this draft and all of its recipient assignments?')) return;
    setBusy('delete'); setError('');
    try { await api.delete(`/v1/volume-jobs/${active._id}`); await loadJobs(); setActive(null); toast.success('Draft volume delivery deleted.'); }
    catch (requestError) { setError(apiMessage(requestError, 'We could not delete this draft.')); setBusy(''); }
  }

  async function publish() {
    setBusy('publish'); setError('');
    try {
      const response = await api.post(`/v1/volume-jobs/${active._id}/publish`);
      const url = response.data.data.url || active.shareUrl || `/volume/${active.publicId}`;
      setPublishedLink({ title: active.title, url });
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Published. The recipient link was copied.');
      } catch {
        toast.info('Published. Copy the recipient link from the confirmation card.');
      }
      await loadJobs(); setActive(null);
    }
    catch (requestError) { setError(apiMessage(requestError, 'We could not publish this volume delivery.')); }
    finally { setBusy(''); }
  }

  async function copyLink(url) {
    try { await navigator.clipboard.writeText(url); toast.success('Recipient link copied.'); }
    catch { toast.info('Copy is not available here. Select the link and copy it.'); }
  }

  if (!isPro) return <main className="vm-page"><section className="vm-upgrade"><Users size={29} /><span>VOLUME DELIVERY BETA</span><h1>Private galleries for schools, teams, and large groups.</h1><p>Each recipient uses their code and email to receive a short-lived access code. Face recognition is not used.</p><a href="/billing">View Veylo Pro<ArrowRight size={17} /></a></section></main>;

  const selectedSubject = active?.subjects?.find(subject => subject._id === subjectId);
  return (
    <main className="vm-page">
      <header><span>VOLUME DELIVERY / PRO BETA</span><h1>One shoot.<br />Many private recipients.</h1><p>Set up as many as 1,000 recipient galleries and 5,000 photo assignments. Use codes supplied by the school, team, or organiser.</p></header>
      {error && <div className="vm-error" role="alert">{error}</div>}
      {publishedLink && <aside className="vm-published-link" role="status"><div><span>RECIPIENT LINK READY</span><strong>{publishedLink.title}</strong><p>The delivery is live. Clipboard access is optional; the link remains here until you dismiss it.</p></div><div><input readOnly value={publishedLink.url} aria-label="Published recipient link" onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => copyLink(publishedLink.url)}><Copy size={15} />Copy link</button><a href={publishedLink.url} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open</a><button type="button" className="vm-published-dismiss" onClick={() => setPublishedLink(null)} aria-label="Dismiss published link"><Trash2 size={15} /></button></div></aside>}
      {active ? (
        <section className="vm-workspace">
          <button className="vm-back" type="button" onClick={() => setActive(null)}>Back to volume deliveries</button>
          <div className="vm-job-head">
            <div><span>{active.organisation}</span><h2>{active.title}</h2><p>{active.subjectCount} recipients / {active.assignedPhotoCount} assignments <em className={`vm-status vm-status-${active.status}`}>{active.status}</em></p></div>
            <div className="vm-job-actions">
              <button type="button" onClick={() => setJobEdit({ title: active.title, organisation: active.organisation, category: active.category })} disabled={Boolean(busy) || active.status !== 'draft'}><Pencil size={15} />Edit details</button>
              <button type="button" onClick={exportJob} disabled={Boolean(busy)}><Download size={15} />Export CSV</button>
              <button className="vm-primary-action" type="button" onClick={publish} disabled={Boolean(busy) || active.status !== 'draft'}><Send size={16} />Publish and copy link</button>
            </div>
          </div>
          {jobEdit && <form className="vm-edit-panel" onSubmit={saveJobDetails}>
            <div><span>Edit delivery details</span><h3>Keep the organiser-facing details current.</h3></div>
            <label>Delivery title<input value={jobEdit.title} onChange={event => setJobEdit(current => ({ ...current, title: event.target.value }))} minLength={3} maxLength={120} required /></label>
            <label>School, team, or organisation<input value={jobEdit.organisation} onChange={event => setJobEdit(current => ({ ...current, organisation: event.target.value }))} minLength={2} maxLength={120} required /></label>
            <label>Job type<select value={jobEdit.category} onChange={event => setJobEdit(current => ({ ...current, category: event.target.value }))}><option value="school">School</option><option value="sports">Sports</option><option value="corporate">Corporate</option><option value="other">Other</option></select></label>
            <div className="vm-inline-actions"><button type="submit" disabled={busy === 'job-save'}>{busy === 'job-save' ? <LoaderCircle className="v-spin" size={16} /> : <Check size={16} />}Save details</button><button type="button" onClick={() => setJobEdit(null)}>Cancel</button></div>
          </form>}
          <div className="vm-job-tools"><button type="button" onClick={archiveJob} disabled={Boolean(busy)}><Archive size={15} />Archive delivery</button>{active.status === 'draft' && <button type="button" onClick={deleteJob} disabled={Boolean(busy)}><Trash2 size={15} />Delete draft</button>}</div>
          <div className="vm-steps">
            <article>
              <span>01 / RECIPIENTS</span><h3>Add the private galleries.</h3><p>Upload a CSV or paste one row per person: recipient code, full name, email address.</p>
              <label className={`vm-csv${active.status !== 'draft' ? ' is-disabled' : ''}`}><FileUp size={17} /><span><strong>{active.status === 'draft' ? 'Choose recipient CSV' : 'Recipients are locked after publishing'}</strong><small>Header row optional / up to 2 MB</small></span><input type="file" accept=".csv,text/csv" onChange={event => readRecipientFile(event.target.files?.[0])} disabled={active.status !== 'draft'} /></label>
              <textarea value={rows} onChange={event => setRows(event.target.value)} rows={7} placeholder={'STU-1042, Amaka Okoro, amaka@example.com\nSTU-1043, Tunde Bello, tunde@example.com'} disabled={active.status !== 'draft'} />
              <footer><small>{parsedRows.length} rows ready</small><button type="button" onClick={importRecipients} disabled={busy === 'subjects' || active.status !== 'draft'}>{busy === 'subjects' ? <LoaderCircle className="v-spin" size={16} /> : <Plus size={16} />}Add recipients</button></footer>
            </article>
            <article>
              <span>02 / ASSIGNMENT</span><h3>Match filenames, then review exceptions.</h3>
              {active.subjects?.length ? <>
                <button type="button" className="vm-auto" onClick={autoAssign} disabled={busy === 'auto-assign' || active.status !== 'draft'}>{busy === 'auto-assign' ? <LoaderCircle className="v-spin" size={16} /> : <ScanSearch size={16} />}{active.status === 'draft' ? 'Match recipient codes in filenames' : 'Filename matching is locked after publishing'}</button>
                {matchReport && <div className="vm-match-report" role="status"><strong>{matchReport.matchedRecipients} of {matchReport.totalRecipients} recipients matched</strong><span>{matchReport.assignedPhotoCount} photo assignments prepared</span>{Boolean(matchReport.unmatchedRecipients?.length) && <p><AlertCircle size={14} />{matchReport.unmatchedRecipients.length} recipient{matchReport.unmatchedRecipients.length === 1 ? '' : 's'} need manual assignment.</p>}</div>}
                <select value={subjectId} onChange={event => chooseSubject(event.target.value)} disabled={active.status !== 'draft'}><option value="">Choose recipient to review</option>{active.subjects.map(subject => <option key={subject._id} value={subject._id}>{subject.recipientCode} — {subject.displayName} ({subject.assetIds.length})</option>)}</select>
              </> : <p className="vm-note">Add recipients before assigning photographs.</p>}
              {subjectId && <>
                <div className="vm-subject-toolbar"><span>{selectedSubject?.displayName}</span><div><button type="button" onClick={() => setSubjectEdit({ ...emptySubjectEdit, recipientCode: selectedSubject.recipientCode, displayName: selectedSubject.displayName, email: selectedSubject.email || '' })} disabled={active.status !== 'draft'}><Pencil size={14} />Edit</button><button type="button" onClick={removeSubject} disabled={active.status !== 'draft' || Boolean(busy)}><Trash2 size={14} />Remove</button></div></div>
                {subjectEdit && <form className="vm-subject-edit" onSubmit={saveSubjectDetails}>
                  <label>Recipient code<input value={subjectEdit.recipientCode} onChange={event => setSubjectEdit(current => ({ ...current, recipientCode: event.target.value }))} minLength={3} maxLength={40} pattern="[A-Za-z0-9_-]+" required /></label>
                  <label>Name<input value={subjectEdit.displayName} onChange={event => setSubjectEdit(current => ({ ...current, displayName: event.target.value }))} minLength={2} maxLength={100} required /></label>
                  <label>Email<input type="email" value={subjectEdit.email} onChange={event => setSubjectEdit(current => ({ ...current, email: event.target.value }))} maxLength={254} required /></label>
                  <div className="vm-inline-actions"><button type="submit" disabled={busy === 'subject-save'}>{busy === 'subject-save' ? <LoaderCircle className="v-spin" size={15} /> : <Check size={15} />}Save recipient</button><button type="button" onClick={() => setSubjectEdit(null)}>Cancel</button></div>
                </form>}
                <div className="vm-library">{library.map(asset => { const selected = selectedAssets.includes(asset.assetId); return <button type="button" key={asset.assetId} className={selected ? 'is-selected' : ''} onClick={() => setSelectedAssets(current => selected ? current.filter(id => id !== asset.assetId) : [...current, asset.assetId])} disabled={active.status !== 'draft'}><img src={asset.thumbnailUrl || asset.url} alt="" loading="lazy" />{selected && <i><Check size={14} /></i>}</button>; })}</div>
                <footer><small>{selectedAssets.length} photographs selected</small><button type="button" onClick={saveAssignment} disabled={busy === 'assign' || active.status !== 'draft'}>Save recipient gallery</button></footer>
              </>}
            </article>
          </div>
        </section>
      ) : (
        <section className="vm-index">
          <form onSubmit={createJob}><span>START A VOLUME DELIVERY</span><h2>Name the job.</h2><label>Delivery title<input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} required minLength={3} maxLength={120} placeholder="2026 graduation portraits" /></label><label>School, team, or organisation<input value={form.organisation} onChange={event => setForm(current => ({ ...current, organisation: event.target.value }))} required minLength={2} maxLength={120} placeholder="Queens College Lagos" /></label><label>Job type<select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}><option value="school">School</option><option value="sports">Sports</option><option value="corporate">Corporate</option><option value="other">Other</option></select></label><button disabled={busy === 'create'}>{busy === 'create' ? <LoaderCircle className="v-spin" size={17} /> : <Plus size={17} />}Create draft</button></form>
          <div className="vm-jobs"><header><Folder size={19} /><h2>Current jobs</h2></header>{busy === 'loading' ? <p>Opening your jobs...</p> : jobs.length ? jobs.map(job => <button type="button" key={job._id} onClick={() => openJob(job._id)}><span><strong>{job.title}</strong><small>{job.organisation} / {job.subjectCount} recipients / {job.status}</small></span><ArrowRight size={17} /></button>) : <p>No volume deliveries yet.</p>}</div>
        </section>
      )}
    </main>
  );
}
