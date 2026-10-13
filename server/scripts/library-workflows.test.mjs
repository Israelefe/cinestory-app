import EmailDelivery from '../src/models/EmailDelivery.js';
import { retryLibraryEmails } from '../src/services/email.service.js';
import { authorizedMediaClaims } from '../src/services/mediaAuthorization.service.js';
import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import StorageAsset from '../src/models/StorageAsset.js';
import LibraryShoot from '../src/models/LibraryShoot.js';
import LibraryCollaboration from '../src/models/LibraryCollaboration.js';
import Delivery from '../src/models/Delivery.js';
import { addLibraryAssets } from '../src/controllers/delivery.controller.js';
import { collaborationSchema, latestAcceptedReturns, validateChoices } from '../src/services/libraryWorkflow.service.js';
import { confirmStorageAsset, listStorage, resolveLibraryPhotos } from '../src/controllers/storage.controller.js';
import { createLibraryCollaboration, getPublicLibraryContent, savePublicSelectionDraft, submitPublicPreselection, reopenLibraryPreselection, reviseLibraryPreselection, signPublicEditorUpload, confirmPublicEditorUpload, renewPublicEditorUpload, cleanupPublicEditorUpload, reviewEditorReturn, getLibraryShareMeta, getLibraryShareCover, deleteLibraryCollaboration, sendLibraryInvitation, submitPublicEditorEdits } from '../src/controllers/libraryCollaboration.controller.js';
import { createStorageUploadSignature, renewStorageUploadSignature } from '../src/services/storageMedia.service.js';
import { commitLibraryAsset } from '../src/services/libraryAssetCommit.service.js';
import { migrateLibraryWorkspaces } from '../src/services/libraryMigration.service.js';
import { saveEditorReview } from '../src/services/libraryEditorReview.service.js';
import { verifyMediaWorkerToken } from '../src/services/cloudflareMedia.service.js';

