# Delivery creation audit — 30 September 2026

## Scope and method

Reviewed the V3 Showcase and GridBoard creation flows from choosing a delivery type through the published link: details, format choice, upload and recovery, analysis jobs, photo selection, initial and regenerated words, narration, music, colours, typography, client previews, access settings, approval and publishing.

This review follows the current repository code. Server checks use mocked AI, speech, storage and database responses. Browser checks use the real React interface with mocked API responses and existing project photographs. No production delivery or database was modified. Published viewer layouts, photo timing and gallery designs were not redesigned.

## Confirmed problems corrected

| Step | Problem | Correction |
| --- | --- | --- |
| Captions and headlines | Malformed JSON, null replies, empty titles and oversized copy could stop generation or leave unusable text. | Retry malformed responses within a bounded limit. Repair weak copy and use text based on the supplied purpose if the model keeps returning weak wording. Reserve room for punctuation when fitting text. |
| Spoken Photo Story captions | Full written captions were sent to speech, then retried at faster speeds. Long audio eventually asked the photographer to shorten the caption manually. | Create a shorter spoken sentence automatically, preserve the written caption, record at normal speed, measure the actual speech and refit only lines that overrun. Each photo still lasts six seconds. |
| Spoken caption identity | Shortening could introduce another name or an unsupported age. | Validate returned photo IDs, word and character budgets, supplied client-name tokens, personal addresses and numeric ages before speech. The purpose and approved caption remain the source of meaning. |
| Narration errors | Failure feedback could appear away from the voice controls and old failed drafts retained the manual shortening instruction. | Show retry/text options beside the narration controls, translate the old timing error into useful guidance and bring the error into view. Phone action buttons have room for their labels. |
| Narration settings | Existing jobs omitted their hidden `input` field when checking the chosen voice, causing incorrect reuse or conflicts. | Explicitly read the job input and compare the voice and narration choices. Matching requests resume the same job. |
| Skipping narration | A running optional narration job could prevent continuing with text. | Allow text continuation during generation; request cancellation and exclude those jobs from approval/publish blockers. The existing worker checks cancellation and revision before saving generated speech. |
| Analysis recovery | Retrying after a lost response rejected an already analysing draft before checking its active job. | Return the existing preparation job for that owned draft. |
| Upload recovery | The final photo could be saved successfully but reported as failed after its confirmation response was lost, because recovery checked the account's photo limit first. | Recognise an already confirmed upload before the limit/provider checks; the browser accepts that saved asset without uploading it again. |
| GridBoard details | A changed title could be overwritten by the old board title during later generation. | Keep delivery and board titles aligned and invalidate the previous approval when the title changes. |
| Access expiry | UTC was shown as a local clock value. Saving a reopened draft shifted its expiry, including by one hour in Lagos. | Convert to the local clock for the input and back to UTC when saving in both flows. Reject an expiry that has passed while a draft remained open before publishing. |
| PIN changes | Typed replacement PINs could override the remove-PIN choice. GridBoard also checked the initial draft's PIN state after saving a new PIN. | Make entering a replacement and removing the PIN mutually exclusive; clear the input after saving and use the current draft's PIN state. |
| GridBoard previews | Paid studio branding was not supplied consistently. Closing the larger preview also lost keyboard focus. | Share the existing branding decision with Showcase; contain modal focus, close on Escape and restore focus to the button that opened it. |
| Music uploads | An oversized custom track could be uploaded before the server rejected it. | Reject unsupported extensions, empty files and files over the existing 20 MB limit before requesting an upload signature. Server validation remains authoritative. |
| Publish recovery | A successful publish with a lost response could leave the photographer seeing a failure and trying again. | Both clients recover success only when an authenticated owner read confirms publication. Repeated server publish requests return the existing private link without another quota reservation. GridBoard also refuses a missing plan-check response. |

AI quality is not guaranteed by validation alone. The photographer still reviews the meaning. A provider outage, lost connection or invalid photo selection can fail a step; these changes do not turn an uncertain result into success.

## Rules and connections checked

| Area | Current behaviour found in code |
| --- | --- |
| Authorisation | Creation routes are behind authentication. V3 draft reads/mutations include the owner ID and schema version. Upload recovery and publication recovery use owned records. |
| Purpose | Initial captions, regeneration and spoken fitting use the photographer's purpose and client context. Shoot type and visual analysis give context; they do not supply a replacement purpose. The removed purpose-clarification questionnaire remains removed. |
| Format recommendation | Birthday recommendations distinguish explicit event language in the purpose from a personal shoot. This is a rule-based suggestion, not reliable knowledge of everyone photographed. All eight formats remain available to choose. |
| Photos | Free: 100 per delivery; Pro: 500. Browser upload concurrency remains six. Supported photo uploads are JPEG, PNG and WebP, up to 50 MB each. Server confirmation checks media and capacity. |
| Analysis | Photos are analysed in batches with provider-limit recovery. Tests verify that batching retains coverage of the whole uploaded pool. Live provider capacity was not load-tested. |
| Showcase selection | Each format enforces its own minimum and maximum, unique known asset IDs and complete caption/photo associations. Removing a showcase photo does not delete it from the full gallery. |
| GridBoard | Every approved layout must contain every uploaded asset exactly once. Standard-board fallback is available if analysis cannot finish. Moment groups, outfit/background groups and Similar Shot are visual suggestions, not identity recognition. |
| Music and voice | Showcase music applies to Photo Story, Photo Reveal and Album. GridBoard music is for its slideshow. Narration is optional and specific to Photo Story, with eight English Flux voices. Existing V6/V7 caption audio remains accepted alongside the new V8 rendering. |
| Previews | Creation uses the existing client viewers. Media merging retains URLs only for unchanged assets in the same draft; deleted or replaced files do not regain old URLs. Both flows use the shared studio/Veylo branding decision. |
| Colours | Palette selection uses photo analysis, supports alternate related/mixed palettes, avoids recent repeats and checks text contrast on the background and panels. Regression cases verify photos survive colour changes. |
| Access | PIN validation and hashing stay on the server. Expiry, download controls, lock messages and watermark settings remain part of creation. Owner preview settings are not a substitute for the published server's access checks. |
| Publication | Requires the current revision's approval, a valid photo set and required music/voice. Free publication uses the shared monthly quota reservation. The configured Free limit is three deliveries per Lagos calendar month. |

