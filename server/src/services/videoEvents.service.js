import crypto from 'node:crypto';
import Delivery from '../models/Delivery.js';
import DeliveryView from '../models/DeliveryView.js';
import { analyticsDigest } from '../utils/analyticsPrivacy.js';
import { recordAnalyticsEventAsync } from './analytics.service.js';
import { sendOnce } from './email.service.js';

export function videoEvent(name, { userId, deliveryId, assetId, bytes, status = 'completed' } = {}) {
  recordAnalyticsEventAsync({ name, source: 'server', actorType: userId ? 'photographer' : 'client', userId, deliveryId, bytes, status, metadata: { resourceType: 'video', ...(assetId ? { assetId: String(assetId) } : {}) } });
}
export async function recordVideoVisit(req, res, delivery, user) {
  const agent = req.get('user-agent') || '';
  if (/bot|crawler|spider|preview|facebookexternalhit|TelegramBot|Slackbot/i.test(agent) || (/WhatsApp/i.test(agent) && !/Mozilla/i.test(agent)) || req.method === 'HEAD') return;
  let visitor = req.cookies?.veylo_video_visitor;
  if (!/^[a-z\d_-]{40,60}$/i.test(visitor || '')) {
    visitor = crypto.randomBytes(32).toString('base64url');
    res.cookie('veylo_video_visitor', visitor, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', path: '/api/v1/videos/public', maxAge: 365 * 86400_000 });
  }
  const digest = analyticsDigest(visitor, 'video-visit'); if (!digest) return;
  try {
    await DeliveryView.create({ deliveryId: delivery._id, visitorDigest: digest });
    await Delivery.updateOne({ _id: delivery._id }, { $inc: { viewsCount: 1 } });
    videoEvent('client.delivery.opened', { deliveryId: delivery._id, status: 'opened' });
    if (user.email) await sendOnce({ eventKey: `video-viewed:${delivery._id}:${new Date().toISOString().slice(0, 10)}`, kind: 'delivery-viewed', to: user.email, userId: user._id, deliveryId: delivery._id, subject: 'Your video delivery was opened', text: `Someone opened your video delivery. View your deliveries: ${process.env.CLIENT_URL || 'https://veylo.com.ng'}/deliveries` }).catch(() => {});
  } catch (error) { if (error.code !== 11000) throw error; }
}
