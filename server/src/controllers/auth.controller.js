import crypto from 'crypto';
import mongoose from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import User from '../models/User.js';
import AuthCode from '../models/AuthCode.js';
import Session from '../models/Session.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import PhotoStory from '../models/PhotoStory.js';
import StoryView from '../models/StoryView.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import BillingEvent from '../models/BillingEvent.js';
import AccountDeletionRequest from '../models/AccountDeletionRequest.js';
import DeliveryUsage from '../models/DeliveryUsage.js';
import Delivery from '../models/Delivery.js';
import DeliveryJob from '../models/DeliveryJob.js';
import PhotoLike from '../models/PhotoLike.js';
import DeliveryView from '../models/DeliveryView.js';
import StorageAsset from '../models/StorageAsset.js';
import Portfolio from '../models/Portfolio.js';
import PortfolioJob from '../models/PortfolioJob.js';
import { sendPasswordChangedEmail, sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail } from '../services/email.service.js';
import { verifyTurnstile } from '../services/turnstile.service.js';
import { cloudinary, configureCloudinary } from '../services/cloudinary.service.js';
import { decryptBillingToken, paystackRequest } from '../services/paystack.service.js';
import { REFRESH_COOKIE, clearSessionCookies, codeDigest, createSession, normalizeEmail, publicUser, randomToken, safeEqual, setSessionCookies, tokenDigest } from '../utils/auth.js';
import { STUDIO_NAME_CHANGE_COOLDOWN_MS, isoDate, nextChangeAt } from '../constants/profilePolicy.js';

const email = z.string().trim().email().max(254).transform(normalizeEmail);
const password = z.string().min(8, 'Use at least 8 characters.').max(128);
const registerSchema = z.object({ name: z.string().trim().min(2).max(100), email, password, confirmPassword: z.string(), turnstileToken: z.string().optional() }).refine(data => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match.' });
const codeSchema = z.object({ email, code: z.string().regex(/^\d{6}$/) });
const challengedCodeSchema = codeSchema.extend({ turnstileToken: z.string().optional() });
const loginSchema = z.object({ email, password: z.string().min(1).max(128), remember: z.boolean().optional().default(true), turnstileToken: z.string().optional() });
const resetSchema = z.object({ resetToken: z.string().min(20), password, confirmPassword: z.string() }).refine(data => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match.' });
const profileSpecialties = ['Portraits', 'Weddings', 'Birthdays', 'Fashion and editorial', 'Commercial and branding', 'Maternity', 'Graduation', 'Events', 'Other'];
const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(100),
  studioName: z.string().trim().min(2, 'Enter your studio name.').max(100),
  businessType: z.enum(['individual', 'studio']),
  city: z.string().trim().min(2, 'Enter your city.').max(80),
  state: z.string().trim().min(2, 'Enter your state.').max(80),
  specialties: z.array(z.enum(profileSpecialties)).min(1, 'Choose at least one kind of work.').max(profileSpecialties.length),
  instagram: z.string().trim().max(80).default(''),
  whatsapp: z.string().trim().max(30).default('')
}).strict();

function validationFailure(res, parsed) {
  const issue = parsed.error.issues[0];
  const field = issue.path[0];
  const messages = { name: 'Enter your name.', email: 'Enter a valid email address.', password: 'Use at least 8 characters for your password.', confirmPassword: 'Confirm your password.', code: 'Enter the six-digit code from your email.', credential: 'Google sign-in could not be completed.', resetToken: 'This password reset has expired.' };
  return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', field, message: issue.message === 'The passwords do not match.' ? issue.message : messages[field] || 'Check the information you entered and try again.' });
}

function sixDigitCode() { return String(crypto.randomInt(100000, 1000000)); }

