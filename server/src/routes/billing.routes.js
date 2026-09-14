import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { cancelSubscription, getBillingStatus, getManageLink, getPlans, resumeSubscription, startCheckout, verifyCheckout } from '../controllers/billing.controller.js';
import { billingActionLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.get('/plans', getPlans);
router.use(authMiddleware);
router.get('/status', getBillingStatus);
router.post('/checkout', billingActionLimit, startCheckout);
router.post('/verify/:reference', billingActionLimit, verifyCheckout);
router.post('/cancel', billingActionLimit, cancelSubscription);
router.post('/resume', billingActionLimit, resumeSubscription);
router.post('/manage-link', billingActionLimit, getManageLink);

export default router;
