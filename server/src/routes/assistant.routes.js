import express from 'express';
import { chatWithVeyloAssistant } from '../controllers/assistant.controller.js';
import { optionalAuthMiddleware, authMiddleware } from '../middleware/auth.middleware.js';
import { getAssistantWorkspace, checkAssistantDelivery, proposeAssistantWriting, validateAssistantWriting } from '../controllers/assistant.tools.controller.js';
import { assistantChatLimit } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

// The assistant can answer public Veylo questions and delivery-recipient help,
// while optional authentication adds only a narrow, safe studio-plan context.
router.post('/chat', optionalAuthMiddleware, assistantChatLimit, chatWithVeyloAssistant);
router.post('/workspace', authMiddleware, assistantChatLimit, getAssistantWorkspace);
router.post('/check', authMiddleware, assistantChatLimit, checkAssistantDelivery);
router.post('/writing', authMiddleware, assistantChatLimit, proposeAssistantWriting);
router.post('/writing/confirm', authMiddleware, assistantChatLimit, validateAssistantWriting);

export default router;