async function issueCode(user, purpose) {
  const code = sixDigitCode();
  const now = Date.now();
  await AuthCode.findOneAndUpdate(
    { userId: user._id, purpose },
    { codeDigest: codeDigest(user.email, purpose, code), attempts: 0, expiresAt: new Date(now + 10 * 60 * 1000), resendAvailableAt: new Date(now + 60 * 1000) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  try {
    if (purpose === 'verify-email') await sendVerificationEmail({ to: user.email, name: user.name, code });
    else await sendPasswordResetEmail({ to: user.email, name: user.name, code });
  } catch (error) {
    // Let the person retry immediately when the email provider rejects a send.
    await AuthCode.updateOne({ userId: user._id, purpose }, { resendAvailableAt: new Date(0) });
    throw error;
  }
}

async function validChallenge(token, req, action) {
  return verifyTurnstile(token, req.ip, action);
}

export async function register(req, res) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    if (!(await validChallenge(parsed.data.turnstileToken, req, 'register'))) return res.status(400).json({ success: false, code: 'CHALLENGE_FAILED', message: 'We could not verify this request. Please try again.' });
    const existing = await User.findOne({ email: parsed.data.email });
    if (existing?.emailVerifiedAt) return res.status(409).json({ success: false, code: 'EMAIL_IN_USE', message: 'An account already uses this email address.' });
    if (existing) {
      const current = await AuthCode.findOne({ userId: existing._id, purpose: 'verify-email' });
      if (current?.resendAvailableAt > new Date()) {
        const retryAfter = Math.ceil((current.resendAvailableAt.getTime() - Date.now()) / 1000);
        return res.status(429).json({ success: false, code: 'RESEND_WAIT', retryAfter, email: existing.email, message: `A code was already sent. Try again in ${retryAfter} seconds.` });
      }
    }
    const user = existing || await User.create({ name: parsed.data.name, email: parsed.data.email, password: parsed.data.password, providers: ['password'] });
    await issueCode(user, 'verify-email');
    res.status(existing ? 200 : 201).json({ success: true, requiresVerification: true, email: user.email, message: 'We sent a six-digit code to your email address.' });
  } catch (error) {
    console.error('[auth/register]', error.message);
    res.status(500).json({ success: false, message: 'We could not create your account. Please try again.' });
  }
}

export async function verifyEmail(req, res) {
  try {
    const parsed = challengedCodeSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    if (!(await validChallenge(parsed.data.turnstileToken, req, 'verify_email'))) return res.status(400).json({ success: false, code: 'CHALLENGE_FAILED', message: 'Complete the security check before verifying your email.' });
    const user = await User.findOne({ email: parsed.data.email });
    if (!user) return res.status(400).json({ success: false, code: 'INVALID_CODE', message: 'That code is incorrect or has expired.' });
    if (user.emailVerifiedAt) {
      await createSession(user, req, res);
      return res.json({ success: true, user: publicUser(user), next: user.onboardingCompletedAt ? '/dashboard' : '/onboarding' });
    }
    const record = await AuthCode.findOne({ userId: user._id, purpose: 'verify-email' }).select('+codeDigest');
    if (!record || record.expiresAt <= new Date() || record.attempts >= 5) return res.status(400).json({ success: false, code: 'INVALID_CODE', message: 'That code is incorrect or has expired.' });
    const matches = safeEqual(codeDigest(user.email, 'verify-email', parsed.data.code), record.codeDigest);
    if (!matches) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ success: false, code: 'INVALID_CODE', message: record.attempts >= 5 ? 'That code can no longer be used. Request a new one.' : 'That code is incorrect.' });
    }
    const consumed = await AuthCode.findOneAndDelete({ _id: record._id, codeDigest: record.codeDigest });
    if (!consumed) return res.status(400).json({ success: false, code: 'INVALID_CODE', message: 'That code has already been used.' });
    user.emailVerifiedAt = new Date();
    user.accountStatus = 'active';
    user.lastLoginAt = new Date();
    await user.save();
    await createSession(user, req, res);
    sendWelcomeEmail({ to: user.email, name: user.name }).catch(error => console.error('[email/welcome]', error.message));
    res.json({ success: true, user: publicUser(user), next: '/onboarding' });
  } catch (error) {
    console.error('[auth/verify-email]', error.message);
    res.status(500).json({ success: false, message: 'We could not verify your email. Please try again.' });
  }
}

