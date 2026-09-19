import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { emailCodeLimit, publicAccessLimit, publicMediaLimit } from '../middleware/rateLimit.middleware.js';
import { addVolumeSubjects, assignVolumePhotos, autoAssignVolumePhotos, createVolumeJob, getVolumeGallery, getVolumeJob, listVolumeJobs, publishVolumeJob, requestVolumeCode, verifyVolumeCode } from '../controllers/volume.controller.js';

const router = express.Router();

router.post('/public/:publicId/request-code', publicAccessLimit, emailCodeLimit, requestVolumeCode);
router.post('/public/:publicId/verify-code', publicAccessLimit, verifyVolumeCode);
router.get('/public/:publicId/gallery', publicMediaLimit, getVolumeGallery);

router.use(authMiddleware);
router.get('/', listVolumeJobs);
router.post('/', createVolumeJob);
router.get('/:id', getVolumeJob);
router.post('/:id/subjects', addVolumeSubjects);
router.post('/:id/auto-assign', autoAssignVolumePhotos);
router.put('/:id/subjects/:subjectId/assets', assignVolumePhotos);
router.post('/:id/publish', publishVolumeJob);

export default router;
