import express from 'express';
import { createSupportTicket, supportAccountContext, listCustomerSupport, readCustomerSupport, replyCustomerSupport, addSupportAttachment, downloadSupportAttachment } from '../controllers/support.controller.js';
import { customerRefundBanks, submitCustomerRefundBank } from '../controllers/refundSupport.controller.js';
import { optionalAuthMiddleware, authMiddleware } from '../middleware/auth.middleware.js';
import multer from 'multer';
import { supportTicketLimit, supportMessageLimit, billingActionLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

// Public support intake accepts signed-in and guest requests. Optional auth lets
// Veylo associate a request with the account without requiring a client to log in
// before reporting a broken delivery.
router.post('/tickets', supportTicketLimit, optionalAuthMiddleware, createSupportTicket);
router.use(authMiddleware);
router.get('/context', supportAccountContext);
router.get('/tickets', listCustomerSupport);
router.get('/tickets/:id', readCustomerSupport);
router.post('/tickets/:id/messages', supportMessageLimit, replyCustomerSupport);
router.post('/tickets/:id/attachments', supportMessageLimit, multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } }).single('screenshot'), addSupportAttachment);
router.get('/tickets/:id/attachments/:attachmentId', downloadSupportAttachment);
router.get('/refund-banks', customerRefundBanks);
router.post('/refunds/:id/bank-details', billingActionLimit, submitCustomerRefundBank);

export default router;
