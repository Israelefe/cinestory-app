import mongoose from 'mongoose';

const heading = new mongoose.Schema({ id: String, text: String, level: Number }, { _id: false });
const snapshot = new mongoose.Schema({
  title: { type: String, maxlength: 180, default: '' },
  excerpt: { type: String, maxlength: 400, default: '' },
  markdown: { type: String, maxlength: 80000, default: '' },
  bodyHtml: { type: String, default: '' },
  toc: { type: [heading], default: [] },
  seoTitle: { type: String, maxlength: 100, default: '' },
  metaDescription: { type: String, maxlength: 250, default: '' },
  keyword: { type: String, maxlength: 150, default: '' },
  coverId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogAsset', default: null },
  coverAlt: { type: String, maxlength: 300, default: '' },
  coverCredit: { type: String, maxlength: 180, default: '' },
  readingMinutes: { type: Number, default: 1 }
}, { _id: false });
const schema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, maxlength: 120 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  draft: { type: snapshot, default: () => ({}) },
  published: { type: snapshot, default: null },
  notes: { type: String, maxlength: 12000, default: '' },
  draftRevision: { type: Number, default: 1 },
  publishedRevision: { type: Number, default: 0 },
  firstPublishedAt: Date,
  publishedUpdatedAt: Date,
  activeJobId: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  publishedBy: mongoose.Schema.Types.ObjectId
}, { timestamps: true });
schema.index({ status: 1, firstPublishedAt: -1, _id: -1 });
export default mongoose.model('BlogPost', schema);
