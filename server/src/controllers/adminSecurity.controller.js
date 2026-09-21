import crypto from 'crypto';
import { z } from 'zod';
import mongoose from 'mongoose';
import AdminUser from '../models/AdminUser.js';
import AdminSession from '../models/AdminSession.js';
import AdminLoginAttempt from '../models/AdminLoginAttempt.js';
import AdminAudit from '../models/AdminAudit.js';
import { getRuntimeConfig } from '../services/runtimeConfig.service.js';
import { encryptAdminSecret, createTotpSecret, decryptAdminSecret, totpUri, verifyTotp, requestDeviceLabel, requestIp, requestUserAgent } from '../utils/adminSecurity.js';

const ADMIN_ROLES = ['superadmin', 'operations', 'finance', 'support', 'analyst', 'read-only'];
const ADMIN_STATUSES = ['active', 'suspended'];

function validId(value) {
  return mongoose.isValidObjectId(value) ? value : null;
}

function snapshotAdmin(admin) {
  return { id: String(admin._id), username: admin.username, name: admin.name, role: admin.role, accountStatus: admin.accountStatus, twoFactorEnabled: Boolean(admin.twoFactorEnabled), lastLoginAt: admin.lastLoginAt || null };
}

function publicAdmin(admin) {
  return { ...snapshotAdmin(admin), createdAt: admin.createdAt, updatedAt: admin.updatedAt };
}

async function audit(req, action, resourceType, resourceId, details = {}, before, after) {
  try {
    await AdminAudit.create({ adminId: req.admin._id, action, resourceType, resourceId, details, before, after, ipAddress: requestIp(req), userAgent: requestUserAgent(req) });
  } catch (error) {
    console.error('[admin/security-audit]', error.message);
  }
}

export async function getSecurityOverview(req, res) {
  try {
    const [admins, sessions, loginAttempts, audits, runtime] = await Promise.all([
      AdminUser.find({}).sort({ createdAt: 1 }).lean(),
      AdminSession.find({ expiresAt: { $gt: new Date() }, revokedAt: null }).sort({ lastSeenAt: -1 }).limit(200).populate('adminId', 'name username role').lean(),
      AdminLoginAttempt.find({}).sort({ createdAt: -1 }).limit(150).populate('adminId', 'name username role').lean(),
      AdminAudit.find({}).sort({ createdAt: -1 }).limit(250).lean(),
      getRuntimeConfig({ fresh: true })
    ]);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentAttempts = loginAttempts.filter(item => new Date(item.createdAt) >= since);
    const safeSessions = sessions.map(session => ({ id: session._id, admin: session.adminId ? { id: session.adminId._id, name: session.adminId.name, username: session.adminId.username, role: session.adminId.role } : null, deviceLabel: session.deviceLabel || 'Unknown browser', ipAddress: session.ipAddress || '', userAgent: session.userAgent || '', twoFactorVerified: Boolean(session.twoFactorVerified), createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt }));
    const safeAttempts = loginAttempts.map(item => ({ id: item._id, admin: item.adminId ? { id: item.adminId._id, name: item.adminId.name, username: item.adminId.username, role: item.adminId.role } : null, username: item.username, success: item.success, reason: item.reason, ipAddress: item.ipAddress || '', userAgent: item.userAgent || '', twoFactorRequired: Boolean(item.twoFactorRequired), twoFactorVerified: Boolean(item.twoFactorVerified), createdAt: item.createdAt }));
    const safeAudits = audits.map(item => ({ id: item._id, adminId: item.adminId, action: item.action, resourceType: item.resourceType, resourceId: item.resourceId, details: item.details || {}, before: item.before || null, after: item.after || null, ipAddress: item.ipAddress || '', userAgent: item.userAgent || '', previousHash: item.previousHash || null, eventHash: item.eventHash, createdAt: item.createdAt }));
    const chronologicalAudits = [...audits].reverse();
    const brokenAuditLinks = chronologicalAudits.reduce((count, item, index) => {
      if (index === 0) return count + (item.previousHash ? 1 : 0);
      return count + (item.previousHash && item.previousHash !== chronologicalAudits[index - 1].eventHash ? 1 : 0);
    }, 0);
    return res.json({ success: true, data: {
      generatedAt: new Date(),
      admins: admins.map(publicAdmin),
      sessions: safeSessions,
      loginAttempts: safeAttempts,
      audit: safeAudits,
      summary: {
        adminCount: admins.length,
        activeAdminCount: admins.filter(item => item.accountStatus === 'active').length,
        twoFactorEnabled: admins.filter(item => item.twoFactorEnabled).length,
        activeSessions: safeSessions.length,
        failedLogins24h: recentAttempts.filter(item => !item.success).length,
        successfulLogins24h: recentAttempts.filter(item => item.success).length,
        auditEvents: audits.length,
        hashedAuditEvents: audits.filter(item => item.eventHash).length,
        brokenAuditLinks
      },
      providers: runtime.providers,
      secretStatus: {
        jwt: Boolean(process.env.JWT_SECRET),
        otp: Boolean(process.env.OTP_SECRET),
        cloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
        paystack: Boolean(process.env.PAYSTACK_SECRET_KEY),
        deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
        email: Boolean(process.env.RESEND_API_KEY)
      }
    } });
  } catch (error) {
    console.error('[admin/security-overview]', error.message);
    return res.status(500).json({ success: false, message: 'We could not load the security workspace.' });
  }
}

