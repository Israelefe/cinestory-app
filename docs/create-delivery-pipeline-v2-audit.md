# Veylo Create Delivery Pipeline — V2 Audit

> **Provider routing update:** Veylo now sends creative direction, delivery tasks, photo analysis, caption writing, Veylo Help, and brief assistance to Groq AI using qwen/qwen3.8-27b. Alibaba Model Studio with deepseek-v4.1-flash is the fallback. Vision requests are limited to three photographs per call. The provider table and code findings below describe the earlier audit snapshot.

**Audit date:** 26 September 2026

**Scope:** Photographer-facing Create Delivery flow and the server, AI worker, media storage, preview, and publishing services it depends on.
**Source state:** Current local checkout on main. The working tree already contained substantial edits and deletions before this report was created. This report describes the files present in that checkout; it does not claim those files match the deployed release.

## Executive assessment

Veylo’s current Create Delivery flow is a real, end-to-end photo-delivery pipeline. A photographer enters shoot context, uploads finished photographs, asks Veylo to analyze the collection, chooses one of eight presentation formats, reviews and edits the generated direction, sets client access, and publishes a link they can send by WhatsApp, email, or QR code.

The strongest product decision is that AI proposes a presentation while the photographer remains responsible for approval. The worker uses structured output, processes photographs in batches, saves intermediate results, and the client preview uses the same format viewer as the delivery page. Uploads are private in Cloudinary, checked again by the server, and the full-resolution download endpoint rechecks delivery permissions.

The model workload is substantial and should be visible: a clean first-try 500-photo Event Coverage or Campaign run, without enhancement, retries, or narration, sends all 500 photos to visual analysis, then sends those same 500 photos to caption/frame generation, making 1,000 image submissions across 42 analysis batches and 63 caption batches. With the brief check, format ranking, and global direction, that is 108 Alibaba requests. The repository does not retain provider token usage, so it cannot report the actual total bill; this audit gives provider rates and an image-token-only cost illustration instead.

The main gap is that the experience and the architecture do not yet share one durable version of truth. An optional AI brief assessment blocks draft creation if the model is unavailable; publish controls live only in browser memory; upload retries can create duplicate assets; generation jobs and delivery state are not committed as one idempotent command; and review approval is a timestamp rather than a specific immutable revision. The worker also runs inside the web process in the checked-in deployment manifest. Media URLs need a bounded access strategy if PIN, expiry, and revocation are meant to govern access after a recipient has opened the delivery. These are reliability, privacy, operating-cost, and product-design issues, not just a page-component cleanup.

**Verdict:** broad and thoughtfully designed product functionality, with good server-side ownership checks and human review, but not yet at the level of reliability and predictable state that a high-trust delivery tool should promise. Fix the P1 items below before scaling usage.

## What Veylo V2 is

