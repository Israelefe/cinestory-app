# Unified Pro billing rollout

Updated 6 October 2026. The app uses one NGN 40,000 monthly Pro price and no longer selects prices by visitor country. Code and isolated tests are updated locally; no deployment, Paystack plan change, charge, cancellation, refund, or email was performed here.

## Price and customer experience

| Customer | New monthly subscription | Charge currency |
| --- | --- | --- |
| Everyone | ₦40,000 | NGN |

The server checks the fixed price quote before creating a payment; the client cannot submit its own amount. Country is not requested or used to set the price. A card issuer may convert the NGN charge and add fees.

International-card enablement supports this NGN approach. The card issuer converts the charge into its own currency and may charge fees. USD activation and a USD payout account are not needed for the selected NGN prices. Acceptance of a particular card and recurring authorization still depends on Paystack and the issuer. [Paystack international payments](https://support.paystack.com/en/articles/2130690).

## Provider and hosting setup

1. Create or select one NGN 40,000 monthly Paystack plan in the same account and mode as the server secret. Set its code as `PAYSTACK_PRO_PLAN_CODE`. The server validates its ID, amount, currency and monthly interval before checkout. Test and live plan codes must match their respective key. `PAYSTACK_INTERNATIONAL_PLAN_CODE` is no longer used.
2. Existing subscribers may still be attached to the old NGN 25,000 and NGN 30,000 plans. To move their renewals to the single price, notify subscribers first, deploy this code, then update each old plan in Paystack with `PUT /plan/{code}` and `{ "amount": 4000000, "currency": "NGN", "update_existing_subscriptions": true }`. Paystack documents that this option applies plan changes to existing subscriptions ([Plan API](https://paystack.com/docs/api/plan/)). Confirm the updated amount and affected subscription count in Paystack. Keep old plan records available while subscriptions still reference them. The app accepts a renewal at ₦40,000 from an old plan only after Paystack confirms that plan code and stored plan ID now identify a monthly NGN 40,000 plan. Historical payment records keep their original amounts.
3. Preserve the existing `BILLING_ENCRYPTION_KEY`. It must contain at least 32 characters and is needed to decrypt existing subscription tokens, unfinished events and email retries. Do not regenerate it on deployment.
4. Set the same `VEYLO_EDGE_KEY` in Render and the Cloudflare Pages/Worker production environment. It lets the API trust the visitor IP for security rate limits. The proxy no longer forwards a visitor country for billing.
5. Keep browser API requests on the site's `/api` origin. Bypass Cloudflare caching for `/api/v1/billing/*`; the origin sends `no-store` for plans and private billing status.
6. Configure Paystack's webhook as `https://veylo.com.ng/api/v1/webhooks/paystack`. It requires the exact raw body and a valid Paystack signature. Ensure the proxy forwards it unchanged. Set `PAYSTACK_CALLBACK_URL=https://veylo.com.ng/billing` and the existing production `CLIENT_URL`.
7. Configure a verified Resend sender through `RESEND_FROM_EMAIL` and `RESEND_API_KEY`. Create or confirm that `payment@veylo.com.ng` receives mail. Billing messages use that address as Reply-To; application code does not provision a mailbox.
8. Keep the API process running: `startBillingWorker()` retries billing work every minute. `BILLING_ENABLED=true`, the Pro plan code, Paystack secret and encryption key are required for provider recovery. `BILLING_ENABLED=false` pauses new checkout and provider recovery; Paystack itself continues existing schedules, and signed webhooks can still update local records. Disabling checkout is not cancellation.

## Existing-record audit and migration

Take a database backup and pause new checkout while reviewing existing records. Run these commands from `server` against the intended staging database first:

```powershell
npm.cmd run billing:audit
```

The default is read-only and makes no Paystack calls. Output contains counts, record IDs and reasons, not customer emails or tokens. Review every reported issue. The script reports duplicate schedules, unresolved checkouts, missing provider links or paid-through dates, unsupported prices, unsupported stored Pro labels, and legacy refund aggregates.

After reviewing the dry run and backup, the operator can apply local record backfills and create the new ledger indexes:

```powershell
npm.cmd run billing:migrate
```

The migration preserves recorded payment amounts. Legacy NGN subscriptions without an amount use the original ₦25,000 contract, or a recorded paid amount where available. It recognises the current ₦40,000 price and the two earlier NGN prices. It recovers provider numeric IDs from stored evidence, adds paid-period metadata where supported, encrypts legacy management tokens and unfinished event payloads, and redacts credentials from snapshots. It does not create support grants, cancel schedules, invent refund IDs, change provider plans, or manufacture policy acceptance for old checkouts. Repeat application is safe; a failed run may leave completed backfills and should be rerun after correcting its cause.

Resolve these issues before enabling new checkout:

- Confirm unresolved payments with Paystack; age alone does not prove that a charge failed. A durable pending attempt blocks a second checkout until the original outcome is known. An orphaned subscription with no payment record can expire because provider initialization only occurs after the payment is saved.
- Review duplicate or missing provider links in Paystack. Known local schedules are all stopped on cancellation; schedules never linked to the local account need provider review. Numeric customer IDs are required for provider-list recovery.
- Review legacy refunds individually using their provider IDs. Old aggregate totals alone do not identify whether a request completed. The event handler refreshes the provider refund list before replacing an older refund aggregate.
- Review unsupported stored Pro labels and missing paid dates. Paid access now requires a valid paid period, three-day renewal grace, or explicit support grant. Do not extend access from a schedule's next-payment date alone.
- Historical usage already deleted before this release cannot be reconstructed reliably. Support should review such refund requests manually; no missing evidence is invented.

## Cancellation, refunds and retained records

Cancellation stops every linked recurring schedule, including an older schedule still active at Paystack. It keeps access through remaining paid time, records provider confirmation, and returns pending status if a provider call fails. Recovery retries pending cancellation. Resume requires a remaining paid period and a resumable provider schedule. Deletion and suspension stop renewals before completing; a pending charge or ambiguous schedule blocks the account operation with an explanation.

The public policy is `/refund-policy`, linked from pricing, Billing and the footer. A discretionary change-of-mind refund requires a request within seven days of the first payment, no published client delivery during that period and no paid storage or Portfolio use. Deletion does not reset recorded usage. Normal used periods, renewals and prorated cancellations are not routinely refunded. Duplicate charges, charges after confirmed cancellation, no paid access and material failures remain reviewable regardless of usage; applicable consumer remedies are preserved. [FCCPC consumer rights](https://fccpc.gov.ng/consumers/consumer-rights-responsibilities/rights-responsibilities/).

Finance staff review usage evidence and record an approval reason before requesting a refund. A durable request key prevents repeat submissions after an uncertain provider response. Refund completion is reconciled by provider refund ID, including documented notifications whose refund reference is null. Refunding an older payment does not remove access from a newer period. Cancellation is a separate explicit choice. Paystack completion does not guarantee immediate bank credit. [Paystack refunds](https://paystack.com/docs/payments/refunds/).

Account deletion removes product data and keeps a restricted financial and usage ledger for six years after deletion under the published operational retention policy. This duration is a product retention choice, not a claim that all records must legally be kept for six years. Management credentials and provider snapshots are removed; encrypted unfinished events remain only for recovery, then are cleared. The worker purges expired deleted-account ledger records even when provider billing is disabled.

## Validation before live enablement

Run the local checks:

```powershell
# From server
npm.cmd run verify:billing
npm.cmd run verify:syntax
npm.cmd run verify:billing-admin
npm.cmd run verify:email-system
npm.cmd run verify:admin-account-delete
npm.cmd run verify:client-ip
# From client
npx.cmd playwright test tests/billing.spec.js
npm.cmd run build
# From admin
npm.cmd run build
```

Backend tests use an isolated in-memory database and mocked Paystack/Resend. Browser tests mock API responses and check the single price, returned payments, retries, cancellation failures, refund copy and keyboard/reduced-motion layouts at 320, 390, 768, 834, 1024 and 1440 pixels, including a short landscape viewport. Delivery and Portfolio regression tests also pass after the entitlement and deletion changes. Builds have the existing large-chunk warnings.

Before live enablement, exercise the single NGN plan through the deployed trusted edge using Paystack test mode; check checkout from Nigeria and outside Nigeria, actual recurring renewal (including an updated legacy plan) and failed renewal, cancellation confirmation, a refund through to bank/provider status, and email receipt/Reply-To delivery. Check the deployed API pricing cache headers. Real foreign-card acceptance, bank conversion, settlements and mailbox delivery were not verified locally.

Finance reports use stored prices for recurring revenue, disclose capped tables and exports, compare provider transactions in both directions, and distinguish recorded fees from actual bank settlement. Inspect failed events, cancellation-pending issues and uncertain refunds after rollout. The worker has bounded batches and account leases; monitoring and support review are still needed for prolonged provider/database outages or ambiguous historical data.
