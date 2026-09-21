import PhotoStory from '../models/PhotoStory.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { generateAiPhotoStory } from '../services/photoStoryAi.service.js';
import User from '../models/User.js';
import StoryView from '../models/StoryView.js';
import { resolveEntitlements, reservePublishSlot } from '../services/entitlement.service.js';
import { tokenDigest } from '../utils/auth.js';
import { z } from 'zod';

const legacyMediaUrl = z.string().trim().min(1).max(2000).refine(value => {
  if (value.startsWith('/')) return /^\/(?:api\/v1\/deliveries\/soundtracks\/|audio\/)/.test(value);
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && ['res.cloudinary.com', 'cdn.pixabay.com', 'pixabay.com', 'www.pixabay.com'].includes(parsed.hostname.toLowerCase());
  } catch { return false; }
}, 'Use a Veylo media URL.');

const legacyPhotoSchema = z.object({
  id: z.string().trim().min(1).max(100),
  url: legacyMediaUrl,
  thumbnailUrl: legacyMediaUrl.optional().or(z.literal('')),
  chapterTitle: z.string().trim().max(80).default('The Moment'),
  caption: z.string().trim().min(18).max(240),
  typographyStyle: z.enum(['typewriter', 'editorial_quote', 'neon_pop', 'cinematic_drift', 'minimal_clean', 'bold_banner']).default('minimal_clean'),
  textAnimation: z.enum(['typewriter', 'word_fade_up', 'letter_drift', 'smooth_slide', 'scale_pop', 'blur_reveal']).default('word_fade_up'),
  textBackground: z.enum(['frosted_glass', 'solid_dark', 'neon_pill', 'transparent_shadow', 'vogue_bordered']).default('transparent_shadow'),
  captionPosition: z.enum(['top', 'center', 'bottom']).default('bottom'),
  zoomEffect: z.enum(['zoom_in', 'zoom_out', 'pan_left', 'pan_right']).default('zoom_in'),
  colorAccent: z.string().regex(/^#[0-9a-f]{6}$/i).default('#ff5a47'),
  duration: z.number().min(1).max(30).default(5.5)
}).strict();

const legacyThemeSchema = z.object({
  palette: z.string().trim().max(40).default('midnight_velvet'),
  typography: z.string().trim().max(40).default('cinematic_serif'),
  vibeTag: z.string().trim().max(80).default('A considered Photo Story'),
  bgGradient: z.string().trim().max(240).regex(/^[#a-zA-Z0-9_ .(),%\[\]-]+$/).default(''),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).default('#ff5a47'),
  glowColor: z.string().trim().max(80).regex(/^[#a-zA-Z0-9_ .(),%]+$/).default('')
}).strict();

const legacySoundtrackSchema = z.object({
  id: z.string().trim().max(120),
  title: z.string().trim().max(120),
  artist: z.string().trim().max(120).default(''),
  audioUrl: legacyMediaUrl,
  genre: z.string().trim().max(80).default(''),
  durationSec: z.number().min(1).max(3600).default(120)
}).passthrough();

const legacyStorySchema = z.object({
  clientName: z.string().trim().min(2).max(100),
  occasion: z.string().trim().min(2).max(150),
  adminDescription: z.string().trim().max(2000).default(''),
  title: z.string().trim().min(2).max(120),
  storySummary: z.string().trim().max(1000).default(''),
  theme: legacyThemeSchema,
  soundtrack: legacySoundtrackSchema,
  photos: z.array(legacyPhotoSchema).min(1).max(500)
}).strict();

const legacyAiSchema = z.object({
  clientName: z.string().trim().min(2).max(100),
  occasion: z.string().trim().min(2).max(150),
  adminDescription: z.string().trim().max(2000).default(''),
  photos: z.array(z.object({ id: z.string().trim().min(1).max(100), url: legacyMediaUrl, thumbnailUrl: legacyMediaUrl.optional().or(z.literal('')) }).passthrough()).min(1).max(500),
  selectedSoundtrackId: z.string().trim().max(120).optional().nullable()
}).strict();

export async function generateStoryWithAi(req, res) {
  try {
    const parsed = legacyAiSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Check the shoot details and photographs.' });
    const { clientName, occasion, adminDescription, photos, selectedSoundtrackId } = parsed.data;
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user);
    if (photos.length > entitlements.limits.photosPerDelivery) return res.status(403).json({ success: false, code: 'PHOTO_LIMIT_REACHED', message: `${entitlements.planName} allows up to ${entitlements.limits.photosPerDelivery} photographs in one delivery.` });

    const storyConfig = await generateAiPhotoStory({
      clientName: clientName || 'Client',
      occasion: occasion.trim(),
      adminDescription: adminDescription || '',
      photos,
      selectedSoundtrackId
    });

    res.json({ success: true, data: storyConfig });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, code: err.code, message: err.message || 'Caption generation is temporarily unavailable.' });
  }
}

export async function createStory(req, res) {
  let reservation;
  try {
    const parsed = legacyStorySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Check the delivery details before publishing.' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    reservation = await reservePublishSlot(user, parsed.data.photos.length);
    const story = await PhotoStory.create({
      ...parsed.data,
      userId: req.user.id,
      status: 'published'
    });
    res.status(201).json({ success: true, data: story });
  } catch (err) {
    await reservation?.release().catch(() => {});
    res.status(err.status || 500).json({ success: false, code: err.code, message: err.message || 'We could not publish this delivery.' });
  }
}

export async function getPublicStory(req, res) {
  try {
    const story = await PhotoStory.findOne({ storyId: req.params.storyId, status: 'published' }).lean();

    if (!story) {
      return res.status(404).json({ success: false, message: 'Photo Story not found.' });
    }
    if (!isLikelyBot(req)) {
      try {
        await StoryView.create({ storyId: story._id, visitorDigest: tokenDigest(visitorId(req, res)) });
        await PhotoStory.updateOne({ _id: story._id }, { $inc: { viewsCount: 1 } });
      } catch (error) { if (error.code !== 11000) throw error; }
    }
    const { userId, __v, ...publicStory } = story;
    res.json({ success: true, data: publicStory });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getUserStories(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Authentication required to view your stories.' });
    }
    const stories = await PhotoStory.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: stories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function trackDownload(req, res) {
  try {
    const result = await PhotoStory.updateOne({ storyId: req.params.storyId, status: 'published' }, { $inc: { downloadsCount: 1 } });
    if (!result.matchedCount) return res.status(404).json({ success: false, message: 'Photo Story not found.' });
    res.json({ success: true, message: 'Download counted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteStory(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const identifier = String(req.params.id || '').trim();
    if (!identifier || identifier.length > 200) return res.status(404).json({ success: false, message: 'Story not found.' });
    const identifierQuery = mongoose.isValidObjectId(identifier)
      ? { $or: [{ _id: identifier }, { storyId: identifier }] }
      : { storyId: identifier };
    const ownerQuery = req.user.role === 'admin' ? {} : { userId: req.user.id };
    const removed = await PhotoStory.findOneAndDelete({ ...ownerQuery, ...identifierQuery });
    if (!removed) return res.status(404).json({ success: false, message: 'Story not found.' });
    void StoryView.deleteMany({ storyId: removed._id }).catch(error => console.error('[stories/delete-views]', error.message));
    res.json({ success: true, message: 'Story deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

function isLikelyBot(req) {
  return /(bot|crawler|spider|preview|facebookexternalhit|whatsapp|slackbot|twitterbot|linkedinbot|discordbot)/i.test(String(req.get('user-agent') || ''));
}

function visitorId(req, res) {
  let id = req.cookies?.veylo_story_visitor;
  if (!id || !/^[A-Za-z0-9_-]{30,100}$/.test(id)) {
    id = crypto.randomBytes(32).toString('base64url');
    res.cookie('veylo_story_visitor', id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 * 1000, path: '/api/v1/stories/public' });
  }
  return id;
}
