import http from 'node:http';
import { processingAuthorized } from './videoProcessingAuth.js';
import { VIDEO_QUALITY_VERSION } from './videoQuality.service.js';

// This HTTP server is reachable only through its owning Durable Object. It
// accepts no file paths, shell commands, user IDs or job payloads from callers.
export function createVideoContainerServer({ runJob, heartbeat, terminate, now = Date.now }) {
  let busy = false; let deadline = now() + 90_000; let stopping = false;
  let lastWorked = null;
  let heartbeatAt = 0;
  const pump = async () => {
    busy = true;
    try {
      while (!stopping && now() < deadline) {
        lastWorked = await runJob();
        if (!lastWorked) break;
      }
    } catch { lastWorked = false; }
    finally { busy = false; }
  };
  const server = http.createServer(async (req, res) => {
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (!processingAuthorized(req.headers.authorization)) { req.resume(); return reply(401, { error: 'Unauthorised.' }); }
    if (req.method === 'GET' && req.url === '/status') return reply(200, { ready: !stopping, busy, lastWorked, qualityVersion: VIDEO_QUALITY_VERSION });
    if (req.method === 'POST' && req.url === '/lease') {
      let raw = ''; let bytes = 0;
      try {
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 128) { reply(413, { error: 'Request too large.' }); return; } raw += chunk; }
        const value = JSON.parse(raw).until;
        if (!Number.isSafeInteger(value) || value <= now() || value > now() + 95_000 || stopping) return reply(400, { error: 'Invalid lease.' });
        deadline = value;
        return reply(200, { ready: true });
      } catch { return reply(400, { error: 'Invalid request.' }); }
    }
    req.resume();
    if (req.method === 'POST' && req.url === '/run' && !stopping && now() < deadline) {
      if (!busy) void pump();
      return reply(202, { busy: true });
    }
    return reply(404, { error: 'Not found.' });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  const watch = setInterval(() => {
    if (!stopping && now() >= deadline) { stopping = true; terminate(); }
    else if (!stopping && now() - heartbeatAt >= 30_000) { heartbeatAt = now(); void heartbeat({ status: busy ? 'busy' : 'idle', stage: 'cloudflare-encoder', details: { qualityVersion: VIDEO_QUALITY_VERSION } }).catch(() => {}); }
  }, 5000);
  watch.unref();
  server.on('close', () => { stopping = true; clearInterval(watch); });
  return server;
}
