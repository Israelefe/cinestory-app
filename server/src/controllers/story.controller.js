import PhotoStory from '../models/PhotoStory.js';
import { generateAiPhotoStory } from '../services/photoStoryAi.service.js';
import User from '../models/User.js';
import { resolveEntitlements, reservePublishSlot } from '../services/entitlement.service.js';

export async function generateStoryWithAi(req, res) {
  try {
    const { clientName, occasion, adminDescription, photos, selectedSoundtrackId } = req.body;
    if (!occasion?.trim()) {
      return res.status(400).json({ success: false, message: 'Occasion is required.' });
    }
    if (!photos?.length) {
      return res.status(400).json({ success: false, message: 'At least one photo is required.' });
    }
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
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function createStory(req, res) {
  let reservation;
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    reservation = await reservePublishSlot(user, Array.isArray(req.body.photos) ? req.body.photos.length : 0);
    const story = await PhotoStory.create({
      ...req.body,
      userId: req.user?.id || null
    });
    res.status(201).json({ success: true, data: story });
  } catch (err) {
    await reservation?.release().catch(() => {});
    res.status(err.status || 500).json({ success: false, code: err.code, message: err.message || 'We could not publish this delivery.' });
  }
}

export async function getPublicStory(req, res) {
  try {
    const story = await PhotoStory.findOneAndUpdate(
      { storyId: req.params.storyId, status: { $ne: 'archived' } },
      { $inc: { viewsCount: 1 } },
      { new: true }
    ).lean();

    if (!story) {
      return res.status(404).json({ success: false, message: 'Photo Story not found.' });
    }
    res.json({ success: true, data: story });
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
    await PhotoStory.updateOne({ storyId: req.params.storyId }, { $inc: { downloadsCount: 1 } });
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
    const story = await PhotoStory.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found.' });
    }
    // Verify ownership or superadmin role
    if (story.userId && story.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized: You can only delete your own stories.' });
    }
    await PhotoStory.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Story deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
