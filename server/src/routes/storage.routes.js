import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { confirmStorageAsset, deleteStorageAsset, downloadStorageAsset, editStorageAsset, listStorage, signStorageUpload } from '../controllers/storage.controller.js';
import { mediaSignatureLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();
router.use(authMiddleware);
router.get('/', listStorage);
router.post('/uploads/sign', mediaSignatureLimit, signStorageUpload);
router.post('/uploads/confirm', confirmStorageAsset);
router.patch('/:id', editStorageAsset);
router.delete('/:id', deleteStorageAsset);
router.get('/:id/download', downloadStorageAsset);
export default router;
