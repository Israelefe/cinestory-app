import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Portfolio from '../src/models/Portfolio.js';
import PortfolioHandle from '../src/models/PortfolioHandle.js';
import PortfolioMedia from '../src/models/PortfolioMedia.js';
import PortfolioJob from '../src/models/PortfolioJob.js';
import StorageAsset from '../src/models/StorageAsset.js';
import Subscription from '../src/models/Subscription.js';
import Delivery from '../src/models/Delivery.js';
import { checkPortfolioHandle, getMyPortfolio, getPortfolioSources, getPublicPortfolio, publishMyPortfolio, updateMyPortfolio } from '../src/controllers/portfolio.controller.js';
import { getPortfolioMedia, getPortfolioShareMeta, unpublishMyPortfolio, reviewPortfolioJob, cancelPortfolioJob } from '../src/controllers/portfolioV2.controller.js';
import { removePortfolioReferences, auditPortfolioHandles, schedulePortfolioRemoval, processPortfolioRemovals } from '../src/services/portfolioLifecycle.service.js';
import PortfolioCleanup from '../src/models/PortfolioCleanup.js';
import { preparePortfolioMedia, preparePortfolioSet } from '../src/services/portfolioMedia.service.js';
import { cloudinary } from '../src/services/cloudinary.service.js';
import AnalyticsEvent from '../src/models/AnalyticsEvent.js';
import { getPortfolioActivity, recordPortfolioEngagement, directMyPortfolio } from '../src/controllers/portfolioV2.controller.js';
import { normalizeSnapshot, portfolioId } from '../src/utils/portfolio.js';
import { resolveEntitlements } from '../src/services/entitlement.service.js';
test('all four portfolio designs and motion settings survive saving and publishing', async () => {
  for (const template of ['editorial', 'cinema', 'gallery', 'folio']) {
    const portfolio = await Portfolio.findOne();
    const revision = portfolio?.draftRevision || 0;
    const saved = await invoke(updateMyPortfolio, body({ expectedDraftRevision: revision, direction: { template, motion: 'expressive' }, projects: [{ id: 'project-one', title: 'Portraits', coverId: portfolioId(ids[0]), photoIds: ids.map(portfolioId) }] }));
    assert.equal(saved.code, 200);
    assert.equal(saved.body.data.direction.template, template);
    if (portfolio?.status === 'published') {
      const beforePublish = await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' });
      assert.equal(beforePublish.body.data.direction.template, portfolio.direction.template);
    }
    const published = await invoke(publishMyPortfolio, { expectedDraftRevision: saved.body.draftRevision, publicationConfirmed: true });
    assert.equal(published.code, 200);
    const publicPage = await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' });
    assert.equal(publicPage.body.data.direction.template, template);
    assert.equal(publicPage.body.data.direction.motion, 'expressive');
    assert.equal((await Portfolio.findOne()).direction.template, template);
    const projectPage = await invoke(getPublicPortfolio, {}, { handle: 'amara-studio', projectId: 'project-one' });
    assert.equal(projectPage.body.data.direction.template, template);
  }
});
test('portfolio design validation rejects arbitrary templates and unsupported motion', async () => {
  assert.equal((await save({ direction: { template: '../../admin' } })).code, 400);
  assert.equal((await save({ direction: { template: 'cinema', motion: 'spin' } })).code, 400);
  const saved = await save();
  assert.equal(saved.body.data.direction.template, 'editorial');
});
test('categories retain empty groups, normalize legacy labels, and remain private until publication', async () => {
  const legacy = normalizeSnapshot({ items: [{ publicId: ids[0], category: ' Studio   portraits ' }, { publicId: ids[1], category: 'studio portraits' }] });
  assert.deepEqual(legacy.categories, ['Studio portraits']);
  assert.equal(legacy.items[1].category, 'Studio portraits');
  const saved = await save({ categories: ['Weddings', 'Portraits', 'Campaigns'] });
  assert.equal(saved.code, 200);
  assert.deepEqual(saved.body.data.categories, ['Weddings', 'Portraits', 'Campaigns']);
  assert.deepEqual((await Portfolio.findOne()).draft.categories.toObject(), ['Weddings', 'Portraits', 'Campaigns']);
  await publish();
  const before = await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' });
  assert.deepEqual(before.body.data.categories, ['Weddings', 'Portraits', 'Campaigns']);
  const renamed = await save({ categories: ['Weddings', 'Studio portraits'], items: ids.map(publicId => ({ publicId, category: 'Studio portraits' })), projects: [{ id: 'project-one', title: 'Portrait session', category: 'Studio portraits', coverId: portfolioId(ids[0]), photoIds: ids.map(portfolioId) }] });
  assert.equal(renamed.code, 200);
  assert.equal((await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' })).body.data.items[0].category, 'Portraits');
  await publish();
  const after = await invoke(getPublicPortfolio, {}, { handle: 'amara-studio', projectId: 'project-one' });
  assert.deepEqual(after.body.data.categories, ['Weddings', 'Studio portraits']);
  assert.equal(after.body.data.projects[0].category, 'Studio portraits');
  assert.equal(after.body.data.items.length, 4);
  const removed = await save({ categories: [], items: ids.map(publicId => ({ publicId, category: 'Selected work' })), projects: [{ id: 'project-one', title: 'Portrait session', category: 'Selected work', coverId: portfolioId(ids[0]), photoIds: ids.map(portfolioId) }] });
  assert.equal(removed.code, 200);
  assert.deepEqual(removed.body.data.categories, []);
  await publish();
  const ungrouped = await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' });
  assert.deepEqual(ungrouped.body.data.categories, []);
  assert.equal(ungrouped.body.data.items.length, 4);
  assert.equal(ungrouped.body.data.projects[0].photoIds.length, 4);
});
test('category validation rejects duplicate, empty, oversized, and non-text names', async () => {
  for (const categories of [['Portraits', ' portraits '], [''], ['a'.repeat(51)], [42], ['Selected work'], Array.from({ length: 101 }, (_, index) => `Group ${index}`)]) {
    const result = await save({ categories });
    assert.equal(result.code, 400, JSON.stringify(categories));
  }
  assert.equal(await Portfolio.countDocuments(), 0);
});
let mongo; let owner; const ids = ['studio/test-1', 'studio/test-2', 'studio/test-3', 'studio/test-4'];
function response() { return { code: 200, body: null, headers: {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, set(key, value) { this.headers[key] = value; return this; }, cookie(name, value, options) { this.cookieOptions = options; return this; }, end() { return this; } }; }
async function invoke(handler, body = {}, params = {}, user = owner, query = {}) { const res = response(); await handler({ user: { id: String(user._id) }, body, params, query, cookies: {} }, res); return res; }
function body(overrides = {}) { return { expectedDraftRevision: 0, handle: 'amara-studio', studioName: 'Amara Studio', bio: 'Finished portraits and celebrations in Lagos.', headline: 'Portraits by Amara', heroPublicId: ids[0], items: ids.map(publicId => ({ publicId, category: 'Portraits' })), direction: {}, ...overrides }; }
async function save(overrides = {}, user = owner) { const current = await Portfolio.findOne({ userId: user._id }); return invoke(updateMyPortfolio, body({ expectedDraftRevision: current?.draftRevision || 0, ...overrides }), {}, user); }
async function publish(user = owner) { const current = await Portfolio.findOne({ userId: user._id }); return invoke(publishMyPortfolio, { expectedDraftRevision: current?.draftRevision || 0, publicationConfirmed: true }, {}, user); }
before(async () => { process.env.DELIVERY_PIPELINE_ENABLED = 'true'; mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(mongo.getUri()); await Promise.all([Portfolio.init(), PortfolioHandle.init(), PortfolioMedia.init(), PortfolioJob.init()]); });
beforeEach(async () => {
  await Promise.all([Portfolio.deleteMany({}), PortfolioHandle.deleteMany({}), PortfolioJob.deleteMany({}), PortfolioMedia.deleteMany({}), PortfolioCleanup.deleteMany({}), AnalyticsEvent.deleteMany({}), StorageAsset.deleteMany({}), Subscription.deleteMany({}), User.deleteMany({}), Delivery.deleteMany({})]);
  owner = await User.create({ name: 'Amara', email: 'amara@example.com', plan: 'pro', accountStatus: 'active', studio: { name: 'Amara Studio' } });
  await Subscription.create({ userId: owner._id, status: 'active', paidThrough: new Date(Date.now() + 30 * 86400000) });
  await StorageAsset.insertMany(ids.map(publicId => ({ userId: owner._id, publicId, format: 'jpg', width: 1200, height: 1800 })));
  await PortfolioMedia.insertMany(ids.map(publicId => ({ publicId, variants: Object.fromEntries(['400', '800', '1600', 'og'].map(key => [key, `https://res.cloudinary.com/test/${key}.webp`])) })));
});
after(async () => { await new Promise(resolve => setTimeout(resolve, 100)); await mongoose.disconnect(); await mongo?.stop(); });
test('opening a new portfolio does not create a database record', async () => { const res = await invoke(getMyPortfolio); assert.equal(res.code, 200); assert.equal(res.body.draftRevision, 0); assert.equal(await Portfolio.countDocuments(), 0); });
test('incomplete drafts save, but cannot publish', async () => { const saved = await save({ bio: '', items: [], heroPublicId: '', handle: '' }); assert.equal(saved.code, 200); assert.equal((await publish()).code, 400); });
test('saved edits stay private until explicitly published; publish retries are idempotent', async () => {
  await Portfolio.create({ userId: owner._id, handle: 'amara-studio', status: 'published', studioName: 'Amara Studio', bio: 'The original bio.', items: ids.map(publicId => ({ publicId })), heroPublicId: ids[0], publishedAt: new Date() });
  const saved = await save({ bio: 'A new bio awaiting review.' }); assert.equal(saved.code, 200); assert.equal(saved.body.hasUnpublishedChanges, true);
  const publicBefore = await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' }); assert.equal(publicBefore.body.data.bio, 'The original bio.'); assert.equal(publicBefore.headers['Cache-Control'], 'no-store');
  const published = await publish(); assert.equal(published.code, 200, JSON.stringify(published.body)); assert.equal(published.body.hasUnpublishedChanges, false);
  const retry = await publish(); assert.equal(retry.body.publishedRevision, published.body.publishedRevision); assert.equal((await Portfolio.findOne()).bio, 'A new bio awaiting review.');
});
test('revision comparisons reject stale saves, publishes and unpublishes', async () => {
  const saved = await save(); assert.equal(saved.code, 200); assert.equal((await invoke(updateMyPortfolio, body())).code, 409); assert.equal((await invoke(publishMyPortfolio, { expectedDraftRevision: 0 })).code, 409); assert.equal((await invoke(unpublishMyPortfolio, { expectedDraftRevision: 0 })).code, 409);
  const concurrent = await Promise.all([invoke(updateMyPortfolio, body({ expectedDraftRevision: 1, bio: 'Left draft' })), invoke(updateMyPortfolio, body({ expectedDraftRevision: 1, bio: 'Right draft' }))]); assert.deepEqual(concurrent.map(item => item.code).sort(), [200, 409]);
});
test('duplicate photographs cannot bypass the minimum, or consume multiple slots', async () => { const res = await save({ items: Array.from({ length: 4 }, () => ({ publicId: ids[0] })) }); assert.equal(res.code, 400); });
test('draft save rejects another studio’s photographs and invalid project references', async () => { assert.equal((await save({ items: [...body().items.slice(0, 3), { publicId: 'other/photo' }] })).code, 403); assert.equal((await save({ projects: [{ id: 'project-one', title: 'Wedding', coverId: 'not-present', photoIds: ['not-present'] }] })).code, 400); });
test('projects share photo slots, expose opaque IDs, and validate missing project routes', async () => {
  assert.equal((await save({ projects: [{ id: 'project-one', title: 'Ada’s portraits', description: 'A portrait session in Lagos.', category: 'Portraits', coverId: portfolioId(ids[0]), photoIds: ids.map(portfolioId) }] })).code, 200);
  assert.equal((await publish()).code, 200);
  const page = await invoke(getPublicPortfolio, {}, { handle: 'amara-studio', projectId: 'project-one' }); assert.equal(page.code, 200); assert.equal(page.body.data.items.length, 4); assert.equal(page.body.data.items[0].publicId, undefined); assert.equal(page.body.data.heroPublicId, undefined); assert.equal(page.cookieOptions.path, '/api/v1/portfolios/public');
  assert.equal((await invoke(getPublicPortfolio, {}, { handle: 'amara-studio', projectId: 'missing-project' })).code, 404);
});
test('publish checks permission and normalizes Nigerian WhatsApp and Instagram links', async () => { await save({ whatsapp: '08012345678', instagram: 'https://www.instagram.com/amara.studio/' }); assert.equal((await invoke(publishMyPortfolio, { expectedDraftRevision: 1 })).code, 400); assert.equal((await publish()).code, 200); const stored = await Portfolio.findOne(); assert.equal(stored.whatsapp, '2348012345678'); assert.equal(stored.instagram, 'amara.studio'); });
test('invalid contact text can be saved for correction but not published', async () => { assert.equal((await save({ whatsapp: 'not a number' })).code, 200); assert.equal((await publish()).code, 400); });
test('suspended accounts and expired subscriptions cannot serve public pages or metadata', async () => {
  await save(); await publish(); await User.updateOne({ _id: owner._id }, { accountStatus: 'suspended' }); assert.equal((await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' })).code, 404); assert.equal((await invoke(getPortfolioShareMeta, {}, { handle: 'amara-studio' })).code, 404);
  await User.updateOne({ _id: owner._id }, { accountStatus: 'active' }); await Subscription.updateMany({ userId: owner._id }, { paidThrough: new Date(Date.now() - 1000) }); assert.equal((await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' })).code, 404); assert.equal((await publish()).code, 403);
});
test('retained Free accounts can read private drafts but cannot edit them', async () => { await save(); await Subscription.updateMany({ userId: owner._id }, { status: 'expired' }); await User.updateOne({ _id: owner._id }, { plan: 'free', proRetentionUntil: new Date(Date.now() + 86400000) }); const mine = await invoke(getMyPortfolio); assert.equal(mine.body.access, 'private'); assert.equal((await save()).code, 403); });
test('an expired manual grant does not leave the stale Pro label active', async () => { await Subscription.deleteMany({ userId: owner._id }); owner.planOverride = { plan: 'pro', expiresAt: new Date(Date.now() - 1000) }; await owner.save(); assert.equal((await resolveEntitlements(owner, { includeUsage: false })).features.portfolioMode, 'unavailable'); });
test('publish rechecks an address taken by another studio', async () => { await save({ handle: 'taken-address' }); const other = await User.create({ name: 'Bola', email: 'bola@example.com', accountStatus: 'active', plan: 'pro' }); await Portfolio.create({ userId: other._id, handle: 'taken-address', studioName: 'Bola Studio' }); assert.equal((await publish()).code, 409); assert.equal((await invoke(checkPortfolioHandle, {}, { handle: 'taken-address' })).body.available, false); });
test('handle renames reserve the old address, preserve redirects and enforce cooldown', async () => {
  await save(); await publish(); await save({ handle: 'amara-portraits' }); const changed = await publish(); assert.equal(changed.code, 200); assert.equal((await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' })).body.redirectedFrom, 'amara-studio'); assert.equal(await PortfolioHandle.countDocuments(), 2); assert.equal((await auditPortfolioHandles()).collisions.length, 0); await save({ handle: 'another-address' }); assert.equal((await publish()).code, 429);
});
test('source deletion repairs live and draft projects, cover and publication status', async () => {
  await save({ projects: [{ id: 'project-one', title: 'Portraits', photoIds: ids.map(portfolioId), coverId: portfolioId(ids[0]) }] }); await publish(); await removePortfolioReferences(owner._id, [ids[0]]); const stored = await Portfolio.findOne(); assert.equal(stored.items.length, 3); assert.equal(stored.draft.items.length, 3); assert.equal(stored.heroPublicId, ids[1]); assert.equal(stored.projects[0].coverId, portfolioId(ids[1])); assert.equal(stored.status, 'draft'); assert.equal((await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' })).code, 404);
});
test('making a portfolio private closes old media URLs', async () => { await save(); await publish(); assert.equal((await invoke(unpublishMyPortfolio, { expectedDraftRevision: 1 })).code, 200); assert.equal((await invoke(getPortfolioMedia, {}, { handle: 'amara-studio', itemId: portfolioId(ids[0]) }, owner, { v: '400' })).code, 404); });
test('category-only photographs publish separately while unplaced photographs and unpublished changes stay private', async () => {
  const categoryId = 'studio/category-only', hiddenId = 'studio/hidden-photo';
  await StorageAsset.insertMany([categoryId, hiddenId].map(publicId => ({ userId: owner._id, publicId, format: 'jpg' })));
  await PortfolioMedia.insertMany([categoryId, hiddenId].map(publicId => ({ publicId, variants: Object.fromEntries(['400', '800', '1600', 'og'].map(key => [key, `https://res.cloudinary.com/test/${key}.webp`])) })));
  await save({ items: [...body().items, { publicId: categoryId, category: 'Weddings', featured: false }, { publicId: hiddenId, featured: false }], categories: ['Portraits', 'Weddings'] });
  assert.equal((await publish()).code, 200);
  let page = await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' });
  assert.equal(page.body.data.items.length, 5);
  assert.equal(page.body.data.items.find(item => item.id === portfolioId(categoryId)).featured, false);
  assert.ok(!page.body.data.items.some(item => item.id === portfolioId(hiddenId)));
  // An invalid variant stops before the media fetch, after its visibility gate.
  assert.equal((await invoke(getPortfolioMedia, {}, { handle: 'amara-studio', itemId: portfolioId(categoryId) }, owner, { v: 'invalid' })).code, 400);
  assert.equal((await invoke(getPortfolioMedia, {}, { handle: 'amara-studio', itemId: portfolioId(hiddenId) }, owner, { v: 'invalid' })).code, 404);
  await save({ items: [...body().items, { publicId: categoryId, category: 'Weddings', featured: false }, { publicId: hiddenId, featured: false }], direction: { showCategories: false } });
  assert.equal((await invoke(getPortfolioMedia, {}, { handle: 'amara-studio', itemId: portfolioId(categoryId) }, owner, { v: 'invalid' })).code, 400);
  assert.equal((await publish()).code, 200);
  page = await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' });
  assert.equal(page.body.data.items.length, 4);
  assert.equal((await invoke(getPortfolioMedia, {}, { handle: 'amara-studio', itemId: portfolioId(categoryId) }, owner, { v: 'invalid' })).code, 404);
});
test('category-only photographs count towards publication and source deletion repairs their public availability', async () => {
  await save({ items: ids.map((publicId, index) => ({ publicId, category: index < 2 ? 'Portraits' : 'Weddings', featured: index < 2 })) });
  assert.equal((await publish()).code, 200);
  await removePortfolioReferences(owner._id, [ids[3]]);
  const stored = await Portfolio.findOne();
  assert.equal(stored.items.length, 3);
  assert.equal(stored.status, 'draft');
  assert.equal((await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' })).code, 404);
});
test('archiving a delivery keeps explicitly selected portfolio photographs', async () => { await StorageAsset.deleteMany({}); await Delivery.create({ userId: owner._id, status: 'published', title: 'Portraits', brief: 'Finished portraits', assets: ids.map((publicId, index) => ({ assetId: `photo-${index}`, publicId, resourceType: 'image' })) }); assert.equal((await save()).code, 200); await Delivery.updateOne({}, { status: 'archived' }); assert.equal((await publish()).code, 200); });
test('photo sources paginate and do not expose another studio’s deliveries', async () => { await Delivery.create({ userId: owner._id, status: 'published', title: 'Birthday', brief: 'Birthday portraits', assets: Array.from({ length: 26 }, (_, index) => ({ assetId: `photo-${index}`, publicId: `studio/birthday-${index}`, resourceType: 'image', originalFilename: `birthday-${index}.jpg` })) }); const groups = await invoke(getPortfolioSources, {}, {}, owner, { kind: 'deliveries' }); const sourceId = groups.body.data[0].sourceId; const first = await invoke(getPortfolioSources, {}, {}, owner, { kind: 'delivery', sourceId }); assert.equal(first.body.data.length, 24); assert.equal(first.body.nextCursor, '24'); assert.equal(first.body.data[0].title, ''); const next = await invoke(getPortfolioSources, {}, {}, owner, { kind: 'delivery', sourceId, cursor: '24' }); assert.equal(next.body.data.length, 2); const other = await User.create({ name: 'Other', email: 'other@example.com', plan: 'pro', accountStatus: 'active', planOverride: { plan: 'pro' } }); assert.equal((await invoke(getPortfolioSources, {}, {}, other, { kind: 'delivery', sourceId })).code, 404); });
test('public metadata uses the current account studio name and project cover', async () => { await save(); await publish(); await User.updateOne({ _id: owner._id }, { 'studio.name': 'Amara Portrait Studio' }); const publicPage = await invoke(getPublicPortfolio, {}, { handle: 'amara-studio' }); assert.equal(publicPage.body.data.studioName, 'Amara Portrait Studio'); const meta = await invoke(getPortfolioShareMeta, {}, { handle: 'amara-studio' }); assert.match(meta.body.data.title, /Amara Portrait Studio/); assert.match(meta.body.data.image, /media\/p-.*v=og/); });
test('suggestion acceptance rejects a stale snapshot and cancellation releases the active slot', async () => { await save(); const portfolio = await Portfolio.findOne(); const job = await PortfolioJob.create({ userId: owner._id, portfolioId: portfolio._id, inputRevision: 1, input: normalizeSnapshot(portfolio.draft), status: 'review', active: false }); await save({ bio: 'A changed bio.' }); assert.equal((await invoke(reviewPortfolioJob, { decision: 'accepted', expectedDraftRevision: 2 }, { jobId: String(job._id) })).code, 409); const running = await PortfolioJob.create({ userId: owner._id, portfolioId: portfolio._id, inputRevision: 2 }); assert.equal((await invoke(cancelPortfolioJob, {}, { jobId: String(running._id) })).code, 200); assert.equal(await PortfolioJob.countDocuments({ active: true }), 0); });
test('durable cleanup waits for source deletion and repairs the portfolio after a restart', async () => { await save(); await publish(); await schedulePortfolioRemoval(owner._id, [ids[0]]); await processPortfolioRemovals(); assert.equal(await PortfolioCleanup.countDocuments(), 1); assert.equal((await Portfolio.findOne()).items.length, 4); await StorageAsset.deleteOne({ publicId: ids[0] }); await processPortfolioRemovals(); assert.equal(await PortfolioCleanup.countDocuments(), 0); assert.equal((await Portfolio.findOne()).items.length, 3); });
test('picker preparation builds one variant, publishing fills missing variants and preserves the thumbnail', async () => {
  const publicId = 'studio/new-preview'; const original = cloudinary.uploader.explicit; const calls = [];
  process.env.CLOUDINARY_CLOUD_NAME = 'portfolio-test'; process.env.CLOUDINARY_API_KEY = 'test-key'; process.env.CLOUDINARY_API_SECRET = 'test-secret';
  cloudinary.uploader.explicit = async (id, options) => { calls.push(options); return { width: 1200, height: 1800, eager: options.eager.split('|').map((value, index) => ({ secure_url: `https://res.cloudinary.com/test/preview-${calls.length}-${index}.webp` })) }; };
  try { const thumbnail = await preparePortfolioMedia(publicId, ['400']); assert.equal(calls[0].eager.split('|').length, 1); await preparePortfolioSet([{ publicId }]); const ready = await PortfolioMedia.findOne({ publicId }).lean(); assert.equal(calls[1].eager.split('|').length, 3); assert.equal(ready.variants['400'], thumbnail.variants['400']); assert.equal(Object.keys(ready.variants).length, 4); } finally { cloudinary.uploader.explicit = original; }
});
test('project page visits count directly and analytics keep one identity across address changes', async () => { await save({ projects: [{ id: 'project-one', title: 'Portraits', photoIds: ids.map(portfolioId), coverId: portfolioId(ids[0]) }] }); await publish(); await invoke(getPublicPortfolio, {}, { handle: 'amara-studio', projectId: 'project-one' }); await new Promise(resolve => setTimeout(resolve, 30)); const first = await invoke(getPortfolioActivity); assert.equal(first.body.data.projectOpens, 1); const recorded = await AnalyticsEvent.find({ name: { $in: ['portfolio.viewed', 'portfolio.project.opened'] } }).lean(); assert.equal(new Set(recorded.map(event => event.sessionDigest)).size, 1); await save({ handle: 'amara-new' }); await publish(); const afterRename = await invoke(getPortfolioActivity); assert.equal(afterRename.body.data.views, 1); assert.equal(afterRename.body.data.projectOpens, 1); assert.equal((await invoke(recordPortfolioEngagement, { action: 'photo.opened', itemIndex: -1 }, { handle: 'amara-new' })).code, 400); });
test('simultaneous suggestion requests hold one immutable snapshot and disclose no input payload', async () => { process.env.DELIVERY_PIPELINE_ENABLED = 'true'; await save(); const results = await Promise.all([invoke(directMyPortfolio, { expectedDraftRevision: 1 }), invoke(directMyPortfolio, { expectedDraftRevision: 1 })]); assert.ok(results.every(result => [200, 202].includes(result.code)), JSON.stringify(results.map(result => result.body))); assert.ok(results.every(result => result.body.data.input === undefined)); assert.equal(await PortfolioJob.countDocuments({ active: true }), 1); const job = await PortfolioJob.findOne(); await save({ bio: 'Later edits.' }); const stored = await PortfolioJob.findById(job._id); assert.equal(stored.input.bio, 'Finished portraits and celebrations in Lagos.'); assert.equal(stored.inputRevision, 1); });
test('media preparation failure keeps the published page unchanged', async () => { await save(); await publish(); await save({ bio: 'An introduction awaiting publication.' }); await PortfolioMedia.deleteMany({}); const original = cloudinary.uploader.explicit; cloudinary.uploader.explicit = async () => { throw Object.assign(new Error('Provider unavailable'), { status: 503 }); }; try { assert.equal((await publish()).code, 503); const stored = await Portfolio.findOne(); assert.equal(stored.bio, 'Finished portraits and celebrations in Lagos.'); assert.equal(stored.draft.bio, 'An introduction awaiting publication.'); } finally { cloudinary.uploader.explicit = original; } });
test('legacy addresses with repeated hyphens remain usable and redirect after a rename', async () => { await Portfolio.create({ userId: owner._id, handle: 'amara--studio', studioName: 'Amara Studio', status: 'published', bio: 'The studio introduction.', items: ids.map(publicId => ({ publicId })), heroPublicId: ids[0], publishedAt: new Date() }); assert.equal((await invoke(getPublicPortfolio, {}, { handle: 'amara--studio' })).code, 200); assert.equal((await invoke(checkPortfolioHandle, {}, { handle: 'amara--studio' })).body.available, true); await save({ handle: 'amara--studio' }); assert.equal((await publish()).code, 200); await save({ handle: 'amara-new' }); assert.equal((await publish()).code, 200); assert.equal((await invoke(getPublicPortfolio, {}, { handle: 'amara--studio' })).body.redirectedFrom, 'amara--studio'); });
