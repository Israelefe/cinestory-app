import express from 'express';
import jwt from 'jsonwebtoken';
import {
  getOperationsOverview,
  getAdminAnalytics,
  getAllUsers,
  getAccountDetail,
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
  getAllStories,
  getAllDeliveries,
  getPayments,
  adminDeleteStory,
  refundPayment
} from '../controllers/admin.controller.js';
import { adminLogin, getAdminMe, adminLogout } from '../controllers/adminAuth.controller.js';
import AdminUser from '../models/AdminUser.js';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { authAttemptLimit, billingActionLimit } from '../middleware/rateLimit.middleware.js';

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
        decoded = jwt.verify(token, secret);
      } catch (err) {
        return res.status(401).json({ success: false, message: 'Your admin session has expired. Please sign in again.' });
      }

      const admin = await AdminUser.findById(decoded.id);
      if (admin && admin.accountStatus === 'active') {
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

// Public auth routes
router.post('/auth/login', authAttemptLimit, adminLogin);
router.post('/auth/logout', adminLogout);

// Protected routes
router.use(adminAuthMiddleware);
router.get('/auth/me', getAdminMe);
router.get('/operations', getOperationsOverview);
router.get('/analytics', getAdminAnalytics);
router.get('/users', getAllUsers);
router.patch('/users/:id/plan', updateUserPlan);
router.get('/users/:id', getAccountDetail);
router.patch('/users/:id/status', updateAccountStatus);
router.post('/users/:id/force-logout', forceLogoutAccount);
router.post('/users/:id/notes', addAccountNote);
router.delete('/users/:id/notes/:noteId', deleteAccountNote);
router.get('/users/:id/export', exportAccountData);
router.post('/users/:id/support-access', createSupportAccess);
router.post('/support-access/exchange', exchangeSupportAccess);
router.get('/deletion-requests', getDeletionRequests);
router.patch('/deletion-requests/:requestId', updateDeletionRequest);
router.get('/stories', getAllStories);
router.get('/deliveries', getAllDeliveries);
router.get('/deliveries/:id', getAdminDeliveryDetail);
router.post('/deliveries/:id/publish', adminPublishDelivery);
router.post('/deliveries/:id/archive', adminArchiveDelivery);
router.post('/deliveries/:id/restore', adminRestoreDelivery);
router.post('/deliveries/:id/revoke-link', adminRevokeDeliveryLink);
router.delete('/deliveries/:id', adminDeleteDelivery);
router.post('/deliveries/:id/jobs/:jobId/retry', adminRetryDeliveryJob);
router.get('/ai/jobs', getAiJobs);
router.post('/ai/jobs/:jobId/retry', adminRetryAiJob);
router.post('/ai/jobs/:jobId/cancel', adminCancelAiJob);
router.get('/client-access', getClientAccessOverview);
router.get('/volume', getVolumeJobs);
router.get('/volume/:id', getVolumeJobDetail);
router.post('/volume/:id/publish', adminPublishVolumeJob);
router.post('/volume/:id/archive', adminArchiveVolumeJob);
router.post('/volume/:id/restore', adminRestoreVolumeJob);
router.delete('/volume/:id', adminDeleteVolumeJob);
router.get('/storage', getStorageOverview);
router.post('/storage/scan', scanStorageReferences);
router.get('/music-narration', getMusicNarrationOverview);
router.get('/payments', getPayments);
router.delete('/stories/:id', adminDeleteStory);
router.post('/payments/:id/refund', billingActionLimit, refundPayment);

export default router;
