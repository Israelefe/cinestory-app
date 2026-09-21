import express from 'express';
import { collectClientAnalytics } from '../controllers/analytics.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { clientAnalyticsLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post('/events', clientAnalyticsLimit, optionalAuthMiddleware, collectClientAnalytics);

export default router;