export async function resendVerification(req, res) {
  try {
    const parsed = z.object({ email, turnstileToken: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    if (!(await validChallenge(parsed.data.turnstileToken, req, 'verify_email'))) return res.status(400).json({ success: false, code: 'CHALLENGE_FAILED', message: 'We could not verify this request. Please try again.' });
    const user = await User.findOne({ email: parsed.data.email });
    if (!user || user.emailVerifiedAt) return res.json({ success: true, message: 'If the account still needs verification, a new code has been sent.' });
    const current = await AuthCode.findOne({ userId: user._id, purpose: 'verify-email' });
    if (current?.resendAvailableAt > new Date()) {
      const retryAfter = Math.ceil((current.resendAvailableAt.getTime() - Date.now()) / 1000);
      return res.status(429).json({ success: false, code: 'RESEND_WAIT', retryAfter, message: `Please wait ${retryAfter} seconds before requesting another code.` });
    }
    await issueCode(user, 'verify-email');
    res.json({ success: true, message: 'A new verification code has been sent.' });
  } catch (error) {
    console.error('[auth/resend]', error.message);
    res.status(500).json({ success: false, message: 'We could not send another code. Please try again.' });
  }
}

export async function login(req, res) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    const user = await User.findOne({ email: parsed.data.email }).select('+password +failedLoginCount +loginLockedUntil');
    const generic = { success: false, code: 'INVALID_CREDENTIALS', message: 'The email address or password is incorrect.' };
    if (!user) return res.status(401).json(generic);
    if (user.accountStatus === 'suspended') return res.status(403).json({ success: false, code: 'ACCOUNT_SUSPENDED', message: 'This account is unavailable. Contact Veylo support.' });
    if (user.failedLoginCount >= 3 && !(await validChallenge(parsed.data.turnstileToken, req, 'login'))) return res.status(400).json({ success: false, code: 'CHALLENGE_REQUIRED', message: 'Please complete the security check and try again.' });
    if (!(await user.comparePassword(parsed.data.password))) {
      user.failedLoginCount = (user.failedLoginCount || 0) + 1;
      await user.save();
      return res.status(401).json({ ...generic, requiresChallenge: user.failedLoginCount >= 3 });
    }
    if (!user.emailVerifiedAt) return res.status(403).json({ success: false, code: 'EMAIL_NOT_VERIFIED', email: user.email, message: 'Verify your email address before signing in.' });
    user.accountStatus = 'active';
    user.failedLoginCount = 0;
    user.loginLockedUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();
    await createSession(user, req, res, { remember: parsed.data.remember });
    res.json({ success: true, user: publicUser(user), next: user.onboardingCompletedAt ? '/dashboard' : '/onboarding' });
  } catch (error) {
    console.error('[auth/login]', error.message);
    res.status(500).json({ success: false, message: 'We could not sign you in. Please try again.' });
  }
}

