import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Portfolio from '../src/models/Portfolio.js';
import StorageAsset from '../src/models/StorageAsset.js';
import Delivery from '../src/models/Delivery.js';
import { checkPortfolioHandle, getMyPortfolio, getPortfolioSources, getPublicPortfolio, publishMyPortfolio, updateMyPortfolio } from '../src/controllers/portfolio.controller.js';

let mongo;
let owner;
const ids = ['studio/test-1', 'studio/test-2', 'studio/test-3', 'studio/test-4'];

function response() {
  return {
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    cookie() { return this; }
  };
}

function request(body = {}, user = owner) { return { user: { id: String(user._id) }, body, params: {}, cookies: {}, originalUrl: '/api/v1/portfolio/public/amara-studio' }; }

function draftBody(overrides = {}) {
  return {
    handle: 'amara-studio', studioName: 'Amara Studio', bio: 'Finished portraits and celebrations in Lagos.',
    headline: 'Portraits by Amara', introLine: '', location: 'Lagos', contactLabel: 'Ask about a shoot',
    instagram: 'amarastudio', whatsapp: '', heroPublicId: ids[0],
    items: ids.map((publicId, index) => ({ publicId, title: `Portrait ${index + 1}`, category: 'Portraits' })),
    direction: {}, ...overrides
  };
}

before(async () => {
  process.env.CLOUDINARY_CLOUD_NAME = 'portfolio-test';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  owner = await User.create({ name: 'Amara', email: 'amara@example.com', plan: 'pro', studio: { name: 'Amara Studio' } });
  await StorageAsset.insertMany(ids.map(publicId => ({ userId: owner._id, publicId, format: 'jpg' })));
});

after(async () => { await new Promise(resolve => setTimeout(resolve, 100)); await mongoose.disconnect(); await mongo?.stop(); });

test('saved edits stay private until explicitly published', async () => {
  const legacy = await Portfolio.create({ userId: owner._id, handle: 'amara-studio', status: 'published', studioName: 'Amara Studio', bio: 'The original bio.', items: ids.map((publicId, sortOrder) => ({ publicId, sortOrder, category: 'Portraits' })), heroPublicId: ids[0], publishedAt: new Date() });
  const save = response();
  await updateMyPortfolio(request(draftBody({ bio: 'A new bio awaiting review.', headline: 'New opening' })), save);
  assert.equal(save.code, 200);
  assert.equal(save.body.hasUnpublishedChanges, true);
  const stored = await Portfolio.findById(legacy._id);
  assert.equal(stored.bio, 'The original bio.');
  assert.equal(stored.draft.bio, 'A new bio awaiting review.');
  const publicBefore = response();
  const publicRequest = request();
  publicRequest.params.handle = 'amara-studio';
  await getPublicPortfolio(publicRequest, publicBefore);
  assert.equal(publicBefore.body.data.bio, 'The original bio.');
  const mine = response();
  await getMyPortfolio(request(), mine);
  assert.equal(mine.body.data.bio, 'A new bio awaiting review.');
  const publish = response();
  await publishMyPortfolio(request(), publish);
  assert.equal(publish.code, 200);
  assert.equal(publish.body.hasUnpublishedChanges, false);
  assert.equal((await Portfolio.findById(legacy._id)).bio, 'A new bio awaiting review.');
});

test('publish rechecks a draft address if another studio takes it', async () => {
  const saved = response();
  await updateMyPortfolio(request(draftBody({ handle: 'new-address' })), saved);
  assert.equal(saved.code, 200);
  const other = await User.create({ name: 'Bola', email: 'bola@example.com', plan: 'pro', studio: { name: 'Bola Studio' } });
  await Portfolio.create({ userId: other._id, handle: 'new-address', studioName: 'Bola Studio' });
  const publish = response();
  await publishMyPortfolio(request(), publish);
  assert.equal(publish.code, 409);
  const stillLive = await Portfolio.findOne({ userId: owner._id });
  assert.equal(stillLive.handle, 'amara-studio');
  assert.equal(stillLive.status, 'published');
});

test('draft save rejects a photograph owned by another studio', async () => {
  const denied = response();
  await updateMyPortfolio(request(draftBody({ items: [...draftBody().items.slice(0, 3), { publicId: 'other-studio/photo-4', category: 'Portraits' }] })), denied);
  assert.equal(denied.code, 403);
});

test('photo sources load in pages and stay within the requesting studio', async () => {
  const assets = [...Array.from({ length: 26 }, (_, index) => ({ assetId: `asset-${index}`, publicId: `studio/birthday-${index}`, resourceType: 'image', originalFilename: `birthday-${index}.jpg` })), { assetId: 'video-asset', publicId: 'studio/birthday-video', resourceType: 'video', originalFilename: 'birthday-video.mp4' }];
  await Delivery.create({ userId: owner._id, status: 'published', title: 'Ada birthday', brief: 'Ada birthday portraits', assets });
  const groups = response();
  await getPortfolioSources({ ...request(), query: { kind: 'deliveries' } }, groups);
  assert.equal(groups.code, 200);
  assert.equal(groups.body.data[0].photoCount, 26);
  const sourceId = groups.body.data[0].sourceId;
  const first = response();
  await getPortfolioSources({ ...request(), query: { kind: 'delivery', sourceId } }, first);
  assert.equal(first.body.data.length, 24);
  assert.equal(first.body.nextCursor, '24');
  const second = response();
  await getPortfolioSources({ ...request(), query: { kind: 'delivery', sourceId, cursor: first.body.nextCursor } }, second);
  assert.equal(second.body.data.length, 2);
  assert.equal(second.body.nextCursor, null);
  const outsider = await User.findOne({ email: 'bola@example.com' });
  const denied = response();
  await getPortfolioSources({ ...request({}, outsider), query: { kind: 'delivery', sourceId } }, denied);
  assert.equal(denied.code, 404);
});

test('address check reports an existing studio address as unavailable', async () => {
  const result = response();
  const checking = request();
  checking.params.handle = 'new-address';
  await checkPortfolioHandle(checking, result);
  assert.equal(result.body.available, false);
});

test('public portfolio uses the current Account Settings studio name', async () => {
  await User.updateOne({ _id: owner._id }, { $set: { 'studio.name': 'Amara Portrait Studio' } });
  const publicRequest = request();
  publicRequest.params.handle = 'amara-studio';
  const publicResult = response();
  await getPublicPortfolio(publicRequest, publicResult);
  assert.equal(publicResult.body.data.studioName, 'Amara Portrait Studio');
});
