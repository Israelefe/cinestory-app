# Veylo video processing on Cloudflare

This is a **new** Worker, `veylo-video-processing`. It manages Linux FFmpeg containers on Cloudflare. The existing `veylo-delivery-images` Worker still serves private images, legacy original video playback and automatic HLS qualities. Photographers upload from their own devices; processing runs on Cloudflare after upload, independently of your computer.

## Deploy with Cloudflare Workers Builds

Cloudflare can build the container directly from this GitHub repository. Local Docker and WSL setup are unnecessary for this deployment path.

In Workers & Pages, create a Worker by importing `Israelefe/cinestory-app`. Use:

| Setting | Value |
| --- | --- |
| Worker name | `veylo-video-processing` |
| Production branch | `main` |
| Root directory | Leave empty (repository root) |
| Build command | `npm ci --prefix cloudflare/video-processing` |
| Deploy command | `npm run deploy --prefix cloudflare/video-processing` |

The repository root includes both the Worker configuration and the Docker build context in `server/`. Save and deploy, then wait for a successful build and container provisioning. A custom instance with two vCPUs requires at least 6 GiB RAM; the configuration uses 6 GiB RAM and 20 GB disk.

Once the Worker exists, add the required runtime secrets listed below under **Settings > Variables and Secrets**, choosing **Secret** for each. Build variables are separate from runtime secrets. Match the Render API processing secret and rollout settings, then complete the readiness and invited-Pro checks below before public activation.

