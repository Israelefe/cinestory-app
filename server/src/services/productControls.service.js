import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import ProductControls from '../models/ProductControls.js';
import ProductExposure from '../models/ProductExposure.js';
import ProductFeedback from '../models/ProductFeedback.js';
import User from '../models/User.js';
import { excludedAnalyticsUser } from '../utils/analyticsPrivacy.js';
import { posthogConfiguration, posthogIdentity } from './posthog.service.js';

export const EXPERIMENT = 'dashboard-guidance-v1';
export const FLAG = 'veylo-dashboard-guidance';
export const SURVEY = 'dashboard-ease-v1';
export async function productControls() {
  return await ProductControls.findById('product').lean() || new ProductControls().toObject();
}
export function allocation(userId, purpose) {
  const secret = process.env.POSTHOG_IDENTITY_SECRET || process.env.JWT_SECRET;
  if (!secret) return 100;
  return crypto.createHmac('sha256', secret).update(`${purpose}:${userId}`).digest().readUInt32BE(0) / 0x100000000 * 100;
}
export async function productParticipant(userId) {
  if (excludedAnalyticsUser(userId)) return false;
  return Boolean(await User.exists({ _id: userId, role: 'user', accountStatus: 'active', emailVerifiedAt: { $ne: null } }));
}
export function exposureToken(userId, variant) {
  return jwt.sign({ sub: String(userId), variant, experiment: EXPERIMENT }, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-product-exposure', expiresIn: '10m' });
}
export function verifyExposure(token, userId) {
  const value = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-product-exposure' });
  if (value.sub !== String(userId) || value.experiment !== EXPERIMENT || !['control', 'guided'].includes(value.variant)) throw new Error('Invalid exposure');
  return value;
}
export async function productRuntime(userId) {
  const settings = await productControls();
  const config = posthogConfiguration();
  const eligible = await productParticipant(userId);
  const existing = eligible ? await ProductExposure.findOne({ userId, experiment: EXPERIMENT }).lean() : null;
  const inRollout = allocation(userId, FLAG) < settings.guidanceRolloutPercent;
  const variant = !eligible || !settings.guidanceEnabled || !inRollout ? null : settings.guidanceExperimentEnabled ? existing?.variant || (allocation(userId, EXPERIMENT) < 50 ? 'control' : 'guided') : 'guided';
  return {
    feedback: eligible && settings.feedbackEnabled && !await ProductFeedback.exists({ userId, survey: SURVEY }),
    guidance: variant ? { variant, token: settings.guidanceExperimentEnabled ? exposureToken(userId, variant) : null } : null,
    replay: eligible && settings.replayEnabled && config.enabled && config.configured && allocation(userId, 'dashboard-replay') < settings.replaySamplePercent
      ? { projectToken: process.env.POSTHOG_PROJECT_TOKEN, host: config.host, distinctId: posthogIdentity(`account:${userId}`) } : null
  };
}
export async function operationsAlertRecipient() {
  const settings = await productControls();
  return settings.alertEmail || process.env.OPS_ALERT_EMAIL || '';
}