process.env.NODE_ENV = 'test';
const secret = 'library-regression-only-signing-value-at-least-32-characters';
Object.assign(process.env, { JWT_SECRET: secret, R2_MEDIA_OFFLOAD_ENABLED: 'true', R2_IMAGE_WORKER_URL: 'https://media.example.test', R2_IMAGE_WORKER_SECRET: secret, R2_ACCOUNT_ID: 'offline', R2_ACCESS_KEY_ID: 'offline', R2_SECRET_ACCESS_KEY: 'offline', R2_BUCKET_NAME: 'veylo', RESEND_API_KEY: 're_fixture_not_a_real_key' });
let mongo, owner, other, photos, failedCopySource, emailFails = false;
const emailMessages = [];
const actualFetch = globalThis.fetch;
const objects = new Map();
function response() { return { code: 200, status(code) { this.code = code; return this; }, set(...args) { this.headers = args; return this; }, redirect(code, url) { this.code = code; this.url = url; return this; }, json(body) { this.body = body; return this; } }; }
async function call(handler, options = {}) {
  const res = response();
  const req = { user: { id: String(owner._id) }, params: {}, query: {}, body: {}, get() { return ''; }, ...options };
  await handler(req, res); return res;
}
function access(link, body = {}) {
  const token = jwt.sign({ collaborationId: String(link._id), publicId: link.publicId, purpose: 'library-collaboration' }, secret, { expiresIn: '1h', issuer: 'veylo-api', audience: 'veylo-library-collaboration' });
  return { params: { publicId: link.publicId }, body, get: name => name === 'authorization' ? 'Bearer ' + token : '' };
}
async function link(values = {}) { return LibraryCollaboration.create({ userId: owner._id, publicId: crypto.randomUUID(), kind: 'preselection', title: 'Ada at 30', assetIds: photos.map(photo => photo._id), selectionRule: { mode: 'exactly', count: 2 }, expiresAt: new Date(Date.now() + 86400000), ...values }); }
const ids = () => photos.map(photo => String(photo._id));
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(mongo.getUri());
  await Promise.all([User, StorageAsset, LibraryShoot, LibraryCollaboration, Delivery, EmailDelivery].map(model => model.init()));
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.resend.com') { emailMessages.push(JSON.parse(options.body)); return emailFails ? Response.json({ name: 'application_error', message: 'Fixture provider unavailable' }, { status: 503 }) : Response.json({ id: 'fixture-email-' + emailMessages.length }); }
    if (url.hostname === 'media.example.test') {
      const data = JSON.parse(options.body || '{}');
      if (url.pathname.endsWith('/inspect')) return Response.json({ format: 'jpeg', width: 1200, height: 1600, bytes: 1000, sha256: 'a'.repeat(64), etag: 'etag' });
      if (url.pathname.endsWith('/delete-prefix')) return Response.json({ deleted: 0 });
      return Response.json({ success: true, selectionMarks: true });
    }
    const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/'));
    if (options.method === 'PUT' && options.headers?.['x-amz-copy-source']) {
      if (options.headers['x-amz-copy-source'].endsWith(failedCopySource || 'never-fail')) return new Response('<Error><Code>AccessDenied</Code></Error>');
      objects.set(key, true);
      return new Response('<CopyObjectResult><ETag>&quot;etag&quot;</ETag></CopyObjectResult>');
    }
    if (options.method === 'HEAD') return objects.has(key) ? new Response(null, { headers: { 'Content-Length': '1000', 'Content-Type': 'image/jpeg', ETag: 'etag' } }) : new Response(null, { status: 404 });
    if (options.method === 'DELETE') { objects.delete(key); return new Response(null, { status: 204 }); }
    throw new Error('Unexpected file transfer in library regression test: ' + options.method);
  };
});
beforeEach(async () => {
  await Promise.all([User, StorageAsset, LibraryShoot, LibraryCollaboration, Delivery, EmailDelivery].map(model => model.deleteMany({}))); objects.clear(); failedCopySource = ''; emailMessages.length = 0; emailFails = false;
  [owner, other] = await User.create([{ name: 'Amara', email: 'amara@example.test', accountStatus: 'active', planOverride: { plan: 'pro' } }, { name: 'Another studio', email: 'other@example.test', accountStatus: 'active', planOverride: { plan: 'pro' } }]);
  photos = await StorageAsset.create(Array.from({ length: 3 }, (_, index) => ({ userId: owner._id, publicId: `veylo/users/${owner._id}/library/${crypto.randomUUID()}`, originalFilename: 'portrait-' + (index + 1) + '.jpg', format: 'jpg', bytes: 1000, width: 1200, height: 1600, folder: 'Ada at 30' })));
  photos.forEach(photo => objects.set(photo.publicId, true));
});
after(async () => { globalThis.fetch = actualFetch; await mongoose.disconnect(); await mongo?.stop(); });

