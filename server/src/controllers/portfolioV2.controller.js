import { recordPaidUsage } from '../services/paidUsage.service.js';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import Portfolio from '../models/Portfolio.js';
import PortfolioHandle from '../models/PortfolioHandle.js';
import PortfolioJob from '../models/PortfolioJob.js';
import Delivery from '../models/Delivery.js';
import StorageAsset from '../models/StorageAsset.js';
import User from '../models/User.js';
import AnalyticsEvent from '../models/AnalyticsEvent.js';
import PortfolioEnquiry from '../models/PortfolioEnquiry.js';
import { sectionVisible, PROJECT_FIELDS, repairPortfolioReferences } from '../shared/portfolioContent.mjs';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { recordAnalyticsEventAsync } from '../services/analytics.service.js';
import { isRuntimeFeatureEnabled } from '../services/runtimeConfig.service.js';
import { preparePortfolioSet, streamPortfolioMedia } from '../services/portfolioMedia.service.js';
import { normalizeSnapshot, snapshotErrors, draftSchema, handleSchema, publicHandleSchema, RESERVED, portfolioId, normalizeInstagram, normalizeWhatsApp, visiblePortfolioPhotoIds, allPortfolioMedia } from '../utils/portfolio.js';
import { PORTFOLIO_HANDLE_CHANGE_COOLDOWN_MS, PORTFOLIO_HANDLE_REDIRECT_MS, PORTFOLIO_HANDLE_RESERVATION_MS, STUDIO_NAME_CHANGE_COOLDOWN_MS, isoDate, nextChangeAt } from '../constants/profilePolicy.js';
import { tokenDigest } from '../utils/auth.js';
import { CREATIVE_DIRECTOR_PROVIDER, CREATIVE_DIRECTOR_PROMPT_VERSION } from '../services/alibabaCreativeDirector.service.js';
const revisionSchema = z.object({
  expectedDraftRevision: z.number().int().min(0),
  publicationConfirmed: z.boolean().optional()
}).strict();
const fail = (res, status, code, message, extra = {}) => res.status(status).json({
  success: false,
  code,
  message,
  ...extra
});
function report(res, error, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  return fail(res, error.status || (error.code === 11000 ? 409 : 500), error.code === 11000 ? 'PORTFOLIO_HANDLE_IN_USE' : 'PORTFOLIO_REQUEST_FAILED', error.status ? error.message : message);
}
function policy(user, portfolio) {
  return {
    studioNameNextChangeAt: isoDate(nextChangeAt(user.studioNameChangedAt, STUDIO_NAME_CHANGE_COOLDOWN_MS)),
    handleNextChangeAt: isoDate(nextChangeAt(portfolio?.handleChangedAt, PORTFOLIO_HANDLE_CHANGE_COOLDOWN_MS))
  };
}
export async function owner(req, editing = false) {
  const user = await User.findById(req.user.id);
  if (!user || user.accountStatus !== 'active') throw Object.assign(new Error('Please sign in to continue.'), {
    status: 401
  });
  const entitlements = await resolveEntitlements(user, {
    includeUsage: false
  });
  if (editing && entitlements.features.portfolioMode !== 'public') throw Object.assign(new Error('Renew Pro to edit or publish your portfolio.'), {
    status: 403
  });
  return {
    user,
    access: entitlements.features.portfolioMode
  };
}
export async function availableAssets(userId, ids, priorIds = []) {
  if (!ids.length) return new Map();
  const [deliveries, stored] = await Promise.all([Delivery.find({
    userId,
    status: {
      $in: ['published', 'archived']
    },
    'assets.publicId': {
      $in: ids
    }
  }).select('status assets').lean(), StorageAsset.find({
    userId,
    publicId: {
      $in: ids
    }
  }).select('publicId width height bytes format').lean()]);
  const prior = new Set(priorIds);
  const wanted = new Set(ids);
  const map = new Map(stored.map(asset => [asset.publicId, asset]));
  for (const delivery of deliveries) for (const asset of delivery.assets) if (wanted.has(asset.publicId) && asset.resourceType !== 'video' && (delivery.status === 'published' || prior.has(asset.publicId))) map.set(asset.publicId, asset);
  return map;
}
function output(value, studioName, {
  publicPage = false,
  handle = value.handle
} = {}) {
  const next = normalizeSnapshot(value);
  const visible = visiblePortfolioPhotoIds(next);
  const renderMedia = item => {
    const root = publicPage ? `/api/v1/portfolios/public/${encodeURIComponent(handle)}/media/${item.id}` : `/api/v1/portfolios/mine/media/${item.id}`;
    const {
      publicId,
      ...safe
    } = item;
    return {
      ...safe,
      ...(!publicPage ? {
        publicId
      } : {}),
      url: `${root}?v=1600`,
      thumbnailUrl: `${root}?v=400`,
      srcSet: [400, 800, 1600].map(width => `${root}?v=${width} ${width}w`).join(', ')
    };
  };
  const items = (publicPage ? next.items.filter(item => visible.has(item.id)) : next.items).map(renderMedia);
  const profileIds = new Set([next.content.profile.logoId, ...(next.direction.showBio && sectionVisible(next.content, 'about') ? [next.content.profile.portraitId] : [])]);
  const profileMedia = (publicPage ? next.profileMedia.filter(item => profileIds.has(item.id)) : next.profileMedia).map(renderMedia);
  const heroId = portfolioId(next.heroPublicId);
  const content = structuredClone(next.content);
  if (publicPage) {
    for (const key of ['services', 'testimonials', 'process', 'faqs']) if (!sectionVisible(content, key)) content[key] = [];
    if (!next.direction.showBio || !sectionVisible(content, 'about')) for (const key of ['about', 'serviceAreas', 'travel', 'portraitId']) content.profile[key] = '';
    if (!next.direction.showCategories) content.categoryDetails = [];
    if (!next.direction.showContact || content.contact.showcaseOnly) content.contact = { ...content.contact, email: '', formEnabled: false, responseNote: '' };
  }
  const {
    heroPublicId,
    ...safe
  } = next;
  return {
    ...safe,
    ...(!publicPage ? {
      heroPublicId
    } : {}),
    studioName,
    heroId,
    items,
    profileMedia,
    content,
    ...(publicPage && (!next.direction.showContact || content.contact.showcaseOnly) ? { whatsapp: '', instagram: '' } : {}),
    publishedAt: value.publishedAt || null
  };
}
function envelope(portfolio, user, access) {
  const draft = portfolio.draft || portfolio;
  const publicAccess = portfolio.status === 'published' && access === 'public';
  return {
    success: true,
    persistedHandle: portfolio.handle,
    data: output(draft, user.studio?.name || user.name),
    status: publicAccess ? 'published' : 'draft',
    live: publicAccess ? {
      handle: portfolio.handle,
      publishedAt: portfolio.publishedAt
    } : null,
    draftRevision: portfolio.draftRevision || 0,
    publishedRevision: portfolio.publishedRevision || 0,
    hasUnpublishedChanges: (portfolio.draftRevision || 0) > (portfolio.publishedRevision || 0),
    access,
    changePolicy: policy(user, portfolio),
    mediaNotice: portfolio.mediaNotice || ''
  };
}
async function suggestedHandle(user) {
  const slug = (user.studio?.name || user.name || 'my-studio').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  const root = slug.length < 3 ? `${slug || 'my'}-studio` : slug;
  for (let i = 0; i < 20; i++) {
    const candidate = i ? `${root}-${i + 1}` : root;
    if (!RESERVED.has(candidate) && !(await handleConflict(candidate))) return candidate;
  }
  return `${root}-${String(user._id).slice(-6)}`;
}
async function handleConflict(handle, portfolioIdValue = null, session = null) {
  const now = new Date();
  const query = Portfolio.findOne({
    ...(portfolioIdValue ? {
      _id: {
        $ne: portfolioIdValue
      }
    } : {}),
    $or: [{
      handle
    }, {
      previousHandles: {
        $elemMatch: {
          handle,
          reservedUntil: {
            $gt: now
          }
        }
      }
    }]
  }).select('_id');
  if (session) query.session(session);
  const legacy = await query.lean();
  const claim = await PortfolioHandle.findOne({
    handle,
    ...(portfolioIdValue ? {
      portfolioId: {
        $ne: portfolioIdValue
      }
    } : {}),
    $or: [{
      reservedUntil: null
    }, {
      reservedUntil: {
        $gt: now
      }
    }]
  }).session(session).lean();
  return Boolean(legacy || claim);
}
export async function getMyPortfolio(req, res) {
  try {
    const {
      user,
      access
    } = await owner(req);
    const portfolio = await Portfolio.findOne({
      userId: user._id
    }).lean();
    const value = portfolio || {
      handle: await suggestedHandle(user),
      studioName: user.studio?.name || user.name,
      location: [user.studio?.city, user.studio?.state].filter(Boolean).join(', '),
      whatsapp: user.studio?.whatsapp || '',
      instagram: user.studio?.instagram || '',
      items: [],
      status: 'draft',
      draftRevision: 0,
      publishedRevision: 0
    };
    const latestJob = portfolio ? await PortfolioJob.findOne({
      portfolioId: portfolio._id,
      userId: user._id
    }).sort({
      createdAt: -1
    }).select('-input -result.insights').lean() : null;
    const redesignEnabled = await isRuntimeFeatureEnabled('portfolioRedesign', process.env.PORTFOLIO_REDESIGN_ENABLED !== 'false');
    recordAnalyticsEventAsync({
      name: 'portfolio.editor.opened',
      source: 'server',
      actorType: 'photographer',
      userId: user._id,
      status: 'opened'
    });
    res.set('Cache-Control', 'no-store').json({
      ...envelope(value, user, access),
      latestJob,
      redesignEnabled,
      accountId: String(user._id)
    });
  } catch (error) {
    report(res, error, 'We could not open your portfolio.');
  }
}
export async function checkPortfolioHandle(req, res) {
  try {
    const current = await Portfolio.findOne({ userId: req.user.id }).select('_id handle previousHandles').lean();
    if (current?.handle === req.params.handle && publicHandleSchema.safeParse(req.params.handle).success && !RESERVED.has(req.params.handle)) return res.json({ success: true, available: true, message: 'This is your current address.' });
    const parsed = handleSchema.safeParse(req.params.handle);
    if (!parsed.success || RESERVED.has(parsed.data)) return res.json({
      success: true,
      available: false,
      message: 'Choose a different address.'
    });
    const ownReserved = current?.previousHandles?.some(entry => entry.handle === parsed.data && new Date(entry.reservedUntil) > new Date());
    const available = !ownReserved && !(await handleConflict(parsed.data, current?._id));
    res.json({
      success: true,
      available,
      message: available ? 'Available. We will check again when you publish.' : 'That address is already in use or reserved.'
    });
  } catch (error) {
    report(res, error, 'We could not check that address.');
  }
}
export async function updateMyPortfolio(req, res) {
  try {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'INVALID_DRAFT', parsed.error.issues[0].message);
    const {
      user,
      access
    } = await owner(req, true);
    const current = await Portfolio.findOne({
      userId: user._id
    }).lean();
    const expected = parsed.data.expectedDraftRevision;
    if (expected !== (current?.draftRevision || 0)) return fail(res, 409, 'DRAFT_CONFLICT', 'This portfolio changed in another window. Review the latest draft before saving.', {
      current: current ? envelope(current, user, access) : null
    });
    const {
      expectedDraftRevision,
      ...input
    } = parsed.data;
    const priorSnapshot = normalizeSnapshot(current?.draft || current || {});
    // Older open editor tabs do not know the new fields. Omission must not erase them.
    const legacyContent = !Object.hasOwn(req.body, 'content');
    if (legacyContent) input.content = priorSnapshot.content;
    if (!Object.hasOwn(req.body, 'profileMedia')) input.profileMedia = priorSnapshot.profileMedia;
    input.projects = input.projects.map(project => {
      const prior = priorSnapshot.projects.find(item => item.id === project.id);
      const submitted = req.body.projects?.find(item => item.id === project.id);
      return !prior ? project : { ...project, ...Object.fromEntries([...PROJECT_FIELDS, 'narrative', 'relatedIds'].filter(key => !Object.hasOwn(submitted || {}, key)).map(key => [key, prior[key]])) };
    });
    let next = normalizeSnapshot({
      ...input,
      studioName: user.studio?.name || user.name
    });
    if (legacyContent) next = repairPortfolioReferences(next);
    const errors = snapshotErrors(next);
    if (errors.length) return fail(res, 400, 'INVALID_DRAFT', errors[0]);
    const prior = allPortfolioMedia(normalizeSnapshot(current?.draft || current || {})).map(item => item.publicId);
    const owned = await availableAssets(user._id, allPortfolioMedia(next).map(item => item.publicId), prior);
    if (allPortfolioMedia(next).some(item => !owned.has(item.publicId))) return fail(res, 403, 'ASSET_UNAVAILABLE', 'A selected photograph is no longer available to this account. Remove it and try again.');
    if (next.profileMedia.some(item => owned.get(item.publicId)?.bytes > 5 * 1024 * 1024)) return fail(res, 400, 'PROFILE_IMAGE_TOO_LARGE', 'Choose a portrait or logo no larger than 5 MB.');
    next.items = next.items.map(item => ({
      ...item,
      width: owned.get(item.publicId).width,
      height: owned.get(item.publicId).height
    }));
    next.profileMedia = next.profileMedia.map(item => ({ ...item, width: owned.get(item.publicId).width, height: owned.get(item.publicId).height }));
    if (current && JSON.stringify(normalizeSnapshot(current.draft || current)) === JSON.stringify(next)) return res.json(envelope(current, user, access));
    let saved;
    if (!current) {
      if (expected !== 0) return fail(res, 409, 'DRAFT_CONFLICT', 'Reload this portfolio before saving.');
      saved = await Portfolio.create({
        userId: user._id,
        handle: await suggestedHandle(user),
        studioName: next.studioName,
        draft: next,
        draftRevision: 1
      });
    } else saved = await Portfolio.findOneAndUpdate({
      _id: current._id,
      userId: user._id,
      draftRevision: expected
    }, {
      $set: {
        draft: next,
        mediaNotice: ''
      },
      $inc: {
        draftRevision: 1
      }
    }, {
      new: true,
      runValidators: true
    });
    if (!saved) return fail(res, 409, 'DRAFT_CONFLICT', 'This draft changed while saving. Reload it to review the changes.');
    await recordPaidUsage(user._id, 'portfolio', saved._id);
    recordAnalyticsEventAsync({
      name: 'portfolio.saved',
      source: 'server',
      actorType: 'photographer',
      userId: user._id,
      status: 'saved',
      metadata: {
        portfolioId: String(saved._id),
        revision: saved.draftRevision
      }
    });
    res.json(envelope(saved, user, access));
  } catch (error) {
    report(res, error, 'We could not save your portfolio.');
  }
}
async function ensureHandles(portfolio, session) {
  const claims = [{
    handle: portfolio.handle
  }, ...(portfolio.previousHandles || []).filter(entry => new Date(entry.reservedUntil) > new Date())];
  for (const claim of claims) {
    await PortfolioHandle.deleteOne({
      handle: claim.handle,
      reservedUntil: {
        $lte: new Date()
      }
    }).session(session);
    await PortfolioHandle.updateOne({
      handle: claim.handle,
      portfolioId: portfolio._id
    }, {
      $set: {
        portfolioId: portfolio._id,
        ...(claim.reservedUntil ? {
          reservedUntil: claim.reservedUntil
        } : {})
      },
      ...(!claim.reservedUntil ? {
        $unset: {
          reservedUntil: 1
        }
      } : {})
    }, {
      upsert: true,
      session
    });
  }
}
export async function publishMyPortfolio(req, res) {
  try {
    const parsed = revisionSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, 400, 'REVISION_REQUIRED', 'Save and review your draft before publishing.');
    const {
      user,
      access
    } = await owner(req, true);
    const portfolio = await Portfolio.findOne({
      userId: user._id
    }).lean();
    if (!portfolio || parsed.data.expectedDraftRevision !== portfolio.draftRevision) return fail(res, 409, 'DRAFT_CONFLICT', 'This draft changed. Review the latest version before publishing.');
    if (portfolio.status === 'published' && portfolio.publishedRevision === portfolio.draftRevision) return res.json(envelope(portfolio, user, access));
    const draft = normalizeSnapshot(portfolio.draft || portfolio);
    draft.studioName = user.studio?.name || user.name;
    draft.whatsapp = normalizeWhatsApp(draft.whatsapp);
    draft.instagram = normalizeInstagram(draft.instagram);
    const errors = snapshotErrors(draft, {
      publish: true, existingHandle: portfolio.handle
    });
    if (errors.length) return fail(res, 400, 'PUBLISH_NOT_READY', errors[0], {
      errors
    });
    const approved = new Set(allPortfolioMedia(normalizeSnapshot(portfolio)).map(item => item.publicId));
    const media = allPortfolioMedia(draft);
    if (media.some(item => !approved.has(item.publicId)) && !parsed.data.publicationConfirmed) return fail(res, 400, 'PUBLICATION_CONFIRMATION_REQUIRED', 'Confirm that you have permission to show these photographs publicly.');
    const owned = await availableAssets(user._id, media.map(item => item.publicId), media.map(item => item.publicId));
    if (media.some(item => !owned.has(item.publicId))) return fail(res, 403, 'ASSET_UNAVAILABLE', 'A selected photograph was deleted. Review your work before publishing.');
    if (draft.profileMedia.some(item => owned.get(item.publicId)?.bytes > 5 * 1024 * 1024)) return fail(res, 400, 'PROFILE_IMAGE_TOO_LARGE', 'Choose a portrait or logo no larger than 5 MB.');
    if (draft.projects.length && !(await isRuntimeFeatureEnabled('portfolioRedesign', process.env.PORTFOLIO_REDESIGN_ENABLED !== 'false'))) return fail(res, 503, 'PORTFOLIO_REDESIGN_DISABLED', 'Project publishing is temporarily unavailable. Your draft is saved.');
    if (portfolio.handle !== draft.handle && portfolio.publishedAt) {
      const cooldown = nextChangeAt(portfolio.handleChangedAt, PORTFOLIO_HANDLE_CHANGE_COOLDOWN_MS);
      if (cooldown) return fail(res, 429, 'PORTFOLIO_HANDLE_COOLDOWN', 'Your portfolio address cannot be changed yet.', {
        nextChangeAt: isoDate(cooldown)
      });
    }
    if (portfolio.previousHandles?.some(entry => entry.handle === draft.handle && new Date(entry.reservedUntil) > new Date())) return fail(res, 409, 'PORTFOLIO_HANDLE_RESERVED', 'That previous address is still reserved. Choose another address.');
    // No live content changes until every selected display variant is ready.
    const prepared = await preparePortfolioSet(media);
    draft.items = draft.items.map(item => ({
      ...item,
      width: item.width || prepared.get(item.publicId)?.width,
      height: item.height || prepared.get(item.publicId)?.height
    }));
    draft.profileMedia = draft.profileMedia.map(item => ({ ...item, width: item.width || prepared.get(item.publicId)?.width, height: item.height || prepared.get(item.publicId)?.height }));
    const remaining = await availableAssets(user._id, media.map(item => item.publicId), media.map(item => item.publicId));
    if (media.some(item => !remaining.has(item.publicId))) return fail(res, 409, 'ASSET_UNAVAILABLE', 'A photograph was deleted while preparing your portfolio. Review your draft.');
    await PortfolioHandle.init();
    let saved;
    await mongoose.connection.transaction(async session => {
      await ensureHandles(portfolio, session);
      if (await handleConflict(draft.handle, portfolio._id, session)) throw Object.assign(new Error('That portfolio address is already in use or reserved.'), {
        status: 409
      });
      const now = new Date();
      await PortfolioHandle.deleteOne({
        handle: draft.handle,
        reservedUntil: {
          $lte: now
        }
      }).session(session);
      await PortfolioHandle.updateOne({
        handle: draft.handle,
        portfolioId: portfolio._id
      }, {
        $set: {
          portfolioId: portfolio._id
        },
        $unset: {
          reservedUntil: 1
        }
      }, {
        upsert: true,
        session
      });
      const previousHandles = (portfolio.previousHandles || []).filter(entry => new Date(entry.reservedUntil) > now);
      const addressChanged = portfolio.handle !== draft.handle;
      if (addressChanged && portfolio.publishedAt) {
        previousHandles.push({
          handle: portfolio.handle,
          redirectUntil: new Date(now.getTime() + PORTFOLIO_HANDLE_REDIRECT_MS),
          reservedUntil: new Date(now.getTime() + PORTFOLIO_HANDLE_RESERVATION_MS)
        });
        await PortfolioHandle.updateOne({
          handle: portfolio.handle,
          portfolioId: portfolio._id
        }, {
          $set: {
            reservedUntil: previousHandles.at(-1).reservedUntil
          }
        }, {
          session
        });
      } else if (addressChanged) await PortfolioHandle.deleteOne({
        handle: portfolio.handle,
        portfolioId: portfolio._id
      }).session(session);
      saved = await Portfolio.findOneAndUpdate({
        _id: portfolio._id,
        draftRevision: parsed.data.expectedDraftRevision,
        publishedRevision: portfolio.publishedRevision,
        status: portfolio.status
      }, {
        $set: {
          ...draft,
          draft,
          previousHandles,
          schemaVersion: 3,
          status: 'published',
          publishedRevision: parsed.data.expectedDraftRevision,
          publishedAt: now,
          ...(addressChanged && portfolio.publishedAt ? {
            handleChangedAt: now
          } : {})
        }
      }, {
        new: true,
        session,
        runValidators: true
      });
      if (!saved) throw Object.assign(new Error('This portfolio changed while publishing. Review the latest draft.'), {
        status: 409
      });
    });
    recordAnalyticsEventAsync({
      name: 'portfolio.published',
      source: 'server',
      actorType: 'photographer',
      userId: user._id,
      status: 'published',
      metadata: {
        portfolioId: String(saved._id),
        revision: saved.publishedRevision
      }
    });
    res.json(envelope(saved, user, access));
  } catch (error) {
    if (/Transaction numbers|replica set/i.test(error.message)) return fail(res, 503, 'TRANSACTIONS_REQUIRED', 'Publishing is temporarily unavailable. Your draft is saved.');
    report(res, error, 'We could not publish your portfolio. Your live page has not changed.');
  }
}
export async function unpublishMyPortfolio(req, res) {
  try {
    const {
      user
    } = await owner(req);
    const parsed = revisionSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, 400, 'REVISION_REQUIRED', 'Reload this portfolio before making it private.');
    const result = await Portfolio.findOneAndUpdate({
      userId: user._id,
      draftRevision: parsed.data.expectedDraftRevision
    }, {
      $set: {
        status: 'draft'
      },
      $inc: {
        draftRevision: 1
      }
    }, {
      new: true
    });
    if (!result) return fail(res, 409, 'DRAFT_CONFLICT', 'This portfolio changed. Reload it before making it private.');
    recordAnalyticsEventAsync({
      name: 'portfolio.unpublished',
      source: 'server',
      actorType: 'photographer',
      userId: user._id,
      status: 'private',
      metadata: {
        portfolioId: String(result._id)
      }
    });
    res.json(envelope(result, user, (await resolveEntitlements(user, {
      includeUsage: false
    })).features.portfolioMode));
  } catch (error) {
    report(res, error, 'We could not make your portfolio private.');
  }
}
export async function resolvePublicPortfolio(rawHandle) {
  const parsed = publicHandleSchema.safeParse(rawHandle);
  if (!parsed.success) return null;
  const portfolio = await Portfolio.findOne({
    status: 'published',
    $or: [{
      handle: parsed.data
    }, {
      previousHandles: {
        $elemMatch: {
          handle: parsed.data,
          redirectUntil: {
            $gt: new Date()
          }
        }
      }
    }]
  }).lean();
  if (!portfolio) return null;
  const user = await User.findById(portfolio.userId);
  if (!user || user.accountStatus !== 'active' || (await resolveEntitlements(user, {
    includeUsage: false
  })).features.portfolioMode !== 'public') return null;
  return {
    portfolio,
    user,
    redirectedFrom: portfolio.handle !== parsed.data ? parsed.data : null
  };
}
function visitor(req, res) {
  let id = req.cookies?.veylo_portfolio_client;
  if (!id || !/^[A-Za-z0-9_-]{30,100}$/.test(id)) {
    id = crypto.randomBytes(32).toString('base64url');
    res.cookie('veylo_portfolio_client', id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 86400000,
      path: '/api/v1/portfolios/public'
    });
    req.cookies ||= {};
    req.cookies.veylo_portfolio_client = id;
  }
  return tokenDigest(id);
}
async function recordVisitorAction(req, res, input) {
  const agent = req.get?.('user-agent') || req.headers?.['user-agent'] || '';
  if (/bot|crawler|spider|facebookexternalhit|preview|WhatsApp|Slackbot/i.test(agent)) return;
  const sessionDigest = visitor(req, res);
  const context = Object.fromEntries(['portfolioId', 'projectId', 'category', 'serviceId'].filter(key => input.metadata?.[key] !== undefined).map(key => [`metadata.${key}`, input.metadata[key]]));
  try {
    // Best-effort short-window suppression for reloads and double taps.
    if (await AnalyticsEvent.exists({ name: input.name, sessionDigest, ...context, occurredAt: { $gte: new Date(Date.now() - 15000) } })) return;
    recordAnalyticsEventAsync({ ...input, sessionDigest });
  } catch { /* Reporting cannot prevent a visitor opening the work. */ }
}
export async function getPublicPortfolio(req, res) {
  try {
    const resolved = await resolvePublicPortfolio(req.params.handle);
    if (!resolved) return fail(res, 404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found.');
    const {
      portfolio,
      user
    } = resolved;
    const data = output(portfolio, user.studio?.name || user.name, {
      publicPage: true
    });
    if (req.params.projectId && !data.projects.some(project => project.id === req.params.projectId)) return fail(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
    if (req.query?.category && (!data.direction.showCategories || !data.content.categoryDetails.some(detail => detail.id === req.query.category && (data.items.some(item => item.category === detail.name) || data.projects.some(project => project.category === detail.name))))) return fail(res, 404, 'CATEGORY_NOT_FOUND', 'Category not found.');
    if (req.query?.service && (!sectionVisible(data.content, 'services') || !data.content.services.some(service => service.id === req.query.service))) return fail(res, 404, 'SERVICE_NOT_FOUND', 'Service not found.');
    await recordVisitorAction(req, res, {
      name: 'portfolio.viewed',
      source: 'server',
      actorType: 'anonymous',
      userId: user._id,
      status: 'viewed',
      metadata: {
        portfolioId: String(portfolio._id),
        handle: portfolio.handle
      }
    });
    if (req.params.projectId) await recordVisitorAction(req, res, {
      name: 'portfolio.project.opened',
      source: 'server',
      actorType: 'anonymous',
      userId: user._id,
      status: 'viewed',
      metadata: {
        portfolioId: String(portfolio._id),
        handle: portfolio.handle,
        projectId: req.params.projectId
      }
    });
    res.set('Cache-Control', 'no-store').json({
      success: true,
      data,
      redirectedFrom: resolved.redirectedFrom
    });
  } catch (error) {
    report(res, error, 'We could not open that portfolio.');
  }
}
export async function getPortfolioMedia(req, res) {
  try {
    let portfolio;
    let user;
    let publicPage = Boolean(req.params.handle);
    if (publicPage) {
      const resolved = await resolvePublicPortfolio(req.params.handle);
      if (!resolved) return res.status(404).end();
      ({
        portfolio,
        user
      } = resolved);
    } else {
      const result = await owner(req);
      user = result.user;
      if (result.access === 'unavailable') return res.status(403).end();
      portfolio = await Portfolio.findOne({
        userId: user._id
      }).lean();
      if (!portfolio) return res.status(404).end();
    }
    const snapshot = normalizeSnapshot(publicPage ? portfolio : portfolio.draft || portfolio);
    const item = allPortfolioMedia(snapshot).find(item => item.id === req.params.itemId);
    const profileVisible = item && (snapshot.content.profile.logoId === item.id || snapshot.direction.showBio && sectionVisible(snapshot.content, 'about') && snapshot.content.profile.portraitId === item.id);
    const visible = item && (visiblePortfolioPhotoIds(snapshot).has(item.id) || profileVisible);
    if (!item || publicPage && !visible) return res.status(404).end();
    const owned = await availableAssets(user._id, [item.publicId], [item.publicId]);
    if (!owned.has(item.publicId)) return res.status(404).end();
    await streamPortfolioMedia(item.publicId, req.query.v, res, { access: publicPage ? { type: 'portfolio', portfolioId: String(portfolio._id) } : undefined });
  } catch (error) {
    report(res, error, 'Photograph unavailable.');
  }
}
export async function getPortfolioSourceMedia(req, res) {
  try {
    const {
      user
    } = await owner(req, true);
    const publicId = String(req.query.publicId || '').slice(0, 500);
    if (!(await availableAssets(user._id, [publicId])).has(publicId)) return res.status(404).end();
    await streamPortfolioMedia(publicId, '400', res);
  } catch (error) {
    report(res, error, 'Photograph unavailable.');
  }
}
export async function getPortfolioShareMeta(req, res) {
  try {
    const resolved = await resolvePublicPortfolio(req.params.handle);
    if (!resolved) return fail(res, 404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found.');
    const {
      portfolio,
      user
    } = resolved;
    const snapshot = normalizeSnapshot(portfolio);
    const project = req.params.projectId ? snapshot.projects.find(project => project.id === req.params.projectId) : null;
    if (req.params.projectId && !project) return fail(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
    const studioName = user.studio?.name || user.name;
    const category = req.query?.category ? snapshot.content.categoryDetails.find(detail => detail.id === req.query.category && snapshot.direction.showCategories && (snapshot.items.some(item => item.category === detail.name) || snapshot.projects.some(project => project.category === detail.name))) : null;
    const service = req.query?.service ? snapshot.content.services.find(service => service.id === req.query.service && sectionVisible(snapshot.content, 'services')) : null;
    if (req.query?.category && !category || req.query?.service && !service) return fail(res, 404, 'SECTION_NOT_FOUND', 'That portfolio section is unavailable.');
    const visible = visiblePortfolioPhotoIds(snapshot);
    const coverId = project?.coverId || category?.coverId || (category ? snapshot.items.find(item => item.category === category.name)?.id : '') || (visible.has(snapshot.content.share.coverId) ? snapshot.content.share.coverId : '') || portfolioId(snapshot.heroPublicId);
    const webOrigin = String(process.env.CLIENT_URL || 'https://veylo.com.ng').split(',')[0].replace(/\/$/, '');
    const query = new URLSearchParams({ ...(category ? { category: category.id } : {}), ...(service ? { service: service.id } : {}) }).toString();
    const path = `/@${portfolio.handle}${project ? `/projects/${project.id}` : ''}${query ? `?${query}` : ''}`;
    res.set('Cache-Control', 'no-store').json({
      success: true,
      data: {
        title: project ? `${project.title} — ${studioName}` : category ? `${category.name} — ${studioName}` : service ? `${service.title} — ${studioName}` : snapshot.content.share.title || `${studioName} — Portfolio`,
        description: project?.description || category?.description || service?.description || snapshot.content.share.description || snapshot.introLine || snapshot.bio,
        image: `${webOrigin}/api/v1/portfolios/public/${portfolio.handle}/media/${coverId}?v=og`,
        canonical: `${webOrigin}${path}`,
        redirectedFrom: resolved.redirectedFrom,
        portfolio: output(portfolio, studioName, { publicPage: true }), projectId: project?.id || '', categoryId: category?.id || '', serviceId: service?.id || ''
      }
    });
  } catch (error) {
    report(res, error, 'We could not open that portfolio.');
  }
}
export async function getPortfolioSitemap(req, res) {
  try {
    res.set('Cache-Control', 'no-store');
    const total = await Portfolio.countDocuments({ status: 'published' });
    if (req.query.page === undefined) return res.json({ success: true, pages: Math.ceil(total / 100) });
    const page = Number(req.query.page);
    if (!Number.isInteger(page) || page < 0 || page >= Math.max(1, Math.ceil(total / 100))) return fail(res, 404, 'SITEMAP_NOT_FOUND', 'Sitemap not found.');
    const rows = await Portfolio.find({ status: 'published' }).sort({ _id: 1 }).skip(page * 100).limit(100).lean();
    const origin = String(process.env.CLIENT_URL || 'https://veylo.com.ng').split(',')[0].replace(/\/$/, '');
    const urls = [];
    for (const row of rows) {
      const user = await User.findById(row.userId);
      if (!user || user.accountStatus !== 'active' || (await resolveEntitlements(user, { includeUsage: false })).features.portfolioMode !== 'public') continue;
      const snapshot = normalizeSnapshot(row), base = `${origin}/@${row.handle}`;
      const add = path => urls.push({ loc: path, lastmod: row.publishedAt?.toISOString() });
      add(base);
      for (const project of snapshot.projects) add(`${base}/projects/${encodeURIComponent(project.id)}`);
      if (snapshot.direction.showCategories) for (const category of snapshot.content.categoryDetails) if (snapshot.items.some(item => item.category === category.name) || snapshot.projects.some(project => project.category === category.name)) add(`${base}?category=${encodeURIComponent(category.id)}`);
    }
    return res.json({ success: true, urls });
  } catch { return fail(res, 503, 'SITEMAP_UNAVAILABLE', 'The portfolio sitemap is temporarily unavailable.'); }
}
export async function recordPortfolioEngagement(req, res) {
  try {
    const resolved = await resolvePublicPortfolio(req.params.handle);
    if (!resolved) return fail(res, 404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found.');
    const parsed = z.object({
      action: z.enum(['photo.opened', 'project.opened', 'filter.used', 'instagram.clicked', 'whatsapp.clicked', 'email.clicked', 'enquiry.clicked', 'service.opened', 'share.clicked']),
      itemIndex: z.number().int().min(0).max(49).optional(),
      projectId: z.string().max(80).optional(),
      category: z.string().trim().max(50).optional(),
      serviceId: z.string().max(80).optional()
    }).strict().safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'INVALID_ACTION', 'That portfolio action is not valid.');
    const snapshot = normalizeSnapshot(resolved.portfolio);
    if (parsed.data.projectId && !snapshot.projects.some(project => project.id === parsed.data.projectId)) return fail(res, 400, 'INVALID_PROJECT', 'That project is unavailable.');
    if (parsed.data.serviceId && (!sectionVisible(snapshot.content, 'services') || !snapshot.content.services.some(service => service.id === parsed.data.serviceId))) return fail(res, 400, 'INVALID_SERVICE', 'That service is unavailable.');
    if (parsed.data.category && !['Main gallery', 'Selected work', ...snapshot.categories].includes(parsed.data.category)) return fail(res, 400, 'INVALID_CATEGORY', 'That category is unavailable.');
    await recordVisitorAction(req, res, {
      name: `portfolio.${parsed.data.action}`,
      source: 'server',
      actorType: 'anonymous',
      userId: resolved.user._id,
      status: 'completed',
      metadata: {
        portfolioId: String(resolved.portfolio._id),
        handle: resolved.portfolio.handle,
        itemIndex: parsed.data.itemIndex,
        projectId: parsed.data.projectId,
        category: parsed.data.category,
        serviceId: parsed.data.serviceId
      }
    });
    res.status(202).json({
      success: true
    });
  } catch (error) {
    report(res, error, 'We could not record that portfolio action.');
  }
}
export async function getPortfolioActivity(req, res) {
  try {
    const {
      user
    } = await owner(req);
    const portfolio = await Portfolio.findOne({
      userId: user._id
    }).select('_id handle previousHandles').lean();
    if (!portfolio) return res.json({
      success: true,
      data: {
        days: 30,
        views: 0,
        uniqueVisitors: 0,
        projectOpens: 0,
        contactClicks: 0
      }
    });
    const events = await AnalyticsEvent.aggregate([{
      $match: {
        userId: user._id,
        occurredAt: {
          $gte: new Date(Date.now() - 30 * 86400000)
        },
        name: {
          $in: ['portfolio.viewed', 'portfolio.project.opened', 'portfolio.whatsapp.clicked', 'portfolio.instagram.clicked', 'portfolio.email.clicked', 'portfolio.filter.used', 'portfolio.service.opened']
        },
        $nor: [{ name: 'portfolio.filter.used', 'metadata.category': 'Main gallery' }],
        $or: [{
          'metadata.portfolioId': String(portfolio._id)
        }, {
          'metadata.handle': {
            $in: [portfolio.handle, ...(portfolio.previousHandles || []).map(entry => entry.handle)]
          }
        }]
      }
    }, {
      $group: {
        _id: '$name',
        count: {
          $sum: 1
        },
        visitors: {
          $addToSet: '$sessionDigest'
        }
      }
    }]);
    const counts = Object.fromEntries(events.map(event => [event._id, event.count]));
    const enquiries = await PortfolioEnquiry.countDocuments({ userId: user._id, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } });
    res.json({
      success: true,
      data: {
        days: 30,
        views: counts['portfolio.viewed'] || 0,
        uniqueVisitors: events.find(event => event._id === 'portfolio.viewed')?.visitors.filter(Boolean).length || 0,
        projectOpens: counts['portfolio.project.opened'] || 0,
        contactClicks: (counts['portfolio.whatsapp.clicked'] || 0) + (counts['portfolio.instagram.clicked'] || 0) + (counts['portfolio.email.clicked'] || 0),
        whatsappClicks: counts['portfolio.whatsapp.clicked'] || 0, instagramClicks: counts['portfolio.instagram.clicked'] || 0, emailClicks: counts['portfolio.email.clicked'] || 0,
        categoryOpens: counts['portfolio.filter.used'] || 0, serviceOpens: counts['portfolio.service.opened'] || 0, enquiries
      }
    });
  } catch (error) {
    report(res, error, 'We could not load portfolio activity.');
  }
}
export async function directMyPortfolio(req, res) {
  try {
    const {
      user
    } = await owner(req, true);
    if (!(await isRuntimeFeatureEnabled('deliveryPipeline', process.env.DELIVERY_PIPELINE_ENABLED === 'true')) || !(await isRuntimeFeatureEnabled('portfolio', true))) return fail(res, 503, 'DIRECTION_UNAVAILABLE', 'Portfolio suggestions are temporarily unavailable.');
    const parsed = revisionSchema.safeParse(req.body || {});
    const portfolio = await Portfolio.findOne({
      userId: user._id
    }).lean();
    if (!parsed.success || !portfolio || portfolio.draftRevision !== parsed.data.expectedDraftRevision) return fail(res, 409, 'DRAFT_CONFLICT', 'Save this draft before asking for a direction.');
    const draft = normalizeSnapshot(portfolio.draft || portfolio);
    if (draft.items.length < 4 || !draft.bio.trim()) return fail(res, 400, 'DIRECTION_NOT_READY', 'Add a bio and four different photographs first.');
    const running = await PortfolioJob.findOne({
      portfolioId: portfolio._id,
      active: true
    });
    if (running) {
      const {
        input,
        ...safe
      } = running.toObject();
      return res.json({
        success: true,
        data: safe
      });
    }
    await preparePortfolioSet(draft.items);
    const job = await PortfolioJob.create({
      portfolioId: portfolio._id,
      userId: user._id,
      active: true,
      inputRevision: portfolio.draftRevision,
      input: draft,
      provider: CREATIVE_DIRECTOR_PROVIDER,
      promptVersion: CREATIVE_DIRECTOR_PROMPT_VERSION
    });
    recordAnalyticsEventAsync({
      name: 'portfolio.direction.requested',
      source: 'server',
      actorType: 'photographer',
      userId: user._id,
      status: 'queued',
      metadata: {
        portfolioId: String(portfolio._id)
      }
    });
    const {
      input,
      ...safe
    } = job.toObject();
    res.status(202).json({
      success: true,
      data: safe
    });
  } catch (error) {
    if (error.code === 11000) {
      const job = await PortfolioJob.findOne({
        userId: req.user.id,
        active: true
      }).select('-input -result.insights');
      return res.json({
        success: true,
        data: job
      });
    }
    report(res, error, 'We could not start your portfolio suggestion.');
  }
}
export async function getPortfolioJob(req, res) {
  try {
    const job = await PortfolioJob.findOne({
      _id: req.params.jobId,
      userId: req.user.id
    }).select('-input -result.insights').lean();
    if (!job) return fail(res, 404, 'JOB_NOT_FOUND', 'Portfolio suggestion not found.');
    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    report(res, error, 'We could not open that suggestion.');
  }
}
export async function cancelPortfolioJob(req, res) {
  try {
    const job = await PortfolioJob.findOneAndUpdate({
      _id: req.params.jobId,
      userId: req.user.id,
      active: true
    }, {
      $set: {
        active: false,
        status: 'cancelled',
        stage: 'cancelled',
        cancelRequestedAt: new Date(),
        cancelledAt: new Date()
      }
    }, {
      new: true
    }).select('-input -result.insights');
    if (!job) return fail(res, 409, 'JOB_FINISHED', 'This suggestion has already finished.');
    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    report(res, error, 'We could not cancel that suggestion.');
  }
}
export async function reviewPortfolioJob(req, res) {
  try {
    const parsed = z.object({
      decision: z.enum(['accepted', 'dismissed']),
      expectedDraftRevision: z.number().int().min(0)
    }).strict().safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'INVALID_REVIEW', 'Choose whether to accept or dismiss this suggestion.');
    const {
      user
    } = await owner(req, true);
    const portfolio = await Portfolio.findOne({
      userId: user._id
    }).select('draftRevision').lean();
    const job = await PortfolioJob.findOne({
      _id: req.params.jobId,
      userId: user._id,
      status: 'review'
    });
    if (!job) return fail(res, 404, 'JOB_NOT_FOUND', 'That suggestion is unavailable.');
    if (parsed.data.decision === 'accepted' && (job.inputRevision !== parsed.data.expectedDraftRevision || portfolio?.draftRevision !== job.inputRevision)) return fail(res, 409, 'SUGGESTION_STALE', 'Your draft changed after this suggestion started. Ask for a new direction.');
    job.reviewDecision = parsed.data.decision;
    await job.save();
    res.json({
      success: true
    });
  } catch (error) {
    report(res, error, 'We could not review that suggestion.');
  }
}
