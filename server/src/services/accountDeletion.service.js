import mongoose from 'mongoose';
import User from '../models/User.js';
import AuthCode from '../models/AuthCode.js';
import Session from '../models/Session.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import PhotoStory from '../models/PhotoStory.js';
import StoryView from '../models/StoryView.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import BillingEvent from '../models/BillingEvent.js';
import EmailDelivery from '../models/EmailDelivery.js';
import AccountDeletionRequest from '../models/AccountDeletionRequest.js';
import DeliveryUsage from '../models/DeliveryUsage.js';
import Delivery from '../models/Delivery.js';
import DeliveryJob from '../models/DeliveryJob.js';
import DeliveryRevision from '../models/DeliveryRevision.js';
import DeliveryPreparation from '../models/DeliveryPreparation.js';
import DeliveryTask from '../models/DeliveryTask.js';
import DeliveryObservation from '../models/DeliveryObservation.js';
import DeliveryShareGrant from '../models/DeliveryShareGrant.js';
import PhotoLike from '../models/PhotoLike.js';
import DeliveryView from '../models/DeliveryView.js';
import StorageAsset from '../models/StorageAsset.js';
import Portfolio from '../models/Portfolio.js';
import PortfolioJob from '../models/PortfolioJob.js';
import VolumeJob from '../models/VolumeJob.js';
import VolumeSubject from '../models/VolumeSubject.js';
import VolumeAccessCode from '../models/VolumeAccessCode.js';
import AdminAccountNote from '../models/AdminAccountNote.js';
import SupportAccessGrant from '../models/SupportAccessGrant.js';
import SupportTicket from '../models/SupportTicket.js';
import AnalyticsEvent from '../models/AnalyticsEvent.js';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';
import { billingConfigured, decryptBillingToken, paystackRequest } from './paystack.service.js';

export class AccountDeletionError extends Error {
  constructor(message, status = 500, code = 'ACCOUNT_DELETION_FAILED') {
    super(message);
    this.name = 'AccountDeletionError';
    this.status = status;
    this.code = code;
  }
}

function providerError(error, fallbackCode) {
  const wrapped = new AccountDeletionError('The account could not be removed completely. No account records were deleted. Try again after the provider is available.', 502, fallbackCode);
  wrapped.cause = error;
  return wrapped;
}

async function removeCloudinaryResources(prefix, resourceType) {
  await Promise.all(['upload', 'authenticated'].map(async type => {
    try {
      await cloudinary.api.delete_resources_by_prefix(prefix, { resource_type: resourceType, type, invalidate: true });
    } catch (error) {
      if (error?.http_code !== 404) throw error;
    }
  }));
}

async function deleteCloudinaryFolder(path) {
  await cloudinary.api.delete_folder(path).catch(error => {
    if (error?.http_code !== 404) throw error;
  });
}

async function nestedCloudinaryFolders(prefix) {
  const found = [];
  let cursor;
  do {
    let response;
    try {
      response = await cloudinary.api.sub_folders(prefix, { max_results: 500, next_cursor: cursor });
    } catch (error) {
      if (error?.http_code === 404) return found;
      throw error;
    }
    for (const folder of response.folders || []) {
      found.push(...await nestedCloudinaryFolders(folder.path), folder.path);
    }
    cursor = response.next_cursor;
  } while (cursor);
  return found;
}

async function removeCloudinaryFolder(prefix, resourceTypes) {
  await Promise.all(resourceTypes.map(resourceType => removeCloudinaryResources(prefix, resourceType)));
  for (const child of await nestedCloudinaryFolders(prefix)) await deleteCloudinaryFolder(child);
  await deleteCloudinaryFolder(prefix);
}

async function cancelActiveSubscriptions(userId) {
  const subscriptions = await Subscription.find({
    userId,
    status: { $in: ['active', 'canceling', 'past_due'] },
    subscriptionCode: { $exists: true, $ne: '' }
  }).sort({ createdAt: -1 }).select('+emailTokenEncrypted cancelRequestedAt');
  if (!subscriptions.length) return [];
  const pending = subscriptions.filter(subscription => !subscription.cancelRequestedAt);
  if (!pending.length) return subscriptions.map(subscription => subscription._id);
  if (!billingConfigured()) throw new AccountDeletionError('Cancel the active Pro subscription before deleting this account. Billing is not available to confirm the cancellation.', 409, 'BILLING_CANCELLATION_REQUIRED');

  const credentials = pending.map(subscription => {
    try {
      return { subscription, token: decryptBillingToken(subscription.emailTokenEncrypted) };
    } catch {
      return { subscription, token: '' };
    }
  });
  if (credentials.some(item => !item.token)) throw new AccountDeletionError('Cancel the active Pro subscription before deleting this account. Veylo could not confirm the billing token.', 409, 'BILLING_CANCELLATION_REQUIRED');

  for (const { subscription, token } of credentials) {
    try {
      await paystackRequest('/subscription/disable', { method: 'POST', body: { code: subscription.subscriptionCode, token } });
    } catch (error) {
      throw providerError(error, 'BILLING_CANCELLATION_FAILED');
    }
    subscription.status = 'canceling';
    subscription.cancelRequestedAt = new Date();
    try {
      await subscription.save();
    } catch (error) {
      throw providerError(error, 'BILLING_RECORD_UPDATE_FAILED');
    }
  }
  return subscriptions.map(subscription => subscription._id);
}

