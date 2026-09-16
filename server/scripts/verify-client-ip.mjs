/**
 * Verifies `resolveEdgeClientIp` end to end against a real express app with
 * `trust proxy: 1`, the setting server.js uses.
 *
 * The socket address here (127.0.0.1) stands in for Render's load balancer, and
 * the X-Forwarded-For values stand in for what Render would set. Run with:
 *
 *   node scripts/verify-client-ip.mjs
 */
import express from 'express';

import { resolveEdgeClientIp } from '../src/middleware/clientIp.middleware.js';

const SECRET = 'test-edge-secret-value';
const VISITOR = '203.0.113.9';
const EDGE_EGRESS = '172.64.0.1';

const app = express();
app.set('trust proxy', 1);
app.use(resolveEdgeClientIp);
app.get('/probe', (req, res) => res.json({ ip: req.ip }));

const checks = [];
function check(name, actual, expected) {
  checks.push({ name, ok: actual === expected, detail: `got ${actual}, want ${expected}` });
}

const server = app.listen(0, async () => {
  const port = server.address().port;

  const probe = async headers => {
    const res = await fetch(`http://127.0.0.1:${port}/probe`, { headers });
    return (await res.json()).ip;
  };

  process.env.VEYLO_EDGE_KEY = SECRET;

  // 1. Through the edge. Without the middleware, `trust proxy: 1` would return
  //    the rightmost entry — Cloudflare's egress IP — which is the whole bug.
  check(
    'edge request resolves to the visitor',
    await probe({
      'x-forwarded-for': `${VISITOR}, ${EDGE_EGRESS}`,
      'x-veylo-edge-key': SECRET,
      'x-veylo-client-ip': VISITOR
    }),
    VISITOR
  );

  // 2. Spoofed entries ahead of the real one must not survive the rewrite.
  check(
    'spoofed leftmost entries are discarded',
    await probe({
      'x-forwarded-for': `9.9.9.9, ${VISITOR}, ${EDGE_EGRESS}`,
      'x-veylo-edge-key': SECRET,
      'x-veylo-client-ip': VISITOR
    }),
    VISITOR
  );

  // 3. A caller hitting Render directly must not be able to forge a bucket.
  check(
    'forged secret is ignored',
    await probe({
      'x-forwarded-for': '198.51.100.7',
      'x-veylo-edge-key': 'wrong-secret-value',
      'x-veylo-client-ip': '1.2.3.4'
    }),
    '198.51.100.7'
  );

  // 4. A missing secret is the same as a wrong one.
  check(
    'missing secret is ignored',
    await probe({ 'x-forwarded-for': '198.51.100.7', 'x-veylo-client-ip': '1.2.3.4' }),
    '198.51.100.7'
  );

  // 5. Direct traffic keeps working — Render's own X-Forwarded-For is already
  //    the true peer, so nothing changes for it.
  check('direct request keeps its own address', await probe({ 'x-forwarded-for': '198.51.100.7' }), '198.51.100.7');

  // 6. Junk in the claimed header must not be written into the chain.
  check(
    'non-IP claim is rejected',
    await probe({
      'x-forwarded-for': '198.51.100.7',
      'x-veylo-edge-key': SECRET,
      'x-veylo-client-ip': 'not-an-ip'
    }),
    '198.51.100.7'
  );

  // 7. Both IPv4 and IPv6 are accepted.
  check(
    'IPv6 claim is accepted',
    await probe({
      'x-forwarded-for': '198.51.100.7',
      'x-veylo-edge-key': SECRET,
      'x-veylo-client-ip': '2001:db8::1'
    }),
    '2001:db8::1'
  );

  // 8. With no secret configured the feature is inert, so the server can be
  //    deployed before the edge is configured.
  delete process.env.VEYLO_EDGE_KEY;
  check(
    'unconfigured secret leaves behaviour untouched',
    await probe({
      'x-forwarded-for': `${VISITOR}, ${EDGE_EGRESS}`,
      'x-veylo-edge-key': SECRET,
      'x-veylo-client-ip': VISITOR
    }),
    EDGE_EGRESS
  );

  const failed = checks.filter(item => !item.ok);
  for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.ok ? '' : ` — ${item.detail}`}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);

  server.close();
  process.exit(failed.length ? 1 : 0);
});