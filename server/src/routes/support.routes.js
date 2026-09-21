import express from 'express';
import { createSupportTicket } from '../controllers/admin.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { supportTicketLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

// Public support intake accepts signed-in and guest requests. Optional auth lets
// Veylo associate a request with the account without requiring a client to log in
// before reporting a broken delivery.
router.post('/tickets', supportTicketLimit, optionalAuthMiddleware, createSupportTicket);

export default router;
