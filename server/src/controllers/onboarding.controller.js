import { v2 as cloudinary } from 'cloudinary';
import { z } from 'zod';
import User from '../models/User.js';
import { publicUser } from '../utils/auth.js';

const specialties = ['Portraits', 'Weddings', 'Birthdays', 'Fashion and editorial', 'Commercial and branding', 'Maternity', 'Graduation', 'Events', 'Other'];
const sources = ['Instagram', 'TikTok', 'YouTube', 'Google Search', 'WhatsApp', 'Another photographer', 'Friend or colleague', 'Event or workshop', 'Other', 'Prefer not to say'];

const stepOne = z.object({
  studioName: z.string().trim().min(2, 'Enter the name clients know your studio by.').max(100),
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
      user.studio.name = parsed.data.studioName;
      user.studio.businessType = parsed.data.businessType;
      user.studio.city = parsed.data.city;
      user.studio.state = parsed.data.state;
      user.studio.country = 'Nigeria';
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
    console.error('[onboarding/update]', error.message);
    res.status(500).json({ success: false, message: 'We could not save this step. Please try again.' });
  }
}

export async function completeOnboarding(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    if (!user.studio?.name || !user.studio?.businessType || !user.studio?.city || !user.studio?.state || !user.studio?.specialties?.length || !user.acquisition?.source) return res.status(400).json({ success: false, message: 'Complete the three short steps before finishing.' });
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
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return res.status(503).json({ success: false, message: 'Image upload is temporarily unavailable.' });
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
    const uploaded = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: `veylo/studios/${req.user.id}`, public_id: 'profile', overwrite: true, resource_type: 'image', transformation: [{ width: 900, height: 900, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }] }, (error, result) => error ? reject(error) : resolve(result));
      stream.end(req.file.buffer);
    });
    const user = await User.findById(req.user.id);
    user.studio.logoUrl = uploaded.secure_url;
    user.studio.logoPublicId = uploaded.public_id;
    user.avatar = uploaded.secure_url;
    await user.save();
    res.json({ success: true, user: publicUser(user), url: uploaded.secure_url });
  } catch (error) {
    console.error('[onboarding/logo]', error.message);
    res.status(500).json({ success: false, message: 'We could not upload that image. Please try another one.' });
  }
}
