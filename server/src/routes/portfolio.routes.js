import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { directMyPortfolio, getMyPortfolio, getPortfolioJob, getPortfolioSources, getPublicPortfolio, publishMyPortfolio, unpublishMyPortfolio, updateMyPortfolio } from '../controllers/portfolio.controller.js';
import { aiGenerationLimit } from '../middleware/rateLimit.middleware.js';
import { publicAccessLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();
router.get('/public/:handle', publicAccessLimit, getPublicPortfolio);
router.use(authMiddleware);
router.get('/mine', getMyPortfolio);
router.get('/sources', getPortfolioSources);
router.put('/mine', updateMyPortfolio);
router.post('/mine/publish', publishMyPortfolio);
router.post('/mine/unpublish', unpublishMyPortfolio);
router.post('/mine/direct', aiGenerationLimit, directMyPortfolio);
router.get('/mine/jobs/:jobId', getPortfolioJob);
export default router;
