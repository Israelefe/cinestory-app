import express from 'express';
import { deleteAccount, forgotPassword, getMe, googleLogin, login, logout, logoutAll, refreshSession, register, resendVerification, resetPassword, verifyEmail, verifyPasswordResetCode } from '../controllers/auth.controller.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { authAttemptLimit, emailCodeLimit, registrationLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post('/register', registrationLimit, register);
router.post('/verify-email', authAttemptLimit, verifyEmail);
router.post('/resend-verification', emailCodeLimit, resendVerification);
router.post('/login', authAttemptLimit, login);
router.post('/google', authAttemptLimit, googleLogin);
router.post('/refresh', authAttemptLimit, refreshSession);
router.post('/logout', logout);
router.post('/logout-all', authMiddleware, logoutAll);
router.get('/me', authMiddleware, getMe);
router.delete('/account', authMiddleware, deleteAccount);
router.post('/password/forgot', emailCodeLimit, forgotPassword);
router.post('/password/verify-code', authAttemptLimit, verifyPasswordResetCode);
router.post('/password/reset', authAttemptLimit, resetPassword);

export { authMiddleware, optionalAuthMiddleware };
export default router;
