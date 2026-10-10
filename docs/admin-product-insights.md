# Admin product insights and monitoring

Veylo includes ordered funnels, publication retention, saved account groups, grouped browser errors, and account activity from Accounts and Support inbox. Product controls add optional dashboard recordings, a one-question feedback form, a gradual dashboard guidance rollout, and a publication experiment. Product alerts join the existing operations monitor. Content Studio is excluded.

Optional customer-facing controls default to off. Superadmins can change them under **Product analytics → Product controls**. Operations, analyst and read-only roles can inspect them. Saves require an authenticated administrator, are audited, and reject stale revisions so two administrators cannot silently overwrite each other.

## Collection and privacy

Browser events continue through Veylo's authenticated/optional-auth collection endpoint. New events carry UUIDs, bounded capture timestamps and a browser sequence; the server hashes the UUID plus account/session scope into a unique sparse database key. Replayed batches cannot duplicate new events after the unique index is installed. API startup creates the unique eventKey index before accepting traffic; confirm the index after deployment. Older events without IDs remain readable.

Photographer identity comes from the verified session, never from a client-supplied user ID. An account hint must match the verified session; the hint grants no access. Account switches clear the queued browser events and rotate the session ID. Client-viewing events remain client events even when the viewer is signed in. Their delivery scope is hashed, and photographer and recipient funnels are separate. Route identifiers and query strings are removed from newly stored route fields. Existing raw historical routes are templated before activity is returned.

Browser diagnostics contain an allowlisted error type, mechanism, release, and at most eight application asset locations. They exclude exception text, function names, DOM, input values, media URLs, support content and request/response bodies. Cross-origin and extension code locations are discarded. Capture is capped at ten reports per browser minute. Existing collection rate limits remain active.

Test-environment events and configured internal accounts are excluded from product reports and forwarding. Account activity remains available for support with an exclusion label. Identity histories are not merged across anonymous visitors or devices. Analytics and error counts are observations, not proof of billing entitlement, refund eligibility or completed downloads.

## Reports

- First delivery: server-verified activation, browser-reported completed upload, then server-recorded publication, within seven days. One first start per account in the selected reporting period.
- Checkout: server-recorded checkout initialization to server-confirmed payment for the same subscription/checkout, within 24 hours. Renewals without a new checkout are not conversion attempts.
- Recipient: delivery open, viewing start, photo download start for the same browser session and hashed delivery, within 30 minutes. Historical sessions without delivery scope are excluded.
- Steps must happen in order. Unfinished participants remain pending until their completion window expires. Median durations are measured from start among those reaching each step.
- Retention measures publishing in successive seven-day or 30-day intervals after the first retained server-recorded publication. Incomplete intervals have no percentage. Dates use Lagos time. This is observed publication retention, not lifetime account history or calendar-month retention.
- Saved groups: recently created accounts with no retained server-recorded publication, and accounts with reported upload failures during the selected window. Missing historic events are not reconstructed; counts should be interpreted alongside data coverage.

Native analysis is bounded at 50,000 selected events and 10,000 new accounts, with query deadlines. Exceeding the bound returns an explicit unavailable report instead of sampling conversion rates. Large installations should use PostHog's analysis or replace this bounded path with materialised aggregates. Detailed browser issues show up to 50 groups and 20 affected account links per group. Account activity uses cursor pagination, 30 events at a time. Accounts, cohort reads and ticket activity use existing role guards; ticket activity also enforces mailbox access. Analyst/read-only views do not return account IDs from browser groups. Sensitive investigation reads are audited.

## PostHog activation

Create a dedicated PostHog project and choose US or EU hosting. Configure on the API only:

```dotenv
POSTHOG_ENABLED=true
POSTHOG_HOST=https://eu.i.posthog.com
POSTHOG_PROJECT_TOKEN=<project token from project settings>
POSTHOG_IDENTITY_SECRET=<independent random secret, at least 32 characters>
ANALYTICS_EXCLUDED_USER_IDS=<internal account IDs, comma separated>
```

