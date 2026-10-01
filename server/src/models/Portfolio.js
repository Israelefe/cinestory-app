import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  id: String,
  publicId: { type: String, required: true },
  title: { type: String, trim: true, maxlength: 100, default: '' },
  category: { type: String, trim: true, maxlength: 50, default: 'Selected work' },
  sortOrder: { type: Number, min: 0, default: 0 },
  alt: { type: String, maxlength: 180, default: '' }, featured: { type: Boolean, default: true },
  width: Number, height: Number, focalX: { type: Number, default: 50, min: 0, max: 100 }, focalY: { type: Number, default: 50, min: 0, max: 100 },
  crop: { type: String, enum: ['fit', 'fill'], default: 'fit' }
}, { _id: false });

const projectSchema = new mongoose.Schema({ id: { type: String, required: true }, title: { type: String, maxlength: 100 }, description: { type: String, maxlength: 400, default: '' }, category: { type: String, maxlength: 50 }, coverId: String, photoIds: [String] }, { _id: false });

const previousHandleSchema = new mongoose.Schema({
  handle: { type: String, required: true, lowercase: true, trim: true, maxlength: 40 },
  redirectUntil: { type: Date, required: true },
  reservedUntil: { type: Date, required: true }
}, { _id: false });

const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  handle: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 40, index: true },
  handleChangedAt: Date,
  previousHandles: { type: [previousHandleSchema], default: [] },
  status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
  studioName: { type: String, trim: true, maxlength: 100, default: '' },
  bio: { type: String, trim: true, maxlength: 600, default: '' },
  headline: { type: String, trim: true, maxlength: 100, default: '' },
  introLine: { type: String, trim: true, maxlength: 240, default: '' },
  location: { type: String, trim: true, maxlength: 120, default: '' },
  contactLabel: { type: String, trim: true, maxlength: 50, default: 'Ask about a shoot' },
  instagram: { type: String, trim: true, maxlength: 80, default: '' },
  whatsapp: { type: String, trim: true, maxlength: 30, default: '' },
  heroPublicId: { type: String, trim: true, maxlength: 500, default: '' },
  items: { type: [itemSchema], default: [] },
  projects: { type: [projectSchema], default: [] },
  schemaVersion: { type: Number, default: 2 },
  mediaNotice: { type: String, default: '' },
  direction: {
    background: { type: String, enum: ['ink', 'warm-black', 'ivory'], default: 'ink' },
    accent: { type: String, match: /^#[0-9a-f]{6}$/i, default: '#ff9b8e' },
    typeStyle: { type: String, enum: ['editorial', 'modern', 'classic'], default: 'editorial' },
    rhythm: { type: String, enum: ['measured', 'bold', 'quiet'], default: 'measured' },
    layout: { type: String, enum: ['editorial', 'grid', 'masonry'], default: 'editorial' },
    motion: { type: String, enum: ['subtle', 'still'], default: 'subtle' },
    showBio: { type: Boolean, default: true },
    showLocation: { type: Boolean, default: true },
    showCategories: { type: Boolean, default: true },
    showPhotoTitles: { type: Boolean, default: true },
    showContact: { type: Boolean, default: true }
  },
  draft: { type: new mongoose.Schema({ handle: String, studioName: String, bio: String, headline: String, introLine: String, location: String, contactLabel: String, instagram: String, whatsapp: String, heroPublicId: String, items: [itemSchema], projects: [projectSchema], direction: mongoose.Schema.Types.Mixed }, { _id: false }), default: null },
  draftRevision: { type: Number, default: 0, min: 0 },
  publishedRevision: { type: Number, default: 0, min: 0 },
  publishedAt: Date
}, { timestamps: true });

portfolioSchema.index({ status: 1, updatedAt: -1 });
export default mongoose.model('Portfolio', portfolioSchema);
