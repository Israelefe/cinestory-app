import { advanceMonitor, probe } from '../../server/src/utils/uptimeMonitor.js';

const TARGETS = ['api', 'website'];
const MINUTE = 60000;

function origin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Configure ${name} as a public HTTPS origin.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || url.pathname !== '/' || url.port ||
      !url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname) || url.hostname.startsWith('[')) {
    throw new Error(`Configure ${name} as a public HTTPS origin.`);
  }
  return url.origin;
}

export function monitorConfig(env) {
  for (const key of ['OPS_MONITOR_API_URL', 'OPS_MONITOR_WEBSITE_URL', 'OPS_MONITOR_SECRET', 'OPS_ALERT_EMAIL', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL']) {
    if (typeof env[key] !== 'string' || !env[key].trim()) throw new Error(`Configure ${key} before enabling uptime monitoring.`);
  }
  if (env.OPS_MONITOR_SECRET.length < 32 || /[\r\n]/.test(env.OPS_MONITOR_SECRET)) throw new Error('OPS_MONITOR_SECRET needs at least 32 characters without line breaks.');
  const recipient = env.OPS_ALERT_EMAIL.trim().toLowerCase();
  if (recipient.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)) throw new Error('Configure OPS_ALERT_EMAIL as one email address.');
  if (env.RESEND_FROM_EMAIL.length > 320 || /[\r\n]/.test(env.RESEND_FROM_EMAIL)) throw new Error('Configure RESEND_FROM_EMAIL as your verified sender.');
  return { api: origin(env.OPS_MONITOR_API_URL, 'OPS_MONITOR_API_URL'), website: origin(env.OPS_MONITOR_WEBSITE_URL, 'OPS_MONITOR_WEBSITE_URL'), recipient,
    secret: env.OPS_MONITOR_SECRET, emailKey: env.RESEND_API_KEY, sender: env.RESEND_FROM_EMAIL.trim() };
}

// A single Durable Object invokes this runner. Only bounded counters and pending
// notification metadata are stored; credentials and fetched pages are never stored.
export class MonitorRunner {
  constructor(storage, env, { fetcher = (input, options) => fetch(input, options), now = Date.now, uuid = () => crypto.randomUUID(), log = value => console.info(JSON.stringify(value)) } = {}) {
    this.storage = storage; this.env = env; this.fetcher = fetcher; this.now = now; this.uuid = uuid; this.log = log;
    this.running = false;
  }

  async run(scheduledAt = this.now()) {
    if (this.running) return { skipped: true };
    this.running = true;
    try {
      const config = monitorConfig(this.env);
      const slot = Math.floor(scheduledAt / MINUTE);
      if (!Number.isSafeInteger(slot) || Math.abs(this.now() - scheduledAt) > 90000) return { skipped: true };
      let record = await this.storage.get('monitor');
      const identity = JSON.stringify([config.api, config.website, config.recipient, config.sender]);
      if (!record || record.identity !== identity) record = { identity, lastSlot: -1, targets: {} };
      if (slot <= record.lastSlot) return { skipped: true };
      if (slot - record.lastSlot > 3) {
        for (const state of Object.values(record.targets)) { state.failures = 0; state.successes = 0; }
      }

      const checks = await Promise.all(TARGETS.map(async name => {
        const observation = await probe(name === 'api' ? `${config.api}/ready` : config.website, this.fetcher);
        const state = advanceMonitor(record.targets[name], observation.healthy);
        const checkedAt = new Date(this.now()).toISOString();
        if (state.transition === 'outage') {
          state.notified = false;
          state.pending = { id: this.uuid(), type: 'outage', checkedAt };
        } else if (state.transition === 'recovery') {
          // An outage rejected by the provider should not arrive after recovery.
          state.pending = state.notified ? { id: this.uuid(), type: 'recovery', checkedAt } : null;
        }
        delete state.transition;
        record.targets[name] = state;
        this.log({ event: 'monitor.check', target: name, ...observation, failures: state.failures, checkedAt });
        return { name, ...observation, checkedAt, failures: state.failures };
      }));
      record.lastSlot = slot;
      // Persist transition and idempotency key before contacting the provider.
      await this.storage.put('monitor', record);

      await Promise.all(TARGETS.map(async name => {
        const state = record.targets[name], pending = state.pending;
        if (!pending) return;
        // Resend only retains idempotency keys for 24 hours. Do not risk resending
        // an ambiguous accepted notification after that window has expired.
        if (this.now() - Date.parse(pending.checkedAt) >= 23 * 60 * MINUTE) {
          this.log({ event: 'monitor.notification.expired', target: name });
          return;
        }
        let response;
        try {
          response = await this.fetcher('https://api.resend.com/emails', { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
            headers: { Authorization: `Bearer ${config.emailKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `veylo-monitor:${name}:${pending.id}` },
            body: JSON.stringify({ from: config.sender, to: [config.recipient], subject: `Veylo ${name}: ${pending.type === 'outage' ? 'unavailable' : 'recovered'}`,
              text: `The independent monitor ${pending.type === 'outage' ? 'failed three consecutive checks' : 'passed two consecutive checks'} for the Veylo ${name}. Checked at ${pending.checkedAt}. Open your hosting dashboard and the Veylo admin to investigate.` }) });
          if (!response.ok) throw new Error('ALERT_REJECTED');
          state.notified = pending.type === 'outage';
          state.pending = null;
          this.log({ event: 'monitor.notification.accepted', target: name, type: pending.type });
        } catch { this.log({ event: 'monitor.notification.failed', target: name }); }
        finally { await response?.body?.cancel().catch(() => {}); }
      }));
      await this.storage.put('monitor', record);

      let response, reported = false;
      try {
        response = await this.fetcher(`${config.api}/api/v1/admin/monitoring/check-in`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
          headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ checks }) });
        reported = response.ok;
      } catch { /* Direct outage email does not depend on this check-in. */ }
      finally { await response?.body?.cancel().catch(() => {}); }
      if (!reported) this.log({ event: 'monitor.check-in.failed' });
      return { checks, reported };
    } finally { this.running = false; }
  }
}
