import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  publicId: { type: String, required: true },
  title: { type: String, trim: true, maxlength: 100, default: '' },
  category: { type: String, trim: true, maxlength: 50, default: 'Selected work' },
  sortOrder: { type: Number, min: 0, default: 0 }
}, { _id: false });

const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  handle: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 40, index: true },
  status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
  studioName: { type: String, trim: true, maxlength: 100, default: '' },
  bio: { type: String, trim: true, maxlength: 600, default: '' },
  headline: { type: String, trim: true, maxlength: 100, default: '' },
  introLine: { type: String, trim: true, maxlength: 240, default: '' },
  location: { type: String, trim: true, maxlength: 120, default: '' },
  contactLabel: { type: String, trim: true, maxlength: 50, default: 'Ask about a shoot' },
  instagram: { type: String, trim: true, maxlength: 80, default: '' },
  whatsapp: { type: String, trim: true, maxlength: 30, default: '' },
  items: { type: [itemSchema], default: [] },
  direction: {
    background: { type: String, enum: ['ink', 'warm-black', 'ivory'], default: 'ink' },
    accent: { type: String, match: /^#[0-9a-f]{6}$/i, default: '#ff9b8e' },
    typeStyle: { type: String, enum: ['editorial', 'modern', 'classic'], default: 'editorial' },
    rhythm: { type: String, enum: ['measured', 'bold', 'quiet'], default: 'measured' }
  },
  publishedAt: Date
}, { timestamps: true });

portfolioSchema.index({ status: 1, updatedAt: -1 });
export default mongoose.model('Portfolio', portfolioSchema);
