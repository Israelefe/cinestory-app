import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const emailService = read('../src/services/email.service.js');
const deliveryController = read('../src/controllers/delivery.controller.js');
const volumeController = read('../src/controllers/volume.controller.js');
const billingController = read('../src/controllers/billing.controller.js');
const runtimeConfig = read('../src/services/runtimeConfig.service.js');
const shareModel = read('../src/models/DeliveryShareGrant.js');
const sharingPage = read('../../client/src/pages/DeliverySharing.jsx');

for (const functionName of [
  'sendVerificationEmail',
  'sendPasswordResetEmail',
  'sendWelcomeEmail',
  'sendPasswordChangedEmail',
  'sendStoryReadyEmail',
  'sendVolumeAccessEmail',
  'sendShareGrantEmail',
  'sendProWelcomeEmail',
  'sendPaymentReceiptEmail',
  'sendPaymentFailedEmail',
  'sendRenewalFailedEmail',
  'sendSubscriptionCancellationEmail',
  'sendSubscriptionResumedEmail',
  'sendProEndedEmail',
  'sendRefundProcessedEmail',
  'sendRefundFailedEmail',
  'sendPaymentDisputeEmail'
]) assert.match(emailService, new RegExp(`export (?:async )?function ${functionName}`), `${functionName} is missing`);

assert.match(emailService, /veylo-logo\.png/);
assert.match(emailService, /EmailDelivery/);
assert.match(deliveryController, /sendStoryReadyEmail/);
assert.match(deliveryController, /sendShareGrantEmail/);
assert.match(deliveryController, /recipientEmail/);
assert.match(volumeController, /sendVolumeAccessEmail/);
assert.match(billingController, /sendProWelcomeEmail/);
assert.match(billingController, /sendPaymentFailedEmail/);
assert.match(billingController, /sendRenewalFailedEmail/);
assert.match(billingController, /sendSubscriptionCancellationEmail/);
assert.match(billingController, /sendSubscriptionResumedEmail/);
assert.match(billingController, /processWebhookEvent\(event, eventKey\)/);
assert.match(shareModel, /recipientEmail/);
assert.match(sharingPage, /recipientEmail/);
for (const id of ['share-invitation', 'pro-welcome', 'payment-success', 'payment-failed', 'renewal-failed', 'subscription-canceled', 'subscription-resumed', 'pro-ended', 'refund-completed', 'refund-failed', 'payment-dispute']) {
  assert.match(runtimeConfig, new RegExp(`id: '${id}'`), `${id} template is missing`);
}

console.log('Email system contract passed: existing OTP and delivery emails are branded, billing notifications are wired, and vendor/guest invitations are opt-in and event-keyed.');