export async function setupAdminTwoFactor(req, res) {
  try {
    const admin = await AdminUser.findById(req.admin._id).select('+twoFactorSecretEncrypted +twoFactorPendingSecretEncrypted');
    if (!admin) return res.status(403).json({ success: false, message: 'Only a managed administrator can set up two-factor authentication.' });
    if (admin.twoFactorEnabled) {
      let currentSecret = '';
      try { currentSecret = decryptAdminSecret(admin.twoFactorSecretEncrypted); } catch { currentSecret = ''; }
      if (!verifyTotp(currentSecret, req.body?.currentCode)) return res.status(400).json({ success: false, message: 'Enter your current authenticator code before replacing two-factor authentication.' });
    }
    const secret = createTotpSecret();
    admin.twoFactorPendingSecretEncrypted = encryptAdminSecret(secret);
    await admin.save();
    await audit(req, 'admin.2fa.setup_started', 'AdminUser', String(admin._id), { deviceLabel: requestDeviceLabel(req) }, snapshotAdmin(admin));
    return res.json({ success: true, data: { secret, otpauthUri: totpUri(secret, admin.username), username: admin.username, issuer: 'Veylo' }, message: 'Add this account to your authenticator app, then enter the six-digit code to finish.' });
  } catch (error) {
    console.error('[admin/2fa-setup]', error.message);
    return res.status(500).json({ success: false, message: 'We could not start two-factor setup.' });
  }
}

export async function enableAdminTwoFactor(req, res) {
  try {
    const admin = await AdminUser.findById(req.admin._id).select('+twoFactorPendingSecretEncrypted');
    if (!admin || !admin.twoFactorPendingSecretEncrypted) return res.status(400).json({ success: false, message: 'Start two-factor setup first.' });
    const secret = decryptAdminSecret(admin.twoFactorPendingSecretEncrypted);
    if (!verifyTotp(secret, req.body?.code)) return res.status(400).json({ success: false, message: 'That code is not valid. Check your authenticator clock and try again.' });
    const before = snapshotAdmin(admin);
    admin.twoFactorSecretEncrypted = admin.twoFactorPendingSecretEncrypted;
    admin.twoFactorPendingSecretEncrypted = undefined;
    admin.twoFactorEnabled = true;
    await admin.save();
    await audit(req, 'admin.2fa.enabled', 'AdminUser', String(admin._id), {}, before, snapshotAdmin(admin));
    return res.json({ success: true, data: { enabled: true }, message: 'Two-factor authentication is now required for your next sign-in.' });
  } catch (error) {
    console.error('[admin/2fa-enable]', error.message);
    return res.status(500).json({ success: false, message: 'We could not enable two-factor authentication.' });
  }
}

export async function disableAdminTwoFactor(req, res) {
  try {
    const admin = await AdminUser.findById(req.params.id || req.admin._id).select('+twoFactorSecretEncrypted');
    if (!admin) return res.status(404).json({ success: false, message: 'Administrator not found.' });
    if (admin.twoFactorEnabled) {
      let secret = '';
      try { secret = decryptAdminSecret(admin.twoFactorSecretEncrypted); } catch { secret = ''; }
      if (!verifyTotp(secret, req.body?.code)) return res.status(400).json({ success: false, message: 'A valid current authenticator code is required to remove two-factor authentication.' });
    }
    const before = snapshotAdmin(admin);
    admin.twoFactorEnabled = false;
    admin.twoFactorSecretEncrypted = undefined;
    admin.twoFactorPendingSecretEncrypted = undefined;
    await admin.save();
    await audit(req, 'admin.2fa.disabled', 'AdminUser', String(admin._id), { targetAdminId: String(admin._id) }, before, snapshotAdmin(admin));
    return res.json({ success: true, data: { enabled: false }, message: 'Two-factor authentication has been removed.' });
  } catch (error) {
    console.error('[admin/2fa-disable]', error.message);
    return res.status(500).json({ success: false, message: 'We could not remove two-factor authentication.' });
  }
}

const createAdminSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Use 3–40 letters, numbers, periods, hyphens, or underscores.'),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(12).max(200),
  role: z.enum(ADMIN_ROLES).default('support')
});

export async function createAdminUser(req, res) {
  try {
    const parsed = createAdminSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Administrator details are not valid.' });
    const existing = await AdminUser.exists({ username: parsed.data.username });
    if (existing) return res.status(409).json({ success: false, message: 'That administrator username is already in use.' });
    const admin = await AdminUser.create({ ...parsed.data, accountStatus: 'active' });
    await audit(req, 'admin.account.created', 'AdminUser', String(admin._id), { role: admin.role }, null, snapshotAdmin(admin));
    return res.status(201).json({ success: true, data: { admin: publicAdmin(admin) }, message: 'Administrator account created.' });
  } catch (error) {
    console.error('[admin/admin-create]', error.message);
    return res.status(500).json({ success: false, message: 'We could not create that administrator account.' });
  }
}

const updateAdminSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: z.enum(ADMIN_ROLES).optional(),
  accountStatus: z.enum(ADMIN_STATUSES).optional(),
  password: z.string().min(12).max(200).optional()
}).strict();

export async function updateAdminUser(req, res) {
  try {
    const targetId = validId(req.params.id);
    if (!targetId) return res.status(400).json({ success: false, message: 'That administrator id is not valid.' });
    if (String(targetId) === String(req.admin._id) && (req.body?.role || req.body?.accountStatus === 'suspended')) return res.status(400).json({ success: false, message: 'You cannot remove your own administrator access.' });
    const parsed = updateAdminSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'That administrator change is not valid.' });
    const admin = await AdminUser.findById(targetId).select('+password');
    if (!admin) return res.status(404).json({ success: false, message: 'Administrator not found.' });
    const before = snapshotAdmin(admin);
    Object.assign(admin, parsed.data);
    await admin.save();
    let revokedSessions = 0;
    if (parsed.data.accountStatus === 'suspended') {
      const result = await AdminSession.updateMany({ adminId: admin._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
      revokedSessions = result.modifiedCount || 0;
    }
    await audit(req, 'admin.account.updated', 'AdminUser', String(admin._id), { revokedSessions }, before, snapshotAdmin(admin));
    return res.json({ success: true, data: { admin: publicAdmin(admin), revokedSessions }, message: 'Administrator account updated.' });
  } catch (error) {
    console.error('[admin/admin-update]', error.message);
    return res.status(500).json({ success: false, message: 'We could not update that administrator account.' });
  }
}

export async function forceLogoutAdmin(req, res) {
  try {
    const targetId = validId(req.params.id);
    if (!targetId) return res.status(400).json({ success: false, message: 'That administrator id is not valid.' });
    const result = await AdminSession.updateMany({ adminId: targetId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await audit(req, 'admin.sessions.revoked', 'AdminUser', String(targetId), { revokedSessions: result.modifiedCount || 0, reason: String(req.body?.reason || 'Revoked by administrator').slice(0, 240) });
    return res.json({ success: true, data: { revokedSessions: result.modifiedCount || 0 }, message: 'The administrator sessions have been signed out.' });
  } catch (error) {
    console.error('[admin/force-logout]', error.message);
    return res.status(500).json({ success: false, message: 'We could not sign out those administrator sessions.' });
  }
}

export async function exportAdminAudit(req, res) {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 5000;
    const limit = Math.min(10000, Math.max(1, requestedLimit));
    const audits = await AdminAudit.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    await audit(req, 'admin.audit.exported', 'AdminAudit', 'export', { count: audits.length, format: req.query.format === 'csv' ? 'csv' : 'json' });
    if (req.query.format === 'csv') {
      const columns = ['createdAt', 'adminId', 'action', 'resourceType', 'resourceId', 'ipAddress', 'eventHash', 'previousHash', 'details', 'before', 'after'];
      const csv = [columns.join(','), ...audits.map(item => columns.map(column => JSON.stringify(column === 'details' || column === 'before' || column === 'after' ? item[column] || null : item[column] || '')).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="veylo-admin-audit.csv"');
      return res.send(csv);
    }
    return res.json({ success: true, data: { exportedAt: new Date(), count: audits.length, records: audits.map(item => ({ ...item, userAgent: undefined })) } });
  } catch (error) {
    console.error('[admin/audit-export]', error.message);
    return res.status(500).json({ success: false, message: 'We could not export the administrator audit log.' });
  }
}
