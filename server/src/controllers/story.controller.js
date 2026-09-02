import PhotoStory from '../models/PhotoStory.js';
import { generateAiPhotoStory } from '../services/photoStoryAi.service.js';

export async function generateStoryWithAi(req, res) {
  try {
    const { clientName, occasion, adminDescription, photos, selectedSoundtrackId } = req.body;
    if (!occasion?.trim()) {
      return res.status(400).json({ success: false, message: 'Occasion is required.' });
    }
    if (!photos?.length) {
      return res.status(400).json({ success: false, message: 'At least one photo is required.' });
    }

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
  try {
    const story = await PhotoStory.create({
      ...req.body,
      userId: req.user?.id || null
    });
    res.status(201).json({ success: true, data: story });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    const filter = req.user?.id ? { userId: req.user.id } : {};
    const stories = await PhotoStory.find(filter).sort({ createdAt: -1 }).lean();
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
    await PhotoStory.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Story deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
