import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { cleanupUnconfirmedStorageUploads, confirmStorageAsset, createLibraryShoot, deleteStorageAsset, downloadLibraryArchive, downloadStorageAsset, editStorageAsset, listStorage, moveLibraryPhotos, resolveLibraryPhotos, renewLibraryUpload, signStorageUpload } from '../controllers/storage.controller.js';
import { deleteLibraryCollaboration, sendLibraryInvitation, getLibraryShareMeta, getLibraryShareCover, cleanupPublicEditorUpload, renewPublicEditorUpload, confirmPublicEditorUpload, createLibraryCollaboration, downloadPublicEditorArchive, downloadPublicLibraryOriginal, getLibraryCollaboration, getPublicEditorReturnMedia, getPublicLibraryContent, getPublicLibraryInfo, getPublicLibraryMedia, listLibraryCollaborations, reopenLibraryPreselection, reviseLibraryPreselection, reviewEditorReturn, revokeLibraryCollaboration, savePublicSelectionDraft, signPublicEditorUpload, submitPublicEditorEdits, submitPublicPreselection, unlockPublicLibrary, updateLibraryCollaboration } from '../controllers/libraryCollaboration.controller.js';
import { libraryEmailLimit, mediaSignatureLimit, privateLinkMediaLimit, privateLinkUnlockLimit, privateLinkUploadLimit, publicAccessLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

// Public collaboration links are independently password/PIN scoped. Keep
// these routes ahead of the photographer session middleware below.
router.get('/public/:publicId/share-meta', publicAccessLimit, getLibraryShareMeta);
router.get('/public/:publicId/share-cover', privateLinkMediaLimit, getLibraryShareCover);
router.get('/public/:publicId', publicAccessLimit, getPublicLibraryInfo);
router.post('/public/:publicId/unlock', privateLinkUnlockLimit, unlockPublicLibrary);
router.get('/public/:publicId/content', publicAccessLimit, getPublicLibraryContent);
router.post('/public/:publicId/selections', publicAccessLimit, submitPublicPreselection);
router.put('/public/:publicId/selection-draft', publicAccessLimit, savePublicSelectionDraft);
router.post('/public/:publicId/archive', publicAccessLimit, downloadPublicEditorArchive);
router.post('/public/:publicId/edits/submit', publicAccessLimit, submitPublicEditorEdits);
router.get('/public/:publicId/returns/:assetId/media', privateLinkMediaLimit, getPublicEditorReturnMedia);
router.get('/public/:publicId/media/:assetId', privateLinkMediaLimit, getPublicLibraryMedia);
router.get('/public/:publicId/download/:assetId', privateLinkMediaLimit, downloadPublicLibraryOriginal);
router.post('/public/:publicId/uploads/renew', privateLinkUploadLimit, renewPublicEditorUpload);
router.post('/public/:publicId/uploads/cleanup', privateLinkUploadLimit, cleanupPublicEditorUpload);
router.post('/public/:publicId/uploads/sign', privateLinkUploadLimit, signPublicEditorUpload);
router.post('/public/:publicId/uploads/confirm', privateLinkUploadLimit, confirmPublicEditorUpload);

router.use(authMiddleware);
router.get('/', listStorage);
router.post('/shoots', createLibraryShoot);
router.patch('/photos/move', moveLibraryPhotos);
router.post('/photos/archive', downloadLibraryArchive);
router.post('/photos/resolve', resolveLibraryPhotos);
router.post('/uploads/renew', mediaSignatureLimit, renewLibraryUpload);
router.post('/uploads/sign', mediaSignatureLimit, signStorageUpload);
router.post('/uploads/confirm', confirmStorageAsset);
router.post('/uploads/cleanup', cleanupUnconfirmedStorageUploads);
router.get('/collaborations', listLibraryCollaborations);
router.post('/collaborations', createLibraryCollaboration);
router.get('/collaborations/:id', getLibraryCollaboration);
router.patch('/collaborations/:id', updateLibraryCollaboration);
router.patch('/collaborations/:id/returns/:assetId', reviewEditorReturn);
router.patch('/collaborations/:id/revise', reviseLibraryPreselection);
router.patch('/collaborations/:id/reopen', reopenLibraryPreselection);
router.post('/collaborations/:id/invite', libraryEmailLimit, sendLibraryInvitation);
router.delete('/collaborations/:id/remove', deleteLibraryCollaboration);
router.delete('/collaborations/:id', revokeLibraryCollaboration);
router.patch('/:id', editStorageAsset);
router.delete('/:id', deleteStorageAsset);
router.get('/:id/download', downloadStorageAsset);
export default router;