export async function googleLogin(req, res) {
  try {
    const parsed = z.object({ credential: z.string().min(20) }).safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ success: false, message: 'Google sign-in is temporarily unavailable.' });
    const ticket = await new OAuth2Client(process.env.GOOGLE_CLIENT_ID).verifyIdToken({ idToken: parsed.data.credential, audience: process.env.GOOGLE_CLIENT_ID });
    const profile = ticket.getPayload();
    if (!profile?.sub || !profile.email || !profile.email_verified) return res.status(401).json({ success: false, message: 'Google could not verify this email address.' });
    let user = await User.findOne({ googleId: profile.sub }).select('+googleId');
    if (user?.accountStatus === 'suspended') return res.status(403).json({ success: false, code: 'ACCOUNT_SUSPENDED', message: 'This account is unavailable. Contact Veylo support.' });
    if (!user) {
      const sameEmail = await User.findOne({ email: normalizeEmail(profile.email) }).select('+googleId');
      if (sameEmail) {
        if (!sameEmail.emailVerifiedAt) return res.status(403).json({ success: false, code: 'EMAIL_NOT_VERIFIED', email: sameEmail.email, message: 'Enter the code sent to your email before using this account.' });
        if (sameEmail.googleId && sameEmail.googleId !== profile.sub) return res.status(409).json({ success: false, code: 'GOOGLE_ACCOUNT_CONFLICT', message: 'This email is already connected to another Google account.' });
        if (sameEmail.accountStatus === 'suspended') return res.status(403).json({ success: false, code: 'ACCOUNT_SUSPENDED', message: 'This account is unavailable. Contact Veylo support.' });
        sameEmail.googleId = profile.sub;
        sameEmail.providers = sameEmail.providers || [];
        if (!sameEmail.providers.includes('google')) sameEmail.providers.push('google');
        sameEmail.accountStatus = 'active';
        if (!sameEmail.avatar && profile.picture) sameEmail.avatar = profile.picture;
        await sameEmail.save();
        await AuthCode.deleteMany({ userId: sameEmail._id, purpose: 'verify-email' });
        user = sameEmail;
      } else {
        user = await User.create({ name: String(profile.name || profile.given_name || 'Photographer').slice(0, 100), email: normalizeEmail(profile.email), googleId: profile.sub, providers: ['google'], emailVerifiedAt: new Date(), accountStatus: 'active', avatar: profile.picture || '' });
        sendWelcomeEmail({ to: user.email, name: user.name }).catch(error => console.error('[email/welcome]', error.message));
      }
    }
    user.accountStatus = 'active';
    user.lastLoginAt = new Date();
    await user.save();
    await createSession(user, req, res);
    res.json({ success: true, user: publicUser(user), next: user.onboardingCompletedAt ? '/dashboard' : '/onboarding' });
  } catch (error) {
    console.error('[auth/google]', error.message);
    res.status(401).json({ success: false, message: 'Google sign-in could not be completed.' });
  }
}

export async function refreshSession(req, res) {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) return res.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: 'Your session has expired.' });
    const session = await Session.findOne({ refreshTokenDigest: tokenDigest(refreshToken), revokedAt: null, expiresAt: { $gt: new Date() } }).select('+refreshTokenDigest +csrfTokenDigest');
    if (!session) {
      clearSessionCookies(res);
      return res.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: 'Your session has expired.' });
    }
    const user = await User.findById(session.userId);
    if (!user || user.accountStatus !== 'active' || !user.emailVerifiedAt) return res.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: 'Your session has expired.' });
    const newRefreshToken = randomToken(48);
    const csrfToken = randomToken(32);
    session.refreshTokenDigest = tokenDigest(newRefreshToken);
    session.csrfTokenDigest = tokenDigest(csrfToken);
    session.expiresAt = new Date(Date.now() + (session.persistent ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000));
    await session.save();
    setSessionCookies(user, session, newRefreshToken, csrfToken, res, { remember: session.persistent });
    res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error('[auth/refresh]', error.message);
    clearSessionCookies(res);
    res.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: 'Your session has expired.' });
  }
}

export async function logout(req, res) {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) await Session.updateOne({ refreshTokenDigest: tokenDigest(refreshToken) }, { revokedAt: new Date() });
  } catch (error) { console.error('[auth/logout]', error.message); }
  clearSessionCookies(res);
  res.json({ success: true });
}

export async function logoutAll(req, res) {
  try {
    await Session.updateMany({ userId: req.user.id, revokedAt: null }, { revokedAt: new Date() });
    clearSessionCookies(res);
    res.json({ success: true });
  } catch (error) {
    console.error('[auth/logout-all]', error.message);
    res.status(500).json({ success: false, message: 'We could not sign out every device. Please try again.' });
  }
}

