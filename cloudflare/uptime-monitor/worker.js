import { DurableObject } from 'cloudflare:workers';
import { MonitorRunner } from './monitor.mjs';

export class UptimeMonitor extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.runner = new MonitorRunner(ctx.storage, env);
  }
  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/check') return new Response(null, { status: 404 });
    const result = await this.runner.run(Number(request.headers.get('X-Scheduled-At')));
    return Response.json(result);
  }
}

export default {
  // There is no public endpoint that can trigger checks or send email.
  fetch() { return new Response(null, { status: 404 }); },
  async scheduled(controller, env) {
    const monitor = env.UPTIME_MONITOR.get(env.UPTIME_MONITOR.idFromName('veylo'));
    const response = await monitor.fetch('https://monitor.internal/check', { method: 'POST', headers: { 'X-Scheduled-At': String(controller.scheduledTime) } });
    if (!response.ok) throw new Error('UPTIME_MONITOR_CHECK_FAILED');
    await response.body?.cancel();
  }
};
