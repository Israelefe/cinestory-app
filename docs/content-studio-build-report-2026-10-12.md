# Veylo Content Studio — implementation report

12 October 2026. The standalone application is in `content-studio/`. Its server, SQLite database, persistent queue, assets, automated product recordings and Remotion renderer run on this PC. Groq and Deepgram remain external generation providers. Google Flow generation is manual. The existing Admin content studio and production services were not changed or retired.

## Scope and phase results

The owner approved implementation and requested continued work through all phases. The old-studio retirement phase was replaced with the local application foundation after the owner explicitly removed retirement from scope. Human approvals inside the studio remain enforced.

| Phase | Delivered | Verification and remaining acceptance |
| --- | --- | --- |
| 0 — research | Repository/product audit, official provider research, extracted brand sources, conflict records, scoped architecture and decision log | The pack fingerprints 319 source files. Public deployment could not be reached during research; a read-only crawl and owner review are available in the app. Account-specific facts remain unverified without keys. |
| 1 — local foundation | Separate React/Express application, SQLite/WAL, local password/session/CSRF, persistent tasks with leases, caps, backups, Windows launcher | Authentication, hostile-origin/host rejection, task deduplication, lease recovery, cancellation, revisions and cost reservation tests pass. No production database or environment file is loaded. |
| 2 — knowledge and scripts | Twenty source-backed product entries, extracted design/copy rules, three concepts, three script angles, claim checks, independent model review and inline script edits | Fake numbers, unsupported prices, guarantees and forbidden claims are blocked in tests. Ten-job live calibration and editable owner scores are implemented; the owner's four-of-five creative acceptance requires live credentials and review. |
| 3 — product recordings | One-command Playwright recordings of the actual frontend with private local rehearsal data, DOM target boxes, screen-reference images, manifests and stale detection | All 60 recipe IDs across 20 capabilities were exercised successfully using original abstract test fixtures. Owner recordings require six cleared real photographs and a real cleared film for video delivery. Rehearsal timings are excluded from promotional speed claims. |
| 4 — storyboard and templates | Strict shared Zod contracts, ten registered Remotion templates, format specs, motion tokens, structured scene controls, silent/voiced animatics and final render | A silent 20-second safe-zone proof and a 30-second voiced integration render passed. Text bounds are checked during rendering. After Effects/Higgsfield creative quality remains an owner judgement using real campaign material. |
| 5 — sound | Flux batch TTS auditions, measured lines, Whisper word timings, voice cache, music picker, beat map, optional cleared sound effects, ducking/fades/normalization | Actual local audio and encoding tools passed integration checks. The test export measured −14.34 LUFS and −9.18 dBTP. Test tones are not a live Flux voice audition. Owner must choose and approve a voice. |
| 6 — manual media | Library indexing, real-photo matching, exact image AND video prompts, filename slot matching, provenance, rights/consent, vision rubric, upload approval and three-attempt limit | Generated context and real finished work are separate slot uses. Generated finished work and removal of generated provenance are blocked. Full-pipeline vision responses were test doubles; a real manual Flow upload/review remains owner acceptance. |
| 7 — review/export/tracking | Sampled-frame QA, preview/final approvals, downstream-only tweaks, ZIP export, cover/caption/UTMs/checklist, rights manifest, history, metrics, CSV and approved learnings | The integration job reached `exported` after a revision reused upstream voice. A separate export test rejected an extra CTA and unknown fact, repaired the caption, verified the rights manifest/font license, and tested single-scene regeneration with voice/media reuse. Live platform attribution is manual in V1. |

## Product scope and sources

The catalog contains eight Showcase formats (Photo Story, Editorial, Photo Reveal, Canvas, Chapters, Album, Event Coverage and Campaign Delivery), GridBoard, Photo Swap, video delivery, portfolio, photo library, pre-selection, editor links, sharing, gallery/downloads, access controls, branding and dashboard. Entries are source-backed descriptions awaiting owner confirmation of current availability; source presence alone does not approve a marketing claim.

