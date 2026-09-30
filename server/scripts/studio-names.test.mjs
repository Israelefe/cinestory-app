import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Portfolio from '../src/models/Portfolio.js';
import { checkStudioName, updateProfile } from '../src/controllers/auth.controller.js';
import { updateOnboarding } from '../src/controllers/onboarding.controller.js';
import { auditStudioNames, prepareStudioNames, studioNameAvailable, STUDIO_NAME_INDEX } from '../src/services/studioName.service.js';
import { studioNameKey, studioNameSchema } from '../src/utils/studioName.js';

let mongo;
let serial = 0;
const response = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, set() { return this; } });
const request = (user, body = {}) => ({ user: { id: String(user._id) }, body, query: {} });
const details = studioName => ({ studioName, businessType: 'individual', city: 'Lagos', state: 'Lagos' });
const profile = studioName => ({ name: 'Amara', ...details(studioName), specialties: ['Portraits'], instagram: '', whatsapp: '' });
const account = name => User.create({ name: 'Amara', email: `studio-${++serial}@example.com`, ...(name ? { studio: { name } } : {}) });

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '8.2.6', downloadDir: './node_modules/.cache/mongodb-memory-server' } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Portfolio.init()]);
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('name validation folds case, repeated spaces and compatibility characters without stripping punctuation', () => {
  assert.equal(studioNameKey('  AMARA   Studios  '), 'amara studios');
  assert.equal(studioNameKey('Ａｍａｒａ Studios'), 'amara studios');
  assert.equal(studioNameSchema.parse(' Amara  & Co. '), 'Amara & Co.');
  for (const value of ['', ' ', 'A', {}, 'Amara\u200b Studios', 'x'.repeat(101)]) assert.equal(studioNameSchema.safeParse(value).success, false);
});

test('legacy duplicates stop migration and name writes without renaming accounts', async () => {
  const first = new mongoose.Types.ObjectId();
  const second = new mongoose.Types.ObjectId();
  await User.collection.insertMany([{ _id: first, name: 'First', email: 'first@example.com', studio: { name: 'Legacy Studio' } }, { _id: second, name: 'Second', email: 'second@example.com', studio: { name: ' LEGACY  studio ' } }]);
  const audit = await auditStudioNames();
  assert.equal(audit.duplicates.length, 1);
  await assert.rejects(prepareStudioNames(), /duplicate groups/);
  const res = response();
  await updateOnboarding(request({ _id: first }, { step: 1, data: details('A Different Brand') }), res);
  assert.equal(res.code, 503);
  assert.equal((await User.findById(first)).studio.name, 'Legacy Studio');
  assert.equal(await User.countDocuments({ studioNameKey: { $exists: true } }), 0);
  await User.deleteMany({ _id: { $in: [first, second] } });
});

test('migration backfills existing names, permits unnamed accounts and is safe to rerun', async () => {
  const old = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id: old, name: 'Legacy', email: 'legacy@example.com', studio: { name: ' Legacy  Brand ' } });
  await User.collection.insertMany([{ name: 'Unnamed one', email: 'unnamed-one@example.com', studioNameKey: '' }, { name: 'Unnamed two', email: 'unnamed-two@example.com', studioNameKey: '' }]);
  await prepareStudioNames();
  await prepareStudioNames();
  assert.equal((await User.findById(old).select('+studioNameKey')).studioNameKey, 'legacy brand');
  assert.equal(await studioNameAvailable('LEGACY BRAND', new mongoose.Types.ObjectId()), false);
  assert.equal(await studioNameAvailable('legacy brand', old), true);
  const indexes = await User.collection.indexes();
  assert.equal(indexes.find(index => index.name === STUDIO_NAME_INDEX).unique, true);
  assert.equal(await User.countDocuments({ studioNameKey: '' }), 0);
  await Promise.all([account(), account()]);
});