### Showcase photo counts

| Format | Minimum | Maximum in showcase |
| --- | ---: | ---: |
| Photo Story | 5 | 10 |
| Editorial Page | 6 | 14 |
| Photo Reveal | 5 | 12 |
| Canvas | 8 | 18 |
| Chapters | 8 | 20 |
| Album | 6 | 16 |
| Event Coverage | 10 | 24 |
| Campaign Delivery | 6 | 16 |

These bounds apply to the showcase. The full gallery keeps all uploaded photos. GridBoard is the complete board and requires at least one photo.

## Remaining findings and recommended work

These findings are still open. They need targeted changes and separate failure/concurrency checks; passing the tests below does not clear them.

1. **High — file cleanup happens before persistence in some paths.** `deleteDeliveryAsset`, `deleteSoundtrack` and replacement in `confirmSoundtrackUpload` in `delivery.controller.js`, plus replacement narration in `deliveryWorker.service.js`, can delete referenced media before saving the new database state. If saving fails, the old record can still point at a removed file. Save the reference change first, then use durable cleanup with retries. On a failed replacement save, remove only the newly created, unreferenced media. This is a code-level failure risk, not proof of the cause of an existing broken image.

2. **High — competing tabs and duplicate job requests need stronger coordination.** Many editing paths read a draft and call `save()` without an expected-revision update. Two tabs can overwrite each other's work. Preparation/narration requests also check for a job and create one in separate operations, without a unique active-job constraint. Add server revision checks and atomic active-job creation; return a useful refresh/retry response when another edit wins. A matching voice job from an older draft revision can currently be returned, then rejected by the worker's final revision check. Compare its revision before reuse.

3. **High — quota reservation and publication are separate database writes.** The existing reservation is atomic and ordinary publication failures release it, but a process crash between reservation and publication can leave a used slot without a published delivery. Add a reservation tied to the delivery with reconciliation, or a database transaction. Test worker/server termination between both writes and concurrent retries. Do not replace this with a client-only quota check.

4. **Medium — unsaved edits can disappear on reload or navigation.** Captions, headlines and design settings are kept locally until their save/continue action. Add a clear saved/unsaved state, a navigation warning and carefully scoped draft autosave. Never autosave a PIN in browser storage. Keep explicit approval tied to the saved revision.

5. **Medium — V3 does not consistently apply existing runtime switches.** `v3Format` accepts the format enum without checking enabled formats from entitlements; V3 preparation/narration do not consistently honour the older pipeline/narration switches. Custom music signing/confirmation differs from curated music selection's feature check. Agree which switches should govern V3, then apply them consistently in the UI, endpoints and worker. All formats currently being available does not remove this operational gap.

6. **Medium — navigation during work can expose controls the server will reject.** Some Back buttons remain active during upload/save work, and a photographer can return to photos while analysis is running even though upload/delete endpoints reject that status. Add explicit cancellation or disable only conflicting actions with an explanation. Use an immediate action guard as well as rendered busy state to prevent rapid competing mutations.

7. **Medium — creation bundles need attention on mobile networks.** The production build reports viewer imports that defeat some lazy loading, plus a main JavaScript chunk over 500 kB. Keep the approved viewer designs; separate creation/preview loading from the rest of the app and measure on a throttled connection before choosing further optimisations.

## Verification

- Server regression suite: 52 passing tests across `delivery-v3.test.mjs`, `narration-voices.test.mjs`, `narration-fitting.test.mjs` and `delivery-creation-recovery.test.mjs`, including the follow-up correction below.
- Browser regression checks: 31 creation cases passed across the focused runs after correcting stale test navigation, the styled-toggle test interaction and preview focus restoration. Coverage includes both delivery entry options, local expiry and PIN changes, lost publication responses, photo confirmation recovery, music selection, voice selection/retry/text continuation, photo-count controls, readable palettes and preserved preview images. Screen widths include 320, 768, 834 and 1440 px. Initial failures and their targeted reruns were inspected; the full unrelated browser suite was not run.
- Client production build passes. Existing viewer-import/chunk warnings remain and are listed above.
- Server syntax verification passes for 144 files.
- No live Alibaba/Deepgram generation, maximum-size production uploads, production database race tests or deployment smoke test were performed. Those are remaining validation steps, not implied by the local regression results.

## Follow-up: spoken-caption preparation failure

The original automatic fitter still rejected the whole batch when one line was invalid. Its retry did not include the rejected wording or the specific validation failures, and a separate 100-character cap could reject a natural short sentence containing a long name.

The corrected flow measures the original speech first. Only captions exceeding the measured photo slot need shortening. Fitting retains valid lines and retries only rejected lines, with their actual word/character counts, name checks and previous wording supplied as feedback. Harmless wrapping quotes and missing final punctuation are normalised. Supplied hyphenated names are recognised correctly. Written captions and six-second photo timing remain unchanged.

Deepgram requests remain capped at 2,000 characters, including normalised punctuation and separators. Longer narration is split between photo captions. This cap is also checked immediately before synthesis. A regression case verifies every request stays within it and all photo cues remain present after combining audio. The code's per-request cap and each photo's measured speech duration are separate checks.