test('share previews expose only a marked cover and never count as an opening', async () => {
  const job = await link({ coverAssetId: photos[1]._id, note: 'Private editing brief', recipientEmail: 'private@example.test', pinDigest: 'private-digest' });
  const metadata = await call(getLibraryShareMeta, { params: { publicId: job.publicId } });
  assert.equal(metadata.code, 200); assert.match(metadata.body.data.title, /Ada at 30/);
  assert.doesNotMatch(JSON.stringify(metadata.body), /Private editing brief|private@example|private-digest/);
  const cover = await call(getLibraryShareCover, { params: { publicId: job.publicId } });
  const claims = verifyMediaWorkerToken(new URL(cover.url).pathname.split('/').at(-1));
  assert.equal(claims.access.assetId, ids()[1]); assert.equal(await authorizedMediaClaims(claims), true);
  assert.equal(await authorizedMediaClaims({ ...claims, preset: '1600' }), false);
  assert.equal(await authorizedMediaClaims({ ...claims, action: 'file' }), false);
  assert.equal(await authorizedMediaClaims({ ...claims, access: { ...claims.access, mark: '' } }), false);
  assert.equal(await authorizedMediaClaims({ ...claims, key: photos[0].publicId, access: { ...claims.access, assetId: ids()[0] } }), false);
  assert.equal(await EmailDelivery.countDocuments(), 0); assert.equal((await LibraryCollaboration.findById(job._id)).openedAt, undefined);
  await call(getPublicLibraryContent, access(job)); await call(getPublicLibraryContent, access(job));
  assert.equal(await EmailDelivery.countDocuments({ kind: 'library-opened' }), 1); assert.equal(emailMessages.length, 1);
  assert.deepEqual([].concat(emailMessages[0].to), ['amara@example.test']);
  await call(deleteLibraryCollaboration, { params: { id: String(job._id) } });
  assert.equal(await authorizedMediaClaims(claims), false); assert.equal((await call(getLibraryShareMeta, { params: { publicId: job.publicId } })).code, 410);
  assert.equal(await StorageAsset.countDocuments(), 3);
});

test('invitations retry once per recipient and correction emails contain the review', async () => {
  const edit = await StorageAsset.create({ userId: owner._id, publicId: `veylo/users/${owner._id}/library/editor-return`, format: 'jpg', bytes: 1000 });
  const job = await link({ kind: 'editor-handoff', returnedAssets: [{ sourceAssetId: photos[0]._id, assetId: edit._id }] });
  let review = await call(reviewEditorReturn, { params: { id: String(job._id), assetId: String(edit._id) }, body: { status: 'changes-requested', note: 'Keep the skin texture.' } });
  assert.equal(review.body.notification.status, 'no-address');
  const invite = { params: { id: String(job._id) }, body: { email: 'editor@example.test', requestKey: crypto.randomUUID() } };
  await call(sendLibraryInvitation, invite); await call(sendLibraryInvitation, invite);
  assert.equal(await EmailDelivery.countDocuments({ kind: 'library-invite' }), 1);
  await call(sendLibraryInvitation, { ...invite, body: { ...invite.body, email: 'second-editor@example.test' } });
  assert.equal(await EmailDelivery.countDocuments({ kind: 'library-invite' }), 2);
  review = await call(reviewEditorReturn, { params: { id: String(job._id), assetId: String(edit._id) }, body: { status: 'changes-requested', note: 'Reduce the highlights. <script>alert(1)</script>' } });
  assert.equal(review.body.notification.status, 'sent');
  assert.match(emailMessages.at(-1).html, /Reduce the highlights/); assert.doesNotMatch(emailMessages.at(-1).html, /<script>/);
  assert.deepEqual([].concat(emailMessages.at(-1).to), ['second-editor@example.test']);
});

test('notification failures keep encrypted retry content and deletion stops queued mail', async () => {
  const job = await link(); emailFails = true;
  assert.equal((await call(getPublicLibraryContent, access(job))).code, 200);
  const queued = await EmailDelivery.findOne({ kind: 'library-opened' }).select('+messageEncrypted');
  assert.equal(queued.status, 'failed'); assert.ok(queued.messageEncrypted); assert.doesNotMatch(queued.messageEncrypted, /Ada|opened/);
  emailFails = false; await EmailDelivery.updateOne({ _id: queued._id }, { $set: { retryAfter: new Date(0) } });
  await retryLibraryEmails(); await retryLibraryEmails(); assert.equal(emailMessages.length, 2);
  assert.equal((await EmailDelivery.findById(queued._id)).status, 'sent');
  emailFails = true;
  const invite = await call(sendLibraryInvitation, { params: { id: String(job._id) }, body: { email: 'client@example.test', requestKey: crypto.randomUUID() } });
  assert.equal(invite.body.notification.status, 'queued');
  await call(deleteLibraryCollaboration, { params: { id: String(job._id) } }); emailFails = false;
  await retryLibraryEmails(); assert.equal(emailMessages.length, 3);
  assert.equal((await EmailDelivery.findOne({ kind: 'library-invite' })).status, 'skipped');
});

