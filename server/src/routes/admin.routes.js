import { getSystemOverview, getOperationalIssues, updateOperationalIssue, acknowledgeOperationalAlert, monitorCheckIn } from '../controllers/adminOperations.controller.js';
import express from 'express';
import jwt from 'jsonwebtoken';
import {
  getOperationsOverview,
  getAdminAnalytics,
  getAllUsers,
  getAccountDetail,
  adminDeleteAccount,
  updateAccountStatus,
  forceLogoutAccount,
  addAccountNote,
  deleteAccountNote,
  exportAccountData,
  createSupportAccess,
  exchangeSupportAccess,
  getDeletionRequests,
  updateDeletionRequest,
  updateUserPlan,
  getAdminDeliveryDetail,
  adminPublishDelivery,
  adminArchiveDelivery,
  adminRestoreDelivery,
  adminRevokeDeliveryLink,
  adminDeleteDelivery,
  adminRetryDeliveryJob,
  getAiJobs,
  adminRetryAiJob,
  adminCancelAiJob,
  getClientAccessOverview,
  getVolumeJobs,
  getVolumeJobDetail,
  adminPublishVolumeJob,
  adminArchiveVolumeJob,
  adminRestoreVolumeJob,
  adminDeleteVolumeJob,
  getStorageOverview,
  scanStorageReferences,
  getMusicNarrationOverview,
  getPortfolioOverview,
  adminUnpublishPortfolio,
  getSupportOverview,
  getSupportTicketDetail,
  updateSupportTicket,
  moderateSupportTicket,
  getRuntimeConfiguration,
  updateRuntimeConfiguration,
  getAllStories,
  getAllDeliveries,
  getPayments,
  getFinanceOverview,
  getBillingHealth,
  resyncAccountBilling,
  verifyAccountPayment,
  refreshAccountBillingFromPaystack,
  reconcileFinanceWithPaystack,
  exportFinance,
  adminDeleteStory,
  refundPayment,
  getRefundReview
} from '../controllers/admin.controller.js';
import { adminLogin, getAdminMe, adminLogout, verifyAdminSessionMfa } from '../controllers/adminAuth.controller.js';
import {
  getSecurityOverview,
  setupAdminTwoFactor,
  enableAdminTwoFactor,
  disableAdminTwoFactor,
  createAdminUser,
  updateAdminUser,
  forceLogoutAdmin,
  exportAdminAudit
} from '../controllers/adminSecurity.controller.js';
import AdminUser from '../models/AdminUser.js';
import AdminSession from '../models/AdminSession.js';
import { ADMIN_READ_ACCESS, adminMfaRequired } from '../utils/adminAccess.js';
import { authAttemptLimit, billingActionLimit, monitorCheckInLimit } from '../middleware/rateLimit.middleware.js';
import { tokenDigest } from '../utils/auth.js';
import { getProductAnalytics, getVisitorTrafficAnalytics } from '../controllers/adminAnalytics.controller.js';

const router = express.Router();

export async function adminAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.cookies?.veylo_admin_token) {
      token = req.cookies.veylo_admin_token;
    }

    if (token) {
      const secret = process.env.JWT_SECRET;
      let decoded;
      try {
        decoded = jwt.verify(token, secret, { issuer: 'veylo-api', audience: 'veylo-admin' });
      } catch (err) {
        return res.status(401).json({ success: false, message: 'Your admin session has expired. Please sign in again.' });
      }

      const admin = await AdminUser.findById(decoded.id);
      if (admin && admin.accountStatus === 'active' && Object.values(ADMIN_READ_ACCESS).some(roles => roles.includes(admin.role))) {
        if (!decoded.sid) return res.status(401).json({ success: false, message: 'Your administrator session needs to be renewed. Please sign in again.' });
        const session = await AdminSession.findOne({ _id: decoded.sid, adminId: admin._id, tokenDigest: tokenDigest(token), revokedAt: null, expiresAt: { $gt: new Date() } }).select('+tokenDigest');
        if (session && Date.now() - new Date(session.createdAt).getTime() > 8 * 3600000) return res.status(401).json({ success: false, message: 'Your administrator session has expired. Please sign in again.' });
        if (!session) return res.status(401).json({ success: false, message: 'Your administrator session has been signed out. Please sign in again.' });
        // A cross-site form can send the cookie but cannot supply this session's bearer token.
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !authHeader?.startsWith('Bearer ')) return res.status(403).json({ success: false, code: 'CSRF_INVALID', message: 'Refresh your admin sign-in before changing records.' });
        req.adminSession = session;
        AdminSession.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
        req.admin = admin;
        const setupPaths = ['/auth/me', '/security/2fa/setup', '/security/2fa/enable', '/auth/verify-2fa'];
        if (adminMfaRequired() && (!admin.twoFactorEnabled || !session.twoFactorVerified) && !setupPaths.includes(req.path)) return res.status(403).json({ success: false, code: 'ADMIN_MFA_SETUP_REQUIRED', message: 'Finish authenticator verification before opening the admin.' });
        return next();
      }
    }

    return res.status(401).json({ success: false, message: 'Sign in with your administrator account.' });
  } catch (error) {
    console.error('[admin/auth]', error.message);
    res.status(500).json({ success: false, message: 'We could not verify administrator access.' });
  }
}

