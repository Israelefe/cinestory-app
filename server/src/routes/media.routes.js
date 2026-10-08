import express from 'express';
import { mediaOffloadEnabled, verifyMediaWorkerToken } from '../services/cloudflareMedia.service.js';
import { authorizedMediaClaims } from '../services/mediaAuthorization.service.js';

const router = express.Router();
// Service signatures authorize this route. Browser sessions and CSRF cookies
// are deliberately not used for Cloudflare's small permission checks.
router.post('/authorize', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!mediaOffloadEnabled()) return res.status(503).end();
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const claims = verifyMediaWorkerToken(token);
    if (!claims?.access) return res.status(403).end();
    return res.status(await authorizedMediaClaims(claims, req.body?.files) ? 204 : 403).end();
  } catch { return res.status(503).end(); }
});
export default router;
