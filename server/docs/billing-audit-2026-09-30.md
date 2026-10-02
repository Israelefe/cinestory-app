# Veylo payment and subscription audit

Initial audit: 30 September 2026. Implementation update: 1 October 2026.

This report covers checkout, payment verification, Paystack webhooks, renewals, cancellation, refunds, access to paid features, account suspension and deletion, payment emails, customer billing screens, finance reports, and international pricing.

The audit did not initiate a real checkout, charge, cancellation, refund, email, or database update. Reproductions used the application's exported functions with in-memory database and provider mocks. Findings described as code review were not exercised against a live Paystack account. Production settings, actual provider events, mailbox delivery, settlements, and foreign-card acceptance remain unverified.

The owner approved implementation. The numbered findings below describe the original pre-change behavior, not the current implementation. Fixes, regression coverage and rollout requirements are recorded below and in [billing-rollout.md](billing-rollout.md). Other work continues in the shared workspace; unrelated changes were preserved.

## What already exists

- A server-controlled NGN price of 2,500,000 kobo, or N25,000 monthly, with configured-plan validation.
- Hosted Paystack checkout, customer-owned payment-reference verification, payment records, and receipts.
- Authentication, verified-email checks, session-bound CSRF checks, and rate limiting on customer billing actions.
- A webhook route that reads the original bytes and checks Paystack's HMAC signature with a timing-safe comparison.
- An encrypted subscription management token field.
- Cancel, resume, and payment-method management endpoints, plus a cancellation button and dialog in Billing.
- Finance-role restrictions on issuing refunds, a pending-refund reservation, and administrative audit records.
- Paid-through dates, a three-day failed-payment grace period, and a retention worker.

These are useful safeguards. The failures below concern how they interact and recover when events repeat, arrive late, or fail halfway through.

## Priority: payment correctness

### 1. Re-verification overwrites refunded and canceled states

**High — reproduced.** `verifyCheckout` accepts a locally refunded payment if the mocked provider verification reports success. `activateSubscription` then writes the payment back to `success`, the subscription to `active`, and clears `cancelRequestedAt`. The same path erases cancellation on an already processed successful payment. A recent payment still grants Pro afterward.

Location: `server/src/controllers/billing.controller.js`, `verifyCheckout` and `activateSubscription`.

Impact: refunded access can be restored, cancellation information can disappear, and the UI can claim renewal is active even though Paystack has disabled it. Replaying an older payment can also move the paid-through date backward.

Fix: make fulfillment idempotent by payment identity. Preserve refund, dispute, and cancellation state; never let an older cycle replace a newer cycle. Successful verification should return current billing state when that payment has already been fulfilled.

### 2. Failed webhook retries are acknowledged without processing

**High — reproduced.** A duplicate `BillingEvent.eventKey` immediately returns HTTP 200. The handler does not inspect whether the original event is `failed`, unfinished, or processed. A failure after creating the event can therefore become permanent when Paystack retries.

Location: `server/src/controllers/billing.controller.js`, `paystackWebhook`.

Impact: a customer can pay without receiving access, or a cancellation/refund can fail to update locally.

Fix: claim events with a processing lease, retry failed or abandoned work, and acknowledge completed duplicates safely. Add a repair/replay path and alert on events that need intervention.

### 3. Documented refund references are not recognized

**High — reproduced using the documented reference field.** The refund branches read `data.transaction.reference` or `data.reference`. Paystack's refund documentation shows `data.transaction_reference`. A signed refund completion using that field is marked ignored without even looking up the payment.

Location: `server/src/controllers/billing.controller.js`, `refund.failed` and `refund.processed`.

Impact: completed refunds can remain pending in Veylo, further refunds can stay blocked, access changes can be missed, and customers may receive no confirmation.

Fix: normalize documented refund payloads, correlate them to a durable refund record, and verify ambiguous results with Paystack.

