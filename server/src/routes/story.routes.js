import express from 'express';
import { publicMediaLimit } from '../middleware/rateLimit.middleware.js';
import {
  generateStoryWithAi,
  createStory,
  getPublicStory,
  getUserStories,
  trackDownload,
  deleteStory
} from '../controllers/story.controller.js';
import { authMiddleware } from './auth.routes.js';

const router = express.Router();

// Public Viewer Endpoints
router.get('/public/:storyId', getPublicStory);
router.post('/public/:storyId/track-download', trackDownload);

// Audio Proxy Stream
router.get('/proxy/audio-stream', publicMediaLimit, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('Audio URL required');
    let target;
    try { target = new URL(String(url)); } catch { return res.status(400).send('Audio URL is not valid'); }
    const allowedHosts = new Set(['cdn.pixabay.com', 'pixabay.com', 'www.pixabay.com']);
    if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname.toLowerCase())) return res.status(400).send('Audio source is not approved');
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://pixabay.com/'
      }
    });
    if (!response.ok) return res.status(502).send('Failed to stream audio');
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 25 * 1024 * 1024) return res.status(413).send('Audio file is too large');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 25 * 1024 * 1024) return res.status(413).send('Audio file is too large');
    return res.send(Buffer.from(arrayBuffer));
  } catch (e) {
    res.status(500).send('Audio proxy error: ' + e.message);
  }
});

// Creator Studio Endpoints
router.post('/ai-generate', authMiddleware, generateStoryWithAi);
router.post('/', authMiddleware, createStory);
router.get('/my-stories', authMiddleware, getUserStories);
router.delete('/:id', authMiddleware, deleteStory);

export default router;
