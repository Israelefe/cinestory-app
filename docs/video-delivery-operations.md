# Pro video delivery: setup and release checks

Implementation date: 10 October 2026. The code, product pages and local demo are present. Production uploads remain disabled by default. Provider setup, physical-device playback and measured capacity are release requirements, not completed claims.

## Service layout

The API authenticates owners, enforces active Pro, checks PINs and expiry, reserves shared storage and issues scoped upload/playback credentials. A separate Node media worker inspects originals with FFprobe, prepares covers, imports private Stream copies, runs requested analysis and performs cleanup. MongoDB must support transactions (Atlas or a replica set).

Originals upload directly to private R2 in 16 MiB parts. The API never accepts the 5 GB upload body. Stream pulls the completed original through a signed storage URL. Client playback goes directly to Stream. Where the existing `VEYLO_EDGE_KEY` is configured in the API and client Worker, original downloads are authorised by the API and streamed from R2 through Cloudflare; account cookies and the edge key are never forwarded to R2. Without that shared key, the API streams originals as a fallback. Verify outbound bandwidth costs before using that fallback in production.

The `/v/:publicId` client URL and its API original-download URL are stable. GET, HEAD and single byte ranges are supported. PIN and link state are checked on each new request. Changing access invalidates future playback renewals; already-issued Stream credentials remain valid for up to ten minutes. A download that has already started can finish.

## Provisioning

1. Use a private R2 bucket with no public custom domain for video objects. Reuse the server's R2 credentials. Configure an incomplete-multipart lifecycle rule to abort abandoned uploads after seven days; database reservations normally expire after 24 inactive hours. The lifecycle rule covers a crash after R2 accepts multipart creation but before its upload identifier is saved.
2. R2 CORS must allow the real web origin, PUT/GET/HEAD, and the required upload headers; expose ETag. Each signed part binds the exact Blob length. Verify this on the actual bucket, including the last part and a resumed upload. Never grant public bucket access to solve CORS.
3. Enable Stream billing separately from the Workers plan. Create a scoped server API token for Stream editing and analytics, a signing key and a webhook secret. Set the `CLOUDFLARE_STREAM_*` values listed in `server/.env.example` on the API and worker. The private key accepts PEM or Cloudflare's base64 PEM. Do not put these values in Vite variables, source control or browser storage.
4. Register the Stream webhook at `/api/v1/webhooks/stream` on the API origin. The endpoint verifies its raw body signature and five-minute timestamp window, then reads actual provider state.
5. Build the dedicated worker with `docker build -f VideoDelivery.Dockerfile -t veylo-video-worker .` from `server/`, or install full FFmpeg and FFprobe and run `npm run video:worker`. Supply the same MongoDB, R2, Stream, billing-signing and email settings as the API. The image runs as a non-root user and excludes local environment files.
6. Use at least 15 GB of temporary disk for the default two media jobs, increasing it when raising concurrency. Run the container with CPU/memory limits and an isolated writable temporary volume. Source decoders allow local MP4/MOV/WebM containers only; keep FFmpeg patched. The worker checks free disk before downloading and removes its own abandoned temporary directories after 24 hours. Test process crashes and disk exhaustion.
7. Set `VIDEO_MEDIA_WORKER_ENABLED=true` in the API and worker only after the worker starts successfully. The API also requires a recent healthy worker heartbeat before accepting writes. Keep `VIDEO_DELIVERY_ENABLED=false`, `VIDEO_DELIVERY_PUBLIC=false` and `VIDEO_DELIVERY_QUALIFIED=false` until the relevant checks below pass. Before qualification, writes also require the owner's account ID in the server-only `VIDEO_BETA_USER_IDS` list. Runtime configuration can override the first two flags, so check Admin → Configuration → Video operations as well.
8. AI is optional. Provision the listed Workers AI vision/text/speech models and complete any model licence acceptance directly in the Cloudflare account. Then set server-only AI credentials and `VIDEO_AI_MODEL_READY=true`. The application does not automatically accept a model licence. Without AI, photographers can write titles and descriptions normally.

## Limits and cost controls

The initial account limits are ten films per delivery, 5,000,000,000 bytes and three hours per film; 1,000 retained video minutes and 5,000 delivered minutes per Lagos calendar month. Original bytes share the existing 100 GiB accounting limit marketed as 100 GB with Image Library files and returned edits. File-size labels use decimal GB. Playback copies and cover versions are not charged again as original bytes. Reusing the same library asset never reserves or charges another original; independently uploading another copy creates another stored original.

