# Delivery preparation, version 3

New deliveries use durable preparation tasks and immutable presentation revisions. Version 2 drafts and public links keep their existing reader and editor. New creation can be switched back without migrating or deleting either version.

## Photographer workflow

1. Enter the client, occasion and brief. Enhance develops the same idea and waits for acceptance. Optional brief advice offers selectable directions and a custom detail field. A name and a clear occasion are sufficient.
2. Upload finished photographs, four files at a time. Each file retains an upload identity. A dropped upload response is reconciled with storage before retransmission. Confirmations are idempotent.
3. Choose a format. A complete presentation is immediately available using supplied information. Writing and visual observations run independently. The photographer can wait for them or keep the current version.
4. Review, reorder, remove or add presentation photographs; edit optional text; regenerate a caption; choose music and optional narration. Saving manual changes stops the attached preparation. A concurrent AI result cannot force the photographer to discard an edit.
5. Publish the revision that was reviewed. Later draft changes do not change the public link until that revision is explicitly published.

Photo Story normally uses at most 12 photographs; a ten-photo upload includes all ten. The full gallery retains every delivered original. Photographs display for 4.2 seconds by default with light motion, manual navigation and pause. Optional narration can extend a frame to fit its spoken line. Playback waits for the current photograph to load and pauses when the gallery opens. Reduced motion is respected.

## Preparation and recovery

- The API stores preparation runs and tasks in MongoDB. `npm run delivery:worker` runs the separate worker. The API does not need to keep an HTTP request open for generation.
- Each original is visually observed once per owner, verified content identity, observation version and model. Observations support accessible descriptions, representative selection and grouping. They never supply personal facts for captions. Brief edits, caption regeneration and format switches reuse observations.
- Observation requests contain up to eight 320px previews. Originals are unchanged. Successful observations are cached; partial responses retry only missing observations. Caption requests contain the brief and surrounding text, never photographs.
- Tasks have bounded attempts, renewable leases and fencing tokens. Expired leases recover. Runs retain task input as an outbox so a process exit between run attachment and enqueue does not lose the request.
- Preparation has a 55-second review deadline. If AI work is incomplete, the saved presentation remains available. Incomplete work is reported as `available`, never full AI success. Observation caching can continue for a later preparation. Optional narration runs separately.
- Publishing locks the source version, checks ownership and access, reserves quota only for the first publication, and stores the approved revision pointer. PIN hashes and preparation inputs never enter public responses. Media retained by revisions stays protected from orphan cleanup.

## Running and rollout

Start the API from `server` with `npm start`, and start the worker in another process with `npm run delivery:worker`. Local development can instead set `DELIVERY_WORKER_EMBEDDED=true`.

`render.yaml` defines the separate worker and shared configuration. The worker uses a paid `starter` plan; this repository change does not provision or verify it. Keep `DELIVERY_WORKER_EMBEDDED=false` after the worker is deployed. Before removing an existing embedded worker, provision the replacement and verify its heartbeat to avoid interrupting legacy jobs.

The Render configuration deliberately leaves `DELIVERY_V3_ENABLED=false`; production also defaults to version 2 when the flag is absent. To activate new creation, deploy both processes, check the `delivery-preparation` heartbeat, run the staging checks below, then set `DELIVERY_V3_ENABLED=true` on the API. Roll back new creation by setting it to `false`; keep the worker running for existing version 3 drafts. Retain revision data and original media during rollback. Existing installations with no worker-mode setting keep their legacy embedded worker until `DELIVERY_WORKER_EMBEDDED=false` is explicitly configured.

`DELIVERY_PREPARATION_CONCURRENCY` defaults to 6, with a maximum of 32. `DELIVERY_AI_START_INTERVAL_MS` defaults to 100. Provider slots and start spacing are shared across new workers. Increasing worker count does not multiply these limits. Legacy workers use their existing settings. Verify account capacity before increasing concurrency; model catalogue quotas alone do not establish observed throughput. See [Alibaba rate limits](https://www.alibabacloud.com/help/en/model-studio/rate-limit) and [Render Blueprint configuration](https://render.com/docs/blueprint-spec).

The admin AI summary includes `preparation`: queue depth, expired leases, unavailable tasks, worker heartbeat, completed samples, partial preparation count, and p95 for fully prepared deliveries. Partial results are excluded from the successful latency metric.

## Verification and measured limits

- Server: `npm run verify:delivery-v3`, `npm run verify:delivery-v2`, `npm run verify:security`.
- Client: `npm run verify:delivery-v3`, `npm run verify:delivery-v2`, `npm run build`.
- Live writing evaluation: `node scripts/evaluate-delivery-writing.mjs --live` from `server`.
- Live preparation benchmark: `node scripts/benchmark-delivery-preparation.mjs --live --users=1 --concurrency=6`. Repeat with `--users=10` for the burst case. These calls use the configured provider and incur normal usage charges; they connect only to an isolated temporary MongoDB, never the database in `.env`.

Measurements on 25 September 2026, using real AI and repository demonstration images:

The final brief evaluation covered Ada's 30th birthday, Lora's birthday with no supplied age, Tunde's graduation, Ijeoma's traditional wedding, Amara's collection lookbook, and an ambiguous fashion shoot for Bola. All 18 enhancement, assessment and presentation-writing results completed successfully. Enhancements use Qwen 3.8 Flash and a separate DeepSeek V4.1 Flash review against the original brief. The ambiguous fashion case offered clothing-collection and personal-celebration choices; clear occasion briefs did not demand extra information. These are manually reviewed samples, not a guarantee of every future model response. Photographers accept enhancements before they replace the original brief and review generated presentation text before publishing.

| Case | Result |
| --- | --- |
| 100 photos, six concurrent requests | All observations and writing completed in 46.8 seconds, including retries |
| 100 photos, 32 concurrent requests | All observations and writing completed in 38.5 seconds, including retries |
| Ten simultaneous 100-photo preparations, 32 concurrent requests | Full-analysis target failed: all ten reached the fallback state around 55 seconds; repeated provider timeouts |

These are local preparation measurements, not a production SLA. Fixtures reuse 92 demo photographs as 100 asset identities and send previews as data URLs. They exclude original upload time, production database latency, Cloudinary transformation/network time and optional narration. Analysis normally begins during real uploads, which the cold-start benchmark does not simulate. The ten-delivery burst remains a rollout blocker for any promise that every concurrent delivery completes full AI preparation within one minute.

Before activation, verify a real staged upload-to-publication flow with 100 originals, signed media, client PIN access, download permissions and the dedicated worker. Confirm provider capacity under the expected concurrent load. No production deployment or staging account test is implied by passing local tests.
