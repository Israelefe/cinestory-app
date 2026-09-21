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
  reconcileFinanceWithPaystack,
  exportFinance,
  adminDeleteStory,
  refundPayment
} from '../controllers/admin.controller.js';
import { adminLogin, getAdminMe, adminLogout } from '../controllers/adminAuth.controller.js';
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
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { authAttemptLimit, billingActionLimit } from '../middleware/rateLimit.middleware.js';
import { tokenDigest } from '../utils/auth.js';
import { getProductAnalytics } from '../controllers/adminAnalytics.controller.js';

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
      if (admin && admin.accountStatus === 'active') {
        if (!decoded.sid) return res.status(401).json({ success: false, message: 'Your administrator session needs to be renewed. Please sign in again.' });
        const session = await AdminSession.findOne({ _id: decoded.sid, adminId: admin._id, tokenDigest: tokenDigest(token), revokedAt: null, expiresAt: { $gt: new Date() } }).select('+tokenDigest');
        if (!session) return res.status(401).json({ success: false, message: 'Your administrator session has been signed out. Please sign in again.' });
        req.adminSession = session;
        AdminSession.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
        req.admin = admin;
        return next();
      }
    }

    // Fallback: check photographer session with role === 'admin' for backward compatibility
    return authMiddleware(req, res, async () => {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }
      const user = await User.findById(req.user.id).select('role accountStatus name email');
      if (!user || user.role !== 'admin' || user.accountStatus !== 'active') {
        return res.status(403).json({ success: false, message: 'You do not have access to this area.' });
      }
      req.admin = user;
      next();
    });
  } catch (error) {
    console.error('[admin/auth]', error.message);
    res.status(500).json({ success: false, message: 'We could not verify administrator access.' });
  }
}

export function requireAdminRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles.flat());
  return (req, res, next) => {
    const role = req.admin?.role === 'admin' ? 'superadmin' : req.admin?.role;
    if (role && allowed.has(role)) return next();
    return res.status(403).json({ success: false, message: 'Your administrator role does not allow this action.' });
  };
}

// Public auth routes
router.post('/auth/login', authAttemptLimit, adminLogin);
router.post('/auth/logout', adminLogout);

