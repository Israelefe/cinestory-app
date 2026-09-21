import mongoose from 'mongoose';

const storyViewSchema = new mongoose.Schema({
  storyId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhotoStory', required: true, index: true },
  visitorDigest: { type: String, required: true, maxlength: 128 }
}, { timestamps: true });

storyViewSchema.index({ storyId: 1, visitorDigest: 1 }, { unique: true });

export default mongoose.model('StoryView', storyViewSchema);
