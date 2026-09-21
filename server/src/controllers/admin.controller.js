import crypto from 'crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import mongoose from 'mongoose';
import User from '../models/User.js';
import PhotoStory from '../models/PhotoStory.js';
import Delivery from '../models/Delivery.js';
import DeliveryJob from '../models/DeliveryJob.js';
import PortfolioJob from '../models/PortfolioJob.js';
import VolumeJob from '../models/VolumeJob.js';
import VolumeSubject from '../models/VolumeSubject.js';
import VolumeAccessCode from '../models/VolumeAccessCode.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import BillingEvent from '../models/BillingEvent.js';
import AnalyticsEvent from '../models/AnalyticsEvent.js';
import WorkerHeartbeat from '../models/WorkerHeartbeat.js';
import AdminAudit from '../models/AdminAudit.js';
import AdminAccountNote from '../models/AdminAccountNote.js';
import AccountDeletionRequest from '../models/AccountDeletionRequest.js';
import SupportAccessGrant from '../models/SupportAccessGrant.js';
import AdminUser from '../models/AdminUser.js';
import Session from '../models/Session.js';
import Portfolio from '../models/Portfolio.js';
import StorageAsset from '../models/StorageAsset.js';
import DeliveryView from '../models/DeliveryView.js';
import StoryView from '../models/StoryView.js';
import PhotoLike from '../models/PhotoLike.js';
import DeliveryShareGrant from '../models/DeliveryShareGrant.js';
import SupportTicket from '../models/SupportTicket.js';
import { paystackRequest } from '../services/paystack.service.js';
import { billingConfigured } from '../services/paystack.service.js';
import { checkCloudinaryConnection, cloudinary, configureCloudinary } from '../services/cloudinary.service.js';
import { PLAN_DEFINITIONS, PRO_PRICE_KOBO } from '../config/plans.js';
import { tokenDigest } from '../utils/auth.js';
import { removeDeliveryMedia } from '../services/deliveryMedia.service.js';
import { AccountDeletionError, deleteUserAccount } from '../services/accountDeletion.service.js';
import { NARRATION_RENDER_VERSION } from '../services/narration.service.js';
import { DELIVERY_SOUNDTRACKS, deliverySoundtrackFile } from '../constants/deliverySoundtracks.js';
import { DEFAULT_NARRATION_VOICE_ID, NARRATION_VOICES } from '../constants/narrationVoices.js';
import { FORMAT_IDS, FORMAT_LABELS, getRuntimeConfig, updateRuntimeConfig } from '../services/runtimeConfig.service.js';

