# Veylo admin operations

This release adds the detection and permissions layer of the approved admin work, plus a new navigation shell and overview. Content Studio is excluded.

## Available in this release

- An overview showing sustained monitoring alerts, unresolved server error groups, and visible browser sessions seen in the past 90 seconds. A session is not a unique person; tabs and devices can increase the count.
- Operations showing current-instance CPU, memory, event-loop delay, request failures and approximate latency buckets. Process samples run every 30 seconds. Request metrics exclude admin polling, readiness checks and Content Studio.
- Seven days of process samples, with an hour shown in the charts. Recent replica samples are returned by the API; request totals and charts belong to the responding instance. This is not a fleet-wide infrastructure dashboard.
- Worker reporting for delivery, portfolios, retention and billing. Missing heartbeats and explicit worker errors can open incidents.
- Server error groups with sanitized call stacks, sampled occurrences, ownership, acknowledgement, fix notes and recurrence reopening. Groups expire after 90 days. Raw error messages, customer photo links and request bodies are not stored here.
- Recent JavaScript and media-error counters, plus detailed browser error groups, affected account links and private source-map symbolication. See [product insights](admin-product-insights.md) for setup and data coverage. Session replay is not implemented.
- Role checks on admin reads as well as writes. Photographer sessions and the legacy `admin` role no longer grant managed admin access. Environment credentials provision new administrators without changing an existing password or reactivating a suspended account.
- Eight-hour administrator sessions and mandatory authenticator verification in production. Non-production can enable the same requirement with `ADMIN_REQUIRE_MFA=true`. Enrollment remains available before access to customer records.
- Sections fetched independently, cancellable searches, URL navigation, visible refresh errors and stale status. Operational sections refresh every 30 seconds while visible.

Provider credentials appear as **Configured**, not **Passing**. Database and storage checks represent actual observed connections. Declined payments and historical job failures are shown separately from provider availability. Email acceptance is not proof of delivery to an inbox.

## Independent outage monitoring

`/health` is process liveness. `/ready` checks database readiness with a two-second deadline and returns 503 when unavailable. Keep the hosting liveness probe separate from the external readiness check; a database outage should not cause endless application restarts.

Run `npm run operations:monitor` from `server` on a different host or monitoring provider from the API. Running it inside the API process or on the same failed machine cannot provide independent outage alerts. No monitor service is deployed by this commit.

For the existing Cloudflare account, a deployable scheduled Worker is available in [cloudflare/uptime-monitor](../cloudflare/uptime-monitor/README.md). It checks every minute, persists incident state in one Durable Object, emails directly through Resend, and uses the same authenticated API check-in. Follow that directory's setup guide; adding the code does not deploy the monitor. Run either that Worker or the standalone Node process, rather than both against the same production targets.

Set these environment variables on the independent monitor:

| Variable | Purpose |
| --- | --- |
| `OPS_MONITOR_API_URL` | API HTTPS origin; the monitor probes `/ready` |
| `OPS_MONITOR_WEBSITE_URL` | Public website HTTPS URL |
| `OPS_MONITOR_SECRET` | At least 32 random characters, shared with the API |
| `OPS_ALERT_EMAIL` | The agreed operations alert recipient |
| `RESEND_API_KEY` | Email-provider credential, stored only in server secrets |
| `RESEND_FROM_EMAIL` | A verified sender address |

On the API, set `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`, and the existing Resend sender and key. Generate the monitor secret with a cryptographically secure generator and store it in hosting secrets. Never put it in a client environment variable or a committed file.

The monitor checks API readiness and the public HTML plus its first same-origin JavaScript bundle. It polls after a 30-second pause, opens an outage after three consecutive failures, and reports recovery after two successes. Email goes directly through Resend, without depending on the API or MongoDB. Rejected notifications are retried with the same idempotency key. State lives in memory; restarting the monitor resets its failure streak and can repeat an outage notification.

Check-ins use a dedicated secret and reject old or replayed observations. A report becomes stale after three minutes. An unconnected monitor stays **No observation**; configuring a secret alone does not establish uptime. This probe does not execute the app in a browser or verify every delivery flow. Add a separate synthetic browser check for sign-in, password-protected delivery access and downloads.

## In-app alert thresholds

The API evaluates conditions every 30 seconds and requires three consecutive failing samples:

| Condition | Trigger |
| --- | --- |
| Memory | RSS above 90% of the detected container memory limit |
| Event loop | p95 callback delay above 200 ms |
| Request failures | More than 5% 5xx responses with at least 20 observed requests in the five-minute bucket window |
| Workers | Missing/stale heartbeat or explicit worker error |

One incident is stored per condition. Acknowledgement records who is investigating; it does not suppress a continuing incident. A normal observation resolves it, and recurrence opens it again. Email requires an alert recipient and provider configuration. The email outbox and incident leases prevent concurrent instances from sending the same incident notification. Alert rows for a terminated API instance remain available for investigation; this implementation does not infer whether that instance was deliberately replaced.

No alert address has been selected by this change. Configure and test the recipient before treating alerting as operational.

## Remaining work from the admin audit

These items remain required for the broader operating plan; they are not implied to be complete by this release:

| Area | Still needed |
| --- | --- |
| Customer assistance | Customer-visible support replies and conversation history; SLA timers; safe account recovery; payment, upload and delivery diagnostics in the account view |
| Email | Delivery/bounce/complaint webhooks, searchable outbox, safe retries and alerting for failed transactional sends |
| Crashes | Deploy private source maps for production code resolution; hosting OOM/restart events; session replay |
| Infrastructure | Independent monitor deployment, paging/escalation, database connection/slow-query metrics, host CPU/disk/network metrics and fleet-wide request aggregation |
| Queues | Oldest waiting job, processing-time percentiles, dead-letter review, worker capacity and safe incident-wide retry controls |
| Media | Missing-original and derivative checks, upload failure diagnostics, storage reconciliation and link/download synthetic tests |
| Billing | Failed-webhook age and alerting, reconciliation scheduling, dispute handling and payment recovery runbooks |
| Recovery | Verified database and object-storage backups, restore drills, retention/deletion verification and release rollback procedures |
| Analytics | Verified acquisition and conversion cohorts, retention, accurate paid-plan revenue reporting and cost per delivery |
| Access | Step-up authentication for high-risk actions, documented emergency administrator recovery and durable audit export to a separate store |

## Validation

- `server`: `npm run verify:operations`, `npm run verify:analytics`, `npm run verify:billing-admin`, `npm run verify:billing`, `npm run verify:syntax`.
- `admin`: `npm run build` includes the operations motion-policy check. Content Studio's separate motion implementation is outside this change.
- Browser checks: from `client`, `npx playwright test --config ../admin/playwright.config.mjs`. Mocked API fixtures cover 320, 768, 834 and 1440 pixels, role restrictions, navigation focus, stale refreshes, issue updates and MFA enrollment gating. These are not production uptime checks.
