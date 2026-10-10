import mongoose from 'mongoose';
import AnalyticsEvent from '../models/AnalyticsEvent.js';
import { posthogConfiguration } from './posthog.service.js';

export async function productMonitoringSignals(now = new Date()) {
  const excluded = (process.env.ANALYTICS_EXCLUDED_USER_IDS || '').split(',').filter(value => mongoose.isValidObjectId(value)).map(value => new mongoose.Types.ObjectId(value));
  const rows = await AnalyticsEvent.aggregate([
    { $match: { excluded: { $ne: true }, actorType: { $nin: ['admin', 'system'] }, userId: { $nin: excluded }, occurredAt: { $gte: new Date(+now - 5 * 60000), $lte: now }, name: { $in: ['javascript.error', 'upload.completed', 'upload.failed', 'delivery.publish.succeeded', 'delivery.publish.failed'] } } },
    { $group: { _id: { name: '$name', source: '$source' }, count: { $sum: 1 }, accounts: { $addToSet: '$userId' } } }
  ]).option({ maxTimeMS: 5000 });
  const count = (name, serverOnly = false) => rows.filter(row => row._id.name === name && (!serverOnly || row._id.source === 'server')).reduce((sum, row) => sum + row.count, 0);
  const browsers = rows.filter(row => row._id.name === 'javascript.error');
  const accounts = new Set(browsers.flatMap(row => row.accounts).filter(Boolean).map(String));
  const browserCount = count('javascript.error');
  const uploadFailures = count('upload.failed', true), uploads = uploadFailures + count('upload.completed', true);
  const publishFailures = count('delivery.publish.failed', true), publications = publishFailures + count('delivery.publish.succeeded', true);
  const config = posthogConfiguration();
  const [failed, oldest] = config.enabled && config.configured ? await Promise.all([
    AnalyticsEvent.exists({ forwardState: 'failed', occurredAt: { $gte: new Date(+now - 24 * 3600000) } }),
    AnalyticsEvent.findOne({ forwardState: { $in: ['pending', 'sending'] } }).sort({ occurredAt: 1 }).select('occurredAt').lean()
  ]) : [null, null];
  return [
    { key: 'product:browser-errors', title: 'Browser errors are affecting multiple sessions', failed: browserCount >= 20 || browserCount >= 5 && accounts.size >= 2 },
    { key: 'product:upload-failures', title: 'More than 20% of recent server-recorded uploads are failing', failed: uploads >= 5 && uploadFailures / uploads > .2, severity: 'critical' },
    { key: 'product:publication-failures', title: 'More than 20% of recent publication attempts are failing', failed: publications >= 5 && publishFailures / publications > .2, severity: 'critical' },
    { key: 'product:posthog-delivery', title: 'PostHog forwarding has failed events or a queue older than 10 minutes', failed: Boolean(failed || oldest && +oldest.occurredAt < +now - 10 * 60000) }
  ];
}
