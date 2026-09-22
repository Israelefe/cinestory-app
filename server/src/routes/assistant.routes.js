import express from 'express';
import { chatWithVeyloAssistant } from '../controllers/assistant.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { assistantChatLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

// The assistant can answer public Veylo questions and delivery-recipient help,
// while optional authentication adds only a narrow, safe studio-plan context.
router.post('/chat', optionalAuthMiddleware, assistantChatLimit, chatWithVeyloAssistant);

export default router;