Primary sources: `productdescription.md`, `AGENTS.md`, `client/src/constants/deliveryFormats.js`, `client/src/App.jsx`, the current delivery/viewer/creation pages and components, `client/src/index.css`, `client/src/styles/public.css`, the shared motion policy, public demo assets and the existing music catalog. The extracted pack records source paths/hashes. It contains no promotional pricing or allowances. The approved free-account CTA does not imply that every promoted capability is available on Free.

The new studio uses the existing dark/coral design language and local Outfit font. CSS tokens and copy rules are extracted by script; they are not a new invented brand. Generated people must be Black adults, including background people. Finished photographs shown as the photographer's work must be real and cleared. The model does not draw Veylo interfaces.

## Architecture and file inventory

| Location in `content-studio/` | Responsibility |
| --- | --- |
| `src/contracts/` | Strict brief, script, scene, media and review schemas; code validators; template prop contracts shared with the editor and model |
| `src/providers/` | Groq structured text/vision transport, token pacing, cost reservations and logs; Flux TTS and prerecorded Whisper adapters |
| `src/server/app.mjs`, `auth.mjs` | Loopback HTTP API, local owner authentication, same-origin/CSRF checks, upload limits, protected media and owner reviews |
| `src/server/database.mjs`, `jobs.mjs`, `worker.mjs` | Persistent state, tasks, leases, revisions, artifacts, digest-bound approvals, usage, metrics and snapshots |
| `src/server/knowledge.mjs`, `research.mjs` | Product/design extraction, source fingerprints, cleaned public pages, ten-job calibration and planted-claim regression checks |
| `src/server/assets.mjs`, `capture.mjs` | Local rights/provenance registry, public-demo import, actual frontend recording with disposable fixtures and current capture manifests |
| `src/server/pipeline.mjs` | Resumable stage handlers, scripts/storyboard/media/voice/preview/music/final/export and approved learning proposals |
| `src/server/media.mjs`, `render.mjs`, `src/render/Composition.jsx` | Local media validation, measured timing, mixing, private render asset server, deterministic registered templates and output checks |
| `src/ui/` | Seven-step workflow, catalog/library/recordings/settings, structured edits, preview and final reviews, history and calibration reviews |
| `knowledge/`, `formats/`, `scripts/`, `tests/` | Generated knowledge/specs, launch/extraction/capture/calibration/proof commands and checks |

SQLite tables: settings, owner, sessions, jobs, revisions, tasks, artifacts, approvals, assets, provider_calls, events and metrics. Each stage writes revision-scoped artifacts. Single-scene regeneration preserves approved voice/media; length changes revalidate scripts and rebuild measured timing. A tweak cancels old tasks and invalidates downstream outputs; late results cannot replace a newer revision. Required reviews are tied to content digests. One worker renders at a time. A private capability URL exposes only the files needed by the local renderer.

Storyboard scenes contain a registered template name, its typed props, section/voice-line ID, motion and transition choices. They reference assets/captures by ID. They contain no model-written code or guessed scene durations. Measured voice is padded within section budgets, and render layout is derived from the audio timing. The hook/problem/result/CTA budgets are 3/5/4/3 seconds, leaving 5–25 seconds for the demo across 20–40-second jobs.

Templates: HookKinetic, PainMontage, VideoScene, PhoneDemo, UIZoom, MotionImage, BigCaptions, StatReveal, BeforeAfterSplit and CTACard. Media movement, word reveals, gradients, camera drift, DOM-target highlights, simple wipes and number reveals are deterministic. Text has a readable minimum and checked bounds. There is no timeline editor, automatic posting or model-generated code execution.

## External facts checked against official documentation

These are documentation facts, not claims that an owner's account has been tested.