function accountBeforeSnapshot(user) {
  return {
    id: String(user._id),
    name: user.name || '',
    email: user.email || '',
    role: user.role || 'user',
    plan: user.plan || 'free',
    accountStatus: user.accountStatus || 'pending',
    storageUsedBytes: Number(user.storageUsedBytes || 0),
    createdAt: user.createdAt || null
  };
}

async function removeMedia({ user, stories, hasDeliveries, hasStorageAssets }) {
  const userPrefix = `veylo/users/${user._id}`;
  const storyUsesUserFolder = stories.some(story => [
    story.soundtrack?.audioUrl,
    ...(story.photos || []).map(photo => photo.url)
  ].some(url => String(url || '').includes(`/${userPrefix}/`)));
  const hasUserMedia = storyUsesUserFolder || hasDeliveries || hasStorageAssets;
  const hasStudioAsset = String(user.studio?.logoPublicId || '').startsWith(`veylo/studios/${user._id}/`);
  if (!hasUserMedia && !hasStudioAsset) return;
  if (!configureCloudinary()) throw new AccountDeletionError('The account has stored media, but media storage is not available. Nothing was deleted. Try again when Cloudinary is configured.', 503, 'MEDIA_CLEANUP_UNAVAILABLE');

  try {
    await Promise.all([
      hasStudioAsset ? removeCloudinaryFolder(`veylo/studios/${user._id}`, ['image']) : Promise.resolve(),
      hasUserMedia ? removeCloudinaryFolder(userPrefix, ['image', 'video']) : Promise.resolve()
    ]);
  } catch (error) {
    throw providerError(error, 'MEDIA_CLEANUP_FAILED');
  }
}

function transactionUnsupported(error) {
  const message = String(error?.message || '');
  return error?.code === 20 || /transaction numbers are only allowed|transactions are not supported|replica set|mongos/i.test(message);
}

