import express from 'express';
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
router.get('/proxy/audio-stream', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('Audio URL required');
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://pixabay.com/'
      }
    });
    if (!response.ok) return res.status(502).send('Failed to stream audio');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (e) {
    res.status(500).send('Audio proxy error: ' + e.message);
  }
});

// Creator Studio Endpoints
router.post('/ai-generate', generateStoryWithAi);
router.post('/', createStory);
router.get('/my-stories', getUserStories);
router.delete('/:id', deleteStory);

export default router;
