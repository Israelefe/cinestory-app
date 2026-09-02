import express from 'express';
import { register, login, getMe } from '../controllers/auth.controller.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/, '');
  if (!token) return res.status(401).json({ success: false, message: 'Authorization required.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, getMe);

export default router;
