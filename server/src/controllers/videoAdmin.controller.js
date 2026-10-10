import { VideoAsset, VideoUpload, VideoJob, VideoLease, VideoUsage, VideoAIUsage } from '../models/video.models.js';
import WorkerHeartbeat from '../models/WorkerHeartbeat.js';
import { getRuntimeConfig } from '../services/runtimeConfig.service.js';
import { videoInfrastructure, publicVideoSettings } from '../config/videoDelivery.js';

export async function videoOperations(req, res) {
  try {
    const [runtime, assets, uploads, jobs, activeTransfers, activeEncodes, activeViewers, usage, budgets, worker] = await Promise.all([
      getRuntimeConfig(), VideoAsset.aggregate([{ $match: { state: { $ne: 'deleted' } } }, { $group: { _id: '$state', count: { $sum: 1 }, bytes: { $sum: '$bytes' }, seconds: { $sum: '$duration' } } }]),
      VideoUpload.aggregate([{ $group: { _id: '$state', count: { $sum: 1 } } }]), VideoJob.aggregate([{ $group: { _id: '$state', count: { $sum: 1 } } }]),
      VideoLease.countDocuments({ _id: /^transfer:platform:/, expiresAt: { $gt: new Date() } }), VideoLease.countDocuments({ _id: /^encode:platform:/, expiresAt: { $gt: new Date() } }), VideoLease.countDocuments({ _id: /^view:/, expiresAt: { $gt: new Date() } }),
      VideoUsage.aggregate([{ $match: { periodEnd: { $gt: new Date() } } }, { $group: { _id: null, deliveredMinutes: { $sum: '$deliveredMinutes' }, oldestReconciliation: { $min: '$reconciledAt' } } }]),
      VideoAIUsage.findOne({ _id: 'platform:' + new Date().toISOString().slice(0, 10) }).lean(), WorkerHeartbeat.findOne({ workerName: 'video' }).sort({ heartbeatAt: -1 }).select('status heartbeatAt stage').lean()
    ]);
    res.set('Cache-Control', 'no-store').json({ success: true, data: { settings: runtime.videoDelivery, infrastructure: videoInfrastructure(), public: publicVideoSettings(runtime.videoDelivery), assets, uploads, jobs, activeTransfers, activeEncodes, activeViewers, usage: usage[0] || { deliveredMinutes: 0 }, aiBudgetChargedUsd: budgets?.spentUsd || 0, worker, qualificationConfirmed: process.env.VIDEO_DELIVERY_QUALIFIED === 'true' } });
  } catch { res.status(500).json({ success: false, message: 'Video operations could not be loaded.' }); }
}
