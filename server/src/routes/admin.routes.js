import express from 'express';
import {
  getAdminAnalytics,
  getAllUsers,
  updateUserPlan,
  getAllStories,
  adminDeleteStory
} from '../controllers/admin.controller.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

export async function adminOnly(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/, '');
  if (!token) return res.status(401).json({ success: false, message: 'Admin token required.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied: SuperAdmin privileges required.' });
    }
    req.admin = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid admin token.' });
  }
}

router.get('/analytics', adminOnly, getAdminAnalytics);
router.get('/users', adminOnly, getAllUsers);
router.patch('/users/:id/plan', adminOnly, updateUserPlan);
router.get('/stories', adminOnly, getAllStories);
router.delete('/stories/:id', adminOnly, adminDeleteStory);

export default router;
