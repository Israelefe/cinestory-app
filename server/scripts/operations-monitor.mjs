// Run on a separate host from the API. This process deliberately does not use MongoDB.
import { pathToFileURL } from 'node:url';
import { advanceMonitor, probe } from '../src/utils/uptimeMonitor.js';
export { advanceMonitor, probe } from '../src/utils/uptimeMonitor.js';
function trustedUrl(value, name) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error(`${name} must be an HTTPS URL without credentials or query parameters.`);
  return url;
}
async function start() {
  const required = ['OPS_MONITOR_API_URL', 'OPS_MONITOR_WEBSITE_URL', 'OPS_MONITOR_SECRET', 'OPS_ALERT_EMAIL', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Configure ${missing.join(', ')} before starting the independent monitor.`);
  if (process.env.OPS_MONITOR_SECRET.length < 32) throw new Error('OPS_MONITOR_SECRET needs at least 32 characters.');
  const api = trustedUrl(process.env.OPS_MONITOR_API_URL, 'OPS_MONITOR_API_URL');
  const website = trustedUrl(process.env.OPS_MONITOR_WEBSITE_URL, 'OPS_MONITOR_WEBSITE_URL');
  const urls = { api: new URL('/ready', api), website };
  const states = new Map();
  let stopped = false;
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { stopped = true; });
  while (!stopped) {
    const checks = await Promise.all(Object.entries(urls).map(async ([name, url]) => {
      const observation = await probe(url), previous = states.get(name) || {};
      const state = advanceMonitor(previous, observation.healthy);
      if (state.transition) state.pending = { type: state.transition, at: Date.now() };
      // Retry a rejected alert; send directly through the provider when the API or DB is down.
      if (state.pending) {
        try {
          const result = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(8000),
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `monitor:${name}:${state.pending.at}:${state.pending.type}` },
            body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [process.env.OPS_ALERT_EMAIL], subject: `Veylo ${name}: ${state.pending.type === 'outage' ? 'unavailable' : 'recovered'}`,
              text: `The independent monitor ${state.pending.type === 'outage' ? 'failed three consecutive checks' : 'passed two consecutive checks'} for the Veylo ${name}. Checked at ${new Date().toISOString()}. Open your hosting dashboard and the Veylo admin to investigate.` }) });
          if (!result.ok) throw new Error('ALERT_REJECTED');
          state.pending = null;
        } catch { console.error(JSON.stringify({ event: 'monitor.notification.failed', target: name, at: new Date() })); }
      }
      states.set(name, state);
      console.info(JSON.stringify({ event: 'monitor.check', target: name, ...observation, failures: state.failures, at: new Date() }));
      return { name, ...observation, checkedAt: new Date().toISOString(), failures: state.failures };
    }));
    try {
      const response = await fetch(new URL('/api/v1/admin/monitoring/check-in', api), { method: 'POST', signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${process.env.OPS_MONITOR_SECRET}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ checks }) });
      if (!response.ok) throw new Error('CHECK_IN_REJECTED');
    } catch { console.error(JSON.stringify({ event: 'monitor.check-in.failed', at: new Date() })); }
    if (!stopped) await new Promise(resolve => setTimeout(resolve, 30000));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start().catch(error => { console.error(error.message); process.exitCode = 1; });
