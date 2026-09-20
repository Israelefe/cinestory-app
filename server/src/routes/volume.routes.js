import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { emailCodeLimit, publicAccessLimit, publicMediaLimit } from '../middleware/rateLimit.middleware.js';
import { addVolumeSubjects, archiveVolumeJob, assignVolumePhotos, autoAssignVolumePhotos, createVolumeJob, deleteVolumeJob, deleteVolumeSubject, exportVolumeJob, getVolumeGallery, getVolumeJob, listVolumeJobs, publishVolumeJob, requestVolumeCode, updateVolumeJob, updateVolumeSubject, verifyVolumeCode } from '../controllers/volume.controller.js';

const router = express.Router();

router.post('/public/:publicId/request-code', publicAccessLimit, emailCodeLimit, requestVolumeCode);
router.post('/public/:publicId/verify-code', publicAccessLimit, verifyVolumeCode);
router.get('/public/:publicId/gallery', publicMediaLimit, getVolumeGallery);

router.use(authMiddleware);
router.get('/', listVolumeJobs);
router.post('/', createVolumeJob);
router.get('/:id', getVolumeJob);
router.patch('/:id', updateVolumeJob);
router.post('/:id/archive', archiveVolumeJob);
router.delete('/:id', deleteVolumeJob);
router.get('/:id/export.csv', exportVolumeJob);
router.post('/:id/subjects', addVolumeSubjects);
router.post('/:id/auto-assign', autoAssignVolumePhotos);
router.put('/:id/subjects/:subjectId/assets', assignVolumePhotos);
router.patch('/:id/subjects/:subjectId', updateVolumeSubject);
router.delete('/:id/subjects/:subjectId', deleteVolumeSubject);
router.post('/:id/publish', publishVolumeJob);

export default router;