Initial admission settings are two transfers per photographer (one on slow browser connections), 100 platform transfers, 100 queued/encoding slots and 100 playback sessions per account. Media preparation defaults to two platform jobs and one per photographer. The 1,000-platform-viewer figure is a staging load-test target.

Stream usage is reconciled from server-side provider analytics, including buffering and owner previews. New playback and token renewals fail closed when current usage cannot be verified or observed usage reaches the account limit. This is delayed admission control, not an exact bill cap. Active credentials and analytics delay can overshoot the allowance. Original downloads do not use the Stream playback allowance.

Workers AI calls charge a conservative request allowance before inference. Defaults are USD 10 per account per Lagos month and USD 20 across the platform per UTC day. These ledger amounts are budget guards, not invoice totals. Failed/uncertain calls keep their charge; accepted evidence is cached. Regeneration reuses footage observations and speech, then requests fresh writing. Do not promise that the shared 10,000 daily included Neurons cover every film.

Monitor Cloudflare's actual account billing and alerts alongside Admin video operations. Stream storage is purchased in capacity increments, so multiplying account counts by quota is not an invoice. Verify current rates in the provider account before launch. Use the separate upload, publishing, playback and AI switches to stop new work during an incident; disabling playback does not instantly revoke existing tokens.

## Lifecycle and recovery

Paid-through cancellation and valid payment grace retain Pro entitlement. On actual expiry, public video access pauses. Owners can download retained originals during the separate 30-day video recovery window. Renewal before cleanup restores hosting; an irreversibly cancelled provider schedule may require a new checkout. Cleanup runs under the billing lock and rechecks entitlement before deletion.

Quota is released only after multipart, Stream and R2 cleanup succeeds. Provider failure leaves the asset charged and retryable. A ledger reconciles video projections without erasing image bytes. Deleting a delivery keeps completed originals in the video library; remove references from drafts and published snapshots, or delete the delivery, before deleting its original. Account deletion removes video copies and analysis before deleting account records.

## Verification and release record

Local checks:

- `cd server && npm run verify:video`: real Mongo replica-set tests for quotas, races, ownership, snapshots, PIN invalidation, usage admission, multipart replay, cleanup failure, budget contention, signed tokens, webhook signatures and edge ranges. Provider responses are mocked; no paid calls occur.
- `cd server && npm run verify:billing` and `npm run verify:assistant`: existing regression suites plus current video knowledge checks.
- `cd client && npx playwright test tests/video-delivery.spec.js`: local original demo playback, sound-on-demand, seek, single player, PIN unlock, creation/publishing, launch labels and layouts at 320/390/768/834/1024/1440 px, with reduced-motion browser preference included.
- Client and admin builds retain their mandatory motion-policy verification. Server syntax verification includes the separate worker.

The following staging results must be recorded before public availability is enabled:

- Private R2 and signed Stream source checks, complete 5 GB multipart upload/resume/abort, accurate HEAD/range downloads, and exact shared-storage reconciliation against actual objects.
- Three-hour playback on physical iPhone Safari and Android Chrome, including seeking near the end, lock/unlock, a background tab, expired-session recovery and several token renewals. Native Safari renewal currently reloads the signed manifest on the same video element and restores position; real-device confirmation is still required.
- Correct webhook HMACs, duplicate/lost copy responses, crash recovery, provider outages, malformed media, quota contention, orphan cleanup and owner account deletion.
- Pro expiry, renewal during recovery, deadline warnings and purge after the recovery window. Confirm no client/photographer filenames, PINs, signed URLs, transcripts or private notes enter general analytics.
- Worker CPU/RAM/disk measurements and actual request/encoding/viewer load. Increase traffic gradually and record achieved capacity; do not advertise the 1,000-viewer target without measured evidence.
- Actual Stream analytics schema and attribution, monthly rollover/late arrivals, observed billing, AI model schemas/licensing, inference quality and conservative budget estimates. Check large files across the production edge and API host, not only localhost.

After those checks, enable the service for a small Pro cohort, inspect costs and failures, then set `VIDEO_DELIVERY_QUALIFIED=true` and public availability when the release owner signs off. No infrastructure is provisioned or paid plan changed by these repository edits.

Provider references: [private Stream playback](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/), [Stream webhooks](https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/), [bulk usage analytics](https://developers.cloudflare.com/stream/getting-analytics/fetching-bulk-analytics/), [Stream pricing](https://developers.cloudflare.com/stream/pricing/), [Workers AI vision model](https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/).
