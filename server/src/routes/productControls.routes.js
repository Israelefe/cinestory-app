import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getProductRuntime, acknowledgeExposure, submitProductFeedback, consentToDashboardReplay } from '../controllers/productControls.controller.js';

const router = Router();
router.use(authMiddleware);
router.use(rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: req => String(req.user.id) }));
router.get('/runtime', getProductRuntime);
router.post('/exposure', acknowledgeExposure);
router.post('/feedback', submitProductFeedback);
router.post('/replay-consent', consentToDashboardReplay);
export default router;
