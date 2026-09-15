import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminUserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 40,
    match: [/^[a-zA-Z0-9._-]+$/, 'Username can only contain letters, numbers, hyphens, periods, and underscores.']
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin'],
    default: 'superadmin'
  },
  accountStatus: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  },
  lastLoginAt: {
    type: Date
  }
}, { timestamps: true });

adminUserSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

adminUserSchema.methods.comparePassword = function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('AdminUser', adminUserSchema);
