import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { aiGenerationLimit, clientDeliveryEmailLimit, mediaSignatureLimit, publicAccessLimit, publicMediaLimit } from '../middleware/rateLimit.middleware.js';
import { addLibraryAssets, confirmDeliveryUpload, confirmSoundtrackUpload, createDelivery, deleteDelivery, deleteDeliveryAsset, deleteSoundtrack, emailClientDelivery, getDelivery, getDeliveryJob, getDeliveryQr, getDeliveryShareMeta, getGalleryDownload, getPhotoDownload, getPublicDelivery, listDeliveries, publishDelivery, queueAnalysis, queueDirection, queueNarration, queueRevision, retryDeliveryJob, selectCuratedSoundtrack, signDeliveryUpload, signSoundtrackUpload, togglePhotoLike, unlockDelivery, updateDeliveryDetails, updateDeliveryReview } from '../controllers/delivery.controller.js';

const router = express.Router();

router.get('/public/:publicId', publicAccessLimit, getPublicDelivery);
router.get('/public/:publicId/share-meta', publicAccessLimit, getDeliveryShareMeta);
router.post('/public/:publicId/unlock', publicAccessLimit, unlockDelivery);
router.post('/public/:publicId/photos/:assetId/like', publicMediaLimit, togglePhotoLike);
router.get('/public/:publicId/photos/:assetId/download', publicMediaLimit, getPhotoDownload);
router.get('/public/:publicId/download-all', publicMediaLimit, getGalleryDownload);

router.use(authMiddleware);
router.get('/', listDeliveries);
router.post('/', createDelivery);
router.get('/:id', getDelivery);
router.patch('/:id/details', updateDeliveryDetails);
router.delete('/:id', deleteDelivery);
router.post('/:id/uploads/sign', mediaSignatureLimit, signDeliveryUpload);
router.post('/:id/uploads/confirm', confirmDeliveryUpload);
router.post('/:id/uploads/from-library', addLibraryAssets);
router.delete('/:id/assets/:assetId', deleteDeliveryAsset);
router.post('/:id/soundtrack/sign', mediaSignatureLimit, signSoundtrackUpload);
router.post('/:id/soundtrack/confirm', confirmSoundtrackUpload);
router.post('/:id/soundtrack/select', selectCuratedSoundtrack);
router.delete('/:id/soundtrack', deleteSoundtrack);
router.post('/:id/analyze', aiGenerationLimit, queueAnalysis);
router.post('/:id/direct', aiGenerationLimit, queueDirection);
router.post('/:id/narrate', aiGenerationLimit, queueNarration);
router.post('/:id/revise', aiGenerationLimit, queueRevision);
router.post('/:id/publish', publishDelivery);
router.post('/:id/email', clientDeliveryEmailLimit, emailClientDelivery);
router.get('/:id/qr', getDeliveryQr);
router.patch('/:id/review', updateDeliveryReview);
router.get('/:id/jobs/:jobId', getDeliveryJob);
router.post('/:id/jobs/:jobId/retry', aiGenerationLimit, retryDeliveryJob);

export default router;