async function deleteOwnedRecords({ accountId, deliveryIds, storyIds, volumeJobIds, session, deleted }) {
  const options = session ? { session } : {};
  const deleteMany = async (key, model, filter) => {
    try {
      const result = await model.deleteMany(filter, options);
      deleted[key] = Number(result.deletedCount || 0);
    } catch (error) {
      if (error instanceof AccountDeletionError) throw error;
      const wrapped = new AccountDeletionError(`Account cleanup stopped while removing ${key}. Try again; the account itself was not removed.`, 500, 'ACCOUNT_RECORD_CLEANUP_FAILED');
      wrapped.stage = key;
      wrapped.cause = error;
      throw wrapped;
    }
  };

  await deleteMany('storyViews', StoryView, storyIds.length ? { storyId: { $in: storyIds } } : { _id: { $in: [] } });
  await deleteMany('stories', PhotoStory, { userId: accountId });
  await deleteMany('sessions', Session, { userId: accountId });
  await deleteMany('authCodes', AuthCode, { userId: accountId });
  await deleteMany('passwordResetTokens', PasswordResetToken, { userId: accountId });
  await deleteMany('subscriptions', Subscription, { userId: accountId });
  await deleteMany('payments', Payment, { userId: accountId });
  await deleteMany('billingEvents', BillingEvent, { userId: accountId });
  await deleteMany('emailDeliveries', EmailDelivery, deliveryIds.length
    ? { $or: [{ userId: accountId }, { deliveryId: { $in: deliveryIds } }] }
    : { userId: accountId });
  await deleteMany('deliveryUsage', DeliveryUsage, { userId: accountId });
  await deleteMany('deliveryLikes', PhotoLike, deliveryIds.length ? { deliveryId: { $in: deliveryIds } } : { _id: { $in: [] } });
  await deleteMany('deliveryViews', DeliveryView, deliveryIds.length ? { deliveryId: { $in: deliveryIds } } : { _id: { $in: [] } });
  await deleteMany('deliveryShareGrants', DeliveryShareGrant, { userId: accountId });
  await deleteMany('deliveryJobs', DeliveryJob, { userId: accountId });
  await deleteMany('deliveryRevisions', DeliveryRevision, { userId: accountId });
  await deleteMany('deliveryPreparations', DeliveryPreparation, { userId: accountId });
  await deleteMany('deliveryTasks', DeliveryTask, { userId: accountId });
  await deleteMany('deliveryObservations', DeliveryObservation, { userId: accountId });
  await deleteMany('deliveries', Delivery, { userId: accountId });
  await deleteMany('volumeAccessCodes', VolumeAccessCode, volumeJobIds.length ? { jobId: { $in: volumeJobIds } } : { _id: { $in: [] } });
  await deleteMany('volumeSubjects', VolumeSubject, { userId: accountId });
  await deleteMany('volumeJobs', VolumeJob, { userId: accountId });
  await deleteMany('storageAssets', StorageAsset, { userId: accountId });
  await deleteMany('portfolioJobs', PortfolioJob, { userId: accountId });
  await deleteMany('portfolios', Portfolio, { userId: accountId });
  await deleteMany('deletionRequests', AccountDeletionRequest, { userId: accountId });
  await deleteMany('adminAccountNotes', AdminAccountNote, { userId: accountId });
  await deleteMany('supportAccessGrants', SupportAccessGrant, { userId: accountId });

  const supportFilter = deliveryIds.length
    ? { $or: [{ userId: accountId }, { deliveryId: { $in: deliveryIds } }] }
    : { userId: accountId };
  await deleteMany('supportTickets', SupportTicket, supportFilter);
  const analyticsFilter = deliveryIds.length
    ? { $or: [{ userId: accountId }, { deliveryId: { $in: deliveryIds } }] }
    : { userId: accountId };
  await deleteMany('analyticsEvents', AnalyticsEvent, analyticsFilter);

  let userResult;
  try {
    userResult = await User.deleteOne({ _id: accountId }, options);
  } catch (error) {
    const wrapped = new AccountDeletionError('Account cleanup stopped before the account record could be removed. Try again.', 500, 'ACCOUNT_RECORD_CLEANUP_FAILED');
    wrapped.stage = 'user';
    wrapped.cause = error;
    throw wrapped;
  }
  if (!userResult.deletedCount) throw new AccountDeletionError('The account disappeared before deletion completed. Try again.', 409, 'ACCOUNT_CHANGED_DURING_DELETE');
  deleted.user = 1;
}

/**
 * Permanently removes a photographer account and every owned product record.
 * Admin audit rows are deliberately not touched; they are the immutable record
 * that explains who approved the removal and why.
 */
export async function deleteUserAccount({ userId } = {}) {
  if (!mongoose.isValidObjectId(userId)) throw new AccountDeletionError('That account identifier is not valid.', 400, 'INVALID_ACCOUNT_ID');
  const accountId = new mongoose.Types.ObjectId(userId);
  const user = await User.findById(accountId).select('name email role plan accountStatus storageUsedBytes createdAt studio');
  if (!user) throw new AccountDeletionError('Account not found.', 404, 'ACCOUNT_NOT_FOUND');

  const cancelledSubscriptionIds = await cancelActiveSubscriptions(accountId);
  const [stories, deliveries, volumeJobs, storageAssets, portfolio] = await Promise.all([
    PhotoStory.find({ userId: accountId }).select('_id photos.url soundtrack.audioUrl').lean(),
    Delivery.find({ userId: accountId }).select('_id').lean(),
    VolumeJob.find({ userId: accountId }).select('_id').lean(),
    StorageAsset.find({ userId: accountId }).select('_id').lean(),
    Portfolio.findOne({ userId: accountId }).select('_id').lean()
  ]);
  const deliveryIds = deliveries.map(item => item._id);
  const storyIds = stories.map(item => item._id);
  const volumeJobIds = volumeJobs.map(item => item._id);

  await removeMedia({ user, stories, hasDeliveries: deliveries.length > 0, hasStorageAssets: storageAssets.length > 0 });

  const deleted = {};
  const session = await mongoose.startSession();
  try {
    try {
      await session.withTransaction(async () => {
        await deleteOwnedRecords({ accountId, deliveryIds, storyIds, volumeJobIds, session, deleted });
      });
    } catch (error) {
      if (!transactionUnsupported(error)) throw error;
      // Local MongoDB installations and a few managed development clusters do
      // not expose replica-set transactions. The cleanup remains safe because
      // the User row is deleted last and every operation is idempotent.
      Object.keys(deleted).forEach(key => { delete deleted[key]; });
      await deleteOwnedRecords({ accountId, deliveryIds, storyIds, volumeJobIds, deleted });
    }
  } finally {
    await session.endSession();
  }

  return {
    accountId: String(accountId),
    before: accountBeforeSnapshot(user),
    deleted,
    cancelledSubscription: Boolean(cancelledSubscriptionIds.length),
    mediaRemoved: true
  };
}
