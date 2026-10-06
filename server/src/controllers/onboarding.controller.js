import crypto from 'node:crypto';
import { z } from 'zod';
import { isStudioNameDuplicate, studioNameSchema, studioNameTaken } from '../utils/studioName.js';
import { studioNameAvailable, studioNameUnavailable } from '../services/studioName.service.js';
import User from '../models/User.js';
import { publicUser } from '../utils/auth.js';
import { deleteR2Object, deleteR2Prefix, prepareR2Image, putR2Object, r2Configured } from '../services/r2.service.js';
import { signedImageUrl } from '../services/deliveryMedia.service.js';
import { STUDIO_NAME_CHANGE_COOLDOWN_MS, isoDate, nextChangeAt } from '../constants/profilePolicy.js';

const specialties = ['Portraits', 'Weddings', 'Birthdays', 'Fashion and editorial', 'Commercial and branding', 'Maternity', 'Graduation', 'Events', 'Other'];
const sources = ['Instagram', 'TikTok', 'YouTube', 'Google Search', 'WhatsApp', 'Another photographer', 'Friend or colleague', 'Event or workshop', 'Other'];

const stepOne = z.object({
  studioName: studioNameSchema,
  businessType: z.enum(['individual', 'studio']),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80)
});
const stepTwo = z.object({
  specialties: z.array(z.enum(specialties)).min(1, 'Choose at least one kind of work.'),
  instagram: z.string().trim().max(80).optional().default(''),
  whatsapp: z.string().trim().max(30).optional().default('')
});
const stepThree = z.object({
  source: z.enum(sources),
  otherSource: z.string().trim().max(120).optional().default(''),
  utmSource: z.string().trim().max(120).optional().default(''),
  utmCampaign: z.string().trim().max(120).optional().default(''),
  referrer: z.string().trim().max(500).optional().default('')
}).refine(data => data.source !== 'Other' || data.otherSource.length >= 2, { path: ['otherSource'], message: 'Tell us where you heard about Veylo.' });

function validationFailure(res, parsed) {
  const issue = parsed.error.issues[0];
  const field = issue.path[0];
  const messages = { studioName: 'Enter the name clients know your studio by.', businessType: 'Choose how you work.', city: 'Enter your city.', state: 'Enter your state.', specialties: 'Choose at least one kind of work.', source: 'Choose how you heard about Veylo.' };
  return res.status(400).json({ success: false, field, message: issue.message.startsWith('Invalid input') ? messages[field] || 'Check this step and try again.' : issue.message });
}

export async function getOnboarding(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error('[onboarding/get]', error.message);
    res.status(500).json({ success: false, message: 'We could not open your studio setup.' });
  }
}

export async function updateOnboarding(req, res) {
  try {
    const step = Number(req.body.step);
    const schema = step === 1 ? stepOne : step === 2 ? stepTwo : step === 3 ? stepThree : null;
    if (!schema) return res.status(400).json({ success: false, message: 'Choose a valid onboarding step.' });
    const parsed = schema.safeParse(req.body.data);
    if (!parsed.success) return validationFailure(res, parsed);
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    if (step === 1) {
      const previousStudioName = String(user.studio?.name || '').trim();
      const nextStudioName = parsed.data.studioName.trim();
      try {
        if (!(await studioNameAvailable(nextStudioName, user._id))) return res.status(409).json(studioNameTaken);
      } catch { return studioNameUnavailable(res); }
      const studioNameChanged = Boolean(previousStudioName) && previousStudioName !== nextStudioName;
      const nextChange = nextChangeAt(user.studioNameChangedAt, STUDIO_NAME_CHANGE_COOLDOWN_MS);
      if (studioNameChanged && nextChange) return res.status(429).json({ success: false, code: 'STUDIO_NAME_COOLDOWN', field: 'studioName', nextChangeAt: isoDate(nextChange), message: `Your Studio or Brand name can be changed again on ${nextChange.toLocaleDateString('en-NG', { dateStyle: 'medium' })}.` });
      user.studio.name = nextStudioName;
      user.studio.businessType = parsed.data.businessType;
      user.studio.city = parsed.data.city;
      user.studio.state = parsed.data.state;
      user.studio.country = 'Nigeria';
      if (studioNameChanged) user.studioNameChangedAt = new Date();
    } else if (step === 2) {
      user.studio.specialties = parsed.data.specialties;
      user.studio.instagram = parsed.data.instagram.replace(/^@/, '');
      user.studio.whatsapp = parsed.data.whatsapp;
    } else {
      user.acquisition = parsed.data;
    }
    user.onboardingStep = Math.min(3, Math.max(user.onboardingStep || 1, step + 1));
    await user.save();
    res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    if (isStudioNameDuplicate(error)) return res.status(409).json(studioNameTaken);
    console.error('[onboarding/update]', error.message);
    res.status(500).json({ success: false, message: 'We could not save this step. Please try again.' });
  }
}

