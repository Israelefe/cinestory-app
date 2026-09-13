import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Session from '../models/Session.js';

export const ACCESS_COOKIE = 'veylo_access';
export const REFRESH_COOKIE = 'veylo_refresh';
export const CSRF_COOKIE = 'veylo_csrf';

function requiredSecret(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function normalizeEmail(value = '') { return value.trim().toLowerCase(); }
export function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
export function tokenDigest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
export function codeDigest(email, purpose, code) {
  return crypto.createHmac('sha256', requiredSecret('OTP_SECRET')).update(`${normalizeEmail(email)}:${purpose}:${code}`).digest('hex');
}
export function safeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
export function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, emailVerified: Boolean(user.emailVerifiedAt), providers: user.providers || [], role: user.role, plan: user.plan, avatar: user.avatar || user.studio?.logoUrl || '', studio: user.studio || {}, acquisition: user.acquisition || {}, onboardingStep: user.onboardingStep || 1, onboardingComplete: Boolean(user.onboardingCompletedAt) };
}
function cookieBase() {
  return { secure: process.env.NODE_ENV === 'production', sameSite: process.env.COOKIE_SAME_SITE || 'lax', domain: process.env.COOKIE_DOMAIN || undefined };
}
export async function createSession(user, req, res, { remember = true } = {}) {
  if (!user?.emailVerifiedAt || user.accountStatus !== 'active') throw new Error('A verified, active account is required to create a session.');
  const refreshToken = randomToken(48);
  const csrfToken = randomToken(32);
  const sessionLifetime = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + sessionLifetime);
  const session = await Session.create({ userId: user._id, refreshTokenDigest: tokenDigest(refreshToken), csrfTokenDigest: tokenDigest(csrfToken), userAgent: String(req.get('user-agent') || '').slice(0, 500), ipAddress: String(req.ip || '').slice(0, 100), persistent: remember, expiresAt });
  setSessionCookies(user, session, refreshToken, csrfToken, res, { remember });
  return session;
}
export function setSessionCookies(user, session, refreshToken, csrfToken, res, { remember = true } = {}) {
  const accessToken = jwt.sign({ id: String(user._id), email: user.email, role: user.role, sid: String(session._id) }, requiredSecret('JWT_SECRET'), { expiresIn: '15m', issuer: 'veylo-api', audience: 'veylo-web' });
  const base = cookieBase();
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, httpOnly: true, maxAge: 15 * 60 * 1000, path: '/' });
  const persistent = remember ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {};
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base, ...persistent, httpOnly: true, path: '/api/v1/auth' });
  res.cookie(CSRF_COOKIE, csrfToken, { ...base, ...persistent, httpOnly: false, path: '/' });
}
export function clearSessionCookies(res) {
  const base = cookieBase();
  res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, httpOnly: true, path: '/api/v1/auth' });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false, path: '/' });
}
export function verifyAccessToken(token) { return jwt.verify(token, requiredSecret('JWT_SECRET'), { issuer: 'veylo-api', audience: 'veylo-web' }); }
