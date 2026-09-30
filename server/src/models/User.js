import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { studioNameKey, studioNameSchema } from '../utils/studioName.js';

const studioSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 100 },
  businessType: { type: String, enum: ['individual', 'studio'] },
  city: { type: String, trim: true, maxlength: 80 },
  state: { type: String, trim: true, maxlength: 80 },
  country: { type: String, trim: true, maxlength: 80, default: 'Nigeria' },
  logoUrl: { type: String, trim: true },
  logoPublicId: { type: String, trim: true },
  specialties: [{ type: String, trim: true, maxlength: 50 }],
  instagram: { type: String, trim: true, maxlength: 80 },
  whatsapp: { type: String, trim: true, maxlength: 30 }
}, { _id: false });

const acquisitionSchema = new mongoose.Schema({
  source: { type: String, trim: true, maxlength: 50 },
  otherSource: { type: String, trim: true, maxlength: 120 },
  utmSource: { type: String, trim: true, maxlength: 120 },
  utmCampaign: { type: String, trim: true, maxlength: 120 },
  referrer: { type: String, trim: true, maxlength: 500 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  password: { type: String, select: false },
  googleId: { type: String, sparse: true, unique: true, select: false },
  providers: { type: [{ type: String, enum: ['password', 'google'] }], default: ['password'] },
  emailVerifiedAt: { type: Date },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  plan: { type: String, enum: ['free', 'pro', 'studio'], default: 'free' },
  planOverride: {
    plan: { type: String, enum: ['free', 'pro'] },
    expiresAt: Date,
    reason: { type: String, trim: true, maxlength: 240 },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  // Public studio names are intentionally not changed often. This timestamp
  // is private bookkeeping used to enforce the rename cooldown.
  studioNameChangedAt: { type: Date },
  // The unique index is installed after the legacy-name audit, before any
  // account can claim a name. This key is never included in publicUser().
  studioNameKey: { type: String, select: false },
  storiesCount: { type: Number, default: 0, min: 0 },
  storageUsedBytes: { type: Number, default: 0, min: 0 },
  proRetentionUntil: Date,
  avatar: { type: String, trim: true },
  studio: { type: studioSchema, default: () => ({}) },
  acquisition: { type: acquisitionSchema, default: () => ({}) },
  onboardingStep: { type: Number, default: 1, min: 1, max: 3 },
  onboardingCompletedAt: { type: Date },
  accountStatus: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' },
  failedLoginCount: { type: Number, default: 0, min: 0, select: false },
  loginLockedUntil: { type: Date, select: false },
  lastLoginAt: { type: Date }
}, { timestamps: true });

userSchema.pre('validate', function () {
  if (!this.isModified('studio.name') && !this.isModified('studio') && !this.isNew) return;
  if (this.studio?.name) this.studio.name = studioNameSchema.parse(this.studio.name);
  this.studioNameKey = studioNameKey(this.studio?.name) || undefined;
});

// Query updates must maintain the same key as document saves. In particular,
// a future admin or account rename must not bypass the unique database index.
userSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  const update = this.getUpdate();
  if (Array.isArray(update)) throw new Error('User updates must use explicit fields.');
  if (!update) return;
  const fields = update.$set || update;
  const hasName = Object.hasOwn(fields, 'studio.name') || Object.hasOwn(fields, 'studio');
  if (hasName) {
    const name = Object.hasOwn(fields, 'studio.name') ? fields['studio.name'] : fields.studio?.name;
    const clean = name ? studioNameSchema.parse(name) : '';
    if (Object.hasOwn(fields, 'studio.name')) fields['studio.name'] = clean;
    else if (fields.studio) fields.studio.name = clean;
    if (clean) fields.studioNameKey = studioNameKey(clean);
    else (update.$unset ||= {}).studioNameKey = '';
  } else if (update.$unset && (Object.hasOwn(update.$unset, 'studio.name') || Object.hasOwn(update.$unset, 'studio'))) {
    update.$unset.studioNameKey = '';
  } else if (fields.studioNameKey !== undefined || update.$unset?.studioNameKey !== undefined) {
    throw new Error('Change the Studio or Brand name rather than its private key.');
  }
});

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);