test('partial returns and accepted alternatives track source coverage and one Library folder', async () => {
  const returns = await StorageAsset.create([1, 2, 3].map(index => ({ userId: owner._id, publicId: `veylo/users/${owner._id}/library/variation-${index}`, format: 'jpg', bytes: 1000 })));
  const job = await link({ kind: 'editor-handoff', assetIds: photos.slice(0, 2).map(photo => photo._id), returnedAssets: returns.map((asset, index) => ({ sourceAssetId: photos[index === 2 ? 1 : 0]._id, assetId: asset._id, variationId: index === 1 ? 'bw' : 'main', variationName: index === 1 ? 'Black and white' : 'Main edit' })) });
  assert.equal((await call(submitPublicEditorEdits, access(job))).body.data.notification.status, 'sent');
  assert.equal(await EmailDelivery.countDocuments({ kind: 'library-returned' }), 1);
  const accept = asset => saveEditorReview({ userId: owner._id, collaborationId: job._id, assetId: String(asset._id), status: 'accepted', note: '' });
  await accept(returns[0]); let reviewed = await accept(returns[1]); assert.notEqual(reviewed.editorState, 'complete');
  reviewed = await accept(returns[2]); assert.equal(reviewed.editorState, 'complete'); assert.equal(reviewed.approvedReturns.length, 3);
  await accept(returns[2]); assert.equal(await LibraryShoot.countDocuments(), 1);
  assert.equal(await StorageAsset.countDocuments({ shootId: reviewed.acceptedFolderId }), 3);
  const next = await commitLibraryAsset({ userId: owner._id, resource: { public_id: `veylo/users/${owner._id}/library/main-revision`, bytes: 1000, format: 'jpg' }, fields: { originalFilename: 'revision.jpg' }, limitBytes: 100000, collaborationId: job._id, sourceAssetId: ids()[0], variationId: 'main', variationName: 'Main edit' });
  reviewed = await LibraryCollaboration.findById(job._id);
  assert.deepEqual(latestAcceptedReturns(reviewed).sort(), returns.slice(1).map(asset => String(asset._id)).sort());
  assert.equal((await StorageAsset.findById(returns[0]._id)).folder, 'Editor returns');
  await accept(next.asset); assert.equal(await LibraryShoot.countDocuments(), 1);
  assert.equal(await StorageAsset.countDocuments({ shootId: reviewed.acceptedFolderId }), 3);
});