Source: [Paystack refunds](https://paystack.com/docs/payments/refunds/).

### 4. Multiple checkout requests create separate subscriptions

**High — reproduced.** Two simultaneous requests for one Free account both return 201, initialize separate provider checkouts, and create separate local subscriptions. No account-level pending-checkout reservation prevents this.

Location: `server/src/controllers/billing.controller.js`, `startCheckout`; `server/src/models/Subscription.js`.

Impact: completing both checkouts can create two recurring charges for one account. Disabling one subscription does not necessarily stop the other.

Fix: reserve one checkout attempt per account and plan, reuse an unexpired attempt, and enforce the reservation atomically. Define how abandoned attempts expire before permitting another.

### 5. Failed-renewal recovery can leave the old recurring subscription running

**High — code review.** A `past_due` account may start a new checkout without disabling or replacing the old provider subscription. Paystack says it does not retry the same failed charge, but its `attention` status can still charge on the next payment date.

Location: `server/src/controllers/billing.controller.js`, `startCheckout` and `invoice.payment_failed`; `client/src/pages/BillingPage.jsx`.

Impact: a customer renewing manually can acquire a second recurring subscription while the old one remains scheduled.

Fix: explicitly recover or replace the existing provider subscription. Verify that the old schedule is stopped before treating a replacement as complete. Explain the recovery behavior accurately in Billing and Terms.

Source: [Paystack subscription lifecycle and statuses](https://paystack.com/docs/payments/subscriptions/).

### 6. Events can be attached to the wrong subscription or product

**High — unrelated-plan activation reproduced; other branches reviewed.** When exact lookup fails, `findSubscription` falls back to the customer's newest local subscription. `activateSubscription` checks the amount and NGN currency but does not require a known Veylo checkout or the configured provider plan. An isolated signed event for an unrelated plan and unknown Veylo reference activated Pro.

Location: `server/src/controllers/billing.controller.js`, `userFromPaystackData`, `findSubscription`, and `activateSubscription`.

Impact: unrelated charges, old subscriptions, or late events can change the wrong subscription. Matching a customer's email is insufficient to establish which product or paid period an event belongs to.

Fix: bind checkout, provider customer, plan, subscription, reference, environment, and account identity explicitly. Reject or quarantine unmatched events instead of selecting the newest record.

### 7. Provider initialization happens before durable local checkout records exist

**High — code review.** The provider checkout is initialized before the local subscription and payment are created. Those two database writes are also separate.

Location: `server/src/controllers/billing.controller.js`, `startCheckout`.

Impact: a failure can leave a provider checkout without its local payment record. Returning customers may be unable to verify it, and webhook mapping becomes dependent on unsafe fallbacks.

Fix: create a durable attempt first, initialize using its fixed reference, and record each stage. Recover uncertain provider responses without generating another independent payment attempt.

### 8. Subscription updates do not account for event ordering

**High — code review; old-payment rollback reproduced.** Success, failure, cancellation, and dispute handlers overwrite state without checking the event's paid period against the latest applied period. Grace is based on the time the failure is processed rather than a durable first failure for that invoice.

Location: `server/src/controllers/billing.controller.js`, `activateSubscription` and `processWebhookEvent`.

Impact: a delayed failure can override a newer successful renewal, an old success can erase cancellation, and late failures can grant an inappropriate new grace period.

Fix: track provider event identities, invoice periods, and the latest successful paid period. Anchor grace to the relevant invoice and apply lifecycle transitions only when they are current.

### 9. Refund tracking is incomplete and not idempotent by refund identity

**High — code review.** Refund completion adds the received amount to a payment total, with deduplication based only on the raw webhook body hash. There is no durable refund entity keyed by provider refund identity. Missing amounts fall back to the entire payment amount. `refund.pending`, `refund.processing`, and `refund.needs-attention` are not handled.

Location: `server/src/controllers/billing.controller.js`, refund event branches; `server/src/controllers/admin.controller.js`, `refundPayment`; `server/src/models/Payment.js`.

Impact: differently serialized deliveries of the same business event can be counted twice. A malformed or incomplete event can be treated as a full refund. Requests requiring customer bank details can stay blocked without a clear resolution path.

Fix: store individual refund requests, amounts, currency, provider identity, and status transitions. Validate amounts and apply each completion once. Reconcile pending and uncertain requests, including timeouts after the provider may already have accepted a refund.

### 10. Refunding an older payment can remove access paid for by a newer renewal

**High — reproduced.** A full refund sets the connected subscription to `refunded` even when `lastPaymentReference` is a newer successful payment. The admin refund path also assumes that a full refund should stop that subscription's renewals.

Location: `server/src/controllers/billing.controller.js`, `refund.processed`; `server/src/controllers/admin.controller.js`, `refundPayment`.

Impact: correcting an old duplicate charge can cancel a customer's current paid service.

Fix: apply refunds to the paid period being refunded. Separate refunding a transaction, revoking that period's access, and canceling future renewal into explicit decisions.

### 11. Failed, reversed, and abandoned payments are not reliably reconciled

**High — code review.** Initial failures rely on a `charge.failed` webhook branch. Paystack's verification documentation says transaction webhooks are sent for successful payments; verification is needed to distinguish failed, abandoned, pending, processing, and reversed transactions. No automatic reconciliation of stale initial attempts was found.

Location: `server/src/controllers/billing.controller.js`, `charge.failed` and `verifyCheckout`; `server/src/services/retention.service.js`.

Impact: customers can see pending payments indefinitely, failure emails may never be triggered, and staff may be unsure whether a customer should pay again.

Fix: re-query stale attempts with bounded retries, preserve provider transaction statuses, and give customers a clear pending/failed/confirmed response without encouraging duplicate payment.

Source: [Paystack payment verification](https://paystack.com/docs/payments/verify-payments/).

## Priority: customer access and account handling

### 12. Cancellation is implemented, but the displayed controls can be wrong

**High — code review.** Billing hides Cancel during `past_due`, although the backend supports cancellation in that state. The displayed subscription is the newest local record; cancellation targets the newest record with a provider subscription code. A pending replacement can therefore hide controls for an older paid subscription. Missing management tokens do not have a reliable recovery path.

Location: `client/src/pages/BillingPage.jsx`; `server/src/services/entitlement.service.js`; `server/src/controllers/billing.controller.js`, `currentPaystackSubscription` and subscription action endpoints.

Fix: derive one authoritative billing summary, including all relevant renewal schedules and explicit capabilities. Support cancellation during payment problems, show the exact paid-through date, recover provider management details, and make repeat cancellation safe.

### 13. Verification, cancellation, and resume responses erase billing-page data

**Medium — code review.** `/status` includes `payments` and `billingAvailable`. Action endpoints return only entitlements. The frontend replaces the entire billing object with the smaller response.

Location: `client/src/pages/BillingPage.jsx`, `setData` calls; `server/src/controllers/billing.controller.js`, action responses.

Impact: payment history disappears, online billing can incorrectly appear unavailable, and subsequent checkout controls can become disabled until reload.

Fix: return a consistent billing response after every action or reload/merge the complete billing summary.

### 14. The payment-return effect can discard verification results

**Medium — code review; browser reproduction still required.** The effect stores a reference before starting its request. Cleanup marks the request inactive, and a subsequent effect for the same reference exits early. React StrictMode is enabled in the client. Re-renders that restart this effect can also discard a pending result. There is no same-reference retry control after a verification error.

Location: `client/src/pages/BillingPage.jsx`, verification effect; `client/src/main.jsx`; `client/src/App.jsx`, `handlePlanChanged`.

Impact: the page can keep displaying verification in progress or ignore confirmation after the customer has paid.

Fix: use a resilient request lifecycle, a stable callback, a consistent refresh after success, and an explicit safe retry. Test development StrictMode and production navigation/unmount behavior.

### 15. Suspension blocks billing access while provider renewal stays enabled

**High — code review.** Suspending a user revokes sessions. Customer authentication then rejects that account, including Billing. No provider cancellation accompanies suspension.

Location: `server/src/controllers/admin.controller.js`, `updateAccountStatus`; `server/src/middleware/auth.middleware.js`.

Impact: a customer can lose the service and the ability to cancel through Veylo while still being charged.

Fix: make the billing consequence of suspension explicit. Stop further renewal where service is withdrawn, preserve a safe support/cancellation route, and require a documented staff decision for any exception.

### 16. Account deletion can miss provider schedules and removes refund evidence

**High — code review.** Deletion attempts to disable locally known active, canceling, and past-due subscriptions, which is a useful safeguard. It excludes locally expired subscriptions that may still renew at Paystack, pending checkout attempts, and subscriptions whose code has not arrived yet. It then deletes payments, billing events, and support tickets.

Location: `server/src/services/accountDeletion.service.js`, `cancelActiveSubscriptions` and `deleteOwnedRecords`.

Impact: a late checkout completion or a provider schedule missed locally can charge an account that no longer exists. Deleting the payment ledger also removes evidence needed for refund and dispute resolution and changes historical finance totals.

Fix: prevent new checkout during deletion, reconcile pending attempts and all provider schedules, and retain the minimum financial records required for the agreed legal retention period. Update the privacy policy to explain retained billing records and restrict access to them. Do not retain unrelated photography data for this purpose.

### 17. Expiry handling and billing summaries still need a common source of truth

**Medium — current code reviewed.** The original customer entitlement implementation trusted `User.plan` even after a paid period expired. A separate workspace change landed during the audit, and an isolated recheck confirmed that expired recorded subscriptions now produce Free access. However, the retention worker still scans only past-due/canceling expiry, the newest-record summary can differ from the qualifying subscription, and accounts without subscription records still have a legacy plan fallback.

Location: `server/src/services/entitlement.service.js`; `server/src/services/billingEntitlement.service.js`; `server/src/services/retention.service.js`.

Fix: consolidate entitlement rules, document legitimate legacy grants, reconcile stale active records, and keep dashboard, Billing, storage, portfolio, and client branding consistent. Expiry must remain correct even when a scheduled worker is delayed.

### 18. Cancellation wording and dialog behavior need improvement

**Medium — code review; visual testing pending.** The UI says month end instead of displaying the billing anniversary precisely. It hardcodes 30-day retention while the backend retention duration is configurable. The dialog has no explicit focus trap, Escape handling, focus restoration, or viewport-height scrolling limit.

Location: `client/src/pages/BillingPage.jsx`; `client/src/styles/public.css`, billing rules; `client/src/pages/TermsOfService.jsx`.

Fix: show the exact access-end date and actual retention duration. Ensure accessible, spacious controls at 320px, 768px, 834px, tablet landscape heights, and desktop, with reduced-motion support.

## Priority: owner reporting, support, and security

### 19. USD support requires changes throughout the billing system

**High if USD is enabled — code review.** NGN and N25,000 are enforced in checkout, provider-plan validation, customer and admin verification, activation, refund submission, emails, public pricing, and customer/admin money formatting. Subscription records do not contain a durable amount/currency pricing snapshot. Finance totals combine amounts without grouping by currency.

Location: `server/src/config/plans.js`; `server/src/services/paystack.service.js`; billing/admin controllers; Payment/Subscription models; `server/src/services/email.service.js`; `client/src/pages/BillingPage.jsx`; `client/src/pages/PricingPage.jsx`; `client/src/components/PublicDesign.jsx`; `admin/src/pages/AdminDashboardPage.jsx`.

Impact: adding only a $20 label or a USD checkout option would not deliver correct activation, refunds, receipts, or accounts.

Fix: if USD is chosen, introduce server-approved NGN/USD prices and separate monthly Paystack plan codes. Store integer minor units and currency on each attempt, paid period, payment, and refund. Preserve existing NGN records. Validate against the stored price, refund in the original currency, and report currencies separately.

### 20. Finance reconciliation is incomplete but reports completion

**Medium — code review.** Reconciliation fetches only the first 100 transactions and compares references and amount. It does not paginate, compare currency/status, reconcile subscriptions/refunds, or flag all local payments missing at the provider. Exports are capped at 10,000 rows without a clear truncation notice.

Location: `server/src/controllers/admin.controller.js`, `reconcileFinanceWithPaystack` and `exportFinance`.

Fix: paginate, compare amount/currency/status in both directions, account for refunds and provider schedules, and disclose any scan/export limits. Distinguish a partial scan from complete reconciliation.

### 21. Revenue and receipt reports can mislead the owner

**Medium — code review.** Monthly recurring revenue counts canceling subscriptions as renewing revenue and multiplies all by the NGN price. Net collected subtracts refunds but does not account for Paystack fees or settlement adjustments. Some finance event totals are derived from a capped list rather than the full matching set.

Location: `server/src/controllers/admin.controller.js`, `getAnalytics` and `getFinanceOverview`.

Fix: separate paid access from subscriptions due to renew; report gross sales, refunds, fees, and settled payouts distinctly. Keep currencies separate and disclose what every metric measures.

### 22. Sensitive management tokens have unencrypted copies

**High — plaintext snapshot copy reproduced.** The dedicated email-token field is encrypted, but `safeSnapshot` removes only top-level authorization. Top-level/nested email tokens remain in provider snapshots. `BillingEvent.payload` also stores the original provider payload unencrypted. `select: false` controls query output; it does not encrypt stored data.

Location: `server/src/controllers/billing.controller.js`, `safeSnapshot` and event creation; Subscription/Payment/BillingEvent models.

Fix: redact credentials recursively from ordinary snapshots. Encrypt any sensitive event data genuinely needed for replay, restrict access, and set an appropriate retention policy. Validate encryption configuration before accepting billing traffic. No Paystack-secret references or live-key patterns were found in the inspected client/admin source directories.

### 23. Webhook database failures and admin request protection need hardening

**Medium — code review; exploit testing not performed.** A non-duplicate error creating a BillingEvent is thrown outside the webhook processing catch. Express 4 does not automatically forward rejected async route promises. Separately, direct admin-cookie authentication does not enforce the photographer session's CSRF-token check, despite using a production SameSite=None cookie. The server does perform request-origin checks, so this is a defense gap rather than a demonstrated cross-site exploit.

Location: `server/src/controllers/billing.controller.js`, `paystackWebhook`; `server/src/routes/admin.routes.js`, `adminAuthMiddleware`; `server/src/controllers/adminAuth.controller.js`; `server/server.js`.

Fix: contain database/provider errors and respond with a retryable status. Add session-bound protection to financial admin mutations and keep the existing origin restrictions.

### 24. Billing email failures have no automatic recovery and support details are inconsistent

**Medium — code review.** Billing emails are event-keyed, but failed sends are caught/logged after processing and no automatic billing-email retry worker was found. Replaying an initial successful payment can switch from its welcome-email key to a receipt key. Cancellation uses a subscription-wide key, so a cancel/resume/cancel sequence can suppress the later cancellation notice. Payment emails still direct customers to info@veylo.com.ng.

Location: `server/src/services/email.service.js`; `server/src/controllers/billing.controller.js`.

Fix: use durable notification jobs with stable keys per payment or lifecycle transition, retry failed sends, and use payment@veylo.com.ng for billing support and reply-to. Confirm that the mailbox is provisioned separately; this audit did not send it email.

### 25. Refund eligibility is neither clearly published nor supported by durable paid-period usage

**High policy/operations gap — code review.** Terms describe approved refunds but do not state a request window, usage conditions, billing-error exceptions, or a payment-support contact. No dedicated Refund Policy route was found. The refund endpoint does not surface an eligibility assessment, and Pro publish reservations return before incrementing the durable quota counter. Existing delivery records/analytics are not a complete, deletion-resistant paid-period usage ledger.

Location: `client/src/pages/TermsOfService.jsx`; `client/src/App.jsx`; `server/src/services/entitlement.service.js`, `reservePublishSlot`; `server/src/models/DeliveryUsage.js`; `server/src/controllers/admin.controller.js`, `refundPayment`.

Fix: publish an agreed policy before checkout and track relevant paid-period usage without erasing evidence when work is deleted. Show that evidence to finance staff. Keep billing-error and statutory-remedy decisions separate from discretionary change-of-mind eligibility.

### 26. Dispute resolution is incomplete

**Medium — code review.** `charge.dispute.create` pauses access, but no corresponding resolution handling was found. Its subscription lookup shares the newest-subscription fallback described above.

Location: `server/src/controllers/billing.controller.js`, `processWebhookEvent`.

Fix: correlate disputes to the exact payment and paid period, record the resolution, and reconcile access accordingly. Preserve later valid payments and explain the outcome to the customer.

## Approved regional pricing

The owner's final decision supersedes the earlier USD discussion: **₦25,000/month in Nigeria and ₦30,000/month outside Nigeria, both charged in NGN**. A separate NGN 30,000 monthly Paystack plan is required. No direct USD price, conversion estimate, USD plan or USD payout setup is implemented.

International cards can pay the NGN price when supported by Paystack and the issuer; the issuer converts the charge and may add fees. Actual card acceptance and recurring behavior still require deployed provider testing. [Paystack international payments](https://support.paystack.com/en/articles/2130690).

The trusted Cloudflare edge supplies the IP-derived country. Forged country headers are removed and rejected at the origin. Unknown country shows both prices and blocks a new charge pending confirmation. Existing subscriptions retain their stored price and plan. New checkouts store the selected amount, NGN currency, region, country, monthly provider plan and current billing-policy version; server quote validation prevents charging a different price without review.

## Implemented changes

| Original findings | Result |
| --- | --- |
| 1, 8, 10 | Payment fulfillment is idempotent; older successful payments cannot replace newer periods or erase cancellation, refunds or disputes. A newer valid payment can fund a new period. |
| 2, 7, 11, 23 | Local checkout records precede provider initialization. Account locks prevent simultaneous attempts. Failed/stale webhooks are retried with encrypted durable payloads. Pending/unfulfilled payments and current successful periods are verified by recovery. Reversals do not silently retain paid access. |
| 3, 9 | Refunds use provider IDs and durable request keys. Documented transaction_reference and null refund identity are resolved through provider lists. Equal partial refunds remain distinct; late pending events do not reopen completed/failed refunds. Uncertain outcomes retain the reservation for review. |
| 4, 5, 12 | A valid pending checkout is reused. New replacement checkout stops known older renewal schedules first. Cancellation stops all linked schedules, recovers missing tokens and records incomplete provider confirmation for retry. Resume requires valid remaining paid time. |
| 13, 14, 18 | Billing actions return full summaries. Returned-payment verification survives React StrictMode, preserves pending references and offers retry. History paginates; cancellation shows exact paid dates and supports keyboard/focus/reduced-motion behavior. |
| 15, 16 | Suspension and deletion stop renewals before completing. Unresolved charges and ambiguous schedules block account changes. Deleted product records leave usage evidence; account deletion retains a restricted ledger and removes management credentials. The non-transactional database fallback was repaired. |
| 17 | Customer and admin access calculations share paid-period and manual-grant rules. Stored User.plan alone grants no indefinite access. Renewal grace is anchored to the invoice/paid date and is not extended by refresh. Expiry and retention use billing locks and conditional updates. |
| 19 | The final scope is two NGN prices. Customer/public pricing, checkout, receipts, plan summaries, history, policies, help and owner recurring revenue use the agreed regional/recorded prices. Direct USD billing remains outside this implementation. |
| 20, 21 | Provider reconciliation paginates and compares both directions, currency, amount and status. Partial scans and table/export limits are disclosed. MRR uses stored amounts and excludes cancellation; recorded fees are separate from bank settlement. CSV export escapes formula-like values. |
| 22, 24 | Credentials are redacted from snapshots; management tokens, unfinished events and retryable billing emails are encrypted. A durable outbox retries transport failures using stable email keys. Billing Reply-To and payment help use payment@veylo.com.ng. |
| 25 | Refund Policy, Terms, Privacy, Billing and help explain the approved first-payment/unused-service rule and exceptions. Usage survives later deletion. Finance staff see evidence, record an approval reason, and choose cancellation separately. |
| 26 | Disputes attach to the exact payment/period. Resolution requires current provider dispute and transaction verification, preserves other paid periods, and sends an outcome update. Late creation of the same resolved dispute cannot undo it. |

## Approved refund and cancellation terms

- Cancel renewal from Billing. Access remains through time already paid for. Cancellation is separate from a refund.
- A discretionary change-of-mind request is eligible within seven days of the first payment if no client delivery was published during that paid period and no paid storage or Portfolio feature was used.
- Used periods, normal renewals and unused days are not routinely refunded or prorated. Deleting work does not reset service usage.
- Duplicate charges, charges after confirmed cancellation, no paid access and material service failures remain reviewable regardless of usage.
- Customers may always ask payment@veylo.com.ng to review a charge. Approval requires review, and applicable consumer remedies are preserved.
- Approved refunds go through Paystack in the original NGN charge currency. Issuer conversion and bank-credit timing are outside Veylo's control.

[FCCPC consumer rights and responsibilities](https://fccpc.gov.ng/consumers/consumer-rights-responsibilities/rights-responsibilities/), [Paystack refunds](https://paystack.com/docs/payments/refunds/).

## Verification and practical limits

Behavioral backend tests exercise regional checkout, price changes, trusted country headers, concurrency, ownership, mismatched provider/customer/plan/currency/environment, payment replay, webhook retry, renewal grace, partial and older-period refunds, null refund IDs, cancellation/resume/recovery, dispute resolution, reversals, paid access, deleted usage evidence, account deletion, admin request/role protection, finance totals/reconciliation/CSV, the encrypted email outbox, orphan checkout recovery and migration idempotency. Separate edge tests check country forwarding and forged headers.

Browser coverage checks public regional pricing, unknown-country checkout, returned-payment retries, preserved history, cancellation failures, refund-policy copy, keyboard focus, reduced motion and responsive layouts at 320, 390, 768, 834, 1024 and 1440 pixels, including short landscape. Delivery and Portfolio regressions passed after the entitlement/deletion changes. Syntax, billing-admin, email, account-deletion and visitor-IP contract checks passed. Customer/admin production builds passed with existing chunk-size warnings. Final command counts are recorded in the completion message.

These tests use isolated databases and provider/API mocks. They do not establish real foreign-card acceptance, recurring authorization, mailbox delivery, refunds reaching a bank, settlements or production cache behavior. No live provider operation, deployment or production migration was performed.

Historical refunds without provider IDs, paid activity deleted before this release, unlinked external schedules and unsupported legacy Pro labels require review. Recovery has bounded batches and leases; prolonged outages and ambiguous records need monitoring/support. Email-provider idempotency has a finite window, so delivery after a long provider/database failure is not an absolute exactly-once guarantee.

See [billing-rollout.md](billing-rollout.md) for plan codes, edge configuration, read-only migration, safe backfills, test commands and live acceptance steps.
