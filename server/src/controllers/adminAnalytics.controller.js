import AnalyticsEvent from '../models/AnalyticsEvent.js';
import { CLIENT_ANALYTICS_EVENT_NAMES } from '../constants/analyticsEvents.js';

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
      collection: { firstParty: true, consentPrompt: false, anonymized: true, excludedFields: ['passwords', 'pins', 'tokens', 'emails', 'phone numbers', 'private briefs', 'captions', 'photograph pixels', 'audio files', 'keystrokes'] },
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

function windowMatch(start, end) {
  return { source: 'client', occurredAt: { $gte: start, $lt: end } };
}

function sessionSummaryPipeline(match) {
  return [
    { $match: { ...match, sessionDigest: { $exists: true, $ne: '' } } },
    { $sort: { sessionDigest: 1, occurredAt: 1 } },
    { $group: {
      _id: '$sessionDigest',
      firstAt: { $first: '$occurredAt' },
      lastAt: { $last: '$occurredAt' },
      pageViews: { $sum: { $cond: [{ $eq: ['$name', 'page.viewed'] }, 1, 0] } },
      engagedEvent: { $max: { $cond: [{ $eq: ['$name', 'session.engaged'] }, 1, 0] } }
    } },
    { $project: {
      durationMs: { $min: [{ $subtract: ['$lastAt', '$firstAt'] }, 14_400_000] },
      pageViews: 1,
      engagedEvent: 1
    } },
    { $group: {
      _id: null,
      sessions: { $sum: 1 },
      pageViews: { $sum: '$pageViews' },
      engagedSessions: { $sum: { $cond: [{ $or: [{ $eq: ['$engagedEvent', 1] }, { $gte: ['$pageViews', 2] }, { $gte: ['$durationMs', 10_000] }] }, 1, 0] } },
      bounces: { $sum: { $cond: [{ $and: [{ $lte: ['$pageViews', 1] }, { $lt: ['$durationMs', 10_000] }, { $eq: ['$engagedEvent', 0] }] }, 1, 0] } },
      durationMs: { $sum: '$durationMs' }
    } }
  ];
}

function visitorSummaryPipeline(start, end) {
  return [
    { $match: { source: 'client', occurredAt: { $lt: end }, visitorDigest: { $exists: true, $ne: '' } } },
    { $group: {
      _id: '$visitorDigest',
      firstSeenAt: { $min: '$occurredAt' },
      windowEvents: { $sum: { $cond: [{ $and: [{ $gte: ['$occurredAt', start] }, { $lt: ['$occurredAt', end] }] }, 1, 0] } }
    } },
    { $match: { windowEvents: { $gt: 0 } } },
    { $group: {
      _id: null,
      visitors: { $sum: 1 },
      newVisitors: { $sum: { $cond: [{ $gte: ['$firstSeenAt', start] }, 1, 0] } }
    } }
  ];
}

function pageDimensionPipeline(match, field, limit = 30) {
  return [
    { $match: { ...match, name: 'page.viewed' } },
    { $group: {
      _id: `$${field}`,
      pageViews: { $sum: 1 },
      sessions: { $addToSet: '$sessionDigest' },
      visitors: { $addToSet: '$visitorDigest' }
    } },
    { $project: {
      _id: 0,
      value: { $ifNull: ['$_id', 'unknown'] },
      pageViews: 1,
      sessions: { $size: { $filter: { input: '$sessions', as: 'item', cond: { $and: [{ $ne: ['$$item', null] }, { $ne: ['$$item', ''] }] } } } },
      visitors: { $size: { $filter: { input: '$visitors', as: 'item', cond: { $and: [{ $ne: ['$$item', null] }, { $ne: ['$$item', ''] }] } } } }
    } },
    { $sort: { pageViews: -1 } },
    { $limit: limit }
  ];
}