test('exactly, up-to and unlimited choices enforce count, duplicates, and membership', () => {
  const base = { assetIds: ids(), selectionRule: { mode: 'exactly', count: 2 } };
  assert.deepEqual(validateChoices(base, ids().slice(0, 2), { final: true }), ids().slice(0, 2));
  assert.throws(() => validateChoices(base, ids().slice(0, 1), { final: true }), /exactly 2/);
  assert.throws(() => validateChoices(base, ids()), /no more than 2/);
  assert.throws(() => validateChoices(base, [ids()[0], ids()[0]]), /duplicate/);
  assert.throws(() => validateChoices(base, [String(new mongoose.Types.ObjectId())]), /outside/);
  assert.throws(() => validateChoices({ ...base, selectionRule: { mode: 'up-to', count: 2 } }, [], { final: true }), /at least one/);
  assert.equal(validateChoices({ ...base, selectionRule: undefined }, ids(), { final: true }).length, 3);
  assert.equal(collaborationSchema.safeParse({ kind: 'preselection', title: 'Ada', assetIds: ids(), selectionRule: { mode: 'exactly', count: 4 } }).success, false);
});
test('creation rejects foreign files and replays one creation key', async () => {
  const foreign = await StorageAsset.create({ userId: other._id, publicId: `veylo/users/${other._id}/library/${crypto.randomUUID()}`, format: 'jpg', bytes: 1000 });
  assert.equal((await call(createLibraryCollaboration, { body: { kind: 'preselection', title: 'Ada', assetIds: [String(foreign._id)] } })).code, 400);
  const body = { kind: 'preselection', title: 'Ada', assetIds: ids(), creationKey: crypto.randomUUID(), selectionRule: { mode: 'up-to', count: 2 } };
  const [first, second] = await Promise.all([call(createLibraryCollaboration, { body }), call(createLibraryCollaboration, { body })]);
  assert.equal(String(first.body.data._id), String(second.body.data._id)); assert.equal(await LibraryCollaboration.countDocuments(), 1);
});
test('simultaneous draft writes have one winner and final submission checks its version', async () => {
  const job = await link();
  const body = { assetIds: ids().slice(0, 2), reviewedAssetIds: ids(), cursor: 3, revision: 1, version: 0 };
  const writes = await Promise.all([call(savePublicSelectionDraft, access(job, body)), call(savePublicSelectionDraft, access(job, { ...body, assetIds: [ids()[2]] }))]);
  assert.deepEqual(writes.map(value => value.code).sort(), [200, 409]);
  const saved = await LibraryCollaboration.findById(job._id);
  const choices = saved.selectionDraft.selectedAssetIds.map(String);
  assert.equal((await call(submitPublicPreselection, access(job, { assetIds: ids().slice(0, 2), revision: 1, version: 0 }))).code, 409);
  const final = { assetIds: ids().slice(0, 2), revision: 1, version: 1 };
  assert.equal((await call(submitPublicPreselection, access(job, final))).code, 200);
  assert.equal((await call(submitPublicPreselection, access(job, final))).body.data.replayed, true);
  assert.equal((await LibraryCollaboration.findById(job._id)).submissions.length, 1);
});
test('reopening keeps image IDs and submission history while rejecting an old revision', async () => {
  const job = await link({ status: 'submitted', selectedAssetIds: ids().slice(0, 2), submittedAt: new Date() });
  const opened = await call(reopenLibraryPreselection, { params: { id: String(job._id) }, body: { startOver: false } });
  assert.equal(opened.code, 200); assert.equal(opened.body.data.revision, 2); assert.equal(opened.body.data.submissions.length, 1);
  assert.equal(opened.body.data.selectionDraft.selectedAssetIds.length, 2);
  assert.equal((await call(savePublicSelectionDraft, access(job, { assetIds: [], reviewedAssetIds: [], cursor: 0, version: 0, revision: 1 }))).code, 409);
});
test('draft, expired and revoked links deny public content; owner resolution denies foreign IDs', async () => {
  for (const values of [{ status: 'draft' }, { status: 'revoked' }, { expiresAt: new Date(0) }]) assert.equal((await call(getPublicLibraryContent, access(await link(values)))).code, 410);
  assert.equal((await call(resolveLibraryPhotos, { body: { assetIds: [String(new mongoose.Types.ObjectId())] } })).code, 409);
  assert.deepEqual((await call(resolveLibraryPhotos, { body: { assetIds: ids().reverse() } })).body.data.map(photo => String(photo._id)), ids().reverse());
});
test('library confirmation is idempotent under a race and charges storage once', async () => {
  const signature = createStorageUploadSignature(owner._id, { contentType: 'image/jpeg' }); objects.set(signature.objectKey, true);
  const body = { objectKey: signature.objectKey, uploadToken: signature.uploadToken, originalFilename: 'new.jpg', folder: 'New shoot' };
  const outcomes = await Promise.all([call(confirmStorageAsset, { body }), call(confirmStorageAsset, { body })]);
  assert.ok(outcomes.every(item => item.code === 200 || item.code === 201), JSON.stringify(outcomes.map(item => item.body)));
  assert.equal(String(outcomes[0].body.data._id), String(outcomes[1].body.data._id));
  assert.equal((await User.findById(owner._id)).storageUsedBytes, 1000); assert.equal(await LibraryShoot.countDocuments({ name: 'New shoot' }), 1);
  assert.equal(objects.has(signature.objectKey), true);
});
test('editor grant cannot move a return to another source; returned versions retain review', async () => {
  const job = await link({ kind: 'editor-handoff' });
  const signed = await call(signPublicEditorUpload, access(job, { sourceAssetId: ids()[0], contentType: 'image/jpeg' }));
  assert.equal(signed.code, 200); const upload = signed.body.data; objects.set(upload.objectKey, true);
  const body = { objectKey: upload.objectKey, uploadToken: upload.uploadToken, editorGrant: upload.editorGrant, originalFilename: 'portrait-1-edit.jpg', sourceAssetId: ids()[1] };
  assert.equal((await call(confirmPublicEditorUpload, access(job, body))).code, 403);
  body.sourceAssetId = ids()[0];
  const [first, second] = await Promise.all([call(confirmPublicEditorUpload, access(job, body)), call(confirmPublicEditorUpload, access(job, body))]);
  assert.deepEqual([first.code, second.code].sort(), [200, 201], JSON.stringify([first.body, second.body]));
  const replay = await call(confirmPublicEditorUpload, access(job, body)); assert.equal(replay.code, 200);
  const updated = await LibraryCollaboration.findById(job._id); assert.equal(updated.returnedAssets.length, 1); assert.equal((await User.findById(owner._id)).storageUsedBytes, 1000); assert.ok(objects.has(upload.objectKey));
  const reviewed = await call(reviewEditorReturn, { params: { id: String(job._id), assetId: String(updated.returnedAssets[0].assetId) }, body: { status: 'changes-requested', note: 'Keep the original crop.' } });
  assert.equal(reviewed.code, 200); assert.equal(reviewed.body.data.editorState, 'changes-requested'); assert.equal(reviewed.body.data.returned[0].reviewNote, 'Keep the original crop.');
  assert.equal((await call(reviewEditorReturn, { user: { id: String(other._id) }, params: { id: String(job._id), assetId: String(updated.returnedAssets[0].assetId) }, body: { status: 'accepted' } })).code, 404);
});
test('approved delivery sources use only the latest accepted version of each source', () => {
  assert.deepEqual(latestAcceptedReturns({ returnedAssets: [{ sourceAssetId: 'one', assetId: 'old', reviewStatus: 'accepted' }, { sourceAssetId: 'one', assetId: 'new', reviewStatus: 'pending' }, { sourceAssetId: 'two', assetId: 'second', reviewStatus: 'accepted' }] }), ['second']);
});
test('server filters search beyond the first page and keeps accurate shoot counts', async () => {
  await StorageAsset.insertMany(Array.from({ length: 65 }, (_, index) => ({ userId: owner._id, publicId: `veylo/users/${owner._id}/library/${crypto.randomUUID()}`, originalFilename: index === 0 ? 'hidden-match.jpg' : 'more-' + index + '.jpg', format: 'jpg', bytes: 1000, folder: 'Older shoot', createdAt: new Date(1000 + index) })));
  const first = await call(listStorage); assert.equal(first.body.data.length, 60); assert.equal(first.body.hasMore, true); assert.equal(first.body.total, 68);
  const found = await call(listStorage, { query: { folder: 'Older shoot', search: 'hidden-match' } });
  assert.equal(found.body.total, 1); assert.equal(found.body.data[0].originalFilename, 'hidden-match.jpg'); assert.equal(found.body.shoots.find(shoot => shoot.name === 'Older shoot').count, 65);
});

