import jwt from 'jsonwebtoken';
import AdminUser from '../models/AdminUser.js';
import AdminSession from '../models/AdminSession.js';
import AdminLoginAttempt from '../models/AdminLoginAttempt.js';
import AdminAudit from '../models/AdminAudit.js';
import { randomToken, tokenDigest } from '../utils/auth.js';
import { requestDeviceLabel, requestIp, requestUserAgent, decryptAdminSecret, verifyTotp } from '../utils/adminSecurity.js';

function adminSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured.');
  return process.env.JWT_SECRET;
}

function publicAdmin(admin) {
  return {
    id: admin._id,
    username: admin.username,
    name: admin.name,
    role: admin.role,
    accountStatus: admin.accountStatus,
    twoFactorEnabled: Boolean(admin.twoFactorEnabled),
    lastLoginAt: admin.lastLoginAt
  };
}

async function recordLoginAttempt({ admin, username, success, reason, req, twoFactorRequired = false, twoFactorVerified = false }) {
  try {
    await AdminLoginAttempt.create({
      adminId: admin?._id,
      username: String(username || admin?.username || '').trim().toLowerCase().slice(0, 80),
      success: Boolean(success),
      reason,
      ipAddress: requestIp(req),
      userAgent: requestUserAgent(req),
      twoFactorRequired,
      twoFactorVerified
    });
  } catch (error) {
    console.error('[admin/login-attempt]', error.message);
  }
}

async function recordAdminAudit({ adminId, action, resourceType, resourceId, details, req }) {
  if (!adminId) return;
  try {
    await AdminAudit.create({
      adminId,
      action,
      resourceType,
      resourceId,
      details,
      ipAddress: requestIp(req),
      userAgent: requestUserAgent(req)
    });
  } catch (error) {
    console.error('[admin/audit]', error.message);
  }
}

export async function adminLogin(req, res) {
  const { username, password, twoFactorCode } = req.body || {};
  const normalized = String(username || '').trim().toLowerCase();
  try {
    if (!normalized || !password) {
      await recordLoginAttempt({ username: normalized, success: false, reason: 'missing_credentials', req });
      return res.status(400).json({ success: false, message: 'Please enter both your username and password.' });
    }

    let admin = await AdminUser.findOne({ username: normalized }).select('+password +twoFactorSecretEncrypted');
    const envUsername = String(process.env.ADMIN_USERNAME || process.env.ADMIN_INITIAL_USERNAME || '').trim().toLowerCase();
    const envPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD;

    // Environment credentials provision the first superadmin, but never bypass
    // the account's 2FA requirement once it has been enabled.
    if (envUsername && envPassword && normalized === envUsername && password === envPassword) {
      if (!admin) {
        admin = new AdminUser({ username: normalized, name: process.env.ADMIN_NAME || 'Veylo Administrator', password: envPassword, role: 'superadmin', accountStatus: 'active' });
        await admin.save();
        console.info(`[admin] Created admin "${normalized}" from environment credentials on login.`);
      } else {
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
          admin.password = envPassword;
          admin.accountStatus = 'active';
          await admin.save();
          console.info(`[admin] Updated admin password for "${normalized}" to match environment credentials.`);
        }
      }
    }

    if (!admin || admin.accountStatus !== 'active') {
      await recordLoginAttempt({ admin, username: normalized, success: false, reason: 'invalid_account', req });
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      await recordLoginAttempt({ admin, username: normalized, success: false, reason: 'invalid_password', req });
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    let twoFactorVerified = false;
    if (admin.twoFactorEnabled) {
      if (!twoFactorCode) {
        await recordLoginAttempt({ admin, username: normalized, success: false, reason: 'two_factor_required', req, twoFactorRequired: true });
        return res.status(401).json({ success: false, code: 'ADMIN_2FA_REQUIRED', message: 'Enter the six-digit code from your authenticator app.' });
      }
      let secret = '';
      try { secret = decryptAdminSecret(admin.twoFactorSecretEncrypted); } catch { secret = ''; }
      if (!verifyTotp(secret, twoFactorCode)) {
        await recordLoginAttempt({ admin, username: normalized, success: false, reason: 'invalid_two_factor', req, twoFactorRequired: true });
        return res.status(401).json({ success: false, code: 'ADMIN_2FA_INVALID', message: 'That authenticator code is not valid. Try the current code again.' });
      }
      twoFactorVerified = true;
    }

    const session = new AdminSession({
      adminId: admin._id,
      tokenDigest: tokenDigest(randomToken(32)),
      userAgent: requestUserAgent(req),
      ipAddress: requestIp(req),
      deviceLabel: requestDeviceLabel(req),
      twoFactorVerified,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    });
    const token = jwt.sign({ id: String(admin._id), username: admin.username, role: admin.role, type: 'admin', sid: String(session._id) }, adminSecret(), { expiresIn: '14d', issuer: 'veylo-api', audience: 'veylo-admin' });
    session.tokenDigest = tokenDigest(token);
    admin.lastLoginAt = new Date();
    await Promise.all([admin.save(), session.save()]);
    await recordLoginAttempt({ admin, username: normalized, success: true, reason: 'login', req, twoFactorRequired: Boolean(admin.twoFactorEnabled), twoFactorVerified });
    await recordAdminAudit({ adminId: admin._id, action: 'admin.login.succeeded', resourceType: 'AdminSession', resourceId: String(session._id), details: { role: admin.role, twoFactorVerified, deviceLabel: session.deviceLabel }, req });

    res.cookie('veylo_admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    return res.json({ success: true, token, admin: publicAdmin(admin) });
  } catch (error) {
    console.error('[admin/login]', error.message);
    return res.status(500).json({ success: false, message: 'Unable to sign in. Please try again.' });
  }
}

export async function getAdminMe(req, res) {
  try {
    return res.json({ success: true, admin: publicAdmin(req.admin) });
  } catch (error) {
    console.error('[admin/me]', error.message);
    return res.status(500).json({ success: false, message: 'Could not load admin profile.' });
  }
}

export async function adminLogout(req, res) {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : req.cookies?.veylo_admin_token;
    if (token) {
      try {
        const decoded = jwt.verify(token, adminSecret(), { issuer: 'veylo-api', audience: 'veylo-admin' });
        if (decoded.sid) await AdminSession.updateOne({ _id: decoded.sid, tokenDigest: tokenDigest(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
        await recordAdminAudit({ adminId: decoded.id, action: 'admin.logout', resourceType: 'AdminSession', resourceId: decoded.sid, details: {}, req });
      } catch (error) {
        if (error.name !== 'TokenExpiredError' && error.name !== 'JsonWebTokenError') console.error('[admin/logout-session]', error.message);
      }
    }
    res.clearCookie('veylo_admin_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', path: '/' });
    return res.json({ success: true, message: 'Signed out successfully.' });
  } catch (error) {
    console.error('[admin/logout]', error.message);
    return res.status(500).json({ success: false, message: 'Error signing out.' });
  }
}