// Protected routes
router.use(adminAuthMiddleware);
router.get('/auth/me', getAdminMe);
router.get('/operations', getOperationsOverview);
router.get('/analytics', getAdminAnalytics);
router.get('/product-analytics', requireAdminRoles('superadmin', 'operations', 'analyst', 'read-only'), getProductAnalytics);
router.get('/users', getAllUsers);
router.patch('/users/:id/plan', requireAdminRoles('superadmin', 'operations'), updateUserPlan);
router.get('/users/:id', getAccountDetail);
router.delete('/users/:id', requireAdminRoles('superadmin'), adminDeleteAccount);
router.patch('/users/:id/status', requireAdminRoles('superadmin', 'operations', 'support'), updateAccountStatus);
router.post('/users/:id/force-logout', requireAdminRoles('superadmin', 'operations', 'support'), forceLogoutAccount);
router.post('/users/:id/notes', requireAdminRoles('superadmin', 'operations', 'support'), addAccountNote);
router.delete('/users/:id/notes/:noteId', requireAdminRoles('superadmin', 'operations', 'support'), deleteAccountNote);
router.get('/users/:id/export', exportAccountData);
router.post('/users/:id/support-access', requireAdminRoles('superadmin', 'operations', 'support'), createSupportAccess);
router.post('/support-access/exchange', exchangeSupportAccess);
router.get('/deletion-requests', getDeletionRequests);
router.patch('/deletion-requests/:requestId', requireAdminRoles('superadmin', 'operations', 'support'), updateDeletionRequest);
router.get('/stories', getAllStories);
router.get('/deliveries', getAllDeliveries);
router.get('/deliveries/:id', getAdminDeliveryDetail);
router.post('/deliveries/:id/publish', requireAdminRoles('superadmin', 'operations'), adminPublishDelivery);
router.post('/deliveries/:id/archive', requireAdminRoles('superadmin', 'operations'), adminArchiveDelivery);
router.post('/deliveries/:id/restore', requireAdminRoles('superadmin', 'operations'), adminRestoreDelivery);
router.post('/deliveries/:id/revoke-link', requireAdminRoles('superadmin', 'operations'), adminRevokeDeliveryLink);
router.delete('/deliveries/:id', requireAdminRoles('superadmin', 'operations'), adminDeleteDelivery);
router.post('/deliveries/:id/jobs/:jobId/retry', requireAdminRoles('superadmin', 'operations'), adminRetryDeliveryJob);
router.get('/ai/jobs', getAiJobs);
router.post('/ai/jobs/:jobId/retry', requireAdminRoles('superadmin', 'operations'), adminRetryAiJob);
router.post('/ai/jobs/:jobId/cancel', requireAdminRoles('superadmin', 'operations'), adminCancelAiJob);
router.get('/client-access', getClientAccessOverview);
router.get('/volume', getVolumeJobs);
router.get('/volume/:id', getVolumeJobDetail);
router.post('/volume/:id/publish', requireAdminRoles('superadmin', 'operations'), adminPublishVolumeJob);
router.post('/volume/:id/archive', requireAdminRoles('superadmin', 'operations'), adminArchiveVolumeJob);
router.post('/volume/:id/restore', requireAdminRoles('superadmin', 'operations'), adminRestoreVolumeJob);
router.delete('/volume/:id', requireAdminRoles('superadmin', 'operations'), adminDeleteVolumeJob);
router.get('/storage', getStorageOverview);
router.post('/storage/scan', requireAdminRoles('superadmin', 'operations'), scanStorageReferences);
router.get('/music-narration', getMusicNarrationOverview);
router.get('/portfolios', getPortfolioOverview);
router.post('/portfolios/:id/unpublish', requireAdminRoles('superadmin', 'operations'), adminUnpublishPortfolio);
router.get('/support/tickets', getSupportOverview);
router.get('/support/tickets/:id', getSupportTicketDetail);
router.patch('/support/tickets/:id', requireAdminRoles('superadmin', 'operations', 'support'), updateSupportTicket);
router.post('/support/tickets/:id/moderate', requireAdminRoles('superadmin', 'operations', 'support'), moderateSupportTicket);
router.get('/configuration', getRuntimeConfiguration);
router.patch('/configuration', requireAdminRoles('superadmin'), updateRuntimeConfiguration);
router.get('/payments', getPayments);
router.get('/finance', getFinanceOverview);
router.get('/finance/reconcile', requireAdminRoles('superadmin', 'finance'), reconcileFinanceWithPaystack);
router.get('/finance/export', requireAdminRoles('superadmin', 'finance', 'analyst'), exportFinance);
router.delete('/stories/:id', requireAdminRoles('superadmin', 'operations'), adminDeleteStory);
router.post('/payments/:id/refund', billingActionLimit, requireAdminRoles('superadmin', 'finance'), refundPayment);

// Security centre. The audit trail and network history are intentionally
// restricted to superadmins; each managed admin can set up their own
// authenticator without seeing anyone else's secrets.
router.get('/security', requireAdminRoles('superadmin'), getSecurityOverview);
router.get('/security/audit/export', requireAdminRoles('superadmin'), exportAdminAudit);
router.post('/security/2fa/setup', setupAdminTwoFactor);
router.post('/security/2fa/enable', enableAdminTwoFactor);
router.post('/security/2fa/disable', requireAdminRoles('superadmin'), disableAdminTwoFactor);
router.post('/security/admins', requireAdminRoles('superadmin'), createAdminUser);
router.patch('/security/admins/:id', requireAdminRoles('superadmin'), updateAdminUser);
router.post('/security/admins/:id/force-logout', requireAdminRoles('superadmin'), forceLogoutAdmin);
router.post('/security/admins/:id/2fa/disable', requireAdminRoles('superadmin'), disableAdminTwoFactor);

export default router;