test('revising changes the allowance, preserves submissions and invalidates access after a PIN change', async () => {
  const job = await link({ status: 'submitted', selectedAssetIds: ids().slice(0, 2), submittedAt: new Date() });
  const body = { kind: 'preselection', title: 'Ada - revised', assetIds: ids(), selectionRule: { mode: 'up-to', count: 1 }, status: 'active', revision: 1, pin: '123456' };
  const revised = await call(reviseLibraryPreselection, { params: { id: String(job._id) }, body });
  assert.equal(revised.code, 200, JSON.stringify(revised.body));
  const saved = await LibraryCollaboration.findById(job._id);
  assert.equal(saved.revision, 2); assert.equal(saved.selectionRule.count, 1);
  assert.equal(saved.selectionDraft.selectedAssetIds.length, 0); assert.equal(saved.submissions.length, 1);
  assert.equal(saved.accessVersion, 1);
  assert.equal((await call(getPublicLibraryContent, access(job))).code, 401);
  assert.equal((await call(reviseLibraryPreselection, { params: { id: String(job._id) }, body })).code, 409);
});

test('renewals keep the same object key and editor cleanup cannot delete a confirmed return', async () => {
  const signature = createStorageUploadSignature(owner._id, { contentType: 'image/jpeg' });
  assert.equal(renewStorageUploadSignature(owner._id, signature).objectKey, signature.objectKey);
  assert.throws(() => renewStorageUploadSignature(other._id, signature));
  const job = await link({ kind: 'editor-handoff' });
  const signed = await call(signPublicEditorUpload, access(job, { sourceAssetId: ids()[0], contentType: 'image/jpeg' }));
  const upload = signed.body.data;
  const body = { objectKey: upload.objectKey, uploadToken: upload.uploadToken, editorGrant: upload.editorGrant, sourceAssetId: ids()[0] };
  const renewed = await call(renewPublicEditorUpload, access(job, body));
  assert.equal(renewed.code, 200); assert.equal(renewed.body.data.objectKey, upload.objectKey);
  assert.equal((await call(renewPublicEditorUpload, access(job, { ...body, sourceAssetId: ids()[1] }))).code, 403);
  objects.set(upload.objectKey, true);
  assert.equal((await call(confirmPublicEditorUpload, access(job, { ...body, originalFilename: 'finished.jpg' }))).code, 201);
  assert.equal((await call(cleanupPublicEditorUpload, access(job, { objectKey: upload.objectKey, editorGrant: upload.editorGrant }))).code, 200);
  assert.ok(objects.has(upload.objectKey));
});

