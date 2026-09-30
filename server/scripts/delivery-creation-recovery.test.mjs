import assert from 'node:assert/strict';
import test from 'node:test';
import Delivery from '../src/models/Delivery.js';
import DeliveryJob from '../src/models/DeliveryJob.js';
import User from '../src/models/User.js';
import { cloudinary } from '../src/services/cloudinary.service.js';
import { v3Details, v3Prepare, v3Publish } from '../src/controllers/deliveryV3.controller.js';
import { recoverDeliveryUpload } from '../src/controllers/delivery.controller.js';

Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'offline-cloud', CLOUDINARY_API_KEY: 'offline-key', CLOUDINARY_API_SECRET: 'offline-secret' });
const id = '507f1f77bcf86cd799439011', owner = '507f1f77bcf86cd799439012';
const req = body => ({ params: { id }, user: { id: owner }, body });
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
function owned(t, delivery) {
  t.mock.method(Delivery, 'findOne', query => {
    assert.equal(String(query._id), id); assert.equal(String(query.userId), owner);
    return { select() { return this; }, then(resolve, reject) { return Promise.resolve(delivery).then(resolve, reject); } };
  });
}

test('retrying a successfully published delivery returns the same link without reserving another quota slot', async t => {
  owned(t, { _id: id, status: 'published', publicId: 'private-link', access: { pinDigest: 'private-digest' } });
  t.mock.method(User, 'findById', () => { throw new Error('Must not reserve again'); });
  t.mock.method(DeliveryJob, 'exists', () => { throw new Error('Already published'); });
  t.mock.method(Delivery, 'findOneAndUpdate', () => { throw new Error('Must not publish again'); });
  const res = response(); await v3Publish(req({}), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.publicId, 'private-link');
  assert.match(res.body.data.url, /\/d\/private-link$/);
  assert.doesNotMatch(JSON.stringify(res.body), /private-digest/);
  assert.equal(User.findById.mock.callCount(), 0);
});

test('retrying analysis after a lost response resumes the existing running job', async t => {
  const job = { _id: 'job-one', type: 'v3-prepare', status: 'running' };
  owned(t, { _id: id, kind: 'showcase', status: 'analyzing', format: 'photo-story', assets: Array.from({ length: 5 }, (_, index) => ({ assetId: 'photo-' + index })) });
  t.mock.method(DeliveryJob, 'findOne', async () => job);
  t.mock.method(DeliveryJob, 'create', () => { throw new Error('Must not duplicate the job'); });
  const res = response(); await v3Prepare(req({}), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.data, job);
  assert.equal(DeliveryJob.create.mock.callCount(), 0);
});

test('an expiry that passed while the draft was open is rejected before publishing or reserving quota', async t => {
  owned(t, { _id: id, status: 'review', reviewApprovedAt: new Date(), v3: { revision: 2, approvedRevision: 2 }, access: { expiresAt: new Date(Date.now() - 60000) } });
  t.mock.method(User, 'findById', () => { throw new Error('Must not reserve for an expired link'); });
  t.mock.method(Delivery, 'findOneAndUpdate', () => { throw new Error('Must not publish an expired link'); });
  const res = response(); await v3Publish(req({}), res);
  assert.equal(res.statusCode, 400); assert.equal(res.body.code, 'V3_EXPIRY_IN_PAST');
  assert.match(res.body.message, /access settings/);
  assert.equal(User.findById.mock.callCount(), 0); assert.equal(Delivery.findOneAndUpdate.mock.callCount(), 0);
});

test('upload recovery recognises a confirmed photograph even when the account is at its photo limit', async t => {
  const uploadId = '00000000-0000-4000-8000-000000000001';
  const asset = { assetId: uploadId, uploadId, publicId: 'private/photograph', originalFilename: 'birthday.jpg', format: 'jpg' };
  owned(t, { _id: id, status: 'draft', assets: [asset, ...Array.from({ length: 99 }, (_, index) => ({ assetId: 'photo-' + index }))] });
  t.mock.method(User, 'findById', () => { throw new Error('Must not reject an already confirmed file at quota'); });
  t.mock.method(cloudinary.api, 'resource', () => { throw new Error('Must not re-upload or fetch the original'); });
  const res = response(); await recoverDeliveryUpload(req({ uploadId }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.asset.assetId, uploadId);
  assert.equal(User.findById.mock.callCount(), 0);
  assert.equal(cloudinary.api.resource.mock.callCount(), 0);
});

test('editing a GridBoard title keeps that title through later board generation and invalidates its old approval', async t => {
  const doc = { _id: id, kind: 'pinboard', status: 'review', clientName: 'Convennant', brief: 'GridBoard delivery', shootType: '', title: 'Old title', pinboard: { title: 'Old title', layouts: [{ id: 'balanced' }] }, assets: [{ assetId: 'one' }], collectionAnalysis: { complete: true }, reviewApprovedAt: new Date(), v3: { revision: 4, approvedRevision: 4, clarificationAnswers: [] }, markModified() {}, async save() {} };
  owned(t, doc);
  const res = response(); await v3Details(req({ kind: 'pinboard', clientName: 'Convennant', title: 'New birthday title' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(doc.title, 'New birthday title'); assert.equal(doc.pinboard.title, doc.title);
  assert.equal(doc.pinboard.layouts.length, 1); assert.equal(doc.assets.length, 1);
  assert.equal(doc.collectionAnalysis.complete, true);
  assert.equal(doc.v3.approvedRevision, null); assert.equal(doc.v3.revision, 5);
});
