import AnalyticsEvent from '../models/AnalyticsEvent.js';
import { CLIENT_ANALYTICS_EVENT_NAMES } from '../constants/analyticsEvents.js';
import { getRuntimeConfig } from '../services/runtimeConfig.service.js';

function boundedDays(value) {
  const parsed = Number.parseInt(value, 10);
  return [7, 30, 90, 365].includes(parsed) ? parsed : 30;
}

export async function getProductAnalytics(req, res) {
  try {
    const days = boundedDays(req.query.days);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const match = { occurredAt: { $gte: since } };
    if (req.query.format && req.query.format !== 'all') match.format = String(req.query.format).slice(0, 60);
    if (req.query.actorType && req.query.actorType !== 'all') match.actorType = String(req.query.actorType).slice(0, 30);
    const formatsMatch = { ...match };
    if (!formatsMatch.format) formatsMatch.format = { $exists: true, $nin: ['', null] };
    const runtime = await getRuntimeConfig();
    const [total, clientEvents, serverEvents, eventCounts, daily, formats, actors, devices, statuses, errors, routes, consent, uniqueSessions, acquisitionSources, campaigns, referrers] = await Promise.all([
      AnalyticsEvent.countDocuments(match),
      AnalyticsEvent.countDocuments({ ...match, source: 'client' }),
      AnalyticsEvent.countDocuments({ ...match, source: { $in: ['server', 'system'] } }),
      AnalyticsEvent.aggregate([{ $match: match }, { $group: { _id: '$name', events: { $sum: 1 }, units: { $sum: { $ifNull: ['$count', 1] } }, lastAt: { $max: '$occurredAt' } } }, { $sort: { events: -1 } }, { $limit: 160 }]),
      AnalyticsEvent.aggregate([{ $match: match }, { $project: { day: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } }, source: 1, count: 1 } }, { $group: { _id: { day: '$day', source: '$source' }, events: { $sum: 1 }, units: { $sum: { $ifNull: ['$count', 1] } } } }, { $sort: { '_id.day': 1 } }]),
      AnalyticsEvent.aggregate([{ $match: formatsMatch }, { $group: { _id: '$format', events: { $sum: 1 }, deliveries: { $addToSet: '$deliveryId' } } }, { $project: { _id: 0, format: '$_id', events: 1, deliveries: { $size: { $filter: { input: '$deliveries', as: 'delivery', cond: { $ne: ['$$delivery', null] } } } } } }, { $sort: { events: -1 } }]),
      AnalyticsEvent.aggregate([{ $match: match }, { $group: { _id: '$actorType', events: { $sum: 1 } } }, { $sort: { events: -1 } }]),
      AnalyticsEvent.aggregate([{ $match: match }, { $group: { _id: { deviceType: '$deviceType', viewport: '$viewport' }, events: { $sum: 1 } } }, { $sort: { events: -1 } }, { $limit: 30 }]),
      AnalyticsEvent.aggregate([{ $match: match }, { $group: { _id: { name: '$name', status: '$status' }, events: { $sum: 1 } } }, { $sort: { events: -1 } }, { $limit: 120 }]),
      AnalyticsEvent.aggregate([{ $match: { ...match, $or: [{ errorCode: { $exists: true, $ne: '' } }, { status: { $in: ['failed', 'error', 'partial_failure'] } }] } }, { $group: { _id: { name: '$name', errorCode: '$errorCode', status: '$status' }, events: { $sum: 1 } } }, { $sort: { events: -1 } }, { $limit: 100 }]),
      AnalyticsEvent.aggregate([{ $match: { ...match, route: { $exists: true, $ne: '' } } }, { $group: { _id: '$route', events: { $sum: 1 } } }, { $sort: { events: -1 } }, { $limit: 50 }]),
      AnalyticsEvent.aggregate([{ $match: { ...match, name: { $in: ['analytics.consent.granted'] } } }, { $group: { _id: '$name', events: { $sum: 1 } } }]),
      AnalyticsEvent.distinct('sessionDigest', { ...match, sessionDigest: { $exists: true, $ne: '' } }),
      AnalyticsEvent.aggregate([{ $match: { ...match, 'metadata.acquisitionSource': { $exists: true, $nin: ['', null] } } }, { $group: { _id: '$metadata.acquisitionSource', events: { $sum: 1 } } }, { $sort: { events: -1 } }, { $limit: 30 }]),
      AnalyticsEvent.aggregate([{ $match: { ...match, 'metadata.utmCampaign': { $exists: true, $nin: ['', null] } } }, { $group: { _id: '$metadata.utmCampaign', events: { $sum: 1 } } }, { $sort: { events: -1 } }, { $limit: 30 }]),
      AnalyticsEvent.aggregate([{ $match: { ...match, 'metadata.referrerHost': { $exists: true, $nin: ['', null] } } }, { $group: { _id: '$metadata.referrerHost', events: { $sum: 1 } } }, { $sort: { events: -1 } }, { $limit: 30 }])
    ]);
    const counts = Object.fromEntries(eventCounts.map(item => [item._id, item]));
    const journeyNames = [
      'signup.started', 'signup.completed', 'onboarding.completed', 'delivery.creation.started', 'upload.completed', 'delivery.format.selected', 'delivery.review.approved', 'delivery.publish.succeeded',
      'client.delivery.opened', 'client.experience.started', 'client.experience.completed', 'client.photo.download.started', 'client.download.all.started', 'volume.recipient.gallery.opened', 'portfolio.viewed'
    ];
    const journey = journeyNames.map(name => ({ name, events: counts[name]?.events || 0, units: counts[name]?.units || 0 }));
    const clientCatalog = CLIENT_ANALYTICS_EVENT_NAMES.map(name => ({ name, events: counts[name]?.events || 0, lastAt: counts[name]?.lastAt || null }));
    const failedEvents = errors.reduce((sum, item) => sum + Number(item.events || 0), 0);
    return res.json({ success: true, data: {
      generatedAt: new Date(),
      since,
      windowDays: days,
      filters: { format: req.query.format || 'all', actorType: req.query.actorType || 'all' },
      collection: { optionalAnalyticsEnabled: runtime.featureFlags?.optionalAnalytics !== false, consentedSessions: uniqueSessions.length, consentEvents: consent.reduce((sum, item) => sum + item.events, 0), anonymized: true, excludedFields: ['passwords', 'pins', 'tokens', 'emails', 'phone numbers', 'private briefs', 'captions', 'photograph pixels', 'audio files', 'keystrokes'] },
      totals: { events: total, clientEvents, serverEvents, uniqueSessions: uniqueSessions.length, failedEvents, successRate: total ? Number(((total - failedEvents) / total * 100).toFixed(1)) : 100 },
      journey,
      eventCounts: eventCounts.map(item => ({ name: item._id, events: item.events, units: item.units, lastAt: item.lastAt })),
      clientCatalog,
      daily: daily.map(item => ({ day: item._id.day, source: item._id.source, events: item.events, units: item.units })),
      formats: formats.map(item => ({ format: item.format, events: item.events, deliveries: item.deliveries })),
      actors: actors.map(item => ({ actorType: item._id || 'unknown', events: item.events })),
      devices: devices.map(item => ({ deviceType: item._id.deviceType || 'unknown', viewport: item._id.viewport || 'unknown', events: item.events })),
      acquisitionSources: acquisitionSources.map(item => ({ source: item._id, events: item.events })),
      campaigns: campaigns.map(item => ({ campaign: item._id, events: item.events })),
      referrers: referrers.map(item => ({ host: item._id, events: item.events })),
      statuses: statuses.map(item => ({ name: item._id.name, status: item._id.status || 'unset', events: item.events })),
      errors: errors.map(item => ({ name: item._id.name, errorCode: item._id.errorCode || 'unknown', status: item._id.status || 'failed', events: item.events })),
      routes: routes.map(item => ({ route: item._id, events: item.events }))
    } });
  } catch (error) {
    console.error('[admin/product-analytics]', error.message);
    return res.status(500).json({ success: false, message: 'We could not load product analytics.' });
  }
}