export function requireAdminRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles.flat());
  return (req, res, next) => {
    const role = req.admin?.role;
    if (role && allowed.has(role)) return next();
    return res.status(403).json({ success: false, message: 'Your administrator role does not allow this action.' });
  };
}

// Public auth routes
router.post('/monitoring/check-in', monitorCheckInLimit, monitorCheckIn);
router.post('/auth/login', authAttemptLimit, adminLogin);
router.post('/auth/logout', adminLogout);

// Protected routes
router.use(adminAuthMiddleware);
router.get('/auth/me', getAdminMe);
router.post('/auth/verify-2fa', authAttemptLimit, verifyAdminSessionMfa);
router.get('/system', requireAdminRoles(ADMIN_READ_ACCESS.operations), getSystemOverview);
router.get('/issues', requireAdminRoles(ADMIN_READ_ACCESS.operations), getOperationalIssues);
router.patch('/issues/:id', requireAdminRoles('superadmin', 'operations'), updateOperationalIssue);
router.post('/alerts/:id/acknowledge', requireAdminRoles('superadmin', 'operations'), acknowledgeOperationalAlert);
router.get('/operations', requireAdminRoles(ADMIN_READ_ACCESS.operations), getOperationsOverview);
router.get('/analytics', requireAdminRoles(ADMIN_READ_ACCESS.analytics), getAdminAnalytics);
router.get('/product-analytics', requireAdminRoles('superadmin', 'operations', 'analyst', 'read-only'), getProductAnalytics);
router.get('/visitor-traffic', requireAdminRoles('superadmin', 'operations', 'analyst', 'read-only'), getVisitorTrafficAnalytics);
router.get('/users', requireAdminRoles(ADMIN_READ_ACCESS.accounts), getAllUsers);
router.patch('/users/:id/plan', requireAdminRoles('superadmin', 'operations'), updateUserPlan);
router.get('/users/:id', requireAdminRoles(ADMIN_READ_ACCESS.accounts), getAccountDetail);
router.post('/users/:id/billing/resync', billingActionLimit, requireAdminRoles('superadmin', 'operations', 'finance'), resyncAccountBilling);
router.post('/users/:id/billing/verify-payment', billingActionLimit, requireAdminRoles('superadmin', 'operations', 'finance'), verifyAccountPayment);
router.post('/users/:id/billing/provider-refresh', billingActionLimit, requireAdminRoles('superadmin', 'finance'), refreshAccountBillingFromPaystack);
router.delete('/users/:id', requireAdminRoles('superadmin'), adminDeleteAccount);
router.patch('/users/:id/status', requireAdminRoles('superadmin', 'operations', 'support'), updateAccountStatus);
router.post('/users/:id/force-logout', requireAdminRoles('superadmin', 'operations', 'support'), forceLogoutAccount);
router.post('/users/:id/notes', requireAdminRoles('superadmin', 'operations', 'support'), addAccountNote);
router.delete('/users/:id/notes/:noteId', requireAdminRoles('superadmin', 'operations', 'support'), deleteAccountNote);
router.get('/users/:id/export', requireAdminRoles(ADMIN_READ_ACCESS.support), exportAccountData);
router.post('/users/:id/support-access', requireAdminRoles('superadmin', 'operations', 'support'), createSupportAccess);
router.post('/support-access/exchange', requireAdminRoles(ADMIN_READ_ACCESS.support), exchangeSupportAccess);
router.get('/deletion-requests', requireAdminRoles(ADMIN_READ_ACCESS.support), getDeletionRequests);
router.patch('/deletion-requests/:requestId', requireAdminRoles('superadmin', 'operations', 'support'), updateDeletionRequest);
router.get('/stories', requireAdminRoles(ADMIN_READ_ACCESS.deliveries), getAllStories);
router.get('/deliveries', requireAdminRoles(ADMIN_READ_ACCESS.deliveries), getAllDeliveries);
router.get('/deliveries/:id', requireAdminRoles(ADMIN_READ_ACCESS.deliveries), getAdminDeliveryDetail);
router.post('/deliveries/:id/publish', requireAdminRoles('superadmin', 'operations'), adminPublishDelivery);
router.post('/deliveries/:id/archive', requireAdminRoles('superadmin', 'operations'), adminArchiveDelivery);
router.post('/deliveries/:id/restore', requireAdminRoles('superadmin', 'operations'), adminRestoreDelivery);
router.post('/deliveries/:id/revoke-link', requireAdminRoles('superadmin', 'operations'), adminRevokeDeliveryLink);
router.delete('/deliveries/:id', requireAdminRoles('superadmin', 'operations'), adminDeleteDelivery);
router.post('/deliveries/:id/jobs/:jobId/retry', requireAdminRoles('superadmin', 'operations'), adminRetryDeliveryJob);
router.get('/ai/jobs', requireAdminRoles(ADMIN_READ_ACCESS.jobs), getAiJobs);
router.post('/ai/jobs/:jobId/retry', requireAdminRoles('superadmin', 'operations'), adminRetryAiJob);
router.post('/ai/jobs/:jobId/cancel', requireAdminRoles('superadmin', 'operations'), adminCancelAiJob);
router.get('/client-access', requireAdminRoles(ADMIN_READ_ACCESS.deliveries), getClientAccessOverview);
router.get('/volume', requireAdminRoles(ADMIN_READ_ACCESS.deliveries), getVolumeJobs);
router.get('/volume/:id', requireAdminRoles(ADMIN_READ_ACCESS.deliveries), getVolumeJobDetail);
router.post('/volume/:id/publish', requireAdminRoles('superadmin', 'operations'), adminPublishVolumeJob);
router.post('/volume/:id/archive', requireAdminRoles('superadmin', 'operations'), adminArchiveVolumeJob);
router.post('/volume/:id/restore', requireAdminRoles('superadmin', 'operations'), adminRestoreVolumeJob);
router.delete('/volume/:id', requireAdminRoles('superadmin', 'operations'), adminDeleteVolumeJob);
router.get('/storage', requireAdminRoles(ADMIN_READ_ACCESS.storage), getStorageOverview);
router.post('/storage/scan', requireAdminRoles('superadmin', 'operations'), scanStorageReferences);
router.get('/music-narration', requireAdminRoles(ADMIN_READ_ACCESS.storage), getMusicNarrationOverview);
router.get('/portfolios', requireAdminRoles(ADMIN_READ_ACCESS.deliveries), getPortfolioOverview);
router.post('/portfolios/:id/unpublish', requireAdminRoles('superadmin', 'operations'), adminUnpublishPortfolio);
router.get('/support/tickets', requireAdminRoles(ADMIN_READ_ACCESS.support), getSupportOverview);
router.get('/support/tickets/:id', requireAdminRoles(ADMIN_READ_ACCESS.support), getSupportTicketDetail);
router.patch('/support/tickets/:id', requireAdminRoles('superadmin', 'operations', 'support'), updateSupportTicket);
router.post('/support/tickets/:id/moderate', requireAdminRoles('superadmin', 'operations', 'support'), moderateSupportTicket);
router.get('/configuration', requireAdminRoles(ADMIN_READ_ACCESS.configuration), getRuntimeConfiguration);
router.patch('/configuration', requireAdminRoles('superadmin'), updateRuntimeConfiguration);
router.get('/payments', requireAdminRoles(ADMIN_READ_ACCESS.finance), getPayments);
router.get('/finance', requireAdminRoles(ADMIN_READ_ACCESS.finance), getFinanceOverview);
router.get('/billing/health', requireAdminRoles(ADMIN_READ_ACCESS.finance), getBillingHealth);
router.get('/finance/reconcile', requireAdminRoles('superadmin', 'finance'), reconcileFinanceWithPaystack);
router.get('/finance/export', requireAdminRoles('superadmin', 'finance'), exportFinance);
router.delete('/stories/:id', requireAdminRoles('superadmin', 'operations'), adminDeleteStory);
router.post('/payments/:id/refund', billingActionLimit, requireAdminRoles('superadmin', 'finance'), refundPayment);
router.get('/payments/:id/refund-review', requireAdminRoles('superadmin', 'finance'), getRefundReview);

// Security centre. The audit trail and network history are intentionally
// restricted to superadmins; each managed admin can set up their own
// authenticator without seeing anyone else's secrets.
router.get('/security', requireAdminRoles('superadmin'), getSecurityOverview);
router.get('/security/audit/export', requireAdminRoles('superadmin'), exportAdminAudit);
router.post('/security/2fa/setup', authAttemptLimit, setupAdminTwoFactor);
router.post('/security/2fa/enable', authAttemptLimit, enableAdminTwoFactor);
router.post('/security/2fa/disable', requireAdminRoles('superadmin'), disableAdminTwoFactor);
router.post('/security/admins', requireAdminRoles('superadmin'), createAdminUser);
router.patch('/security/admins/:id', requireAdminRoles('superadmin'), updateAdminUser);
router.post('/security/admins/:id/force-logout', requireAdminRoles('superadmin'), forceLogoutAdmin);
router.post('/security/admins/:id/2fa/disable', requireAdminRoles('superadmin'), disableAdminTwoFactor);

export default router;
