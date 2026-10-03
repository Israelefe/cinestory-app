import mongoose from 'mongoose';
const schema = shape => new mongoose.Schema(shape, { _id: false });
const text = max => ({ type: String, trim: true, maxlength: max, default: '' });
const id = { type: String, required: true, maxlength: 80 };
export const projectDetailsFields = {
  shootType: text(100), location: text(120), venue: text(120), brief: text(600), approach: text(800), credits: text(300),
  narrative: { type: [schema({ id, title: text(100), text: text(800) })], default: [] }, relatedIds: { type: [String], default: [] }
};
export const portfolioContentSchema = schema({
  profile: { type: schema({ specialties: text(140), about: text(1200), serviceAreas: text(180), travel: text(240), portraitId: text(80), logoId: text(80) }), default: () => ({}) },
  contact: { type: schema({ email: text(254), formEnabled: { type: Boolean, default: false }, showcaseOnly: { type: Boolean, default: false }, responseNote: text(240) }), default: () => ({}) },
  services: { type: [schema({ id, title: text(100), description: text(600), coverage: text(180), deliverables: text(300), turnaround: text(180), priceMode: { type: String, enum: ['hidden', 'starting', 'range', 'quote'], default: 'hidden' }, price: { type: Number, min: 0, max: 1e9, default: 0 }, priceMax: { type: Number, min: 0, max: 1e9, default: 0 }, projectIds: [String] })], default: [] },
  testimonials: { type: [schema({ id, quote: text(600), attribution: text(100), context: text(100), projectId: text(80), permission: { type: Boolean, default: false } })], default: [] },
  process: { type: [schema({ id, title: text(100), description: text(400) })], default: [] },
  faqs: { type: [schema({ id, question: text(180), answer: text(800) })], default: [] },
  categoryDetails: { type: [schema({ id, name: text(50), description: text(400), coverId: text(80) })], default: [] },
  sections: { type: [schema({ id, visible: { type: Boolean, default: true } })], default: [] },
  homeMode: { type: String, enum: ['gallery', 'projects'], default: 'gallery' }, galleryArrangement: { type: String, enum: ['design', 'grid', 'columns'], default: 'design' }, mobileEnquiry: { type: Boolean, default: false },
  share: { type: schema({ title: text(100), description: text(240), coverId: text(80) }), default: () => ({}) }
});
