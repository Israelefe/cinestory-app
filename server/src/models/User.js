import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
  storiesCount: { type: Number, default: 0, min: 0 },
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

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);
