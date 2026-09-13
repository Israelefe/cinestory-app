import express from 'express';
import { getAdminAnalytics, getAllUsers, updateUserPlan, getAllStories, adminDeleteStory } from '../controllers/admin.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import User from '../models/User.js';

const router = express.Router();

async function adminOnly(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('role accountStatus');
    if (!user || user.role !== 'admin' || user.accountStatus !== 'active') return res.status(403).json({ success: false, message: 'You do not have access to this area.' });
    req.admin = user;
    next();
  } catch (error) {
    console.error('[admin/auth]', error.message);
    res.status(500).json({ success: false, message: 'We could not verify administrator access.' });
  }
}

router.use(authMiddleware, adminOnly);
router.get('/analytics', getAdminAnalytics);
router.get('/users', getAllUsers);
router.patch('/users/:id/plan', updateUserPlan);
router.get('/stories', getAllStories);
router.delete('/stories/:id', adminDeleteStory);

export default router;