Only the two official cloud ingestion origins are accepted. Selected product events go through the server's batch ingestion queue; browser diagnostics become manual `$exception` events. Names, contact details, raw account IDs, arbitrary metadata, attribution strings, private links and original error messages are excluded. Accounts use a separate HMAC identity; client events use pseudonymous session identity. Do not rotate the identity secret casually: rotation breaks continuity and complicates matching external deletion requests. The browser SDK is loaded separately only after permission for an optional dashboard recording; it does not replace server collection.

The durable event queue is processed every 15 seconds, up to 25 events per pass, with a lease, request timeout, stable deduplication IDs and eight bounded attempts. API operations never await the external provider. Sending failures stay visible as queued/retry or failed counts. Provider acceptance is not proof of ingestion: check a known event in PostHog before declaring the connection operational. Pending events created while forwarding was disabled are not backfilled when enabled. Configure project retention and cost limits in PostHog before activation; local retention does not delete external copies. For privacy requests, use the identity secret to compute HMAC-SHA256 of `account:<Mongo user ID>`, find that distinct ID in PostHog, and delete its person, events and recordings as appropriate. This release has no external deletion API automation. Local account deletion continues to remove native account events and pending forwarding.

The cookie/storage notice is version 4. The privacy policy explains selective server forwarding, optional recordings, feedback and experiments, and separate external retention. Local account deletion also removes feedback and experiment assignments. External deletion still requires the PostHog process described above.

## Dashboard recordings

The replay offer requires an active verified photographer, an enabled and valid PostHog connection, an enabled admin switch, and membership in a stable account sample. Internal accounts are excluded. The user must choose **Allow and start** each time; the authenticated consent endpoint records that permission before returning replay configuration. The configuration contains only a public ingestion token, official host, and HMAC identity. No management credential reaches the browser.

The lazy-loaded, bundled SDK records only `/dashboard`, with no query or hash. It masks all text and element attributes and blocks photographs, media, forms, navigation, dialogs, the delivery list, and support widgets. Console, network, canvas, cross-origin iframe, survey, autocapture and automatic error capture are disabled. The outbound filter allows only replay transport fields, removes custom and plugin events, and normalises replay metadata URLs. This deliberately limits visual fidelity in exchange for protecting private content. Permission and identity do not persist in PostHog cookies or local storage.

Recording stops when the user presses Stop, leaves the dashboard, switches tabs, hides or unloads the page, changes accounts, or reaches five minutes. A cancelled pending request cannot start recording later. Stopped SDK instances cannot send later snapshots. The UI reports recording as active only after the SDK confirms it started. PostHog Session Replay must also be enabled in the project; the public ingestion token alone cannot change that setting.

## Feedback and gradual rollout

The native feedback form accepts one score from 1 to 5 per verified account. It accepts no message, email, or client content. Admins see the score distribution; users who need a reply can open human support. The server forwards a bounded `product.feedback.submitted` event when PostHog forwarding is enabled. This is Veylo's form, not a remotely created PostHog survey.

Dashboard guidance uses a deterministic account rollout percentage. With the experiment enabled, eligible accounts receive a stable 50/50 control or guided assignment. The signed, short-lived exposure token is bound to the authenticated account and checked against the current rollout before a unique exposure is saved. Disabling the rollout rejects new acknowledgements. Existing assignments remain stable if the experiment is later re-enabled.

Admin observations count server-recorded publications after exposure, within seven days, and show accounts whose observation window is still open. They do not announce a statistical winner. Exposure events are forwarded as `$feature_flag_called` for `veylo-dashboard-guidance`; server publication events carry the assigned feature property. Veylo controls allocation and switching. This release does not create or synchronise remote PostHog feature-flag or experiment configuration.

## Product alerts

The existing operations monitor checks these additional signals over the latest five minutes:

- At least 20 browser errors, or at least five affecting two identified accounts.
- Server-recorded upload failures above 20%, with at least five recorded attempts.
- Server-recorded publication failures above 20%, with at least five recorded attempts.
- A failed PostHog forwarding event within 24 hours, or a queued event older than ten minutes.