test('onboarding rejects another account’s name and leaves all submitted fields unchanged', async () => {
  await account('Taken Brand');
  const other = await account();
  const res = response();
  await updateOnboarding(request(other, { step: 1, data: details(' TAKEN   brand ') }), res);
  assert.equal(res.code, 409);
  assert.equal(res.body.field, 'studioName');
  const stored = await User.findById(other._id);
  assert.equal(stored.studio.name, undefined);
  assert.equal(stored.studio.city, undefined);
  assert.equal(stored.onboardingStep, 1);
});

test('account settings rejects a taken name without changing the public portfolio', async () => {
  await account('Reserved Brand');
  const user = await account('Original Brand');
  await Portfolio.create({ userId: user._id, handle: 'original-brand', studioName: 'Original Brand' });
  const res = response();
  await updateProfile(request(user, profile('Reserved Brand')), res);
  assert.equal(res.code, 409);
  assert.equal((await User.findById(user._id)).studio.name, 'Original Brand');
  assert.equal((await Portfolio.findOne({ userId: user._id })).studioName, 'Original Brand');
});

test('simultaneous onboarding and settings claims have exactly one winner', async () => {
  const first = await account();
  const second = await account('Second Original');
  await Portfolio.create({ userId: second._id, handle: 'second-original', studioName: 'Second Original' });
  const left = response();
  const right = response();
  await Promise.all([updateOnboarding(request(first, { step: 1, data: details('Race Brand') }), left), updateProfile(request(second, profile('RACE Brand')), right)]);
  assert.deepEqual([left.code, right.code].sort(), [200, 409]);
  assert.equal(await User.countDocuments({ studioNameKey: 'race brand' }), 1);
  assert.equal((await Portfolio.findOne({ userId: second._id })).studioName, right.code === 200 ? 'RACE Brand' : 'Second Original');
});

test('the unique index protects direct query renames as well as controller saves', async () => {
  await account('Query Protected');
  const other = await account('Query Original');
  await assert.rejects(User.updateOne({ _id: other._id }, { $set: { 'studio.name': ' QUERY   PROTECTED ' } }), error => error.code === 11000);
  assert.equal((await User.findById(other._id)).studio.name, 'Query Original');
  await User.updateOne({ _id: other._id }, { $set: { 'studio.name': ' Query   New ' } });
  assert.equal((await User.findById(other._id).select('+studioNameKey')).studioNameKey, 'query new');
  assert.equal(await studioNameAvailable('Query Original', new mongoose.Types.ObjectId()), true);
});

test('owners can keep their names during cooldown and renames preserve the 30-day rule', async () => {
  const user = await account('Cooldown Original');
  const first = response();
  await updateProfile(request(user, profile('Cooldown New')), first);
  assert.equal(first.code, 200);
  assert.equal(first.body.user.studioNameKey, undefined);
  assert.ok(first.body.user.profileChangePolicy.studioNameNextChangeAt);
  const unchanged = response();
  await updateProfile(request(user, profile('Cooldown New')), unchanged);
  assert.equal(unchanged.code, 200);
  for (const submit of [updateProfile, updateOnboarding]) {
    const blocked = response();
    await submit(request(user, submit === updateProfile ? profile('Another Cooldown Name') : { step: 1, data: details('Another Cooldown Name') }), blocked);
    assert.equal(blocked.code, 429);
    assert.equal(blocked.body.code, 'STUDIO_NAME_COOLDOWN');
  }
});

test('availability validates input, excludes the owner, and does not disclose account details', async () => {
  const user = await account('Availability Brand');
  const req = request(user);
  req.query.name = 'AVAILABILITY Brand';
  const own = response();
  await checkStudioName(req, own);
  assert.equal(own.body.available, true);
  req.user.id = String(new mongoose.Types.ObjectId());
  const other = response();
  await checkStudioName(req, other);
  assert.equal(other.body.available, false);
  assert.equal(other.body.user, undefined);
  req.query.name = { $ne: '' };
  const invalid = response();
  await checkStudioName(req, invalid);
  assert.equal(invalid.code, 400);
});
