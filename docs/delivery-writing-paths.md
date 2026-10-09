# AI headlines and captions: path audit

This change applies to Chapters, Editorial, Event Coverage and Campaign. Photo Story, Photo Reveal, Canvas, Album, PhotoSwap and GridBoard keep their existing writing guidance and limits.

## Writing contracts

| Format | Photo caption | Section paragraph | Writing emphasis |
| --- | --- | --- | --- |
| Chapters | 320 characters | 320 characters | Specific chapter introductions and developed photo captions that explain their part of the shoot. |
| Editorial | 320 characters | 700 characters | Useful section context; each caption adds information beyond the paragraph. |
| Event Coverage | 320 characters | 360 characters | Specific activities in headlines, with factual scene and programme context. |
| Campaign | 320 characters | 320 characters | Product, view, detail or supplied asset purpose; no guessed claims or usage rights. |

Photo headlines remain capped at 70 characters. Section titles remain 60 characters, or 70 for the Editorial magazine. The delivery title remains 80 characters. The directory subtitle remains a separate 120-character field.

Developed writing uses two or three useful sentences for Chapters, and usually one or two for the other formats. These are writing goals, not minimum lengths: a sparse brief must not produce invented facts or filler. Chapters can use natural direct or third-person writing; factual scene captions do not have to address the recipient as “you.”

## Active generation and rewrite paths

| Entry point | Implementation | Covered behavior |
| --- | --- | --- |
| V3 preparation job | `deliveryWorker.service.js` → `directV3` in `deliveryV3AI.service.js` | Initial delivery title, opening/closing text and each selected photo’s headline/caption. The four formats use their own writing profile and full caption limits. |
| V3 narrative review | `repairNarrativeFrames` | Reviews facts, length, generic headlines and repetition. Repairs receive specific reasons for rejected photo details. Invalid writing in these formats fails without replacing the draft with generic emergency captions. |
| Chapters/Event/Campaign grouping | `groupV3Sections` | Generates the title, short subtitle and full paragraph separately. Checks membership, paragraph bounds, supported facts and copied captions. Repair requests explain invalid group counts and writing. |
| Editorial initial writing | `writeEditorialDirection` in `editorialDirection.service.js` | Generates cover copy, optional introduction, magazine sections, headlines and captions. Checks consecutive photo order, factual context and repetition between paragraphs and captions. |
| Explicit photo rewrite | `POST /deliveries/:id/v3/captions/:assetId/regenerate` → `v3Caption` → `regenerateV3Caption` | Sends and accepts the complete prior caption. Uses the current photograph’s saved observation. Editorial uses `rewriteEditorialCaption`. |
| Photo replacement/addition | `CreateDeliveryV3.jsx` → the same regeneration endpoint | New-photo caption generation uses the same format limits and review rules as an explicit rewrite. Undo retains the complete old caption. |
| Photo/order/section changes | Same endpoint with `writingBlocks` → `reviewV3WritingBlocks` | Reviews affected section headings, paragraphs, opening/closing text and Editorial introductions. Uses each block’s real paragraph limit. Unrequested model blocks are discarded; requested blocks must still match the validated keys and limits. |
| Editorial paragraph rewrite | Same endpoint with `editorialBlock` → `rewriteEditorialBlock` | Rewrites the summary, introduction, section paragraph or closing note; considers other writing to avoid copied passages. |
| Legacy initial direction / full revision | `createGlobalDirection` and `createFrameBatch` in `alibabaCreativeDirector.service.js` | Preserves generated section bodies and accepts full captions. The same four format profiles apply to initial generation and full regeneration. |
| Legacy selected-photo / caption-only revision | `revise` in `deliveryWorker.service.js` → `createFrameBatch` | Uses the same caption profile. Caption-only revision preserves the other frame fields. Section paragraphs remain in the direction. |
| Assistant writing proposal | `proposeAssistantWriting` → `suggestAssistantWriting` | Delivery-title and caption suggestions use the format profile; captions accept 320 characters. Existing text is a draft, not a factual source. No images, media URLs, full analysis objects or private client-name field are added to assistant requests. |
| Interrupted-job recovery | V3 writing checkpoints, prepared Showcase result, legacy direction checkpoint | A writing-version marker prevents the four formats from restoring old generated writing from in-flight checkpoints. It does not rewrite existing saved or published deliveries. |

## Saving and applying writing

- `CreateDeliveryV3.jsx` keeps full captions in rewrite requests, inputs, counters and Showcase payloads. It sends section bodies for Chapters, Event Coverage and Campaign instead of dropping them.
- `deliveryWritingChanges.js` reviews and updates the actual paragraph, preserving its shorter directory subtitle. Manual changes remain suggestions, and Undo preserves unrelated later edits.
- `v3Showcase` validates 320-character captions and existing format-specific paragraph bounds. Ownership, photo membership and approval invalidation remain enforced.
- The older `CreateDelivery.jsx` editor and `updateDeliveryReview` accept full captions for the four formats. Review saves preserve paragraphs omitted by older clients.
- Assistant suggestions retain the existing signed confirmation, owner checks and draft-version checks before application.

Client and server writing-limit modules are mirrored because they deploy separately; a test verifies they are identical. No published delivery is automatically regenerated.

## Excluded paths

`deliveryAI.service.js` exports older `writePresentation` and `regenerateCaption` helpers, but no active application code calls them. Its brief assistant is still active; that function edits a photographer’s purpose, not client headlines or captions. Portfolio writing, library metadata, Content Studio, PhotoSwap and GridBoard have separate purposes and are outside this change.

## Verification

`format-writing.test.mjs` covers all four formats through initial generation, explicit rewrites, saving, legacy generation, legacy review, paragraph preservation, ownership and old-checkpoint recovery. `assistant-workspace.test.mjs` covers longer assistant suggestions and private-context protection. Existing delivery, Editorial, Canvas and assistant regression suites remain applicable.

`client/tests/format-writing.spec.js` exercises full captions through rewrite, Undo and saving at 320px, 768px and 834px. It also checks for horizontal overflow and preserved section paragraphs.

`node scripts/evaluate-format-writing.mjs --live` evaluates the configured provider with synthetic text observations. It creates no deliveries, sends no customer photographs and writes only an ignored local report under `.runtime/delivery-v3`. Model output is variable; failed bounds, membership or writing checks remain failures rather than silently publishing substitute text.