export async function completeOnboarding(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    if (!user.studio?.name || !user.studio?.businessType || !user.studio?.city || !user.studio?.state || !user.studio?.specialties?.length || !sources.includes(user.acquisition?.source)) return res.status(400).json({ success: false, message: 'Complete the three short steps and choose how you heard about Veylo before finishing.' });
    user.onboardingCompletedAt = user.onboardingCompletedAt || new Date();
    user.onboardingStep = 3;
    await user.save();
    res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error('[onboarding/complete]', error.message);
    res.status(500).json({ success: false, message: 'We could not finish your studio setup. Please try again.' });
  }
}

function isSupportedImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return false;
  const bytes = file.buffer;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return jpeg || png || webp;
}

export async function uploadStudioLogo(req, res) {
  try {
    if (!isSupportedImage(req.file)) return res.status(400).json({ success: false, message: 'Choose a JPEG, PNG or WebP image.' });
    if (!r2Configured()) return res.status(503).json({ success: false, code: 'UPLOAD_CONFIGURATION_ERROR', message: 'Veylo could not connect to image storage. Please try again shortly.' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const oldKeys = [...new Set([user.studio?.logoPublicId, user.avatarPublicId].filter(Boolean))];
    const key = `veylo/studios/${user._id}/profile/${crypto.randomUUID()}`;
    await putR2Object(key, req.file.buffer, { contentType: req.file.mimetype });
    await prepareR2Image(key);
    const publicUrl = `/api/v1/onboarding/public-logo/${user._id}`;
    const avatarUrl = `/api/v1/onboarding/public-avatar/${user._id}`;
    user.studio.logoUrl = publicUrl;
    user.studio.logoPublicId = key;
    user.avatarPublicId = key;
    user.avatar = avatarUrl;
    await user.save();
    for (const oldKey of oldKeys) if (oldKey !== key) void Promise.all([deleteR2Prefix(`${oldKey}.__veylo/`), deleteR2Object(oldKey)]).catch(() => {});
    res.json({ success: true, user: publicUser(user), url: publicUrl });
  } catch (error) {
    console.error('[onboarding/logo]', error.code || error.name || 'upload_error', error.message);
    const unavailable = error.code === 'R2_NOT_CONFIGURED';
    res.status(unavailable ? 503 : 502).json({ success: false, code: unavailable ? 'UPLOAD_CONFIGURATION_ERROR' : 'IMAGE_UPLOAD_FAILED', message: unavailable ? 'Veylo could not connect to image storage. Please try again shortly.' : 'That image could not be processed. Try a different JPEG, PNG or WebP file.' });
  }
}

export async function getPublicStudioLogo(req, res) {
  try {
    const user = await User.findById(req.params.userId).select('studio.logoPublicId').lean();
    const key = user?.studio?.logoPublicId;
    if (!key || !String(key).startsWith(`veylo/studios/${req.params.userId}/`)) return res.status(404).end();
    res.set({ 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600', 'X-Content-Type-Options': 'nosniff' });
    res.redirect(302, signedImageUrl(key, { width: 800 }));
  } catch { res.status(502).end(); }
}

export async function getPublicStudioAvatar(req, res) {
  try {
    const user = await User.findById(req.params.userId).select('avatarPublicId studio.logoPublicId').lean();
    const key = user?.avatarPublicId || user?.studio?.logoPublicId;
    if (!key || !String(key).startsWith(`veylo/studios/${req.params.userId}/`)) return res.status(404).end();
    res.set({ 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600', 'X-Content-Type-Options': 'nosniff' });
    res.redirect(302, signedImageUrl(key, { width: 800 }));
  } catch { res.status(502).end(); }
}