Internal and excluded activity does not contribute to product error rates. Browser-only outcomes cannot trigger server upload/publication failure alerts. Signals must remain unhealthy for three checks before opening an incident. Existing deduplication, retry and recovery notification rules apply. The monitor runs every 30 seconds and is bounded by database query deadlines.

Incidents appear in admin without an email provider. Email additionally needs `RESEND_API_KEY` and the recipient saved in Product controls, or the `OPS_ALERT_EMAIL` fallback. A saved address is not proof of mail delivery. A separate external uptime check remains necessary to detect a completely unavailable API, because a stopped process cannot run its own monitoring.

Operations uses the same saved recipient and environment fallback as the alert sender. Its email card reports **Configured** only when both a recipient and the email-provider key are present; otherwise it reports **Not configured** and identifies the missing setup. This is a configuration check, not confirmation that an email reached an inbox. Independent API and website checks still show **No observation** until an external monitor reports.

Super administrators can use **Send test alert** in Product controls to verify inbox delivery without creating an incident. The authenticated, CSRF-protected endpoint accepts only the saved settings revision; the recipient and message are fixed on the server. Requests are audited and limited to one per administrator per minute. The shared email outbox also deduplicates tests for the same recipient within each minute across API replicas. Provider acceptance is shown separately from inbox delivery; the administrator must check the receiving inbox and spam folder. Save a changed alert address before testing.

## Private browser source maps

Set `VEYLO_PRIVATE_SOURCE_MAPS=true` for a private-map client build. The revision comes from `VITE_APP_REVISION`, a supported CI commit variable, or the current Git commit. `npm run build` creates hidden maps and moves them out of the public build into `.private-sourcemaps/<revision>/`. The build fails if a safe revision is missing. Deploy only `client/dist` publicly; never publish `.private-sourcemaps`.

For native admin symbolication, copy the private revision directory to private API storage and set `BROWSER_SOURCE_MAP_DIR` to its parent. Keep maps for releases still used by browsers. Code locations in admin are resolved locally using those files; source content and original function names are never returned. Missing maps leave the generated location visible. This storage must survive API redeployments; generating maps in the frontend build alone does not install them on the API.

For PostHog uploads, configure these **frontend build-only** variables in the hosting/CI secret store:

```dotenv
POSTHOG_CLI_API_KEY=<scoped PostHog personal API key>
POSTHOG_CLI_PROJECT_ID=<numeric project ID>
POSTHOG_CLI_HOST=https://eu.posthog.com
```

Never prefix the management key with `VITE_`, commit it, or put it in browser runtime configuration. Use a dedicated key with the required error-tracking write access. The official `@posthog/rollup-plugin` injects chunk IDs and uploads hidden source maps as `veylo-web` for the build revision. CI must allow the official CLI installation required by the plugin. Maps are copied to private native storage first and removed from the public build even if upload fails; upload failure fails the build. No upload runs without both credentials. Native diagnostics preserve only validated application chunk IDs so PostHog can match maps without receiving raw stack messages or private URLs.

## Live acceptance

The EU connection has already been checked with a new account activation and a controlled browser exception visible in both Veylo and PostHog. The admin acceptance timestamp describes the last accepted batch; it changes when another eligible batch is sent. It is not a heartbeat.

Project replay enablement, retention/cost settings, real source-map upload, private API artifact deployment, and actual alert email delivery still require authenticated access to the relevant PostHog/hosting accounts. Local tests cannot confirm those settings. Customer-facing switches remain off until intentionally enabled by a superadmin. No remote surveys, flags or experiment objects are claimed to have been created.

## Validation

Run `npm run verify:product-controls`, `npm run verify:product-insights`, analytics/privacy and operations checks, both builds, and the relevant client/admin Playwright suites. Tests cover role/CSRF enforcement, concurrent saves, bounded feedback, signed exposures, seven-day verified outcomes, alert opening/recovery, and phone/tablet/desktop layouts. Replay tests inspect actual SDK payloads containing planted private text, links, attributes, photographs and forms; they also check stop, restart, navigation and pending-request cancellation. A private-map build must leave zero `.map` files in `client/dist`. Provider mocks and local builds do not replace live acceptance.