| Service | Verified documentation and implementation |
| --- | --- |
| Groq Qwen | [`qwen/qwen3.8-27b`](https://console.groq.com/docs/model/qwen/qwen3.8-27b) is Preview, accepts text/images, advertises JSON schema mode, has 131,072 context / 16,384 output tokens, three images /20 MB and 2,048 tokens per image. Listed rates are $0.80/$4.00 per million input/output tokens. `reasoning_effort` includes `none`, `default`, `low`, `medium`, `high`. |
| Groq limits/schema/cache | [Rate limits](https://console.groq.com/docs/rate-limits), [structured outputs](https://console.groq.com/docs/structured-outputs) and [prompt caching](https://console.groq.com/docs/prompt-caching) were reviewed. Stage inputs are sliced, conservatively estimated and paced against recorded account limits. Authenticated strict-schema and planted-claim refusal probes are required after model or policy changes; public limits are not treated as the owner's actual entitlement. No cache discount is assumed. |
| Text fallback | [`openai/gpt-oss-120b`](https://console.groq.com/docs/model/openai/gpt-oss-120b) is a configurable **text-only** fallback, listed at $0.15/$0.60 per million tokens. Settings verifies availability and a structured response using the owner's key. It is never silently substituted for vision. A live creative fallback benchmark has not been run. |
| Caption STT | [Groq prerecorded speech-to-text](https://console.groq.com/docs/speech-to-text) documents `whisper-large-v3-turbo`, word timestamps with `verbose_json`, $0.04/hour and a ten-second billing minimum. Captions use this separate pass; timestamps and script correspondence are checked. |
| Flux endpoint/formats | [Overview](https://developers.deepgram.com/docs/flux-tts/overview) and [batch guide](https://developers.deepgram.com/docs/flux-tts/batch) document `POST https://api.deepgram.com/v2/speak`. The pipeline requests WAV/linear16, 48 kHz and speed1. Batch documentation does not supply the word-timing contract needed here, so STT provides it. |
| Flux voices/limits/price | [Voices](https://developers.deepgram.com/docs/flux-tts/voices), [rate limits](https://developers.deepgram.com/reference/api-rate-limits) and [product pricing](https://deepgram.com/product/text-to-speech) were opened. Hannah, Kit and Alexis form the audition shortlist; no Nigerian accent is listed. Current listed price is $0.045/1,000 characters. Documented REST concurrency varies by plan/region; the local worker uses one request at a time. General-availability/account access is not inferred from older Early Access wording: the owner's live audition must establish access. |
| Manual Google images | [Google image-generation documentation](https://ai.google.dev/gemini-api/docs/image-generation) lists Nano Banana 2.1, 1K/2K/4K, portrait aspect ratios, reference images and SynthID. Prompts use natural scene descriptions. The owner's chosen surface, subscription, quota and visible-mark behavior must be recorded; API documentation does not establish a Gemini-app or Flow entitlement. The studio never calls an image API. |
| Manual Google video | [Flow creation guidance](https://support.google.com/flow/answer/16353334) was reviewed. Video requests specify subject, camera, action, lighting and start/end composition. Ten seconds is a creative request, not a promise every Flow mode supports it. Uploaded duration is measured and the clip is trimmed/looped in the edit. |
| Remotion | [License](https://www.remotion.dev/docs/license), [calculateMetadata](https://www.remotion.dev/docs/calculate-metadata), [renderMedia](https://www.remotion.dev/docs/renderer/render-media) and [transitions](https://www.remotion.dev/docs/transitions) were reviewed. The owner declared a team of one, fitting the free eligibility described in the license. Every installed Remotion package is pinned to 4.0.527. Local browser rendering is used; no cloud-render account is needed. |
| Font | The repository's Outfit font is reused with its [SIL OFL license](https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/OFL.txt). The license is copied into the export. |
| Disclosure | [TikTok's AI-content guidance](https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content/) and [Meta's disclosure guidance](https://about.fb.com/news/2024/02/labeling-ai-generated-images-on-facebook-instagram-and-threads/) inform the export reminder. Synthetic voice and realistic generated scenes require disclosure review before posting. The studio does not post or apply platform labels itself. |

The safe-zone default is top250/bottom420/left80/right120 on1080×1920. It is a conservative studio choice, not a verified universal organic-platform margin. Template content has additional insets for movement. The −14 LUFS/−1 dBTP target is also an engineering choice, not a claimed platform requirement. Both need a final phone/platform preview.

## Cost and local operation

Illustrative provider cost: 35,000–90,000 Qwen input tokens plus 10,000–25,000 output tokens is approximately $0.068–$0.172; 350–600 voice characters is $0.016–$0.027; five short STT calls are approximately $0.00056 at the minimum. Extra image reviews, retries, indexing and calibration add calls. A practical planning allowance is **$0.15–$0.50/video**, not a measured live bill. Default caps are $1/job and $5/Lagos day. Manual Google generation, electricity, taxes and hardware depreciation are separate. Local rendering has no cloud-render fee; actual time depends on the PC and scene complexity.

No workstation CPU/GPU benchmark was used to promise a render time. The proof render uses a single Chromium worker. Keep the PC awake and keep the launcher window open during queued work. Failures retain upstream work and expose a retry button. Temporary proof media stays in ignored local storage; completed owner media is not automatically deleted.

Mix normalization leaves 0.5dB of additional peak headroom before AAC encoding; the encoded file is still measured against the final peak limit.

Database snapshots run every six hours and on clean shutdown, retaining seven dated backups. Full recovery requires securely backing up the entire `content-studio/data/` directory, including media. This directory contains private credentials and must not be committed or shared. No production customer data is required.

## Verification evidence

- `npm.cmd test`: **11/11 passed**. Covers queue/revisions/caps/claims/schema/storage/media/auth, real-demo requirements and generated-provenance protection.
- `npm.cmd run build`: passed, including the mandatory shared motion-policy check.
- `npm.cmd run test:browser`: **2/2 passed**, including a populated workflow and disabled export before final approval. Checks 320,390,640,768,834,1024,1440 widths, local login, job creation/persistence, navigation, settings and no browser errors/horizontal page overflow.
- `npm.cmd run knowledge:check`: source fingerprints match.
- `npm.cmd audit --audit-level=low`: **0 vulnerabilities** at the final check.
- Capture proofs: `content-studio/data/tests/capture-b5634520-61b4-4c34-a4e7-9506e2b99ba9/` plus `capture-6cef83b4-18ef-40cf-ab7f-06d372f0198b/` cover all60 unique recipes. The latter passed all15 dashboard/video/sharing/privacy/branding recipes after fixes.
- Full pipeline proof: `content-studio/data/tests/pipeline-ed78d86d-c6a1-4a89-8629-b6dd39b307e3/report.json`. Exported revision2 reused voice after a tweak. Final:1080×1920,30fps,H.264,yuv420p,AAC48kHz,30.059s,−14.34LUFS,−9.18dBTP. Test doubles provide scripts/voice/vision responses; the database, media tools, renderer and ZIP path are real.
- Updated template regression: voiced safe-zone preview and a DOM-target zoom still passed. New dashboard capture proof `capture-e0671112-0700-4043-bdd1-49807a0bfcd2` saved all three clips and their screen-reference images.
- `node scripts/export-proof.mjs pipeline-ed78d86d-c6a1-4a89-8629-b6dd39b307e3`: caption repair, rights manifest and font-license checks passed.

These proofs do not establish live model quality, synthetic-person review accuracy or a finished campaign's creative acceptance. Original abstract fixtures and test tones are deliberately excluded from the owner's library.

## First-use acceptance and later options

The remaining first-use steps are owner's inputs: set a local password; add keys/account limits; run provider verification; audition and approve a voice; approve current product entries; clear sample photographs/film/music; record and review captures; run live calibration; generate/upload actual Flow media; review the first full campaign. No keys, owner password or production customer data were supplied during implementation.

The public site address defaults to `https://veylo.com.ng` from `VeyloMarkdown.jsx`, but live reachability was not established. Confirm it in Settings before exporting campaign links. UTM links are included and manual link-click/signup metrics are recorded; there is no claim of automatic production-site signup attribution.

Depth/parallax was researched without adding a Python/model dependency. [SAM2](https://github.com/facebookresearch/sam2) can supply segmentation masks; [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) supplies depth maps. Its Small checkpoint uses Apache2.0; larger checkpoints have noncommercial restrictions. Local inference avoids a per-request API fee but adds hardware/runtime/storage cost. On photography, hair, lace, overlapping subjects and disoccluded backgrounds need inspection and often manual repair. That quality assessment is an engineering risk, not a benchmark performed on this owner's work. V1 uses safe pan/zoom/mask/light-sweep/collage movement and manual generated clips. No automatic layer separation or invented parallax quality claim is enabled.

Downloaded Lottie assets, additional fonts and third-party sound packs are not bundled without their rights records. Custom-code scenes and an automatic image-to-video API remain outside V1. Manual generated video clips are included now, as requested.

## First-use fixes — 2026-10-13

- Fixed provider refusal checks rejecting negative explanations for containing prohibited words. Verification and calibration now share a strict refusal classification; marketing-copy claim checks remain intact. Added bounded transient-server retries and preserved verification when unrelated settings are saved. Live Groq model, refusal and fallback checks passed with the owner's saved credentials.
- Per the owner's explicit instruction, cleared AI-generated images and clips may be used as labelled samples inside automated product recordings. Original provenance remains unchanged. Generated samples do not need fabricated real-person consent. Capture reuse checks rights and disclosure metadata; revoking rights invalidates the recording.
- Corrected the recording canvas to match the mobile viewport, removing empty borders. The owner's capture run completed with 57 recordings across 19 capabilities, all with files and screen references present and none stale. Video delivery was skipped because no cleared sample clip exists. The capture report records optional unavailable rehearsal endpoints for dashboard runtime and studio-name availability. The owner approved all 57 recordings and requested automatic approval of future successful recordings.
- Google Flow model, plan and quota are optional provenance fields, with no Flow API connection required. Updated Settings and startup instructions accordingly.
- Verification: 16 automated tests, 2 responsive browser checks, UI build and motion-policy check passed. An isolated three-clip browser capture verified that every newly recorded clip was approved automatically. Sampled the actual generated-image recordings to confirm framing and demo disclosure. No production code or data changed.

- Fixed script repairs to include the rejected JSON, exact word counts and explicit maximum-word instructions. Shared limits apply to calibration too. A live replay of the previously failing job input passed all validators after repair: hooks 5/6/6 words and problems 11/10/9 words; the owner-selected script was preserved.
- Fixed storyboard duration validation at the planning stage and constrained scene media/capture IDs to the actual available resources. The owner job completed a live 10-scene storyboard with current Veylo recordings and one six-second generated context-video request. Corrected supporting-artifact saves restoring a stale failed state; the job now reports images_requested with no error.
- Verification after these fixes: 18 automated tests pass; UI build and motion-policy check pass. Studio restarted with provider network access. No production app files or customer data changed.
- Fixed Google Flow uploads retaining their original filenames, with automatic matching for the sole empty compatible slot and explicit per-scene upload controls. Fixed the multipart part-count boundary rejecting valid uploads. A browser regression uploaded and replaced an MP4 using the reported Flow filename, checked slot/prompt provenance, and checked the controls at phone, tablet and desktop widths. All three browser checks pass.
- Per the owner instruction, own uploads no longer require separate rights forms or per-media approval clicks. Preserve provenance and explicit blocked status; optional visual checks log findings without forcing another owner approval. Added owner-upload and browser workflow regressions.
- Completed the owner job?s live 32-second voiced preview using Hannah, 43 word timings, the uploaded Flow clip and actual Veylo recordings. Voice section timing now follows measured audio, and concise demo overlays render readably. Retained the chosen narration and clip through the fixes. Verification: 24 automated tests, 3 browser checks, build and motion-policy check pass.
