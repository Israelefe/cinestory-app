# Admin product insights — first milestone

This milestone adds accurate ordered funnels, publication retention, two saved account groups, detailed browser error groups, and account activity from Accounts and Support inbox. Content Studio is excluded. Feature rollouts, automated product alerts, replay, surveys and experiments are later milestones; this release does not enable them.

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

Only the two official cloud ingestion origins are accepted. No personal API key, PostHog SDK, DOM capture or direct browser-to-PostHog requests are used. Selected product events are sent through the documented batch ingestion API; browser diagnostics are encoded as manual `$exception` events. Names, contact details, raw account IDs, metadata, attribution strings, private links and original error messages are excluded. Accounts use a separate HMAC identity; client events use pseudonymous session identity. Do not rotate the identity secret casually: rotation breaks continuity and complicates matching external deletion requests.

The durable event queue is processed every 15 seconds, up to 25 events per pass, with a lease, request timeout, stable deduplication IDs and eight bounded attempts. API operations never await the external provider. Sending failures stay visible as queued/retry or failed counts. Provider acceptance is not proof of ingestion: check a known event in PostHog before declaring the connection operational. Pending events created while forwarding was disabled are not backfilled when enabled. Configure project retention and cost limits in PostHog before activation; local retention does not delete external copies. For privacy requests, use the identity secret to compute HMAC-SHA256 of `account:<Mongo user ID>`, find that distinct ID in PostHog, and delete its person, events and recordings as appropriate. This release has no external deletion API automation. Local account deletion continues to remove native account events and pending forwarding.

The cookie/storage notice is version 4 so existing visitors see the updated disclosure. The privacy policy explains selective server forwarding and separate external retention. Replay is not part of this release.

## Private browser source maps

Set a non-empty build revision (normally the commit SHA), `VITE_APP_REVISION`, and `VEYLO_PRIVATE_SOURCE_MAPS=true` for the client build. `npm run build` creates hidden maps and moves them out of the public build into `.private-sourcemaps/<revision>/`. The build fails if a safe revision is missing. Deploy only `client/dist` publicly; never publish `.private-sourcemaps`.

Copy the private revision directory to private API storage and set `BROWSER_SOURCE_MAP_DIR` to its parent. Keep maps for releases still used by browsers. Code locations in the admin are resolved locally using those files; source content and original function names are never returned. Missing maps leave the generated location visible. PostHog symbolication requires its own map upload and is not configured by this release.

## Validation

Run `npm run verify:product-insights`, existing analytics/privacy, operations, support and billing checks, both builds, and the admin Playwright suite. The new browser tests exercise 320, 768, 834 and 1440 pixel layouts, report filters, mature retention cells, browser error inspection, activity pagination and failed requests. Production activation still requires actual configuration, a controlled failed upload/browser exception, and provider-side verification; mocked checks are not production monitoring.
