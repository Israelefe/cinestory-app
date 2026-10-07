# Delivery analysis and writing

## What changes

- The worker can keep 100 V3 deliveries active. Each photographer has separate saved progress, cancellation, and retries.
- Each delivery submits up to five photo analysis requests together, with at most three photos in a request. Admission also caps each photographer at five active analysis requests so several galleries from one account cannot take all the capacity.
- Photo analysis, caption writing, quick editing requests, and Veylo Help have separate queues. Photographers take turns within each queue.
- Qwen 3.8 reads photos. GPT-OSS 120B writes from the saved observations, shoot purpose, and client context. Caption writing does not send the same originals again.
- Completed analyses, approved Photo Swap caption batches, and Showcase writing steps are saved. A retry of an unchanged draft reuses them. Editing the brief, format, or photographs changes the revision and prevents reuse of old writing checkpoints.
- Groq cooldowns keep background work waiting without spending a generation retry. API requests still have a total deadline so a help conversation or manual caption edit cannot hang indefinitely.
- Each AI slot remains occupied until its response has finished downloading. Photo links are freshly signed when an admitted V3 request starts.

## Capacity

100 active deliveries does not mean 100 galleries receive unlimited processing at once. They share the account's provider allowance and the worker's resources. A large gallery or another request cannot overwrite another photographer's saved work, but shared capacity can change completion times.

The starting Developer plan budgets are 1,000 requests/minute and 250,000 tokens/minute **per model**. Response token headers refine these budgets; `retry-after` and remaining daily requests are respected. Groq's request limit header describes a daily limit, so it is not mistaken for requests/minute. Set `GROQ_REQUESTS_PER_MINUTE` and `GROQ_TOKENS_PER_MINUTE` to any lower account-specific limits. MongoDB admission coordinates the API and worker processes using `aimodelbudgets`; keys and customer text are not stored in that collection. See [Groq's limits documentation](https://console.groq.com/docs/rate-limits), [model list](https://console.groq.com/docs/models), and [vision limits](https://console.groq.com/docs/vision).

Defaults:

| Setting | Value | Meaning |
| --- | --- | --- |
| `DELIVERY_V3_WORKER_CONCURRENCY` | `100` | Active V3 preparation and narration jobs in one process |
| `AI_ANALYSIS_CONCURRENCY` | `100` | Maximum active analysis requests across processes using one provider/model |
| `AI_WRITING_CONCURRENCY` | `30` | Maximum active writing requests |
| `AI_ASSISTANT_CONCURRENCY` | `8` | Maximum active help requests |
| `AI_OTHER_CONCURRENCY` | `8` | Maximum active interactive editing/setup requests |
| `GROQ_VISION_MODEL` | `qwen/qwen3.8-27b` | Photo analysis model; existing `GROQ_MODEL` is still accepted |
| `GROQ_TEXT_MODEL` | `openai/gpt-oss-120b` | Caption and help model |

If both paths are configured to use the same model, their queues remain separate but the model's allowance is shared. Alibaba remains an optional fallback for failed requests; waiting for Groq capacity does not trigger a paid fallback call.

## Check the new writing model before switching production

The automated checks use simulated provider responses. They verify routing, writing rules, checkpoint recovery, and concurrency; they do not establish the quality or speed of live model output.

Add `GROQ_API_KEY` privately to `server/.env`, then run from the `server` folder:

```powershell
node scripts/evaluate-text-model.mjs --live
```

This runs birthday, graduation, and fashion captions, plus an 18-photo Photo Swap batch, through GPT-OSS 120B and the app's writing checks. It sends no customer images and writes a report under `.runtime/delivery-v3`. The live check passed on 7 October 2026 after strengthening factual instructions and the graduation ceremony guard. These samples are a quality check, not a guarantee about every future response.

Set `GROQ_TEXT_MODEL=openai/gpt-oss-120b` on both the API and delivery worker if an older explicit setting is present, then redeploy them. This is also the new code default. The separate model allowance separates photo analysis capacity from caption writing. To roll back model choice, set `GROQ_TEXT_MODEL=qwen/qwen3.8-27b`; queues and checkpoints remain available, but photo and writing requests share that model's allowance.

## Move delivery processing off the API

The deployment file is [render.delivery-worker.yaml](../render.delivery-worker.yaml). It creates a paid Render background worker; it is separate from the existing API Blueprint so pushing code does not silently create a paid service or switch off the current worker.

1. In Render, create a **Background Worker** from this repository.
2. Set **Root Directory** to `server`, **Build Command** to `npm ci && npm run verify:syntax`, and **Start Command** to `npm run delivery:worker`.
3. Copy the environment settings listed in `render.delivery-worker.yaml` from the API service. Use the **same** MongoDB database, R2 bucket, image Worker URL/secret, Groq key, and JWT secret. Copy optional Alibaba and Deepgram settings if those features are used. Never generate a different JWT or image signing secret for this service.
4. Set `DELIVERY_V3_WORKER_CONCURRENCY=100`. Use the reviewed `GROQ_TEXT_MODEL` setting and the same provider limits on both services.
5. Deploy the worker. Confirm a recent `delivery` worker heartbeat in Veylo's admin worker status.
6. On the existing **API service**, set `DELIVERY_WORKER_MODE=external`, then redeploy it. The API continues accepting jobs; the background worker processes them. Until this step, the API keeps its existing embedded worker.

During the short transition both services can claim different jobs atomically and share the MongoDB provider budget. Graceful shutdown returns unfinished jobs to the queue without consuming another attempt. An abrupt interruption is recovered by the existing stale heartbeat mechanism, using the saved checkpoints.

## Verification

From `server`:

```powershell
npm run verify:model-scheduling
node --test scripts/delivery-v3.test.mjs scripts/delivery-writing.test.mjs scripts/delivery-creation-recovery.test.mjs scripts/assistant-chat.test.mjs
npm run verify:syntax
```

The scheduling checks simulate 100 photographers with 69 photos each and run 100 real temporary MongoDB jobs with a mocked provider. They check independent failures, fair admission, separate writing/help queues, daily versus minute headers, cooldown recovery, fresh photo links, caption checkpoints, and restart recovery. They make no live provider calls.

From `client`:

```powershell
npx playwright test tests/delivery-preparation.spec.js
npm run build
```

Preparation progress is checked at 320, 768, 834, and 1440 pixels for Showcase, Photo Swap, and GridBoard. The normal build includes the required motion policy check.
