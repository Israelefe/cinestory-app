import express from 'express';
import { recoverDeliveryUpload } from '../controllers/delivery.controller.js';
import Delivery from '../models/Delivery.js';
import { deliveryConfiguration, assistPreparationBrief, prepareDelivery, getPreparation, cancelDeliveryPreparation, regenerateDeliveryCaption, prepareNarration, editPresentation, publishPresentation } from '../controllers/deliveryPreparation.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { aiGenerationLimit, clientDeliveryEmailLimit, mediaSignatureLimit, publicAccessLimit, publicMediaLimit } from '../middleware/rateLimit.middleware.js';
import { addLibraryAssets, archiveDelivery, assistDeliveryBrief, confirmDeliveryUpload, confirmSoundtrackUpload, createDelivery, createShareGrant, deleteDelivery, deleteDeliveryAsset, deleteSoundtrack, emailClientDelivery, getDelivery, getDeliveryJob, getDeliveryQr, getDeliveryShareMeta, getGalleryDownload, getPhotoDownload, getPublicDelivery, getPublicSoundtrack, listDeliveries, listDeliverySoundtracks, listNarrationVoices, listShareGrants, publishDelivery, queueAnalysis, queueDirection, queueNarration, queueRevision, restoreDelivery, retryDeliveryJob, revokeShareGrant, selectCuratedSoundtrack, signDeliveryUpload, signSoundtrackUpload, streamDeliverySoundtrack, streamPhotoDownload, togglePhotoLike, trackPhotoDownload, unlockDelivery, updateDeliveryDetails, updateDeliveryReview, updateDownloadLock } from '../controllers/delivery.controller.js';

const router = express.Router();

router.get('/public/:publicId', publicAccessLimit, getPublicDelivery);
router.get('/public/:publicId/share-meta', publicAccessLimit, getDeliveryShareMeta);
router.get('/public/:publicId/soundtrack', publicMediaLimit, getPublicSoundtrack);
router.post('/public/:publicId/unlock', publicAccessLimit, unlockDelivery);
router.post('/public/:publicId/photos/:assetId/like', publicMediaLimit, togglePhotoLike);
router.get('/public/:publicId/photos/:assetId/download', publicMediaLimit, getPhotoDownload);
router.get('/public/:publicId/photos/:assetId/file', publicMediaLimit, streamPhotoDownload);
router.post('/public/:publicId/photos/:assetId/downloaded', publicMediaLimit, trackPhotoDownload);
router.get('/public/:publicId/download-all', publicMediaLimit, getGalleryDownload);
router.get('/soundtracks/:trackId/audio', publicMediaLimit, streamDeliverySoundtrack);

router.use(authMiddleware);
// Old mutation contracts must never write into a revision-based delivery.
router.use('/:id', async (req, res, next) => {
  if (req.method === 'GET' || !/^\/(analyze|direct|revise|review|publish|narrate|jobs|soundtrack)(\/|$)/.test(req.path)) return next();
  try {
    if (await Delivery.exists({ _id: req.params.id, userId: req.user.id, schemaVersion: 3 })) return res.status(409).json({ success: false, message: 'Open this delivery in the current editor to save changes.' });
    next();
  } catch { res.status(400).json({ success: false, message: 'This delivery is not available.' }); }
});
router.get('/configuration', deliveryConfiguration);
router.post('/brief/direction', aiGenerationLimit, assistPreparationBrief);
router.post('/:id/prepare', aiGenerationLimit, prepareDelivery);
router.get('/:id/preparation', getPreparation);
router.post('/:id/preparation/cancel', cancelDeliveryPreparation);
router.post('/:id/presentation/caption', aiGenerationLimit, regenerateDeliveryCaption);
router.post('/:id/presentation/narration', aiGenerationLimit, prepareNarration);
router.patch('/:id/presentation', editPresentation);
router.post('/:id/presentation/publish', publishPresentation);
router.get('/', listDeliveries);
router.post('/', createDelivery);
router.post('/brief/assist', aiGenerationLimit, assistDeliveryBrief);
router.get('/soundtracks', listDeliverySoundtracks);
router.get('/narration/voices', listNarrationVoices);
router.get('/:id', getDelivery);
router.patch('/:id/details', updateDeliveryDetails);
router.patch('/:id/download-lock', updateDownloadLock);
router.post('/:id/archive', archiveDelivery);
router.post('/:id/restore', restoreDelivery);
router.get('/:id/share-grants', listShareGrants);
router.post('/:id/share-grants', createShareGrant);
router.delete('/:id/share-grants/:grantId', revokeShareGrant);
router.delete('/:id', deleteDelivery);
router.post('/:id/uploads/sign', mediaSignatureLimit, signDeliveryUpload);
router.post('/:id/uploads/recover', mediaSignatureLimit, recoverDeliveryUpload);
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