The current implementation is a browser-based creator backed by a React/Vite client, an Express API, MongoDB delivery records, Cloudinary authenticated media, Alibaba Model Studio for image analysis and creative direction, and optional Deepgram narration. A delivery record declares schema version 2 and supports eight formats: Photo Story, Editorial Page, Photo Reveal, Canvas, Chapters, Album, Event Coverage, and Campaign Delivery. The format definitions describe the distinct client experience for each one in [deliveryFormats.js](../client/src/constants/deliveryFormats.js#L4); the persisted schema is in [Delivery.js](../server/src/models/Delivery.js#L34).

Each delivery has two parts: a directed presentation for the client and a complete gallery for browsing and downloads. Photo Story and selected formats can use music; narration is limited to Photo Story. The final publish step adds optional PIN protection, an expiry date, download controls, a balance lock, watermark settings, and likes. After publishing, the creator can open or copy the client link, share through WhatsApp or the browser share sheet, send email, or download a QR code.

At the time of this audit, the plan rules were three Free deliveries per month with up to 100 photos each, and Pro at ₦25,000/month with up to 500 photos each. Pro is now ₦40,000/month for every customer; see the [current billing rollout](../server/docs/billing-rollout.md). The master product description still says two Free Photo Stories and frames the product as a V1 Photo Story tool, so it is no longer a reliable description of this pipeline ([productdescription.md](../productdescription.md#L1144)).

## How the pipeline works today

**Shoot details → draft → finished-photo upload → AI analysis and format recommendations → format choice → AI direction and captions → human review and preview → access and audio choices → publish → WhatsApp, email, share sheet, or QR.**

1. **Context and draft.** The photographer provides a client name, shoot type, and brief. The page checks the brief with an AI assessment before creating or updating the draft. An optional enhancement tool can rewrite the brief, while the photographer can accept, edit, or keep their own text.
2. **Photo upload.** JPEG, PNG, and WebP files up to 50 MB are uploaded directly to Cloudinary. The browser limits the batch to the plan’s per-delivery count, uploads three files at a time, shows per-file progress, retries failures twice, and allows partial success. The server signs each upload, confirms the Cloudinary signature and delivery folder, checks file type and size, checks plan limits again, and records the asset.
3. **Analysis and recommendations.** A MongoDB-backed job is queued. The worker analyzes every asset in batches, stores per-photo insights and progress, then asks the model to recommend formats. The creator can leave and reopen the draft; the API returns the latest active or failed job.
4. **Direction.** The selected format drives a format-specific direction. The worker chooses a presentation set where appropriate, generates sections and per-photo captions in batches, validates the output, assigns soundtrack metadata when supported, and saves the direction for review.
5. **Human review.** The photographer can edit the title, opening and closing lines, design settings, captions, and photo order; request selected-photo or full revisions; and inspect the same format viewer used by the client. Saving review persists the approved direction and gallery/presentation ordering.
6. **Publishing.** The photographer selects available access options. For Photo Story, publishing may first generate narration from the approved captions. The server checks that review was approved, checks the plan’s publishing allowance, hashes a six-digit PIN, saves access rules, and publishes the link.

The main browser orchestration is in [CreateDelivery.jsx](../client/src/pages/CreateDelivery.jsx#L167). Upload, job, review, and publish endpoints are registered in [delivery.routes.js](../server/src/routes/delivery.routes.js#L13). The queue and resumable checkpoints are implemented in [deliveryWorker.service.js](../server/src/services/deliveryWorker.service.js#L154).

## Full architecture: components and ownership

| Layer | What it does now | Source of truth and boundary |
|---|---|---|
| Creator browser | A single React page collects shoot context, manages the five stages, uploads files, polls jobs, edits the generated direction, previews the client format, and publishes or shares. | Most stage, selection, audio, dialog, and publish-control state lives in the page component. Shoot details and generated delivery data are reloaded from the API; selected publish preferences are not. |
| Express API | Authenticates creator routes, validates most command payloads with Zod, checks ownership, enforces plan limits, signs Cloudinary uploads, and exposes public delivery/download routes. | Controllers own the business transitions. The API and worker both update the same Delivery document. Public access is deliberately separate from creator authentication. |
| Delivery document | Stores the shoot brief, all asset references, per-photo analysis, recommendations, creative direction, ordering, soundtrack/narration metadata, access rules, publication state, and counters. | One MongoDB document is the main aggregate. Flexible analysis and creative-direction fields use Mixed data. |
| DeliveryJob document | Stores queued/running/terminal work, stage, progress, attempts, checkpoint cursor, provider and prompt/render versions, timings, errors, and intermediate result data. | MongoDB is also the work queue. The worker claims jobs by changing queued to running and writes checkpoints back into the job. |
| Delivery worker | Batches image analysis and caption work, applies provider quota/concurrency limits, saves intermediate results, and attempts stale-job recovery. It also handles narration generation. | It runs in the API process when DELIVERY_PIPELINE_ENABLED is true in the checked-in Render manifest. An alternate worker entrypoint exists, but that manifest does not define a separate worker service. |
| Cloudinary | Receives browser uploads directly, keeps originals as authenticated assets, supplies transformed previews, and stores narration/custom audio. | The browser never receives the Cloudinary API secret. The server signs uploads and verifies the signed upload response before attaching an asset to a delivery. |
| External generation providers | Alibaba Model Studio receives selected resized photographs plus shoot/client context for analysis and direction; Deepgram supplies narration. | Provider calls happen from server-side services. The privacy policy identifies these providers, but the create flow does not clearly explain the specific data transfer at the decision point. |
| Client presentation | A format registry selects one of eight viewer implementations. The creator preview and public delivery share the same viewer registry, which reduces drift. | The format implementation is shipped with the current frontend. A delivery stores schemaVersion and format data, but the audit did not find a persisted viewer/renderer version pin for each published delivery. |

### Current lifecycle and state boundaries

The effective lifecycle is: brief entry -> draft -> upload -> analysis job -> format recommendations -> direction job -> editable review -> optional narration -> publish. The stored status enum is smaller than that product lifecycle: draft, analyzing, directing, review, published, and archived. In particular, review represents both “analysis is complete; choose a format” and “direction is ready; edit and approve it.” The client infers which review screen to show by checking for recommendations and creativeDirection in addition to status ([Delivery.js](../server/src/models/Delivery.js#L34), [CreateDelivery.jsx](../client/src/pages/CreateDelivery.jsx#L266)).

This is workable today, but it spreads lifecycle meaning across status, nullable fields, a job lookup, the URL draft parameter, and browser-local state. It creates hidden combinations: review plus recommendations but no direction; review plus direction but no approval; directing while a job is queued; and published while an older renderer is installed. Every writer must remember the same rules. The page also chooses a step on load from these combinations, so a missing or stale field can send a photographer to a plausible but wrong stage.

The current authority map is therefore uneven:

- The API is authoritative for delivery ownership, file confirmation, plan checks, publication, PIN verification, and public access decisions.
- MongoDB Delivery is authoritative for saved delivery content and publication state.
- MongoDB DeliveryJob is authoritative for generation progress, but the browser polls it and can label a transient network problem as a failed job.
- React memory is authoritative for unsaved review navigation, publish options, narration preference, and the selected PIN. A reload discards several of these choices.
- Cloudinary is authoritative for the uploaded binary. Its signed URLs can be handed to the browser and then copied outside the Veylo access path.

The architecture should make those ownership boundaries explicit. A screen should never silently become authoritative for a choice that affects privacy or the published result.

### Data and control flow in more detail

**Create and edit.** The browser runs a brief-assessment request before POSTing a new draft. Updating an existing draft changes its analysis and direction only when client name, shoot type, or brief actually changed. This is a thoughtful preservation rule, but its AI gate means draft creation itself depends on a provider response.

**Upload.** The browser asks the API for a short-lived upload signature, sends file bytes directly to Cloudinary, then posts the Cloudinary public ID, version, signature, and filename to the API. The API checks the delivery owner, folder prefix, Cloudinary signature, file format, size, and plan count before atomically pushing the asset into the delivery document. This is a good bandwidth and secret-handling boundary. The active client helper does not send the optional stable uploadId supported by the server, so a transfer whose Cloudinary success is followed by a lost confirmation can be repeated as a second Cloudinary object.

**AI analysis.** The API creates a DeliveryJob and sets the delivery to analyzing. The worker reads the private image references, submits resized versions in batches, checkpoints per-photo insight results in DeliveryJob, computes recommendations, and writes the analysis and recommendations into Delivery. The AI helper receives client name, shoot type, brief, tags/captions when present, and resized image content. It is a real third-party data flow, not a local-only transformation.

**Direction and review.** The format choice becomes job input. The worker creates global direction and then per-photo frames/captions, saving batches in the job result, before writing the final direction to Delivery. The creator edits and reorders the saved direction, then the review endpoint writes it and sets reviewApprovedAt. That timestamp is not tied to a content hash or immutable revision number, so the server knows that some review save occurred, not exactly which serialized content was approved.

**Publish and public access.** Publishing reserves monthly usage, writes access settings and a PIN digest, then sets publishedAt and status. Public endpoints check published state, expiry, PIN grant, share-grant scope, and download permissions. The normal public JSON response removes the brief and analysis, narrows data for role-scoped grants, and the streamed original-download endpoint rechecks access at request time. But the public payload also returns signed media URLs, and the individual-download endpoint returns a signed original URL. Once a URL has escaped to a recipient, later Veylo expiry or revocation cannot be assumed to revoke that URL.

## Exact AI call trace and photo-pass counts

The numbers below describe the checked-in happy path: one successful response on the first attempt, no retries, no optional brief enhancement, and no narration. They count logical provider requests, not every internal HTTP retry. Render config sets vision batches to 12 photos and caption batches to 8; the worker clamps these to 4-24 and 4-16 respectively ([render.yaml](../render.yaml#L72), [deliveryWorker.service.js](../server/src/services/deliveryWorker.service.js#L27)).

### What each stage actually sends

| User action or worker stage | Provider/model actually called | Normal call count | What is sent and what comes back |
|---|---|---:|---|
| Add the finished photographs | None | 0 | The browser signs and uploads each file directly to Cloudinary, then asks the API to confirm it. This is media/storage work, not AI. |
| Check the brief when continuing | Alibaba / qwen3.7-flash | 1 | Client name, shoot type, and brief go in. The response is ready/not-ready, a reason, and up to three optional detail suggestions. If not ready, no draft is created until the photographer selects a detail or chooses “Use my brief as written.” |
| Enhance the brief, if clicked | Alibaba / qwen3.7-flash | 1 normally; up to 2 for structured-output repair | The same context goes in; the model returns an expanded suggestedBrief. It does not save by itself. The photographer must choose “Use enhanced brief.” Accepting it resets the assessment confirmation, so continuing then makes a separate brief-assessment call: enhancement plus check is normally 2 logical calls. The only factual hallucination check after generation rejects new numbers; unsupported names, venues, relationships, or other non-number facts are not independently checked. |
| Analyze the complete shoot | Alibaba / qwen3-vl-flash | ceil(N / 12) normally | Each batch includes up to 12 actual photographs through 640-pixel Cloudinary URLs plus the brief/context. The result is one structured visual-insight record per photo: summary, subjects, setting, clothing, orientation, colors, expression, moment, and visual weight. |
| Recommend a format | Alibaba / deepseek-v4.1-flash | 1 | Text only: shoot details plus up to 24 sampled insight records. It returns collection summary and rankings for all eight formats. These are not eight calls and it does not receive the image binaries at this step. |
| Create the chosen format's global direction | Alibaba / deepseek-v4.1-flash | 1 | Text only: brief, collection summary, format profile, and insight records for K selected photos. It returns title, opening/closing copy, visual settings, sections, and (where supported) a soundtrack recommendation. |
| Write frame captions and frame design | Alibaba / qwen3.7-flash | ceil(K / 8) normally | Each request includes up to 8 real 1024-pixel image URLs again, plus the brief, image-insight text, and global direction. It returns one caption and frame-design record per selected photo. This is a second visual-model pass for every photo selected into the presentation, not just text written from the first analysis. |
| Save manual edits, reorder, choose music, or publish without narration | None | 0 | These actions are API/database updates. Choosing a curated soundtrack is a local catalogue selection, not a new model call. |
| Revise selected captions/frames | Alibaba / qwen3.7-flash | ceil(M / 8) normally | Only the M selected photos are sent to the caption model again. No new qwen3-vl analysis or global-direction call occurs for a selected-only revision. Caption-only revision keeps the generated frame design and replaces the caption. |
| Regenerate the full direction | Alibaba / deepseek-v4.1-flash, then qwen3.7-flash | 1 + ceil(K / 8) normally | Existing per-photo analysis is reused, but the global direction and every selected photo's caption/frame design are generated again. |
| Generate Photo Story narration at publish | Deepgram Flux TTS, then Deepgram Nova-3 prerecorded transcription | 2 calls per text chunk normally | The approved captions, in approved photo order, are split into chunks of at most 2,000 characters. Each chunk is synthesized once and then submitted as audio for word timing. Veylo does not generate a second narration script; it reads the approved captions. |

Here N is the number of uploaded photographs, K is the number selected for the presentation, and M is the number selected for a focused revision. For formats that curate, K = min(N, format cap): Photo Story 25, Editorial 20, Photo Reveal 16, Canvas 30, Chapters 30, Album 20. Event Coverage and Campaign do not curate, so K = N, up to 500 on Pro. Those caps are maximums; smaller shoots use every photo. The complete gallery still contains all N photos even when the directed presentation contains only K.

### Happy-path counts at Free and Pro photo limits

The “images sent to models” column counts each photo once in qwen3-vl analysis plus each selected photo once more in qwen3.7 caption/frame design. The final column includes one initial brief assessment, one format recommendation, one global direction, and all analysis and caption batches. It excludes enhancement, narration, revisions, retries, and any new direction after changing format.

| Photos N | Chosen format | Analysis photos / qwen3-vl calls | Caption photos K / qwen3.7 calls | Image submissions to models | Alibaba calls including initial brief check |
|---:|---|---:|---:|---:|---:|
| 100 | Photo Story | 100 / 9 | 25 / 4 | 125 | 16 |
| 100 | Editorial | 100 / 9 | 20 / 3 | 120 | 15 |
| 100 | Photo Reveal | 100 / 9 | 16 / 2 | 116 | 14 |
| 100 | Canvas | 100 / 9 | 30 / 4 | 130 | 16 |
| 100 | Chapters | 100 / 9 | 30 / 4 | 130 | 16 |
| 100 | Album | 100 / 9 | 20 / 3 | 120 | 15 |
| 100 | Event Coverage | 100 / 9 | 100 / 13 | 200 | 25 |
| 100 | Campaign Delivery | 100 / 9 | 100 / 13 | 200 | 25 |
| 500 | Photo Story | 500 / 42 | 25 / 4 | 525 | 49 |
| 500 | Editorial | 500 / 42 | 20 / 3 | 520 | 48 |
| 500 | Photo Reveal | 500 / 42 | 16 / 2 | 516 | 47 |
| 500 | Canvas | 500 / 42 | 30 / 4 | 530 | 49 |
| 500 | Chapters | 500 / 42 | 30 / 4 | 530 | 49 |
| 500 | Album | 500 / 42 | 20 / 3 | 520 | 48 |
| 500 | Event Coverage | 500 / 42 | 500 / 63 | 1,000 | 108 |
| 500 | Campaign Delivery | 500 / 42 | 500 / 63 | 1,000 | 108 |

For example, a clean 500-photo Event Coverage run makes 42 qwen3-vl batch requests, one DeepSeek format-ranking request, one DeepSeek global-direction request containing text insight for all 500 photos, and 63 qwen3.7 caption batches that each include real image URLs. Add the initial brief check and the normal path is 108 Alibaba calls. Every photograph is submitted to a visual model twice: once for visual analysis and once for caption/frame design. A 500-photo Photo Story still analyzes all 500, but only sends 25 chosen photos through caption/frame design: 49 Alibaba calls and 525 image submissions in the same clean-run assumptions.

### Retry and repeat-work multipliers

- The shared Alibaba completion helper allows two model responses when the first response fails schema validation, so most structured-output stages normally use one call but can use two. Transient HTTP statuses 429, 502, 503, and 504 can each trigger up to four HTTP POST attempts before the operation gives up.
- Caption batches add a second retry layer: createFrameBatch can retry a whole batch up to three times. In a repeated structured-output failure, that is up to six successful model completions for the same caption batch; repeated transient statuses can cause up to 12 HTTP posts across its three outer tries.
- Image analysis splits an invalid or incomplete batch recursively in half. A bad 12-photo response can therefore be followed by requests for 6, then 3, then smaller subsets, re-sending photos that were already in the rejected parent batch. A fully failing binary split has up to 23 subset calls (with the completion helper's own schema repair attempts inside each subset) before individual photos are marked missing.
- A failed-job retry reuses saved job checkpoints for completed analysis photos and completed caption batches. However, if a job reaches three worker attempts, the retry endpoint resets its cursor and full result, so the next run repeats previously completed work. A photographer can also retry a failed job again; there is no lifetime per-account generation budget.
- Changing format does not redo qwen3-vl analysis, but it creates a new DeepSeek direction and re-sends the new format's K images to qwen3.7 for captions/frame design. A full revision does the same. A focused revision resends only the selected M images.
- Adding or removing one photo invalidates collection analysis and direction. The next analysis job does not seed its checkpoint from the analysis already stored on the other asset records; it starts with an empty job result and processes every remaining photo again. So adding one image to a 99-photo set leads to a fresh 100-photo analysis, not one new-photo analysis. At the Pro maximum, that means 42 new vision batch calls for a changed 500-photo set.

## What the AI work costs, and why an exact invoice cannot be read from this code

The code identifies the models, batch sizes, maximum output tokens, and image dimensions it submits. It does not save provider usage: the Alibaba helper reads choices/message content and ignores the response's usage object, and DeliveryJob has no input-token, output-token, image-token, character, or cost fields. Deepgram narration stores its transcript and audio duration but no billing record. There is no per-delivery or per-account AI unit balance. That means the repository can show how much work it asks providers to do, but cannot tell a photographer or operator the actual token bill for a delivery.

The configured base URL targets Alibaba's Singapore-compatible endpoint. The following are the providers' published standard list prices visible on the audit date, not a statement of Veylo's negotiated rate, free quota, promotion, tax, or final account invoice. Provider prices below are in USD. The repository has neither provider usage/billing exports nor an exchange-rate source, so it cannot calculate an actual USD bill or a defensible naira conversion from this checkout.

| Work | Effective model in code | Published billing unit used for estimate |
|---|---|---|
| Visual analysis | qwen3-vl-flash | Input and output tokens; the published price page lists $0.022 input and $0.215 output per million tokens for the low context tier in the relevant deployment scope. |
| Brief assessment, brief enhancement, captions/frame design | qwen3.7-flash | Input and output tokens; up to 32K input tokens per request, published at $0.03 input / $0.13 output per million tokens. Higher input tiers are more expensive. |
| Format recommendation and global direction | deepseek-v4.1-flash | Input and output tokens; published at $0.30/$1.20 per million during busy hours and $0.15/$0.60 during idle hours for the International scope. |
| Narration synthesis | Deepgram Flux TTS | $0.045 per 1,000 input characters at standard pay-as-you-go pricing after 12 September 2026. |
| Narration word timing | Deepgram Nova-3 prerecorded | $0.0043 per minute of submitted generated audio at standard pay-as-you-go pricing. |

Alibaba documents that Qwen3-VL and Qwen3.7 image inputs are tokenized by scaled pixels, roughly one visual token per 32 x 32 pixels, plus two tokens. As a transparent illustration only, a 4:5 photograph resized to 640 x 800 contributes about 502 image tokens to analysis; the same image at 1024 x 1280 contributes about 1,282 image tokens to captioning. At those input rates, the image-token component is roughly $0.000011 per analysis pass and $0.000038 per caption pass. That yields these image-token input components at the plan limits:

| Clean run | Image-token input component only |
|---|---:|
| 100-photo Photo Story (100 analyzed + 25 captioned) | about $0.0021 |
| 100-photo Event/Campaign (100 analyzed + 100 captioned) | about $0.0050 |
| 500-photo Photo Story (500 analyzed + 25 captioned) | about $0.0065 |
| 500-photo Event/Campaign (500 analyzed + 500 captioned) | about $0.0248 |

These figures price only the image tokens, not the full AI bill. They exclude repeated text prompts and insight records, generated output tokens, retries, DeepSeek calls, brief assistance, and narration. Text and output token usage can materially change the result; the model's returned usage is needed for a defensible total. They are USD list-rate illustrations, not naira costs or a claim about Veylo's provider invoice.

Narration can be priced directly from its actual payload once measured: if the approved transcript has T characters and the synthesized chunks total A minutes, the published standard list-rate estimate is $0.045 x T / 1,000 + $0.0043 x A. One thousand narration characters cost $0.045 for TTS; one minute of generated audio submitted for Nova-3 timings costs $0.0043. There is one of each provider request per <=2,000-character chunk on the successful path, and each endpoint retries transient errors up to four times.

Cloudinary storage, eager transformations, preview transformations, CDN bandwidth, archive downloads, MongoDB storage, and Render compute have separate account/plan pricing. The repository has no current account usage or billing export for those services, so they cannot be rolled into a truthful per-delivery total here. Model Studio's official [model pricing](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/model-pricing), [Qwen3-VL pricing](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen3-vl-flash), [Qwen3.7 Flash pricing](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen3-7-flash), and [image token rules](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/vision) support the Alibaba rates and pixel-token estimate. Deepgram's current [pricing page](https://deepgram.com/pricing) lists the Flux TTS and Nova-3 prerecorded rates above.

## Additional architecture findings

### P1 — The web process also owns background generation

The Render manifest defines a web service with DELIVERY_PIPELINE_ENABLED=true, and server startup calls startDeliveryWorker inside the API process. The repository also has a delivery-worker entrypoint, but no separate worker service is declared in the manifest ([render.yaml](../render.yaml#L1), [server.js](../server/server.js#L128), [delivery-worker.js](../server/delivery-worker.js#L1)).

This makes HTTP serving and long-running model work share a deployment, process lifecycle, memory budget, and operational failure domain. Scaling the web service also starts another worker per instance. Each instance has its own activeDeliveryIds set, so that set cannot prevent two different queued jobs for one delivery from being claimed by two replicas. The current database claim is atomic per job, not per delivery.

**Recommendation:** run API and workers as separately deployable processes with independent concurrency and health signals. Keep MongoDB or a durable queue as the source of work, but claim a delivery-level lease with a fencing token so only the current worker attempt can commit. Scale workers against provider budget and queue age, and keep the API responsive when a provider stalls.

### P1 — Job creation and delivery transition are not one atomic command

queueAnalysis and queueDirection first check for an active job, create a new job, and then update the parent Delivery. There is no unique active-job constraint per delivery, and the check-then-create sequence can race across concurrent requests. Job creation and the parent-state update are separate writes. A failed response can therefore coexist with a queued job, or two requests can enqueue duplicate work. The same check-then-create pattern is used for narration and revisions ([delivery.controller.js](../server/src/controllers/delivery.controller.js#L733), [DeliveryJob.js](../server/src/models/DeliveryJob.js#L4)).

The worker has useful heartbeats and stale-job requeueing, but saveJob does not fence writes by the worker lease owner/attempt. If a job is considered stale and requeued while its previous worker is still able to finish, both attempts can write progress or results. This is a narrow failure path, but it matters because provider calls are expensive and results mutate a shared delivery.

**Recommendation:** make generation commands idempotent. Atomically record the state transition and an outbox/job intent, or use a MongoDB transaction where supported. Enforce one active job for a delivery and command type, return the existing job for duplicate requests, and require the current lease generation on every checkpoint and final commit. Make a stale worker unable to overwrite a newer attempt.

### P2 — The delivery and job documents grow with the photo set

Delivery embeds every asset and its Mixed analysis, the full direction/frame array, and the gallery/order data. DeliveryJob also stores full intermediate insight or frame arrays in a Mixed result while processing. That means flexible AI output is stored in both the job and the parent document, and a job record can retain large generation payloads after it reaches a terminal state ([Delivery.js](../server/src/models/Delivery.js#L4), [DeliveryJob.js](../server/src/models/DeliveryJob.js#L4), [deliveryWorker.service.js](../server/src/services/deliveryWorker.service.js#L154)).

This is manageable for smaller sets, but the product permits up to 500 photos on Pro and has formats that process the whole set. MongoDB documents have a 16 MB BSON limit; large metadata or future prompt/output growth can make a valid delivery difficult to save. There is no terminal-job retention policy visible in the job schema. Deleted deliveries trigger job deletion, but completed or failed jobs for retained deliveries remain available indefinitely unless another cleanup path is added.

**Recommendation:** keep durable job checkpoints compact and bounded; store per-photo analysis and frames as child records or compact, versioned objects; avoid duplicating the same large payload in both job and Delivery; and define retention for terminal job inputs/results while preserving the audit fields needed to explain a generation. Add size telemetry and a safety margin well below MongoDB's hard document limit.

### P2 — Approval is a timestamp, not an immutable published revision

reviewApprovedAt is cleared on many mutations and is required by publish, which is a useful guard. It still does not identify the exact title, frames, order, design settings, soundtrack, access configuration, and viewer contract that the photographer approved. Publish reads the mutable Delivery document and stores no immutable approved snapshot or content hash. A later frontend renderer change may also reinterpret an older delivery because a viewer version is not pinned in the delivery record.

**Recommendation:** save each review as a revision with a monotonic revision ID and content hash. Approval should bind to that ID; publish should compare-and-set the same revision and save an immutable published snapshot. Store schema, format-renderer, prompt, and media-transform versions where needed. Migrations should be explicit and tested against historical deliveries, so a viewer deployment does not silently redesign an already-sent client link.

### P2 — Publish usage reservation is separate from publication

The Free plan's monthly usage counter is reserved before the Delivery save and released on caught errors, which is better than checking a count only. Two simultaneous publish requests for the same approved draft can both read review state and reserve a slot before either changes status. Both may then save successfully, causing one delivery to consume two Free slots. The browser disables controls while busy, but that is not a server-side idempotency guarantee ([delivery.controller.js](../server/src/controllers/delivery.controller.js#L914), [entitlement.service.js](../server/src/services/entitlement.service.js#L106)).

**Recommendation:** make publication an idempotent state transition keyed by delivery and approved revision. Use a transaction or reservation record that can be reconciled and released exactly once. Reject a second publish once the expected source status/revision has changed.

### P2 — Renderer compatibility is not part of the saved delivery contract

Sharing one viewer registry between creator preview and public delivery is a strong design choice: it avoids maintaining two independent page renderers. The trade-off is that both surfaces use the current client code. Delivery stores schemaVersion=2 and a format identifier, while job records have prompt/render metadata; the Delivery itself does not pin the viewer implementation version in the inspected schema. A normal frontend deploy can therefore change old public links unless every renderer change remains backward-compatible by convention.

**Recommendation:** treat each delivery format as a versioned presentation contract. Keep current preview parity, but have the registry resolve an explicit saved renderer version, support migrations for old records, and test representative published fixtures before changing a renderer.

### P2 — Privacy disclosure is accurate but too far from the action

The privacy policy names Alibaba Model Studio, Cloudinary, and Deepgram. The create flow first asks for details and photographs, then invokes analysis and optional narration without a clear just-in-time explanation of which fields and images leave Veylo, what the provider returns, and how long Veylo keeps generated results. This is a product trust and consent gap for client photographs, especially for weddings, children, private celebrations, and commercial campaigns. This audit does not establish the vendors' retention terms; those need to be checked against current contracts and account configuration.

**Recommendation:** add a concise disclosure at first analysis and first narration, link the full policy, identify the provider and data categories in ordinary language, and make clear that the photographer chooses when to send the set. Document provider retention and deletion behavior from the actual account terms rather than implying that “private upload” means “not sent to a model.”

## Product and interaction-design findings

The visual direction is coherent for a professional photography tool: dark editorial surfaces, restrained warm accents, real Lucide icons, explicit stages, and the photographer's images as the content. The five-stage structure and real client preview are good foundations. Most of the design problems are state communication and recovery, rather than a lack of visual styling.

- **The recommendation score looks more exact than it is.** The model is asked for a 1-100 score, missing formats are filled with 50, and the creator prints the number without naming a scale. It can be read as a measured confidence or an objective quality rating even though the implementation does not establish that interpretation. Keep the ranked recommendation and its reason, but remove the number or label it as a rough fit score and explain its limits.
- **The page has no clear “saved” contract for the whole draft.** Shoot details save when moving forward; review changes save through a separate review action; upload files confirm individually; access controls save only at publish. A user can reasonably read the page as one draft while those sections have different persistence rules. Each stage needs a visible saved/pending/error state, and leaving a stage should not discard choices without a clear explanation.
- **Review approval should feel like a concrete sign-off.** The creator can preview the exact format, but the final publish action needs a compact summary of the approved content revision, soundtrack/narration choice, link privacy, expiry, and download rules. After any change, the interface should say that the previous approval needs a fresh review. Do not make the photographer infer this from which step opens after a reload.
- **Format choice needs honest explanation.** Each card has a reason, which is useful. The numeric score and top-ranked badge can overstate certainty; allow the photographer to choose any entitled format without making alternatives look like errors. Show a short “why this fits” sentence grounded in the set, not a model-like scorecard.
- **Upload needs recovery designed for real networks.** Three concurrent direct transfers reduce server bandwidth, but there is no pause/cancel control, the active implementation does not retain resumable upload IDs, and browser memory holds the original File objects needed for retries. On a phone, tab eviction or an unstable connection can turn a mostly completed 100-500 photo upload into manual re-selection work. Keep completed assets, make pending work recoverable, and tell the photographer exactly which files need attention.
- **Accessibility has visible gaps despite reduced-motion support.** The stage navigation uses visual classes but does not set aria-current=step; generation progress is exposed as status text but not a progressbar with current value; and the Pro Library dialog has dialog roles but does not use the repository's focus-trap/restore helper. Small muted labels in the dark CSS also need measured contrast, not visual judgment alone. Add focus movement when a stage changes and preserve a stable heading for screen-reader users.
- **Responsive styles exist; responsive behavior is not verified here.** The CSS contains phone, 768 px tablet, 1024 px, and desktop breakpoints, plus reduced-motion rules. That is good source evidence, but this audit did not open the page at 320, 768, 834, or 1024 px. In particular, the client preview uses a tall internally scrolling frame, and the review, library dialog, soundtrack list, and publish actions need actual height and keyboard checks on tablet-sized screens.
- **The loading design needs a reconnect state distinct from failure.** A job can be healthy while polling fails. The present visual error/retry model makes transport, provider failure, and a long but healthy generation look too similar. Keep the last confirmed stage visible and show “reconnecting” until the API confirms a terminal job state.

## Target architecture and product contract

The intended result is not an imitation of Apple's interface. It is the same care applied to this product: a photographer should always know what is saved, what is being sent, what will happen next, and what a client will see.

### Target service shape

1. **A typed delivery lifecycle.** Replace implicit status-plus-field combinations with explicit commands and legal transitions, such as draft, uploading, analyzing, format selection, directing, review, approved revision, publishing, published, archived, and failed/recoverable. The API owns transitions; the browser renders them. Every command includes an expected revision so stale tabs cannot overwrite newer work.
2. **A dedicated durable job system.** API commands enqueue idempotent jobs; worker processes are deployed and scaled independently. Jobs have unique idempotency keys, delivery-level leases, lease generations, bounded retries, cancellation, deadlines, and terminal retention. A stale attempt cannot write after its lease has been replaced.
3. **First-class upload sessions.** Each selected file gets a stable upload ID and a server-owned transfer record. Confirmation is idempotent by upload ID; recovery can find an upload already accepted by Cloudinary; duplicate selection is identified by content hash when practical; and a retry never creates a second logical asset. Store only safe transfer metadata in browser storage, never provider secrets.
4. **Versioned review and publish artifacts.** Save immutable revision snapshots and bind approval, generated narration, publish usage, and public rendering to one revision ID/hash. Access settings are saved with the draft (except plaintext PIN), restored on resume, and applied atomically at publish. The publish request is idempotent.
5. **Bounded media and AI access.** Use expiring media tokens or a Veylo proxy for protected views and downloads, with short cache lifetimes where revocation is promised. Preserve current server-side ownership and download checks. Track per-account analysis, direction, revision, and narration units; reserve them before dispatch; and enforce concurrency and spend ceilings.
6. **A durable and bounded data model.** Keep the Delivery aggregate small, store photo analysis and generated frames as bounded/versioned child data, avoid writing the full output repeatedly into both job and delivery records, and define retention for terminal job inputs/results. Record schema, prompt, renderer, and transformation versions for reproducibility.
7. **Operational visibility.** Keep the existing useful stage timings, provider metadata, heartbeats, and analytics; connect them with request/job/delivery correlation IDs. Alert on oldest queued-job age, lease expiry, provider error/latency, retry rate, AI units per account, upload-confirm mismatch, oversized documents, media authorization denials, and publish-reservation reconciliation.

### Target creator experience

1. Save the shoot brief immediately. AI brief feedback is optional; if it fails, the photographer can continue with the words they wrote.
2. Let the photographer choose the final files, show count and size, and upload directly with stable per-file status. Completed files remain attached across reloads; pause, retry, and remove are explicit. The screen does not pretend an upload is resumable until the server can recover it.
3. Before analysis, explain in one short paragraph what context and image data will be sent to the named provider. Show an honest estimate of the work and the account's remaining generation allowance.
4. When work is running, show a real stage, last update, and cancel/leave options. If the network drops, reconnect to the same job. Do not turn a polling error into a false generation failure.
5. Show format recommendations as editorial guidance with clear reasons. Keep all available formats selectable, and distinguish the recommendation from a promise that the model's ranking is objectively correct.
6. Put the client-format preview first in review. Keep edit controls nearby and save changes with a clear saved state. Approval names the exact revision, and any subsequent edit returns the delivery to “needs review.”
7. Present privacy, expiry, download, watermark, narration, and music choices in a stable final checklist. Save them to the draft so reopening does not silently change them. Tell the photographer what link controls can and cannot revoke.
8. At publish, show the exact client link and practical next actions for WhatsApp, Instagram DM, email, copy, and QR. Confirm that publishing succeeded once, then make repeated clicks return the same published result.

The visual system can keep its existing restrained dark palette. The next design pass should focus on clear hierarchy, generous space, visible state, usable keyboard focus, legible contrast, a quiet reconnect/retry model, and the actual photographer's phone workflow. Motion should communicate a state change, remain light, and respect reduced-motion settings; it should not make a long job feel faster than it is.

## Findings

### P1 — AI brief assessment can block the entire delivery

The brief assessment is a gate in the required “Add the finished photographs” action. If the assessment says the brief needs more detail, the photographer can proceed by choosing a suggested detail or explicitly keeping the brief as written. If the assessment request fails or times out, the same action falls into its error handler and the draft is not created. The server returns an error when the AI helper is unavailable ([CreateDelivery.jsx](../client/src/pages/CreateDelivery.jsx#L332), [delivery.controller.js](../server/src/controllers/delivery.controller.js#L717)).

That makes an advisory writing feature a dependency of the core workflow. A temporary model-provider outage prevents photographers from starting a delivery, even when they already supplied an acceptable brief.

**Recommendation:** create or update the draft from validated photographer input first. Make assessment and enhancement optional helpers with an explicit “Continue with my brief” path on timeout, provider error, or opt-out. Preserve the original brief and never replace it unless the photographer accepts a suggestion.

### P1 — Publish settings are lost when a draft is reopened

PIN, expiry, download permissions, payment lock, watermark, likes, and narration settings are held in React state. When a draft is loaded, the page restores only whether narration is supported; the other settings are not restored from the delivery. They are sent to the server only when the photographer presses Publish ([CreateDelivery.jsx](../client/src/pages/CreateDelivery.jsx#L191), [CreateDelivery.jsx](../client/src/pages/CreateDelivery.jsx#L266), [CreateDelivery.jsx](../client/src/pages/CreateDelivery.jsx#L530)).

If someone configures a PIN or locks downloads, then reloads or leaves and resumes the draft, the controls return to their default values. Downloads default to allowed and Photo Story narration defaults to on. A photographer can therefore publish with weaker access controls or narration settings than they selected before leaving.

**Recommendation:** persist non-secret publish preferences with the draft and restore them explicitly. Keep the PIN out of browser storage and store only a server-side hash after the photographer confirms publication. Show saved/unsaved state and make the final review state reflect the exact settings being published.

### P1 — Signed media URLs outlive Veylo’s access checks

The server correctly gates the public delivery API by publication, expiry, PIN token, and share grant, and the full-resolution streaming endpoint checks download permissions on every request. However, the public delivery payload also contains Cloudinary signed image URLs, and the separate photo-download endpoint returns a signed URL for the original file. The payload also creates direct signed URLs for narration and custom audio, while the full-gallery endpoint returns a Cloudinary archive URL; those paths need the same access-lifetime review. The current image URL helper signs authenticated assets but does not attach a time-limited Cloudinary access token ([delivery.controller.js](../server/src/controllers/delivery.controller.js#L105), [delivery.controller.js](../server/src/controllers/delivery.controller.js#L1045), [delivery.controller.js](../server/src/controllers/delivery.controller.js#L1198), [delivery.controller.js](../server/src/controllers/delivery.controller.js#L1298), [deliveryMedia.service.js](../server/src/services/deliveryMedia.service.js#L58)).

Once an authorized recipient has received a media URL, they can share that URL independently of the Veylo link. Expiring or revoking the Veylo link prevents new API access, but does not provide a dependable way to invalidate a signed media URL already copied from the browser. Cloudinary’s documentation explicitly warns that a signed URL can be shared and describes token-based access for time limits ([Cloudinary media access control](https://cloudinary.com/documentation/control_access_to_media)).

**Recommendation:** decide and document the guarantee Veylo intends to make. If media access must expire or be revocable, serve images through a Veylo authorization proxy or use an expiring Cloudinary access token where the account supports it. Keep the existing per-request checks on original downloads. Explain that already viewed or downloaded photographs cannot be recalled.

### P1 — AI compute has no visible per-account spend budget

Analysis, direction, narration, and revisions are rate-limited at the request level, but one request can trigger analysis or caption generation for a large photo set. The default burst limit is 120 API requests per account per minute; it does not meter model calls, images, or tokens inside each job. A clean 500-photo Event Coverage run uses one brief-check request and one analysis request, then makes 108 Alibaba requests total across brief check, vision, recommendation, direction, and captioning. Plan usage is reserved when a delivery is published, not when AI work is queued ([rateLimit.middleware.js](../server/src/middleware/rateLimit.middleware.js#L99), [delivery.routes.js](../server/src/routes/delivery.routes.js#L51), [deliveryWorker.service.js](../server/src/services/deliveryWorker.service.js#L154), [entitlement.service.js](../server/src/services/entitlement.service.js#L75), [delivery.controller.js](../server/src/controllers/delivery.controller.js#L733)).

The worker limits global concurrency and the model provider has quota checks, which help control burst load. They do not by themselves cap how much model work one account can request over time. A Free account can spend compute on drafts that are never published, and repeat revisions are not charged against an obvious per-account generation budget in this pipeline.

**Recommendation:** account for photo-analysis units and generation/revision units before dispatch. Set per-account daily and monthly budgets, per-delivery revision limits or fair-use thresholds, per-account active-job limits, and a global provider-spend circuit breaker. Reserve budget when work is queued and release it on terminal failure.

### P2 — Adding or removing a photo throws away reusable visual-analysis work

Upload and delete clear the collection summary, format recommendations, and direction, but leave per-photo analysis attached to the assets. When analysis is queued again, the worker builds its resume map only from the new job's result; it does not seed it from `asset.analysis`. The worker therefore sends every remaining photo through qwen3-vl again. Adding one image to an analyzed 99-photo shoot reanalyzes all 100; at 500 photos, a single set change creates 42 new vision batch requests before recommendations can be rebuilt ([delivery.controller.js](../server/src/controllers/delivery.controller.js#L514), [delivery.controller.js](../server/src/controllers/delivery.controller.js#L596), [deliveryWorker.service.js](../server/src/services/deliveryWorker.service.js#L158)).

**Recommendation:** keep the image-set fingerprint and per-photo analysis version. On a set change, analyze only new or changed assets, then rebuild collection recommendations from the complete cached insight set. Delete the removed asset's insight and invalidate downstream direction. Record reused versus newly analyzed photo counts on the job.

### P2 — Brief model settings in deployment do not control brief assessment or enhancement

Render declares `ALIBABA_BRIEF_MODEL=qwen3.8-flash` and `ALIBABA_BRIEF_REVIEW_MODEL=deepseek-v4.1-flash`, but the creative-director configuration reads neither variable. `assistPhotographerBrief` routes both assessment and enhancement through `provider.captionModel`, which is configured as `qwen3.7-flash`. The effective model is therefore qwen3.7-flash for both modes, regardless of the brief-specific Render values ([render.yaml](../render.yaml#L86), [alibabaCreativeDirector.service.js](../server/src/services/alibabaCreativeDirector.service.js#L515), [alibabaCreativeDirector.service.js](../server/src/services/alibabaCreativeDirector.service.js#L740)).

This creates a quality, pricing, and operational mismatch: someone changing the brief-model variables will not change the provider, and cost reporting based on those variable names will attribute brief calls to the wrong model. Either add explicit brief model routing and test it, or remove the unused variables and document that briefs share the caption model.

### P2 — Upload retry is not idempotent or resumable

The active creator imports uploadDeliveryPhotos, which asks for a new random Cloudinary public ID on each retry and does not send an upload ID. The server de-duplicates confirmations by Cloudinary public ID, not by a stable logical-file ID. If Cloudinary receives a file but the confirmation response is lost, a retry can upload the same file under a new ID and add a duplicate photo. A refresh also loses the in-memory File objects needed to retry unfinished photos ([deliveryUpload.js](../client/src/utils/deliveryUpload.js#L16), [delivery.controller.js](../server/src/controllers/delivery.controller.js#L487)).

There is a separate manifest-based helper that stores stable upload IDs in session storage, but the creator does not use it. That helper calls an uploads/recover endpoint that is not registered in the active route table ([deliveryTransfer.js](../client/src/utils/deliveryTransfer.js#L22), [delivery.routes.js](../server/src/routes/delivery.routes.js#L43)).

**Recommendation:** use one upload implementation. Assign each selected file a stable upload ID, persist its state, make confirmation idempotent by that ID, and implement the matching recovery endpoint. Add pause/resume and an explicit “X files still need attention” state. This matters especially for photographers uploading large sets over mobile networks.

### P2 — A transient job-polling error looks like a generation failure

The browser polls every two seconds for up to fifteen minutes. A failed poll request is not retried separately from the job; it throws out of the polling loop. When a draft is reopened, that path is reported as a failed step and exposes “Retry this step,” although the server job may still be running ([CreateDelivery.jsx](../client/src/pages/CreateDelivery.jsx#L155), [CreateDelivery.jsx](../client/src/pages/CreateDelivery.jsx#L287)).

This can confuse the photographer and generate a failed retry request. The worker itself has heartbeats, per-batch checkpoints, stale-job recovery, and retry support, so the browser should treat temporary network loss differently from a terminal job failure.

**Recommendation:** distinguish transport errors from a job with failed status, retry polling with bounded backoff, expose “Reconnecting” and the last confirmed stage, and resume the same job when connectivity returns. Only show the retry action after the API confirms a terminal failure.

### P2 — The Pro Library dialog needs keyboard focus management

The library picker has dialog semantics, but the Create Delivery page does not use the repository’s useDialogFocus helper or otherwise move focus into the dialog, trap Tab navigation, restore focus to the opener, and close on Escape. The staged workflow also communicates current/completed steps mainly through styling rather than a current-step accessibility state ([CreateDelivery.jsx](../client/src/pages/CreateDelivery.jsx#L980), [useDialogFocus.js](../client/src/components/useDialogFocus.js#L1)).

**Recommendation:** wire the focus helper into the library picker, add an explicit current-step announcement, and verify the upload queue and generation status with keyboard and screen-reader users. The page already includes 640/768/1024 breakpoints and reduced-motion rules, which are good foundations; visual behavior at 320, 768, and 834 pixels remains unverified in this static audit ([CreateDelivery.css](../client/src/pages/CreateDelivery.css#L1)).

### P2 — The creator is a 991-line orchestration component

The same component owns brief assessment, draft loading, file transfer, library selection, polling, AI revisions, review editing, soundtrack playback, publishing, sharing, and dialog state. This is difficult to reason about as independent state transitions change, and makes failures such as “AI helper unavailable” or “settings disappeared on resume” easier to introduce.

**Recommendation:** split the five stages into focused components and move workflow operations into a small creator controller or hook. Model the delivery lifecycle explicitly—draft, uploading, analyzing, format-ready, directing, review, approved, publishing, published—with server job ID and approved revision ID. Make illegal transitions impossible, and bind approval to the exact direction/version that is published.

### P2 — Verification scripts do not prove the browser journey

The repository includes delivery verification scripts and a Playwright dependency, but the current client package has no test command and no active Playwright spec was visible in this checkout. The worktree had client/tests/delivery-v3.spec.js deleted before this audit. I did not restore it or execute verification commands.

**Recommendation:** keep the static contracts, then add browser-level coverage for brief-helper outage, interrupted and duplicate uploads, draft resume with publish controls, format switching, direction failure/retry, narration opt-out, and a published PIN-protected link. Add API integration checks for ownership, job idempotency, expiry, revocation, and media URL behavior.

## What is already working well

- The photographer, rather than the model, approves what the client receives. Review includes edits, reordering, selected-photo revisions, and a client-format preview.
- The server checks delivery ownership, validates inputs with Zod, checks plan limits again, and verifies uploaded Cloudinary signatures against the expected user/delivery folder.
- Images are uploaded as authenticated assets. The original file is not sent through a Veylo image-editing pipeline; analysis uses resized images, while the creator’s files remain the delivered source.
- The worker saves analysis and direction progress by batch, records provider/stage timings, sends heartbeats, and recovers interrupted jobs.
- Caption and direction output are structured and validated before rendering. The format profile and renderer are separate from model-produced content.
- Download endpoints enforce PIN/grant state and permissions, and the full-resolution stream path checks those rules before reading the original.
- The preview imports the same format viewer registry as the live client experience ([ClientDeliveryPreview.jsx](../client/src/components/delivery/ClientDeliveryPreview.jsx#L1)).
- The privacy policy names Cloudinary, Alibaba Model Studio, and Deepgram and explains that AI-assisted features can send needed information to external services ([PrivacyPolicy.jsx](../client/src/pages/PrivacyPolicy.jsx#L6)). The create flow should make that clear at the upload/analysis point as well.

## What it should feel like at an Apple-caliber bar

This is a comparison against Apple’s public Human Interface Guidelines, not a claim about Apple’s internal code or process. The public guidance centers on purpose, agency, responsibility, familiarity, flexibility, simplicity, craft, and delight ([Apple design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles/)). Applied to this product, that means:

1. **Start work without waiting for AI.** Save the draft immediately, and let the photographer skip optional brief help. Every AI step can improve the delivery; no helper outage should strand the job.
2. **Make the next action and its consequence obvious.** Keep the five-stage structure, explain why a format is recommended in plain language, and replace unexplained numeric scores with a useful reason or confidence description.
3. **Protect the photographer’s choices.** Drafts restore access controls, audio choices, and review state. Approval belongs to one exact version; changing the format or content invalidates it before any publish attempt.
4. **Make long work dependable on a phone.** Show total upload size, per-file state, pause/resume, and a clear recovery path. Preserve completed transfers and resume only unfinished files after a tab reload or network drop.
5. **Put privacy where the decision is made.** Before analysis, say which shoot details and photographs are sent to which AI provider and link to the policy. Explain that a link PIN, expiry, and revocation control future access through Veylo but cannot remove media a recipient has already copied or viewed.
6. **Keep the photograph at the center.** Let the creator compare the actual client presentation with practical editing controls close at hand. Avoid making a photographer inspect a long AI-generated specification before seeing the work.
7. **Work for touch, keyboard, and reduced motion.** Keep controls comfortably sized and spaced, move focus after stage changes, label progress semantically, and make dialogs usable without a mouse. Apple’s guidance calls for motion to be purposeful and optional, and for accessibility and appropriately sized controls to be considered from the start ([Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion), [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Apple writing guidance](https://developer.apple.com/design/human-interface-guidelines/writing)).
8. **Build predictable recovery into the architecture.** Use idempotency keys for uploads and jobs, persist an approved revision identifier, enforce per-account AI budgets, and isolate worker scaling from API response handling as volume grows. Test the real browser journey at phone and tablet widths and under interrupted-network conditions.

This should remain a polished, mobile-first web workflow for photographers sending client links through WhatsApp and Instagram. “Apple-caliber” should mean clear choices, saved progress, privacy people can understand, fast recovery, and careful detail—not copying Apple’s visual style or adding steps.

## Recommended order of work

**Before wider use:** remove the AI-assessment hard gate; persist and restore publish settings safely; define the media-link expiry/revocation guarantee; add per-account AI budgets; and make job creation and publication idempotent state transitions.

**Next:** use one recoverable upload path with stable IDs; make job polling resilient to network loss; complete dialog focus management and accessible step/progress state; and add browser/API coverage for duplicate requests, interrupted transfers, draft resume, PIN access, expiry, and revocation.

**Before horizontal scaling or sustained high volume:** move the worker out of the web process, enforce delivery-level leases with fencing, bound generation-result size and retention, and add queue-age/provider-cost monitoring. Then split the long creator page around the stage model and bind preview, approval, publish, and public rendering to one immutable, versioned delivery revision.

## Audit limits

This report is a static source and product-flow audit of the current checkout. I did not run builds, tests, browser interaction, screen-reader checks, load tests, provider calls, or production requests. As a result, visual polish, actual upload speed, model quality, provider quotas, deployed Cloudinary configuration, and runtime behavior still need direct verification. No product source files were changed for the audit.