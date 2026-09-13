import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { completeOnboarding, getOnboarding, updateOnboarding, uploadStudioLogo } from '../controllers/onboarding.controller.js';

const router = express.Router();
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

router.use(authMiddleware);
router.get('/', getOnboarding);
router.patch('/', updateOnboarding);
router.post('/complete', completeOnboarding);
router.post('/logo', logoUpload.single('logo'), uploadStudioLogo);

export default router;
