import crypto from 'node:crypto';
import mongoose from 'mongoose';

const ticketMessageSchema = new mongoose.Schema({
  authorType: { type: String, enum: ['requester', 'admin', 'system'], required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  message: { type: String, required: true, trim: true, maxlength: 4000 },
  internal: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const moderationActionSchema = new mongoose.Schema({
  action: { type: String, enum: ['takedown', 'restore', 'copyright_hold', 'abuse_review'], required: true },
  targetType: { type: String, enum: ['delivery', 'portfolio', 'account'], required: true },
  targetId: { type: String, trim: true, maxlength: 160 },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  outcome: { type: String, trim: true, maxlength: 240, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const supportTicketSchema = new mongoose.Schema({
  ticketNumber: { type: String, unique: true, index: true, default: () => `VT-${crypto.randomBytes(6).toString('hex').toUpperCase()}` },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  requesterName: { type: String, required: true, trim: true, maxlength: 100 },
  requesterEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  subject: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, enum: ['delivery', 'upload', 'billing', 'privacy', 'abuse', 'copyright', 'account', 'format', 'portfolio', 'other'], default: 'other', index: true },
  status: { type: String, enum: ['open', 'pending', 'resolved', 'closed'], default: 'open', index: true },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal', index: true },
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', index: true },
  deliveryPublicId: { type: String, trim: true, maxlength: 120 },
  resourceType: { type: String, enum: ['delivery', 'portfolio', 'account', 'none'], default: 'none' },
  resourceId: { type: String, trim: true, maxlength: 160 },
  assignedAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', index: true },
  messages: { type: [ticketMessageSchema], default: [] },
  moderationActions: { type: [moderationActionSchema], default: [] },
  lastResponseAt: Date,
  resolvedAt: Date,
  closedAt: Date
}, { timestamps: true });

supportTicketSchema.index({ status: 1, priority: -1, updatedAt: -1 });
supportTicketSchema.index({ requesterEmail: 1, createdAt: -1 });
supportTicketSchema.index({ deliveryPublicId: 1, createdAt: -1 });

export default mongoose.model('SupportTicket', supportTicketSchema);
