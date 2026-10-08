import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { completeOnboarding, confirmStudioLogoUpload, getOnboarding, getPublicStudioAvatar, getPublicStudioLogo, signStudioLogoUpload, updateOnboarding, uploadStudioLogo } from '../controllers/onboarding.controller.js';
import { mediaOffloadEnabled } from '../services/cloudflareMedia.service.js';
import { mediaSignatureLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

router.get('/public-logo/:userId', getPublicStudioLogo);
router.get('/public-avatar/:userId', getPublicStudioAvatar);
router.use(authMiddleware);
router.get('/', getOnboarding);
router.patch('/', updateOnboarding);
router.post('/complete', completeOnboarding);
router.post('/logo/sign', mediaSignatureLimit, signStudioLogoUpload);
router.post('/logo/confirm', mediaSignatureLimit, confirmStudioLogoUpload);
router.post('/logo', (req, res, next) => mediaOffloadEnabled() ? res.status(409).json({ success: false, message: 'Refresh this page to continue uploading your profile image.' }) : logoUpload.single('logo')(req, res, next), uploadStudioLogo);

export default router;