function escaped(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function safeReason(value, fallback = '') {
  return String(value || fallback).replace(/[<>]/g, '').trim().slice(0, 240);
}

function validId(value) {
  return mongoose.isValidObjectId(value) ? value : null;
}

let soundtrackVerificationCache = { expiresAt: 0, value: null, pending: null };

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function verifySoundtrackFiles() {
  if (soundtrackVerificationCache.value && soundtrackVerificationCache.expiresAt > Date.now()) return soundtrackVerificationCache.value;
  if (soundtrackVerificationCache.pending) return soundtrackVerificationCache.pending;
  soundtrackVerificationCache.pending = Promise.all(DELIVERY_SOUNDTRACKS.map(async track => {
    const filePath = deliverySoundtrackFile(track.id);
    try {
      const details = await stat(filePath);
      const actualSha256 = await hashFile(filePath);
      return { trackId: track.id, available: true, bytes: details.size, expectedBytes: track.bytes, actualSha256, expectedSha256: track.sha256, hashMatches: details.size === track.bytes && actualSha256.toLowerCase() === String(track.sha256).toLowerCase(), checkedAt: new Date() };
    } catch (error) {
      return { trackId: track.id, available: false, bytes: 0, expectedBytes: track.bytes, actualSha256: '', expectedSha256: track.sha256, hashMatches: false, errorCode: error.code || 'TRACK_FILE_UNAVAILABLE', checkedAt: new Date() };
    }
  })).then(value => {
    soundtrackVerificationCache = { value, expiresAt: Date.now() + 10 * 60 * 1000, pending: null };
    return value;
  }).catch(error => {
    soundtrackVerificationCache.pending = null;
    throw error;
  });
  return soundtrackVerificationCache.pending;
}

function adminId(req) {
  return req.admin?._id || req.admin?.id;
}

function accountSnapshot(user) {
  if (!user) return null;
  return {
    _id: user._id,
    id: user._id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    role: user.role,
    plan: user.plan,
    planOverride: user.planOverride ? {
      plan: user.planOverride.plan,
      expiresAt: user.planOverride.expiresAt || null,
      reason: user.planOverride.reason || '',
      grantedBy: user.planOverride.grantedBy || null
    } : null,
    accountStatus: user.accountStatus,
    avatar: user.avatar || user.studio?.logoUrl || '',
    studio: user.studio || {},
    acquisition: user.acquisition || {},
    onboardingStep: user.onboardingStep || 1,
    onboardingCompletedAt: user.onboardingCompletedAt || null,
    storageUsedBytes: Number(user.storageUsedBytes || 0),
    storiesCount: Number(user.storiesCount || 0),
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function deliverySummary(delivery) {
  const assets = Array.isArray(delivery.assets) ? delivery.assets : [];
  return {
    id: delivery._id,
    publicId: delivery.publicId,
    title: delivery.title || '',
    clientName: delivery.clientName || '',
    shootType: delivery.shootType || '',
    format: delivery.format || '',
    kind: delivery.kind || 'showcase',
    status: delivery.status,
    photoCount: assets.length,
    fileBytes: assets.reduce((total, asset) => total + Number(asset.bytes || 0), 0),
    captionCount: assets.filter(asset => String(asset.libraryCaption || asset.caption || '').trim()).length,
    hasMusic: Boolean(delivery.soundtrack?.trackId || delivery.soundtrack?.audioUrl || delivery.soundtrack?.publicId),
    hasNarration: Boolean(delivery.narration?.audioUrl || delivery.narration?.status === 'ready'),
    viewsCount: Number(delivery.viewsCount || 0),
    downloadsCount: Number(delivery.downloadsCount || 0),
    likesCount: Number(delivery.likesCount || 0),
    expiresAt: delivery.access?.expiresAt || null,
    publishedAt: delivery.publishedAt || null,
    updatedAt: delivery.updatedAt,
    createdAt: delivery.createdAt
  };
}

function adminDeliverySummary(delivery, jobs = [], grants = []) {
  const basic = deliverySummary(delivery);
  const frames = Array.isArray(delivery.creativeDirection?.frames) ? delivery.creativeDirection.frames : [];
  const totalPhotos = basic.photoCount || frames.length;
  const captioned = frames.filter(frame => String(frame.caption || '').trim().length >= 18).length;
  const failedJob = jobs.find(job => job.status === 'failed');
  const currentJob = jobs.find(job => ['queued', 'running', 'needs_input'].includes(job.status));
  const activeGrants = grants.filter(grant => !grant.revokedAt && (!grant.expiresAt || new Date(grant.expiresAt) > new Date()));
  return {
    ...basic,
    effectiveStatus: failedJob ? 'failed' : basic.status,
    photographer: delivery.userId ? {
      id: delivery.userId._id || delivery.userId,
      name: delivery.userId.name || '',
      email: delivery.userId.email || '',
      studio: delivery.userId.studio?.name || '',
      avatar: delivery.userId.avatar || '',
      plan: delivery.userId.plan || ''
    } : null,
    captions: { total: totalPhotos, completed: captioned, status: totalPhotos && captioned === totalPhotos ? 'complete' : captioned ? 'partial' : 'missing' },
    music: { status: delivery.soundtrack?.catalogId || delivery.soundtrack?.publicId || delivery.soundtrack?.audioUrl ? 'ready' : 'missing', source: delivery.soundtrack?.source || null, trackId: delivery.soundtrack?.catalogId || delivery.soundtrack?.trackId || null },
    narration: { status: delivery.narration?.status || (delivery.narration?.publicId || delivery.narration?.audioUrl ? 'ready' : 'missing'), voiceId: delivery.narration?.voiceId || null, timingStatus: delivery.narration?.timingStatus || delivery.narration?.alignmentStatus || null, renderVersion: delivery.narration?.renderVersion || null },
    jobs: jobs.map(job => ({ id: job._id, type: job.type, status: job.status, stage: job.stage, progress: job.progress, attempts: job.attempts, errorCode: job.errorCode || null, errorMessage: job.errorMessage || null, createdAt: job.createdAt, updatedAt: job.updatedAt, completedAt: job.completedAt || null })),
    currentJob: currentJob ? { id: currentJob._id, type: currentJob.type, status: currentJob.status, stage: currentJob.stage, progress: currentJob.progress } : null,
    failedJob: failedJob ? { id: failedJob._id, type: failedJob.type, errorCode: failedJob.errorCode || null, errorMessage: failedJob.errorMessage || null } : null,
    access: { hasPin: Boolean(delivery.access?.pinDigest), expiresAt: delivery.access?.expiresAt || null, revokedAt: delivery.access?.revokedAt || null, linkRevoked: Boolean(delivery.access?.revokedAt), allowIndividualDownloads: delivery.access?.allowIndividualDownloads !== false, allowDownloadAll: delivery.access?.allowDownloadAll !== false, allowLikes: delivery.access?.allowLikes !== false },
    shareGrants: { total: grants.length, active: activeGrants.length, roles: activeGrants.reduce((result, grant) => { result[grant.role] = (result[grant.role] || 0) + 1; return result; }, {}) },
    previewUrl: `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/d/${encodeURIComponent(delivery.publicId)}`
  };
}

function health(ok, reason = '', details = {}) {
  return { status: ok ? 'healthy' : 'degraded', ok: Boolean(ok), reason: reason || undefined, ...details };
}

async function databaseHealth() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return health(false, 'Database connection is not ready.');
  const started = Date.now();
  try {
    await mongoose.connection.db.admin().ping();
    return health(true, '', { latencyMs: Date.now() - started });
  } catch (error) {
    return health(false, 'Database ping failed.', { latencyMs: Date.now() - started, errorCode: error.code || 'DB_PING_FAILED' });
  }
}

async function workerHealth() {
  const pipelineEnabled = process.env.DELIVERY_PIPELINE_ENABLED === 'true';
  const definitions = [
    { name: 'retention', enabled: true, staleAfterMs: 7 * 60 * 60 * 1000 },
    { name: 'delivery', enabled: pipelineEnabled, staleAfterMs: 30 * 1000 },
    { name: 'portfolio', enabled: pipelineEnabled, staleAfterMs: 30 * 1000 }
  ];
  const records = await WorkerHeartbeat.find({ workerName: { $in: definitions.map(item => item.name) } }).sort({ heartbeatAt: -1 }).lean();
  return definitions.map(definition => {
    const record = records.find(item => item.workerName === definition.name);
    if (!definition.enabled) return { workerName: definition.name, status: 'disabled', enabled: false, heartbeatAt: record?.heartbeatAt || null };
    const heartbeatAt = record?.heartbeatAt || null;
    const alive = heartbeatAt && Date.now() - new Date(heartbeatAt).getTime() <= definition.staleAfterMs;
    return { workerName: definition.name, enabled: true, status: alive ? (record.status || 'idle') : 'stale', stage: record?.stage || 'not started', heartbeatAt, instance: record?.instance || null };
  });
}

export async function getOperationsOverview(req, res) {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const staleJobAt = new Date(now.getTime() - 5 * 60 * 1000);
  try {
    const [
      totalUsers,
      newAccounts,
      verifiedAccounts,
      onboardingCompleted,
      activeProAccounts,
      activeDeliveries,
      publishedDeliveries,
      activeLegacyStories,
      publishedLegacyStories,
      activeVolumeJobs,
      publishedVolumeJobs,
      failedDeliveryJobs,
      failedPortfolioJobs,
      staleDeliveryJobs,
      stalePortfolioJobs,
      failedUploads,
      storageAgg,
      storageNearLimit,
      paymentEvents,
      failedPayments,
      pastDueSubscriptions,
      database,
      cloudinary,
      workers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      User.countDocuments({ emailVerifiedAt: { $exists: true, $ne: null } }),
      User.countDocuments({ onboardingCompletedAt: { $exists: true, $ne: null } }),
      User.countDocuments({ $or: [{ plan: 'pro' }, { plan: 'studio' }, { 'planOverride.plan': 'pro', $or: [{ 'planOverride.expiresAt': null }, { 'planOverride.expiresAt': { $gt: now } }] }] }),
      Delivery.countDocuments({ status: { $in: ['draft', 'analyzing', 'directing', 'review', 'published'] } }),
      Delivery.countDocuments({ status: 'published' }),
      PhotoStory.countDocuments({ status: { $in: ['draft', 'published'] } }),
      PhotoStory.countDocuments({ status: 'published' }),
      VolumeJob.countDocuments({ status: { $in: ['draft', 'published'] } }),
      VolumeJob.countDocuments({ status: 'published' }),
      DeliveryJob.countDocuments({ status: 'failed', updatedAt: { $gte: dayAgo } }),
      PortfolioJob.countDocuments({ status: 'failed', updatedAt: { $gte: dayAgo } }),
      DeliveryJob.countDocuments({ status: 'running', $or: [{ heartbeatAt: { $lt: staleJobAt } }, { heartbeatAt: { $exists: false } }] }),
      PortfolioJob.countDocuments({ status: 'running', $or: [{ lockedAt: { $lt: staleJobAt } }, { lockedAt: { $exists: false } }] }),
      AnalyticsEvent.countDocuments({ name: 'upload.failed', occurredAt: { $gte: dayAgo } }),
      User.aggregate([{ $group: { _id: null, bytes: { $sum: { $ifNull: ['$storageUsedBytes', 0] } } } }]),
      User.countDocuments({ plan: { $in: ['pro', 'studio'] }, $expr: { $gte: [{ $ifNull: ['$storageUsedBytes', 0] }, PLAN_DEFINITIONS.pro.personalStorageBytes * 0.8] } }),
      BillingEvent.aggregate([{ $match: { createdAt: { $gte: dayAgo } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Payment.countDocuments({ status: { $in: ['failed', 'disputed'] }, updatedAt: { $gte: dayAgo } }),
      Subscription.countDocuments({ status: 'past_due' }),
      databaseHealth(),
      checkCloudinaryConnection(),
      workerHealth()
    ]);

    const analyticsFailures = await AnalyticsEvent.countDocuments({ name: 'ai.job.failed', occurredAt: { $gte: dayAgo } });
    const emailFailures = await AnalyticsEvent.countDocuments({ name: 'email.send.failed', occurredAt: { $gte: dayAgo } });
    const emailSuccesses = await AnalyticsEvent.countDocuments({ name: 'email.send.succeeded', occurredAt: { $gte: dayAgo } });
    const paymentEventCounts = Object.fromEntries(paymentEvents.map(item => [item._id || 'unknown', item.count]));
    const storageBytes = Number(storageAgg[0]?.bytes || 0);
    const providerAiConfigured = process.env.DELIVERY_PIPELINE_ENABLED === 'true' && Boolean(process.env.ALIBABA_MODEL_STUDIO_API_KEY && process.env.ALIBABA_WORKSPACE_ID && process.env.DEEPGRAM_API_KEY);

    res.json({
      success: true,
      data: {
        generatedAt: now,
        telemetry: { eventStore: 'ready', startedAt: now },
        metrics: {
          accounts: { total: totalUsers, newLast30Days: newAccounts, verified: verifiedAccounts, onboardingCompleted, activePro: activeProAccounts },
          deliveries: { active: activeDeliveries + activeLegacyStories + activeVolumeJobs, published: publishedDeliveries + publishedLegacyStories + publishedVolumeJobs, current: activeDeliveries, legacy: activeLegacyStories, volume: activeVolumeJobs },
          jobs: { failedLast24Hours: failedDeliveryJobs + failedPortfolioJobs, failedDelivery: failedDeliveryJobs, failedPortfolio: failedPortfolioJobs, stale: staleDeliveryJobs + stalePortfolioJobs, queueDepth: await DeliveryJob.countDocuments({ status: { $in: ['queued', 'running'] } }) + await PortfolioJob.countDocuments({ status: { $in: ['queued', 'running'] } }) },
          uploads: { failedLast24Hours: failedUploads },
          storage: { usedBytes: storageBytes, usedGb: Number((storageBytes / (1024 ** 3)).toFixed(2)), nearLimitAccounts: storageNearLimit, proLimitBytes: PLAN_DEFINITIONS.pro.personalStorageBytes },
          payments: { billingEventsLast24Hours: paymentEventCounts, failedOrDisputedLast24Hours: failedPayments, pastDueSubscriptions }
        },
        providers: {
          database,
          cloudinary: health(cloudinary.ok, cloudinary.reason),
          ai: health(providerAiConfigured && analyticsFailures === 0, providerAiConfigured ? (analyticsFailures ? `${analyticsFailures} AI jobs failed in the last 24 hours.` : '') : 'Delivery AI configuration is disabled or incomplete.', { configured: providerAiConfigured, failuresLast24Hours: analyticsFailures }),
          email: health(Boolean(process.env.RESEND_API_KEY) && emailFailures === 0, process.env.RESEND_API_KEY ? (emailFailures ? `${emailFailures} email sends failed in the last 24 hours.` : '') : 'RESEND_API_KEY is not configured.', { configured: Boolean(process.env.RESEND_API_KEY), sentLast24Hours: emailSuccesses, failuresLast24Hours: emailFailures }),
          paystack: health(billingConfigured() && failedPayments === 0, billingConfigured() ? (failedPayments ? `${failedPayments} payment failures or disputes were recorded in the last 24 hours.` : '') : 'Paystack billing is disabled or incomplete.', { configured: billingConfigured(), failuresLast24Hours: failedPayments })
        },
        workers
      }
    });
  } catch (error) {
    console.error('[admin/operations]', error.message);
    res.status(500).json({ success: false, message: 'We could not load the operations overview.' });
  }
}

export async function getAdminAnalytics(req, res) {
  try {
    const [totalUsers, legacyStories, totalDeliveries, legacyAgg, deliveryAgg, activeSubscriptions, paymentAgg] = await Promise.all([
      User.countDocuments(),
      PhotoStory.countDocuments(),
      Delivery.countDocuments(),
      PhotoStory.aggregate([
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$viewsCount' },
            totalDownloads: { $sum: '$downloadsCount' },
            totalLikes: { $sum: '$likesCount' }
          }
        }
      ]),
      Delivery.aggregate([{ $group: { _id: null, totalViews: { $sum: '$viewsCount' }, totalDownloads: { $sum: '$downloadsCount' }, totalLikes: { $sum: '$likesCount' } } }]),
      Subscription.countDocuments({ status: { $in: ['active', 'canceling'] }, paidThrough: { $gt: new Date() } }),
      Payment.aggregate([
        { $match: { status: { $in: ['success', 'partially_refunded', 'refunded'] } } },
        { $group: { _id: null, collectedKobo: { $sum: '$amountKobo' }, refundedKobo: { $sum: '$refundedAmountKobo' } } }
      ])
    ]);

    const proUsers = await User.countDocuments({ plan: 'pro' });
    const first = legacyAgg[0] || { totalViews: 0, totalDownloads: 0, totalLikes: 0 };
    const second = deliveryAgg[0] || { totalViews: 0, totalDownloads: 0, totalLikes: 0 };
    const money = paymentAgg[0] || { collectedKobo: 0, refundedKobo: 0 };

    res.json({
      success: true,
      data: {
        totalUsers,
        proUsers,
        totalDeliveries: legacyStories + totalDeliveries,
        publishedDeliveries: await Delivery.countDocuments({ status: 'published' }),
        totalViews: first.totalViews + second.totalViews,
        totalDownloads: first.totalDownloads + second.totalDownloads,
        totalLikes: first.totalLikes + second.totalLikes,
        activeSubscriptions,
        monthlyRecurringRevenueKobo: activeSubscriptions * PRO_PRICE_KOBO,
        netCollectedKobo: Math.max(0, money.collectedKobo - money.refundedKobo)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getAllUsers(req, res) {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const plan = String(req.query.plan || 'all');
    const accountStatus = String(req.query.status || 'all');
    const acquisitionSource = String(req.query.acquisitionSource || 'all');
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 40));
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } },
        { email: { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } },
        { 'studio.name': { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } },
        { 'studio.city': { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } }
      ];
    }
    if (['free', 'pro', 'studio'].includes(plan)) query.plan = plan;
    if (['pending', 'active', 'suspended'].includes(accountStatus)) query.accountStatus = accountStatus;
    if (acquisitionSource && acquisitionSource !== 'all') query['acquisition.source'] = acquisitionSource.slice(0, 50);

    const [users, total] = await Promise.all([
      User.find(query)
        .select('name email role plan planOverride accountStatus emailVerifiedAt avatar studio acquisition onboardingStep onboardingCompletedAt storageUsedBytes storiesCount lastLoginAt createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);
    res.json({ success: true, data: users.map(accountSnapshot), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (err) {
    console.error('[admin/users]', err.message);
    res.status(500).json({ success: false, message: 'We could not load the accounts.' });
  }
}

export async function updateUserPlan(req, res) {
  try {
    const accountId = validId(req.params.id);
    if (!accountId) return res.status(400).json({ success: false, message: 'That account identifier is not valid.' });
    const { plan, role, reason, expiresAt } = req.body;
    const update = {};
    if (plan && !['free', 'pro'].includes(plan)) return res.status(400).json({ success: false, message: 'Choose Free or Pro.' });
    if (role && !['user', 'admin'].includes(role)) return res.status(400).json({ success: false, message: 'Choose a valid account role.' });
    if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) return res.status(400).json({ success: false, message: 'Enter a valid Pro expiry date.' });
    if (plan === 'pro' && expiresAt && new Date(expiresAt) <= new Date()) return res.status(400).json({ success: false, message: 'A Pro expiry date must be in the future.' });
    if (plan) {
      if (plan === 'free') {
        const paid = await Subscription.exists({ userId: accountId, status: { $in: ['active', 'canceling', 'past_due'] }, $or: [{ paidThrough: { $gt: new Date() } }, { graceEndsAt: { $gt: new Date() } }] });
        if (paid) return res.status(409).json({ success: false, message: 'This account still has paid Pro access. Cancel or resolve its subscription before removing Pro.' });
      }
      update.plan = plan;
      update.planOverride = plan === 'pro'
        ? { plan: 'pro', expiresAt: expiresAt ? new Date(expiresAt) : null, reason: safeReason(reason, 'Support grant'), grantedBy: adminId(req) }
        : null;
    }
    if (role) update.role = role;

    const before = await User.findById(accountId).select('name email role plan planOverride accountStatus');
    const user = await User.findByIdAndUpdate(accountId, update, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    await AdminAudit.create({ adminId: adminId(req), userId: user._id, action: 'account.plan_or_role_updated', resourceType: 'User', resourceId: String(user._id), details: { before: accountSnapshot(before), after: accountSnapshot(user), reason: safeReason(reason), expiresAt: expiresAt || null } });
    res.json({ success: true, data: accountSnapshot(user) });
  } catch (err) {
    console.error('[admin/account-plan]', err.message);
    res.status(500).json({ success: false, message: 'We could not update this account.' });
  }
}

async function loadAccountDetail(accountId) {
  const [user, subscriptions, deliveries, stories, volumeJobs, portfolio, storage, sessions, notes, deletionRequests, audit, events] = await Promise.all([
    User.findById(accountId).select('name email role plan planOverride accountStatus emailVerifiedAt avatar studio acquisition onboardingStep onboardingCompletedAt storageUsedBytes storiesCount lastLoginAt createdAt updatedAt').lean(),
    Subscription.find({ userId: accountId }).sort({ createdAt: -1 }).limit(50).select('provider status customerCode subscriptionCode planCode checkoutReference paidFrom paidThrough graceEndsAt cancelRequestedAt canceledAt lastPaymentAt lastPaymentReference createdAt updatedAt').lean(),
    Delivery.find({ userId: accountId }).sort({ updatedAt: -1 }).limit(100).select('publicId title clientName shootType format kind status assets soundtrack narration access publishedAt viewsCount downloadsCount likesCount createdAt updatedAt').lean(),
    PhotoStory.find({ userId: accountId }).sort({ updatedAt: -1 }).limit(100).select('storyId title clientName occasion status photos soundtrack viewsCount downloadsCount likesCount createdAt updatedAt').lean(),
    VolumeJob.find({ userId: accountId }).sort({ updatedAt: -1 }).limit(100).select('publicId title status subjectCount assignedPhotoCount createdAt updatedAt publishedAt').lean(),
    Portfolio.findOne({ userId: accountId }).select('handle previousHandles status studioName bio headline location items direction publishedAt createdAt updatedAt').lean(),
    StorageAsset.aggregate([{ $match: { userId: new mongoose.Types.ObjectId(accountId) } }, { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$bytes', 0] } }, formats: { $addToSet: '$format' }, folders: { $addToSet: '$folder' } } }]),
    Session.find({ userId: accountId }).sort({ createdAt: -1 }).limit(50).select('userAgent ipAddress persistent expiresAt revokedAt createdAt updatedAt').lean(),
    AdminAccountNote.find({ userId: accountId }).sort({ createdAt: -1 }).limit(100).lean(),
    AccountDeletionRequest.find({ userId: accountId }).sort({ requestedAt: -1 }).limit(20).lean(),
    AdminAudit.find({ userId: accountId }).sort({ createdAt: -1 }).limit(50).select('adminId action resourceType resourceId details createdAt').lean(),
    AnalyticsEvent.find({ userId: accountId }).sort({ occurredAt: -1 }).limit(50).select('name source status errorCode format route deviceType durationMs count bytes metadata occurredAt').lean()
  ]);

  if (!user) return null;
  const storageSummary = storage[0] || { count: 0, bytes: 0, formats: [], folders: [] };
  return {
    account: accountSnapshot(user),
    subscriptions,
    deliveries: deliveries.map(deliverySummary),
    legacyStories: stories.map(story => ({
      id: story._id,
      storyId: story.storyId,
      title: story.title || '',
      clientName: story.clientName || '',
      occasion: story.occasion || '',
      status: story.status,
      photoCount: Array.isArray(story.photos) ? story.photos.length : 0,
      viewsCount: Number(story.viewsCount || 0),
      downloadsCount: Number(story.downloadsCount || 0),
      likesCount: Number(story.likesCount || 0),
      hasMusic: Boolean(story.soundtrack?.audioUrl),
      createdAt: story.createdAt,
      updatedAt: story.updatedAt
    })),
    volumeDeliveries: volumeJobs,
    portfolio: portfolio ? {
      id: portfolio._id,
      handle: portfolio.handle,
      previousHandles: portfolio.previousHandles || [],
      status: portfolio.status,
      studioName: portfolio.studioName,
      bioPresent: Boolean(String(portfolio.bio || '').trim()),
      itemCount: Array.isArray(portfolio.items) ? portfolio.items.length : 0,
      direction: portfolio.direction || {},
      publishedAt: portfolio.publishedAt || null,
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt
    } : null,
    storage: { count: Number(storageSummary.count || 0), bytes: Number(storageSummary.bytes || 0), formats: (storageSummary.formats || []).filter(Boolean).sort(), folders: (storageSummary.folders || []).filter(Boolean).sort() },
    sessions,
    notes,
    deletionRequests,
    audit,
    recentEvents: events
  };
}

export async function getAccountDetail(req, res) {
  try {
    const accountId = validId(req.params.id);
    if (!accountId) return res.status(400).json({ success: false, message: 'That account identifier is not valid.' });
    const detail = await loadAccountDetail(accountId);
    if (!detail) return res.status(404).json({ success: false, message: 'Account not found.' });
    res.json({ success: true, data: detail });
  } catch (error) {
    console.error('[admin/account-detail]', error.message);
    res.status(500).json({ success: false, message: 'We could not load this account.' });
  }
}

export async function adminDeleteAccount(req, res) {
  try {
    const accountId = validId(req.params.id);
    const reason = safeReason(req.body?.reason);
    const confirmation = String(req.body?.confirmation || '').trim();
    if (!accountId) return res.status(400).json({ success: false, message: 'That account identifier is not valid.' });
    if (reason.length < 8) return res.status(400).json({ success: false, message: 'Give a specific reason before deleting an account.' });
    if (confirmation !== 'DELETE') return res.status(400).json({ success: false, message: 'Type DELETE to confirm this permanent action.' });

    const user = await User.findById(accountId).select('name email role plan planOverride accountStatus emailVerifiedAt avatar studio acquisition onboardingStep onboardingCompletedAt storageUsedBytes storiesCount lastLoginAt createdAt updatedAt');
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    if (String(accountId) === String(adminId(req)) || user.role === 'admin') return res.status(409).json({ success: false, message: 'Administrator accounts cannot be deleted from the photographer account workspace.' });

    const administrator = adminId(req);
    try {
      await AdminAudit.create({
        adminId: administrator,
        userId: user._id,
        action: 'account.deletion_started',
        resourceType: 'User',
        resourceId: String(user._id),
        details: { reason, confirmationRequired: true, phase: 'started' },
        before: accountSnapshot(user)
      });
    } catch (auditError) {
      console.error('[admin/account-delete-audit-start]', auditError.message);
      return res.status(503).json({ success: false, code: 'AUDIT_UNAVAILABLE', message: 'The deletion audit is unavailable. The account was not changed. Try again shortly.' });
    }

    const result = await deleteUserAccount({ userId: user._id });
    try {
      await AdminAudit.create({
        adminId: administrator,
        userId: user._id,
        action: 'account.deleted_by_admin',
        resourceType: 'User',
        resourceId: String(user._id),
        details: { reason, deleted: result.deleted, cancelledSubscription: result.cancelledSubscription, mediaRemoved: result.mediaRemoved, phase: 'completed' },
        before: result.before,
        after: { deleted: true }
      });
    } catch (auditError) {
      // The deletion-started audit row remains immutable evidence if the
      // completion row cannot be written after the account is gone.
      console.error('[admin/account-delete-audit]', auditError.message);
    }

    res.json({ success: true, data: { accountId: result.accountId, deleted: result.deleted, cancelledSubscription: result.cancelledSubscription, mediaRemoved: result.mediaRemoved }, message: 'The photographer account and its data have been permanently deleted.' });
  } catch (error) {
    console.error('[admin/account-delete]', error.code || error.name || 'delete_error', error.message);
    const status = error instanceof AccountDeletionError && Number.isInteger(error.status) ? error.status : 500;
    const message = error instanceof AccountDeletionError ? error.message : 'We could not delete this account. Nothing else was changed. Please try again.';
    res.status(status).json({ success: false, code: error.code || 'ACCOUNT_DELETION_FAILED', message });
  }
}

export async function updateAccountStatus(req, res) {
  try {
    const accountId = validId(req.params.id);
    const status = String(req.body.status || '').trim();
    if (!accountId || !['active', 'suspended'].includes(status)) return res.status(400).json({ success: false, message: 'Choose Active or Suspended.' });
    const user = await User.findById(accountId).select('name email role plan planOverride accountStatus');
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const before = accountSnapshot(user);
    user.accountStatus = status;
    await user.save();
    let revokedSessions = 0;
    if (status === 'suspended') {
      const result = await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
      revokedSessions = result.modifiedCount || 0;
    }
    await AdminAudit.create({ adminId: adminId(req), userId: user._id, action: status === 'suspended' ? 'account.suspended' : 'account.reactivated', resourceType: 'User', resourceId: String(user._id), details: { before, after: accountSnapshot(user), reason: safeReason(req.body.reason, status === 'suspended' ? 'Suspended by administrator' : 'Reactivated by administrator'), revokedSessions } });
    res.json({ success: true, data: accountSnapshot(user), revokedSessions });
  } catch (error) {
    console.error('[admin/account-status]', error.message);
    res.status(500).json({ success: false, message: 'We could not change this account status.' });
  }
}

export async function forceLogoutAccount(req, res) {
  try {
    const accountId = validId(req.params.id);
    if (!accountId) return res.status(400).json({ success: false, message: 'That account identifier is not valid.' });
    const user = await User.findById(accountId).select('_id name email');
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const result = await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await AdminAudit.create({ adminId: adminId(req), userId: user._id, action: 'account.sessions_revoked', resourceType: 'User', resourceId: String(user._id), details: { revokedSessions: result.modifiedCount || 0, reason: safeReason(req.body.reason, 'Sessions revoked by administrator') } });
    res.json({ success: true, revokedSessions: result.modifiedCount || 0 });
  } catch (error) {
    console.error('[admin/account-logout]', error.message);
    res.status(500).json({ success: false, message: 'We could not sign this account out everywhere.' });
  }
}

export async function addAccountNote(req, res) {
  try {
    const accountId = validId(req.params.id);
    const note = String(req.body.note || '').replace(/[<>]/g, '').trim().slice(0, 2000);
    const category = String(req.body.category || 'general');
    if (!accountId || !note) return res.status(400).json({ success: false, message: 'Write a note before saving it.' });
    if (!['general', 'support', 'billing', 'privacy', 'technical'].includes(category)) return res.status(400).json({ success: false, message: 'Choose a valid note category.' });
    const user = await User.findById(accountId).select('_id');
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const created = await AdminAccountNote.create({ userId: user._id, adminId: adminId(req), category, note });
    await AdminAudit.create({ adminId: adminId(req), userId: user._id, action: 'account.note_added', resourceType: 'AdminAccountNote', resourceId: String(created._id), details: { category } });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('[admin/account-note]', error.message);
    res.status(500).json({ success: false, message: 'We could not save this account note.' });
  }
}

export async function deleteAccountNote(req, res) {
  try {
    const noteId = validId(req.params.noteId);
    if (!noteId) return res.status(400).json({ success: false, message: 'That note identifier is not valid.' });
    const note = await AdminAccountNote.findByIdAndDelete(noteId);
    if (!note) return res.status(404).json({ success: false, message: 'Account note not found.' });
    await AdminAudit.create({ adminId: adminId(req), userId: note.userId, action: 'account.note_deleted', resourceType: 'AdminAccountNote', resourceId: String(note._id), details: { category: note.category } });
    res.json({ success: true });
  } catch (error) {
    console.error('[admin/account-note-delete]', error.message);
    res.status(500).json({ success: false, message: 'We could not remove this account note.' });
  }
}

export async function exportAccountData(req, res) {
  try {
    const accountId = validId(req.params.id);
    if (!accountId) return res.status(400).json({ success: false, message: 'That account identifier is not valid.' });
    const detail = await loadAccountDetail(accountId);
    if (!detail) return res.status(404).json({ success: false, message: 'Account not found.' });
    const payload = { exportedAt: new Date().toISOString(), exportVersion: 1, ...detail, sessions: detail.sessions.map(session => ({ ...session, ipAddress: session.ipAddress ? '[redacted in export]' : '' })) };
    await AdminAudit.create({ adminId: adminId(req), userId: accountId, action: 'account.data_exported', resourceType: 'User', resourceId: String(accountId), details: { exportVersion: 1 } });
    res.setHeader('Content-Disposition', `attachment; filename="veylo-account-${accountId}.json"`);
    res.json({ success: true, data: payload });
  } catch (error) {
    console.error('[admin/account-export]', error.message);
    res.status(500).json({ success: false, message: 'We could not export this account.' });
  }
}

export async function createSupportAccess(req, res) {
  try {
    const accountId = validId(req.params.id);
    const reason = safeReason(req.body.reason);
    if (!accountId || reason.length < 8) return res.status(400).json({ success: false, message: 'Give a short reason for support access.' });
    const user = await User.findById(accountId).select('_id name email accountStatus');
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await SupportAccessGrant.updateMany({ userId: user._id, status: 'active' }, { $set: { status: 'revoked', revokedAt: new Date() } });
    const grant = await SupportAccessGrant.create({ userId: user._id, adminId: adminId(req), tokenDigest: tokenDigest(rawToken), reason, expiresAt, readOnly: true });
    await AdminAudit.create({ adminId: adminId(req), userId: user._id, action: 'account.support_access_created', resourceType: 'SupportAccessGrant', resourceId: String(grant._id), details: { expiresAt, readOnly: true, reason } });
    res.status(201).json({ success: true, data: { token: rawToken, expiresAt, readOnly: true, user: { id: user._id, name: user.name, email: user.email, accountStatus: user.accountStatus } } });
  } catch (error) {
    console.error('[admin/support-access]', error.message);
    res.status(500).json({ success: false, message: 'We could not create support access.' });
  }
}

export async function exchangeSupportAccess(req, res) {
  try {
    const rawToken = String(req.body.token || '').trim();
    if (!rawToken || rawToken.length < 30) return res.status(400).json({ success: false, message: 'This support link is not valid.' });
    const grant = await SupportAccessGrant.findOne({ tokenDigest: tokenDigest(rawToken), status: 'active', expiresAt: { $gt: new Date() } }).select('+tokenDigest');
    if (!grant) return res.status(404).json({ success: false, message: 'This support link has expired or was already used.' });
    const detail = await loadAccountDetail(grant.userId);
    if (!detail) return res.status(404).json({ success: false, message: 'Account not found.' });
    grant.status = 'used';
    grant.usedAt = new Date();
    await grant.save();
    await AdminAudit.create({ adminId: grant.adminId, userId: grant.userId, action: 'account.support_access_used', resourceType: 'SupportAccessGrant', resourceId: String(grant._id), details: { readOnly: true } });
    res.json({ success: true, data: { readOnly: true, expiresAt: grant.expiresAt, account: detail } });
  } catch (error) {
    console.error('[admin/support-access-exchange]', error.message);
    res.status(500).json({ success: false, message: 'We could not open this support view.' });
  }
}

export async function getDeletionRequests(req, res) {
  try {
    const status = String(req.query.status || 'all');
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 40));
    const query = ['pending', 'approved', 'rejected', 'processing', 'completed'].includes(status) ? { status } : {};
    const [requests, total] = await Promise.all([
      AccountDeletionRequest.find(query).populate('userId', 'name email studio.name accountStatus').sort({ requestedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AccountDeletionRequest.countDocuments(query)
    ]);
    res.json({ success: true, data: requests, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
    console.error('[admin/deletion-requests]', error.message);
    res.status(500).json({ success: false, message: 'We could not load deletion requests.' });
  }
}

export async function updateDeletionRequest(req, res) {
  try {
    const requestId = validId(req.params.requestId);
    const status = String(req.body.status || '').trim();
    if (!requestId || !['approved', 'rejected', 'processing', 'completed'].includes(status)) return res.status(400).json({ success: false, message: 'Choose a valid deletion request status.' });
    const request = await AccountDeletionRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Deletion request not found.' });
    const before = { status: request.status, resolutionNote: request.resolutionNote || '' };
    request.status = status;
    request.resolutionNote = String(req.body.resolutionNote || '').replace(/[<>]/g, '').trim().slice(0, 1000);
    request.resolvedBy = adminId(req);
    request.resolvedAt = new Date();
    await request.save();
    await AdminAudit.create({ adminId: adminId(req), userId: request.userId, action: 'account.deletion_request_updated', resourceType: 'AccountDeletionRequest', resourceId: String(request._id), details: { before, after: { status, resolutionNote: request.resolutionNote } } });
    res.json({ success: true, data: request });
  } catch (error) {
    console.error('[admin/deletion-request-update]', error.message);
    res.status(500).json({ success: false, message: 'We could not update this deletion request.' });
  }
}

export async function getAllDeliveries(req, res) {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const format = String(req.query.format || 'all');
    const status = String(req.query.status || 'all');
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 40));
    const query = {};
    const searchOr = [];
    if (search) {
      const pattern = { $regex: escaped(search), $options: 'i' };
      searchOr.push({ title: pattern }, { clientName: pattern }, { shootType: pattern }, { publicId: pattern });
      if (mongoose.isValidObjectId(search)) searchOr.push({ _id: new mongoose.Types.ObjectId(search) });
      const matchingUsers = await User.find({ $or: [{ name: pattern }, { email: pattern }, { 'studio.name': pattern }] }).select('_id').limit(200).lean();
      if (matchingUsers.length) searchOr.push({ userId: { $in: matchingUsers.map(user => user._id) } });
      query.$or = searchOr;
    }
    if (['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign'].includes(format)) query.format = format;
    if (['draft', 'analyzing', 'directing', 'review', 'published', 'archived'].includes(status)) query.status = status;
    let failedDeliveryIds = [];
    if (status === 'failed') {
      failedDeliveryIds = await DeliveryJob.distinct('deliveryId', { status: 'failed' });
      query._id = { $in: failedDeliveryIds };
      delete query.status;
    }

    const [deliveries, total] = await Promise.all([
      Delivery.find(query).populate('userId', 'name email studio.name avatar plan').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).select('+access.pinDigest').lean(),
      Delivery.countDocuments(query)
    ]);
    const deliveryIds = deliveries.map(delivery => delivery._id);
    const [jobs, grants] = await Promise.all([
      deliveryIds.length ? DeliveryJob.find({ deliveryId: { $in: deliveryIds } }).sort({ updatedAt: -1 }).lean() : [],
      deliveryIds.length ? DeliveryShareGrant.find({ deliveryId: { $in: deliveryIds } }).select('-tokenDigest').lean() : []
    ]);
    const data = deliveries.map(delivery => adminDeliverySummary(delivery, jobs.filter(job => String(job.deliveryId) === String(delivery._id)), grants.filter(grant => String(grant.deliveryId) === String(delivery._id))));
    res.json({ success: true, data, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
    console.error('[admin/deliveries]', error.message);
    res.status(500).json({ success: false, message: 'We could not load the deliveries.' });
  }
}

export async function getAdminDeliveryDetail(req, res) {
  try {
    const identifier = String(req.params.id || '').trim();
    if (!identifier || identifier.length > 200) return res.status(400).json({ success: false, message: 'That delivery identifier is not valid.' });
    const identifierQuery = mongoose.isValidObjectId(identifier)
      ? { $or: [{ _id: new mongoose.Types.ObjectId(identifier) }, { publicId: identifier }] }
      : { publicId: identifier };
    const delivery = await Delivery.findOne(identifierQuery).populate('userId', 'name email studio.name avatar plan').select('+access.pinDigest').lean();
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    const [jobs, grants] = await Promise.all([
      DeliveryJob.find({ deliveryId: delivery._id }).sort({ createdAt: -1 }).lean(),
      DeliveryShareGrant.find({ deliveryId: delivery._id }).select('-tokenDigest').sort({ createdAt: -1 }).lean()
    ]);
    const summary = adminDeliverySummary(delivery, jobs, grants);
    const captions = (delivery.creativeDirection?.frames || []).map(frame => ({ assetId: frame.assetId, headline: frame.headline || '', caption: frame.caption || '' }));
    res.json({ success: true, data: { ...summary, title: delivery.title || '', clientName: delivery.clientName || '', shootType: delivery.shootType || '', brief: delivery.brief || '', assets: (delivery.assets || []).map(asset => ({ assetId: asset.assetId, publicId: asset.publicId, originalFilename: asset.originalFilename || '', format: asset.format || '', width: asset.width || null, height: asset.height || null, bytes: asset.bytes || 0, sortOrder: asset.sortOrder || 0 })), captions, sections: delivery.creativeDirection?.sections || [], shareGrants: grants.map(grant => ({ id: grant._id, role: grant.role, label: grant.label, assetCount: grant.assetIds?.length || 0, sectionCount: grant.sectionIds?.length || 0, allowIndividualDownloads: Boolean(grant.allowIndividualDownloads), allowDownloadAll: Boolean(grant.allowDownloadAll), usageTerms: grant.usageTerms || '', expiresAt: grant.expiresAt || null, revokedAt: grant.revokedAt || null, createdAt: grant.createdAt })), rawStatus: delivery.status } });
  } catch (error) {
    console.error('[admin/delivery-detail]', error.message);
    res.status(500).json({ success: false, message: 'We could not load this delivery.' });
  }
}

async function findAdminDelivery(identifier) {
  const value = String(identifier || '').trim();
  if (!value || value.length > 200) return null;
  const query = mongoose.isValidObjectId(value) ? { $or: [{ _id: new mongoose.Types.ObjectId(value) }, { publicId: value }] } : { publicId: value };
  return Delivery.findOne(query);
}

export async function adminPublishDelivery(req, res) {
  try {
    const delivery = await findAdminDelivery(req.params.id);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    if (!delivery.assets?.length || !delivery.creativeDirection || !delivery.reviewApprovedAt) return res.status(409).json({ success: false, message: 'This delivery still needs an approved creative review before it can be published.' });
    delivery.access = delivery.access || {};
    const before = { status: delivery.status, revokedAt: delivery.access?.revokedAt || null };
    delivery.status = 'published';
    delivery.publishedAt = delivery.publishedAt || new Date();
    delivery.access.revokedAt = undefined;
    await delivery.save();
    await AdminAudit.create({ adminId: adminId(req), userId: delivery.userId, action: 'delivery.published_by_admin', resourceType: 'Delivery', resourceId: String(delivery._id), details: { before, after: { status: delivery.status, revokedAt: null } } });
    res.json({ success: true, data: { publicId: delivery.publicId, previewUrl: `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/d/${encodeURIComponent(delivery.publicId)}` } });
  } catch (error) {
    console.error('[admin/delivery-publish]', error.message);
    res.status(500).json({ success: false, message: 'We could not publish this delivery.' });
  }
}

export async function adminArchiveDelivery(req, res) {
  try {
    const delivery = await findAdminDelivery(req.params.id);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    if (delivery.status === 'archived') return res.json({ success: true, data: { status: delivery.status } });
    const before = { status: delivery.status };
    delivery.archivedFromStatus = delivery.status;
    delivery.status = 'archived';
    delivery.archivedAt = new Date();
    await delivery.save();
    await AdminAudit.create({ adminId: adminId(req), userId: delivery.userId, action: 'delivery.archived_by_admin', resourceType: 'Delivery', resourceId: String(delivery._id), details: { before, after: { status: delivery.status }, reason: safeReason(req.body.reason, 'Archived by administrator') } });
    res.json({ success: true, data: { status: delivery.status } });
  } catch (error) {
    console.error('[admin/delivery-archive]', error.message);
    res.status(500).json({ success: false, message: 'We could not archive this delivery.' });
  }
}

export async function adminRestoreDelivery(req, res) {
  try {
    const delivery = await findAdminDelivery(req.params.id);
    if (!delivery || delivery.status !== 'archived') return res.status(404).json({ success: false, message: 'Archived delivery not found.' });
    const restoreStatus = ['draft', 'review', 'published'].includes(delivery.archivedFromStatus) ? delivery.archivedFromStatus : 'draft';
    delivery.status = restoreStatus;
    delivery.archivedAt = undefined;
    delivery.archivedFromStatus = undefined;
    await delivery.save();
    await AdminAudit.create({ adminId: adminId(req), userId: delivery.userId, action: 'delivery.restored_by_admin', resourceType: 'Delivery', resourceId: String(delivery._id), details: { after: { status: restoreStatus } } });
    res.json({ success: true, data: { status: restoreStatus } });
  } catch (error) {
    console.error('[admin/delivery-restore]', error.message);
    res.status(500).json({ success: false, message: 'We could not restore this delivery.' });
  }
}

export async function adminRevokeDeliveryLink(req, res) {
  try {
    const delivery = await findAdminDelivery(req.params.id);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    delivery.access = delivery.access || {};
    delivery.access.revokedAt = new Date();
    await delivery.save();
    await AdminAudit.create({ adminId: adminId(req), userId: delivery.userId, action: 'delivery.link_revoked_by_admin', resourceType: 'Delivery', resourceId: String(delivery._id), details: { revokedAt: delivery.access.revokedAt, reason: safeReason(req.body.reason, 'Client link revoked by administrator') } });
    res.json({ success: true, data: { revokedAt: delivery.access.revokedAt } });
  } catch (error) {
    console.error('[admin/delivery-revoke]', error.message);
    res.status(500).json({ success: false, message: 'We could not revoke this client link.' });
  }
}

export async function adminDeleteDelivery(req, res) {
  try {
    const delivery = await findAdminDelivery(req.params.id);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    const deliveryId = delivery._id;
    const userId = delivery.userId;
    const result = await Delivery.deleteOne({ _id: deliveryId });
    if (!result.deletedCount) return res.status(404).json({ success: false, message: 'Delivery was already removed.' });
    await Promise.allSettled([DeliveryJob.deleteMany({ deliveryId }), DeliveryShareGrant.deleteMany({ deliveryId }), PhotoLike.deleteMany({ deliveryId }), DeliveryView.deleteMany({ deliveryId })]);
    void removeDeliveryMedia(userId, deliveryId).catch(error => console.error('[admin/delivery-media-cleanup]', error.message));
    await AdminAudit.create({ adminId: adminId(req), userId, action: 'delivery.deleted_by_admin', resourceType: 'Delivery', resourceId: String(deliveryId), details: { publicId: delivery.publicId, reason: safeReason(req.body.reason, 'Deleted by administrator') } });
    res.json({ success: true, message: 'Delivery deleted and its client link disabled.' });
  } catch (error) {
    console.error('[admin/delivery-delete]', error.message);
    res.status(500).json({ success: false, message: 'We could not delete this delivery.' });
  }
}

export async function adminRetryDeliveryJob(req, res) {
  try {
    const job = await DeliveryJob.findById(req.params.jobId);
    if (!job || job.status !== 'failed') return res.status(409).json({ success: false, message: 'This job is not waiting to be retried.' });
    job.status = 'queued';
    job.stage = 'queued';
    job.errorCode = undefined;
    job.errorMessage = undefined;
    job.completedAt = undefined;
    if (job.attempts >= 3) { job.attempts = 0; job.cursor = 0; job.result = undefined; }
    await job.save();
    await AdminAudit.create({ adminId: adminId(req), userId: job.userId, action: 'delivery.job_retried_by_admin', resourceType: 'DeliveryJob', resourceId: String(job._id), details: { deliveryId: job.deliveryId, type: job.type } });
    res.status(202).json({ success: true, data: { id: job._id, status: job.status, type: job.type } });
  } catch (error) {
    console.error('[admin/delivery-job-retry]', error.message);
    res.status(500).json({ success: false, message: 'We could not retry this job.' });
  }
}

function aiJobSummary(job, kind, delivery = null, portfolio = null) {
  const lockDate = job.heartbeatAt || job.lockedAt || null;
  const stale = job.status === 'running' && (!lockDate || Date.now() - new Date(lockDate).getTime() > 5 * 60 * 1000);
  return {
    id: job._id,
    kind,
    type: kind === 'portfolio' ? 'portfolio' : job.type,
    status: stale ? 'stale' : job.status,
    rawStatus: job.status,
    stage: job.stage || 'queued',
    progress: Number(job.progress || 0),
    attempts: Number(job.attempts || 0),
    provider: job.provider || (job.type === 'narrate' ? 'Deepgram Flux' : 'Alibaba Model Studio'),
    promptVersion: job.promptVersion || null,
    renderVersion: job.renderVersion || null,
    providerLatencyMs: Number(job.providerLatencyMs || 0),
    captionFailures: Number(job.captionFailures || 0),
    timingFailures: Number(job.timingFailures || 0),
    errorCode: job.errorCode || null,
    errorMessage: job.errorMessage || null,
    cancelRequestedAt: job.cancelRequestedAt || null,
    cancelledAt: job.cancelledAt || null,
    stale,
    delivery: delivery ? { id: delivery._id, publicId: delivery.publicId, title: delivery.title || '', format: delivery.format || '', status: delivery.status, userId: delivery.userId?._id || delivery.userId, photographer: delivery.userId?.name || '', studio: delivery.userId?.studio?.name || '' } : null,
    portfolio: portfolio ? { id: portfolio._id, handle: portfolio.handle, studioName: portfolio.studioName || '', userId: portfolio.userId?._id || portfolio.userId } : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || null,
    heartbeatAt: job.heartbeatAt || null,
    lockedAt: job.lockedAt || null
  };
}

export async function getAiJobs(req, res) {
  try {
    const status = String(req.query.status || 'all');
    const type = String(req.query.type || 'all');
    const search = String(req.query.search || '').trim().slice(0, 100);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const jobQuery = {};
    if (['queued', 'running', 'needs_input', 'review', 'failed', 'cancelled'].includes(status)) jobQuery.status = status;
    if (['analyze', 'direct', 'revise', 'narrate'].includes(type)) jobQuery.type = type;
    if (search) {
      const pattern = { $regex: escaped(search), $options: 'i' };
      const matchingDeliveries = await Delivery.find({ $or: [{ title: pattern }, { clientName: pattern }, { publicId: pattern }] }).select('_id').limit(200).lean();
      jobQuery.$or = [{ stage: pattern }, { errorCode: pattern }, { errorMessage: pattern }, ...(matchingDeliveries.length ? [{ deliveryId: { $in: matchingDeliveries.map(item => item._id) } }] : [])];
    }
    const portfolioQuery = {};
    if (status !== 'all' && ['queued', 'running', 'review', 'failed', 'cancelled'].includes(status)) portfolioQuery.status = status;
    const [deliveryJobs, portfolioJobs] = await Promise.all([
      DeliveryJob.find(jobQuery).sort({ updatedAt: -1 }).limit(500).populate({ path: 'deliveryId', select: 'publicId title format status userId', populate: { path: 'userId', select: 'name studio.name' } }).lean(),
      type === 'all' || type === 'portfolio' ? PortfolioJob.find(portfolioQuery).sort({ updatedAt: -1 }).limit(500).populate({ path: 'portfolioId', select: 'handle studioName userId', populate: { path: 'userId', select: 'name' } }).lean() : []
    ]);
    let data = [
      ...deliveryJobs.map(job => aiJobSummary(job, 'delivery', job.deliveryId)),
      ...portfolioJobs.map(job => aiJobSummary(job, 'portfolio', null, job.portfolioId))
    ];
    if (type === 'portfolio') data = data.filter(job => job.kind === 'portfolio');
    if (status === 'stale') data = data.filter(job => job.stale);
    data.sort((left, right) => new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt));
    const total = data.length;
    const paged = data.slice((page - 1) * limit, page * limit);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [queuedDelivery, queuedPortfolio, failedDelivery, failedPortfolio, staleDelivery, stalePortfolio, captionFailures, timingFailures, staleNarration, providerLatency] = await Promise.all([
      DeliveryJob.countDocuments({ status: { $in: ['queued', 'running'] } }),
      PortfolioJob.countDocuments({ status: { $in: ['queued', 'running'] } }),
      DeliveryJob.countDocuments({ status: 'failed', updatedAt: { $gte: dayAgo } }),
      PortfolioJob.countDocuments({ status: 'failed', updatedAt: { $gte: dayAgo } }),
      DeliveryJob.countDocuments({ status: 'running', $or: [{ heartbeatAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }, { heartbeatAt: { $exists: false } }] }),
      PortfolioJob.countDocuments({ status: 'running', lockedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }),
      DeliveryJob.countDocuments({ captionFailures: { $gt: 0 } }) + AnalyticsEvent.countDocuments({ name: 'ai.job.failed', errorCode: { $in: ['CAPTIONS_REQUIRED', 'INVALID_MODEL_OUTPUT'] } }),
      DeliveryJob.countDocuments({ timingFailures: { $gt: 0 } }) + AnalyticsEvent.countDocuments({ name: 'ai.job.failed', errorCode: 'NARRATION_TIMING_FAILED' }),
      Delivery.countDocuments({ 'narration.renderVersion': { $exists: true, $ne: NARRATION_RENDER_VERSION } }),
      AnalyticsEvent.aggregate([{ $match: { name: { $in: ['ai.job.completed', 'ai.job.failed'] }, occurredAt: { $gte: dayAgo }, durationMs: { $gt: 0 } } }, { $group: { _id: '$metadata.provider', samples: { $sum: 1 }, averageMs: { $avg: '$durationMs' }, maxMs: { $max: '$durationMs' } } }, { $sort: { averageMs: -1 } }])
    ]);
    res.json({ success: true, data: paged, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }, summary: { queueDepth: queuedDelivery + queuedPortfolio, queuedDelivery, queuedPortfolio, failedLast24Hours: failedDelivery + failedPortfolio, stale: staleDelivery + stalePortfolio, captionFailures, timingFailures, staleNarration, providerLatency: providerLatency.map(item => ({ provider: item._id || 'unknown', samples: item.samples, averageMs: Math.round(item.averageMs || 0), maxMs: Math.round(item.maxMs || 0) })) } });
  } catch (error) {
    console.error('[admin/ai-jobs]', error.message);
    res.status(500).json({ success: false, message: 'We could not load AI jobs.' });
  }
}

async function findAiJob(jobId) {
  const id = validId(jobId);
  if (!id) return null;
  const delivery = await DeliveryJob.findById(id);
  if (delivery) return { job: delivery, kind: 'delivery' };
  const portfolio = await PortfolioJob.findById(id);
  return portfolio ? { job: portfolio, kind: 'portfolio' } : null;
}

export async function adminRetryAiJob(req, res) {
  try {
    const found = await findAiJob(req.params.jobId);
    if (!found || found.job.status !== 'failed') return res.status(409).json({ success: false, message: 'This job is not waiting to be retried.' });
    const job = found.job;
    job.status = 'queued';
    job.stage = 'queued';
    job.errorCode = undefined;
    job.errorMessage = undefined;
    job.cancelRequestedAt = undefined;
    job.cancelledAt = undefined;
    job.completedAt = undefined;
    if (job.attempts >= 3) { job.attempts = 0; job.cursor = 0; job.result = undefined; }
    await job.save();
    await AdminAudit.create({ adminId: adminId(req), userId: job.userId, action: 'ai.job_retried_by_admin', resourceType: found.kind === 'delivery' ? 'DeliveryJob' : 'PortfolioJob', resourceId: String(job._id), details: { type: job.type || 'portfolio', provider: job.provider || null } });
    res.status(202).json({ success: true, data: { id: job._id, kind: found.kind, status: job.status } });
  } catch (error) {
    console.error('[admin/ai-job-retry]', error.message);
    res.status(500).json({ success: false, message: 'We could not retry this job.' });
  }
}

export async function adminCancelAiJob(req, res) {
  try {
    const found = await findAiJob(req.params.jobId);
    if (!found || !['queued', 'running'].includes(found.job.status)) return res.status(409).json({ success: false, message: 'Only queued or running jobs can be cancelled.' });
    const job = found.job;
    const now = new Date();
    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.stage = 'cancelled';
      job.cancelledAt = now;
      job.completedAt = now;
    } else {
      job.cancelRequestedAt = now;
      job.stage = 'cancelling';
    }
    await job.save();
    await AdminAudit.create({ adminId: adminId(req), userId: job.userId, action: 'ai.job_cancelled_by_admin', resourceType: found.kind === 'delivery' ? 'DeliveryJob' : 'PortfolioJob', resourceId: String(job._id), details: { type: job.type || 'portfolio', status: job.status } });
    res.json({ success: true, data: { id: job._id, kind: found.kind, status: job.status, cancelRequestedAt: job.cancelRequestedAt || null } });
  } catch (error) {
    console.error('[admin/ai-job-cancel]', error.message);
    res.status(500).json({ success: false, message: 'We could not cancel this job.' });
  }
}

export async function getClientAccessOverview(req, res) {
  try {
    const days = Math.min(90, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const search = String(req.query.search || '').trim().slice(0, 100);
    const query = { status: { $in: ['published', 'archived', 'review', 'draft'] } };
    if (search) {
      const pattern = { $regex: escaped(search), $options: 'i' };
      const matchingUsers = await User.find({ $or: [{ name: pattern }, { email: pattern }, { 'studio.name': pattern }] }).select('_id').limit(200).lean();
      query.$or = [{ publicId: pattern }, { title: pattern }, { clientName: pattern }, ...(matchingUsers.length ? [{ userId: { $in: matchingUsers.map(user => user._id) } }] : [])];
    }
    const deliveries = await Delivery.find(query).populate('userId', 'name studio.name').sort({ updatedAt: -1 }).limit(200).select('publicId title clientName format status userId viewsCount downloadsCount likesCount access').lean();
    const deliveryIds = deliveries.map(delivery => delivery._id);
    const [eventCounts, visitorCounts, repeatPairs, likeCounts, grantCounts, volumeCodeCounts] = await Promise.all([
      AnalyticsEvent.aggregate([{ $match: { deliveryId: { $in: deliveryIds }, occurredAt: { $gte: since } } }, { $group: { _id: { deliveryId: '$deliveryId', name: '$name' }, count: { $sum: 1 } } }]),
      DeliveryView.aggregate([{ $match: { deliveryId: { $in: deliveryIds } } }, { $group: { _id: '$deliveryId', uniqueVisitors: { $sum: 1 } } }]),
      AnalyticsEvent.aggregate([{ $match: { name: 'client.delivery.opened', deliveryId: { $in: deliveryIds }, sessionDigest: { $exists: true, $ne: null }, occurredAt: { $gte: since } } }, { $group: { _id: { deliveryId: '$deliveryId', sessionDigest: '$sessionDigest' }, opens: { $sum: 1 } } }, { $match: { opens: { $gt: 1 } } }, { $group: { _id: '$_id.deliveryId', repeatVisitors: { $sum: 1 } } }]),
      PhotoLike.aggregate([{ $match: { deliveryId: { $in: deliveryIds } } }, { $group: { _id: '$deliveryId', likes: { $sum: 1 } } }]),
      DeliveryShareGrant.aggregate([{ $match: { deliveryId: { $in: deliveryIds } } }, { $group: { _id: { deliveryId: '$deliveryId', role: '$role' }, total: { $sum: 1 }, active: { $sum: { $cond: [{ $and: [{ $eq: ['$revokedAt', null] }, { $or: [{ $eq: ['$expiresAt', null] }, { $gt: ['$expiresAt', new Date()] }] }] }, 1, 0] } }, opens: { $sum: '$openCount' }, downloads: { $sum: '$downloadCount' } } }]),
      AnalyticsEvent.aggregate([{ $match: { name: { $in: ['volume.access_code.requested', 'volume.access_code.verified', 'volume.access_code.failed', 'volume.recipient_gallery.opened'] }, occurredAt: { $gte: since } } }, { $group: { _id: { name: '$name', status: '$status' }, count: { $sum: 1 } } }])
    ]);
    const eventMap = new Map(eventCounts.map(item => [`${item._id.deliveryId}:${item._id.name}`, item.count]));
    const visitorMap = new Map(visitorCounts.map(item => [String(item._id), item.uniqueVisitors]));
    const repeatMap = new Map(repeatPairs.map(item => [String(item._id), item.repeatVisitors]));
    const likeMap = new Map(likeCounts.map(item => [String(item._id), item.likes]));
    const grantMap = new Map();
    grantCounts.forEach(item => { const key = String(item._id.deliveryId); const current = grantMap.get(key) || { total: 0, active: 0, opens: 0, downloads: 0, roles: {} }; current.total += item.total; current.active += item.active; current.opens += item.opens || 0; current.downloads += item.downloads || 0; current.roles[item._id.role] = { total: item.total, active: item.active }; grantMap.set(key, current); });
    const volumeAccess = Object.fromEntries(volumeCodeCounts.map(item => [`${item._id.name}:${item._id.status}`, item.count]));
    const data = deliveries.map(delivery => {
      const id = String(delivery._id);
      const grants = grantMap.get(id) || { total: 0, active: 0, opens: 0, downloads: 0, roles: {} };
      return { id: delivery._id, publicId: delivery.publicId, title: delivery.title || delivery.clientName || 'Untitled delivery', format: delivery.format || '', status: delivery.status, photographer: delivery.userId?.studio?.name || delivery.userId?.name || 'Independent photographer', opens: eventMap.get(`${id}:client.delivery.opened`) || Number(delivery.viewsCount || 0), uniqueVisitors: visitorMap.get(id) || 0, repeatVisitors: repeatMap.get(id) || 0, pinFailures: eventMap.get(`${id}:client.delivery.pin_failed`) || 0, downloadsRequested: eventMap.get(`${id}:client.delivery.download_requested`) || 0, downloadsCompleted: eventMap.get(`${id}:client.delivery.download_completed`) || Number(delivery.downloadsCount || 0), likes: likeMap.get(id) || Number(delivery.likesCount || 0), shareGrants: grants, expired: Boolean(delivery.access?.expiresAt && new Date(delivery.access.expiresAt) <= new Date()), revoked: Boolean(delivery.access?.revokedAt) };
    });
    const [expiredLinks, revokedLinks, totalUniqueVisitors] = await Promise.all([
      Delivery.countDocuments({ status: 'published', 'access.expiresAt': { $lte: new Date() } }),
      Delivery.countDocuments({ 'access.revokedAt': { $exists: true, $ne: null } }),
      DeliveryView.countDocuments({ createdAt: { $gte: since } })
    ]);
    const totals = data.reduce((result, item) => { result.opens += item.opens; result.uniqueVisitors += item.uniqueVisitors; result.repeatVisitors += item.repeatVisitors; result.pinFailures += item.pinFailures; result.downloadsRequested += item.downloadsRequested; result.downloadsCompleted += item.downloadsCompleted; result.likes += item.likes; result.shareGrantOpens += item.shareGrants.opens; result.shareGrantDownloads += item.shareGrants.downloads; return result; }, { opens: 0, uniqueVisitors: 0, repeatVisitors: 0, pinFailures: 0, downloadsRequested: 0, downloadsCompleted: 0, likes: 0, shareGrantOpens: 0, shareGrantDownloads: 0 });
    res.json({ success: true, data: { generatedAt: new Date(), windowDays: days, totals: { ...totals, uniqueVisitorRecords: totalUniqueVisitors, expiredLinks, revokedLinks, volumeAccessCodeRequests: Object.entries(volumeAccess).filter(([key]) => key.startsWith('volume.access_code.requested')).reduce((sum, [, count]) => sum + count, 0), volumeAccessCodeVerified: Object.entries(volumeAccess).filter(([key]) => key.startsWith('volume.access_code.verified')).reduce((sum, [, count]) => sum + count, 0), volumeAccessCodeFailures: Object.entries(volumeAccess).filter(([key]) => key.startsWith('volume.access_code.failed')).reduce((sum, [, count]) => sum + count, 0), volumeGalleryOpens: Object.entries(volumeAccess).filter(([key]) => key.startsWith('volume.recipient_gallery.opened')).reduce((sum, [, count]) => sum + count, 0) }, deliveries: data } });
  } catch (error) {
    console.error('[admin/client-access]', error.message);
    res.status(500).json({ success: false, message: 'We could not load client access activity.' });
  }
}

function storageStatus(ok, reason = '') {
  return { status: ok ? 'healthy' : 'attention', reason: reason || (ok ? 'No storage issues reported.' : 'Storage needs review.') };
}

function safeStorageNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

async function scanCloudinaryReferences() {
  const startedAt = new Date();
  if (!configureCloudinary()) return { status: 'unavailable', reason: 'Cloudinary credentials are not configured.', startedAt, completedAt: new Date(), orphaned: null, missingDatabaseRecords: null };
  const discovered = { image: new Set(), video: new Set() };
  const pages = { image: 0, video: 0 };
  let truncated = false;
  try {
    for (const resourceType of ['image', 'video']) {
      let nextCursor;
      do {
        const response = await cloudinary.api.resources({ resource_type: resourceType, type: 'authenticated', prefix: 'veylo/users/', max_results: 500, ...(nextCursor ? { next_cursor: nextCursor } : {}) });
        for (const resource of response.resources || []) if (resource.public_id) discovered[resourceType].add(resource.public_id);
        nextCursor = response.next_cursor;
        pages[resourceType] += 1;
        if (nextCursor && pages[resourceType] >= 20) { truncated = true; nextCursor = null; }
      } while (nextCursor);
    }

    const [libraryRefs, deliveries] = await Promise.all([
      StorageAsset.find({ publicId: /^veylo\/users\// }).select('publicId').lean(),
      Delivery.find({ $or: [{ 'assets.publicId': /^veylo\/users\// }, { 'soundtrack.publicId': /^veylo\/users\// }, { 'narration.publicId': /^veylo\/users\// }] }).select('assets.publicId soundtrack.publicId narration.publicId').lean()
    ]);
    const dbRefs = { image: new Set(libraryRefs.map(asset => asset.publicId)), video: new Set() };
    for (const delivery of deliveries) {
      for (const asset of delivery.assets || []) if (asset.publicId?.startsWith('veylo/users/')) dbRefs.image.add(asset.publicId);
      if (delivery.soundtrack?.publicId?.startsWith('veylo/users/')) dbRefs.video.add(delivery.soundtrack.publicId);
      if (delivery.narration?.publicId?.startsWith('veylo/users/')) dbRefs.video.add(delivery.narration.publicId);
    }
    const result = { status: truncated ? 'partial' : 'complete', startedAt, completedAt: new Date(), truncated, pages, orphaned: {}, missingDatabaseRecords: {} };
    for (const resourceType of ['image', 'video']) {
      const orphaned = [...discovered[resourceType]].filter(publicId => !dbRefs[resourceType].has(publicId));
      result.orphaned[resourceType] = { count: orphaned.length, sample: orphaned.slice(0, 20) };
      result.missingDatabaseRecords[resourceType] = truncated
        ? { count: null, sample: [], reason: 'The resource listing was capped; missing records need a complete scan.' }
        : { count: [...dbRefs[resourceType]].filter(publicId => !discovered[resourceType].has(publicId)).length, sample: [...dbRefs[resourceType]].filter(publicId => !discovered[resourceType].has(publicId)).slice(0, 20) };
    }
    return result;
  } catch (error) {
    return { status: 'failed', reason: String(error?.message || 'Cloudinary resource listing failed').replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]').slice(0, 180), startedAt, completedAt: new Date(), pages, orphaned: null, missingDatabaseRecords: null };
  }
}

export async function getStorageOverview(req, res) {
  const now = new Date();
  const days = Math.min(90, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const search = String(req.query.search || '').trim().slice(0, 100);
  try {
    let accountQuery = {};
    if (search) accountQuery = { $or: [{ name: { $regex: escaped(search), $options: 'i' } }, { email: { $regex: escaped(search), $options: 'i' } }, { 'studio.name': { $regex: escaped(search), $options: 'i' } }] };
    const [libraryTotal, deliveryPhotoTotal, soundtrackTotal, narrationTotal, libraryFormats, libraryDimensions, hashTotals, deliveryHashTotals, audioHashTotals, accountLibrary, accountDelivery, accounts, uploadTrend, failureBreakdown, cloudinaryHealth, retentionHeartbeat, deliveryIntegrity] = await Promise.all([
      StorageAsset.aggregate([{ $group: { _id: null, files: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$bytes', 0] } } } }]),
      Delivery.aggregate([{ $unwind: '$assets' }, { $group: { _id: null, files: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$assets.bytes', 0] } } } }]),
      Delivery.aggregate([{ $match: { 'soundtrack.publicId': { $exists: true, $ne: '' } } }, { $group: { _id: null, files: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$soundtrack.bytes', 0] } } } }]),
      Delivery.aggregate([{ $match: { 'narration.publicId': { $exists: true, $ne: '' } } }, { $group: { _id: null, files: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$narration.bytes', 0] } } } }]),
      StorageAsset.aggregate([{ $group: { _id: '$format', files: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$bytes', 0] } } } }, { $sort: { bytes: -1 } }, { $limit: 20 }]),
      StorageAsset.aggregate([{ $match: { width: { $gt: 0 }, height: { $gt: 0 } } }, { $group: { _id: { width: '$width', height: '$height' }, files: { $sum: 1 } } }, { $sort: { files: -1 } }, { $limit: 12 }]),
      StorageAsset.aggregate([{ $group: { _id: null, files: { $sum: 1 }, verified: { $sum: { $cond: [{ $and: [{ $ne: ['$contentHash', null] }, { $ne: ['$contentHash', ''] }] }, 1, 0] } } } }]),
      Delivery.aggregate([{ $unwind: '$assets' }, { $group: { _id: null, files: { $sum: 1 }, verified: { $sum: { $cond: [{ $and: [{ $ne: ['$assets.contentHash', null] }, { $ne: ['$assets.contentHash', ''] }] }, 1, 0] } } } }]),
      Delivery.aggregate([{ $group: { _id: null, files: { $sum: { $cond: [{ $ne: ['$soundtrack.publicId', null] }, 1, 0] } }, verified: { $sum: { $cond: [{ $and: [{ $ne: ['$soundtrack.publicId', null] }, { $ne: ['$soundtrack.contentHash', null] }, { $ne: ['$soundtrack.contentHash', ''] }] }, 1, 0] } } } }]),
      StorageAsset.aggregate([{ $group: { _id: '$userId', files: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$bytes', 0] } } } }]),
      Delivery.aggregate([{ $unwind: '$assets' }, { $group: { _id: '$userId', files: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$assets.bytes', 0] } } } }]),
      User.find(accountQuery).select('name email plan planOverride studio.name storageUsedBytes createdAt').sort({ storageUsedBytes: -1 }).limit(100).lean(),
      AnalyticsEvent.aggregate([{ $match: { name: 'upload.completed', occurredAt: { $gte: since } } }, { $project: { day: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } }, surface: { $ifNull: ['$metadata.surface', 'unknown'] }, bytes: { $ifNull: ['$bytes', 0] }, count: { $ifNull: ['$count', 1] } } }, { $group: { _id: { day: '$day', surface: '$surface' }, bytes: { $sum: '$bytes' }, files: { $sum: '$count' } } }, { $sort: { '_id.day': 1 } }]),
      AnalyticsEvent.aggregate([{ $match: { name: { $in: ['upload.failed', 'storage.delete.failed', 'storage.retention.failed'] }, occurredAt: { $gte: since } } }, { $group: { _id: { name: '$name', errorCode: '$errorCode' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 50 }]),
      checkCloudinaryConnection(),
      WorkerHeartbeat.findOne({ workerName: 'retention' }).sort({ heartbeatAt: -1 }).lean(),
      Delivery.aggregate([{ $unwind: '$assets' }, { $group: { _id: null, missingPublicId: { $sum: { $cond: [{ $or: [{ $eq: ['$assets.publicId', null] }, { $eq: ['$assets.publicId', ''] }] }, 1, 0] } }, missingBytes: { $sum: { $cond: [{ $or: [{ $eq: ['$assets.bytes', null] }, { $lte: ['$assets.bytes', 0] }] }, 1, 0] } } } }])
    ]);
    const library = libraryTotal[0] || { files: 0, bytes: 0 };
    const deliveryPhotos = deliveryPhotoTotal[0] || { files: 0, bytes: 0 };
    const soundtrack = soundtrackTotal[0] || { files: 0, bytes: 0 };
    const narration = narrationTotal[0] || { files: 0, bytes: 0 };
    const libraryHash = hashTotals[0] || { files: 0, verified: 0 };
    const deliveryHash = deliveryHashTotals[0] || { files: 0, verified: 0 };
    const audioHash = audioHashTotals[0] || { files: 0, verified: 0 };
    const libraryByAccount = new Map(accountLibrary.map(item => [String(item._id), item]));
    const deliveryByAccount = new Map(accountDelivery.map(item => [String(item._id), item]));
    const accountsData = accounts.map(account => {
      const id = String(account._id);
      const libraryData = libraryByAccount.get(id) || { files: 0, bytes: 0 };
      const deliveryData = deliveryByAccount.get(id) || { files: 0, bytes: 0 };
      const limit = account.plan === 'pro' || account.plan === 'studio' || account.planOverride?.plan === 'pro' ? PLAN_DEFINITIONS.pro.personalStorageBytes : 0;
      const reported = safeStorageNumber(account.storageUsedBytes);
      return { id: account._id, name: account.name || 'Unnamed account', email: account.email || '', studio: account.studio?.name || '', plan: account.plan || 'free', storage: { reportedBytes: reported, libraryBytes: safeStorageNumber(libraryData.bytes), deliveryBytes: safeStorageNumber(deliveryData.bytes), libraryFiles: libraryData.files || 0, deliveryFiles: deliveryData.files || 0, limitBytes: limit, percent: limit ? Math.round((reported / limit) * 1000) / 10 : 0, discrepancyBytes: reported - safeStorageNumber(libraryData.bytes) } };
    });
    const retentionAt = retentionHeartbeat?.heartbeatAt ? new Date(retentionHeartbeat.heartbeatAt) : null;
    const retentionFresh = retentionAt && now.getTime() - retentionAt.getTime() < 8 * 60 * 60 * 1000;
    const failedUploads = await AnalyticsEvent.countDocuments({ name: 'upload.failed', occurredAt: { $gte: dayAgo } });
    const failedDeletes = await AnalyticsEvent.countDocuments({ name: 'storage.delete.failed', occurredAt: { $gte: since } });
    res.json({ success: true, data: {
      generatedAt: now,
      windowDays: days,
      totals: { library: { files: library.files, bytes: library.bytes }, deliveryPhotos: { files: deliveryPhotos.files, bytes: deliveryPhotos.bytes }, soundtrack: { files: soundtrack.files, bytes: soundtrack.bytes }, narration: { files: narration.files, bytes: narration.bytes }, allTrackedBytes: safeStorageNumber(library.bytes) + safeStorageNumber(deliveryPhotos.bytes) + safeStorageNumber(soundtrack.bytes) + safeStorageNumber(narration.bytes), allTrackedFiles: library.files + deliveryPhotos.files + soundtrack.files + narration.files },
      accounts: accountsData,
      formats: libraryFormats.map(item => ({ format: item._id || 'unknown', files: item.files, bytes: item.bytes })),
      dimensions: libraryDimensions.map(item => ({ width: item._id?.width, height: item._id?.height, files: item.files })),
      hashes: { verified: libraryHash.verified + deliveryHash.verified + audioHash.verified, missing: Math.max(0, libraryHash.files + deliveryHash.files + audioHash.files - libraryHash.verified - deliveryHash.verified - audioHash.verified), algorithm: 'cloudinary-etag' },
      growth: uploadTrend.map(item => ({ day: item._id.day, surface: item._id.surface, bytes: item.bytes, files: item.files })),
      failures: { uploadsLast24Hours: failedUploads, deletesInWindow: failedDeletes, breakdown: failureBreakdown.map(item => ({ name: item._id.name, errorCode: item._id.errorCode || 'unknown', count: item.count })) },
      health: { cloudinary: storageStatus(cloudinaryHealth.ok, cloudinaryHealth.reason), retention: { status: retentionFresh ? (retentionHeartbeat.status || 'idle') : retentionAt ? 'stale' : 'not-started', heartbeatAt: retentionHeartbeat?.heartbeatAt || null, stage: retentionHeartbeat?.stage || 'not started' }, databaseReferences: storageStatus(!deliveryIntegrity[0]?.missingPublicId && !deliveryIntegrity[0]?.missingBytes, deliveryIntegrity[0] ? `${deliveryIntegrity[0].missingPublicId || 0} delivery files have no public ID; ${deliveryIntegrity[0].missingBytes || 0} have no byte count.` : ''), hashes: storageStatus((libraryHash.files + deliveryHash.files + audioHash.files) === (libraryHash.verified + deliveryHash.verified + audioHash.verified), `${Math.max(0, libraryHash.files + deliveryHash.files + audioHash.files - libraryHash.verified - deliveryHash.verified - audioHash.verified)} media records still need a provider hash.`) },
      scan: { status: 'not-run', message: 'Cloudinary reference scanning is manual because it lists provider resources.' }
    } });
  } catch (error) {
    console.error('[admin/storage]', error.message);
    res.status(500).json({ success: false, message: 'We could not load storage health.' });
  }
}

export async function scanStorageReferences(req, res) {
  try {
    const data = await scanCloudinaryReferences();
    res.json({ success: true, data });
  } catch (error) {
    console.error('[admin/storage-scan]', error.message);
    res.status(500).json({ success: false, message: 'We could not scan Cloudinary references.' });
  }
}

function musicHealth(ok, reason = '') {
  return { status: ok ? 'healthy' : 'attention', reason: reason || (ok ? 'No recent audio failures reported.' : 'Audio needs review.') };
}

export async function getMusicNarrationOverview(req, res) {
  const now = new Date();
  const days = Math.min(90, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const search = String(req.query.search || '').trim().slice(0, 100).toLowerCase();
  try {
    const verification = await verifySoundtrackFiles();
    const verificationById = new Map(verification.map(item => [item.trackId, item]));
    const eventNames = ['soundtrack.selected', 'soundtrack.replaced', 'soundtrack.preview.started', 'soundtrack.preview.completed', 'soundtrack.preview.failed', 'soundtrack.playback.failed', 'narration.played', 'narration.paused', 'narration.resumed', 'narration.failed', 'narration.timing.failed', 'audio.loading.failed'];
    const [selectionEvents, recentAudioEvents, deliverySelections, storySelections, narrationJobs, narrationVoiceJobs, deliveryVoiceUsage, staleNarration] = await Promise.all([
      AnalyticsEvent.aggregate([{ $match: { name: { $in: ['soundtrack.selected', 'soundtrack.replaced'] } } }, { $group: { _id: { trackId: '$metadata.trackId', event: '$name', selectionType: '$metadata.selectionType' }, count: { $sum: 1 }, lastAt: { $max: '$occurredAt' } } }]),
      AnalyticsEvent.aggregate([{ $match: { name: { $in: eventNames }, occurredAt: { $gte: since } } }, { $group: { _id: { name: '$name', status: '$status', errorCode: '$errorCode' }, count: { $sum: 1 }, averageMs: { $avg: '$durationMs' } } }, { $sort: { count: -1 } }, { $limit: 100 }]),
      Delivery.aggregate([{ $match: { 'soundtrack.catalogId': { $exists: true, $ne: '' } } }, { $group: { _id: '$soundtrack.catalogId', currentDeliveries: { $sum: 1 }, lastSelectedAt: { $max: '$updatedAt' } } }]),
      PhotoStory.aggregate([{ $match: { 'soundtrack.id': { $exists: true, $ne: '' } } }, { $group: { _id: '$soundtrack.id', currentStories: { $sum: 1 } } }]),
      DeliveryJob.aggregate([{ $match: { type: 'narrate' } }, { $group: { _id: null, total: { $sum: 1 }, queued: { $sum: { $cond: [{ $in: ['$status', ['queued', 'running']] }, 1, 0] } }, completed: { $sum: { $cond: [{ $eq: ['$status', 'review'] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }, timingFailures: { $sum: { $ifNull: ['$timingFailures', 0] } }, averageGenerationMs: { $avg: { $cond: [{ $eq: ['$status', 'review'] }, '$providerLatencyMs', null] } }, lastCompletedAt: { $max: '$completedAt' } } }]),
      DeliveryJob.aggregate([{ $match: { type: 'narrate' } }, { $group: { _id: { $ifNull: ['$input.voiceId', DEFAULT_NARRATION_VOICE_ID] }, jobs: { $sum: 1 }, averageGenerationMs: { $avg: '$providerLatencyMs' } } }]),
      Delivery.aggregate([{ $match: { 'narration.voiceId': { $exists: true, $ne: '' } } }, { $group: { _id: '$narration.voiceId', deliveries: { $sum: 1 } } }]),
      Delivery.countDocuments({ 'narration.renderVersion': { $exists: true, $ne: NARRATION_RENDER_VERSION } })
    ]);
    const selectionByTrack = new Map();
    for (const item of selectionEvents) {
      const trackId = item._id?.trackId;
      if (!trackId) continue;
      const current = selectionByTrack.get(trackId) || { total: 0, photographer: 0, creativeDirector: 0, replaced: 0, lastAt: null };
      current.total += item.count;
      if (item._id.event === 'soundtrack.replaced') current.replaced += item.count;
      if (item._id.selectionType === 'creative-director') current.creativeDirector += item.count;
      else current.photographer += item.count;
      if (!current.lastAt || new Date(item.lastAt) > new Date(current.lastAt)) current.lastAt = item.lastAt;
      selectionByTrack.set(trackId, current);
    }
    const currentByTrack = new Map();
    for (const item of deliverySelections) currentByTrack.set(item._id, { ...(currentByTrack.get(item._id) || {}), currentDeliveries: item.currentDeliveries, lastSelectedAt: item.lastSelectedAt });
    for (const item of storySelections) currentByTrack.set(item._id, { ...(currentByTrack.get(item._id) || {}), currentStories: item.currentStories });
    const catalogue = DELIVERY_SOUNDTRACKS
      .filter(track => !search || [track.id, track.title, track.creator, track.category, track.genre, track.mood, ...(track.tags || [])].join(' ').toLowerCase().includes(search))
      .map(track => {
        const usage = selectionByTrack.get(track.id) || { total: 0, photographer: 0, creativeDirector: 0, replaced: 0, lastAt: null };
        const current = currentByTrack.get(track.id) || {};
        const file = verificationById.get(track.id) || { available: false, hashMatches: false, bytes: 0 };
        return { id: track.id, title: track.title, creator: track.creator, category: track.category, genre: track.genre, mood: track.mood, tempo: track.tempo, energy: track.energy, narrationFit: track.narrationFit, durationSec: track.durationSec, tags: track.tags, bestFor: track.bestFor, avoidFor: track.avoidFor, storyFunction: track.storyFunction, editingPace: track.editingPace, instrumentationCue: track.instrumentationCue, sourceDescription: track.sourceDescription, sourcePageUrl: track.sourcePageUrl, source: track.source, license: track.license, licenseUrl: track.licenseUrl, contentIdRegistered: Boolean(track.contentIdRegistered), contentIdGuidance: track.contentIdGuidance, metadataConfidence: track.metadataConfidence, verifiedAt: track.verifiedAt, expectedBytes: track.bytes, expectedSha256: track.sha256, file, usage: { lifetimeSelections: usage.total, photographerSelections: usage.photographer, creativeDirectorSelections: usage.creativeDirector, replacements: usage.replaced, currentDeliveries: current.currentDeliveries || 0, currentStories: current.currentStories || 0, lastSelectedAt: usage.lastAt || current.lastSelectedAt || null, neverSelected: usage.total === 0 && !current.currentDeliveries && !current.currentStories } };
      });
    const jobSummary = narrationJobs[0] || { total: 0, queued: 0, completed: 0, failed: 0, cancelled: 0, timingFailures: 0, averageGenerationMs: 0, lastCompletedAt: null };
    const jobVoiceMap = Object.fromEntries(narrationVoiceJobs.map(item => [item._id, { jobs: item.jobs, averageGenerationMs: item.averageGenerationMs }]));
    const deliveryVoiceMap = Object.fromEntries(deliveryVoiceUsage.map(item => [item._id, item.deliveries]));
    const failureCount = recentAudioEvents.filter(item => ['soundtrack.preview.failed', 'soundtrack.playback.failed', 'narration.failed', 'narration.timing.failed', 'audio.loading.failed'].includes(item._id?.name)).reduce((sum, item) => sum + item.count, 0);
    res.json({ success: true, data: {
      generatedAt: now,
      windowDays: days,
      catalogue: { total: DELIVERY_SOUNDTRACKS.length, filtered: catalogue.length, available: verification.filter(item => item.available && item.hashMatches).length, unavailable: verification.filter(item => !item.available).length, hashMismatches: verification.filter(item => item.available && !item.hashMatches).length, contentIdRegistered: DELIVERY_SOUNDTRACKS.filter(track => track.contentIdRegistered).length, categories: [...new Set(DELIVERY_SOUNDTRACKS.map(track => track.category))], tracks: catalogue },
      soundtrack: { selectionEvents: selectionEvents.reduce((sum, item) => sum + item.count, 0), replacementEvents: selectionEvents.filter(item => item._id.event === 'soundtrack.replaced').reduce((sum, item) => sum + item.count, 0), previewFailures: recentAudioEvents.filter(item => item._id.name === 'soundtrack.preview.failed').reduce((sum, item) => sum + item.count, 0), playbackFailures: recentAudioEvents.filter(item => item._id.name === 'soundtrack.playback.failed').reduce((sum, item) => sum + item.count, 0), topTracks: [...catalogue].sort((left, right) => right.usage.lifetimeSelections - left.usage.lifetimeSelections).slice(0, 12), neverSelected: catalogue.filter(track => track.usage.neverSelected).length },
      narration: { provider: 'Deepgram Flux', defaultVoiceId: DEFAULT_NARRATION_VOICE_ID, renderVersion: NARRATION_RENDER_VERSION, jobs: jobSummary, voices: NARRATION_VOICES.map(voice => ({ ...voice, jobs: jobVoiceMap[voice.id]?.jobs || 0, averageGenerationMs: jobVoiceMap[voice.id]?.averageGenerationMs || 0, deliveries: deliveryVoiceMap[voice.id] || 0, configured: Boolean(process.env.DEEPGRAM_API_KEY) })), staleDeliveries: staleNarration, playbackFailures: recentAudioEvents.filter(item => item._id.name === 'narration.failed' || item._id.name === 'audio.loading.failed').reduce((sum, item) => sum + item.count, 0), timingFailures: jobSummary.timingFailures + recentAudioEvents.filter(item => item._id.name === 'narration.timing.failed').reduce((sum, item) => sum + item.count, 0) },
      events: recentAudioEvents.map(item => ({ name: item._id.name, status: item._id.status, errorCode: item._id.errorCode, count: item.count, averageMs: item.averageMs })),
      health: { catalogue: musicHealth(verification.every(item => item.available && item.hashMatches), `${verification.filter(item => !item.available).length} files unavailable; ${verification.filter(item => item.available && !item.hashMatches).length} hash mismatches.`), deepgram: musicHealth(Boolean(process.env.DEEPGRAM_API_KEY) && failureCount === 0, process.env.DEEPGRAM_API_KEY ? (failureCount ? `${failureCount} audio failures in the last ${days} days.` : 'Deepgram Flux is configured.') : 'DEEPGRAM_API_KEY is not configured.') }
    } });
  } catch (error) {
    console.error('[admin/music-narration]', error.message);
    res.status(500).json({ success: false, message: 'We could not load music and narration health.' });
  }
}

function adminVolumeSummary(job, subjects = [], accessCodes = [], events = []) {
  const now = new Date();
  const eventCount = (name, status) => events.filter(event => event._id?.name === name && (!status || event._id?.status === status)).reduce((total, event) => total + event.count, 0);
  const duplicateCodes = subjects.length - new Set(subjects.map(subject => subject.recipientCode)).size;
  const withoutPhotos = subjects.filter(subject => !subject.assetIds?.length).length;
  const activeCodes = accessCodes.filter(code => !code.usedAt && code.expiresAt > now).length;
  const expiredCodes = accessCodes.filter(code => !code.usedAt && code.expiresAt <= now).length;
  return {
    id: job._id,
    publicId: job.publicId,
    title: job.title,
    organisation: job.organisation,
    category: job.category,
    status: job.status,
    photographer: job.userId?.studio?.name || job.userId?.name || 'Independent photographer',
    photographerId: job.userId?._id || job.userId,
    recipientCount: subjects.length || job.subjectCount || 0,
    assignedPhotoCount: subjects.reduce((total, subject) => total + (subject.assetIds?.length || 0), 0) || job.assignedPhotoCount || 0,
    recipientsWithoutPhotos: withoutPhotos,
    duplicateRecipientCodes: duplicateCodes,
    unmatchedRecipients: Number(job.assignmentHealth?.unmatchedRecipients || 0),
    ambiguousFiles: Number(job.assignmentHealth?.ambiguousFiles || 0),
    unmatchedFilenames: (job.assignmentHealth?.unmatchedFilenames || []).slice(0, 100),
    assignmentCheckedAt: job.assignmentHealth?.lastRunAt || null,
    accessCodes: { total: accessCodes.length, active: activeCodes, expired: expiredCodes, used: accessCodes.filter(code => code.usedAt).length, attempts: accessCodes.reduce((total, code) => total + Number(code.attempts || 0), 0) },
    access: { link: `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/volume/${encodeURIComponent(job.publicId)}`, expiresAt: job.accessExpiresAt || null, expired: Boolean(job.accessExpiresAt && job.accessExpiresAt <= now), revoked: Boolean(job.revokedAt || job.status === 'archived'), revokedAt: job.revokedAt || null },
    activity: { codeRequests: eventCount('volume.access_code.requested'), codeVerified: eventCount('volume.access_code.verified'), codeFailures: eventCount('volume.access_code.failed'), galleryOpens: eventCount('volume.recipient_gallery.opened'), downloads: eventCount('volume.recipient_gallery.downloaded') },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    publishedAt: job.publishedAt || null
  };
}

export async function getVolumeJobs(req, res) {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const category = String(req.query.category || 'all');
    const status = String(req.query.status || 'all');
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 40));
    const query = {};
    if (['school', 'sports', 'corporate', 'other'].includes(category)) query.category = category;
    if (['draft', 'published', 'archived'].includes(status)) query.status = status;
    if (search) {
      const pattern = { $regex: escaped(search), $options: 'i' };
      const matchingUsers = await User.find({ $or: [{ name: pattern }, { email: pattern }, { 'studio.name': pattern }] }).select('_id').limit(200).lean();
      query.$or = [{ publicId: pattern }, { title: pattern }, { organisation: pattern }, ...(matchingUsers.length ? [{ userId: { $in: matchingUsers.map(user => user._id) } }] : [])];
    }
    const [jobs, total] = await Promise.all([VolumeJob.find(query).populate('userId', 'name studio.name').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), VolumeJob.countDocuments(query)]);
    const ids = jobs.map(job => job._id);
    const [subjects, accessCodes, events] = await Promise.all([
      ids.length ? VolumeSubject.find({ jobId: { $in: ids } }).select('jobId recipientCode displayName assetIds').lean() : [],
      ids.length ? VolumeAccessCode.find({ jobId: { $in: ids } }).select('jobId attempts expiresAt usedAt createdAt').lean() : [],
      ids.length ? AnalyticsEvent.aggregate([{ $match: { name: { $in: ['volume.access_code.requested', 'volume.access_code.verified', 'volume.access_code.failed', 'volume.recipient_gallery.opened', 'volume.recipient_gallery.downloaded'] }, 'metadata.volumeJobId': { $in: ids.map(id => String(id)) } } }, { $group: { _id: { jobId: '$metadata.volumeJobId', name: '$name', status: '$status' }, count: { $sum: 1 } } }]) : []
    ]);
    const data = jobs.map(job => adminVolumeSummary(job, subjects.filter(subject => String(subject.jobId) === String(job._id)), accessCodes.filter(code => String(code.jobId) === String(job._id)), events.filter(event => String(event._id.jobId) === String(job._id))));
    res.json({ success: true, data, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
    console.error('[admin/volume-jobs]', error.message);
    res.status(500).json({ success: false, message: 'We could not load volume deliveries.' });
  }
}

export async function getVolumeJobDetail(req, res) {
  try {
    const id = validId(req.params.id);
    const job = id ? await VolumeJob.findById(id).populate('userId', 'name email studio.name').lean() : await VolumeJob.findOne({ publicId: String(req.params.id || '').trim() }).populate('userId', 'name email studio.name').lean();
    if (!job) return res.status(404).json({ success: false, message: 'Volume delivery not found.' });
    const [subjects, accessCodes, events] = await Promise.all([
      VolumeSubject.find({ jobId: job._id }).select('recipientCode displayName assetIds createdAt updatedAt').sort({ displayName: 1 }).lean(),
      VolumeAccessCode.find({ jobId: job._id }).select('subjectId attempts expiresAt usedAt createdAt').sort({ createdAt: -1 }).lean(),
      AnalyticsEvent.aggregate([{ $match: { 'metadata.volumeJobId': String(job._id), name: { $in: ['volume.access_code.requested', 'volume.access_code.verified', 'volume.access_code.failed', 'volume.recipient_gallery.opened', 'volume.recipient_gallery.downloaded'] } } }, { $group: { _id: { name: '$name', status: '$status' }, count: { $sum: 1 } } }])
    ]);
    res.json({ success: true, data: { ...adminVolumeSummary(job, subjects, accessCodes, events), subjects: subjects.map(subject => ({ id: subject._id, recipientCode: subject.recipientCode, displayName: subject.displayName, photoCount: subject.assetIds?.length || 0, hasPhotos: Boolean(subject.assetIds?.length), createdAt: subject.createdAt, updatedAt: subject.updatedAt })), accessCodes: accessCodes.map(code => ({ id: code._id, subjectId: code.subjectId, attempts: code.attempts, status: code.usedAt ? 'used' : code.expiresAt <= new Date() ? 'expired' : 'active', expiresAt: code.expiresAt, usedAt: code.usedAt, createdAt: code.createdAt })) } });
  } catch (error) {
    console.error('[admin/volume-detail]', error.message);
    res.status(500).json({ success: false, message: 'We could not load this volume delivery.' });
  }
}

async function findAdminVolumeJob(identifier) {
  const value = String(identifier || '').trim();
  if (!value || value.length > 200) return null;
  return mongoose.isValidObjectId(value) ? VolumeJob.findOne({ $or: [{ _id: new mongoose.Types.ObjectId(value) }, { publicId: value }] }) : VolumeJob.findOne({ publicId: value });
}

export async function adminPublishVolumeJob(req, res) {
  try {
    const job = await findAdminVolumeJob(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Volume delivery not found.' });
    const subjectsWithoutPhotos = await VolumeSubject.countDocuments({ jobId: job._id, 'assetIds.0': { $exists: false } });
    if (!job.subjectCount || !job.assignedPhotoCount || subjectsWithoutPhotos) return res.status(409).json({ success: false, message: 'Every recipient needs at least one photograph before this delivery can be published.' });
    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) return res.status(400).json({ success: false, message: 'Enter a valid expiry date.' });
    job.status = 'published'; job.publishedAt = job.publishedAt || new Date(); job.accessExpiresAt = expiresAt || undefined; job.revokedAt = undefined; job.accessVersion = Number(job.accessVersion || 1) + 1; await job.save();
    await AdminAudit.create({ adminId: adminId(req), userId: job.userId, action: 'volume.published_by_admin', resourceType: 'VolumeJob', resourceId: String(job._id), details: { accessExpiresAt: job.accessExpiresAt || null } });
    res.json({ success: true, data: { publicId: job.publicId, url: `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/volume/${job.publicId}` } });
  } catch (error) { console.error('[admin/volume-publish]', error.message); res.status(500).json({ success: false, message: 'We could not publish this volume delivery.' }); }
}

export async function adminArchiveVolumeJob(req, res) {
  try {
    const job = await findAdminVolumeJob(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Volume delivery not found.' });
    job.status = 'archived'; job.archivedAt = new Date(); job.revokedAt = new Date(); job.accessVersion = Number(job.accessVersion || 1) + 1; await job.save();
    await AdminAudit.create({ adminId: adminId(req), userId: job.userId, action: 'volume.archived_by_admin', resourceType: 'VolumeJob', resourceId: String(job._id), details: { reason: safeReason(req.body.reason, 'Archived by administrator') } });
    res.json({ success: true });
  } catch (error) { console.error('[admin/volume-archive]', error.message); res.status(500).json({ success: false, message: 'We could not archive this volume delivery.' }); }
}

export async function adminRestoreVolumeJob(req, res) {
  try {
    const job = await findAdminVolumeJob(req.params.id);
    if (!job || job.status !== 'archived') return res.status(404).json({ success: false, message: 'Archived volume delivery not found.' });
    job.status = 'draft'; job.archivedAt = undefined; job.revokedAt = undefined; job.accessVersion = Number(job.accessVersion || 1) + 1; await job.save();
    await AdminAudit.create({ adminId: adminId(req), userId: job.userId, action: 'volume.restored_by_admin', resourceType: 'VolumeJob', resourceId: String(job._id), details: {} });
    res.json({ success: true });
  } catch (error) { console.error('[admin/volume-restore]', error.message); res.status(500).json({ success: false, message: 'We could not restore this volume delivery.' }); }
}

export async function adminDeleteVolumeJob(req, res) {
  try {
    const job = await findAdminVolumeJob(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Volume delivery not found.' });
    await Promise.all([VolumeSubject.deleteMany({ jobId: job._id }), VolumeAccessCode.deleteMany({ jobId: job._id }), VolumeJob.deleteOne({ _id: job._id })]);
    await AdminAudit.create({ adminId: adminId(req), userId: job.userId, action: 'volume.deleted_by_admin', resourceType: 'VolumeJob', resourceId: String(job._id), details: { publicId: job.publicId, reason: safeReason(req.body.reason, 'Deleted by administrator') } });
    res.json({ success: true });
  } catch (error) { console.error('[admin/volume-delete]', error.message); res.status(500).json({ success: false, message: 'We could not delete this volume delivery.' }); }
}

export async function getPayments(req, res) {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const status = String(req.query.status || 'all');
    const query = {};
    if (['pending', 'success', 'failed', 'refunded', 'partially_refunded', 'disputed'].includes(status)) query.status = status;
    if (search) query.reference = { $regex: escaped(search), $options: 'i' };
    const payments = await Payment.find(query)
      .populate('userId', 'name email')
      .populate('subscriptionId', 'status paidThrough')
      .sort({ createdAt: -1 })
      .limit(100)
      .select('-providerSnapshot')
      .lean();
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('[admin/payments]', error.message);
    res.status(500).json({ success: false, message: 'We could not load the payments.' });
  }
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
}

function paymentFinanceSummary(payments = []) {
  const summary = { total: payments.length, pending: 0, successful: 0, failed: 0, refunded: 0, partiallyRefunded: 0, disputed: 0, grossKobo: 0, refundedKobo: 0, netKobo: 0 };
  for (const payment of payments) {
    const status = payment.status;
    if (status === 'pending') summary.pending += 1;
    if (status === 'success') summary.successful += 1;
    if (status === 'failed') summary.failed += 1;
    if (status === 'refunded') summary.refunded += 1;
    if (status === 'partially_refunded') summary.partiallyRefunded += 1;
    if (status === 'disputed') summary.disputed += 1;
    if (['success', 'partially_refunded', 'refunded'].includes(status)) summary.grossKobo += Number(payment.amountKobo || 0);
    summary.refundedKobo += Number(payment.refundedAmountKobo || 0);
  }
  summary.netKobo = Math.max(0, summary.grossKobo - summary.refundedKobo);
  return summary;
}

export async function getFinanceOverview(req, res) {
  try {
    const days = Math.min(365, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const search = String(req.query.search || '').trim().slice(0, 100);
    const paymentQuery = { createdAt: { $gte: since } };
    if (search) {
      const pattern = { $regex: escaped(search), $options: 'i' };
      const users = await User.find({ $or: [{ name: pattern }, { email: pattern }, { 'studio.name': pattern }] }).select('_id').limit(200).lean();
      paymentQuery.$or = [{ reference: pattern }, ...(users.length ? [{ userId: { $in: users.map(user => user._id) } }] : [])];
    }
    const [payments, paymentTotals, billingEvents, subscriptionStatuses, manualGrants, failedBillingEvents, eventTypes, paymentTimeline] = await Promise.all([
      Payment.find(paymentQuery).populate('userId', 'name email studio.name').populate('subscriptionId', 'status paidThrough').sort({ createdAt: -1 }).limit(250).select('-providerSnapshot').lean(),
      Payment.aggregate([{ $match: paymentQuery }, { $group: { _id: null, total: { $sum: 1 }, pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }, successful: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }, refunded: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } }, partiallyRefunded: { $sum: { $cond: [{ $eq: ['$status', 'partially_refunded'] }, 1, 0] } }, disputed: { $sum: { $cond: [{ $eq: ['$status', 'disputed'] }, 1, 0] } }, grossKobo: { $sum: { $cond: [{ $in: ['$status', ['success', 'partially_refunded', 'refunded']] }, { $ifNull: ['$amountKobo', 0] }, 0] } }, refundedKobo: { $sum: { $ifNull: ['$refundedAmountKobo', 0] } } } }]),
      BillingEvent.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(250).select('eventKey eventType userId provider status attempts processedAt failure createdAt').lean(),
      Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      User.find({ 'planOverride.plan': 'pro', $or: [{ 'planOverride.expiresAt': null }, { 'planOverride.expiresAt': { $exists: false } }, { 'planOverride.expiresAt': { $gt: new Date() } }] }).select('name email plan planOverride').sort({ 'planOverride.expiresAt': 1 }).limit(250).lean(),
      BillingEvent.countDocuments({ createdAt: { $gte: since }, status: 'failed' }),
      BillingEvent.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { eventType: '$eventType', status: '$status' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Payment.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, status: '$status' }, count: { $sum: 1 }, amountKobo: { $sum: '$amountKobo' }, refundedKobo: { $sum: '$refundedAmountKobo' } } }, { $sort: { '_id.day': 1 } }])
    ]);
    const paymentSummary = paymentTotals[0] || paymentFinanceSummary(payments);
    paymentSummary.netKobo = Math.max(0, Number(paymentSummary.grossKobo || 0) - Number(paymentSummary.refundedKobo || 0));
    const subscriptions = Object.fromEntries(subscriptionStatuses.map(item => [item._id || 'unknown', item.count]));
    const eventSummary = Object.fromEntries(eventTypes.map(item => [`${item._id.eventType}:${item._id.status}`, item.count]));
    const timeline = paymentTimeline.map(item => ({ day: item._id.day, status: item._id.status, count: item.count, amountKobo: item.amountKobo, refundedKobo: item.refundedKobo }));
    const successfulEvents = billingEvents.filter(event => event.eventType === 'charge.success').length;
    const renewalEvents = billingEvents.filter(event => ['invoice.create', 'invoice.payment_failed', 'charge.success'].includes(event.eventType)).length;
    const cancellationEvents = billingEvents.filter(event => ['subscription.not_renew', 'subscription.disable'].includes(event.eventType)).length;
    const refundEvents = billingEvents.filter(event => event.eventType.startsWith('refund.')).length;
    const disputeEvents = billingEvents.filter(event => event.eventType.includes('dispute')).length;
    res.json({ success: true, data: {
      generatedAt: new Date(), windowDays: days,
      summary: { ...paymentSummary, billingEvents: billingEvents.length, failedBillingEvents, successfulEvents, renewalEvents, cancellationEvents, refundEvents, disputeEvents, activeSubscriptions: subscriptions.active || 0, pastDueSubscriptions: subscriptions.past_due || 0 },
      subscriptions,
      payments: payments.map(payment => ({ ...payment, userId: payment.userId ? { _id: payment.userId._id, name: payment.userId.name, email: payment.userId.email, studio: payment.userId.studio?.name || '' } : null })),
      events: billingEvents.map(event => ({ id: event._id, eventKey: event.eventKey, eventType: event.eventType, provider: event.provider, status: event.status, attempts: event.attempts, failure: event.failure || '', processedAt: event.processedAt || null, createdAt: event.createdAt })),
      eventSummary,
      timeline,
      manualProGrants: manualGrants.map(user => ({ id: user._id, name: user.name, email: user.email, plan: user.plan, expiresAt: user.planOverride?.expiresAt || null, reason: user.planOverride?.reason || '', grantedBy: user.planOverride?.grantedBy || null })),
      reconciliation: { status: billingConfigured() ? 'ready' : 'unavailable', reason: billingConfigured() ? 'Live Paystack reconciliation is available on request.' : 'Paystack billing is disabled or incomplete.', localSuccessfulPayments: paymentSummary.successful, localSuccessfulKobo: payments.filter(payment => payment.status === 'success').reduce((sum, payment) => sum + Number(payment.amountKobo || 0), 0), lastWebhookAt: billingEvents[0]?.createdAt || null }
    } });
  } catch (error) {
    console.error('[admin/finance]', error.message);
    res.status(500).json({ success: false, message: 'We could not load finance records.' });
  }
}

export async function reconcileFinanceWithPaystack(req, res) {
  try {
    if (!billingConfigured()) return res.status(503).json({ success: false, message: 'Paystack billing is disabled or incomplete.' });
    const days = Math.min(365, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const remote = await paystackRequest(`/transaction?perPage=100&from=${encodeURIComponent(since.toISOString())}&to=${encodeURIComponent(new Date().toISOString())}`);
    const remoteTransactions = Array.isArray(remote?.data) ? remote.data : Array.isArray(remote) ? remote : [];
    const references = remoteTransactions.map(transaction => String(transaction.reference || '')).filter(Boolean);
    const localPayments = await Payment.find({ reference: { $in: references } }).select('reference status amountKobo').lean();
    const localMap = new Map(localPayments.map(payment => [payment.reference, payment]));
    const missingLocal = remoteTransactions.filter(transaction => transaction.reference && !localMap.has(String(transaction.reference))).slice(0, 100).map(transaction => ({ reference: transaction.reference, status: transaction.status, amountKobo: transaction.amount, paidAt: transaction.paid_at || null }));
    const amountMismatches = remoteTransactions.filter(transaction => { const local = localMap.get(String(transaction.reference)); return local && Number(local.amountKobo) !== Number(transaction.amount); }).slice(0, 100).map(transaction => ({ reference: transaction.reference, localAmountKobo: localMap.get(String(transaction.reference)).amountKobo, paystackAmountKobo: transaction.amount }));
    res.json({ success: true, data: { status: 'complete', checkedAt: new Date(), days, paystackTransactions: remoteTransactions.length, localMatches: localPayments.length, missingLocal, amountMismatches } });
  } catch (error) {
    console.error('[admin/finance-reconcile]', error.message);
    res.status(error.status || 502).json({ success: false, message: 'Paystack reconciliation could not be completed.' });
  }
}

export async function exportFinance(req, res) {
  try {
    const days = Math.min(3650, Math.max(1, Number.parseInt(req.query.days, 10) || 365));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const payments = await Payment.find({ createdAt: { $gte: since } }).populate('userId', 'name email').sort({ createdAt: -1 }).limit(10000).lean();
    const rows = [['reference', 'account', 'email', 'status', 'amount_ngn', 'refunded_ngn', 'currency', 'channel', 'paid_at', 'created_at']];
    for (const payment of payments) rows.push([payment.reference, payment.userId?.name || '', payment.userId?.email || '', payment.status, (Number(payment.amountKobo || 0) / 100).toFixed(2), (Number(payment.refundedAmountKobo || 0) / 100).toFixed(2), payment.currency || 'NGN', payment.channel || '', payment.paidAt || '', payment.createdAt || '']);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="veylo-finance-${days}d.csv"`, 'Cache-Control': 'no-store' });
    res.send(rows.map(row => row.map(csvCell).join(',')).join('\n'));
  } catch (error) {
    console.error('[admin/finance-export]', error.message);
    res.status(500).json({ success: false, message: 'We could not export finance records.' });
  }
}

const portfolioAnalyticsNames = [
  'portfolio.viewed',
  'portfolio.project.opened',
  'portfolio.filter.used',
  'portfolio.instagram.clicked',
  'portfolio.whatsapp.clicked',
  'portfolio.enquiry.clicked'
];

function portfolioMetricBucket() {
  return { views: 0, uniqueVisitors: 0, projectOpens: 0, filterUses: 0, instagramClicks: 0, whatsappClicks: 0, enquiryClicks: 0 };
}

export async function getPortfolioOverview(req, res) {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const status = ['draft', 'published'].includes(String(req.query.status || '')) ? String(req.query.status) : 'all';
    const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 250));
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const query = status === 'all' ? {} : { status };
    if (search) {
      const pattern = { $regex: escaped(search), $options: 'i' };
      const matchingUsers = await User.find({ $or: [{ name: pattern }, { email: pattern }, { 'studio.name': pattern }] }).select('_id').limit(500).lean();
      query.$or = [
        { handle: pattern },
        { studioName: pattern },
        { headline: pattern },
        ...(matchingUsers.length ? [{ userId: { $in: matchingUsers.map(user => user._id) } }] : [])
      ];
    }
    const portfolios = await Portfolio.find(query)
      .populate('userId', 'name email plan accountStatus studio.name planOverride')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();
    const portfolioIds = portfolios.map(portfolio => portfolio._id);
    const publicIds = [...new Set(portfolios.flatMap(portfolio => (portfolio.items || []).map(item => String(item.publicId)).filter(Boolean)))];
    const [storedAssets, deliveryAssets, jobs, analytics] = await Promise.all([
      publicIds.length ? StorageAsset.find({ publicId: { $in: publicIds } }).select('publicId').lean() : [],
      publicIds.length ? Delivery.find({ 'assets.publicId': { $in: publicIds } }).select('assets.publicId').lean() : [],
      portfolioIds.length ? PortfolioJob.find({ portfolioId: { $in: portfolioIds } }).sort({ updatedAt: -1 }).limit(Math.max(500, portfolioIds.length * 5)).lean() : [],
      AnalyticsEvent.aggregate([
        { $match: { name: { $in: portfolioAnalyticsNames }, occurredAt: { $gte: since } } },
        { $group: { _id: { name: '$name', handle: '$metadata.handle' }, count: { $sum: 1 }, sessions: { $addToSet: '$sessionDigest' } } },
        { $project: { _id: 1, count: 1, uniqueVisitors: { $size: { $setDifference: ['$sessions', [null, '']] } } } }
      ])
    ]);
    const availableMedia = new Set([
      ...storedAssets.map(asset => String(asset.publicId)),
      ...deliveryAssets.flatMap(delivery => (delivery.assets || []).map(asset => String(asset.publicId)))
    ]);
    const metricsByHandle = new Map();
    for (const event of analytics) {
      const handle = String(event._id?.handle || '').toLowerCase();
      if (!handle) continue;
      const bucket = metricsByHandle.get(handle) || portfolioMetricBucket();
      const count = Number(event.count || 0);
      const uniqueVisitors = Number(event.uniqueVisitors || 0);
      if (event._id.name === 'portfolio.viewed') { bucket.views += count; bucket.uniqueVisitors += uniqueVisitors; }
      if (event._id.name === 'portfolio.project.opened') bucket.projectOpens += count;
      if (event._id.name === 'portfolio.filter.used') bucket.filterUses += count;
      if (event._id.name === 'portfolio.instagram.clicked') bucket.instagramClicks += count;
      if (event._id.name === 'portfolio.whatsapp.clicked') bucket.whatsappClicks += count;
      if (event._id.name === 'portfolio.enquiry.clicked') bucket.enquiryClicks += count;
      metricsByHandle.set(handle, bucket);
    }
    const latestJobByPortfolio = new Map();
    for (const job of jobs) {
      const key = String(job.portfolioId);
      if (!latestJobByPortfolio.has(key)) latestJobByPortfolio.set(key, job);
    }
    const records = portfolios.map(portfolio => {
      const owner = portfolio.userId;
      const items = Array.isArray(portfolio.items) ? portfolio.items : [];
      const missingItemCount = items.filter(item => !availableMedia.has(String(item.publicId))).length;
      const previousHandles = Array.isArray(portfolio.previousHandles) ? portfolio.previousHandles : [];
      const now = Date.now();
      const activeRedirects = previousHandles.filter(entry => new Date(entry.redirectUntil).getTime() > now).length;
      const expiredRedirects = previousHandles.filter(entry => new Date(entry.redirectUntil).getTime() <= now).length;
      const latestJob = latestJobByPortfolio.get(String(portfolio._id));
      const reasons = [];
      if (!owner) reasons.push('Owner account is missing');
      if (!owner || !['pro', 'studio'].includes(owner.plan) && !(owner.planOverride?.plan === 'pro' && (!owner.planOverride.expiresAt || new Date(owner.planOverride.expiresAt).getTime() > now))) reasons.push('Account is not currently entitled to public Portfolio');
      if (portfolio.status === 'published' && !String(portfolio.bio || '').trim()) reasons.push('Published portfolio has no bio');
      if (portfolio.status === 'published' && items.length < 4) reasons.push(`Published portfolio has only ${items.length} photograph${items.length === 1 ? '' : 's'}`);
      if (missingItemCount) reasons.push(`${missingItemCount} selected photograph${missingItemCount === 1 ? '' : 's'} no longer resolve`);
      if (latestJob?.status === 'failed') reasons.push(`Latest direction job failed${latestJob.errorCode ? ` (${latestJob.errorCode})` : ''}`);
      const metrics = metricsByHandle.get(String(portfolio.handle || '').toLowerCase()) || portfolioMetricBucket();
      return {
        id: portfolio._id,
        handle: portfolio.handle,
        publicPath: `/@${encodeURIComponent(portfolio.handle)}`,
        status: portfolio.status,
        studioName: portfolio.studioName || owner?.studio?.name || owner?.name || 'Unnamed studio',
        owner: owner ? { id: owner._id, name: owner.name, email: owner.email, plan: owner.plan, accountStatus: owner.accountStatus } : null,
        itemCount: items.length,
        missingItemCount,
        bioPresent: Boolean(String(portfolio.bio || '').trim()),
        previousHandles: { active: activeRedirects, expired: expiredRedirects },
        metrics,
        latestJob: latestJob ? { id: latestJob._id, status: latestJob.status, stage: latestJob.stage, progress: latestJob.progress, attempts: latestJob.attempts, provider: latestJob.provider, promptVersion: latestJob.promptVersion, errorCode: latestJob.errorCode || '', errorMessage: latestJob.errorMessage || '', updatedAt: latestJob.updatedAt, completedAt: latestJob.completedAt || null } : null,
        broken: reasons.length > 0,
        brokenReasons: reasons,
        updatedAt: portfolio.updatedAt,
        publishedAt: portfolio.publishedAt || null
      };
    });
    const summary = records.reduce((result, portfolio) => {
      result.total += 1;
      result[portfolio.status] = (result[portfolio.status] || 0) + 1;
      if (portfolio.broken) result.broken += 1;
      if (portfolio.latestJob?.status === 'failed') result.jobsFailed += 1;
      for (const key of ['views', 'uniqueVisitors', 'projectOpens', 'filterUses', 'instagramClicks', 'whatsappClicks', 'enquiryClicks']) result[key] += Number(portfolio.metrics?.[key] || 0);
      result.expiredRedirects += Number(portfolio.previousHandles?.expired || 0);
      return result;
    }, { total: 0, draft: 0, published: 0, broken: 0, jobsFailed: 0, views: 0, uniqueVisitors: 0, projectOpens: 0, filterUses: 0, instagramClicks: 0, whatsappClicks: 0, enquiryClicks: 0, expiredRedirects: 0 });
    res.json({ success: true, data: { generatedAt: new Date(), windowDays: 90, summary, portfolios: records } });
  } catch (error) {
    console.error('[admin/portfolios]', error.message);
    res.status(500).json({ success: false, message: 'We could not load portfolio records.' });
  }
}

export async function adminUnpublishPortfolio(req, res) {
  try {
    const portfolioId = validId(req.params.id);
    if (!portfolioId) return res.status(400).json({ success: false, message: 'Portfolio identifier is invalid.' });
    const portfolio = await Portfolio.findById(portfolioId);
    if (!portfolio) return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    if (portfolio.status !== 'published') return res.status(409).json({ success: false, message: 'That portfolio is already private.' });
    const before = { status: portfolio.status, publishedAt: portfolio.publishedAt || null };
    portfolio.status = 'draft';
    portfolio.publishedAt = undefined;
    await portfolio.save();
    await AdminAudit.create({ adminId: adminId(req), userId: portfolio.userId, action: 'portfolio.unpublished_by_admin', resourceType: 'Portfolio', resourceId: String(portfolio._id), details: { before, after: { status: portfolio.status, publishedAt: null }, reason: safeReason(req.body.reason, 'Made private by administrator') } });
    res.json({ success: true, message: 'Portfolio is now private.' });
  } catch (error) {
    console.error('[admin/portfolio-unpublish]', error.message);
    res.status(500).json({ success: false, message: 'We could not make that portfolio private.' });
  }
}

const supportCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(4000),
  deliveryPublicId: z.string().trim().max(120).optional(),
  resourceType: z.enum(['delivery', 'portfolio', 'account', 'none']).default('none'),
  resourceId: z.string().trim().max(160).optional()
}).strict();

const supportUpdateSchema = z.object({
  status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  category: z.enum(['delivery', 'upload', 'billing', 'privacy', 'abuse', 'copyright', 'account', 'format', 'portfolio', 'other']).optional(),
  assignedAdminId: z.string().trim().optional(),
  message: z.string().trim().min(1).max(4000).optional(),
  internal: z.boolean().default(false)
}).strict();

const supportModerationSchema = z.object({
  action: z.enum(['takedown', 'restore', 'copyright_hold', 'abuse_review']),
  targetType: z.enum(['delivery', 'portfolio', 'account']),
  targetId: z.string().trim().max(160).optional(),
  reason: z.string().trim().min(8).max(1000)
}).strict();

function supportText(value, max = 4000) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function supportCategory(subject) {
  const value = String(subject || '').toLowerCase();
  if (value.includes('delivery')) return 'delivery';
  if (value.includes('format')) return 'format';
  if (value.includes('portfolio')) return 'portfolio';
  if (value.includes('pro') || value.includes('billing') || value.includes('payment')) return 'billing';
  if (value.includes('privacy') || value.includes('deletion')) return 'privacy';
  if (value.includes('upload')) return 'upload';
  if (value.includes('account') || value.includes('sign')) return 'account';
  return 'other';
}

function supportSummary(ticket) {
  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  const latest = messages[messages.length - 1];
  return {
    id: ticket._id,
    ticketNumber: ticket.ticketNumber,
    requester: { name: ticket.requesterName, email: ticket.requesterEmail },
    account: ticket.userId ? { id: ticket.userId._id || ticket.userId, name: ticket.userId.name, email: ticket.userId.email, studio: ticket.userId.studio?.name || '' } : null,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    delivery: ticket.deliveryId ? { id: ticket.deliveryId._id || ticket.deliveryId, publicId: ticket.deliveryId.publicId, title: ticket.deliveryId.title, status: ticket.deliveryId.status } : (ticket.deliveryPublicId ? { publicId: ticket.deliveryPublicId } : null),
    resourceType: ticket.resourceType,
    resourceId: ticket.resourceId || '',
    assignedAdmin: ticket.assignedAdminId ? { id: ticket.assignedAdminId._id || ticket.assignedAdminId, name: ticket.assignedAdminId.name, username: ticket.assignedAdminId.username, role: ticket.assignedAdminId.role } : null,
    messageCount: messages.length,
    internalNoteCount: messages.filter(message => message.internal).length,
    latestMessage: latest ? { message: latest.message, internal: latest.internal, authorType: latest.authorType, createdAt: latest.createdAt } : null,
    moderationCount: Array.isArray(ticket.moderationActions) ? ticket.moderationActions.length : 0,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastResponseAt: ticket.lastResponseAt || null,
    resolvedAt: ticket.resolvedAt || null,
    closedAt: ticket.closedAt || null
  };
}

export async function createSupportTicket(req, res) {
  try {
    const parsed = supportCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Please check the support form.' });
    const body = parsed.data;
    const signedInUser = req.user?.id ? await User.findById(req.user.id).select('_id name email') : null;
    const delivery = body.deliveryPublicId ? await Delivery.findOne({ publicId: body.deliveryPublicId }).select('_id publicId userId title status').lean() : null;
    const associatedDelivery = delivery && (!signedInUser || String(delivery.userId) === String(signedInUser._id)) ? delivery : null;
    const ticket = await SupportTicket.create({
      userId: signedInUser?._id,
      requesterName: supportText(signedInUser?.name || body.name, 100),
      requesterEmail: String(signedInUser?.email || body.email).trim().toLowerCase().slice(0, 254),
      subject: supportText(body.subject, 160),
      category: supportCategory(body.subject),
      deliveryId: associatedDelivery?._id,
      deliveryPublicId: supportText(body.deliveryPublicId, 120),
      resourceType: body.resourceType,
      resourceId: supportText(body.resourceId, 160),
      messages: [{ authorType: 'requester', message: supportText(body.message), internal: false }]
    });
    res.status(201).json({ success: true, data: { ticketNumber: ticket.ticketNumber, status: ticket.status }, message: 'Your support request is with the Veylo team.' });
  } catch (error) {
    console.error('[support/create]', error.message);
    res.status(500).json({ success: false, message: 'We could not send your support request. Please email info@veylo.com.ng.' });
  }
}

export async function getSupportOverview(req, res) {
  try {
    const status = ['open', 'pending', 'resolved', 'closed'].includes(String(req.query.status || '')) ? String(req.query.status) : 'all';
    const category = ['delivery', 'upload', 'billing', 'privacy', 'abuse', 'copyright', 'account', 'format', 'portfolio', 'other'].includes(String(req.query.category || '')) ? String(req.query.category) : 'all';
    const priority = ['low', 'normal', 'high', 'urgent'].includes(String(req.query.priority || '')) ? String(req.query.priority) : 'all';
    const search = String(req.query.search || '').trim().slice(0, 100);
    const query = {};
    if (status !== 'all') query.status = status;
    if (category !== 'all') query.category = category;
    if (priority !== 'all') query.priority = priority;
    if (search) {
      const pattern = { $regex: escaped(search), $options: 'i' };
      query.$or = [{ ticketNumber: pattern }, { requesterName: pattern }, { requesterEmail: pattern }, { subject: pattern }, { deliveryPublicId: pattern }, { resourceId: pattern }];
    }
    const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 250));
    const [tickets, total, grouped] = await Promise.all([
      SupportTicket.find(query).populate('userId', 'name email studio.name').populate('assignedAdminId', 'name username role').populate('deliveryId', 'publicId title status').sort({ priority: -1, updatedAt: -1 }).limit(limit).lean(),
      SupportTicket.countDocuments(query),
      SupportTicket.aggregate([{ $group: { _id: { status: '$status', category: '$category' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    ]);
    const summary = { total, open: 0, pending: 0, resolved: 0, closed: 0, urgent: 0, high: 0, privacy: 0, abuse: 0, copyright: 0 };
    for (const ticket of tickets) {
      summary[ticket.status] = (summary[ticket.status] || 0) + 1;
      if (ticket.priority === 'urgent') summary.urgent += 1;
      if (ticket.priority === 'high') summary.high += 1;
      if (['privacy', 'abuse', 'copyright'].includes(ticket.category)) summary[ticket.category] += 1;
    }
    res.json({ success: true, data: { generatedAt: new Date(), summary, grouped, tickets: tickets.map(supportSummary), total } });
  } catch (error) {
    console.error('[admin/support-overview]', error.message);
    res.status(500).json({ success: false, message: 'We could not load support requests.' });
  }
}

export async function getSupportTicketDetail(req, res) {
  try {
    const ticketId = validId(req.params.id);
    if (!ticketId) return res.status(400).json({ success: false, message: 'That support request identifier is invalid.' });
    const ticket = await SupportTicket.findById(ticketId).populate('userId', 'name email studio.name plan accountStatus').populate('assignedAdminId', 'name username role').populate('deliveryId', 'publicId title clientName status format').lean();
    if (!ticket) return res.status(404).json({ success: false, message: 'Support request not found.' });
    res.json({ success: true, data: { ...supportSummary(ticket), messages: ticket.messages || [], moderationActions: ticket.moderationActions || [] } });
  } catch (error) {
    console.error('[admin/support-detail]', error.message);
    res.status(500).json({ success: false, message: 'We could not open this support request.' });
  }
}

export async function updateSupportTicket(req, res) {
  try {
    const ticketId = validId(req.params.id);
    if (!ticketId) return res.status(400).json({ success: false, message: 'That support request identifier is invalid.' });
    const parsed = supportUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'That support update is not valid.' });
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Support request not found.' });
    const before = { status: ticket.status, priority: ticket.priority, category: ticket.category, assignedAdminId: ticket.assignedAdminId || null };
    if (parsed.data.assignedAdminId !== undefined) {
      const assignedId = validId(parsed.data.assignedAdminId);
      if (!assignedId) return res.status(400).json({ success: false, message: 'That administrator identifier is invalid.' });
      const assigned = await AdminUser.findOne({ _id: assignedId, accountStatus: 'active' }).select('_id').lean();
      if (!assigned) return res.status(404).json({ success: false, message: 'That administrator is not active.' });
      ticket.assignedAdminId = assigned._id;
    }
    if (parsed.data.status) {
      ticket.status = parsed.data.status;
      if (parsed.data.status === 'resolved') ticket.resolvedAt = new Date();
      if (parsed.data.status === 'closed') ticket.closedAt = new Date();
      if (parsed.data.status === 'open' || parsed.data.status === 'pending') { ticket.resolvedAt = undefined; ticket.closedAt = undefined; }
    }
    if (parsed.data.priority) ticket.priority = parsed.data.priority;
    if (parsed.data.category) ticket.category = parsed.data.category;
    if (parsed.data.message) {
      ticket.messages.push({ authorType: 'admin', adminId: adminId(req), message: supportText(parsed.data.message), internal: Boolean(parsed.data.internal) });
      if (!parsed.data.internal) ticket.lastResponseAt = new Date();
    }
    await ticket.save();
    await AdminAudit.create({ adminId: adminId(req), userId: ticket.userId, action: 'support.ticket_updated', resourceType: 'SupportTicket', resourceId: String(ticket._id), details: { before, after: { status: ticket.status, priority: ticket.priority, category: ticket.category, assignedAdminId: ticket.assignedAdminId || null }, messageAdded: Boolean(parsed.data.message), internal: Boolean(parsed.data.internal) } });
    res.json({ success: true, data: supportSummary(ticket), message: 'Support request updated.' });
  } catch (error) {
    console.error('[admin/support-update]', error.message);
    res.status(500).json({ success: false, message: 'We could not update this support request.' });
  }
}

export async function moderateSupportTicket(req, res) {
  try {
    const ticketId = validId(req.params.id);
    if (!ticketId) return res.status(400).json({ success: false, message: 'That support request identifier is invalid.' });
    const parsed = supportModerationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'That moderation action is not valid.' });
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Support request not found.' });
    const targetId = supportText(parsed.data.targetId || ticket.resourceId || ticket.deliveryPublicId, 160);
    let outcome = 'Action recorded for review.';
    let userId = ticket.userId;
    if (parsed.data.action === 'takedown' && parsed.data.targetType === 'delivery' && targetId) {
      const deliveryQuery = mongoose.isValidObjectId(targetId) ? { _id: targetId } : { publicId: targetId };
      const delivery = await Delivery.findOne(deliveryQuery);
      if (!delivery) return res.status(404).json({ success: false, message: 'The delivery named in this report was not found.' });
      const before = { status: delivery.status, revokedAt: delivery.access?.revokedAt || null };
      delivery.archivedFromStatus = delivery.status;
      delivery.status = 'archived';
      delivery.archivedAt = new Date();
      delivery.access = delivery.access || {};
      delivery.access.revokedAt = new Date();
      await delivery.save();
      userId = delivery.userId;
      outcome = 'Delivery archived and its client link revoked.';
      await AdminAudit.create({ adminId: adminId(req), userId: delivery.userId, action: 'moderation.delivery_takedown', resourceType: 'Delivery', resourceId: String(delivery._id), details: { before, after: { status: delivery.status, revokedAt: delivery.access.revokedAt }, ticketId: String(ticket._id), reason: supportText(parsed.data.reason, 1000) } });
    } else if (parsed.data.action === 'takedown' && parsed.data.targetType === 'portfolio' && targetId) {
      const portfolio = await Portfolio.findOne({ $or: [{ handle: targetId }, ...(mongoose.isValidObjectId(targetId) ? [{ _id: targetId }] : [])] });
      if (!portfolio) return res.status(404).json({ success: false, message: 'The portfolio named in this report was not found.' });
      portfolio.status = 'draft';
      portfolio.publishedAt = undefined;
      await portfolio.save();
      userId = portfolio.userId;
      outcome = 'Portfolio made private while the report is reviewed.';
      await AdminAudit.create({ adminId: adminId(req), userId: portfolio.userId, action: 'moderation.portfolio_takedown', resourceType: 'Portfolio', resourceId: String(portfolio._id), details: { ticketId: String(ticket._id), reason: supportText(parsed.data.reason, 1000) } });
    } else if (parsed.data.action === 'restore') {
      outcome = 'Restore request recorded; the owner must meet publishing checks before the link is restored.';
    }
    ticket.moderationActions.push({ action: parsed.data.action, targetType: parsed.data.targetType, targetId, adminId: adminId(req), reason: supportText(parsed.data.reason, 1000), outcome });
    ticket.status = ticket.status === 'closed' ? 'closed' : 'pending';
    await ticket.save();
    await AdminAudit.create({ adminId: adminId(req), userId, action: `support.moderation_${parsed.data.action}`, resourceType: 'SupportTicket', resourceId: String(ticket._id), details: { targetType: parsed.data.targetType, targetId, outcome, reason: supportText(parsed.data.reason, 1000) } });
    res.json({ success: true, data: { outcome, ticket: supportSummary(ticket) } });
  } catch (error) {
    console.error('[admin/support-moderation]', error.message);
    res.status(500).json({ success: false, message: 'We could not apply that moderation action.' });
  }
}

const runtimePlanPatchSchema = z.object({
  deliveriesPerMonth: z.number().int().min(0).max(100000).nullable().optional(),
  photosPerDelivery: z.number().int().min(1).max(5000).optional(),
  branding: z.enum(['veylo', 'studio']).optional(),
  portfolio: z.boolean().optional(),
  personalStorageBytes: z.number().int().min(0).max(10 * 1024 ** 4).optional(),
  formats: z.array(z.enum(FORMAT_IDS)).max(FORMAT_IDS.length).optional()
}).strict();

const runtimeConfigPatchSchema = z.object({
  plans: z.object({ free: runtimePlanPatchSchema.optional(), pro: runtimePlanPatchSchema.optional() }).strict().optional(),
  formats: z.array(z.object({ id: z.enum(FORMAT_IDS), label: z.string().trim().min(2).max(80), enabled: z.boolean() }).strict()).max(FORMAT_IDS.length).optional(),
  featureFlags: z.object({ deliveryPipeline: z.boolean().optional(), portfolio: z.boolean().optional(), music: z.boolean().optional(), narration: z.boolean().optional(), volumeDeliveries: z.boolean().optional(), optionalAnalytics: z.boolean().optional() }).strict().optional(),
  maintenance: z.object({ enabled: z.boolean(), message: z.string().trim().min(10).max(240) }).strict().optional(),
  narration: z.object({ enabled: z.boolean().optional(), defaultVoiceId: z.enum(NARRATION_VOICES.map(voice => voice.id)).optional() }).strict().optional(),
  retention: z.object({ proRetentionDays: z.number().int().min(1).max(3650).optional(), orphanUploadHours: z.number().int().min(1).max(168).optional(), workerIntervalHours: z.number().int().min(1).max(168).optional(), analyticsRetentionDays: z.number().int().min(30).max(3650).optional() }).strict().optional(),
  rateLimits: z.object({ authAttemptsPer15m: z.number().int().min(1).max(1000).optional(), registrationsPerHour: z.number().int().min(1).max(1000).optional(), emailCodesPerHour: z.number().int().min(1).max(1000).optional(), aiGenerationsPerHour: z.number().int().min(1).max(1000).optional(), supportTicketsPerHour: z.number().int().min(1).max(100).optional(), publicAccessPer15m: z.number().int().min(1).max(10000).optional(), mediaPerHour: z.number().int().min(1).max(100000).optional(), uploadsPerHour: z.number().int().min(1).max(100000).optional(), clientDeliveryEmailsPerHour: z.number().int().min(1).max(1000).optional(), billingActionsPerHour: z.number().int().min(1).max(1000).optional(), profileUpdatesPerHour: z.number().int().min(1).max(1000).optional(), analyticsEventsPer15m: z.number().int().min(10).max(10000).optional() }).strict().optional(),
  emailTemplates: z.array(z.object({ id: z.string().trim().regex(/^[a-z0-9-]+$/).max(60), label: z.string().trim().min(2).max(100), enabled: z.boolean() }).strict()).max(50).optional()
}).strict();

export async function getRuntimeConfiguration(req, res) {
  try {
    const config = await getRuntimeConfig({ fresh: true });
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('[admin/configuration]', error.message);
    res.status(500).json({ success: false, message: 'We could not load runtime configuration.' });
  }
}

export async function updateRuntimeConfiguration(req, res) {
  try {
    const parsed = runtimeConfigPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'That configuration change is not valid.' });
    const current = await getRuntimeConfig({ fresh: true });
    const patch = { ...parsed.data };
    if (patch.plans) patch.plans = { free: { ...(current.plans?.free || {}), ...(patch.plans.free || {}) }, pro: { ...(current.plans?.pro || {}), ...(patch.plans.pro || {}) } };
    if (patch.formats) patch.formats = Object.fromEntries(patch.formats.map(format => [format.id, { id: format.id, label: format.label || FORMAT_LABELS[format.id], enabled: format.enabled }]));
    if (patch.featureFlags) patch.featureFlags = { ...(current.featureFlags || {}), ...patch.featureFlags };
    if (patch.maintenance) patch.maintenance = { ...(current.maintenance || {}), ...patch.maintenance };
    if (patch.narration) {
      patch.narration = { ...(current.narration || {}), ...patch.narration };
      if (patch.narration.enabled !== undefined) patch.featureFlags = { ...(current.featureFlags || {}), ...(patch.featureFlags || {}), narration: patch.narration.enabled };
    }
    if (patch.retention) patch.retention = { ...(current.retention || {}), ...patch.retention };
    if (patch.rateLimits) patch.rateLimits = { ...(current.rateLimits || {}), ...patch.rateLimits };
    if (patch.emailTemplates) patch.emailTemplates = patch.emailTemplates.map(template => ({ ...(current.emailTemplates || []).find(item => item.id === template.id), ...template }));
    const updated = await updateRuntimeConfig(patch, adminId(req));
    await AdminAudit.create({ adminId: adminId(req), action: 'configuration.updated', resourceType: 'RuntimeConfig', resourceId: 'global', details: { changedSections: Object.keys(patch), before: Object.fromEntries(Object.keys(patch).map(key => [key, current[key]])), after: Object.fromEntries(Object.keys(patch).map(key => [key, updated[key]])) } });
    res.json({ success: true, data: updated, message: 'Runtime configuration saved.' });
  } catch (error) {
    console.error('[admin/configuration-update]', error.message);
    res.status(500).json({ success: false, message: 'We could not save runtime configuration.' });
  }
}

export async function refundPayment(req, res) {
  let reserved = false;
  let payment;
  try {
    payment = await Payment.findById(req.params.id);
    if (!payment || !['success', 'partially_refunded'].includes(payment.status)) return res.status(404).json({ success: false, message: 'A refundable payment was not found.' });
    if (payment.refundPendingAmountKobo > 0) return res.status(409).json({ success: false, message: 'A refund for this payment is already being processed.' });
    const requested = req.body.amountKobo === undefined ? payment.amountKobo - payment.refundedAmountKobo : Number(req.body.amountKobo);
    const available = payment.amountKobo - payment.refundedAmountKobo;
    if (!Number.isInteger(requested) || requested < 100 || requested > available) return res.status(400).json({ success: false, message: 'Enter a refund amount within the remaining payment balance.' });
    const reservation = await Payment.updateOne({ _id: payment._id, refundPendingAmountKobo: 0 }, { $set: { refundPendingAmountKobo: requested } });
    if (!reservation.modifiedCount) return res.status(409).json({ success: false, message: 'A refund for this payment is already being processed.' });
    reserved = true;
    const result = await paystackRequest('/refund', { method: 'POST', body: { transaction: payment.reference, amount: requested, currency: 'NGN', customer_note: String(req.body.note || 'Veylo support refund').slice(0, 240), merchant_note: `Approved by Veylo admin ${req.admin._id}` } });
    await AdminAudit.create({ adminId: req.admin._id, userId: payment.userId, action: 'payment.refund_requested', resourceType: 'Payment', resourceId: String(payment._id), details: { amountKobo: requested, paystackRefundId: result.id, note: String(req.body.note || '').slice(0, 240) } });
    res.status(202).json({ success: true, message: 'Paystack accepted the refund request.', data: { refundId: result.id, status: result.status, amountKobo: requested } });
  } catch (error) {
    if (reserved && payment && error.providerStatus && error.providerStatus < 500) await Payment.updateOne({ _id: payment._id }, { $set: { refundPendingAmountKobo: 0 } });
    console.error('[admin/refund]', error.message);
    res.status(error.status || 500).json({ success: false, message: 'We could not send this refund to Paystack.' });
  }
}

export async function getAllStories(req, res) {
  try {
    const { search, limit = 50 } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { title: { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } },
        { clientName: { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } },
        { occasion: { $regex: escaped(String(search).slice(0, 100)), $options: 'i' } }
      ];
    }

    const stories = await PhotoStory.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 50)))
      .lean();

    res.json({ success: true, data: stories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function adminDeleteStory(req, res) {
  try {
    await PhotoStory.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Story permanently removed by SuperAdmin.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
