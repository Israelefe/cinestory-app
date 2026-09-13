import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

const photoStorySchema = new mongoose.Schema({
  storyId: { type: String, unique: true, default: () => randomUUID().slice(0, 8) },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  clientName: { type: String, required: true },
  occasion: { type: String, required: true },
  adminDescription: { type: String, default: '' },
  title: { type: String, required: true },
  storySummary: { type: String, default: '' },
  theme: {
    palette: { type: String, default: 'midnight_velvet' },
    typography: { type: String, default: 'cinematic_serif' },
    vibeTag: { type: String, default: 'Midnight Radiance' },
    bgGradient: { type: String, default: 'from-[#0D0B18] via-[#1E1138] to-[#08080C]' },
    accentColor: { type: String, default: '#A24CF3' },
    glowColor: { type: String, default: 'rgba(162, 76, 243, 0.35)' }
  },
  soundtrack: {
    id: { type: String },
    title: { type: String },
    artist: { type: String },
    audioUrl: { type: String, required: true },
    genre: { type: String, default: 'Cinematic Ambient' },
    durationSec: { type: Number, default: 120 }
  },
  photos: [
    {
      id: { type: String },
      url: { type: String, required: true },
      thumbnailUrl: { type: String },
      chapterTitle: { type: String, default: 'The Moment' },
      caption: { type: String, default: '' },
      typographyStyle: { type: String, default: 'typewriter' },
      textAnimation: { type: String, default: 'typewriter' },
      textBackground: { type: String, default: 'transparent_shadow' },
      captionPosition: { type: String, default: 'bottom' },
      zoomEffect: { type: String, default: 'zoom_in' },
      colorAccent: { type: String, default: '#A24CF3' },
      duration: { type: Number, default: 5.5 }
    }
  ],
  viewsCount: { type: Number, default: 0 },
  downloadsCount: { type: Number, default: 0 },
  likesCount: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'published' }
}, { timestamps: true });

export default mongoose.model('PhotoStory', photoStorySchema);
