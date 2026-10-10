import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Check, MessageSquare, Play, RefreshCw, SlidersHorizontal } from 'lucide-react';
import api from '../services/api.js';
import './ProductControls.css';

export default function ProductControls({ canEdit = false }) {
  const [data, setData] = useState(null), [form, setForm] = useState(null), [error, setError] = useState(''), [saved, setSaved] = useState(false), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    api.get('/v1/admin/product-controls', { signal: controller.signal }).then(({ data: result }) => {
      if (controller.signal.aborted) return;
      setData(result.data);
      const s = result.data.settings;
      setForm(Object.fromEntries(['revision', 'replayEnabled', 'replaySamplePercent', 'feedbackEnabled', 'guidanceEnabled', 'guidanceRolloutPercent', 'guidanceExperimentEnabled', 'alertEmail'].map(key => [key, s[key]])));
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.response?.data?.message || 'Product controls could not load.'); });
    return () => controller.abort();
  }, [refresh]);
  const change = (key, value) => { setSaved(false); setForm(current => ({ ...current, [key]: value })); };
  async function save() {
    setBusy(true); setSaved(false); setError('');
    try { await api.put('/v1/admin/product-controls', form); setSaved(true); setRefresh(value => value + 1); }
    catch (failure) { setError(failure.response?.data?.message || 'Settings could not be saved.'); }
    finally { setBusy(false); }
  }
  return <motion.section className="pc-workspace" aria-label="Product controls" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
    <header className="pi-card-header"><div><p className="pi-kicker">Monitoring and improvements</p><h2>Keep control of what goes live.</h2><p className="pi-note">Changes affect new dashboard visits. Every save is recorded in the administrator audit log.</p></div><button className="pi-icon-button" aria-label="Refresh product controls" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} /></button></header>
    {error && <p role="alert" className="pi-error">{error}</p>}
    {!form && !error && <p role="status">Loading product controls…</p>}
    {form && <><fieldset disabled={!canEdit || busy} className="pc-grid"><legend className="pi-sr-only">Product settings</legend>
      <article className="pi-card"><Bell size={21} /><h3>Error alerts</h3><p>Automatically watches browser errors, upload and publishing failures, and delayed PostHog forwarding. Signals must persist across three checks.</p><label>Send alerts to<input type="email" autoComplete="off" maxLength={254} value={form.alertEmail} placeholder={data.email.recipient || 'Your operations email address'} onChange={event => change('alertEmail', event.target.value.trim())} /></label><p className={`pc-status${data.email.configured ? ' is-ready' : ''}`}>{data.email.configured ? 'Email delivery is configured. Actual incident delivery is shown in Operations.' : 'Email alerts need a recipient and a configured email provider. Admin incidents still work.'}</p></article>
      <article className="pi-card"><Play size={21} /><h3>Dashboard recordings</h3><p>Photographers must give permission each time. Text, attributes, photographs, forms and private delivery cards are hidden. Recordings stop after five minutes, on navigation, or when the tab is hidden.</p><label className="pc-toggle"><input type="checkbox" checked={form.replayEnabled} onChange={event => change('replayEnabled', event.target.checked)} /><span>Offer optional recordings</span></label><label>Eligible accounts (%)<input type="number" min="0" max="100" step="1" value={form.replaySamplePercent} onChange={event => change('replaySamplePercent', Number(event.target.value))} /></label><small>PostHog must also enable Session Replay. Masking deliberately reduces visual detail.</small></article>
      <article className="pi-card"><MessageSquare size={21} /><h3>Dashboard feedback</h3><p>Ask how easy the dashboard is to use, with a score from 1 to 5. One response per account. Photographers who need a reply can open the human support inbox.</p><label className="pc-toggle"><input type="checkbox" checked={form.feedbackEnabled} onChange={event => change('feedbackEnabled', event.target.checked)} /><span>Show the feedback question</span></label><div className="pc-feedback">{[1, 2, 3, 4, 5].map(score => <div key={score}><span>{score}/5</span><strong>{data.feedback.find(row => row.score === score)?.responses || 0}</strong></div>)}</div></article>
      <article className="pi-card"><SlidersHorizontal size={21} /><h3>Try dashboard guidance</h3><p>Show a short guide to preparing a client delivery. Allocation stays consistent for each account. Plan access, pricing and security always use their existing checks.</p><label className="pc-toggle"><input type="checkbox" checked={form.guidanceEnabled} onChange={event => change('guidanceEnabled', event.target.checked)} /><span>Enable the delivery guide</span></label><label>Rollout to accounts (%)<input type="number" min="0" max="100" step="1" value={form.guidanceRolloutPercent} onChange={event => change('guidanceRolloutPercent', Number(event.target.value))} /></label><label className="pc-toggle"><input type="checkbox" checked={form.guidanceExperimentEnabled} onChange={event => change('guidanceExperimentEnabled', event.target.checked)} /><span>Compare with the current dashboard (50/50)</span></label><small>Turning the guide off stops new exposures. Existing results remain available.</small></article>
    </fieldset><article className="pi-card pc-experiment"><p className="pi-kicker">Dashboard guidance test</p><h3>Did more photographers publish?</h3><p>{data.experiment.note}</p><div className="pc-results">{['control', 'guided'].map(variant => { const row = data.experiment.variants.find(item => item.variant === variant); return <div key={variant}><h4>{variant === 'control' ? 'Current dashboard' : 'With delivery guide'}</h4><strong>{row?.published || 0}<small> published / {row?.exposed || 0} exposed</small></strong><p>{row?.pending || 0} accounts still inside the 7-day observation window.</p></div>; })}</div></article>
    <footer className="pc-footer">{canEdit ? <button className="pi-button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save product settings'}<Check size={16} /></button> : <p className="pi-note">Only a super administrator can change these settings.</p>}{saved && <p className="pc-status is-ready" role="status">Product settings saved.</p>}</footer></>}
  </motion.section>;
}
