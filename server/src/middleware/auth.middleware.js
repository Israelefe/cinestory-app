import Session from '../models/Session.js';
import User from '../models/User.js';
import { ACCESS_COOKIE, CSRF_COOKIE, safeEqual, tokenDigest, verifyAccessToken } from '../utils/auth.js';

async function authenticate(req) {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const token = req.cookies?.[ACCESS_COOKIE] || bearer;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  const session = await Session.findOne({ _id: payload.sid, userId: payload.id, revokedAt: null, expiresAt: { $gt: new Date() } }).select('+csrfTokenDigest');
  if (!session) return null;
  const user = await User.findById(payload.id).select('_id email role accountStatus emailVerifiedAt onboardingCompletedAt');
  if (!user || user.accountStatus !== 'active') return null;
  return { payload, session, user };
}

function csrfIsValid(req, session) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get('x-csrf-token');
  return cookieToken && headerToken && safeEqual(tokenDigest(cookieToken), session.csrfTokenDigest) && safeEqual(cookieToken, headerToken);
}

export async function authMiddleware(req, res, next) {
  try {
    const authenticated = await authenticate(req);
    if (!authenticated) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' });
    if (!authenticated.user.emailVerifiedAt) return res.status(403).json({ success: false, code: 'EMAIL_NOT_VERIFIED', email: authenticated.user.email, message: 'Verify your email address before continuing.' });
    if (!csrfIsValid(req, authenticated.session)) return res.status(403).json({ success: false, code: 'CSRF_INVALID', message: 'Please refresh the page and try again.' });
    req.user = { ...authenticated.payload, emailVerified: true, onboardingComplete: Boolean(authenticated.user.onboardingCompletedAt) };
    req.authSession = authenticated.session;
    next();
  } catch {
    res.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' });
  }
}

export async function optionalAuthMiddleware(req, res, next) {
  try {
    const authenticated = await authenticate(req);
    if (authenticated?.user.emailVerifiedAt) {
      if (!csrfIsValid(req, authenticated.session)) return res.status(403).json({ success: false, code: 'CSRF_INVALID', message: 'Please refresh the page and try again.' });
      req.user = { ...authenticated.payload, emailVerified: true, onboardingComplete: Boolean(authenticated.user.onboardingCompletedAt) };
      req.authSession = authenticated.session;
    }
  } catch {
    // An invalid optional session is treated as signed out.
  }
  next();
}