export async function getVisitorTrafficAnalytics(req, res) {
  try {
    const days = boundedDays(req.query.days);
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);
    const trafficMatch = windowMatch(since, now);
    const previousMatch = windowMatch(previousSince, since);
    const pageMatch = { ...trafficMatch, name: 'page.viewed' };
    const funnelNames = ['landing.viewed', 'pricing.viewed', 'signup.started', 'signup.completed', 'onboarding.completed', 'delivery.creation.started', 'delivery.publish.succeeded', 'client.delivery.opened', 'client.experience.started', 'client.gallery.opened', 'client.photo.download.started', 'client.share.opened'];
    const realtimeSince = new Date(now.getTime() - 30 * 60 * 1000);

    const [currentSession, previousSession, currentVisitors, previousVisitors, pageViews, daily, sources, campaigns, referrers, routes, landingPages, exits, devices, countries, actors, funnel, realtime, failures] = await Promise.all([
      AnalyticsEvent.aggregate(sessionSummaryPipeline(trafficMatch)),
      AnalyticsEvent.aggregate(sessionSummaryPipeline(previousMatch)),
      AnalyticsEvent.aggregate(visitorSummaryPipeline(since, now)),
      AnalyticsEvent.aggregate(visitorSummaryPipeline(previousSince, since)),
      AnalyticsEvent.countDocuments(pageMatch),
      AnalyticsEvent.aggregate([
        { $match: pageMatch },
        { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } } }, pageViews: { $sum: 1 }, sessions: { $addToSet: '$sessionDigest' }, visitors: { $addToSet: '$visitorDigest' } } },
        { $project: { _id: 0, day: '$_id.day', pageViews: 1, sessions: { $size: { $filter: { input: '$sessions', as: 'item', cond: { $and: [{ $ne: ['$$item', null] }, { $ne: ['$$item', ''] }] } } } }, visitors: { $size: { $filter: { input: '$visitors', as: 'item', cond: { $and: [{ $ne: ['$$item', null] }, { $ne: ['$$item', ''] }] } } } } } },
        { $sort: { day: 1 } }
      ]),
      AnalyticsEvent.aggregate([
        { $match: pageMatch },
        { $group: { _id: { source: '$trafficSource', medium: '$trafficMedium' }, pageViews: { $sum: 1 }, sessions: { $addToSet: '$sessionDigest' }, visitors: { $addToSet: '$visitorDigest' } } },
        { $project: { _id: 0, source: { $ifNull: ['$_id.source', 'direct'] }, medium: { $ifNull: ['$_id.medium', 'direct'] }, pageViews: 1, sessions: { $size: { $filter: { input: '$sessions', as: 'item', cond: { $and: [{ $ne: ['$$item', null] }, { $ne: ['$$item', ''] }] } } } }, visitors: { $size: { $filter: { input: '$visitors', as: 'item', cond: { $and: [{ $ne: ['$$item', null] }, { $ne: ['$$item', ''] }] } } } } } },
        { $sort: { pageViews: -1 } },
        { $limit: 40 }
      ]),
      AnalyticsEvent.aggregate(pageDimensionPipeline(pageMatch, 'trafficCampaign')),
      AnalyticsEvent.aggregate(pageDimensionPipeline(pageMatch, 'referrerHost')),
      AnalyticsEvent.aggregate(pageDimensionPipeline(pageMatch, 'route', 50)),
      AnalyticsEvent.aggregate(pageDimensionPipeline(pageMatch, 'landingPath', 30)),
      AnalyticsEvent.aggregate([
        { $match: { ...pageMatch, sessionDigest: { $exists: true, $ne: '' } } },
        { $sort: { sessionDigest: 1, occurredAt: 1 } },
        { $group: { _id: '$sessionDigest', exitPath: { $last: '$route' } } },
        { $group: { _id: '$exitPath', sessions: { $sum: 1 } } },
        { $project: { _id: 0, route: { $ifNull: ['$_id', 'unknown'] }, sessions: 1 } },
        { $sort: { sessions: -1 } },
        { $limit: 30 }
      ]),
      AnalyticsEvent.aggregate([
        { $match: pageMatch },
        { $group: { _id: { deviceType: '$deviceType', browser: '$browser', operatingSystem: '$operatingSystem', viewport: '$viewport', connection: '$connection' }, pageViews: { $sum: 1 }, sessions: { $addToSet: '$sessionDigest' } } },
        { $project: { _id: 0, deviceType: { $ifNull: ['$_id.deviceType', 'unknown'] }, browser: { $ifNull: ['$_id.browser', 'unknown'] }, operatingSystem: { $ifNull: ['$_id.operatingSystem', 'unknown'] }, viewport: { $ifNull: ['$_id.viewport', 'unknown'] }, connection: { $ifNull: ['$_id.connection', 'unknown'] }, pageViews: 1, sessions: { $size: { $filter: { input: '$sessions', as: 'item', cond: { $and: [{ $ne: ['$$item', null] }, { $ne: ['$$item', ''] }] } } } } } },
        { $sort: { pageViews: -1 } },
        { $limit: 40 }
      ]),
      AnalyticsEvent.aggregate(pageDimensionPipeline(pageMatch, 'countryCode', 40)),
      AnalyticsEvent.aggregate([{ $match: trafficMatch }, { $group: { _id: '$actorType', events: { $sum: 1 }, pageViews: { $sum: { $cond: [{ $eq: ['$name', 'page.viewed'] }, 1, 0] } } } }, { $project: { _id: 0, actorType: { $ifNull: ['$_id', 'unknown'] }, events: 1, pageViews: 1 } }, { $sort: { events: -1 } }]),
      AnalyticsEvent.aggregate([{ $match: { ...trafficMatch, name: { $in: funnelNames } } }, { $group: { _id: '$name', events: { $sum: 1 }, sessions: { $addToSet: '$sessionDigest' }, visitors: { $addToSet: '$visitorDigest' } } }, { $project: { _id: 0, name: '$_id', events: 1, sessions: { $size: { $filter: { input: '$sessions', as: 'item', cond: { $and: [{ $ne: ['$$item', null] }, { $ne: ['$$item', ''] }] } } } }, visitors: { $size: { $filter: { input: '$visitors', as: 'item', cond: { $and: [{ $ne: ['$$item', null] }, { $ne: ['$$item', ''] }] } } } } } }, { $sort: { events: -1 } }]),
      AnalyticsEvent.aggregate([{ $match: { ...windowMatch(realtimeSince, now), sessionDigest: { $exists: true, $ne: '' } } }, { $group: { _id: null, events: { $sum: 1 }, pageViews: { $sum: { $cond: [{ $eq: ['$name', 'page.viewed'] }, 1, 0] } }, sessions: { $addToSet: '$sessionDigest' }, visitors: { $addToSet: '$visitorDigest' } } }, { $project: { _id: 0, events: 1, pageViews: 1, sessions: { $size: '$sessions' }, visitors: { $size: { $filter: { input: '$visitors', as: 'item', cond: { $and: [{ $ne: ['$$item', null] }, { $ne: ['$$item', ''] }] } } } } } }]),
      AnalyticsEvent.countDocuments({ ...trafficMatch, $or: [{ errorCode: { $exists: true, $ne: '' } }, { status: { $in: ['failed', 'error', 'partial_failure'] } }] })
    ]);

    const session = currentSession[0] || { sessions: 0, pageViews: 0, engagedSessions: 0, bounces: 0, durationMs: 0 };
    const previousSessionStats = previousSession[0] || { sessions: 0, pageViews: 0, engagedSessions: 0, bounces: 0, durationMs: 0 };
    const visitor = currentVisitors[0] || { visitors: 0, newVisitors: 0 };
    const previousVisitor = previousVisitors[0] || { visitors: 0, newVisitors: 0 };
    const avgSessionDuration = session.sessions ? Math.round(Number(session.durationMs || 0) / session.sessions / 1000) : 0;
    const previousAvgSessionDuration = previousSessionStats.sessions ? Math.round(Number(previousSessionStats.durationMs || 0) / previousSessionStats.sessions / 1000) : 0;
    const rate = (value, total) => total ? Number((Number(value || 0) / Number(total) * 100).toFixed(1)) : 0;
    const change = (value, previous) => previous ? Number(((Number(value || 0) - Number(previous || 0)) / Number(previous) * 100).toFixed(1)) : (value ? 100 : 0);
    const funnelMap = Object.fromEntries(funnel.map(item => [item.name, item]));

    return res.json({ success: true, data: {
      generatedAt: now,
      since,
      windowDays: days,
      collection: { firstParty: true, consentPrompt: false, anonymized: true, noRawIp: true, excludedFields: ['passwords', 'pins', 'tokens', 'emails', 'phone numbers', 'private briefs', 'captions', 'photograph pixels', 'audio files', 'keystrokes'] },
      totals: {
        visitors: visitor.visitors,
        newVisitors: visitor.newVisitors,
        returningVisitors: Math.max(0, Number(visitor.visitors || 0) - Number(visitor.newVisitors || 0)),
        sessions: session.sessions,
        pageViews,
        engagedSessions: session.engagedSessions,
        bounceRate: rate(session.bounces, session.sessions),
        engagementRate: rate(session.engagedSessions, session.sessions),
        averageSessionDurationSeconds: avgSessionDuration,
        pagesPerSession: session.sessions ? Number((Number(pageViews || 0) / Number(session.sessions)).toFixed(2)) : 0,
        failedEvents: failures,
        comparison: {
          visitors: change(visitor.visitors, previousVisitor.visitors),
          sessions: change(session.sessions, previousSessionStats.sessions),
          pageViews: change(pageViews, previousSessionStats.pageViews),
          averageSessionDurationSeconds: change(avgSessionDuration, previousAvgSessionDuration)
        }
      },
      daily,
      trafficSources: sources,
      campaigns: campaigns.map(item => ({ campaign: item.value, pageViews: item.pageViews, sessions: item.sessions, visitors: item.visitors })),
      referrers: referrers.map(item => ({ host: item.value, pageViews: item.pageViews, sessions: item.sessions, visitors: item.visitors })),
      topRoutes: routes.map(item => ({ route: item.value, pageViews: item.pageViews, sessions: item.sessions, visitors: item.visitors })),
      landingPages: landingPages.map(item => ({ path: item.value, pageViews: item.pageViews, sessions: item.sessions, visitors: item.visitors })),
      exitPages: exits,
      devices,
      countries: countries.map(item => ({ country: item.value, pageViews: item.pageViews, sessions: item.sessions, visitors: item.visitors })),
      actors,
      funnel: funnelNames.map(name => ({ name, events: funnelMap[name]?.events || 0, sessions: funnelMap[name]?.sessions || 0, visitors: funnelMap[name]?.visitors || 0 })),
      realtime: realtime[0] || { events: 0, pageViews: 0, sessions: 0, visitors: 0, windowMinutes: 30 },
      definitions: { engagedSession: 'A session with a second page view, at least ten seconds of active time, or an explicit engagement event.', bounce: 'A session with one or fewer page views and less than ten seconds of active time.' }
    } });
  } catch (error) {
    console.error('[admin/visitor-traffic]', error.message);
    return res.status(500).json({ success: false, message: 'We could not load visitor and traffic analytics.' });
  }
}