test('concurrent confirmations cannot overspend the last available storage', async () => {
  const outcomes = await Promise.allSettled(['a', 'b'].map(suffix => commitLibraryAsset({ userId: owner._id, resource: { public_id: `veylo/users/${owner._id}/library/${suffix}`, bytes: 1000, format: 'jpg' }, fields: { originalFilename: suffix + '.jpg' }, limitBytes: 1000 })));
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await User.findById(owner._id)).storageUsedBytes, 1000);
  assert.equal(await StorageAsset.countDocuments(), 4);
});

test('an explicitly accepted older edit can be delivered, and a new return requires review again', async () => {
  const returns = await StorageAsset.create([1, 2].map(index => ({ userId: owner._id, publicId: `veylo/users/${owner._id}/library/edit-${index}`, format: 'jpg', bytes: 1000 })));
  const job = await link({ kind: 'editor-handoff', assetIds: [photos[0]._id], returnedAssets: returns.map(asset => ({ sourceAssetId: photos[0]._id, assetId: asset._id })) });
  const reviewed = await saveEditorReview({ userId: owner._id, collaborationId: job._id, assetId: String(returns[0]._id), status: 'accepted', note: '' });
  assert.deepEqual(latestAcceptedReturns(reviewed), [String(returns[0]._id)]); assert.equal(reviewed.editorState, 'complete');
  await commitLibraryAsset({ userId: owner._id, resource: { public_id: `veylo/users/${owner._id}/library/edit-3`, bytes: 1000, format: 'jpg' }, fields: { originalFilename: 'edit-3.jpg' }, limitBytes: 10000, collaborationId: job._id, sourceAssetId: String(photos[0]._id) });
  const updated = await LibraryCollaboration.findById(job._id);
  assert.deepEqual(latestAcceptedReturns(updated), []); assert.equal(updated.returnedAssets.length, 3);
  assert.equal(updated.returnedAssets[0].reviewStatus, 'accepted');
});

