import express from 'express';
import { collectClientAnalytics, recordPresence } from '../controllers/analytics.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { clientAnalyticsLimit, presenceLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post('/presence', presenceLimit, clientAnalyticsLimit, optionalAuthMiddleware, recordPresence);
router.post('/events', clientAnalyticsLimit, optionalAuthMiddleware, collectClientAnalytics);

export default router;