export async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error('[auth/me]', error.message);
    res.status(500).json({ success: false, message: 'We could not open your account. Please try again.' });
  }
}

export async function updateProfile(req, res) {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', field: issue.path[0], message: issue.message });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const previousStudioName = String(user.studio?.name || '').trim();
    const studioName = parsed.data.studioName.trim();
    const studioNameChanged = Boolean(previousStudioName) && previousStudioName !== studioName;
    const studioNameNextChangeAt = nextChangeAt(user.studioNameChangedAt, STUDIO_NAME_CHANGE_COOLDOWN_MS);
    if (studioNameChanged && studioNameNextChangeAt) return res.status(429).json({ success: false, code: 'STUDIO_NAME_COOLDOWN', nextChangeAt: isoDate(studioNameNextChangeAt), message: `Your studio name can be changed again on ${studioNameNextChangeAt.toLocaleDateString('en-NG', { dateStyle: 'medium' })}.` });
    user.name = parsed.data.name;
    user.studio = user.studio || {};
    user.studio.name = studioName;
    user.studio.businessType = parsed.data.businessType;
    user.studio.city = parsed.data.city;
    user.studio.state = parsed.data.state;
    user.studio.country = 'Nigeria';
    user.studio.specialties = parsed.data.specialties;
    user.studio.instagram = parsed.data.instagram.replace(/^@/, '');
    user.studio.whatsapp = parsed.data.whatsapp;
    if (studioNameChanged) user.studioNameChangedAt = new Date();
    const portfolio = studioNameChanged ? await Portfolio.findOne({ userId: user._id }) : null;
    if (portfolio && (!portfolio.studioName || portfolio.studioName.trim() === previousStudioName)) portfolio.studioName = studioName;
    await Promise.all([user.save(), portfolio ? portfolio.save() : Promise.resolve()]);
    res.json({ success: true, user: publicUser(user), message: 'Your account details were saved.' });
  } catch (error) {
    console.error('[auth/profile]', error.message);
    res.status(500).json({ success: false, message: 'We could not save your account details. Please try again.' });
  }
}

const deleteAccountSchema = z.object({
  confirmation: z.string().trim().max(254),
  password: z.string().max(128).optional().default(''),
  googleCredential: z.string().optional().default('')
});

async function confirmAccountOwner(user, data) {
  if (normalizeEmail(data.confirmation) !== user.email) return false;
  if (user.providers.includes('password')) return Boolean(data.password) && user.comparePassword(data.password);
  if (!user.providers.includes('google') || data.googleCredential.length < 20) return false;
  try {
    const ticket = await new OAuth2Client(process.env.GOOGLE_CLIENT_ID).verifyIdToken({ idToken: data.googleCredential, audience: process.env.GOOGLE_CLIENT_ID });
    const profile = ticket.getPayload();
    return Boolean(profile?.email_verified && normalizeEmail(profile.email) === user.email && profile.sub === user.googleId);
  } catch {
    return false;
  }
}