test('migration is repeatable and preserves original keys, hashes, access and selected photographs', async () => {
  const job = await link({ status: 'submitted', selectedAssetIds: ids().slice(0, 2), pinDigest: 'retained-digest' });
  await LibraryCollaboration.collection.updateOne({ _id: job._id }, { $unset: { selectionRule: 1, revision: 1 } });
  const before = await StorageAsset.find().lean();
  const dry = await migrateLibraryWorkspaces();
  assert.equal(dry.applied, false); assert.equal(await LibraryShoot.countDocuments(), 0);
  await migrateLibraryWorkspaces({ apply: true }); await migrateLibraryWorkspaces({ apply: true });
  assert.equal(await LibraryShoot.countDocuments(), 1);
  const after = await StorageAsset.find().lean();
  assert.deepEqual(after.map(asset => [String(asset._id), asset.publicId, asset.contentHash]), before.map(asset => [String(asset._id), asset.publicId, asset.contentHash]));
  assert.ok(after.every(asset => asset.shootId));
  const saved = await LibraryCollaboration.findById(job._id).select('+pinDigest');
  assert.equal(saved.selectionRule.mode, 'unlimited'); assert.equal(saved.revision, 1); assert.equal(saved.pinDigest, 'retained-digest');
  assert.deepEqual(saved.selectedAssetIds.map(String), ids().slice(0, 2));
});

test('delivery imports replay safely and reject RAW previews and another photographer’s sources', async () => {
  const delivery = await Delivery.create({ userId: owner._id, clientName: 'Ada', brief: 'Ada birthday portraits', schemaVersion: 3, v3: { revision: 1 } });
  const request = { params: { id: String(delivery._id) }, body: { assetIds: ids().slice(0, 2) } };
  assert.equal((await call(addLibraryAssets, request)).code, 201);
  const replay = await call(addLibraryAssets, request);
  assert.equal(replay.code, 200); assert.equal(replay.body.replayed, true);
  assert.ok(replay.body.data.every(asset => !verifyMediaWorkerToken(new URL(asset.url).pathname.split('/').at(-1)).access), 'Replayed owner previews must not use array positions as access grants');
  const saved = await Delivery.findById(delivery._id);
  assert.equal(saved.assets.length, 2); assert.deepEqual(saved.assets.map(asset => String(asset.librarySourceId)), ids().slice(0, 2));
  assert.ok(saved.assets.every(asset => objects.has(asset.publicId)));
  await StorageAsset.updateOne({ _id: photos[2]._id }, { $set: { rawPublicId: photos[2].publicId + '-raw', rawBytes: 100 } });
  assert.equal((await call(addLibraryAssets, { ...request, body: { assetIds: [ids()[2]] } })).code, 400);
  assert.equal((await call(addLibraryAssets, { ...request, body: { assetIds: [String(new mongoose.Types.ObjectId())] } })).code, 403);
});

test('a partially failed delivery copy removes unfinished copies and keeps every library original', async () => {
  const delivery = await Delivery.create({ userId: owner._id, clientName: 'Ada', brief: 'Ada birthday portraits', schemaVersion: 3, v3: { revision: 1 } });
  failedCopySource = photos[1].publicId;
  assert.equal((await call(addLibraryAssets, { params: { id: String(delivery._id) }, body: { assetIds: ids() } })).code, 502);
  assert.equal((await Delivery.findById(delivery._id)).assets.length, 0);
  assert.deepEqual([...objects.keys()].sort(), photos.map(photo => photo.publicId).sort());
});
