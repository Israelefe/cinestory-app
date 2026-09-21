import mongoose from 'mongoose';

const workerHeartbeatSchema = new mongoose.Schema({
  workerName: { type: String, required: true, trim: true, maxlength: 60 },
  instance: { type: String, required: true, trim: true, maxlength: 140 },
  status: { type: String, enum: ['idle', 'busy', 'disabled', 'error'], default: 'idle' },
  stage: { type: String, trim: true, maxlength: 120, default: 'polling' },
  heartbeatAt: { type: Date, required: true, index: true },
  details: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

workerHeartbeatSchema.index({ workerName: 1, instance: 1 }, { unique: true });

export default mongoose.model('WorkerHeartbeat', workerHeartbeatSchema);
