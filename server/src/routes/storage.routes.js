import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { cleanupUnconfirmedStorageUploads, confirmStorageAsset, deleteStorageAsset, downloadStorageAsset, editStorageAsset, listStorage, signStorageUpload } from '../controllers/storage.controller.js';
import { confirmPublicEditorUpload, createLibraryCollaboration, downloadPublicLibraryOriginal, getPublicLibraryContent, getPublicLibraryInfo, getPublicLibraryMedia, listLibraryCollaborations, reopenLibraryPreselection, revokeLibraryCollaboration, signPublicEditorUpload, submitPublicPreselection, unlockPublicLibrary } from '../controllers/libraryCollaboration.controller.js';
import { mediaSignatureLimit, privateLinkMediaLimit, privateLinkUnlockLimit, privateLinkUploadLimit, publicAccessLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

// Public collaboration links are independently password/PIN scoped. Keep
// these routes ahead of the photographer session middleware below.
router.get('/public/:publicId', publicAccessLimit, getPublicLibraryInfo);
router.post('/public/:publicId/unlock', privateLinkUnlockLimit, unlockPublicLibrary);
router.get('/public/:publicId/content', publicAccessLimit, getPublicLibraryContent);
router.post('/public/:publicId/selections', publicAccessLimit, submitPublicPreselection);
router.get('/public/:publicId/media/:assetId', privateLinkMediaLimit, getPublicLibraryMedia);
router.get('/public/:publicId/download/:assetId', privateLinkMediaLimit, downloadPublicLibraryOriginal);
router.post('/public/:publicId/uploads/sign', privateLinkUploadLimit, signPublicEditorUpload);
router.post('/public/:publicId/uploads/confirm', privateLinkUploadLimit, confirmPublicEditorUpload);

router.use(authMiddleware);
router.get('/', listStorage);
router.post('/uploads/sign', mediaSignatureLimit, signStorageUpload);
router.post('/uploads/confirm', confirmStorageAsset);
router.post('/uploads/cleanup', cleanupUnconfirmedStorageUploads);
router.get('/collaborations', listLibraryCollaborations);
router.post('/collaborations', createLibraryCollaboration);
router.patch('/collaborations/:id/reopen', reopenLibraryPreselection);
router.delete('/collaborations/:id', revokeLibraryCollaboration);
router.patch('/:id', editStorageAsset);
router.delete('/:id', deleteStorageAsset);
router.get('/:id/download', downloadStorageAsset);
export default router;
