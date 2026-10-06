import express from 'express';
import { v3Access, v3Approve, v3Assist, v3Caption, v3Create, v3Details, v3Format, v3Narration, v3Photoswap, v3Pinboard, v3Prepare, v3Publish, v3RepickTheme, v3Showcase, v3SkipNarration, v3Theme } from '../controllers/deliveryV3.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { aiGenerationLimit, clientDeliveryEmailLimit, mediaSignatureLimit, publicAccessLimit, publicMediaLimit } from '../middleware/rateLimit.middleware.js';
import {
  addLibraryAssets, archiveDelivery, assistDeliveryBrief, confirmDeliveryUpload, confirmSoundtrackUpload,
  createDelivery, createShareGrant, deleteDelivery, deleteDeliveryAsset, deleteSoundtrack, emailClientDelivery,
  getDelivery, getDeliveryJob, getDeliveryQr, getDeliveryShareMeta, getGalleryDownload, getPhotoDownload, getPhotoOriginal,
  getPublicDelivery, getPublicSoundtrack, getPinboardStatusCard, listDeliveries, listDeliverySoundtracks, listNarrationVoices,
  listShareGrants, publishDelivery, queueAnalysis, queueDirection, queueNarration, queueRevision,
  restoreDelivery, retryDeliveryJob, recoverDeliveryUpload, revokeShareGrant, selectCuratedSoundtrack, signDeliveryUpload,
  signSoundtrackUpload, streamDeliverySoundtrack, streamPhotoStoryDemoSoundtrack, streamPhotoDownload, togglePhotoLike, trackPhotoDownload,
  unlockDelivery, updateDeliveryDetails, updateDeliveryReview, updateDownloadSettings
} from '../controllers/delivery.controller.js';

const router = express.Router();

router.get('/public/:publicId', publicAccessLimit, getPublicDelivery);
router.get('/public/:publicId/share-meta', publicAccessLimit, getDeliveryShareMeta);
router.get('/public/:publicId/soundtrack', publicMediaLimit, getPublicSoundtrack);
router.post('/public/:publicId/pinboard/status-card', publicMediaLimit, getPinboardStatusCard);
router.post('/public/:publicId/unlock', publicAccessLimit, unlockDelivery);
router.post('/public/:publicId/photos/:assetId/like', publicMediaLimit, togglePhotoLike);
router.get('/public/:publicId/photos/:assetId/original', publicMediaLimit, getPhotoOriginal);
router.get('/public/:publicId/photos/:assetId/download', publicMediaLimit, getPhotoDownload);
router.get('/public/:publicId/photos/:assetId/file', publicMediaLimit, streamPhotoDownload);
router.post('/public/:publicId/photos/:assetId/downloaded', publicMediaLimit, trackPhotoDownload);
router.get('/public/:publicId/download-all', publicMediaLimit, getGalleryDownload);
router.get('/demo/photo-story/soundtrack', publicMediaLimit, streamPhotoStoryDemoSoundtrack);
router.get('/soundtracks/:trackId/audio', publicMediaLimit, streamDeliverySoundtrack);

router.use(authMiddleware);
router.post('/v3/assist', aiGenerationLimit, v3Assist);
router.post('/v3', v3Create);
router.get('/', listDeliveries);
router.post('/', createDelivery);
router.post('/brief/assist', aiGenerationLimit, assistDeliveryBrief);
router.get('/soundtracks', listDeliverySoundtracks);
router.get('/narration/voices', listNarrationVoices);
router.get('/:id', getDelivery);
router.patch('/:id/v3/details', v3Details);
router.patch('/:id/v3/format', v3Format);
router.post('/:id/v3/prepare', aiGenerationLimit, v3Prepare);
router.patch('/:id/v3/showcase', v3Showcase);
router.patch('/:id/v3/pinboard', v3Pinboard);
router.patch('/:id/v3/photoswap', v3Photoswap);
router.post('/:id/v3/captions/:assetId/regenerate', aiGenerationLimit, v3Caption);
router.post('/:id/v3/narrate', aiGenerationLimit, v3Narration);
router.post('/:id/v3/narration/skip', v3SkipNarration);
router.patch('/:id/v3/theme', v3Theme);
router.post('/:id/v3/theme/repick', aiGenerationLimit, v3RepickTheme);
router.patch('/:id/v3/access', v3Access);
router.post('/:id/v3/approve', v3Approve);
router.post('/:id/v3/publish', v3Publish);
router.patch('/:id/details', updateDeliveryDetails);
router.patch('/:id/download-settings', updateDownloadSettings);
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
