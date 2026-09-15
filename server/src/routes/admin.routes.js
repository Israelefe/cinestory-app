import express from 'express';
import jwt from 'jsonwebtoken';
import {
  getAdminAnalytics,
  getAllUsers,
  updateUserPlan,
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
router.get('/analytics', getAdminAnalytics);
router.get('/users', getAllUsers);
router.patch('/users/:id/plan', updateUserPlan);
router.get('/stories', getAllStories);
router.get('/deliveries', getAllDeliveries);
router.get('/payments', getPayments);
router.delete('/stories/:id', adminDeleteStory);
router.post('/payments/:id/refund', billingActionLimit, refundPayment);

export default router;
