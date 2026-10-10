import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CircleHelp, CircleStop, MessageCircle, Play, X } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { startDashboardReplay, stopDashboardReplay } from '../services/dashboardReplay.js';
import './DashboardTools.css';

export default function DashboardTools({ user }) {
  const [runtime, setRuntime] = useState(null), [error, setError] = useState('');
  const [score, setScore] = useState(null), [sending, setSending] = useState(false), [answered, setAnswered] = useState(false);
  const [permission, setPermission] = useState(false), [recording, setRecording] = useState(false), [starting, setStarting] = useState(false);
  const active = useRef(false), timer = useRef(null), attempt = useRef(0), lifecycle = useRef(0);
  const location = useLocation();
  const account = user?.id || user?._id;
  useLayoutEffect(() => {
    active.current = true;
    lifecycle.current += 1;
    setRuntime(null); setAnswered(false); setPermission(false);
    setScore(null); setSending(false); setError(''); setRecording(false); setStarting(false);
    const controller = new AbortController();
    api.get('/v1/product/runtime', { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setRuntime(data.data); }).catch(() => {});
    const pause = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', pause);
    window.addEventListener('pagehide', stop);
    return () => { active.current = false; lifecycle.current += 1; attempt.current += 1; controller.abort(); stopDashboardReplay(); clearTimeout(timer.current); document.removeEventListener('visibilitychange', pause); window.removeEventListener('pagehide', stop); };
  }, [account]);
  useLayoutEffect(() => { if (location.pathname !== '/dashboard' || location.search || location.hash) stop(); }, [location.pathname, location.search, location.hash]);
  useEffect(() => {
    if (runtime?.guidance?.token) api.post('/v1/product/exposure', { token: runtime.guidance.token }).catch(() => {});
  }, [runtime?.guidance?.token]);
  function stop() { attempt.current += 1; stopDashboardReplay(); clearTimeout(timer.current); if (active.current) { setRecording(false); setStarting(false); } }
  async function begin() {
    const version = ++attempt.current;
    setStarting(true); setError('');
    try {
      const { data } = await api.post('/v1/product/replay-consent', { consent: true });
      if (!active.current || version !== attempt.current) return;
      const started = await startDashboardReplay(data.data);
      if (!active.current || version !== attempt.current) return;
      setRecording(started); setPermission(false);
      if (started) timer.current = setTimeout(stop, 5 * 60000);
    } catch (failure) { if (active.current && version === attempt.current) setError(apiMessage(failure, failure.message || 'Recording could not start.')); }
    finally { if (active.current && version === attempt.current) setStarting(false); }
  }
  async function submit() {
    const version = lifecycle.current;
    setSending(true); setError('');
    try { await api.post('/v1/product/feedback', { score }); if (active.current && version === lifecycle.current) setAnswered(true); }
    catch (failure) { if (active.current && version === lifecycle.current) setError(apiMessage(failure, 'Your feedback could not be sent. Please retry.')); }
    finally { if (active.current && version === lifecycle.current) setSending(false); }
  }
  if (!runtime?.feedback && !runtime?.replay && runtime?.guidance?.variant !== 'guided') return null;
  return <motion.section className="v-dashboard-research ph-no-capture" aria-label="Dashboard help and feedback" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
    {runtime.guidance?.variant === 'guided' && <article><p className="v-tools-eyebrow">BEFORE YOU SEND THE LINK</p><h2>A quick<br />final check.</h2><p>Open the client preview on your phone.</p><p>Check the cover photograph, your studio details and the captions.</p><p>Confirm the download settings, then publish and share the client link.</p></article>}
    {runtime.feedback && <article><p className="v-tools-eyebrow">A QUICK CHECK-IN</p><h3>How easy is this dashboard to use?</h3>{answered ? <p role="status">Thank you. Your feedback has been sent.</p> : <><fieldset disabled={sending}><legend className="v-tools-sr">Choose a score from 1 to 5</legend><div className="v-tools-scores">{[1, 2, 3, 4, 5].map(value => <label key={value}><input type="radio" name="dashboard-score" value={value} checked={score === value} onChange={() => setScore(value)} /><span>{value}</span></label>)}</div></fieldset><div className="v-tools-score-labels"><span>Difficult</span><span>Very easy</span></div><button type="button" disabled={!score || sending} onClick={submit}>{sending ? 'Sending…' : 'Send feedback'}<ArrowRight size={16} /></button></>}<Link className="v-tools-quiet" to="/contact"><MessageCircle size={16} />Need a reply? Message our support team.</Link></article>}
    {runtime.replay && <article><p className="v-tools-eyebrow">HELP US FIND A PROBLEM</p><h3><CircleHelp size={19} />Share what happened</h3><p>With your permission, we can record the dashboard layout and clicks for up to five minutes. Text, photographs and form entries are hidden. Recording stops when you leave this page or switch tabs.</p>{recording ? <button type="button" onClick={stop}><CircleStop size={17} />Stop recording</button> : permission ? <div className="v-tools-actions"><button type="button" onClick={begin} disabled={starting}><Play size={16} />{starting ? 'Starting…' : 'Allow and start'}</button><button type="button" onClick={() => { stop(); setPermission(false); }}><X size={16} />Cancel</button></div> : <button type="button" onClick={() => setPermission(true)}>Share a dashboard recording<ArrowRight size={16} /></button>}<p role="status" className="v-tools-status">{recording ? 'Recording this dashboard. You can stop at any time.' : 'Recording is off.'}</p></article>}
    {error && <p role="alert" className="v-tools-error">{error}</p>}
  </motion.section>;
}