Reference: [Cloudflare hosted container deployment](https://developers.cloudflare.com/containers/guides/deploy/#deploy-with-workers-builds).

## Alternative: deploy from a computer or CI runner

1. Keep the existing private R2 bucket, CORS, playback secret and media Worker deployment.
2. Set a new random secret of at least 32 characters, `VIDEO_PROCESSING_SECRET`, in the Render API environment. Use a different value from `VIDEO_PLAYBACK_SECRET`. Set `VIDEO_PROCESSING_MODE=cloudflare-containers` on the API and deploy the API code. Keep public video availability and qualification disabled.
3. Install Docker Desktop and start its Linux engine **for building and uploading the deployment image**. It is not the production encoder. Wrangler builds a `linux/amd64` image and uploads it to Cloudflare. After deployment, your computer can be off. A CI runner with Docker can also deploy this service.
4. From this directory, run `npm ci`. The project pins Wrangler. Set Worker secrets with `npx wrangler secret put NAME`, one name at a time:

   Required: `VIDEO_PROCESSING_SECRET`, `MONGODB_URI`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `VIDEO_PLAYBACK_SECRET`.

   Use the same private database, R2 credentials and playback signing secret as the API. The processing secret must match step 2. Do not commit `.dev.vars`, environment files or credentials. For an initial Worker, Wrangler may offer to create it while setting secrets; keep the name `veylo-video-processing`.

   Video AI analysis is disabled; Workers AI credentials and model setup are not required for video delivery. Optional migration cleanup: `CLOUDFLARE_STREAM_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN` for old Stream objects only.

5. Check the non-secret origins in `wrangler.toml`. Add the same server-only `VIDEO_BETA_USER_IDS` as the API using a Worker variable. Match any environment-based entitlement/rollout flags on the API and container; saved runtime configuration is shared through MongoDB. Allow the container to reach MongoDB securely using TLS and a dedicated database credential; confirm your database network policy permits Cloudflare container outbound connections. Do not assume it has Render's IP address.
6. Run `npm run deploy`. Wait for the Cloudflare container application to finish provisioning. Inspect `npx wrangler containers list` and the Worker/container logs. Never deploy this configuration over the existing media Worker.
7. Set `VIDEO_MEDIA_WORKER_ENABLED=true` on the API once the new service is deployed. Within the next minute the cron performs a small cold-start check: MongoDB/indexes and full FFmpeg capabilities must pass before it records a healthy coordinator heartbeat. Admin video operations then reports `cloudflare-containers`. A public `/health` response only confirms the Worker exists; it does not certify the encoder.
8. Use an invited active Pro account for a real upload, preparation, client playback, seeking, original download and access-change check. Test cold startup after the container has stopped. Keep `VIDEO_DELIVERY_QUALIFIED=false` and public availability off until the qualification checks in [the operations guide](../../docs/video-delivery-operations.md) pass.

No Cloudflare Stream subscription, Render background worker or permanently running personal computer is required for this setup. Containers require Workers Paid and incur usage charges above the account's included allocations. Deployment still requires you to configure secrets and provision the service; committing code does not do that.

## Playback quality

Every upload automatically queues its supported qualities: 720p; 720p and 1080p; 720p, 1080p and 2K (1440p); or those three plus 4K (2160p). The encoder preserves aspect ratio and frame rate and never enlarges a source. It creates no compressed 360p or 480p versions. Nonstandard dimensions retain a native top quality up to 4K; older smaller compatible files retain their source-only stream. The highest quality reuses an original H.264/AAC stream only when its pixel format, keyframes, segment sizes and bitrate suit streaming; otherwise it encodes at the uploaded resolution. Original files and downloads remain unchanged.

Up to two qualities share an input decoder, starting at 720p, into approximately two-second segments. Closed segments upload while encoding continues and are removed from scratch storage after transfer. Source files above 4K use one quality at a time to bound memory. Real progress identifies the active qualities. The first complete quality enables owner preview; **the creator cannot advance past Upload or publish until every required quality and cover is ready**. Clients start on Auto with a short playable reserve and can select a quality manually. Quality version 3 retains its existing CRF, encoder preset, frame rates and bitrate ceilings. Upgrades retain older manifests for existing sessions through their absolute media lifetime, then maintenance removes the retired files. Failed preparation exposes retry while keeping the original and any previously published playback available.

The queue, runtime budgets, disk guards and access checks still apply to every automatic preparation. The generated output bound is 64 GB per asset, with at most 6,000 segments per quality and 32 MB per segment. Scratch remains 20 GB, so long high-resolution encodes must be qualified against available disk and runtime before increasing the supported limits.

## Cost and queue controls

- `VIDEO_MAX_CONTAINERS=100`, the default Admin `workerConcurrency=100` and `max_instances=100` retain the existing 100-worker ceiling on the current database plan. This is an application setting, not a MongoDB video-count limit or a certified throughput figure. Saved lower Admin limits remain effective. Each photographer can use up to ten slots, and each asset has only one media job at a time. Queued work starts only when capacity is available.
- Each container has two vCPUs, 6 GiB RAM and 20 GB scratch disk, with one media job at a time. Up to two qualities share decoding; completed segments upload in batches of twelve while encoding continues. Memory, scratch, output-size and runtime checks remain active. Test the largest supported originals and three-hour films before making preparation-time promises.
- `VIDEO_DAILY_CONTAINER_SECONDS=8640000` allows 2,400 **aggregate container-hours** per UTC day, enough for the configured 100-worker pool over 24 hours. It includes cold startup and idle time conservatively and never refunds uncertain/crashed intervals. It is configurable and is not a photographer quota, a Cloudflare free allocation or an invoice cap. Workers still stop when idle; the ceiling does not run 100 machines without work.
- A central Durable Object reserves the next 90 seconds before a VM starts and renews only the extension every 30 seconds. When credits are exhausted, running containers stop, new uploads fail the readiness check and existing queue entries wait for the next UTC day. Already prepared videos still play within their account allowance. Interrupted work recovers through expiring Mongo leases. Repeated processing failures require manual retry after six attempts; cleanup keeps retrying.
- `VIDEO_MAX_JOB_SECONDS=21600` bounds a single container run to six hours, including download, encoding and upload. Long/complex sources may need a larger measured limit and a matching daily allowance. Container startup is capped at two minutes; failures back off rather than restarting continuously.
- Busy encoders receive short control leases. The Node process exits if the coordinator stops renewing them; Durable Object inactivity provides a second shutdown bound. Idle containers are destroyed at the next 30-second poll. A daily capability probe validates an otherwise idle encoder without keeping one running all day.
- The daily allowance **does not cap the whole Cloudflare invoice**. CPU, memory, disk, container egress, Durable Objects, Workers, R2 and AI have separate billing. Watch Cloudflare usage and billing alerts. The protected dispatch response and Admin operations API expose reserved and remaining runtime seconds. Treat them as admission counters, not billed CPU seconds.

The API reads the primary database connection allowance every 30 seconds and shares concurrent checks. Our conservative admission budget reserves 200 connections (100 for the API pool, plus 100 for other services and headroom), then budgets three per encoder: one application connection and up to two primary monitoring connections. Effective concurrency is the smaller of the configured ceiling and `floor((databaseConnections - 200) / 3)`, bounded at zero. The 200-connection reserve is our operational choice, not a MongoDB requirement. Missing or invalid capacity proof never expands beyond the existing 100-worker ceiling. Zero capacity stops encoder admission, including readiness probes. The protected status and Admin worker details report configured and effective concurrency and the limiting reason. Run `npm run video:capacity --prefix server` from the repository root for a read-only capacity check; the script exits 2 when the database limits the configured ceiling.

The current database reports 500 connections. With up to three primary connections per encoder, 166 workers is a theoretical ceiling only if the rest of the application uses no connections. The configured 100 leaves room for other app activity under our budget. No production load test has established the maximum reliable number of video jobs. Database throughput, connection-rate limits, API traffic and other services also matter. This deployment does not upgrade Atlas or change its paid plan. Any paid-plan change requires a price review and the owner's approval. See [MongoDB connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/), [Atlas limits](https://www.mongodb.com/docs/atlas/reference/atlas-limits/) and the operations guide.

Enqueueing work sends a coalesced authenticated wake-up rather than waiting for the next minute cron. A warm idle encoder can restart its pump when new work arrives. The coordinator keeps stable slot IDs, shares one readiness update across a startup burst and reduces dormant-slot polling once the pool empties. Each encoder bounds its MongoDB pool to one application connection; the API creates indexes before serving processing requests, so cold workers do not all repeat index builds. Set `VIDEO_PROCESSING_WORKER_URL` on the API when the playback Worker uses a custom domain; otherwise the processing Worker address is derived from the existing `workers.dev` account hostname. Cron checks the durable queue each minute as a recovery path. Cold-start time still applies when all encoders are asleep. Queue durability does not depend on a browser staying open. Every ten minutes, the API reconciles interrupted uploads, quota, retention and cleanup; an empty queue does not boot FFmpeg for maintenance.

Uploads allow ten active files per photographer and 1,000 across the platform. All selected files can start together, with one multipart chunk at a time per file, real progress and pause/resume. The ten-file delivery limit, 5 GB file limit, storage quota and private access checks remain enforced.

Checks and cover extraction use bounded private R2 ranges for files above 8 MiB, with full-file fallback for unusual exports. They no longer require a full GB-sized original download before creating a cover. Encoding downloads the original once for all quality passes. See [the measured comparison](../../docs/video-delivery-operations.md) and `server/scripts/benchmark-video-preparation.mjs` for a repeatable complete-ladder benchmark. Deploy the API and processing image together to activate the queue, range-reader, concurrency and encoder changes.

## Checks

`cd ../../server; npm run verify:video` covers scheduler, HTTP authentication, budget admission, slot limits, cold starts, idle shutdown and retry fencing, plus the existing video pipeline. Full FFmpeg/FFprobe enable the real encoding checks. `npm run check` in this directory validates the Worker bundle and builds the image without publishing; Docker must be running. When Docker is unavailable, `npx wrangler deploy --dry-run --containers-rollout=none` validates the Worker/configuration only and does not validate the image.

References: [Cloudflare Containers](https://developers.cloudflare.com/containers/), [Durable Object Container API](https://developers.cloudflare.com/containers/api/durable-object-container/), [pricing](https://developers.cloudflare.com/containers/platform/pricing/).
