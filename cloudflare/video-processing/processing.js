export const CREDIT_MS = 90_000;
const POLL_MS = 30_000;
const HARD_SLOTS = 4;
const required = ['MONGODB_URI', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'VIDEO_PLAYBACK_SECRET', 'VIDEO_PLAYBACK_WORKER_URL', 'VIDEO_PROCESSING_SECRET'];
const forwarded = [...required, 'VIDEO_PROCESSING_MODE', 'VIDEO_MEDIA_WORKER_ENABLED', 'VIDEO_DELIVERY_ENABLED', 'VIDEO_DELIVERY_PUBLIC', 'VIDEO_DELIVERY_QUALIFIED', 'VIDEO_BETA_USER_IDS', 'VIDEO_AI_MODEL_READY', 'CLOUDFLARE_AI_ACCOUNT_ID', 'CLOUDFLARE_AI_API_TOKEN', 'CLOUDFLARE_STREAM_ACCOUNT_ID', 'CLOUDFLARE_STREAM_API_TOKEN', 'CLIENT_URL'];
export const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export function integer(value, fallback, max) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) throw new Error('Invalid processing limit.');
  return number;
}
export function processingLimits(env) {
  return { slots: integer(env.VIDEO_MAX_CONTAINERS, 1, HARD_SLOTS), dailySeconds: integer(env.VIDEO_DAILY_CONTAINER_SECONDS, 21600, 86400 * HARD_SLOTS), jobSeconds: integer(env.VIDEO_MAX_JOB_SECONDS, 21600, 43200) };
}
export function containerEnvironment(env) {
  if (required.some(key => typeof env[key] !== 'string' || !env[key].trim()) || env.VIDEO_PROCESSING_SECRET.length < 32 || env.VIDEO_PLAYBACK_SECRET.length < 32) throw new Error('Missing private processing configuration.');
  // Never serialize Worker bindings or unrelated account secrets into Linux.
  return { ...Object.fromEntries(forwarded.filter(key => typeof env[key] === 'string').map(key => [key, env[key]])), NODE_ENV: 'production' };
}
export async function authorized(request, secret) {
  const value = request.headers.get('Authorization') || '';
  if (typeof secret !== 'string' || secret.length < 32 || value.length > 512) return false;
  const digest = input => crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const [a, b] = await Promise.all([digest(value), digest('Bearer ' + secret)]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
export function apiOrigin(env) {
  const url = new URL(env.VEYLO_API_ORIGIN);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid API origin.');
  return url.origin;
}
export async function apiRequest(env, path, body = {}, timeout = 10_000) {
  // Workers support manual/follow redirects. Reject 3xx below without sending
  // the processing secret to a different origin.
  const response = await fetch(apiOrigin(env) + '/api/v1/videos/processing/' + path, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: { Authorization: 'Bearer ' + env.VIDEO_PROCESSING_SECRET, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) { await response.body?.cancel(); throw new Error('Video API unavailable.'); }
  const value = await response.json();
  if (!value.success) throw new Error('Video API unavailable.');
  return value.data;
}
const coordinator = env => env.VIDEO_COORDINATOR.get(env.VIDEO_COORDINATOR.idFromName('coordinator'));
const internal = async (env, path, body) => {
  const response = await coordinator(env).fetch('https://internal/' + path, { method: 'POST', body: JSON.stringify(body || {}) });
  if (!response.ok) throw new Error('Coordinator unavailable.');
  return response.json();
};

// Reserve elapsed container time in advance, including startup/idle time. An
// uncertain/crashed interval stays charged. This is an admission allowance,
// not an estimate of Cloudflare CPU billing or a cap on the account invoice.
export function reserveCredit(ledger, { slot, run, now, dailySeconds }) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (!ledger || ledger.day !== day) ledger = { day, reservedSeconds: 0, grants: {} };
  const prior = ledger.grants[slot];
  const until = now + CREDIT_MS;
  const start = prior?.run === run ? Math.max(now, prior.until) : now;
  const charge = Math.max(0, Math.ceil((until - start) / 1000));
  if (ledger.reservedSeconds + charge > dailySeconds) return { ledger, allowed: false, remainingSeconds: Math.max(0, dailySeconds - ledger.reservedSeconds) };
  ledger.reservedSeconds += charge;
  ledger.grants[slot] = { run, until };
  return { ledger, allowed: true, until, remainingSeconds: dailySeconds - ledger.reservedSeconds };
}

export function processingClasses(DurableObject) {
  class Coordinator extends DurableObject {
    async snapshot() {
      const limits = processingLimits(this.env);
      const ledger = await this.ctx.storage.get('ledger');
      const reservedSeconds = ledger?.day === new Date().toISOString().slice(0, 10) ? ledger.reservedSeconds : 0;
      const verifiedAt = await this.ctx.storage.get('verifiedAt') || 0;
      return { verifiedAt, reservedSeconds, remainingSeconds: Math.max(0, limits.dailySeconds - reservedSeconds) };
    }
    async dispatch() {
      containerEnvironment(this.env); // Fail before starting any paid work.
      const limits = processingLimits(this.env);
      const snapshot = await this.snapshot();
      const state = await apiRequest(this.env, 'status', snapshot);
      if (!Number.isInteger(state?.pending) || !Number.isInteger(state?.concurrency)) throw new Error('Invalid queue response.');
      if (state.diagnostics) console.info('[video-processing] Queue status ' + JSON.stringify({ pending: state.pending, cleanupOnly: state.cleanupOnly, ...state.diagnostics }));
      const activeLimit = Math.min(limits.slots, state.concurrency);
      const needsProbe = snapshot.verifiedAt < Date.now() - 23 * 3600_000;
      // Stable slot IDs give a hard application-wide limit, including retries.
      const slots = Array.from({ length: HARD_SLOTS }, (_, slot) => this.env.VIDEO_ENCODERS.get(this.env.VIDEO_ENCODERS.idFromName('slot-' + slot)));
      const responses = await Promise.all(slots.map(stub => stub.fetch('https://internal/state').then(value => value.json())));
      const active = responses.filter(value => value.running).length;
      const desired = Math.min(activeLimit, active + state.pending + (needsProbe ? 1 : 0));
      await Promise.all(slots.map((stub, slot) => stub.fetch('https://internal/tick', { method: 'POST', body: JSON.stringify({ slot, start: slot < desired, workPending: state.pending > 0, enabled: slot < activeLimit }) })));
      const maintenanceAt = await this.ctx.storage.get('maintenanceAt') || 0;
      if (Date.now() - maintenanceAt > 600_000) {
        // Maintenance failure retries on the next minute; no busy-wait loop.
        try { await apiRequest(this.env, 'maintenance', {}, 25_000); await this.ctx.storage.put('maintenanceAt', Date.now()); } catch { console.warn('[video-processing] Maintenance will retry.'); }
      }
      return this.snapshot();
    }
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (request.method !== 'POST') return json({ error: 'Not found.' }, 404);
      if (path === '/credit') {
        const body = await request.json();
        const limits = processingLimits(this.env);
        if (!Number.isInteger(body.slot) || body.slot < 0 || body.slot >= limits.slots || !/^[a-f\d-]{36}$/.test(body.run)) return json({ allowed: false });
        return this.ctx.storage.transaction(async storage => {
          const result = reserveCredit(await storage.get('ledger'), { ...body, now: Date.now(), dailySeconds: limits.dailySeconds });
          await storage.put('ledger', result.ledger);
          return json({ allowed: result.allowed, until: result.until, remainingSeconds: result.remainingSeconds });
        });
      }
      if (path === '/verified') {
        await this.ctx.storage.put('verifiedAt', Date.now());
        // The API heartbeat must be visible before the first job checks access.
        await apiRequest(this.env, 'status', await this.snapshot());
        return json({ success: true });
      }
      if (path === '/dispatch') {
        // Do not hold a DO concurrency block while slots request credits back.
        if (!this.dispatching) this.dispatching = this.dispatch().finally(() => { this.dispatching = null; });
        return json(await this.dispatching);
      }
      return json({ error: 'Not found.' }, 404);
    }
  }

  class Encoder extends DurableObject {
    constructor(ctx, env) {
      super(ctx, env);
      if (ctx.container?.running) ctx.blockConcurrencyWhile(async () => { await ctx.container.setInactivityTimeout(120_000); await ctx.storage.setAlarm(Date.now() + POLL_MS); });
    }
    async control(path, body) {
      const response = await this.ctx.container.getTcpPort(8080).fetch('http://container/' + path, { method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(3000), headers: { Authorization: 'Bearer ' + this.env.VIDEO_PROCESSING_SECRET, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Encoder unavailable.'); }
      return response.json();
    }
    async stop({ failed = false } = {}) {
      // Destroy the whole VM, including all FFmpeg child processes.
      if (this.ctx.container.running) await this.ctx.container.destroy();
      await this.ctx.storage.delete('run');
      await this.ctx.storage.deleteAlarm();
      if (failed) {
        const failures = Math.min(6, (await this.ctx.storage.get('failures') || 0) + 1);
        await this.ctx.storage.put('failures', failures);
        await this.ctx.storage.put('nextStartAt', Date.now() + Math.min(1800_000, 30_000 * 2 ** failures));
      }
    }
    async tick({ start = false, slot, enabled = true, workPending = false } = {}) {
      this.operation = 'configuration';
      const container = this.ctx.container;
      if (!enabled) { await this.stop(); return; }
      let run = await this.ctx.storage.get('run');
      let credit;
      if (!container.running) {
        if (!start) { await this.ctx.storage.deleteAlarm(); return; }
        if ((await this.ctx.storage.get('nextStartAt') || 0) > Date.now()) return;
        run = { id: crypto.randomUUID(), slot, startedAt: Date.now(), launched: false };
        credit = await internal(this.env, 'credit', { slot, run: run.id });
        if (!credit.allowed) return;
        await this.ctx.storage.put('run', run);
        // Store a recovery alarm before startup; startup is asynchronous.
        await this.ctx.storage.setAlarm(Date.now() + POLL_MS);
        this.operation = 'container-start';
        container.start({ enableInternet: true, env: containerEnvironment(this.env) });
        this.operation = 'container-inactivity-timeout';
        await container.setInactivityTimeout(120_000);
        this.operation = 'container-monitor';
        this.ctx.waitUntil(container.monitor().catch(() => console.warn('[video-processing] Encoder stopped; queued work will recover.')));
      }
      if (!run || Date.now() - run.startedAt > processingLimits(this.env).jobSeconds * 1000) { await this.stop(); return; }
      credit ||= await internal(this.env, 'credit', { slot: run.slot, run: run.id });
      if (!credit.allowed) { await this.stop(); return; }
      await this.ctx.storage.setAlarm(Date.now() + POLL_MS);
      await container.setInactivityTimeout(120_000);
      try {
        this.operation = 'encoder-status';
        const status = await this.control('status');
        console.info('[video-processing] Encoder status ' + JSON.stringify({ ready: status.ready === true, busy: status.busy === true, lastWorked: status.lastWorked === true ? true : status.lastWorked === false ? false : null, qualityVersion: Number.isSafeInteger(status.qualityVersion) ? status.qualityVersion : 0 }));
        if (!status.ready) throw new Error('Encoder not ready.');
        this.operation = 'encoder-lease';
        await this.control('lease', { until: credit.until });
        if (!run.launched) {
          this.operation = 'readiness-proof';
          await internal(this.env, 'verified');
          await this.ctx.storage.delete('failures');
          await this.ctx.storage.delete('nextStartAt');
          this.operation = 'encoder-run';
          await this.control('run', {});
          run.launched = true;
          await this.ctx.storage.put('run', run);
        } else if (!status.busy && workPending) {
          // A new upload can arrive after the previous pump emptied its queue.
          // Reuse the warm encoder instead of stopping it and waiting for cron.
          this.operation = 'encoder-run';
          await this.control('run', {});
        } else if (!status.busy) await this.stop();
      } catch {
        // Log only a fixed operation label, never provider errors or credentials.
        console.warn('[video-processing] Encoder is unavailable at ' + this.operation + '.');
        // Mongo/index/FFmpeg startup gets a bounded grace period. Never extend
        // it indefinitely or keep a failed paid instance alive.
        if (run.launched || Date.now() - run.startedAt > 120_000) await this.stop({ failed: true });
      }
    }
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === '/state' && request.method === 'GET') return json({ running: this.ctx.container.running });
      if (path !== '/tick' || request.method !== 'POST') return json({ error: 'Not found.' }, 404);
      const body = await request.json();
      // Alarm/request interleaving must not start or stop the same slot twice.
      await this.ctx.blockConcurrencyWhile(() => this.tick(body).catch(async () => { console.warn('[video-processing] Encoder failed at ' + this.operation + '.'); await this.stop({ failed: true }); }));
      return json({ success: true });
    }
    async alarm() {
      await this.ctx.blockConcurrencyWhile(() => this.tick().catch(async () => { console.warn('[video-processing] Encoder failed at ' + this.operation + '.'); await this.stop({ failed: true }); }));
    }
  }
  return { Coordinator, Encoder };
}

export async function handleProcessing(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/health' && request.method === 'GET') return json({ service: 'veylo-video-processing' });
  if (path !== '/dispatch' || request.method !== 'POST') return json({ error: 'Not found.' }, 404);
  if (!await authorized(request, env.VIDEO_PROCESSING_SECRET)) return json({ error: 'Unauthorised.' }, 401);
  // Caller-supplied job data is deliberately discarded.
  try { return await coordinator(env).fetch('https://internal/dispatch', { method: 'POST' }); }
  catch { return json({ error: 'Video preparation is unavailable.' }, 503); }
}
export async function scheduledProcessing(env) {
  const response = await coordinator(env).fetch('https://internal/dispatch', { method: 'POST' });
  if (!response.ok) throw new Error('Video dispatch failed.');
}