async function removeCloudinaryResources(prefix, resourceType = 'image') {
  await Promise.all(['upload', 'authenticated'].map(type => cloudinary.api.delete_resources_by_prefix(prefix, { resource_type: resourceType, type, invalidate: true })));
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
    const response = await cloudinary.api.sub_folders(prefix, { max_results: 500, next_cursor: cursor });
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

export async function deleteAccount(req, res) {
  try {
    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Enter the email address connected to this account.' });
    const user = await User.findById(req.user.id).select('+password +googleId');
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    if (!(await confirmAccountOwner(user, parsed.data))) return res.status(403).json({ success: false, code: 'ACCOUNT_CONFIRMATION_FAILED', message: 'We could not confirm that this account belongs to you.' });

    const paidSubscription = await Subscription.findOne({ userId: user._id, status: { $in: ['active', 'past_due'] }, subscriptionCode: { $exists: true } }).sort({ createdAt: -1 }).select('+emailTokenEncrypted');
    if (paidSubscription) {
      const token = decryptBillingToken(paidSubscription.emailTokenEncrypted);
      if (!token) return res.status(409).json({ success: false, message: 'Cancel the active Pro subscription from Billing before deleting this account.' });
      await paystackRequest('/subscription/disable', { method: 'POST', body: { code: paidSubscription.subscriptionCode, token } });
    }

    const userPrefix = `veylo/users/${user._id}`;
    const stories = await PhotoStory.find({ userId: user._id }).select('photos.url soundtrack.audioUrl').lean();
    const hasDeliveryAssets = stories.some(story => [story.soundtrack?.audioUrl, ...(story.photos || []).map(photo => photo.url)].some(url => String(url || '').includes(`/${userPrefix}/`))) || await Delivery.exists({ userId: user._id }) || await StorageAsset.exists({ userId: user._id });
    const hasStudioAsset = user.studio?.logoPublicId?.startsWith(`veylo/studios/${user._id}/`);
    if (hasStudioAsset || hasDeliveryAssets) {
      if (!configureCloudinary()) throw new Error('Cloudinary credentials are missing.');
      await Promise.all([
        hasStudioAsset ? removeCloudinaryFolder(`veylo/studios/${user._id}`, ['image']) : Promise.resolve(),
        hasDeliveryAssets ? removeCloudinaryFolder(userPrefix, ['image', 'video']) : Promise.resolve()
      ]);
    }

    const transaction = await mongoose.startSession();
    try {
      await transaction.withTransaction(async () => {
        const options = { session: transaction };
        const storiesForViews = await PhotoStory.find({ userId: user._id }).select('_id').session(transaction);
        await StoryView.deleteMany({ storyId: { $in: storiesForViews.map(item => item._id) } }, options);
        await PhotoStory.deleteMany({ userId: user._id }, options);
        await Session.deleteMany({ userId: user._id }, options);
        await AuthCode.deleteMany({ userId: user._id }, options);
        await PasswordResetToken.deleteMany({ userId: user._id }, options);
        await Subscription.deleteMany({ userId: user._id }, options);
        await Payment.deleteMany({ userId: user._id }, options);
        await BillingEvent.deleteMany({ userId: user._id }, options);
        // Audit records are retained after account deletion. They are immutable
        // operational evidence and must not disappear with the account data.
        await DeliveryUsage.deleteMany({ userId: user._id }, options);
        const deliveries = await Delivery.find({ userId: user._id }).select('_id').session(transaction);
        const deliveryIds = deliveries.map(item => item._id);
        await PhotoLike.deleteMany({ deliveryId: { $in: deliveryIds } }, options);
        await DeliveryView.deleteMany({ deliveryId: { $in: deliveryIds } }, options);
        await DeliveryJob.deleteMany({ userId: user._id }, options);
        await Delivery.deleteMany({ userId: user._id }, options);
        await StorageAsset.deleteMany({ userId: user._id }, options);
        await Portfolio.deleteMany({ userId: user._id }, options);
        await PortfolioJob.deleteMany({ userId: user._id }, options);
        await User.deleteOne({ _id: user._id }, options);
      });
    } finally {
      await transaction.endSession();
    }
    clearSessionCookies(res);
    res.json({ success: true, message: 'Your Veylo account and its data have been deleted.' });
  } catch (error) {
    console.error('[auth/delete-account]', error.http_code || error.name || 'delete_error', error.message);
    res.status(500).json({ success: false, message: 'We could not delete the complete account. Your account is still available. Please try again.' });
  }
}

export async function requestAccountDeletion(req, res) {
  try {
    const reason = String(req.body?.reason || '').replace(/[<>]/g, '').trim().slice(0, 1000);
    const existing = await AccountDeletionRequest.findOne({ userId: req.user.id, status: { $in: ['pending', 'approved', 'processing'] } });
    if (existing) return res.json({ success: true, data: existing, message: 'Your account deletion request is already with the Veylo team.' });
    const request = await AccountDeletionRequest.create({ userId: req.user.id, source: 'user', reason });
    res.status(201).json({ success: true, data: request, message: 'Your account deletion request has been sent to the Veylo team.' });
  } catch (error) {
    console.error('[auth/request-account-deletion]', error.message);
    res.status(500).json({ success: false, message: 'We could not send this deletion request.' });
  }
}

export async function forgotPassword(req, res) {
  const response = { success: true, message: 'If an account uses that email, a reset code is on its way.' };
  try {
    const parsed = z.object({ email, turnstileToken: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    if (!(await validChallenge(parsed.data.turnstileToken, req, 'forgot_password'))) return res.status(400).json({ success: false, code: 'CHALLENGE_FAILED', message: 'We could not verify this request. Please try again.' });
    const user = await User.findOne({ email: parsed.data.email });
    if (user?.emailVerifiedAt && user.providers.includes('password')) {
      const current = await AuthCode.findOne({ userId: user._id, purpose: 'reset-password' });
      if (!current || current.resendAvailableAt <= new Date()) await issueCode(user, 'reset-password');
    }
  } catch (error) {
    console.error('[auth/forgot-password]', error.message);
  }
  res.json(response);
}

export async function verifyPasswordResetCode(req, res) {
  try {
    const parsed = challengedCodeSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    if (!(await validChallenge(parsed.data.turnstileToken, req, 'verify_password_reset'))) return res.status(400).json({ success: false, code: 'CHALLENGE_FAILED', message: 'Complete the security check before continuing.' });
    const user = await User.findOne({ email: parsed.data.email });
    const record = user ? await AuthCode.findOne({ userId: user._id, purpose: 'reset-password' }).select('+codeDigest') : null;
    if (!record || record.expiresAt <= new Date() || record.attempts >= 5 || !safeEqual(codeDigest(user.email, 'reset-password', parsed.data.code), record.codeDigest)) {
      if (record) { record.attempts += 1; await record.save(); }
      return res.status(400).json({ success: false, code: 'INVALID_CODE', message: 'That code is incorrect or has expired.' });
    }
    const consumed = await AuthCode.findOneAndDelete({ _id: record._id, codeDigest: record.codeDigest });
    if (!consumed) return res.status(400).json({ success: false, code: 'INVALID_CODE', message: 'That code has already been used.' });
    const resetToken = randomToken(48);
    await PasswordResetToken.deleteMany({ userId: user._id });
    await PasswordResetToken.create({ userId: user._id, tokenDigest: tokenDigest(resetToken), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    res.json({ success: true, resetToken });
  } catch (error) {
    console.error('[auth/verify-reset]', error.message);
    res.status(500).json({ success: false, message: 'We could not verify that code. Please try again.' });
  }
}

export async function resetPassword(req, res) {
  try {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    const record = await PasswordResetToken.findOne({ tokenDigest: tokenDigest(parsed.data.resetToken), expiresAt: { $gt: new Date() } });
    if (!record) return res.status(400).json({ success: false, code: 'RESET_EXPIRED', message: 'This password reset has expired. Request a new code.' });
    const user = await User.findById(record.userId).select('+password');
    if (!user) return res.status(400).json({ success: false, message: 'This password reset cannot be completed.' });
    user.password = parsed.data.password;
    if (!user.providers.includes('password')) user.providers.push('password');
    await user.save();
    await Promise.all([PasswordResetToken.deleteMany({ userId: user._id }), Session.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() })]);
    clearSessionCookies(res);
    sendPasswordChangedEmail({ to: user.email, name: user.name }).catch(error => console.error('[email/password-changed]', error.message));
    res.json({ success: true, message: 'Your password has been changed. Sign in with your new password.' });
  } catch (error) {
    console.error('[auth/reset-password]', error.message);
    res.status(500).json({ success: false, message: 'We could not change your password. Please try again.' });
  }
}
